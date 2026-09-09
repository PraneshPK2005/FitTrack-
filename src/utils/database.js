/**
 * FitTrack AI – Database Layer v2
 * - update functions for all log types
 * - addXxxLogForDate (back-dating)
 * - sleepType support (night / nap)
 * - exportAllData / importAllData (backup/restore)
 */
import storage from './storage';
// Previously missing (see prior fix): getCustomFoods()'s fibre-migration
// step below calls estimateFibrePer100g() but this file never imported it,
// so every getCustomFoods() call threw ReferenceError whenever any custom
// food lacked a fibre field -- and since App.js's loadAll() awaits
// getCustomFoods() inside the same Promise.all as every other loader, that
// one throw silently wiped out food/workout/sleep/etc. state on every load.
import { estimateFibrePer100g } from './food-database';

const KEYS = {
  profile:              'fittrack_profile',
  weightLogs:           'fittrack_weight_logs',
  foodLogs:             'fittrack_food_logs',
  workoutLogs:          'fittrack_workout_logs',
  sleepLogs:            'fittrack_sleep_logs',
  customFoods:          'fittrack_custom_foods',
  seeded:               'fittrack_seeded',
  activeWorkoutSession: 'fittrack_active_workout_session',
  waterLogs:           'fittrack_water_logs',
  progressPhotos:      'fittrack_progress_photos',
  notificationSettings:'fittrack_notification_settings',
  workoutSessions:      'fittrack_workout_sessions',
  activeWorkoutDrafts:  'fittrack_active_workout_drafts',
  exerciseLibrary:      'fittrack_exercise_library',
  // Custom Progress Photo categories (front/side/back always exist as
  // built-in defaults and are never stored here — only user-added ones,
  // e.g. "chest", "arms"). Storing only the additions keeps old installs
  // that predate custom categories fully backward compatible: an empty/
  // missing key just means "no custom categories yet", not "broken".
  progressPhotoCategories: 'fittrack_progress_photo_categories',
  // Recovery scores keyed by calendar date. Populated lazily -- a date's
  // score only gets written here the first time it's actually requested
  // (see getOrCalculateRecoveryForDate below), never as a bulk migration.
  recoveryScores: 'fittrack_recovery_scores',
  // Versioned history of target/goal configurations, keyed by effective
  // date -- see getTargetForDate() below. This is the single source of
  // truth for "what target applied on date X", separate from `profile`
  // (which always holds the CURRENT/live targets, used for Settings display
  // and any other current-state-only usage).
  targetHistory: 'fittrack_target_history',
};

// Every field that participates in target-history versioning. Kept as one
// list so every place that needs to compare/copy target fields (saveProfile,
// migration, resolveTargetForDate) stays in sync automatically.
export const TARGET_FIELDS = [
  'calorieTarget', 'proteinTarget', 'carbTarget', 'fatTarget', 'fibreTarget',
  'sleepTarget', 'workoutTarget', 'waterTargetMl',
];

// In-memory cache for parsed local data. This avoids repeatedly reading and
// JSON-parsing the same large log collections during a single app session.
// Storage remains the source of truth; writes update the cache only after the
// persistent write succeeds.
const memoryCache = new Map();

export const DEFAULT_PROFILE = {
  currentWeight: 82,
  targetWeight:  78,
  calorieTarget: 2300,
  proteinTarget: 140,
  carbTarget:    250,
  fatTarget:      70,
  fibreTarget:    30,
  sleepTarget:     8,
  workoutTarget:   4,
  waterTargetMl: 2500,
};

export function getFormattedDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Single shared sleep-duration formatter -- every page that displays a
// sleep duration or sleep target (Dashboard, Recovery, Sleep page, Charts,
// weekly reports, AI Coach, notifications) should import and use this
// rather than formatting decimal hours independently, so the display is
// consistent everywhere without duplicating rounding logic per page.
// Examples: 6.0 -> "6h", 6.25 -> "6h 15min", 6.33 -> "6h 20min",
// 7.5 -> "7h 30min". Never shows a redundant "0min".
export function formatSleepHours(decimalHours) {
  const h = Number(decimalHours);
  if (!Number.isFinite(h) || h < 0) return '0h';
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return mm === 0 ? `${hh}h` : `${hh}h ${mm}min`;
}

export function getDateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getFormattedDate(d);
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function cloneJSON(value) {
  // Deep-clones anything read from or written to the cache so no caller can
  // ever hold a live reference into memoryCache's internals. All data that
  // passes through here is already JSON-safe (it's either deserialized from
  // AsyncStorage or a plain JSON-literal fallback like []), so a
  // parse(stringify()) round-trip is a safe, dependency-free deep clone.
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function getJSON(key, fallback) {
  if (memoryCache.has(key)) return cloneJSON(memoryCache.get(key));
  try {
    const raw = await storage.getItem(key);
    if (raw == null) {
      memoryCache.set(key, fallback);
      return cloneJSON(fallback);
    }
    const parsed = JSON.parse(raw);
    memoryCache.set(key, parsed);
    return cloneJSON(parsed);
  } catch {
    memoryCache.set(key, fallback);
    return cloneJSON(fallback);
  }
}

async function setJSON(key, value) {
  await storage.setItem(key, JSON.stringify(value));
  memoryCache.set(key, cloneJSON(value));
}

function invalidateJSON(key) {
  memoryCache.delete(key);
}

// =============================================================
// 30-day seed data
// =============================================================
function generateSeedData() {
  const now = new Date();
  const weightLogs = [], foodLogs = [], workoutLogs = [], sleepLogs = [];

  const exercises = [
    { name: 'Bench Press',   muscle: 'Chest',     baseWeight: 80,  repsRange: [6, 10] },
    { name: 'Squat',         muscle: 'Legs',       baseWeight: 100, repsRange: [5, 8]  },
    { name: 'Deadlift',      muscle: 'Back',       baseWeight: 120, repsRange: [4, 6]  },
    { name: 'OHP',           muscle: 'Shoulders',  baseWeight: 50,  repsRange: [8, 12] },
    { name: 'Pull-up',       muscle: 'Back',       baseWeight: 0,   repsRange: [6, 12] },
    { name: 'Barbell Curl',  muscle: 'Biceps',     baseWeight: 30,  repsRange: [10, 15]},
    { name: 'Leg Press',     muscle: 'Legs',       baseWeight: 140, repsRange: [8, 12] },
    { name: 'Lat Pulldown',  muscle: 'Back',       baseWeight: 65,  repsRange: [8, 12] },
    { name: 'Tricep Dip',    muscle: 'Triceps',    baseWeight: 0,   repsRange: [10, 15]},
    { name: 'Plank',         muscle: 'Core',       baseWeight: 0,   repsRange: [1, 1]  },
  ];

  const foodItems = [
    { name: 'Oats (40g)',      calories: 150, protein: 5,    carbs: 27, fats: 2.5 },
    { name: 'Egg (x3)',        calories: 231, protein: 18,   carbs: 1.8, fats: 15 },
    { name: 'Chicken Breast',  calories: 330, protein: 62,   carbs: 0,   fats: 7.2 },
    { name: 'Brown Rice 200g', calories: 222, protein: 5.2,  carbs: 46,  fats: 1.8 },
    { name: 'Dal 150g',        calories: 174, protein: 13.5, carbs: 30,  fats: 0.6 },
    { name: 'Banana',          calories: 89,  protein: 1.1,  carbs: 23,  fats: 0.3 },
    { name: 'Whey Protein',    calories: 120, protein: 25,   carbs: 3,   fats: 1.5 },
    { name: 'Chapati x2',      calories: 240, protein: 6.2,  carbs: 40,  fats: 7.4 },
  ];

  let weight = 83.5;
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const date = getFormattedDate(d);

    weight += (Math.random() - 0.55) * 0.3;
    weight = Math.max(79, Math.min(85, weight));
    weightLogs.push({ id: uid(), date, weight: Math.round(weight * 10) / 10 });

    if (Math.random() > 0.2) {
      const mc = 3 + Math.round(Math.random() * 2);
      for (let m = 0; m < mc; m++) {
        const f = foodItems[Math.floor(Math.random() * foodItems.length)];
        foodLogs.push({ id: uid(), date, ...f });
      }
    }

    if (i % 2 === 0 || (i % 3 === 0 && Math.random() > 0.4)) {
      const ec = 3 + Math.round(Math.random() * 3);
      for (let e = 0; e < ec; e++) {
        const ex = exercises[Math.floor(Math.random() * exercises.length)];
        const ns = 3 + Math.round(Math.random() * 2);
        const sets = Array.from({ length: ns }, () => ({
          reps:   ex.repsRange[0] + Math.round(Math.random() * (ex.repsRange[1] - ex.repsRange[0])),
          weight: ex.baseWeight > 0 ? ex.baseWeight + Math.round((Math.random() - 0.3) * 10) : 0,
        }));
        workoutLogs.push({ id: uid(), date, exerciseName: ex.name, muscleGroup: ex.muscle, sets, weight: sets[0]?.weight || 0 });
      }
    }

    // Seed night sleep
    const dur = 6 + Math.random() * 3;
    const hrs = Math.floor(dur);
    const mins = Math.round((dur - hrs) * 60);
    sleepLogs.push({
      id: uid(), date,
      sleepType: 'night',
      bedtime: '22:30',
      wakeTime: `0${hrs}:${mins.toString().padStart(2, '0')}`,
      duration: Math.round(dur * 10) / 10,
    });
  }
  return { weightLogs, foodLogs, workoutLogs, sleepLogs };
}

// =============================================================
// Target History (versioned targets — see TARGET_FIELDS above)
// =============================================================
// Sentinel effective date used only for the very first, migrated version so
// it safely covers ALL pre-existing historical data without needing to scan
// every log for the earliest date. Any real log will always be >= this.
const TARGET_HISTORY_EPOCH = '2000-01-01';

async function getRawTargetHistory() {
  return getJSON(KEYS.targetHistory, []);
}

// Auto-migrates existing installs the first time target history is needed:
// treats the current profile's targets as the initial version, effective
// from TARGET_HISTORY_EPOCH so every already-logged date resolves to it.
// Idempotent -- once a history array exists (even with one entry) this is a
// no-op, so it never runs twice or duplicates the seed version.
async function ensureTargetHistory() {
  let history = await getRawTargetHistory();
  if (history.length === 0) {
    const profile = await getJSON(KEYS.profile, DEFAULT_PROFILE);
    const seed = { effectiveDate: TARGET_HISTORY_EPOCH };
    TARGET_FIELDS.forEach(f => { seed[f] = profile[f]; });
    history = [seed];
    await setJSON(KEYS.targetHistory, history);
  }
  return history;
}

// Creates (or updates, if one already exists for today) the target-history
// version effective from today, using the fields on `profile` that are
// about to be saved. Only ever called from saveProfile() once it has
// already confirmed a target field actually changed.
async function recordTargetVersion(profile) {
  const history = await ensureTargetHistory();
  const today = getFormattedDate(new Date());
  const version = { effectiveDate: today };
  TARGET_FIELDS.forEach(f => { version[f] = profile[f]; });
  const idx = history.findIndex(v => v.effectiveDate === today);
  // Multiple edits on the same day update that same day's version in place
  // rather than stacking near-duplicate versions for one calendar date.
  const next = idx >= 0
    ? history.map((v, i) => i === idx ? version : v)
    : [...history, version];
  return setJSON(KEYS.targetHistory, next);
}

// Pure, synchronous resolver -- usable by any module that has already
// loaded a target-history array (e.g. weekly-report.js, recovery
// calculations) without needing its own storage round-trip per date.
// targetForDate = the version whose effectiveDate is the latest
// effectiveDate <= the given date (never a version from AFTER that date).
export function resolveTargetForDate(history, dateStr, fallbackProfile = DEFAULT_PROFILE) {
  const d = String(dateStr || '').slice(0, 10);
  const sorted = [...(history || [])].sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)));
  let match = null;
  for (const v of sorted) {
    if (String(v.effectiveDate).slice(0, 10) <= d) match = v;
    else break;
  }
  // No version old enough to apply (shouldn't happen once migrated, since
  // TARGET_HISTORY_EPOCH predates any real data) -- fall back to the
  // earliest known version, then the live profile, so a date is never left
  // without SOME reasonable target rather than crashing/showing nothing.
  if (!match) match = sorted[0] || null;
  const base = match || fallbackProfile || DEFAULT_PROFILE;
  const result = {};
  TARGET_FIELDS.forEach(f => { result[f] = base[f] ?? DEFAULT_PROFILE[f]; });
  return result;
}

// =============================================================
// Recovery score invalidation
// =============================================================
// calculateRecovery() (utils/recovery.js) looks back a 3-day window ending
// on the date it's computing for. So a change to sleep/food/water/workout
// data on date D can affect the STORED score for D itself, AND for D+1 and
// D+2 (since their own 3-day windows both include D). This clears exactly
// those 1-3 stored entries -- never a wider range, and never every date --
// so the fix stays cheap regardless of how much history exists.
//
// Deliberately does NOT recalculate anything here. Clearing the cache is
// O(1); the actual calculateRecovery() work only ever happens lazily, the
// next time that specific date is actually viewed (Dashboard's RecoveryCard
// already does this via its stored-vs-signature check). This is what keeps
// the whole mechanism battery/performance-cheap: every log edit costs one
// tiny object write, never a recomputation, and a date that's never looked
// at again is never recalculated at all.
async function invalidateRecoveryFrom(dateStr) {
  if (!dateStr) return;
  const rows = await getJSON(KEYS.recoveryScores, {});
  const base = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  let changed = false;
  const next = { ...rows };
  for (let i = 0; i < 3; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const key = getFormattedDate(d);
    if (next[key]) { delete next[key]; changed = true; }
  }
  if (changed) await setJSON(KEYS.recoveryScores, next);
}

// =============================================================
// Public API
// =============================================================
export const database = {
  // Returns the full versioned target history (auto-migrating on first
  // call for pre-existing installs). Callers that need to resolve targets
  // for MANY dates at once (weekly reports, charts) should call this once
  // and reuse resolveTargetForDate(history, date) themselves rather than
  // calling getTargetForDate() per date.
  async getTargetHistory() {
    return ensureTargetHistory();
  },
  // Convenience for resolving a single date's target -- internally does
  // the same getRawTargetHistory + resolveTargetForDate as above.
  async getTargetForDate(dateStr) {
    const history = await ensureTargetHistory();
    const profile = await getJSON(KEYS.profile, DEFAULT_PROFILE);
    return resolveTargetForDate(history, dateStr, profile);
  },
  async checkAndSeedData() {
    const seeded = await getJSON(KEYS.seeded, false);
    if (seeded) return;
    const { weightLogs, foodLogs, workoutLogs, sleepLogs } = generateSeedData();
    await Promise.all([
      setJSON(KEYS.weightLogs,  weightLogs),
      setJSON(KEYS.foodLogs,    foodLogs),
      setJSON(KEYS.workoutLogs, workoutLogs),
      setJSON(KEYS.sleepLogs,   sleepLogs),
      setJSON(KEYS.profile,     DEFAULT_PROFILE),
      setJSON(KEYS.customFoods, []),
      setJSON(KEYS.waterLogs, []),
      setJSON(KEYS.progressPhotos, []),
      setJSON(KEYS.notificationSettings, null),
      setJSON(KEYS.seeded, true),
    ]);
  },

  // ── Profile ──────────────────────────────────────────────────
  async getProfile()   { return getJSON(KEYS.profile, DEFAULT_PROFILE); },
  // Versions the target-affecting fields (see TARGET_FIELDS) whenever they
  // actually change, BEFORE writing the new profile -- this is the single
  // choke point every caller (Settings' Save Goals, any other profile
  // update) already goes through, so target history stays correct
  // regardless of where the change came from without duplicating this
  // logic at each call site.
  async saveProfile(p) {
    const prev = await getJSON(KEYS.profile, DEFAULT_PROFILE);
    const changed = TARGET_FIELDS.some(f => Number(prev[f]) !== Number(p[f]));
    if (changed) await recordTargetVersion(p);
    return setJSON(KEYS.profile, p);
  },

  // ── Weight ───────────────────────────────────────────────────
  async getWeightLogs() {
    const l = await getJSON(KEYS.weightLogs, []);
    return [...l].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  async addWeightLog(weight, dateStr) {
    const logs = await getJSON(KEYS.weightLogs, []);
    const date = dateStr || getFormattedDate(new Date());
    const idx = logs.findIndex(l => l.date === date);
    if (idx >= 0) logs[idx].weight = weight;
    else logs.push({ id: uid(), date, weight });
    return setJSON(KEYS.weightLogs, logs);
  },
  async updateWeightLog(id, fields) {
    const logs = await getJSON(KEYS.weightLogs, []);
    const idx = logs.findIndex(l => l.id === id);
    if (idx >= 0) logs[idx] = { ...logs[idx], ...fields };
    return setJSON(KEYS.weightLogs, logs);
  },

  // ── Food Logs ────────────────────────────────────────────────
  async getFoodLogs() {
    const l = await getJSON(KEYS.foodLogs, []);
    return [...l].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  async addFoodLog(item) {
    const logs = await getJSON(KEYS.foodLogs, []);
    const date = item.date || getFormattedDate(new Date());
    logs.push({
      id:       uid(),
      date,
      name:     item.name     || '',
      calories: Number(item.calories) || 0,
      protein:  Number(item.protein)  || 0,
      carbs:    Number(item.carbs)    || 0,
      fats:     Number(item.fats)     || 0,
      // Was previously dropped here -- Nutrition.js already computes the
      // correctly-scaled fibre value and passes it in `item.fibre`, but this
      // explicit field whitelist never carried it into the stored record,
      // so every logged food persisted with fibre hard-set to 0 regardless
      // of what was calculated/shown pre-log. Follows the exact same
      // Number(...)||0 pattern already used for calories/protein/carbs/fats.
      fibre:    Number(item.fibre)    || 0,
    });
    await invalidateRecoveryFrom(date);
    return setJSON(KEYS.foodLogs, logs);
  },
  async updateFoodLog(id, fields) {
    const logs = await getJSON(KEYS.foodLogs, []);
    const idx = logs.findIndex(l => l.id === id);
    if (idx >= 0) {
      logs[idx] = {
        ...logs[idx],
        ...fields,
        calories: Number(fields.calories ?? logs[idx].calories) || 0,
        protein:  Number(fields.protein  ?? logs[idx].protein)  || 0,
        carbs:    Number(fields.carbs    ?? logs[idx].carbs)    || 0,
        fats:     Number(fields.fats     ?? logs[idx].fats)     || 0,
        // Editing already passed fibre through via the ...fields spread
        // above (unlike add, this path wasn't dropping it), but wasn't
        // coerced/defaulted like the other macros -- aligning it here for
        // consistency and so a cleared/invalid input can't persist as NaN.
        fibre:    Number(fields.fibre    ?? logs[idx].fibre)    || 0,
      };
      await invalidateRecoveryFrom(logs[idx].date);
    }
    return setJSON(KEYS.foodLogs, logs);
  },
  async deleteFoodLog(id) {
    const logs = await getJSON(KEYS.foodLogs, []);
    const target = logs.find(l => l.id === id);
    if (target) await invalidateRecoveryFrom(target.date);
    return setJSON(KEYS.foodLogs, logs.filter(l => l.id !== id));
  },

  // ── Workout Logs ─────────────────────────────────────────────
  async getWorkoutLogs() {
    const l = await getJSON(KEYS.workoutLogs, []);
    return [...l].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  async addWorkoutLog(item) {
    const logs = await getJSON(KEYS.workoutLogs, []);
    const date = item.date || getFormattedDate(new Date());
    logs.push({ id: uid(), date, ...item });
    await invalidateRecoveryFrom(date);
    return setJSON(KEYS.workoutLogs, logs);
  },
  async updateWorkoutLog(id, fields) {
    const logs = await getJSON(KEYS.workoutLogs, []);
    const idx = logs.findIndex(l => l.id === id);
    if (idx >= 0) {
      logs[idx] = { ...logs[idx], ...fields };
      await invalidateRecoveryFrom(logs[idx].date);
    }
    return setJSON(KEYS.workoutLogs, logs);
  },
  async deleteWorkoutLog(id) {
    const logs = await getJSON(KEYS.workoutLogs, []);
    const target = logs.find(l => l.id === id);
    const remaining = logs.filter(l => l.id !== id);
    // A two-exercise superset must not become a one-exercise superset after
    // deleting one member. Convert the survivor back to a normal exercise.
    if (target?.isSuperset === true && target?.supersetId) {
      const siblings = remaining
        .filter(l => l.supersetId === target.supersetId && l.isSuperset === true)
        .sort((a, b) => (Number(a.supersetOrder) || 999) - (Number(b.supersetOrder) || 999));
      if (siblings.length === 1) {
        siblings[0].isSuperset = false;
        delete siblings[0].supersetId;
        delete siblings[0].supersetOrder;
      } else if (siblings.length >= 2) {
        siblings.forEach((row, index) => { row.supersetOrder = index + 1; });
      }
    }
    if (target) await invalidateRecoveryFrom(target.date);
    return setJSON(KEYS.workoutLogs, remaining);
  },
  // Bulk delete — used for "delete entire session" so removal happens as a
  // single read/write instead of N sequential ones (which could race and
  // silently drop deletions when called back-to-back for each exercise).
  async deleteWorkoutLogsByIds(ids) {
    const idSet = new Set(ids);
    const logs = await getJSON(KEYS.workoutLogs, []);
    const dates = new Set(logs.filter(l => idSet.has(l.id)).map(l => l.date));
    await Promise.all([...dates].map(d => invalidateRecoveryFrom(d)));
    return setJSON(KEYS.workoutLogs, logs.filter(l => !idSet.has(l.id)));
  },
  async deleteWorkoutLogsBySession(sessionId) {
    const logs = await getJSON(KEYS.workoutLogs, []);
    const dates = new Set(logs.filter(l => l.sessionId === sessionId).map(l => l.date));
    await Promise.all([...dates].map(d => invalidateRecoveryFrom(d)));
    return setJSON(KEYS.workoutLogs, logs.filter(l => l.sessionId !== sessionId));
  },

  // ── Sleep Logs ───────────────────────────────────────────────
  async getSleepLogs() {
    const l = await getJSON(KEYS.sleepLogs, []);
    return [...l].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  },
  async addSleepLog(item) {
    const logs = await getJSON(KEYS.sleepLogs, []);
    const date = item.date || getFormattedDate(new Date());
    // Night sleep: replace existing night log for that date
    // Naps: allow multiple per day
    if (item.sleepType === 'night') {
      const idx = logs.findIndex(l => l.date === date && l.sleepType === 'night');
      if (idx >= 0) { logs[idx] = { ...logs[idx], ...item, date }; }
      else logs.push({ id: uid(), date, ...item });
    } else {
      logs.push({ id: uid(), date, sleepType: 'nap', ...item });
    }
    await invalidateRecoveryFrom(date);
    return setJSON(KEYS.sleepLogs, logs);
  },
  async updateSleepLog(id, fields) {
    const logs = await getJSON(KEYS.sleepLogs, []);
    const idx = logs.findIndex(l => l.id === id);
    if (idx >= 0) {
      logs[idx] = { ...logs[idx], ...fields };
      await invalidateRecoveryFrom(logs[idx].date);
    }
    return setJSON(KEYS.sleepLogs, logs);
  },
  async deleteSleepLog(id) {
    const logs = await getJSON(KEYS.sleepLogs, []);
    const target = logs.find(l => l.id === id);
    if (target) await invalidateRecoveryFrom(target.date);
    return setJSON(KEYS.sleepLogs, logs.filter(l => l.id !== id));
  },

  // ── Water Logs ───────────────────────────────────────────────
  async getWaterLogs() {
    const l = await getJSON(KEYS.waterLogs, []);
    return [...l].sort((a,b) => String(b.timestamp || b.date).localeCompare(String(a.timestamp || a.date)));
  },
  async addWaterLog(item) {
    const logs = await getJSON(KEYS.waterLogs, []);
    const date = item.date || getFormattedDate(new Date());
    logs.push({ id: uid(), date, amountMl: Number(item.amountMl) || 0, timestamp: item.timestamp || new Date().toISOString() });
    await invalidateRecoveryFrom(date);
    return setJSON(KEYS.waterLogs, logs);
  },
  async updateWaterLog(id, fields) {
    const logs = await getJSON(KEYS.waterLogs, []); const idx = logs.findIndex(l => l.id === id);
    if (idx >= 0) {
      logs[idx] = { ...logs[idx], ...fields, amountMl: Number(fields.amountMl ?? logs[idx].amountMl) || 0 };
      await invalidateRecoveryFrom(logs[idx].date);
    }
    return setJSON(KEYS.waterLogs, logs);
  },
  async deleteWaterLog(id) {
    const logs = await getJSON(KEYS.waterLogs, []);
    const target = logs.find(l => l.id === id);
    if (target) await invalidateRecoveryFrom(target.date);
    return setJSON(KEYS.waterLogs, logs.filter(l => l.id !== id));
  },

  // ── Progress Photos metadata (image files live in app filesystem) ───────
  async getProgressPhotos() { return getJSON(KEYS.progressPhotos, []); },
  async addProgressPhoto(photo) {
    const rows = await getJSON(KEYS.progressPhotos, []);
    const date = String(photo?.date || getFormattedDate(new Date())).slice(0, 10);
    const type = String(photo?.type || 'photo').toLowerCase();
    const weekKey = String(photo?.weekKey || '');
    if (weekKey && rows.some(r => String(r.weekKey || '') === weekKey && String(r.type || '').toLowerCase() === type)) {
      return null;
    }
    const row = { id: uid(), ...photo, date, type, ...(weekKey ? { weekKey } : {}) };
    rows.push(row);
    await setJSON(KEYS.progressPhotos, rows);
    return row;
  },
  async deleteProgressPhoto(id) { const rows = await getJSON(KEYS.progressPhotos, []); return setJSON(KEYS.progressPhotos, rows.filter(p => p.id !== id)); },

  // Used only by Photo Archive restore (utils/progress-photos.js). Unlike
  // addProgressPhoto, this intentionally skips the "one photo per
  // category per week" rule — that rule exists to stop someone from
  // logging duplicate *live* check-ins, and would incorrectly block
  // restoring genuinely distinct historical photos that happen to fall in
  // the same week. Dedupes only by id, so re-importing the same archive
  // twice is a safe no-op rather than creating duplicate rows.
  async mergeProgressPhotos(newRows = []) {
    const rows = await getJSON(KEYS.progressPhotos, []);
    const existingIds = new Set(rows.map(r => r.id));
    const toAdd = (newRows || []).filter(r => r?.id && !existingIds.has(r.id));
    if (toAdd.length) await setJSON(KEYS.progressPhotos, [...rows, ...toAdd]);
    return toAdd.length;
  },

  // ── Progress Photo custom categories ─────────────────────────────────
  // Front/Side/Back remain the built-in defaults (handled in
  // utils/progress-photos.js) and are not stored here. This only persists
  // user-created additions like "chest" or "legs".
  async getProgressPhotoCategories() {
    const rows = await getJSON(KEYS.progressPhotoCategories, []);
    return Array.isArray(rows) ? rows : [];
  },
  async addProgressPhotoCategory(name) {
    const rows = await getJSON(KEYS.progressPhotoCategories, []);
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('Category name cannot be empty.');
    const key = trimmed.toLowerCase();
    const defaultKeys = ['front', 'side', 'back'];
    if (defaultKeys.includes(key)) throw new Error('That category already exists.');
    if (rows.some(r => String(r.key || '').toLowerCase() === key)) {
      throw new Error('A category with that name already exists.');
    }
    // Sanitize for filesystem use in filenames (see utils/progress-photos.js
    // buildProgressPhotoFilename) — lowercase, alphanumeric + hyphen only.
    const safeKey = key.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `category-${Date.now()}`;
    const row = { key: safeKey, label: trimmed, custom: true, createdAt: new Date().toISOString() };
    rows.push(row);
    await setJSON(KEYS.progressPhotoCategories, rows);
    return row;
  },
  // ── Recovery score history (date-keyed) ──────────────────────
  async getRecoveryScoreForDate(date) {
    const rows = await getJSON(KEYS.recoveryScores, {});
    return rows[date] || null;
  },
  // Upsert: exactly one record per date. Calling this twice for the same
  // date simply overwrites that date's entry -- never creates a duplicate,
  // satisfying "operation must be idempotent" without needing an extra
  // existence check here (the object-keyed-by-date shape makes a duplicate
  // structurally impossible).
  async saveRecoveryScoreForDate(date, data) {
    const rows = await getJSON(KEYS.recoveryScores, {});
    const next = { ...rows, [date]: { ...data, date } };
    await setJSON(KEYS.recoveryScores, next);
    return next[date];
  },

  async deleteProgressPhotoCategory(key) {
    const rows = await getJSON(KEYS.progressPhotoCategories, []);
    return setJSON(KEYS.progressPhotoCategories, rows.filter(r => r.key !== key));
  },

  // ── Notification preferences ───────────────────────────────────────────
  async getNotificationSettings() { return getJSON(KEYS.notificationSettings, null); },
  async saveNotificationSettings(settings) { return setJSON(KEYS.notificationSettings, settings); },

  // ── Exercise Library ────────────────────────────────────────
  async getExerciseLibrary() {
    const rows = await getJSON(KEYS.exerciseLibrary, []);
    return Array.isArray(rows) ? rows : [];
  },
  async addExerciseToLibrary(exercise) {
    const rows = await getJSON(KEYS.exerciseLibrary, []);
    const name = String(exercise?.name || '').trim();
    const muscle = String(exercise?.muscleGroup || exercise?.muscle || '').trim();
    if (!name || !muscle) return rows;
    const exists = rows.some(r => String(r.name || '').toLowerCase() === name.toLowerCase() && String(r.muscleGroup || r.muscle || '').toLowerCase() === muscle.toLowerCase());
    if (exists) return rows;
    rows.push({ id: uid(), name, muscleGroup: muscle, exerciseType: exercise.exerciseType || 'reps', ...(exercise.metadata || {}) });
    await setJSON(KEYS.exerciseLibrary, rows);
    return rows;
  },
  // Removes ONE entry from the exercise-selection/dropdown catalog by its
  // stable id. This is a "remove from future selection list" operation
  // only -- it intentionally never reads or writes KEYS.workoutLogs, so
  // previously logged sets/sessions that used this exercise name are
  // completely unaffected (workout log entries store the exercise name as
  // a plain string, not a reference to this library, so there's no
  // relationship here to cascade through in the first place).
  async deleteExerciseFromLibrary(id) {
    const rows = await getJSON(KEYS.exerciseLibrary, []);
    const next = rows.filter(r => r.id !== id);
    await setJSON(KEYS.exerciseLibrary, next);
    return next;
  },

  // ── Workout Session Status ─────────────────────────────────
  async getWorkoutSessions() {
    const rows = await getJSON(KEYS.workoutSessions, {});
    return rows && typeof rows === 'object' && !Array.isArray(rows) ? rows : {};
  },
  async saveWorkoutSession(session) {
    const rows = await getJSON(KEYS.workoutSessions, {});
    rows[session.sessionId] = { ...(rows[session.sessionId] || {}), ...session };
    return setJSON(KEYS.workoutSessions, rows);
  },
  async updateWorkoutSession(sessionId, fields) {
    const rows = await getJSON(KEYS.workoutSessions, {});
    rows[sessionId] = { ...(rows[sessionId] || { sessionId }), ...fields, sessionId };
    return setJSON(KEYS.workoutSessions, rows);
  },
  async getWorkoutSessionStatus(sessionId) {
    if (!sessionId) return 'completed';
    const rows = await getJSON(KEYS.workoutSessions, {});
    if (rows[sessionId]?.status) return rows[sessionId].status;
    const active = await getJSON(KEYS.activeWorkoutSession, null);
    if (active?.sessionId === sessionId && active?.status !== 'manually_ended' && active?.status !== 'auto_ended') return 'active';
    // Legacy logs have no separate session record. Without a persisted active
    // session they are treated as completed, preventing accidental resume.
    return 'completed';
  },
  async deleteWorkoutSession(sessionId) {
    const rows = await getJSON(KEYS.workoutSessions, {});
    delete rows[sessionId];
    return setJSON(KEYS.workoutSessions, rows);
  },

  // ── Current Exercise Drafts ─────────────────────────────────
  // Drafts are intentionally separate from the active-session record.
  async getActiveWorkoutDrafts(sessionId) {
    const all = await getJSON(KEYS.activeWorkoutDrafts, {});
    return sessionId && all[sessionId] && typeof all[sessionId] === 'object' ? all[sessionId] : {};
  },
  async saveActiveWorkoutDraft(sessionId, draftKey, draft) {
    if (!sessionId || !draftKey) return;
    const all = await getJSON(KEYS.activeWorkoutDrafts, {});
    if (!all[sessionId]) all[sessionId] = {};
    all[sessionId][draftKey] = draft;
    return setJSON(KEYS.activeWorkoutDrafts, all);
  },
  async clearActiveWorkoutDraft(sessionId, draftKey) {
    if (!sessionId) return;
    const all = await getJSON(KEYS.activeWorkoutDrafts, {});
    if (!all[sessionId]) return;
    if (draftKey) delete all[sessionId][draftKey];
    else delete all[sessionId];
    return setJSON(KEYS.activeWorkoutDrafts, all);
  },

  // ── Custom Foods ─────────────────────────────────────────────
  // getCustomFoods() lazily migrates any legacy custom food created before
  // fibre was introduced (fibre missing/null/undefined). This is safe to
  // run on every call: if nothing needs migrating it's just a cheap
  // presence check with no write, and it never touches a food that
  // already has a fibre value (including a legitimate 0).
  async getCustomFoods() {
    const foods = await getJSON(KEYS.customFoods, []);
    let migrated = false;
    const next = foods.map(f => {
      if (f.fibre !== null && f.fibre !== undefined) return f; // already has a value (0 counts as a value) -- leave untouched
      migrated = true;
      const per100 = estimateFibrePer100g(f.name);
      const qty = Number(f.qty ?? f.per) || 100;
      const fibre = Math.round(per100 * (qty / 100) * 10) / 10;
      return { ...f, fibre };
    });
    if (migrated) await setJSON(KEYS.customFoods, next);
    return next;
  },
  async addCustomFood(food) {
    const foods = await getJSON(KEYS.customFoods, []);
    foods.push({ id: uid(), ...food });
    return setJSON(KEYS.customFoods, foods);
  },
  // Updates an existing custom-food definition in place -- same identity
  // (id never changes), no duplicate row is created. Logged food records
  // are plain snapshots taken at log time (see addFoodLog: it copies
  // name/calories/protein/carbs/fats/fibre directly, with no id/reference
  // back to KEYS.customFoods), so updating the definition here has no
  // effect on any historical fittrack_food_logs entry -- exactly matching
  // "preserve historical logged nutrition" for a snapshot-based architecture.
  async updateCustomFood(id, fields) {
    const foods = await getJSON(KEYS.customFoods, []);
    const idx = foods.findIndex(f => f.id === id);
    if (idx >= 0) {
      foods[idx] = {
        ...foods[idx],
        ...fields,
        id: foods[idx].id, // identity is never overwritten by `fields`
        calories: Number(fields.calories ?? foods[idx].calories) || 0,
        protein:  Number(fields.protein  ?? foods[idx].protein)  || 0,
        carbs:    Number(fields.carbs    ?? foods[idx].carbs)    || 0,
        fat:      Number(fields.fat      ?? foods[idx].fat)      || 0,
        fibre:    Number(fields.fibre    ?? foods[idx].fibre)    || 0,
        qty:      Number(fields.qty      ?? foods[idx].qty)      || 100,
      };
    }
    return setJSON(KEYS.customFoods, foods);
  },
  async deleteCustomFood(id) {
    const foods = await getJSON(KEYS.customFoods, []);
    return setJSON(KEYS.customFoods, foods.filter(f => f.id !== id));
  },

  // ── Clear all ─────────────────────────────────────────────────
  async clearAllData() {
    // Clear all user-generated data and settings.
    await Promise.all(Object.values(KEYS).map(k => storage.removeItem(k)));

    // IMPORTANT: keep the database marked as initialized. Otherwise the
    // startup seed routine interprets a reset as a brand-new installation
    // and recreates the demo/seed data on the next app launch.
    await storage.setItem(KEYS.seeded, 'true');

    memoryCache.clear();
  },

  // ── Backup / Restore ─────────────────────────────────────────
  async exportAllData() {
    const [profile, weightLogs, foodLogs, workoutLogs, sleepLogs, customFoods, waterLogs, progressPhotos, progressPhotoCategories, notificationSettings, exerciseLibrary, workoutSessions, progressPhotoPinHash, targetHistory] =
      await Promise.all([
        getJSON(KEYS.profile,     DEFAULT_PROFILE),
        getJSON(KEYS.weightLogs,  []),
        getJSON(KEYS.foodLogs,    []),
        getJSON(KEYS.workoutLogs, []),
        getJSON(KEYS.sleepLogs,   []),
        getJSON(KEYS.customFoods, []),
        getJSON(KEYS.waterLogs, []),
        getJSON(KEYS.progressPhotos, []),
        getJSON(KEYS.progressPhotoCategories, []),
        getJSON(KEYS.notificationSettings, null),
        getJSON(KEYS.exerciseLibrary, []),
        getJSON(KEYS.workoutSessions, {}),
        this.getSetting('progressPhotoPinHash'),
        ensureTargetHistory(),
      ]);
    return JSON.stringify({
      __version: 4,
      __exported: new Date().toISOString(),
      profile, weightLogs, foodLogs, workoutLogs, sleepLogs, customFoods, waterLogs, notificationSettings, exerciseLibrary, workoutSessions,
      // Versioned target history (see TARGET_FIELDS/resolveTargetForDate) --
      // needed so a restored backup keeps evaluating old dates against the
      // targets that were actually active then, not just today's targets.
      targetHistory,
      // Progress Photos: metadata + filesystem paths only — the actual
      // image bytes are never included here (see utils/progress-photos.js).
      // The password is never included in raw form, only its existing
      // hash, exactly as it's stored on-device — restoring it re-enables
      // the same password without ever exposing it in the backup file.
      progressPhotos,
      progressPhotoCategories,
      progressPhotoPinHash: progressPhotoPinHash || null,
      // The actual image FILES (not their metadata) live outside this
      // backup — see PROGRESS_PHOTOS_DIR in utils/progress-photos.js. Kept
      // here so older/other tooling reading this JSON directly can still
      // find the folder path without needing to know app internals.
      progressPhotosFolder: 'fittrack/progress-photos/',
      progressPhotosImageDataIncluded: false,
    }, null, 2);
  },

  async importAllData(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data || (!data.profile && !data.foodLogs)) {
      throw new Error('Invalid backup file — missing required data');
    }
    await Promise.all([
      data.profile      && setJSON(KEYS.profile,     data.profile),
      data.weightLogs   && setJSON(KEYS.weightLogs,  data.weightLogs),
      data.foodLogs     && setJSON(KEYS.foodLogs,    data.foodLogs),
      data.workoutLogs  && setJSON(KEYS.workoutLogs, data.workoutLogs),
      data.sleepLogs    && setJSON(KEYS.sleepLogs,   data.sleepLogs),
      data.customFoods  && setJSON(KEYS.customFoods, data.customFoods),
      data.waterLogs    && setJSON(KEYS.waterLogs, data.waterLogs),
      data.notificationSettings && setJSON(KEYS.notificationSettings, data.notificationSettings),
      data.exerciseLibrary && setJSON(KEYS.exerciseLibrary, data.exerciseLibrary),
      data.workoutSessions && setJSON(KEYS.workoutSessions, data.workoutSessions),
      // Older backups (pre-Change 4) won't have this key -- ensureTargetHistory()
      // will auto-migrate from the restored profile on first read, exactly as
      // it does for any other pre-existing install. Never rejects the backup.
      Array.isArray(data.targetHistory) && data.targetHistory.length && setJSON(KEYS.targetHistory, data.targetHistory),
      // Progress Photo metadata/paths + custom categories + password hash.
      // Only metadata is restored here — whether each photo's underlying
      // image file is actually present on this device is checked
      // separately (see utils/progress-photos.js#reconcileRestoredPhotos),
      // since restoring the JSON can never restore the image bytes.
      Array.isArray(data.progressPhotos) && setJSON(KEYS.progressPhotos, data.progressPhotos),
      Array.isArray(data.progressPhotoCategories) && setJSON(KEYS.progressPhotoCategories, data.progressPhotoCategories),
      data.progressPhotoPinHash && this.saveSetting('progressPhotoPinHash', data.progressPhotoPinHash),
      setJSON(KEYS.seeded, true),
    ]);
    return {
      progressPhotosRestored: Array.isArray(data.progressPhotos) ? data.progressPhotos.length : 0,
      progressPhotoCategoriesRestored: Array.isArray(data.progressPhotoCategories) ? data.progressPhotoCategories.length : 0,
      progressPhotoPasswordRestored: !!data.progressPhotoPinHash,
      progressPhotosFolder: data.progressPhotosFolder || 'fittrack/progress-photos/',
    };
  },

  // ── Active Workout Session (persists across screen/app switches) ──────
  // Stores the in-progress session (id, name, date, muscles, start time) so
  // that navigating away — even closing and reopening the app — restores
  // exactly where the user left off, instead of losing the session state.
  async getActiveWorkoutSession() {
    return getJSON(KEYS.activeWorkoutSession, null);
  },
  async saveActiveWorkoutSession(session) {
    return setJSON(KEYS.activeWorkoutSession, session);
  },
  async clearActiveWorkoutSession() {
    const result = await storage.removeItem(KEYS.activeWorkoutSession);
    invalidateJSON(KEYS.activeWorkoutSession);
    return result;
  },

  // ── Settings / Misc key-value store ──────────────────────────
  async getSetting(key) {
    return storage.getItem(`fittrack_setting_${key}`);
  },

  async saveSetting(key, value) {
    return storage.setItem(`fittrack_setting_${key}`, value);
  },
};