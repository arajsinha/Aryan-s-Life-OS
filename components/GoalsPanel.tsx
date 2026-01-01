
import React, { useState } from 'react';
import { Goal, GoalCategory, GoalType } from '../types.ts';

interface GoalsPanelProps {
  goals: Goal[];
  isOpen: boolean;
  onClose: () => void;
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) => void;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
}

const GOAL_CATEGORIES: GoalCategory[] = ['Project', 'Career', 'Health', 'Finance', 'Leisure', 'Relationships', 'Other'];

const GoalForm = ({ goal, onSave, onCancel }: { goal?: Goal | null, onSave: (goal: any) => void, onCancel: () => void }) => {
  const [title, setTitle] = useState(goal?.title || '');
  const [category, setCategory] = useState<GoalCategory>(goal?.category || 'Project');
  const [targetDate, setTargetDate] = useState(goal?.targetDate || '');
  const [description, setDescription] = useState(goal?.description || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    onSave({ ...goal, title, category, targetDate, description });
  };

  return (
    <form onSubmit={handleSubmit} className="goal-form">
      <input
        type="text"
        placeholder="Goal Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <select value={category} onChange={(e) => setCategory(e.target.value as GoalCategory)}>
        {GOAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input
        type="date"
        value={targetDate}
        onChange={(e) => setTargetDate(e.target.value)}
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="form-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit">Save Goal</button>
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
      addGoal({ ...goalData, type: isAdding! });
    }
    setEditingGoal(null);
    setIsAdding(null);
  };

  const renderGoalList = (type: GoalType) => {
    const filteredGoals = goals.filter(g => g.type === type && g.isActive).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
      <div className="goals-section">
        <header>
          <h3>{type === 'short_term' ? 'Short-Term' : 'Long-Term'}</h3>
          <button className="add-goal-btn" onClick={() => setIsAdding(type)}>+</button>
        </header>
        {isAdding === type && <GoalForm onSave={handleSave} onCancel={() => setIsAdding(null)} />}
        <div className="goal-list">
          {filteredGoals.map(goal => (
            editingGoal?.id === goal.id ? (
              <GoalForm key={goal.id} goal={goal} onSave={handleSave} onCancel={() => setEditingGoal(null)} />
            ) : (
              <div key={goal.id} className="goal-item">
                <div className="goal-info">
                  <p className="goal-title">{goal.title}</p>
                  <span className="goal-category">{goal.category}</span>
                  {goal.targetDate && <span className="goal-date">{goal.targetDate}</span>}
                </div>
                <div className="goal-actions">
                  <button onClick={() => setEditingGoal(goal)}>Edit</button>
                  <button onClick={() => deleteGoal(goal.id)}>Delete</button>
                </div>
              </div>
            )
          ))}
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
