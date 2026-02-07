/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { ClaudeModelSelector, CLAUDE_MODELS, ClaudeModel } from './ClaudeModelSelector.js';
import { useKeypress, Key } from '../hooks/useKeypress.js';
import { useKittyKeyboardProtocol } from '../hooks/useKittyKeyboardProtocol.js';

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
    if (mode === 'claude') return 'claude-opus-4-1-20250805'; // Default to latest Claude Opus 4.1
    return '';
  });
  const [currentField, setCurrentField] = useState<
    'apiKey' | 'baseUrl' | 'model'
  >('apiKey');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const kittyProtocolStatus = useKittyKeyboardProtocol();

  const handleModelSelect = (selectedModel: ClaudeModel) => {
    setModel(selectedModel.id);
    setShowModelSelector(false);
    // Submit after model selection for Claude
    if (apiKey.trim()) {
      onSubmit(apiKey.trim(), baseUrl.trim(), selectedModel.id);
    } else {
      setCurrentField('apiKey');
    }
  };

  const handleModelSelectorCancel = () => {
    setShowModelSelector(false);
    // Stay on model field
  };

  const insertText = (text: string) => {
    if (currentField === 'apiKey') {
      setApiKey((prev) => prev + text);
    } else if (currentField === 'baseUrl') {
      setBaseUrl((prev) => prev + text);
    } else if (currentField === 'model') {
      setModel((prev) => prev + text);
    }
  };

  useKeypress(
    (key: Key) => {
      if (showModelSelector) return;

      // Handle paste
      if (key.paste) {
        const text = key.sequence
          .split('')
          .filter((ch) => ch.charCodeAt(0) >= 32)
          .join('');
        if (text) insertText(text);
        return;
      }

      // Handle Enter
      if (key.name === 'return') {
        if (currentField === 'apiKey') {
          setCurrentField('baseUrl');
        } else if (currentField === 'baseUrl') {
          setCurrentField('model');
        } else if (currentField === 'model') {
          if (mode === 'claude') {
            setShowModelSelector(true);
          } else if (apiKey.trim()) {
            onSubmit(apiKey.trim(), baseUrl.trim(), model.trim());
          } else {
            setCurrentField('apiKey');
          }
        }
        return;
      }

      if (key.name === 'escape') {
        onCancel();
        return;
      }

      // Handle Tab key for field navigation
      if (key.name === 'tab') {
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
      if (key.name === 'up') {
        if (currentField === 'baseUrl') {
          setCurrentField('apiKey');
        } else if (currentField === 'model') {
          setCurrentField('baseUrl');
        }
        return;
      }

      if (key.name === 'down') {
        if (currentField === 'apiKey') {
          setCurrentField('baseUrl');
        } else if (currentField === 'baseUrl') {
          setCurrentField('model');
        }
        return;
      }

      // Handle backspace and delete
      if (key.name === 'backspace' || key.name === 'delete') {
        if (currentField === 'apiKey') {
          setApiKey((prev) => prev.slice(0, -1));
        } else if (currentField === 'baseUrl') {
          setBaseUrl((prev) => prev.slice(0, -1));
        } else if (currentField === 'model') {
          setModel((prev) => prev.slice(0, -1));
        }
        return;
      }

      // Skip control/meta combos
      if (key.ctrl || key.meta) return;

      // Insert printable characters
      if (key.sequence) {
        const printable = key.sequence
          .split('')
          .filter((ch) => ch.charCodeAt(0) >= 32)
          .join('');
        if (printable) insertText(printable);
      }
    },
    {
      isActive: !showModelSelector,
      kittyProtocolEnabled: kittyProtocolStatus.enabled,
    },
  );

  // Show model selector for Claude mode
  if (showModelSelector && mode === 'claude') {
    return (
      <ClaudeModelSelector
        onSelect={handleModelSelect}
        onCancel={handleModelSelectorCancel}
        defaultModelId={model}
      />
    );
  }

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
            {mode === 'claude' 
              ? CLAUDE_MODELS.find(m => m.id === model)?.name || model
              : model}
            {mode === 'claude' && currentField === 'model' && (
              <Text color={Colors.Gray}> (Press Enter to select)</Text>
            )}
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
