/**
 * @license
 * Copyright 2025 Delta
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings } from '../../config/settings.js';
import {
  AuthType,
  deltaOAuth2Events,
  DeltaOAuth2Event,
} from '@delta-code/delta-code-core';

export interface DeviceAuthorizationInfo {
  verification_uri: string;
  verification_uri_complete: string;
  user_code: string;
  expires_in: number;
}

interface DeltaAuthState {
  isDeltaAuthenticating: boolean;
  deviceAuth: DeviceAuthorizationInfo | null;
  authStatus:
    | 'idle'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'rate_limit';
  authMessage: string | null;
}

export const useDeltaAuth = (
  settings: LoadedSettings,
  isAuthenticating: boolean,
) => {
  const [deltaAuthState, setDeltaAuthState] = useState<DeltaAuthState>({
    isDeltaAuthenticating: false,
    deviceAuth: null,
    authStatus: 'idle',
    authMessage: null,
  });

  const isDeltaAuth = settings.merged.selectedAuthType === AuthType.QWEN_OAUTH;

  // Set up event listeners when authentication starts
  useEffect(() => {
    if (!isDeltaAuth || !isAuthenticating) {
      // Reset state when not authenticating or not Delta auth
      setDeltaAuthState({
        isDeltaAuthenticating: false,
        deviceAuth: null,
        authStatus: 'idle',
        authMessage: null,
      });
      return;
    }

    setDeltaAuthState((prev) => ({
      ...prev,
      isDeltaAuthenticating: true,
      authStatus: 'idle',
    }));

    // Set up event listeners
    const handleDeviceAuth = (deviceAuth: DeviceAuthorizationInfo) => {
      setDeltaAuthState((prev) => ({
        ...prev,
        deviceAuth: {
          verification_uri: deviceAuth.verification_uri,
          verification_uri_complete: deviceAuth.verification_uri_complete,
          user_code: deviceAuth.user_code,
          expires_in: deviceAuth.expires_in,
        },
        authStatus: 'polling',
      }));
    };

    const handleAuthProgress = (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => {
      setDeltaAuthState((prev) => ({
        ...prev,
        authStatus: status,
        authMessage: message || null,
      }));
    };

    // Add event listeners
    deltaOAuth2Events.on(DeltaOAuth2Event.AuthUri, handleDeviceAuth);
    deltaOAuth2Events.on(DeltaOAuth2Event.AuthProgress, handleAuthProgress);

    // Cleanup event listeners when component unmounts or auth finishes
    return () => {
      deltaOAuth2Events.off(DeltaOAuth2Event.AuthUri, handleDeviceAuth);
      deltaOAuth2Events.off(DeltaOAuth2Event.AuthProgress, handleAuthProgress);
    };
  }, [isDeltaAuth, isAuthenticating]);

  const cancelDeltaAuth = useCallback(() => {
    // Emit cancel event to stop polling
    deltaOAuth2Events.emit(DeltaOAuth2Event.AuthCancel);

    setDeltaAuthState({
      isDeltaAuthenticating: false,
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
    });
  }, []);

  return {
    ...deltaAuthState,
    isDeltaAuth,
    cancelDeltaAuth,
  };
};
