/**
 * @license
 * Copyright 2025 Delta
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import Link from 'ink-link';
import qrcode from 'qrcode-terminal';
import { Colors } from '../colors.js';
import { DeviceAuthorizationInfo } from '../hooks/useDeltaAuth.js';

interface DeltaOAuthProgressProps {
  onTimeout: () => void;
  onCancel: () => void;
  deviceAuth?: DeviceAuthorizationInfo;
  authStatus?:
    | 'idle'
    | 'polling'
    | 'success'
    | 'error'
    | 'timeout'
    | 'rate_limit';
  authMessage?: string | null;
}

/**
 * Static QR Code Display Component
 * Renders the QR code and URL once and doesn't re-render unless the URL changes
 */
function QrCodeDisplay({
  verificationUrl,
  qrCodeData,
}: {
  verificationUrl: string;
  qrCodeData: string | null;
}): React.JSX.Element | null {
  if (!qrCodeData) {
    return null;
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
        Delta OAuth Authentication
      </Text>

      <Box marginTop={1}>
        <Text>Please visit this URL to authorize:</Text>
      </Box>

      <Link url={verificationUrl} fallback={false}>
        <Text color={Colors.AccentGreen} bold>
          {verificationUrl}
        </Text>
      </Link>

      <Box marginTop={1}>
        <Text>Or scan the QR code below:</Text>
      </Box>

      <Box marginTop={1}>
        <Text>{qrCodeData}</Text>
      </Box>
    </Box>
  );
}

/**
 * Dynamic Status Display Component
 * Shows the loading spinner, timer, and status messages
 */
function StatusDisplay({
  timeRemaining,
  dots,
}: {
  timeRemaining: number;
  dots: string;
}): React.JSX.Element {
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box marginTop={1}>
        <Text>
          <Spinner type="dots" /> Waiting for authorization{dots}
        </Text>
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color={Colors.Gray}>
          Time remaining: {formatTime(timeRemaining)}
        </Text>
        <Text color={Colors.AccentPurple}>(Press ESC to cancel)</Text>
      </Box>
    </Box>
  );
}

export function DeltaOAuthProgress({
  onTimeout,
  onCancel,
  deviceAuth,
  authStatus,
  authMessage,
}: DeltaOAuthProgressProps): React.JSX.Element {
  const defaultTimeout = deviceAuth?.expires_in || 300; // Default 5 minutes
  const [timeRemaining, setTimeRemaining] = useState<number>(defaultTimeout);
  const [dots, setDots] = useState<string>('');
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);

  useInput((input, key) => {
    if (authStatus === 'timeout') {
      // Any key press in timeout state should trigger cancel to return to auth dialog
      onCancel();
    } else if (key.escape) {
      onCancel();
    }
  });

  // Generate QR code once when device auth is available
  useEffect(() => {
    if (!deviceAuth?.verification_uri_complete) {
      return;
    }

    const generateQR = () => {
      try {
        qrcode.generate(
          deviceAuth.verification_uri_complete,
          { small: true },
          (qrcode: string) => {
            setQrCodeData(qrcode);
          },
        );
      } catch (error) {
        console.error('Failed to generate QR code:', error);
        setQrCodeData(null);
      }
    };

    generateQR();
  }, [deviceAuth?.verification_uri_complete]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          onTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onTimeout]);

  // Animated dots
  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDots((prev) => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(dotsTimer);
  }, []);

  // Memoize the QR code display to prevent unnecessary re-renders
  const qrCodeDisplay = useMemo(() => {
    if (!deviceAuth?.verification_uri_complete) return null;

    return (
      <QrCodeDisplay
        verificationUrl={deviceAuth.verification_uri_complete}
        qrCodeData={qrCodeData}
      />
    );
  }, [deviceAuth?.verification_uri_complete, qrCodeData]);

  // Handle timeout state
  if (authStatus === 'timeout') {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.AccentRed}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold color={Colors.AccentRed}>
          Delta OAuth Authentication Timeout
        </Text>

        <Box marginTop={1}>
          <Text>
            {authMessage ||
              `OAuth token expired (over ${defaultTimeout} seconds). Please select authentication method again.`}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            Press any key to return to authentication type selection.
          </Text>
        </Box>
      </Box>
    );
  }

  // Show loading state when no device auth is available yet
  if (!deviceAuth) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Box>
          <Text>
            <Spinner type="dots" /> Waiting for Delta OAuth authentication...
          </Text>
        </Box>
        <Box marginTop={1} justifyContent="space-between">
          <Text color={Colors.Gray}>
            Time remaining: {Math.floor(timeRemaining / 60)}:
            {(timeRemaining % 60).toString().padStart(2, '0')}
          </Text>
          <Text color={Colors.AccentPurple}>(Press ESC to cancel)</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {/* Static QR Code Display */}
      {qrCodeDisplay}

      {/* Dynamic Status Display */}
      <StatusDisplay timeRemaining={timeRemaining} dots={dots} />
    </Box>
  );
}
