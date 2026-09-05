import { Platform } from 'react-native';

// ---------------------------------------------------------------------------
// Dynamic expo-notifications loader (prevents web build crashes)
// ---------------------------------------------------------------------------
async function getNotifModule() {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

async function getDeviceModule() {
  if (Platform.OS === 'web') return null;
  try {
    const mod = await import('expo-device');
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-app Toast system
// ---------------------------------------------------------------------------
let _toastHandler = null;

export function registerToastHandler(fn) {
  _toastHandler = fn;
}

// Centralized default toast duration. Was 3500ms; bumped to 5500ms so
// toasts are easier to read. Change ONLY this constant to retune duration
// app-wide — do not hardcode durations at individual showToast() call sites.
export const DEFAULT_TOAST_DURATION = 5500;

export function showToast(message, type = 'info', duration = DEFAULT_TOAST_DURATION) {
  if (_toastHandler) {
    _toastHandler({
      message: String(message ?? ''),
      type,
      duration,
      id: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// NotificationService
// ---------------------------------------------------------------------------
export function getDefaultNotificationSettings() {
  return {
    enabled: true,
    sleep: { enabled: true, hour: 7, minute: 0, type: 'push' },
    nutrition: { enabled: true, hour: 12, minute: 30, type: 'push' },
    workout: { enabled: true, hour: 18, minute: 0, type: 'push' },
    calorie: { enabled: true, hour: 23, minute: 0, type: 'push' },
    protein: { enabled: true, hour: 23, minute: 5, type: 'push' },
    // Weekly progress-photo nudge — Sunday by default. Uploading is always
    // the user's choice; this is just a reminder, never enforced.
    photos: { enabled: true, hour: 10, minute: 0, type: 'push' },
    quietHours: { enabled: true, start: '22:30', end: '07:00' },
  };
}

export const NotificationService = {
  /**
   * Requests push notification permission and configures the notification
   * handler for foreground notifications.
   * @returns {Promise<boolean>} Whether permission was granted.
   */
  async requestPermission() {
    const Notifications = await getNotifModule();
    if (!Notifications) return false;

    // Configure how notifications appear while the app is in the foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    // Always (re)create the Android channel, not just the first time
    // permission is granted. Previously this only ran inside the
    // "just granted" branch below, so on every subsequent app launch —
    // where permission was already granted — the channel step was
    // skipped entirely. Scheduled notifications targeting a channel
    // that doesn't exist are silently dropped by Android, which is why
    // reminders never appeared even though permission was granted.
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('fittrack-reminders', {
          name: 'FitTrack Reminders',
          importance: Notifications.AndroidImportance.HIGH,
        });
      } catch {}
    }

    // Best-effort simulator/emulator check. Only bail out when we can
    // positively confirm this is a simulator. Previously, ANY failure to
    // load expo-device (e.g. the package not being installed, or the
    // dynamic import failing in certain runtimes) made getDeviceModule()
    // return null, which was treated the same as "this is a simulator" —
    // silently returning false and skipping the permission request forever.
    // That meant push permission was never actually requested on real
    // devices either, so no local notification could ever be scheduled,
    // while the unrelated in-app toast system kept working fine.
    const Device = await getDeviceModule();
    if (Device && Device.isDevice === false) {
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  },

  /**
   * Cancels all previously scheduled notifications.
   */
  async cancelAll() {
    const Notifications = await getNotifModule();
    if (!Notifications) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
  },

  /**
   * Schedules (or reschedules) a daily repeating notification.
   * @param {{ id: string, title: string, body: string, hour: number, minute: number }} opts
   */
  async scheduleDaily({ id, title, body, hour, minute }) {
    const Notifications = await getNotifModule();
    if (!Notifications) {
      // Web fallback — show an in-app toast immediately (scheduled toasts
      // aren't possible on web; the toast fires on app open instead)
      showToast(body, 'info');
      return;
    }

    // Cancel any existing notification with the same identifier
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // May throw if identifier doesn't exist — safe to ignore
    }

    // Prefer the dedicated DAILY trigger type. expo-notifications added
    // DAILY/WEEKLY/YEARLY trigger types specifically because the older
    // "type: 'calendar', hour, minute, repeats: true" shape is unreliable
    // for recurring notifications on Android in current SDKs — it can be
    // accepted without error yet never actually fire, which matches
    // "permission is granted but the notification never pops at the set
    // time". Falling back to the calendar shape keeps this working on
    // older SDKs that don't have the DAILY type.
    const trigger = Notifications.SchedulableTriggerInputTypes?.DAILY
      ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute }
      : { type: 'calendar', hour, minute, repeats: true };

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title, body, sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'fittrack-reminders' } : {}),
          data: { screen: id === 'sleep_morning' ? 'Sleep' : id === 'workout_evening' ? 'Workouts' : 'Nutrition' },
        },
        trigger,
      });
    } catch (e) {
      // Previously unguarded — a single bad schedule call here would throw
      // out of the `for` loop in scheduleConfiguredReminders and silently
      // cancel scheduling every reminder after it in the same run, with no
      // visible error anywhere. Logging + catching keeps one failure from
      // taking the rest down with it.
      console.warn(`[Notifications] failed to schedule "${id}"`, e);
    }
  },

  /**
   * Schedules (or reschedules) a weekly repeating notification.
   * weekday follows expo-notifications' convention: 1 = Sunday ... 7 = Saturday.
   */
  async scheduleWeekly({ id, title, body, weekday = 1, hour, minute }) {
    const Notifications = await getNotifModule();
    if (!Notifications) {
      showToast(body, 'info');
      return;
    }
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    const trigger = Notifications.SchedulableTriggerInputTypes?.WEEKLY
      ? { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute }
      : { type: 'calendar', weekday, hour, minute, repeats: true };
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: id,
        content: {
          title, body, sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'fittrack-reminders' } : {}),
          data: { screen: 'Dashboard' },
        },
        trigger,
      });
    } catch (e) {
      console.warn(`[Notifications] failed to schedule weekly "${id}"`, e);
    }
  },

  /**
   * Evaluates the user's daily data and schedules appropriate reminders.
   *
   * Thresholds (per your spec):
   *   - Calorie deficit  > 150 kcal  → schedule/show reminder
   *   - Protein deficit  > 10 g      → schedule/show reminder
   *
   * @param {{
   *   profile: object,
   *   hasTodayFood: boolean,
   *   hasTodaySleep: boolean,
   *   hasTodayWorkout: boolean,
   *   todayCalories: number,
   *   todayProtein: number
   * }} opts
   */
  async checkAndScheduleReminders({
    profile = {}, hasTodayFood, hasTodaySleep, hasTodayWorkout, todayCalories, todayProtein,
  }) {
    const defaults = getDefaultNotificationSettings();
    let settings = defaults;
    try {
      const storage = await import('./storage');
      const raw = await storage.default.getItem('fittrack_notification_settings');
      if (raw) settings = { ...defaults, ...JSON.parse(raw) };
    } catch {}
    return this.scheduleConfiguredReminders({ settings, profile, hasTodayFood, hasTodaySleep, hasTodayWorkout, todayCalories, todayProtein });
  },

  async scheduleConfiguredReminders({ settings, profile = {}, hasTodayFood, hasTodaySleep, hasTodayWorkout, todayCalories = 0, todayProtein = 0, force = false }) {
    const Notifications = await getNotifModule();
    if (!Notifications) return;
    const granted = settings.enabled ? await this.requestPermission() : false;
    const quiet = settings.quietHours?.enabled ? settings.quietHours : null;
    const signature = JSON.stringify({
      enabled: !!settings.enabled,
      sleep: settings.sleep, nutrition: settings.nutrition, workout: settings.workout,
      calorie: settings.calorie, protein: settings.protein, photos: settings.photos, quiet,
      hasTodayFood: !!hasTodayFood, hasTodaySleep: !!hasTodaySleep, hasTodayWorkout: !!hasTodayWorkout,
      calorieTarget: profile.calorieTarget ?? 2300, proteinTarget: profile.proteinTarget ?? 140,
      todayCalories: Math.round(Number(todayCalories) || 0), todayProtein: Math.round(Number(todayProtein) || 0),
    });

    // Avoid needless OS rescheduling on every app start. If the saved signature
    // is unchanged, only verify that the expected schedules still exist.
    if (!force) {
      try {
        const storage = await import('./storage');
        const previous = await storage.default.getItem('fittrack_notification_schedule_signature');
        if (previous === signature) {
          const scheduled = await Notifications.getAllScheduledNotificationsAsync();
          const ids = new Set(scheduled.map(n => n?.identifier));
          const expected = ['sleep_morning','nutrition_noon','workout_evening','calorie_deficit','protein_deficit','progress_photos_weekly'];
          const anyExpected = expected.some(id => ids.has(id));
          if (anyExpected || !settings.enabled) return;
        }
      } catch {}
    }
    const inQuiet = (hour, minute) => {
      if (!quiet) return false;
      const cur = hour * 60 + minute, start = Number(quiet.start?.split(':')[0]) * 60 + Number(quiet.start?.split(':')[1]), end = Number(quiet.end?.split(':')[0]) * 60 + Number(quiet.end?.split(':')[1]);
      return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
    };
    const items = [
      { key:'sleep', id:'sleep_morning', title:'🌙 Log Your Sleep', body:"Good morning! Log last night's sleep duration to track your recovery.", condition:!hasTodaySleep },
      { key:'nutrition', id:'nutrition_noon', title:'🍽️ Log Your Meals', body:"You haven't logged any food today. Keep your nutrition on track!", condition:!hasTodayFood },
      { key:'workout', id:'workout_evening', title:'💪 Workout Reminder', body:'No workout logged today. Time to hit the gym!', condition:!hasTodayWorkout },
    ];
    for (const item of items) {
      const cfg = settings[item.key];
      if (granted && cfg?.enabled && item.condition && !inQuiet(cfg.hour, cfg.minute)) await this.scheduleDaily({ id:item.id, title:item.title, body:item.body, hour:cfg.hour, minute:cfg.minute });
      else { try { await Notifications.cancelScheduledNotificationAsync(item.id); } catch {} }
    }
    // Calorie/protein reminders: only ever scheduled after checking today's
    // ACTUAL current intake against the target (deficit/gap computed just
    // above from the live todayCalories/todayProtein passed in) — if the
    // goal is already met, the reminder is cancelled instead of firing a
    // stale "you're short" message. This function is called again on every
    // app foreground (see App.js), so the check re-runs with fresh numbers
    // throughout the day, not just once at cold start.
    const calorieTarget = profile.calorieTarget ?? 2300, deficit = calorieTarget - todayCalories;
    const c = settings.calorie;
    if (granted && c?.enabled && deficit > 150 && !inQuiet(c.hour,c.minute)) await this.scheduleDaily({ id:'calorie_deficit', title:'⚡ Calorie Goal', body:`You're ${Math.round(deficit)} kcal short today. Have a light snack to meet your goal!`, hour:c.hour, minute:c.minute });
    else { try { await Notifications.cancelScheduledNotificationAsync('calorie_deficit'); } catch {} }
    const proteinTarget = profile.proteinTarget ?? 140, gap = proteinTarget - todayProtein, pr = settings.protein;
    if (granted && pr?.enabled && gap > 10 && !inQuiet(pr.hour,pr.minute)) await this.scheduleDaily({ id:'protein_deficit', title:'💪 Protein Goal', body:`Still need ${Math.round(gap)}g more protein today.`, hour:pr.hour, minute:pr.minute });
    else { try { await Notifications.cancelScheduledNotificationAsync('protein_deficit'); } catch {} }
    // Weekly progress-photo reminder (Sunday by default) — always just a
    // nudge, never blocks/requires anything, so it schedules whenever
    // enabled with no "already done" gating.
    const ph = settings.photos;
    if (granted && ph?.enabled && !inQuiet(ph.hour, ph.minute)) await this.scheduleWeekly({ id:'progress_photos_weekly', title:'📸 Weekly Progress Photos', body:"Sunday check-in: snap any of your 7 progress photo angles you'd like to update. Totally optional!", weekday:1, hour:ph.hour, minute:ph.minute });
    else { try { await Notifications.cancelScheduledNotificationAsync('progress_photos_weekly'); } catch {} }
    if (!settings.enabled) { for (const id of ['sleep_morning','nutrition_noon','workout_evening','calorie_deficit','protein_deficit','progress_photos_weekly']) { try { await Notifications.cancelScheduledNotificationAsync(id); } catch {} } }
    try {
      const storage = await import('./storage');
      await storage.default.setItem('fittrack_notification_schedule_signature', signature);
    } catch {}
  },

  async updateNotificationSetting(settings) {
    try {
      const storage = await import('./storage');
      await storage.default.setItem('fittrack_notification_settings', JSON.stringify(settings));
    } catch {}
  },

  /**
   * Persist and update only one configured reminder. This avoids rescheduling
   * unrelated OS notifications when the user changes a single time.
   */
  async updateConfiguredNotification({
    key, settings, profile = {}, hasTodayFood = false, hasTodaySleep = false,
    hasTodayWorkout = false, todayCalories = 0, todayProtein = 0,
  }) {
    await this.updateNotificationSetting(settings);
    const Notifications = await getNotifModule();
    if (!Notifications) return;

    const ids = {
      sleep: 'sleep_morning',
      nutrition: 'nutrition_noon',
      workout: 'workout_evening',
      calorie: 'calorie_deficit',
      protein: 'protein_deficit',
      photos: 'progress_photos_weekly',
    };
    const id = ids[key];
    if (!id) return;

    const cancel = async () => {
      try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
    };

    if (!settings.enabled || !settings[key]?.enabled) {
      await cancel();
      return;
    }

    const cfg = settings[key];
    const quiet = settings.quietHours?.enabled ? settings.quietHours : null;
    const inQuiet = (hour, minute) => {
      if (!quiet) return false;
      const cur = hour * 60 + minute;
      const start = Number(quiet.start?.split(':')[0]) * 60 + Number(quiet.start?.split(':')[1]);
      const end = Number(quiet.end?.split(':')[0]) * 60 + Number(quiet.end?.split(':')[1]);
      return start <= end ? cur >= start && cur < end : cur >= start || cur < end;
    };

    // NOTE: there used to be a "shouldSchedule" check here mirroring the
    // automatic daily re-evaluation (e.g. skip the sleep reminder if
    // today's sleep is already logged) that silently CANCELLED instead of
    // scheduling whenever that condition was already true. Since this
    // fires the moment the user sets/enables a reminder — often while
    // testing, after they've already logged today's data — their own
    // action of turning it on would immediately get cancelled again with
    // no feedback, so it could never actually fire. Daily/weekly recurring
    // triggers fire every day/week regardless, so gating against *today's*
    // data never made sense here; that check still happens correctly on
    // its own via scheduleConfiguredReminders (see App.js foreground hook).
    if (inQuiet(cfg.hour, cfg.minute)) {
      await cancel();
      return;
    }

    const copy = {
      sleep: ['🌙 Log Your Sleep', "Good morning! Log last night's sleep duration to track your recovery."],
      nutrition: ['🍽️ Log Your Meals', "You haven't logged any food today. Keep your nutrition on track!"],
      workout: ['💪 Workout Reminder', 'No workout logged today. Time to hit the gym!'],
      calorie: ['⚡ Calorie Goal', `You're ${Math.round(Number(profile.calorieTarget ?? 2300) - Number(todayCalories || 0))} kcal short today. Have a light snack to meet your goal!`],
      protein: ['💪 Protein Goal', `Still need ${Math.round(Number(profile.proteinTarget ?? 140) - Number(todayProtein || 0))}g more protein today.`],
      photos: ['📸 Weekly Progress Photos', "Sunday check-in: snap any of your 7 progress photo angles you'd like to update. Totally optional!"],
    }[key];

    const granted = await this.requestPermission();
    if (!granted) return;
    if (key === 'photos') {
      await this.scheduleWeekly({ id, title: copy[0], body: copy[1], weekday: 1, hour: Number(cfg.hour) || 0, minute: Number(cfg.minute) || 0 });
    } else {
      await this.scheduleDaily({ id, title: copy[0], body: copy[1], hour: Number(cfg.hour) || 0, minute: Number(cfg.minute) || 0 });
    }
  },
  /**
   * Fires an immediate local notification (2s delay) so the user can verify
   * on-device that permissions are granted and delivery actually works,
   * without waiting for one of the scheduled daily reminder times. Returns
   * a result object describing what happened so the UI can show a clear,
   * specific message instead of a generic "didn't work".
   */
  async sendTestNotification() {
    if (Platform.OS === 'web') {
      showToast('Push notifications are mobile-only — this device is web.', 'info');
      return { ok: false, reason: 'web' };
    }
    const Notifications = await getNotifModule();
    if (!Notifications) {
      return { ok: false, reason: 'module_unavailable' };
    }
    const granted = await this.requestPermission();
    if (!granted) {
      return { ok: false, reason: 'permission_denied' };
    }
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✅ FitTrack Test Notification',
          body: 'If you can see this, push notifications are working correctly!',
          sound: true,
          ...(Platform.OS === 'android' ? { channelId: 'fittrack-reminders' } : {}),
        },
        trigger: Notifications.SchedulableTriggerInputTypes?.TIME_INTERVAL
          ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2, repeats: false }
          : { seconds: 2 },
      });
      return { ok: true };
    } catch (e) {
      console.warn('[Notifications] test notification failed', e);
      return { ok: false, reason: 'schedule_failed', error: e };
    }
  },

  // ---------------------------------------------------------------------------
  // Convenience toast methods (shown immediately in-app)
  // ---------------------------------------------------------------------------

  /**
   * Shows a toast if the calorie deficit exceeds 150 kcal.
   * @param {number} current  Calories consumed today.
   * @param {number} target   Daily calorie target.
   */
  sendCalorieReminder(current, target) {
    const deficit = target - current;
    if (deficit > 150) {
      showToast(
        `You're ${deficit} kcal short today. Have a light snack to meet your goal!`,
        'warning',
      );
    }
  },

  /**
   * Shows a toast if the protein gap exceeds 10 g.
   * @param {number} current  Protein consumed today (g).
   * @param {number} target   Daily protein target (g).
   */
  sendProteinReminder(current, target) {
    const gap = target - current;
    if (gap > 10) {
      showToast(
        `Still need ${Math.round(gap)}g more protein today. Grab some cottage cheese or a shake!`,
        'info',
      );
    }
  },

  /**
   * Shows a toast prompting the user to log last night's sleep.
   * Call this when the app opens in the morning and no sleep has been logged.
   */
  sendMorningSleepToast() {
    showToast(
      "Good morning! Don't forget to log last night's sleep duration.",
      'info',
    );
  },

  /**
   * Shows a workout reminder toast.
   */
  sendWorkoutToast() {
    showToast(
      'No workout logged today. Time to hit the gym! 💪',
      'info',
    );
  },
};

export default NotificationService;