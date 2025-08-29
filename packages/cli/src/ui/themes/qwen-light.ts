/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { lightSemanticColors } from './semantic-tokens.js';

const deltaLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f8f9fa',
  Foreground: '#5c6166',
  LightBlue: '#55b4d4',
  AccentBlue: '#399ee6',
  AccentPurple: '#a37acc',
  AccentCyan: '#4cbf99',
  AccentGreen: '#86b300',
  AccentYellow: '#f2ae49',
  AccentRed: '#f07171',
  DiffAdded: '#86b300',
  DiffRemoved: '#f07171',
  Comment: '#ABADB1',
  Gray: '#CCCFD3',
  GradientColors: ['#399ee6', '#86b300'],
};

export const DeltaLight: Theme = new Theme(
  'Delta Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: deltaLightColors.Background,
      color: deltaLightColors.Foreground,
    },
    'hljs-comment': {
      color: deltaLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: deltaLightColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: deltaLightColors.AccentGreen,
    },
    'hljs-constant': {
      color: deltaLightColors.AccentCyan,
    },
    'hljs-number': {
      color: deltaLightColors.AccentPurple,
    },
    'hljs-keyword': {
      color: deltaLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: deltaLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: deltaLightColors.AccentYellow,
    },
    'hljs-variable': {
      color: deltaLightColors.Foreground,
    },
    'hljs-variable.language': {
      color: deltaLightColors.LightBlue,
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: deltaLightColors.AccentBlue,
    },
    'hljs-section': {
      color: deltaLightColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: deltaLightColors.LightBlue,
    },
    'hljs-class .hljs-title': {
      color: deltaLightColors.AccentBlue,
    },
    'hljs-tag': {
      color: deltaLightColors.LightBlue,
    },
    'hljs-name': {
      color: deltaLightColors.AccentBlue,
    },
    'hljs-builtin-name': {
      color: deltaLightColors.AccentYellow,
    },
    'hljs-meta': {
      color: deltaLightColors.AccentYellow,
    },
    'hljs-symbol': {
      color: deltaLightColors.AccentRed,
    },
    'hljs-bullet': {
      color: deltaLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: deltaLightColors.AccentCyan,
    },
    'hljs-link': {
      color: deltaLightColors.LightBlue,
    },
    'hljs-deletion': {
      color: deltaLightColors.AccentRed,
    },
    'hljs-addition': {
      color: deltaLightColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: deltaLightColors.AccentCyan,
    },
    'hljs-built_in': {
      color: deltaLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: deltaLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: deltaLightColors.AccentCyan,
    },
    'hljs-selector-id': {
      color: deltaLightColors.AccentRed,
    },
  },
  deltaLightColors,
  lightSemanticColors,
);
