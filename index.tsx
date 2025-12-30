
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from '@google/genai';
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { Activity, LifePeriod, Domain, ActivityStatus } from './types';
import { DOMAINS, DEFAULT_WEIGHTS, DOMAIN_COLORS } from './constants';
import { generateId } from './utils';

// --- Shared Components ---

const DomainIcon = ({ domain, size = 8 }: { domain: Domain, size?: number }) => (
  <div style={{ 
    width: size, 
    height: size, 
    borderRadius: '50%', 
    backgroundColor: DOMAIN_COLORS[domain], 
    boxShadow: `0 0 10px ${DOMAIN_COLORS[domain]}88` 
  }} />
);

const LifePeriodBadge = ({ activePeriod, onClick }: { activePeriod: LifePeriod | null, onClick: () => void }) => {
  const dominantDomain = useMemo(() => {
    if (!activePeriod) return null;
    return (Object.entries(activePeriod.weights).reduce((a, b) => a[1] > b[1] ? a : b)[0]) as Domain;
  }, [activePeriod]);

  return (
    <button className="life-period-badge" onClick={onClick}>
      <div className="badge-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
      </div>
      <div className="badge-content">
        <span className="badge-title">{activePeriod?.title || 'Active Phase'}</span>
        {dominantDomain && (
          <div className="badge-sub">
             <DomainIcon domain={dominantDomain} size={6} />
             <span>{dominantDomain} Bias</span>
          </div>
        )}
      </div>
    </button>
  );
};

function App() {
  // --- Global State ---
  const [lifePeriods, setLifePeriods] = useState<LifePeriod[]>(() => {
    const saved = localStorage.getItem('life_periods');
    return saved ? (JSON.parse(saved) as LifePeriod[]) : [{
      id: 'initial',
      title: 'Rest & Recover',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      weights: { ...DEFAULT_WEIGHTS, Sleep: 40, Health: 30 }
    }];
  });

  const [activities, setActivities] = useState<Activity[]>(() => {
    const saved = localStorage.getItem('activities');
    return saved ? (JSON.parse(saved) as Activity[]) : [];
  });

  // --- UI State ---
  const [activePeriodId] = useState<string>(lifePeriods[0]?.id || '');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [heatmapView, setHeatmapView] = useState<'day' | 'week' | 'month'>('day');
  const [plannerInput, setPlannerInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewActivity, setPreviewActivity] = useState<Activity | null>(null);
  const [expandingActivityId, setExpandingActivityId] = useState<string | null>(null);
  const [hoveredTask, setHoveredTask] = useState<Activity | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // --- Sidebar Specific State ---
  const [todos, setTodos] = useState<{id: string, text: string, done: boolean}[]>(() => {
    const saved = localStorage.getItem('sidebar_todos');
    return saved ? (JSON.parse(saved) as {id: string, text: string, done: boolean}[]) : [];
  });
  const [scratchpad, setScratchpad] = useState(() => localStorage.getItem('sidebar_scratch') || '');
  const [todoInput, setTodoInput] = useState('');
  
  const [intelligence, setIntelligence] = useState<{
    news: string;
    weather: string;
    newsSources: { uri: string; title: string }[];
  }>({
    news: 'Decrypting headlines...',
    weather: 'Syncing climate...',
    newsSources: [],
  });

  // --- Persistent Storage Sync ---
  useEffect(() => {
    localStorage.setItem('life_periods', JSON.stringify(lifePeriods));
    localStorage.setItem('activities', JSON.stringify(activities));
  }, [lifePeriods, activities]);

  useEffect(() => {
    localStorage.setItem('sidebar_todos', JSON.stringify(todos));
    localStorage.setItem('sidebar_scratch', scratchpad);
  }, [todos, scratchpad]);

  // --- Intelligence Fetching ---
  const fetchIntelligence = async () => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const newsResp = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "Top 2 bullet headlines each for: AI/Tech, World News, and Indian Politics. Do NOT use markdown symbols like ###. Use plain text labels like 'AI:' etc.",
        config: { tools: [{ googleSearch: {} }] }
      });

      const newsChunks = newsResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const newsSources = newsChunks
        .filter(c => c.web)
        .map(c => ({ uri: c.web?.uri || '', title: c.web?.title || 'Source' }));

      const weatherResp = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "Current weather for my approximate location. Extremely brief, e.g. 'Cloudy • 22°C'.",
        config: { tools: [{ googleSearch: {} }] }
      });

      setIntelligence({
        news: newsResp.text || 'Unable to load news.',
        weather: weatherResp.text || 'Unknown',
        newsSources,
      });
    } catch (e) {
      console.error(e);
      setIntelligence(prev => ({ ...prev, news: 'Feed synchronization failed.' }));
    }
  };

  useEffect(() => {
    if (isSidebarOpen) fetchIntelligence();
  }, [isSidebarOpen]);

  // --- Computed Views ---
  const activePeriod = useMemo(() => 
    lifePeriods.find(p => p.id === activePeriodId) || null
  , [lifePeriods, activePeriodId]);

  const integrityScore = useMemo(() => {
    if (activities.length === 0) return 0;
    const completed = activities.filter(a => a.status === 'complete').length;
    const partial = activities.filter(a => a.status === 'partial').length;
    return Math.round(((completed + partial * 0.5) / activities.length) * 100);
  }, [activities]);

  const activitiesByDate = useMemo(() => {
    const groups: Record<string, Activity[]> = {};
    [...activities].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).forEach(a => {
      if (!groups[a.date]) groups[a.date] = [];
      groups[a.date].push(a);
    });
    return groups;
  }, [activities]);

  // --- Logic Handlers ---
  const handleParseActivity = async () => {
    if (!plannerInput.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const now = new Date();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Intent: "${plannerInput}". Context: ${now.toDateString()}, ${now.toLocaleTimeString()}. Current life phase: ${activePeriod?.title}. Priorities: ${JSON.stringify(activePeriod?.weights)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              date: { type: Type.STRING },
              start_time: { type: Type.STRING },
              end_time: { type: Type.STRING },
              domain: { type: Type.STRING, enum: DOMAINS },
              intent: { type: Type.STRING }
            },
            required: ['name', 'date', 'start_time', 'end_time', 'domain', 'intent']
          }
        }
      });
      const data = JSON.parse(response.text?.trim() || '{}');
      setPreviewActivity({
        id: generateId(),
        name: data.name,
        startTime: data.start_time,
        endTime: data.end_time,
        domain: data.domain as Domain,
        status: 'planned',
        date: data.date,
        intent: data.intent
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmActivity = () => {
    if (previewActivity) {
      setActivities(prev => [...prev, previewActivity]);
      setPreviewActivity(null);
      setPlannerInput('');
    }
  };

  const updateActivityStatus = (id: string, status: ActivityStatus) => {
    setActivities(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    setExpandingActivityId(null);
  };

  const deleteActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
    setExpandingActivityId(null);
  };

  const updateWeight = (domain: Domain, val: number) => {
    if (!activePeriod) return;
    setLifePeriods(prev => prev.map(p => p.id === activePeriodId ? { ...p, weights: { ...p.weights, [domain]: val } } : p));
  };

  const addTodo = () => {
    if (!todoInput.trim()) return;
    setTodos([{ id: generateId(), text: todoInput, done: false }, ...todos]);
    setTodoInput('');
  };

  return (
    <div className={`os-container ${isSidebarOpen ? 'sidebar-active' : ''}`}>
      
      {/* 1. SIDEBAR TRIGGER */}
      <div className="os-sidebar-trigger" onClick={() => setIsSidebarOpen(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      {/* 2. ZEN SIDEBAR */}
      <div className={`os-zen-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <button className="os-close-btn" onClick={() => setIsSidebarOpen(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="zen-content">
          <div className="zen-col">
            <section className="zen-card glass-card">
              <header className="zen-header">
                <h3>FOCUS FLOW</h3>
                <div className="zen-weather-badge">{intelligence.weather}</div>
              </header>
              <div className="zen-todo-input-group">
                <input 
                  type="text" 
                  value={todoInput} 
                  onChange={e => setTodoInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  placeholder="Queue new objective..." 
                />
                <button onClick={addTodo} className="zen-accent-btn">Add</button>
              </div>
              <div className="zen-todo-list custom-scroll">
                {todos.length === 0 && <p className="os-muted">No pending tasks for this flow.</p>}
                {todos.map(t => (
                  <div key={t.id} className={`zen-todo-item ${t.done ? 'is-done' : ''}`} onClick={() => setTodos(todos.map(x => x.id === t.id ? {...x, done: !x.done} : x))}>
                    <div className="zen-check" />
                    <span>{t.text}</span>
                    <button className="zen-trash" onClick={e => { e.stopPropagation(); setTodos(todos.filter(x => x.id !== t.id)); }}>
                       <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="zen-card glass-card">
              <header className="zen-header">
                <h3>SIGNALS</h3>
                <button className="zen-minimal-refresh" onClick={fetchIntelligence}>SYNC</button>
              </header>
              <div className="zen-intelligence custom-scroll">
                <div className="zen-news-feed">
                   {intelligence.news.split('\n').map((line, i) => (
                     <div key={i} className="news-line">{line}</div>
                   ))}
                </div>
                {intelligence.newsSources.length > 0 && (
                  <div className="zen-sources">
                    {intelligence.newsSources.slice(0, 3).map((s, i) => (
                      <a key={i} href={s.uri} target="_blank" rel="noreferrer" className="zen-source-tag">{s.title.substring(0, 20)}...</a>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="zen-col">
            <section className="zen-card glass-card fill-height">
              <header className="zen-header"><h3>BRAINDUMP</h3></header>
              <textarea 
                className="zen-scratchpad-instrument" 
                value={scratchpad} 
                onChange={e => setScratchpad(e.target.value)} 
                placeholder="Unprocessed thoughts, reflections, and fragments..."
              />
            </section>
          </div>
        </div>
      </div>

      {/* 3. MAIN DASHBOARD */}
      <div className="os-main">
        <header className={`os-status-banner ${integrityScore > 70 ? 'is-aligned' : 'is-neutral'}`}>
          <div className="banner-icon">
             <div className="pulse-circle" />
          </div>
          <div className="banner-text">
            <h2>Integrity Engine</h2>
            <p>{integrityScore}% congruence between intent and action.</p>
          </div>
        </header>

        <div className="os-dashboard-grid">
          {/* Metrics */}
          <section className="os-card glass-card">
            <h3>System Status</h3>
            <div className="os-metric-box">
              <span className="metric-val-large">{integrityScore}<small>%</small></span>
              <div className="metric-track"><div className="metric-fill-v2" style={{ width: `${integrityScore}%` }} /></div>
              <span className="os-muted-tiny">Daily Integrity Score</span>
            </div>
          </section>

          <section className="os-card glass-card col-span-2">
            <h3>Intent Planner</h3>
            <div className="os-planner-area">
              {previewActivity ? (
                <div className="os-ai-preview-card animate-slide-up">
                  <header>
                    <div className="preview-domain-tag" style={{ borderLeftColor: DOMAIN_COLORS[previewActivity.domain] }}>
                       {previewActivity.domain}
                    </div>
                    <span className="preview-time-tag">{formatDateLabel(previewActivity.date)} • {previewActivity.startTime}</span>
                  </header>
                  <h4>{previewActivity.name}</h4>
                  <p className="preview-intent-text">"{previewActivity.intent}"</p>
                  <div className="os-preview-actions">
                    <button className="btn-secondary" onClick={() => setPreviewActivity(null)}>Discard</button>
                    <button className="btn-primary-v2" onClick={confirmActivity}>Commit to Schedule</button>
                  </div>
                </div>
              ) : (
                <div className="os-input-container">
                  <textarea 
                    className="os-textarea-v2"
                    value={plannerInput} 
                    onChange={e => setPlannerInput(e.target.value)} 
                    placeholder="Capture your next move... e.g. 'Read for 45 mins after work tomorrow'"
                    disabled={isProcessing}
                  />
                  <button className="os-fab-btn" onClick={handleParseActivity} disabled={isProcessing || !plannerInput.trim()}>
                    {isProcessing ? <div className="spinner" /> : 'PROCESS'}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Schedule */}
          <section className="os-card glass-card col-span-2">
            <h3>Execution Queue</h3>
            <div className="os-schedule-viewport custom-scroll">
              {Object.entries(activitiesByDate).length === 0 ? (
                <div className="os-empty-state">No scheduled intents detected.</div>
              ) : (
                Object.entries(activitiesByDate).map(([date, items]) => (
                  <div key={date} className="os-date-segment">
                    <div className="segment-label">{date === new Date().toISOString().split('T')[0] ? 'TODAY' : new Date(date).toLocaleDateString()}</div>
                    <div className="segment-items">
                      {items.map(a => {
                        const isExpanded = expandingActivityId === a.id;
                        const statusColor = a.status === 'complete' ? '#10b981' : a.status === 'cancel' ? '#ef4444' : '#fff';

                        return (
                          <div key={a.id} className={`os-activity-row ${isExpanded ? 'is-expanded' : ''}`}>
                            <div className="row-indicator" style={{ background: DOMAIN_COLORS[a.domain] }} />
                            <div className="row-main">
                               <div className="row-header">
                                  <span className="row-time">{a.startTime} – {a.endTime}</span>
                                  <span className="row-domain" style={{ color: DOMAIN_COLORS[a.domain] }}>{a.domain}</span>
                               </div>
                               <span className="row-name">{a.name}</span>
                            </div>
                            <div className="row-action-area">
                               {isExpanded ? (
                                 <div className="row-menu animate-fade-in">
                                    <button onClick={() => updateActivityStatus(a.id, 'complete')} className="menu-btn-done">DONE</button>
                                    <button onClick={() => updateActivityStatus(a.id, 'partial')} className="menu-btn-partial">PARTIAL</button>
                                    <button onClick={() => updateActivityStatus(a.id, 'cancel')} className="menu-btn-cancel">VOID</button>
                                    <button onClick={() => deleteActivity(a.id)} className="menu-btn-del">DEL</button>
                                    <button onClick={() => setExpandingActivityId(null)} className="menu-btn-close">×</button>
                                 </div>
                               ) : (
                                 <button 
                                    className={`row-status-pill status-${a.status}`} 
                                    onClick={() => setExpandingActivityId(a.id)}
                                    style={{ color: statusColor }}
                                 >
                                    {a.status === 'planned' ? (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/></svg>
                                    ) : a.status === 'complete' ? (
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                    ) : (
                                      <span>{a.status.toUpperCase()}</span>
                                    )}
                                 </button>
                               )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Timeline */}
          <section className="os-card glass-card">
             <header className="os-card-header">
                <h3>Temporal Map</h3>
                <div className="os-mini-tabs">
                  {['day', 'week', 'month'].map(v => (
                    <button key={v} className={heatmapView === v ? 'is-active' : ''} onClick={() => setHeatmapView(v as any)}>{v.charAt(0)}</button>
                  ))}
                </div>
             </header>
             <div className="os-heatmap-container">
                {heatmapView === 'day' && (
                  <div className="os-grid-day">
                    {Array.from({ length: 24 }).map((_, h) => (
                      <div key={h} className="os-hour-cell">
                        <div className="cell-slots">
                          {[0, 1, 2, 3].map(s => {
                            const timeStr = `${h.toString().padStart(2, '0')}:${(s * 15).toString().padStart(2, '0')}`;
                            const today = new Date().toISOString().split('T')[0];
                            const act = activities.find(a => a.date === today && timeStr >= a.startTime && timeStr < a.endTime);
                            return (
                              <div 
                                key={s} 
                                className={`cell-dot ${act ? 'active' : ''}`} 
                                style={act ? { background: DOMAIN_COLORS[act.domain] } : {}}
                                onMouseMove={e => { setHoveredTask(act || null); setMousePos({ x: e.clientX, y: e.clientY }); }}
                                onMouseLeave={() => setHoveredTask(null)}
                              />
                            );
                          })}
                        </div>
                        <span className="cell-label">{h}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Week/Month views truncated for brevity, same refined style */}
                {(heatmapView === 'week' || heatmapView === 'month') && (
                  <div className="os-placeholder-view">View transition active...</div>
                )}
             </div>
          </section>
        </div>
      </div>

      {/* Overlays */}
      {hoveredTask && (
        <div className="os-instrument-tooltip" style={{ left: mousePos.x + 12, top: mousePos.y + 12 }}>
          <div className="tt-header" style={{ borderLeft: `2px solid ${DOMAIN_COLORS[hoveredTask.domain]}` }}>
            {hoveredTask.domain} • {hoveredTask.startTime}
          </div>
          <div className="tt-body">{hoveredTask.name}</div>
        </div>
      )}

      <LifePeriodBadge activePeriod={activePeriod} onClick={() => setIsDrawerOpen(true)} />

      {isDrawerOpen && (
        <div className="os-overlay-blur" onClick={() => setIsDrawerOpen(false)}>
          <div className="os-phase-drawer" onClick={e => e.stopPropagation()}>
            <header><h2>Life Configuration</h2><button onClick={() => setIsDrawerOpen(false)}>×</button></header>
            <div className="os-drawer-scroll">
              <div className="os-input-field">
                <label>Current Phase Objective</label>
                <input type="text" value={activePeriod?.title || ''} onChange={e => setLifePeriods(p => p.map(x => x.id === activePeriodId ? {...x, title: e.target.value} : x))} />
              </div>
              <div className="os-input-field">
                <label>Domain Bias (System Weights)</label>
                {DOMAINS.map(d => (
                  <div key={d} className="os-range-group">
                    <div className="range-label"><span>{d}</span> <span>{activePeriod?.weights[d]}%</span></div>
                    <input type="range" min="0" max="100" value={activePeriod?.weights[d]} onChange={e => updateWeight(d, parseInt(e.target.value))} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const formatDateLabel = (dateStr: string) => {
  const today = new Date().toISOString().split('T')[0];
  if (dateStr === today) return "TODAY";
  return new Date(dateStr).toLocaleDateString();
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}
