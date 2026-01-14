import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, documentId } from 'firebase/firestore';
import { HealthMetric, FitnessGoal, DailyFitnessLog, FoodItem, WorkoutExercise, WorkoutSet } from '../types';
import { haptic } from '../utils/haptics';

interface FitnessPanelProps {
  isOpen: boolean;
  onClose: () => void;
  healthMetrics: HealthMetric[];
  addHealthMetric: (metric: { weight: number }) => void;
  fitnessGoal: FitnessGoal | null;
  dailyLog: DailyFitnessLog | null;
  onAddFoodItem: (meal: 'breakfast' | 'lunch' | 'dinner', foodText: string) => void;
  onUpdateSteps: (steps: number) => void;
  onUpdateWorkout: (workout: WorkoutExercise[]) => void;
  onGenerateInsight: () => void;
  onUpdateFitnessGoal: (goal: FitnessGoal) => void;
  onDeleteFoodItem: (meal: 'breakfast' | 'lunch' | 'dinner', itemId: string) => void;
  onEditFoodItem: (
    meal: 'breakfast' | 'lunch' | 'dinner',
    itemId: string,
    newText: string
  ) => void;
  userId: string;
}

// ...

// Main Panel Component
const FitnessPanel: React.FC<FitnessPanelProps> = (props) => {
  const [view, setView] = useState<'dashboard' | 'workout' | 'history'>('dashboard');

  if (!props.isOpen) {
    return null;
  }

  const navigateToWorkout = () => {
    haptic.light();
    setView('workout');
  };

  const navigateToHistory = () => {
    haptic.light();
    setView('history');
  }

  const navigateToDashboard = () => {
    haptic.light();
    setView('dashboard');
  }

  return (
    <div className="os-overlay-blur" onClick={props.onClose}>
      <div className="goals-panel fitness-panel-wide" onClick={e => e.stopPropagation()}>
        <header className="panel-header">
          <h2>
            {view === 'dashboard' ? 'Fitness & Health Hub' :
              view === 'workout' ? 'Workout Logger' : 'History & Analysis'}
          </h2>
          <button onClick={props.onClose}>&times;</button>
        </header>

        <div className="panel-content custom-scroll">
          {view === 'dashboard' && (
            <DashboardView
              {...props}
              onNavigateToWorkout={navigateToWorkout}
              onNavigateToHistory={navigateToHistory}
            />
          )}
          {view === 'workout' && <WorkoutView {...props} onBack={navigateToDashboard} />}
          {view === 'history' && (
            <FitnessHistoryView
              onBack={navigateToDashboard}
              userId={props.userId}
              fitnessGoal={props.fitnessGoal}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ADD THIS NEW COMPONENT
const FitnessGoalHeader: React.FC<{
  fitnessGoal: FitnessGoal | null;
  healthMetrics: HealthMetric[];
  dailyLog: DailyFitnessLog | null;
  onUpdateGoal: (goal: FitnessGoal) => void;
  addHealthMetric: (metric: { weight: number }) => void;
  // onUpdateSteps: (steps: number) => void;
}> = ({ fitnessGoal, healthMetrics, dailyLog, onUpdateGoal, addHealthMetric }) => {
  const [isEditing, setIsEditing] = useState(false);

  const [goalForm, setGoalForm] = useState(fitnessGoal);
  const [newWeightInput, setNewWeightInput] = useState('');
  const [stepsInput, setStepsInput] = useState(dailyLog?.steps?.toString() || '');

  // useEffect(() => { setGoalForm(fitnessGoal) }, [fitnessGoal]);
  // useEffect(() => { setStepsInput(dailyLog?.steps?.toString() || '0') }, [dailyLog?.steps]);

  const latestWeight = healthMetrics[0]?.weight || 0;

  const handleGoalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setGoalForm(prev => prev ? { ...prev, [name]: value } : null);
  };

  const handleSave = () => {
    if (goalForm) {
      onUpdateGoal({
        ...goalForm,
        height: Number(goalForm.height),
        idealWeight: Number(goalForm.idealWeight),
        tdee: Number(goalForm.tdee),
      });
    }
    if (newWeightInput) {
      const weightValue = parseFloat(newWeightInput);
      if (!isNaN(weightValue) && weightValue > 0) {
        addHealthMetric({ weight: weightValue });
      }
    }
    setIsEditing(false);
    setNewWeightInput('');
    haptic.success();
  };

  if (!fitnessGoal) return null;

  return (
    <div className="fitness-goal-header">
      <div className="header-metrics-grid">
        <div className="goal-metric">
          <span>Current Wt.</span>
          {isEditing ? (<input type="number" value={newWeightInput} onChange={e => setNewWeightInput(e.target.value)} placeholder={`${latestWeight || '--'} kg`} />) : (<strong>{latestWeight > 0 ? `${latestWeight} kg` : '--'}</strong>)}
        </div>
        <div className="goal-metric">
          <span>Ideal Wt.</span>
          {isEditing ? (<input type="number" name="idealWeight" value={goalForm?.idealWeight || ''} onChange={handleGoalChange} />) : (<strong>{fitnessGoal.idealWeight} kg</strong>)}
        </div>
        <div className="goal-metric">
          <span>Height</span>
          {isEditing ? (<input type="number" name="height" value={goalForm?.height || ''} onChange={handleGoalChange} />) : (<strong>{fitnessGoal.height} cm</strong>)}
        </div>
        <div className="goal-metric">
          <span>Target Date</span>
          {isEditing ? (<input type="date" name="targetDate" value={goalForm?.targetDate || ''} onChange={handleGoalChange} />) : (<strong>{fitnessGoal.targetDate}</strong>)}
        </div>
      </div>

      <div className="header-actions">
        {isEditing ? (
          <>
            <button className="btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
            <button className="btn-primary" onClick={handleSave}>Save</button>
          </>
        ) : (<button className="btn-secondary" onClick={() => setIsEditing(true)}>Edit</button>)}
      </div>
    </div>
  );
};




// Dashboard View Component
const DashboardView: React.FC<FitnessPanelProps & { onNavigateToWorkout: () => void; onNavigateToHistory: () => void }> = ({
  healthMetrics,
  addHealthMetric,
  fitnessGoal,
  dailyLog,
  onAddFoodItem,
  onDeleteFoodItem,
  onEditFoodItem,
  onUpdateSteps,
  onGenerateInsight,
  onNavigateToWorkout,
  onUpdateFitnessGoal,
  onNavigateToHistory
}) => {
  const workoutStatus = getWorkoutCompletionStatus(dailyLog?.workoutPlan);
  const [weightInput, setWeightInput] = useState('');
  const [breakfastInput, setBreakfastInput] = useState('');
  const [lunchInput, setLunchInput] = useState('');
  const [dinnerInput, setDinnerInput] = useState('');
  const [stepsInput, setStepsInput] = useState(dailyLog?.steps?.toString() || ''); // <-- ADD THIS


  const handleClearSteps = () => {
    onUpdateSteps(0);
    setStepsInput('0');
    haptic.light();
  };


  const workoutStatusText = {
    COMPLETED: 'Workout Completed',
    PARTIAL: 'Workout Partially Done',
    NOT_DONE: 'Workout Not Done',
  }[workoutStatus];


  useEffect(() => { // <-- ADD THIS
    setStepsInput(dailyLog?.steps?.toString() || '0');
  }, [dailyLog?.steps]);

  const handleUpdateSteps = () => {
    const stepsValue = parseInt(String(stepsInput), 10);
    if (!isNaN(stepsValue) && stepsValue >= 0) {
      onUpdateSteps(stepsValue);
      haptic.success();
    } else {
      haptic.error();
    }
  };


  useEffect(() => {
    setStepsInput(dailyLog?.steps || '');
  }, [dailyLog?.steps]);

  const handleAddWeight = () => {
    const weightValue = parseFloat(weightInput);
    if (!isNaN(weightValue) && weightValue > 0) {
      addHealthMetric({ weight: weightValue });
      setWeightInput('');
      haptic.success();
    } else {
      haptic.error();
    }
  };

  const latestWeight = healthMetrics
    .filter(m => m.weight !== undefined)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.weight || 0;

  const totalCalories = (dailyLog?.breakfast?.reduce((sum, item) => sum + item.calories, 0) || 0) +
    (dailyLog?.lunch?.reduce((sum, item) => sum + item.calories, 0) || 0) +
    (dailyLog?.dinner?.reduce((sum, item) => sum + item.calories, 0) || 0);

  const calorieTarget = dailyLog?.aiInsight?.calorieTarget || fitnessGoal?.tdee || 2000;
  const calorieProgress = (totalCalories / calorieTarget) * 100;

  return (
    <>
      {/* --- AI Insight Bars --- */}
      <div className="ai-insight-section">
        {dailyLog?.aiInsight ? (
          <div className="ai-insight-bar metabolic-status-card">
            <div className="insight-label">Daily Metabolic Status</div>
            <div className="insight-main-stat">
              <span className="stat-label">TDEE: </span>
              <span className="stat-value">{dailyLog.aiInsight.tdee} <small>kcal</small></span>
            </div>
            <div className="insight-main-stat">
              <span className="stat-label">Deficit: </span>
              <span className="stat-value" style={{ color: dailyLog.aiInsight.deficit > 0 ? '#10b981' : '#ef4444' }}>
                {dailyLog.aiInsight.deficit > 0 ? '-' : '+'}{Math.abs(dailyLog.aiInsight.deficit)} <small>kcal</small>
              </span>
            </div>
            <div className="insight-phase">{dailyLog.aiInsight.metabolicPhase}</div>
            <div className="insight-sub">{dailyLog.aiInsight.analysis}</div>
          </div>
        ) : (
          <div className="ai-insight-bar placeholder-insight">
            <div className="insight-label">Metabolic Analysis</div>
            <div className="insight-sub">Log your workout & steps to see your metabolic status.</div>
          </div>
        )}

        <div className="action-row">
          <button className='btn-primary full-width' onClick={onNavigateToWorkout}>
            Log Workout
          </button>

          <div className="secondary-actions-row" style={{ display: 'flex', gap: '10px' }}>
            <button className='btn-secondary' style={{ flex: 1 }} onClick={onNavigateToHistory}>View History</button>
            {/* Only show Analyze button if we have data but no insight yet, or if user wants to refresh */}
            {(dailyLog?.steps || (dailyLog?.loggedWorkout && dailyLog.loggedWorkout.length > 0)) && (
              <button className='btn-secondary' style={{ flex: 1 }} onClick={onGenerateInsight}>Analyze Today</button>
            )}
          </div>
        </div>

        <div className="ai-insight-bar calorie-bar" style={{ marginTop: '20px' }}>
          <div className="insight-label">Calorie Tracker</div>
          <div className="insight-value">{totalCalories} / <span>{Math.round(calorieTarget)} kcal</span></div>
          <div className="calorie-progress-track">
            <div
              className="calorie-progress-fill"
              style={{
                width: `${Math.min(calorieProgress, 100)}%`,
                background: totalCalories > calorieTarget ? 'linear-gradient(90deg, #f97316, #fb923c)' : 'linear-gradient(90deg, #10b981, #34d399)'
              }}
            ></div>
          </div>
        </div>
      </div>

      {/* --- Loggers --- */}
      {/* The new header goes at the top of the dashboard */}
      <FitnessGoalHeader
        fitnessGoal={fitnessGoal}
        healthMetrics={healthMetrics}
        onUpdateGoal={onUpdateFitnessGoal}
        addHealthMetric={addHealthMetric}
      />


      <div className="loggers-container">
        <div className="calorie-logger">
          <MealSection
            title="Breakfast"
            mealKey="breakfast"
            items={dailyLog?.breakfast || []}
            input={breakfastInput}
            setInput={setBreakfastInput}
            onAdd={() => {
              onAddFoodItem('breakfast', breakfastInput);
              setBreakfastInput('');
            }}
            onDelete={(id) => onDeleteFoodItem('breakfast', id)}
            onEdit={(id, text) => onEditFoodItem('breakfast', id, text)}
          />

          <MealSection
            title="Lunch"
            mealKey="lunch"
            items={dailyLog?.lunch || []}
            input={lunchInput}
            setInput={setLunchInput}
            onAdd={() => {
              onAddFoodItem('lunch', lunchInput);
              setLunchInput('');
            }}
            onDelete={(id) => onDeleteFoodItem('lunch', id)}
            onEdit={(id, text) => onEditFoodItem('lunch', id, text)}
          />

          <MealSection
            title="Dinner"
            mealKey="dinner"
            items={dailyLog?.dinner || []}
            input={dinnerInput}
            setInput={setDinnerInput}
            onAdd={() => {
              onAddFoodItem('dinner', dinnerInput);
              setDinnerInput('');
            }}
            onDelete={(id) => onDeleteFoodItem('dinner', id)}
            onEdit={(id, text) => onEditFoodItem('dinner', id, text)}
          />

        </div>

        <div className="weight-logger-column">
          <div className="sub-logger-box"> {/* ADD THIS ENTIRE BOX */}
            <h4>Daily Steps</h4>
            <div className="steps-input-group">
              <input
                type="number"
                value={stepsInput}
                onChange={e => setStepsInput(e.target.value)}
                placeholder="e.g., 10000"
              />
              <button onClick={handleUpdateSteps}>LOG</button>
              <button className="btn-danger" onClick={handleClearSteps}>
                CLEAR
              </button>
            </div>

          </div>
          <div className="sub-logger-box">
            <h4>Weight History</h4>
            <div className="weight-history">
              <ul className="metric-list">
                {healthMetrics.slice(0, 7).map(metric => (
                  <li key={metric.id}><span>{metric.date}</span><strong>{metric.weight} kg</strong></li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

    </>
  );
}

type WorkoutCompletionStatus = 'COMPLETED' | 'PARTIAL' | 'NOT_DONE';

function getWorkoutCompletionStatus(
  workoutPlan?: WorkoutExercise[]
): WorkoutCompletionStatus {
  if (!workoutPlan || workoutPlan.length === 0) return 'NOT_DONE';

  let totalExpectedSets = 0;
  let totalLoggedSets = 0;

  for (const ex of workoutPlan) {
    totalExpectedSets += ex.idealSets || 0;
    totalLoggedSets += ex.loggedSets?.length || 0;
  }

  if (totalLoggedSets === 0) return 'NOT_DONE';
  if (totalLoggedSets >= totalExpectedSets) return 'COMPLETED';

  return 'PARTIAL';
}


const WORKOUT_STORAGE_KEY = 'lifeos_active_workout';

// Workout View Component
const WorkoutView: React.FC<FitnessPanelProps & { onBack: () => void }> = ({ dailyLog, onUpdateWorkout, onBack }) => {
  const [localWorkout, setLocalWorkout] = useState<WorkoutExercise[]>([]);
  const [newExerciseName, setNewExerciseName] = useState('');

  useEffect(() => {
    // If we have a saved draft, load it
    const savedWorkout = localStorage.getItem(WORKOUT_STORAGE_KEY);
    if (savedWorkout) {
      try {
        setLocalWorkout(JSON.parse(savedWorkout));
        return;
      } catch {
        localStorage.removeItem(WORKOUT_STORAGE_KEY);
      }
    }

    // Otherwise load what's in the log (or empty)
    if (dailyLog?.loggedWorkout) {
      setLocalWorkout(dailyLog.loggedWorkout);
    } else {
      setLocalWorkout([]);
    }
  }, [dailyLog]); // Run once on mount/log change


  useEffect(() => {
    localStorage.setItem(WORKOUT_STORAGE_KEY, JSON.stringify(localWorkout));
  }, [localWorkout]);


  const addExercise = () => {
    if (!newExerciseName.trim()) return;
    const newExercise: WorkoutExercise = {
      id: crypto.randomUUID(), // Use standard UUID if available or a simple generator
      name: newExerciseName,
      idealSets: 3, // Default
      idealReps: "10", // Default
      loggedSets: []
    };
    setLocalWorkout([...localWorkout, newExercise]);
    setNewExerciseName('');
    haptic.success();
  };


  const addSet = (exerciseId: string) => {
    setLocalWorkout(currentWorkout => currentWorkout.map(ex => {
      if (ex.id === exerciseId) {
        // Find the last logged set to pre-fill the new one, or use defaults
        const lastSet = ex.loggedSets[ex.loggedSets.length - 1] || { reps: 10, weight: 0 };
        return { ...ex, loggedSets: [...ex.loggedSets, { ...lastSet }] };
      }
      return ex;
    }));
    haptic.light();
  };

  const updateSet = (exerciseId: string, setIndex: number, field: 'reps' | 'weight', value: number) => {
    setLocalWorkout(currentWorkout => currentWorkout.map(ex => {
      if (ex.id === exerciseId) {
        const newSets = [...ex.loggedSets];
        newSets[setIndex] = { ...newSets[setIndex], [field]: value };
        return { ...ex, loggedSets: newSets };
      }
      return ex;
    }));
  };

  const handleSaveWorkout = () => {
    onUpdateWorkout(localWorkout);
    localStorage.removeItem(WORKOUT_STORAGE_KEY);
    haptic.success();
    onBack();
  };


  return (
    <div className="workout-logger-view">
      <div className="workout-actions">
        <button className='btn-secondary' onClick={onBack}>← Back</button>
        <button className='btn-primary' onClick={handleSaveWorkout}>Save Workout</button>
      </div>

      <div className="add-exercise-box">
        <input
          type="text"
          value={newExerciseName}
          onChange={e => setNewExerciseName(e.target.value)}
          placeholder="Exercise Name (e.g. Bench Press)"
          onKeyDown={e => e.key === 'Enter' && addExercise()}
        />
        <button onClick={addExercise}>+ Add Exercise</button>
      </div>

      {localWorkout.length === 0 && (
        <div className="empty-workout-state">
          <p>No exercises logged yet. Add one above!</p>
        </div>
      )}

      {localWorkout.map(exercise => (
        <div key={exercise.id} className="exercise-card">
          <div className="exercise-header">
            <h4>{exercise.name}</h4>
          </div>
          <div className="exercise-sets-log">
            <div className="sets-header"><span>SET</span><span>REPS</span><span>WEIGHT (kg)</span></div>
            {exercise.loggedSets.map((set, index) => (
              <div key={index} className="set-row">
                <span>{index + 1}</span>
                <input type="number" value={set.reps} onChange={e => updateSet(exercise.id, index, 'reps', parseInt(e.target.value) || 0)} />
                <input type="number" value={set.weight} onChange={e => updateSet(exercise.id, index, 'weight', parseInt(e.target.value) || 0)} />
              </div>
            ))}
          </div>
          <button className="btn-add-set" onClick={() => addSet(exercise.id)}>+ Add Set</button>
        </div>
      ))}
    </div>
  )
}

// Helper component for meals, to keep DashboardView cleaner
const MealSection: React.FC<{
  title: 'Breakfast' | 'Lunch' | 'Dinner',
  mealKey: 'breakfast' | 'lunch' | 'dinner',
  items: FoodItem[],
  input: string,
  setInput: (val: string) => void,
  onAdd: () => void,
  onDelete: (itemId: string) => void,
  onEdit: (itemId: string, newText: string) => void
}> = ({
  title,
  mealKey,
  items,
  input,
  setInput,
  onAdd,
  onDelete,
  onEdit
}) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    return (
      <div className="meal-section">
        <h4>{title}</h4>

        <div className="calorie-input-group">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="e.g., 2 rotis, 100g paneer"
            onKeyDown={e => e.key === 'Enter' && onAdd()}
          />
          <button onClick={onAdd}>+</button>
        </div>

        <ul className="food-item-list">
          {items.map(item => (
            <li key={item.id} className="food-item editable">
              {editingId === item.id ? (
                <>
                  <input
                    type="text"
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      onEdit(item.id, editText);
                      setEditingId(null);
                      haptic.success();
                    }}
                  >
                    ✓
                  </button>
                  <button onClick={() => setEditingId(null)}>✕</button>
                </>
              ) : (
                <>
                  <span>{item.name}</span>
                  <span>{item.calories} kcal</span>

                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditText(item.name);
                    }}
                  >
                    ✎
                  </button>

                  <button
                    className="icon-btn danger"
                    onClick={() => {
                      onDelete(item.id);
                      haptic.light();
                    }}
                  >
                    🗑
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };


// --- Fitness History View ---

import { FitnessHistoryDashboard } from './FitnessHistoryDashboard';

interface FitnessHistoryViewProps {
  onBack: () => void;
  userId: string;
  fitnessGoal: FitnessGoal | null;
}

const FitnessHistoryView: React.FC<FitnessHistoryViewProps> = ({ onBack, userId, fitnessGoal }) => {
  const [logs, setLogs] = useState<DailyFitnessLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFullDashboard, setShowFullDashboard] = useState(false);
  const [timeRange, setTimeRange] = useState<'7' | '30' | '90'>('7');

  const displayedLogs = React.useMemo(() => {
    const limit = parseInt(timeRange);
    return logs.slice(0, limit);
  }, [logs, timeRange]);

  useEffect(() => {
    calculateStats(displayedLogs);
  }, [displayedLogs, fitnessGoal]);

  // Stats
  const [avgDeficit, setAvgDeficit] = useState(0);
  const [avgCalories, setAvgCalories] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [onTrackStatus, setOnTrackStatus] = useState<'ON_TRACK' | 'OFF_TRACK' | 'NEEDS_DATA'>('NEEDS_DATA');

  useEffect(() => {
    // ... existing fetch logic ...
    const fetchHistory = async () => {
      try {
        const historyRef = collection(db, 'users', userId, 'dailyFitnessLogs');
        const q = query(historyRef, orderBy(documentId(), 'desc'), limit(90));
        const snapshot = await getDocs(q);
        const fetchedLogs = snapshot.docs.map(doc => doc.data() as DailyFitnessLog).filter(l => l.date);
        setLogs(fetchedLogs);
        calculateStats(fetchedLogs);
      } catch (error) {
        console.error("Error fetching fitness history:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [userId]);

  // ... existing calculateStats ...
  const calculateStats = (data: DailyFitnessLog[]) => {
    // ... existing logic ...
    if (data.length === 0) return;

    // Filter logs that have ANY data (calories, workout, or steps)
    const activeDays = data.filter(l => {
      const cals = (l.breakfast?.reduce((s, i) => s + i.calories, 0) || 0) +
        (l.lunch?.reduce((s, i) => s + i.calories, 0) || 0) +
        (l.dinner?.reduce((s, i) => s + i.calories, 0) || 0);
      const hasWorkout = l.loggedWorkout && l.loggedWorkout.length > 0;
      const hasSteps = (l.steps || 0) > 0;
      return cals > 0 || hasWorkout || hasSteps;
    });

    if (activeDays.length === 0) return;

    let totalDef = 0;
    let totalCals = 0;
    let workouts = 0;

    activeDays.forEach(log => {
      const cals = (log.breakfast?.reduce((s, i) => s + i.calories, 0) || 0) +
        (log.lunch?.reduce((s, i) => s + i.calories, 0) || 0) +
        (log.dinner?.reduce((s, i) => s + i.calories, 0) || 0);

      const deficit = log.aiInsight?.deficit || 0;

      totalDef += deficit;
      totalCals += cals;
      if (log.loggedWorkout && log.loggedWorkout.length > 0) workouts++;
    });

    const avgDef = totalDef / activeDays.length;
    setAvgDeficit(Math.round(avgDef));
    setAvgCalories(Math.round(totalCals / activeDays.length));
    setTotalWorkouts(workouts);

    if (fitnessGoal?.goalType.includes('loss') && avgDef > 0) {
      setOnTrackStatus('ON_TRACK');
      const lossPerWeek = (avgDef * 7) / 7700;
      if (lossPerWeek < 0.2) setOnTrackStatus('OFF_TRACK');
    } else if (fitnessGoal?.goalType.includes('building') && avgDef < 0) {
      setOnTrackStatus('ON_TRACK');
    } else if (fitnessGoal?.goalType.includes('loss') && avgDef <= 0) {
      setOnTrackStatus('OFF_TRACK');
    } else {
      setOnTrackStatus('ON_TRACK');
    }
  };

  const getDayCalories = (log: DailyFitnessLog) => {
    return (log.breakfast?.reduce((s, i) => s + i.calories, 0) || 0) +
      (log.lunch?.reduce((s, i) => s + i.calories, 0) || 0) +
      (log.dinner?.reduce((s, i) => s + i.calories, 0) || 0);
  }


  if (loading) {
    return <div className="p-10 text-center">Loading History...</div>
  }

  return (
    <div className="fitness-history-view">
      <FitnessHistoryDashboard
        isOpen={showFullDashboard}
        onClose={() => setShowFullDashboard(false)}
        userId={userId}
        fitnessGoal={fitnessGoal}
      />

      <div className="history-header" style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button className='btn-secondary' onClick={onBack}>← Back</button>
            <h3 style={{ margin: 0 }}>Analysis</h3>
          </div>
          <button
            onClick={() => setShowFullDashboard(true)}
            className="btn-primary"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            View Full Timeline
          </button>
        </div>

        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '8px' }}>
          {['7', '30', '90'].map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range as any)}
              style={{
                flex: 1,
                padding: '6px',
                background: timeRange === range ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: timeRange === range ? '#fff' : '#888',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {range} Days
            </button>
          ))}
        </div>
      </div>

      {/* Analysis Card */}
      <div className={`history-status-card ${onTrackStatus.toLowerCase()}`}>
        <div className="status-title">
          {onTrackStatus === 'ON_TRACK' ? 'ON TRACK' : onTrackStatus === 'OFF_TRACK' ? 'OFF TRACK' : 'INSUFFICIENT DATA'}
        </div>
        <div className="status-desc">
          {onTrackStatus === 'ON_TRACK'
            ? `Great job! You are averaging a ${avgDeficit > 0 ? 'deficit' : 'surplus'} consistent with your goal over the last ${timeRange} days.`
            : onTrackStatus === 'OFF_TRACK'
              ? `Over the last ${timeRange} days, you are averaging ${avgDeficit > 0 ? 'a deficit of' : 'a surplus of'} ${Math.abs(avgDeficit)}. Adjust intake to hit your goal.`
              : "Log more days to get an analysis."}
        </div>
      </div>

      <div className="history-stats-grid">
        <div className="stat-box">
          <span className="label">Avg Calories</span>
          <span className="val">{avgCalories}</span>
        </div>
        <div className="stat-box">
          <span className="label">Avg Deficit</span>
          <span className="val" style={{ color: avgDeficit > 0 ? '#10b981' : '#ef4444' }}>
            {avgDeficit > 0 ? '-' : '+'}{Math.abs(avgDeficit)}
          </span>
        </div>
        <div className="stat-box">
          <span className="label">Workouts</span>
          <span className="val">{totalWorkouts}</span>
        </div>
      </div>

      <div className="history-list">
        {displayedLogs.map(log => {
          const cals = getDayCalories(log);
          const deficit = log.aiInsight?.deficit || 0;
          const tdee = log.aiInsight?.tdee || fitnessGoal?.tdee || 2000;
          const width = Math.min((cals / tdee) * 100, 100);
          const isWorkout = log.loggedWorkout && log.loggedWorkout.length > 0;

          return (
            <div key={log.date} className="history-item">
              <div className="date-col">
                <span className="day">{new Date(log.date).getDate()}</span>
                <span className="month">{new Date(log.date).toLocaleString('default', { month: 'short' })}</span>
              </div>
              <div className="bar-col">
                <div className="mini-cal-bar">
                  <div className="fill" style={{ width: `${width}%`, background: cals > tdee ? '#ef4444' : '#10b981' }}></div>
                </div>
                <div className="bar-meta">
                  <span>{cals} kcal</span>
                  {isWorkout && <span className="workout-badge">🏋️‍♂️</span>}
                </div>
              </div>
              <div className="deficit-col" style={{ color: deficit > 0 ? '#10b981' : '#ef4444' }}>
                {deficit > 0 ? '-' : '+'}{Math.abs(deficit)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};


export default FitnessPanel;
