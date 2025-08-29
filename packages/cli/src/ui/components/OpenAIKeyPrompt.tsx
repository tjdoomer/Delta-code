/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface OpenAIKeyPromptProps {
  onSubmit: (apiKey: string, baseUrl: string, model: string) => void;
  onCancel: () => void;
  mode?: 'openai' | 'google' | 'azure' | 'bedrock' | 'claude';
}

export function OpenAIKeyPrompt({
  onSubmit,
  onCancel,
  mode = 'openai',
}: OpenAIKeyPromptProps): React.JSX.Element {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(() => {
    if (mode === 'azure') return 'https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-08-01-preview';
    if (mode === 'claude') return 'https://api.anthropic.com/v1/messages';
    return '';
  });
  const [model, setModel] = useState(() => {
    if (mode === 'azure') return '{deployment-name}';
    if (mode === 'bedrock') return 'us-east-1'; // region in model field for our handler
    if (mode === 'claude') return 'claude-3-sonnet';
    return '';
  });
  const [currentField, setCurrentField] = useState<
    'apiKey' | 'baseUrl' | 'model'
  >('apiKey');

  useInput((input, key) => {
    // Filter paste-related control sequences
    let cleanInput = (input || '')
      // Filter ESC-led control sequences (e.g., \u001b[200~, \u001b[201~)
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex
      // Filter paste start marker [200~
      .replace(/\[200~/g, '')
      // Filter paste end marker [201~
      .replace(/\[201~/g, '')
      // Filter stray '[' and '~' characters (leftover paste markers)
      .replace(/^\[|~$/g, '');

    // Then filter all non-printable ASCII (< 32), except carriage return/newline
    cleanInput = cleanInput
      .split('')
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join('');

    if (cleanInput.length > 0) {
      if (currentField === 'apiKey') {
        setApiKey((prev) => prev + cleanInput);
      } else if (currentField === 'baseUrl') {
        setBaseUrl((prev) => prev + cleanInput);
      } else if (currentField === 'model') {
        setModel((prev) => prev + cleanInput);
      }
      return;
    }

    // Check for Enter (by detecting newline characters)
    if (input.includes('\n') || input.includes('\r')) {
      if (currentField === 'apiKey') {
        // Allow empty API key to advance; user can return later to edit
        setCurrentField('baseUrl');
        return;
      } else if (currentField === 'baseUrl') {
        setCurrentField('model');
        return;
      } else if (currentField === 'model') {
        // Validate API key only on final submit
        if (apiKey.trim()) {
          onSubmit(apiKey.trim(), baseUrl.trim(), model.trim());
        } else {
          // If API key is empty, return focus to the API key field
          setCurrentField('apiKey');
        }
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    // Handle Tab key for field navigation
    if (key.tab) {
      if (currentField === 'apiKey') {
        setCurrentField('baseUrl');
      } else if (currentField === 'baseUrl') {
        setCurrentField('model');
      } else if (currentField === 'model') {
        setCurrentField('apiKey');
      }
      return;
    }

    // Handle arrow keys for field navigation
    if (key.upArrow) {
      if (currentField === 'baseUrl') {
        setCurrentField('apiKey');
      } else if (currentField === 'model') {
        setCurrentField('baseUrl');
      }
      return;
    }

    if (key.downArrow) {
      if (currentField === 'apiKey') {
        setCurrentField('baseUrl');
      } else if (currentField === 'baseUrl') {
        setCurrentField('model');
      }
      return;
    }

    // Handle backspace - check both key.backspace and delete key
    if (key.backspace || key.delete) {
      if (currentField === 'apiKey') {
        setApiKey((prev) => prev.slice(0, -1));
      } else if (currentField === 'baseUrl') {
        setBaseUrl((prev) => prev.slice(0, -1));
      } else if (currentField === 'model') {
        setModel((prev) => prev.slice(0, -1));
      }
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
      <Text bold color={Colors.AccentBlue}>
        {mode === 'google'
            ? 'Google (Gemini API Key) Configuration'
            : mode === 'azure'
              ? 'Azure OpenAI Configuration'
              : mode === 'bedrock'
                ? 'AWS Bedrock (Claude) Configuration'
                : mode === 'claude'
                  ? 'Anthropic Claude Configuration'
                  : 'OpenAI Configuration Required'}
      </Text>
      <Box marginTop={1}>
        <Text>
          {mode === 'google' ? (
            <>Enter your Google AI Studio API key (GEMINI_API_KEY).</>
          ) : mode === 'azure' ? (
            <>Enter Azure OpenAI details: API Key, full base URL, and deployment name.</>
          ) : mode === 'bedrock' ? (
            <>Enter AWS Bedrock credentials: Access Key ID (API Key), Secret (Base URL field), and Region (Model field).</>
          ) : mode === 'claude' ? (
            <>
              Enter your Anthropic Claude API key. You can get one from{' '}
              <Text color={Colors.AccentBlue}>https://console.anthropic.com/</Text>
            </>
          ) : (
            <>
              Please enter your OpenAI configuration. You can get an API key from{' '}
              <Text color={Colors.AccentBlue}>https://platform.openai.com/api-keys</Text>
            </>
          )}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text
            color={currentField === 'apiKey' ? Colors.AccentBlue : Colors.Gray}
          >
            API Key:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === 'apiKey' ? '> ' : '  '}
            {apiKey || ' '}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text
            color={currentField === 'baseUrl' ? Colors.AccentBlue : Colors.Gray}
          >
            Base URL:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === 'baseUrl' ? '> ' : '  '}
            {baseUrl}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text
            color={currentField === 'model' ? Colors.AccentBlue : Colors.Gray}
          >
            Model:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text>
            {currentField === 'model' ? '> ' : '  '}
            {model}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Press Enter to continue, Tab/↑↓ to navigate, Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}
