/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const bundlePath = join(root, 'bundle', 'gemini.js');

try {
  // Ensure generated commit info exists before any bundling attempts
  try {
    execSync('node scripts/generate-git-commit-info.js', { stdio: 'inherit', cwd: root });
  } catch (e) {
    console.warn('[delta] Failed to generate git commit info during prepare:', e?.message || e);
  }

  if (existsSync(bundlePath)) {
    // Bundle already present (committed). Just ensure assets are copied.
    execSync('node scripts/copy_bundle_assets.js', { stdio: 'inherit', cwd: root });
    process.exit(0);
  }

  // Try to build if esbuild is available. This path is for dev clones.
  try {
    // Check if esbuild is resolvable before invoking the build script.
    await import('esbuild');
    execSync('node esbuild.config.js', { stdio: 'inherit', cwd: root });
    execSync('node scripts/copy_bundle_assets.js', { stdio: 'inherit', cwd: root });
    process.exit(0);
  } catch (e) {
    // esbuild missing or build failure: cannot build in this environment.
    const reason = e && typeof e === 'object' && 'message' in e ? e.message : String(e);
    console.warn('[delta] Skipping bundle build during prepare:', reason);
    console.warn('[delta] If installing from git, ensure the bundle is committed.');
    // Do not fail install; bin may be unavailable without bundle.
    process.exit(0);
  }
} catch (err) {
  console.warn('[delta] prepare-install encountered a non-fatal issue:', err?.message || err);
  process.exit(0);
}


