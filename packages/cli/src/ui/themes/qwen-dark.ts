/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';
import { darkSemanticColors } from './semantic-tokens.js';

const deltaDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0b0e14',
  Foreground: '#bfbdb6',
  LightBlue: '#59C2FF',
  AccentBlue: '#39BAE6',
  AccentPurple: '#D2A6FF',
  AccentCyan: '#95E6CB',
  AccentGreen: '#AAD94C',
  AccentYellow: '#FFD700',
  AccentRed: '#F26D78',
  DiffAdded: '#AAD94C',
  DiffRemoved: '#F26D78',
  Comment: '#646A71',
  Gray: '#3D4149',
  GradientColors: ['#FFD700', '#da7959'],
};

export const DeltaDark: Theme = new Theme(
  'Delta Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: deltaDarkColors.Background,
      color: deltaDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: deltaDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: deltaDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: deltaDarkColors.LightBlue,
    },
    'hljs-link': {
      color: deltaDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: deltaDarkColors.Foreground,
    },
    'hljs-string': {
      color: deltaDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: deltaDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: deltaDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: deltaDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: deltaDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: deltaDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: deltaDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: deltaDarkColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  deltaDarkColors,
  darkSemanticColors,
);
