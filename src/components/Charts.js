import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { getExerciseProgress } from '../utils/progression';

// Clean UI Color Palette
const COLORS = {
  bgLight: 'rgba(255, 255, 255, 0.05)',
  bgMedium: 'rgba(255, 255, 255, 0.08)',
  border: 'rgba(255, 255, 255, 0.08)',
  textPrimary: '#ffffff',
  textSecondary: '#94a3b8',
  primary: '#8b5cf6', // Violet
  secondary: '#06b6d4', // Cyan
  success: '#10b981', // Emerald Green
  warning: '#f59e0b', // Amber Orange
  danger: '#f43f5e', // Rose Pink
};

// 1. Horizontal Progress Bar
export const ProgressBar = ({ progress, color = COLORS.primary, label, current, target, unit = '' }) => {
  const percentage = Math.min(100, Math.max(0, Math.round(progress * 100)));
  const barColor = percentage >= 100 ? COLORS.success : color;

  return (
    <View style={styles.barContainer}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValues}>
          <Text style={[styles.barCurrent, { color: barColor }]}>{current}{unit}</Text>
          <Text style={styles.barTarget}> / {target}{unit}</Text>
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
};

// 2. Circular Health Score Ring (Constructed elegantly with nested circles)
export const HealthScoreRing = ({ score }) => {
  let ringColor = COLORS.danger;
  let textLabel = 'Needs Work';

  if (score >= 85) {
    ringColor = COLORS.success;
    textLabel = 'Excellent';
  } else if (score >= 70) {
    ringColor = COLORS.primary;
    textLabel = 'Good Consistency';
  } else if (score >= 50) {
    ringColor = COLORS.warning;
    textLabel = 'Moderate';
  }

  return (
    <View style={styles.ringOuter}>
      <View style={[styles.ringTrack, { borderColor: ringColor }]}>
        <Text style={styles.ringScore}>{score}</Text>
        <Text style={styles.ringScoreLabel}>Health Score</Text>
        <View style={[styles.badge, { backgroundColor: ringColor }]}>
          <Text style={styles.badgeText}>{textLabel}</Text>
        </View>
      </View>
    </View>
  );
};

// 3. Horizontal Proportion Bar (Macro Splits)
export const MacroSplitBar = ({ protein, carbs, fats }) => {
  const total = protein + carbs + fats || 1;
  const pPct = (protein / total) * 100;
  const cPct = (carbs / total) * 100;
  const fPct = (fats / total) * 100;

  return (
    <View style={styles.splitWrapper}>
      <Text style={styles.splitTitle}>Macro Proportion Split</Text>
      <View style={styles.splitTrack}>
        {protein > 0 && <View style={[styles.splitSegment, { width: `${pPct}%`, backgroundColor: COLORS.primary }]} />}
        {carbs > 0 && <View style={[styles.splitSegment, { width: `${cPct}%`, backgroundColor: COLORS.secondary }]} />}
        {fats > 0 && <View style={[styles.splitSegment, { width: `${fPct}%`, backgroundColor: COLORS.warning }]} />}
      </View>
      <View style={styles.splitLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.primary }]} />
          <Text style={styles.legendText}>Protein ({Math.round(pPct)}%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.secondary }]} />
          <Text style={styles.legendText}>Carbs ({Math.round(cPct)}%)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
          <Text style={styles.legendText}>Fats ({Math.round(fPct)}%)</Text>
        </View>
      </View>
    </View>
  );
};

// 4. Weight Trend Chart (Clean bar chart representing last 7 logs with dynamic scaling)
export const WeightChart = ({ logs = [], targetWeight }) => {
  const last7Logs = [...logs].slice(0, 7).reverse(); // order chronological
  
  if (last7Logs.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyText}>No weight logs recorded yet.</Text>
      </View>
    );
  }

  // Find min/max weights for optimal scale mapping
  const weights = last7Logs.map(l => l.weight);
  const minW = Math.min(...weights, targetWeight) - 1;
  const maxW = Math.max(...weights, targetWeight) + 1;
  const range = maxW - minW || 1;

  return (
    <View style={styles.chartWrapper}>
      <Text style={styles.chartTitle}>Weight Progression vs Target ({targetWeight} kg)</Text>
      
      <View style={styles.chartCanvas}>
        {/* Y-Axis guidelines */}
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>{maxW.toFixed(0)}</Text>
          <Text style={styles.yLabel}>{((maxW + minW) / 2).toFixed(0)}</Text>
          <Text style={styles.yLabel}>{minW.toFixed(0)}</Text>
        </View>

        <View style={styles.barsContainer}>
          {last7Logs.map((log, index) => {
            // Calculate height percentage relative to boundaries
            const heightPct = Math.max(10, ((log.weight - minW) / range) * 100);
            
            // Format date MM-DD
            const dateStr = log && log.date ? String(log.date) : '';
            const parts = dateStr.split('-');
            const labelDate = parts.length > 2 ? `${parts[1]}/${parts[2]}` : log.date;

            // Check if log weight matches target
            const isNearTarget = Math.abs(log.weight - targetWeight) < 0.5;

            return (
              <View key={log.id || index} style={styles.barItem}>
                <View style={styles.barGraphArea}>
                  <View style={[
                    styles.verticalBar, 
                    { 
                      height: `${heightPct}%`,
                      backgroundColor: isNearTarget ? COLORS.success : COLORS.secondary
                    }
                  ]}>
                    <Text style={styles.barValueTooltip}>{log.weight}</Text>
                  </View>
                </View>
                <Text style={styles.barXLabel}>{labelDate}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

// 5. Weekly Sleep Duration Chart
export const SleepWeeklyChart = ({ logs = [], targetSleep }) => {
  const last7Logs = [...logs].slice(0, 7).reverse();

  if (last7Logs.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={styles.emptyText}>No sleep logs recorded yet.</Text>
      </View>
    );
  }

  const durations = last7Logs.map(l => l.duration);
  const maxD = Math.max(...durations, targetSleep, 10);

  return (
    <View style={styles.chartWrapper}>
      <Text style={styles.chartTitle}>Sleep Duration vs Goal ({targetSleep}h)</Text>

      <View style={styles.chartCanvas}>
        <View style={styles.yAxis}>
          <Text style={styles.yLabel}>{maxD.toFixed(0)}h</Text>
          <Text style={styles.yLabel}>{(maxD / 2).toFixed(0)}h</Text>
          <Text style={styles.yLabel}>0h</Text>
        </View>

        <View style={styles.barsContainer}>
          {last7Logs.map((log, index) => {
            const heightPct = Math.max(10, (log.duration / maxD) * 100);
            const isMeetingTarget = log.duration >= targetSleep;

            const dateStr = log && log.date ? String(log.date) : '';
            const parts = dateStr.split('-');
            const labelDate = parts.length > 2 ? `${parts[1]}/${parts[2]}` : log.date;

            return (
              <View key={log.id || index} style={styles.barItem}>
                <View style={styles.barGraphArea}>
                  <View style={[
                    styles.verticalBar,
                    {
                      height: `${heightPct}%`,
                      backgroundColor: isMeetingTarget ? COLORS.success : COLORS.warning
                    }
                  ]}>
                    <Text style={styles.barValueTooltip}>{log.duration}h</Text>
                  </View>
                </View>
                <Text style={styles.barXLabel}>{labelDate}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Horizontal Progress Bar
  barContainer: {
    marginVertical: 10,
    width: '100%',
  },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  barLabel: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  barValues: {
    fontSize: 12,
  },
  barCurrent: {
    fontWeight: 'bold',
  },
  barTarget: {
    color: COLORS.textSecondary,
  },
  barTrack: {
    height: 8,
    backgroundColor: COLORS.bgLight,
    borderRadius: 4,
    width: '100%',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Circle Health Ring
  ringOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  ringTrack: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgMedium,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
  },
  ringScore: {
    color: COLORS.textPrimary,
    fontSize: 36,
    fontWeight: '800',
  },
  ringScoreLabel: {
    color: COLORS.textSecondary,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    bottom: -10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#000000',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },

  // Macro Proportions Split
  splitWrapper: {
    marginVertical: 14,
    width: '100%',
    backgroundColor: COLORS.bgMedium,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  splitTitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  splitTrack: {
    height: 12,
    backgroundColor: COLORS.bgLight,
    borderRadius: 6,
    flexDirection: 'row',
    width: '100%',
    overflow: 'hidden',
  },
  splitSegment: {
    height: '100%',
  },
  splitLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    color: COLORS.textSecondary,
    fontSize: 10,
  },

  // Chart structures
  chartWrapper: {
    marginVertical: 12,
    backgroundColor: COLORS.bgMedium,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    width: '100%',
  },
  chartTitle: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
  },
  chartCanvas: {
    flexDirection: 'row',
    height: 140,
    paddingTop: 10,
  },
  yAxis: {
    width: 32,
    height: '100%',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderRightWidth: 1,
    borderRightColor: COLORS.border,
    paddingRight: 6,
  },
  yLabel: {
    color: COLORS.textSecondary,
    fontSize: 9,
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: '100%',
    paddingLeft: 8,
  },
  barItem: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  barGraphArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  verticalBar: {
    width: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'relative',
  },
  barValueTooltip: {
    color: COLORS.textPrimary,
    fontSize: 7,
    fontWeight: 'bold',
    position: 'absolute',
    top: -12,
    width: 28,
    textAlign: 'center',
  },
  barXLabel: {
    color: COLORS.textSecondary,
    fontSize: 8,
    marginTop: 6,
  },
  emptyChart: {
    height: 100,
    backgroundColor: COLORS.bgMedium,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginVertical: 12,
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 12,
  }
});

// Exercise-specific progression view used by Workout History.
export const ExerciseProgression = ({ logs = [], exerciseName }) => {
  const [range, setRange] = useState('all');
  const all = React.useMemo(() => getExerciseProgress(logs, exerciseName), [logs, exerciseName]);
  const cutoff = range === '7' ? 7 : range === '30' ? 30 : range === '90' ? 90 : Infinity;
  const now = new Date();
  const rows = React.useMemo(() => all.rows.filter(r => {
    if (cutoff === Infinity) return true;
    const d = new Date(`${r.date}T23:59:59`);
    return (now - d) <= cutoff * 86400000;
  }), [all.rows, cutoff]);

  const displayRows = React.useMemo(() => {
    const maxPoints = 120;
    if (rows.length <= maxPoints) return rows;
    const step = (rows.length - 1) / (maxPoints - 1);
    const picked = [];
    for (let i = 0; i < maxPoints; i++) picked.push(rows[Math.round(i * step)]);
    return picked.filter((row, i, arr) => i === 0 || row.date !== arr[i - 1].date);
  }, [rows]);

  const metrics = [
    { key: 'weight', title: 'Weight progression', unit: ' kg' },
    { key: 'volume', title: 'Volume progression', unit: ' kg' },
    { key: 'reps', title: 'Reps progression', unit: '' },
    { key: 'e1rm', title: 'Estimated 1RM progression', unit: ' kg' },
  ];

  const valueFor = (row, key) => Number(
    key === 'weight' ? row.metrics.maxWeight :
    key === 'volume' ? row.metrics.volume :
    key === 'reps' ? row.metrics.maxRepsAtMaxWeight :
    row.metrics.estimated1RM
  ) || 0;

  const renderLineChart = (title, key, unit) => {
    const values = displayRows.map(r => valueFor(r, key));
    const maxValue = Math.max(...values, 1);
    const minValue = Math.min(...values, 0);
    const rangeValue = maxValue - minValue || 1;
    const width = Math.max(320, displayRows.length * 58);
    const height = 150;
    const left = 8;
    const top = 12;
    const plotWidth = width - 16;
    const plotHeight = 100;
    const points = displayRows.map((r, i) => ({
      x: displayRows.length === 1 ? plotWidth / 2 + left : left + (i / (displayRows.length - 1)) * plotWidth,
      y: top + plotHeight - ((valueFor(r, key) - minValue) / rangeValue) * plotHeight,
      value: valueFor(r, key), date: r.date,
    }));
    const best = Math.max(...values, 0);

    return (
      <View style={styles.progressChart} key={key}>
        <Text style={styles.progressTitle}>{title}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={rows.length > 6} contentContainerStyle={{ minWidth: width }}>
          <View style={{ width, height }}>
            <View style={styles.lineGridTop} />
            <View style={styles.lineGridMid} />
            <View style={styles.lineGridBottom} />
            {points.slice(0, -1).map((point, i) => {
              const next = points[i + 1];
              const dx = next.x - point.x;
              const dy = next.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * 180 / Math.PI;
              return (
                <View
                  key={`line_${key}_${i}`}
                  style={[styles.progressLineSegment, {
                    left: point.x,
                    top: point.y,
                    width: length,
                    transform: [{ rotate: `${angle}deg` }],
                  }]}
                />
              );
            })}
            {points.map((point, i) => (
              <View key={`point_${key}_${i}`} style={[styles.progressPointWrap, { left: point.x - 4, top: point.y - 4 }]}>
                <View style={[styles.progressPoint, point.value === best && styles.progressPointBest]} />
              </View>
            ))}
            {points.map((point, i) => (
              <View key={`label_${key}_${i}`} style={[styles.progressPointLabel, { left: point.x - 24, top: 116 }]}>
                <Text style={styles.progressDate}>{point.date.slice(5)}</Text>
                <Text style={styles.progressVal}>{Math.round(point.value * 10) / 10}{unit}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.progressionCard}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressHeading}>📈 Progress — {exerciseName}</Text>
        <View style={styles.rangeRow}>
          {['7', '30', '90', 'all'].map(r => (
            <TouchableOpacity key={r} onPress={() => setRange(r)} style={[styles.rangeBtn, range === r && styles.rangeBtnActive]}>
              <Text style={styles.rangeText}>{r === 'all' ? 'All' : `${r}d`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {!rows.length ? (
        <View style={styles.emptyChart}>
          <Text style={styles.emptyText}>Not enough data to display progression for this period.</Text>
          <Text style={styles.emptyHint}>Choose another time range above to view available history.</Text>
        </View>
      ) : (
        <>
          {metrics.map(m => renderLineChart(m.title, m.key, m.unit))}
          <View style={styles.progressStats}>
            <Text style={styles.progressStat}>Current Best: {rows[rows.length - 1].metrics.maxWeight} kg</Text>
            <Text style={styles.progressStat}>Previous Best: {rows.length > 1 ? rows[rows.length - 2].metrics.maxWeight : '—'} kg</Text>
            <Text style={styles.progressStat}>All-Time Best: {all.bestWeight} kg</Text>
            <Text style={styles.progressStat}>Current Volume: {Math.round(rows[rows.length - 1].metrics.volume)} kg</Text>
            <Text style={styles.progressStat}>Average Reps: {(() => { const a = rows.flatMap(r => r.metrics.sets.map(s => s.reps)).filter(Boolean); return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '—'; })()}</Text>
            <Text style={styles.progressStat}>Best Reps @ Best Weight: {all.bestRepsAtWeight || '—'}</Text>
            <Text style={styles.progressStat}>Estimated 1RM: {all.best1RM ? `${Math.round(all.best1RM * 10) / 10} kg` : '—'}</Text>
          </View>
        </>
      )}
    </View>
  );
};

const _oldStyles = styles;
Object.assign(styles, {
  progressionCard:{backgroundColor:'#0f0f1e',borderRadius:14,padding:12,borderWidth:1,borderColor:'rgba(255,255,255,0.08)',marginBottom:12},progressHeader:{marginBottom:8},progressHeading:{color:'#fff',fontSize:13,fontWeight:'800',marginBottom:8},rangeRow:{flexDirection:'row',gap:5},rangeBtn:{paddingHorizontal:8,paddingVertical:5,borderRadius:8,backgroundColor:'rgba(255,255,255,0.05)'},rangeBtnActive:{backgroundColor:'#7c5cfc'},rangeText:{color:'#fff',fontSize:9,fontWeight:'700'},progressChart:{marginTop:8},progressTitle:{color:'#94a3b8',fontSize:10,fontWeight:'700',marginBottom:5},progressLineSegment:{position:'absolute',height:2,backgroundColor:'#7c5cfc',transformOrigin:'left center'},progressPointWrap:{position:'absolute',width:8,height:8,borderRadius:4,alignItems:'center',justifyContent:'center'},progressPoint:{width:7,height:7,borderRadius:4,backgroundColor:'#7c5cfc',borderWidth:1,borderColor:'#0f0f1e'},progressPointBest:{backgroundColor:'#10b981'},progressPointLabel:{position:'absolute',width:48,alignItems:'center'},lineGridTop:{position:'absolute',left:0,right:0,top:12,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.05)'},lineGridMid:{position:'absolute',left:0,right:0,top:62,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.05)'},lineGridBottom:{position:'absolute',left:0,right:0,top:112,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.05)'},progressVal:{color:'#94a3b8',fontSize:7,marginTop:2},progressDate:{color:'#64748b',fontSize:7},progressStats:{marginTop:10,paddingTop:8,borderTopWidth:1,borderTopColor:'rgba(255,255,255,0.08)',gap:3},progressStat:{color:'#94a3b8',fontSize:10},emptyHint:{color:'#64748b',fontSize:10,textAlign:'center',marginTop:6}
});