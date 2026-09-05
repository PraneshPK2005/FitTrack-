import React, { useState, useMemo, useEffect } from 'react';
import { useKeyboardPadding } from '../utils/keyboard';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, ActivityIndicator,
  Alert, Platform, KeyboardAvoidingView, Modal,
} from 'react-native';
import { aiEngine } from '../utils/ai-engine';
import { searchFood, scaleMacros } from '../utils/food-database';
import ClearableTextInput from '../components/ClearableTextInput';
import { database } from '../utils/database';

const C = {
  bg: '#080812', card: '#11111d', card2: '#17172a',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.13)',
  text: '#f0f0ff', muted: '#8892a4', muted2: '#4a5568',
  primary: '#8b5cf6', primaryLt: '#a78bfa',
  cyan: '#22d3ee', green: '#10b981',
  amber: '#f59e0b', rose: '#f43f5e',
};

function dateFromOffset(base, delta) { const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + delta); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function dateLabel(ds) { const [y,m,d]=ds.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-IN',{weekday:'long',month:'short',day:'numeric'}); }

const TODAY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

/** Round to 2 decimal places, strip trailing zero if integer */
function f2(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

// ---------------------------------------------------------------------------
// Compact date picker — used by both Nutrition and Sleep so the user can
// jump to ANY stored date (not just step one day at a time via Prev/Next).
// Deliberately much smaller/simpler than Workout > History > Date's full
// calendar screen, per the requirement to reuse that same underlying
// "pick a date, filter this page's data by it" behavior without copying
// its large UI: this renders as a small pill button that opens a compact
// popover month-grid, not a dedicated History-style page.
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
      <TouchableOpacity style={s.compactDateBtn} onPress={openPicker}>
        <Text style={s.compactDateBtnText}>📅 {dateLabel(selectedDate)}</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.compactCalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <TouchableOpacity activeOpacity={1} style={s.compactCalCard} onPress={() => {}}>
            <View style={s.compactCalHeader}>
              <TouchableOpacity style={s.compactCalNavBtn} onPress={prevMonth}><Text style={s.compactCalNavText}>‹</Text></TouchableOpacity>
              <Text style={s.compactCalMonthLabel}>{CAL_MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <TouchableOpacity style={s.compactCalNavBtn} onPress={nextMonth}><Text style={s.compactCalNavText}>›</Text></TouchableOpacity>
            </View>
            <View style={s.compactCalDayRow}>
              {CAL_DAY_NAMES.map((d, i) => <Text key={i} style={s.compactCalDayName}>{d}</Text>)}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={s.compactCalWeekRow}>
                {week.map((day, di) => {
                  if (!day) return <View key={di} style={s.compactCalCell} />;
                  const pad = String(day).padStart(2, '0');
                  const padM = String(viewMonth + 1).padStart(2, '0');
                  const dStr = `${viewYear}-${padM}-${pad}`;
                  const isSel = dStr === selectedDate;
                  const isToday = dStr === TODAY();
                  const hasData = markedDates?.has?.(dStr);
                  return (
                    <TouchableOpacity
                      key={di}
                      style={[s.compactCalCell, isSel && s.compactCalCellSel, isToday && !isSel && s.compactCalCellToday]}
                      onPress={() => { onSelect(dStr); setOpen(false); }}
                    >
                      <Text style={[s.compactCalCellText, isSel && s.compactCalCellTextSel]}>{day}</Text>
                      {hasData && !isSel && <View style={s.compactCalDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <TouchableOpacity style={s.compactCalTodayBtn} onPress={() => { onSelect(TODAY()); setOpen(false); }}>
              <Text style={s.compactCalTodayBtnText}>Go to Today</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function Bar({ pct, color }) {
  const p = Math.min(1, pct);
  return (
    <View style={s.barBg}>
      <View style={[s.barFill, { width: `${Math.round(p * 100)}%`, backgroundColor: p >= 1 ? C.green : color }]} />
    </View>
  );
}

function WeekChart({ foodLogs, target }) {
  const days = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const ds  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const lbl = ['S','M','T','W','T','F','S'][d.getDay()];
      const cal = (foodLogs||[]).filter(f => f.date && f.date.slice(0,10) === ds).reduce((a,f) => a+(Number(f.calories)||0), 0);
      out.push({ ds, lbl, cal, today: i === 0 });
    }
    return out;
  }, [foodLogs]);
  const max = Math.max(...days.map(d => d.cal), target, 500);
  const H = 80;
  return (
    <View style={s.chart}>
      {days.map((d, i) => {
        const h   = Math.max(4, (d.cal / max) * H);
        const pct = d.cal / (target || 2300);
        const clr = d.today ? C.primary : pct >= 0.9 ? C.green : pct >= 0.6 ? C.amber : C.rose;
        return (
          <View key={i} style={s.chartCol}>
            {d.cal > 0 && <Text style={[s.chartTip, { color: clr }]}>{d.cal}</Text>}
            <View style={[s.chartBar, { height: h, backgroundColor: clr }]} />
            <Text style={[s.chartDay, d.today && { color: C.primary }]}>{d.lbl}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── All-time Nutrition Analysis ────────────────────────────────
function NutritionAnalysis({ foodLogs, profile }) {
  const data = useMemo(() => {
    if (!foodLogs || foodLogs.length === 0) return null;

    // Group by date
    const byDate = {};
    foodLogs.forEach(l => {
      const d = l.date && String(l.date).slice(0, 10);
      if (!d) return;
      if (!byDate[d]) byDate[d] = { calories: 0, protein: 0, carbs: 0, fats: 0 };
      byDate[d].calories += Number(l.calories) || 0;
      byDate[d].protein  += Number(l.protein)  || 0;
      byDate[d].carbs    += Number(l.carbs)    || 0;
      byDate[d].fats     += Number(l.fats)     || 0;
    });

    const days = Object.values(byDate);
    if (days.length < 3) return null;

    const cT = profile?.calorieTarget || 2300;
    const pT = profile?.proteinTarget || 140;

    const avgCal  = days.reduce((a, d) => a + d.calories, 0) / days.length;
    const avgProt = days.reduce((a, d) => a + d.protein,  0) / days.length;
    const avgCarb = days.reduce((a, d) => a + d.carbs,    0) / days.length;
    const avgFat  = days.reduce((a, d) => a + d.fats,     0) / days.length;

    const calMet  = days.filter(d => d.calories >= cT * 0.9 && d.calories <= cT * 1.15).length;
    const protMet = days.filter(d => d.protein >= pT).length;
    const pctCalMet  = Math.round((calMet  / days.length) * 100);
    const pctProtMet = Math.round((protMet / days.length) * 100);

    // Best & worst logged days
    const sorted    = [...days].sort((a, b) => b.calories - a.calories);
    const bestCal   = sorted[0]?.calories || 0;
    const worstCal  = sorted[sorted.length - 1]?.calories || 0;

    // 2-week trend (last 14 days vs prior 14)
    const dateKeys  = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    const recent14  = dateKeys.slice(0, 14).map(k => byDate[k]);
    const prior14   = dateKeys.slice(14, 28).map(k => byDate[k]);
    const avgR      = recent14.length ? recent14.reduce((a, d) => a + d.calories, 0) / recent14.length : 0;
    const avgP      = prior14.length  ? prior14.reduce((a, d)  => a + d.calories, 0) / prior14.length  : 0;
    const trend     = prior14.length >= 3 ? avgR - avgP : null;

    return { avgCal, avgProt, avgCarb, avgFat, pctCalMet, pctProtMet, bestCal, worstCal, total: days.length, trend };
  }, [foodLogs, profile]);

  if (!data) return null;

  return (
    <View style={s.card}>
      <Text style={s.cardHdr}>📊 All-Time Nutrition Analysis</Text>
      <View style={s.analysisGrid}>
        {[
          { label: 'Days Logged',       val: String(data.total),                         color: C.cyan    },
          { label: 'Avg Daily Calories',val: `${f2(data.avgCal)} kcal`,                  color: C.primaryLt},
          { label: 'Avg Protein/Day',   val: `${f2(data.avgProt)}g`,                     color: C.primary  },
          { label: 'Avg Carbs/Day',     val: `${f2(data.avgCarb)}g`,                     color: C.amber    },
          { label: 'Avg Fats/Day',      val: `${f2(data.avgFat)}g`,                      color: C.rose     },
          { label: 'Calorie Goal Met',  val: `${data.pctCalMet}% of days`,               color: C.green    },
          { label: 'Protein Goal Met',  val: `${data.pctProtMet}% of days`,              color: C.cyan     },
          { label: 'Best Day',          val: `${f2(data.bestCal)} kcal`,                 color: C.green    },
        ].map(item => (
          <View key={item.label} style={s.analysisCell}>
            <Text style={[s.analysisCellVal, { color: item.color }]}>{item.val}</Text>
            <Text style={s.analysisCellLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
      {data.trend !== null && (
        <View style={[s.trendBanner, {
          backgroundColor: data.trend >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
          borderColor:     data.trend >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)',
        }]}>
          <Text style={{ color: data.trend >= 0 ? C.green : C.rose, fontSize: 13, fontWeight: '600' }}>
            {data.trend >= 0
              ? `📈 Calories up ${f2(Math.abs(data.trend))} kcal/day vs prior 2 weeks`
              : `📉 Calories down ${f2(Math.abs(data.trend))} kcal/day vs prior 2 weeks`}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Main ───────────────────────────────────────────────────────
export default function Nutrition({ profile, foodLogs, customFoods, onAddFoodLog, onUpdateFoodLog, onDeleteFoodLog }) {
  const [query,       setQuery]       = useState('');
  const [results,     setResults]     = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [qty,         setQty]         = useState('');
  const [preview,     setPreview]     = useState(null);

  const [editCal,  setEditCal]  = useState('');
  const [editProt, setEditProt] = useState('');
  const [editCarb, setEditCarb] = useState('');
  const [editFat,  setEditFat]  = useState('');
  const [editFibre, setEditFibre] = useState('');
  const [macroEdited, setMacroEdited] = useState(false);

  const [showAI,    setShowAI]    = useState(false);
  const [aiText,    setAiText]    = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [parsed,    setParsed]    = useState(null);

  const [showManual, setShowManual] = useState(false);
  const [mName, setMName] = useState('');
  const [mCal,  setMCal]  = useState('');
  const [mProt, setMProt] = useState('');
  const [mCarb, setMCarb] = useState('');
  const [mFat,  setMFat]  = useState('');
  const [mFibre, setMFibre] = useState('');

  const [editingId,  setEditingId]  = useState(null);
  const [editName,   setEditName]   = useState('');
  const [editECal,   setEditECal]   = useState('');
  const [editEProt,  setEditEProt]  = useState('');
  const [editECarb,  setEditECarb]  = useState('');
  const [editEFat,   setEditEFat]   = useState('');
  const [editEFibre, setEditEFibre] = useState('');

  const [added, setAdded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(TODAY());

  useEffect(() => {
    let cancelled = false;
    database.getSetting('nutrition_selected_date').then(raw => {
      if (cancelled || !raw) return;
      const savedDate = String(raw).slice(0, 10);
      // Nutrition history may be viewed for today or any past date, never a
      // future date. Clamp legacy/invalid saved state back to today.
      setSelectedDate(savedDate <= TODAY() ? savedDate : TODAY());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (selectedDate) database.saveSetting('nutrition_selected_date', selectedDate).catch(() => {});
  }, [selectedDate]);

  const today = TODAY();
  const selectedLogs = useMemo(() =>
    (foodLogs||[]).filter(l => l.date && l.date.slice(0,10) === selectedDate),
    [foodLogs, selectedDate]);

  const totals = useMemo(() =>
    selectedLogs.reduce((a, l) => ({
      calories: a.calories + (Number(l.calories)||0),
      protein:  a.protein  + (Number(l.protein) ||0),
      carbs:    a.carbs    + (Number(l.carbs)   ||0),
      fats:     a.fats     + (Number(l.fats)    ||0),
      fibre:    a.fibre    + (Number(l.fibre)   ||0),
    }), { calories: 0, protein: 0, carbs: 0, fats: 0, fibre: 0 }),
    [selectedLogs]);

  const cT    = profile?.calorieTarget || 2300;
  const pT    = profile?.proteinTarget || 140;
  const carbT = profile?.carbTarget    || 250;
  const fT    = profile?.fatTarget     || 70;
  const fibreT = profile?.fibreTarget  || 30;

  // ── FIX: normalise custom food fields before passing to searchFood ─────────
  // Settings saves custom foods with field `fat` but scaleMacros expects `fats`.
  const normalisedCustomFoods = useMemo(() =>
    (customFoods || []).map(cf => ({
      ...cf,
      // ensure both variants are present
      fats: Number(cf.fats ?? cf.fat) || 0,
      fat:  Number(cf.fat  ?? cf.fats) || 0,
      // scaleMacros uses `per` as the reference quantity
      per:  Number(cf.qty  ?? cf.per)  || 100,
    })), [customFoods]);

  // ── Search ─────────────────────────────────────────────────────────────────
  function doSearch(q) {
    setQuery(q);
    setSelected(null); setPreview(null); setQty('');
    setMacroEdited(false);
    if (!q.trim()) { setResults([]); return; }
    setResults(searchFood(q, normalisedCustomFoods));
  }

  function selectFood(food) {
    setSelected(food);
    setQuery(food.name);
    setResults([]);
    const defaultQty = food.per;
    setQty(String(defaultQty));
    const p = scaleMacros(food, defaultQty);
    setPreview(p);
    setEditCal(f2(p.calories));
    setEditProt(f2(p.protein));
    setEditCarb(f2(p.carbs));
    setEditFat(f2(p.fats));
    setEditFibre(f2(p.fibre));
    setMacroEdited(false);
  }

  function onQtyChange(q) {
    setQty(q);
    if (selected && Number(q) > 0) {
      const p = scaleMacros(selected, Number(q));
      setPreview(p);
      if (!macroEdited) {
        setEditCal(f2(p.calories));
        setEditProt(f2(p.protein));
        setEditCarb(f2(p.carbs));
        setEditFat(f2(p.fats));
        setEditFibre(f2(p.fibre));
      }
    }
  }

  function onMacroEdit(field, val) {
    setMacroEdited(true);
    if (field === 'cal')  setEditCal(val);
    if (field === 'prot') setEditProt(val);
    if (field === 'carb') setEditCarb(val);
    if (field === 'fat')  setEditFat(val);
    if (field === 'fibre') setEditFibre(val);
  }

  function addFromSearch() {
    if (!selected) return;
    const finalCal  = Number(editCal)  || preview?.calories || 0;
    const finalProt = Number(editProt) || preview?.protein  || 0;
    const finalCarb = Number(editCarb) || preview?.carbs    || 0;
    const finalFat  = Number(editFat)  || preview?.fats     || 0;
    const finalFibre = Number(editFibre) || preview?.fibre  || 0;
    onAddFoodLog({
      name:     `${qty}${selected.unit !== 'g' && selected.unit !== 'ml' ? '× ' : selected.unit + ' '}${selected.name}`,
      calories: finalCal, protein: finalProt, carbs: finalCarb, fats: finalFat, fibre: finalFibre,
      date: selectedDate,
    });
    setQuery(''); setSelected(null); setQty(''); setPreview(null); setMacroEdited(false);
    flashAdded();
  }

  // ── AI parse ───────────────────────────────────────────────────────────────
  async function handleAI() {
    if (!aiText.trim()) return;
    setAiLoading(true); setParsed(null);
    await new Promise(r => setTimeout(r, 400));
    try {
      const res = aiEngine.parseFoodInput(aiText.trim(), normalisedCustomFoods);
      setParsed(res);
    } catch {
      setParsed({ success: false, items: [], message: 'Could not parse. Try again.' });
    } finally { setAiLoading(false); }
  }

  function confirmParsed() {
    if (!parsed?.items?.length) return;
    parsed.items.forEach(item => onAddFoodLog({ ...item, date: selectedDate }));
    setParsed(null); setAiText(''); setShowAI(false);
    flashAdded();
  }

  // ── Manual add ─────────────────────────────────────────────────────────────
  function manualAdd() {
    if (!mName.trim()) return;
    onAddFoodLog({ name: mName.trim(), calories: Number(mCal)||0, protein: Number(mProt)||0, carbs: Number(mCarb)||0, fats: Number(mFat)||0, fibre: Number(mFibre)||0, date: selectedDate });
    setMName(''); setMCal(''); setMProt(''); setMCarb(''); setMFat(''); setMFibre('');
    setShowManual(false); flashAdded();
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function startEdit(log) {
    setEditingId(log.id);
    setEditName(log.name || '');
    setEditECal(f2(log.calories || 0));
    setEditEProt(f2(log.protein  || 0));
    setEditECarb(f2(log.carbs    || 0));
    setEditEFat(f2(log.fats      || 0));
    setEditEFibre(f2(log.fibre   || 0));
  }

  // FIX: confirm before saving edit
  function saveEdit() {
    if (!editingId) return;
    const doSave = () => {
      onUpdateFoodLog && onUpdateFoodLog(editingId, {
        name:     editName,
        calories: Number(editECal)  || 0,
        protein:  Number(editEProt) || 0,
        carbs:    Number(editECarb) || 0,
        fats:     Number(editEFat)  || 0,
        fibre:    Number(editEFibre) || 0,
      });
      setEditingId(null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Save changes to this food log?')) doSave();
    } else {
      Alert.alert('Save Changes', 'Save changes to this food log?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: doSave },
      ]);
    }
  }

  function handleDelete(log) {
    const msg = `Delete "${log.name}" from ${dateLabel(selectedDate)}?`;
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) onDeleteFoodLog && onDeleteFoodLog(log.id);
    } else {
      Alert.alert('Delete Entry', msg, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDeleteFoodLog && onDeleteFoodLog(log.id) },
      ]);
    }
  }

  function flashAdded() { setAdded(true); setTimeout(() => setAdded(false), 2000); }

  const calPct    = cT > 0 ? totals.calories / cT : 0;
  const remaining = Math.max(0, cT - totals.calories);
  const kbPadding = useKeyboardPadding(40, 40);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: kbPadding }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>

      <View style={s.header}>
        <Text style={s.title}>Nutrition</Text>
        <Text style={s.sub}>{dateLabel(selectedDate)}</Text>
        <View style={s.dateNavRow}>
          <TouchableOpacity style={s.dateNavBtn} onPress={() => setSelectedDate(d => dateFromOffset(d, -1))}><Text style={s.dateNavText}>‹ Previous</Text></TouchableOpacity>
          <TouchableOpacity style={s.dateTodayBtn} onPress={() => setSelectedDate(today)}><Text style={s.dateTodayText}>{selectedDate === today ? 'Today' : 'Go to Today'}</Text></TouchableOpacity>
          <TouchableOpacity style={[s.dateNavBtn, selectedDate === today && s.dateNavDisabled]} disabled={selectedDate === today} onPress={() => setSelectedDate(d => dateFromOffset(d, 1))}><Text style={s.dateNavText}>Next ›</Text></TouchableOpacity>
        </View>
        <CompactDatePicker
          selectedDate={selectedDate}
          onSelect={setSelectedDate}
          markedDates={useMemo(() => new Set((foodLogs || []).map(l => l.date && l.date.slice(0, 10)).filter(Boolean)), [foodLogs])}
        />
        <Text style={s.dateHint}>You can add or edit nutrition for any past date.</Text>
      </View>

      {added && (
        <View style={s.flash}><Text style={s.flashTxt}>✅ Food added to log!</Text></View>
      )}

      {/* Summary Card */}
      <View style={s.card}>
        <View style={s.sumTop}>
          <View style={s.calCircle}>
            <Text style={[s.calNum, { color: calPct >= 1 ? C.green : C.primaryLt }]}>
              {f2(totals.calories)}
            </Text>
            <Text style={s.calTarget}>/ {cT}</Text>
            <Text style={s.calLabel}>kcal</Text>
          </View>
          <View style={s.macroGrid}>
            {[
              { label: 'Protein', val: totals.protein, target: pT,     color: C.primary },
              { label: 'Carbs',   val: totals.carbs,   target: carbT,  color: C.amber   },
              { label: 'Fats',    val: totals.fats,    target: fT,     color: C.rose    },
              { label: 'Fibre',   val: totals.fibre,   target: fibreT, color: C.cyan    },
            ].map(m => (
              <View key={m.label} style={s.macroItem}>
                <View style={s.macroTopRow}>
                  <Text style={[s.macroVal, { color: m.color }]}>{f2(m.val)}g</Text>
                  <Text style={s.macroTarget}>/{m.target}g</Text>
                </View>
                <Bar pct={m.val / m.target} color={m.color} />
                <Text style={s.macroLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.calBarWrap}>
          <Bar pct={calPct} color={C.cyan} />
          <Text style={s.calRemain}>
            {calPct >= 1
              ? `${f2(totals.calories - cT)} kcal over`
              : `${f2(remaining)} kcal remaining`}
          </Text>
        </View>
      </View>

      {/* Weekly chart */}
      <View style={s.card}>
        <Text style={s.cardHdr}>7-Day Calories</Text>
        <WeekChart foodLogs={foodLogs} target={cT} />
        <View style={s.chartLegend}>
          {[[C.green,'On target'],[C.amber,'Moderate'],[C.rose,'Low'],[C.primary,'Today']].map(([color,label]) => (
            <View key={label} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: color }]} />
              <Text style={s.legendTxt}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* All-time Analysis */}
      <NutritionAnalysis foodLogs={foodLogs} profile={profile} />

      {/* Food Search */}
      <View style={s.card}>
        <Text style={s.cardHdr}>🔍 Add Food</Text>
        <ClearableTextInput
          style={s.searchInput}
          placeholder="Search food (rice, egg, chicken, dal...)"
          placeholderTextColor={C.muted}
          value={query}
          onChangeText={doSearch}
        />

        {results.length > 0 && (
          <View style={s.autocomplete}>
            {results.map((food, i) => (
              <TouchableOpacity
                key={food.id || i}
                style={[s.autoItem, i < results.length-1 && s.autoItemBorder]}
                onPress={() => selectFood(food)}
              >
                <View style={s.autoLeft}>
                  {food.isCustom ? <View style={s.customBadge}><Text style={s.customBadgeTxt}>CUSTOM</Text></View> : null}
                  <Text style={s.autoName}>{food.name}</Text>
                  <Text style={s.autoMeta}>
                    per {food.per}{food.unit} · {f2(food.calories)} kcal · P:{f2(food.protein)}g · C:{f2(food.carbs)}g · F:{f2(food.fats)}g
                  </Text>
                </View>
                <Text style={s.autoChevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selected && (
          <View style={s.selectedPanel}>
            <View style={s.selectedHeader}>
              <Text style={s.selectedName}>{selected.name}</Text>
              {selected.isCustom ? <View style={s.customBadge}><Text style={s.customBadgeTxt}>CUSTOM</Text></View> : null}
            </View>
            <View style={s.qtyRow}>
              <ClearableTextInput
                style={s.qtyInput}
                placeholder={`Qty (${selected.unit})`}
                placeholderTextColor={C.muted2}
                keyboardType="numeric"
                value={qty}
                onChangeText={onQtyChange}
              />
              <View style={s.qtyUnit}><Text style={s.qtyUnitTxt}>{selected.unit}</Text></View>
            </View>
            <Text style={s.editHdr}>
              {'Macros '}{macroEdited ? <Text style={{ color: C.amber }}>{'· edited ✏️'}</Text> : <Text style={{ color: C.muted2 }}>{'· auto-calculated'}</Text>}
            </Text>
            <View style={s.macroEditRow}>
              {[
                { label: 'Cal',   val: editCal,  setter: v => onMacroEdit('cal',  v), color: C.cyan    },
                { label: 'Prot',  val: editProt, setter: v => onMacroEdit('prot', v), color: C.primary },
                { label: 'Carbs', val: editCarb, setter: v => onMacroEdit('carb', v), color: C.amber   },
                { label: 'Fats',  val: editFat,  setter: v => onMacroEdit('fat',  v), color: C.rose    },
              ].map(m => (
                <View key={m.label} style={s.macroEditBox}>
                  <ClearableTextInput
                    style={[s.macroEditInput, { borderColor: m.color + '55' }]}
                    keyboardType="numeric"
                    value={String(m.val)}
                    onChangeText={m.setter}
                  />
                  <Text style={[s.macroEditLabel, { color: m.color }]}>{m.label}</Text>
                </View>
              ))}
            </View>
            <View style={s.macroEditRow}>
              {[
                { label: 'Fibre', val: editFibre, setter: v => onMacroEdit('fibre', v), color: C.green },
              ].map(m => (
                <View key={m.label} style={s.macroEditBox}>
                  <ClearableTextInput
                    style={[s.macroEditInput, { borderColor: m.color + '55' }]}
                    keyboardType="numeric"
                    value={String(m.val)}
                    onChangeText={m.setter}
                  />
                  <Text style={[s.macroEditLabel, { color: m.color }]}>{m.label}</Text>
                </View>
              ))}
            </View>
            {macroEdited && (
              <TouchableOpacity onPress={() => {
                setMacroEdited(false);
                if (preview) {
                  setEditCal(f2(preview.calories));
                  setEditProt(f2(preview.protein));
                  setEditCarb(f2(preview.carbs));
                  setEditFat(f2(preview.fats));
                }
              }}>
                <Text style={s.resetMacro}>↺ Reset to calculated values</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.addBtn} onPress={addFromSearch}>
              <Text style={s.addBtnTxt}>+ Add to Log</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.altRow}>
          <TouchableOpacity style={[s.altBtn, showAI && s.altBtnActive]} onPress={() => { setShowAI(v => !v); setShowManual(false); }}>
            <Text style={s.altBtnTxt}>✨ Smart Food Entry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.altBtn, showManual && s.altBtnActive]} onPress={() => { setShowManual(v => !v); setShowAI(false); }}>
            <Text style={s.altBtnTxt}>✏️ Manual</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* AI Parser */}
      {showAI && (
        <View style={s.card}>
          <Text style={s.cardHdr}>✨ Smart Food Entry</Text>
          <Text style={s.aiHint}>Type naturally — e.g. "3 eggs and 250g rice for lunch, banana"</Text>
          <ClearableTextInput
            style={s.aiInput}
            placeholder="Describe what you ate..."
            placeholderTextColor={C.muted2}
            multiline
            value={aiText}
            onChangeText={setAiText}
          />
          <TouchableOpacity style={[s.primaryBtn, aiLoading && { opacity: 0.6 }]} onPress={handleAI} disabled={aiLoading}>
            {aiLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.primaryBtnTxt}>Smart Food Entry ✨</Text>}
          </TouchableOpacity>
          {parsed && (
            <View style={[s.parsedBox, { borderColor: parsed.success && parsed.items?.length ? C.green+'44' : C.rose+'44' }]}>
              {parsed.estimated ? <Text style={s.estimatedNote}>⚠️ AI estimate — please verify values</Text> : null}
              {(!parsed.items?.length) ? <Text style={s.parsedMsg}>{parsed.message}</Text> : null}
              {(parsed.items||[]).map((item, i) => (
                <View key={i} style={s.parsedItem}>
                  <Text style={s.parsedName}>{item.name}</Text>
                  <Text style={s.parsedMacros}>
                    {f2(item.calories)} kcal · P:{f2(item.protein)}g · C:{f2(item.carbs)}g · F:{f2(item.fats)}g
                  </Text>
                </View>
              ))}
              {(parsed.items||[]).length > 0 && (
                <TouchableOpacity style={s.confirmBtn} onPress={confirmParsed}>
                  <Text style={s.confirmBtnTxt}>✓ Confirm & Add All</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Manual Entry */}
      {showManual && (
        <View style={s.card}>
          <Text style={s.cardHdr}>✏️ Manual Entry</Text>
          <ClearableTextInput style={s.inp} placeholder="Food name" placeholderTextColor={C.muted2} value={mName} onChangeText={setMName} />
          <View style={s.inpRow}>
            <ClearableTextInput style={s.inpHalf} placeholder="Calories" placeholderTextColor={C.muted2} keyboardType="numeric" value={mCal} onChangeText={setMCal} />
            <ClearableTextInput style={s.inpHalf} placeholder="Protein (g)" placeholderTextColor={C.muted2} keyboardType="numeric" value={mProt} onChangeText={setMProt} />
          </View>
          <View style={s.inpRow}>
            <ClearableTextInput style={s.inpHalf} placeholder="Carbs (g)" placeholderTextColor={C.muted2} keyboardType="numeric" value={mCarb} onChangeText={setMCarb} />
            <ClearableTextInput style={s.inpHalf} placeholder="Fats (g)" placeholderTextColor={C.muted2} keyboardType="numeric" value={mFat} onChangeText={setMFat} />
          </View>
          <View style={s.inpRow}>
            <ClearableTextInput style={s.inpHalf} placeholder="Fibre (g)" placeholderTextColor={C.muted2} keyboardType="numeric" value={mFibre} onChangeText={setMFibre} />
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={manualAdd}>
            <Text style={s.primaryBtnTxt}>Add Food</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Today's Log */}
      <View style={s.card}>
        <View style={s.logTop}>
          <Text style={s.cardHdr}>{selectedDate === today ? "Today's Log" : `${dateLabel(selectedDate)} Log`}</Text>
          <View style={s.logBadge}><Text style={s.logBadgeTxt}>{selectedLogs.length} items</Text></View>
        </View>
        {selectedLogs.length === 0 ? (
          <View style={s.empty}><Text style={s.emptyIcon}>🍽️</Text><Text style={s.emptyTxt}>No nutrition logged for this day.</Text></View>
        ) : (
          selectedLogs.map((log, i) => {
            const isEditing = editingId === log.id;
            return (
              <View key={log.id||i}>
                <View style={[s.logItem, i < selectedLogs.length-1 && !isEditing && s.logBorder]}>
                  <View style={[s.logBar, { backgroundColor: i % 2 === 0 ? C.primary : C.cyan }]} />
                  <View style={s.logInfo}>
                    <Text style={s.logName}>{log.name}</Text>
                    <View style={s.logMacros}>
                      <Text style={[s.logM, { color: C.cyan }]}>{f2(Number(log.calories)||0)} kcal</Text>
                      <Text style={[s.logM, { color: C.primary }]}>P:{f2(Number(log.protein)||0)}g</Text>
                      <Text style={[s.logM, { color: C.amber }]}>C:{f2(Number(log.carbs)||0)}g</Text>
                      <Text style={[s.logM, { color: C.rose }]}>F:{f2(Number(log.fats)||0)}g</Text>
                      <Text style={[s.logM, { color: C.green }]}>Fibre:{f2(Number(log.fibre)||0)}g</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={s.editBtn} onPress={() => isEditing ? setEditingId(null) : startEdit(log)}>
                    <Text style={s.editBtnTxt}>{isEditing ? '✕' : '✏️'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.delBtn} onPress={() => handleDelete(log)}>
                    <Text style={s.delTxt}>🗑</Text>
                  </TouchableOpacity>
                </View>
                {isEditing && (
                  <View style={s.inlineEdit}>
                    <ClearableTextInput style={s.inp} value={editName} onChangeText={setEditName} placeholder="Food name" placeholderTextColor={C.muted2} />
                    <View style={s.inpRow}>
                      <ClearableTextInput style={s.inpHalf} value={editECal}  onChangeText={setEditECal}  placeholder="Cal"      placeholderTextColor={C.muted2} keyboardType="numeric" />
                      <ClearableTextInput style={s.inpHalf} value={editEProt} onChangeText={setEditEProt} placeholder="Prot (g)" placeholderTextColor={C.muted2} keyboardType="numeric" />
                    </View>
                    <View style={s.inpRow}>
                      <ClearableTextInput style={s.inpHalf} value={editECarb} onChangeText={setEditECarb} placeholder="Carbs (g)" placeholderTextColor={C.muted2} keyboardType="numeric" />
                      <ClearableTextInput style={s.inpHalf} value={editEFat}  onChangeText={setEditEFat}  placeholder="Fats (g)"  placeholderTextColor={C.muted2} keyboardType="numeric" />
                    </View>
                    <View style={s.inpRow}>
                      <ClearableTextInput style={s.inpHalf} value={editEFibre} onChangeText={setEditEFibre} placeholder="Fibre (g)" placeholderTextColor={C.muted2} keyboardType="numeric" />
                    </View>
                    <TouchableOpacity style={s.saveEditBtn} onPress={saveEdit}>
                      <Text style={s.saveEditBtnTxt}>✓ Save Changes</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
        {selectedLogs.length > 0 && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={[s.totalVal, { color: C.cyan }]}>{f2(totals.calories)} kcal</Text>
            <Text style={[s.totalVal, { color: C.primary }]}>P:{f2(totals.protein)}g</Text>
            <Text style={[s.totalVal, { color: C.amber }]}>C:{f2(totals.carbs)}g</Text>
            <Text style={[s.totalVal, { color: C.rose }]}>F:{f2(totals.fats)}g</Text>
          </View>
        )}
      </View>

    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  header:  { marginTop: 8, marginBottom: 20 },
  title:   { color: C.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub:     { color: C.muted, fontSize: 12, marginTop: 4 },
  dateNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  dateNavBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.border2, alignItems: 'center', backgroundColor: C.card },
  dateNavDisabled: { opacity: 0.45 },
  dateNavText: { color: C.primaryLt, fontSize: 11, fontWeight: '800' },
  dateTodayBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: C.primary+'22', borderWidth: 1, borderColor: C.primary+'55', alignItems: 'center' },
  dateTodayText: { color: C.primaryLt, fontSize: 11, fontWeight: '800' },
  dateHint: { color: C.muted2, fontSize: 10, marginTop: 6 },

  // Compact date picker (Nutrition + Sleep)
  compactDateBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border2 },
  compactDateBtnText: { color: C.primaryLt, fontSize: 12, fontWeight: '700' },
  compactCalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  compactCalCard: { width: '100%', maxWidth: 320, backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border2, padding: 14 },
  compactCalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  compactCalNavBtn: { width: 32, height: 32, borderRadius: 9, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  compactCalNavText: { color: C.text, fontSize: 18, fontWeight: '700' },
  compactCalMonthLabel: { color: C.text, fontSize: 14, fontWeight: '800' },
  compactCalDayRow: { flexDirection: 'row', marginBottom: 4 },
  compactCalDayName: { flex: 1, textAlign: 'center', color: C.muted2, fontSize: 10, fontWeight: '700' },
  compactCalWeekRow: { flexDirection: 'row' },
  compactCalCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, margin: 1 },
  compactCalCellSel: { backgroundColor: C.primary },
  compactCalCellToday: { borderWidth: 1, borderColor: C.primaryLt },
  compactCalCellText: { color: C.text, fontSize: 12 },
  compactCalCellTextSel: { color: '#fff', fontWeight: '800' },
  compactCalDot: { position: 'absolute', bottom: 3, width: 4, height: 4, borderRadius: 2, backgroundColor: C.cyan },
  compactCalTodayBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: C.card2 },
  compactCalTodayBtnText: { color: C.primaryLt, fontSize: 12, fontWeight: '700' },

  flash:    { backgroundColor: 'rgba(16,185,129,0.15)', borderRadius: 12, padding: 10, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#10b98155' },
  flashTxt: { color: C.green, fontWeight: '700', fontSize: 13 },

  card:    { backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  cardHdr: { color: C.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 },

  sumTop:      { flexDirection: 'row', gap: 14, marginBottom: 12, alignItems: 'center' },
  calCircle:   { alignItems: 'center', width: 80 },
  calNum:      { fontSize: 26, fontWeight: '900', lineHeight: 30 },
  calTarget:   { color: C.muted, fontSize: 11 },
  calLabel:    { color: C.muted2, fontSize: 10 },
  macroGrid:   { flex: 1, gap: 8 },
  macroItem:   {},
  macroTopRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 3 },
  macroVal:    { fontSize: 13, fontWeight: '800', marginRight: 2 },
  macroTarget: { color: C.muted2, fontSize: 10 },
  macroLabel:  { color: C.muted, fontSize: 10, marginTop: 2 },
  calBarWrap:  { gap: 4 },
  calRemain:   { color: C.muted, fontSize: 10, textAlign: 'right' },
  barBg:       { height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  barFill:     { height: '100%', borderRadius: 3 },

  chart:        { flexDirection: 'row', alignItems: 'flex-end', height: 100, justifyContent: 'space-around', marginBottom: 10 },
  chartCol:     { alignItems: 'center', flex: 1 },
  chartBar:     { width: 18, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartTip:     { fontSize: 7, marginBottom: 3, fontWeight: '700' },
  chartDay:     { color: C.muted, fontSize: 9, marginTop: 4 },
  chartLegend:  { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:    { width: 6, height: 6, borderRadius: 3 },
  legendTxt:    { color: C.muted, fontSize: 10 },

  // Analysis
  analysisGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  analysisCell:      { width: '47%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: C.border },
  analysisCellVal:   { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  analysisCellLabel: { fontSize: 11, color: C.muted },
  trendBanner:       { borderRadius: 10, padding: 12, borderWidth: 1, alignItems: 'center' },

  searchInput:  { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border2, borderRadius: 18, padding: 13, color: C.text, fontSize: 14, marginBottom: 6 },
  autocomplete: { backgroundColor: '#0a0a1a', borderRadius: 18, borderWidth: 1, borderColor: C.border2, overflow: 'hidden', marginBottom: 10 },
  autoItem:     { flexDirection: 'row', alignItems: 'center', padding: 12 },
  autoItemBorder:{ borderBottomWidth: 1, borderBottomColor: C.border },
  autoLeft:     { flex: 1 },
  autoName:     { color: C.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  autoMeta:     { color: C.muted, fontSize: 10 },
  autoChevron:  { color: C.primary, fontSize: 20, marginLeft: 8 },
  customBadge:  { backgroundColor: 'rgba(124,92,252,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 4, borderWidth: 1, borderColor: C.primary+'44' },
  customBadgeTxt:{ color: C.primaryLt, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  selectedPanel:  { backgroundColor: C.card2, borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.primary+'44' },
  selectedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  selectedName:   { color: C.text, fontSize: 14, fontWeight: '800', flex: 1 },
  qtyRow:         { flexDirection: 'row', gap: 8, marginBottom: 14 },
  qtyInput:       { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: C.border2, borderRadius: 12, padding: 12, color: C.text, fontSize: 16, fontWeight: '700' },
  qtyUnit:        { backgroundColor: 'rgba(124,92,252,0.15)', borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.primary+'44' },
  qtyUnitTxt:     { color: C.primaryLt, fontWeight: '800', fontSize: 13 },

  editHdr:       { color: C.muted, fontSize: 11, fontWeight: '600', marginBottom: 10 },
  macroEditRow:  { flexDirection: 'row', gap: 8, marginBottom: 8 },
  macroEditBox:  { flex: 1, alignItems: 'center' },
  macroEditInput:{ width: '100%', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderRadius: 10, padding: 9, color: C.text, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  macroEditLabel:{ fontSize: 10, fontWeight: '700', marginTop: 4 },
  resetMacro:    { color: C.amber, fontSize: 11, textAlign: 'center', marginBottom: 10 },
  addBtn:        { backgroundColor: C.green, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  addBtnTxt:     { color: '#fff', fontWeight: '800', fontSize: 14 },
  altRow:        { flexDirection: 'row', gap: 10, marginTop: 10 },
  altBtn:        { flex: 1, borderWidth: 1, borderColor: C.border2, borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  altBtnActive:  { backgroundColor: 'rgba(124,92,252,0.12)', borderColor: C.primary+'55' },
  altBtnTxt:     { color: C.muted, fontSize: 13, fontWeight: '600' },

  aiHint:        { color: C.muted, fontSize: 12, marginBottom: 10 },
  aiInput:       { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border2, borderRadius: 12, padding: 12, color: C.text, fontSize: 14, minHeight: 72, marginBottom: 10 },
  primaryBtn:    { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  parsedBox:     { marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 12, backgroundColor: 'rgba(255,255,255,0.02)' },
  estimatedNote: { color: C.amber, fontSize: 11, marginBottom: 8, fontWeight: '600' },
  parsedMsg:     { color: C.muted, fontSize: 13 },
  parsedItem:    { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  parsedName:    { color: C.text, fontSize: 13, fontWeight: '600', marginBottom: 2 },
  parsedMacros:  { color: C.green, fontSize: 11 },
  confirmBtn:    { backgroundColor: C.green, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  confirmBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  inp:     { backgroundColor: C.card2, borderWidth: 1, borderColor: C.border2, borderRadius: 12, padding: 12, color: C.text, fontSize: 14, marginBottom: 10 },
  inpRow:  { flexDirection: 'row', gap: 10, marginBottom: 10 },
  inpHalf: { flex: 1, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border2, borderRadius: 12, padding: 12, color: C.text, fontSize: 14 },

  logTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  logBadge:   { backgroundColor: 'rgba(124,92,252,0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: C.primary+'33' },
  logBadgeTxt:{ color: C.primaryLt, fontSize: 11, fontWeight: '700' },
  logItem:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  logBorder:  { borderBottomWidth: 1, borderBottomColor: C.border },
  logBar:     { width: 3, height: 36, borderRadius: 2, marginRight: 10 },
  logInfo:    { flex: 1 },
  logName:    { color: C.text, fontSize: 13, fontWeight: '600', marginBottom: 4 },
  logMacros:  { flexDirection: 'row', gap: 10 },
  logM:       { fontSize: 11, fontWeight: '600' },
  delBtn:     { width: 28, height: 28, borderRadius: 18, backgroundColor: 'rgba(244,63,94,0.12)', alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  delTxt:     { color: C.rose, fontSize: 13 },
  editBtn:    { width: 32, height: 28, borderRadius: 10, backgroundColor: 'rgba(124,92,252,0.1)', alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  editBtnTxt: { color: C.primary, fontSize: 13 },
  inlineEdit:    { backgroundColor: 'rgba(124,92,252,0.06)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.primary+'33' },
  saveEditBtn:   { backgroundColor: C.green, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 8 },
  saveEditBtnTxt:{ color: '#fff', fontWeight: '800', fontSize: 13 },

  totalRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  totalLabel: { color: C.muted, fontSize: 11, fontWeight: '700', flex: 1 },
  totalVal:   { fontSize: 11, fontWeight: '800' },
  empty:      { alignItems: 'center', paddingVertical: 24 },
  emptyIcon:  { fontSize: 28, marginBottom: 8 },
  emptyTxt:   { color: C.muted, fontSize: 13 },
});