// src/pages/MastersOnboarding.tsx — 10-step wizard, redesigned 2026-07-31 for
// parity with (and grad-specific depth beyond) the undergrad onboarding
// (src/pages/Onboarding.tsx). See that file for the visual language this
// mirrors: inline validation, visual feedback, "why we're asking" trust
// copy, structured multi-entry builders, sentiment feedback on free text,
// and a genuine payoff/reveal step — none of which the previous 7-step,
// 488-line version had.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GraduationCap, ChevronLeft, ChevronRight, Check, Plus, X } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';

/* ─── Design tokens ────────────────────────────────────────────────────── */
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  surface: 'var(--color-bg-surface)',
  surface2: 'var(--color-surface-subtle)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  text: 'var(--color-text-primary)',
  font: "'Inter', system-ui, sans-serif",
};
const GLOBAL = `
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes floatUp{0%{transform:translateY(0);opacity:.7}100%{transform:translateY(-60px);opacity:0}}
  @keyframes glowPulse{0%,100%{box-shadow:0 0 0 rgba(255,215,0,0)}50%{box-shadow:0 0 24px rgba(255,215,0,.35)}}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
`;

const DEGREES = ['MS', 'MA', 'MBA'] as const;
const TERMS = ['fall', 'spring', 'summer', 'winter'] as const;
const TRACK_TYPES = [
  { value: 'thesis', label: 'Thesis / Research', desc: 'Original research, advisor-supervised' },
  { value: 'coursework', label: 'Coursework / Professional', desc: 'Structured curriculum, no thesis' },
  { value: 'unsure', label: "Not sure yet", desc: "We'll show you both" },
] as const;
const SOP_STATUSES = ['not_started', 'drafting', 'reviewing', 'final'] as const;
const FUNDING_NEEDS = [
  { value: 'fully_funded_required', label: 'Fully funded required', desc: "Can't attend without full funding" },
  { value: 'partial_funding_preferred', label: 'Partial funding preferred', desc: 'Some aid needed, can bridge the rest' },
  { value: 'self_funding', label: 'Self-funding', desc: 'Funding is not a constraint' },
  { value: 'unsure', label: 'Not sure yet', desc: '' },
] as const;
const PROGRAM_FORMATS = ['on_campus', 'online', 'hybrid', 'no_preference'] as const;
const STUDY_PACES = ['full_time', 'part_time', 'no_preference'] as const;

// Country cards with grad-specific work-authorization microcopy — the masters
// equivalent of undergrad's citizenship→aid-eligibility tooltip. This matters
// more for grad applicants than undergrad: post-study work rights are often a
// deciding factor in country choice.
const COUNTRIES_DATA = [
  { code: 'US', name: 'United States', flag: '🇺🇸', desc: 'Research powerhouse', visa: 'OPT: up to 3 years post-study work (STEM extension)' },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', desc: 'Academic prestige', visa: 'Graduate Route: 2 years post-study work' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', desc: 'Immigration-friendly', visa: 'PGWP: up to 3 years, PR pathway' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', desc: 'Low/no tuition, strong engineering', visa: '18-month post-study job search visa' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', desc: 'English-taught programs', visa: '1-year "orientation year" search visa' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', desc: 'Global outlook', visa: 'Temporary Graduate visa: 2-4 years' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', desc: 'Asia gateway', visa: 'No dedicated post-study visa — employer sponsorship needed' },
];

const STEPS = [
  'Program Intent',
  'Academic Background',
  'Standardized Tests',
  'Research & Experience',
  'Advisor & Research Fit',
  'Recommendations',
  'Purpose & Goals',
  'Funding & Preferences',
  'Target Countries',
  'Review',
];

const STEP_THEMES = [
  { bg: '#0C0C1B', accent: '#3B9EFF', surface: '#13131f' },
  { bg: '#0B1220', accent: '#38BDF8', surface: '#0f1b2e' },
  { bg: '#0E1512', accent: '#34D399', surface: '#101c17' },
  { bg: '#160F1D', accent: '#A78BFA', surface: '#1b1427' },
  { bg: '#1A0E1F', accent: '#F472B6', surface: '#22132a' },
  { bg: '#1A130C', accent: '#F59E0B', surface: '#241a10' },
  { bg: '#12131A', accent: '#60A5FA', surface: '#161824' },
  { bg: '#0D1A16', accent: '#2DD4BF', surface: '#11221c' },
  { bg: '#151119', accent: '#F87171', surface: '#1c1620' },
  { bg: '#07070B', accent: '#E3C66A', surface: '#101018' },
];

const num = (v: string): number | undefined => (v === '' || v === undefined ? undefined : Number(v));

interface ResearchEntry { title: string; role: string; output_type: string; year: string; }
interface WorkEntry { title: string; company: string; years: string; description: string; }

interface FormState {
  target_degree_type: string;
  intended_program: string;
  intended_specialization: string;
  track_type: string;
  target_intake_term: string;
  target_intake_year: string;
  undergrad_institution: string;
  undergrad_major: string;
  undergrad_country: string;
  undergrad_gpa: string;
  undergrad_gpa_scale: string;
  gre_verbal: string; gre_quant: string; gre_awa: string;
  gmat_total: string; gmat_focus_total: string;
  toefl_score: string; ielts_score: string; duolingo_score: string; pte_score: string;
  research_interests: string;
  advisor_targets: string;
  lors_secured: string; lors_required: string;
  lors_academic_count: string; lors_professional_count: string;
  sop_status: string;
  career_goals: string;
  why_this_program: string;
  funding_need: string;
  assistantship_interest: boolean;
  program_format: string;
  study_pace: string;
  visa_work_auth_interest: boolean;
}

const DEFAULT_FORM: FormState = {
  target_degree_type: 'MS', intended_program: '', intended_specialization: '', track_type: '',
  target_intake_term: 'fall', target_intake_year: '',
  undergrad_institution: '', undergrad_major: '', undergrad_country: '',
  undergrad_gpa: '', undergrad_gpa_scale: '4',
  gre_verbal: '', gre_quant: '', gre_awa: '', gmat_total: '', gmat_focus_total: '',
  toefl_score: '', ielts_score: '', duolingo_score: '', pte_score: '',
  research_interests: '', advisor_targets: '',
  lors_secured: '', lors_required: '3', lors_academic_count: '', lors_professional_count: '',
  sop_status: 'not_started', career_goals: '', why_this_program: '',
  funding_need: '', assistantship_interest: false, program_format: '', study_pace: '',
  visa_work_auth_interest: false,
};

const DRAFT_KEY = 'masters_onboarding_draft';
const ENTRIES_KEY = 'masters_onboarding_entries';

/* ─── Shared small components ─────────────────────────────────────────── */
const Label: React.FC<{ children: React.ReactNode; hint?: string }> = ({ children, hint }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 6, fontFamily: S.font, letterSpacing: '0.02em' }}>
    {children}
    {hint && <span title={hint} style={{ fontSize: 11, color: S.dim, fontWeight: 400 }}>ⓘ {hint}</span>}
  </span>
);

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', background: S.surface2, border: `1px solid ${S.border2}`,
  borderRadius: 10, color: S.text, fontSize: 14, outline: 'none', fontFamily: S.font, boxSizing: 'border-box',
};

const errorStyle: React.CSSProperties = { fontSize: 11, color: '#F87171', marginTop: 4, fontFamily: S.font };

const Field: React.FC<{ label: string; hint?: string; error?: string; children: React.ReactNode }> = ({ label, hint, error, children }) => (
  <label style={{ display: 'block' }}>
    <Label hint={hint}>{label}</Label>
    {children}
    {error && <div style={errorStyle}>{error}</div>}
  </label>
);

const ChipGroup: React.FC<{ options: readonly string[]; value: string; onChange: (v: string) => void; accent: string }> = ({ options, value, onChange, accent }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {options.map((opt) => {
      const selected = value === opt;
      return (
        <button key={opt} type="button" onClick={() => onChange(opt)} style={{
          padding: '9px 16px', borderRadius: 100,
          border: `1px solid ${selected ? accent : S.border2}`,
          background: selected ? h2r(accent, 0.18) : 'transparent',
          color: selected ? accent : S.muted,
          fontSize: 13, fontWeight: selected ? 700 : 500, cursor: 'pointer',
          fontFamily: S.font, transition: 'all 0.12s ease', textTransform: 'capitalize',
        }}>{opt.replace(/_/g, ' ')}</button>
      );
    })}
  </div>
);

const CardChoice: React.FC<{
  options: readonly { value: string; label: string; desc: string }[]; value: string; onChange: (v: string) => void; accent: string;
}> = ({ options, value, onChange, accent }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 10 }}>
    {options.map((o) => {
      const selected = value === o.value;
      return (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{
          textAlign: 'left', padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
          background: selected ? h2r(accent, 0.16) : S.surface2,
          border: `1px solid ${selected ? accent : S.border2}`, transition: 'all 0.15s ease',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: selected ? accent : S.text, fontFamily: S.font, marginBottom: 4 }}>{o.label}</div>
          {o.desc && <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{o.desc}</div>}
        </button>
      );
    })}
  </div>
);

const ScoreBar: React.FC<{ value: number; min: number; max: number; accent: string }> = ({ value, min, max, accent }) => {
  if (!value) return null;
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1) * 100;
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginTop: 8 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 4, transition: 'width 0.3s ease', boxShadow: `0 0 6px ${h2r(accent, 0.32)}` }} />
    </div>
  );
};

// GPA-scale conversion helper — genuinely tricky for international grad
// applicants (Indian 10-point, European 100-point/ECTS, US 4.0 all coexist).
function gpaConversionNote(value: string, scale: string): string {
  const v = parseFloat(value);
  if (!value || isNaN(v)) return '';
  if (scale === '10') return `≈ ${(v / 10 * 4).toFixed(2)} on a US 4.0 scale (approximate, indicative only)`;
  if (scale === '100') return `≈ ${(v / 100 * 4).toFixed(2)} on a US 4.0 scale (approximate, indicative only)`;
  if (scale === '4' && v > 0) {
    if (v >= 3.7) return 'Exceptional academic profile';
    if (v >= 3.3) return 'Strong academic profile';
    if (v >= 3.0) return 'Solid foundation';
    return "We'll surface programs that fit your profile";
  }
  return '';
}

// Sentiment nudge on free text — same spirit as undergrad's getSentiment,
// tuned for grad program-fit language rather than "why college" motivation.
function fitSentiment(text: string): string {
  const t = text.toLowerCase();
  if (!t.trim()) return '';
  if (t.includes('advisor') || t.includes('professor') || t.includes('lab') || t.includes('pi ')) return 'Signals: Research fit 🔬';
  if (t.includes('career') || t.includes('industry') || t.includes('job') || t.includes('company')) return 'Signals: Career trajectory 🎯';
  if (t.includes('curriculum') || t.includes('course') || t.includes('faculty')) return 'Signals: Program structure 📚';
  if (t.includes('location') || t.includes('city') || t.includes('network') || t.includes('alumni')) return 'Signals: Network / location 🤝';
  return t.length >= 80 ? 'Good detail — specific fit reads stronger than general enthusiasm ✨' : '';
}

// realStep indexes STEPS[] for the label (must be the true step, not the
// filtered position — a coursework-track user skips step 4, so if this used
// the compressed visible-position to index STEPS[], the label would show the
// wrong step name after a skip). visiblePosition/visibleTotal drive the bar
// segment count and "Step X of Y" — these DO need to reflect the filtered
// (visible) step list, since a coursework-track user only ever sees 9 steps,
// not 10, and the bar should fill/segment accordingly.
const StepProgress: React.FC<{ realStep: number; visiblePosition: number; visibleTotal: number; accent: string }> = ({ realStep, visiblePosition, visibleTotal, accent }) => (
  <div style={{ marginBottom: 32 }}>
    <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
      {Array.from({ length: visibleTotal }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 4, borderRadius: 4,
          background: i < visiblePosition ? accent : i === visiblePosition ? h2r(accent, 0.4) : S.border2,
          transition: 'background 0.4s ease',
        }} />
      ))}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontFamily: S.font, transition: 'color 0.4s ease' }}>{STEPS[realStep]}</span>
      <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>Step {visiblePosition + 1} of {visibleTotal}</span>
    </div>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${S.border}`, fontSize: 13, fontFamily: S.font, gap: 16 }}>
    <span style={{ color: S.muted, flexShrink: 0 }}>{label}</span>
    <span style={{ color: S.text, fontWeight: 600, textAlign: 'right' }}>{value || 'N/A'}</span>
  </div>
);

const ProfileRing: React.FC<{ score: number; accent: string }> = ({ score, accent }) => {
  const r = 52, c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, score)) / 100) * c;
  return (
    <svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={accent} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 64 64)"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="64" y="70" textAnchor="middle" fontSize="28" fontWeight="800" fill="#fff" fontFamily={S.font}>{score}%</text>
    </svg>
  );
};

/* ─── Multi-entry builder (research + work) ───────────────────────────── */
function ResearchEntryBuilder({ entries, onChange, accent }: { entries: ResearchEntry[]; onChange: (e: ResearchEntry[]) => void; accent: string }) {
  const update = (i: number, patch: Partial<ResearchEntry>) => {
    const next = entries.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...entries, { title: '', role: '', output_type: '', year: '' }]);
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {entries.map((e, i) => (
        <div key={i} style={{ background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 12, padding: 14, position: 'relative' }}>
          <button type="button" onClick={() => remove(i)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: S.dim, cursor: 'pointer' }}><X size={14} /></button>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={inputStyle} placeholder="Project / paper title" value={e.title} onChange={(ev) => update(i, { title: ev.target.value })} />
            <input style={inputStyle} placeholder="Year" value={e.year} onChange={(ev) => update(i, { year: ev.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input style={inputStyle} placeholder="Your role (e.g. RA, co-author)" value={e.role} onChange={(ev) => update(i, { role: ev.target.value })} />
            <input style={inputStyle} placeholder="Output (e.g. preprint, poster, thesis)" value={e.output_type} onChange={(ev) => update(i, { output_type: ev.target.value })} />
          </div>
        </div>
      ))}
      <button type="button" onClick={add} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10,
        border: `1px dashed ${S.border2}`, background: 'transparent', color: accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: S.font,
      }}><Plus size={14} /> Add research / publication</button>
    </div>
  );
}

function WorkEntryBuilder({ entries, onChange, accent }: { entries: WorkEntry[]; onChange: (e: WorkEntry[]) => void; accent: string }) {
  const update = (i: number, patch: Partial<WorkEntry>) => {
    const next = entries.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const add = () => onChange([...entries, { title: '', company: '', years: '', description: '' }]);
  const remove = (i: number) => onChange(entries.filter((_, idx) => idx !== i));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {entries.map((e, i) => (
        <div key={i} style={{ background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 12, padding: 14, position: 'relative' }}>
          <button type="button" onClick={() => remove(i)} style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', color: S.dim, cursor: 'pointer' }}><X size={14} /></button>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={inputStyle} placeholder="Role / title" value={e.title} onChange={(ev) => update(i, { title: ev.target.value })} />
            <input style={inputStyle} placeholder="Company" value={e.company} onChange={(ev) => update(i, { company: ev.target.value })} />
            <input style={inputStyle} placeholder="Years" value={e.years} onChange={(ev) => update(i, { years: ev.target.value })} />
          </div>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="What did you actually do?" value={e.description} onChange={(ev) => update(i, { description: ev.target.value })} />
        </div>
      ))}
      <button type="button" onClick={add} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 10,
        border: `1px dashed ${S.border2}`, background: 'transparent', color: accent, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: S.font,
      }}><Plus size={14} /> Add work experience</button>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────────────── */
const MastersOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}_step`);
      const parsed = raw ? Number(raw) : 0;
      return Number.isInteger(parsed) && parsed >= 0 && parsed < STEPS.length ? parsed : 0;
    } catch { return 0; }
  });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? { ...DEFAULT_FORM, ...JSON.parse(raw) } : DEFAULT_FORM;
    } catch { return DEFAULT_FORM; }
  });
  const [countries, setCountries] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}_countries`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [researchEntries, setResearchEntries] = useState<ResearchEntry[]>(() => {
    try {
      const raw = localStorage.getItem(`${ENTRIES_KEY}_research`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>(() => {
    try {
      const raw = localStorage.getItem(`${ENTRIES_KEY}_work`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const [programSuggestions, setProgramSuggestions] = useState<string[]>([]);

  useEffect(() => { if (!isMastersTrackEnabled()) navigate('/dashboard', { replace: true }); }, [navigate]);
  useEffect(() => { localStorage.setItem(DRAFT_KEY, JSON.stringify(form)); }, [form]);
  useEffect(() => { localStorage.setItem(`${DRAFT_KEY}_countries`, JSON.stringify(countries)); }, [countries]);
  useEffect(() => { localStorage.setItem(`${DRAFT_KEY}_step`, String(step)); }, [step]);
  useEffect(() => { localStorage.setItem(`${ENTRIES_KEY}_research`, JSON.stringify(researchEntries)); }, [researchEntries]);
  useEffect(() => { localStorage.setItem(`${ENTRIES_KEY}_work`, JSON.stringify(workEntries)); }, [workEntries]);

  // Live program-name suggestions from the real masters_programs data (510
  // real programs) — undergrad only autocompletes from a static school list;
  // this is backed by live data, which undergrad has no equivalent of.
  useEffect(() => {
    const q = form.intended_program.trim();
    if (q.length < 2) { setProgramSuggestions([]); return; }
    const timer = setTimeout(() => {
      api.masters.listPrograms({ q, limit: 8 }).then((res: any) => {
        const rows = (res?.data ?? res ?? []) as Array<{ program_name?: string }>;
        setProgramSuggestions([...new Set(rows.map((r) => r.program_name).filter(Boolean))] as string[]);
      }).catch(() => setProgramSuggestions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [form.intended_program]);

  const set = (k: keyof FormState, v: string | boolean) => setForm((f) => ({ ...f, [k]: v as never }));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    const greV = num(form.gre_verbal), greQ = num(form.gre_quant);
    if (greV !== undefined && (greV < 130 || greV > 170)) e.gre_verbal = 'GRE Verbal is scored 130–170';
    if (greQ !== undefined && (greQ < 130 || greQ > 170)) e.gre_quant = 'GRE Quant is scored 130–170';
    const gmat = num(form.gmat_total);
    if (gmat !== undefined && (gmat < 200 || gmat > 800)) e.gmat_total = 'Classic GMAT is scored 200–800';
    const toefl = num(form.toefl_score);
    if (toefl !== undefined && (toefl < 0 || toefl > 120)) e.toefl_score = 'TOEFL iBT is scored 0–120';
    const ielts = num(form.ielts_score);
    if (ielts !== undefined && (ielts < 0 || ielts > 9)) e.ielts_score = 'IELTS is scored 0–9';
    const gpa = num(form.undergrad_gpa);
    const maxGpa = Number(form.undergrad_gpa_scale) || 4;
    if (gpa !== undefined && (gpa < 0 || gpa > maxGpa)) e.undergrad_gpa = `GPA must be between 0 and ${maxGpa}`;
    return e;
  }, [form]);

  const canAdvance = useMemo(() => {
    if (step === 0) return form.intended_program.trim().length > 0;
    if (step === 1) return form.undergrad_institution.trim().length > 0 && form.undergrad_major.trim().length > 0 && !errors.undergrad_gpa;
    if (step === 2) return !errors.gre_verbal && !errors.gre_quant && !errors.gmat_total && !errors.toefl_score && !errors.ielts_score;
    return true;
  }, [step, form, errors]);

  const isResearchTrack = form.track_type !== 'coursework';

  // Visible step indices — skip "Advisor & Research Fit" entirely for a
  // declared coursework track (it genuinely doesn't apply there), the same
  // way undergrad conditionally shows fields based on earlier answers.
  const visibleSteps = useMemo(
    () => STEPS.map((_, i) => i).filter((i) => isResearchTrack || i !== 4),
    [isResearchTrack]
  );
  const visibleIndex = visibleSteps.indexOf(step);

  const next = () => {
    const pos = visibleSteps.indexOf(step);
    const nextStep = visibleSteps[Math.min(pos + 1, visibleSteps.length - 1)];
    setStep(nextStep);
  };
  const back = () => {
    const pos = visibleSteps.indexOf(step);
    const prevStep = visibleSteps[Math.max(pos - 1, 0)];
    setStep(prevStep);
  };

  // Completeness score for the Reveal step — mirrors undergrad's profile-ring
  // payoff. Weighted across required + high-value optional fields.
  const completeness = useMemo(() => {
    const checks: Array<[boolean, number]> = [
      [!!form.intended_program, 8], [!!form.track_type, 4],
      [!!form.undergrad_institution, 8], [!!form.undergrad_major, 8], [!!form.undergrad_gpa, 6],
      [!!(form.gre_quant || form.gmat_total || form.toefl_score || form.ielts_score), 6],
      [researchEntries.length > 0 || !!form.work_experience_desc, 8],
      [workEntries.length > 0, 6],
      [!!form.research_interests, isResearchTrack ? 8 : 2],
      [!!form.advisor_targets, isResearchTrack ? 8 : 2],
      [Number(form.lors_academic_count || 0) + Number(form.lors_professional_count || 0) > 0, 6],
      [!!form.career_goals, 10],
      [!!form.why_this_program, 10],
      [!!form.funding_need, 6],
      [!!form.program_format, 4],
      [countries.length > 0, 8],
    ];
    const total = checks.reduce((a, [, w]) => a + w, 0);
    const got = checks.reduce((a, [ok, w]) => a + (ok ? w : 0), 0);
    return Math.round((got / total) * 100);
  }, [form, researchEntries, workEntries, countries, isResearchTrack]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.masters.setTrack({ programTrack: 'masters' });
      await api.masters.saveProfile({
        target_degree_type: form.target_degree_type,
        intended_program: form.intended_program,
        intended_specialization: form.intended_specialization,
        track_type: form.track_type || undefined,
        target_intake_term: form.target_intake_term,
        target_intake_year: num(form.target_intake_year),
        undergrad_institution: form.undergrad_institution,
        undergrad_major: form.undergrad_major,
        undergrad_country: form.undergrad_country,
        undergrad_gpa: num(form.undergrad_gpa),
        undergrad_gpa_scale: num(form.undergrad_gpa_scale),
        gre_verbal: num(form.gre_verbal), gre_quant: num(form.gre_quant), gre_awa: num(form.gre_awa),
        gmat_total: num(form.gmat_total), gmat_focus_total: num(form.gmat_focus_total),
        toefl_score: num(form.toefl_score), ielts_score: num(form.ielts_score),
        duolingo_score: num(form.duolingo_score), pte_score: num(form.pte_score),
        research_interests: form.research_interests || undefined,
        advisor_targets: form.advisor_targets || undefined,
        research_entries: researchEntries,
        work_entries: workEntries,
        work_experience_years: workEntries.length ? undefined : undefined,
        lors_secured: num(form.lors_secured), lors_required: num(form.lors_required),
        lors_academic_count: num(form.lors_academic_count), lors_professional_count: num(form.lors_professional_count),
        sop_status: form.sop_status,
        career_goals: form.career_goals || undefined,
        why_this_program: form.why_this_program || undefined,
        funding_need: form.funding_need || undefined,
        assistantship_interest: form.assistantship_interest,
        program_format: form.program_format || undefined,
        study_pace: form.study_pace || undefined,
        visa_work_auth_interest: form.visa_work_auth_interest,
        target_countries: countries,
      });
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(`${DRAFT_KEY}_countries`);
      localStorage.removeItem(`${DRAFT_KEY}_step`);
      localStorage.removeItem(`${ENTRIES_KEY}_research`);
      localStorage.removeItem(`${ENTRIES_KEY}_work`);
      toast.success('Masters profile saved');
      navigate('/masters');
    } catch {
      toast.error('Could not save your masters profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const theme = STEP_THEMES[Math.min(step, STEP_THEMES.length - 1)];
  const accent = theme.accent;

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="Degree type"><ChipGroup options={DEGREES} value={form.target_degree_type} onChange={(v) => set('target_degree_type', v)} accent={accent} /></Field>
          <div style={{ position: 'relative' }}>
            <Field label="Intended program *" hint="e.g. Computer Science">
              <input style={inputStyle} value={form.intended_program} onChange={(e) => set('intended_program', e.target.value)}
                placeholder="e.g. Computer Science" list="program-suggestions" autoComplete="off" />
              <datalist id="program-suggestions">
                {programSuggestions.map((p) => <option key={p} value={p} />)}
              </datalist>
            </Field>
            {programSuggestions.length > 0 && (
              <div style={{ fontSize: 11, color: S.dim, marginTop: 4, fontFamily: S.font }}>
                Matched against {programSuggestions.length} real programs in our database
              </div>
            )}
          </div>
          <Field label="Specialization" hint="optional"><input style={inputStyle} value={form.intended_specialization} onChange={(e) => set('intended_specialization', e.target.value)} placeholder="e.g. Machine Learning" /></Field>
          <Field label="Track type" hint="Determines whether we ask about advisors & research fit later">
            <CardChoice options={TRACK_TYPES} value={form.track_type} onChange={(v) => set('track_type', v)} accent={accent} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Field label="Target intake term"><ChipGroup options={TERMS} value={form.target_intake_term} onChange={(v) => set('target_intake_term', v)} accent={accent} /></Field>
            <Field label="Target intake year"><input style={inputStyle} inputMode="numeric" value={form.target_intake_year} onChange={(e) => set('target_intake_year', e.target.value)} placeholder="2027" /></Field>
          </div>
        </div>
      );

      case 1: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="Undergrad institution *"><input style={inputStyle} value={form.undergrad_institution} onChange={(e) => set('undergrad_institution', e.target.value)} /></Field>
          <Field label="Undergrad major *"><input style={inputStyle} value={form.undergrad_major} onChange={(e) => set('undergrad_major', e.target.value)} /></Field>
          <Field label="Undergrad country"><input style={inputStyle} value={form.undergrad_country} onChange={(e) => set('undergrad_country', e.target.value)} placeholder="e.g. India" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Field label="Undergrad GPA" error={errors.undergrad_gpa}>
              <input style={inputStyle} inputMode="decimal" value={form.undergrad_gpa} onChange={(e) => set('undergrad_gpa', e.target.value)} />
            </Field>
            <Field label="GPA scale"><ChipGroup options={['4', '10', '100']} value={form.undergrad_gpa_scale} onChange={(v) => set('undergrad_gpa_scale', v)} accent={accent} /></Field>
          </div>
          {gpaConversionNote(form.undergrad_gpa, form.undergrad_gpa_scale) && (
            <div style={{ fontSize: 12, color: accent, fontWeight: 600, fontFamily: S.font }}>
              {gpaConversionNote(form.undergrad_gpa, form.undergrad_gpa_scale)}
            </div>
          )}
        </div>
      );

      case 2: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, margin: 0 }}>
            All optional. Many masters programs waive standardized tests — fill in whichever you have.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="GRE Verbal" error={errors.gre_verbal}>
              <input style={inputStyle} inputMode="numeric" value={form.gre_verbal} onChange={(e) => set('gre_verbal', e.target.value)} placeholder="130–170" />
              <ScoreBar value={Number(form.gre_verbal) || 0} min={130} max={170} accent={accent} />
            </Field>
            <Field label="GRE Quant" error={errors.gre_quant}>
              <input style={inputStyle} inputMode="numeric" value={form.gre_quant} onChange={(e) => set('gre_quant', e.target.value)} placeholder="130–170" />
              <ScoreBar value={Number(form.gre_quant) || 0} min={130} max={170} accent={accent} />
            </Field>
            <Field label="GRE AWA"><input style={inputStyle} inputMode="decimal" value={form.gre_awa} onChange={(e) => set('gre_awa', e.target.value)} placeholder="0–6" /></Field>
            <Field label="GMAT (classic /800)" error={errors.gmat_total}>
              <input style={inputStyle} inputMode="numeric" value={form.gmat_total} onChange={(e) => set('gmat_total', e.target.value)} />
              <ScoreBar value={Number(form.gmat_total) || 0} min={200} max={800} accent={accent} />
            </Field>
            <Field label="GMAT Focus (/805)"><input style={inputStyle} inputMode="numeric" value={form.gmat_focus_total} onChange={(e) => set('gmat_focus_total', e.target.value)} /></Field>
            <Field label="TOEFL" error={errors.toefl_score}>
              <input style={inputStyle} inputMode="numeric" value={form.toefl_score} onChange={(e) => set('toefl_score', e.target.value)} />
              <ScoreBar value={Number(form.toefl_score) || 0} min={0} max={120} accent={accent} />
            </Field>
            <Field label="IELTS" error={errors.ielts_score}>
              <input style={inputStyle} inputMode="decimal" value={form.ielts_score} onChange={(e) => set('ielts_score', e.target.value)} />
              <ScoreBar value={Number(form.ielts_score) || 0} min={0} max={9} accent={accent} />
            </Field>
            <Field label="Duolingo English Test"><input style={inputStyle} inputMode="numeric" value={form.duolingo_score} onChange={(e) => set('duolingo_score', e.target.value)} /></Field>
            <Field label="PTE Academic"><input style={inputStyle} inputMode="numeric" value={form.pte_score} onChange={(e) => set('pte_score', e.target.value)} /></Field>
          </div>
        </div>
      );

      case 3: return (
        <div style={{ display: 'grid', gap: 24 }}>
          <div>
            <Label hint="One entry per project, paper, or research assistantship">Research & publications</Label>
            <ResearchEntryBuilder entries={researchEntries} onChange={setResearchEntries} accent={accent} />
          </div>
          <div>
            <Label hint="One entry per role — internships count">Work experience</Label>
            <WorkEntryBuilder entries={workEntries} onChange={setWorkEntries} accent={accent} />
          </div>
        </div>
      );

      case 4: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, margin: 0 }}>
            For research-track programs, this is often the single most-weighted part of your SOP —
            admissions committees want to see you've identified a real fit, not just applied broadly.
          </p>
          <Field label="Research interests" hint="What do you want to work on — not what you've already done">
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={form.research_interests}
              onChange={(e) => set('research_interests', e.target.value)}
              placeholder="e.g. Efficient training methods for large multimodal models, applied to climate science" />
          </Field>
          <Field label="Target advisors / labs" hint="Named professors or research groups you'd want to work with">
            <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.advisor_targets}
              onChange={(e) => set('advisor_targets', e.target.value)}
              placeholder="e.g. Prof. X's lab at Y — read 3 of their papers on Z" />
          </Field>
        </div>
      );

      case 5: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, margin: 0 }}>
            We track readiness, not content — no essay or recommender drafting here.
            Most programs want a specific mix of academic vs. professional referees.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Field label="Academic referees secured" hint="Professors, research advisors">
              <input style={inputStyle} inputMode="numeric" value={form.lors_academic_count} onChange={(e) => set('lors_academic_count', e.target.value)} />
            </Field>
            <Field label="Professional referees secured" hint="Managers, supervisors">
              <input style={inputStyle} inputMode="numeric" value={form.lors_professional_count} onChange={(e) => set('lors_professional_count', e.target.value)} />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Field label="Total letters secured"><input style={inputStyle} inputMode="numeric" value={form.lors_secured} onChange={(e) => set('lors_secured', e.target.value)} /></Field>
            <Field label="Total required by programs"><input style={inputStyle} inputMode="numeric" value={form.lors_required} onChange={(e) => set('lors_required', e.target.value)} /></Field>
          </div>
          <Field label="Statement of purpose status"><ChipGroup options={SOP_STATUSES} value={form.sop_status} onChange={(v) => set('sop_status', v)} accent={accent} /></Field>
        </div>
      );

      case 6: return (
        <div style={{ display: 'grid', gap: 24 }}>
          <div>
            <Label hint="What do you want to do after this degree? Specific reads stronger than general.">Career goals</Label>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontSize: 15, lineHeight: 1.6 }} value={form.career_goals}
              onChange={(e) => set('career_goals', e.target.value)}
              placeholder="e.g. Lead an applied ML team at a climate-tech company within 5 years of graduating" />
            <div style={{ fontSize: 11, color: form.career_goals.length >= 80 ? '#10B981' : S.dim, marginTop: 6, fontFamily: S.font }}>
              {form.career_goals.length >= 80 ? '✅ Good detail' : `${form.career_goals.length}/80 chars for strong signal`}
            </div>
          </div>
          <div>
            <Label hint="Why this specific program, not just 'a masters'">Why this program</Label>
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical', fontSize: 15, lineHeight: 1.6 }} value={form.why_this_program}
              onChange={(e) => set('why_this_program', e.target.value)}
              placeholder="Curriculum? Faculty? Location? Alumni network? Be specific — 'strong reputation' isn't a reason." />
            {fitSentiment(form.why_this_program) && (
              <div style={{ fontSize: 13, color: accent, marginTop: 8, fontWeight: 600, fontFamily: S.font }}>✨ {fitSentiment(form.why_this_program)}</div>
            )}
          </div>
        </div>
      );

      case 7: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="Funding need" hint="Shapes which programs we surface — funded vs. self-pay tracks differ a lot">
            <CardChoice options={FUNDING_NEEDS} value={form.funding_need} onChange={(v) => set('funding_need', v)} accent={accent} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: S.surface2, borderRadius: 10, border: `1px solid ${S.border2}` }}>
            <input type="checkbox" checked={form.assistantship_interest} onChange={(e) => set('assistantship_interest', e.target.checked)} />
            <span style={{ fontSize: 13, color: S.text, fontFamily: S.font }}>Interested in TA/RA assistantship positions</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <Field label="Program format"><ChipGroup options={PROGRAM_FORMATS} value={form.program_format} onChange={(v) => set('program_format', v)} accent={accent} /></Field>
            <Field label="Study pace"><ChipGroup options={STUDY_PACES} value={form.study_pace} onChange={(v) => set('study_pace', v)} accent={accent} /></Field>
          </div>
        </div>
      );

      case 8: return (
        <div style={{ display: 'grid', gap: 18 }}>
          <Field label="Target countries">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {COUNTRIES_DATA.map((c) => {
                const on = countries.includes(c.code);
                return (
                  <button key={c.code} type="button" onClick={() => setCountries((prev) => (on ? prev.filter((x) => x !== c.code) : [...prev, c.code]))}
                    style={{
                      textAlign: 'left', padding: '14px 14px', borderRadius: 14, cursor: 'pointer',
                      background: on ? h2r(accent, 0.16) : S.surface2,
                      border: `1px solid ${on ? accent : S.border2}`, transition: 'all 0.15s ease', position: 'relative',
                    }}>
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{c.flag}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: S.text, fontFamily: S.font }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginTop: 2 }}>{c.desc}</div>
                    <div style={{ fontSize: 10, color: on ? accent : S.dim, fontFamily: S.font, marginTop: 6, lineHeight: 1.4 }}>{c.visa}</div>
                    {on && <div style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>✓</div>}
                  </button>
                );
              })}
            </div>
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 14px', background: S.surface2, borderRadius: 10, border: `1px solid ${S.border2}` }}>
            <input type="checkbox" checked={form.visa_work_auth_interest} onChange={(e) => set('visa_work_auth_interest', e.target.checked)} />
            <span style={{ fontSize: 13, color: S.text, fontFamily: S.font }}>Post-study work authorization is a significant factor in my country choice</span>
          </label>
        </div>
      );

      case 9:
      default: return (
        <div style={{ display: 'grid', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <ProfileRing score={completeness} accent={accent} />
            <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font, textAlign: 'center' }}>
              Profile completeness — the fuller this is, the sharper your program matches and chancing will be
            </div>
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            <SummaryRow label="Degree" value={`${form.target_degree_type}${form.track_type ? ` · ${form.track_type}` : ''}`} />
            <SummaryRow label="Program" value={form.intended_program} />
            <SummaryRow label="Specialization" value={form.intended_specialization} />
            <SummaryRow label="Target intake" value={`${form.target_intake_term} ${form.target_intake_year}`} />
            <SummaryRow label="Undergrad" value={`${form.undergrad_institution}: ${form.undergrad_major}`} />
            <SummaryRow label="GPA" value={form.undergrad_gpa ? `${form.undergrad_gpa}/${form.undergrad_gpa_scale}` : ''} />
            <SummaryRow label="Tests" value={[form.gre_quant && 'GRE', form.gmat_total && 'GMAT', form.toefl_score && 'TOEFL', form.ielts_score && 'IELTS'].filter(Boolean).join(', ')} />
            <SummaryRow label="Research entries" value={researchEntries.length || undefined} />
            <SummaryRow label="Work entries" value={workEntries.length || undefined} />
            <SummaryRow label="Recommendations" value={`${Number(form.lors_academic_count || 0) + Number(form.lors_professional_count || 0)} secured`} />
            <SummaryRow label="Funding need" value={form.funding_need?.replace(/_/g, ' ')} />
            <SummaryRow label="Target countries" value={countries.map((c) => COUNTRIES_DATA.find((x) => x.code === c)?.name || c).join(', ')} />
          </div>
        </div>
      );
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, padding: '40px 24px', fontFamily: S.font, transition: 'background 0.5s ease' }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <GraduationCap size={22} style={{ color: accent, transition: 'color 0.5s ease' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, color: S.text, fontFamily: S.font, margin: 0 }}>Graduate Application Profile</h1>
        </div>

        <StepProgress realStep={step} visiblePosition={visibleIndex} visibleTotal={visibleSteps.length} accent={accent} />

        <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: 28, animation: 'fadeUp 0.25s ease both' }} key={step}>
          {renderStep()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button type="button" onClick={back} disabled={visibleIndex === 0} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '11px 20px', borderRadius: 10,
            background: 'transparent', border: `1px solid ${S.border2}`, color: S.muted,
            fontSize: 13, fontWeight: 600, cursor: visibleIndex === 0 ? 'default' : 'pointer',
            opacity: visibleIndex === 0 ? 0.4 : 1, fontFamily: S.font,
          }}><ChevronLeft size={16} /> Back</button>

          {visibleIndex < visibleSteps.length - 1 ? (
            <button type="button" onClick={next} disabled={!canAdvance} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 10,
              background: accent, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: canAdvance ? 'pointer' : 'default', opacity: canAdvance ? 1 : 0.5, fontFamily: S.font,
            }}>Continue <ChevronRight size={16} /></button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={saving} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 10,
              background: accent, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: S.font,
            }}><Check size={16} /> {saving ? 'Saving…' : 'Finish & view dashboard'}</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MastersOnboarding;
