/**
 * Regex-based symbol and import extraction.
 *
 * Lifts the proven patterns from fileSummary.ts and adds structured output
 * (SymbolInfo objects with kind/name/signature) plus import extraction for
 * the dependency graph.
 *
 * Implements ISymbolExtractor so it can be swapped for tree-sitter later.
 */

import * as path from 'node:path';
import type { ISymbolExtractor, FileSymbols, SymbolInfo, ImportInfo, SymbolKind } from './types.js';

export class RegexSymbolExtractor implements ISymbolExtractor {
  extractSymbols(filePath: string, content: string): FileSymbols {
    const ext = path.extname(filePath).toLowerCase();
    let symbols: SymbolInfo[];
    let imports: ImportInfo[];

    switch (ext) {
      case '.ts':
      case '.tsx':
      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        symbols = this.extractTSSymbols(content);
        imports = this.extractTSImports(content);
        break;
      case '.py':
        symbols = this.extractPythonSymbols(content);
        imports = this.extractPythonImports(content);
        break;
      default:
        symbols = this.extractGenericSymbols(content);
        imports = [];
        break;
    }

    return { filePath, symbols, imports };
  }

  // ---------------------------------------------------------------------------
  // TypeScript / JavaScript
  // ---------------------------------------------------------------------------

  private extractTSSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const seen = new Set<string>();

    const add = (name: string, kind: SymbolKind, signature: string, isExported: boolean) => {
      const key = `${kind}:${name}`;
      if (!seen.has(key)) {
        seen.add(key);
        symbols.push({ name, kind, signature: signature.replace(/\s*\{?\s*$/, '').trim(), isExported });
      }
    };

    // Class declarations
    const classRe = /^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/gm;
    let m;
    while ((m = classRe.exec(content)) !== null) {
      add(m[1], 'class', m[0].trim(), m[0].includes('export'));
    }

    // Interface declarations
    const ifaceRe = /^(?:export\s+)?interface\s+(\w+)/gm;
    while ((m = ifaceRe.exec(content)) !== null) {
      add(m[1], 'interface', m[0].trim(), m[0].includes('export'));
    }

    // Type declarations
    const typeRe = /^(?:export\s+)?type\s+(\w+)\s*=/gm;
    while ((m = typeRe.exec(content)) !== null) {
      add(m[1], 'type', m[0].trim(), m[0].includes('export'));
    }

    // Enum declarations
    const enumRe = /^(?:export\s+)?enum\s+(\w+)/gm;
    while ((m = enumRe.exec(content)) !== null) {
      add(m[1], 'enum', m[0].trim(), m[0].includes('export'));
    }

    // Function declarations
    const funcRe = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm;
    while ((m = funcRe.exec(content)) !== null) {
      add(m[1], 'function', m[0].trim(), m[0].includes('export'));
    }

    // Const arrow functions (exported)
    const arrowRe = /^(?:export\s+)?const\s+(\w+)\s*=/gm;
    while ((m = arrowRe.exec(content)) !== null) {
      // Only include if the line looks like a function (has => or function keyword after)
      const lineEnd = content.indexOf('\n', m.index);
      const line = content.substring(m.index, lineEnd > 0 ? lineEnd : undefined);
      if (line.includes('=>') || line.includes('function')) {
        add(m[1], 'function', line.replace(/\s*\{?\s*$/, '').trim(), m[0].includes('export'));
      }
    }

    // Method signatures (inside classes — indented)
    const methodRe = /^\s+(?:(?:public|protected|private|static|async|override|readonly|abstract)\s+)*(\w+)\s*\(/gm;
    while ((m = methodRe.exec(content)) !== null) {
      const name = m[1];
      // Skip constructor, common false positives
      if (name === 'if' || name === 'for' || name === 'while' || name === 'switch' || name === 'catch') continue;
      const lineEnd = content.indexOf('\n', m.index);
      const line = content.substring(m.index, lineEnd > 0 ? lineEnd : undefined).trim();
      add(name, 'method', line.replace(/\s*\{?\s*$/, '').trim(), false);
    }

    return symbols;
  }

  private extractTSImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];

    // import { X, Y } from 'source'
    // import X from 'source'
    // import * as X from 'source'
    // import type { X } from 'source'
    const importRe = /^import\s+(?:type\s+)?(?:\{([^}]*)\}|\*\s+as\s+(\w+)|(\w+))(?:\s*,\s*(?:\{([^}]*)\}|\*\s+as\s+(\w+)))?\s+from\s+['"]([^'"]+)['"]/gm;
    let m;
    while ((m = importRe.exec(content)) !== null) {
      const source = m[6];
      const specifiers: string[] = [];

      // Named imports from group 1 or 4
      for (const group of [m[1], m[4]]) {
        if (group) {
          specifiers.push(...group.split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean));
        }
      }
      // Default import from group 3
      if (m[3]) specifiers.push(m[3]);
      // Namespace import from group 2 or 5
      if (m[2]) specifiers.push(m[2]);
      if (m[5]) specifiers.push(m[5]);

      imports.push({
        source,
        specifiers,
        isRelative: source.startsWith('.'),
      });
    }

    // Re-exports: export { X } from 'source'
    const reExportRe = /^export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm;
    while ((m = reExportRe.exec(content)) !== null) {
      imports.push({
        source: m[1],
        specifiers: [],
        isRelative: m[1].startsWith('.'),
      });
    }

    // require() calls
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;
    while ((m = requireRe.exec(content)) !== null) {
      imports.push({
        source: m[1],
        specifiers: [],
        isRelative: m[1].startsWith('.'),
      });
    }

    return imports;
  }

  // ---------------------------------------------------------------------------
  // Python
  // ---------------------------------------------------------------------------

  private extractPythonSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const seen = new Set<string>();

    const add = (name: string, kind: SymbolKind, signature: string) => {
      if (!seen.has(name)) {
        seen.add(name);
        // Python doesn't have export keywords — top-level = public, _ prefix = private
        symbols.push({ name, kind, signature, isExported: !name.startsWith('_') });
      }
    };

    // Class declarations
    const classRe = /^class\s+(\w+)/gm;
    let m;
    while ((m = classRe.exec(content)) !== null) {
      const lineEnd = content.indexOf('\n', m.index);
      add(m[1], 'class', content.substring(m.index, lineEnd > 0 ? lineEnd : undefined).trim());
    }

    // Function definitions
    const funcRe = /^(?:\s*)(?:async\s+)?def\s+(\w+)\s*\([^)]*\)/gm;
    while ((m = funcRe.exec(content)) !== null) {
      const lineEnd = content.indexOf('\n', m.index);
      const sig = content.substring(m.index, lineEnd > 0 ? lineEnd : undefined).trim();
      const kind: SymbolKind = sig.startsWith(' ') || sig.startsWith('\t') ? 'method' : 'function';
      add(m[1], kind, sig);
    }

    return symbols;
  }

  private extractPythonImports(content: string): ImportInfo[] {
    const imports: ImportInfo[] = [];
    let m;

    // from X import Y, Z
    const fromRe = /^from\s+(\S+)\s+import\s+(.+)$/gm;
    while ((m = fromRe.exec(content)) !== null) {
      const specifiers = m[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      imports.push({
        source: m[1],
        specifiers,
        isRelative: m[1].startsWith('.'),
      });
    }

    // import X, import X as Y
    const importRe = /^import\s+(\S+)/gm;
    while ((m = importRe.exec(content)) !== null) {
      if (m[0].includes(' from ')) continue; // Skip 'from X import Y'
      imports.push({
        source: m[1].split(/\s+as\s+/)[0],
        specifiers: [],
        isRelative: m[1].startsWith('.'),
      });
    }

    return imports;
  }

  // ---------------------------------------------------------------------------
  // Generic fallback
  // ---------------------------------------------------------------------------

  private extractGenericSymbols(content: string): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const declRe = /^(?:pub\s+)?(?:fn|func|function|def|class|struct|enum|trait|impl|interface|type)\s+(\w+)/gm;
    let m;
    while ((m = declRe.exec(content)) !== null) {
      const lineEnd = content.indexOf('\n', m.index);
      const sig = content.substring(m.index, lineEnd > 0 ? lineEnd : undefined).replace(/\s*\{?\s*$/, '').trim();
      symbols.push({ name: m[1], kind: 'function', signature: sig, isExported: true });
    }
    return symbols;
  }
}
