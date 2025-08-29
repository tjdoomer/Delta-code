/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'delta-code';

export const EVENT_USER_PROMPT = 'delta-code.user_prompt';
export const EVENT_TOOL_CALL = 'delta-code.tool_call';
export const EVENT_API_REQUEST = 'delta-code.api_request';
export const EVENT_API_ERROR = 'delta-code.api_error';
export const EVENT_API_RESPONSE = 'delta-code.api_response';
export const EVENT_CLI_CONFIG = 'delta-code.config';
export const EVENT_FLASH_FALLBACK = 'delta-code.flash_fallback';
export const EVENT_NEXT_SPEAKER_CHECK = 'delta-code.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'delta-code.slash_command';
export const EVENT_IDE_CONNECTION = 'delta-code.ide_connection';

export const METRIC_TOOL_CALL_COUNT = 'delta-code.tool.call.count';
export const METRIC_TOOL_CALL_LATENCY = 'delta-code.tool.call.latency';
export const METRIC_API_REQUEST_COUNT = 'delta-code.api.request.count';
export const METRIC_API_REQUEST_LATENCY = 'delta-code.api.request.latency';
export const METRIC_TOKEN_USAGE = 'delta-code.token.usage';
export const METRIC_SESSION_COUNT = 'delta-code.session.count';
export const METRIC_FILE_OPERATION_COUNT = 'delta-code.file.operation.count';
