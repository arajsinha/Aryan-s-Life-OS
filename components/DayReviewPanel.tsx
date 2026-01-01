
import React from 'react';
import { Activity } from '../types.ts';

interface DayReviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCommit: (activities: Activity[]) => void;
  reviewData: {
    integrityScore: number;
    goalInsight: { status: string; message: string; };
    priorityInsight: { status: string; message: string; };
    todaysActivities: Activity[];
  };
  aiSuggestions: Activity[];
  isGenerating: boolean;
}

const DayReviewPanel = ({
  isOpen,
  onClose,
  onCommit,
  reviewData,
  aiSuggestions,
  isGenerating
}: DayReviewPanelProps) => {
  if (!isOpen) return null;

  return (
    <div className="os-overlay-blur" onClick={onClose}>
      <div className="day-review-panel" onClick={e => e.stopPropagation()}>
        <header className="panel-header">
          <h2>Day In Review</h2>
          <button onClick={onClose}>&times;</button>
        </header>

        <div className="panel-content custom-scroll">
          <section className="review-section">
            <h3>Today's Integrity</h3>
            <div className="review-stat">
              <span>Overall Score</span>
              <strong>{reviewData.integrityScore}%</strong>
            </div>
             <div className="review-stat">
              <span>Goal Focus</span>
              <strong className={`status-${reviewData.goalInsight.status}`}>{reviewData.goalInsight.message}</strong>
            </div>
             <div className="review-stat">
              <span>Priority Alignment</span>
              <strong className={`status-${reviewData.priorityInsight.status}`}>{reviewData.priorityInsight.message}</strong>
            </div>
          </section>

          <section className="review-section">
            <h3>Tomorrow's Briefing</h3>
            {isGenerating ? (
              <div className="ai-thinking-box">
                <p>Analyzing today's performance and planning for tomorrow...</p>
              </div>
            ) : (
              <div className="ai-suggestions">
                {aiSuggestions.length > 0 ? (
                  aiSuggestions.map(act => (
                    <div key={act.id} className="suggested-activity">
                      <span className="time">{act.startTime} - {act.endTime}</span>
                      <span className="name">{act.name}</span>
                      <span className="domain">{act.domain}</span>
                    </div>
                  ))
                ) : (
                  <p>No suggestions available. Ready for a fresh start!</p>
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="panel-footer">
            <button
                className="btn-commit-tomorrow"
                onClick={() => onCommit(aiSuggestions)}
                disabled={isGenerating || aiSuggestions.length === 0}
            >
                Commit to Tomorrow
            </button>
        </footer>

      </div>
    </div>
  );
};

export default DayReviewPanel;
