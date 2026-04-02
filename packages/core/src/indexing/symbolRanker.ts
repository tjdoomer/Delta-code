/**
 * Combined scoring for repo map file ranking.
 *
 * Three signals:
 * - TF-IDF relevance to query (0.6): which files are about what you're looking for
 * - PageRank score (0.3): which files are structurally central
 * - Recency bonus (0.1): recently modified files are likely relevant
 */

import type { FileSymbols } from './types.js';

export interface RankedFile {
  filePath: string;
  score: number;
  symbols: FileSymbols;
}

/**
 * Rank files against a query using combined scoring.
 */
export function rankFiles(
  files: FileSymbols[],
  query: string,
  pageRankScores: Map<string, number>,
  fileMtimes: Map<string, number>,
): RankedFile[] {
  if (files.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    // No query — rank by PageRank only
    return files
      .map(f => ({ filePath: f.filePath, score: pageRankScores.get(f.filePath) || 0, symbols: f }))
      .sort((a, b) => b.score - a.score);
  }

  // Build document frequency map (how many files contain each term)
  const N = files.length;
  const df = new Map<string, number>();

  const fileTermSets = files.map(f => {
    const terms = getFileTerms(f);
    const termSet = new Set(terms);
    for (const term of termSet) {
      df.set(term, (df.get(term) || 0) + 1);
    }
    return { file: f, terms, termSet };
  });

  // Compute scores
  const now = Date.now();
  const ONE_HOUR = 3600_000;

  let maxTfidf = 0;
  let maxPr = 0;
  let maxRecency = 0;

  const rawScores = fileTermSets.map(({ file, terms }) => {
    // TF-IDF: sublinear TF, standard IDF
    let tfidf = 0;
    const termFreq = new Map<string, number>();
    for (const t of terms) {
      termFreq.set(t, (termFreq.get(t) || 0) + 1);
    }

    for (const qt of queryTerms) {
      const tf = termFreq.get(qt) || 0;
      if (tf === 0) continue;
      const idf = Math.log(N / (df.get(qt) || 1));
      tfidf += (1 + Math.log(tf)) * idf;
    }

    const pr = pageRankScores.get(file.filePath) || 0;

    // Recency: files modified in the last hour get a boost, linear decay
    const mtime = fileMtimes.get(file.filePath) || 0;
    const age = now - mtime;
    const recency = age < ONE_HOUR ? 1 - (age / ONE_HOUR) : 0;

    if (tfidf > maxTfidf) maxTfidf = tfidf;
    if (pr > maxPr) maxPr = pr;
    if (recency > maxRecency) maxRecency = recency;

    return { filePath: file.filePath, tfidf, pr, recency, symbols: file };
  });

  // Normalize and combine
  return rawScores
    .map(s => ({
      filePath: s.filePath,
      score:
        0.6 * (maxTfidf > 0 ? s.tfidf / maxTfidf : 0) +
        0.3 * (maxPr > 0 ? s.pr / maxPr : 0) +
        0.1 * (maxRecency > 0 ? s.recency / maxRecency : 0),
      symbols: s.symbols,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Tokenize a string into lowercase terms for matching. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 1);
}

/**
 * Build a term list for a file from its symbols, path segments, and imports.
 * Used as the "document" for TF-IDF scoring.
 */
function getFileTerms(file: FileSymbols): string[] {
  const terms: string[] = [];

  // Path segments
  terms.push(...tokenize(file.filePath));

  // Symbol names (weighted by splitting camelCase/snake_case)
  for (const sym of file.symbols) {
    terms.push(...tokenize(sym.name));
    // Split camelCase
    const camelParts = sym.name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
    terms.push(...camelParts.filter(p => p.length > 1));
  }

  // Import sources
  for (const imp of file.imports) {
    terms.push(...tokenize(imp.source));
  }

  return terms;
}
