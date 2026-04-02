/**
 * /doctor — pre-session diagnostic command.
 *
 * Validates environment variables, probes API endpoints, checks local
 * model servers, and verifies the active model configuration. Surfaces
 * issues before they cause cryptic errors mid-session.
 */

import {
  SlashCommand,
  MessageActionReturn,
  CommandKind,
} from './types.js';
import {
  runDiagnostics,
  formatReport,
} from '@delta-code/delta-code-core';

export const doctorCommand: SlashCommand = {
  name: 'doctor',
  altNames: ['health', 'diag'],
  description: 'Run provider health checks and diagnose configuration issues.',
  kind: CommandKind.BUILT_IN,
  action: async (context): Promise<MessageActionReturn> => {
    const config = context.services.config;
    const currentModel = config?.getModel();
    const authType = config?.getAuthType();

    const report = await runDiagnostics({
      currentModel,
      authType,
    });

    return {
      type: 'message',
      messageType: 'info',
      content: formatReport(report),
    };
  },
};
