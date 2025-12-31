/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from '@google/genai';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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

  const [userLocation, setUserLocation] = useState(() => localStorage.getItem('os_user_location') || '');
  const lastFetchedLocation = useRef<string>('');

  // --- UI State ---
  const [activePeriodId] = useState<string>(lifePeriods[0]?.id || '');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [heatmapView, setHeatmapView] = useState<'day' | 'week' | 'month'>('day');
  const [plannerInput, setPlannerInput] = useState('');
  const [isPlannerFocused, setIsPlannerFocused] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewActivity, setPreviewActivity] = useState<Activity | null>(null);
  const [expandingActivityId, setExpandingActivityId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  
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
    weather: 'Location unset',
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
    localStorage.setItem('os_user_location', userLocation);
  }, [todos, scratchpad, userLocation]);

  // --- Toast Timer ---
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // --- Geolocation ---
  const detectLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        const resp = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `I am at coordinates ${latitude}, ${longitude}. What is the city and region name? Return ONLY the city and region name, nothing else.`,
        });
        const loc = resp.text?.trim();
        if (loc) {
          setUserLocation(loc);
          setToast(`Location Detected: ${loc}`);
        }
      } catch (e) {
        console.error("Geocoding failed", e);
      }
    });
  };

  // --- Intelligence Fetching ---
  const fetchIntelligence = async (forceWeather: boolean = false) => {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const now = new Date();
      const todayFull = now.toDateString();
      const currentYear = now.getFullYear();
      
      const newsResp = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `CONTEXT: Today is ${todayFull}, year ${currentYear}. Latest news for tech and world.`,
        config: { tools: [{ googleSearch: {} }] }
      });

      const newsChunks = newsResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const newsSources = newsChunks
        .filter(c => c.web)
        .map(c => ({ uri: c.web?.uri || '', title: c.web?.title || 'Source' }));

      let weatherText = intelligence.weather;
      if (userLocation && (forceWeather || userLocation !== lastFetchedLocation.current)) {
        const weatherResp = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Weather for ${userLocation}. Extremely brief, e.g. 'Sunny • 21°C'.`,
          config: { tools: [{ googleSearch: {} }] }
        });
        weatherText = weatherResp.text?.trim() || 'Unknown';
        lastFetchedLocation.current = userLocation;
      }

      setIntelligence({
        news: newsResp.text || 'Unable to load news.',
        weather: weatherText,
        newsSources,
      });
      setToast('Intelligence Sync Complete');
    } catch (e) {
      console.error(e);
      setIntelligence(prev => ({ ...prev, news: 'Feed synchronization failed.' }));
      setToast('Sync Failed');
    }
  };

  useEffect(() => {
    if (isSidebarOpen) {
      fetchIntelligence();
    }
  }, [isSidebarOpen]);

  // Trigger weather refresh when userLocation changes via dialog
  useEffect(() => {
    if (userLocation && userLocation !== lastFetchedLocation.current && isSidebarOpen) {
      fetchIntelligence(true);
    }
  }, [userLocation]);

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

  // Priority Insight logic
  const priorityInsight = useMemo(() => {
    if (!activePeriod || activities.length === 0) return { status: 'neutral', message: 'Operational baseline active.' };
    const dominantDomain = (Object.entries(activePeriod.weights).reduce((a, b) => a[1] > b[1] ? a : b)[0]) as Domain;
    const relevantActivities = activities.filter(a => a.domain === dominantDomain);
    const alignment = relevantActivities.length > 0 ? Math.round((relevantActivities.filter(a => a.status === 'complete').length / relevantActivities.length) * 100) : 0;
    
    if (alignment > 80) return { status: 'aligned', message: `High performance in ${dominantDomain}.` };
    if (alignment > 40) return { status: 'neutral', message: `Focus on ${dominantDomain} is moderate.` };
    return { status: 'divergent', message: `${dominantDomain} focus needs reinforcement.` };
  }, [activities, activePeriod]);

  const activitiesByDate = useMemo(() => {
    const groups: Record<string, Activity[]> = {};
    [...activities].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).forEach(a => {
      if (!groups[a.date]) groups[a.date] = [];
      groups[a.date].push(a);
    });
    return groups;
  }, [activities]);

  // --- Temporal Map Rendering Logic ---
  const renderTemporalMap = () => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    if (heatmapView === 'day') {
      const hourlyData = Array.from({ length: 24 }).map((_, hour) => {
        const hourStr = hour.toString().padStart(2, '0');
        return activities.filter(a => a.date === todayStr && a.startTime.startsWith(hourStr));
      });

      return (
        <div className="os-grid-day">
          {hourlyData.map((acts, h) => (
            <div key={h} className="os-hour-cell">
              <span className="cell-label">{h}:00</span>
              <div className="cell-indicators">
                {acts.map(a => (
                  <div key={a.id} className="cell-dot active" style={{ backgroundColor: DOMAIN_COLORS[a.domain] }} title={a.name} />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (heatmapView === 'week') {
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
      }

      return (
        <div className="os-grid-week">
          {days.map(date => {
            const dayActs = activities.filter(a => a.date === date);
            const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
            return (
              <div key={date} className="os-week-col">
                <span className="cell-label">{dayName}</span>
                <div className="os-week-bar">
                  {dayActs.map(a => (
                    <div key={a.id} className="bar-segment" style={{ backgroundColor: DOMAIN_COLORS[a.domain] }} title={a.name} />
                  ))}
                  {dayActs.length === 0 && <div className="bar-empty" />}
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (heatmapView === 'month') {
      const dates = [];
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const firstDay = new Date(currentYear, currentMonth, 1);
      const lastDay = new Date(currentYear, currentMonth + 1, 0);
      
      // Padding for calendar
      for (let i = 0; i < firstDay.getDay(); i++) dates.push(null);
      for (let i = 1; i <= lastDay.getDate(); i++) {
        dates.push(new Date(currentYear, currentMonth, i).toISOString().split('T')[0]);
      }

      return (
        <div className="os-grid-month">
          {['S','M','T','W','T','F','S'].map(d => <div key={d} className="cell-label">{d}</div>)}
          {dates.map((date, idx) => {
            if (!date) return <div key={`empty-${idx}`} className="os-month-cell empty" />;
            const dayActs = activities.filter(a => a.date === date);
            const intensity = Math.min(dayActs.length * 0.2, 1);
            const isToday = date === todayStr;
            return (
              <div key={date} className={`os-month-cell ${isToday ? 'is-today' : ''}`} style={{ backgroundColor: dayActs.length > 0 ? `rgba(59, 130, 246, ${0.1 + intensity * 0.4})` : 'transparent' }}>
                <span className="month-day-num">{new Date(date).getDate()}</span>
                {dayActs.length > 0 && <div className="month-dot" />}
              </div>
            );
          })}
        </div>
      );
    }
  };

  // --- Logic Handlers ---
  const handleParseActivity = async () => {
    if (!plannerInput.trim() || isProcessing) return;
    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const now = new Date();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Intent: "${plannerInput}". Context: ${now.toDateString()}. Priorities: ${JSON.stringify(activePeriod?.weights)}`,
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
      setToast('Parse Failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmActivity = () => {
    if (previewActivity) {
      setActivities(prev => [...prev, previewActivity]);
      setPreviewActivity(null);
      setPlannerInput('');
      setToast('Activity Committed');
    }
  };

  const updateActivityStatus = (id: string, status: ActivityStatus) => {
    setActivities(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    setExpandingActivityId(null);
  };

  const updateWeight = (domain: Domain, val: number) => {
    if (!activePeriod) return;
    setLifePeriods((prev: LifePeriod[]) => prev.map(p => p.id === activePeriodId ? { ...p, weights: { ...p.weights, [domain]: val } } : p));
  };

  const addTodo = () => {
    if (!todoInput.trim()) return;
    setTodos([{ id: generateId(), text: todoInput, done: false }, ...todos]);
    setTodoInput('');
  };

  return (
    <div className={`os-container ${isSidebarOpen ? 'sidebar-active' : ''}`}>
      
      <div className={`os-toast ${toast ? 'is-visible' : ''}`}>
        <div className="toast-content">{toast}</div>
      </div>

      <div className="os-sidebar-trigger" onClick={() => setIsSidebarOpen(true)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>

      <div className={`os-zen-sidebar ${isSidebarOpen ? 'is-open' : ''}`}>
        <button className="os-close-btn" onClick={() => setIsSidebarOpen(false)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="zen-content">
          {/* CLIMATE - Order 1 on Mobile */}
          <section className="zen-card glass-card zen-weather-small-box zen-area-climate">
            <header className="zen-header">
              <h3>CLIMATE</h3>
              <button className="zen-gps-btn-v2" onClick={detectLocation} title="Detect Location">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
               </button>
            </header>
            <div className="zen-weather-box-inner">
              <div className="weather-primary">
                <span className="weather-location-label">{userLocation || 'Location Unset'}</span>
                <div className="zen-weather-badge-v2">{intelligence.weather}</div>
              </div>
            </div>
          </section>

          {/* SIGNALS - Order 2 on Mobile */}
          <section className="zen-card glass-card zen-area-signals">
            <header className="zen-header">
              <h3>SIGNALS</h3>
              <button className="zen-minimal-refresh" onClick={() => fetchIntelligence(true)}>SYNC</button>
            </header>
            <div className="zen-intelligence custom-scroll">
              <div className="zen-news-feed">
                 {intelligence.news.split('\n').map((line, i) => <div key={i} className="news-line">{line}</div>)}
              </div>
            </div>
          </section>

          {/* FOCUS FLOW - Order 3 on Mobile */}
          <section className="zen-card glass-card zen-area-focus">
            <header className="zen-header"><h3>FOCUS FLOW</h3></header>
            <div className="zen-todo-input-group">
              <input value={todoInput} onChange={e => setTodoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="Queue objective..." />
              <button onClick={addTodo} className="zen-accent-btn">ADD</button>
            </div>
            <div className="zen-todo-list custom-scroll">
              {todos.map(t => (
                <div key={t.id} className={`zen-todo-item ${t.done ? 'is-done' : ''}`} onClick={() => setTodos(todos.map(x => x.id === t.id ? {...x, done: !x.done} : x))}>
                  <div className="zen-check" />
                  <span>{t.text}</span>
                  <button className="zen-trash" onClick={e => { e.stopPropagation(); setTodos(todos.filter(x => x.id !== t.id)); }}>×</button>
                </div>
              ))}
            </div>
          </section>

          {/* SCRATCHPAD - Order 4 on Mobile */}
          <section className="zen-card glass-card fill-height zen-area-scratch">
            <header className="zen-header"><h3>SCRATCHPAD</h3></header>
            <textarea 
              className="zen-scratchpad-instrument custom-scroll" 
              value={scratchpad} 
              onChange={e => setScratchpad(e.target.value)} 
              placeholder="Unstructured thoughts..." 
            />
          </section>
        </div>
      </div>

      <div className="os-main">
        <div className="os-banner-row">
          <header className={`os-status-banner ${integrityScore > 70 ? 'is-aligned' : 'is-neutral'}`}>
            <div className="banner-text">
              <h2>Integrity Engine</h2>
              <p>{integrityScore}% congruence.</p>
            </div>
          </header>
          <header className={`os-status-banner os-insight-banner is-${priorityInsight.status}`}>
            <div className="banner-text">
              <h2>Priority Insight</h2>
              <p>{priorityInsight.message}</p>
            </div>
          </header>
        </div>

        <div className="os-dashboard-grid">
          <section className="os-card glass-card">
            <h3>Status</h3>
            <div className="os-metric-box">
              <span className="metric-val-large">{integrityScore}<small>%</small></span>
              <div className="metric-track"><div className="metric-fill-v2" style={{ width: `${integrityScore}%` }} /></div>
            </div>
          </section>

          <section className="os-card glass-card col-span-2">
            <h3>Intent Planner</h3>
            <div className="os-planner-area">
              {previewActivity ? (
                <div className="os-ai-preview-card">
                  <h4>{previewActivity.name}</h4>
                  <div className="os-preview-actions">
                    <button className="btn-secondary" onClick={() => setPreviewActivity(null)}>Discard</button>
                    <button className="btn-primary-v2" onClick={confirmActivity}>Commit</button>
                  </div>
                </div>
              ) : (
                <div className="os-input-container">
                  <textarea className="os-textarea-v2" value={plannerInput} onChange={e => setPlannerInput(e.target.value)} placeholder="Capture next move..." />
                  <button className="os-fab-btn" onClick={handleParseActivity}>{isProcessing ? '...' : 'PROCESS'}</button>
                </div>
              )}
            </div>
          </section>

          <section className="os-card glass-card col-span-2">
            <h3>Execution Queue</h3>
            <div className="os-schedule-viewport custom-scroll">
              {Object.entries(activitiesByDate).map(([date, items]) => (
                <div key={date} className="os-date-segment">
                  <div className="segment-label">{date}</div>
                  {items.map(a => (
                    <div key={a.id} className="os-activity-row">
                      <div className="row-indicator" style={{ background: DOMAIN_COLORS[a.domain] }} />
                      <div className="row-main">
                        <span className="row-time">{a.startTime}</span>
                        <span className="row-name">{a.name}</span>
                      </div>
                      <button className="row-status-pill" onClick={() => updateActivityStatus(a.id, 'complete')}>
                        {a.status === 'complete' ? '✓' : '○'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>

          <section className="os-card glass-card">
             <header className="os-card-header">
                <h3>Temporal Map</h3>
                <div className="os-mini-tabs">
                  {['day', 'week', 'month'].map(v => (
                    <button key={v} className={heatmapView === v ? 'is-active' : ''} onClick={() => setHeatmapView(v as any)}>{v.charAt(0)}</button>
                  ))}
                </div>
             </header>
             <div className="os-heatmap-container custom-scroll">
                {renderTemporalMap()}
             </div>
          </section>
        </div>
      </div>

      <LifePeriodBadge activePeriod={activePeriod} onClick={() => setIsDrawerOpen(true)} />

      {isDrawerOpen && (
        <div className="os-overlay-blur" onClick={() => setIsDrawerOpen(false)}>
          <div className="os-phase-drawer" onClick={e => e.stopPropagation()}>
            <header><h2>Life Configuration</h2><button onClick={() => setIsDrawerOpen(false)}>&times;</button></header>
            <div className="os-drawer-scroll custom-scroll">
              <div className="os-input-field">
                <label>Context Location</label>
                <input type="text" value={userLocation} onChange={e => setUserLocation(e.target.value)} placeholder="e.g. London, UK" />
              </div>
              <div className="os-input-field">
                <label>Phase Objective</label>
                <input type="text" value={activePeriod?.title || ''} onChange={e => setLifePeriods(p => p.map(x => x.id === activePeriodId ? {...x, title: e.target.value} : x))} />
              </div>
              <div className="os-input-field">
                <label>Domain Weights</label>
                {DOMAINS.map(d => {
                  const weight = activePeriod?.weights[d] || 0;
                  return (
                    <div 
                      key={d} 
                      className="os-range-group" 
                      style={{ '--domain-color': DOMAIN_COLORS[d], '--range-val': `${weight}%` } as React.CSSProperties}
                    >
                      <div className="range-label">
                        <span>{d}</span> 
                        <span className="range-percent">{weight}%</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={weight} 
                        onChange={e => updateWeight(d, parseInt(e.target.value))} 
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}