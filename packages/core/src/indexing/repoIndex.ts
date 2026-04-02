/**
 * Repo index — orchestrates crawling, extraction, graph construction,
 * and caching into a single queryable interface.
 *
 * Lazy-builds on first query. Caches per-file extraction by content hash.
 * Rebuilds if >20% of files have changed since last build.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fdir } from 'fdir';
import type { ISymbolExtractor, FileSymbols } from './types.js';
import { DependencyGraph } from './dependencyGraph.js';
import { rankFiles, type RankedFile } from './symbolRanker.js';

// Supported source extensions — files outside this set are skipped
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.c', '.cpp', '.h', '.hpp', '.swift', '.kt',
]);

const MAX_FILE_SIZE = 100_000; // 100KB — diminishing returns above this

export class RepoIndex {
  private fileSymbols = new Map<string, FileSymbols>();
  private fileHashes = new Map<string, string>();
  private fileMtimes = new Map<string, number>();
  private graph = new DependencyGraph();
  private pageRankScores = new Map<string, number>();
  private built = false;
  private lastBuildFileCount = 0;

  constructor(
    private projectRoot: string,
    private extractor: ISymbolExtractor,
  ) {}

  /**
   * Build or rebuild the index. Crawls the project, extracts symbols,
   * builds the dependency graph, and computes PageRank.
   */
  async build(): Promise<void> {
    const files = await this.crawlProject();

    // Extract symbols from each file, using cache when content hasn't changed
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const hash = crypto.createHash('md5').update(content).digest('hex');

        // Skip re-extraction if content hash matches cache
        if (this.fileHashes.get(filePath) === hash && this.fileSymbols.has(filePath)) {
          continue;
        }

        const symbols = this.extractor.extractSymbols(filePath, content);
        this.fileSymbols.set(filePath, symbols);
        this.fileHashes.set(filePath, hash);

        // Track mtime for recency scoring
        try {
          const stat = fsSync.statSync(filePath);
          this.fileMtimes.set(filePath, stat.mtimeMs);
        } catch { /* skip */ }
      } catch {
        // Unreadable file — skip silently
      }
    }

    // Remove entries for deleted files
    for (const cached of this.fileSymbols.keys()) {
      if (!files.includes(cached)) {
        this.fileSymbols.delete(cached);
        this.fileHashes.delete(cached);
        this.fileMtimes.delete(cached);
      }
    }

    // Build dependency graph from imports
    this.graph = new DependencyGraph();
    for (const [filePath, symbols] of this.fileSymbols) {
      this.graph.resolveAndAddImports(filePath, symbols.imports);
    }

    // Compute PageRank
    this.pageRankScores = this.graph.computePageRank();

    this.built = true;
    this.lastBuildFileCount = files.length;
  }

  /**
   * Check if the index needs rebuilding (>20% files changed).
   */
  async needsRebuild(): Promise<boolean> {
    if (!this.built) return true;

    const currentFiles = await this.crawlProject();
    const changedCount = currentFiles.filter(f => {
      try {
        const stat = fsSync.statSync(f);
        const cachedMtime = this.fileMtimes.get(f);
        return !cachedMtime || stat.mtimeMs !== cachedMtime;
      } catch {
        return true;
      }
    }).length;

    const threshold = this.lastBuildFileCount * 0.2;
    return changedCount > threshold;
  }

  /**
   * Query the index: rank files by relevance to the query, return
   * a formatted map within the token budget.
   */
  async query(queryString: string, maxTokens: number = 2000): Promise<string> {
    // Lazy build or rebuild if stale
    if (await this.needsRebuild()) {
      await this.build();
    }

    const allFiles = Array.from(this.fileSymbols.values());
    const ranked = rankFiles(allFiles, queryString, this.pageRankScores, this.fileMtimes);

    return this.formatOutput(ranked, maxTokens);
  }

  /**
   * Format ranked files into a tree-style output within the token budget.
   * ~4 chars per token heuristic.
   */
  private formatOutput(ranked: RankedFile[], maxTokens: number): string {
    const maxChars = maxTokens * 4;
    const lines: string[] = [];
    let charCount = 0;

    // Header
    const header = `Repo Map (${this.fileSymbols.size} files indexed, showing top results)\n`;
    lines.push(header);
    charCount += header.length;

    for (const entry of ranked) {
      if (entry.symbols.symbols.length === 0) continue;

      // Relative path for readability
      const relPath = path.relative(this.projectRoot, entry.filePath);
      const fileLine = `\n  ${relPath}`;

      // Check if we can fit at least the file header
      if (charCount + fileLine.length > maxChars) break;

      lines.push(fileLine);
      charCount += fileLine.length;

      // Add symbols, respecting budget
      const exported = entry.symbols.symbols.filter(s => s.isExported);
      const symbolsToShow = exported.length > 0 ? exported : entry.symbols.symbols.slice(0, 10);

      for (const sym of symbolsToShow) {
        const isLast = sym === symbolsToShow[symbolsToShow.length - 1];
        const prefix = isLast ? '    └─ ' : '    ├─ ';
        const symLine = `${prefix}${sym.signature}`;

        if (charCount + symLine.length + 1 > maxChars) {
          lines.push('    └─ ...');
          charCount += 14;
          break;
        }

        lines.push(symLine);
        charCount += symLine.length + 1;
      }
    }

    return lines.join('\n');
  }

  /**
   * Crawl the project for source files, respecting gitignore.
   */
  private async crawlProject(): Promise<string[]> {
    try {
      const crawler = new fdir()
        .withFullPaths()
        .filter((filePath) => {
          const ext = path.extname(filePath).toLowerCase();
          if (!SOURCE_EXTENSIONS.has(ext)) return false;
          if (filePath.includes('node_modules')) return false;
          if (filePath.includes('.git/')) return false;
          if (filePath.includes('dist/')) return false;
          if (filePath.includes('build/')) return false;
          if (filePath.includes('bundle/')) return false;

          // Skip large files
          try {
            const stat = fsSync.statSync(filePath);
            if (stat.size > MAX_FILE_SIZE) return false;
          } catch {
            return false;
          }

          return true;
        })
        .crawl(this.projectRoot);

      return await crawler.withPromise();
    } catch {
      return [];
    }
  }
}
