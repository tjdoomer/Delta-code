/**
 * Directed dependency graph with PageRank scoring.
 *
 * Nodes are files, edges are import relationships. PageRank identifies
 * structurally central files (imported by many others) which are likely
 * to be relevant for understanding the codebase.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { ImportInfo } from './types.js';

export class DependencyGraph {
  // Adjacency lists: file → files it imports, file → files that import it
  private forwardEdges = new Map<string, Set<string>>();
  private reverseEdges = new Map<string, Set<string>>();
  private allNodes = new Set<string>();

  /** Add a node (file) to the graph. */
  addNode(filePath: string): void {
    this.allNodes.add(filePath);
    if (!this.forwardEdges.has(filePath)) this.forwardEdges.set(filePath, new Set());
    if (!this.reverseEdges.has(filePath)) this.reverseEdges.set(filePath, new Set());
  }

  /** Add an edge: sourceFile imports targetFile. */
  addEdge(sourceFile: string, targetFile: string): void {
    this.addNode(sourceFile);
    this.addNode(targetFile);
    this.forwardEdges.get(sourceFile)!.add(targetFile);
    this.reverseEdges.get(targetFile)!.add(sourceFile);
  }

  /**
   * Resolve imports from a file and add edges to the graph.
   * Only resolves relative imports — bare specifiers (npm packages) are skipped
   * since they point outside the repo.
   */
  resolveAndAddImports(filePath: string, imports: ImportInfo[]): void {
    this.addNode(filePath);
    const dir = path.dirname(filePath);

    for (const imp of imports) {
      if (!imp.isRelative) continue;

      const resolved = this.resolveImport(dir, imp.source);
      if (resolved) {
        this.addEdge(filePath, resolved);
      }
    }
  }

  /**
   * Resolve a relative import to an absolute file path.
   * Tries common extensions and index files.
   */
  private resolveImport(fromDir: string, source: string): string | null {
    const base = path.resolve(fromDir, source);
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', ''];
    const indexFiles = ['index.ts', 'index.tsx', 'index.js'];

    // Try direct file with extensions
    for (const ext of extensions) {
      const candidate = base + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }

    // Try as directory with index file
    for (const idx of indexFiles) {
      const candidate = path.join(base, idx);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Iterative PageRank with damping factor.
   *
   * Standard algorithm — converges in ~20 iterations for any reasonable
   * codebase graph. For 5000 files this runs in <50ms.
   */
  computePageRank(iterations: number = 20, damping: number = 0.85): Map<string, number> {
    const N = this.allNodes.size;
    if (N === 0) return new Map();

    const scores = new Map<string, number>();
    const baseScore = 1 / N;

    // Initialize: equal probability across all nodes
    for (const node of this.allNodes) {
      scores.set(node, baseScore);
    }

    for (let i = 0; i < iterations; i++) {
      const newScores = new Map<string, number>();
      const randomJump = (1 - damping) / N;

      for (const node of this.allNodes) {
        newScores.set(node, randomJump);
      }

      for (const node of this.allNodes) {
        const outEdges = this.forwardEdges.get(node);
        if (!outEdges || outEdges.size === 0) continue;

        const share = damping * (scores.get(node) || 0) / outEdges.size;
        for (const target of outEdges) {
          newScores.set(target, (newScores.get(target) || 0) + share);
        }
      }

      // Copy new scores
      for (const [node, score] of newScores) {
        scores.set(node, score);
      }
    }

    return scores;
  }

  get nodeCount(): number {
    return this.allNodes.size;
  }

  getImporters(filePath: string): Set<string> {
    return this.reverseEdges.get(filePath) || new Set();
  }
}
