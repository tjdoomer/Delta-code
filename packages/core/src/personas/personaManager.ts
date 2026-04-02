/**
 * Persona manager — loads built-in and custom personas, persists selection.
 *
 * Custom personas: drop a markdown file in ~/.delta/personas/ or
 * .delta/personas/. The filename (minus .md) becomes the persona ID.
 * File content becomes the prompt modifier.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { BUILTIN_PERSONAS, type Persona } from './builtinPersonas.js';

// Lazy-evaluated to avoid calling homedir() at module load time
// (breaks tests that mock os.homedir after import)
function getGlobalPersonasDir(): string {
  return path.join(homedir(), '.delta', 'personas');
}
function getActivePersonaFile(): string {
  return path.join(homedir(), '.delta', 'active-persona');
}

/**
 * Load custom personas from ~/.delta/personas/*.md
 * Each file becomes a persona where filename = ID, content = prompt modifier.
 */
function loadCustomPersonas(): Persona[] {
  const personas: Persona[] = [];
  const dirs = [getGlobalPersonasDir()];

  // Also check project-level .delta/personas/
  const projectDir = path.join(process.cwd(), '.delta', 'personas');
  if (fs.existsSync(projectDir)) {
    dirs.push(projectDir);
  }

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const id = file.replace('.md', '').toLowerCase();
        const content = fs.readFileSync(path.join(dir, file), 'utf-8');

        // Skip if a built-in with the same ID exists
        if (BUILTIN_PERSONAS.some(p => p.id === id)) continue;

        // Parse optional frontmatter: name and description
        let name = id;
        let description = `Custom persona from ${file}`;
        let promptModifier = content;

        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (frontmatterMatch) {
          const frontmatter = frontmatterMatch[1];
          promptModifier = frontmatterMatch[2].trim();

          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
          if (nameMatch) name = nameMatch[1].trim();

          const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
          if (descMatch) description = descMatch[1].trim();
        }

        personas.push({ id, name, description, promptModifier });
      }
    } catch { /* unreadable directory */ }
  }

  return personas;
}

/** Get all available personas (built-in + custom). */
export function getAllPersonas(): Persona[] {
  return [...BUILTIN_PERSONAS, ...loadCustomPersonas()];
}

/** Find a persona by ID across built-in and custom. */
export function findPersona(id: string): Persona | undefined {
  return getAllPersonas().find(p => p.id === id.toLowerCase());
}

/** Get the currently active persona ID. */
export function getActivePersonaId(): string {
  try {
    const filePath = getActivePersonaFile();
    // Guard with existsSync to avoid triggering readFileSync in test spies
    if (!fs.existsSync(filePath)) return 'default';
    const id = fs.readFileSync(filePath, 'utf-8').trim();
    if (findPersona(id)) return id;
  } catch { /* no active persona file */ }
  return 'default';
}

/** Set the active persona (persists across sessions). */
export function setActivePersona(id: string): boolean {
  const persona = findPersona(id);
  if (!persona) return false;

  try {
    const dir = path.dirname(getActivePersonaFile());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getActivePersonaFile(), id, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** Get the prompt modifier for the currently active persona. */
export function getActivePersonaPrompt(): string {
  const id = getActivePersonaId();
  const persona = findPersona(id);
  return persona?.promptModifier || '';
}
