
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
  const [hoveredTask, setHoveredTask] = useState<Activity | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  
  // Partial Capture State
  const [partialTarget, setPartialTarget] = useState<Activity | null>(null);
  const [partialTimes, setPartialTimes] = useState({ start: '', end: '' });

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
          setToast(`Location: ${loc}`);
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
        contents: `CONTEXT: Today is ${todayFull}, year ${currentYear}. 
        TASK: Fetch exactly the latest news for TODAY and significant events from THIS WEEK. 
        FORMAT:
        1. List 2 major headlines for TODAY (prefix with "TODAY [Date]:").
        2. List 3 major headlines for THIS WEEK (prefix with "THIS WEEK [Date]:").
        CATEGORIES: AI/Tech, World News, Politics. 
        RULES: No markdown like ### or **. Include the specific date for every headline. Be concise. Do not fetch news from previous years.`,
        config: { tools: [{ googleSearch: {} }] }
      });

      const newsChunks = newsResp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const newsSources = newsChunks
        .filter(c => c.web)
        .map(c => ({ uri: c.web?.uri || '', title: c.web?.title || 'Source' }));

      let weatherText = intelligence.weather;
      // Only fetch weather if location set and it's either forced or location changed
      if (userLocation && (forceWeather || userLocation !== lastFetchedLocation.current)) {
        const weatherPrompt = `Provide the current weather for ${userLocation}. Extremely brief, e.g. 'Sunny • 21°C'. Do NOT repeat the city name if you can avoid it.`;
        const weatherResp = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: weatherPrompt,
          config: { tools: [{ googleSearch: {} }] }
        });
        weatherText = weatherResp.text?.trim() || 'Unknown';
        lastFetchedLocation.current = userLocation;
      } else if (!userLocation) {
        weatherText = 'Location unset';
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
      // Auto fetch news, but only fetch weather if it's the first time or location changed
      fetchIntelligence();
    }
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

  // --- Priority Alignment Insight ---
  const priorityInsight = useMemo(() => {
    if (!activePeriod || activities.length === 0) {
      return { status: 'neutral', message: 'Operational baseline active.' };
    }

    const domainDistribution: Record<Domain, number> = {
      Work: 0, Health: 0, Sleep: 0, Leisure: 0, Relationships: 0
    };
    
    activities.forEach(a => {
      domainDistribution[a.domain] += 1;
    });

    const total = activities.length;
    const actualPercentages = Object.fromEntries(
      Object.entries(domainDistribution).map(([d, count]) => [d, (count / total) * 100])
    ) as Record<Domain, number>;

    // Find largest negative delta (deficit)
    let maxDeficit = -1;
    let deficitDomain: Domain | null = null;

    Object.entries(activePeriod.weights).forEach(([d, target]) => {
      const actual = actualPercentages[d as Domain];
      const delta = target - actual;
      if (delta > maxDeficit) {
        maxDeficit = delta;
        deficitDomain = d as Domain;
      }
    });

    if (maxDeficit > 15 && deficitDomain) {
      return {
        status: 'warning',
        message: `Prioritize ${deficitDomain}. Current allocation lags target by ${Math.round(maxDeficit)}%.`
      };
    }

    // Find largest positive delta (over-indexing)
    let maxSurplus = -1;
    let surplusDomain: Domain | null = null;
    Object.entries(activePeriod.weights).forEach(([d, target]) => {
      const actual = actualPercentages[d as Domain];
      const delta = actual - target;
      if (delta > 20) {
        maxSurplus = delta;
        surplusDomain = d as Domain;
      }
    });

    if (maxSurplus > 20 && surplusDomain) {
      return {
        status: 'caution',
        message: `${surplusDomain} dominance detected. System approaching imbalance.`
      };
    }

    return { status: 'aligned', message: 'Current actions reflect phase priorities.' };
  }, [activities, activePeriod]);

  // --- Temporal Map Logic ---
  const weekSummary = useMemo(() => {
    if (heatmapView !== 'week') return null;

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - 6);
    weekStart.setHours(0,0,0,0);
    
    const weekActs = activities.filter(a => {
      const d = new Date(a.date);
      return d.getTime() >= weekStart.getTime() && d.getTime() <= today.getTime();
    });

    if (weekActs.length === 0) return { dominant: 'None', topThree: [] };

    const domainCounts: Record<string, number> = {} as any;
    weekActs.forEach(a => domainCounts[a.domain] = (domainCounts[a.domain] || 0) + 1);
    const dominant = ((Object.entries(domainCounts) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None') as Domain;

    const taskCounts: Record<string, number> = {};
    weekActs.forEach(a => taskCounts[a.name] = (taskCounts[a.name] || 0) + 1);
    const topThree = (Object.entries(taskCounts) as [string, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

    return { dominant, topThree };
  }, [activities, heatmapView]);

  const weekGridData = useMemo(() => {
    if (heatmapView !== 'week') return [];
    const dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
  }, [heatmapView]);

  const monthGridData = useMemo(() => {
    if (heatmapView !== 'month') return [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const dates = [];
    // Padding for Monday start
    let startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    for(let i=0; i<startPadding; i++) dates.push(null);

    for(let i=1; i<=lastDay.getDate(); i++) {
      dates.push(new Date(year, month, i).toISOString().split('T')[0]);
    }
    return dates;
  }, [heatmapView]);

  const monthSummary = useMemo(() => {
    if (heatmapView !== 'month') return null;
    const today = new Date();
    const monthStr = today.toISOString().slice(0, 7);
    const monthActs = activities.filter(a => a.date.startsWith(monthStr));
    
    if (monthActs.length === 0) return { total: 0, dominant: 'None' };

    const domainCounts: Record<string, number> = {} as any;
    monthActs.forEach(a => domainCounts[a.domain] = (domainCounts[a.domain] || 0) + 1);
    const dominant = ((Object.entries(domainCounts) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None') as Domain;

    return { total: monthActs.length, dominant };
  }, [activities, heatmapView]);

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
    if (status === 'complete') {
      setCompletingId(id);
      setTimeout(() => {
        setActivities(prev => prev.map(a => a.id === id ? { ...a, status } : a));
        setCompletingId(null);
        setExpandingActivityId(null);
      }, 600); 
    } else if (status === 'partial') {
      const act = activities.find(a => a.id === id);
      if (act) {
        setPartialTarget(act);
        setPartialTimes({ start: act.startTime, end: act.endTime });
      }
    } else {
      setActivities(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      setExpandingActivityId(null);
    }
  };

  const handleSavePartial = () => {
    if (!partialTarget) return;
    setActivities(prev => prev.map(a => 
      a.id === partialTarget.id 
      ? { ...a, status: 'partial', actualStartTime: partialTimes.start, actualEndTime: partialTimes.end } 
      : a
    ));
    setPartialTarget(null);
    setExpandingActivityId(null);
  };

  const deleteActivity = (id: string) => {
    setActivities(prev => prev.filter(a => a.id !== id));
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
      
      {/* Toast Notification */}
      <div className={`os-toast ${toast ? 'is-visible' : ''}`}>
        <div className="toast-content">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '8px' }}>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {toast}
        </div>
      </div>

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
            {/* Weather Card - The requested 'Small Box' */}
            <section className="zen-card glass-card zen-weather-small-box">
              <header className="zen-header">
                <h3>CLIMATE</h3>
                <div className="zen-signals-meta">
                   <button className="zen-minimal-refresh" onClick={() => fetchIntelligence(true)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                </div>
              </header>
              <div className="zen-weather-box-inner">
                <div className="weather-primary">
                  <span className="weather-location-label">{userLocation || 'Location Unset'}</span>
                  <div className="zen-weather-badge-v2">{intelligence.weather}</div>
                </div>
                <button className="zen-gps-btn-v2" onClick={detectLocation} title="Detect Location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                </button>
              </div>
            </section>

            <section className="zen-card glass-card">
              <header className="zen-header">
                <h3>FOCUS FLOW</h3>
              </header>
              <div className="zen-todo-input-group">
                <input 
                  type="text" 
                  value={todoInput} 
                  onChange={e => setTodoInput(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && addTodo()}
                  placeholder="Queue new objective..." 
                />
                <button onClick={addTodo} className="zen-accent-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '6px' }}>
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" />
                  </svg>
                  ADD
                </button>
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
          </div>

          <div className="zen-col">
            <section className="zen-card glass-card">
              <header className="zen-header">
                <h3>SIGNALS</h3>
                <div className="zen-signals-meta">
                  <button className="zen-minimal-refresh" onClick={() => fetchIntelligence()}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ marginRight: '6px' }}>
                      <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    REFRESH
                  </button>
                </div>
              </header>
              <div className="zen-intelligence custom-scroll">
                <div className="zen-news-feed">
                   {intelligence.news.split('\n').filter(line => line.trim() !== '').map((line, i) => (
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
        <div className="os-banner-row">
          <header className={`os-status-banner ${integrityScore > 70 ? 'is-aligned' : 'is-neutral'}`}>
            <div className="banner-icon">
               <div className="pulse-circle" />
            </div>
            <div className="banner-text">
              <h2>Integrity Engine</h2>
              <p>{integrityScore}% congruence.</p>
            </div>
          </header>

          <header className={`os-status-banner os-insight-banner is-${priorityInsight.status}`}>
            <div className="banner-icon">
               <div className="pulse-circle" />
            </div>
            <div className="banner-text">
              <h2>Priority Insight</h2>
              <p>{priorityInsight.message}</p>
            </div>
          </header>
        </div>

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

          <section className={`os-card glass-card col-span-2 ${isPlannerFocused || plannerInput || previewActivity ? 'is-focused' : ''}`}>
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
                    onFocus={() => setIsPlannerFocused(true)}
                    onBlur={() => setIsPlannerFocused(false)}
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
          <section className={`os-card glass-card col-span-2 ${expandingActivityId ? 'is-focused' : ''}`}>
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
                        const isCompleting = completingId === a.id;
                        const statusColor = a.status === 'complete' ? '#10b981' : a.status === 'cancel' ? '#ef4444' : '#fff';

                        return (
                          <div key={a.id} className={`os-activity-row ${isExpanded ? 'is-expanded' : ''} ${isCompleting ? 'is-completing' : ''} status-${a.status}`}>
                            <div className="row-indicator" style={{ background: DOMAIN_COLORS[a.domain] }} />
                            <div className="row-main">
                               <div className="row-header">
                                  <span className="row-time">
                                    {a.startTime} – {a.endTime}
                                    {a.status === 'partial' && a.actualStartTime && (
                                      <span className="row-actual-time"> 
                                        (Actual: {a.actualStartTime} – {a.actualEndTime})
                                      </span>
                                    )}
                                  </span>
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
                
                {heatmapView === 'week' && (
                  <div className="os-heatmap-week-container custom-scroll-x">
                    <div className="os-grid-week">
                      {weekGridData.map((date, idx) => (
                        <div key={date} className="os-week-col">
                          <div className="os-week-slots">
                            {Array.from({ length: 24 }).map((_, h) => {
                               const timeStr = `${h.toString().padStart(2, '0')}:00`;
                               const act = activities.find(a => a.date === date && timeStr >= a.startTime && timeStr < a.endTime);
                               return (
                                 <div 
                                   key={h} 
                                   className={`week-dot ${act ? 'active' : ''}`} 
                                   style={act ? { background: DOMAIN_COLORS[act.domain] } : {}}
                                   onMouseMove={e => { setHoveredTask(act || null); setMousePos({ x: e.clientX, y: e.clientY }); }}
                                   onMouseLeave={() => setHoveredTask(null)}
                                 />
                               );
                            })}
                          </div>
                          <span className="week-label">{['M', 'T', 'W', 'T', 'F', 'S', 'S'][idx]}</span>
                        </div>
                      ))}
                    </div>
                    {weekSummary && (
                      <div className="os-view-summary animate-fade-in">
                        <div className="summary-section">
                           <label>Week Dominant</label>
                           <div className="summary-val">
                             <DomainIcon domain={weekSummary.dominant as Domain} />
                             <span>{weekSummary.dominant}</span>
                           </div>
                        </div>
                        <div className="summary-section">
                           <label>Primary Intent</label>
                           <div className="summary-tags">
                             {weekSummary.topThree.length > 0 ? (
                               weekSummary.topThree.map(t => <span key={t} className="summary-tag">{t}</span>)
                             ) : (
                               <span className="os-muted">None detected</span>
                             )}
                           </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {heatmapView === 'month' && (
                  <div className="os-heatmap-month-container">
                     <div className="os-grid-month">
                        {['M','T','W','T','F','S','S'].map(d => <div key={d} className="month-day-head">{d}</div>)}
                        {monthGridData.map((date, idx) => {
                          if (!date) return <div key={`empty-${idx}`} className="os-month-cell empty" />;
                          
                          const dayActs = activities.filter(a => a.date === date);
                          const dominant = dayActs.length > 0 
                            ? (Object.entries(dayActs.reduce((acc, a) => ({...acc, [a.domain]: (acc[a.domain] || 0) + 1}), {} as any)) as [string, number][])
                                .sort((a, b) => b[1] - a[1])[0][0] as Domain
                            : null;

                          return (
                            <div key={date} className="os-month-cell">
                               <span className="month-date-num">{new Date(date).getDate()}</span>
                               {dominant && <div className="month-indicator-dot" style={{ backgroundColor: DOMAIN_COLORS[dominant] }} />}
                            </div>
                          );
                        })}
                     </div>
                     {monthSummary && (
                        <div className="os-view-summary animate-fade-in">
                           <div className="summary-section">
                              <label>Month Dominant</label>
                              <div className="summary-val">
                                <DomainIcon domain={monthSummary.dominant as Domain} />
                                <span>{monthSummary.dominant}</span>
                              </div>
                           </div>
                           <div className="summary-section">
                              <label>Total Commits</label>
                              <span className="summary-count-val">{monthSummary.total} intents</span>
                           </div>
                        </div>
                     )}
                  </div>
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

      {/* Partial Capture Modal */}
      {partialTarget && (
        <div className="os-overlay-blur" onClick={() => setPartialTarget(null)}>
          <div className="os-partial-modal animate-slide-up" onClick={e => e.stopPropagation()}>
            <header>
               <div className="modal-indicator" style={{ background: DOMAIN_COLORS[partialTarget.domain] }} />
               <h3>Capture Deviation</h3>
            </header>
            <div className="modal-body">
               <p>Record actual time spent on <strong>{partialTarget.name}</strong></p>
               <div className="temporal-input-row">
                 <div className="os-input-field">
                   <label>Actual Start</label>
                   <input type="time" value={partialTimes.start} onChange={e => setPartialTimes({ ...partialTimes, start: e.target.value })} />
                 </div>
                 <div className="os-input-field">
                   <label>Actual End</label>
                   <input type="time" value={partialTimes.end} onChange={e => setPartialTimes({ ...partialTimes, end: e.target.value })} />
                 </div>
               </div>
               <div className="modal-footer">
                  <button className="btn-secondary" onClick={() => setPartialTarget(null)}>Discard</button>
                  <button className="btn-primary-v2" onClick={handleSavePartial}>Log Execution</button>
               </div>
            </div>
          </div>
        </div>
      )}

      <LifePeriodBadge activePeriod={activePeriod} onClick={() => setIsDrawerOpen(true)} />

      {isDrawerOpen && (
        <div className="os-overlay-blur" onClick={() => setIsDrawerOpen(false)}>
          <div className="os-phase-drawer" onClick={e => e.stopPropagation()}>
            <header><h2>Life Configuration</h2><button onClick={() => setIsDrawerOpen(false)}>&times;</button></header>
            <div className="os-drawer-scroll custom-scroll">
              <div className="os-input-field">
                <label>Default Location (Geo-Context)</label>
                <input 
                  type="text" 
                  value={userLocation} 
                  onChange={e => setUserLocation(e.target.value)} 
                  placeholder="e.g. London, UK"
                />
              </div>
              <div className="os-input-field">
                <label>Current Phase Objective</label>
                <input 
                  type="text" 
                  value={activePeriod?.title || ''} 
                  onChange={e => setLifePeriods((p: LifePeriod[]) => p.map(x => x.id === activePeriodId ? {...x, title: e.target.value} : x))} 
                />
              </div>
              <div className="os-input-field">
                <label>Domain Bias (System Weights)</label>
                {DOMAINS.map(d => (
                  <div key={d} className="os-range-group">
                    <div className="range-label"><span>{d}</span> <span>{activePeriod?.weights[d]}%</span></div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={activePeriod?.weights[d]} 
                      onChange={e => updateWeight(d, parseInt(e.target.value))} 
                    />
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
