/**
 * @license
 * Copyright 2025 Delta
 * SPDX-License-Identifier: Apache-2.0
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs, unlinkSync, type Stats } from 'node:fs';
import * as os from 'os';
import path from 'node:path';

import {
  SharedTokenManager,
  TokenManagerError,
  TokenError,
} from './sharedTokenManager.js';
import type {
  IDeltaOAuth2Client,
  DeltaCredentials,
  TokenRefreshData,
  ErrorData,
} from './deltaOAuth2.js';

// Mock external dependencies
vi.mock('node:fs', () => ({
  promises: {
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
  },
  unlinkSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(),
}));

vi.mock('node:path', () => ({
  default: {
    join: vi.fn(),
    dirname: vi.fn(),
  },
}));

/**
 * Helper to access private properties for testing
 */
function getPrivateProperty<T>(obj: unknown, property: string): T {
  return (obj as Record<string, T>)[property];
}

/**
 * Helper to set private properties for testing
 */
function setPrivateProperty<T>(obj: unknown, property: string, value: T): void {
  (obj as Record<string, T>)[property] = value;
}

/**
 * Creates a mock DeltaOAuth2Client for testing
 */
function createMockDeltaClient(
  initialCredentials: Partial<DeltaCredentials> = {},
): IDeltaOAuth2Client {
  let credentials: DeltaCredentials = {
    access_token: 'mock_access_token',
    refresh_token: 'mock_refresh_token',
    token_type: 'Bearer',
    expiry_date: Date.now() + 3600000, // 1 hour from now
    resource_url: 'https://api.example.com',
    ...initialCredentials,
  };

  return {
    setCredentials: vi.fn((creds: DeltaCredentials) => {
      credentials = { ...credentials, ...creds };
    }),
    getCredentials: vi.fn(() => credentials),
    getAccessToken: vi.fn(),
    requestDeviceAuthorization: vi.fn(),
    pollDeviceToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

/**
 * Creates valid mock credentials
 */
function createValidCredentials(
  overrides: Partial<DeltaCredentials> = {},
): DeltaCredentials {
  return {
    access_token: 'valid_access_token',
    refresh_token: 'valid_refresh_token',
    token_type: 'Bearer',
    expiry_date: Date.now() + 3600000, // 1 hour from now
    resource_url: 'https://api.example.com',
    ...overrides,
  };
}

/**
 * Creates expired mock credentials
 */
function createExpiredCredentials(
  overrides: Partial<DeltaCredentials> = {},
): DeltaCredentials {
  return {
    access_token: 'expired_access_token',
    refresh_token: 'expired_refresh_token',
    token_type: 'Bearer',
    expiry_date: Date.now() - 3600000, // 1 hour ago
    resource_url: 'https://api.example.com',
    ...overrides,
  };
}

/**
 * Creates a successful token refresh response
 */
function createSuccessfulRefreshResponse(
  overrides: Partial<TokenRefreshData> = {},
): TokenRefreshData {
  return {
    access_token: 'fresh_access_token',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'new_refresh_token',
    resource_url: 'https://api.example.com',
    ...overrides,
  };
}

/**
 * Creates an error response
 */
function createErrorResponse(
  error = 'invalid_grant',
  description = 'Token expired',
): ErrorData {
  return {
    error,
    error_description: description,
  };
}

describe('SharedTokenManager', () => {
  let tokenManager: SharedTokenManager;

  // Get mocked modules
  const mockFs = vi.mocked(fs);
  const mockOs = vi.mocked(os);
  const mockPath = vi.mocked(path);
  const mockUnlinkSync = vi.mocked(unlinkSync);

  beforeEach(() => {
    // Clean up any existing instance's listeners first
    const existingInstance = getPrivateProperty(
      SharedTokenManager,
      'instance',
    ) as SharedTokenManager;
    if (existingInstance) {
      existingInstance.cleanup();
    }

    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock implementations
    mockOs.homedir.mockReturnValue('/home/user');
    mockPath.join.mockImplementation((...args) => args.join('/'));
    mockPath.dirname.mockImplementation((filePath) => {
      // Handle undefined/null input gracefully
      if (!filePath || typeof filePath !== 'string') {
        return '/home/user/.delta'; // Return the expected directory path
      }
      const parts = filePath.split('/');
      const result = parts.slice(0, -1).join('/');
      return result || '/';
    });

    // Reset singleton instance for each test
    setPrivateProperty(SharedTokenManager, 'instance', null);
    tokenManager = SharedTokenManager.getInstance();
  });

  afterEach(() => {
    // Clean up listeners after each test
    if (tokenManager) {
      tokenManager.cleanup();
    }
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = SharedTokenManager.getInstance();
      const instance2 = SharedTokenManager.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(tokenManager);
    });

    it('should create a new instance after reset', () => {
      const instance1 = SharedTokenManager.getInstance();

      // Reset singleton for testing
      setPrivateProperty(SharedTokenManager, 'instance', null);
      const instance2 = SharedTokenManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getValidCredentials', () => {
    it('should return valid cached credentials without refresh', async () => {
      const mockClient = createMockDeltaClient();
      const validCredentials = createValidCredentials();

      // Mock file operations to indicate no file changes
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);

      // Manually set cached credentials
      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{
        credentials: DeltaCredentials | null;
        fileModTime: number;
        lastCheck: number;
      }>(tokenManager, 'memoryCache');
      memoryCache.credentials = validCredentials;
      memoryCache.fileModTime = 1000;
      memoryCache.lastCheck = Date.now();

      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result).toEqual(validCredentials);
      expect(mockClient.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('should refresh expired credentials', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const refreshResponse = createSuccessfulRefreshResponse();

      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(refreshResponse);

      // Mock file operations
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result.access_token).toBe(refreshResponse.access_token);
      expect(mockClient.refreshAccessToken).toHaveBeenCalled();
      expect(mockClient.setCredentials).toHaveBeenCalled();
    });

    it('should force refresh when forceRefresh is true', async () => {
      const mockClient = createMockDeltaClient(createValidCredentials());
      const refreshResponse = createSuccessfulRefreshResponse();

      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(refreshResponse);

      // Mock file operations
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      const result = await tokenManager.getValidCredentials(mockClient, true);

      expect(result.access_token).toBe(refreshResponse.access_token);
      expect(mockClient.refreshAccessToken).toHaveBeenCalled();
    });

    it('should throw TokenManagerError when refresh token is missing', async () => {
      const mockClient = createMockDeltaClient({
        access_token: 'expired_token',
        refresh_token: undefined, // No refresh token
        expiry_date: Date.now() - 3600000,
      });

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow(TokenManagerError);

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow('No refresh token available');
    });

    it('should throw TokenManagerError when refresh fails', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const errorResponse = createErrorResponse();

      mockClient.refreshAccessToken = vi.fn().mockResolvedValue(errorResponse);

      // Mock file operations
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow(TokenManagerError);
    });

    it('should handle network errors during refresh', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const networkError = new Error('Network request failed');

      mockClient.refreshAccessToken = vi.fn().mockRejectedValue(networkError);

      // Mock file operations
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow(TokenManagerError);
    });

    it('should wait for ongoing refresh and return same result', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const refreshResponse = createSuccessfulRefreshResponse();

      // Create a delayed refresh response
      let resolveRefresh: (value: TokenRefreshData) => void;
      const refreshPromise = new Promise<TokenRefreshData>((resolve) => {
        resolveRefresh = resolve;
      });

      mockClient.refreshAccessToken = vi.fn().mockReturnValue(refreshPromise);

      // Mock file operations
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      // Start two concurrent refresh operations
      const promise1 = tokenManager.getValidCredentials(mockClient);
      const promise2 = tokenManager.getValidCredentials(mockClient);

      // Resolve the refresh
      resolveRefresh!(refreshResponse);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(result2);
      expect(mockClient.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should reload credentials from file when file is modified', async () => {
      const mockClient = createMockDeltaClient();
      const fileCredentials = createValidCredentials({
        access_token: 'file_access_token',
      });

      // Mock file operations to simulate file modification
      mockFs.stat.mockResolvedValue({ mtimeMs: 2000 } as Stats);
      mockFs.readFile.mockResolvedValue(JSON.stringify(fileCredentials));

      // Set initial cache state
      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{ fileModTime: number }>(
        tokenManager,
        'memoryCache',
      );
      memoryCache.fileModTime = 1000; // Older than file

      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result.access_token).toBe('file_access_token');
      expect(mockFs.readFile).toHaveBeenCalled();
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      // Set some cache data
      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{
        credentials: DeltaCredentials | null;
      }>(tokenManager, 'memoryCache');
      memoryCache.credentials = createValidCredentials();

      tokenManager.clearCache();

      expect(tokenManager.getCurrentCredentials()).toBeNull();
    });

    it('should return current credentials from cache', () => {
      const credentials = createValidCredentials();

      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{
        credentials: DeltaCredentials | null;
      }>(tokenManager, 'memoryCache');
      memoryCache.credentials = credentials;

      expect(tokenManager.getCurrentCredentials()).toEqual(credentials);
    });

    it('should return null when no credentials are cached', () => {
      tokenManager.clearCache();

      expect(tokenManager.getCurrentCredentials()).toBeNull();
    });
  });

  describe('Refresh Status', () => {
    it('should return false when no refresh is in progress', () => {
      expect(tokenManager.isRefreshInProgress()).toBe(false);
    });

    it('should return true when refresh is in progress', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());

      // Clear cache to ensure refresh is triggered
      tokenManager.clearCache();

      // Mock stat for file check to fail (no file initially)
      mockFs.stat.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      // Create a delayed refresh response
      let resolveRefresh: (value: TokenRefreshData) => void;
      const refreshPromise = new Promise<TokenRefreshData>((resolve) => {
        resolveRefresh = resolve;
      });

      mockClient.refreshAccessToken = vi.fn().mockReturnValue(refreshPromise);

      // Mock file operations for lock and save
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);

      // Start refresh
      const refreshOperation = tokenManager.getValidCredentials(mockClient);

      // Wait a tick to ensure the refresh promise is set
      await new Promise((resolve) => setImmediate(resolve));

      expect(tokenManager.isRefreshInProgress()).toBe(true);

      // Complete refresh
      resolveRefresh!(createSuccessfulRefreshResponse());
      await refreshOperation;

      expect(tokenManager.isRefreshInProgress()).toBe(false);
    });
  });

  describe('Debug Info', () => {
    it('should return complete debug information', () => {
      const credentials = createValidCredentials();

      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{
        credentials: DeltaCredentials | null;
      }>(tokenManager, 'memoryCache');
      memoryCache.credentials = credentials;

      const debugInfo = tokenManager.getDebugInfo();

      expect(debugInfo).toHaveProperty('hasCredentials', true);
      expect(debugInfo).toHaveProperty('credentialsExpired', false);
      expect(debugInfo).toHaveProperty('isRefreshing', false);
      expect(debugInfo).toHaveProperty('cacheAge');
      expect(typeof debugInfo.cacheAge).toBe('number');
    });

    it('should indicate expired credentials in debug info', () => {
      const expiredCredentials = createExpiredCredentials();

      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{
        credentials: DeltaCredentials | null;
      }>(tokenManager, 'memoryCache');
      memoryCache.credentials = expiredCredentials;

      const debugInfo = tokenManager.getDebugInfo();

      expect(debugInfo.hasCredentials).toBe(true);
      expect(debugInfo.credentialsExpired).toBe(true);
    });

    it('should indicate no credentials in debug info', () => {
      tokenManager.clearCache();

      const debugInfo = tokenManager.getDebugInfo();

      expect(debugInfo.hasCredentials).toBe(false);
      expect(debugInfo.credentialsExpired).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should create TokenManagerError with correct type and message', () => {
      const error = new TokenManagerError(
        TokenError.REFRESH_FAILED,
        'Token refresh failed',
        new Error('Original error'),
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TokenManagerError);
      expect(error.type).toBe(TokenError.REFRESH_FAILED);
      expect(error.message).toBe('Token refresh failed');
      expect(error.name).toBe('TokenManagerError');
      expect(error.originalError).toBeInstanceOf(Error);
    });

    it('should handle file access errors gracefully', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());

      // Mock file stat to throw access error
      const accessError = new Error(
        'Permission denied',
      ) as NodeJS.ErrnoException;
      accessError.code = 'EACCES';
      mockFs.stat.mockRejectedValue(accessError);

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow(TokenManagerError);
    });

    it('should handle missing file gracefully', async () => {
      const mockClient = createMockDeltaClient();
      const validCredentials = createValidCredentials();

      // Mock file stat to throw file not found error
      const notFoundError = new Error(
        'File not found',
      ) as NodeJS.ErrnoException;
      notFoundError.code = 'ENOENT';
      mockFs.stat.mockRejectedValue(notFoundError);

      // Set valid credentials in cache
      const memoryCache = getPrivateProperty<{
        credentials: DeltaCredentials | null;
      }>(tokenManager, 'memoryCache');
      memoryCache.credentials = validCredentials;

      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result).toEqual(validCredentials);
    });

    it('should handle lock timeout scenarios', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());

      // Configure shorter timeouts for testing
      tokenManager.setLockConfig({
        maxAttempts: 3,
        attemptInterval: 50,
      });

      // Mock stat for file check to pass (no file initially)
      mockFs.stat.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      // Mock writeFile to always throw EEXIST for lock file writes (flag: 'wx')
      // but succeed for regular file writes
      const lockError = new Error('File exists') as NodeJS.ErrnoException;
      lockError.code = 'EEXIST';

      mockFs.writeFile.mockImplementation((path, data, options) => {
        if (typeof options === 'object' && options?.flag === 'wx') {
          return Promise.reject(lockError);
        }
        return Promise.resolve(undefined);
      });

      // Mock stat to return recent lock file (not stale) when checking lock age
      mockFs.stat.mockResolvedValue({ mtimeMs: Date.now() } as Stats);

      // Mock unlink to simulate lock file removal attempts
      mockFs.unlink.mockResolvedValue(undefined);

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow(TokenManagerError);
    }, 500); // 500ms timeout for lock test (3 attempts × 50ms = ~150ms + buffer)

    it('should handle refresh response without access token', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const invalidResponse = {
        token_type: 'Bearer',
        expires_in: 3600,
        // access_token is missing, so we use undefined explicitly
        access_token: undefined,
      } as Partial<TokenRefreshData>;

      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(invalidResponse);

      // Mock stat for file check to pass (no file initially)
      mockFs.stat.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      // Mock file operations for lock acquisition
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      // Clear cache to force refresh
      tokenManager.clearCache();

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow(TokenManagerError);

      await expect(
        tokenManager.getValidCredentials(mockClient),
      ).rejects.toThrow('no token returned');
    });
  });

  describe('File System Operations', () => {
    it('should handle file reload failures gracefully', async () => {
      const mockClient = createMockDeltaClient();

      // Mock successful refresh for when cache is cleared
      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(createSuccessfulRefreshResponse());

      // Mock file operations
      mockFs.stat
        .mockResolvedValueOnce({ mtimeMs: 2000 } as Stats) // For checkAndReloadIfNeeded
        .mockResolvedValue({ mtimeMs: 1000 } as Stats); // For later operations
      mockFs.readFile.mockRejectedValue(new Error('Read failed'));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      // Set initial cache state to trigger reload
      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{ fileModTime: number }>(
        tokenManager,
        'memoryCache',
      );
      memoryCache.fileModTime = 1000;

      // Should not throw error, should refresh and get new credentials
      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result).toBeDefined();
      expect(result.access_token).toBe('fresh_access_token');
    });

    it('should handle invalid JSON in credentials file', async () => {
      const mockClient = createMockDeltaClient();

      // Mock successful refresh for when cache is cleared
      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(createSuccessfulRefreshResponse());

      // Mock file operations with invalid JSON
      mockFs.stat
        .mockResolvedValueOnce({ mtimeMs: 2000 } as Stats) // For checkAndReloadIfNeeded
        .mockResolvedValue({ mtimeMs: 1000 } as Stats); // For later operations
      mockFs.readFile.mockResolvedValue('invalid json content');
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      // Set initial cache state to trigger reload
      tokenManager.clearCache();
      const memoryCache = getPrivateProperty<{ fileModTime: number }>(
        tokenManager,
        'memoryCache',
      );
      memoryCache.fileModTime = 1000;

      // Should handle JSON parse error gracefully, then refresh and get new credentials
      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result).toBeDefined();
      expect(result.access_token).toBe('fresh_access_token');
    });

    it('should handle directory creation during save', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const refreshResponse = createSuccessfulRefreshResponse();

      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(refreshResponse);

      // Mock file operations
      mockFs.stat.mockResolvedValue({ mtimeMs: 1000 } as Stats);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      await tokenManager.getValidCredentials(mockClient);

      expect(mockFs.mkdir).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
        mode: 0o700,
      });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Lock File Management', () => {
    it('should clean up lock file during process cleanup', () => {
      // Create a new instance to trigger cleanup handler registration
      SharedTokenManager.getInstance();

      // Access the private cleanup method for testing
      const cleanupHandlers = process.listeners('exit');
      const cleanup = cleanupHandlers[cleanupHandlers.length - 1] as () => void;

      // Should not throw when lock file doesn't exist
      expect(() => cleanup()).not.toThrow();
      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should handle stale lock cleanup', async () => {
      const mockClient = createMockDeltaClient(createExpiredCredentials());
      const refreshResponse = createSuccessfulRefreshResponse();

      mockClient.refreshAccessToken = vi
        .fn()
        .mockResolvedValue(refreshResponse);

      // First writeFile call throws EEXIST (lock exists)
      // Second writeFile call succeeds (after stale lock cleanup)
      const lockError = new Error('File exists') as NodeJS.ErrnoException;
      lockError.code = 'EEXIST';
      mockFs.writeFile
        .mockRejectedValueOnce(lockError)
        .mockResolvedValue(undefined);

      // Mock stat to return stale lock (old timestamp)
      mockFs.stat
        .mockResolvedValueOnce({ mtimeMs: Date.now() - 20000 } as Stats) // Stale lock
        .mockResolvedValueOnce({ mtimeMs: 1000 } as Stats); // Credentials file

      // Mock unlink to succeed
      mockFs.unlink.mockResolvedValue(undefined);
      mockFs.mkdir.mockResolvedValue(undefined);

      const result = await tokenManager.getValidCredentials(mockClient);

      expect(result.access_token).toBe(refreshResponse.access_token);
      expect(mockFs.unlink).toHaveBeenCalled(); // Stale lock removed
    });
  });
});
