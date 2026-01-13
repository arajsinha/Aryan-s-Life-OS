import React, { useState } from 'react';
import { Activity, Goal, EffortLevel } from '../types';

interface ActivityCompletionModalProps {
    activity: Activity;
    goal?: Goal; // The linked goal
    onSubmit: (data: { effortLevel: EffortLevel; workCompleted: number; notes: string }) => void;
    onCancel: () => void;
}

const EFFORT_LEVELS: EffortLevel[] = ['Low', 'Medium', 'High', 'Intense'];

export const ActivityCompletionModal: React.FC<ActivityCompletionModalProps> = ({ activity, goal, onSubmit, onCancel }) => {
    const [effort, setEffort] = useState<EffortLevel>('Medium');
    const [workCompleted, setWorkCompleted] = useState<string>('');
    const [notes, setNotes] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            effortLevel: effort,
            workCompleted: Number(workCompleted) || 0,
            notes
        });
    };

    return (
        <div className="os-overlay-blur" style={{ zIndex: 200 }}>
            <div className="activity-completion-modal" style={{
                background: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '24px', width: '90%', maxWidth: '400px'
            }}>
                <h3 style={{ margin: '0 0 16px', color: '#fff' }}>Log Progress</h3>

                <div style={{ marginBottom: '16px', fontSize: '0.9rem', color: '#aaa' }}>
                    Activity: <strong style={{ color: '#fff' }}>{activity.name}</strong><br />
                    Linked Goal: <strong style={{ color: '#8b5cf6' }}>{goal?.title || 'Unknown Goal'}</strong>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', color: '#ccc', marginBottom: '8px', fontSize: '0.85rem' }}>Effort / Intensity</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {EFFORT_LEVELS.map(level => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setEffort(level)}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        background: effort === level ? '#8b5cf6' : '#333',
                                        color: effort === level ? '#fff' : '#aaa',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                        <label style={{ display: 'block', color: '#ccc', marginBottom: '8px', fontSize: '0.85rem' }}>
                            Progress Made {goal?.metric ? `(${goal.metric.unit})` : '(Units)'}
                        </label>
                        <input
                            type="number"
                            placeholder="e.g. 10"
                            value={workCompleted}
                            onChange={e => setWorkCompleted(e.target.value)}
                            className="form-input"
                            style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px' }}
                            required
                        />
                        {goal?.metric && (
                            <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                                Last known: {goal.metric.current} / Target: {goal.metric.target}
                            </div>
                        )}
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', color: '#ccc', marginBottom: '8px', fontSize: '0.85rem' }}>Notes (Optional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="form-textarea"
                            style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #333', color: '#fff', borderRadius: '6px', minHeight: '60px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={onCancel} className="btn-secondary" style={{ padding: '10px 16px', borderRadius: '8px', background: 'transparent', border: '1px solid #444', color: '#ccc' }}>Skip Log</button>
                        <button type="submit" className="btn-primary" style={{ padding: '10px 20px', borderRadius: '8px', background: '#fff', color: '#000', border: 'none', fontWeight: 'bold' }}>Save Progress</button>
                    </div>
                </form>
            </div>
        </div>
    );
};
