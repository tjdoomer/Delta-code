/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Defines valid event metadata keys for Delta logging.
export enum EventMetadataKey {
  DELTA_CLI_KEY_UNKNOWN = 0,

  // ==========================================================================
  // Start Session Event Keys
  // ===========================================================================

  // Logs the model id used in the session.
  DELTA_CLI_START_SESSION_MODEL = 1,

  // Logs the embedding model id used in the session.
  DELTA_CLI_START_SESSION_EMBEDDING_MODEL = 2,

  // Logs the sandbox that was used in the session.
  DELTA_CLI_START_SESSION_SANDBOX = 3,

  // Logs the core tools that were enabled in the session.
  DELTA_CLI_START_SESSION_CORE_TOOLS = 4,

  // Logs the approval mode that was used in the session.
  DELTA_CLI_START_SESSION_APPROVAL_MODE = 5,

  // Logs whether an API key was used in the session.
  DELTA_CLI_START_SESSION_API_KEY_ENABLED = 6,

  // Logs whether the Vertex API was used in the session.
  DELTA_CLI_START_SESSION_VERTEX_API_ENABLED = 7,

  // Logs whether debug mode was enabled in the session.
  DELTA_CLI_START_SESSION_DEBUG_MODE_ENABLED = 8,

  // Logs the MCP servers that were enabled in the session.
  DELTA_CLI_START_SESSION_MCP_SERVERS = 9,

  // Logs whether user-collected telemetry was enabled in the session.
  DELTA_CLI_START_SESSION_TELEMETRY_ENABLED = 10,

  // Logs whether prompt collection was enabled for user-collected telemetry.
  DELTA_CLI_START_SESSION_TELEMETRY_LOG_USER_PROMPTS_ENABLED = 11,

  // Logs whether the session was configured to respect gitignore files.
  DELTA_CLI_START_SESSION_RESPECT_GITIGNORE = 12,

  // ==========================================================================
  // User Prompt Event Keys
  // ===========================================================================

  // Logs the length of the prompt.
  DELTA_CLI_USER_PROMPT_LENGTH = 13,

  // ==========================================================================
  // Tool Call Event Keys
  // ===========================================================================

  // Logs the function name.
  DELTA_CLI_TOOL_CALL_NAME = 14,

  // Logs the user's decision about how to handle the tool call.
  DELTA_CLI_TOOL_CALL_DECISION = 15,

  // Logs whether the tool call succeeded.
  DELTA_CLI_TOOL_CALL_SUCCESS = 16,

  // Logs the tool call duration in milliseconds.
  DELTA_CLI_TOOL_CALL_DURATION_MS = 17,

  // Logs the tool call error message, if any.
  DELTA_CLI_TOOL_ERROR_MESSAGE = 18,

  // Logs the tool call error type, if any.
  DELTA_CLI_TOOL_CALL_ERROR_TYPE = 19,

  // ==========================================================================
  // GenAI API Request Event Keys
  // ===========================================================================

  // Logs the model id of the request.
  DELTA_CLI_API_REQUEST_MODEL = 20,

  // ==========================================================================
  // GenAI API Response Event Keys
  // ===========================================================================

  // Logs the model id of the API call.
  DELTA_CLI_API_RESPONSE_MODEL = 21,

  // Logs the status code of the response.
  DELTA_CLI_API_RESPONSE_STATUS_CODE = 22,

  // Logs the duration of the API call in milliseconds.
  DELTA_CLI_API_RESPONSE_DURATION_MS = 23,

  // Logs the error message of the API call, if any.
  DELTA_CLI_API_ERROR_MESSAGE = 24,

  // Logs the input token count of the API call.
  DELTA_CLI_API_RESPONSE_INPUT_TOKEN_COUNT = 25,

  // Logs the output token count of the API call.
  DELTA_CLI_API_RESPONSE_OUTPUT_TOKEN_COUNT = 26,

  // Logs the cached token count of the API call.
  DELTA_CLI_API_RESPONSE_CACHED_TOKEN_COUNT = 27,

  // Logs the thinking token count of the API call.
  DELTA_CLI_API_RESPONSE_THINKING_TOKEN_COUNT = 28,

  // Logs the tool use token count of the API call.
  DELTA_CLI_API_RESPONSE_TOOL_TOKEN_COUNT = 29,

  // ==========================================================================
  // GenAI API Error Event Keys
  // ===========================================================================

  // Logs the model id of the API call.
  DELTA_CLI_API_ERROR_MODEL = 30,

  // Logs the error type.
  DELTA_CLI_API_ERROR_TYPE = 31,

  // Logs the status code of the error response.
  DELTA_CLI_API_ERROR_STATUS_CODE = 32,

  // Logs the duration of the API call in milliseconds.
  DELTA_CLI_API_ERROR_DURATION_MS = 33,

  // ==========================================================================
  // End Session Event Keys
  // ===========================================================================

  // Logs the end of a session.
  DELTA_CLI_END_SESSION_ID = 34,

  // ==========================================================================
  // Shared Keys
  // ===========================================================================

  // Logs the Prompt Id
  DELTA_CLI_PROMPT_ID = 35,

  // Logs the Auth type for the prompt, api responses and errors.
  DELTA_CLI_AUTH_TYPE = 36,

  // Logs the total number of Google accounts ever used.
  DELTA_CLI_GOOGLE_ACCOUNTS_COUNT = 37,

  // Logs the Surface from where the Delta Code was invoked, eg: VSCode.
  DELTA_CLI_SURFACE = 39,

  // Logs the session id
  DELTA_CLI_SESSION_ID = 40,

  // ==========================================================================
  // Loop Detected Event Keys
  // ===========================================================================

  // Logs the type of loop detected.
  DELTA_CLI_LOOP_DETECTED_TYPE = 38,

  // ==========================================================================
  // Slash Command Event Keys
  // ===========================================================================

  // Logs the name of the slash command.
  DELTA_CLI_SLASH_COMMAND_NAME = 41,

  // Logs the subcommand of the slash command.
  DELTA_CLI_SLASH_COMMAND_SUBCOMMAND = 42,

  // Logs the status of the slash command (e.g. 'success', 'error')
  DELTA_CLI_SLASH_COMMAND_STATUS = 51,

  // ==========================================================================
  // Next Speaker Check Event Keys
  // ===========================================================================

  // Logs the finish reason of the previous streamGenerateContent response
  DELTA_CLI_RESPONSE_FINISH_REASON = 43,

  // Logs the result of the next speaker check
  DELTA_CLI_NEXT_SPEAKER_CHECK_RESULT = 44,

  // ==========================================================================
  // Malformed JSON Response Event Keys
  // ==========================================================================

  // Logs the model that produced the malformed JSON response.
  DELTA_CLI_MALFORMED_JSON_RESPONSE_MODEL = 45,

  // ==========================================================================
  // IDE Connection Event Keys
  // ===========================================================================

  // Logs the type of the IDE connection.
  DELTA_CLI_IDE_CONNECTION_TYPE = 46,

  // Logs AI added lines in edit/write tool response.
  DELTA_CLI_AI_ADDED_LINES = 47,

  // Logs AI removed lines in edit/write tool response.
  DELTA_CLI_AI_REMOVED_LINES = 48,

  // Logs user added lines in edit/write tool response.
  DELTA_CLI_USER_ADDED_LINES = 49,

  // Logs user removed lines in edit/write tool response.
  DELTA_CLI_USER_REMOVED_LINES = 50,

  // ==========================================================================
  // Kitty Sequence Overflow Event Keys
  // ===========================================================================

  // Logs the length of the kitty sequence that overflowed.
  DELTA_CLI_KITTY_SEQUENCE_LENGTH = 53,

  // Logs the truncated kitty sequence.
  DELTA_CLI_KITTY_TRUNCATED_SEQUENCE = 52,
}

export function getEventMetadataKey(
  keyName: string,
): EventMetadataKey | undefined {
  // Access the enum member by its string name
  const key = EventMetadataKey[keyName as keyof typeof EventMetadataKey];

  // Check if the result is a valid enum member (not undefined and is a number)
  if (typeof key === 'number') {
    return key;
  }
  return undefined;
}
