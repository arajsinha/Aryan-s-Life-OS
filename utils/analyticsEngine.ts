import { Goal, Activity, VelocityMetrics, PredictionMetrics, RiskAnalysis, EffortLevel, VelocityTrend } from '../types';

export const EFFORT_MULTIPLIERS: Record<EffortLevel, number> = {
    'Low': 0.8,
    'Medium': 1.0,
    'High': 1.2,
    'Intense': 1.5
};

/**
 * Calculates the "speed" of goal completion based on recent activity.
 */
export function calculateVelocity(goal: Goal, activities: Activity[]): VelocityMetrics {
    const goalActivities = activities
        .filter(a => a.goalId === goal.id && a.status === 'complete' && a.workCompleted)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // 1. Calculate Required Velocity (%)
    let required = 0;
    if (goal.targetDate && goal.metric) {
        const start = new Date(goal.createdAt).getTime();
        const end = new Date(goal.targetDate).getTime();
        const now = Date.now();

        const totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        const remainingDays = Math.max(1, (end - now) / (1000 * 60 * 60 * 24));
        const remainingWork = Math.max(0, goal.metric.target - goal.metric.current);

        // Required pace per day to hit target
        required = remainingWork / remainingDays;
    }

    // 2. Calculate Actual Velocities (Rolling 7 & 14 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const getWeightedProgress = (acts: Activity[]) => {
        return acts.reduce((sum, act) => {
            const multiplier = act.effortLevel ? EFFORT_MULTIPLIERS[act.effortLevel] : 1.0;
            return sum + (act.workCompleted || 0) * multiplier;
        }, 0);
    };

    const recentActivities = goalActivities.filter(a => new Date(a.date) >= sevenDaysAgo);
    const previousActivities = goalActivities.filter(a => {
        const d = new Date(a.date);
        return d >= fourteenDaysAgo && d < sevenDaysAgo;
    });

    const progressLast7Days = getWeightedProgress(recentActivities);
    const progressPrev7Days = getWeightedProgress(previousActivities);

    const rolling7Day = progressLast7Days / 7;
    const prev7DayVelocity = progressPrev7Days / 7;

    // 3. Determine Trend
    let trend: VelocityTrend = 'stable';
    const velocityDiff = rolling7Day - prev7DayVelocity;
    const threshold = (prev7DayVelocity || 1) * 0.15; // 15% change needed to flag trend

    if (velocityDiff > threshold) trend = 'accelerating';
    else if (velocityDiff < -threshold) trend = 'decelerating';

    return {
        current: rolling7Day, // Use 7-day rolling average as "current" velocity
        required,
        rolling7Day,
        trend
    };
}

/**
 * Predicts the completion date based on current velocity.
 */
export function predictCompletion(goal: Goal, velocity: VelocityMetrics): PredictionMetrics {
    if (!goal.metric || velocity.current <= 0) {
        return {
            completionDate: null,
            daysRemaining: Infinity,
            confidenceInterval: { optimistic: 'Unknown', pessimistic: 'Unknown' }
        };
    }

    const remainingWork = goal.metric.target - goal.metric.current;
    const daysToComplete = remainingWork / velocity.current;

    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysToComplete);

    // Confidence Interval (simple variance based model)
    // If trend is accelerating, optimistic is 20% faster
    // If decelerating, pessimistic is 20% slower
    const optimisticDays = daysToComplete * 0.85;
    const pessimisticDays = daysToComplete * 1.15;

    const optimisticDate = new Date();
    optimisticDate.setDate(optimisticDate.getDate() + optimisticDays);

    const pessimisticDate = new Date();
    pessimisticDate.setDate(pessimisticDate.getDate() + pessimisticDays);

    return {
        completionDate: completionDate.toISOString().split('T')[0],
        daysRemaining: Math.round(daysToComplete),
        confidenceInterval: {
            optimistic: optimisticDate.toISOString().split('T')[0],
            pessimistic: pessimisticDate.toISOString().split('T')[0]
        }
    };
}

/**
 * Assesses risk by comparing Velocity vs Required Pace and Timeline Buffer.
 */
export function assessRisk(goal: Goal, velocity: VelocityMetrics, prediction: PredictionMetrics): RiskAnalysis {
    const reasons: string[] = [];

    // A. Velocity Gap Analysis
    // If no required velocity (no deadline), we skip this check
    const velocityRatio = velocity.required > 0 ? velocity.current / velocity.required : 1.1; // Default to healthy if no deadline

    let level: 'ON_TRACK' | 'AT_RISK' | 'CRITICAL' | 'AHEAD_OF_PACE' = 'ON_TRACK';

    if (velocityRatio < 0.5) {
        level = 'CRITICAL';
        reasons.push(`Current pace (${velocity.current.toFixed(1)}/day) is < 50% of required (${velocity.required.toFixed(1)}/day).`);
    } else if (velocityRatio < 0.85) {
        level = 'AT_RISK';
        reasons.push(`Pace is falling behind (${Math.round(velocityRatio * 100)}% of target).`);
    } else if (velocityRatio > 1.25) {
        level = 'AHEAD_OF_PACE';
    }

    // B. Timeline Buffer Analysis
    if (goal.targetDate && prediction.completionDate) {
        const target = new Date(goal.targetDate).getTime();
        const predicted = new Date(prediction.completionDate).getTime();
        const bufferMs = target - predicted;
        const bufferDays = bufferMs / (1000 * 60 * 60 * 24);

        if (bufferDays < 0) {
            // We are predicted to be late
            if (level !== 'CRITICAL') {
                level = 'AT_RISK';
                reasons.push(`Projected to miss deadline by ${Math.abs(Math.round(bufferDays))} days.`);
            }
        } else if (bufferDays < 7 && level === 'ON_TRACK') {
            level = 'AT_RISK';
            reasons.push("Buffer is tight (< 7 days).");
        }
    }

    // C. Trend Analysis
    if (velocity.trend === 'decelerating') {
        reasons.push("Velocity is trending downward.");
        if (level === 'ON_TRACK') level = 'AT_RISK'; // Downgrade status if slowing down
    }

    return {
        level,
        reasons
    };
}
