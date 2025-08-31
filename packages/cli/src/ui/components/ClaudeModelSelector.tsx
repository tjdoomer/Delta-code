/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

export interface ClaudeModel {
  id: string;
  name: string;
  description: string;
}

// Available Claude models based on Anthropic's current offerings
export const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: 'claude-opus-4-1-20250805',
    name: 'Claude Opus 4.1',
    description: 'Latest and most advanced Opus model (recommended)',
  },
  {
    id: 'claude-opus-4-20250514',
    name: 'Claude Opus 4',
    description: 'Most powerful Claude 4 model for complex tasks',
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    description: 'Balanced Claude 4 model with excellent performance',
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude Sonnet 3.7',
    description: 'Latest Claude 3.7 Sonnet model',
  },
  {
    id: 'claude-3-7-sonnet-latest',
    name: 'Claude Sonnet 3.7 (Latest)',
    description: 'Always points to the latest Claude 3.7 Sonnet version',
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    description: 'Previous generation model, still very capable',
  },
];

interface ClaudeModelSelectorProps {
  onSelect: (model: ClaudeModel) => void;
  onCancel: () => void;
  defaultModelId?: string;
}

export function ClaudeModelSelector({
  onSelect,
  onCancel,
  defaultModelId = 'claude-opus-4-1-20250805',
}: ClaudeModelSelectorProps): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const defaultIndex = CLAUDE_MODELS.findIndex(m => m.id === defaultModelId);
    return defaultIndex >= 0 ? defaultIndex : 0;
  });

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : CLAUDE_MODELS.length - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => (prev < CLAUDE_MODELS.length - 1 ? prev + 1 : 0));
      return;
    }

    if (key.return) {
      onSelect(CLAUDE_MODELS[selectedIndex]);
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    // Handle number keys for quick selection
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= CLAUDE_MODELS.length) {
      setSelectedIndex(num - 1);
      return;
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentBlue}>
          Select Claude Model
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text color={Colors.Gray}>
          Choose the Claude model for your conversations:
        </Text>
      </Box>

      {CLAUDE_MODELS.map((model, index) => (
        <Box key={model.id} marginBottom={1}>
          <Box flexDirection="row" alignItems="center">
            <Text color={index === selectedIndex ? Colors.AccentBlue : Colors.Foreground}>
              {index === selectedIndex ? '▶ ' : '  '}
              {index + 1}. {model.name}
            </Text>
          </Box>
          <Box marginLeft={4}>
            <Text color={Colors.Gray} dimColor={index !== selectedIndex}>
              {model.description}
            </Text>
          </Box>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Use ↑↓ to navigate, Enter to select, Esc to cancel, or press 1-{CLAUDE_MODELS.length} for quick selection
        </Text>
      </Box>
    </Box>
  );
}
