import React, { useState, useMemo } from 'react';
import { useKeyboardPadding } from '../utils/keyboard';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl, KeyboardAvoidingView,
  TextInput, StyleSheet, Platform, Alert, Modal,
} from 'react-native';
import ClearableTextInput from '../components/ClearableTextInput';

function localDate(n = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseMins(hhmm) {
  if (!hhmm || !hhmm.includes(':')) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function calcDuration(bedtime, wakeTime) {
  const b = parseMins(bedtime);
  const w = parseMins(wakeTime);
  if (b === null || w === null) return null;
  let diff = w - b;
  if (diff <= 0) diff += 24 * 60;
  return parseFloat((diff / 60).toFixed(2));
}

function formatDuration(hours) {
  if (hours === null || hours === undefined) return '—';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function qualityLabel(duration, sleepType) {
  if (duration === null) return null;
  if (sleepType === 'nap') {
    if (duration <= 0.5) return { label: 'Quick',    color: '#22d3ee' };
    if (duration <= 1.5) return { label: 'Good',     color: '#10b981' };
    if (duration <= 2.5) return { label: 'Long',     color: '#f59e0b' };
    return                      { label: 'Too Long', color: '#f43f5e' };
  }
  if (duration >= 7.5) return { label: 'Excellent', color: '#10b981' };
  if (duration >= 6.5) return { label: 'Good',      color: '#22d3ee' };
  if (duration >= 5.5) return { label: 'Fair',      color: '#f59e0b' };
  return                      { label: 'Poor',      color: '#f43f5e' };
}

function dayAbbrev(dateStr) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const d = new Date(dateStr + 'T00:00:00');
  return days[d.getDay()];
}

function dayNum(dateStr) {
  return parseInt(dateStr.split('-')[2], 10);
}

// ---------------------------------------------------------------------------
// Compact date picker (same pattern as Nutrition.js's CompactDatePicker —
// duplicated here rather than shared to keep this a small, self-contained
// change rather than introducing a new shared module/import graph). Lets
// the user jump to ANY stored date, not just the last 14 days covered by
// the chip row above, without a full calendar-page redesign.
// ---------------------------------------------------------------------------
const CAL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAY_NAMES = ['S','M','T','W','T','F','S'];

function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }

function CompactDatePicker({ selectedDate, onSelect, markedDates }) {
  const [open, setOpen] = useState(false);
  const sel = new Date(selectedDate + 'T00:00:00');
  const [viewYear, setViewYear] = useState(sel.getFullYear());
  const [viewMonth, setViewMonth] = useState(sel.getMonth());

  const openPicker = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setOpen(true);
  };

  const dim = daysInMonth(viewYear, viewMonth);
  const first = firstDayOfMonth(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  return (
    <>
      <TouchableOpacity style={styles.compactDateBtn} onPress={openPicker}>
        <Text style={styles.compactDateBtnText}>📅 Jump to date…</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.compactCalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.compactCalCard} onPress={() => {}}>
            <View style={styles.compactCalHeader}>
              <TouchableOpacity style={styles.compactCalNavBtn} onPress={prevMonth}><Text style={styles.compactCalNavText}>‹</Text></TouchableOpacity>
              <Text style={styles.compactCalMonthLabel}>{CAL_MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <TouchableOpacity style={styles.compactCalNavBtn} onPress={nextMonth}><Text style={styles.compactCalNavText}>›</Text></TouchableOpacity>
            </View>
            <View style={styles.compactCalDayRow}>
              {CAL_DAY_NAMES.map((d, i) => <Text key={i} style={styles.compactCalDayName}>{d}</Text>)}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={styles.compactCalWeekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={styles.compactCalCell} />;
                  const pad = String(day).padStart(2, '0');
                  const padM = String(viewMonth + 1).padStart(2, '0');
                  const dStr = `${viewYear}-${padM}-${pad}`;
                  const isSel = dStr === selectedDate;
                  const isToday = dStr === localDate(0);
                  const hasData = markedDates?.has?.(dStr);
                  return (
                    <TouchableOpacity
                      key={di}
                      style={[styles.compactCalCell, isSel && styles.compactCalCellSel, isToday && !isSel && styles.compactCalCellToday]}
                      onPress={() => { onSelect(dStr); setOpen(false); }}
                    >
                      <Text style={[styles.compactCalCellText, isSel && styles.compactCalCellTextSel]}>{day}</Text>
                      {hasData && !isSel && <View style={styles.compactCalDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <TouchableOpacity style={styles.compactCalTodayBtn} onPress={() => { onSelect(localDate(0)); setOpen(false); }}>
              <Text style={styles.compactCalTodayBtnText}>Go to Today</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function Sleep({ profile, sleepLogs, onAddSleepLog, onUpdateSleepLog, onDeleteSleepLog, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  const sleepTarget = profile?.sleepTarget || 8;

  // ── Form state ────────────────────────────────────────────────────────────
  const [selectedDate,  setSelectedDate]  = useState(localDate(0));
  const [viewDate,      setViewDate]      = useState(localDate(0)); // for browsing history
  const [sleepType,     setSleepType]     = useState('night');
  const [bedtime,       setBedtime]       = useState('');
  const [wakeTime,      setWakeTime]      = useState('');
  const [successBanner, setSuccessBanner] = useState(false);

  // ── Edit state ────────────────────────────────────────────────────────────
  const [editingId,    setEditingId]    = useState(null);
  const [editBedtime,  setEditBedtime]  = useState('');
  const [editWakeTime, setEditWakeTime] = useState('');
  const [editSleepType,setEditSleepType]= useState('night');
  const [editDate,     setEditDate]     = useState('');

  const duration     = calcDuration(bedtime, wakeTime);
  const quality      = qualityLabel(duration, sleepType);
  const editDuration = calcDuration(editBedtime, editWakeTime);

  // ── Date chips (14 days) ──────────────────────────────────────────────────
  const dateChips = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => {
      const d = localDate(i);
      return { date: d, dayName: dayAbbrev(d), dayNum: dayNum(d) };
    }), []);

  // ── Chart data (last 7 days) ──────────────────────────────────────────────
  // FIX: slice log.date to 10 chars to handle any ISO timestamp variants
  const chartDays = useMemo(() => Array.from({ length: 7 }, (_, i) => localDate(6 - i)), []);

  const chartData = useMemo(() =>
    chartDays.map(date => {
      const logs  = (sleepLogs || []).filter(l => l.date && String(l.date).slice(0, 10) === date);
      const nightH = logs.filter(l => l.sleepType === 'night' || !l.sleepType).reduce((a, l) => a + (Number(l.duration) || 0), 0);
      const napH   = logs.filter(l => l.sleepType === 'nap').reduce((a, l) => a + (Number(l.duration) || 0), 0);
      return { date, nightH, napH, total: nightH + napH };
    }), [sleepLogs, chartDays]);

  const maxTotal = useMemo(() =>
    Math.max(...chartData.map(d => d.total), sleepTarget), [chartData, sleepTarget]);

  // ── Stats (last 7 days) ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const sevenDaysAgo = localDate(6);
    const recent    = (sleepLogs || []).filter(l => l.date && String(l.date).slice(0, 10) >= sevenDaysAgo);
    const nightLogs = recent.filter(l => l.sleepType === 'night' || !l.sleepType);
    const napLogs   = recent.filter(l => l.sleepType === 'nap');
    const nightDays = chartData.filter(d => d.nightH > 0).length;
    const avgNight  = nightDays > 0
      ? nightLogs.reduce((a, l) => a + (Number(l.duration) || 0), 0) / nightDays
      : 0;
    const avgNap = napLogs.length > 0
      ? napLogs.reduce((a, l) => a + (Number(l.duration) || 0), 0) / 7
      : 0;
    const deficit = Math.max(0, sleepTarget - avgNight);
    return { avgNight, avgNap, nightDays, deficit };
  }, [sleepLogs, chartData, sleepTarget]);

  // ── All-time analysis ──────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    // Include legacy logs without sleepType (seed data predates the field)
    const allNight = (sleepLogs || []).filter(l => (l.sleepType === 'night' || !l.sleepType) && Number(l.duration) > 0);
    if (allNight.length < 3) return null;

    const durations = allNight.map(l => Number(l.duration));
    const avg       = durations.reduce((a, b) => a + b, 0) / durations.length;
    const best      = Math.max(...durations);
    const worst     = Math.min(...durations);
    const metTarget = allNight.filter(l => Number(l.duration) >= sleepTarget).length;
    const pctMet    = Math.round((metTarget / allNight.length) * 100);

    // 4-week trend: compare last 14 nights vs prior 14
    const sorted     = [...allNight].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const recent14   = sorted.slice(0, 14);
    const prior14    = sorted.slice(14, 28);
    const avgRecent  = recent14.length ? recent14.reduce((a, l) => a + Number(l.duration), 0) / recent14.length : 0;
    const avgPrior   = prior14.length  ? prior14.reduce((a, l) => a + Number(l.duration), 0) / prior14.length   : 0;
    const trend      = prior14.length >= 3 ? avgRecent - avgPrior : null;

    const totalNaps  = (sleepLogs || []).filter(l => l.sleepType === 'nap').length;

    return { avg, best, worst, pctMet, total: allNight.length, trend, totalNaps };
  }, [sleepLogs, sleepTarget]);

  // ── Recent logs — for a specific date ────────────────────────────────────
  const recentLogs = useMemo(() =>
    [...(sleepLogs || [])]
      .sort((a, b) => {
        if (String(b.date) !== String(a.date)) return String(b.date).localeCompare(String(a.date));
        return (b.bedtime || '').localeCompare(a.bedtime || '');
      })
      .slice(0, 20), [sleepLogs]);

  const viewDateLogs = useMemo(() =>
    (sleepLogs || [])
      .filter(l => l.date && String(l.date).slice(0, 10) === viewDate)
      .sort((a, b) => (b.bedtime || '').localeCompare(a.bedtime || '')),
    [sleepLogs, viewDate]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleAddLog() {
    if (!bedtime || !wakeTime || duration === null) return;
    onAddSleepLog({ date: selectedDate, sleepType, bedtime, wakeTime, duration });
    setBedtime(''); setWakeTime('');
    setSuccessBanner(true);
    setTimeout(() => setSuccessBanner(false), 2500);
  }

  function openEdit(log) {
    setEditingId(log.id);
    setEditBedtime(log.bedtime || '');
    setEditWakeTime(log.wakeTime || '');
    setEditSleepType(log.sleepType || 'night');
    setEditDate(log.date || localDate(0));
  }

  function closeEdit() { setEditingId(null); }

  // FIX: confirm before saving edit
  function handleSaveEdit() {
    if (!editBedtime || !editWakeTime || editDuration === null) return;
    const doSave = () => {
      onUpdateSleepLog(editingId, {
        bedtime: editBedtime, wakeTime: editWakeTime,
        duration: editDuration, sleepType: editSleepType, date: editDate,
      });
      setEditingId(null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Save changes to this sleep log?')) doSave();
    } else {
      Alert.alert('Save Changes', 'Save changes to this sleep log?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: doSave },
      ]);
    }
  }

  function handleDelete(log) {
    if (Platform.OS === 'web') {
      if (window.confirm('Delete this sleep log?')) {
        onDeleteSleepLog(log.id);
        if (editingId === log.id) setEditingId(null);
      }
    } else {
      Alert.alert('Delete Log', 'Delete this sleep log?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          onDeleteSleepLog(log.id);
          if (editingId === log.id) setEditingId(null);
        }},
      ]);
    }
  }

  const BAR_MAX_H  = 120;
  const targetLineY = BAR_MAX_H - (sleepTarget / maxTotal) * BAR_MAX_H;
  const kbPadding = useKeyboardPadding(48, 40);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.contentContainer, { paddingBottom: kbPadding }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8b5cf6" colors={["#8b5cf6"]} />}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sleep</Text>
        <Text style={styles.headerSub}>Track your rest & recovery</Text>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        {[
          { val: formatDuration(stats.avgNight), label: 'Avg Night',  color: '#7c5cfc' },
          { val: formatDuration(stats.avgNap),   label: 'Avg Nap',    color: '#f59e0b' },
          { val: String(stats.nightDays),         label: 'Nights/7d',  color: '#22d3ee' },
          {
            val:   stats.deficit > 0 ? `-${formatDuration(stats.deficit)}` : 'On Track',
            label: 'Deficit',
            color: stats.deficit > 0 ? '#f43f5e' : '#10b981',
          },
        ].map(st => (
          <View key={st.label} style={styles.statCard}>
            <Text style={[styles.statValue, { color: st.color }]}>{st.val}</Text>
            <Text style={styles.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Stacked Bar Chart */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Last 7 Days</Text>
        <View style={styles.legendRow}>
          {[['#7c5cfc','Night'],['#f59e0b','Nap'],['#22d3ee','Target']].map(([c,l]) => (
            <View key={l} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>{l}</Text>
            </View>
          ))}
        </View>
        <View style={styles.chartArea}>
          <View style={[styles.targetLine, { top: targetLineY }]} />
          <View style={styles.barsRow}>
            {chartData.map(day => {
              const totalH    = day.nightH + day.napH;
              const totalBarH = maxTotal > 0 ? (totalH / maxTotal) * BAR_MAX_H : 0;
              const nightBarH = totalH > 0 ? (day.nightH / totalH) * totalBarH : 0;
              const napBarH   = totalBarH - nightBarH;
              return (
                <View key={day.date} style={styles.barColumn}>
                  {totalH > 0 && (
                    <Text style={styles.barLabel}>{formatDuration(parseFloat(totalH.toFixed(1)))}</Text>
                  )}
                  <View style={[styles.barContainer, { height: BAR_MAX_H }]}>
                    <View style={styles.barInner}>
                      {napBarH   > 0 && <View style={{ height: napBarH,   backgroundColor: '#f59e0b', borderRadius: 3 }} />}
                      {nightBarH > 0 && <View style={{ height: nightBarH, backgroundColor: '#7c5cfc', borderRadius: 3 }} />}
                    </View>
                  </View>
                  <Text style={styles.barXLabel}>{dayAbbrev(day.date)}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* All-time Analysis */}
      {analysis && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 All-Time Sleep Analysis</Text>
          <View style={styles.analysisGrid}>
            {[
              { label: 'Total Nights Logged', val: String(analysis.total),                    color: '#7c5cfc' },
              { label: 'Average Duration',    val: formatDuration(analysis.avg),              color: '#22d3ee' },
              { label: 'Best Night',          val: formatDuration(analysis.best),             color: '#10b981' },
              { label: 'Worst Night',         val: formatDuration(analysis.worst),            color: '#f43f5e' },
              { label: 'Target Met',          val: `${analysis.pctMet}% of nights`,           color: '#f59e0b' },
              { label: 'Total Naps',          val: String(analysis.totalNaps),                color: '#a78bfa' },
            ].map(item => (
              <View key={item.label} style={styles.analysisCell}>
                <Text style={[styles.analysisCellVal, { color: item.color }]}>{item.val}</Text>
                <Text style={styles.analysisCellLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          {analysis.trend !== null && (
            <View style={[styles.trendBanner, {
              backgroundColor: analysis.trend >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
              borderColor:     analysis.trend >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
            }]}>
              <Text style={{ color: analysis.trend >= 0 ? '#10b981' : '#f43f5e', fontSize: 13, fontWeight: '600' }}>
                {analysis.trend >= 0
                  ? `📈 Sleep improving: +${formatDuration(Math.abs(analysis.trend))} vs prior 2 weeks`
                  : `📉 Sleep declining: ${formatDuration(Math.abs(analysis.trend))} less vs prior 2 weeks`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* View / Browse by Date */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📅 Browse by Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {dateChips.map(chip => (
            <TouchableOpacity
              key={chip.date}
              style={[styles.dateChip, viewDate === chip.date && styles.dateChipSelected]}
              onPress={() => { setViewDate(chip.date); if (editingId) setEditingId(null); }}
            >
              <Text style={[styles.dateChipDay, viewDate === chip.date && styles.dateChipTextSelected]}>
                {chip.dayName}
              </Text>
              <Text style={[styles.dateChipNum, viewDate === chip.date && styles.dateChipTextSelected]}>
                {chip.dayNum}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Chips above only cover the last 14 days — this compact picker
            lets the user jump to ANY stored date, older than that window,
            without a full calendar-page redesign. */}
        <CompactDatePicker
          selectedDate={viewDate}
          onSelect={d => { setViewDate(d); if (editingId) setEditingId(null); }}
          markedDates={useMemo(() => new Set((sleepLogs || []).map(l => l.date && String(l.date).slice(0, 10)).filter(Boolean)), [sleepLogs])}
        />

        {viewDateLogs.length === 0 ? (
          <Text style={styles.emptyText}>No sleep logged for this date.</Text>
        ) : (
          viewDateLogs.map(log => {
            const q         = qualityLabel(log.duration, log.sleepType);
            const isEditing = editingId === log.id;
            return (
              <View key={log.id}>
                <View style={styles.logItem}>
                  <Text style={styles.logItemIcon}>{(log.sleepType === 'nap') ? '☀️' : '🌙'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logItemDate}>
                      {log.sleepType === 'nap' ? 'Nap' : 'Night Sleep'}
                      {' · '}{log.bedtime} → {log.wakeTime}
                    </Text>
                    <Text style={styles.logItemTimes}>
                      <Text style={styles.logItemDuration}>{formatDuration(log.duration)}</Text>
                    </Text>
                  </View>
                  <View style={styles.logItemRight}>
                    {q && (
                      <View style={[styles.qualityBadge, { backgroundColor: q.color + '22' }]}>
                        <Text style={[styles.qualityBadgeText, { color: q.color }]}>{q.label}</Text>
                      </View>
                    )}
                    <View style={styles.logItemActions}>
                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => isEditing ? closeEdit() : openEdit(log)}
                      >
                        <Text style={styles.actionBtnText}>{isEditing ? '✕' : '✏️'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDelete]} onPress={() => handleDelete(log)}>
                        <Text style={styles.actionBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {isEditing && (
                  <View style={styles.editPanel}>
                    <Text style={styles.editPanelTitle}>Edit Log</Text>
                    <View style={styles.typeToggleRow}>
                      <TouchableOpacity style={[styles.typeBtn, editSleepType === 'night' && styles.typeBtnNightActive]} onPress={() => setEditSleepType('night')}>
                        <Text style={[styles.typeBtnText, editSleepType === 'night' && styles.typeBtnTextActive]}>🌙 Night Sleep</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.typeBtn, editSleepType === 'nap' && styles.typeBtnNapActive]} onPress={() => setEditSleepType('nap')}>
                        <Text style={[styles.typeBtnText, editSleepType === 'nap' && styles.typeBtnTextActive]}>☀️ Nap</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.inputRow}>
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Bedtime</Text>
                        <ClearableTextInput style={styles.textInput} placeholder="HH:MM" placeholderTextColor="#4a5568" value={editBedtime} onChangeText={setEditBedtime} keyboardType="numbers-and-punctuation" maxLength={5} />
                      </View>
                      <View style={styles.inputSpacer} />
                      <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Wake Time</Text>
                        <ClearableTextInput style={styles.textInput} placeholder="HH:MM" placeholderTextColor="#4a5568" value={editWakeTime} onChangeText={setEditWakeTime} keyboardType="numbers-and-punctuation" maxLength={5} />
                      </View>
                    </View>
                    {editDuration !== null && (
                      <Text style={styles.durationText}>Duration: {formatDuration(editDuration)}</Text>
                    )}
                    <View style={styles.editActions}>
                      <TouchableOpacity style={styles.cancelBtn} onPress={closeEdit}>
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveBtn, (!editBedtime || !editWakeTime || editDuration === null) && styles.logBtnDisabled]}
                        onPress={handleSaveEdit}
                        disabled={!editBedtime || !editWakeTime || editDuration === null}
                      >
                        <Text style={styles.saveBtnText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Log Form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>➕ Log Sleep</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {dateChips.map(chip => (
            <TouchableOpacity
              key={chip.date}
              style={[styles.dateChip, selectedDate === chip.date && styles.dateChipSelected]}
              onPress={() => setSelectedDate(chip.date)}
            >
              <Text style={[styles.dateChipDay, selectedDate === chip.date && styles.dateChipTextSelected]}>
                {chip.dayName}
              </Text>
              <Text style={[styles.dateChipNum, selectedDate === chip.date && styles.dateChipTextSelected]}>
                {chip.dayNum}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.typeToggleRow}>
          <TouchableOpacity
            style={[styles.typeBtn, sleepType === 'night' && styles.typeBtnNightActive]}
            onPress={() => setSleepType('night')}
          >
            <Text style={[styles.typeBtnText, sleepType === 'night' && styles.typeBtnTextActive]}>🌙 Night Sleep</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, sleepType === 'nap' && styles.typeBtnNapActive]}
            onPress={() => setSleepType('nap')}
          >
            <Text style={[styles.typeBtnText, sleepType === 'nap' && styles.typeBtnTextActive]}>☀️ Nap</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Bedtime</Text>
            <ClearableTextInput
              style={styles.textInput} placeholder="HH:MM" placeholderTextColor="#4a5568"
              value={bedtime} onChangeText={setBedtime}
              keyboardType="numbers-and-punctuation" maxLength={5}
            />
          </View>
          <View style={styles.inputSpacer} />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Wake Time</Text>
            <ClearableTextInput
              style={styles.textInput} placeholder="HH:MM" placeholderTextColor="#4a5568"
              value={wakeTime} onChangeText={setWakeTime}
              keyboardType="numbers-and-punctuation" maxLength={5}
            />
          </View>
        </View>

        {duration !== null && (
          <View style={styles.durationRow}>
            <Text style={styles.durationText}>Duration: {formatDuration(duration)}</Text>
            {quality && (
              <View style={[styles.qualityBadge, { backgroundColor: quality.color + '22' }]}>
                <Text style={[styles.qualityBadgeText, { color: quality.color }]}>{quality.label}</Text>
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.logBtn, (!bedtime || !wakeTime || duration === null) && styles.logBtnDisabled]}
          onPress={handleAddLog}
          disabled={!bedtime || !wakeTime || duration === null}
        >
          <Text style={styles.logBtnText}>Log Sleep</Text>
        </TouchableOpacity>

        {successBanner && (
          <View style={styles.successBanner}>
            <Text style={styles.successBannerText}>✅ Sleep logged successfully!</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomPad} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#080810' },
  contentContainer: { paddingBottom: 48 },
  header:           { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14 },
  headerTitle:      { fontSize: 28, fontWeight: '700', color: '#f0f0ff', letterSpacing: 0.3 },
  headerSub:        { fontSize: 14, color: '#8892a4', marginTop: 2 },

  statsRow: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 12, gap: 8 },
  statCard:  { flex: 1, backgroundColor: '#0f0f1e', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '700' },
  statLabel: { fontSize: 10, color: '#8892a4', marginTop: 3, textAlign: 'center' },

  card:      { backgroundColor: '#0f0f1e', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', marginHorizontal: 16, marginBottom: 16, padding: 18 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#f0f0ff', marginBottom: 14 },

  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText:{ fontSize: 12, color: '#8892a4' },

  chartArea:    { position: 'relative', paddingTop: 20 },
  targetLine:   { position: 'absolute', left: 0, right: 0, height: 1, borderTopWidth: 1, borderTopColor: '#22d3ee', borderStyle: 'dashed', zIndex: 2 },
  barsRow:      { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  barColumn:    { alignItems: 'center', flex: 1 },
  barLabel:     { fontSize: 9, color: '#8892a4', marginBottom: 3, textAlign: 'center' },
  barContainer: { justifyContent: 'flex-end', width: '80%' },
  barInner:     { width: '100%', justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden' },
  barXLabel:    { fontSize: 11, color: '#8892a4', marginTop: 5, textAlign: 'center' },

  // All-time analysis
  analysisGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  analysisCell:     { width: '47%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  analysisCellVal:  { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  analysisCellLabel:{ fontSize: 11, color: '#8892a4' },
  trendBanner:      { borderRadius: 10, padding: 12, borderWidth: 1, alignItems: 'center' },

  chipScroll: { marginBottom: 14 },
  dateChip:   { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, alignItems: 'center', minWidth: 46, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },

  // Compact date picker
  compactDateBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  compactDateBtnText: { color: '#a78bfa', fontSize: 12, fontWeight: '700' },
  compactCalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  compactCalCard: { width: '100%', maxWidth: 320, backgroundColor: '#11111d', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)', padding: 14 },
  compactCalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  compactCalNavBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#17172a', alignItems: 'center', justifyContent: 'center' },
  compactCalNavText: { color: '#f0f0ff', fontSize: 18, fontWeight: '700' },
  compactCalMonthLabel: { color: '#f0f0ff', fontSize: 14, fontWeight: '800' },
  compactCalDayRow: { flexDirection: 'row', marginBottom: 4 },
  compactCalDayName: { flex: 1, textAlign: 'center', color: '#4a5568', fontSize: 10, fontWeight: '700' },
  compactCalWeekRow: { flexDirection: 'row' },
  compactCalCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, margin: 1 },
  compactCalCellSel: { backgroundColor: '#8b5cf6' },
  compactCalCellToday: { borderWidth: 1, borderColor: '#a78bfa' },
  compactCalCellText: { color: '#f0f0ff', fontSize: 12 },
  compactCalCellTextSel: { color: '#fff', fontWeight: '800' },
  compactCalDot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: '#22d3ee' },
  compactCalTodayBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: '#17172a' },
  compactCalTodayBtnText: { color: '#a78bfa', fontSize: 12, fontWeight: '700' },
  dateChipSelected:    { backgroundColor: '#7c5cfc', borderColor: '#7c5cfc' },
  dateChipDay:         { fontSize: 10, color: '#8892a4', fontWeight: '600' },
  dateChipNum:         { fontSize: 15, color: '#f0f0ff', fontWeight: '700', marginTop: 1 },
  dateChipTextSelected:{ color: '#ffffff' },

  typeToggleRow:     { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeBtn:           { flex: 1, paddingVertical: 13, borderRadius: 18, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  typeBtnNightActive:{ backgroundColor: '#7c5cfc', borderColor: '#7c5cfc' },
  typeBtnNapActive:  { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  typeBtnText:       { fontSize: 14, fontWeight: '600', color: '#8892a4' },
  typeBtnTextActive: { color: '#ffffff' },

  inputRow:    { flexDirection: 'row', marginBottom: 12 },
  inputSpacer: { width: 12 },
  inputGroup:  { flex: 1 },
  inputLabel:  { fontSize: 12, color: '#8892a4', marginBottom: 6, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput:   { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', color: '#f0f0ff', fontSize: 18, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12, textAlign: 'center' },

  durationRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  durationText:      { fontSize: 14, color: '#8892a4', marginBottom: 10 },
  qualityBadge:      { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  qualityBadgeText:  { fontSize: 12, fontWeight: '700' },

  logBtn:        { backgroundColor: '#7c5cfc', borderRadius: 18, paddingVertical: 15, alignItems: 'center' },
  logBtnDisabled:{ opacity: 0.4 },
  logBtnText:    { color: '#ffffff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  successBanner:    { marginTop: 12, backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', alignItems: 'center' },
  successBannerText:{ color: '#10b981', fontSize: 14, fontWeight: '600' },

  logItem:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 },
  logItemIcon:   { fontSize: 22 },
  logItemDate:   { fontSize: 12, color: '#8892a4', marginBottom: 2 },
  logItemTimes:  { fontSize: 14, color: '#f0f0ff', fontWeight: '600' },
  logItemDuration:{ color: '#8892a4', fontWeight: '400', fontSize: 13 },
  logItemRight:  { alignItems: 'flex-end', gap: 6 },
  logItemActions:{ flexDirection: 'row', gap: 6 },
  actionBtn:        { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionBtnDelete:  { backgroundColor: 'rgba(244,63,94,0.12)' },
  actionBtnText:    { fontSize: 14 },
  emptyText:        { color: '#4a5568', fontSize: 14, textAlign: 'center', paddingVertical: 20 },

  editPanel:     { backgroundColor: 'rgba(124,92,252,0.07)', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(124,92,252,0.25)', padding: 14, marginBottom: 8, marginTop: 4 },
  editPanelTitle:{ fontSize: 14, fontWeight: '700', color: '#7c5cfc', marginBottom: 12 },
  editActions:   { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: '#8892a4', fontSize: 15, fontWeight: '600' },
  saveBtn:       { flex: 1, backgroundColor: '#7c5cfc', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveBtnText:   { color: '#ffffff', fontSize: 15, fontWeight: '700' },

  bottomPad: { height: 20 },
});