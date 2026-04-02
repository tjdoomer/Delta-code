/**
 * Parse structured diagnostics from lint/test tool output.
 *
 * Each parser attempts to extract file:line:message tuples from the raw
 * output of common lint and test tools. Falls back to returning raw output
 * if no structured format is detected.
 */

export interface Diagnostic {
  file: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  rule?: string;
  source?: string;
}

/**
 * Parse diagnostics from generic file:line:col:message format.
 * Covers: tsc, Go, Python tracebacks, and most linters' default output.
 */
export function parseGenericDiagnostics(output: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  // Match patterns like: file.ts(10,5): error TS1234: message
  // Or: file.py:10:5: E501 line too long
  // Or: file.go:10:5: message
  // Try TypeScript pattern first
  const tsPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/gm;
  let match;
  while ((match = tsPattern.exec(output)) !== null) {
    diagnostics.push({
      file: match[1],
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: match[4] as 'error' | 'warning',
      rule: match[5],
      message: match[6],
      source: 'typescript',
    });
  }

  if (diagnostics.length > 0) return diagnostics;

  // Try file:line:col: message pattern
  const genericPattern = /^(.+?):(\d+):(\d+):\s*(?:(error|warning|note|info)\s+)?(.+)$/gm;
  while ((match = genericPattern.exec(output)) !== null) {
    // Skip lines that look like stack traces or URLs
    if (match[1].includes('node_modules') || match[1].startsWith('http')) continue;

    diagnostics.push({
      file: match[1].trim(),
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      severity: (match[4] as 'error' | 'warning' | 'info') || 'error',
      message: match[5].trim(),
    });
  }

  return diagnostics;
}

/**
 * Format diagnostics into a concise summary for the model.
 */
export function formatDiagnostics(diagnostics: Diagnostic[], command: string, exitCode: number): string {
  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');

  let summary = `Command: ${command}\nExit code: ${exitCode}\n`;
  summary += `${errors.length} error(s), ${warnings.length} warning(s)\n\n`;

  for (const d of diagnostics.slice(0, 50)) {
    const loc = d.column ? `${d.file}:${d.line}:${d.column}` : `${d.file}:${d.line}`;
    const rule = d.rule ? ` [${d.rule}]` : '';
    summary += `${d.severity.toUpperCase()} ${loc}: ${d.message}${rule}\n`;
  }

  if (diagnostics.length > 50) {
    summary += `\n... and ${diagnostics.length - 50} more diagnostic(s)`;
  }

  return summary;
}
