/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, Type } from '@google/genai';
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { Activity, LifePeriod, Domain, ActivityStatus, Goal } from './types';
import { DOMAINS, DEFAULT_WEIGHTS, DOMAIN_COLORS } from './constants';
import { generateId } from './utils';
import Login from './components/Login';
import { auth, db } from './firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { User } from 'firebase/auth';
import { SignalIcon, ThinkingIcon } from './components/Icons';
import GoalsPanel from './components/GoalsPanel';
import DayReviewPanel from './components/DayReviewPanel';
import { haptic } from "@/utils/haptics";

// import { apiKey } from './config';



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
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
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
  const [user, setUser] = useState<User | null>(null);


  // --- Global State ---
  const [lifePeriods, setLifePeriods] = useState<LifePeriod[]>([{
    id: 'initial',
    title: 'Rest & Recover',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    weights: { ...DEFAULT_WEIGHTS, Sleep: 40, Health: 30 }
  }]);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [userLocation, setUserLocation] = useState('');
  const lastFetchedLocation = useRef<string>('');

  // --- UI State ---
  const [activePeriodId] = useState<string>(lifePeriods[0]?.id || '');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isGoalsPanelOpen, setIsGoalsPanelOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [heatmapView, setHeatmapView] = useState<'day' | 'week' | 'month'>('day');
  const [plannerInput, setPlannerInput] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewActivity, setPreviewActivity] = useState<Activity | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Add this around line 82 in index.tsx
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(null);
  // Add this line around line 84
  const [isIntelligenceLoading, setIsIntelligenceLoading] = useState(true);
  const [now, setNow] = useState(new Date()); // ADD THIS

  // --- Sidebar Specific State ---
  const [todos, setTodos] = useState<{ id: string, text: string, done: boolean }[]>([]);
  const [scratchpad, setScratchpad] = useState('');
  const [todoInput, setTodoInput] = useState('');

  // Add these lines around line 87 in index.tsx
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  // Add this line around line 97 in index.tsx
  const isInitialCollapseSet = useRef(false);

  const [isReviewPanelOpen, setIsReviewPanelOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<Activity[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const getLocalYYYYMMDD = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast(null);
    }, 3000); // The toast will disappear after 3 seconds
  };



  const toggleDateCollapse = (date: string) => {
    setCollapsedDates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(date)) {
        newSet.delete(date);
      } else {
        newSet.add(date);
      }
      return newSet;
    });
  };


  const [intelligence, setIntelligence] = useState<{
    news: {
      today: { headline: string; category: string; date: string; }[];
      weeklyWorld: { headline: string; category: string; date: string; }[];
      weeklyIndia: { headline: string; category: string; date: string; }[];
    };
    weather: string;
    newsSources: { uri: string; title: string }[];
  }>({
    news: { today: [], weeklyWorld: [], weeklyIndia: [] },
    weather: 'Fetching Weather',
    newsSources: [],
  });


  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // --- Data Persistence ---

  // Load user data from Firestore
  useEffect(() => {
    const loadData = async () => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      // --- Load Goals Subcollection ---
      const goalsColRef = collection(db, 'users', user.uid, 'goals');
      const goalsSnapshot = await getDocs(goalsColRef);
      const loadedGoals = goalsSnapshot.docs.map(doc => doc.data() as Goal);
      setGoals(loadedGoals);
      // --- End Goal Loading ---

      if (docSnap.exists()) {
        const userData = docSnap.data();
        setLifePeriods(userData.lifePeriods || lifePeriods);
        setActivities(userData.activities || []);
        setTodos(userData.todos || []);
        setScratchpad(userData.scratchpad || '');
        setUserLocation(userData.userLocation || '');
      } else {
        console.log("No user data document found, starting fresh.");
      }
    };
    loadData();
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // Update time every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 1);
  }, []);


  // Save scratchpad with a debounce
  useEffect(() => {
    const handler = setTimeout(() => {
      if (user && scratchpad !== '') {
        const docRef = doc(db, 'users', user.uid);
        setDoc(docRef, { scratchpad: scratchpad }, { merge: true });
      }
    }, 1500);
    return () => clearTimeout(handler);
  }, [scratchpad, user]);

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
      // const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY as string });


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
  // Replace the entire fetchIntelligence function with this one
  // Replace the entire fetchIntelligence function with this new version:

  const fetchIntelligence = async (forceWeather: boolean = false) => {
    setIsIntelligenceLoading(true); // Start loading
    try {
      // const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY as string });


      const now = new Date();
      const todayFull = now.toDateString();
      const currentYear = now.getFullYear();

      // 1. Fetch News
      const newsResp = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `
        CONTEXT: Today is ${todayFull}, year ${currentYear}.
        TASK: Provide a JSON object with three keys: "today", "weeklyWorld", and "weeklyIndia".
        - "today": array of 2-3 brief tech/world news items for today.
        - "weeklyWorld": array of 3-4 brief important world news items for the week.
        - "weeklyIndia": array of 3-4 brief important India news items for the week.
        Each item must be a JSON object with "headline", "category", and "date" string properties.
        CRITICAL: Respond with ONLY the raw JSON object.
      `,
        config: { tools: [{ googleSearch: {} }] }
      });

      let parsedNews = { today: [], weeklyWorld: [], weeklyIndia: [] };
      try {
        const rawJson = newsResp.text.replace(/```json\n?/g, '').replace(/```/g, '');
        parsedNews = JSON.parse(rawJson);
      } catch (e) {
        console.error("Failed to parse news JSON:", e);
      }

      // 2. Fetch Weather
      let weatherText = intelligence.weather;
      if (userLocation && (forceWeather || userLocation !== lastFetchedLocation.current)) {
        const weatherResp = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Weather for ${userLocation}. Extremely brief, e.g. 'Sunny • 21°C'.`,
          config: { tools: [{ googleSearch: {} }] }
        });
        weatherText = weatherResp.text?.trim() || 'Unknown';
        lastFetchedLocation.current = userLocation; // IMPORTANT: Remember the location we fetched for
      }

      // 3. Set Final State
      setIntelligence({
        news: parsedNews,
        weather: weatherText,
        newsSources: [],
      });

    } catch (error) {
      console.error("Error fetching intelligence data:", error);
      setIntelligence(prev => ({ ...prev, weather: 'Error' }));
    } finally {
      setIsIntelligenceLoading(false); // Stop loading
    }
  };



  // REPLACE the two useEffects from line 257-270 with these:

  useEffect(() => {
    // When the user is loaded, automatically try to detect their location.
    // Also, run an initial fetch for news.
    if (user) {
      detectLocation();
      fetchIntelligence();
    }
  }, [user]);

  useEffect(() => {
    // This hook triggers ONLY when the user's location changes.
    // It forces a refetch of intelligence data, which will now include the weather.
    if (userLocation && userLocation !== lastFetchedLocation.current) {
      fetchIntelligence(true); // `true` forces a weather update
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

  // Add this hook around line 292 in index.tsx
  const statusGlowClass = useMemo(() => {
    if (integrityScore < 50) return 'glow-red';
    if (integrityScore <= 80) return 'glow-yellow';
    return 'glow-green';
  }, [integrityScore]);


  const priorityInsight = useMemo(() => {
    if (!activePeriod || activities.length === 0) return { status: 'neutral', message: 'Operational baseline active.' };
    const dominantDomain = (Object.entries(activePeriod.weights).reduce((a, b) => a[1] > b[1] ? a : b)[0]) as Domain;
    const relevantActivities = activities.filter(a => a.domain === dominantDomain);
    const alignment = relevantActivities.length > 0 ? Math.round((relevantActivities.filter(a => a.status === 'complete').length / relevantActivities.length) * 100) : 0;

    if (alignment > 80) return { status: 'aligned', message: `High performance in ${dominantDomain}.` };
    if (alignment > 40) return { status: 'neutral', message: `Focus on ${dominantDomain} is moderate.` };
    return { status: 'divergent', message: `${dominantDomain} focus needs reinforcement.` };
  }, [activities, activePeriod]);

  // Add this new useMemo hook around line 307
  const weeklyInsight = useMemo(() => {
    const today = new Date();
    // Week starts on Sunday (day 0)
    const dayOfWeek = today.getDay();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyActivities = activities.filter(a => {
      // Ensure activity date is on or after the start of the week
      const activityDate = new Date(a.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= startOfWeek;
    });

    if (weeklyActivities.length === 0) {
      return { status: 'neutral', message: 'No activities tracked this week.' };
    }

    const completed = weeklyActivities.filter(a => a.status === 'complete').length;
    const partial = weeklyActivities.filter(a => a.status === 'partial').length;

    // We base the score on all activities that were not cancelled
    const totalCommitted = weeklyActivities.filter(a => a.status !== 'cancel').length;

    if (totalCommitted === 0) {
      return { status: 'neutral', message: 'Ready for a new week.' };
    }

    const score = Math.round(((completed + partial * 0.5) / totalCommitted) * 100);

    if (score > 85) return { status: 'aligned', message: `Excellent week! ${score}% task completion.` };
    if (score > 65) return { status: 'aligned', message: `Strong week. ${score}% completion.` };
    if (score > 40) return { status: 'neutral', message: `Steady progress. ${score}% completion.` };
    return { status: 'divergent', message: `Momentum needed. ${score}% completion.` };
  }, [activities]);

  const goalInsight = useMemo(() => {
    const activeGoals = goals.filter(g => g.status === 'in_progress' || g.status === 'at_risk');
    if (activeGoals.length === 0) {
      return { status: 'neutral', message: 'No active goals defined.' };
    }

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyActivities = activities.filter(a => new Date(a.date) >= startOfWeek);

    const neglectedGoals = activeGoals.filter(goal =>
      !weeklyActivities.some(act => act.goalId === goal.id)
    );

    if (neglectedGoals.length > 0) {
      const mostRecentNeglected = neglectedGoals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      const todayStr = getLocalYYYYMMDD(now);

      const todaysActivities = activities
        .filter(a => a.date === todayStr)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));

      let freeSlotStart: Date | null = null;
      let searchTime = new Date(now.getTime() + 5 * 60000); // Start looking 5 mins from now

      for (let i = 0; i < 48; i++) { // Check next 12 hours
        const slotToTest = new Date(searchTime.getTime() + i * 15 * 60000);
        const slotEnd = new Date(slotToTest.getTime() + 30 * 60000);

        if (slotToTest.getHours() > 22 || slotToTest.getHours() < 7) continue;

        const isOverlapping = todaysActivities.some(act => {
          const actStart = new Date(`${todayStr}T${act.startTime}`);
          const actEnd = new Date(`${todayStr}T${act.endTime}`);
          return slotToTest < actEnd && slotEnd > actStart;
        });

        if (!isOverlapping) {
          freeSlotStart = slotToTest;
          break;
        }
      }

      if (freeSlotStart) {
        const startTimeStr = freeSlotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        return {
          status: 'divergent',
          message: `Free near ${startTimeStr}. Time for: \"${mostRecentNeglected.title}\"?`
        };
      }

      return {
        status: 'divergent',
        message: `Focus needed on: \"${mostRecentNeglected.title}\"`
      };
    }

    return { status: 'aligned', message: 'All goals have tracked activity.' };

  }, [now, activities, goals, getLocalYYYYMMDD]);



  const currentTaskInsight = useMemo(() => {
    const todayStr = getLocalYYYYMMDD(now);
    const todaysActivities = activities
      .filter(a => a.date === todayStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (todaysActivities.length === 0) {
      return { title: 'OPEN DAY', message: 'No tasks scheduled. Plan your next move.' };
    }

    for (const activity of todaysActivities) {
      const startTime = new Date(`${activity.date}T${activity.startTime}`);
      const endTime = new Date(`${activity.date}T${activity.endTime}`);

      if (now >= startTime && now <= endTime) {
        const minutesLeft = Math.round((endTime.getTime() - now.getTime()) / 60000);
        return {
          title: 'IN PROGRESS',
          message: `${activity.name} (ends in ${minutesLeft} min)`
        };
      }
    }

    const upcomingActivities = todaysActivities.filter(a => {
      const startTime = new Date(`${a.date}T${a.startTime}`);
      return startTime > now;
    });

    if (upcomingActivities.length > 0) {
      const nextActivity = upcomingActivities[0];
      return {
        title: `UP NEXT (${nextActivity.startTime})`,
        message: `${nextActivity.name}`
      };
    }

    return { title: 'FOCUS COMPLETE', message: 'All tasks for today are done. Well done.' };
  }, [now, activities, getLocalYYYYMMDD]);


  const activitiesByDate = useMemo(() => {
    const groups: Record<string, Activity[]> = {};
    [...activities].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).forEach(a => {
      if (!groups[a.date]) groups[a.date] = [];
      groups[a.date].push(a);
    });
    return groups;
  }, [activities]);

  const triggerDayReview = async () => {
    // Prevent re-triggering if already open
    if (isReviewPanelOpen || isGeneratingSuggestions) return;

    localStorage.setItem('lastReviewDate', getLocalYYYYMMDD(now));
    setIsGeneratingSuggestions(true);
    setAiSuggestions([]);
    setIsReviewPanelOpen(true);

    const todayStr = getLocalYYYYMMDD(now);
    const tomorrowStr = getLocalYYYYMMDD(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    const todaysActivities = activities.filter(a => a.date === todayStr);
    const tomorrowsExistingActivities = activities.filter(a => a.date === tomorrowStr);

    // Construct a detailed summary of the user's day for the AI
    const prompt = `
      Based on my performance today and my overall goals, create a schedule for tomorrow.

      My Overall Goal Domains (higher weight means more important):
      ${JSON.stringify(activePeriod?.weights, null, 2)}

      My Active Goals:
      ${goals.filter(g => g.status === 'in_progress' || g.status === 'at_risk').map(g => {
      const metricString = g.metric
        ? `(Progress: ${g.metric.current}${g.metric.unit} -> Target: ${g.metric.target}${g.metric.unit})`
        : '';
      return `- ${g.title} [${g.category}] ${metricString}`;
    }).join('\\n') || 'None'}
      
      Today's (${todayStr}) Performance Summary:
      - Integrity Score: ${integrityScore}%
      - Goal Insight: ${goalInsight.message}
      - Priority Insight: ${priorityInsight.message}
      - Activities Executed: ${todaysActivities.filter(a => a.status === 'complete').length}
      - Activities Missed: ${todaysActivities.filter(a => a.status === 'missed' || a.status === 'partial').length}

      Tomorrow's (${tomorrowStr}) Existing Commitments (do not schedule over these):
      ${tomorrowsExistingActivities.map(a => `- ${a.name} from ${a.startTime} to ${a.endTime}`).join('\\n') || 'None'}

      INSTRUCTIONS:
      1. Analyze my performance, especially the goal and priority insights.
      2. Identify which goals I neglected or which metrics are lagging.
      3. Create a list of 2-4 suggested activities for tomorrow that will help me get back on track with my goals. Pay special attention to the metrics. For example, if a weight loss goal is lagging, suggest a 'Workout' activity.
      4. Place these activities in logical, empty time slots, avoiding my existing commitments.
      5. VERY IMPORTANT: Respond ONLY with a valid JSON array of "Activity" objects. Do not include any other text, explanation, or markdown. The structure for each activity must be: { "id": "uuid", "name": "...", "date": "${tomorrowStr}", "startTime": "HH:MM", "endTime": "HH:MM", "domain": "...", "status": "planned", "goalId": "null | string" }
    `;

    try {
      // Assuming generateIntent is a function that calls the AI model
      const result = await generateIntent(prompt, "planner");
      const suggested = JSON.parse(result.response) as Activity[];

      // Ensure the suggestions are valid and for tomorrow
      const validSuggestions = suggested.filter(s => s.date === tomorrowStr);
      setAiSuggestions(validSuggestions);

    } catch (error) {
      console.error("Error generating AI suggestions:", error);
      showToast("Failed to generate plan for tomorrow.");
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };


  const handleCommitToTomorrow = (suggestedActivities: Activity[]) => {
    setActivities(prev => [...prev, ...suggestedActivities]);
    setIsReviewPanelOpen(false);
    showToast("Tomorrow's plan is committed. See you then!");
  };



  useEffect(() => {
    const REVIEW_HOUR = 20; // 8 PM
    const lastReview = localStorage.getItem('lastReviewDate');
    const todayStr = getLocalYYYYMMDD(now);

    if (now.getHours() >= REVIEW_HOUR && lastReview !== todayStr) {
      triggerDayReview();
    }
  }, [now]); // This effect runs every minute because `now` updates


  // Add this useEffect block around line 305
  useEffect(() => {
    const allDates = Object.keys(activitiesByDate);
    // Set the initial collapsed state once activities are loaded
    if (allDates.length > 0 && !isInitialCollapseSet.current) {
      // const today = new Date().toISOString().split('T')[0];
      const today = getLocalYYYYMMDD(new Date());

      const datesToCollapse = allDates.filter(date => date !== today);
      setCollapsedDates(new Set(datesToCollapse));
      isInitialCollapseSet.current = true;
    }
  }, [activitiesByDate]);


  // --- Helper for activity overlap detection ---
  const getActivityOverlap = (activity: Activity, slotStart: number, slotEnd: number): boolean => {
    const sParts = activity.startTime.split(':');
    const eParts = activity.endTime.split(':');
    const sH = parseInt(sParts[0]);
    const sM = parseInt(sParts[1]) || 0;
    const eH = parseInt(eParts[0]);
    const eM = parseInt(eParts[1]) || 0;

    const startTotal = sH + (sM / 60);
    const endTotal = eH + (eM / 60);

    // Overlap condition: Activity starts before slot ends AND activity ends after slot starts
    return startTotal < slotEnd && endTotal > slotStart;
  };

  // --- Temporal Map Rendering Logic ---
  // Replace the entire renderTemporalMap function with this one

  const renderTemporalMap = () => {
    const now = new Date();
    const todayStr = getLocalYYYYMMDD(now);


    if (heatmapView === 'day') {
      const hours = Array.from({ length: 24 }).map((_, h) => h);

      return (
        <div className="os-grid-day-v2">
          {hours.map((h) => (
            <div key={h} className="os-hour-block">
              <span className="cell-label">{h}:00</span>
              <div className="os-quarter-grid">
                {[0, 15, 30, 45].map((m, idx) => {
                  const slotStart = h + (m / 60);
                  const slotEnd = slotStart + 0.25;
                  const activeActivities = activities.filter(a => a.date === todayStr && getActivityOverlap(a, slotStart, slotEnd));

                  const tooltipText = activeActivities.length > 0
                    ? activeActivities.map(a => `${a.name} (${a.startTime}-${a.endTime})`).join('\\n')
                    : `No planned intent for ${h}:${m.toString().padStart(2, '0')}`;

                  // --- NEW: LOGIC FOR OVERLAP STYLING ---
                  const segmentStyle: React.CSSProperties = {};
                  const isOverlap = activeActivities.length > 1;

                  if (activeActivities.length === 1) {
                    const color = DOMAIN_COLORS[activeActivities[0].domain];
                    segmentStyle.backgroundColor = color;
                    // This is the crucial fix: Set the CSS variable for the glow effect.
                    (segmentStyle as any)['--segment-color'] = color;
                  } else if (isOverlap) {
                    // Create a gradient for overlaps
                    const colors = activeActivities.map(a => DOMAIN_COLORS[a.domain]).join(', ');
                    segmentStyle.background = `linear-gradient(45deg, ${colors})`;
                  }
                  // --- END: NEW LOGIC ---

                  return (
                    <div
                      key={idx}
                      className={`os-quarter-segment ${activeActivities.length > 0 ? 'is-active' : ''} ${isOverlap ? 'is-overlap' : ''}`}
                      style={segmentStyle}
                      title={tooltipText}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      );
    }

    // (The 'week' and 'month' logic remains the same, but is included here for completeness)
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

      for (let i = 0; i < firstDay.getDay(); i++) dates.push(null);
      for (let i = 1; i <= lastDay.getDate(); i++) {
        dates.push(new Date(currentYear, currentMonth, i).toISOString().split('T')[0]);
      }

      return (
        <div className="os-grid-month">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={`${d}-${i}`} className="cell-label">{d}</div>)}
          {dates.map((date, idx) => {
            if (!date) return <div key={`empty-${idx}`} className="os-month-cell empty" />;
            const dayActs = activities.filter(a => a.date === date);
            const isToday = date === todayStr;
            return (
              <div key={date} className={`os-month-cell ${isToday ? 'is-today' : ''}`} style={{ backgroundColor: dayActs.length > 0 ? `rgba(59, 130, 246, ${0.1 + Math.min(dayActs.length * 0.2, 1) * 0.4})` : 'transparent' }}>
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
      // const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY as string });


      const now = new Date();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Intent: "${plannerInput}". Context Date: ${now.toDateString()}. User Time: ${now.toLocaleTimeString()}. Current Phase: "${activePeriod?.title}". Weights: ${JSON.stringify(activePeriod?.weights)}. 
        CRITICAL: All times must be in 24-hour HH:mm format. If user says "1pm to 3pm", you must return "13:00" and "15:00".`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              date: { type: Type.STRING, description: 'YYYY-MM-DD' },
              start_time: { type: Type.STRING, description: 'HH:mm (24-hour format)' },
              end_time: { type: Type.STRING, description: 'HH:mm (24-hour format)' },
              domain: { type: Type.STRING, enum: DOMAINS },
              intent: { type: Type.STRING, description: 'Reasoning for classification relative to goals.' }
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
    if (previewActivity && user) {
      let activityToCommit = { ...previewActivity };

      if (selectedGoalId) {
        const goal = goals.find(g => g.id === selectedGoalId);
        if (goal) {
          activityToCommit.goalId = goal.id;
          activityToCommit.goalType = goal.type;
        }
      }

      const newActivities = [...activities, activityToCommit];
      setActivities(newActivities);
      setDoc(doc(db, 'users', user.uid), { activities: newActivities }, { merge: true });

      setPreviewActivity(null);
      setSelectedGoalId(null); // Reset selected goal
      setPlannerInput('');
      setToast('Activity Committed');
    }
  };


  // Replace the old update/delete functions with these new versions

  // const updateActivityStatus = (id: string, newStatus: ActivityStatus) => {
  //   let startTime: string | null = null;
  //   let endTime: string | null = null;

  //   if (newStatus === 'partial') {
  //     startTime = prompt("Please enter the actual start time (HH:mm):");
  //     // Only ask for the end time if the start time was provided
  //     if (startTime) {
  //       endTime = prompt("Please enter the actual end time (HH:mm):");
  //     }

  //     // If the user cancelled either prompt, exit without making a change
  //     if (!startTime || !endTime) {
  //       setExpandedActivityId(null); // Close the menu
  //       return;
  //     }
  //   }

  //   setActivities(prev =>
  //     prev.map(act => {
  //       if (act.id === id) {
  //         // Create a new object that matches the Activity interface
  //         const updatedActivity: Activity = { ...act, status: newStatus };
  //         if (newStatus === 'partial' && startTime && endTime) {
  //           updatedActivity.actualStartTime = startTime;
  //           updatedActivity.actualEndTime = endTime;
  //         }
  //         return updatedActivity;
  //       }
  //       return act;
  //     })
  //   );

  //   setExpandedActivityId(null); // Collapse the menu after action
  // };

  const updateActivityStatus = (id: string, newStatus: ActivityStatus) => {
    console.log(`Attempting to update activity ${id} to status ${newStatus}`);
    if (!user) {
      console.error("Update failed: User not logged in.");
      return;
    }

    let startTime: string | null = null;
    let endTime: string | null = null;

    if (newStatus === 'partial') {
      startTime = prompt("Please enter the actual start time (HH:mm):");
      if (startTime) {
        endTime = prompt("Please enter the actual end time (HH:mm):");
      }
      if (!startTime || !endTime) {
        console.log("Partial update cancelled by user.");
        setExpandedActivityId(null);
        return;
      }
    }

    setActivities(prevActivities => {
      console.log("Calculating new activities array...");
      const newActivities = prevActivities.map(act => {
        if (act.id === id) {
          const updatedActivity: Activity = { ...act, status: newStatus };
          if (newStatus === 'partial' && startTime && endTime) {
            updatedActivity.actualStartTime = startTime;
            updatedActivity.actualEndTime = endTime;
          }
          console.log("Found and updated activity:", updatedActivity);
          return updatedActivity;
        }
        return act;
      });

      // Save the newly calculated array directly to Firestore
      console.log("Saving new activities array to Firestore...");
      const docRef = doc(db, 'users', user.uid);
      setDoc(docRef, { activities: newActivities }, { merge: true })
        .then(() => {
          console.log("Firestore update successful!");
        })
        .catch((error) => {
          console.error("Firestore update failed:", error);
        });

      return newActivities;
    });

    setExpandedActivityId(null);
  };



  const deleteActivity = (id: string) => {
    console.log(`Attempting to delete activity ${id}`);
    if (!user) {
      console.error("Delete failed: User not logged in.");
      return;
    }

    if (window.confirm('Are you sure you want to delete this activity?')) {
      setActivities(prevActivities => {
        console.log("Filtering out deleted activity...");
        const newActivities = prevActivities.filter(act => act.id !== id);

        // Save the newly filtered array directly to Firestore
        console.log("Saving updated activities array to Firestore after deletion...");
        const docRef = doc(db, 'users', user.uid);
        setDoc(docRef, { activities: newActivities }, { merge: true })
          .then(() => {
            console.log("Firestore deletion successful!");
          })
          .catch((error) => {
            console.error("Firestore deletion failed:", error);
          });

        return newActivities;
      });
    } else {
      console.log("Deletion cancelled by user.");
    }
    setExpandedActivityId(null);
  };

  // const addGoal = async (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) => {
  //   if (!user) return;
  //   const newGoal: Goal = {
  //     ...goal,
  //     id: generateId(),
  //     createdAt: new Date().toISOString(),
  //     updatedAt: new Date().toISOString(),
  //     isActive: true,
  //   };
  //   const goalDocRef = doc(db, 'users', user.uid, 'goals', newGoal.id);
  //   await setDoc(goalDocRef, newGoal);
  //   setGoals(prev => [...prev, newGoal]);
  //   setToast('Goal Added');
  // };

  const addGoal = async (goal: Omit<Goal, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!user) return;
    const newGoal: Goal = {
      ...goal,
      id: generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const goalDocRef = doc(db, 'users', user.uid, 'goals', newGoal.id);
    await setDoc(goalDocRef, newGoal);
    setGoals(prev => [...prev, newGoal]);
    setToast('Goal Added');
  };


  const updateGoal = async (goalToUpdate: Goal) => {
    if (!user) return;
    const updatedGoal = { ...goalToUpdate, updatedAt: new Date().toISOString() };
    const goalDocRef = doc(db, 'users', user.uid, 'goals', updatedGoal.id);
    await setDoc(goalDocRef, updatedGoal, { merge: true });
    setGoals(prev => prev.map(g => g.id === updatedGoal.id ? updatedGoal : g));
    setToast('Goal Updated');
  };

  const deleteGoal = async (goalId: string) => {
    if (!user) return;
    if (window.confirm('Are you sure you want to delete this goal? This will unlink it from all activities.')) {
      const goalDocRef = doc(db, 'users', user.uid, 'goals', goalId);
      await deleteDoc(goalDocRef);
      setGoals(prev => prev.filter(g => g.id !== goalId));

      // Unlink this goal from any activities
      const newActivities = activities.map(act => {
        if (act.goalId === goalId) {
          const { goalId: _, goalType: __, ...rest } = act;
          return rest;
        }
        return act;
      });
      setActivities(newActivities);
      await setDoc(doc(db, 'users', user.uid), { activities: newActivities }, { merge: true });

      setToast('Goal Deleted');
    }
  };


  const updateWeight = (domain: Domain, val: number) => {
    if (!activePeriod || !user) return;
    const newPeriods = lifePeriods.map(p =>
      p.id === activePeriodId
        ? { ...p, weights: { ...p.weights, [domain]: val } }
        : p
    );
    setLifePeriods(newPeriods);
    setDoc(doc(db, 'users', user.uid), { lifePeriods: newPeriods }, { merge: true });
  };

  const addTodo = () => {
    if (!todoInput.trim() || !user) return;
    const newTodos = [{ id: generateId(), text: todoInput, done: false }, ...todos];
    setTodos(newTodos);
    setDoc(doc(db, 'users', user.uid), { todos: newTodos }, { merge: true });
    setTodoInput('');
  };

  const toggleTodo = (id: string) => {
    if (!user) return;
    const newTodos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    setTodos(newTodos);
    setDoc(doc(db, 'users', user.uid), { todos: newTodos }, { merge: true });
  }

  const deleteTodo = (id: string) => {
    if (!user) return;
    const newTodos = todos.filter(t => t.id !== id);
    setTodos(newTodos);
    setDoc(doc(db, 'users', user.uid), { todos: newTodos }, { merge: true });
  }

  // Add this function inside the App component
  const handleLogout = () => {
    signOut(auth).then(() => {
      // setUser(null) is handled by the onAuthStateChanged listener
      setToast('Signed Out');
    }).catch((error) => {
      console.error('Sign Out Error', error);
      setToast('Logout Failed');
    });
  };


  if (!user) {
    return <Login setUser={setUser} />;
  }


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

          {/* // Replace the JSX for your "SIGNALS" zen-card with this: */}
          {/* // Replace the entire SIGNALS section with this: */}
          <section className="zen-card glass-card zen-area-signals">
            <header className="zen-header os-card-header-flex">
              <h3>SIGNALS</h3>
              <div className={`sync-status ${isIntelligenceLoading ? 'is-syncing' : ''}`}>
                {isIntelligenceLoading ? (
                  <>
                    <ThinkingIcon />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <span>Synced</span>
                )}
              </div>
            </header>
            <div className="card-content">
              {/* The rest of your news content remains the same */}
              <div className="news-section">
                {intelligence.news && Object.keys(intelligence.news).length > 0 ? (
                  <>
                    {intelligence.news.today?.length > 0 && (
                      <div className="news-category-section">
                        <h3 className="news-section-header">Today</h3>
                        {intelligence.news.today.map((item, index) => (
                          <div key={`today-${index}`} className="news-item">
                            <div className="news-item-meta">
                              <span className="news-item-date">{item.date}</span>
                              <span className="news-item-category">{item.category}</span>
                            </div>
                            <p className="news-item-headline">{item.headline}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {intelligence.news.weeklyWorld?.length > 0 && (
                      <div className="news-category-section">
                        <h3 className="news-section-header">Weekly World</h3>
                        {intelligence.news.weeklyWorld.map((item, index) => (
                          <div key={`world-${index}`} className="news-item">
                            <div className="news-item-meta">
                              <span className="news-item-date">{item.date}</span>
                              <span className="news-item-category">{item.category}</span>
                            </div>
                            <p className="news-item-headline">{item.headline}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {intelligence.news.weeklyIndia?.length > 0 && (
                      <div className="news-category-section">
                        <h3 className="news-section-header">Weekly India</h3>
                        {intelligence.news.weeklyIndia.map((item, index) => (
                          <div key={`india-${index}`} className="news-item">
                            <div className="news-item-meta">
                              <span className="news-item-date">{item.date}</span>
                              <span className="news-item-category">{item.category}</span>
                            </div>
                            <p className="news-item-headline">{item.headline}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p>Loading news...</p>
                )}
              </div>
            </div>
          </section>




          <section className="zen-card glass-card zen-area-focus">
            <header className="zen-header"><h3>FOCUS FLOW</h3></header>
            <div className="zen-todo-input-group">
              <input value={todoInput} onChange={e => setTodoInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} placeholder="Queue objective..." />
              <button onClick={addTodo} className="zen-accent-btn">ADD</button>
            </div>
            <div className="zen-todo-list custom-scroll">
              {todos.map(t => (
                <div key={t.id} className={`zen-todo-item ${t.done ? 'is-done' : ''}`} onClick={() => toggleTodo(t.id)}>
                  <div className="zen-check" />
                  <span>{t.text}</span>
                  <button className="zen-trash" onClick={e => { e.stopPropagation(); deleteTodo(t.id); }}>×</button>
                </div>
              ))}
            </div>
          </section>

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
        {/* This goes at the end of the "zen-content" div */}
        <div className="zen-user-profile">
          <img src={user?.photoURL || ''} alt="User Avatar" />
          <div className="user-info">
            <div className="user-name">{user?.displayName || 'Anonymous User'}</div>
            <button className="logout-btn" onClick={handleLogout}>LOG OUT</button>
          </div>
        </div>
      </div>

      <div className="os-main">
        {/* Replace the os-banner-row with this new version */}
        <div className="os-banner-row">
          <header className={`os-status-banner is-neutral`}>
            <div className="banner-text">
              <h2>{currentTaskInsight.title}</h2>
              <p>{currentTaskInsight.message}</p>
            </div>
          </header>
          <header className={`os-status-banner os-insight-banner is-${priorityInsight.status}`}>
            <div className="banner-text">
              <h2>Priority Insight</h2>
              <p>{priorityInsight.message}</p>
            </div>
          </header>
          <header className={`os-status-banner os-insight-banner is-${weeklyInsight.status}`}>
            <div className="banner-text">
              <h2>Weekly Insight</h2>
              <p>{weeklyInsight.message}</p>
            </div>
          </header>
          <header className="os-status-banner is-neutral" onClick={() => setIsGoalsPanelOpen(true)} style={{ cursor: 'pointer' }}>
            <div className="banner-text">
              <h2>Mission Control</h2>
              <p>Manage Goals</p>
            </div>
          </header>
          <header className={`os-status-banner os-insight-banner is-${goalInsight.status}`}>
            <div className="banner-text">
              <h2>Goal Insight</h2>
              <p>{goalInsight.message}</p>
            </div>
          </header>
        </div>


        <div className="os-dashboard-grid">
          <section className={`os-card glass-card ${statusGlowClass}`}>
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
                <div className="os-ai-preview-card" style={{ '--preview-glow': DOMAIN_COLORS[previewActivity.domain] } as any}>
                  <div className="preview-badge" style={{ backgroundColor: DOMAIN_COLORS[previewActivity.domain] }}>
                    {previewActivity.domain}
                  </div>
                  <div className="preview-main">
                    <h4>{previewActivity.name}</h4>
                    <p className="preview-time">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      {previewActivity.date} • {previewActivity.startTime} - {previewActivity.endTime}
                    </p>
                    <div className="preview-intent-box">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                      <p>{previewActivity.intent}</p>
                    </div>
                    <div className="preview-goal-selector">
                      <select
                        value={selectedGoalId || ''}
                        onChange={(e) => setSelectedGoalId(e.target.value || null)}
                      >
                        <option value="">No Goal</option>
                        {goals.filter(g => g.status !== 'completed').map(g => (
                          <option key={g.id} value={g.id}>
                            [{g.type === 'short_term' ? 'S' : 'L'}] {g.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    {/* END OF NEW DIV */}
                  </div>
                  <div className="os-preview-actions">
                    <button className="btn-discard" onClick={() => setPreviewActivity(null)}>DISCARD</button>
                    <button className="btn-commit" onClick={confirmActivity}>COMMIT INTENT</button>
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

          {/* Replace the entire "Execution Queue" section with this new code */}
          <section className="os-card glass-card col-span-2">
            <header className="os-card-header-flex">
              <h3>Execution Queue</h3>
              <button
                className="os-collapse-all-btn"
                onClick={() => {
                  // If all are already collapsed, expand all. Otherwise, collapse all.
                  const allDates = Object.keys(activitiesByDate);
                  if (collapsedDates.size === allDates.length) {
                    setCollapsedDates(new Set());
                  } else {
                    setCollapsedDates(new Set(allDates));
                  }
                }}
              >
                Toggle All
              </button>
            </header>
            <div className="os-schedule-viewport custom-scroll">
              {Object.keys(activitiesByDate).sort((a, b) => b.localeCompare(a)).map(date => {
                const isCollapsed = collapsedDates.has(date);
                const items = activitiesByDate[date];
                const today = getLocalYYYYMMDD(new Date());

                let dateLabel = date;
                if (date === today) {
                  dateLabel = 'Today';
                } else if (date < today) {
                  dateLabel = `${date} (Past)`;
                }

                return (
                  <div key={date} className={`os-date-segment ${isCollapsed ? 'is-collapsed' : ''}`}>
                    <div className="segment-label" onClick={() => toggleDateCollapse(date)}>
                      <span>{dateLabel}</span>
                      <svg className="segment-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
                    </div>
                    <div className="segment-content">
                      {items.map(a => (
                        <div key={a.id} className="os-activity-row">
                          <div className="row-indicator" style={{ background: DOMAIN_COLORS[a.domain as keyof typeof DOMAIN_COLORS] }} />
                          <div className="row-main">
                            <span className="row-time">
                              {a.status === 'partial' && a.actualStartTime && a.actualEndTime ? `(Done ${a.actualStartTime}-${a.actualEndTime}) ` : ''}
                              {a.startTime} - {a.endTime}
                            </span>
                            <span className="row-name">{a.name}</span>
                            {/* ADD THIS SPAN TO DISPLAY THE GOAL */}
                            {a.goalId && (
                              <span className="row-goal-link">
                                → {goals.find(g => g.id === a.goalId)?.title || 'Linked Goal'}
                              </span>
                            )}
                            {/* END OF NEW SPAN */}
                          </div>
                          <div className="activity-status-container">
                            {expandedActivityId === a.id ? (
                              <div className="activity-actions-menu">
                                <button onClick={() => updateActivityStatus(a.id, 'complete')} title="Complete">✓</button>
                                <button onClick={() => updateActivityStatus(a.id, 'partial')} title="Partial">◐</button>
                                <button onClick={() => updateActivityStatus(a.id, 'cancel')} title="Cancel">✗</button>
                                <button onClick={() => deleteActivity(a.id)} title="Delete">🗑️</button>
                              </div>
                            ) : (
                              <button
                                className={`row-status-pill status-${a.status}`}
                                onClick={() => setExpandedActivityId(expandedActivityId === a.id ? null : a.id)}
                              >
                                {{
                                  'complete': '✓', 'partial': 'PARTIAL', 'cancel': '✗',
                                  'planned': '○', 'missed': '!'
                                }[a.status]}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
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
                <input type="text" value={activePeriod?.title || ''} onChange={e => setLifePeriods(p => p.map(x => x.id === activePeriodId ? { ...x, title: e.target.value } : x))} />
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
      <GoalsPanel
        isOpen={isGoalsPanelOpen}
        onClose={() => setIsGoalsPanelOpen(false)}
        goals={goals}
        addGoal={addGoal}
        updateGoal={updateGoal}
        deleteGoal={deleteGoal}
      />
      <DayReviewPanel
        isOpen={isReviewPanelOpen}
        onClose={() => setIsReviewPanelOpen(false)}
        onCommit={handleCommitToTomorrow}
        reviewData={{
          integrityScore,
          goalInsight,
          priorityInsight,
          todaysActivities: activities.filter(a => a.date === getLocalYYYYMMDD(now))
        }}
        aiSuggestions={aiSuggestions}
        isGenerating={isGeneratingSuggestions}
      />


    </div>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}

import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true
});
