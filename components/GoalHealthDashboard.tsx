import React, { useMemo } from 'react';
import { Goal, Activity } from '../types';
import { calculateVelocity, predictCompletion, assessRisk } from '../utils/analyticsEngine';
import { GoalVelocityCard } from './GoalVelocityCard';

interface GoalHealthDashboardProps {
    goals: Goal[];
    activities: Activity[];
    onClose: () => void;
}

export const GoalHealthDashboard: React.FC<GoalHealthDashboardProps> = ({ goals, activities, onClose }) => {

    // Compute analytics for all goals
    const analyzedGoals = useMemo(() => {
        return goals
            .filter(g => g.metric) // Only quantifiable goals
            .map(goal => {
                const velocity = calculateVelocity(goal, activities);
                const prediction = predictCompletion(goal, velocity);
                const risk = assessRisk(goal, velocity, prediction);
                return { goal, velocity, prediction, risk };
            })
            .sort((a, b) => {
                // Sort by Risk Level (CRITICAL > AT_RISK > ON_TRACK > AHEAD)
                const riskScore = { 'CRITICAL': 3, 'AT_RISK': 2, 'ON_TRACK': 1, 'AHEAD_OF_PACE': 0 };
                return riskScore[b.risk.level] - riskScore[a.risk.level];
            });
    }, [goals, activities]);

    if (analyzedGoals.length === 0) {
        return (
            <div className="goal-health-dashboard" style={{ padding: '20px', color: '#fff' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h2>Goal Health & Analytics</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                </header>
                <p>No quantifiable goals found. Add a goal with a target metric to see analytics.</p>
            </div>
        );
    }

    return (
        <div className="goal-health-dashboard custom-scroll" style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            background: '#0a0a0a', zIndex: 100, padding: '20px', overflowY: 'auto'
        }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <div>
                    <h2 style={{ margin: 0, color: '#fff' }}>Mission Control</h2>
                    <p style={{ margin: '5px 0 0', color: '#888', fontSize: '0.9rem' }}>Predictive analysis of your active goals</p>
                </div>
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer' }}>×</button>
            </header>

            <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {analyzedGoals.map(data => (
                    <GoalVelocityCard
                        key={data.goal.id}
                        goal={data.goal}
                        velocity={data.velocity}
                        prediction={data.prediction}
                        risk={data.risk}
                    />
                ))}
            </div>
        </div>
    );
};
