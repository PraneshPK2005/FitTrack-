/**
 * FitTrack FAQ / Calculation Engine
 *
 * This file is intentionally independent from utils/ai-engine.js.
 * Do not modify or import ai-engine.js here. Nutrition/Workout code can
 * continue using the existing ai-engine.js unchanged.
 */

import { formatSleepHours } from './database';

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function normalizeSex(value) {
  const v = String(value || '').trim().toLowerCase();
  if (/^(male|man|men|m)$/.test(v)) return 'male';
  if (/^(female|woman|women|f)$/.test(v)) return 'female';
  return null;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todaySleep(sleepLogs = []) {
  const today = todayKey();
  return (sleepLogs || []).find(log => String(log?.date || '').slice(0, 10) === today) || null;
}

function sumTodayFood(foodLogs = []) {
  const today = todayKey();
  return (foodLogs || [])
    .filter(log => String(log?.date || '').slice(0, 10) === today)
    .reduce((totals, food) => ({
      calories: totals.calories + (Number(food?.calories) || 0),
      protein: totals.protein + (Number(food?.protein) || 0),
    }), { calories: 0, protein: 0 });
}

export function calculateProtein(weight, sex) {
  const w = number(weight);
  const s = normalizeSex(sex);
  if (!w || w <= 0 || !s) return null;

  // Sex-specific protein ranges used by the FAQ calculator.
  // Male: 1.6–2.2 g/kg/day
  // Female: 1.4–2.0 g/kg/day
  const minFactor = s === 'male' ? 1.6 : 1.4;
  const maxFactor = s === 'male' ? 2.2 : 2.0;

  return {
    min: round(w * minFactor),
    max: round(w * maxFactor),
    sex: s,
    formula: '1.6–2.2 g/kg body weight',
  };
}

export function calculateMaintenance({ weight, height, age, sex, activity }) {
  const w = number(weight);
  const h = number(height);
  const a = number(age);
  const s = normalizeSex(sex);
  const activityFactor = number(activity);

  if (!w || w <= 0 || !h || h <= 0 || !a || a <= 0 || !s || !activityFactor) return null;

  // Mifflin–St Jeor equation. The sex-specific constant is +5 for men and
  // -161 for women.
  const bmr = s === 'male'
    ? (10 * w) + (6.25 * h) - (5 * a) + 5
    : (10 * w) + (6.25 * h) - (5 * a) - 161;

  const tdee = bmr * activityFactor;

  return {
    bmr: round(bmr),
    maintenance: round(tdee),
    cut: round(tdee - 300),
    bulk: round(tdee + 250),
    activityFactor,
    sex: s,
  };
}

export function calculateWater(weight) {
  const w = number(weight);
  if (!w || w <= 0) return null;

  return {
    min: Number((w * 35 / 1000).toFixed(1)),
    max: Number((w * 40 / 1000).toFixed(1)),
  };
}

export const ACTIVITY_LEVELS = [
  { label: 'Sedentary — little or no exercise', value: 1.2 },
  { label: 'Lightly active — 1–3 days/week', value: 1.375 },
  { label: 'Moderately active — 3–5 days/week', value: 1.55 },
  { label: 'Very active — 6–7 days/week', value: 1.725 },
  { label: 'Extremely active — hard training/physical job', value: 1.9 },
];

/**
 * The five FAQ answers are generated from the user's current app data.
 * No previous-day records are queried.
 */
export function getFAQAnswer(id, context = {}) {
  const profile = context.profile || {};
  const foodLogs = context.foodLogs || [];
  const sleepLogs = context.sleepLogs || [];

  const weight = number(profile.currentWeight ?? profile.weight);
  const height = number(profile.heightCm ?? profile.height ?? profile.heightInCm);
  const proteinTarget = number(profile.proteinTarget) || 140;
  const calorieTarget = number(profile.calorieTarget) || 2300;
  const sleepTarget = number(profile.sleepTarget) || 8;
  const todayFood = sumTodayFood(foodLogs);
  const sleep = todaySleep(sleepLogs);

  switch (id) {
    case 'protein': {
      if (!weight) {
        return `Your current body weight is not available in your profile. Add your weight in your profile to see your protein requirement.`;
      }
      const sex = normalizeSex(profile.sex ?? profile.gender);
      const minFactor = sex === 'female' ? 1.4 : 1.6;
      const maxFactor = sex === 'female' ? 2.0 : 2.2;
      const min = round(weight * minFactor);
      const max = round(weight * maxFactor);
      const remaining = Math.max(0, proteinTarget - todayFood.protein);
      return `Based on your current weight of **${weight} kg**${sex ? ` and profile sex (${sex === 'male' ? 'Male' : 'Female'})` : ''}, a useful range is **${min}–${max}g protein/day**.\n\nYour current FitTrack target is **${proteinTarget}g/day**.\nToday you have logged **${round(todayFood.protein)}g**, so you have about **${remaining}g** left to reach your current target.`;
    }

    case 'calories': {
      return `Your current FitTrack calorie target is **${calorieTarget} kcal/day**.\n\nToday you have logged **${round(todayFood.calories)} kcal**.\n\nFor a personalized maintenance-calorie calculation using your **weight, height, age, sex and activity level**, use the **Maintenance Calories** calculator below.`;
    }

    case 'sleep': {
      if (!sleep) {
        return `You have **no sleep record logged for today yet**. Your current sleep target is **${formatSleepHours(sleepTarget)}/night**.\n\nFor most adults, **7–9 hours** per night is a useful general range, especially when training.`;
      }
      const duration = number(sleep.duration);
      return `Your sleep logged for today is **${duration !== null ? formatSleepHours(duration) : '—'}**.\n\nYour FitTrack sleep target is **${formatSleepHours(sleepTarget)}**.\n\n${duration !== null && duration >= sleepTarget ? '✅ You have reached your current sleep target.' : duration !== null ? `You are about **${formatSleepHours(Math.max(0, sleepTarget - duration))}** below your current target.` : 'Keep logging your sleep to track it accurately.'}`;
    }

    case 'water': {
      if (!weight) {
        return `Your current body weight is not available in your profile. Add your weight to see your daily water estimate.`;
      }
      const result = calculateWater(weight);
      return `Based on your current weight of **${weight} kg**, a simple estimate is **${result.min}–${result.max} L of water/day**.\n\nThis estimate can increase with **heat, sweating and intense exercise**.`;
    }

    default:
      return '';
  }
}

export const FAQS = [
  { id: 'protein', icon: '💪', question: 'How much protein do I need?' },
  { id: 'calories', icon: '🔥', question: 'How many calories do I need?' },
  { id: 'sleep', icon: '😴', question: 'How much sleep should I get today?' },
  { id: 'water', icon: '💧', question: 'How much water should I drink?' },
];