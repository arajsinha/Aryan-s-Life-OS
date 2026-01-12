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

// --- NEW: Goal System Types ---
export type GoalType = 'short_term' | 'long_term';
export type GoalCategory = 'Health' | 'Career' | 'Project' | 'Finance' | 'Leisure' | 'Relationships' | 'Other';
export type GoalStatus = 'not_started' | 'in_progress' | 'at_risk' | 'blocked' | 'completed';

export interface GoalMetric {
  name: string;      // e.g., 'Weight', 'Savings', 'Pages Read'
  unit: string;      // e.g., 'kg', 'USD', 'pages'
  current: number;
  target: number;
}


export interface Goal {
  id: string;
  type: GoalType;
  title: string;
  category: GoalCategory;
  description?: string; // The "qualitative why"
  status: GoalStatus;

  // Optional metric for quantifiable goals
  metric?: GoalMetric;

  targetDate?: string; // YYYY-MM-DD
  createdAt: string;   // ISO String
  updatedAt: string;   // ISO String
}
// --- END: Goal System Types ---


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
  // --- NEW: Link to Goals ---
  goalId?: string;
  goalType?: GoalType;
  // --- END: Link to Goals ---
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

// =====================================
// --- NEW: Health & Fitness Types ---
// =====================================

export interface HealthMetric {
  id: string;
  date: string; // YYYY-MM-DD
  weight?: number;
  bodyFat?: number; // Optional
}

export interface FitnessGoal {
  idealWeight: number;
  height: number; // in cm
  targetDate: string; // YYYY-MM-DD
  goalType: 'Weight loss with muscle building' | 'Weight loss' | 'Muscle building';
  tdee: number; // Total Daily Energy Expenditure
}

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
}

export interface AIHealthInsight {
  tdee: number;
  deficit: number;
  metabolicPhase: string; // e.g., "Fat Burning", "Maintenance"
  analysis: string; // Brief summary
}

export interface WorkoutSet {
  reps: number;
  weight: number; // in kg
}

export interface WorkoutExercise {
  id: string;
  name: string;
  idealSets: number;
  idealReps: string; // e.g., "8-12"
  loggedSets: WorkoutSet[];
}

// This replaces the old DailyCalorieLog
export interface DailyFitnessLog {
  date: string; // YYYY-MM-DD
  breakfast: FoodItem[];
  lunch: FoodItem[];
  dinner: FoodItem[];
  steps?: number;
  workoutPlan?: WorkoutExercise[]; // The AI-generated plan for the day
  loggedWorkout?: WorkoutExercise[]; // The user's actual logged workout
  aiInsight?: AIHealthInsight;
}
