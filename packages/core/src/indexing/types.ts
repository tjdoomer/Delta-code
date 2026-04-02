/**
 * Shared types for the codebase indexing system.
 *
 * The ISymbolExtractor interface is the upgrade seam — swap the regex
 * implementation for tree-sitter later without touching the graph,
 * ranking, or output code.
 */

export type SymbolKind = 'class' | 'function' | 'interface' | 'type' | 'enum' | 'variable' | 'method' | 'import';

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  /** The full signature line (e.g. "export class Foo extends Bar") */
  signature: string;
  isExported: boolean;
  line?: number;
}

export interface ImportInfo {
  /** The module specifier (e.g. './foo', '@google/genai') */
  source: string;
  /** Named imports (e.g. ['Foo', 'Bar']) — empty for namespace/default imports */
  specifiers: string[];
  /** True if source starts with '.' or '..' (relative to current file) */
  isRelative: boolean;
}

export interface FileSymbols {
  filePath: string;
  symbols: SymbolInfo[];
  imports: ImportInfo[];
}

/**
 * The extraction contract. Regex today, tree-sitter tomorrow.
 */
export interface ISymbolExtractor {
  extractSymbols(filePath: string, content: string): FileSymbols;
}
