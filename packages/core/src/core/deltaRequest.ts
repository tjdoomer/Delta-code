/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PartListUnion,
} from '../types/delta.js';
import { partToString } from '../utils/partUtils.js';

/**
 * Represents a request to be sent to the API.
 * For now, it's an alias to PartListUnion as the primary content.
 * This can be expanded later to include other request parameters.
 */
export type DeltaCodeRequest = PartListUnion;

export function partListUnionToString(value: PartListUnion): string {
  return partToString(value, { verbose: true });
}
