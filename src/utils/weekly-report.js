import { getExerciseProgress } from './progression';
import { calculateRecovery } from './recovery';
import { resolveTargetForDate } from './database';

// `targetHistory` (from database.getTargetHistory()) is optional and
// defaults to [] so existing callers that haven't been updated yet keep
// working exactly as before (resolveTargetForDate with an empty history
// falls back to `profile`, i.e. today's live targets for every day --
// identical to the old behavior). Passing the real history is what makes
// each day in the report get evaluated against the target that was
// actually active on that date (Change 9/10) instead of today's target.
export function buildWeeklyReport({ profile={}, weightLogs=[], workoutLogs=[], foodLogs=[], sleepLogs=[], waterLogs=[], weekOffset=0, targetHistory=[] }={}) {
  const now=new Date(); now.setDate(now.getDate() - weekOffset*7); const since=new Date(now); since.setDate(now.getDate()-6); const key=d=>String(d.date).slice(0,10); const inWeek=l=>{const d=new Date(key(l)); return d>=new Date(since.toDateString()) && d<=now;};
  const w=workoutLogs.filter(inWeek), f=foodLogs.filter(inWeek), s=sleepLogs.filter(inWeek).filter(x=>x.sleepType==='night'||!x.sleepType), water=waterLogs.filter(inWeek);
  const days=[...new Set(w.map(key))]; const byDay=(logs,field)=>{const m={}; logs.forEach(l=>{const d=key(l);m[d]=(m[d]||0)+(Number(l[field])||0)});return m};
  const cal=byDay(f,'calories'), prot=byDay(f,'protein'), carbs=byDay(f,'carbs'), fats=byDay(f,'fats'), waterDay=byDay(water,'amountMl');
  const sleepByDay = {}; s.forEach(l => { const d = key(l); sleepByDay[d] = (sleepByDay[d]||0) + (Number(l.duration)||0); });
  const avg=o=>{const v=Object.values(o);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0}; const sleepVals=s.map(x=>Number(x.duration)||0).filter(Boolean);
  const muscles={}; w.forEach(x=>{const m=x.muscleGroup||'Other';muscles[m]=(muscles[m]||0)+1}); const mostTrained=Object.entries(muscles).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  const prs=[]; const names=[...new Set(w.map(x=>x.exerciseName).filter(Boolean))]; names.forEach(n=>{const all=getExerciseProgress(workoutLogs,n); const week=getExerciseProgress(w,n); if(week.bestWeight>0 && week.bestWeight>=all.bestWeight) prs.push({exercise:n,weight:week.bestWeight});});
  // Recovery-days trend now resolves EACH day's own historical target
  // rather than passing the single live `profile` for every day (same
  // fix as Dashboard's RecoveryCard) -- calculateRecovery itself is
  // unchanged, it just receives a per-day-resolved "profile-shaped" object.
  const recoveryDays=[]; for(let i=0;i<7;i++){const d=new Date(now);d.setDate(now.getDate()-i);const ds=d.toISOString().slice(0,10);const dayTargets=resolveTargetForDate(targetHistory, ds, profile);const rec=calculateRecovery({profile:dayTargets,sleepLogs:sleepLogs.filter(x=>String(x.date).slice(0,10)<=ds),foodLogs:foodLogs.filter(x=>String(x.date).slice(0,10)<=ds),waterLogs:waterLogs.filter(x=>String(x.date).slice(0,10)<=ds),workoutLogs:workoutLogs.filter(x=>String(x.date).slice(0,10)<=ds),asOf:d}); if(rec.available) recoveryDays.push({date:ds,score:rec.score});}
  const recAvg=recoveryDays.length?Math.round(avg(Object.fromEntries(recoveryDays.map(x=>[x.date,x.score])))):null;
  const bestRec=recoveryDays.slice().sort((a,b)=>b.score-a.score)[0], lowRec=recoveryDays.slice().sort((a,b)=>a.score-b.score)[0];
  const startW=[...weightLogs].filter(inWeek).sort((a,b)=>String(a.date).localeCompare(String(b.date)))[0]?.weight; const currentW=[...weightLogs].filter(inWeek).sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]?.weight;

  // Per-day target lookups -- each "did this day hit target" count below
  // checks that day's OWN resolved target, not one single current value.
  const calorieDays = Object.entries(cal).filter(([d,v]) => { const t = Number(resolveTargetForDate(targetHistory, d, profile).calorieTarget)||2300; return v >= t*0.9 && v <= t*1.15; }).length;
  const proteinDays = Object.entries(prot).filter(([d,v]) => v >= (Number(resolveTargetForDate(targetHistory, d, profile).proteinTarget)||140)).length;
  const sleepNights = Object.entries(sleepByDay).filter(([d,v]) => v >= (Number(resolveTargetForDate(targetHistory, d, profile).sleepTarget)||8)).length;
  const waterDaysHit = Object.entries(waterDay).filter(([d,v]) => v >= (Number(resolveTargetForDate(targetHistory, d, profile).waterTargetMl)||2500)).length;

  // The single headline "target" figures shown alongside weekly averages
  // (e.g. "Protein: 132 g/day, target 140g") use TODAY's resolved target --
  // this is a current-state display value (Change 34: "today's active
  // target" is a legitimate current-state usage), while every day-by-day
  // comparison above already correctly used each day's own historical target.
  const todayKey = now.toISOString().slice(0,10);
  const todayTargets = resolveTargetForDate(targetHistory, todayKey, profile);

  // `overall` score's per-factor targets are averaged across each day that
  // actually has data in the week, using that day's own resolved target --
  // approximates "graded against the target active at the time" for an
  // aggregate weekly figure without needing a full per-day score rewrite.
  const avgTargetOf = (field, dayKeys) => {
    const vals = dayKeys.map(d => Number(resolveTargetForDate(targetHistory, d, profile)[field]) || 0).filter(v => v > 0);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : Number(todayTargets[field]) || 0;
  };
  const proteinTargetAvg = avgTargetOf('proteinTarget', Object.keys(prot));
  const sleepTargetAvg   = avgTargetOf('sleepTarget', Object.keys(sleepByDay));
  const waterTargetAvg   = avgTargetOf('waterTargetMl', Object.keys(waterDay));
  const workoutTargetAvg = avgTargetOf('workoutTarget', days);

  return { workout:{days:days.length,target:Number(todayTargets.workoutTarget)||4,exercises:w.length,mostTrained,trend:days.length-(workoutTargetAvg||Number(todayTargets.workoutTarget)||4)}, nutrition:{avgCalories:Math.round(avg(cal)),target:Number(todayTargets.calorieTarget)||2300,avgProtein:Math.round(avg(prot)),proteinTarget:Number(todayTargets.proteinTarget)||140,avgCarbs:Math.round(avg(carbs)),avgFat:Math.round(avg(fats)),calorieDays,proteinDays}, sleep:{avg:sleepVals.length?sleepVals.reduce((a,b)=>a+b,0)/sleepVals.length:0,target:Number(todayTargets.sleepTarget)||8,nights:sleepNights,best:sleepVals.length?Math.max(...sleepVals):0,worst:sleepVals.length?Math.min(...sleepVals):0}, water:{avgMl:Math.round(avg(waterDay)),targetMl:Number(todayTargets.waterTargetMl)||2500,days:waterDaysHit}, weight:{start:startW??null,current:currentW??null,change:startW!=null&&currentW!=null?currentW-startW:null}, recovery:{average:recAvg,best:bestRec?.score??null,bestDate:bestRec?.date,lowest:lowRec?.score??null,lowestDate:lowRec?.date}, prs:prs.slice(0,10), overall:Math.round(((Math.min(100,(days.length/(workoutTargetAvg||4))*100))+ (Math.min(100,(avg(prot)/(proteinTargetAvg||140))*100)) + (sleepVals.length?Math.min(100,(avg({x:sleepVals.reduce((a,b)=>a+b,0)})/sleepVals.length)/(sleepTargetAvg||8)*100):0) + (Object.values(waterDay).length?Math.min(100,(avg(waterDay)/(waterTargetAvg||2500))*100):0))/4)};
}