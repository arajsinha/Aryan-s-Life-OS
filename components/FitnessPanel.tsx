
import React, { useState, useEffect } from 'react';
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
  onGenerateInsight: () => void; // New function to trigger AI generation
  onUpdateFitnessGoal: (goal: FitnessGoal) => void; // Add this line
  onDeleteFoodItem: (meal: 'breakfast' | 'lunch' | 'dinner', itemId: string) => void;
  onEditFoodItem: (
    meal: 'breakfast' | 'lunch' | 'dinner',
    itemId: string,
    newText: string
  ) => void;

}

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


// Main Panel Component
const FitnessPanel: React.FC<FitnessPanelProps> = (props) => {
  const [view, setView] = useState<'dashboard' | 'workout'>('dashboard');

  if (!props.isOpen) {
    return null;
  }

  const navigateToWorkout = () => {
    haptic.light();
    setView('workout');
  };

  const navigateToDashboard = () => {
    haptic.light();
    setView('dashboard');
  }

  return (
    <div className="os-overlay-blur" onClick={props.onClose}>
      <div className="goals-panel fitness-panel-wide" onClick={e => e.stopPropagation()}>
        <header className="panel-header">
          <h2>{view === 'dashboard' ? 'Fitness & Health Hub' : 'Workout Logger'}</h2>
          <button onClick={props.onClose}>&times;</button>
        </header>

        <div className="panel-content custom-scroll">
          {view === 'dashboard' && <DashboardView {...props} onNavigateToWorkout={navigateToWorkout} />}
          {view === 'workout' && <WorkoutView {...props} onBack={navigateToDashboard} />}
        </div>
      </div>
    </div>
  );
};

// Dashboard View Component
const DashboardView: React.FC<FitnessPanelProps & { onNavigateToWorkout: () => void }> = ({
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
  onUpdateFitnessGoal
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

  const totalCalories = (dailyLog?.breakfast.reduce((sum, item) => sum + item.calories, 0) || 0) +
    (dailyLog?.lunch.reduce((sum, item) => sum + item.calories, 0) || 0) +
    (dailyLog?.dinner.reduce((sum, item) => sum + item.calories, 0) || 0);

  const calorieTarget = dailyLog?.aiInsight?.calorieTarget || fitnessGoal?.tdee || 2000;
  const calorieProgress = (totalCalories / calorieTarget) * 100;

  return (
    <>
      {/* --- AI Insight Bars --- */}
      <div className="ai-insight-section">
        {/* <div className={`ai-insight-bar ${dailyLog?.aiInsight?.workoutStatus.toLowerCase()}`}> */}
        <div className={`ai-insight-bar workout-${workoutStatus.toLowerCase()}`}>
          <div className="insight-label">AI Daily Briefing</div>
          <div className="insight-value">
            {/* <span>{dailyLog?.aiInsight?.workoutStatus || 'Syncing...'}</span> */}
            <span>{workoutStatusText}</span>
            {dailyLog?.aiInsight?.workoutStatus === 'Workout' && (
              <button className="btn-view-workout" onClick={onNavigateToWorkout}>VIEW →</button>
            )}
          </div>
          <div className="insight-sub">{dailyLog?.aiInsight?.workoutSplit || 'Generate insight for today'}</div>
        </div>
        <div className="ai-insight-bar calorie-bar">
          <div className="insight-label">Calorie Target</div>
          <div className="insight-value">{totalCalories} / <span>{calorieTarget} kcal</span></div>
          <div className="calorie-progress-track">
            <div className="calorie-progress-fill" style={{ width: `${Math.min(calorieProgress, 100)}%` }}></div>
          </div>
        </div>
        <button className='btn-secondary' onClick={onGenerateInsight}>Refresh AI Insight</button>
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

  // useEffect(() => {
  //   // Initialize local state from the prop, but add a loggedSets array if it's missing
  //   const initialWorkout = dailyLog?.workoutPlan?.map(ex => ({ ...ex, loggedSets: ex.loggedSets || [] })) || [];
  //   setLocalWorkout(initialWorkout);
  // }, [dailyLog?.workoutPlan]);

  useEffect(() => {
    if (!dailyLog?.workoutPlan) return;

    const savedWorkout = localStorage.getItem(WORKOUT_STORAGE_KEY);

    if (savedWorkout) {
      try {
        setLocalWorkout(JSON.parse(savedWorkout));
        return;
      } catch {
        localStorage.removeItem(WORKOUT_STORAGE_KEY);
      }
    }

    const initialWorkout = dailyLog.workoutPlan.map(ex => ({
      ...ex,
      loggedSets: ex.loggedSets || [],
    }));

    setLocalWorkout(initialWorkout);
  }, [dailyLog?.workoutPlan]);


  useEffect(() => {
    if (localWorkout.length > 0) {
      localStorage.setItem(
        WORKOUT_STORAGE_KEY,
        JSON.stringify(localWorkout)
      );
    }
  }, [localWorkout]);



  const addSet = (exerciseId: string) => {
    setLocalWorkout(currentWorkout => currentWorkout.map(ex => {
      if (ex.id === exerciseId) {
        // Find the last logged set to pre-fill the new one, or use defaults
        const lastSet = ex.loggedSets[ex.loggedSets.length - 1] || { reps: 0, weight: 0 };
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


  if (!dailyLog?.workoutPlan) {
    return <div><p>No workout plan generated for today.</p><button className='btn-secondary' onClick={onBack}>Go Back</button></div>
  }

  return (
    <div className="workout-logger-view">
      <div className="workout-actions">
        <button className='btn-secondary' onClick={onBack}>← Back to Dashboard</button>
        <button className='btn-primary' onClick={handleSaveWorkout}>Save & Finish Workout</button>
      </div>

      {localWorkout.map(exercise => (
        <div key={exercise.id} className="exercise-card">
          <div className="exercise-header">
            <h4>{exercise.name}</h4>
            <span>Target: {exercise.idealSets} sets of {exercise.idealReps} reps</span>
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


export default FitnessPanel;
