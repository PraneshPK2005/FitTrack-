/** Progressive overload helpers. Pure functions; never mutate workout logs. */
export function normalizeSets(log = {}) {
  let raw = log.sets;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { raw = []; } }
  if (Array.isArray(raw) && raw.length) return raw.map(s => {
    const drops = Array.isArray(s?.drops)
      ? s.drops
          .map(d => ({ weight: Number(d?.weight) || 0, reps: Number(d?.reps) || 0 }))
          .filter(d => d.weight > 0 || d.reps > 0)
      : [];
    return {
      weight: Number(s?.weight) || 0,
      reps: Number(s?.reps) || 0,
      // Only a genuine drop set if it actually has at least one drop stage
      // -- a set flagged dropSet:true with zero drops (e.g. the user
      // toggled it on but never filled anything in) behaves as a normal set.
      dropSet: !!s?.dropSet && drops.length > 0,
      drops,
    };
  });
  if (log.weight || log.reps) return [{ weight: Number(log.weight) || 0, reps: Number(log.reps) || 0, dropSet: false, drops: [] }];
  return [];
}

export function sessionMetrics(log = {}) {
  const sets = normalizeSets(log).filter(s => s.reps > 0 || s.drops.length > 0);
  // Drop-set volume: every stage (main + each drop) contributes its own
  // weight*reps, summed once per set entry in the array -- so a single
  // drop-set group never gets counted as multiple unrelated top-level sets,
  // while still crediting every rep actually performed across all stages.
  const volume = sets.reduce((n, s) => {
    const mainVol = s.weight * s.reps;
    const dropsVol = s.drops.reduce((dn, d) => dn + d.weight * d.reps, 0);
    return n + mainVol + dropsVol;
  }, 0);
  // bestSet/maxWeight deliberately look only at each set's main/initial
  // stage. A drop set's drops only ever reduce weight from that starting
  // point (that's the definition of a drop set), so the main stage is
  // always that set's true peak -- using it directly gives correct
  // "heaviest weight" results without needing to inspect drops separately.
  const bestSet = sets.reduce((best, s) => !best || s.weight * s.reps > best.weight * best.reps ? s : best, null);
  const maxWeight = sets.reduce((n, s) => Math.max(n, s.weight), 0);
  const maxRepsAtMaxWeight = sets.filter(s => s.weight === maxWeight).reduce((n, s) => Math.max(n, s.reps), 0);
  const e1rms = sets.filter(s => s.weight > 0 && s.reps > 0).map(s => ({ ...s, e1rm: s.weight * (1 + s.reps / 30) }));
  const estimated1RM = e1rms.length ? Math.max(...e1rms.map(s => s.e1rm)) : 0;
  return { sets, volume, bestSet, maxWeight, maxRepsAtMaxWeight, estimated1RM };
}

export function exerciseHistory(logs = [], exerciseName, beforeDate = null, equipment = undefined) {
  return logs.filter(l => l.exerciseName === exerciseName && l.isSuperset !== true && (!beforeDate || String(l.date).slice(0, 10) < String(beforeDate).slice(0, 10))
    // When `equipment` is passed, scope to logs on that same machine only
    // (missing/'' equipment is its own bucket) -- prevents two different
    // machines doing the same named exercise from being merged into one
    // progression/PR line. Omitting the param keeps prior behavior exactly
    // (all equipment pooled together), so existing callers are unaffected.
    && (equipment === undefined || (l.equipment || '') === (equipment || '')));
}

export function getExerciseProgress(logs = [], exerciseName, equipment = undefined) {
  const scoped = equipment === undefined ? logs : logs.filter(l => (l.equipment || '') === (equipment || ''));
  const normalRows = scoped.filter(l => l.exerciseName === exerciseName && l.isSuperset !== true)
    .map(l => ({ log: l, metrics: sessionMetrics(l), date: String(l.date).slice(0, 10), isSuperset: false }))
    .sort((a,b) => a.date.localeCompare(b.date));
  const supersetRows = scoped.filter(l => l.exerciseName === exerciseName && l.isSuperset === true)
    .map(l => ({ log: l, metrics: sessionMetrics(l), date: String(l.date).slice(0, 10), isSuperset: true, supersetId: l.supersetId, supersetOrder: l.supersetOrder }))
    .sort((a,b) => a.date.localeCompare(b.date) || ((Number(a.supersetOrder)||0) - (Number(b.supersetOrder)||0)));
  const all = normalRows.flatMap(r => r.metrics.sets.map(s => ({ ...s, date: r.date, log: r.log })));
  const bestWeight = all.length ? Math.max(...all.map(s => s.weight)) : 0;
  const bestRepsAtWeight = all.length ? Math.max(...all.filter(s => s.weight === bestWeight).map(s => s.reps)) : 0;
  const bestVolume = normalRows.length ? Math.max(...normalRows.map(r => r.metrics.volume)) : 0;
  const best1RM = normalRows.length ? Math.max(...normalRows.map(r => r.metrics.estimated1RM)) : 0;
  return { rows: normalRows, supersetRows, bestWeight, bestRepsAtWeight, bestVolume, best1RM };
}

// `newLog.equipment` (if present) automatically scopes the comparison to
// previous logs on the SAME machine only -- '' / missing equipment is its
// own bucket on both sides, so untagged legacy logs keep comparing only
// against each other exactly as before this feature existed, while a
// machine-tagged log is never compared against a different machine.
export function compareWorkoutForPR(newLog, previousLogs = []) {
  const current = sessionMetrics(newLog);
  // Superset performances are valid history, but never establish or update
  // normal PRs/progression.
  if (newLog?.isSuperset === true) return { current, previousWeight: 0, previousVolume: 0, messages: [] };
  const newEquipment = newLog?.equipment || '';
  const previous = previousLogs.filter(l => l.exerciseName === newLog.exerciseName && l.isSuperset !== true && String(l.id) !== String(newLog.id) && (l.equipment || '') === newEquipment);
  const previousRows = previous.map(l => sessionMetrics(l));
  const previousWeight = previousRows.length ? Math.max(...previousRows.map(m => m.maxWeight)) : 0;
  const previousVolume = previousRows.length ? Math.max(...previousRows.map(m => m.volume)) : 0;
  const previousBestRepsAtCurrentWeight = previousRows.length
    ? Math.max(...previousRows.flatMap(m => m.sets.filter(s => s.weight === current.maxWeight).map(s => s.reps)), 0)
    : 0;
  const messages = [];
  if (current.maxWeight > 0 && current.maxWeight > previousWeight) messages.push({ type: 'weight', message: `🔥 New Weight PR — ${current.maxWeight} kg` });
  else if (current.maxWeight > 0 && current.maxWeight === previousWeight && current.maxRepsAtMaxWeight > previousBestRepsAtCurrentWeight && previousBestRepsAtCurrentWeight > 0)
    messages.push({ type: 'reps', message: `💪 +${current.maxRepsAtMaxWeight - previousBestRepsAtCurrentWeight} reps from your previous session` });
  if (current.volume > 0 && previousVolume > 0 && current.volume > previousVolume) {
    const pct = Math.round(((current.volume - previousVolume) / previousVolume) * 100);
    if (pct > 0) messages.push({ type: 'volume', message: `📈 Volume increased by ${pct}%` });
  }
  return { current, previousWeight, previousVolume, messages };
}