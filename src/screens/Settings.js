import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboardPadding } from '../utils/keyboard';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  Share,
  Clipboard,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { database } from '../utils/database';
import ClearableTextInput from '../components/ClearableTextInput';
import { NotificationService, getDefaultNotificationSettings, CUSTOM_RULE_METRICS, CUSTOM_RULE_OPERATORS, validateCustomRule } from '../utils/notifications';
import { getProgressPhotoStorageBytes, formatBytes, reconcileRestoredPhotos } from '../utils/progress-photos';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const C = {
  bg: '#080812',
  card: '#11111d',
  border: 'rgba(255,255,255,0.07)',
  border2: 'rgba(255,255,255,0.13)',
  text: '#f0f0ff',
  muted: '#8892a4',
  muted2: '#4a5568',
  primary: '#8b5cf6',
  primaryLt: '#a78bfa',
  green: '#10b981',
  rose: '#f43f5e',
  amber: '#f59e0b',
};

const UNIT_OPTIONS = ['g', 'ml', 'piece', 'tbsp', 'scoop', 'cup'];

// ---------------------------------------------------------------------------
// Helper sub-components
// ---------------------------------------------------------------------------
function SectionCard({ title, subtitle, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function FieldRow({ children }) {
  return <View style={styles.fieldRow}>{children}</View>;
}

function LabeledInput({ label, value, onChangeText, keyboardType = 'numeric', placeholder }) {
  return (
    <View style={styles.labeledInput}>
      <Text style={styles.inputLabel}>{label}</Text>
      <ClearableTextInput
        style={styles.input}
        value={String(value ?? '')}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder ?? ''}
        placeholderTextColor={C.muted2}
        selectionColor={C.primary}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// expo-file-system's classic API (readAsStringAsync, writeAsStringAsync,
// StorageAccessFramework, etc.) moved to the "/legacy" subpath in newer
// Expo SDKs — the root import now exports a different, non-compatible API.
// This resolves whichever is actually available, exactly like the same fix
// already applied in progress-photos.js. Without this, every file
// read/write below can silently fail or behave unexpectedly, which is the
// most likely real cause behind backup export/import not working.
// ---------------------------------------------------------------------------
async function getFileSystem() {
  try {
    return await import('expo-file-system/legacy');
  } catch {
    try {
      return await import('expo-file-system');
    } catch (e) {
      console.warn('[Settings] expo-file-system unavailable', e);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Builds a timestamped, filesystem-safe backup filename, e.g.
// "fittrack-backup-2026-09-02_14-30-05.txt". Previously filenames only
// included the date (`fittrack-backup-2026-09-02.txt`), so exporting more
// than once in the same day produced identical names — confusing when
// comparing backups in Files/Drive/a Share sheet, and any second export
// would just silently overwrite the first on some file pickers. Adding the
// local time makes every export's filename unique and makes it obvious at a
// glance when each one was made.
// ---------------------------------------------------------------------------
function timestampedFilename(prefix, ext = 'txt') {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `${prefix}-${date}_${time}.${ext}`;
}

// ---------------------------------------------------------------------------
// Mobile file save helper via expo-file-system + Share
// ---------------------------------------------------------------------------
async function saveAndShareJSON(jsonStr, filename) {
  if (Platform.OS === 'web') {
    // Web: trigger browser download.
    // NOTE: the anchor must actually be attached to the document for
    // `.click()` to reliably trigger a download in every browser (Firefox
    // in particular ignores click() on a detached element) — that's why
    // the file previously wasn't downloading. Also give the object URL a
    // beat before revoking it, since revoking immediately can cut the
    // download off in some browsers (notably Safari).
    try {
      const blob = new Blob([jsonStr], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.warn('Web download failed:', e);
    }
    return { ok: true };
  }

  // Mobile: write to a temp file then hand it off to save/share.
  // IMPORTANT: this previously used the plain `expo-file-system` import,
  // whose classic read/write API moved to "/legacy" on newer Expo SDKs —
  // that import mismatch is the most likely reason every write below was
  // silently failing (or behaving oddly) regardless of which save method
  // was tried afterward. getFileSystem() resolves the correct one.
  const FileSystem = await getFileSystem();
  if (!FileSystem) {
    try {
      await Share.share({ title: 'FitTrack Backup', message: jsonStr });
      return { ok: true, method: 'share_text_only' };
    } catch (shareErr) {
      console.warn('Share failed:', shareErr);
      return { ok: false };
    }
  }

  let path;
  try {
    path = `${FileSystem.cacheDirectory}${filename}`;
    await FileSystem.writeAsStringAsync(path, jsonStr, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (e) {
    console.warn('File write failed:', e);
    try {
      await Share.share({ title: 'FitTrack Backup', message: jsonStr });
      return { ok: true, method: 'share_text_only' };
    } catch (shareErr) {
      console.warn('Share failed:', shareErr);
      return { ok: false };
    }
  }

  // ANDROID: Storage Access Framework lets the user pick exactly where to
  // save, writing a real file with the right name — tried first since it's
  // the most reliable option and needs no extra package.
  if (Platform.OS === 'android') {
    try {
      const SAF = FileSystem.StorageAccessFramework;
      if (SAF) {
        const permissions = await SAF.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const destUri = await SAF.createFileAsync(permissions.directoryUri, filename, 'text/plain');
          await FileSystem.writeAsStringAsync(destUri, jsonStr, { encoding: FileSystem.EncodingType.UTF8 });
          return { ok: true, method: 'saf' };
        }
      }
    } catch (safErr) {
      console.warn('Android SAF save failed, falling back to share sheet:', safErr);
    }
  }

  // Prefer expo-sharing: hands a real local file to the native share sheet.
  try {
    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, {
        mimeType: 'text/plain',
        dialogTitle: 'Save or share your FitTrack backup',
        UTI: 'public.plain-text',
      });
      return { ok: true, method: 'sharing' };
    }
  } catch (sharingErr) {
    console.warn('expo-sharing unavailable, falling back to Share:', sharingErr);
  }

  try {
    await Share.share(
      { title: 'FitTrack Backup', url: path, message: Platform.OS === 'android' ? jsonStr : undefined },
      { dialogTitle: 'Save or share your FitTrack backup' }
    );
    return { ok: true, method: Platform.OS === 'android' ? 'share_text_only' : 'share' };
  } catch (shareErr) {
    console.warn('Share failed:', shareErr);
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// Pick a backup file and read its contents (used by the restore flow).
// Backups are saved as .txt (see saveAndShareJSON above).
//
// Returns a structured result instead of a bare string/null so the caller
// can show a message that actually matches what happened (cancelled vs.
// unreadable vs. empty vs. permission failure), instead of one generic
// "no file selected" message for every failure mode:
//   { status: 'ok', text, name } | { status: 'cancelled' } | { status: 'error', reason }
// ---------------------------------------------------------------------------
async function pickBackupFileText() {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt,.json,text/plain,application/json';
        input.style.display = 'none';
        input.onchange = () => {
          const file = input.files && input.files[0];
          document.body.removeChild(input);
          if (!file) { resolve({ status: 'cancelled' }); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const text = String(reader.result || '');
            if (!text) { resolve({ status: 'error', reason: 'empty' }); return; }
            resolve({ status: 'ok', text, name: file.name });
          };
          reader.onerror = () => resolve({ status: 'error', reason: 'unreadable' });
          reader.readAsText(file);
        };
        document.body.appendChild(input);
        input.click();
      } catch (e) {
        console.warn('Web file picker failed:', e);
        resolve({ status: 'error', reason: 'unknown' });
      }
    });
  }

  // Mobile: native document/file picker.
  //
  // IMPORTANT: `type` is passed as a single '*/*' rather than an array of
  // specific MIME types. Backup files are exported as .txt, but depending
  // on how they were transferred (AirDrop, email attachment, cloud-drive
  // download, WhatsApp, etc.) the OS/file provider frequently mis-tags
  // plain-text files as `application/octet-stream` or omits a MIME type
  // entirely — filtering by `text/plain`/`application/json` silently hides
  // exactly the file the user is looking for in the native picker, which
  // is what produced "No file was selected, or it could not be opened."
  // even though the user *did* tap a valid .txt file. We instead accept
  // any file type here and validate the actual content (readable text,
  // valid JSON) after reading it, which is a stronger and more accurate
  // check than trusting OS MIME tagging anyway.
  let result;
  try {
    const DocumentPicker = await import('expo-document-picker');
    result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
  } catch (e) {
    console.warn('Backup file picker unavailable:', e);
    return { status: 'error', reason: 'picker_unavailable' };
  }

  // Support both the current { canceled, assets: [...] } shape and the
  // older { type: 'cancel' } / { type: 'success', uri, name } shape, since
  // we don't control which expo-document-picker version this project has
  // installed and the shape changed across SDKs.
  if (result?.canceled === true || result?.type === 'cancel') {
    return { status: 'cancelled' };
  }
  const picked = result?.assets?.[0] || (result?.uri ? result : null);
  if (!picked?.uri) {
    return { status: 'error', reason: 'no_uri' };
  }

  const name = picked.name || String(picked.uri).split('/').pop() || '';
  const looksLikeTextBackup = !name || /\.(txt|json)$/i.test(name);

  const FileSystem = await getFileSystem();
  if (!FileSystem) {
    return { status: 'error', reason: 'filesystem_unavailable' };
  }

  try {
    const text = await FileSystem.readAsStringAsync(picked.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    if (!text || !text.trim()) {
      return { status: 'error', reason: 'empty', name };
    }
    return { status: 'ok', text, name, wrongExtension: !looksLikeTextBackup };
  } catch (e) {
    // Typically a permission/access failure (e.g. the content:// URI became
    // inaccessible, or the picker returned a URI this app has no grant for).
    console.warn('Backup file read failed:', e);
    return { status: 'error', reason: 'read_failed', name, error: e };
  }
}

// ---------------------------------------------------------------------------
// Main Settings Screen
// ---------------------------------------------------------------------------
export default function Settings({
  profile = {},
  todayStats = {},
  onUpdateProfile,
  customFoods = [],
  onAddCustomFood,
  onUpdateCustomFood,
  onDeleteCustomFood,
  onClearAllData,
  onExportData,
  onImportData,
  onExportPhotosArchive,
  onImportPhotosArchive,
}) {
  // ── Profile & Goals state ──────────────────────────────────────────────
  const [weight, setWeight] = useState(String(profile.currentWeight ?? profile.weight ?? ''));
  const [targetWeight, setTargetWeight] = useState(String(profile.targetWeight ?? ''));
  const [calorieTarget, setCalorieTarget] = useState(String(profile.calorieTarget ?? ''));
  const [proteinTarget, setProteinTarget] = useState(String(profile.proteinTarget ?? ''));
  const [carbTarget, setCarbTarget] = useState(String(profile.carbTarget ?? ''));
  const [fatTarget, setFatTarget] = useState(String(profile.fatTarget ?? ''));
  const [sleepTarget, setSleepTarget] = useState(String(profile.sleepTarget ?? ''));
  const [workoutTarget, setWorkoutTarget] = useState(String(profile.workoutTarget ?? ''));
  const [waterTarget, setWaterTarget] = useState(String(profile.waterTargetMl ?? 2500));
  const [notificationSettings, setNotificationSettings] = useState(getDefaultNotificationSettings());
  const [savedMsg, setSavedMsg] = useState('');

  // ── Custom Foods state ─────────────────────────────────────────────────
  const [foodName, setFoodName] = useState('');
  const [foodQty, setFoodQty] = useState('100');
  const [foodUnit, setFoodUnit] = useState('g');
  const [foodCal, setFoodCal] = useState('');
  const [foodProtein, setFoodProtein] = useState('');
  const [foodCarbs, setFoodCarbs] = useState('');
  const [foodFat, setFoodFat] = useState('');
  const [foodFibre, setFoodFibre] = useState('');
  // Non-null while editing an existing custom food -- reuses the exact same
  // form/fields as creation. When null, the form is in "add new" mode.
  const [editingFoodId, setEditingFoodId] = useState(null);

  // ── Data & Backup state ────────────────────────────────────────────────
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportedJSON, setExportedJSON] = useState('');
  const [exportFilename, setExportFilename] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [importMsgColor, setImportMsgColor] = useState(C.green);
  const [importBusy, setImportBusy] = useState(false);
  const [pickBusy, setPickBusy] = useState(false);
  const [storageStats, setStorageStats] = useState(null);
  const [storageBusy, setStorageBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { const saved = await database.getNotificationSettings(); if (saved) setNotificationSettings({ ...getDefaultNotificationSettings(), ...saved }); } catch {}
    })();
  }, []);

  // ── Notification editing ───────────────────────────────────────────────
  const handleNotificationConfigChange = useCallback(async (key, cfg) => {
    const next = { ...notificationSettings, [key]: cfg };
    setNotificationSettings(next);
    await database.saveNotificationSettings(next);
    await NotificationService.updateConfiguredNotification({
      key,
      settings: next,
      profile,
      hasTodayFood: (todayStats?.calories || 0) > 0,
      hasTodaySleep: (todayStats?.sleepHours || 0) > 0,
      hasTodayWorkout: !!todayStats?.workoutCompleted,
      todayCalories: todayStats?.calories || 0,
      todayProtein: todayStats?.protein || 0,
    });
  }, [notificationSettings, profile, todayStats]);

  // ── Custom Notification Rules state (Change 6) ────────────────────────
  const [ruleMetric, setRuleMetric] = useState(CUSTOM_RULE_METRICS[0].key);
  const [ruleOperator, setRuleOperator] = useState('lt');
  const [ruleThreshold, setRuleThreshold] = useState('');
  const [ruleHour, setRuleHour] = useState(20);
  const [ruleMinute, setRuleMinute] = useState(0);
  const [ruleError, setRuleError] = useState('');

  const rescheduleAfterRuleChange = useCallback(async (next) => {
    // Mirrors the exact pattern already used by the Master Notifications
    // toggle/Save button above -- reuses the same scheduling call rather
    // than a second notification pathway. hasToday*/todayCalories/
    // todayProtein use the same "assume true, let scheduleConfiguredReminders
    // itself decide" placeholders already used there; the extra ctx fields
    // are best-effort from todayStats (may be undefined for fields
    // todayStats doesn't carry -- evaluateCustomRule already treats a
    // missing/non-finite value as "rule not met", never a fabricated 0).
    await NotificationService.scheduleConfiguredReminders({
      settings: next, profile, hasTodayFood: true, hasTodaySleep: true, hasTodayWorkout: true,
      todayCalories: todayStats.calories || 0, todayProtein: todayStats.protein || 0,
      todayCarbs: todayStats.carbs, todayFats: todayStats.fats, todayFibre: todayStats.fibre,
      todayWater: todayStats.water, todaySleepHours: todayStats.sleepHours,
      workoutsThisWeek: todayStats.workoutsThisWeek, currentWeight: profile?.currentWeight ?? profile?.weight,
      recoveryScore: todayStats.recoveryScore,
      force: true,
    });
  }, [profile, todayStats]);

  const handleAddCustomRule = useCallback(async () => {
    const rule = {
      id: Date.now().toString(),
      metric: ruleMetric,
      operator: ruleOperator,
      threshold: parseFloat(ruleThreshold),
      hour: Number(ruleHour),
      minute: Number(ruleMinute),
      enabled: true,
    };
    const check = validateCustomRule(rule);
    if (!check.valid) { setRuleError(check.error); return; }
    setRuleError('');
    const next = { ...notificationSettings, customRules: [...(notificationSettings.customRules || []), rule] };
    setNotificationSettings(next);
    await database.saveNotificationSettings(next);
    await rescheduleAfterRuleChange(next);
    setRuleThreshold('');
  }, [ruleMetric, ruleOperator, ruleThreshold, ruleHour, ruleMinute, notificationSettings, rescheduleAfterRuleChange]);

  const handleToggleCustomRule = useCallback(async (id) => {
    const next = { ...notificationSettings, customRules: (notificationSettings.customRules || []).map(r => r.id === id ? { ...r, enabled: !r.enabled } : r) };
    setNotificationSettings(next);
    await database.saveNotificationSettings(next);
    await rescheduleAfterRuleChange(next);
  }, [notificationSettings, rescheduleAfterRuleChange]);

  const handleDeleteCustomRule = useCallback(async (id) => {
    // Removing the rule from settings.customRules means the scheduling loop
    // will no longer visit it at all (it can only cancel/reschedule ids it
    // currently iterates) -- explicitly cancel this rule's own notification
    // id first so a deleted rule can't keep firing.
    await NotificationService.cancelCustomRule(id);
    const next = { ...notificationSettings, customRules: (notificationSettings.customRules || []).filter(r => r.id !== id) };
    setNotificationSettings(next);
    await database.saveNotificationSettings(next);
    await rescheduleAfterRuleChange(next);
  }, [notificationSettings, rescheduleAfterRuleChange]);

  // ── Save Goals ──────────────────────────────────────────────────────────
  const handleSaveGoals = useCallback(() => {
    if (onUpdateProfile) {
      onUpdateProfile({
        ...profile,
        currentWeight: parseFloat(weight) || profile.currentWeight,
        weight: parseFloat(weight) || profile.weight,
        targetWeight: parseFloat(targetWeight) || profile.targetWeight,
        calorieTarget: parseInt(calorieTarget, 10) || profile.calorieTarget,
        proteinTarget: parseInt(proteinTarget, 10) || profile.proteinTarget,
        carbTarget: parseInt(carbTarget, 10) || profile.carbTarget,
        fatTarget: parseInt(fatTarget, 10) || profile.fatTarget,
        sleepTarget: parseFloat(sleepTarget) || profile.sleepTarget,
        workoutTarget: parseInt(workoutTarget, 10) || profile.workoutTarget,
        waterTargetMl: parseInt(waterTarget, 10) || profile.waterTargetMl || 2500,
      });
    }
    setSavedMsg('✓ Saved!');
    setTimeout(() => setSavedMsg(''), 2000);
  }, [
    profile, onUpdateProfile, weight, targetWeight, calorieTarget,
    proteinTarget, carbTarget, fatTarget, sleepTarget, workoutTarget, waterTarget,
  ]);

  // ── Add / Save Custom Food ──────────────────────────────────────────────
  // Same form drives both creation and editing. In edit mode (editingFoodId
  // set) this updates the existing record in place via onUpdateCustomFood
  // instead of creating a new one via onAddCustomFood.
  const handleAddFood = useCallback(() => {
    if (!foodName.trim()) return;
    const entry = {
      name: foodName.trim(),
      qty: parseFloat(foodQty) || 100,
      unit: foodUnit,
      calories: parseFloat(foodCal) || 0,
      protein: parseFloat(foodProtein) || 0,
      carbs: parseFloat(foodCarbs) || 0,
      fat: parseFloat(foodFat) || 0,
      fibre: parseFloat(foodFibre) || 0,
    };
    if (editingFoodId) {
      if (onUpdateCustomFood) onUpdateCustomFood(editingFoodId, entry);
      setEditingFoodId(null);
    } else {
      if (onAddCustomFood) onAddCustomFood({ id: Date.now().toString(), ...entry });
    }
    setFoodName('');
    setFoodQty('100');
    setFoodUnit('g');
    setFoodCal('');
    setFoodProtein('');
    setFoodCarbs('');
    setFoodFat('');
    setFoodFibre('');
  }, [foodName, foodQty, foodUnit, foodCal, foodProtein, foodCarbs, foodFat, foodFibre, editingFoodId, onAddCustomFood, onUpdateCustomFood]);

  // Populates the (shared) form with an existing food's current values so
  // the user is editing, not creating a second entry.
  const handleEditFood = useCallback((food) => {
    setEditingFoodId(food.id);
    setFoodName(String(food.name || ''));
    setFoodQty(String(food.qty ?? 100));
    setFoodUnit(food.unit || 'g');
    setFoodCal(String(food.calories ?? ''));
    setFoodProtein(String(food.protein ?? ''));
    setFoodCarbs(String(food.carbs ?? ''));
    setFoodFat(String(food.fat ?? ''));
    setFoodFibre(String(food.fibre ?? ''));
  }, []);

  const handleCancelEditFood = useCallback(() => {
    setEditingFoodId(null);
    setFoodName(''); setFoodQty('100'); setFoodUnit('g');
    setFoodCal(''); setFoodProtein(''); setFoodCarbs(''); setFoodFat(''); setFoodFibre('');
  }, []);

  // ── Delete Custom Food ──────────────────────────────────────────────────
  const handleDeleteFood = useCallback(
    (food) => {
      const doDelete = () => {
        if (onDeleteCustomFood) onDeleteCustomFood(food.id);
      };
      if (Platform.OS === 'web') {
        if (window.confirm(`Delete "${food.name}" from custom foods?`)) doDelete();
      } else {
        Alert.alert(
          'Delete Food',
          `Delete "${food.name}" from custom foods?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: doDelete },
          ],
        );
      }
    },
    [onDeleteCustomFood],
  );

  // ── Export Data ─────────────────────────────────────────────────────────
  // On mobile: saves a .json file to cache then opens the Share sheet so the
  // user can save it to Files / Google Drive / email — works as a backup that
  // can later be imported on a new device.
  const handleExport = useCallback(async () => {
    setExportBusy(true);
    try {
      const rawJson = onExportData ? await onExportData() : '{}';
      const jsonStr = typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson, null, 2);
      const filename = timestampedFilename('fittrack-backup');

      setExportedJSON(jsonStr);
      setExportFilename(filename);

      // The auto-download/share attempt below can silently fail or land as
      // plain text depending on the browser/OS (this is a well-known mobile
      // Safari/Chrome limitation with blob downloads). We no longer assume
      // it worked — the modal always opens afterward with a guaranteed
      // "Download File" button (a fresh, direct click) and Copy to
      // Clipboard as sure-fire fallbacks.
      await saveAndShareJSON(jsonStr, filename);
      setExportModalVisible(true);
    } catch (e) {
      Alert.alert('Export Failed', String(e?.message || e));
    } finally {
      setExportBusy(false);
    }
  }, [onExportData]);

  // ── Photo Archive export/import (separate from the main .txt backup —
  //    see utils/progress-photos.js for why) ─────────────────────────────
  const [photoArchiveBusy, setPhotoArchiveBusy] = useState(false);
  const [photoArchiveMsg, setPhotoArchiveMsg] = useState('');
  const [photoArchiveMsgColor, setPhotoArchiveMsgColor] = useState(C.green);

  const handleExportPhotosArchive = useCallback(async () => {
    if (!onExportPhotosArchive) return;
    setPhotoArchiveBusy(true);
    setPhotoArchiveMsg('');
    try {
      const { json, includedCount, skippedCount } = await onExportPhotosArchive();
      if (includedCount === 0) {
        setPhotoArchiveMsg('You don\'t have any Progress Photos saved on this device yet.');
        setPhotoArchiveMsgColor(C.muted2);
        return;
      }
      const filename = timestampedFilename('fittrack-photos');
      await saveAndShareJSON(json, filename);
      const skippedNote = skippedCount > 0 ? ` (${skippedCount} skipped — image file not found on this device)` : '';
      setPhotoArchiveMsg(`✅ Archived ${includedCount} photo(s)${skippedNote}. Save/share this file, then use "Import Photo Archive" on your new device.`);
      setPhotoArchiveMsgColor(C.green);
    } catch (e) {
      setPhotoArchiveMsg(`❌ Could not build photo archive: ${String(e?.message || e)}`);
      setPhotoArchiveMsgColor(C.rose);
    } finally {
      setPhotoArchiveBusy(false);
    }
  }, [onExportPhotosArchive]);

  const handleImportPhotosArchive = useCallback(async () => {
    if (!onImportPhotosArchive) return;
    setPhotoArchiveBusy(true);
    setPhotoArchiveMsg('');
    try {
      const result = await pickBackupFileText();
      if (result.status === 'cancelled') return;
      if (result.status !== 'ok') {
        setPhotoArchiveMsg('❌ Could not read that file. Make sure to pick a Photo Archive .txt file.');
        setPhotoArchiveMsgColor(C.rose);
        return;
      }
      const outcome = await onImportPhotosArchive(result.text);
      const parts = [];
      if (outcome.writtenCount) parts.push(`${outcome.writtenCount} image file(s) written`);
      if (outcome.alreadyPresentCount) parts.push(`${outcome.alreadyPresentCount} already on this device`);
      if (outcome.failedCount) parts.push(`${outcome.failedCount} failed`);
      setPhotoArchiveMsg(`✅ Photo Archive restored — ${parts.join(', ') || 'nothing new to restore'}.`);
      setPhotoArchiveMsgColor(C.green);
    } catch (e) {
      setPhotoArchiveMsg(`❌ ${String(e?.message || e)}`);
      setPhotoArchiveMsgColor(C.rose);
    } finally {
      setPhotoArchiveBusy(false);
      setTimeout(() => setPhotoArchiveMsg(''), 9000);
    }
  }, [onImportPhotosArchive]);

  // ── Import Data (paste JSON from backup) ────────────────────────────────
  const handleImport = useCallback(() => {
    if (!importText.trim()) {
      setImportMsg('Please paste your backup JSON first.');
      setImportMsgColor(C.rose);
      return;
    }

    const doImport = async () => {
      setImportBusy(true);
      try {
        JSON.parse(importText); // validate JSON before passing on
        let result = null;
        if (onImportData) result = await onImportData(importText);

        // Progress Photo metadata restores instantly, but the actual image
        // FILES were never in the .txt backup (see database.js#exportAllData)
        // — they only come back via a separately-imported Photo Archive
        // (see handleExportPhotosArchive/handleImportPhotosArchive below).
        // Checking each restored photo's file here lets us tell the user
        // the truth: how many photo *records* came back vs. how many image
        // *files* are actually present, instead of implying every photo is
        // fully restored.
        let photoNote = '';
        if (result?.progressPhotosRestored) {
          try {
            const photos = await database.getProgressPhotos();
            const reconciled = await reconcileRestoredPhotos(photos);
            const found = reconciled.filter(p => p.imageFound).length;
            const missing = reconciled.length - found;
            photoNote = missing > 0
              ? `\n\n📸 Progress Photos: ${reconciled.length} record(s) restored — ${found} image(s) found on this device, ${missing} missing. If these photos are on your old device, use "Import Photo Archive" further down this page to bring the actual pictures over.`
              : `\n\n📸 Progress Photos: ${reconciled.length} record(s) restored, all ${found} image(s) found on this device.`;
          } catch {}
        }

        const passwordNote = result?.progressPhotoPasswordRestored ? ' Your Progress Photos password was also restored.' : '';
        setImportMsg(`✅ Data restored successfully!${passwordNote}${photoNote}`);
        setImportMsgColor(C.green);
        setImportText('');
      } catch {
        setImportMsg('❌ Invalid JSON. Please check your backup and try again.');
        setImportMsgColor(C.rose);
      } finally {
        setImportBusy(false);
        setTimeout(() => setImportMsg(''), 9000);
      }
    };

    // Confirm before overwriting existing data
    if (Platform.OS === 'web') {
      if (window.confirm('⚠️ This will overwrite your current data. Continue?')) {
        doImport();
      }
    } else {
      Alert.alert(
        'Restore Data',
        '⚠️ This will overwrite your current data with the backup. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', style: 'destructive', onPress: doImport },
        ],
      );
    }
  }, [importText, onImportData]);

  // ── Select Backup File (mobile file picker / web file input) ───────────
  // Web: rather than creating a detached <input type="file"> and calling
  // .click() on it synthetically (what pickBackupFileText did before), we
  // click a REAL, always-mounted <input> rendered below. Some browsers
  // don't reliably treat a freshly-created, never-attached input's .click()
  // as genuine user activation, which silently blocked the file dialog from
  // ever opening — that's what made "Select Backup File" appear to do
  // nothing on web. Clicking an input that's actually in the DOM avoids
  // that entirely.
  const webFileInputRef = useRef(null);

  const handleWebFileChange = useCallback((e) => {
    const file = e?.target?.files?.[0];
    if (e?.target) e.target.value = ''; // allow re-selecting the same file next time
    if (!file) return;
    setPickBusy(true);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setPickBusy(false);
      if (text) {
        setImportText(text);
        setImportMsg('📂 File loaded — tap Restore Data below to continue.');
        setImportMsgColor(C.green);
      } else {
        setImportMsg('❌ Could not read that file.');
        setImportMsgColor(C.rose);
      }
      setTimeout(() => setImportMsg(''), 4000);
    };
    reader.onerror = () => {
      setPickBusy(false);
      setImportMsg('❌ Could not read that file.');
      setImportMsgColor(C.rose);
      setTimeout(() => setImportMsg(''), 4000);
    };
    reader.readAsText(file);
  }, []);

  const handlePickBackupFile = useCallback(async () => {
    if (Platform.OS === 'web') {
      webFileInputRef.current?.click();
      return;
    }
    setPickBusy(true);
    try {
      const result = await pickBackupFileText();
      if (result.status === 'ok') {
        setImportText(result.text);
        // Validate as JSON up front so the user gets an immediate, specific
        // signal instead of only finding out a malformed backup was picked
        // once they tap "Restore Data".
        let parsed = true;
        try { JSON.parse(result.text); } catch { parsed = false; }
        if (!parsed) {
          setImportMsg(`⚠️ "${result.name || 'That file'}" was read, but it doesn't look like a valid FitTrack backup (not valid JSON). Double-check you picked the right .txt file.`);
          setImportMsgColor(C.rose);
        } else if (result.wrongExtension) {
          setImportMsg(`📂 File loaded (note: "${result.name}" isn't a .txt/.json file, but its contents look valid) — tap Restore Data below to continue.`);
          setImportMsgColor(C.green);
        } else {
          setImportMsg('📂 File loaded — tap Restore Data below to continue.');
          setImportMsgColor(C.green);
        }
      } else if (result.status === 'cancelled') {
        // User backed out of the picker — not an error, so no message needed.
      } else {
        const messages = {
          empty: '❌ That file appears to be empty.',
          read_failed: '❌ Could not open that file — the app may not have permission to access it. Try picking it from Files/Downloads directly rather than a cloud-only location.',
          picker_unavailable: '❌ The file picker isn’t available in this build.',
          filesystem_unavailable: '❌ File access isn’t available in this build.',
          no_uri: '❌ No file was selected, or it could not be opened. Make sure to pick the .txt backup file.',
        };
        setImportMsg(messages[result.reason] || '❌ No file was selected, or it could not be opened. Make sure to pick the .txt backup file.');
        setImportMsgColor(C.rose);
      }
    } catch (e) {
      setImportMsg('❌ Could not read that file.');
      setImportMsgColor(C.rose);
    } finally {
      setPickBusy(false);
      setTimeout(() => setImportMsg(''), 5000);
    }
  }, []);

  // ── Copy to Clipboard ───────────────────────────────────────────────────
  const handleCopyClipboard = useCallback(async () => {
    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(exportedJSON);
      } else {
        Clipboard.setString(exportedJSON);
      }
    } catch {
      // Clipboard not available — text is still selectable
    }
  }, [exportedJSON]);

  // ── Download File (web) ─────────────────────────────────────────────────
  // This button's click handler runs directly from the tap — no `await`
  // before it — so it's always a fresh, genuine user gesture. That's the
  // difference from the auto-download attempt inside handleExport, which
  // fires after an async data fetch and can be silently blocked/downgraded
  // by mobile browsers. Tapping this button is a guaranteed-to-work fallback.
  const handleDownloadFile = useCallback(() => {
    if (!exportedJSON) return;
    try {
      const blob = new Blob([exportedJSON], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFilename || timestampedFilename('fittrack-backup');
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      Alert.alert('Download Failed', String(e?.message || e));
    }
  }, [exportedJSON, exportFilename]);

  // ── Reset All Data ──────────────────────────────────────────────────────
  const handleResetAll = useCallback(() => {
    const doReset = () => {
      if (onClearAllData) onClearAllData();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('⚠️ This will permanently delete ALL your FitTrack data. This cannot be undone. Continue?')) {
        doReset();
      }
    } else {
      Alert.alert(
        'Reset All Data',
        '⚠️ This will permanently delete ALL your FitTrack data. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Reset Everything', style: 'destructive', onPress: doReset },
        ],
      );
    }
  }, [onClearAllData]);

  const refreshStorageStats = useCallback(async () => {
    setStorageBusy(true);
    try {
      // This is intentionally user-triggered so storage measurement never adds
      // work to normal app startup or Settings rendering.
      const [backupJson, photoBytes] = await Promise.all([
        database.exportAllData(),
        getProgressPhotoStorageBytes(),
      ]);
      const structuredBytes = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(backupJson).length : backupJson.length * 2;
      setStorageStats({ structuredBytes, photoBytes, totalBytes: structuredBytes + photoBytes });
    } catch {
      setStorageStats(null);
    } finally {
      setStorageBusy(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const kbPadding = useKeyboardPadding(40, 40);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.contentContainer, { paddingBottom: kbPadding }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.screenTitle}>Settings</Text>

      {/* ── 1. Profile & Goals ──────────────────────────────────────── */}
      <SectionCard title="🎯 Profile & Goals">
        <FieldRow>
          <LabeledInput
            label="Current Weight (kg)"
            value={weight}
            onChangeText={setWeight}
          />
          <LabeledInput
            label="Target Weight (kg)"
            value={targetWeight}
            onChangeText={setTargetWeight}
          />
        </FieldRow>

        <FieldRow>
          <LabeledInput
            label="Calorie Target (kcal)"
            value={calorieTarget}
            onChangeText={setCalorieTarget}
          />
          <LabeledInput
            label="Protein Target (g)"
            value={proteinTarget}
            onChangeText={setProteinTarget}
          />
        </FieldRow>

        <FieldRow>
          <LabeledInput
            label="Carbs Target (g)"
            value={carbTarget}
            onChangeText={setCarbTarget}
          />
          <LabeledInput
            label="Fats Target (g)"
            value={fatTarget}
            onChangeText={setFatTarget}
          />
        </FieldRow>

        <FieldRow>
          <LabeledInput
            label="Sleep Target (hrs)"
            value={sleepTarget}
            onChangeText={setSleepTarget}
          />
          <LabeledInput
            label="Workouts / Week"
            value={workoutTarget}
            onChangeText={setWorkoutTarget}
          />
        </FieldRow>
        <FieldRow>
          <LabeledInput
            label="Water Target (ml)"
            value={waterTarget}
            onChangeText={setWaterTarget}
          />
          <View style={{ flex: 1 }} />
        </FieldRow>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSaveGoals} activeOpacity={0.8}>
          <Text style={styles.primaryButtonText}>Save Goals</Text>
        </TouchableOpacity>

        {savedMsg ? (
          <View style={styles.savedMsgContainer}>
            <Text style={styles.savedMsgText}>{savedMsg}</Text>
            <Text style={styles.savedSyncText}>✅ Goals synced to Home &amp; Nutrition tabs</Text>
          </View>
        ) : null}
      </SectionCard>

      {/* ── 2. Custom Foods ─────────────────────────────────────────── */}
      <SectionCard
        title="🥗 Custom Foods"
        subtitle={editingFoodId ? 'Editing an existing food' : 'Add foods to your personal AI dictionary'}
      >

        {/* Name */}
        <Text style={styles.inputLabel}>Food Name</Text>
        <ClearableTextInput
          style={[styles.input, styles.fullInput]}
          value={foodName}
          onChangeText={setFoodName}
          placeholder="e.g. Greek Yogurt"
          placeholderTextColor={C.muted2}
          selectionColor={C.primary}
        />

        {/* Reference qty + unit */}
        <View style={styles.qtyUnitRow}>
          <View style={styles.qtyInputWrap}>
            <Text style={styles.inputLabel}>Ref. Quantity</Text>
            <ClearableTextInput
              style={styles.input}
              value={foodQty}
              onChangeText={setFoodQty}
              keyboardType="numeric"
              placeholderTextColor={C.muted2}
              selectionColor={C.primary}
            />
          </View>
          <View style={styles.unitWrap}>
            <Text style={styles.inputLabel}>Unit</Text>
            <View style={styles.unitPills}>
              {UNIT_OPTIONS.map((u) => (
                <TouchableOpacity
                  key={u}
                  style={[styles.unitPill, foodUnit === u && styles.unitPillActive]}
                  onPress={() => setFoodUnit(u)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.unitPillText, foodUnit === u && styles.unitPillTextActive]}>
                    {u}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Macros grid (Calories, Protein, Carbs, Fats, Fibre) */}
        <Text style={styles.macroGridLabel}>Macros per reference quantity</Text>
        <View style={styles.macroGrid}>
          <View style={styles.macroCell}>
            <Text style={styles.inputLabel}>Calories (kcal)</Text>
            <ClearableTextInput
              style={styles.input}
              value={foodCal}
              onChangeText={setFoodCal}
              keyboardType="numeric"
              placeholderTextColor={C.muted2}
              selectionColor={C.primary}
            />
          </View>
          <View style={styles.macroCell}>
            <Text style={styles.inputLabel}>Protein (g)</Text>
            <ClearableTextInput
              style={styles.input}
              value={foodProtein}
              onChangeText={setFoodProtein}
              keyboardType="numeric"
              placeholderTextColor={C.muted2}
              selectionColor={C.primary}
            />
          </View>
          <View style={styles.macroCell}>
            <Text style={styles.inputLabel}>Carbs (g)</Text>
            <ClearableTextInput
              style={styles.input}
              value={foodCarbs}
              onChangeText={setFoodCarbs}
              keyboardType="numeric"
              placeholderTextColor={C.muted2}
              selectionColor={C.primary}
            />
          </View>
          <View style={styles.macroCell}>
            <Text style={styles.inputLabel}>Fats (g)</Text>
            <ClearableTextInput
              style={styles.input}
              value={foodFat}
              onChangeText={setFoodFat}
              keyboardType="numeric"
              placeholderTextColor={C.muted2}
              selectionColor={C.primary}
            />
          </View>
          <View style={styles.macroCell}>
            <Text style={styles.inputLabel}>Fibre (g)</Text>
            <ClearableTextInput
              style={styles.input}
              value={foodFibre}
              onChangeText={setFoodFibre}
              keyboardType="numeric"
              placeholderTextColor={C.muted2}
              selectionColor={C.primary}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleAddFood} activeOpacity={0.8}>
          <Text style={styles.primaryButtonText}>{editingFoodId ? '✓ Save Changes' : '+ Add to AI Dictionary'}</Text>
        </TouchableOpacity>
        {editingFoodId ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={handleCancelEditFood} activeOpacity={0.8}>
            <Text style={styles.secondaryButtonText}>Cancel Edit</Text>
          </TouchableOpacity>
        ) : null}

        {/* Existing custom foods list */}
        {customFoods.length > 0 && (
          <View style={styles.foodList}>
            <View style={styles.divider} />
            {customFoods.map((food) => (
              <View key={food.id} style={[styles.foodItem, editingFoodId === food.id && styles.foodItemEditing]}>
                <View style={styles.foodItemInfo}>
                  <Text style={styles.foodItemName}>{food.name}</Text>
                  <Text style={styles.foodItemMeta}>
                    per {food.qty}{food.unit} · {food.calories} kcal · P {food.protein}g · C {food.carbs}g · F {food.fat}g · Fibre {food.fibre ?? 0}g
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => handleEditFood(food)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.editBtnText}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDeleteFood(food)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.deleteBtnText}>🗑️</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </SectionCard>

      {/* ── 3. Data & Backup ────────────────────────────────────────── */}
      <SectionCard
        title="💾 Data & Backup"
        subtitle="Export saves a .json file you can import on any device to restore all your data."
      >
        {/* Export */}
        <TouchableOpacity
          style={[styles.secondaryButton, exportBusy && styles.btnBusy]}
          onPress={handleExport}
          activeOpacity={0.8}
          disabled={exportBusy}
        >
          <Text style={styles.secondaryButtonText}>
            {exportBusy ? '⏳ Exporting…' : '📤 Export & Save Backup'}
          </Text>
        </TouchableOpacity>

        <View style={styles.instructionBox}>
          <Text style={styles.instructionText}>
            📱 On mobile: tap Export → your backup file opens in the Share sheet.
            Save it to Files, Google Drive, or email it to yourself.{'\n\n'}
            🔄 To restore on a new device: install the app, then tap "Select
            Backup File" and choose your saved .txt file — or paste the JSON
            manually — then tap Restore Data.{'\n\n'}
            📸 Progress Photos: this backup file contains your photo records
            (category, date, password) but not the actual images — moving
            those to a new device needs the separate "Photo Archive" below.
          </Text>
        </View>

        <View style={styles.spacer} />

        {/* Import: select a file */}
        {Platform.OS === 'web' && (
          <input
            ref={webFileInputRef}
            type="file"
            accept="application/json,.json,text/plain"
            style={{ display: 'none' }}
            onChange={handleWebFileChange}
          />
        )}
        <TouchableOpacity
          style={[styles.secondaryButton, pickBusy && styles.btnBusy]}
          onPress={handlePickBackupFile}
          activeOpacity={0.8}
          disabled={pickBusy}
        >
          <Text style={styles.secondaryButtonText}>
            {pickBusy ? '⏳ Selecting…' : '📂 Select Backup File (.txt)'}
          </Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        {/* Import: or paste */}
        <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Or Paste Backup JSON to Restore</Text>
        <TextInput
          style={[styles.input, styles.importInput]}
          value={importText}
          onChangeText={setImportText}
          multiline
          numberOfLines={6}
          placeholder={'{\n  "profile": {...},\n  "foodLogs": [...]\n}'}
          placeholderTextColor={C.muted2}
          selectionColor={C.primary}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.secondaryButton, importBusy && styles.btnBusy]}
          onPress={handleImport}
          activeOpacity={0.8}
          disabled={importBusy}
        >
          <Text style={styles.secondaryButtonText}>
            {importBusy ? '⏳ Restoring…' : '📥 Restore Data'}
          </Text>
        </TouchableOpacity>

        {importMsg ? (
          <Text style={[styles.importMsg, { color: importMsgColor }]}>{importMsg}</Text>
        ) : null}
      </SectionCard>

      {/* ── 3b. Progress Photos — Photo Archive (cross-device) ────────── */}
      <SectionCard
        title="📸 Progress Photos — Photo Archive"
        subtitle="Moves your actual photo files to a new device. Separate from the backup above, which only carries photo records, not the images themselves."
      >
        <TouchableOpacity
          style={[styles.secondaryButton, photoArchiveBusy && styles.btnBusy]}
          onPress={handleExportPhotosArchive}
          activeOpacity={0.8}
          disabled={photoArchiveBusy}
        >
          <Text style={styles.secondaryButtonText}>
            {photoArchiveBusy ? '⏳ Working…' : '📤 Export Photo Archive'}
          </Text>
        </TouchableOpacity>

        <View style={styles.spacer} />

        <TouchableOpacity
          style={[styles.secondaryButton, photoArchiveBusy && styles.btnBusy]}
          onPress={handleImportPhotosArchive}
          activeOpacity={0.8}
          disabled={photoArchiveBusy}
        >
          <Text style={styles.secondaryButtonText}>
            {photoArchiveBusy ? '⏳ Working…' : '📥 Import Photo Archive'}
          </Text>
        </TouchableOpacity>

        {photoArchiveMsg ? (
          <Text style={[styles.importMsg, { color: photoArchiveMsgColor }]}>{photoArchiveMsg}</Text>
        ) : null}

        <View style={styles.instructionBox}>
          <Text style={styles.instructionText}>
            On your OLD device: tap "Export Photo Archive" and save/share the
            file (Files, Google Drive, email — same as a normal backup).{'\n\n'}
            On your NEW device: restore your regular backup first (previous
            section), then tap "Import Photo Archive" and select that file.
            Your photos are written into place automatically — there's no
            folder to find or copy by hand.{'\n\n'}
            This file contains your actual photo images, so keep it as
            private as the photos themselves.
          </Text>
        </View>
      </SectionCard>

      {/* ── 4. Storage ─────────────────────────────────────────────── */}
      <SectionCard title="💾 Storage" subtitle="FitTrack's local data only. Health records and photos are never deleted automatically.">
        <Text style={styles.instructionText}>Progress photos are stored as compressed local files; structured data remains lightweight JSON metadata/logs.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={refreshStorageStats} disabled={storageBusy}>
          <Text style={styles.secondaryButtonText}>{storageBusy ? '⏳ Calculating…' : '📏 Calculate Storage Usage'}</Text>
        </TouchableOpacity>
        {storageStats ? (
          <View style={styles.storageStats}>
            <Text style={styles.storageRow}>Structured data: <Text style={styles.storageValue}>{formatBytes(storageStats.structuredBytes)}</Text></Text>
            <Text style={styles.storageRow}>Progress photos: <Text style={styles.storageValue}>{formatBytes(storageStats.photoBytes)}</Text></Text>
            <Text style={styles.storageRow}>FitTrack tracked storage: <Text style={styles.storageValue}>{formatBytes(storageStats.totalBytes)}</Text></Text>
          </View>
        ) : null}
      </SectionCard>

      {/* ── 5. Notifications ───────────────────────────────────────── */}
      <SectionCard title="🔔 Notifications" subtitle="Scheduled mobile reminders can run while the app is closed. In-app toasts remain unchanged.">
        <ToggleRow label="Master Notifications" value={notificationSettings.enabled} onChange={async v => {
          const next = { ...notificationSettings, enabled: v }; setNotificationSettings(next); await database.saveNotificationSettings(next);
          await NotificationService.scheduleConfiguredReminders({ settings: next, profile, hasTodayFood: true, hasTodaySleep: true, hasTodayWorkout: true, todayCalories: todayStats.calories || 0, todayProtein: todayStats.protein || 0, force: true });
        }} />
        {[
          ['sleep','🌙 Sleep Reminder'], ['nutrition','🍽️ Meal Reminder'], ['workout','💪 Workout Reminder'], ['calorie','⚡ Calorie Goal'], ['protein','💪 Protein Goal'], ['photos','📸 Weekly Progress Photos (Sunday)']
        ].map(([key,label]) => <NotificationRow key={key} label={label} config={notificationSettings[key]} onChange={cfg => handleNotificationConfigChange(key, cfg)} />)}
        <TouchableOpacity style={styles.secondaryButton} onPress={async () => {
          await database.saveNotificationSettings(notificationSettings);
          await NotificationService.scheduleConfiguredReminders({ settings: notificationSettings, profile, hasTodayFood: true, hasTodaySleep: true, hasTodayWorkout: true, todayCalories: todayStats.calories || 0, todayProtein: todayStats.protein || 0, force: true });
          setSavedMsg('✓ Notification settings saved'); setTimeout(() => setSavedMsg(''), 2000);
        }}><Text style={styles.secondaryButtonText}>Save Notification Settings</Text></TouchableOpacity>
        <Text style={styles.instructionText}>Push = mobile notification. Toast = in-app feedback. The existing toast system is kept separate.</Text>

        {/* ── Custom Notification Rules (Change 6) ──────────────────── */}
        <View style={styles.divider} />
        <Text style={styles.notificationLabel}>Custom Rules</Text>
        <Text style={styles.instructionText}>
          Create your own reminders from any tracked metric, e.g. "If fibre is below 25g, remind me at 8:00 PM."
        </Text>

        {(notificationSettings.customRules || []).map(rule => {
          const metricDef = CUSTOM_RULE_METRICS.find(m => m.key === rule.metric);
          const opDef = CUSTOM_RULE_OPERATORS.find(o => o.key === rule.operator);
          return (
            <View key={rule.id} style={styles.ruleCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ruleCardText}>
                  If <Text style={styles.ruleCardBold}>{metricDef?.label || rule.metric}</Text> {opDef?.label || rule.operator} <Text style={styles.ruleCardBold}>{rule.threshold}{metricDef?.unit ? ` ${metricDef.unit}` : ''}</Text>
                </Text>
                <Text style={styles.ruleCardMeta}>Checked around {String(rule.hour).padStart(2,'0')}:{String(rule.minute).padStart(2,'0')}</Text>
              </View>
              <TouchableOpacity style={[styles.toggle, rule.enabled && styles.toggleOn]} onPress={() => handleToggleCustomRule(rule.id)}>
                <View style={[styles.toggleKnob, rule.enabled && styles.toggleKnobOn]} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteCustomRule(rule.id)}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.ruleForm}>
          <Text style={styles.inputLabel}>Metric</Text>
          <View style={styles.chipRow}>
            {CUSTOM_RULE_METRICS.map(m => (
              <TouchableOpacity key={m.key} style={[styles.chip, ruleMetric === m.key && styles.chipActive]} onPress={() => setRuleMetric(m.key)}>
                <Text style={[styles.chipText, ruleMetric === m.key && styles.chipTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Condition</Text>
          <View style={styles.chipRow}>
            {CUSTOM_RULE_OPERATORS.map(o => (
              <TouchableOpacity key={o.key} style={[styles.chip, ruleOperator === o.key && styles.chipActive]} onPress={() => setRuleOperator(o.key)}>
                <Text style={[styles.chipText, ruleOperator === o.key && styles.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.inputLabel}>Threshold</Text>
          <ClearableTextInput
            style={[styles.input, styles.fullInput]}
            value={ruleThreshold}
            onChangeText={setRuleThreshold}
            placeholder="e.g. 25"
            placeholderTextColor={C.muted2}
            keyboardType="numeric"
          />

          <TimePickerField
            label="Check time"
            hour={ruleHour}
            minute={ruleMinute}
            onChange={(h, m) => { setRuleHour(h); setRuleMinute(m); }}
          />

          {ruleError ? <Text style={styles.errorText}>{ruleError}</Text> : null}

          <TouchableOpacity style={styles.primaryButton} onPress={handleAddCustomRule} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>+ Add Rule</Text>
          </TouchableOpacity>
        </View>
      </SectionCard>

      {/* ── 6. Danger Zone ──────────────────────────────────────────── */}
      <SectionCard title="⚠️ Danger Zone">
        <Text style={styles.dangerWarning}>
          Resetting will permanently erase all your logs, meals, workouts, and custom foods. Export a backup first if you want to keep your data.
        </Text>
        <TouchableOpacity style={styles.dangerButton} onPress={handleResetAll} activeOpacity={0.8}>
          <Text style={styles.dangerButtonText}>Reset All Data</Text>
        </TouchableOpacity>
      </SectionCard>

      <View style={styles.bottomPad} />

      {/* ── Export Modal (copy-paste fallback) ───────────────────────── */}
      <Modal
        visible={exportModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>📋 Backup Data</Text>
            <Text style={styles.modalSubtitle}>
              {Platform.OS === 'web'
                ? 'Tap "Download File" below to save it as a .txt file (some mobile browsers block the automatic download). You can also copy the text.'
                : 'Saved/shared as a .txt file. You can also copy the text below as a second backup.'}
            </Text>
            <ScrollView style={styles.exportScroll} nestedScrollEnabled>
              <TextInput
                style={styles.exportText}
                value={exportedJSON}
                multiline
                editable={false}
                selectable
                selectionColor={C.primary}
              />
            </ScrollView>
            <View style={styles.modalActions}>
              {Platform.OS === 'web' && (
                <TouchableOpacity
                  style={[styles.primaryButton, styles.modalBtn]}
                  onPress={handleDownloadFile}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>⬇️ Download File</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[Platform.OS === 'web' ? styles.outlineButton : styles.primaryButton, styles.modalBtn]}
                onPress={handleCopyClipboard}
                activeOpacity={0.8}
              >
                <Text style={Platform.OS === 'web' ? styles.outlineButtonText : styles.primaryButtonText}>Copy to Clipboard</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.outlineButton, styles.modalBtn]}
                onPress={() => setExportModalVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.outlineButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
function ToggleRow({ label, value, onChange }) {
  return <View style={styles.notificationRow}><Text style={styles.notificationLabel}>{label}</Text><TouchableOpacity style={[styles.toggle, value && styles.toggleOn]} onPress={() => onChange(!value)}><View style={[styles.toggleKnob, value && styles.toggleKnobOn]} /></TouchableOpacity></View>;
}
function formatClock(hour, minute) {
  const d = new Date();
  d.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function TimePickerField({ label, hour, minute, onChange }) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(new Date());

  const makeDate = () => {
    const d = new Date();
    d.setHours(Number(hour) || 0, Number(minute) || 0, 0, 0);
    return d;
  };

  const open = () => {
    if (Platform.OS === 'android') {
      // Android's TimePickerDialog IS a native modal already — wrapping the
      // inline picker in our own <Modal> on top of it was causing the
      // "sometimes bugged" behaviour (needing multiple taps, changes not
      // registering, unpredictable dismissal). The imperative API is
      // Android's officially recommended way to show a time picker and
      // sidesteps all of that.
      DateTimePickerAndroid.open({
        value: makeDate(),
        mode: 'time',
        is24Hour: false,
        onChange: (event, selected) => {
          if (event?.type === 'set' && selected) {
            onChange(selected.getHours(), selected.getMinutes());
          }
        },
      });
      return;
    }
    setDraft(makeDate());
    setVisible(true);
  };

  const close = () => setVisible(false);

  const confirm = () => {
    onChange(draft.getHours(), draft.getMinutes());
    setVisible(false);
  };

  return (
    <>
      <Text style={styles.inputLabel}>{label}</Text>
      <TouchableOpacity style={styles.timePickerButton} onPress={open} activeOpacity={0.75}>
        <Text style={styles.timePickerText}>{formatClock(hour, minute)}</Text>
        <Text style={styles.timePickerChevron}>›</Text>
      </TouchableOpacity>
      {Platform.OS !== 'android' && (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
          <View style={styles.timeModalOverlay}>
            <View style={styles.timeModalCard}>
              <Text style={styles.modalTitle}>Select time</Text>
              <DateTimePicker
                value={draft}
                mode="time"
                display="spinner"
                onChange={(_, selected) => { if (selected) setDraft(selected); }}
                is24Hour={false}
                themeVariant="dark"
              />
              <View style={styles.timeModalActions}>
                <TouchableOpacity style={styles.outlineButton} onPress={close}>
                  <Text style={styles.outlineButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={confirm}>
                  <Text style={styles.primaryButtonText}>Set Time</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

function NotificationRow({ label, config, onChange }) {
  const cfg = config || { enabled:true, hour:7, minute:0, type:'push' };
  return (
    <View style={styles.notificationBlock}>
      <View style={styles.notificationRow}>
        <Text style={styles.notificationLabel}>{label}</Text>
        <TouchableOpacity style={[styles.toggle, cfg.enabled && styles.toggleOn]} onPress={() => onChange({...cfg, enabled:!cfg.enabled})}>
          <View style={[styles.toggleKnob, cfg.enabled && styles.toggleKnobOn]} />
        </TouchableOpacity>
      </View>
      <TimePickerField
        label="Reminder time"
        hour={cfg.hour}
        minute={cfg.minute}
        onChange={(hour, minute) => onChange({...cfg, hour, minute})}
      />
      <Text style={styles.notificationType}>Type: {cfg.type || 'push'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notificationRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8}, notificationBlock:{marginBottom:14}, notificationLabel:{color:C.text,fontSize:13,fontWeight:'700'}, notificationType:{color:C.muted2,fontSize:10,marginTop:4}, toggle:{width:48,height:28,borderRadius:16,backgroundColor:'rgba(255,255,255,0.08)',padding:3,justifyContent:'center'}, toggleOn:{backgroundColor:C.primary}, toggleKnob:{width:22,height:22,borderRadius:11,backgroundColor:'#fff'}, toggleKnobOn:{alignSelf:'flex-end'},
  errorText: { color: '#ef4444', fontSize: 12, marginTop: 4, marginBottom: 8 },
  ruleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12, marginTop: 10, gap: 8 },
  ruleCardText: { color: C.muted, fontSize: 12, lineHeight: 17 },
  ruleCardBold: { color: C.text, fontWeight: '700' },
  ruleCardMeta: { color: C.muted2, fontSize: 10, marginTop: 4 },
  ruleForm: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: C.border },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border2, backgroundColor: 'rgba(255,255,255,0.04)' },
  chipActive: { borderColor: C.primary, backgroundColor: 'rgba(139,92,246,0.16)' },
  chipText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: C.text },
  timePickerButton:{backgroundColor:'rgba(255,255,255,0.05)',borderWidth:1,borderColor:C.border2,borderRadius:10,paddingHorizontal:12,paddingVertical:11,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}, timePickerText:{color:C.text,fontSize:14,fontWeight:'700'}, timePickerChevron:{color:C.muted,fontSize:24,lineHeight:20}, timeModalOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.65)',justifyContent:'center',alignItems:'center',padding:24}, timeModalCard:{width:'100%',maxWidth:360,backgroundColor:C.card,borderRadius:20,borderWidth:1,borderColor:C.border,padding:18,alignItems:'center'}, timeModalActions:{width:'100%',flexDirection:'row',gap:10,marginTop:12}, timeModalActionsButton:{flex:1},
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: C.text,
    marginBottom: 20,
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: C.muted,
    marginBottom: 14,
    lineHeight: 18,
  },

  // Inputs
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  labeledInput: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 6,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 10,
    color: C.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fullInput: {
    marginBottom: 14,
  },

  // Quantity + Unit row
  qtyUnitRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
    alignItems: 'flex-start',
  },
  qtyInputWrap: {
    width: 110,
  },
  unitWrap: {
    flex: 1,
  },
  unitPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  unitPill: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border2,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  unitPillActive: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  unitPillText: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '500',
  },
  unitPillTextActive: {
    color: '#fff',
    fontWeight: '700',
  },

  // Macros grid
  macroGridLabel: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 10,
    fontWeight: '500',
  },
  macroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  macroCell: {
    width: '47%',
  },

  // Buttons
  primaryButton: {
    backgroundColor: C.primary,
    borderRadius: 12,
    minHeight: 50,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    backgroundColor: 'rgba(124,92,252,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,92,252,0.4)',
    minHeight: 50,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryButtonText: {
    color: C.primaryLt,
    fontWeight: '600',
    fontSize: 15,
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border2,
    minHeight: 50,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  outlineButtonText: {
    color: C.muted,
    fontWeight: '600',
    fontSize: 15,
  },
  dangerButton: {
    backgroundColor: 'rgba(244,63,94,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244,63,94,0.4)',
    minHeight: 50,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerButtonText: {
    color: C.rose,
    fontWeight: '700',
    fontSize: 15,
  },
  btnBusy: {
    opacity: 0.5,
  },

  // Save confirmation
  savedMsgContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  savedMsgText: {
    color: C.green,
    fontWeight: '700',
    fontSize: 15,
  },
  savedSyncText: {
    color: C.muted,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },

  // Food list
  foodList: {
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 14,
  },
  foodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  foodItemEditing: {
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderRadius: 10,
    paddingHorizontal: 6,
  },
  foodItemInfo: {
    flex: 1,
    paddingRight: 10,
  },
  foodItemName: {
    color: C.text,
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 2,
  },
  foodItemMeta: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  editBtn: {
    padding: 6,
  },
  editBtnText: {
    fontSize: 16,
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    fontSize: 18,
  },

  // Data & Backup
  spacer: {
    height: 14,
  },
  importInput: {
    height: 130,
    marginBottom: 12,
    paddingTop: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
  },
  importMsg: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  instructionBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  instructionText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
  },

  // Danger
  dangerWarning: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },

  // Bottom padding
  bottomPad: {
    height: 30,
  },

  // Export modal
  storageStats:{marginTop:10,padding:10,borderRadius:10,backgroundColor:'rgba(255,255,255,0.03)',gap:5}, storageRow:{color:C.muted,fontSize:11}, storageValue:{color:C.text,fontWeight:'800'},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: C.border2,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 14,
    lineHeight: 18,
  },
  exportScroll: {
    maxHeight: 280,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  exportText: {
    color: C.muted,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 11,
    padding: 12,
    lineHeight: 18,
  },
  modalActions: {
    gap: 10,
  },
  modalBtn: {
    marginTop: 0,
  },
});