/**
 * /persona — switch the voice and writing style of Delta Code.
 *
 * Built-in personas: default, 1950s, noir, pirate, corporate, salaryman,
 * shakespeare, drill-sergeant.
 *
 * Custom personas: drop a markdown file in ~/.delta/personas/ —
 * the filename becomes the persona ID, the content becomes the voice.
 */

import {
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import {
  getAllPersonas,
  findPersona,
  getActivePersonaId,
  setActivePersona,
} from '@delta-code/delta-code-core';

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List all available personas.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    const personas = getAllPersonas();
    const activeId = getActivePersonaId();

    let message = '\x1b[1mAvailable Personas\x1b[0m\n\n';

    for (const p of personas) {
      const active = p.id === activeId ? ' \x1b[32m← active\x1b[0m' : '';
      message += `  \x1b[36m${p.id}\x1b[0m — ${p.description}${active}\n`;
    }

    message += '\nUsage: /persona set <id>';

    return {
      type: 'message',
      messageType: 'info',
      content: message.trimEnd(),
    };
  },
};

const setCommand: SlashCommand = {
  name: 'set',
  description: 'Set the active persona. Usage: /persona set <id>',
  kind: CommandKind.BUILT_IN,
  action: async (_context, args): Promise<MessageActionReturn> => {
    const id = args.trim().toLowerCase();

    if (!id) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Missing persona ID. Usage: /persona set <id>\nRun /persona list to see options.',
      };
    }

    const persona = findPersona(id);
    if (!persona) {
      const available = getAllPersonas().map(p => p.id).join(', ');
      return {
        type: 'message',
        messageType: 'error',
        content: `Persona "${id}" not found. Available: ${available}`,
      };
    }

    const success = setActivePersona(id);
    if (!success) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Failed to save persona selection.',
      };
    }

    if (id === 'default') {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Persona reset to default. Restart Delta or start a new chat for the change to take effect.',
      };
    }

    return {
      type: 'message',
      messageType: 'info',
      content: `Persona set to \x1b[36m${persona.name}\x1b[0m — "${persona.description}"\n\nRestart Delta or start a new chat for the change to take effect.`,
    };
  },
  completion: async (_context, partialArg): Promise<string[]> => {
    const personas = getAllPersonas();
    return personas.map(p => p.id).filter(id => id.startsWith(partialArg.toLowerCase()));
  },
};

export const personaCommand: SlashCommand = {
  name: 'persona',
  altNames: ['style', 'voice'],
  description: 'Change the writing style and personality of Delta Code.',
  kind: CommandKind.BUILT_IN,
  action: async (): Promise<MessageActionReturn> => {
    const activeId = getActivePersonaId();
    const persona = findPersona(activeId);
    const name = persona?.name || 'Default';

    return {
      type: 'message',
      messageType: 'info',
      content: `Active persona: \x1b[36m${name}\x1b[0m (${activeId})\n\nSubcommands: list, set`,
    };
  },
  subCommands: [listCommand, setCommand],
};
