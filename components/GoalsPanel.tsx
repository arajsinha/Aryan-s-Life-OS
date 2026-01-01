
import React, { useState, useEffect } from 'react';
import { Goal, GoalCategory, GoalType, GoalStatus, GoalMetric } from '../types.ts';

interface GoalsPanelProps {
  goals: Goal[];
  isOpen: boolean;
  onClose: () => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
}

const GOAL_CATEGORIES: GoalCategory[] = ['Project', 'Career', 'Health', 'Finance', 'Leisure', 'Relationships', 'Other'];
const GOAL_STATUSES: GoalStatus[] = ['not_started', 'in_progress', 'at_risk', 'blocked', 'completed'];

const GoalForm = ({ goal, onSave, onCancel, goalType }: { goal?: Goal | null, onSave: (goal: any) => void, onCancel: () => void, goalType: GoalType }) => {
  const [title, setTitle] = useState(goal?.title || '');
  const [category, setCategory] = useState<GoalCategory>(goal?.category || 'Project');
  const [targetDate, setTargetDate] = useState(goal?.targetDate || '');
  const [description, setDescription] = useState(goal?.description || '');
  const [status, setStatus] = useState<GoalStatus>(goal?.status || 'not_started');

  // Metric State
  const [hasMetric, setHasMetric] = useState(false);
  const [metricName, setMetricName] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [metricCurrent, setMetricCurrent] = useState<number | ''>('');
  const [metricTarget, setMetricTarget] = useState<number | ''>('');

  useEffect(() => {
    if (goal?.metric) {
      setHasMetric(true);
      setMetricName(goal.metric.name);
      setMetricUnit(goal.metric.unit);
      setMetricCurrent(goal.metric.current);
      setMetricTarget(goal.metric.target);
    }
  }, [goal]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    let metric: GoalMetric | undefined = undefined;
    if (hasMetric && metricName && metricUnit && metricCurrent !== '' && metricTarget !== '') {
      metric = {
        name: metricName,
        unit: metricUnit,
        current: Number(metricCurrent),
        target: Number(metricTarget)
      }
    }

    onSave({
      ...goal,
      title,
      category,
      targetDate,
      description,
      status,
      metric,
      type: goal?.type || goalType // Pass type for new goals
    });
  };

  return (
    <form onSubmit={handleSubmit} className="goal-form">
      <input
        type="text"
        placeholder="Goal Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        className="form-input"
      />
      <textarea
        placeholder='The "Why" behind your goal...'
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="form-textarea"
      />
      <div className="form-row">
        <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}>
          {GOAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className="form-input"
        />
      </div>
      <div className="form-row">
        <label htmlFor="status" className="form-label">Status</label>
        <select id="status" className="form-select" value={status} onChange={e => setStatus(e.target.value as GoalStatus)}>
          {GOAL_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      <div className="metric-section">
        <div className="form-toggle">
          <input type="checkbox" id="hasMetric" checked={hasMetric} onChange={e => setHasMetric(e.target.checked)} />
          <label htmlFor="hasMetric">Track a measurable target</label>
        </div>

        {hasMetric && (
          <div className="metric-inputs">
            <div className="form-row">
              <input type="text" placeholder="Metric Name (e.g. Weight)" value={metricName} onChange={e => setMetricName(e.target.value)} className="form-input" />
              <input type="text" placeholder="Unit (e.g. kg)" value={metricUnit} onChange={e => setMetricUnit(e.target.value)} className="form-input" />
            </div>
            <div className="form-row">
              <input type="number" placeholder="Current Value" value={metricCurrent} onChange={e => setMetricCurrent(e.target.value === '' ? '' : Number(e.target.value))} className="form-input" />
              <input type="number" placeholder="Target Value" value={metricTarget} onChange={e => setMetricTarget(e.target.value === '' ? '' : Number(e.target.value))} className="form-input" />
            </div>
          </div>
        )}
      </div>


      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" className="btn-primary">Save Goal</button>
      </div>
    </form>
  );
};

const GoalsPanel = ({ isOpen, onClose, goals, addGoal, updateGoal, deleteGoal }: GoalsPanelProps) => {
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isAdding, setIsAdding] = useState<GoalType | null>(null);

  if (!isOpen) return null;

  const handleSave = (goalData: any) => {
    if (goalData.id) { // Existing goal
      updateGoal(goalData);
    } else { // New goal
      const { id, ...newGoalData } = goalData;
      addGoal({ ...newGoalData, type: isAdding! });
    }
    setEditingGoal(null);
    setIsAdding(null);
  };

  const renderGoalList = (type: GoalType) => {
    const filteredGoals = goals.filter(g => g.type === type).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Determine if the form should be open for adding or editing in this section
    const isEditingThisType = editingGoal && editingGoal.type === type;
    const isAddingThisType = isAdding === type;
    const isFormVisible = isEditingThisType || isAddingThisType;

    return (
      <div className="goals-section">
        <header>
          <h3>{type === 'short_term' ? 'Short-Term' : 'Long-Term'}</h3>
          <button className="add-goal-btn" onClick={() => {
            // If form is already open for adding, this button should do nothing,
            // or you could have it close the form. For now, we just open it.
            setEditingGoal(null);
            setIsAdding(isAddingThisType ? null : type);
          }}>
            {isAddingThisType ? '−' : '+'}
          </button>
        </header>

        {/* The container for the Add/Edit form */}
        {isFormVisible && (
          <div className="goal-form-container">
            <GoalForm
              key={editingGoal ? editingGoal.id : 'new'}
              goal={editingGoal} // Will be null if we are adding
              onSave={handleSave}
              onCancel={() => { setEditingGoal(null); setIsAdding(null); }}
              goalType={type}
            />
          </div>
        )}

        <div className="goal-list">
          {filteredGoals.map(goal => {
            // If this goal is currently being edited, don't render it in the list.
            if (editingGoal?.id === goal.id) {
              return null;
            }

            // Otherwise, render the goal item as usual.
            return (
              <div key={goal.id} className="goal-item">
                <div className="goal-info">
                  <div className="goal-header">
                    <p className="goal-title">{goal.title}</p>
                    <span className={`goal-status-badge status-${goal.status || 'not_started'}`}>{(goal.status || 'not_started').replace(/_/g, ' ')}</span>
                  </div>
                  <div className="goal-meta">
                    <span className="goal-category">{goal.category}</span>
                    {goal.targetDate && <span className="goal-date">{goal.targetDate}</span>}
                  </div>
                  {goal.metric && (
                    <div className="goal-metric">
                      <span className="metric-name">{goal.metric.name}: </span>
                      <span className="metric-value">{goal.metric.current}{goal.metric.unit} → {goal.metric.target}{goal.metric.unit}</span>
                    </div>
                  )}
                </div>
                <div className="goal-actions">
                  <button onClick={() => { setIsAdding(null); setEditingGoal(goal); }}>Edit</button>
                  <button onClick={() => deleteGoal(goal.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };




  return (
    <div className="os-overlay-blur" onClick={onClose}>
      <div className="goals-panel" onClick={e => e.stopPropagation()}>
        <header className="panel-header">
          <h2>Mission Control: Goals</h2>
          <button onClick={onClose}>&times;</button>
        </header>
        <div className="panel-content custom-scroll">
          {renderGoalList('short_term')}
          {renderGoalList('long_term')}
        </div>
      </div>
    </div>
  );
};

export default GoalsPanel;
