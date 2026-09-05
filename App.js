import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View,
  TouchableOpacity, ActivityIndicator,
  Platform, Animated, Modal, TextInput, KeyboardAvoidingView,
  PanResponder, Dimensions, AppState,
  StatusBar as RNStatusBar, SafeAreaView,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

// Android (especially SDK 35+ where edge-to-edge is enforced by the OS) no
// longer automatically reserves space for the status bar the way it used
// to — app content can render straight under/behind the notification area
// unless the app accounts for the inset itself. `StatusBar.currentHeight`
// is part of core React Native (unlike react-native-safe-area-context, it
// needs no extra native module/build) and gives the actual status bar
// height in dp on Android; it's undefined/unused on iOS, where the
// SafeAreaView below already handles the notch/inset natively.
const ANDROID_STATUS_BAR_HEIGHT = Platform.OS === 'android' ? (RNStatusBar.currentHeight || 24) : 0;
import { database, getFormattedDate, getDateNDaysAgo } from './src/utils/database';
import { registerToastHandler, NotificationService, DEFAULT_TOAST_DURATION } from './src/utils/notifications';
import DashboardScreen from './src/screens/Dashboard';
import NutritionScreen from './src/screens/Nutrition';
import WorkoutsScreen from './src/screens/Workouts';
import SleepScreen from './src/screens/Sleep';
import FAQScreen from './src/screens/AICoach';
import SettingsScreen from './src/screens/Settings';
import { deleteLocalPhoto, buildPhotosArchive, restorePhotosArchive } from './src/utils/progress-photos';

const C = {
  bg: '#07070c',
  bgCard: '#0d0d18',
  border: 'rgba(255,255,255,0.08)',
  text: '#ffffff',
  muted: '#94a3b8',
  primary: '#8b5cf6',
  success: '#10b981',
};

const TABS = [
  { id: 'Dashboard', label: 'Home',      icon: '📊' },
  { id: 'Nutrition', label: 'Nutrition', icon: '🥗' },
  { id: 'Workouts',  label: 'Workout',   icon: '💪' },
  { id: 'Sleep',     label: 'Sleep',     icon: '🛌' },
  { id: 'FAQ',       label: 'FAQ',      icon: '❓' },
  { id: 'Settings',  label: 'Settings',  icon: '⚙️' },
];

// Error boundary to catch silent crashes
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#07070c', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#f43f5e', fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>Something went wrong</Text>
          <Text style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
            {String(this.state.error)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [tab, setTab]               = useState('Dashboard');
  const [loading, setLoading]       = useState(true);
  const [profile, setProfile]       = useState(null);
  const [weightLogs,  setWeightLogs]  = useState([]);
  const [foodLogs,    setFoodLogs]    = useState([]);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [sleepLogs,   setSleepLogs]   = useState([]);
  const [customFoods, setCustomFoods] = useState([]);
  const [waterLogs,   setWaterLogs]   = useState([]);
  // Progress-photo metadata is lightweight; image bytes are only rendered after
  // the user selects a date in the Progress Photos card.
  const [progressPhotos, setProgressPhotos] = useState([]);
  // Front/Side/Back are always available (see DEFAULT_PROGRESS_PHOTO_CATEGORIES
  // in utils/progress-photos.js) — this only holds user-added custom
  // categories, persisted via database.getProgressPhotoCategories().
  const [progressPhotoCategories, setProgressPhotoCategories] = useState([]);
  // Hash only — never the raw password. null = no lock set up yet.
  const [photoPinHash, setPhotoPinHash] = useState(null);

  // ── New Day Modal state ─────────────────────────────────────────────────────
  const [newDayModal, setNewDayModal] = useState(false);
  const [ndBedtime,   setNdBedtime]   = useState('');
  const [ndWakeTime,  setNdWakeTime]  = useState('');
  const [ndWeight,    setNdWeight]    = useState('');

  const loadAll = async () => {
    try {
      await database.checkAndSeedData();
      const [p, w, f, wo, s, cf, wl, pp, pin, ppc] = await Promise.all([
        database.getProfile(),
        database.getWeightLogs(),
        database.getFoodLogs(),
        database.getWorkoutLogs(),
        database.getSleepLogs(),
        database.getCustomFoods(),
        database.getWaterLogs(),
        database.getProgressPhotos(),
        database.getSetting('progressPhotoPinHash'),
        database.getProgressPhotoCategories(),
      ]);
      setProfile(p);
      setWeightLogs(w   || []);
      setFoodLogs(f     || []);
      setWorkoutLogs(wo || []);
      setSleepLogs(s    || []);
      setCustomFoods(cf || []);
      setWaterLogs(wl   || []);
      setProgressPhotos(pp || []);
      setPhotoPinHash(pin || null);
      setProgressPhotoCategories(ppc || []);
    } catch (e) {
      // On load failure, fall back to defaults so the app remains usable
      setProfile({
        currentWeight: 82, targetWeight: 78,
        calorieTarget: 2300, proteinTarget: 140,
        carbTarget: 250, fatTarget: 70,
        sleepTarget: 8, workoutTarget: 4,
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Toast notification state ───────────────────────────────
  const [toasts, setToasts] = useState([]);

  // ── Swipe left/right between tabs ────────────────────────────
  // Uses PanResponder (built into core React Native — no extra native
  // module, so this doesn't require a new Expo build). Claimed only in the
  // bubble phase (onMoveShouldSetPanResponder, not the Capture variant) and
  // only past a real horizontal-distance + horizontal-vs-vertical-ratio
  // threshold, so a screen's own horizontal ScrollViews (e.g. Workouts' day
  // chips, AICoach's quick chips) keep first claim on any gesture that
  // starts inside them — this only kicks in for a deliberate edge-to-edge
  // swipe over content that isn't itself horizontally scrollable.
  const swipeToAdjacentTab = (direction) => {
    setTab(prevTab => {
      const idx = TABS.findIndex(t => t.id === prevTab);
      if (idx === -1) return prevTab;
      const nextIdx = direction === 'left' ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= TABS.length) return prevTab;
      return TABS[nextIdx].id;
    });
  };
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 2.2;
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dx, vx } = gestureState;
        if (dx <= -60 || vx <= -0.5) swipeToAdjacentTab('left');
        else if (dx >= 60 || vx >= 0.5) swipeToAdjacentTab('right');
      },
    })
  ).current;

  useEffect(() => {
    registerToastHandler(toast => {
      setToasts(prev => [...prev, toast]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toast.id)), toast.duration || DEFAULT_TOAST_DURATION);
    });
  }, []);

  // Guards against evaluateAndScheduleReminders running twice for the same
  // "app just became active" moment. Root cause of the old duplicate
  // calorie/protein toasts: the mount effect below calls this once directly,
  // and — on both Android and iOS — the AppState 'change' listener also
  // fires once more as the app settles into 'active' shortly after cold
  // start, so sendCalorieReminder/sendProteinReminder each ran twice and
  // produced 4 toasts. Fixed two ways: (1) the AppState listener now only
  // reacts to a genuine background/inactive → active transition, per RN's
  // own recommended pattern, instead of firing on every 'change' event
  // including the initial one; (2) this ref collapses any calls that still
  // land back-to-back so the check itself is never run twice concurrently.
  const reminderRunRef = useRef({ inFlight: false, lastRunAt: 0 });

  const evaluateAndScheduleReminders = async () => {
    const guard = reminderRunRef.current;
    const now = Date.now();
    // Ignore re-entrant/duplicate triggers within a short window of each
    // other (e.g. mount effect + an AppState event firing almost
    // simultaneously) — this is a de-dupe guard, not a delay: the first
    // call always still runs immediately.
    if (guard.inFlight || (now - guard.lastRunAt) < 1500) return;
    guard.inFlight = true;
    guard.lastRunAt = now;
    try {
      const today = getFormattedDate(new Date());
      const [allFood, allSleep, allWorkout, p, allWater] = await Promise.all([
        database.getFoodLogs(),
        database.getSleepLogs(),
        database.getWorkoutLogs(),
        database.getProfile(),
        database.getWaterLogs(),
      ]);

      const todayFood    = allFood.filter(f    => f.date && f.date.slice(0, 10) === today);
      const todaySleep   = allSleep.filter(s   => s.date && s.date.slice(0, 10) === today && (s.sleepType === 'night' || !s.sleepType));
      const todayWorkout = allWorkout.filter(w => w.date && w.date.slice(0, 10) === today);
      const todayWaterLogs = allWater.filter(w => w.date && w.date.slice(0, 10) === today);

      const totalCal  = todayFood.reduce((a, f) => a + (Number(f.calories) || 0), 0);
      const totalProt = todayFood.reduce((a, f) => a + (Number(f.protein)  || 0), 0);
      // Extra totals used only by user-created custom rules (Change 6) --
      // computed from data already fetched above, no new reads needed.
      const totalCarbs = todayFood.reduce((a, f) => a + (Number(f.carbs) || 0), 0);
      const totalFats  = todayFood.reduce((a, f) => a + (Number(f.fats)  || 0), 0);
      const totalFibre = todayFood.reduce((a, f) => a + (Number(f.fibre) || 0), 0);
      const totalWater = todayWaterLogs.reduce((a, w) => a + (Number(w.amountMl) || 0), 0);
      const todaySleepHours = todaySleep.reduce((a, s) => a + (Number(s.duration) || 0), 0);
      const weekAgo = getDateNDaysAgo(6);
      const workoutsThisWeek = new Set(allWorkout.filter(w => String(w.date).slice(0,10) >= weekAgo).map(w => String(w.date).slice(0,10))).size;

      // ── New Day Modal: show if first open today ──
      const lastOpenKey = 'lastOpenDate';
      const lastOpen    = await database.getSetting(lastOpenKey).catch(() => null);
      if (lastOpen !== today) {
        await database.saveSetting(lastOpenKey, today).catch(() => {});
        // Only show if app has data (not brand new user)
        const hasPrevData = allSleep.length > 0 || allFood.length > 0;
        if (hasPrevData) {
          setNewDayModal(true);
        }
      }

      // Morning sleep check (6 AM – 11 AM)
      const hour = new Date().getHours();
      if (hour >= 6 && hour <= 11 && todaySleep.length === 0) {
        NotificationService.sendMorningSleepToast();
      }

      // Evening goal check (after 8 PM) — show in-app toast if goals not met
      if (hour >= 20) {
        NotificationService.sendCalorieReminder(totalCal, p?.calorieTarget || 2300);
        NotificationService.sendProteinReminder(totalProt, p?.proteinTarget || 140);
      }

      // Schedule all daily push notifications (mobile only). Thresholds:
      // calorie deficit > 150 kcal, protein deficit > 10 g — checked
      // against the CURRENT totals computed just above, not stale ones.
      // This function is called again on every app foreground (see the
      // AppState listener below), so as the user logs food throughout the
      // day, the calorie/protein reminder is recomputed and either
      // rescheduled with fresh numbers or cancelled if the goal is now met
      // — instead of only ever reflecting whatever was true at cold start.
      await NotificationService.checkAndScheduleReminders({
        profile:         p,
        hasTodayFood:    todayFood.length    > 0,
        hasTodaySleep:   todaySleep.length   > 0,
        hasTodayWorkout: todayWorkout.length > 0,
        todayCalories:   totalCal,
        todayProtein:    totalProt,
        // Change 6: extra context so user-created rules (fibre/fats/carbs/
        // water/sleep/workout-frequency/weight/recovery) can be evaluated.
        // Recovery score is deliberately best-effort/optional here (only
        // read if already stored for today -- never recalculated as a side
        // effect of scheduling notifications) so a rule referencing it
        // simply won't fire until Dashboard has computed today's score at
        // least once, rather than this triggering its own calculation.
        todayCarbs: totalCarbs,
        todayFats: totalFats,
        todayFibre: totalFibre,
        todayWater: totalWater,
        todaySleepHours,
        workoutsThisWeek,
        currentWeight: p?.currentWeight ?? p?.weight,
        recoveryScore: (await database.getRecoveryScoreForDate(today).catch(() => null))?.score,
      });
    } catch (e) {
      // Notification setup errors are non-fatal; app continues normally
      console.warn('[Notifications] scheduling failed', e);
    } finally {
      guard.inFlight = false;
    }
  };

  useEffect(() => {
    loadAll().then(() => { evaluateAndScheduleReminders(); });
  }, []);

  // Re-check calorie/protein (and other) reminders every time the app is
  // brought back to the foreground, not just once at cold start — this is
  // what keeps the notification content reflecting genuinely current
  // intake throughout the day, since local notifications can't recompute
  // their own text once scheduled.
  //
  // IMPORTANT: AppState.addEventListener's 'change' callback can fire once
  // more right after the app mounts (as the OS finishes bringing it to
  // 'active'), in addition to whatever state it's already in — it does NOT
  // reliably only fire on real foreground transitions. We track the
  // previous state ourselves and only react when it's a genuine
  // background/inactive → active transition, which is the pattern React
  // Native's own docs recommend for "did the app just come to the
  // foreground" checks. This is what was causing every startup toast to
  // double up.
  const appStateRef = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (/inactive|background/.test(prevState) && nextState === 'active') {
        evaluateAndScheduleReminders();
      }
    });
    return () => sub?.remove?.();
  }, []);

  const refresh = async () => {
    try {
      const [w, f, wo, s, cf, wl, pp] = await Promise.all([
        database.getWeightLogs(),
        database.getFoodLogs(),
        database.getWorkoutLogs(),
        database.getSleepLogs(),
        database.getCustomFoods(),
        database.getWaterLogs(),
        database.getProgressPhotos(),
      ]);
      setWeightLogs(w   || []);
      setFoodLogs(f     || []);
      setWorkoutLogs(wo || []);
      setSleepLogs(s    || []);
      setCustomFoods(cf || []);
      setWaterLogs(wl   || []);
      setProgressPhotos(pp || []);
    } catch {
      // State remains as-is if refresh fails; user can retry via normal interactions
    }
  };

  const handleUpdateProfile = async (p) => {
    await database.saveProfile(p);
    await database.addWeightLog(p.currentWeight || p.weight);
    setProfile(p);
    const w = await database.getWeightLogs();
    setWeightLogs(w || []);
  };

  // ── Food handlers ──────────────────────────────────────────
  const handleAddFood = async (item) => {
    await database.addFoodLog(item);
    await refresh();
    // Show today's reminder thresholds only when food was logged for today.
    // Backdated nutrition should not trigger a reminder for the current day.
    if (item?.date && String(item.date).slice(0, 10) !== getFormattedDate(new Date())) return;
    const allLogs  = await database.getFoodLogs();
    const todayStr = getFormattedDate(new Date());
    const todayF   = allLogs.filter(f => f.date && f.date.slice(0, 10) === todayStr);
    const totalCal  = todayF.reduce((a, f) => a + (Number(f.calories) || 0), 0);
    const totalProt = todayF.reduce((a, f) => a + (Number(f.protein)  || 0), 0);
    NotificationService.sendCalorieReminder(totalCal, profile?.calorieTarget || 2300);
    NotificationService.sendProteinReminder(totalProt, profile?.proteinTarget || 140);
  };
  const handleDelFood       = async (id)         => { await database.deleteFoodLog(id);             await refresh(); };
  const handleUpdateFood    = async (id, fields)  => { await database.updateFoodLog(id, fields);    await refresh(); };

  // ── Workout handlers ───────────────────────────────────────
  const handleAddWorkout    = async (w)           => { await database.addWorkoutLog(w);              await refresh(); };
  const handleDelWorkout    = async (id)           => { await database.deleteWorkoutLog(id);         await refresh(); };
  const handleUpdateWorkout = async (id, fields)  => { await database.updateWorkoutLog(id, fields); await refresh(); };

  // ── Sleep handlers ─────────────────────────────────────────
  const handleAddSleep      = async (s)           => { await database.addSleepLog(s);                await refresh(); };
  const handleDelSleep      = async (id)           => { await database.deleteSleepLog(id);           await refresh(); };
  const handleUpdateSleep   = async (id, fields)  => { await database.updateSleepLog(id, fields);   await refresh(); };

  // ── Custom food handlers ───────────────────────────────────
  const handleAddCustomF    = async (f)           => { await database.addCustomFood(f);              await refresh(); };
  const handleUpdateCustomF = async (id, fields)   => { await database.updateCustomFood(id, fields);  await refresh(); };
  const handleDelCustomF    = async (id)           => { await database.deleteCustomFood(id);         await refresh(); };

  // ── Water handlers ─────────────────────────────────────────
  // Dashboard.js calls onAddWater(amount, date) — two plain arguments, not
  // an object. This handler previously expected a single `{ amountMl, date }`
  // object, so `item` was actually just the raw number (e.g. 500), meaning
  // `item.amountMl` was always undefined and got stored as 0. That's why
  // every water entry — quick buttons and the custom-ml field alike —
  // always showed up as 0 ml.
  const handleAddWater      = async (amount, date) => {
    await database.addWaterLog({ amountMl: Number(amount) || 0, date: date || getFormattedDate(new Date()) });
    await refresh();
  };
  const handleUpdateWater   = async (id, fields)  => { await database.updateWaterLog(id, fields);    await refresh(); };
  const handleDelWater      = async (id)           => { await database.deleteWaterLog(id);           await refresh(); };

  // ── Progress photo handlers ─────────────────────────────────
  const handleAddProgressPhoto = async (photo) => {
    if (!photo?.uri) return;
    const saved = await database.addProgressPhoto(photo);
    if (saved) setProgressPhotos(prev => [...prev, saved]);
    else await deleteLocalPhoto(photo.uri);
  };
  const handleDeleteProgressPhoto = async (id, uri) => {
    await database.deleteProgressPhoto(id);
    await deleteLocalPhoto(uri);
    setProgressPhotos(prev => prev.filter(p => p.id !== id));
  };
  // Sets or changes the Progress Photos privacy-lock password. Pass a hash
  // (from hashPin()) — never the raw password itself gets stored.
  const handleSetPhotoPin = async (hash) => {
    await database.saveSetting('progressPhotoPinHash', hash || '');
    setPhotoPinHash(hash || null);
  };

  // Adds a custom Progress Photo category (e.g. "Chest", "Arms"). Validation
  // (empty/duplicate/etc.) lives in database.addProgressPhotoCategory so
  // there's one source of truth for the rule; errors are surfaced to the
  // caller so the UI can show a specific message rather than failing silently.
  const handleAddProgressPhotoCategory = async (name) => {
    const row = await database.addProgressPhotoCategory(name);
    setProgressPhotoCategories(prev => [...prev, row]);
    return row;
  };
  const handleDeleteProgressPhotoCategory = async (key) => {
    // Cascade delete: every photo record + image file stored under this
    // category must go before (or with) the category record itself, or
    // they'd become orphaned -- present in storage/filesystem but no
    // longer reachable from any category in the UI. Photos are matched to
    // their category via the existing `type` field (set to the category's
    // `key` at upload time in handleAddProgressPhoto/database.addProgressPhoto)
    // -- reusing that existing relationship rather than adding a new one.
    // Only photos whose type matches this exact key are touched; every
    // other category's photos are left untouched.
    const toRemove = progressPhotos.filter(p => String(p.type || '').toLowerCase() === key);
    for (const photo of toRemove) {
      await database.deleteProgressPhoto(photo.id);
      // deleteLocalPhoto is already a safe no-op if the file is missing
      // (idempotent delete + try/catch) -- covers the "some image files
      // are already missing" case without any extra handling here.
      if (photo.uri) await deleteLocalPhoto(photo.uri);
    }
    await database.deleteProgressPhotoCategory(key);
    if (toRemove.length) {
      const removedIds = new Set(toRemove.map(p => p.id));
      setProgressPhotos(prev => prev.filter(p => !removedIds.has(p.id)));
    }
    setProgressPhotoCategories(prev => prev.filter(c => c.key !== key));
  };

  // ── Backup / restore ───────────────────────────────────────
  // onExportData is async — Settings awaits the result before writing the file.
  // Progress Photos "Photo Archive" export/import — a separate, opt-in
  // feature from the main .txt backup (see database.js#exportAllData docs)
  // specifically for moving the actual image files to a new device. See
  // utils/progress-photos.js for why this exists as its own flow.
  const handleExportPhotosArchive = async () => {
    return await buildPhotosArchive(progressPhotos);
  };
  const handleImportPhotosArchive = async (jsonStr) => {
    const result = await restorePhotosArchive(jsonStr);
    const addedCount = await database.mergeProgressPhotos(result.restoredPhotos);
    if (addedCount > 0) setProgressPhotos(await database.getProgressPhotos());
    return { ...result, addedCount };
  };

  const handleExportData = async () => {
    try {
      return await database.exportAllData();
    } catch {
      return null;
    }
  };

  const handleImportData = async (jsonStr) => {
    const result = await database.importAllData(jsonStr);
    await loadAll();
    return result;
  };

  const handleClearAll = async () => {
    await database.clearAllData();
    // clearAllData only wipes the KEYS map; the photo PIN lives in the
    // generic settings store, so clear it explicitly too — otherwise a full
    // reset would leave photos locked behind a password with nothing left
    // to protect.
    await database.saveSetting('progressPhotoPinHash', '');
    setProfile({
      currentWeight: 82, targetWeight: 78,
      calorieTarget: 2300, proteinTarget: 140,
      carbTarget: 250, fatTarget: 70,
      sleepTarget: 8, workoutTarget: 4,
    });
    setWeightLogs([]); setFoodLogs([]); setWorkoutLogs([]);
    setSleepLogs([]); setCustomFoods([]); setWaterLogs([]);
    setProgressPhotos([]); setPhotoPinHash(null);
    setTab('Dashboard');
  };

  // ── New Day Modal handler ────────────────────────────────────────────
  const handleNewDaySubmit = async () => {
    const today = getFormattedDate(new Date());
    try {
      // Save weight if provided
      if (ndWeight && parseFloat(ndWeight) > 0) {
        const newProfile = { ...profile, currentWeight: parseFloat(ndWeight) };
        await database.saveProfile(newProfile);
        await database.addWeightLog(parseFloat(ndWeight));
        setProfile(newProfile);
        const w = await database.getWeightLogs();
        setWeightLogs(w || []);
      }
      // Save sleep if both bedtime and wake time are provided
      const parseTM = str => {
        const [h, m] = (str || '').split(':').map(Number);
        return isNaN(h) ? null : h * 60 + (m || 0);
      };
      const bedMins  = parseTM(ndBedtime);
      const wakeMins = parseTM(ndWakeTime);
      if (bedMins !== null && wakeMins !== null) {
        let durationMins = wakeMins - bedMins;
        if (durationMins <= 0) durationMins += 24 * 60; // crosses midnight
        const hours = +(durationMins / 60).toFixed(2);
        await database.addSleepLog({
          date:      today,
          sleepType: 'night',
          bedtime:   ndBedtime,
          wakeTime:  ndWakeTime,
          duration:  hours,
        });
        const s = await database.getSleepLogs();
        setSleepLogs(s || []);
      }
    } catch (e) {
      console.log('[NewDayModal] Save error:', e);
    }
    setNewDayModal(false);
    setNdBedtime('');
    setNdWakeTime('');
    setNdWeight('');
  };

  // ── Derived today stats ────────────────────────────────────
  const todayStats = (() => {
    if (!profile) return { calories: 0, protein: 0, carbs: 0, fats: 0, sleepHours: 0, workoutCompleted: false };
    const today = getFormattedDate(new Date());
    const tf = (foodLogs    || []).filter(f => f.date && String(f.date).slice(0, 10) === today);
    const ts = (sleepLogs   || []).find(s  => s.date && String(s.date).slice(0, 10) === today && (s.sleepType === 'night' || !s.sleepType));
    const tw = (workoutLogs || []).filter(w => w.date && String(w.date).slice(0, 10) === today);
    return {
      calories:         tf.reduce((a, f) => a + (Number(f.calories) || 0), 0),
      protein:          tf.reduce((a, f) => a + (Number(f.protein)  || 0), 0),
      carbs:            tf.reduce((a, f) => a + (Number(f.carbs)    || 0), 0),
      fats:             tf.reduce((a, f) => a + (Number(f.fats)     || 0), 0),
      sleepHours:       ts ? (Number(ts.duration) || 0) : 0,
      workoutCompleted: tw.length > 0,
    };
  })();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={C.primary} />
        <Text style={styles.loadingTxt}>FitTrack loading…</Text>
      </View>
    );
  }

  const screenProps = {
    Dashboard: (
      <DashboardScreen
        profile={profile}
        todayStats={todayStats}
        weightLogs={weightLogs}
        workoutLogs={workoutLogs}
        sleepLogs={sleepLogs}
        foodLogs={foodLogs}
        waterLogs={waterLogs}
        progressPhotos={progressPhotos}
        photoPinHash={photoPinHash}
        onSetPhotoPin={handleSetPhotoPin}
        onAddProgressPhoto={handleAddProgressPhoto}
        onDeleteProgressPhoto={handleDeleteProgressPhoto}
        progressPhotoCategories={progressPhotoCategories}
        onAddProgressPhotoCategory={handleAddProgressPhotoCategory}
        onDeleteProgressPhotoCategory={handleDeleteProgressPhotoCategory}
        onAddWater={handleAddWater}
        onUpdateWater={handleUpdateWater}
        onDeleteWater={handleDelWater}
        onRefresh={refresh}
      />
    ),
    Nutrition: (
      <NutritionScreen
        profile={profile}
        foodLogs={foodLogs}
        customFoods={customFoods}
        onAddFoodLog={handleAddFood}
        onUpdateFoodLog={handleUpdateFood}
        onDeleteFoodLog={handleDelFood}
      />
    ),
    Workouts: (
      <WorkoutsScreen
        workoutLogs={workoutLogs}
        onAddWorkoutLog={handleAddWorkout}
        onUpdateWorkoutLog={handleUpdateWorkout}
        onDeleteWorkoutLog={handleDelWorkout}
      />
    ),
    Sleep: (
      <SleepScreen
        profile={profile}
        sleepLogs={sleepLogs}
        onAddSleepLog={handleAddSleep}
        onUpdateSleepLog={handleUpdateSleep}
        onDeleteSleepLog={handleDelSleep}
      />
    ),
    FAQ: (
      <FAQScreen
        profile={profile}
        foodLogs={foodLogs}
        workoutLogs={workoutLogs}
        sleepLogs={sleepLogs}
        weightLogs={weightLogs}
        waterLogs={waterLogs}
      />
    ),
    Settings: (
      <SettingsScreen
        profile={profile}
        onUpdateProfile={handleUpdateProfile}
        customFoods={customFoods}
        onAddCustomFood={handleAddCustomF}
        onUpdateCustomFood={handleUpdateCustomF}
        onDeleteCustomFood={handleDelCustomF}
        onClearAllData={handleClearAll}
        onExportData={handleExportData}
        onImportData={handleImportData}
        onExportPhotosArchive={handleExportPhotosArchive}
        onImportPhotosArchive={handleImportPhotosArchive}
      />
    ),
  };

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.root}>
        <ExpoStatusBar style="light" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            FitTrack <Text style={{ color: C.primary }}></Text>
          </Text>
          <View style={styles.headerDot} />
        </View>

        {/* Screen */}
        <View style={styles.screen} {...panResponder.panHandlers}>
          {screenProps[tab] || null}
        </View>

        {/* Bottom Nav */}
        <View style={styles.nav}>
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <TouchableOpacity key={t.id} style={styles.navItem} onPress={() => setTab(t.id)}>
                {active ? <View style={styles.navIndicator} /> : null}
                <Text style={[styles.navIcon, active && styles.navIconActive]}>{t.icon}</Text>
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* New Day Modal */}
        <Modal
          visible={newDayModal}
          transparent
          animationType="fade"
          onRequestClose={() => setNewDayModal(false)}
        >
          <KeyboardAvoidingView
            style={styles.ndOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.ndModal}>
              <Text style={styles.ndTitle}>🌅 Good Morning!</Text>
              <Text style={styles.ndSub}>Log last night's sleep and this morning's weight. You can skip and enter these later.</Text>

              {/* Sleep: bedtime + wake time side by side */}
              <View style={[styles.ndField, { flexDirection: 'row', gap: 10 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ndLabel}>🌙 Bedtime</Text>
                  <TextInput
                    style={styles.ndInput}
                    placeholder="22:30"
                    placeholderTextColor="#4a5568"
                    keyboardType="numbers-and-punctuation"
                    value={ndBedtime}
                    onChangeText={setNdBedtime}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.ndLabel}>☀️ Wake Up</Text>
                  <TextInput
                    style={styles.ndInput}
                    placeholder="06:30"
                    placeholderTextColor="#4a5568"
                    keyboardType="numbers-and-punctuation"
                    value={ndWakeTime}
                    onChangeText={setNdWakeTime}
                  />
                </View>
              </View>
              {/* Live duration preview */}
              {!!(ndBedtime && ndWakeTime) && (() => {
                const [bh, bm] = ndBedtime.split(':').map(Number);
                const [wh, wm] = ndWakeTime.split(':').map(Number);
                if (!isNaN(bh) && !isNaN(wh)) {
                  let mins = (wh * 60 + (wm || 0)) - (bh * 60 + (bm || 0));
                  if (mins <= 0) mins += 1440;
                  return <Text style={styles.ndDurationPreview}>⏱ {(mins / 60).toFixed(1)} hours of sleep</Text>;
                }
                return null;
              })()}

              {/* Weight */}
              <View style={styles.ndField}>
                <Text style={styles.ndLabel}>⚖️ Current Weight (kg)</Text>
                <TextInput
                  style={styles.ndInput}
                  placeholder={`e.g. ${profile?.currentWeight || 80}`}
                  placeholderTextColor="#4a5568"
                  keyboardType="numeric"
                  value={ndWeight}
                  onChangeText={setNdWeight}
                />
              </View>

              <TouchableOpacity style={styles.ndSaveBtn} onPress={handleNewDaySubmit}>
                <Text style={styles.ndSaveBtnText}>Save &amp; Start Day</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ndSkipBtn} onPress={() => setNewDayModal(false)}>
                <Text style={styles.ndSkipBtnText}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Toast Notifications Overlay */}
        {toasts.length > 0 && (
          <View style={styles.toastContainer} pointerEvents="none">
            {toasts.map(t => {
              const bg =
                t.type === 'success' ? '#10b981'
                : t.type === 'warning' ? '#f59e0b'
                : t.type === 'error'   ? '#f43f5e'
                : '#7c5cfc';
              return (
                <View key={t.id} style={[styles.toast, { backgroundColor: bg }]}>
                  <Text style={styles.toastTxt}>{t.message}</Text>
                </View>
              );
            })}
          </View>
        )}
      </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    flexDirection: 'column',
    // Android: SafeAreaView (core RN) is a no-op on Android — it only
    // handles insets natively on iOS — so the status bar height is added
    // by hand here. This keeps content clear of the notification area
    // without overlapping it or adding a fixed/oversized gap when there's
    // no status bar to account for (e.g. iOS, where this is 0 and
    // SafeAreaView already does the right thing on its own).
    paddingTop: ANDROID_STATUS_BAR_HEIGHT,
  },
  loading: {
    flex: 1,
    backgroundColor: '#07070c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTxt: {
    color: '#94a3b8',
    marginTop: 14,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    height: 50,
    backgroundColor: '#07070c',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  headerDot: {
    width: 7, height: 7,
    borderRadius: 4,
    backgroundColor: C.success,
    marginLeft: 8,
  },
  screen: {
    flex: 1,
  },
  nav: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: C.bgCard,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingBottom: Platform.OS === 'ios' ? 10 : 0,
  },
  navIndicator: {
    position: 'absolute',
    top: 0, left: '25%',
    width: '50%', height: 2,
    backgroundColor: C.primary,
    borderRadius: 2,
  },
  navIcon: {
    fontSize: 18,
    opacity: 0.45,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    color: C.muted,
    fontSize: 9,
    marginTop: 2,
    fontWeight: '500',
  },
  navLabelActive: {
    color: C.primary,
    fontWeight: '800',
  },
  toastContainer: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  toast: {
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastTxt: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },

  // New Day Modal
  ndOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  ndModal:      { backgroundColor: '#0d0d18', borderRadius: 22, borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', padding: 24, width: '100%', maxWidth: 400 },
  ndTitle:      { fontSize: 24, fontWeight: '900', color: '#ffffff', marginBottom: 8, textAlign: 'center' },
  ndSub:        { fontSize: 13, color: '#94a3b8', lineHeight: 20, textAlign: 'center', marginBottom: 20 },
  ndField:      { marginBottom: 16 },
  ndLabel:      { fontSize: 13, color: '#94a3b8', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  ndInput:      { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#ffffff', fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 14, textAlign: 'center' },
  ndSaveBtn:    { backgroundColor: '#8b5cf6', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 10 },
  ndSaveBtnText:{ color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  ndSkipBtn:    { alignItems: 'center', paddingVertical: 8 },
  ndSkipBtnText:{ color: '#94a3b8', fontSize: 14, fontWeight: '500' },
  ndDurationPreview: { fontSize: 13, color: '#10b981', fontWeight: '700', textAlign: 'center', marginBottom: 12, marginTop: -8 },
});