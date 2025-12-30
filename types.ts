/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type Domain = 'Work' | 'Health' | 'Sleep' | 'Leisure' | 'Relationships';

export interface DomainWeights {
  Work: number;
  Health: number;
  Sleep: number;
  Leisure: number;
  Relationships: number;
}

export type ActivityStatus = 'planned' | 'complete' | 'partial' | 'cancel' | 'missed';

export interface Activity {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  actualStartTime?: string; // For partial status
  actualEndTime?: string;   // For partial status
  domain: Domain;
  status: ActivityStatus;
  date: string;      // YYYY-MM-DD
  intent?: string;   // AI's reasoning for classification
}

export interface LifePeriod {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  weights: DomainWeights;
}

export interface Artifact {
  id: string;
  html: string;
  status: 'streaming' | 'complete' | 'error';
  styleName: string;
}
