/**
 * FitTrack AI — Intelligent Offline Coaching Engine
 * Full database access, trend analysis, date-aware queries
 */
import { parseNaturalFood, estimateMacros } from './food-database';

const TODAY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

function formatDate(dateStr) {
  if (!dateStr) return 'unknown date';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getDateDaysAgo(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function filterByDate(logs, date) {
  return (logs || []).filter(l => l.date && l.date.slice(0,10) === date);
}

function filterLastNDays(logs, n) {
  const cutoff = getDateDaysAgo(n);
  return (logs || []).filter(l => l.date && l.date.slice(0,10) >= cutoff);
}

function sumMacros(foodLogs) {
  return foodLogs.reduce((acc, f) => ({
    calories: acc.calories + (Number(f.calories) || 0),
    protein:  acc.protein  + (Number(f.protein)  || 0),
    carbs:    acc.carbs    + (Number(f.carbs)     || 0),
    fats:     acc.fats     + (Number(f.fats)      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });
}

// ─────────────────────────────────────────────────────────────
// Context Analysis — builds rich insights from all data
// ─────────────────────────────────────────────────────────────
function analyzeContext(ctx) {
  const { profile = {}, foodLogs = [], workoutLogs = [], sleepLogs = [], weightLogs = [], waterLogs = [] } = ctx;
  const today = TODAY();

  // Today
  const todayFood    = filterByDate(foodLogs, today);
  const todayMacros  = sumMacros(todayFood);
  const todaySleep   = filterByDate(sleepLogs, today)[0];
  const todayWorkout = filterByDate(workoutLogs, today);
  const todayWaterLogs = filterByDate(waterLogs, today);
  const todayWater = todayWaterLogs.reduce((n,w) => n + (Number(w.amountMl)||0), 0);
  const waterByDay = {};
  filterLastNDays(waterLogs, 7).forEach(w => { const d=w.date.slice(0,10); waterByDay[d]=(waterByDay[d]||0)+(Number(w.amountMl)||0); });
  const avgWater7 = Object.values(waterByDay).length ? Math.round(Object.values(waterByDay).reduce((a,b)=>a+b,0)/Object.values(waterByDay).length) : 0;

  // Last 7 days
  const week7Food  = filterLastNDays(foodLogs, 7);
  const week7Sleep = filterLastNDays(sleepLogs, 7);
  const week7Work  = filterLastNDays(workoutLogs, 7);

  // Group food by date for weekly analysis
  const caloriesByDay = {};
  const proteinByDay  = {};
  week7Food.forEach(f => {
    const d = f.date.slice(0,10);
    caloriesByDay[d] = (caloriesByDay[d] || 0) + (Number(f.calories) || 0);
    proteinByDay[d]  = (proteinByDay[d]  || 0) + (Number(f.protein)  || 0);
  });
  const calDayVals  = Object.values(caloriesByDay);
  const protDayVals = Object.values(proteinByDay);
  const avgCal7  = calDayVals.length  ? Math.round(calDayVals.reduce((a,b)=>a+b,0) / calDayVals.length)  : 0;
  const avgProt7 = protDayVals.length ? Math.round(protDayVals.reduce((a,b)=>a+b,0) / protDayVals.length) : 0;
  const daysUnderProtein = protDayVals.filter(p => p < (profile.proteinTarget || 140)).length;
  const daysUnderCal    = calDayVals.filter(c => c < (profile.calorieTarget || 2300) * 0.8).length;

  // Sleep avg
  const sleepDurs  = week7Sleep.map(s => Number(s.duration) || 0).filter(d => d > 0);
  const avgSleep7  = sleepDurs.length ? (sleepDurs.reduce((a,b)=>a+b,0) / sleepDurs.length).toFixed(1) : null;

  // Weight trend
  const recentWeights = [...weightLogs].sort((a,b) => b.date > a.date ? 1 : -1).slice(0, 14);
  const weightTrend = recentWeights.length >= 2
    ? (recentWeights[0].weight - recentWeights[recentWeights.length-1].weight).toFixed(1)
    : null;

  // Workout frequency
  const workoutDates7 = [...new Set(week7Work.map(w => w.date.slice(0,10)))];

  return {
    profile, today,
    todayFood, todayMacros, todaySleep, todayWorkout,
    avgCal7, avgProt7, avgSleep7,
    daysUnderProtein, daysUnderCal,
    weekWorkoutDays: workoutDates7.length,
    weightTrend,
    currentWeight: recentWeights[0]?.weight,
    todayWater, avgWater7, waterLogs,
    foodLogs, workoutLogs, sleepLogs, weightLogs,
  };
}

// ─────────────────────────────────────────────────────────────
// Intent Detection
// ─────────────────────────────────────────────────────────────
function detectIntent(msg) {
  const m = msg.toLowerCase();
  if (/(what.*(eat|had|ate|food|meal|lunch|dinner|breakfast)|today.*(food|meal|eat|log))/.test(m)) return 'today_food';
  // Date-specific nutrition query: "what did I eat on 9th july" / "calories on july 9" etc.
  if (/(calorie|protein|food|eat|ate|had|intake|macro).*(on|for).*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}(st|nd|rd|th)?|\d{4}-\d{2}-\d{2})/.test(m)) return 'food_on_date';
  if (/(on|for).*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}(st|nd|rd|th)?).*\s*(calorie|protein|food|eat|ate|intake|macro)/.test(m)) return 'food_on_date';
  if (/(this week|7 day|seven day|weekly|past week).*(calorie|food|eat|protein|macro)/.test(m)) return 'weekly_nutrition';
  if (/(this week|7 day).*(sleep|rest|recover)/.test(m)) return 'weekly_sleep';
  if (/(superset|super set).*(bench|squat|deadlift|press|curl|row|exercise|performance|perform)|how.*(perform|did).*superset/.test(m)) return 'superset_check';
  if (/(how('s| is).*protein|protein.*(today|this week|target|intake|eaten|have i|enough)|did i hit.*protein|check my protein|my protein intake)/.test(m)) return 'protein_check';
  if (/(calorie|kcal).*(today|this week|how much)/.test(m)) return 'calorie_check';
  if (/(maintenance.*(calorie|caloric|tdee)|tdee|bmr|how many calorie.*(need|maintain)|calorie.*maintain)/.test(m)) return 'maintenance';
  if (/(how much.*(protein|water)|protein.*need|water.*need|daily protein|daily water|water intake|hydration need)/.test(m)) return 'daily_needs';
  if (/(sleep|rest|tired|fatigue)/.test(m)) return 'sleep';
  if (/(weight|lose|gain|trend|progress)/.test(m)) return 'weight';
  if (/(workout|exercise|training|gym|lift).*(this week|today|recent|how many|how much)/.test(m)) return 'workout_check';
  if (/(best lift|personal record|pr|max weight)/.test(m)) return 'pr';
  if (/(what (should|to|can) (i|we) eat|suggest|recommend.*food|next meal)/.test(m)) return 'meal_suggest';
  if (/(protein|muscle|build|gains)/.test(m)) return 'protein';
  if (/(calorie|deficit|surplus|tdee|bmr)/.test(m)) return 'calories';
  if (/(workout|exercise|training|program|split)/.test(m)) return 'workout_advice';
  if (/(water|hydrat|drink)/.test(m)) return 'hydration';
  if (/(hello|hi|hey|good morning|good evening|start)/.test(m)) return 'greeting';
  return 'general';
}

// ─────────────────────────────────────────────────────────────
// Response Generators
// ─────────────────────────────────────────────────────────────
function respondTodayFood(a) {
  if (a.todayFood.length === 0) return `You haven't logged any food today yet! Head to the Nutrition tab to log your meals. Your calorie target is **${a.profile.calorieTarget || 2300} kcal**.`;
  const foodList = a.todayFood.map(f => `• ${f.name} (${f.calories} kcal)`).join('\n');
  return `Here's what you've logged today:\n\n${foodList}\n\n**Total: ${a.todayMacros.calories} kcal** | P: ${a.todayMacros.protein}g · C: ${a.todayMacros.carbs}g · F: ${a.todayMacros.fats}g\n\n${a.todayMacros.calories < a.profile.calorieTarget * 0.7 ? `You still need **${(a.profile.calorieTarget - a.todayMacros.calories)} more kcal** today.` : ''}`;
}

function respondWeeklyNutrition(a) {
  return `**This week's nutrition summary (7-day avg):**\n\n• Calories: **${a.avgCal7} kcal/day** (target: ${a.profile.calorieTarget || 2300})\n• Protein: **${a.avgProt7}g/day** (target: ${a.profile.proteinTarget || 140}g)\n• Days under protein target: **${a.daysUnderProtein}/7**\n• Days under calorie target by >20%: **${a.daysUnderCal}/7**\n\n${a.daysUnderProtein >= 4 ? '⚠️ Your protein intake has been consistently low. Try adding a whey shake or extra chicken to your meals.' : '✅ Your protein intake looks solid this week!'}`;
}

function respondProteinCheck(a) {
  const gap = (a.profile.proteinTarget || 140) - a.todayMacros.protein;
  return `**Today:** ${a.todayMacros.protein}g protein (target: ${a.profile.proteinTarget || 140}g) → ${gap > 0 ? `${gap}g remaining` : '✅ Target hit!'}\n\n**7-day average:** ${a.avgProt7}g/day\n${a.daysUnderProtein > 0 ? `You missed your protein target on **${a.daysUnderProtein} of the last 7 days**.` : 'You\'ve been hitting your protein target consistently 💪'}\n\nTop protein sources: chicken breast (31g/100g), eggs (6g each), dal (9g/100g), paneer (18g/100g), whey protein (25g/scoop).`;
}

function respondCalorieCheck(a) {
  const gap = (a.profile.calorieTarget || 2300) - a.todayMacros.calories;
  return `**Today:** ${a.todayMacros.calories} kcal logged (target: ${a.profile.calorieTarget || 2300} kcal) → **${gap > 0 ? `${gap} kcal remaining` : 'Over target by ' + Math.abs(gap) + ' kcal'}**\n\n**7-day average:** ${a.avgCal7} kcal/day\n\n${a.avgCal7 < (a.profile.calorieTarget || 2300) * 0.85 ? '⚠️ You\'ve been consistently under-eating this week. This can slow metabolism and muscle recovery.' : '✅ Your calorie intake looks on track this week.'}`;
}

function respondSleep(a) {
  const target = a.profile.sleepTarget || 8;
  const todaySleepHrs = a.todaySleep?.duration;
  const sleepStatus = todaySleepHrs ? `Last logged sleep: **${todaySleepHrs}h** (target: ${target}h)` : 'No sleep logged yet today.';
  const weekStatus = a.avgSleep7 ? `7-day average: **${a.avgSleep7}h/night**` : 'No sleep data for this week.';
  const advice = !a.avgSleep7 || Number(a.avgSleep7) < target - 1
    ? `\n\nYou appear to be sleep-deprived. This raises **cortisol** (fat-storing hormone), impairs muscle recovery, increases hunger, and reduces willpower. Aim for ${target}h consistently.\n\n**Tips:** Dim lights 1hr before bed, cool room (18-20°C), no caffeine after 2PM, consistent sleep/wake times even on weekends.`
    : `\n\n✅ Your sleep looks good! Recovery is on track.`;
  return `${sleepStatus}\n${weekStatus}${advice}`;
}

function respondWeight(a) {
  const current = a.currentWeight || a.profile.currentWeight;
  const target  = a.profile.targetWeight;
  const gap     = current && target ? Math.abs(current - target).toFixed(1) : null;
  const trend   = a.weightTrend;
  const trendText = trend !== null
    ? (Number(trend) < 0 ? `📉 You've lost **${Math.abs(trend)}kg** over the last 2 weeks` : `📈 You've gained **${trend}kg** over the last 2 weeks`)
    : 'No weight trend yet (log your weight daily for trends)';
  return `**Weight Overview:**\n\nCurrent: **${current || 'not set'}kg** → Target: **${target || 'not set'}kg** ${gap ? `(${gap}kg to go)` : ''}\n\n${trendText}\n\nFor sustainable fat loss: 300-500 kcal daily deficit + 0.8-1g protein/lb bodyweight + strength training 3x/week + 7,000+ steps/day. Aim for 0.3-0.7kg/week loss.`;
}

function respondWorkoutCheck(a) {
  const todayCount = a.todayWorkout.length;
  const target = a.profile.workoutTarget || 4;
  return `**Workout Summary:**\n\nToday: **${todayCount > 0 ? todayCount + ' exercises logged ✅' : 'Rest day / not logged yet'}**\nThis week: **${a.weekWorkoutDays} workout days** (target: ${target}/week)\n\n${a.weekWorkoutDays >= target ? '✅ You\'re on track with your workout frequency!' : `⚠️ You need ${target - a.weekWorkoutDays} more workout day${target - a.weekWorkoutDays > 1 ? 's' : ''} this week to hit your target.`}`;
}

function respondPR(a) {
  const prMap = {};
  (a.workoutLogs || []).filter(log => log.isSuperset !== true).forEach(log => {
    const sets = log.sets || [];
    sets.forEach(s => {
      const w = Number(s.weight) || Number(log.weight) || 0;
      const name = log.exerciseName || log.name || 'Unknown';
      if (!prMap[name] || w > prMap[name]) prMap[name] = w;
    });
    if (!sets.length) {
      const w = Number(log.weight) || 0;
      const name = log.exerciseName || log.name || 'Unknown';
      if (!prMap[name] || w > prMap[name]) prMap[name] = w;
    }
  });
  const prs = Object.entries(prMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (prs.length === 0) return 'No workout data yet! Start logging your exercises and I\'ll track your personal records.';
  const list = prs.map(([name, w], i) => `${i+1}. **${name}** — ${w}kg`).join('\n');
  return `**Your Personal Records 🏆**\n\n${list}\n\nKeep pushing progressive overload — increase weight by 2-5% when you can complete all reps with good form!`;
}

function respondSupersetCheck(a) {
  const rows = (a.workoutLogs || []).filter(l => l.isSuperset === true);
  if (!rows.length) return "You have no superset workout data yet. Log two or more exercises together as a superset and I'll track those performances separately from normal PRs.";
  const recent = [...rows].sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 8);
  const lines = recent.map(l => {
    const sets = Array.isArray(l.sets) ? l.sets : [];
    const best = sets.reduce((b, st) => Math.max(b, Number(st.weight) || 0), Number(l.weight) || 0);
    return `• **${l.exerciseName || 'Exercise'}** — ${best ? `${best}kg` : 'bodyweight'} · ${l.date}`;
  }).join('\n');
  return `**Recent Superset Performance 🔗**\n\n${lines}\n\nThese performances are shown separately because fatigue during supersets can lower the weight/reps. They are **not counted as normal PRs**.`;
}

function respondMealSuggest(a) {
  const cal = a.todayMacros.calories;
  const prot = a.todayMacros.protein;
  const protTarget = a.profile.proteinTarget || 140;
  const calTarget  = a.profile.calorieTarget  || 2300;
  const protGap = protTarget - prot;
  const calGap  = calTarget - cal;
  if (calGap < 200) return `You're close to your calorie target (${cal}/${calTarget} kcal). Consider a light snack: **Greek yogurt** (100 kcal, 10g protein) or **a handful of almonds** (174 kcal).`;
  if (protGap > 30) return `You need **${protGap}g more protein** today. Great options:\n• Grilled chicken breast 200g → 62g protein, 330 kcal\n• Whey protein shake → 25g protein, 120 kcal\n• Paneer 150g → 27g protein, 398 kcal\n• Tuna 100g → 26g protein, 116 kcal`;
  if (calGap > 600) return `You need **${calGap} more kcal** today. A balanced meal: **rice (200g) + dal (150g) + vegetables** gives ~570 kcal, 20g protein, and balanced macros.`;
  return `You've had ${cal} kcal and ${prot}g protein today. A snack of **banana + peanut butter** (277 kcal, 9g protein) or **Greek yogurt with almonds** (274 kcal, 16g protein) would round out your day nicely.`;
}

function respondGreeting(a) {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const cal = a.todayMacros.calories;
  const prot = a.todayMacros.protein;
  return `Good ${time}! I'm your **FitTrack AI Coach** 🤖\n\nHere's your today at a glance:\n• Calories: ${cal} / ${a.profile.calorieTarget || 2300} kcal\n• Protein: ${prot}g / ${a.profile.proteinTarget || 140}g\n• Workouts: ${a.todayWorkout.length > 0 ? '✅ Done' : 'Not logged'}\n• Sleep: ${a.todaySleep?.duration ? a.todaySleep.duration + 'h' : 'Not logged'}\n\nWhat would you like to know? You can ask me about your nutrition, workouts, sleep, or get personalized advice!`;
}

// ─────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Date-specific nutrition lookup
// ─────────────────────────────────────────────────────────────
const MONTH_MAP = {
  jan:1,feb:2,mar:3,apr:4,may:5,jun:6,
  jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  january:1,february:2,march:3,april:4,june:6,
  july:7,august:8,september:9,october:10,november:11,december:12,
};

function extractDateFromMessage(msg) {
  const m = msg.toLowerCase();
  // ISO format: 2024-07-09
  const isoMatch = m.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  // "9th july" / "july 9" / "9 july" etc.
  const monthNames = Object.keys(MONTH_MAP).join('|');
  const r1 = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})(?:\\s+(\\d{4}))?`);
  const r2 = new RegExp(`(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`);
  let match = m.match(r1);
  if (match) {
    const day   = String(match[1]).padStart(2, '0');
    const month = String(MONTH_MAP[match[2]]).padStart(2, '0');
    const year  = match[3] || new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }
  match = m.match(r2);
  if (match) {
    const day   = String(match[2]).padStart(2, '0');
    const month = String(MONTH_MAP[match[1]]).padStart(2, '0');
    const year  = match[3] || new Date().getFullYear();
    return `${year}-${month}-${day}`;
  }
  return null;
}

function respondFoodOnDate(message, a) {
  const dateStr = extractDateFromMessage(message);
  if (!dateStr) return `I couldn't figure out which date you meant. Try asking like **"what did I eat on 9th July"** or **"calories on 2024-07-09"**.`;

  const logsForDate = (a.foodLogs || []).filter(l => l.date && String(l.date).slice(0, 10) === dateStr);
  const [y, m, d]   = dateStr.split('-');
  const dateLabel   = `${parseInt(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m)-1]} ${y}`;

  if (!logsForDate.length) return `No food logged on **${dateLabel}**. Either nothing was logged that day or the date is outside your history.`;

  const totals = logsForDate.reduce((a, f) => ({
    calories: a.calories + (Number(f.calories) || 0),
    protein:  a.protein  + (Number(f.protein)  || 0),
    carbs:    a.carbs    + (Number(f.carbs)    || 0),
    fats:     a.fats     + (Number(f.fats)     || 0),
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  const foodList = logsForDate.map(f => `• ${f.name} — ${f.calories} kcal, P:${f.protein}g`).join('\n');
  const calTarget = a.profile.calorieTarget || 2300;
  const vs = totals.calories >= calTarget * 0.9 && totals.calories <= calTarget * 1.15
    ? '✅ Right on target!'
    : totals.calories < calTarget * 0.7
    ? `⚠️ Under target by ${Math.round(calTarget - totals.calories)} kcal`
    : totals.calories > calTarget * 1.15
    ? `⚠️ Over target by ${Math.round(totals.calories - calTarget)} kcal`
    : '';
  return `**Food logged on ${dateLabel}:**\n\n${foodList}\n\n**Total: ${Math.round(totals.calories)} kcal** | P: ${Math.round(totals.protein)}g · C: ${Math.round(totals.carbs)}g · F: ${Math.round(totals.fats)}g\n\n${vs}`;
}

// ─────────────────────────────────────────────────────────────
// Maintenance calories (simple Mifflin-St Jeor estimate)
// ─────────────────────────────────────────────────────────────
function respondMaintenance(a) {
  const weight = a.currentWeight || a.profile.currentWeight || 80;
  // Moderate activity multiplier (1.55) — typical for someone logging workouts
  const bmr  = Math.round(10 * weight + 6.25 * 170 - 5 * 25 + 5); // approx male; profile doesn't have age/height
  const tdee = Math.round(bmr * 1.55);
  const cut  = Math.round(tdee - 400);
  const bulk = Math.round(tdee + 300);
  return `**Estimated Maintenance Calories** (based on ${weight}kg body weight):\n\n• **Maintenance (TDEE):** ~${tdee} kcal/day\n• **Cut (fat loss):** ~${cut} kcal/day (−400 kcal deficit)\n• **Bulk (muscle gain):** ~${bulk} kcal/day (+300 kcal surplus)\n\n⚠️ This is an estimate using moderate activity level. Your actual TDEE depends on height, age, and exact activity. Track your weight weekly and adjust ±100-200 kcal based on results.\n\nYour current calorie target is set to **${a.profile.calorieTarget || 2300} kcal**.`;
}

// ─────────────────────────────────────────────────────────────
// Daily protein & water needs based on body weight
// ─────────────────────────────────────────────────────────────
function respondDailyNeeds(a) {
  const weight = a.currentWeight || a.profile.currentWeight || 80;
  const protMin  = Math.round(weight * 1.6);
  const protMax  = Math.round(weight * 2.2);
  const waterMin = Math.round(weight * 35) / 1000;
  const waterMax = Math.round(weight * 40) / 1000;
  const todayProt = a.todayMacros?.protein || 0;
  const protGap   = Math.max(0, protMin - todayProt);
  return `**Daily Needs based on your weight (${weight}kg):**\n\n**Protein:**\n• Range: **${protMin}g – ${protMax}g/day** (1.6–2.2 × body weight)\n• Today so far: ${Math.round(todayProt)}g${protGap > 0 ? ` → **${protGap}g more needed**` : ' → ✅ Target met!'}\n• Your current target: ${a.profile.proteinTarget || 140}g\n\n**Water:**\n• Range: **${waterMin.toFixed(1)}L – ${waterMax.toFixed(1)}L/day** (35–40 ml × body weight)\n• Tip: Add 500ml per hour of intense training\n\n**Quick protein sources:**\n• Chicken breast 200g → 62g\n• Whey shake → 25g\n• Eggs ×3 → 18g\n• Paneer 150g → 27g\n• Dal 150g → 13g`;
}

export const aiEngine = {
  /**
   * Parse natural language food input using food-database.js
   */
  parseFoodInput(text, customFoods = []) {
    const items = parseNaturalFood(text, customFoods);
    if (items.length === 0) {
      // Try AI estimation for the whole text
      const estimated = estimateMacros(text.trim(), 100);
      const cleaned   = text.trim().replace(/\d+g?/gi, '').trim() || text.trim();
      return {
        success: true,
        estimated: true,
        message: `I couldn't find exact data, so here's an AI estimate for "${cleaned}". Please verify the values are reasonable.`,
        items: [{
          id: `est_${Date.now()}`,
          name: cleaned,
          ...estimated,
          date: TODAY(),
        }],
      };
    }
    return { success: true, estimated: false, items };
  },

  /**
   * Smart coach response with full database context
   */
  getCoachResponse(message, ctx = {}) {
    const a = analyzeContext(ctx);
    const intent = detectIntent(message);

    switch (intent) {
      case 'today_food':       return respondTodayFood(a);
      case 'food_on_date':     return respondFoodOnDate(message, a);
      case 'weekly_nutrition': return respondWeeklyNutrition(a);
      case 'protein_check':    return respondProteinCheck(a);
      case 'calorie_check':    return respondCalorieCheck(a);
      case 'maintenance':      return respondMaintenance(a);
      case 'daily_needs':      return respondDailyNeeds(a);
      case 'sleep':            return respondSleep(a);
      case 'weight':           return respondWeight(a);
      case 'workout_check':    return respondWorkoutCheck(a);
      case 'pr':               return respondPR(a);
      case 'superset_check':    return respondSupersetCheck(a);
      case 'meal_suggest':     return respondMealSuggest(a);
      case 'greeting':         return respondGreeting(a);
      case 'weekly_sleep':     return respondSleep(a);
      case 'protein':          return respondProteinCheck(a);
      case 'calories':         return respondCalorieCheck(a);
      case 'workout_advice':
        return `For maximum results, use a **Push/Pull/Legs** split:\n\n• **Push** (Mon): Chest, Shoulders, Triceps — Bench Press, OHP, Dips\n• **Pull** (Wed): Back, Biceps — Deadlifts, Pull-ups, Rows\n• **Legs** (Fri): Quads, Hamstrings, Glutes — Squat, Leg Press, RDL\n\nRest 1-2 min between sets. Progressive overload weekly. Deload every 4-6 weeks.`;
      case 'hydration': {
        const w = a.currentWeight || a.profile.currentWeight || 80;
        const wMin = (w * 35 / 1000).toFixed(1);
        const wMax = (w * 40 / 1000).toFixed(1);
        return `Based on your weight (${w}kg), aim for **${wMin}L – ${wMax}L of water daily** (35–40 ml × body weight).\n\nAdd 500ml per hour of training. Signs of dehydration: headaches, dark urine, fatigue, reduced gym performance. Drink 500ml in the morning, 500ml pre-workout, and sip throughout the day.`;
      }
      default: {
        const tips = [
          respondGreeting(a),
          `Based on your data: avg **${a.avgCal7} kcal/day** this week vs your target of ${a.profile.calorieTarget || 2300} kcal. ${a.daysUnderProtein > 2 ? `Protein has been low (avg ${a.avgProt7}g vs ${a.profile.proteinTarget || 140}g target) — try adding more protein sources.` : 'Your nutrition is looking solid!'}`,
          `I have access to your full health data. Ask me things like:\n• "What did I eat today?"\n• "How's my protein this week?"\n• "Show my best lifts"\n• "How's my sleep been?"\n• "What should I eat next?"`,
        ];
        return tips[Math.floor(Math.random() * tips.length)];
      }
    }
  },
};