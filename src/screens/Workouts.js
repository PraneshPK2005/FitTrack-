import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useKeyboardPadding } from '../utils/keyboard';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  Keyboard,
  AppState,
  KeyboardAvoidingView,
} from 'react-native';
import { database } from '../utils/database';
import { showToast } from '../utils/notifications';
import ClearableTextInput from '../components/ClearableTextInput';
import { ExerciseProgression } from '../components/Charts';

// Session duration rules: warn at 2.5h, hard auto-end at 3h.
const SESSION_WARN_MIN = 150; // 2.5 hours
const SESSION_MAX_MIN  = 180; // 3 hours

// ─── Constants ────────────────────────────────────────────────────────────────

const MUSCLES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Biceps', 'Triceps', 'Core'];

const MUSCLE_COLOR = {
  Chest:     '#7c5cfc',
  Back:      '#06b6d4',
  Legs:      '#10b981',
  Shoulders: '#f59e0b',
  Biceps:    '#f43f5e',
  Triceps:   '#ec4899',
  Core:      '#22d3ee',
};

const MUSCLE_EXERCISES = {
  Chest:     ['Bench Press', 'Incline Bench', 'Dumbbell Fly', 'Push-up', 'Cable Fly', 'Chest Dip', 'Pec Deck Fly','Decline Bench Press','Incline Db Press'],
  Back:      ['Pull-up', 'Deadlift', 'Barbell Row', 'Lat Pulldown', 'Seated Row', 'Face Pull', 'T-Bar Row','Undergrip Barbell Row','Medium Grip Rows','Medium Grip Pulldown','Hyper Extension','Single Arm Cable Row','Close Grip Pulldown','Undergrip Pulldown',],
  Legs:      ['Squat', 'Leg Press', 'Romanian Deadlift', 'Leg Curl', 'Leg Extension', 'Calf Raises', 'Bulgarian Split Squat','Sumo Squats','Hip Thrust','Adductor','Lunges','Abductor'],
  Shoulders: ['OHP', 'Arnold Press', 'Shrugs', 'Rear Delt Fly', 'Cable Lateral','Military Press','Db Lateral Raises','Cable Front Raises','Arnold Press'],
  Biceps:    ['Barbell Curl', 'Hammer Curl', 'Dumbbell Curl', 'Preacher Curl', 'EZ Bar Curl', 'Concentration Curl', 'Cable Curl','Spider Curls'],
  Triceps:   ['Tricep Dip', 'Skull Crusher', 'Tricep Pushdown', 'Close-Grip Bench', 'Overhead Extension', 'Cable Kickbacks', 'Diamond Push-up','Single Arm Cable Extension'],
  Core:      ['Plank', 'Crunch', 'Leg Raise', 'Russian Twist', 'Ab Wheel', 'Cable Crunch', 'Mountain Climber','Hollo Body Hold','Dead Bug','Plank Shoulder Taps','Side Plank','Reverse Crunch'],
};
// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  bg:      '#080810',
  card:    '#0f0f1e',
  border:  'rgba(255,255,255,0.07)',
  text:    '#f0f0ff',
  muted:   '#8892a4',
  muted2:  '#4a5568',
  primary: '#8b5cf6',
  green:   '#10b981',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function localDate(n = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Convert a string to Title Case
function toTitleCase(str) {
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function formatDurationClock(value) {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value).trim();
  if (raw.includes(':')) {
    const [m, s] = raw.split(':').map(v => parseInt(v, 10));
    if (Number.isFinite(m) && Number.isFinite(s)) {
      return `${String(Math.max(0, m)).padStart(2, '0')}:${String(Math.min(59, Math.max(0, s))).padStart(2, '0')}`;
    }
  }
  const total = Math.max(0, parseInt(raw, 10) || 0);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function parseDurationClock(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.includes(':')) {
    const [m, s] = raw.split(':').map(v => parseInt(v, 10));
    if (!Number.isFinite(m) || !Number.isFinite(s)) return '';
    return Math.max(0, m) * 60 + Math.min(59, Math.max(0, s));
  }
  return Math.max(0, parseInt(raw, 10) || 0);
}

// Days in a month
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// First weekday (0=Sun) of a month
function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${months[m - 1]} ${d}`;
}

function getDayChips() {
  return Array.from({ length: 14 }, (_, i) => {
    const dateStr = localDate(i);
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { dateStr, dayName: days[dateObj.getDay()], dayNum: d };
  });
}

/**
 * Always returns a proper array of set objects.
 * Handles: undefined, null, JSON string, array with string/number values.
 */
/**
 * Parses sets array. Falls back to top-level log.reps/log.weight when sets
 * is absent — needed for legacy seed data that predates the sets schema.
 */
function safeSets(raw, log) {
  // Handle JSON string (shouldn't normally happen but guard anyway)
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { arr = []; }
  }
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.map(s => ({
      reps:            s?.reps            !== undefined ? String(s.reps)            : '',
      durationSeconds: s?.durationSeconds !== undefined ? String(s.durationSeconds) : (log?.isPlank ? (s?.reps !== undefined ? String(s.reps) : '') : ''),
      weight:          s?.weight          !== undefined ? String(s.weight)          : '',
      dropSet: !!s?.dropSet, // preserve drop-set flag
      drops: Array.isArray(s?.drops) ? s.drops.map(d => ({
        reps:   d?.reps   !== undefined ? String(d.reps)   : '',
        weight: d?.weight !== undefined ? String(d.weight) : '',
      })) : [],
    }));
  }
  // Fallback: construct a single synthetic set from top-level fields
  if (log && (log.reps || log.weight)) {
    return [{
      reps:            log.reps            !== undefined ? String(log.reps)            : '',
      durationSeconds: log.durationSeconds !== undefined ? String(log.durationSeconds) : '',
      weight:          log.weight          !== undefined ? String(log.weight)          : '',
      dropSet: false,
      drops: [],
    }];
  }
  return [];
}

function makeSetsLabel(rawSets) {
  const sets = safeSets(rawSets);
  if (!sets.length) return '—';
  return sets.map(s => {
    const main = `${s.reps || '?'}×${s.weight || '?'}kg`;
    if (s.dropSet && s.drops?.length) {
      const dropsStr = s.drops.map(d => `${d.reps || '?'}×${d.weight || '?'}kg`).join(' → ');
      return `${main} → ${dropsStr}`;
    }
    return main;
  }).join('  ');
}

function makeSetsCompact(rawSets) {
  const sets = safeSets(rawSets);
  if (!sets.length) return '—';
  return `${sets.length} set${sets.length !== 1 ? 's' : ''}`;
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

function TabBar({ activeTab, onChangeTab }) {
  const tabs = [
    { key: 'Log',     label: '📋 Log' },
    { key: 'Records', label: '🏆 Records' },
    { key: 'History', label: '📅 History' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map(t => (
        <TouchableOpacity
          key={t.key}
          style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
          onPress={() => onChangeTab(t.key)}
        >
          <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>
            {t.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Exercise Form Panel ──────────────────────────────────────────────────────

function ExercisePanel({
  muscle, selectedDate, sessionId, sessionName, onAddWorkoutLog,
  supersetMode = false, supersetId = null, supersetOrder = 1, onChangeMuscle,
  deferSave = false, initialDraft = null, onDraftChange, onRequestSuperset,
  customExercises = [], draftKey = null, onClearDraft, onPersistDraft, onRemoveCustomExercise,
}) {
  const [exerciseName,    setExerciseName]    = useState(initialDraft?.exerciseName || '');
  const allowDuration = muscle === 'Core';
  const [exerciseType,    setExerciseType]    = useState(allowDuration ? (initialDraft?.exerciseType || (initialDraft?.isPlank ? 'duration' : 'reps')) : 'reps');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sets,            setSets]            = useState(initialDraft?.sets?.length ? initialDraft.sets.map(s => ({ ...s, durationSeconds: s?.durationSeconds !== undefined && s?.durationSeconds !== '' ? formatDurationClock(s.durationSeconds) : '' })) : [{ reps: '', durationSeconds: '', weight: '', dropSet: false, drops: [] }]);
  const [loggedMessage,   setLoggedMessage]   = useState(false);
  const selectingSuggestion = useRef(false);
  const latestDraftRef = useRef({ exerciseName, exerciseType, sets });
  latestDraftRef.current = { exerciseName, exerciseType, sets };

  const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);

  useEffect(() => {
    if (!onDraftChangeRef.current) return;
    onDraftChangeRef.current({
      exerciseName,
      exerciseType: allowDuration ? exerciseType : 'reps',
      muscleGroup: muscle,
      isPlank: allowDuration && exerciseType === 'duration',
      sets: sets.map(s => ({ reps: exerciseType === 'reps' ? s.reps : '', durationSeconds: exerciseType === 'duration' ? parseDurationClock(s.durationSeconds ?? s.reps ?? '') : '', weight: s.weight, dropSet: !!s.dropSet, drops: s.drops || [] })),
    });
  }, [exerciseName, exerciseType, muscle, sets, allowDuration]);

  // Flush the latest in-memory form state when this panel is unmounted.
  // The Workout screen can be unmounted when navigating to another app page;
  // this guarantees the last typed values reach the parent draft store first.
  useEffect(() => {
    return () => {
      if (!onDraftChangeRef.current || !sessionId) return;
      const latest = latestDraftRef.current;
      onDraftChangeRef.current({
        exerciseName: latest.exerciseName,
        exerciseType: allowDuration ? latest.exerciseType : 'reps',
        muscleGroup: muscle,
        isPlank: allowDuration && latest.exerciseType === 'duration',
        sessionId,
        sessionName: sessionName || '',
        sets: latest.sets.map(s => ({
          reps: latest.exerciseType === 'reps' ? s.reps : '',
          durationSeconds: latest.exerciseType === 'duration' ? parseDurationClock(s.durationSeconds ?? s.reps ?? '') : '',
          weight: s.weight,
          dropSet: !!s.dropSet,
          drops: s.drops || [],
        })),
        date: selectedDate,
      });
    };
  }, [onDraftChange, sessionId, sessionName, selectedDate, muscle, allowDuration]);

  const filteredSuggestions = [
    ...(MUSCLE_EXERCISES[muscle] || []).map(name => ({ name, custom: false, id: null })),
    ...(customExercises || [])
      .filter(e => String(e.muscleGroup || e.muscle) === muscle)
      .map(e => ({ name: e.name, custom: true, id: e.id })),
  ]
    .filter((e, i, arr) => e.name && arr.findIndex(x => x.name.toLowerCase() === e.name.toLowerCase()) === i)
    .filter(e => exerciseName.trim() === '' || e.name.toLowerCase().includes(exerciseName.toLowerCase()));

  const addSet    = () => setSets(prev => [...prev, { reps: '', durationSeconds: '', weight: '', dropSet: false, drops: [] }]);
  const removeSet = idx => setSets(prev => prev.filter((_, i) => i !== idx));
  const updateSet = (idx, field, value) =>
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  const toggleDropSet = idx =>
    setSets(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const turningOn = !s.dropSet;
      return {
        ...s,
        dropSet: turningOn,
        // Seed with one empty drop stage when enabling, so "Drop 1" is
        // immediately visible/ready to fill in. Clear drops when disabling
        // so re-enabling later starts fresh rather than showing stale values.
        drops: turningOn ? (s.drops?.length ? s.drops : [{ reps: '', weight: '' }]) : [],
      };
    }));
  const addDrop = idx =>
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, drops: [...(s.drops || []), { reps: '', weight: '' }] } : s));
  const removeDrop = (idx, dropIdx) =>
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, drops: (s.drops || []).filter((_, di) => di !== dropIdx) } : s));
  const updateDrop = (idx, dropIdx, field, value) =>
    setSets(prev => prev.map((s, i) => i === idx
      ? { ...s, drops: (s.drops || []).map((d, di) => di === dropIdx ? { ...d, [field]: value } : d) }
      : s));

  const getDraft = () => ({
    exerciseName: exerciseName.trim(),
    exerciseType: allowDuration ? exerciseType : 'reps',
    muscleGroup: muscle,
    isPlank: allowDuration && exerciseType === 'duration',
    sessionId: sessionId || null,
    sessionName: sessionName || '',
    sets: sets.map(s => ({ reps: exerciseType === 'reps' ? s.reps : '', durationSeconds: exerciseType === 'duration' ? parseDurationClock(s.durationSeconds ?? s.reps ?? '') : '', weight: s.weight, dropSet: !!s.dropSet, drops: s.drops || [] })),
    date: selectedDate,
  });

  const handleLog = () => {
    const draft = getDraft();
    if (!draft.exerciseName) { Alert.alert('Missing Exercise', 'Please enter an exercise name.'); return; }
    if (!draft.sets.length) { Alert.alert('No Sets', 'Please add at least one set.'); return; }

    if (deferSave) {
      onDraftChange && onDraftChange(draft);
      setLoggedMessage(true);
      setTimeout(() => setLoggedMessage(false), 1500);
      return;
    }

    onAddWorkoutLog({
      ...draft,
      isSuperset: !!supersetMode,
      ...(supersetMode && supersetId ? { supersetId, supersetOrder } : {}),
    });
    if (onPersistDraft && draft.exerciseName && !MUSCLE_EXERCISES[muscle]?.some(e => e.toLowerCase() === draft.exerciseName.toLowerCase())) {
      onPersistDraft({ name: draft.exerciseName, muscleGroup: muscle, exerciseType: allowDuration ? exerciseType : 'reps' });
    }
    onClearDraft && onClearDraft();
    setLoggedMessage(true);
    setExerciseName('');
    setExerciseType('reps');
    setSets([{ reps: '', durationSeconds: '', weight: '', dropSet: false, drops: [] }]);
    setShowSuggestions(false);
    setTimeout(() => setLoggedMessage(false), 2000);
  };

  const color = MUSCLE_COLOR[muscle];

  return (
    <View style={[styles.exercisePanel, { borderLeftColor: color }]}>
      <View style={styles.exercisePanelHeaderRow}>
        <Text style={[styles.musclePanelHeader, { color }]}>{muscle}</Text>
        {supersetMode && onChangeMuscle && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.supersetMusclePicker}>
            {MUSCLES.map(m => (
              <TouchableOpacity key={m} style={[styles.supersetMuscleChip, m === muscle && styles.supersetMuscleChipActive]} onPress={() => onChangeMuscle(m)}>
                <Text style={[styles.supersetMuscleChipText, m === muscle && styles.supersetMuscleChipTextActive]}>{m}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.inputWrapper}>
        <ClearableTextInput
          style={styles.exerciseInput}
          placeholder={`Exercise for ${muscle}…`}
          placeholderTextColor={C.muted2}
          value={exerciseName}
          onChangeText={v => {
            // Apply title case only when user is typing a custom name (not from suggestions)
            setExerciseName(v);
            setShowSuggestions(true);
          }}
          onBlur={() => {
            // On blur, title-case whatever is typed if not from suggestion list
            if (exerciseName.trim()) setExerciseName(toTitleCase(exerciseName.trim()));
            setTimeout(() => {
              if (!selectingSuggestion.current) setShowSuggestions(false);
            }, 400);
          }}
          onFocus={() => setShowSuggestions(true)}
        />
        {showSuggestions && filteredSuggestions.length > 0 && (
          <ScrollView
            style={styles.suggestionList}
            keyboardShouldPersistTaps="always"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {filteredSuggestions.map(s => (
              <View key={s.name} style={styles.suggestionItemRow}>
                <TouchableOpacity
                  style={[styles.suggestionItem, { flex: 1 }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    selectingSuggestion.current = false;
                    Keyboard.dismiss();
                    setExerciseName(s.name);
                    setShowSuggestions(false);
                  }}
                >
                  <Text style={styles.suggestionText}>{s.name}</Text>
                </TouchableOpacity>
                {s.custom && onRemoveCustomExercise && (
                  <TouchableOpacity
                    style={styles.suggestionRemoveBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => {
                      selectingSuggestion.current = true; // keep suggestions open through the confirm dialog
                      const msg = 'Remove this exercise from the exercise list?';
                      const doRemove = () => onRemoveCustomExercise(s.id);
                      if (Platform.OS === 'web') { if (window.confirm(msg)) doRemove(); }
                      else Alert.alert('Remove Exercise', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: doRemove }]);
                    }}
                  >
                    <Text style={styles.suggestionRemoveBtnText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {allowDuration ? (
        <View style={styles.exerciseTypeRow}>
          <Text style={styles.exerciseTypeLabel}>Exercise Type</Text>
          <View style={styles.exerciseTypeButtons}>
            {['reps', 'duration'].map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.exerciseTypeBtn, exerciseType === type && styles.exerciseTypeBtnActive]}
                onPress={() => {
                  setExerciseType(type);
                  setSets(prev => prev.map(s => type === 'reps'
                    ? { ...s, durationSeconds: '', reps: s.reps || s.durationSeconds || '' }
                    : { ...s, reps: '', durationSeconds: s.durationSeconds || (s.reps ? formatDurationClock(s.reps) : '') }));
                }}
              >
                <Text style={[styles.exerciseTypeBtnText, exerciseType === type && styles.exerciseTypeBtnTextActive]}>
                  {type === 'reps' ? 'Reps' : 'Duration'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.setTableHeader}>
        <Text style={[styles.setHeaderCell, { flex: 0.4 }]}>Set</Text>
        <Text style={[styles.setHeaderCell, { flex: 1 }]}>Weight (kg)</Text>
        <Text style={[styles.setHeaderCell, { flex: 1 }]}>{exerciseType === 'duration' ? 'Duration (mm:ss)' : 'Reps'}</Text>
        <View style={styles.setHeaderDSCol}>
          <Text style={styles.setHeaderCell}>DS</Text>
        </View>
        <View style={styles.setHeaderSpacerCol} />
      </View>

      {sets.map((s, idx) => (
        <View key={idx}>
          <View style={[styles.setRow, s.dropSet && styles.setRowDropSet]}>
            <Text style={[styles.setNumText, { flex: 0.4 }]}>{idx + 1}</Text>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder="0"
              placeholderTextColor={C.muted2}
              keyboardType="numeric"
              value={s.weight}
              onChangeText={v => updateSet(idx, 'weight', v)}
            />
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder={exerciseType === 'duration' ? '00:45' : '10'}
              placeholderTextColor={C.muted2}
              keyboardType={exerciseType === 'duration' ? 'default' : (Platform.OS === 'web' ? 'default' : 'numeric')}
              value={exerciseType === 'duration' ? (s.durationSeconds ?? '') : s.reps}
              onChangeText={v => updateSet(idx, exerciseType === 'duration' ? 'durationSeconds' : 'reps', v.replace(/[^0-9:]/g, '').slice(0, 5))}
            />
            <TouchableOpacity
              style={[styles.dropSetBtn, s.dropSet && styles.dropSetBtnActive]}
              onPress={() => toggleDropSet(idx)}
            >
              <Text style={[styles.dropSetBtnText, s.dropSet && styles.dropSetBtnTextActive]}>DS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteSetBtn} onPress={() => removeSet(idx)}>
              <Text style={styles.deleteSetBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {s.dropSet && (
            <View style={styles.dropStagesWrap}>
              {(s.drops || []).map((d, dIdx) => (
                <View key={dIdx} style={styles.dropStageRow}>
                  <Text style={styles.dropStageArrow}>↓</Text>
                  <Text style={styles.dropStageLabel}>Drop {dIdx + 1}</Text>
                  <TextInput
                    style={[styles.setInput, styles.dropStageInput]}
                    placeholder="kg"
                    placeholderTextColor={C.muted2}
                    keyboardType="numeric"
                    value={d.weight}
                    onChangeText={v => updateDrop(idx, dIdx, 'weight', v)}
                  />
                  <TextInput
                    style={[styles.setInput, styles.dropStageInput]}
                    placeholder="reps"
                    placeholderTextColor={C.muted2}
                    keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                    value={d.reps}
                    onChangeText={v => updateDrop(idx, dIdx, 'reps', v.replace(/[^0-9]/g, '').slice(0, 4))}
                  />
                  <TouchableOpacity style={styles.deleteDropBtn} onPress={() => removeDrop(idx, dIdx)}>
                    <Text style={styles.deleteSetBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addDropBtn} onPress={() => addDrop(idx)}>
                <Text style={styles.addDropBtnText}>+ Add Drop</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}

      <TouchableOpacity style={styles.addSetBtn} onPress={addSet}>
        <Text style={styles.addSetBtnText}>+ Add Set</Text>
      </TouchableOpacity>

      {!supersetMode && onRequestSuperset && !deferSave && (
        <TouchableOpacity style={styles.supersetToggle} onPress={() => onRequestSuperset(getDraft())}>
          <Text style={styles.supersetToggleText}>🔗 Add as Superset</Text>
          <Text style={styles.supersetToggleHint}>Turn this exercise into the first exercise of a 2–4 exercise Superset.</Text>
        </TouchableOpacity>
      )}

      {deferSave ? (
        <View style={styles.supersetDraftReady}>
          <Text style={styles.supersetDraftReadyText}>{loggedMessage ? '✓ Ready to log' : 'Enter all sets, then log the Superset below'}</Text>
        </View>
      ) : loggedMessage ? (
        <View style={styles.loggedMsg}>
          <Text style={styles.loggedMsgText}>✅ Logged!</Text>
        </View>
      ) : (
        <TouchableOpacity style={[styles.logExerciseBtn, { borderColor: color }]} onPress={handleLog}>
          <Text style={[styles.logExerciseBtnText, { color }]}>
            Log {exerciseName.trim() || muscle}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Logged exercises for a date (shown in Log tab) ───────────────────────────

// Renders the muscle-grouped exercise list for a single set of logs
// (either one session's logs, or all of a date's logs when there's only
// one session that day).
function SupersetLogs({ logs, editingId, setEditingId, onSaveEdit, onDelete, onDeleteSuperset, outerNumber }) {
  const ordered = [...logs].sort((a, b) => (Number(a.supersetOrder) || 999) - (Number(b.supersetOrder) || 999));
  const color = C.primary;
  return (
    <View style={styles.supersetGroup}>
      <View style={styles.supersetGroupHeader}>
        {outerNumber != null && (
          <View style={styles.supersetOrderBadge}><Text style={styles.supersetOrderText}>{outerNumber}</Text></View>
        )}
        <Text style={styles.supersetGroupTitle}>🔗 SUPERSET</Text>
        <Text style={styles.supersetGroupCount}>{ordered.length} exercises</Text>
        {onDeleteSuperset && (
          <TouchableOpacity style={styles.supersetDeleteBtn} onPress={() => onDeleteSuperset(ordered)}>
            <Text style={styles.supersetDeleteText}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>
      {ordered.map((log, index) => {
        const sets = safeSets(log.sets, log);
        const isEditing = editingId === log.id;
        const muscleColor = MUSCLE_COLOR[log.muscleGroup] || color;
        return (
          <View key={log.id} style={styles.supersetExerciseCard}>
            <View style={styles.supersetOrderRow}>
              <View style={styles.supersetOrderBadge}><Text style={styles.supersetOrderText}>{index + 1}</Text></View>
              <Text style={styles.supersetHistoryLabel}>{log.muscleGroup || 'Exercise'}</Text>
            </View>
            {isEditing ? (
              <InlineEditForm log={log} onSave={updates => onSaveEdit(log, updates)} onCancel={() => setEditingId(null)} />
            ) : (
              <>
                <View style={styles.historyEntryTop}>
                  <Text style={[styles.historyExerciseName, { flex: 1, color: muscleColor }]}>{log.exerciseName}</Text>
                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditingId(log.id)}><Text style={styles.editBtnText}>✏️</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(log)}><Text style={styles.deleteBtnText}>🗑️</Text></TouchableOpacity>
                </View>
                {sets.length > 0 && (
                  <View style={styles.setsDetailBlock}>
                    <View style={styles.setsDetailHeader}>
                      <Text style={[styles.setsDetailHeaderCell, { flex: 0.4 }]}>SET</Text>
                      <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>WEIGHT</Text>
                      <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>{(log.exerciseType === 'duration' || log.isPlank) ? 'DURATION (mm:ss)' : 'REPS'}</Text>
                    </View>
                    {sets.map((st, si) => (
                      <View key={si}>
                        <View style={[styles.setsDetailRow, si % 2 === 1 && styles.setsDetailRowAlt]}>
                          <Text style={[styles.setsDetailCell, { flex: 0.4, color: C.muted }]}>{si + 1}</Text>
                          <Text style={[styles.setsDetailCell, { flex: 1, color: muscleColor }]}>{st.weight ? `${st.weight} kg` : '—'}</Text>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.setsDetailCell}>{(log.exerciseType === 'duration' || log.isPlank) ? formatDurationClock(st.durationSeconds || st.reps) || '—' : (st.reps || '—')}</Text>
                            {st.dropSet && <View style={styles.dsBadge}><Text style={styles.dsBadgeText}>DS · {(st.drops || []).length} drop{(st.drops || []).length === 1 ? '' : 's'}</Text></View>}
                          </View>
                        </View>
                        {st.dropSet && (st.drops || []).map((d, di) => (
                          <View key={di} style={styles.dropStageDetailRow}>
                            <Text style={styles.dropStageArrow}>↓</Text>
                            <Text style={styles.dropStageDetailText}>{d.weight || '—'} kg × {d.reps || '—'}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

function MuscleGroupedLogs({ logs, editingId, setEditingId, onSaveEdit, onDelete, onDeleteSuperset }) {
  // Build display units first so a Superset and a normal exercise participate
  // in the same outer workout-execution order. `supersetOrder` remains the
  // inner order of exercises inside a Superset.
  const supersetMap = {};
  const units = [];
  const seenSupersets = new Set();

  (logs || []).forEach((log, sourceIndex) => {
    if (log.isSuperset === true && log.supersetId) {
      if (!supersetMap[log.supersetId]) supersetMap[log.supersetId] = [];
      supersetMap[log.supersetId].push(log);
    } else {
      units.push({
        type: 'normal',
        order: Number(log.sessionExerciseOrder) || sourceIndex + 1,
        muscle: log.muscleGroup || 'Other',
        log,
      });
    }
  });

  Object.entries(supersetMap).forEach(([sid, ssLogs]) => {
    if (seenSupersets.has(sid)) return;
    seenSupersets.add(sid);
    const ordered = [...ssLogs].sort((a, b) => (Number(a.supersetOrder) || 999) - (Number(b.supersetOrder) || 999));
    const first = ordered[0];
    units.push({
      type: 'superset',
      order: Math.min(...ordered.map((l, i) => Number(l.sessionExerciseOrder) || Number(l.id) || i + 1)),
      muscle: first?.muscleGroup || 'Other',
      logs: ordered,
    });
  });

  // ── Top-level session numbering ──────────────────────────────────────
  // This is computed GLOBALLY across the whole session/date (i.e. spanning
  // every muscle group), then each unit carries its own `displayNumber`
  // into the per-muscle sections below purely for visual grouping — the
  // numbers themselves stay continuous across the whole session, matching
  // Workout > Log / Workout > History > Date's required numbering, where a
  // Superset "occupies" as many session slots as it has exercises (so the
  // very next top-level item's number reflects that), while the Superset
  // itself is always displayed using the slot of its first exercise. This
  // does not touch a Superset's own internal numbering (supersetOrder),
  // which always restarts at 1 for that Superset's own exercises — see
  // SupersetLogs below.
  const numberedUnits = [...units].sort((a, b) => a.order - b.order);
  let _slot = 0;
  numberedUnits.forEach(u => {
    u.displayNumber = _slot + 1;
    _slot += (u.type === 'superset' ? u.logs.length : 1);
  });

  // Preserve the established muscle hierarchy for the sections, but order
  // the actual performed units inside each section by session execution order.
  const byMuscle = {};
  units.forEach(unit => {
    if (!byMuscle[unit.muscle]) byMuscle[unit.muscle] = [];
    byMuscle[unit.muscle].push(unit);
  });

  const orderedMuscles = Object.entries(byMuscle).sort(([a], [b]) =>
    (MUSCLES.indexOf(a) < 0 ? 999 : MUSCLES.indexOf(a)) -
    (MUSCLES.indexOf(b) < 0 ? 999 : MUSCLES.indexOf(b))
  );

  return (
    <>
      {orderedMuscles.map(([muscle, muscleUnits]) => {
        const color = MUSCLE_COLOR[muscle] || '#7c5cfc';
        const sortedUnits = [...muscleUnits].sort((a, b) => a.order - b.order);
        const exerciseCount = sortedUnits.reduce((n, u) => n + (u.type === 'superset' ? u.logs.length : 1), 0);
        return (
          <View key={muscle} style={styles.muscleGroupBlock}>
            <View style={[styles.muscleGroupHeader, { borderLeftColor: color }]}>
              <View style={[styles.muscleColorDot, { backgroundColor: color }]} />
              <Text style={[styles.muscleGroupHeaderText, { color }]}>{muscle}</Text>
              <Text style={styles.muscleGroupCount}>{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</Text>
            </View>

            {sortedUnits.map((unit, unitIndex) => {
              if (unit.type === 'superset') {
                const outerNumber = unit.displayNumber || unitIndex + 1;
                return (
                  <View key={`ss-${unit.logs[0]?.supersetId || unitIndex}`}>
                    <View style={styles.supersetGroup}>
                      <View style={styles.supersetGroupHeader}>
                        <View style={styles.supersetOrderBadge}>
                          <Text style={styles.supersetOrderText}>{outerNumber}</Text>
                        </View>
                        <Text style={styles.supersetGroupTitle}>🔗 SUPERSET</Text>
                        <Text style={styles.supersetGroupCount}>{unit.logs.length} exercises</Text>
                        <TouchableOpacity style={styles.supersetDeleteBtn} onPress={() => onDeleteSuperset && onDeleteSuperset(unit.logs)}>
                          <Text style={styles.supersetDeleteText}>🗑️</Text>
                        </TouchableOpacity>
                      </View>
                      {unit.logs.map((log, index) => {
                        const sets = safeSets(log.sets, log);
                        const isEditing = editingId === log.id;
                        const muscleColor = MUSCLE_COLOR[log.muscleGroup] || color;
                        // Positional, not log.supersetOrder directly: when this
                        // list has been filtered down to one muscle's children
                        // of a mixed-muscle Superset (see Workout > History >
                        // Muscle > <muscle> for a Superset spanning multiple
                        // muscle groups), the remaining child(ren) must still
                        // renumber from 1 rather than keep their original
                        // position in the full, unfiltered Superset.
                        const innerOrder = index + 1;
                        return (
                          <View key={log.id} style={styles.supersetExerciseCard}>
                            <View style={styles.supersetOrderRow}>
                              <View style={styles.supersetOrderBadge}><Text style={styles.supersetOrderText}>{innerOrder}</Text></View>
                              <Text style={styles.supersetHistoryLabel}>{log.muscleGroup || 'Exercise'}</Text>
                            </View>
                            {isEditing ? (
                              <InlineEditForm log={log} onSave={updates => onSaveEdit(log, updates)} onCancel={() => setEditingId(null)} />
                            ) : (
                              <>
                                <View style={styles.historyEntryTop}>
                                  <Text style={[styles.historyExerciseName, { flex: 1, color: muscleColor }]}>{log.exerciseName}</Text>
                                  <TouchableOpacity style={styles.editBtn} onPress={() => setEditingId(log.id)}><Text style={styles.editBtnText}>✏️</Text></TouchableOpacity>
                                  <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(log)}><Text style={styles.deleteBtnText}>🗑️</Text></TouchableOpacity>
                                </View>
                                {sets.length > 0 && (
                                  <View style={styles.setsDetailBlock}>
                                    <View style={styles.setsDetailHeader}>
                                      <Text style={[styles.setsDetailHeaderCell, { flex: 0.4 }]}>SET</Text>
                                      <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>WEIGHT</Text>
                                      <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>{(log.exerciseType === 'duration' || log.isPlank) ? 'DURATION (mm:ss)' : 'REPS'}</Text>
                                    </View>
                                    {sets.map((st, si) => (
                                      <View key={si}>
                                        <View style={[styles.setsDetailRow, si % 2 === 1 && styles.setsDetailRowAlt]}>
                                          <Text style={[styles.setsDetailCell, { flex: 0.4, color: C.muted }]}>{si + 1}</Text>
                                          <Text style={[styles.setsDetailCell, { flex: 1, color: muscleColor }]}>{st.weight ? `${st.weight} kg` : '—'}</Text>
                                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                            <Text style={styles.setsDetailCell}>{(log.exerciseType === 'duration' || log.isPlank) ? formatDurationClock(st.durationSeconds || st.reps) || '—' : (st.reps || '—')}</Text>
                                            {st.dropSet && <View style={styles.dsBadge}><Text style={styles.dsBadgeText}>DS · {(st.drops || []).length} drop{(st.drops || []).length === 1 ? '' : 's'}</Text></View>}
                                          </View>
                                        </View>
                                        {st.dropSet && (st.drops || []).map((d, di) => (
                                          <View key={di} style={styles.dropStageDetailRow}>
                                            <Text style={styles.dropStageArrow}>↓</Text>
                                            <Text style={styles.dropStageDetailText}>{d.weight || '—'} kg × {d.reps || '—'}</Text>
                                          </View>
                                        ))}
                                      </View>
                                    ))}
                                  </View>
                                )}
                              </>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              }

              const log = unit.log;
              const sets = safeSets(log.sets, log);
              const isEditing = editingId === log.id;
              const colorForLog = MUSCLE_COLOR[log.muscleGroup] || color;
              const outerNumber = unit.displayNumber || unitIndex + 1;
              return (
                <View key={log.id} style={[styles.historyEntry, { borderLeftColor: colorForLog }]}> 
                  {isEditing ? (
                    <InlineEditForm log={log} onSave={updates => onSaveEdit(log, updates)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <>
                      <View style={styles.historyEntryTop}>
                        <View style={styles.historyExerciseTitleRow}>
                          <View style={styles.historyExerciseOrderBadge}><Text style={styles.historyExerciseOrderText}>{outerNumber}</Text></View>
                          <Text style={[styles.historyExerciseName, { flex: 1 }]}>{log.exerciseName}</Text>
                        </View>
                        <TouchableOpacity style={styles.editBtn} onPress={() => setEditingId(log.id)}><Text style={styles.editBtnText}>✏️</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(log)}><Text style={styles.deleteBtnText}>🗑️</Text></TouchableOpacity>
                      </View>
                      {sets.length > 0 && (
                        <View style={styles.setsDetailBlock}>
                          <View style={styles.setsDetailHeader}>
                            <Text style={[styles.setsDetailHeaderCell, { flex: 0.4 }]}>SET</Text>
                            <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>WEIGHT</Text>
                            <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>{(log.exerciseType === 'duration' || log.isPlank) ? 'DURATION (mm:ss)' : 'REPS'}</Text>
                          </View>
                          {sets.map((st, si) => (
                            <View key={si}>
                              <View style={[styles.setsDetailRow, si % 2 === 1 && styles.setsDetailRowAlt]}>
                                <Text style={[styles.setsDetailCell, { flex: 0.4, color: '#8892a4' }]}>{si + 1}</Text>
                                <Text style={[styles.setsDetailCell, { flex: 1, color: colorForLog }]}>{st.weight ? `${st.weight} kg` : '—'}</Text>
                                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                  <Text style={[styles.setsDetailCell, { flex: 1 }]}>{(log.exerciseType === 'duration' || log.isPlank) ? formatDurationClock(st.durationSeconds || st.reps) || '—' : (st.reps || '—')}</Text>
                                  {st.dropSet && <View style={styles.dsBadge}><Text style={styles.dsBadgeText}>DS · {(st.drops || []).length} drop{(st.drops || []).length === 1 ? '' : 's'}</Text></View>}
                                </View>
                              </View>
                              {st.dropSet && (st.drops || []).map((d, di) => (
                                <View key={di} style={styles.dropStageDetailRow}>
                                  <Text style={styles.dropStageArrow}>↓</Text>
                                  <Text style={styles.dropStageDetailText}>{d.weight || '—'} kg × {d.reps || '—'}</Text>
                                </View>
                              ))}
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        );
      })}
    </>
  );
}

// `sessionId`, when passed, scopes the list to just that session's logs —
// used while a session is actively in progress so an earlier session
// logged the same day never bleeds into the current one.
// When omitted (viewing a date with no active session), logs are grouped
// per-session with their own header so two sessions from the same day are
// never intertwined in the display.
function DayLoggedExercises({ date, workoutLogs, onUpdateWorkoutLog, onDeleteWorkoutLog, sessionId }) {
  const [editingId, setEditingId] = useState(null);

  const allLogsForDate = (workoutLogs || []).filter(
    l => l.date && String(l.date).slice(0, 10) === date
  );

  const logsForDate = sessionId
    ? allLogsForDate.filter(l => l.sessionId === sessionId)
    : allLogsForDate;

  if (!logsForDate.length) return null;

  const handleDelete = log => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${log.exerciseName}"?`)) onDeleteWorkoutLog(log.id);
    } else {
      Alert.alert('Delete Entry', `Delete "${log.exerciseName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteWorkoutLog(log.id) },
      ]);
    }
  };

  const handleSaveEdit = (log, updates) => {
    // Confirm before saving edit
    if (Platform.OS === 'web') {
      if (window.confirm('Save changes to this exercise?')) {
        onUpdateWorkoutLog(log.id, updates);
        setEditingId(null);
      }
    } else {
      Alert.alert('Save Changes', 'Save changes to this exercise?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => { onUpdateWorkoutLog(log.id, updates); setEditingId(null); } },
      ]);
    }
  };

  const handleDeleteSuperset = logs => {
    const label = `Superset (${logs.length} exercises)`;
    const doDelete = async () => {
      await database.deleteWorkoutLogsByIds(logs.map(l => l.id));
      logs.forEach(l => onDeleteWorkoutLog(l.id));
    };
    if (Platform.OS === 'web') { if (window.confirm(`Delete ${label}?`)) doDelete(); }
    else Alert.alert('Delete Superset', `Delete all ${logs.length} exercises in this superset?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  // When we're not scoped to a single session, split the day's logs by
  // sessionId so two sessions from the same day are shown as distinct
  // blocks instead of one merged list.
  const bySession = {};
  logsForDate.forEach(log => {
    const sid = sessionId || log.sessionId || '_unassigned';
    if (!bySession[sid]) bySession[sid] = [];
    bySession[sid].push(log);
  });
  const sessionGroups = Object.entries(bySession).sort((a, b) => {
    const aFirst = a[1][0]?.id || '';
    const bFirst = b[1][0]?.id || '';
    return String(aFirst).localeCompare(String(bFirst));
  });
  // Only show per-session headers (with a delete-this-session action) when
  // browsing a date rather than viewing the live in-progress session — the
  // active session already has its own header/delete controls above.
  const showSessionHeaders = !sessionId;

  const handleDeleteSessionGroup = (logs, label) => {
    const msg = `Delete "${label}"? This removes ${logs.length} exercise log(s) and cannot be undone.`;
    const doDelete = async () => {
      // Single atomic write instead of one delete call per exercise.
      await database.deleteWorkoutLogsByIds(logs.map(l => l.id));
      logs.forEach(l => onDeleteWorkoutLog(l.id));
    };
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete();
    } else {
      Alert.alert('Delete Session', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <View style={styles.dayLogsBlock}>
      <Text style={styles.dayLogsTitle}>📋 Logged for {formatDateLabel(date)}</Text>
      {sessionGroups.map(([sid, logs], gi) => {
        const label = logs[0]?.sessionName || `Session ${gi + 1}`;
        return (
        <View key={sid}>
          {showSessionHeaders && (
            <View style={styles.sessionGroupHeader}>
              <Text style={styles.sessionGroupHeaderText}>🏋️ {label}</Text>
              <Text style={styles.sessionGroupCount}>{logs.length} exercise{logs.length !== 1 ? 's' : ''}</Text>
              <TouchableOpacity
                style={styles.sessionGroupDeleteBtn}
                onPress={() => handleDeleteSessionGroup(logs, label)}
              >
                <Text style={styles.sessionGroupDeleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
          )}
          <MuscleGroupedLogs
            logs={logs}
            editingId={editingId}
            setEditingId={setEditingId}
            onSaveEdit={handleSaveEdit}
            onDelete={handleDelete}
            onDeleteSuperset={handleDeleteSuperset}
          />
        </View>
        );
      })}
    </View>
  );
}

// ─── Superset composer ─────────────────────────────────────────────────────────
// A Superset is composed before any member is persisted. Every card below is
// the same ExercisePanel used for normal exercise logging; it simply defers
// the final save until the user taps "Log Superset".
function DraftExercisePanel({ entry, index, onChange, commonProps, onChangeMuscle, customExercises = [] }) {
  const handleDraftChange = useCallback(draft => {
    onChange(entry.id, draft);
  }, [entry.id, onChange]);

  return (
    <View style={styles.supersetDraftCard}>
      <View style={styles.supersetExerciseNumber}>
        <Text style={styles.supersetExerciseNumberText}>Exercise {index + 1}</Text>
      </View>
      <ExercisePanel
        {...commonProps}
        muscle={entry.muscle}
        supersetMode
        deferSave
        initialDraft={entry.draft}
        onDraftChange={handleDraftChange}
        onChangeMuscle={muscle => onChangeMuscle(entry.id, muscle)}
        customExercises={customExercises}
      />
    </View>
  );
}

function SupersetComposer({ anchor, commonProps, onCancel, onFinish, customExercises, initialEntries, onPersist }) {
  const [entries, setEntries] = useState(Array.isArray(initialEntries) && initialEntries.length ? initialEntries : [{
    id: anchor.id,
    muscle: anchor.muscle,
    draft: anchor.draft,
  }] );

  const updateDraft = useCallback((id, draft) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, draft } : e));
  }, []);

  useEffect(() => { onPersist && onPersist(entries); }, [entries, onPersist]);

  const updateMuscle = useCallback((id, muscle) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, muscle, draft: { ...(e.draft || {}), muscleGroup: muscle } } : e));
  }, []);

  const addExercise = () => {
    if (entries.length >= 4) return;
    const id = `ss_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setEntries(prev => [...prev, { id, muscle: prev[0]?.muscle || MUSCLES[0], draft: null }]);
  };

  const removeExercise = id => {
    if (entries.length <= 2) return;
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const finish = () => {
    if (entries.length < 2 || entries.length > 4) {
      Alert.alert('Invalid Superset', 'A Superset must contain 2 to 4 exercises.');
      return;
    }
    const missing = entries.find(e => !e.draft?.exerciseName?.trim() || !Array.isArray(e.draft?.sets) || !e.draft.sets.length);
    if (missing) {
      Alert.alert('Incomplete Exercise', `Please complete Exercise ${entries.indexOf(missing) + 1} before logging the Superset.`);
      return;
    }
    onFinish(entries);
  };

  return (
    <View style={styles.supersetComposer}>
      <View style={styles.supersetHeaderCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.supersetHeaderTitle}>🔗 SUPERSET</Text>
          <Text style={styles.supersetHeaderSub}>2–4 exercises · logged together</Text>
        </View>
        <TouchableOpacity style={styles.supersetCancelBtn} onPress={onCancel}>
          <Text style={styles.supersetCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {entries.map((entry, index) => (
        <View key={entry.id}>
          <DraftExercisePanel
            entry={entry}
            index={index}
            onChange={updateDraft}
            commonProps={commonProps}
            onChangeMuscle={updateMuscle}
            customExercises={customExercises}
          />
          {index >= 1 && entries.length > 2 && (
            <TouchableOpacity style={styles.removeSupersetExerciseBtn} onPress={() => removeExercise(entry.id)}>
              <Text style={styles.removeSupersetExerciseText}>Remove Exercise {index + 1}</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {entries.length < 4 && (
        <TouchableOpacity style={styles.addSupersetExerciseBtn} onPress={addExercise}>
          <Text style={styles.addSupersetExerciseText}>+ Add Exercise ({entries.length}/4)</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.finishSupersetBtn} onPress={finish}>
        <Text style={styles.finishSupersetBtnText}>✓ Log Superset ({entries.length} exercises)</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── TAB 1: Log ───────────────────────────────────────────────────────────────

function LogTab({ workoutLogs, onAddWorkoutLog, onUpdateWorkoutLog, onDeleteWorkoutLog,
  selectedDate, setSelectedDate, selectedMuscles, setSelectedMuscles,
  sessionStarted, setSessionStarted, sessionId, setSessionId,
  sessionName, setSessionName, sessionStartTime, setSessionStartTime,
  supersetMode, setSupersetMode, supersetId, setSupersetId, supersetExercises, setSupersetExercises,
  customExercises = [], onCustomExerciseAdded, parentHydrated = true,
}) {
  // Removes one entry from the exercise catalog/dropdown only -- see
  // database.deleteExerciseFromLibrary for why this can never touch
  // workoutLogs. Reuses onCustomExerciseAdded (already the single source of
  // truth for customExercises state, set from the top-level Workouts
  // component) rather than introducing a second state-update path.
  const handleRemoveCustomExercise = useCallback((id) => {
    database.deleteExerciseFromLibrary(id)
      .then(rows => onCustomExerciseAdded && onCustomExerciseAdded(rows))
      .catch(() => {});
  }, [onCustomExerciseAdded]);
  const dayChips = getDayChips();
  const today    = localDate(0);

  const [nameDraft, setNameDraft] = useState('');
  const [supersetComposer, setSupersetComposer] = useState(null);
  const [exerciseDrafts, setExerciseDrafts] = useState({});
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const draftTimers = useRef({});
  const exerciseDraftsRef = useRef({});

  useEffect(() => {
    exerciseDraftsRef.current = exerciseDrafts;
  }, [exerciseDrafts]);

  useEffect(() => {
    // IMPORTANT: every screen navigation away from Workouts fully unmounts
    // this whole component tree (see App.js), so on every return trip this
    // effect starts from scratch with sessionId briefly `null` — before the
    // parent <Workouts> component has finished restoring the real active
    // session id from storage (that restore is async, see parentHydrated).
    //
    // If this effect were allowed to run its "no sessionId → nothing to
    // restore, mark hydrated" branch during that brief window, draftsHydrated
    // would wrongly flip true with an EMPTY draft store. That lets a blank
    // ExercisePanel mount for one render, which then immediately unmounts
    // again once the real sessionId arrives and this effect reruns — and
    // that unmount flushes the blank draft, silently overwriting the real
    // saved draft in storage a moment later (even though the UI itself goes
    // on to correctly show the restored data). Waiting for parentHydrated
    // removes that window entirely.
    if (!parentHydrated) return;

    let cancelled = false;
    setDraftsHydrated(false);
    setExerciseDrafts({});
    exerciseDraftsRef.current = {};

    (async () => {
      if (!sessionId) {
        if (!cancelled) setDraftsHydrated(true);
        return;
      }
      try {
        const saved = await database.getActiveWorkoutDrafts(sessionId);
        if (!cancelled) {
          const restored = saved || {};
          setExerciseDrafts(restored);
          exerciseDraftsRef.current = restored;
          const composer = restored.__superset__;
          if (composer?.entries?.length) {
            setSupersetComposer({ anchorMuscle: composer.anchorMuscle, anchor: composer.anchor, entries: composer.entries });
          }
          setDraftsHydrated(true);
        }
      } catch {
        if (!cancelled) setDraftsHydrated(true);
      }
    })();

    return () => { cancelled = true; };
  }, [sessionId, parentHydrated]);

  const persistDraft = useCallback((key, draft) => {
    const next = { ...(exerciseDraftsRef.current || {}), [key]: draft };
    exerciseDraftsRef.current = next;
    setExerciseDrafts(next);
    if (!sessionId) return;
    clearTimeout(draftTimers.current[key]);
    draftTimers.current[key] = setTimeout(() => {
      database.saveActiveWorkoutDraft(sessionId, key, draft).catch(() => {});
    }, 350);
  }, [sessionId]);

  const clearDraft = useCallback((key) => {
    const next = { ...(exerciseDraftsRef.current || {}) };
    delete next[key];
    exerciseDraftsRef.current = next;
    setExerciseDrafts(next);
    if (sessionId) database.clearActiveWorkoutDraft(sessionId, key).catch(() => {});
  }, [sessionId]);

  // One outer execution order is shared by every member of a Superset.
  // Normal exercises receive the next order when they are logged. This is
  // deliberately separate from supersetOrder, which describes the order
  // inside the Superset itself.
  const sessionExecutionOrderRef = useRef(0);
  useEffect(() => {
    const sameSession = (workoutLogs || []).filter(l => !sessionId || l.sessionId === sessionId);
    sessionExecutionOrderRef.current = sameSession.reduce((max, l) => Math.max(max, Number(l.sessionExerciseOrder) || 0), 0);
  }, [sessionId, workoutLogs]);

  const addWorkoutLogWithOrder = useCallback(async payload => {
    let outerOrder = Number(payload.sessionExerciseOrder) || 0;
    if (!outerOrder) {
      outerOrder = ++sessionExecutionOrderRef.current;
    }
    return onAddWorkoutLog({ ...payload, sessionExerciseOrder: outerOrder });
  }, [onAddWorkoutLog]);

  // Flush drafts immediately when the app backgrounds or this screen unmounts.
  useEffect(() => {
    const flush = () => {
      if (!sessionId) return;
      Object.entries(exerciseDraftsRef.current || {}).forEach(([key, draft]) => {
        database.saveActiveWorkoutDraft(sessionId, key, draft).catch(() => {});
      });
    };
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') flush();
    });
    return () => {
      sub?.remove?.();
      flush();
      Object.values(draftTimers.current).forEach(clearTimeout);
    };
  }, [sessionId]);

  // Ticks every 30s while a session is running so the on-screen timer and
  // the auto-end check both stay live without needing any other state to
  // change (previously this only recomputed on unrelated re-renders).
  const [nowTick, setNowTick] = useState(Date.now());
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => sub?.remove?.();
  }, []);
  useEffect(() => {
    if (!sessionStarted || !appActive) return;
    const interval = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(interval);
  }, [sessionStarted, appActive]);

  const toggleMuscle = m =>
    setSelectedMuscles(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const startSession = () => {
    if (!selectedMuscles.length) return;
    const sid = `session_${Date.now()}`;
    endedSessionIdsRef.current.delete(sid);
    const finalName = nameDraft.trim() || selectedMuscles.join(', ');
    database.saveWorkoutSession({ sessionId: sid, status: 'active', sessionName: finalName, selectedDate, selectedMuscles, sessionStartTime: Date.now() }).catch(() => {});
    if (setSessionId) setSessionId(sid);
    if (setSessionName) setSessionName(finalName);
    setSessionStarted(true);
    setSessionStartTime(Date.now());
    setSupersetComposer(null);
    setSupersetMode(false);
    setSupersetId(null);
    setSupersetExercises([]);
    setNameDraft('');
  };

  // Shared session-close logic. `auto` skips the confirmation dialog since
  // it's triggered automatically once the max duration is hit.
  const endSession = async (reason = 'manually_ended') => {
    if (sessionId) {
      try {
        await database.updateWorkoutSession(sessionId, { status: reason, endedAt: Date.now(), sessionName, selectedDate, selectedMuscles });
      } catch {}
      try { await database.clearActiveWorkoutDraft(sessionId); } catch {}
      try { await database.clearActiveWorkoutSession(); } catch {}
      // Prevent a stale async status read from briefly making an ended session
      // appear continuable again.
      endedSessionIdsRef.current.add(sessionId);
      setLastSessionStatus(reason);
    }
    setSessionStarted(false);
    setSelectedMuscles([]);
    setSessionStartTime(null);
    setSessionName && setSessionName('');
    if (setSessionId) setSessionId(null);
    setSupersetId(null);
    setSupersetExercises([]);
    setSupersetMode(false);
    setSupersetComposer(null);
  };

  // Close session with confirmation
  const handleCloseSession = () => {
    const elapsed = sessionStartTime ? Math.round((nowTick - sessionStartTime) / 60000) : null;
    const timeMsg = elapsed !== null ? ` Session duration: ${elapsed} min.` : '';
    const msg = `End "${sessionName || 'this session'}"?${timeMsg}`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) endSession();
    } else {
      Alert.alert('End Session', msg, [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'End Session', style: 'destructive', onPress: endSession },
      ]);
    }
  };

  // Session duration: warn at 2.5h, auto-end at 3h.
  const sessionMinutes  = sessionStartTime ? Math.round((nowTick - sessionStartTime) / 60000) : 0;
  const showTimeWarning = sessionStarted && sessionMinutes >= SESSION_WARN_MIN;

  // Auto-end once the hard duration cap is hit, in case the user forgot.
  useEffect(() => {
    if (sessionStarted && sessionMinutes >= SESSION_MAX_MIN) {
      showToast(`"${sessionName || 'Session'}" auto-ended after ${(SESSION_MAX_MIN / 60).toFixed(1)} hours.`, 'info');
      endSession('auto_ended');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMinutes, sessionStarted]);

  // Delete only THIS session's logs (scoped by sessionId), then reset.
  // Uses one atomic bulk write so the whole session disappears in a single
  // action instead of being removed exercise-by-exercise.
  const handleDeleteSession = () => {
    const logsToDelete = (workoutLogs || []).filter(l =>
      sessionId ? l.sessionId === sessionId : (l.date && String(l.date).slice(0, 10) === selectedDate)
    );
    if (!logsToDelete.length) { endSession(); return; }
    const doDelete = async () => {
      await database.deleteWorkoutLogsByIds(logsToDelete.map(l => l.id));
      logsToDelete.forEach(l => onDeleteWorkoutLog(l.id));
      endSession();
    };
    const msg = `Delete "${sessionName || 'this session'}"? This removes ${logsToDelete.length} exercise log(s) and cannot be undone.`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) doDelete();
    } else {
      Alert.alert('Delete Session', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const muscleRows = [];
  for (let i = 0; i < MUSCLES.length; i += 2) muscleRows.push(MUSCLES.slice(i, i + 2));

  // ── Today's session tracking ─────────────────────────────────────────────
  const todayLogs    = (workoutLogs || []).filter(l => l.date && String(l.date).slice(0, 10) === today);
  const sessionActive = selectedDate === today && todayLogs.length > 0;

  // Count distinct sessions today by sessionId field (if present), else by unique muscle combos
  const todaySessionIds = new Set(todayLogs.map(l => l.sessionId).filter(Boolean));
  const todaySessionCount = todaySessionIds.size || (todayLogs.length > 0 ? 1 : 0);
  const maxSessionsReached = selectedDate === today && todaySessionCount >= 2 && !sessionStarted;

  // The most recently logged session today — "Continue" resumes only this
  // one, so it never merges muscles/exercises from an earlier, different
  // session logged the same day.
  const lastTodayLog = [...todayLogs].sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  const lastSessionId = lastTodayLog?.sessionId || null;
  const lastSessionLogs = lastSessionId
    ? todayLogs.filter(l => l.sessionId === lastSessionId)
    : todayLogs;
  const lastSessionMuscles = [...new Set(lastSessionLogs.map(l => l.muscleGroup).filter(Boolean))];
  const lastSessionName = lastTodayLog?.sessionName || lastSessionMuscles.join(', ');
  const [lastSessionStatus, setLastSessionStatus] = useState('completed');
  const endedSessionIdsRef = useRef(new Set());
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await database.getWorkoutSessionStatus(lastSessionId);
      if (!cancelled && !endedSessionIdsRef.current.has(lastSessionId)) setLastSessionStatus(status);
    })();
    return () => { cancelled = true; };
  }, [lastSessionId, workoutLogs]);

  const handleContinueSession = async () => {
    if (!lastSessionMuscles.length || lastSessionStatus !== 'active') return;
    const sessionMeta = (await database.getWorkoutSessions())[lastSessionId] || {};
    if (sessionMeta.status && sessionMeta.status !== 'active') return;
    setSelectedMuscles(lastSessionMuscles);
    if (setSessionId) setSessionId(lastSessionId || `session_${Date.now()}`);
    if (setSessionName) setSessionName(lastSessionName);
    setSessionStarted(true);
    setSessionStartTime(sessionMeta.sessionStartTime || Date.now());
    setSupersetMode(false);
    setSupersetId(null);
    setSupersetExercises([]);
    setSupersetComposer(null);
  };

  const persistSupersetDraft = useCallback((entries) => {
    if (!supersetComposer) return;
    persistDraft('__superset__', {
      anchorMuscle: supersetComposer.anchorMuscle,
      anchor: supersetComposer.anchor,
      entries,
    });
  }, [persistDraft, supersetComposer?.anchorMuscle, supersetComposer?.anchor]);

  const kbPadding = useKeyboardPadding(48, 40);

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={[styles.tabContentInner, { paddingBottom: kbPadding }]} keyboardShouldPersistTaps="always" automaticallyAdjustKeyboardInsets>
      {!sessionStarted ? (
        <>
          <Text style={styles.sectionLabel}>Select Date</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dayChipRow}>
            {dayChips.map(chip => (
              <TouchableOpacity
                key={chip.dateStr}
                style={[styles.dayChip, selectedDate === chip.dateStr && styles.dayChipActive]}
                onPress={() => setSelectedDate(chip.dateStr)}
              >
                <Text style={[styles.dayChipDay, selectedDate === chip.dateStr && styles.dayChipTextActive]}>
                  {chip.dayName}
                </Text>
                <Text style={[styles.dayChipNum, selectedDate === chip.dateStr && styles.dayChipTextActive]}>
                  {chip.dayNum}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── Logged exercises for the selected date ── */}
          <DayLoggedExercises
            date={selectedDate}
            workoutLogs={workoutLogs}
            onUpdateWorkoutLog={onUpdateWorkoutLog}
            onDeleteWorkoutLog={onDeleteWorkoutLog}
          />

          {/* ── Continue Today's Session (resumes only the latest session) ── */}
          {sessionActive && lastSessionMuscles.length > 0 && lastSessionStatus === 'active' && (
            <TouchableOpacity style={styles.continueSessionBtn} onPress={handleContinueSession}>
              <Text style={styles.continueSessionBtnText}>
                ▶ Continue "{lastSessionName}"
              </Text>
            </TouchableOpacity>
          )}

          {/* ── 2-session daily limit warning ── */}
          {maxSessionsReached && (
            <View style={styles.sessionLimitBanner}>
              <Text style={styles.sessionLimitText}>
                ⚠️ You've already completed 2 sessions today — great work! Rest is recovery too.
              </Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>
            {selectedDate === today ? 'Start New Session' : `Log for ${formatDateLabel(selectedDate)}`}
          </Text>
          {muscleRows.map((row, ri) => (
            <View key={ri} style={styles.muscleRow}>
              {row.map(m => {
                const selected = selectedMuscles.includes(m);
                const color    = MUSCLE_COLOR[m];
                return (
                  <TouchableOpacity
                    key={m}
                    style={[
                      styles.muscleChip,
                      { borderColor: selected ? color : C.border },
                      selected && { backgroundColor: color + '22' },
                    ]}
                    onPress={() => toggleMuscle(m)}
                  >
                    <View style={[styles.muscleColorDot, { backgroundColor: color }]} />
                    <Text style={[styles.muscleChipText, selected && { color }]}>{m}</Text>
                    {selected && <Text style={[styles.checkMark, { color }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
              {row.length === 1 && <View style={styles.muscleChipPlaceholder} />}
            </View>
          ))}

          {selectedMuscles.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Session Name</Text>
              <ClearableTextInput
                style={styles.sessionNameInput}
                placeholder={`e.g. "${selectedMuscles.join(' & ')} Day" (optional)`}
                placeholderTextColor={C.muted2}
                value={nameDraft}
                onChangeText={setNameDraft}
                maxLength={40}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.startSessionBtn, !selectedMuscles.length && styles.startSessionBtnDisabled]}
            onPress={startSession}
            disabled={!selectedMuscles.length}
          >
            <Text style={styles.startSessionBtnText}>
              {selectedMuscles.length === 0
                ? 'Select muscles to start'
                : `Start Session · ${formatDateLabel(selectedDate)}`}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.sessionHeaderRow}>
            <View>
              <Text style={styles.sessionNameText}>🏋️ {sessionName || 'Workout Session'}</Text>
              <Text style={styles.sessionDateText}>📅 {formatDateLabel(selectedDate)}</Text>
              {sessionStartTime != null && (
                <Text style={[styles.sessionTimer, showTimeWarning && styles.sessionTimerWarn]}>
                  {showTimeWarning ? '⚠️ ' : '⏱ '}{sessionMinutes} min{showTimeWarning ? ' — wrap up soon!' : ''}
                </Text>
              )}
            </View>
            <View style={styles.sessionHeaderActions}>
              <TouchableOpacity onPress={handleDeleteSession} style={styles.deleteSessionBtn}>
                <Text style={styles.deleteSessionBtnText}>🗑️ Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCloseSession} style={styles.resetBtn}>
                <Text style={styles.resetBtnText}>✓ End Session</Text>
              </TouchableOpacity>
            </View>
          </View>
          {showTimeWarning && (
            <View style={styles.sessionTimerBanner}>
              <Text style={styles.sessionTimerBannerText}>
                🕒 {sessionMinutes} minutes in — ideal session is 2.5–3 hours. Wrap up when ready!
              </Text>
            </View>
          )}
          {/* Logged so far THIS session only — an earlier session logged
              the same day is never mixed in here. */}
          <DayLoggedExercises
            date={selectedDate}
            workoutLogs={workoutLogs}
            onUpdateWorkoutLog={onUpdateWorkoutLog}
            onDeleteWorkoutLog={onDeleteWorkoutLog}
            sessionId={sessionId}
          />
          {!draftsHydrated ? (
            <View style={styles.draftRestoreBanner}><Text style={styles.draftRestoreText}>Restoring your current exercise…</Text></View>
          ) : selectedMuscles.map(muscle => {
            if (supersetComposer && supersetComposer.anchorMuscle === muscle) {
              return (
                <SupersetComposer
                  key={`superset-${muscle}`}
                  anchor={supersetComposer.anchor}
                  initialEntries={supersetComposer.entries}
                  customExercises={customExercises}
                  commonProps={{ selectedDate, sessionId, sessionName, onAddWorkoutLog: addWorkoutLogWithOrder, onRemoveCustomExercise: handleRemoveCustomExercise }}
                  onPersist={persistSupersetDraft}
                  onCancel={() => { setSupersetComposer(null); clearDraft('__superset__'); }}
                  onFinish={async entries => {
                    const sid = `superset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    const outerOrder = ++sessionExecutionOrderRef.current;
                    for (let i = 0; i < entries.length; i++) {
                      const d = entries[i].draft;
                      await addWorkoutLogWithOrder({ ...d, sessionId, sessionName, date: selectedDate, isSuperset: true, supersetId: sid, supersetOrder: i + 1, sessionExerciseOrder: outerOrder });
                      if (d?.exerciseName) database.addExerciseToLibrary({ name: d.exerciseName, muscleGroup: d.muscleGroup, exerciseType: d.exerciseType }).then(rows => onCustomExerciseAdded && onCustomExerciseAdded(rows)).catch(() => {});
                    }
                    setSupersetComposer(null);
                    clearDraft('__superset__');
                    showToast(`Superset logged with ${entries.length} exercises.`, 'success');
                  }}
                />
              );
            }
            return (
              <ExercisePanel
                key={muscle}
                muscle={muscle}
                selectedDate={selectedDate}
                sessionId={sessionId}
                sessionName={sessionName}
                onAddWorkoutLog={addWorkoutLogWithOrder}
                customExercises={customExercises}
                onRemoveCustomExercise={handleRemoveCustomExercise}
                initialDraft={exerciseDrafts[muscle] || null}
                onDraftChange={draft => persistDraft(muscle, draft)}
                draftKey={muscle}
                onClearDraft={() => clearDraft(muscle)}
                onPersistDraft={exercise => {
                  database.addExerciseToLibrary(exercise).then(rows => onCustomExerciseAdded && onCustomExerciseAdded(rows)).catch(() => {});
                }}
                onRequestSuperset={draft => setSupersetComposer({
                  anchorMuscle: muscle,
                  anchor: { id: `ss_anchor_${Date.now()}`, muscle, draft },
                })}
              />
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

// ─── TAB 2: Records ───────────────────────────────────────────────────────────

function RecordsTab({ workoutLogs }) {
  const [section,         setSection]         = useState('top10');
  const [expandedMuscles, setExpandedMuscles] = useState({});
  const [expandedPB,      setExpandedPB]      = useState(null);

  const toggleMuscle = m => setExpandedMuscles(prev => ({ ...prev, [m]: !prev[m] }));

  // Build top 10 all-time — store full session sets for the PB session
  const bestByExercise = {};
  (workoutLogs || []).filter(log => log.isSuperset !== true).forEach(log => {
    const sets = safeSets(log.sets, log);
    const maxW = sets.length ? Math.max(...sets.map(s => parseFloat(s.weight) || 0)) : 0;
    const key  = log.exerciseName || 'Unknown';
    if (maxW > 0 && (!bestByExercise[key] || maxW > (bestByExercise[key].maxWeight || 0))) {
      bestByExercise[key] = {
        exercise:  key,
        muscle:    log.muscleGroup || '',
        maxWeight: maxW,
        date:      log.date,
        sets,
      };
    }
  });

  const top10 = Object.values(bestByExercise)
    .sort((a, b) => (b.maxWeight || 0) - (a.maxWeight || 0))
    .slice(0, 10);

  // Build muscle group history — safe set parsing with legacy fallback
  const muscleHistory = {};
  MUSCLES.forEach(m => { muscleHistory[m] = {}; });
  (workoutLogs || []).forEach(log => {
    const m = log.muscleGroup || 'Core';
    if (!muscleHistory[m]) muscleHistory[m] = {};
    const ex    = log.exerciseName || 'Unknown';
    const sets  = safeSets(log.sets, log);
    // The session's "best" must come from ONE set — otherwise weight and
    // reps end up paired from two different sets (e.g. showing 70kg from
    // one set and 10 reps from a lighter set that never actually happened
    // together). Pick the heaviest set; tie-break on more reps.
    const bestSet = sets.length
      ? sets.reduce((best, s) => {
          const w  = parseFloat(s.weight) || 0;
          const bw = parseFloat(best?.weight) || 0;
          if (w > bw) return s;
          if (w === bw && (parseInt(s.reps, 10) || 0) > (parseInt(best?.reps, 10) || 0)) return s;
          return best;
        }, sets[0])
      : null;
    const bestWeight = bestSet ? (parseFloat(bestSet.weight) || 0) : 0;
    const bestReps   = bestSet ? (parseInt(bestSet.reps, 10) || 0) : 0;
    if (!muscleHistory[m][ex]) muscleHistory[m][ex] = [];
    muscleHistory[m][ex].push({
      id: log.id,
      date: log.date,
      bestWeight,
      bestReps,
      setsCount: sets.length,
      sets,
      isSuperset: log.isSuperset === true,
      supersetId: log.supersetId || null,
      exerciseType: log.exerciseType || (log.isPlank ? 'duration' : 'reps'),
    });
  });

  MUSCLES.forEach(m => {
    Object.keys(muscleHistory[m]).forEach(ex => {
      muscleHistory[m][ex].sort((a, b) => { const byDate = String(b.date).localeCompare(String(a.date)); return byDate || String(b.id || '').localeCompare(String(a.id || '')); });
    });
  });

  // Number exercises by the order in which they first appeared/performed
  // inside each muscle group. This is independent of the muscle hierarchy.
  // Must iterate oldest-first — workoutLogs is newest-first, and iterating
  // it directly gave "first seen in the array" order (i.e. most-recent
  // session order) rather than true chronological first-appearance order.
  const exerciseOrderByMuscle = {};
  MUSCLES.forEach(m => { exerciseOrderByMuscle[m] = {}; });
  [...(workoutLogs || [])]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id || '').localeCompare(String(b.id || '')))
    .forEach(log => {
      const m = log.muscleGroup || 'Core';
      const ex = log.exerciseName || 'Unknown';
      if (!exerciseOrderByMuscle[m]) exerciseOrderByMuscle[m] = {};
      if (exerciseOrderByMuscle[m][ex] === undefined) {
        exerciseOrderByMuscle[m][ex] = Object.keys(exerciseOrderByMuscle[m]).length + 1;
      }
    });

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={styles.tabContentInner}>
      <View style={styles.recordsSectionToggle}>
        <TouchableOpacity
          style={[styles.recordsSectionBtn, section === 'top10' && styles.recordsSectionBtnActive]}
          onPress={() => setSection('top10')}
        >
          <Text style={[styles.recordsSectionBtnText, section === 'top10' && styles.recordsSectionBtnTextActive]}>
            🏆 Top 10 All-Time
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.recordsSectionBtn, section === 'history' && styles.recordsSectionBtnActive]}
          onPress={() => setSection('history')}
        >
          <Text style={[styles.recordsSectionBtnText, section === 'history' && styles.recordsSectionBtnTextActive]}>
            📈 Muscle History
          </Text>
        </TouchableOpacity>
      </View>

      {section === 'top10' && (
        <View>
          {top10.length === 0 && (
            <View style={styles.card}>
              <Text style={styles.emptyText}>No records yet. Start logging!</Text>
            </View>
          )}
          {top10.map((rec, idx) => {
            const color  = MUSCLE_COLOR[rec.muscle] || C.primary;
            const isOpen = expandedPB === rec.exercise;
            const totalVol = rec.sets.reduce((a, s) =>
              a + (parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0), 0);
            return (
              <TouchableOpacity
                key={rec.exercise + idx}
                style={[styles.pbCard, { borderLeftColor: color }]}
                onPress={() => setExpandedPB(isOpen ? null : rec.exercise)}
                activeOpacity={0.85}
              >
                <View style={styles.pbCardHeader}>
                  <View style={styles.pbCardRankBadge}>
                    <Text style={styles.pbCardRank}>#{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pbCardExercise} numberOfLines={1}>{rec.exercise}</Text>
                    <Text style={styles.pbCardMeta}>{rec.muscle}  ·  {rec.date}</Text>
                  </View>
                  <View style={styles.pbCardBestChip}>
                    <Text style={[styles.pbCardBestWeight, { color }]}>{rec.maxWeight}kg</Text>
                    <Text style={styles.pbCardBestLabel}>best</Text>
                  </View>
                  <Text style={styles.pbCardChevron}>{isOpen ? '▲' : '▼'}</Text>
                </View>
                {isOpen && (
                  <View style={styles.pbCardSetsBlock}>
                    <Text style={styles.pbCardSetsTitle}>🏆 Personal Best Session — All Sets</Text>
                    <View style={styles.pbCardSetsHeader}>
                      <Text style={[styles.pbCardSetCell, { flex: 0.5 }]}>Set</Text>
                      <Text style={[styles.pbCardSetCell, { flex: 1 }]}>Weight</Text>
                      <Text style={[styles.pbCardSetCell, { flex: 1 }]}>Reps</Text>
                    </View>
                    {rec.sets.map((s, si) => (
                      <View key={si}>
                        <View style={[styles.pbCardSetRow, si % 2 === 1 && styles.pbCardSetRowAlt]}>
                          <Text style={[styles.pbCardSetData, { flex: 0.5, color: C.muted }]}>{si + 1}</Text>
                          <Text style={[styles.pbCardSetData, { flex: 1, color, fontWeight: '700' }]}>
                            {s.weight ? `${s.weight}kg` : '—'}
                          </Text>
                          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={[styles.pbCardSetData, { color: C.muted }]}>{s.reps || '—'}</Text>
                            {s.dropSet && <View style={styles.dsBadge}><Text style={styles.dsBadgeText}>DS · {(s.drops || []).length} drop{(s.drops || []).length === 1 ? '' : 's'}</Text></View>}
                          </View>
                        </View>
                        {s.dropSet && (s.drops || []).map((d, di) => (
                          <View key={di} style={styles.dropStageDetailRow}>
                            <Text style={styles.dropStageArrow}>↓</Text>
                            <Text style={styles.dropStageDetailText}>{d.weight || '—'} kg × {d.reps || '—'}</Text>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {section === 'history' && (
        <View>
          {MUSCLES.map(muscle => {
            const color     = MUSCLE_COLOR[muscle];
            const exercises = muscleHistory[muscle] || {};
            const exNames   = Object.keys(exercises).sort((a, b) => (exerciseOrderByMuscle[muscle]?.[a] || 9999) - (exerciseOrderByMuscle[muscle]?.[b] || 9999));
            const expanded  = expandedMuscles[muscle];
            return (
              <View key={muscle} style={styles.accordionGroup}>
                <TouchableOpacity
                  style={[styles.accordionHeader, { borderLeftColor: color }]}
                  onPress={() => toggleMuscle(muscle)}
                >
                  <View style={[styles.muscleColorDot, { backgroundColor: color, marginRight: 10 }]} />
                  <Text style={[styles.accordionHeaderText, { color }]}>{muscle}</Text>
                  <Text style={styles.accordionCount}>{exNames.length} exercise{exNames.length !== 1 ? 's' : ''}</Text>
                  <Text style={[styles.accordionChevron, { color }]}>{expanded ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {expanded && (
                  <View style={styles.accordionBody}>
                    {exNames.length === 0 && <Text style={styles.emptyText}>No data yet.</Text>}
                    {exNames.map((ex, exIdx) => {
                      const history  = exercises[ex];
                      const normalHistory = history.filter(h => !h.isSuperset);
                      const pbWeight = Math.max(...normalHistory.map(h => h.bestWeight), 0);
                      const pbEntry  = normalHistory.find(h => h.bestWeight === pbWeight);
                      // Reps must come from the SAME session/set that hit
                      // pbWeight — not the highest rep count ever logged,
                      // which could be from an entirely different (lighter) set.
                      const pbReps   = pbEntry ? pbEntry.bestReps : 0;
                      const last5    = history.slice(0, 5);
                      const chartBars= last5.slice().reverse();
                      const maxW     = Math.max(...chartBars.map(h => h.bestWeight), 1);
                      return (
                        <View key={ex} style={styles.exHistBlock}>
                          {/* ── Exercise header strip ── */}
                          <View style={[styles.exHistHeader, { borderLeftColor: color }]}>
                            <View style={[styles.exHistNumBadge, { backgroundColor: color + '33', borderColor: color + '66' }]}>
                              <Text style={[styles.exHistNum, { color }]}>{exerciseOrderByMuscle[muscle]?.[ex] || exIdx + 1}</Text>
                            </View>
                            <Text style={styles.exHistName}>{ex}</Text>
                            <View style={[styles.exHistSessionBadge, { backgroundColor: color + '22' }]}>
                              <Text style={[styles.exHistSessionCount, { color }]}>{history.length} session{history.length !== 1 ? 's' : ''}</Text>
                            </View>
                          </View>

                          {/* ── Personal Best ── */}
                          {pbWeight > 0 && pbEntry && (
                            <View style={[styles.exHistPBCard, { borderLeftColor: '#f59e0b' }]}>
                              <View style={styles.exHistPBTopRow}>
                                <Text style={styles.exHistPBTitle}>🏆 Personal Best</Text>
                                <Text style={styles.exHistPBDate}>{pbEntry.date}</Text>
                              </View>
                              <View style={styles.exHistPBStats}>
                                <View style={[styles.exHistPBChip, { borderColor: color + '55', backgroundColor: color + '15' }]}>
                                  <Text style={[styles.exHistPBVal, { color }]}>{pbWeight}kg</Text>
                                  <Text style={styles.exHistPBLbl}>Best Wt</Text>
                                </View>
                                {pbReps > 0 && (
                                  <View style={[styles.exHistPBChip, { borderColor: color + '55', backgroundColor: color + '15' }]}>
                                    <Text style={[styles.exHistPBVal, { color }]}>{pbReps}</Text>
                                    <Text style={styles.exHistPBLbl}>Best Reps</Text>
                                  </View>
                                )}
                                <View style={[styles.exHistPBChip, { borderColor: color + '55', backgroundColor: color + '15' }]}>
                                  <Text style={[styles.exHistPBVal, { color }]}>{pbEntry.setsCount}</Text>
                                  <Text style={styles.exHistPBLbl}>Sets</Text>
                                </View>
                              </View>
                              {/* All sets from PB session */}
                              <View style={styles.exHistPBSetsBox}>
                                <Text style={styles.exHistPBSetsLabel}>Sets from PB session</Text>
                                <View style={styles.exHistPBSetsHdr}>
                                  <Text style={[styles.exHistPBSetCell, { flex: 0.5 }]}>#</Text>
                                  <Text style={[styles.exHistPBSetCell, { flex: 1 }]}>Weight</Text>
                                  <Text style={[styles.exHistPBSetCell, { flex: 1 }]}>{pbEntry?.exerciseType === 'duration' ? 'Time' : 'Reps'}</Text>
                                </View>
                                {pbEntry.sets.map((s, si) => (
                                  <View key={si}>
                                    <View style={[styles.exHistPBSetRow, si % 2 === 1 && styles.exHistPBSetRowAlt]}>
                                      <Text style={[styles.exHistPBSetData, { flex: 0.5, color: C.muted }]}>{si + 1}</Text>
                                      <Text style={[styles.exHistPBSetData, { flex: 1, color, fontWeight: '800' }]}>{s.weight ? `${s.weight}kg` : '—'}</Text>
                                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                        <Text style={styles.exHistPBSetData}>{pbEntry?.exerciseType === 'duration' ? formatDurationClock(s.durationSeconds || s.reps) || '—' : (s.reps || '—')}</Text>
                                        {s.dropSet && <View style={styles.dsBadge}><Text style={styles.dsBadgeText}>DS · {(s.drops || []).length} drop{(s.drops || []).length === 1 ? '' : 's'}</Text></View>}
                                      </View>
                                    </View>
                                    {s.dropSet && (s.drops || []).map((d, di) => (
                                      <View key={di} style={styles.dropStageDetailRow}>
                                        <Text style={styles.dropStageArrow}>↓</Text>
                                        <Text style={styles.dropStageDetailText}>{d.weight || '—'} kg × {d.reps || '—'}</Text>
                                      </View>
                                    ))}
                                  </View>
                                ))}
                              </View>
                            </View>
                          )}

                          {/* ── Last 5 sessions ── */}
                          <Text style={styles.exHistSessionsLabel}>Last {last5.length} Sessions</Text>
                          {last5.map((h, hi) => {
                            const bestSet = h.sets && h.sets.length
                              ? h.sets.reduce((best, s) =>
                                  (parseFloat(s.weight) || 0) > (parseFloat(best?.weight) || 0) ? s : best,
                                  h.sets[0])
                              : null;
                            const isPB = h.bestWeight === pbWeight && pbWeight > 0;
                            return (
                              <View key={hi} style={[styles.exHistSessionRow, isPB && styles.exHistSessionRowPB]}>
                                <View style={styles.exHistSessionLeft}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Text style={styles.exHistSessionDate}>{h.date}</Text>
                                    {h.isSuperset && <Text style={styles.supersetHistoryBadge}>🔗 Superset</Text>}
                                  </View>
                                  {bestSet && (
                                    <Text style={styles.exHistSessionBestSet}>
                                      best:{' '}
                                      <Text style={{ color, fontWeight: '700' }}>{bestSet.weight ? `${bestSet.weight}kg` : '—'}</Text>
                                      {' × '}{h.exerciseType === 'duration' ? (formatDurationClock(bestSet.durationSeconds || bestSet.reps) || '—') : (bestSet.reps || '—')}
                                      {bestSet.dropSet ? <Text style={{ color: '#f59e0b' }}> 🔶</Text> : null}
                                    </Text>
                                  )}
                                </View>
                                <View style={styles.exHistSessionRight}>
                                  <Text style={[styles.exHistSessionBestWt, { color }]}>{h.bestWeight > 0 ? `${h.bestWeight}kg` : '—'}</Text>
                                  <Text style={styles.exHistSessionMeta}>{h.setsCount} sets</Text>
                                </View>
                                {isPB && <Text style={styles.exHistPBStar}>★</Text>}
                              </View>
                            );
                          })}

                          {/* ── Progressive line chart ── */}
                          <ExerciseProgression logs={workoutLogs} exerciseName={ex} />
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

function InlineEditForm({ log, onSave, onCancel }) {
  const [exerciseName, setExerciseName] = useState(log.exerciseName || '');
  const allowDuration = log.muscleGroup === 'Core';
  const [exerciseType, setExerciseType] = useState(allowDuration ? (log.exerciseType || (log.isPlank ? 'duration' : 'reps')) : (log.exerciseType === 'duration' ? 'duration' : 'reps'));
  const [sets, setSets] = useState(safeSets(log.sets, log));
  const isPlank = exerciseType === 'duration';

  const addSet    = () => setSets(prev => [...prev, { reps: '', durationSeconds: '', weight: '', dropSet: false, drops: [] }]);
  const removeSet = idx => setSets(prev => prev.filter((_, i) => i !== idx));
  const updateSet = (idx, field, value) =>
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  const toggleDropSet = idx =>
    setSets(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const turningOn = !s.dropSet;
      return {
        ...s,
        dropSet: turningOn,
        // Seed with one empty drop stage when enabling, so "Drop 1" is
        // immediately visible/ready to fill in. Clear drops when disabling
        // so re-enabling later starts fresh rather than showing stale values.
        drops: turningOn ? (s.drops?.length ? s.drops : [{ reps: '', weight: '' }]) : [],
      };
    }));
  const addDrop = idx =>
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, drops: [...(s.drops || []), { reps: '', weight: '' }] } : s));
  const removeDrop = (idx, dropIdx) =>
    setSets(prev => prev.map((s, i) => i === idx ? { ...s, drops: (s.drops || []).filter((_, di) => di !== dropIdx) } : s));
  const updateDrop = (idx, dropIdx, field, value) =>
    setSets(prev => prev.map((s, i) => i === idx
      ? { ...s, drops: (s.drops || []).map((d, di) => di === dropIdx ? { ...d, [field]: value } : d) }
      : s));

  const handleSave = () => {
    if (!exerciseName.trim()) { Alert.alert('Missing Exercise', 'Please enter an exercise name.'); return; }
    if (!sets.length) { Alert.alert('No Sets', 'Please keep at least one set.'); return; }
    onSave({
      exerciseName: exerciseName.trim(),
      muscleGroup:  log.muscleGroup,
      exerciseType,
      isPlank: exerciseType === 'duration',
      sets:         sets.map(s => ({ reps: exerciseType === 'reps' ? s.reps : '', durationSeconds: exerciseType === 'duration' ? (s.durationSeconds ?? s.reps ?? '') : '', weight: s.weight, dropSet: !!s.dropSet, drops: s.drops || [] })),
    });
  };

  const color = MUSCLE_COLOR[log.muscleGroup] || C.primary;

  return (
    <View style={[styles.editForm, { borderLeftColor: color }]}>
      <ClearableTextInput
        style={styles.editExerciseInput}
        value={exerciseName}
        onChangeText={setExerciseName}
        placeholder="Exercise name"
        placeholderTextColor={C.muted2}
      />
      {allowDuration ? (
        <View style={styles.exerciseTypeRow}>
          <Text style={styles.exerciseTypeLabel}>Exercise Type</Text>
          <View style={styles.exerciseTypeButtons}>
            {['reps', 'duration'].map(type => (
              <TouchableOpacity key={type} style={[styles.exerciseTypeBtn, exerciseType === type && styles.exerciseTypeBtnActive]} onPress={() => {
                setExerciseType(type);
                setSets(prev => prev.map(s => type === 'reps'
                  ? { ...s, durationSeconds: '', reps: s.reps || s.durationSeconds || '' }
                  : { ...s, reps: '', durationSeconds: s.durationSeconds || s.reps || '' }));
              }}>
                <Text style={[styles.exerciseTypeBtnText, exerciseType === type && styles.exerciseTypeBtnTextActive]}>{type === 'reps' ? 'Reps' : 'Duration'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.setTableHeader}>
        <Text style={[styles.setHeaderCell, { flex: 0.4 }]}>Set</Text>
        <Text style={[styles.setHeaderCell, { flex: 1 }]}>Weight (kg)</Text>
        <Text style={[styles.setHeaderCell, { flex: 1 }]}>{isPlank ? 'Duration (mm:ss)' : 'Reps'}</Text>
        <View style={styles.setHeaderDSCol}>
          <Text style={styles.setHeaderCell}>DS</Text>
        </View>
        <View style={styles.setHeaderSpacerCol} />
      </View>
      {sets.map((s, idx) => (
        <View key={idx}>
          <View style={[styles.setRow, s.dropSet && styles.setRowDropSet]}>
            <Text style={[styles.setNumText, { flex: 0.4 }]}>{idx + 1}</Text>
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder="0"
              placeholderTextColor={C.muted2}
              keyboardType="numeric"
              value={s.weight}
              onChangeText={v => updateSet(idx, 'weight', v)}
            />
            <TextInput
              style={[styles.setInput, { flex: 1 }]}
              placeholder={isPlank ? '00:45' : '10'}
              placeholderTextColor={C.muted2}
              keyboardType={isPlank ? 'default' : (Platform.OS === 'web' ? 'default' : 'numeric')}
              value={isPlank ? formatDurationClock(s.durationSeconds ?? '') : s.reps}
              onChangeText={v => updateSet(idx, isPlank ? 'durationSeconds' : 'reps', v.replace(/[^0-9:]/g, '').slice(0, 5))}
            />
            <TouchableOpacity
              style={[styles.dropSetBtn, s.dropSet && styles.dropSetBtnActive]}
              onPress={() => toggleDropSet(idx)}
            >
              <Text style={[styles.dropSetBtnText, s.dropSet && styles.dropSetBtnTextActive]}>DS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteSetBtn} onPress={() => removeSet(idx)}>
              <Text style={styles.deleteSetBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {s.dropSet && (
            <View style={styles.dropStagesWrap}>
              {(s.drops || []).map((d, dIdx) => (
                <View key={dIdx} style={styles.dropStageRow}>
                  <Text style={styles.dropStageArrow}>↓</Text>
                  <Text style={styles.dropStageLabel}>Drop {dIdx + 1}</Text>
                  <TextInput
                    style={[styles.setInput, styles.dropStageInput]}
                    placeholder="kg"
                    placeholderTextColor={C.muted2}
                    keyboardType="numeric"
                    value={d.weight}
                    onChangeText={v => updateDrop(idx, dIdx, 'weight', v)}
                  />
                  <TextInput
                    style={[styles.setInput, styles.dropStageInput]}
                    placeholder="reps"
                    placeholderTextColor={C.muted2}
                    keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                    value={d.reps}
                    onChangeText={v => updateDrop(idx, dIdx, 'reps', v.replace(/[^0-9]/g, '').slice(0, 4))}
                  />
                  <TouchableOpacity style={styles.deleteDropBtn} onPress={() => removeDrop(idx, dIdx)}>
                    <Text style={styles.deleteSetBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addDropBtn} onPress={() => addDrop(idx)}>
                <Text style={styles.addDropBtnText}>+ Add Drop</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ))}
      <TouchableOpacity style={styles.addSetBtn} onPress={addSet}>
        <Text style={styles.addSetBtnText}>+ Add Set</Text>
      </TouchableOpacity>
      <View style={styles.editFormActions}>
        <TouchableOpacity style={styles.editCancelBtn} onPress={onCancel}>
          <Text style={styles.editCancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.editSaveBtn, { backgroundColor: color }]} onPress={handleSave}>
          <Text style={styles.editSaveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── TAB 3: History ───────────────────────────────────────────────────────────

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// Computes top-level display numbers scoped to (date, muscleGroup) — used by
// both Workout > History > Muscle and Workout > History > Exercise so a
// Superset/exercise's badge always matches what the person would see if
// they opened Muscle History for that same date+muscle (per the "Muscle
// History has its own relative workout structure" requirement). This is
// intentionally a SEPARATE computation from the whole-session numbering in
// MuscleGroupedLogs (used by Date History), which is scoped to the full
// session instead of one muscle — the same Superset can legitimately show
// a different top-level number in each view, and that's expected.
//
// Uses the same "flattened slot" rule everywhere: a normal exercise
// consumes 1 slot, a Superset consumes as many slots as it has exercises
// (in this date+muscle scope only — see the mixed-muscle-Superset case,
// where only the matching muscle's exercises count), and is displayed
// using the slot number of its first exercise. Superset children keep
// their own independent internal numbering (supersetOrder), unaffected.
function buildMuscleScopedOrderMap(allLogs) {
  const byDateMuscle = {};
  (allLogs || []).forEach(log => {
    if (!log?.exerciseName) return;
    const key = `${String(log.date).slice(0, 10)}__${log.muscleGroup || 'Other'}`;
    (byDateMuscle[key] ||= []).push(log);
  });
  const map = {};
  Object.entries(byDateMuscle).forEach(([key, scopedLogs]) => {
    const supersetMap = {};
    const units = [];
    scopedLogs.forEach((log, i) => {
      if (log.isSuperset === true && log.supersetId) {
        (supersetMap[log.supersetId] ||= []).push(log);
      } else {
        units.push({ type: 'normal', order: Number(log.sessionExerciseOrder) || i + 1, log });
      }
    });
    Object.entries(supersetMap).forEach(([sid, ssLogs]) => {
      const ordered = [...ssLogs].sort((a, b) => (Number(a.supersetOrder) || 999) - (Number(b.supersetOrder) || 999));
      units.push({ type: 'superset', sid, logs: ordered, order: Math.min(...ordered.map((l, i) => Number(l.sessionExerciseOrder) || i + 1)) });
    });
    units.sort((a, b) => a.order - b.order);
    let slot = 0;
    const localMap = {};
    units.forEach(u => {
      const num = slot + 1;
      slot += (u.type === 'superset' ? u.logs.length : 1);
      if (u.type === 'superset') localMap[u.sid] = num;
      else localMap[u.log.id] = num;
    });
    map[key] = localMap;
  });
  return map;
}

function HistoryTab({ workoutLogs, onUpdateWorkoutLog, onDeleteWorkoutLog }) {
  const today      = localDate(0);
  const todayD     = new Date();
  const [sortMode,     setSortMode]     = useState('date');
  const [editingId,    setEditingId]    = useState(null);

  // Date mode: calendar
  const [calYear,  setCalYear]  = useState(todayD.getFullYear());
  const [calMonth, setCalMonth] = useState(todayD.getMonth());
  const [selDate,  setSelDate]  = useState(null); // null = all dates

  // Muscle mode
  const [selMuscle, setSelMuscle] = useState(null); // null = show grid

  // Exercise mode
  const [exSearch, setExSearch] = useState('');

  // All unique exercise names (sorted)
  const allExNames = [...new Set((workoutLogs || []).map(l => l.exerciseName).filter(Boolean))].sort();

  // All dates that have logs (for calendar highlights)
  const logDates = new Set((workoutLogs || []).map(l => String(l.date).slice(0, 10)));

  // ── Filtering ──
  let filtered = workoutLogs || [];
  if (sortMode === 'date' && selDate)   filtered = filtered.filter(l => String(l.date).slice(0, 10) === selDate);
  if (sortMode === 'muscle' && selMuscle) filtered = filtered.filter(l => l.muscleGroup === selMuscle);
  if (sortMode === 'exercise' && exSearch.trim()) {
    filtered = filtered.filter(l => l.exerciseName && l.exerciseName.toLowerCase().includes(exSearch.toLowerCase()));
  }
  filtered = filtered.filter(l => l.exerciseName);

  // ── Grouping ──
  const grouped = {};
  filtered.forEach(log => {
    const key = sortMode === 'muscle'
      ? String(log.date).slice(0, 10)
      : sortMode === 'exercise'
        ? (log.exerciseName || 'Unknown')
        : String(log.date).slice(0, 10);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(log);
  });
  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Autocomplete suggestions (sorted, limited to 8)
  const suggestions = exSearch.trim()
    ? allExNames
        .filter(n => n.toLowerCase().includes(exSearch.toLowerCase()))
        .slice(0, 8)
    : [];

  // Scoped (date+muscle) top-level numbering for Muscle History and
  // Exercise History — see buildMuscleScopedOrderMap above.
  const muscleScopedOrderMap = buildMuscleScopedOrderMap(workoutLogs);

  const handleDelete = log => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${log.exerciseName}"?`)) onDeleteWorkoutLog(log.id);
    } else {
      Alert.alert('Delete Entry', `Delete "${log.exerciseName}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteWorkoutLog(log.id) },
      ]);
    }
  };

  const handleSaveEdit = (log, updates) => {
    if (Platform.OS === 'web') {
      if (window.confirm('Save changes?')) { onUpdateWorkoutLog(log.id, updates); setEditingId(null); }
    } else {
      Alert.alert('Save Changes', 'Save changes to this exercise?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => { onUpdateWorkoutLog(log.id, updates); setEditingId(null); } },
      ]);
    }
  };

  // ── Calendar renderer ──
  const renderCalendar = () => {
    const dim   = daysInMonth(calYear, calMonth);
    const first = firstDayOfMonth(calYear, calMonth);
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const prevMonth = () => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); };
    const nextMonth = () => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); };
    return (
      <View style={styles.calCard}>
        <View style={styles.calHeader}>
          <TouchableOpacity style={styles.calNavBtn} onPress={prevMonth}>
            <Text style={styles.calNavText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.calMonthLabel}>{MONTH_NAMES[calMonth]} {calYear}</Text>
          <TouchableOpacity style={styles.calNavBtn} onPress={nextMonth}>
            <Text style={styles.calNavText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calDayRow}>
          {DAY_NAMES.map(d => <Text key={d} style={styles.calDayName}>{d}</Text>)}
        </View>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.calWeekRow}>
            {week.map((day, di) => {
              if (!day) return <View key={di} style={styles.calCell} />;
              const pad   = String(day).padStart(2, '0');
              const padM  = String(calMonth + 1).padStart(2, '0');
              const dStr  = `${calYear}-${padM}-${pad}`;
              const hasDot = logDates.has(dStr);
              const isSel  = selDate === dStr;
              const isTdy  = dStr === today;
              return (
                <TouchableOpacity
                  key={di}
                  style={[
                    styles.calCell,
                    hasDot  && styles.calCellHasDot,
                    isSel   && styles.calCellSelected,
                    isTdy   && !isSel && styles.calCellToday,
                  ]}
                  onPress={() => setSelDate(isSel ? null : dStr)}
                >
                  <Text style={[
                    styles.calCellText,
                    isSel  && styles.calCellTextSel,
                    isTdy  && !isSel && styles.calCellTextToday,
                  ]}>{day}</Text>
                  {hasDot && !isSel && <View style={styles.calDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
        {selDate && (
          <TouchableOpacity style={styles.calClearBtn} onPress={() => setSelDate(null)}>
            <Text style={styles.calClearText}>Show all dates</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Muscle grid renderer ──
  const renderMuscleGrid = () => (
    <View style={styles.muscleGrid}>
      {MUSCLES.map(m => {
        const col   = MUSCLE_COLOR[m] || C.primary;
        const count = (workoutLogs || []).filter(l => l.muscleGroup === m).length;
        const isSel = selMuscle === m;
        return (
          <TouchableOpacity
            key={m}
            style={[styles.muscleGridTile, { borderColor: isSel ? col : 'transparent', backgroundColor: col + (isSel ? '30' : '15') }]}
            onPress={() => setSelMuscle(isSel ? null : m)}
          >
            <View style={[styles.muscleGridDot, { backgroundColor: col }]} />
            <Text style={[styles.muscleGridName, { color: isSel ? col : C.text }]}>{m}</Text>
            <Text style={[styles.muscleGridCount, { color: col }]}>{count} logs</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Log entry renderer ──
  const renderLogEntry = (log, color, exerciseOrder) => {
    const sets      = safeSets(log.sets, log);
    const isEditing = editingId === log.id;
    return (
      <View key={log.id} style={[styles.historyEntry, { borderLeftColor: color }]}>
        {isEditing ? (
          <InlineEditForm
            log={log}
            onSave={updates => handleSaveEdit(log, updates)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <>
            <View style={styles.historyEntryTop}>
              <View style={styles.historyExerciseTitleRow}>
                <View style={styles.historyExerciseOrderBadge}><Text style={styles.historyExerciseOrderText}>{exerciseOrder || '—'}</Text></View>
                <Text style={[styles.historyExerciseName, { flex: 1 }]} numberOfLines={1}>{log.exerciseName}</Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => setEditingId(log.id)}>
                <Text style={styles.editBtnText}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(log)}>
                <Text style={styles.deleteBtnText}>🗑️</Text>
              </TouchableOpacity>
            </View>
            {sets.length > 0 && (
              <View style={styles.setsDetailBlock}>
                <View style={styles.setsDetailHeader}>
                  <Text style={[styles.setsDetailHeaderCell, { flex: 0.4 }]}>SET</Text>
                  <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>WEIGHT</Text>
                  <Text style={[styles.setsDetailHeaderCell, { flex: 1 }]}>{(log.exerciseType === 'duration' || log.isPlank) ? 'DURATION (mm:ss)' : 'REPS'}</Text>
                </View>
                {sets.map((s, si) => (
                  <View key={si}>
                    <View style={[styles.setsDetailRow, si % 2 === 1 && styles.setsDetailRowAlt]}>
                      <Text style={[styles.setsDetailCell, { flex: 0.4, color: '#8892a4' }]}>{si + 1}</Text>
                      <Text style={[styles.setsDetailCell, { flex: 1, color }]}>{s.weight ? `${s.weight} kg` : '—'}</Text>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={styles.setsDetailCell}>{(log.exerciseType === 'duration' || log.isPlank) ? (formatDurationClock(s.durationSeconds || s.reps) || '—') : (s.reps || '—')}</Text>
                        {s.dropSet && <View style={styles.dsBadge}><Text style={styles.dsBadgeText}>DS · {(s.drops || []).length} drop{(s.drops || []).length === 1 ? '' : 's'}</Text></View>}
                      </View>
                    </View>
                    {s.dropSet && (s.drops || []).map((d, di) => (
                      <View key={di} style={styles.dropStageDetailRow}>
                        <Text style={styles.dropStageArrow}>↓</Text>
                        <Text style={styles.dropStageDetailText}>{d.weight || '—'} kg × {d.reps || '—'}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  const kbPadding = useKeyboardPadding(48, 40);

  return (
    <ScrollView style={styles.tabContent} contentContainerStyle={[styles.tabContentInner, { paddingBottom: kbPadding }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>

      {/* Mode chips */}
      <View style={styles.histSortRow}>
        {[['date', '📅 Date'], ['muscle', '💪 Muscle'], ['exercise', '🔤 Exercise']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.histSortChip, sortMode === key && styles.histSortChipActive]}
            onPress={() => { setSortMode(key); setSelDate(null); setSelMuscle(null); setExSearch(''); }}
          >
            <Text style={[styles.histSortChipText, sortMode === key && styles.histSortChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── DATE MODE ── */}
      {sortMode === 'date' && (
        <>
          {renderCalendar()}
          {selDate && (
            <Text style={styles.histSelDateLabel}>
              Logs for {formatDateLabel(selDate)}
            </Text>
          )}
          {!selDate && <Text style={styles.histHintText}>Tap a highlighted date to filter, or scroll down to see all logs.</Text>}
        </>
      )}

      {/* ── MUSCLE MODE ── */}
      {sortMode === 'muscle' && (
        <>
          {renderMuscleGrid()}
          {selMuscle && (
            <View style={styles.histMuscleSectionHeader}>
              <View style={[styles.muscleColorDot, { backgroundColor: MUSCLE_COLOR[selMuscle] || C.primary, width: 10, height: 10, borderRadius: 5 }]} />
              <Text style={[styles.histMuscleSectionText, { color: MUSCLE_COLOR[selMuscle] || C.primary }]}>{selMuscle} Logs</Text>
              <TouchableOpacity onPress={() => setSelMuscle(null)} style={{ marginLeft: 'auto' }}>
                <Text style={styles.histClearFilter}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* ── EXERCISE MODE ── */}
      {sortMode === 'exercise' && (
        <View style={styles.searchRowWrap}>
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Type exercise name…"
              placeholderTextColor={C.muted2}
              value={exSearch}
              onChangeText={setExSearch}
              autoCorrect={false}
            />
            {exSearch.trim() !== '' && (
              <TouchableOpacity onPress={() => setExSearch('')} style={styles.searchClearBtn}>
                <Text style={styles.searchClearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Autocomplete list */}
          {suggestions.length > 0 && (
            <View style={styles.histExSuggestions}>
              {suggestions.map(s => (
                <TouchableOpacity key={s} style={styles.histExSuggItem} onPress={() => setExSearch(s)}>
                  <Text style={styles.histExSuggText}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {sortMode === 'exercise' && exSearch.trim() && allExNames.some(n => n.toLowerCase() === exSearch.trim().toLowerCase()) && (
        <ExerciseProgression logs={workoutLogs} exerciseName={allExNames.find(n => n.toLowerCase() === exSearch.trim().toLowerCase())} />
      )}

      {/* ── Results ── */}
      {filtered.length > 0 && (sortMode !== 'exercise' || exSearch.trim()) && (
        sortedKeys.map(groupKey => {
          const logs       = grouped[groupKey];
          const groupColor = sortMode === 'muscle' ? (MUSCLE_COLOR[selMuscle] || C.primary) : C.text;
          return (
            <View key={groupKey} style={styles.historyDateGroup}>
              <View style={[styles.historyDateHeader, sortMode === 'muscle' && { borderLeftColor: groupColor, borderLeftWidth: 3, paddingLeft: 10 }]}>
                <Text style={[styles.historyDateText, sortMode === 'muscle' && { color: groupColor }]}>
                  {sortMode === 'exercise' ? groupKey : formatDateLabel(groupKey)}
                </Text>
                <Text style={styles.historyDateCount}>{logs.length} log{logs.length !== 1 ? 's' : ''}</Text>
              </View>
              {sortMode === 'date' ? (
                // Date mode represents a real workout session for that day, so
                // Supersets must keep their actual position in the overall
                // execution order (workoutOrder/sessionExerciseOrder) instead of
                // always being pushed to the top. Reuse the same order-aware
                // renderer the live Log tab already uses so History matches it.
                <MuscleGroupedLogs
                  logs={logs}
                  editingId={editingId}
                  setEditingId={setEditingId}
                  onSaveEdit={handleSaveEdit}
                  onDelete={handleDelete}
                  onDeleteSuperset={logsToDelete => {
                    const doDelete = () => logsToDelete.forEach(x => onDeleteWorkoutLog(x.id));
                    if (Platform.OS === 'web') { if (window.confirm(`Delete this superset (${logsToDelete.length} exercises)?`)) doDelete(); }
                    else Alert.alert('Delete Superset', `Delete all ${logsToDelete.length} exercises?`, [{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:doDelete}]);
                  }}
                />
              ) : sortMode === 'muscle' ? (() => {
                // Muscle mode also groups its rows by date (see `grouped`
                // above), and every log here already belongs to the single
                // selected muscle. Numbering is scoped to this exact
                // (date, muscle) pair via muscleScopedOrderMap, so it's
                // always relative to what's shown here (starts at 1),
                // never the whole session's global numbers — see
                // buildMuscleScopedOrderMap for why. We render items
                // directly here (not via MuscleGroupedLogs) to avoid adding
                // a redundant muscle-name header — the "<Muscle> Logs" title
                // above already labels this section.
                const supersetMap = {};
                const units = [];
                logs.forEach((log, i) => {
                  if (log.isSuperset === true && log.supersetId) {
                    if (!supersetMap[log.supersetId]) supersetMap[log.supersetId] = [];
                    supersetMap[log.supersetId].push(log);
                  } else {
                    units.push({ type: 'normal', order: Number(log.sessionExerciseOrder) || i + 1, log });
                  }
                });
                Object.entries(supersetMap).forEach(([sid, ssLogs]) => {
                  const ordered = [...ssLogs].sort((a, b) => (Number(a.supersetOrder) || 999) - (Number(b.supersetOrder) || 999));
                  units.push({
                    type: 'superset',
                    sid,
                    logs: ordered,
                    order: Math.min(...ordered.map((l, i) => Number(l.sessionExerciseOrder) || i + 1)),
                  });
                });
                const scopeKey = `${groupKey}__${selMuscle}`;
                const scopedNumbers = muscleScopedOrderMap[scopeKey] || {};
                return units.sort((a, b) => a.order - b.order).map((unit, unitIndex) => (
                  unit.type === 'superset' ? (
                    <SupersetLogs
                      key={`ss_${unit.sid}`}
                      logs={unit.logs}
                      outerNumber={scopedNumbers[unit.sid] || unitIndex + 1}
                      editingId={editingId}
                      setEditingId={setEditingId}
                      onSaveEdit={handleSaveEdit}
                      onDelete={handleDelete}
                      onDeleteSuperset={logsToDelete => {
                        const doDelete = () => logsToDelete.forEach(x => onDeleteWorkoutLog(x.id));
                        if (Platform.OS === 'web') { if (window.confirm(`Delete this superset (${logsToDelete.length} exercises)?`)) doDelete(); }
                        else Alert.alert('Delete Superset', `Delete all ${logsToDelete.length} exercises?`, [{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:doDelete}]);
                      }}
                    />
                  ) : renderLogEntry(unit.log, MUSCLE_COLOR[unit.log.muscleGroup] || C.primary, scopedNumbers[unit.log.id] || unitIndex + 1)
                ));
              })() : (
                <>
                  {/* Exercise mode spans many different sessions/dates, so
                      each occurrence's badge is scoped to that occurrence's
                      OWN (date, muscle) — same principle as Muscle History,
                      just applied per-occurrence instead of to a single
                      selected muscle. This is what makes an exercise's
                      badge vary correctly by date instead of showing one
                      fixed number everywhere. */}
                  {(() => {
                    const ssMap = {};
                    logs.forEach(l => {
                      if (l.isSuperset === true && l.supersetId && !ssMap[l.supersetId]) {
                        // IMPORTANT: pull every member of this Superset from
                        // the FULL log list (workoutLogs), not just the
                        // entries that happen to match the exercise-name
                        // search. `logs` here only contains rows whose name
                        // matches the search text — e.g. searching "Push
                        // Up" only puts the Push Up row in `logs`, not its
                        // Incline DB Press superset partner. Building the
                        // Superset from just that one matched row made it
                        // look like a 1-exercise Superset, so Push Up's own
                        // internal badge collapsed to "1" instead of the
                        // correct "2" (Incline DB Press is 1, Push Up is 2).
                        // Looking the full Superset up by supersetId here
                        // keeps it complete and correctly numbered, exactly
                        // as it appears in Workout > Log / History > Date.
                        ssMap[l.supersetId] = (workoutLogs || [])
                          .filter(x => x.isSuperset === true && x.supersetId === l.supersetId);
                      }
                    });
                    return Object.entries(ssMap).map(([sid, ssLogs]) => {
                      const ordered = [...ssLogs].sort((a, b) => (Number(a.supersetOrder) || 999) - (Number(b.supersetOrder) || 999));
                      const first = ordered[0];
                      const scopeKey = `${String(first?.date).slice(0, 10)}__${first?.muscleGroup || 'Other'}`;
                      return (
                        <SupersetLogs
                          key={`ss_${sid}`}
                          logs={ordered}
                          outerNumber={muscleScopedOrderMap[scopeKey]?.[sid]}
                          editingId={editingId}
                          setEditingId={setEditingId}
                          onSaveEdit={handleSaveEdit}
                          onDelete={handleDelete}
                          onDeleteSuperset={logsToDelete => {
                            const doDelete = () => logsToDelete.forEach(x => onDeleteWorkoutLog(x.id));
                            if (Platform.OS === 'web') { if (window.confirm(`Delete this superset (${logsToDelete.length} exercises)?`)) doDelete(); }
                            else Alert.alert('Delete Superset', `Delete all ${logsToDelete.length} exercises?`, [{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:doDelete}]);
                          }}
                        />
                      );
                    });
                  })()}
                  {logs.filter(l => !(l.isSuperset === true && l.supersetId)).map(l => {
                    const col = MUSCLE_COLOR[l.muscleGroup] || C.primary;
                    const scopeKey = `${String(l.date).slice(0, 10)}__${l.muscleGroup || 'Other'}`;
                    return renderLogEntry(l, col, muscleScopedOrderMap[scopeKey]?.[l.id]);
                  })}
                </>
              )}
            </View>
          );
        })
      )}

      {/* Empty states */}
      {sortMode === 'date' && selDate && filtered.length === 0 && (
        <Text style={styles.emptyText}>No workouts logged on {formatDateLabel(selDate)}.</Text>
      )}
      {sortMode === 'muscle' && selMuscle && filtered.length === 0 && (
        <Text style={styles.emptyText}>No {selMuscle} logs yet.</Text>
      )}
      {sortMode === 'exercise' && exSearch.trim() && filtered.length === 0 && (
        <Text style={styles.emptyText}>No exercises matching "{exSearch}".</Text>
      )}
    </ScrollView>
  );
}


// ─── Root Screen ──────────────────────────────────────────────────────────────

export default function Workouts({ workoutLogs, onAddWorkoutLog, onUpdateWorkoutLog, onDeleteWorkoutLog }) {
  const [activeTab, setActiveTab] = useState('Log');

  // ── Session state lifted here so it survives tab switches ──────────────────
  // When the user navigates to Records/History and comes back, the in-progress
  // session (date + muscle selection — even muscles with nothing logged yet)
  // is preserved exactly as they left it.
  const [sessionSelectedDate,    setSessionSelectedDate]    = useState(localDate(0));
  const [sessionSelectedMuscles, setSessionSelectedMuscles] = useState([]);
  const [sessionStarted,         setSessionStarted]         = useState(false);
  const [sessionId,              setSessionId]              = useState(null);
  const [sessionName,            setSessionName]            = useState('');
  const [sessionStartTime,       setSessionStartTime]       = useState(null);
  const [supersetMode,           setSupersetMode]           = useState(false);
  const [supersetId,              setSupersetId]              = useState(null);
  const [supersetExercises,       setSupersetExercises]       = useState([]);
  const [customExercises,         setCustomExercises]         = useState([]);

  // ── Persist the active session so it survives leaving this screen entirely
  // (switching to another screen, backgrounding, or closing the app) ───────
  const [hydrated, setHydrated] = useState(false);

  // Restore any in-progress session on first mount.
  useEffect(() => {
    database.getExerciseLibrary().then(rows => setCustomExercises(Array.isArray(rows) ? rows : [])).catch(() => {});
    (async () => {
      try {
        const saved = await database.getActiveWorkoutSession();
        if (saved && saved.sessionStarted && saved.sessionId && (saved.status || 'active') === 'active') {
          const elapsedMin = saved.sessionStartTime
            ? Math.round((Date.now() - saved.sessionStartTime) / 60000)
            : 0;
          if (elapsedMin >= SESSION_MAX_MIN) {
            // Expired while the app was closed/backgrounded — don't restore.
            await database.updateWorkoutSession(saved.sessionId, { status: 'auto_ended', endedAt: Date.now() });
            await database.clearActiveWorkoutSession();
          } else {
            setSessionSelectedDate(saved.selectedDate || localDate(0));
            setSessionSelectedMuscles(saved.selectedMuscles || []);
            setSessionId(saved.sessionId);
            setSessionName(saved.sessionName || '');
            setSessionStartTime(saved.sessionStartTime || Date.now());
            setSupersetMode(!!saved.supersetMode);
            setSupersetId(saved.supersetId || null);
            setSupersetExercises(Array.isArray(saved.supersetExercises) ? saved.supersetExercises : []);
            setSessionStarted(true);
          }
        }
      } catch {
        // If restore fails, just start fresh — never block the screen.
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Keep the persisted copy in sync while a session is active; clear it
  // once the session ends so nothing stale gets restored later.
  useEffect(() => {
    if (!hydrated) return;
    if (sessionStarted && sessionId) {
      database.saveActiveWorkoutSession({
        sessionId,
        sessionName,
        sessionStarted,
        status: 'active',
        sessionStartTime,
        selectedDate: sessionSelectedDate,
        selectedMuscles: sessionSelectedMuscles,
        supersetMode,
        supersetId,
        supersetExercises,
      });
    } else {
      database.clearActiveWorkoutSession();
    }
  }, [hydrated, sessionStarted, sessionId, sessionName, sessionStartTime, sessionSelectedDate, sessionSelectedMuscles, supersetMode, supersetId, supersetExercises]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Workouts</Text>
        <Text style={styles.headerSub}>Track · Analyse · Improve</Text>
      </View>
      <TabBar activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* Keep LogTab always mounted so session state (muscle panels, inputs)
          survives tab switches. Hidden via pointerEvents+display when inactive. */}
      <View style={{ flex: 1, display: activeTab === 'Log' ? 'flex' : 'none' }}>
        <LogTab
          workoutLogs={workoutLogs}
          onAddWorkoutLog={onAddWorkoutLog}
          onUpdateWorkoutLog={onUpdateWorkoutLog}
          onDeleteWorkoutLog={onDeleteWorkoutLog}
          selectedDate={sessionSelectedDate}
          setSelectedDate={setSessionSelectedDate}
          selectedMuscles={sessionSelectedMuscles}
          setSelectedMuscles={setSessionSelectedMuscles}
          sessionStarted={sessionStarted}
          setSessionStarted={setSessionStarted}
          sessionId={sessionId}
          setSessionId={setSessionId}
          sessionName={sessionName}
          setSessionName={setSessionName}
          sessionStartTime={sessionStartTime}
          setSessionStartTime={setSessionStartTime}
          supersetMode={supersetMode}
          setSupersetMode={setSupersetMode}
          supersetId={supersetId}
          setSupersetId={setSupersetId}
          supersetExercises={supersetExercises}
          setSupersetExercises={setSupersetExercises}
          customExercises={customExercises}
          onCustomExerciseAdded={setCustomExercises}
          parentHydrated={hydrated}
        />
      </View>

      {activeTab === 'Records' && <RecordsTab workoutLogs={workoutLogs} />}
      {activeTab === 'History' && (
        <HistoryTab
          workoutLogs={workoutLogs}
          onUpdateWorkoutLog={onUpdateWorkoutLog}
          onDeleteWorkoutLog={onDeleteWorkoutLog}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: C.bg },
  header:      { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 30, fontWeight: '800', color: C.text, letterSpacing: 0.3 },
  headerSub:   { fontSize: 13, color: C.muted, marginTop: 2, letterSpacing: 1.2, textTransform: 'uppercase' },

  tabBar:          { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.card, marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  tabItem:         { flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center', paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemActive:   { borderBottomColor: C.primary },
  tabLabel:        { fontSize: 13, fontWeight: '600', color: C.muted },
  tabLabelActive:  { color: C.primary },

  tabContent:      { flex: 1 },
  tabContentInner: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },

  sectionLabel: { fontSize: 12, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, marginTop: 4 },

  dayChipRow:       { marginBottom: 12 },
  dayChip:          { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginRight: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, minWidth: 52 },
  dayChipActive:    { backgroundColor: C.primary + '22', borderColor: C.primary },
  dayChipDay:       { fontSize: 11, color: C.muted, fontWeight: '600', textTransform: 'uppercase' },
  dayChipNum:       { fontSize: 18, fontWeight: '800', color: C.text, marginTop: 2 },
  dayChipTextActive:{ color: C.primary },

  // Day logged block
  dayLogsBlock:  { marginBottom: 16, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 12 },
  dayLogsTitle:  { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },

  // Per-session grouping inside DayLoggedExercises (when a date has >1 session)
  sessionGroupHeader:      { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(124,92,252,0.08)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 8, gap: 8 },
  sessionGroupHeaderText:  { fontSize: 13, fontWeight: '800', color: C.text, flex: 1 },
  sessionGroupCount:       { fontSize: 11, color: C.muted, fontWeight: '600' },
  sessionGroupDeleteBtn:   { paddingHorizontal: 6, paddingVertical: 2 },
  sessionGroupDeleteBtnText: { fontSize: 13 },

  // Session name input (shown before starting a session)
  sessionNameInput: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, minHeight: 48, color: C.text, marginBottom: 4 },
  sessionNameText:  { fontSize: 16, fontWeight: '800', color: C.text },

  muscleRow:            { flexDirection: 'row', marginBottom: 10, gap: 10 },
  muscleChip:           { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  muscleChipPlaceholder:{ flex: 1 },
  muscleColorDot:       { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  muscleChipText:       { fontSize: 14, fontWeight: '600', color: C.text, flex: 1 },
  checkMark:            { fontSize: 16, fontWeight: '800' },

  continueSessionBtn:       { marginTop: 8, marginBottom: 4, backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: C.primary },
  continueSessionBtnText:   { color: C.primary, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  // 2-session daily limit banner
  sessionLimitBanner: { backgroundColor: 'rgba(244,63,94,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(244,63,94,0.3)', padding: 14, marginBottom: 12, alignItems: 'center' },
  sessionLimitText:   { color: '#f43f5e', fontSize: 13, fontWeight: '600', textAlign: 'center' },

  // Personal Best expandable cards (Top 10)
  pbCard:           { backgroundColor: '#0d0d18', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderLeftWidth: 3, marginBottom: 10, overflow: 'hidden' },
  pbCardHeader:     { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  pbCardRankBadge:  { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  pbCardRank:       { fontSize: 11, fontWeight: '800', color: '#94a3b8' },
  pbCardExercise:   { fontSize: 15, fontWeight: '700', color: '#ffffff', marginBottom: 2 },
  pbCardMeta:       { fontSize: 11, color: '#94a3b8' },
  pbCardBestChip:   { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  pbCardBestWeight: { fontSize: 16, fontWeight: '900' },
  pbCardBestLabel:  { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  pbCardChevron:    { fontSize: 11, color: '#94a3b8', marginLeft: 4 },
  pbCardSetsBlock:  { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  pbCardSetsTitle:  { fontSize: 12, fontWeight: '700', color: '#f59e0b', marginTop: 12, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  pbCardSetsHeader: { flexDirection: 'row', marginBottom: 4 },
  pbCardSetCell:    { fontSize: 10, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 },
  pbCardSetRow:     { flexDirection: 'row', paddingVertical: 6 },
  pbCardSetRowAlt:  { backgroundColor: 'rgba(255,255,255,0.02)' },
  pbCardSetData:    { fontSize: 13, color: '#ffffff' },
  pbCardTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  pbCardTotalLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  pbCardTotalVal:   { fontSize: 18, fontWeight: '900' },
  startSessionBtn:         { marginTop: 16, backgroundColor: C.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  startSessionBtnDisabled: { backgroundColor: C.muted2 },
  startSessionBtnText:     { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  sessionHeaderRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 14, justifyContent: 'space-between' },
  sessionDateText:     { fontSize: 12, fontWeight: '600', color: C.muted, marginTop: 2 },
  sessionTimer:        { fontSize: 12, color: C.muted, marginTop: 2, fontWeight: '600' },
  sessionTimerWarn:    { color: '#f59e0b' },
  sessionTimerBanner:  { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: 12, marginBottom: 12, alignItems: 'center' },
  sessionTimerBannerText: { color: '#f59e0b', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  sessionHeaderActions:{ flexDirection: 'row', gap: 8, alignItems: 'center' },
  deleteSessionBtn:    { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(244,63,94,0.12)', borderWidth: 1, borderColor: 'rgba(244,63,94,0.35)' },
  deleteSessionBtnText:{ fontSize: 13, color: '#f43f5e', fontWeight: '700' },
  resetBtn:            { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)' },
  resetBtnText:        { fontSize: 13, color: '#10b981', fontWeight: '700' },

  exercisePanel:    { backgroundColor: C.card, borderRadius: 20, padding: 18, marginBottom: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border },
  musclePanelHeader:{ fontSize: 16, fontWeight: '800', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1 },
  inputWrapper:     { position: 'relative', zIndex: 10, marginBottom: 12 },
  exerciseInput:    { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, minHeight: 48, color: C.text },
  suggestionList:   { position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#1a1a2e', borderWidth: 1, borderColor: C.border, borderRadius: 10, zIndex: 99, maxHeight: 200, overflow: 'hidden' },
  suggestionItem:   { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  suggestionText:   { fontSize: 14, color: C.text },
  suggestionItemRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: C.border },
  suggestionRemoveBtn: { paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  suggestionRemoveBtnText: { fontSize: 16, fontWeight: '700', color: C.muted2 },

  setTableHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  setHeaderCell:   { fontSize: 11, fontWeight: '700', color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  setHeaderDSCol:  { width: 34, alignItems: 'center' },
  setHeaderSpacerCol: { width: 32 },
  setRow:          { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 6 },
  setNumText:      { fontSize: 13, color: C.muted, fontWeight: '600', textAlign: 'center' },
  setInput:        { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: C.text, textAlign: 'center' },
  deleteSetBtn:    { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f43f5e22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f43f5e44' },
  deleteSetBtnText:{ color: '#f43f5e', fontSize: 13, fontWeight: '700' },
  addSetBtn:       { marginTop: 4, marginBottom: 12, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderStyle: 'dashed' },
  addSetBtnText:   { color: C.muted, fontSize: 13, fontWeight: '600' },
  logExerciseBtn:  { borderWidth: 2, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  logExerciseBtnText:{ fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  loggedMsg:       { paddingVertical: 13, alignItems: 'center', backgroundColor: '#10b98122', borderRadius: 10, borderWidth: 1, borderColor: '#10b98144' },
  loggedMsgText:   { color: '#10b981', fontSize: 15, fontWeight: '700' },

  // Sets detail table (Log tab + History tab)
  setsDetailBlock:     { marginTop: 8, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 8 },
  setsDetailHeader:    { flexDirection: 'row', marginBottom: 4 },
  setsDetailHeaderCell:{ fontSize: 10, fontWeight: '700', color: C.muted2, letterSpacing: 0.8 },
  setsDetailRow:       { flexDirection: 'row', paddingVertical: 4 },
  setsDetailRowAlt:    { backgroundColor: 'rgba(255,255,255,0.03)' },
  setsDetailCell:      { fontSize: 12, color: C.text },

  card:                    { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 16 },
  recordsSectionToggle:    { flexDirection: 'row', marginBottom: 16, backgroundColor: C.card, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: C.border },
  recordsSectionBtn:       { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 9 },
  recordsSectionBtnActive: { backgroundColor: C.primary },
  recordsSectionBtnText:   { fontSize: 13, fontWeight: '600', color: C.muted },
  recordsSectionBtnTextActive: { color: '#fff' },
  top10Header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.bg },
  top10HeaderCell: { fontSize: 11, fontWeight: '700', color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.8 },
  top10Row:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  top10RowAlt:     { backgroundColor: 'rgba(255,255,255,0.02)' },
  muscleColorBar:  { width: 3, height: 28, borderRadius: 2, marginRight: 10 },
  top10Cell:       { fontSize: 13, color: C.text, fontWeight: '500' },

  accordionGroup:      { marginBottom: 10 },
  accordionHeader:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border },
  accordionHeaderText: { fontSize: 15, fontWeight: '700', flex: 1, textTransform: 'uppercase', letterSpacing: 0.8 },
  accordionCount:      { fontSize: 12, color: C.muted, marginRight: 10 },
  accordionChevron:    { fontSize: 12, fontWeight: '700' },
  accordionBody:       { backgroundColor: C.card, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 14, paddingBottom: 14, marginTop: -4, borderWidth: 1, borderTopWidth: 0, borderColor: C.border },

  exerciseHistoryBlock:  { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.border },
  exerciseHistoryName:   { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  historyTableHeader:    { flexDirection: 'row', marginBottom: 4 },
  historyTableCell:      { fontSize: 11, fontWeight: '700', color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.6 },
  historyTableRow:       { flexDirection: 'row', paddingVertical: 5 },
  historyTableRowAlt:    { backgroundColor: 'rgba(255,255,255,0.02)' },
  historyTableDataCell:  { fontSize: 12, color: C.text },

  miniChartContainer: { marginTop: 12 },
  miniChartTitle:     { fontSize: 11, color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  miniChartBars:      { flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 4 },
  miniChartBarCol:    { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 80 },
  miniChartBar:       { width: '70%', borderRadius: 3, minHeight: 4 },
  miniChartLabel:     { fontSize: 9, color: C.muted2, marginTop: 3, textAlign: 'center' },
  miniChartPbStar:    { fontSize: 10, color: '#f59e0b', marginBottom: 2, textAlign: 'center' },

  // Personal Best banner (Records → Muscle History)
  last5Label:         { fontSize: 10, fontWeight: '700', color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 10, marginBottom: 4 },
  pbBanner:           { flexDirection: 'column', backgroundColor: 'rgba(245,158,11,0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)', padding: 10, marginBottom: 10 },
  pbBannerLabel:      { fontSize: 11, fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  pbBannerStats:      { flexDirection: 'row', gap: 8 },
  pbStatChip:         { flex: 1, alignItems: 'center', backgroundColor: 'rgba(245,158,11,0.12)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4 },
  pbStatValue:        { fontSize: 14, fontWeight: '900', color: '#f59e0b' },
  pbStatLabel:        { fontSize: 9, color: 'rgba(245,158,11,0.7)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },

  searchRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: 16, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
  searchInput:      { flex: 1, paddingVertical: 13, fontSize: 14, minHeight: 48, color: C.text },
  searchClearBtn:   { padding: 6 },
  searchClearBtnText:{ color: C.muted, fontSize: 14 },

  historyDateGroup:  { marginBottom: 18 },
  historyDateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.border },
  historyDateText:   { fontSize: 14, fontWeight: '700', color: C.text },
  historyDateCount:  { fontSize: 12, color: C.muted },
  historyEntry:      { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, borderWidth: 1, borderColor: C.border },
  historyEntryTop:   { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  historyExerciseTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 7 },
  historyExerciseOrderBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary + '22', borderWidth: 1, borderColor: C.primary + '55', alignItems: 'center', justifyContent: 'center' },
  historyExerciseOrderText: { color: C.primary, fontSize: 10, fontWeight: '900' },
  historyExerciseName:{ fontSize: 15, fontWeight: '700', color: C.text },
  historyMuscleTag:  { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.8 },
  editBtn:           { padding: 6, marginLeft: 6 },
  editBtnText:       { fontSize: 16 },
  deleteBtn:         { padding: 6, marginLeft: 2 },
  deleteBtnText:     { fontSize: 16 },

  editForm:            { borderLeftWidth: 3, paddingLeft: 10 },
  editExerciseInput:   { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, minHeight: 48, color: C.text, marginBottom: 10 },
  editFormActions:     { flexDirection: 'row', gap: 10, marginTop: 10 },
  editCancelBtn:       { flex: 1, paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  editCancelBtnText:   { color: C.muted, fontWeight: '600', fontSize: 14 },
  editSaveBtn:         { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  editSaveBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },

  emptyText: { color: C.muted2, fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  // Muscle group blocks (Log tab + History tab)
  muscleGroupBlock:      { marginBottom: 10 },
  muscleGroupHeader:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10, borderLeftWidth: 3, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 6 },
  muscleGroupHeaderText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, flex: 1, marginLeft: 6 },
  muscleGroupCount:      { fontSize: 11, color: C.muted, marginRight: 4 },

  // Drop Set button on each set row
  dropSetBtn:          { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)' },
  dropSetBtnActive:    { borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.18)' },
  dropSetBtnText:      { fontSize: 10, fontWeight: '800', color: C.muted2, letterSpacing: 0.5 },
  dropSetBtnTextActive:{ color: '#f59e0b' },
  setRowDropSet:       { backgroundColor: 'rgba(245,158,11,0.05)', borderRadius: 8 },

  // Drop-stage rows nested beneath a set marked as a Drop Set
  dropStagesWrap:   { marginLeft: 24, marginBottom: 10, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: 'rgba(245,158,11,0.3)' },
  dropStageRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  dropStageArrow:   { color: '#f59e0b', fontSize: 14, fontWeight: '700', width: 16, textAlign: 'center' },
  dropStageLabel:   { color: '#f59e0b', fontSize: 11, fontWeight: '700', width: 52 },
  dropStageInput:   { flex: 1 },
  deleteDropBtn:    { width: 28, height: 28, borderRadius: 7, backgroundColor: '#f43f5e22', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f43f5e44' },
  addDropBtn:       { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  addDropBtnText:   { color: '#f59e0b', fontSize: 11, fontWeight: '700' },
  dropStageDetailRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 24, marginBottom: 2 },
  dropStageDetailText: { color: '#f59e0b', fontSize: 12 },

  // Drop Set badge (shown in log views)
  dsBadge:     { backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1, borderColor: 'rgba(245,158,11,0.4)' },
  dsBadgeText: { fontSize: 9, fontWeight: '800', color: '#f59e0b', letterSpacing: 0.5 },

  // Plank mode notice
  plankNotice:     { backgroundColor: 'rgba(6,182,212,0.1)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(6,182,212,0.25)' },
  plankNoticeText: { color: '#06b6d4', fontSize: 12, fontWeight: '600' },

  // PB Banner extras (Muscle History tab)
  pbBannerTopRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  pbBannerDate:        { fontSize: 11, fontWeight: '700' },
  pbSessionSetsBlock:  { marginTop: 10, backgroundColor: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 8 },
  pbSessionSetsLabel:  { fontSize: 10, fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  pbSessionSetsHeader: { flexDirection: 'row', marginBottom: 4 },
  pbSessionSetCell:    { fontSize: 10, fontWeight: '700', color: 'rgba(245,158,11,0.6)', textTransform: 'uppercase' },
  pbSessionSetRow:     { flexDirection: 'row', paddingVertical: 5 },
  pbSessionSetRowAlt:  { backgroundColor: 'rgba(255,255,255,0.02)' },
  pbSessionSetData:    { fontSize: 12, color: C.text },

  // Last 5 sessions cards (Muscle History)
  last5SessionCard:     { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  last5SessionCardAlt:  { backgroundColor: 'rgba(255,255,255,0.01)' },
  last5SessionRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  last5SessionDate:     { fontSize: 12, color: C.muted, flex: 1 },
  last5SessionBestWt:   { fontSize: 14, fontWeight: '800' },
  last5SessionMeta:     { fontSize: 11, color: C.muted2 },
  last5PbStar:          { fontSize: 10, fontWeight: '800', color: '#f59e0b' },
  last5BestSetRow:      { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  last5BestSetLabel:    { fontSize: 11, color: C.muted2 },
  last5BestSetVal:      { fontSize: 12, fontWeight: '700', color: C.text },

  // History tab sort + filter chips
  histSortRow:          { flexDirection: 'row', gap: 8, marginBottom: 10 },
  histSortChip:         { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  histSortChipActive:   { backgroundColor: C.primary + '22', borderColor: C.primary },
  histSortChipText:     { fontSize: 12, fontWeight: '600', color: C.muted },
  histSortChipTextActive:{ color: C.primary, fontWeight: '700' },
  histMuscleRow:        { marginBottom: 12 },
  histMuscleChip:       { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  histMuscleChipText:   { fontSize: 12, fontWeight: '600', color: C.muted },

  // ─── New Exercise History Block (Muscle History) ───────────────────────────
  exHistBlock:          { marginTop: 0, marginBottom: 14, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  exHistHeader:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderLeftWidth: 4, gap: 10 },
  exHistNumBadge:       { width: 28, height: 28, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  exHistNum:            { fontSize: 12, fontWeight: '800' },
  exHistName:           { fontSize: 15, fontWeight: '700', color: C.text, flex: 1 },
  exHistSessionBadge:   { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  exHistSessionCount:   { fontSize: 11, fontWeight: '700' },

  exHistPBCard:         { marginHorizontal: 12, marginBottom: 10, padding: 12, backgroundColor: 'rgba(245,158,11,0.07)', borderRadius: 10, borderLeftWidth: 3 },
  exHistPBTopRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  exHistPBTitle:        { fontSize: 12, fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.8 },
  exHistPBDate:         { fontSize: 11, color: '#f59e0b', fontWeight: '600' },
  exHistPBStats:        { flexDirection: 'row', gap: 8, marginBottom: 10 },
  exHistPBChip:         { flex: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 4, borderWidth: 1 },
  exHistPBVal:          { fontSize: 15, fontWeight: '900' },
  exHistPBLbl:          { fontSize: 9, color: C.muted2, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  exHistPBSetsBox:      { backgroundColor: 'rgba(245,158,11,0.06)', borderRadius: 8, padding: 8 },
  exHistPBSetsLabel:    { fontSize: 10, fontWeight: '700', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  exHistPBSetsHdr:      { flexDirection: 'row', marginBottom: 4 },
  exHistPBSetCell:      { fontSize: 10, fontWeight: '700', color: 'rgba(245,158,11,0.6)', textTransform: 'uppercase' },
  exHistPBSetRow:       { flexDirection: 'row', paddingVertical: 5 },
  exHistPBSetRowAlt:    { backgroundColor: 'rgba(255,255,255,0.02)' },
  exHistPBSetData:      { fontSize: 12, color: C.text },

  exHistSessionsLabel:  { fontSize: 10, fontWeight: '700', color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginHorizontal: 12 },
  exHistSessionRow:     { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginBottom: 6, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10 },
  exHistSessionRowPB:   { backgroundColor: 'rgba(245,158,11,0.07)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' },
  exHistSessionLeft:    { flex: 1 },
  exHistSessionDate:    { fontSize: 12, color: C.muted, fontWeight: '600', marginBottom: 2 },
  exHistSessionBestSet: { fontSize: 11, color: C.muted2 },
  exHistSessionRight:   { alignItems: 'flex-end' },
  exHistSessionBestWt:  { fontSize: 16, fontWeight: '900' },
  exHistSessionMeta:    { fontSize: 10, color: C.muted2 },
  exHistPBStar:         { fontSize: 14, color: '#f59e0b', marginLeft: 6 },

  // ─── Calendar (History → Date mode) ───────────────────────────────────────
  calCard:        { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 14 },
  calHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calNavBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  calNavText:     { fontSize: 22, color: C.text, fontWeight: '300', lineHeight: 26 },
  calMonthLabel:  { fontSize: 16, fontWeight: '700', color: C.text },
  calDayRow:      { flexDirection: 'row', marginBottom: 4 },
  calDayName:     { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: C.muted2, textTransform: 'uppercase' },
  calWeekRow:     { flexDirection: 'row', marginBottom: 2 },
  calCell:        { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, margin: 1 },
  calCellHasDot:  { backgroundColor: 'rgba(139,92,246,0.15)' },
  calCellSelected:{ backgroundColor: C.primary },
  calCellToday:   { borderWidth: 1, borderColor: C.primary },
  calCellText:    { fontSize: 13, fontWeight: '500', color: C.text },
  calCellTextSel: { color: '#fff', fontWeight: '800' },
  calCellTextToday:{ color: C.primary, fontWeight: '700' },
  calDot:         { width: 4, height: 4, borderRadius: 2, backgroundColor: C.primary, marginTop: 1 },
  calClearBtn:    { marginTop: 10, alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  calClearText:   { fontSize: 13, color: C.primary, fontWeight: '600' },
  histSelDateLabel: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 12, paddingLeft: 2 },
  histHintText:   { fontSize: 13, color: C.muted, textAlign: 'center', marginTop: 8, marginBottom: 16 },

  // ─── Muscle grid (History → Muscle mode) ──────────────────────────────────
  muscleGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  muscleGridTile:     { width: '47%', borderRadius: 12, borderWidth: 2, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  muscleGridDot:      { width: 10, height: 10, borderRadius: 5 },
  muscleGridName:     { fontSize: 14, fontWeight: '700', flex: 1 },
  muscleGridCount:    { fontSize: 11, fontWeight: '600' },
  histMuscleSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  histMuscleSectionText:   { fontSize: 15, fontWeight: '700' },
  histClearFilter:         { fontSize: 13, color: C.muted, fontWeight: '600' },

  // ─── Exercise search (History → Exercise mode) ─────────────────────────────
  searchRowWrap:    { marginBottom: 4 },
  searchIcon:       { fontSize: 16, marginRight: 4, color: C.muted },
  histExSuggestions:{ backgroundColor: '#1a1a2e', borderWidth: 1, borderTopWidth: 0, borderColor: C.border, borderBottomLeftRadius: 12, borderBottomRightRadius: 12, overflow: 'hidden', marginTop: -4, marginBottom: 8 },
  histExSuggItem:   { paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  histExSuggText:   { fontSize: 14, color: C.text, fontWeight: '500' },
  exercisePanelHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  supersetMusclePicker: { flex: 1 },
  supersetMuscleChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.04)', marginRight: 5, borderWidth: 1, borderColor: C.border },
  supersetMuscleChipActive: { backgroundColor: C.primary + '22', borderColor: C.primary },
  supersetMuscleChipText: { fontSize: 9, color: C.muted, fontWeight: '600' },
  supersetMuscleChipTextActive: { color: C.primary },
  draftRestoreBanner: { padding: 10, marginBottom: 8, borderRadius: 10, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border },
  draftRestoreText: { color: C.muted, fontSize: 11, textAlign: 'center', fontWeight: '700' },
  exerciseTypeRow: { marginTop: 8, marginBottom: 8, padding: 10, borderRadius: 10, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, },
  exerciseTypeLabel: { color: C.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginBottom: 7 },
  exerciseTypeButtons: { flexDirection: 'row', gap: 8 },
  exerciseTypeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: C.border2 || C.border, alignItems: 'center' },
  exerciseTypeBtnActive: { backgroundColor: C.primary + '22', borderColor: C.primary },
  exerciseTypeBtnText: { color: C.muted, fontSize: 12, fontWeight: '800' },
  exerciseTypeBtnTextActive: { color: C.primary },
  supersetToggle: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  supersetToggleActive: { borderColor: C.primary, backgroundColor: C.primary + '12' },
  supersetToggleText: { color: C.text, fontSize: 14, fontWeight: '700' },
  supersetToggleTextActive: { color: C.primary },
  supersetToggleHint: { color: C.muted, fontSize: 10, marginTop: 4 },
  supersetInfoText: { color: C.muted, fontSize: 11, marginTop: 7, lineHeight: 16 },
  supersetHeaderCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.10)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.35)', borderRadius: 14, padding: 12, marginBottom: 10 },
  supersetHeaderTitle: { color: C.primary, fontSize: 14, fontWeight: '900' },
  supersetHeaderSub: { color: C.muted, fontSize: 10, marginTop: 2 },
  addSupersetExerciseBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: C.primary },
  addSupersetExerciseText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  supersetExerciseNumber: { marginBottom: -2, paddingLeft: 4 },
  supersetExerciseNumberText: { color: C.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  finishSupersetBtn: { paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.12)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)', alignItems: 'center', marginBottom: 12 },
  finishSupersetBtnText: { color: C.green, fontSize: 13, fontWeight: '800' },
  supersetComposer: { marginTop: 8, marginBottom: 10 },
  supersetDraftCard: { marginBottom: 6 },
  supersetDraftReady: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.25)', marginTop: 8 },
  supersetDraftReadyText: { color: C.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  supersetCancelBtn: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  supersetCancelText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  removeSupersetExerciseBtn: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6 },
  removeSupersetExerciseText: { color: '#f87171', fontSize: 10, fontWeight: '700' },
  supersetGroup: { backgroundColor: 'rgba(139,92,246,0.06)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.25)', borderRadius: 14, padding: 10, marginBottom: 10 },
  supersetGroupHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  supersetGroupTitle: { color: C.primary, fontSize: 12, fontWeight: '900', flex: 1 },
  supersetGroupCount: { color: C.muted, fontSize: 10 },
  supersetDeleteBtn: { padding: 5, marginLeft: 6 },
  supersetDeleteText: { fontSize: 13 },
  supersetOrderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  supersetOrderBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.primary + '22', alignItems: 'center', justifyContent: 'center', marginRight: 6 },
  supersetOrderText: { color: C.primary, fontSize: 10, fontWeight: '900' },
  supersetHistoryLabel: { color: C.muted, fontSize: 10, marginBottom: 5 },

  supersetExerciseCard: { backgroundColor: 'rgba(255,255,255,0.025)', borderRadius: 10, padding: 8, marginBottom: 8, borderWidth: 1, borderColor: C.border },

  supersetHistoryBadge: { color: '#f59e0b', fontSize: 9, fontWeight: '800' },

});