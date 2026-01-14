import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { DailyFitnessLog, HealthMetric, FitnessGoal } from '../types';

interface FitnessHistoryDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    fitnessGoal: FitnessGoal | null;
}

interface DailySummary {
    date: string;
    log?: DailyFitnessLog;
    metric?: HealthMetric;
}

export const FitnessHistoryDashboard: React.FC<FitnessHistoryDashboardProps> = ({ isOpen, onClose, userId, fitnessGoal }) => {
    const [historyData, setHistoryData] = useState<DailySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && userId) {
            fetchAllHistory();
        }
    }, [isOpen, userId]);

    const fetchAllHistory = async () => {
        setLoading(true);
        try {
            // 1. Fetch Daily Logs
            const logsRef = collection(db, 'users', userId, 'dailyFitnessLogs');
            const logsQuery = query(logsRef, limit(60)); // Pull last 60 days
            const logsSnap = await getDocs(logsQuery);
            const logs = logsSnap.docs.map(d => d.data() as DailyFitnessLog);

            // 2. Fetch Health Metrics (Weight)
            // Note: healthMetrics are usually stored in the user doc array, but usually we pass them down.
            // However, to ensure we have *all* history, let's look at the user doc if not passed, 
            // OR we can assume `logs` are the primary source of truth for the timeline.
            // For now, let's fetch the user document again to get the latest healthMetrics array if needed
            // OR better, rely on the passed prop if we change the API. 
            // But adhering to the plan, we will fetch aggregates. 
            // Let's grab the user doc to be safe and get ALL metrics.
            const userDocRef = doc(db, 'users', userId);
            const userDocSnap = await getDoc(userDocRef);
            const userData = userDocSnap.data();
            const metrics = (userData?.healthMetrics || []) as HealthMetric[];

            // 3. Merge Data by Date
            const dateMap = new Map<string, DailySummary>();

            // Populate with logs
            logs.forEach(log => {
                dateMap.set(log.date, { date: log.date, log });
            });

            // Populate with metrics
            metrics.forEach(m => {
                const existing = dateMap.get(m.date) || { date: m.date };
                dateMap.set(m.date, { ...existing, metric: m });
            });

            // Sort by Date Descending
            const sortedHistory = Array.from(dateMap.values()).sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            setHistoryData(sortedHistory);
        } catch (error) {
            console.error("Error fetching full history:", error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="os-overlay-blur" style={{ zIndex: 1000, background: 'rgba(0,0,0,0.85)' }}>
            <div className="fitness-history-dashboard custom-scroll" style={{
                position: 'fixed', inset: 0, background: '#0a0a0a', display: 'flex', flexDirection: 'column'
            }}>

                {/* Header */}
                <header style={{
                    padding: '20px 30px', borderBottom: '1px solid var(--border)',
                    background: 'rgba(20,20,20,0.95)', backdropFilter: 'blur(10px)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    position: 'sticky', top: 0, zIndex: 10
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Fitness Journey</h2>
                        <p style={{ margin: '4px 0 0', color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                            Your complete timeline of workouts, nutrition, and biometrics.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: '#fff',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    >
                        ✕
                    </button>
                </header>

                {/* Content */}
                <div style={{ flex: 1, padding: '30px', maxWidth: '800px', margin: '0 auto', width: '100%', overflowY: 'auto' }}>

                    {loading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading your history...</div>
                    ) : historyData.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>No history found yet. Start logging!</div>
                    ) : (
                        <div className="history-timeline">
                            {historyData.map((day, index) => {
                                const isExpanded = expandedDay === day.date;
                                const totalCals = (day.log?.breakfast?.reduce((s, i) => s + i.calories, 0) || 0) +
                                    (day.log?.lunch?.reduce((s, i) => s + i.calories, 0) || 0) +
                                    (day.log?.dinner?.reduce((s, i) => s + i.calories, 0) || 0);

                                const hasWorkout = day.log?.loggedWorkout && day.log.loggedWorkout.length > 0;
                                const steps = day.log?.steps || 0;
                                const weight = day.metric?.weight;
                                const tdee = day.log?.aiInsight?.tdee || fitnessGoal?.tdee || 2000;

                                const dateObj = new Date(day.date);
                                const isToday = day.date === new Date().toISOString().split('T')[0];

                                return (
                                    <div key={day.date} className="timeline-day" style={{ marginBottom: '24px', position: 'relative', paddingLeft: '30px' }}>

                                        {/* Timeline Line */}
                                        <div style={{
                                            position: 'absolute', left: '7px', top: '2px', bottom: '-24px',
                                            width: '2px', background: 'var(--border)',
                                            display: index === historyData.length - 1 ? 'none' : 'block'
                                        }} />

                                        {/* Timestamp Dot */}
                                        <div style={{
                                            position: 'absolute', left: '0', top: '6px',
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            background: isToday ? 'var(--accent)' : 'var(--border)',
                                            border: '3px solid #0a0a0a'
                                        }} />

                                        {/* Day Card */}
                                        <div
                                            className="glass-card"
                                            onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                                            style={{
                                                padding: '16px 20px',
                                                cursor: 'pointer',
                                                borderColor: isToday ? 'rgba(59, 130, 246, 0.4)' : 'var(--border)',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {/* Summary Row */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                                        {isToday && <span style={{ fontSize: '0.7rem', background: 'var(--accent)', color: 'black', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>TODAY</span>}
                                                    </h3>
                                                </div>
                                                <div style={{ display: 'flex', gap: '16px', fontSize: '0.9rem', color: 'var(--text-dim)' }}>
                                                    {weight && <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{weight} kg</span>}
                                                    {hasWorkout && <span style={{ color: '#fbbf24' }}>🏋️‍♂️ Workout</span>}
                                                    {totalCals > 0 && <span style={{ color: totalCals > tdee ? '#ef4444' : '#10b981' }}>{totalCals} kcal</span>}
                                                </div>
                                            </div>

                                            {/* Expanded Details */}
                                            {isExpanded && (
                                                <div style={{ marginTop: '20px', borderTop: '1px solid var(--border)', paddingTop: '20px' }}>

                                                    {/* Metrics Grid */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '12px', marginBottom: '24px' }}>
                                                        <MetricBox label="Steps" value={steps > 0 ? steps.toLocaleString() : '-'} icon="👣" />
                                                        <MetricBox label="Calories" value={`${totalCals} / ${tdee}`} icon="🔥" active={totalCals > 0} />
                                                        <MetricBox label="Weight" value={weight ? `${weight} kg` : '-'} icon="⚖️" active={!!weight} />
                                                    </div>

                                                    {/* Workouts */}
                                                    {hasWorkout && (
                                                        <div style={{ marginBottom: '24px' }}>
                                                            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workout Session</h4>
                                                            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px' }}>
                                                                {day.log!.loggedWorkout!.map((ex, i) => (
                                                                    <div key={i} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: i === day.log!.loggedWorkout!.length - 1 ? 'none' : '1px solid var(--border)' }}>
                                                                        <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{ex.name}</div>
                                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                                                            {ex.loggedSets?.map((s, idx) => (
                                                                                <span key={idx} style={{ marginRight: '10px' }}>
                                                                                    {s.weight}kg x {s.reps}
                                                                                </span>
                                                                            )) || <span style={{ fontStyle: 'italic' }}>No sets logged</span>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Food Log */}
                                                    {totalCals > 0 && (
                                                        <div>
                                                            <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nutrition Log</h4>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                                                                <MealColumn title="Breakfast" items={day.log?.breakfast} />
                                                                <MealColumn title="Lunch" items={day.log?.lunch} />
                                                                <MealColumn title="Dinner" items={day.log?.dinner} />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!hasWorkout && totalCals === 0 && !weight && steps === 0 && (
                                                        <p style={{ textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic', margin: '20px 0' }}>
                                                            No detailed logs for this day.
                                                        </p>
                                                    )}

                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const MetricBox = ({ label, value, icon, active = false }: { label: string, value: string, icon: string, active?: boolean }) => (
    <div style={{
        background: active ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
        padding: '12px', borderRadius: '12px', border: '1px solid var(--border)'
    }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '4px' }}>{icon} {label}</div>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>{value}</div>
    </div>
);

const MealColumn = ({ title, items }: { title: string, items?: any[] }) => (
    <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{title}</div>
        {items && items.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {items.map((item, i) => (
                    <div key={i} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.name}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{item.calories}</span>
                    </div>
                ))}
            </div>
        ) : (
            <span style={{ fontSize: '0.8rem', color: '#444', fontStyle: 'italic' }}>-</span>
        )}
    </div>
);
