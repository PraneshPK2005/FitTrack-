import React, { useMemo, useState } from 'react';
import { useKeyboardPadding } from '../utils/keyboard';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, TextInput, Platform, Modal, RefreshControl, KeyboardAvoidingView } from 'react-native';
import { calculateRecovery } from '../utils/recovery';
import { buildWeeklyReport } from '../utils/weekly-report';
import { pickProgressPhoto, takeProgressPhoto, hashPin, DEFAULT_PROGRESS_PHOTO_CATEGORIES } from '../utils/progress-photos';
import { database } from '../utils/database';
import ClearableTextInput from '../components/ClearableTextInput';

const C = {
  bg: '#080812', card: '#11111d', card2: '#111125',
  border: 'rgba(255,255,255,0.07)', border2: 'rgba(255,255,255,0.12)',
  text: '#ffffff', muted: '#64748b', muted2: '#94a3b8',
  primary: '#8b5cf6', cyan: '#06b6d4',
  green: '#10b981', amber: '#f59e0b', rose: '#f43f5e',
};

function f2(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Health Score Ring ─────────────────────────────────────────
function ScoreRing({ score }) {
  let color = C.rose, label = 'Needs Work';
  if (score >= 85)      { color = C.green;   label = 'Excellent'; }
  else if (score >= 70) { color = C.primary; label = 'Good';      }
  else if (score >= 50) { color = C.amber;   label = 'Moderate';  }
  return (
    <View style={s.ringOuter}>
      <View style={[s.ring, { borderColor: color }]}>
        <View style={s.ringInner}>
          <Text style={s.ringScore}>{score}</Text>
          <Text style={s.ringLabel}>HEALTH</Text>
        </View>
      </View>
      <View style={[s.badge, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        <View style={[s.badgeDot, { backgroundColor: color }]} />
        <Text style={[s.badgeText, { color }]}>{label}</Text>
      </View>
    </View>
  );
}

// ─── Macro Bar ─────────────────────────────────────────────────
function MacroBar({ label, current, target, color, unit }) {
  const pct  = target > 0 ? Math.min(1, current / target) : 0;
  const done = pct >= 1;
  const fill = done ? C.green : color;
  return (
    <View style={s.macroBarWrap}>
      <View style={s.macroBarTop}>
        <Text style={s.macroBarLabel}>{label}</Text>
        <Text style={[s.macroBarVal, { color: fill }]}>
          {f2(current)}{unit} <Text style={s.macroBarTarget}>/ {target}{unit}</Text>
        </Text>
      </View>
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: fill }]} />
      </View>
    </View>
  );
}

// ─── Weight Chart ──────────────────────────────────────────────
function WeightChart({ weightLogs, targetWeight }) {
  const recent = [...(weightLogs || [])].slice(0, 7).reverse();
  if (!recent.length) return (
    <View style={s.emptyChart}>
      <Text style={s.emptyChartIcon}>⚖️</Text>
      <Text style={s.emptyChartTxt}>Log your weight daily to see trends</Text>
    </View>
  );
  const vals = recent.map(l => Number(l.weight) || 0);
  const minV  = Math.min(...vals, targetWeight) - 1;
  const maxV  = Math.max(...vals, targetWeight) + 1;
  const range = maxV - minV || 1;
  const H     = 80;
  return (
    <View style={s.chartArea}>
      {recent.map((l, i) => {
        const h        = Math.max(8, ((Number(l.weight) - minV) / range) * H);
        const isToday  = i === recent.length - 1;
        const isNear   = Math.abs(Number(l.weight) - targetWeight) < 0.5;
        const barColor = isNear ? C.green : isToday ? C.primary : C.cyan;
        const d        = l.date ? String(l.date).slice(5) : '';
        return (
          <View key={i} style={s.chartCol}>
            <Text style={[s.chartTip, { color: barColor }]}>{l.weight}</Text>
            <View style={[s.vBar, { height: h, backgroundColor: barColor, opacity: isToday ? 1 : 0.6 }]} />
            <Text style={s.chartDate}>{d}</Text>
          </View>
        );
      })}
      {targetWeight > 0 && (
        <View style={[s.targetLine, { bottom: ((targetWeight - minV) / range) * H + 14 }]}>
          <Text style={s.targetLineTxt}>target</Text>
        </View>
      )}
    </View>
  );
}

// ─── Workout Heatmap ───────────────────────────────────────────
function WorkoutHeatmap({ workoutLogs }) {
  const workoutDates = new Set(
    (workoutLogs || []).map(w => w.date && w.date.slice(0, 10)).filter(Boolean)
  );
  const days = [];
  const now  = new Date();
  for (let i = 6; i >= 0; i--) {
    const d       = new Date(now); d.setDate(now.getDate() - i);
    const ds      = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const dayName = ['S','M','T','W','T','F','S'][d.getDay()];
    days.push({ ds, dayName, active: workoutDates.has(ds), isToday: i === 0 });
  }
  const streak = (() => {
    let s = 0;
    for (let i = 0; i < 60; i++) {
      const d2 = new Date(now); d2.setDate(now.getDate() - i);
      const ds2 = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}-${String(d2.getDate()).padStart(2,'0')}`;
      if (workoutDates.has(ds2)) s++;
      else if (i > 0) break;
    }
    return s;
  })();
  return (
    <View>
      <View style={s.heatmapRow}>
        {days.map((d, i) => (
          <View key={i} style={s.heatmapCell}>
            <View style={[s.heatmapDot, d.active && s.heatmapDotActive, d.isToday && s.heatmapDotToday]}>
              {d.active && <Text style={s.heatmapCheck}>✓</Text>}
            </View>
            <Text style={[s.heatmapDay, d.isToday && { color: C.primary }]}>{d.dayName}</Text>
          </View>
        ))}
      </View>
      {streak > 1 && (
        <View style={s.streakBadge}>
          <Text style={s.streakTxt}>🔥 {streak}-day streak</Text>
        </View>
      )}
    </View>
  );
}

// ─── All-Time Analysis Block ───────────────────────────────────
function AllTimeAnalysis({ weightLogs, workoutLogs, sleepLogs, foodLogs, profile }) {
  const weight = useMemo(() => {
    const logs = (weightLogs || []).filter(l => Number(l.weight) > 0);
    if (logs.length < 3) return null;
    const sorted  = [...logs].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const weights = sorted.map(l => Number(l.weight));
    const first   = weights[0];
    const last    = weights[weights.length - 1];
    const change  = last - first;
    const highest = Math.max(...weights);
    const lowest  = Math.min(...weights);
    // 2-week trend
    const desc    = [...sorted].reverse();
    const r14     = desc.slice(0, 14);
    const p14     = desc.slice(14, 28);
    const avgR    = r14.reduce((a, w) => a + w, 0) / r14.length;
    const avgP    = p14.length ? p14.reduce((a, w) => a + w, 0) / p14.length : null;
    const trend   = avgP ? avgR - avgP : null;
    return { change, highest, lowest, total: logs.length, trend, first, last };
  }, [weightLogs]);

  const workout = useMemo(() => {
    const logs = workoutLogs || [];
    if (logs.length < 3) return null;
    // Unique workout days
    const days  = new Set(logs.map(l => String(l.date).slice(0, 10)));
    const total = days.size;
    // Most trained muscle
    const muscleCounts = {};
    logs.forEach(l => { muscleCounts[l.muscleGroup] = (muscleCounts[l.muscleGroup] || 0) + 1; });
    const topMuscle = Object.entries(muscleCounts).sort((a, b) => b[1] - a[1])[0];
    // Most logged exercise
    const exCounts = {};
    logs.forEach(l => { exCounts[l.exerciseName] = (exCounts[l.exerciseName] || 0) + 1; });
    const topEx = Object.entries(exCounts).sort((a, b) => b[1] - a[1])[0];
    // Workouts per week (last 4 vs prior 4 weeks)
    const now    = new Date();
    const recent = [...days].filter(d => (now - new Date(d)) < 28 * 86400000).length;
    const prior  = [...days].filter(d => {
      const diff = now - new Date(d);
      return diff >= 28 * 86400000 && diff < 56 * 86400000;
    }).length;
    const trend  = prior > 0 ? (recent / 4) - (prior / 4) : null;
    // Best lift ever — fall back to top-level log.weight if sets is absent
    let bestLift = null;
    logs.forEach(l => {
      const sets = Array.isArray(l.sets) && l.sets.length > 0 ? l.sets : [];
      if (sets.length > 0) {
        sets.forEach(s => {
          const w = parseFloat(s.weight) || 0;
          if (!bestLift || w > bestLift.weight) {
            bestLift = { weight: w, exercise: l.exerciseName };
          }
        });
      } else {
        const w = parseFloat(l.weight) || 0;
        if (w > 0 && (!bestLift || w > bestLift.weight)) {
          bestLift = { weight: w, exercise: l.exerciseName };
        }
      }
    });
    return { total, topMuscle: topMuscle?.[0], topEx: topEx?.[0], trend, bestLift };
  }, [workoutLogs]);

  const nutrition = useMemo(() => {
    const logs = foodLogs || [];
    if (logs.length === 0) return null;
    const byDate = {};
    logs.forEach(l => {
      const d = l.date && String(l.date).slice(0, 10);
      if (!d) return;
      if (!byDate[d]) byDate[d] = 0;
      byDate[d] += Number(l.calories) || 0;
    });
    const days   = Object.values(byDate);
    if (days.length < 3) return null;
    const avg    = days.reduce((a, b) => a + b, 0) / days.length;
    const cT     = profile?.calorieTarget || 2300;
    const metPct = Math.round((days.filter(d => d >= cT * 0.9 && d <= cT * 1.15).length / days.length) * 100);
    return { avg, metPct, total: days.length };
  }, [foodLogs, profile]);

  const sleep = useMemo(() => {
    // Include legacy logs that have no sleepType field (treated as night sleep)
    const logs = (sleepLogs || []).filter(l => (l.sleepType === 'night' || !l.sleepType) && Number(l.duration) > 0);
    if (logs.length < 3) return null;
    const durations = logs.map(l => Number(l.duration));
    const avg       = durations.reduce((a, b) => a + b, 0) / durations.length;
    const sT        = profile?.sleepTarget || 8;
    const metPct    = Math.round((durations.filter(d => d >= sT).length / durations.length) * 100);
    // Count unique nights logged (not raw entries)
    const uniqueNights = new Set(logs.map(l => String(l.date).slice(0, 10))).size;
    return { avg, metPct, total: uniqueNights };
  }, [sleepLogs, profile]);

  if (!weight && !workout && !nutrition && !sleep) return null;

  return (
    <View style={s.card}>
      <Text style={s.cardHdr}>📊 All-Time Analysis</Text>

      {/* Weight */}
      {weight && (
        <View style={s.analysisSection}>
          <Text style={s.analysisSectionTitle}>⚖️ Weight</Text>
          <View style={s.analysisGrid}>
            <AnalysisCell label="Total Logs"    val={String(weight.total)}                                    color={C.cyan}    />
            <AnalysisCell label="Starting"      val={`${weight.first} kg`}                                    color={C.muted2}  />
            <AnalysisCell label="Current"       val={`${weight.last} kg`}                                     color={C.primary} />
            <AnalysisCell label="Total Change"  val={`${weight.change >= 0 ? '+' : ''}${f2(weight.change)} kg`} color={weight.change <= 0 ? C.green : C.rose} />
            <AnalysisCell label="Highest"       val={`${weight.highest} kg`}                                  color={C.amber}   />
            <AnalysisCell label="Lowest"        val={`${weight.lowest} kg`}                                   color={C.green}   />
          </View>
          {weight.trend !== null && (
            <TrendBanner
              up={weight.trend <= 0}
              text={weight.change <= 0
                ? `📉 Down ${f2(Math.abs(weight.trend))} kg vs prior 2 weeks — great progress!`
                : `📈 Up ${f2(Math.abs(weight.trend))} kg vs prior 2 weeks`}
            />
          )}
        </View>
      )}

      {/* Workouts */}
      {workout && (
        <View style={s.analysisSection}>
          <Text style={s.analysisSectionTitle}>💪 Workouts</Text>
          <View style={s.analysisGrid}>
            <AnalysisCell label="Total Workout Days"  val={String(workout.total)}               color={C.primary} />
            <AnalysisCell label="Favourite Muscle"    val={workout.topMuscle || '—'}            color={C.cyan}    />
            <AnalysisCell label="Most Logged Exercise" val={workout.topEx || '—'}               color={C.amber}   />
            <AnalysisCell label="Best Lift Ever"
              val={workout.bestLift ? `${workout.bestLift.weight} kg` : '—'}
              sub={workout.bestLift?.exercise}
              color={C.green}
            />
          </View>
          {workout.trend !== null && (
            <TrendBanner
              up={workout.trend >= 0}
              text={workout.trend >= 0
                ? `📈 +${f2(workout.trend)} workouts/week vs prior 4 weeks`
                : `📉 ${f2(Math.abs(workout.trend))} fewer workouts/week vs prior 4 weeks`}
            />
          )}
        </View>
      )}

      {/* Nutrition */}
      {nutrition && (
        <View style={s.analysisSection}>
          <Text style={s.analysisSectionTitle}>🥗 Nutrition</Text>
          <View style={s.analysisGrid}>
            <AnalysisCell label="Days Logged"       val={String(nutrition.total)}                color={C.cyan}    />
            <AnalysisCell label="Avg Daily Calories" val={`${f2(nutrition.avg)} kcal`}           color={C.primary} />
            <AnalysisCell label="Calorie Goal Met"  val={`${nutrition.metPct}% of days`}         color={C.green}   />
          </View>
        </View>
      )}

      {/* Sleep */}
      {sleep && (
        <View style={[s.analysisSection, { borderBottomWidth: 0, marginBottom: 0 }]}>
          <Text style={s.analysisSectionTitle}>🛌 Sleep</Text>
          <View style={s.analysisGrid}>
            <AnalysisCell label="Nights Logged"   val={String(sleep.total)}                     color={C.cyan}    />
            <AnalysisCell label="Avg Duration"    val={formatDur(sleep.avg)}                    color='#7c5cfc'   />
            <AnalysisCell label="Target Met"      val={`${sleep.metPct}% of nights`}            color={C.green}   />
          </View>
        </View>
      )}
    </View>
  );
}

function AnalysisCell({ label, val, sub, color }) {
  return (
    <View style={s.analysisCell}>
      <Text style={[s.analysisCellVal, { color }]}>{val}</Text>
      {sub ? <Text style={[s.analysisCellSub, { color }]}>{sub}</Text> : null}
      <Text style={s.analysisCellLabel}>{label}</Text>
    </View>
  );
}

function TrendBanner({ up, text }) {
  const bg  = up ? 'rgba(16,185,129,0.1)'  : 'rgba(244,63,94,0.1)';
  const bc  = up ? 'rgba(16,185,129,0.3)'  : 'rgba(244,63,94,0.3)';
  const clr = up ? C.green : C.rose;
  return (
    <View style={[s.trendBanner, { backgroundColor: bg, borderColor: bc }]}>
      <Text style={{ color: clr, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function formatDur(h) {
  if (!h) return '—';
  const hrs  = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`;
}

// ─── Main ──────────────────────────────────────────────────────

function WaterCard({ profile, waterLogs=[], onAddWater, onUpdateWater, onDeleteWater }) {
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const today = dateKey(new Date());
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [calYear, setCalYear] = React.useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = React.useState(new Date().getMonth());
  const [editingId,setEditingId]=React.useState(null);
  const [editValue,setEditValue]=React.useState('');
  const [custom,setCustom]=React.useState('');

  const selectedLogs = waterLogs.filter(w=>String(w.date).slice(0,10)===selectedDate);
  const total = selectedLogs.reduce((a,w)=>a+(Number(w.amountMl)||0),0);
  const target = Number(profile.waterTargetMl)||2500;
  const pct = Math.min(100, Math.round(total/target*100));
  const selected = new Date(`${selectedDate}T12:00:00`);
  const changeDay = delta => {
    const d = new Date(selected); d.setDate(d.getDate()+delta);
    const next = dateKey(d);
    if (next <= today) setSelectedDate(next);
  };
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const first = new Date(calYear, calMonth, 1).getDay();
  const cells=[];
  for(let i=0;i<first;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);
  while(cells.length%7) cells.push(null);
  const prevMonth=()=>{if(calMonth===0){setCalYear(y=>y-1);setCalMonth(11)}else setCalMonth(m=>m-1)};
  const nextMonth=()=>{if(calMonth===11){setCalYear(y=>y+1);setCalMonth(0)}else setCalMonth(m=>m+1)};
  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const dayNames=['Su','Mo','Tu','We','Th','Fr','Sa'];

  return <View style={s.card}>
    <View style={s.cardHeaderRow}><Text style={s.cardHdr}>💧 Water</Text><Text style={{color:C.cyan,fontWeight:'800'}}>{(total/1000).toFixed(2)} / {(target/1000).toFixed(1)} L</Text></View>
    <View style={s.waterDateRow}>
      <TouchableOpacity onPress={()=>changeDay(-1)} style={s.waterDateNav}><Text style={s.waterDateNavTxt}>‹</Text></TouchableOpacity>
      <TouchableOpacity onPress={()=>setCalendarOpen(true)} style={s.waterDateSelector}><Text style={s.waterDateText}>📅 {selectedDate === today ? 'Today' : selectedDate}</Text></TouchableOpacity>
      <TouchableOpacity disabled={selectedDate===today} onPress={()=>changeDay(1)} style={[s.waterDateNav,selectedDate===today&&{opacity:.3}]}><Text style={s.waterDateNavTxt}>›</Text></TouchableOpacity>
    </View>
    <View style={s.track}><View style={[s.fill,{width:`${pct}%`,backgroundColor:C.cyan}]} /></View><Text style={s.waterPct}>{pct}% of target</Text>
    <View style={s.quickWaterRow}>{[250,500,750,1000].map(v=><TouchableOpacity key={v} style={s.waterBtn} onPress={()=>onAddWater?.(v, selectedDate)}><Text style={s.waterBtnText}>+{v>=1000?'1 L':`${v} ml`}</Text></TouchableOpacity>)}</View>
    <View style={s.customWaterRow}><ClearableTextInput style={s.customWaterInput} value={custom} onChangeText={setCustom} keyboardType="numeric" placeholder="Custom ml" placeholderTextColor={C.muted2}/><TouchableOpacity style={s.waterBtn} onPress={()=>{const v=Number(custom);if(v>0){onAddWater?.(v, selectedDate);setCustom('')}}}><Text style={s.waterBtnText}>+ Add</Text></TouchableOpacity></View>
    {selectedLogs.slice().reverse().slice(0,5).map(log=><View key={log.id} style={s.waterLogRow}>
      {editingId===log.id ? <><ClearableTextInput style={s.waterEditInput} value={editValue} onChangeText={setEditValue} keyboardType="numeric"/><TouchableOpacity onPress={()=>{onUpdateWater?.(log.id,{amountMl:Number(editValue)||log.amountMl});setEditingId(null)}}><Text style={s.actionTxt}>Save</Text></TouchableOpacity></> : <><Text style={s.waterLogTxt}>{Number(log.amountMl)} ml</Text><TouchableOpacity onPress={()=>{setEditingId(log.id);setEditValue(String(log.amountMl))}}><Text style={s.actionTxt}>Edit</Text></TouchableOpacity><TouchableOpacity onPress={()=>onDeleteWater?.(log.id)}><Text style={s.deleteTxt}>Delete</Text></TouchableOpacity></>}
    </View>)}
    <Text style={s.waterHistory}>7-day average: {(() => { const days=[...new Set(waterLogs.map(x=>String(x.date).slice(0,10)))].sort().reverse().slice(0,7); const vals=days.map(d=>waterLogs.filter(x=>String(x.date).slice(0,10)===d).reduce((a,x)=>a+(Number(x.amountMl)||0),0)); return days.length?(Math.round(vals.reduce((a,b)=>a+b,0)/days.length)/1000).toFixed(2):'0.00'; })()} L/day</Text>

    <Modal visible={calendarOpen} transparent animationType="fade" onRequestClose={()=>setCalendarOpen(false)}>
      <View style={s.calendarOverlay}>
        <View style={s.calendarModal}>
          <View style={s.calHeader}><TouchableOpacity onPress={prevMonth} style={s.calNavBtn}><Text style={s.calNavText}>‹</Text></TouchableOpacity><Text style={s.calMonthLabel}>{monthNames[calMonth]} {calYear}</Text><TouchableOpacity onPress={nextMonth} style={s.calNavBtn}><Text style={s.calNavText}>›</Text></TouchableOpacity></View>
          <View style={s.calDayRow}>{dayNames.map(d=><Text key={d} style={s.calDayName}>{d}</Text>)}</View>
          {Array.from({length:cells.length/7},(_,wi)=><View key={wi} style={s.calWeekRow}>{cells.slice(wi*7,wi*7+7).map((day,di)=>{if(!day)return <View key={di} style={s.calCell}/>;const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;const has=waterLogs.some(w=>String(w.date).slice(0,10)===ds);const sel=selectedDate===ds;const future=ds>today;return <TouchableOpacity key={di} disabled={future} onPress={()=>{setSelectedDate(ds);setCalendarOpen(false)}} style={[s.calCell,has&&s.calCellHasDot,sel&&s.calCellSelected,future&&{opacity:.3}]}><Text style={[s.calCellText,sel&&s.calCellTextSel]}>{day}</Text>{has&&!sel&&<View style={s.calDot}/>}</TouchableOpacity>})}</View>)}
          <TouchableOpacity style={s.calClearBtn} onPress={()=>{setSelectedDate(today);setCalendarOpen(false)}}><Text style={s.calClearText}>Go to today</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  </View>;
}

// Compact date picker (same pattern already duplicated in Nutrition.js and
// Sleep.js -- kept as a third small self-contained copy here rather than
// extracting a shared module, consistent with how those two already do it).
// Lets the user jump to any date to view that date's recovery score.
const CAL_MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAY_NAMES = ['S','M','T','W','T','F','S'];
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function firstDayOfMonth(y, m) { return new Date(y, m, 1).getDay(); }

function CompactDatePicker({ selectedDate, onSelect, markedDates }) {
  const [open, setOpen] = React.useState(false);
  const sel = new Date(selectedDate + 'T00:00:00');
  const [viewYear, setViewYear] = React.useState(sel.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(sel.getMonth());

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
        <Text style={s.compactDateBtnText}>📅 {selectedDate === todayStr() ? 'Today' : selectedDate} · Jump to date…</Text>
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
                  const isToday = dStr === todayStr();
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
            <TouchableOpacity style={s.compactCalTodayBtn} onPress={() => { onSelect(todayStr()); setOpen(false); }}>
              <Text style={s.compactCalTodayBtnText}>Go to Today</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A cheap, deterministic fingerprint of everything that feeds into a given
// date's recovery score. Used to detect "the user edited a historical
// date's nutrition/sleep/water/workout data after we already calculated
// and stored a recovery score for it" -- without this, a stored score would
// be served forever even after the underlying inputs changed. Any change to
// any of these totals changes the signature, which is exactly what forces
// a recalculation on the next lookup.
function recoveryInputSignature(date, sleepLogs, foodLogs, waterLogs, workoutLogs) {
  const onDate = arr => (arr || []).filter(x => String(x.date).slice(0, 10) === date);
  const sleep = onDate(sleepLogs).reduce((a, s) => a + (Number(s.duration) || 0), 0);
  const food = onDate(foodLogs).reduce((a, f) => ({
    cal: a.cal + (Number(f.calories) || 0), prot: a.prot + (Number(f.protein) || 0), fibre: a.fibre + (Number(f.fibre) || 0),
  }), { cal: 0, prot: 0, fibre: 0 });
  const water = onDate(waterLogs).reduce((a, w) => a + (Number(w.amountMl) || 0), 0);
  const workouts = onDate(workoutLogs).length;
  return `${sleep}|${food.cal}|${food.prot}|${food.fibre}|${water}|${workouts}`;
}

function RecoveryCard({ profile, sleepLogs, foodLogs, waterLogs, workoutLogs }) {
  const [selectedDate, setSelectedDate] = React.useState(todayStr());
  const [rec, setRec] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // Dates that have any underlying data at all, so the calendar can show a
  // dot on days worth checking -- purely a UI hint, doesn't affect logic.
  const markedDates = React.useMemo(() => {
    const set = new Set();
    [sleepLogs, foodLogs, waterLogs, workoutLogs].forEach(arr =>
      (arr || []).forEach(x => { if (x?.date) set.add(String(x.date).slice(0, 10)); }));
    return set;
  }, [sleepLogs, foodLogs, waterLogs, workoutLogs]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const signature = recoveryInputSignature(selectedDate, sleepLogs, foodLogs, waterLogs, workoutLogs);
      const stored = await database.getRecoveryScoreForDate(selectedDate);
      if (stored && stored.inputSignature === signature) {
        // Stored score still matches today's actual logs for that date --
        // use it as-is, no recalculation needed.
        if (!cancelled) { setRec(stored); setLoading(false); }
        return;
      }
      // No stored score, OR the underlying data has changed since it was
      // stored (signature mismatch) -- recalculate using the exact same
      // calculateRecovery logic used for the live "today" card, anchored
      // to the selected date via asOf. Logs are pre-filtered to <= the
      // selected date as an extra safeguard against ever pulling in
      // same-day-or-later data that doesn't belong to this historical view.
      const asOf = new Date(selectedDate + 'T00:00:00');
      const upTo = arr => (arr || []).filter(x => String(x.date).slice(0, 10) <= selectedDate);
      const freshRec = calculateRecovery({
        profile, asOf,
        sleepLogs: upTo(sleepLogs), foodLogs: upTo(foodLogs), waterLogs: upTo(waterLogs), workoutLogs: upTo(workoutLogs),
      });
      if (freshRec.available) {
        const saved = await database.saveRecoveryScoreForDate(selectedDate, { ...freshRec, inputSignature: signature });
        if (!cancelled) { setRec(saved); setLoading(false); }
      } else {
        // Nothing to calculate for this date -- don't fabricate/store a
        // score, and don't overwrite any previously-stored one either.
        if (!cancelled) { setRec(freshRec); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate, profile, sleepLogs, foodLogs, waterLogs, workoutLogs]);

  const isToday = selectedDate === todayStr();

  return <View style={s.card}>
    <Text style={s.cardHdr}>❤️ Recovery Score</Text>
    <CompactDatePicker selectedDate={selectedDate} onSelect={setSelectedDate} markedDates={markedDates} />
    {!isToday && <Text style={s.recoveryDateLabel}>Showing recovery for {selectedDate}</Text>}
    {loading ? <Text style={s.emptyChartTxt}>Calculating…</Text>
      : !rec?.available ? <Text style={s.emptyChartTxt}>Not enough data to calculate recovery for this date.</Text>
      : <><View style={s.recoveryTop}><Text style={s.recoveryScore}>{rec.score}</Text><View><Text style={s.recoveryLabel}>{rec.label}</Text><Text style={s.scoreMetaSub}>Deterministic &amp; based on your actual logs</Text></View></View>{rec.reasons.map((r,i)=><Text key={i} style={s.recoveryReason}>• {r}</Text>)}</>}
  </View>;
}

function WeeklyReportCard({ profile, weightLogs, workoutLogs, sleepLogs, foodLogs, waterLogs }) {
  const [weekOffset,setWeekOffset]=React.useState(0);
  const r=React.useMemo(() => buildWeeklyReport({profile,weightLogs,workoutLogs,sleepLogs,foodLogs,waterLogs,weekOffset}), [profile,weightLogs,workoutLogs,sleepLogs,foodLogs,waterLogs,weekOffset]);
  return <View style={s.card}><View style={s.cardHeaderRow}><Text style={s.cardHdr}>📊 Weekly Fitness Report</Text><View style={s.weekNav}><TouchableOpacity onPress={()=>setWeekOffset(v=>v+1)}><Text style={s.actionTxt}>‹</Text></TouchableOpacity><Text style={s.weekLabel}>{(() => { const end=new Date(); end.setDate(end.getDate()-weekOffset*7); const start=new Date(end); start.setDate(end.getDate()-6); const fmt=d=>d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); return `${fmt(start)} – ${fmt(end)}`; })()}</Text><TouchableOpacity disabled={weekOffset===0} onPress={()=>setWeekOffset(v=>Math.max(0,v-1))}><Text style={[s.actionTxt,weekOffset===0&&{opacity:.3}]}>›</Text></TouchableOpacity></View></View>
    <View style={s.reportGrid}>{[
      ['🏋️ Workouts',`${r.workout.days}/${r.workout.target}`],['🥩 Protein',`${r.nutrition.avgProtein} g/day`],['🔥 Calories',`${r.nutrition.avgCalories} kcal/day`],['💧 Water',`${(r.water.avgMl/1000).toFixed(2)} L/day`],['🛌 Sleep',`${r.sleep.avg.toFixed(1)} h`],['⚖️ Weight',r.weight.change==null?'—':`${r.weight.change>=0?'+':''}${r.weight.change.toFixed(1)} kg`],['❤️ Recovery',r.recovery.average==null?'—':`${r.recovery.average}`],['🏆 New PRs',String(r.prs.length)]
    ].map(([a,b])=><View key={a} style={s.reportCell}><Text style={s.reportLabel}>{a}</Text><Text style={s.reportValue}>{b}</Text></View>)}</View>
    <Text style={s.reportSub}>Overall weekly score: <Text style={{color:C.primary,fontWeight:'900'}}>{r.overall}/100</Text> · Most trained: {r.workout.mostTrained}</Text>
    {r.prs.slice(0,3).map(pr=><Text key={pr.exercise} style={s.reportPR}>🏆 {pr.exercise} — {pr.weight} kg</Text>)}
  </View>;
}

function ProgressPhotosCard({ photos=[], onAdd, onDelete, photoPinHash, onSetPhotoPin, categories=[], onAddCategory, onDeleteCategory }) {
  const [filter, setFilter] = React.useState('all');
  const [dateFilter, setDateFilter] = React.useState('none');
  const [before, setBefore] = React.useState(null);
  const [after, setAfter] = React.useState(null);
  const [busyType, setBusyType] = React.useState(null);

  // Full category list = the 3 built-in defaults (front/side/back — always
  // present, never removable) + whatever custom categories the user has
  // added (e.g. "chest", "arms"). Nothing in this component is hard-coded
  // to only three categories beyond that starting set.
  const allCategories = React.useMemo(
    () => [...DEFAULT_PROGRESS_PHOTO_CATEGORIES, ...categories.map(c => ({ key: c.key, label: c.label, custom: true }))],
    [categories]
  );

  // ── Add Category modal ──────────────────────────────────────────────
  const [addCategoryOpen, setAddCategoryOpen] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [addCategoryError, setAddCategoryError] = React.useState('');
  const [addCategoryBusy, setAddCategoryBusy] = React.useState(false);

  const submitAddCategory = async () => {
    if (addCategoryBusy) return; // re-entry guard: ignore a second trigger (e.g. keyboard "return" firing just as the Add button is also tapped) while the first submission is still in flight
    const trimmed = newCategoryName.trim();
    if (!trimmed) { setAddCategoryError('Enter a category name.'); return; }
    if (allCategories.some(c => c.label.toLowerCase() === trimmed.toLowerCase())) {
      setAddCategoryError('That category already exists.');
      return;
    }
    setAddCategoryBusy(true);
    try {
      await onAddCategory?.(trimmed);
      setAddCategoryOpen(false);
      setNewCategoryName('');
      setAddCategoryError('');
    } catch (e) {
      setAddCategoryError(String(e?.message || 'Could not add that category.'));
    } finally {
      setAddCategoryBusy(false);
    }
  };

  // ── Privacy lock ──────────────────────────────────────────────────────
  // `unlocked` only lives in this component's memory — it's never
  // persisted, so re-opening the app (or navigating away and back, since
  // this card is remounted with the rest of the screen) always starts
  // locked again. photoPinHash is a hash only; the raw password is never
  // stored or transmitted anywhere.
  const [unlocked, setUnlocked] = React.useState(false);
  const [lockOpen, setLockOpen] = React.useState(false);
  // stages: 'unlock' | 'setup' | 'setup-confirm' | 'change-current' | 'change-new' | 'change-confirm'
  const [lockStage, setLockStage] = React.useState('unlock');
  const [pinValue, setPinValue] = React.useState('');
  const [pinDraft, setPinDraft] = React.useState('');
  const [lockError, setLockError] = React.useState('');
  const pendingActionRef = React.useRef(null);

  const openLock = (stage, action) => {
    pendingActionRef.current = action || null;
    setPinValue(''); setPinDraft(''); setLockError('');
    setLockStage(stage);
    setLockOpen(true);
  };

  // Gate any action that should require the password first. If already
  // unlocked this session, runs immediately; otherwise prompts for the
  // password (or, the very first time, asks the user to set one up) and
  // runs the action only after it's entered correctly.
  const requireUnlock = (action) => {
    if (unlocked) { action(); return; }
    openLock(photoPinHash ? 'unlock' : 'setup', action);
  };

  // Stronger gate used only for category deletion. Always re-prompts for
  // the password regardless of `unlocked` -- a fresh password entry is
  // required at the moment of deletion itself, layered on top of already
  // needing to be unlocked just to see the delete (×) button in the first
  // place. Reuses the same openLock/password flow as requireUnlock, just
  // without its "skip if already unlocked" shortcut.
  const requireReauth = (action) => {
    openLock(photoPinHash ? 'unlock' : 'setup', action);
  };

  const closeLock = () => {
    setLockOpen(false);
    pendingActionRef.current = null;
    setPinValue(''); setPinDraft(''); setLockError('');
  };

  const submitLock = async () => {
    const val = pinValue.trim();
    if (lockStage === 'unlock') {
      if (!val) { setLockError('Enter your password.'); return; }
      if (hashPin(val) !== photoPinHash) { setLockError('Incorrect password. Try again.'); setPinValue(''); return; }
      setUnlocked(true);
      const run = pendingActionRef.current;
      closeLock();
      run?.();
      return;
    }
    if (lockStage === 'setup') {
      if (val.length < 4) { setLockError('Use at least 4 characters.'); return; }
      setPinDraft(val); setPinValue(''); setLockError('');
      setLockStage('setup-confirm');
      return;
    }
    if (lockStage === 'setup-confirm') {
      if (val !== pinDraft) { setLockError('Passwords did not match — try again.'); setPinValue(''); setPinDraft(''); setLockStage('setup'); return; }
      await onSetPhotoPin?.(hashPin(val));
      setUnlocked(true);
      const run = pendingActionRef.current;
      closeLock();
      run?.();
      return;
    }
    if (lockStage === 'change-current') {
      if (hashPin(val) !== photoPinHash) { setLockError('Incorrect current password.'); setPinValue(''); return; }
      setPinValue(''); setLockError('');
      setLockStage('change-new');
      return;
    }
    if (lockStage === 'change-new') {
      if (val.length < 4) { setLockError('Use at least 4 characters.'); return; }
      setPinDraft(val); setPinValue(''); setLockError('');
      setLockStage('change-confirm');
      return;
    }
    if (lockStage === 'change-confirm') {
      if (val !== pinDraft) { setLockError('Passwords did not match — try again.'); setPinValue(''); setPinDraft(''); setLockStage('change-new'); return; }
      await onSetPhotoPin?.(hashPin(val));
      closeLock();
      Alert.alert('Password updated', 'Your Progress Photos password has been changed.');
      return;
    }
  };

  const dates = [...new Set(photos.map(p => p.date).filter(Boolean))].sort().reverse();
  const weekKey = date => {
    const d = new Date(`${date}T00:00:00`);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day + 3);
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const firstDay = (firstThursday.getDay() + 6) % 7;
    const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + firstDay) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  };
  const currentWeek = weekKey(new Date().toISOString().slice(0, 10));
  const isUsedThisWeek = type => photos.some(p => {
    const pWeek = p.weekKey || (p.date ? weekKey(String(p.date).slice(0, 10)) : '');
    return pWeek === currentWeek && String(p.type || '').toLowerCase() === type;
  });

  // Only build Image elements after the user has explicitly selected a date.
  const filtered = dateFilter === 'none' ? [] : photos
    .filter(p => (filter === 'all' || p.type === filter) && (dateFilter === 'all' || p.date === dateFilter))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const doAdd = async type => {
    if (Platform.OS === 'web') {
      Alert.alert('Mobile feature', 'Camera/library progress photos are available on Android/iOS.');
      return;
    }
    if (isUsedThisWeek(type)) {
      Alert.alert('Weekly photo already saved', `You already have a ${type} progress photo for this week. Select its date below to view it.`);
      return;
    }
    if (busyType) return;
    setBusyType(type);
    const finish = () => setBusyType(null);
    try {
      Alert.alert(
        `Add ${type} photo`,
        'After you crop, rotate or flip the image, FitTrack saves it to this device automatically.',
        [
          { text: 'Cancel', style: 'cancel', onPress: finish },
          {
            text: 'Camera',
            onPress: async () => {
              const photo = await takeProgressPhoto(type);
              if (photo) { await onAdd?.(photo); Alert.alert('Photo saved', `${type[0].toUpperCase()+type.slice(1)} photo saved for this week.`); }
              else Alert.alert('Could not save photo', 'Please try again and check camera/storage permissions.');
              finish();
            },
          },
          {
            text: 'Photo Library',
            onPress: async () => {
              const photo = await pickProgressPhoto(type);
              if (photo) { await onAdd?.(photo); Alert.alert('Photo saved', `${type[0].toUpperCase()+type.slice(1)} photo saved for this week.`); }
              else Alert.alert('Could not save photo', 'Please try again and check photo-library permissions.');
              finish();
            },
          },
        ],
      );
    } catch { finish(); }
  };
  const add = type => requireUnlock(() => doAdd(type));

  const selectDate = t => {
    if (t === 'none') { setDateFilter('none'); return; }
    requireUnlock(() => { setDateFilter(t); setBefore(null); setAfter(null); });
  };

  const lockTitle = {
    unlock: 'Enter Password',
    setup: 'Protect Your Photos',
    'setup-confirm': 'Confirm Password',
    'change-current': 'Enter Current Password',
    'change-new': 'New Password',
    'change-confirm': 'Confirm New Password',
  }[lockStage];
  const lockSubtitle = {
    unlock: 'Enter your password to upload or view progress photos.',
    setup: 'Set a password so only you can upload or view your progress photos. Use at least 4 characters.',
    'setup-confirm': 'Re-enter the password to confirm.',
    'change-current': 'Enter your current password to continue.',
    'change-new': 'Choose a new password (at least 4 characters).',
    'change-confirm': 'Re-enter the new password to confirm.',
  }[lockStage];
  const lockButtonLabel = lockStage === 'unlock' ? 'Unlock'
    : lockStage.endsWith('confirm') ? 'Confirm'
    : 'Continue';

  return (
    <View style={s.card}>
      <Text style={s.cardHdr}>📸 Progress Photos</Text>
      <Text style={s.photoPrivacy}>Stored only on this device. Photos are never uploaded to AI or analytics.</Text>
      {photoPinHash && (
        <View style={s.lockStatusRow}>
          <Text style={s.lockStatusTxt}>{unlocked ? '🔓 Unlocked for this session' : '🔒 Password protected'}</Text>
          {unlocked ? (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => openLock('change-current')}><Text style={s.actionTxt}>Change password</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { setUnlocked(false); setDateFilter('none'); setBefore(null); setAfter(null); }}><Text style={s.deleteTxt}>Lock now</Text></TouchableOpacity>
            </View>
          ) : null}
        </View>
      )}
      <Text style={s.photoSectionLabel}>Weekly check-in</Text>
      <View style={s.photoAddRow}>
        {allCategories.map(({ key: type, label, custom }) => {
          const used = isUsedThisWeek(type);
          const confirmDeleteCategory = () => {
            const msg = `Delete the "${label}" category? This will permanently delete ALL photos saved under this category, along with their image files. This cannot be undone.`;
            const doDelete = () => requireReauth(() => onDeleteCategory?.(type));
            if (Platform.OS === 'web') { if (window.confirm(msg)) doDelete(); }
            else Alert.alert('Delete Category', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]);
          };
          return (
            <View key={type} style={s.photoAddBtnWrap}>
              <TouchableOpacity
                style={[s.photoAddBtn, used && s.photoAddBtnDisabled]}
                onPress={() => add(type)}
                disabled={!!busyType}
              >
                <Text style={s.photoAddText}>{used ? '✓ ' : '+ '}{label}</Text>
              </TouchableOpacity>
              {/* Delete affordance for custom categories only (front/side/back
                  can't be removed), and only once the section is unlocked --
                  hidden entirely while locked, not just gated on tap. */}
              {custom && unlocked && (
                <TouchableOpacity style={s.photoCategoryDeleteBtn} onPress={confirmDeleteCategory} hitSlop={{top:8,bottom:8,left:8,right:8}}>
                  <Text style={s.photoCategoryDeleteText}>×</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <TouchableOpacity style={[s.photoAddBtn, s.photoAddCategoryBtn]} onPress={() => requireUnlock(() => { setNewCategoryName(''); setAddCategoryError(''); setAddCategoryOpen(true); })}>
          <Text style={[s.photoAddText, { color: C.primary }]}>+ Category</Text>
        </TouchableOpacity>
      </View>

      <Text style={s.photoSectionLabel}>View saved photos</Text>
      <View style={s.photoFilterRow}>
        {['none', 'all', ...dates.slice(0, 6)].map(t => <TouchableOpacity key={`date_${t}`} style={[s.photoFilter, dateFilter === t && s.photoFilterActive]} onPress={() => selectDate(t)}>
          <Text style={s.photoFilterText}>{t === 'none' ? 'Choose date' : t === 'all' ? 'All dates' : t}</Text>
        </TouchableOpacity>)}
      </View>

      {dateFilter === 'none' ? <Text style={s.photoEmptyTxt}>Select a date to load its images. Photos stay unloaded — and locked — until you request them.</Text> : <>
        <View style={s.photoFilterRow}>
          {[{ key: 'all', label: 'All' }, ...allCategories].map(({ key: t, label }) => <TouchableOpacity key={t} style={[s.photoFilter, filter === t && s.photoFilterActive]} onPress={() => setFilter(t)}>
            <Text style={s.photoFilterText}>{label}</Text>
          </TouchableOpacity>)}
        </View>
        {filtered.length ? <View style={s.photoGrid}>{filtered.map(p => <View key={p.id} style={s.photoItem}>
          {p.imageFound === false ? (
            <View style={[s.photoImg, { alignItems: 'center', justifyContent: 'center', padding: 6 }]}>
              <Text style={{ color: C.muted2, fontSize: 10, textAlign: 'center' }}>Image not found on this device</Text>
            </View>
          ) : (
            <Image source={{ uri: p.uri }} style={s.photoImg} resizeMode="cover" />
          )}
          <Text style={s.photoDate}>{p.date} · {p.type}</Text>
          <TouchableOpacity onPress={() => {
            const msg = 'Delete this image? This cannot be undone.';
            const doDelete = () => onDelete?.(p.id, p.uri);
            if (Platform.OS === 'web') { if (window.confirm(msg)) doDelete(); }
            else Alert.alert('Delete Photo', msg, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]);
          }}><Text style={s.deleteTxt}>Delete</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => before ? setAfter(p) : setBefore(p)}><Text style={s.actionTxt}>{before ? 'Use as After' : 'Use as Before'}</Text></TouchableOpacity>
        </View>)}</View> : <Text style={s.photoEmptyTxt}>No photos saved for this date.</Text>}
      </>}

      {before && after && <View style={s.compareBox}>
        <Text style={s.compareTitle}>Before / After</Text>
        <View style={s.compareRow}>
          <View style={s.compareCol}><Image source={{ uri: before.uri }} style={s.compareImg} /><Text style={s.photoDate}>{before.date}</Text></View>
          <View style={s.compareCol}><Image source={{ uri: after.uri }} style={s.compareImg} /><Text style={s.photoDate}>{after.date}</Text></View>
        </View>
        <TouchableOpacity onPress={() => { setBefore(null); setAfter(null); }}><Text style={s.actionTxt}>Clear comparison</Text></TouchableOpacity>
      </View>}

      <Modal visible={lockOpen} transparent animationType="fade" onRequestClose={closeLock}>
        {/* RN Modal renders in its own native root, so it does NOT inherit
            the KeyboardAvoidingView wrapping the rest of this screen — that
            was why the keyboard could cover this password field. Wrapping
            the modal's own content fixes it without touching anything
            outside the modal. */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.calendarOverlay}>
            <View style={s.calendarModal}>
              <Text style={s.lockModalTitle}>🔒 {lockTitle}</Text>
              <Text style={s.lockModalSubtitle}>{lockSubtitle}</Text>
              <ClearableTextInput
                style={s.lockInput}
                value={pinValue}
                onChangeText={t => { setPinValue(t); if (lockError) setLockError(''); }}
                placeholder="Password"
                placeholderTextColor={C.muted2}
                secureTextEntry
                autoFocus
                onSubmitEditing={submitLock}
              />
              {!!lockError && <Text style={s.lockErrorTxt}>{lockError}</Text>}
              <View style={s.lockBtnRow}>
                <TouchableOpacity style={s.lockCancelBtn} onPress={closeLock}><Text style={s.lockCancelTxt}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={s.lockSubmitBtn} onPress={submitLock}><Text style={s.lockSubmitTxt}>{lockButtonLabel}</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={addCategoryOpen} transparent animationType="fade" onRequestClose={() => setAddCategoryOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.calendarOverlay}>
            <View style={s.calendarModal}>
              <Text style={s.lockModalTitle}>+ Add Category</Text>
              <Text style={s.lockModalSubtitle}>Create a custom Progress Photo category, e.g. "Chest" or "Legs".</Text>
              <ClearableTextInput
                style={s.lockInput}
                value={newCategoryName}
                onChangeText={t => { setNewCategoryName(t); if (addCategoryError) setAddCategoryError(''); }}
                placeholder="Category name"
                placeholderTextColor={C.muted2}
                autoFocus
                autoCapitalize="words"
                onSubmitEditing={submitAddCategory}
              />
              {!!addCategoryError && <Text style={s.lockErrorTxt}>{addCategoryError}</Text>}
              <View style={s.lockBtnRow}>
                <TouchableOpacity style={s.lockCancelBtn} onPress={() => setAddCategoryOpen(false)}><Text style={s.lockCancelTxt}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={s.lockSubmitBtn} onPress={submitAddCategory} disabled={addCategoryBusy}>
                  <Text style={s.lockSubmitTxt}>{addCategoryBusy ? 'Adding…' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export default function Dashboard({ profile, todayStats, weightLogs, workoutLogs, sleepLogs, foodLogs, waterLogs=[], progressPhotos=[], photoPinHash, onSetPhotoPin, onAddWater, onUpdateWater, onDeleteWater, onAddProgressPhoto, onDeleteProgressPhoto, progressPhotoCategories=[], onAddProgressPhotoCategory, onDeleteProgressPhotoCategory, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };
  if (!profile) return null;
  const ts = todayStats || {};

  const score = useMemo(() => {
    let sc     = 0;
    const calPct = (ts.calories || 0) / (profile.calorieTarget || 2300);
    sc += calPct >= 0.9 && calPct <= 1.15 ? 30 : calPct >= 0.7 ? 20 : calPct >= 0.4 ? 10 : 5;
    sc += (ts.protein || 0) >= profile.proteinTarget ? 30
        : (ts.protein || 0) >= profile.proteinTarget * 0.8 ? 20 : 10;
    const slp = ts.sleepHours || 0;
    sc += slp >= profile.sleepTarget ? 20 : slp >= profile.sleepTarget - 1.5 ? 14 : slp > 0 ? 8 : 0;
    sc += ts.workoutCompleted ? 20 : 5;
    return Math.min(100, sc);
  }, [ts, profile]);

  const reminders = useMemo(() => {
    const r = [];
    if (!ts.workoutCompleted)
      r.push({ icon: '💪', text: 'No workout logged yet today — keep the streak alive!' });
    const calGap = (profile.calorieTarget || 2300) - (ts.calories || 0);
    if (calGap > (profile.calorieTarget || 2300) * 0.4)
      r.push({ icon: '🍽️', text: `${f2(calGap)} kcal remaining to hit your daily goal.` });
    const protGap = (profile.proteinTarget || 140) - (ts.protein || 0);
    if (protGap > profile.proteinTarget * 0.3)
      r.push({ icon: '🥩', text: `${f2(protGap)}g protein left — add a meal or shake.` });
    if (!ts.sleepHours || ts.sleepHours === 0)
      r.push({ icon: '😴', text: "Don't forget to log last night's sleep." });
    return r;
  }, [ts, profile]);

  const now          = new Date();
  const weekWorkouts = new Set(
    (workoutLogs || [])
      .filter(w => { const d = new Date(w.date); return (now - d) < 7 * 86400000; })
      .map(w => w.date && w.date.slice(0, 10))
  ).size;

  const sleepVals = (sleepLogs || []).slice(0, 7).map(s => Number(s.duration) || 0).filter(v => v > 0);
  const avgSleep  = sleepVals.length
    ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1)
    : '--';
  const kbPadding = useKeyboardPadding(48, 40);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingBottom: kbPadding }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} colors={[C.primary]} />}>

      {/* Greeting */}
      <View style={s.greetRow}>
        <View>
          <Text style={s.greeting}>{getGreeting()} 👋</Text>
          <Text style={s.greetSub}>Here's your health overview</Text>
        </View>
        <View style={s.liveBadge}>
          <View style={s.liveDot} />
          <Text style={s.liveTxt}>Live</Text>
        </View>
      </View>

      {/* Health Score */}
      <View style={[s.card, s.scoreCard]}>
        <ScoreRing score={score} />
        <View style={s.scoreMeta}>
          <Text style={s.scoreMetaTitle}>Today's Score</Text>
          <Text style={s.scoreMetaSub}>Based on calories, protein, sleep & workout</Text>
          <View style={s.scorePills}>
            <View style={[s.scorePill, { backgroundColor: C.cyan + '22' }]}>
              <Text style={[s.scorePillTxt, { color: C.cyan }]}>🍽 {f2(ts.calories || 0)} kcal</Text>
            </View>
            <View style={[s.scorePill, { backgroundColor: C.primary + '22' }]}>
              <Text style={[s.scorePillTxt, { color: C.primary }]}>💪 {f2(ts.protein || 0)}g P</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Today's Goals */}
      <View style={s.card}>
        <Text style={s.cardHdr}>Today's Goals</Text>
        <MacroBar label="Calories" current={ts.calories || 0}   target={profile.calorieTarget || 2300} color={C.cyan}    unit=" kcal" />
        <MacroBar label="Protein"  current={ts.protein  || 0}   target={profile.proteinTarget || 140}  color={C.primary} unit="g" />
        <MacroBar label="Carbs"    current={ts.carbs    || 0}   target={profile.carbTarget    || 250}  color={C.amber}   unit="g" />
        <MacroBar label="Fats"     current={ts.fats     || 0}   target={profile.fatTarget     || 70}   color={C.rose}    unit="g" />
        <MacroBar label="Sleep"    current={ts.sleepHours || 0} target={profile.sleepTarget   || 8}    color={C.green}   unit="h" />
      </View>

      <WaterCard profile={profile} waterLogs={waterLogs} onAddWater={onAddWater} onUpdateWater={onUpdateWater} onDeleteWater={onDeleteWater} />
      <RecoveryCard profile={profile} sleepLogs={sleepLogs} foodLogs={foodLogs} waterLogs={waterLogs} workoutLogs={workoutLogs} />
      <WeeklyReportCard profile={profile} weightLogs={weightLogs} workoutLogs={workoutLogs} sleepLogs={sleepLogs} foodLogs={foodLogs} waterLogs={waterLogs} />
      <ProgressPhotosCard photos={progressPhotos} onAdd={onAddProgressPhoto} onDelete={onDeleteProgressPhoto} photoPinHash={photoPinHash} onSetPhotoPin={onSetPhotoPin} categories={progressPhotoCategories} onAddCategory={onAddProgressPhotoCategory} onDeleteCategory={onDeleteProgressPhotoCategory} />

      {/* Stat Row */}
      <View style={s.statRow}>
        {[
          { label: 'Current Weight', value: `${profile.currentWeight}kg`, color: C.cyan    },
          { label: 'Workouts / Week', value: String(weekWorkouts),         color: C.primary },
          { label: 'Avg Sleep',       value: `${avgSleep}h`,              color: C.green   },
        ].map(st => (
          <View key={st.label} style={s.statBox}>
            <Text style={[s.statVal, { color: st.color }]}>{st.value}</Text>
            <Text style={s.statLabel}>{st.label}</Text>
          </View>
        ))}
      </View>

      {/* Weight Trend */}
      <View style={s.card}>
        <View style={s.cardHeaderRow}>
          <Text style={s.cardHdr}>Weight Trend</Text>
          <View style={s.weightGoalChip}>
            <Text style={s.weightGoalTxt}>Target {profile.targetWeight}kg</Text>
          </View>
        </View>
        <WeightChart weightLogs={weightLogs} targetWeight={profile.targetWeight} />
        <View style={s.weightInfoRow}>
          <View style={s.weightInfoBox}>
            <Text style={s.weightInfoLbl}>Current</Text>
            <Text style={s.weightInfoVal}>{profile.currentWeight}kg</Text>
          </View>
          <View style={s.weightInfoDivider} />
          <View style={s.weightInfoBox}>
            <Text style={s.weightInfoLbl}>Target</Text>
            <Text style={[s.weightInfoVal, { color: C.primary }]}>{profile.targetWeight}kg</Text>
          </View>
          <View style={s.weightInfoDivider} />
          <View style={s.weightInfoBox}>
            <Text style={s.weightInfoLbl}>Gap</Text>
            <Text style={[s.weightInfoVal, { color: C.amber }]}>
              {Math.abs(profile.currentWeight - profile.targetWeight).toFixed(1)}kg
            </Text>
          </View>
        </View>
      </View>

      {/* Workout Heatmap */}
      <View style={s.card}>
        <Text style={s.cardHdr}>This Week's Workouts</Text>
        <WorkoutHeatmap workoutLogs={workoutLogs} />
      </View>

      {/* All-Time Analysis */}
      <AllTimeAnalysis
        weightLogs={weightLogs}
        workoutLogs={workoutLogs}
        sleepLogs={sleepLogs}
        foodLogs={foodLogs}
        profile={profile}
      />

      {/* Reminders */}
      {reminders.length === 0 ? (
        <View style={[s.card, s.allGoodCard]}>
          <Text style={s.allGoodIcon}>✅</Text>
          <Text style={s.allGoodTxt}>You're crushing it today! All targets on track.</Text>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.cardHdr}>Reminders</Text>
          {reminders.map((r, i) => (
            <View key={i} style={[s.reminder, i < reminders.length - 1 && s.reminderBorder]}>
              <Text style={s.reminderIcon}>{r.icon}</Text>
              <Text style={s.reminderTxt}>{r.text}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  waterDateRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,marginBottom:8},waterDateNav:{width:30,height:30,borderRadius:8,backgroundColor:C.bg,alignItems:'center',justifyContent:'center'},waterDateNavTxt:{color:C.text,fontSize:20},waterDateSelector:{flex:1,borderWidth:1,borderColor:C.border,borderRadius:9,paddingVertical:7,paddingHorizontal:10,alignItems:'center'},waterDateText:{color:C.text,fontSize:11,fontWeight:'700'},calendarOverlay:{flex:1,backgroundColor:'rgba(0,0,0,0.7)',alignItems:'center',justifyContent:'center',padding:20},calendarModal:{width:'100%',maxWidth:380,backgroundColor:C.card,borderRadius:16,padding:14,borderWidth:1,borderColor:C.border},calHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},calNavBtn:{width:32,height:32,borderRadius:8,backgroundColor:C.bg,alignItems:'center',justifyContent:'center'},calNavText:{color:C.text,fontSize:22},calMonthLabel:{color:C.text,fontWeight:'800',fontSize:13},calDayRow:{flexDirection:'row',marginBottom:5},calDayName:{flex:1,textAlign:'center',color:C.muted2,fontSize:9,fontWeight:'700'},calWeekRow:{flexDirection:'row'},calCell:{flex:1,height:36,alignItems:'center',justifyContent:'center',borderRadius:8},calCellHasDot:{backgroundColor:C.cyan+'12'},calCellSelected:{backgroundColor:C.primary+'30',borderWidth:1,borderColor:C.primary},calCellText:{color:C.text,fontSize:11},calCellTextSel:{color:C.primary,fontWeight:'900'},calDot:{position:'absolute',bottom:4,width:4,height:4,borderRadius:2,backgroundColor:C.cyan},calClearBtn:{marginTop:10,alignItems:'center',paddingVertical:8},calClearText:{color:C.primary,fontWeight:'800',fontSize:11},waterPct:{color:C.muted2,fontSize:10,marginTop:5}, quickWaterRow:{flexDirection:'row',gap:6,marginTop:10,flexWrap:'wrap'}, waterBtn:{backgroundColor:C.cyan+'18',borderColor:C.cyan+'44',borderWidth:1,borderRadius:10,paddingHorizontal:10,paddingVertical:8}, waterBtnText:{color:C.cyan,fontSize:11,fontWeight:'800'}, waterLogRow:{flexDirection:'row',alignItems:'center',borderTopWidth:1,borderTopColor:C.border,paddingVertical:8}, waterLogTxt:{flex:1,color:C.text,fontSize:12}, waterEditInput:{flex:1,color:C.text,borderWidth:1,borderColor:C.primary,borderRadius:8,padding:5}, actionTxt:{color:C.primary,fontSize:11,fontWeight:'800',marginHorizontal:6}, deleteTxt:{color:C.rose,fontSize:11,fontWeight:'700',marginHorizontal:6}, customWaterRow:{flexDirection:'row',gap:7,marginTop:8},customWaterInput:{flex:1,color:C.text,borderWidth:1,borderColor:C.border,borderRadius:10,paddingHorizontal:10,fontSize:12},waterHistory:{color:C.muted2,fontSize:11,marginTop:5}, recoveryTop:{flexDirection:'row',alignItems:'center',gap:14,marginBottom:10}, recoveryScore:{fontSize:42,fontWeight:'900',color:C.primary}, recoveryLabel:{fontSize:16,fontWeight:'900',color:C.text}, recoveryReason:{color:C.muted2,fontSize:11,lineHeight:18}, reportGrid:{flexDirection:'row',flexWrap:'wrap',gap:8}, reportCell:{width:'47%',backgroundColor:C.bg,borderRadius:10,padding:10}, reportLabel:{color:C.muted2,fontSize:10}, reportValue:{color:C.text,fontSize:14,fontWeight:'900',marginTop:4}, reportSub:{color:C.muted2,fontSize:11,marginTop:12}, reportPR:{color:C.text,fontSize:11,marginTop:5}, weekNav:{flexDirection:'row',alignItems:'center',gap:8}, weekLabel:{color:C.muted2,fontSize:10}, photoPrivacy:{color:C.muted2,fontSize:10,lineHeight:15,marginBottom:10},photoSectionLabel:{color:C.muted2,fontSize:10,fontWeight:'800',textTransform:'uppercase',marginTop:8,marginBottom:7,letterSpacing:.7},photoAddBtnDisabled:{opacity:.45},photoAddCategoryBtn:{borderStyle:'dashed'},
photoAddBtnWrap:{position:'relative'},
photoCategoryDeleteBtn:{position:'absolute',top:-6,right:-6,width:18,height:18,borderRadius:9,backgroundColor:C.rose||'#ef4444',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:C.bg,zIndex:2},
photoCategoryDeleteText:{color:'#fff',fontSize:12,fontWeight:'900',lineHeight:14},
photoEmptyTxt:{color:C.muted2,fontSize:11,lineHeight:17,marginTop:4,marginBottom:8}, photoFilterRow:{flexDirection:'row',gap:6,marginBottom:10}, photoFilter:{paddingHorizontal:10,paddingVertical:6,borderRadius:9,backgroundColor:C.bg}, photoFilterActive:{backgroundColor:C.primary+'22',borderWidth:1,borderColor:C.primary+'66'}, photoFilterText:{color:C.muted,fontSize:10,fontWeight:'700'}, photoAddRow:{flexDirection:'row', flexWrap:'wrap', gap:7,marginBottom:12}, photoAddBtn:{minWidth:92,paddingVertical:9,paddingHorizontal:10,borderRadius:10,borderWidth:1,borderColor:C.primary+'55',alignItems:'center'}, photoAddText:{color:C.primary,fontSize:11,fontWeight:'800'}, photoGrid:{flexDirection:'row',flexWrap:'wrap',gap:8}, photoItem:{width:'31%',backgroundColor:C.bg,borderRadius:10,padding:6}, photoImg:{width:'100%',height:110,borderRadius:8,backgroundColor:'#111'}, photoDate:{color:C.muted2,fontSize:9,marginTop:4}, compareBox:{marginTop:14,borderTopWidth:1,borderTopColor:C.border,paddingTop:12}, compareTitle:{color:C.text,fontWeight:'800',marginBottom:8}, compareRow:{flexDirection:'row',gap:8}, compareCol:{flex:1}, compareImg:{width:'100%',height:220,borderRadius:10,backgroundColor:'#111'}, lockStatusRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10}, lockStatusTxt:{color:C.muted2,fontSize:10,fontWeight:'700'}, lockModalTitle:{color:C.text,fontSize:15,fontWeight:'900',marginBottom:6,textAlign:'center'}, lockModalSubtitle:{color:C.muted2,fontSize:11,lineHeight:16,textAlign:'center',marginBottom:14}, lockInput:{color:C.text,borderWidth:1,borderColor:C.border,borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:14}, lockErrorTxt:{color:C.rose,fontSize:11,marginTop:8,textAlign:'center'}, lockBtnRow:{flexDirection:'row',gap:8,marginTop:16}, lockCancelBtn:{flex:1,padding:11,borderRadius:10,borderWidth:1,borderColor:C.border,alignItems:'center'}, lockCancelTxt:{color:C.muted2,fontSize:12,fontWeight:'800'}, lockSubmitBtn:{flex:1,padding:11,borderRadius:10,backgroundColor:C.primary,alignItems:'center'}, lockSubmitTxt:{color:'#fff',fontSize:12,fontWeight:'800'},
  root:    { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 48 },
  greetRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, marginTop: 4 },
  greeting:  { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  greetSub:  { color: C.muted2, fontSize: 12, marginTop: 3 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.green + '18', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: C.green + '44' },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green, marginRight: 5 },
  liveTxt:   { color: C.green, fontSize: 11, fontWeight: '700' },

  card:          { backgroundColor: C.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: C.border, marginBottom: 14 },
  cardHdr:       { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 14 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  scoreCard:     { flexDirection: 'row', alignItems: 'center', gap: 20 },

  ringOuter:  { alignItems: 'center' },
  ring:       { width: 110, height: 110, borderRadius: 55, borderWidth: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  ringInner:  { alignItems: 'center' },
  ringScore:  { color: C.text, fontSize: 34, fontWeight: '900', lineHeight: 38 },
  ringLabel:  { color: C.muted, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' },
  badge:      { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  badgeDot:   { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
  badgeText:  { fontSize: 11, fontWeight: '700' },
  scoreMeta:      { flex: 1 },
  scoreMetaTitle: { color: C.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  scoreMetaSub:   { color: C.muted2, fontSize: 11, lineHeight: 16, marginBottom: 10 },
  recoveryDateLabel: { color: C.muted2, fontSize: 11, marginBottom: 8 },
  compactDateBtn: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  compactDateBtnText: { color: C.text, fontSize: 12, fontWeight: '700' },
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
  scorePills:     { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  scorePill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  scorePillTxt:   { fontSize: 11, fontWeight: '700' },

  macroBarWrap:   { marginBottom: 12 },
  macroBarTop:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  macroBarLabel:  { color: C.muted2, fontSize: 13 },
  macroBarVal:    { fontSize: 13, fontWeight: '700' },
  macroBarTarget: { color: C.muted, fontWeight: '400', fontSize: 11 },
  track: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: 3 },

  statRow:  { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statBox:  { flex: 1, backgroundColor: C.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  statVal:  { fontSize: 20, fontWeight: '900', marginBottom: 4 },
  statLabel:{ color: C.muted2, fontSize: 10, textAlign: 'center', fontWeight: '500' },

  chartArea: { flexDirection: 'row', alignItems: 'flex-end', height: 100, justifyContent: 'space-around', position: 'relative', marginBottom: 8 },
  chartCol:  { alignItems: 'center', flex: 1 },
  vBar:      { width: 14, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  chartTip:  { fontSize: 8, marginBottom: 3, fontWeight: '600' },
  chartDate: { color: C.muted, fontSize: 8, marginTop: 4 },
  targetLine:    { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: C.green + '55' },
  targetLineTxt: { color: C.green, fontSize: 8, position: 'absolute', right: 0, top: -10 },

  weightGoalChip: { backgroundColor: C.primary + '22', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  weightGoalTxt:  { color: C.primary, fontSize: 11, fontWeight: '700' },
  weightInfoRow:  { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  weightInfoBox:  { flex: 1, alignItems: 'center' },
  weightInfoDivider: { width: 1, backgroundColor: C.border },
  weightInfoLbl:  { color: C.muted2, fontSize: 11, marginBottom: 4 },
  weightInfoVal:  { color: C.text, fontSize: 18, fontWeight: '900' },

  emptyChart:    { alignItems: 'center', paddingVertical: 20 },
  emptyChartIcon:{ fontSize: 28, marginBottom: 8 },
  emptyChartTxt: { color: C.muted2, fontSize: 12, textAlign: 'center' },

  heatmapRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  heatmapCell:      { alignItems: 'center', flex: 1 },
  heatmapDot:       { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: C.border2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  heatmapDotActive: { backgroundColor: C.primary, borderColor: C.primary },
  heatmapDotToday:  { borderColor: C.primary },
  heatmapCheck:     { color: '#fff', fontSize: 14, fontWeight: '900' },
  heatmapDay:       { color: C.muted2, fontSize: 10, fontWeight: '600' },
  streakBadge:      { alignSelf: 'center', backgroundColor: C.amber + '22', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: C.amber + '55' },
  streakTxt:        { color: C.amber, fontSize: 12, fontWeight: '700' },

  // All-time analysis
  analysisSection:      { marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  analysisSectionTitle: { fontSize: 13, fontWeight: '700', color: C.muted2, marginBottom: 10 },
  analysisGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  analysisCell:         { width: '47%', backgroundColor: C.card2, borderRadius: 10, padding: 11, borderWidth: 1, borderColor: C.border },
  analysisCellVal:      { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  analysisCellSub:      { fontSize: 10, fontWeight: '600', marginBottom: 2, opacity: 0.8 },
  analysisCellLabel:    { fontSize: 10, color: C.muted2 },
  trendBanner:          { borderRadius: 8, padding: 10, borderWidth: 1, alignItems: 'center', marginTop: 8 },

  allGoodCard: { flexDirection: 'row', alignItems: 'center', borderColor: C.green + '44', backgroundColor: C.green + '0f' },
  allGoodIcon: { fontSize: 22, marginRight: 12 },
  allGoodTxt:  { color: C.green, fontSize: 13, fontWeight: '600', flex: 1 },
  reminder:       { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  reminderBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  reminderIcon:   { fontSize: 16, marginRight: 10, marginTop: 1 },
  reminderTxt:    { color: C.muted2, fontSize: 13, flex: 1, lineHeight: 18 },
});