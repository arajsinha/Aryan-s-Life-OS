/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { Domain, DomainWeights } from './types';

export const DOMAINS: Domain[] = ['Work', 'Health', 'Sleep', 'Leisure', 'Relationships'];

export const DEFAULT_WEIGHTS: DomainWeights = {
  Work: 20,
  Health: 20,
  Sleep: 20,
  Leisure: 20,
  Relationships: 20
};

export const DOMAIN_COLORS: Record<Domain, string> = {
  Work: '#3b82f6',
  Health: '#10b981',
  Sleep: '#8b5cf6',
  Leisure: '#f59e0b',
  Relationships: '#ec4899'
};
