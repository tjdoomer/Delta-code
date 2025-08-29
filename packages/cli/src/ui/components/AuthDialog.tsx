/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@delta-code/delta-code-core';
import { Box, Text } from 'ink';
import React, { useState } from 'react';
import {
  setOpenAIApiKey,
  setOpenAIBaseUrl,
  setOpenAIModel,
  setGeminiApiKey,
  setAzureOpenAIConfig,
  setAwsBedrockConfig,
  setAnthropicApiKey,
  validateAuthMethod,
} from '../../config/auth.js';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
}

export function AuthDialog({
  onSelect,
  settings,
  initialErrorMessage,
}: AuthDialogProps): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage || null,
  );
  const [showOpenAIKeyPrompt, setShowOpenAIKeyPrompt] = useState(false);
  const [providerMode, setProviderMode] = useState<
    'openai' | 'google' | 'azure' | 'bedrock' | 'claude'
  >('openai');

  // Two options: OpenAI-compatible or Anthropic via OpenAI-compatible provider
  type ProviderChoice = {
    provider: 'openai' | 'google' | 'azure' | 'bedrock' | 'claude';
    authType: AuthType;
  };
  const items: Array<{ label: string; value: ProviderChoice }> = [
    { label: 'Choose your Path - OpenAI', value: { provider: 'openai', authType: AuthType.USE_OPENAI } },
    { label: 'Choose your Path - Google (Gemini API key)', value: { provider: 'google', authType: AuthType.USE_GEMINI } },
    { label: 'Choose your Path - Azure OpenAI', value: { provider: 'azure', authType: AuthType.USE_OPENAI } },
    { label: 'Choose your Path - AWS Bedrock (Claude)', value: { provider: 'bedrock', authType: AuthType.USE_OPENAI } },
    { label: 'Choose your Path - Claude', value: { provider: 'claude', authType: AuthType.USE_CLAUDE } },
  ];

  // Always default to the single option (index 0)
  const initialAuthIndex = 0;

  const handleAuthSelect = (choice: ProviderChoice) => {
    setProviderMode(choice.provider);
    const authMethod = choice.authType;
    const error = validateAuthMethod(authMethod);
    if (error) {
      if (authMethod === AuthType.USE_OPENAI && !process.env.OPENAI_API_KEY) {
        setShowOpenAIKeyPrompt(true);
        setErrorMessage(null);
      } else {
        setErrorMessage(error);
      }
    } else {
      setErrorMessage(null);
      onSelect(authMethod, SettingScope.User);
    }
  };

  const handleOpenAIKeySubmit = (
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => {
    if (providerMode === 'google') {
      setGeminiApiKey(apiKey);
      setShowOpenAIKeyPrompt(false);
      onSelect(AuthType.USE_GEMINI, SettingScope.User);
      return;
    }

    if (providerMode === 'azure') {
      // For Azure, baseUrl = https://{resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions?api-version=2024-08-01-preview
      // We just store baseUrl and deployment name (model field) for OpenAI-compatible client
      setAzureOpenAIConfig(baseUrl, model, apiKey);
      setShowOpenAIKeyPrompt(false);
      onSelect(AuthType.USE_OPENAI, SettingScope.User);
      return;
    }

    if (providerMode === 'bedrock') {
      // Model selection will still flow via OPENAI_MODEL for routing in our OpenAI adapter
      // but credentials come from AWS env vars
      setAwsBedrockConfig(apiKey /* accessKeyId */, baseUrl /* secretKey */, model /* region */);
      setShowOpenAIKeyPrompt(false);
      onSelect(AuthType.USE_OPENAI, SettingScope.User);
      return;
    }

    if (providerMode === 'claude') {
      setAnthropicApiKey(apiKey);
      setShowOpenAIKeyPrompt(false);
      onSelect(AuthType.USE_CLAUDE, SettingScope.User);
      return;
    }

    // Default OpenAI-compatible, including Anthropic via OpenRouter
    setOpenAIApiKey(apiKey);
    setOpenAIBaseUrl(baseUrl);
    setOpenAIModel(model);
    setShowOpenAIKeyPrompt(false);
    onSelect(AuthType.USE_OPENAI, SettingScope.User);
  };

  const handleOpenAIKeyCancel = () => {
    setShowOpenAIKeyPrompt(false);
    setErrorMessage('OpenAI API key is required to use OpenAI authentication.');
  };

  useKeypress(
    (key) => {
      if (showOpenAIKeyPrompt) {
        return;
      }

      if (key.name === 'escape') {
        // Prevent exit if there is an error message.
        // This means they user is not authenticated yet.
        if (errorMessage) {
          return;
        }
        if (settings.merged.selectedAuthType === undefined) {
          // Prevent exiting if no auth method is set
          setErrorMessage(
            'You must select an auth method to proceed. Press Ctrl+C twice to exit.',
          );
          return;
        }
        onSelect(undefined, SettingScope.User);
      }
    },
    { isActive: true },
  );

  if (showOpenAIKeyPrompt) {
    return (
      <OpenAIKeyPrompt
        mode={providerMode}
        onSubmit={handleOpenAIKeySubmit}
        onCancel={handleOpenAIKeyCancel}
      />
    );
  }

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Get started</Text>
      <Box marginTop={1}>
        <Text>How would you like to authenticate for this project?</Text>
      </Box>
      <Box marginTop={1}>
        <RadioButtonSelect
          items={items}
          initialIndex={initialAuthIndex}
          onSelect={handleAuthSelect}
          isFocused={true}
        />
      </Box>
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={Colors.AccentPurple}>(Use Enter to Set Auth)</Text>
      </Box>
      <Box marginTop={1}>
        <Text>Terms of Services and Privacy Notice for Delta Code</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.AccentBlue}>
          {'https://github.com/DeltaLM/Delta3-Coder/blob/main/README.md'}
        </Text>
      </Box>
    </Box>
  );
}
