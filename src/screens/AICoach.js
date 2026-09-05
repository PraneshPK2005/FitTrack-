import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useKeyboardPadding } from '../utils/keyboard';
import ClearableTextInput from '../components/ClearableTextInput';
import {
  FAQS,
  ACTIVITY_LEVELS,
  calculateProtein,
  calculateMaintenance,
  getFAQAnswer,
} from '../utils/faq-engine';

const C = {
  bg: '#080812',
  card: '#11111d',
  card2: '#17172a',
  border: 'rgba(255,255,255,0.07)',
  text: '#ffffff',
  muted: '#94a3b8',
  muted2: '#64748b',
  primary: '#8b5cf6',
  green: '#10b981',
};

function RichText({ text }) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={s.answerText}>
      {parts.map((part, i) => {
        const bold = part.startsWith('**') && part.endsWith('**');
        return (
          <Text key={i} style={bold ? s.bold : undefined}>
            {bold ? part.slice(2, -2) : part}
          </Text>
        );
      })}
    </Text>
  );
}

function Input({ label, value, onChangeText, placeholder }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>{label}</Text>
      <ClearableTextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted2}
        keyboardType="numeric"
      />
    </View>
  );
}

function SexSelector({ value, onChange }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>SEX</Text>
      <View style={s.segmentRow}>
        {['male', 'female'].map(sex => (
          <TouchableOpacity
            key={sex}
            style={[s.segment, value === sex && s.segmentActive]}
            onPress={() => onChange(sex)}
            activeOpacity={0.8}
          >
            <Text style={[s.segmentText, value === sex && s.segmentTextActive]}>
              {sex === 'male' ? 'Male' : 'Female'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function ActivitySelector({ value, onChange }) {
  return (
    <View style={s.inputGroup}>
      <Text style={s.inputLabel}>ACTIVITY LEVEL</Text>
      <View style={s.activityList}>
        {ACTIVITY_LEVELS.map(item => (
          <TouchableOpacity
            key={item.value}
            style={[s.activityItem, value === item.value && s.activityActive]}
            onPress={() => onChange(item.value)}
            activeOpacity={0.8}
          >
            <View style={[s.radio, value === item.value && s.radioActive]} />
            <Text style={[s.activityText, value === item.value && s.activityTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AICoach({ profile, foodLogs, sleepLogs }) {
  const [expanded, setExpanded] = useState(null);
  // Reuses the same keyboard-padding hook as the other screens (Nutrition,
  // Sleep, Settings, Dashboard, Workouts) rather than a new mechanism — this
  // screen previously had no keyboard handling at all, so its calculator
  // TextInputs (weight/height/age/protein weight) could end up hidden
  // behind the keyboard, especially the ones lower on the page.
  const kbPadding = useKeyboardPadding(40, 40);

  const profileWeight = profile?.currentWeight ?? profile?.weight;
  const profileHeight = profile?.heightCm ?? profile?.height ?? profile?.heightInCm;
  const profileAge = profile?.age;
  const profileSex = String(profile?.gender || profile?.sex || '').toLowerCase();

  const [calWeight, setCalWeight] = useState('');
  const [calHeight, setCalHeight] = useState('');
  const [calAge, setCalAge] = useState('');
  const [calSex, setCalSex] = useState(null);
  const [activity, setActivity] = useState(1.55);

  const [proteinWeight, setProteinWeight] = useState('');
  const [proteinSex, setProteinSex] = useState(null);

  const context = useMemo(() => ({
    profile: profile || {},
    foodLogs: foodLogs || [],
    sleepLogs: sleepLogs || [],
  }), [profile, foodLogs, sleepLogs]);

  const maintenanceResult = useMemo(() => calculateMaintenance({
    weight: calWeight,
    height: calHeight,
    age: calAge,
    sex: calSex,
    activity,
  }), [calWeight, calHeight, calAge, calSex, activity]);

  const proteinResult = useMemo(
    () => calculateProtein(proteinWeight, proteinSex),
    [proteinWeight, proteinSex]
  );

  const toggleFAQ = id => {
    setExpanded(prev => prev === id ? null : id);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: kbPadding }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <View style={s.header}>
        <View style={s.avatar}>
          <Text style={s.avatarEmoji}>❓</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>FitTrack FAQ</Text>
          <Text style={s.subtitle}>FITNESS • NUTRITION • RECOVERY</Text>
        </View>
      </View>

      <View style={s.intro}>
        <Text style={s.introTitle}>Frequently Asked Questions</Text>
        <Text style={s.introText}>
          These answers use the information currently stored in your FitTrack profile and today’s logs.
        </Text>
      </View>

      <View style={s.section}>
        {FAQS.map(item => {
          const open = expanded === item.id;
          return (
            <View key={item.id} style={s.card}>
              <TouchableOpacity
                style={s.questionRow}
                onPress={() => toggleFAQ(item.id)}
                activeOpacity={0.8}
              >
                <View style={s.iconBox}>
                  <Text style={s.icon}>{item.icon}</Text>
                </View>
                <Text style={s.question}>{item.question}</Text>
                <Text style={s.chevron}>{open ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {open && (
                <View style={s.answer}>
                  <View style={s.answerLine} />
                  <RichText text={getFAQAnswer(item.id, context)} />
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={s.calculationHeader}>
        <Text style={s.calculationTitle}>Calculations</Text>
        <Text style={s.calculationSubtitle}>
          Enter your details below. Select Male or Female for each calculation.
        </Text>
      </View>

      <View style={s.calculationCard}>
        <View style={s.calculationTitleRow}>
          <Text style={s.calculationIcon}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.calculationCardTitle}>Maintenance Calories</Text>
            <Text style={s.calculationCardSub}>Mifflin–St Jeor + activity level</Text>
          </View>
        </View>

        <Input label="WEIGHT (KG)" value={calWeight} onChangeText={setCalWeight} placeholder="e.g. 70" />
        <Input label="HEIGHT (CM)" value={calHeight} onChangeText={setCalHeight} placeholder="e.g. 170" />
        <Input label="AGE" value={calAge} onChangeText={setCalAge} placeholder="e.g. 25" />
        <SexSelector value={calSex} onChange={setCalSex} />
        <ActivitySelector value={activity} onChange={setActivity} />

        {maintenanceResult ? (
          <View style={s.resultBox}>
            <Text style={s.resultHeading}>YOUR ESTIMATE</Text>
            <Text style={s.selectedSex}>For {maintenanceResult.sex === 'male' ? 'Male' : 'Female'}</Text>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>BMR</Text>
              <Text style={s.resultValue}>{maintenanceResult.bmr} kcal/day</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>Maintenance</Text>
              <Text style={s.resultValue}>{maintenanceResult.maintenance} kcal/day</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>Fat loss</Text>
              <Text style={s.resultValue}>{maintenanceResult.cut} kcal/day</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>Muscle gain</Text>
              <Text style={s.resultValue}>{maintenanceResult.bulk} kcal/day</Text>
            </View>
          </View>
        ) : (
          <Text style={s.requiredText}>
            Enter weight, height, age, sex and activity level to calculate maintenance calories.
          </Text>
        )}
      </View>

      <View style={s.calculationCard}>
        <View style={s.calculationTitleRow}>
          <Text style={s.calculationIcon}>💪</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.calculationCardTitle}>Protein</Text>
            <Text style={s.calculationCardSub}>Body-weight-based daily requirement</Text>
          </View>
        </View>

        <Input label="WEIGHT (KG)" value={proteinWeight} onChangeText={setProteinWeight} placeholder="e.g. 70" />
        <SexSelector value={proteinSex} onChange={setProteinSex} />

        {proteinResult ? (
          <View style={s.resultBox}>
            <Text style={s.resultHeading}>DAILY PROTEIN</Text>
            <Text style={s.selectedSex}>For {proteinResult.sex === 'male' ? 'Male' : 'Female'}</Text>
            <Text style={s.bigResult}>{proteinResult.min}–{proteinResult.max} g</Text>
            <Text style={s.formula}>{proteinResult.formula}</Text>
            <Text style={s.formula}>Male: 1.6–2.2 g/kg/day • Female: 1.4–2.0 g/kg/day</Text>
          </View>
        ) : (
          <Text style={s.requiredText}>
            Enter weight and select Male or Female to calculate protein needs.
          </Text>
        )}
      </View>

      <View style={s.disclaimer}>
        <Text style={s.disclaimerTitle}>Calculation note</Text>
        <Text style={s.disclaimerText}>
          These are general fitness estimates, not medical advice. Maintenance calories are estimates and can vary with real-world activity and individual metabolism.
        </Text>
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 18, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 48, height: 48, borderRadius: 16, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
    borderWidth: 1, borderColor: C.border,
  },
  avatarEmoji: { fontSize: 22 },
  title: { color: C.text, fontSize: 23, fontWeight: '800' },
  subtitle: { color: C.muted2, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 3 },
  intro: { marginBottom: 18 },
  introTitle: { color: C.text, fontSize: 20, fontWeight: '800' },
  introText: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  section: { gap: 10 },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  questionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', padding: 14 },
  iconBox: {
    width: 42, height: 42, borderRadius: 13, backgroundColor: C.card2,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  icon: { fontSize: 20 },
  question: { flex: 1, color: C.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  chevron: { color: C.muted, fontSize: 11, marginLeft: 10 },
  answer: { paddingTop: 0, paddingRight: 14, paddingBottom: 16, paddingLeft: 14 },
  answerLine: { height: 1, backgroundColor: C.border, marginBottom: 14 },
  answerText: { color: C.muted, fontSize: 13, lineHeight: 20 },
  bold: { color: C.text, fontWeight: '800' },
  calculationHeader: { marginTop: 28, marginBottom: 14 },
  calculationTitle: { color: C.text, fontSize: 21, fontWeight: '800' },
  calculationSubtitle: { color: C.muted, fontSize: 13, marginTop: 5 },
  calculationCard: {
    backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.border,
    padding: 16, marginBottom: 14,
  },
  calculationTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  calculationIcon: { fontSize: 22, marginRight: 11 },
  calculationCardTitle: { color: C.text, fontSize: 17, fontWeight: '800' },
  calculationCardSub: { color: C.muted2, fontSize: 11, marginTop: 3 },
  inputGroup: { marginBottom: 13 },
  inputLabel: { color: C.muted2, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  input: {
    height: 46, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.card2, color: C.text, paddingHorizontal: 13, fontSize: 15,
  },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1, height: 44, borderRadius: 11, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center',
  },
  segmentActive: { borderColor: C.primary, backgroundColor: 'rgba(139,92,246,0.16)' },
  segmentText: { color: C.muted, fontWeight: '700' },
  segmentTextActive: { color: C.text },
  activityList: { gap: 7 },
  activityItem: {
    flexDirection: 'row', alignItems: 'center', padding: 11, borderRadius: 11,
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
  },
  activityActive: { borderColor: C.primary, backgroundColor: 'rgba(139,92,246,0.12)' },
  radio: { width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: C.muted2, marginRight: 10 },
  radioActive: { borderColor: C.primary, backgroundColor: C.primary },
  activityText: { flex: 1, color: C.muted, fontSize: 12, lineHeight: 17 },
  activityTextActive: { color: C.text, fontWeight: '700' },
  resultBox: { marginTop: 5, padding: 14, borderRadius: 14, backgroundColor: 'rgba(16,185,129,0.08)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  resultHeading: { color: C.green, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  selectedSex: { color: C.muted, fontSize: 12, marginBottom: 8 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  resultLabel: { color: C.muted, fontSize: 13 },
  resultValue: { color: C.text, fontSize: 13, fontWeight: '800' },
  bigResult: { color: C.text, fontSize: 27, fontWeight: '900' },
  formula: { color: C.muted, fontSize: 11, marginTop: 6, lineHeight: 16 },
  requiredText: { color: C.muted2, fontSize: 12, lineHeight: 18, marginTop: 4 },
  disclaimer: { padding: 14, borderRadius: 14, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, marginTop: 2 },
  disclaimerTitle: { color: C.text, fontSize: 12, fontWeight: '800', marginBottom: 5 },
  disclaimerText: { color: C.muted2, fontSize: 11, lineHeight: 17 },
});