/**
 * @license
 * Copyright 2025 Delta
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDeltaAuth, DeviceAuthorizationInfo } from './useDeltaAuth.js';
import {
  AuthType,
  deltaOAuth2Events,
  DeltaOAuth2Event,
} from '@delta-code/delta-code-core';
import { LoadedSettings } from '../../config/settings.js';

// Mock the deltaOAuth2Events
vi.mock('@delta-code/delta-code-core', async () => {
  const actual = await vi.importActual('@delta-code/delta-code-core');
  const mockEmitter = {
    on: vi.fn().mockReturnThis(),
    off: vi.fn().mockReturnThis(),
    emit: vi.fn().mockReturnThis(),
  };
  return {
    ...actual,
    deltaOAuth2Events: mockEmitter,
    DeltaOAuth2Event: {
      AuthUri: 'authUri',
      AuthProgress: 'authProgress',
    },
  };
});

const mockDeltaOAuth2Events = vi.mocked(deltaOAuth2Events);

describe('useDeltaAuth', () => {
  const mockDeviceAuth: DeviceAuthorizationInfo = {
    verification_uri: 'https://oauth.delta.com/device',
    verification_uri_complete: 'https://oauth.delta.com/device?user_code=ABC123',
    user_code: 'ABC123',
    expires_in: 1800,
  };

  const createMockSettings = (authType: AuthType): LoadedSettings =>
    ({
      merged: {
        selectedAuthType: authType,
      },
    }) as LoadedSettings;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state when not Delta auth', () => {
    const settings = createMockSettings(AuthType.USE_GEMINI);
    const { result } = renderHook(() => useDeltaAuth(settings, false));

    expect(result.current).toEqual({
      isDeltaAuthenticating: false,
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
      isDeltaAuth: false,
      cancelDeltaAuth: expect.any(Function),
    });
  });

  it('should initialize with default state when Delta auth but not authenticating', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    const { result } = renderHook(() => useDeltaAuth(settings, false));

    expect(result.current).toEqual({
      isDeltaAuthenticating: false,
      deviceAuth: null,
      authStatus: 'idle',
      authMessage: null,
      isDeltaAuth: true,
      cancelDeltaAuth: expect.any(Function),
    });
  });

  it('should set up event listeners when Delta auth and authenticating', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    renderHook(() => useDeltaAuth(settings, true));

    expect(mockDeltaOAuth2Events.on).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockDeltaOAuth2Events.on).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should handle device auth event', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationInfo) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.authStatus).toBe('polling');
    expect(result.current.isDeltaAuthenticating).toBe(true);
  });

  it('should handle auth progress event - success', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    act(() => {
      handleAuthProgress!('success', 'Authentication successful!');
    });

    expect(result.current.authStatus).toBe('success');
    expect(result.current.authMessage).toBe('Authentication successful!');
  });

  it('should handle auth progress event - error', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    act(() => {
      handleAuthProgress!('error', 'Authentication failed');
    });

    expect(result.current.authStatus).toBe('error');
    expect(result.current.authMessage).toBe('Authentication failed');
  });

  it('should handle auth progress event - polling', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    act(() => {
      handleAuthProgress!('polling', 'Waiting for user authorization...');
    });

    expect(result.current.authStatus).toBe('polling');
    expect(result.current.authMessage).toBe(
      'Waiting for user authorization...',
    );
  });

  it('should handle auth progress event - rate_limit', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    act(() => {
      handleAuthProgress!(
        'rate_limit',
        'Too many requests. The server is rate limiting our requests. Please select a different authentication method or try again later.',
      );
    });

    expect(result.current.authStatus).toBe('rate_limit');
    expect(result.current.authMessage).toBe(
      'Too many requests. The server is rate limiting our requests. Please select a different authentication method or try again later.',
    );
  });

  it('should handle auth progress event without message', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleAuthProgress: (
      status: 'success' | 'error' | 'polling' | 'timeout' | 'rate_limit',
      message?: string,
    ) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthProgress) {
        handleAuthProgress = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    act(() => {
      handleAuthProgress!('success');
    });

    expect(result.current.authStatus).toBe('success');
    expect(result.current.authMessage).toBe(null);
  });

  it('should clean up event listeners when auth type changes', () => {
    const deltaSettings = createMockSettings(AuthType.QWEN_OAUTH);
    const { rerender } = renderHook(
      ({ settings, isAuthenticating }) =>
        useDeltaAuth(settings, isAuthenticating),
      { initialProps: { settings: deltaSettings, isAuthenticating: true } },
    );

    // Change to non-Delta auth
    const geminiSettings = createMockSettings(AuthType.USE_GEMINI);
    rerender({ settings: geminiSettings, isAuthenticating: true });

    expect(mockDeltaOAuth2Events.off).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockDeltaOAuth2Events.off).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should clean up event listeners when authentication stops', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    const { rerender } = renderHook(
      ({ isAuthenticating }) => useDeltaAuth(settings, isAuthenticating),
      { initialProps: { isAuthenticating: true } },
    );

    // Stop authentication
    rerender({ isAuthenticating: false });

    expect(mockDeltaOAuth2Events.off).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockDeltaOAuth2Events.off).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should clean up event listeners on unmount', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    const { unmount } = renderHook(() => useDeltaAuth(settings, true));

    unmount();

    expect(mockDeltaOAuth2Events.off).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthUri,
      expect.any(Function),
    );
    expect(mockDeltaOAuth2Events.off).toHaveBeenCalledWith(
      DeltaOAuth2Event.AuthProgress,
      expect.any(Function),
    );
  });

  it('should reset state when switching from Delta auth to another auth type', () => {
    const deltaSettings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationInfo) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result, rerender } = renderHook(
      ({ settings, isAuthenticating }) =>
        useDeltaAuth(settings, isAuthenticating),
      { initialProps: { settings: deltaSettings, isAuthenticating: true } },
    );

    // Simulate device auth
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.authStatus).toBe('polling');

    // Switch to different auth type
    const geminiSettings = createMockSettings(AuthType.USE_GEMINI);
    rerender({ settings: geminiSettings, isAuthenticating: true });

    expect(result.current.isDeltaAuthenticating).toBe(false);
    expect(result.current.deviceAuth).toBe(null);
    expect(result.current.authStatus).toBe('idle');
    expect(result.current.authMessage).toBe(null);
  });

  it('should reset state when authentication stops', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationInfo) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result, rerender } = renderHook(
      ({ isAuthenticating }) => useDeltaAuth(settings, isAuthenticating),
      { initialProps: { isAuthenticating: true } },
    );

    // Simulate device auth
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.deviceAuth).toEqual(mockDeviceAuth);
    expect(result.current.authStatus).toBe('polling');

    // Stop authentication
    rerender({ isAuthenticating: false });

    expect(result.current.isDeltaAuthenticating).toBe(false);
    expect(result.current.deviceAuth).toBe(null);
    expect(result.current.authStatus).toBe('idle');
    expect(result.current.authMessage).toBe(null);
  });

  it('should handle cancelDeltaAuth function', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    let handleDeviceAuth: (deviceAuth: DeviceAuthorizationInfo) => void;

    mockDeltaOAuth2Events.on.mockImplementation((event, handler) => {
      if (event === DeltaOAuth2Event.AuthUri) {
        handleDeviceAuth = handler;
      }
      return mockDeltaOAuth2Events;
    });

    const { result } = renderHook(() => useDeltaAuth(settings, true));

    // Set up some state
    act(() => {
      handleDeviceAuth!(mockDeviceAuth);
    });

    expect(result.current.deviceAuth).toEqual(mockDeviceAuth);

    // Cancel auth
    act(() => {
      result.current.cancelDeltaAuth();
    });

    expect(result.current.isDeltaAuthenticating).toBe(false);
    expect(result.current.deviceAuth).toBe(null);
    expect(result.current.authStatus).toBe('idle');
    expect(result.current.authMessage).toBe(null);
  });

  it('should maintain isDeltaAuth flag correctly', () => {
    // Test with Delta OAuth
    const deltaSettings = createMockSettings(AuthType.QWEN_OAUTH);
    const { result: deltaResult } = renderHook(() =>
      useDeltaAuth(deltaSettings, false),
    );
    expect(deltaResult.current.isDeltaAuth).toBe(true);

    // Test with other auth types
    const geminiSettings = createMockSettings(AuthType.USE_GEMINI);
    const { result: geminiResult } = renderHook(() =>
      useDeltaAuth(geminiSettings, false),
    );
    expect(geminiResult.current.isDeltaAuth).toBe(false);

    const oauthSettings = createMockSettings(AuthType.LOGIN_WITH_GOOGLE);
    const { result: oauthResult } = renderHook(() =>
      useDeltaAuth(oauthSettings, false),
    );
    expect(oauthResult.current.isDeltaAuth).toBe(false);
  });

  it('should set isDeltaAuthenticating to true when starting authentication with Delta auth', () => {
    const settings = createMockSettings(AuthType.QWEN_OAUTH);
    const { result } = renderHook(() => useDeltaAuth(settings, true));

    expect(result.current.isDeltaAuthenticating).toBe(true);
    expect(result.current.authStatus).toBe('idle');
  });
});
