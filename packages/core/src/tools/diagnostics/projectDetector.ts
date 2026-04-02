/**
 * Auto-detect the project's lint and test commands by scanning for known
 * config files at the project root.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DetectedCommands {
  lint: string | null;
  test: string | null;
}

/**
 * Scan the project root for known config files and infer lint/test commands.
 * Returns null for commands that can't be detected.
 */
export function detectProjectCommands(projectRoot: string): DetectedCommands {
  const result: DetectedCommands = { lint: null, test: null };

  // Node.js / JavaScript / TypeScript
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      if (scripts.lint) result.lint = 'npm run lint';
      if (scripts.test) result.test = 'npm run test';
      // If no lint script but eslint config exists
      if (!result.lint && (
        fs.existsSync(path.join(projectRoot, '.eslintrc.js')) ||
        fs.existsSync(path.join(projectRoot, '.eslintrc.json')) ||
        fs.existsSync(path.join(projectRoot, '.eslintrc.yml')) ||
        fs.existsSync(path.join(projectRoot, 'eslint.config.js')) ||
        fs.existsSync(path.join(projectRoot, 'eslint.config.mjs'))
      )) {
        result.lint = 'npx eslint .';
      }
      // TypeScript type-check as lint fallback
      if (!result.lint && fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
        result.lint = 'npx tsc --noEmit';
      }
    } catch { /* malformed package.json */ }
  }

  // Python
  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  if (fs.existsSync(pyprojectPath)) {
    if (!result.lint) result.lint = 'ruff check .';
    if (!result.test) result.test = 'pytest';
  }

  // Rust
  if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
    if (!result.lint) result.lint = 'cargo clippy';
    if (!result.test) result.test = 'cargo test';
  }

  // Go
  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    if (!result.lint) result.lint = 'golangci-lint run';
    if (!result.test) result.test = 'go test ./...';
  }

  // Ruby
  if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
    if (!result.lint) result.lint = 'rubocop';
    if (!result.test) result.test = 'bundle exec rspec';
  }

  // Makefile targets
  const makefilePath = path.join(projectRoot, 'Makefile');
  if (fs.existsSync(makefilePath)) {
    try {
      const content = fs.readFileSync(makefilePath, 'utf-8');
      if (!result.lint && /^lint\s*:/m.test(content)) {
        result.lint = 'make lint';
      }
      if (!result.test && /^test\s*:/m.test(content)) {
        result.test = 'make test';
      }
    } catch { /* unreadable */ }
  }

  return result;
}
