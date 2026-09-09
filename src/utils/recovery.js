import { formatSleepHours } from './database';

function dayKey(d = new Date()) { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; }
// asOf lets the window be anchored to any reference date, not just the real
// "now". This is what makes calculateRecovery usable for historical dates:
// previously it always used `new Date()` internally, so passing in logs
// filtered up to a past date still produced an empty/wrong result because
// the day-keys it matched against were the real today's last 3 days, not
// the selected date's. Default stays `new Date()` so the live
// Dashboard "today" usage is completely unchanged.
function lastNDates(n, asOf = new Date()) { return Array.from({length:n},(_,i)=>{ const d=new Date(asOf); d.setDate(d.getDate()-i); return dayKey(d); }); }

export function calculateRecovery({ profile = {}, sleepLogs = [], foodLogs = [], waterLogs = [], workoutLogs = [], asOf = new Date() } = {}) {
  const dates = lastNDates(3, asOf); const today = dates[0];
  const targetSleep = Number(profile.sleepTarget) || 8;
  const targetProtein = Number(profile.proteinTarget) || 140;
  const targetCalories = Number(profile.calorieTarget) || 2300;
  const targetWater = Number(profile.waterTargetMl) || 2500;
  const targetFibre = Number(profile.fibreTarget) || 30;
  const sleepByDay = dates.map(d => sleepLogs.filter(s => String(s.date).slice(0,10) === d && (s.sleepType === 'night' || !s.sleepType)).reduce((a,s)=>a+(Number(s.duration)||0),0));
  const foodByDay = dates.map(d => foodLogs.filter(f => String(f.date).slice(0,10) === d).reduce((a,f)=>({ calories:a.calories+(Number(f.calories)||0), protein:a.protein+(Number(f.protein)||0), fibre:a.fibre+(Number(f.fibre)||0) }),{calories:0,protein:0,fibre:0}));
  const waterByDay = dates.map(d => waterLogs.filter(w => String(w.date).slice(0,10) === d).reduce((a,w)=>a+(Number(w.amountMl)||0),0));
  const workouts3 = workoutLogs.filter(w => dates.includes(String(w.date).slice(0,10)));
  const available = [sleepByDay[0] > 0, foodByDay[0].calories > 0 || foodByDay[0].protein > 0, waterByDay[0] > 0, workouts3.length > 0].filter(Boolean).length;
  if (available < 2) return { available:false, score:null, label:'Not enough data', reasons:[], factors:{} };
  const sleepAvg = sleepByDay.filter(v=>v>0); const sleepScore = sleepAvg.length ? Math.min(100, (sleepAvg.reduce((a,b)=>a+b,0)/sleepAvg.length)/targetSleep*100) : null;
  const todayFood = foodByDay[0];
  const proteinScore = todayFood.protein > 0 ? Math.min(100, todayFood.protein/targetProtein*100) : null;
  // Fibre score follows the exact same shape as proteinScore: percentage of
  // target, capped at 100, null (i.e. excluded from the weighted average
  // below) if nothing was logged rather than counted as a hard 0.
  const fibreScore = todayFood.fibre > 0 ? Math.min(100, todayFood.fibre/targetFibre*100) : null;
  const calRatio = todayFood.calories > 0 ? Math.min(1, todayFood.calories/targetCalories) : null;
  const waterScore = waterByDay[0] > 0 ? Math.min(100, waterByDay[0]/targetWater*100) : null;
  const trainingScore = workouts3.length === 0 ? 100 : workouts3.length === 1 ? 85 : workouts3.length === 2 ? 70 : 55;
  const weighted = [];
  // Weights re-balanced to make room for fibre (10) without letting it
  // overwhelm the existing four factors: protein 25->20 and calorie-ratio
  // 15->10 each gave up a little (both are nutrition factors fibre now
  // shares that "nutrition" portion of the score with); sleep/water/
  // training are untouched since they're separate domains. Total is still
  // 100 when every factor is present, same as before.
  if (sleepScore !== null) weighted.push([sleepScore,35]);
  if (proteinScore !== null) weighted.push([proteinScore,20]);
  if (fibreScore !== null) weighted.push([fibreScore,10]);
  if (calRatio !== null) weighted.push([Math.min(100, calRatio * 100),10]);
  if (waterScore !== null) weighted.push([waterScore,15]);
  if (workouts3.length > 0) weighted.push([trainingScore,10]);
  const score = Math.round(weighted.reduce((a,[v,w])=>a+v*w,0)/weighted.reduce((a,[v,w])=>a+w,0));
  const reasons=[];
  if (sleepScore !== null) reasons.push(sleepScore >= 100 ? 'Sleep met your target.' : `Sleep averaged ${formatSleepHours(sleepAvg.reduce((a,b)=>a+b,0)/sleepAvg.length)} against your ${formatSleepHours(targetSleep)} target.`);
  if (proteinScore !== null) reasons.push(proteinScore >= 100 ? 'Protein target was met.' : `Protein was ${Math.round(todayFood.protein)}g against your ${targetProtein}g target.`);
  if (fibreScore !== null) reasons.push(fibreScore >= 100 ? 'Fibre target was met.' : `Fibre was ${Math.round(todayFood.fibre)}g against your ${targetFibre}g target.`);
  if (waterScore !== null) reasons.push(waterScore >= 100 ? 'Water target was met.' : `Water was ${Math.round(waterByDay[0])}ml against your ${targetWater}ml target.`);
  if (sleepAvg.length >= 2 && sleepAvg[0] < targetSleep && sleepAvg[1] < targetSleep) reasons.unshift(`Sleep was below your target for the last 2 nights.`);
  const label = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Moderate' : 'Needs Recovery';
  return { available:true, score, label, reasons:reasons.slice(0,3), factors:{sleepScore,proteinScore,fibreScore,waterScore,trainingScore,calRatio}, sleepAvg:sleepAvg.length?sleepAvg.reduce((a,b)=>a+b,0)/sleepAvg.length:0, waterToday:waterByDay[0], proteinToday:todayFood.protein, fibreToday:todayFood.fibre };
}