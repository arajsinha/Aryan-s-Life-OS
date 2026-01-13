import React from 'react';
import { Goal, VelocityMetrics, PredictionMetrics, RiskAnalysis } from '../types';

interface GoalVelocityCardProps {
    goal: Goal;
    velocity: VelocityMetrics;
    prediction: PredictionMetrics;
    risk: RiskAnalysis;
}

const RISK_COLORS = {
    'ON_TRACK': '#10b981', // green-500
    'AHEAD_OF_PACE': '#3b82f6', // blue-500
    'AT_RISK': '#f59e0b', // amber-500
    'CRITICAL': '#ef4444' // red-500
};

export const GoalVelocityCard: React.FC<GoalVelocityCardProps> = ({ goal, velocity, prediction, risk }) => {
    if (!goal.metric) return null; // Only for quantifiable goals

    const progressPercent = Math.min(100, Math.max(0, (goal.metric.current / goal.metric.target) * 100));
    const statusColor = RISK_COLORS[risk.level] || '#fff';

    return (
        <div className="goal-velocity-card" style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${statusColor}44`,
            borderRadius: '16px',
            padding: '16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>{goal.title}</h3>
                    <span style={{ fontSize: '0.8rem', color: statusColor, fontWeight: 'bold' }}>
                        {risk.level.replace(/_/g, ' ')}
                    </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#aaa' }}>Velocity</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {velocity.current.toFixed(1)} <span style={{ fontSize: '0.7em' }}>per day</span>
                    </div>
                    {velocity.trend !== 'stable' && (
                        <div style={{ fontSize: '0.7rem', color: velocity.trend === 'accelerating' ? '#10b981' : '#ef4444' }}>
                            {velocity.trend === 'accelerating' ? '▲ Accelerating' : '▼ Decelerating'}
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Bar with "Pace" Context */}
            <div className="velocity-progress-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px', color: '#aaa' }}>
                    <span>Progress: {progressPercent.toFixed(0)}%</span>
                    <span>Target: {goal.metric.target} {goal.metric.unit}</span>
                </div>
                <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{
                        width: `${progressPercent}%`,
                        background: statusColor, // Dynamic color based on risk
                        height: '100%',
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>

            {/* Prediction Banner */}
            <div style={{
                background: 'rgba(0,0,0,0.3)',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                <span style={{ fontSize: '1.2rem' }}>🎯</span>
                <div>
                    {prediction.completionDate ? (
                        <>
                            <div>Est. Completion: <span style={{ color: '#fff', fontWeight: 'bold' }}>{prediction.completionDate}</span></div>
                            <div style={{ fontSize: '0.75rem', color: '#888' }}>
                                Range: {prediction.confidenceInterval.optimistic} — {prediction.confidenceInterval.pessimistic}
                            </div>
                        </>
                    ) : (
                        <div style={{ color: '#888' }}>Insufficient data to predict completion</div>
                    )}
                </div>
            </div>

            {/* Risk Reasons (if any) */}
            {risk.reasons.length > 0 && (
                <div style={{ fontSize: '0.8rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '8px', borderRadius: '6px' }}>
                    <strong>⚠️ Attention Needed:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {risk.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                </div>
            )}
        </div>
    );
};
