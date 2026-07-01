// src/pages/MastersOnboarding.tsx — 7-step wizard, dark editorial parity with undergrad onboarding.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GraduationCap, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';

/* ─── Design tokens (matches MastersPrograms/Deadlines/Funding) ──────────── */
const ACCENT = '#3B9EFF';
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  bg: 'var(--color-bg-primary)',
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
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
`;

const DEGREES = ['MS', 'MA', 'MBA'] as const;
const TERMS = ['fall', 'spring', 'summer', 'winter'] as const;
const COUNTRIES = ['US', 'UK', 'CA', 'DE', 'NL', 'AU', 'SG'];
const SOP_STATUSES = ['not_started', 'drafting', 'reviewing', 'final'] as const;

const STEPS = [
  'Program Intent',
  'Academic Background',
  'Standardized Tests',
  'Experience & Research',
  'Recommendations',
  'Target Countries',
  'Review',
];

// Per-step background/accent, mirroring the undergrad STEP_THEMES pattern
// (src/pages/Onboarding.tsx) so masters onboarding shifts color across the
// flow instead of staying on one static accent for all 7 steps.
const STEP_THEMES = [
  { bg: '#0C0C1B', accent: '#3B9EFF' },  // Program Intent
  { bg: '#0B1220', accent: '#38BDF8' },  // Academic Background
  { bg: '#0E1512', accent: '#34D399' },  // Standardized Tests
  { bg: '#160F1D', accent: '#A78BFA' },  // Experience & Research
  { bg: '#1A130C', accent: '#F59E0B' },  // Recommendations
  { bg: '#12131A', accent: '#60A5FA' },  // Target Countries
  { bg: '#07070B', accent: '#E3C66A' },  // Review
];

const num = (v: string): number | undefined => (v === '' || v === undefined ? undefined : Number(v));

interface FormState {
  target_degree_type: string;
  intended_program: string;
  intended_specialization: string;
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
  work_experience_years: string; work_experience_desc: string;
  research_experience: string; publication_count: string;
  lors_secured: string; lors_required: string; sop_status: string;
}

const DEFAULT_FORM: FormState = {
  target_degree_type: 'MS', intended_program: '', intended_specialization: '',
  target_intake_term: 'fall', target_intake_year: '',
  undergrad_institution: '', undergrad_major: '', undergrad_country: '',
  undergrad_gpa: '', undergrad_gpa_scale: '4',
  gre_verbal: '', gre_quant: '', gre_awa: '', gmat_total: '', gmat_focus_total: '',
  toefl_score: '', ielts_score: '', duolingo_score: '', pte_score: '',
  work_experience_years: '', work_experience_desc: '', research_experience: '', publication_count: '',
  lors_secured: '', lors_required: '3', sop_status: 'not_started',
};

const DRAFT_KEY = 'masters_onboarding_draft';

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: S.muted, marginBottom: 6, fontFamily: S.font, letterSpacing: '0.02em' }}>{children}</span>
);

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 14px', background: S.surface2, border: `1px solid ${S.border2}`,
  borderRadius: 10, color: S.text, fontSize: 14, outline: 'none', fontFamily: S.font, boxSizing: 'border-box',
};

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label style={{ display: 'block' }}>
    <Label>{label}</Label>
    {children}
    {hint && <span style={{ display: 'block', fontSize: 11, color: S.dim, marginTop: 4, fontFamily: S.font }}>{hint}</span>}
  </label>
);

const ChipGroup: React.FC<{ options: readonly string[]; value: string; onChange: (v: string) => void; multi?: boolean }> = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
    {options.map((opt) => {
      const selected = value === opt;
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '9px 16px', borderRadius: 100,
            border: `1px solid ${selected ? ACCENT : S.border2}`,
            background: selected ? h2r(ACCENT, 0.18) : 'transparent',
            color: selected ? ACCENT : S.muted,
            fontSize: 13, fontWeight: selected ? 700 : 500, cursor: 'pointer',
            fontFamily: S.font, transition: 'all 0.12s ease', textTransform: 'capitalize',
          }}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const StepProgress: React.FC<{ step: number; accent?: string }> = ({ step, accent = ACCENT }) => (
  <div style={{ marginBottom: 32 }}>
    <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
      {STEPS.map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 4, borderRadius: 4,
          background: i < step ? accent : i === step ? h2r(accent, 0.4) : S.border2,
          transition: 'background 0.4s ease',
        }} />
      ))}
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontFamily: S.font, transition: 'color 0.4s ease' }}>{STEPS[step]}</span>
      <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>Step {step + 1} of {STEPS.length}</span>
    </div>
  </div>
);

const SummaryRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${S.border}`, fontSize: 13, fontFamily: S.font }}>
    <span style={{ color: S.muted }}>{label}</span>
    <span style={{ color: S.text, fontWeight: 600, textAlign: 'right' }}>{value || '—'}</span>
  </div>
);

const MastersOnboarding: React.FC = () => {
  const navigate = useNavigate();
  // Restore the step position on remount (e.g. after a page refresh) - found via
  // browser QA that form values were correctly persisted but the user was still
  // dropped back to step 1 every time, forcing them to re-click through steps
  // they'd already completed.
  const [step, setStep] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}_step`);
      const parsed = raw ? Number(raw) : 0;
      return Number.isInteger(parsed) && parsed >= 0 && parsed < STEPS.length ? parsed : 0;
    } catch {
      return 0;
    }
  });
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? { ...DEFAULT_FORM, ...JSON.parse(raw) } : DEFAULT_FORM;
    } catch {
      return DEFAULT_FORM;
    }
  });
  const [countries, setCountries] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`${DRAFT_KEY}_countries`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (!isMastersTrackEnabled()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    localStorage.setItem(`${DRAFT_KEY}_countries`, JSON.stringify(countries));
  }, [countries]);

  useEffect(() => {
    localStorage.setItem(`${DRAFT_KEY}_step`, String(step));
  }, [step]);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canAdvance = useMemo(() => {
    if (step === 0) return form.intended_program.trim().length > 0;
    if (step === 1) return form.undergrad_institution.trim().length > 0 && form.undergrad_major.trim().length > 0;
    return true;
  }, [step, form]);

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.masters.setTrack({ programTrack: 'masters' });
      await api.masters.saveProfile({
        target_degree_type: form.target_degree_type,
        intended_program: form.intended_program,
        intended_specialization: form.intended_specialization,
        target_intake_term: form.target_intake_term,
        target_intake_year: num(form.target_intake_year),
        undergrad_institution: form.undergrad_institution,
        undergrad_major: form.undergrad_major,
        undergrad_country: form.undergrad_country,
        undergrad_gpa: num(form.undergrad_gpa),
        undergrad_gpa_scale: num(form.undergrad_gpa_scale),
        gre_verbal: num(form.gre_verbal),
        gre_quant: num(form.gre_quant),
        gre_awa: num(form.gre_awa),
        gmat_total: num(form.gmat_total),
        gmat_focus_total: num(form.gmat_focus_total),
        toefl_score: num(form.toefl_score),
        ielts_score: num(form.ielts_score),
        duolingo_score: num(form.duolingo_score),
        pte_score: num(form.pte_score),
        work_experience_years: num(form.work_experience_years),
        work_experience_desc: form.work_experience_desc,
        research_experience: form.research_experience,
        publication_count: num(form.publication_count),
        lors_secured: num(form.lors_secured),
        lors_required: num(form.lors_required),
        sop_status: form.sop_status,
        target_countries: countries,
      });
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(`${DRAFT_KEY}_countries`);
      localStorage.removeItem(`${DRAFT_KEY}_step`);
      toast.success('Masters profile saved');
      navigate('/masters');
    } catch {
      toast.error('Could not save your masters profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <div style={{ display: 'grid', gap: 18 }}>
            <Field label="Degree type">
              <ChipGroup options={DEGREES} value={form.target_degree_type} onChange={(v) => set('target_degree_type', v)} />
            </Field>
            <Field label="Intended program (e.g. Computer Science) *">
              <input style={inputStyle} value={form.intended_program} onChange={(e) => set('intended_program', e.target.value)} placeholder="e.g. Computer Science" />
            </Field>
            <Field label="Specialization (optional)">
              <input style={inputStyle} value={form.intended_specialization} onChange={(e) => set('intended_specialization', e.target.value)} placeholder="e.g. Machine Learning" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Field label="Target intake term">
                <ChipGroup options={TERMS} value={form.target_intake_term} onChange={(v) => set('target_intake_term', v)} />
              </Field>
              <Field label="Target intake year">
                <input style={inputStyle} inputMode="numeric" value={form.target_intake_year} onChange={(e) => set('target_intake_year', e.target.value)} placeholder="2027" />
              </Field>
            </div>
          </div>
        );
      case 1:
        return (
          <div style={{ display: 'grid', gap: 18 }}>
            <Field label="Undergrad institution *">
              <input style={inputStyle} value={form.undergrad_institution} onChange={(e) => set('undergrad_institution', e.target.value)} />
            </Field>
            <Field label="Undergrad major *">
              <input style={inputStyle} value={form.undergrad_major} onChange={(e) => set('undergrad_major', e.target.value)} />
            </Field>
            <Field label="Undergrad country">
              <input style={inputStyle} value={form.undergrad_country} onChange={(e) => set('undergrad_country', e.target.value)} placeholder="e.g. India" />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Field label="Undergrad GPA">
                <input style={inputStyle} inputMode="decimal" value={form.undergrad_gpa} onChange={(e) => set('undergrad_gpa', e.target.value)} />
              </Field>
              <Field label="GPA scale">
                <ChipGroup options={['4', '10', '100']} value={form.undergrad_gpa_scale} onChange={(v) => set('undergrad_gpa_scale', v)} />
              </Field>
            </div>
          </div>
        );
      case 2:
        return (
          <div style={{ display: 'grid', gap: 18 }}>
            <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, margin: 0 }}>
              All optional — many masters programs waive standardized tests. Fill in whichever you have.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <Field label="GRE Verbal"><input style={inputStyle} inputMode="numeric" value={form.gre_verbal} onChange={(e) => set('gre_verbal', e.target.value)} /></Field>
              <Field label="GRE Quant"><input style={inputStyle} inputMode="numeric" value={form.gre_quant} onChange={(e) => set('gre_quant', e.target.value)} /></Field>
              <Field label="GRE AWA"><input style={inputStyle} inputMode="decimal" value={form.gre_awa} onChange={(e) => set('gre_awa', e.target.value)} /></Field>
              <Field label="GMAT (classic /800)"><input style={inputStyle} inputMode="numeric" value={form.gmat_total} onChange={(e) => set('gmat_total', e.target.value)} /></Field>
              <Field label="GMAT Focus (/805)"><input style={inputStyle} inputMode="numeric" value={form.gmat_focus_total} onChange={(e) => set('gmat_focus_total', e.target.value)} /></Field>
              <Field label="TOEFL"><input style={inputStyle} inputMode="numeric" value={form.toefl_score} onChange={(e) => set('toefl_score', e.target.value)} /></Field>
              <Field label="IELTS"><input style={inputStyle} inputMode="decimal" value={form.ielts_score} onChange={(e) => set('ielts_score', e.target.value)} /></Field>
              <Field label="Duolingo English Test"><input style={inputStyle} inputMode="numeric" value={form.duolingo_score} onChange={(e) => set('duolingo_score', e.target.value)} /></Field>
              <Field label="PTE Academic"><input style={inputStyle} inputMode="numeric" value={form.pte_score} onChange={(e) => set('pte_score', e.target.value)} /></Field>
            </div>
          </div>
        );
      case 3:
        return (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Field label="Years of work experience">
                <input style={inputStyle} inputMode="decimal" value={form.work_experience_years} onChange={(e) => set('work_experience_years', e.target.value)} />
              </Field>
              <Field label="Publications">
                <input style={inputStyle} inputMode="numeric" value={form.publication_count} onChange={(e) => set('publication_count', e.target.value)} />
              </Field>
            </div>
            <Field label="Work experience" hint="A few lines — roles, companies, what you actually did.">
              <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.work_experience_desc} onChange={(e) => set('work_experience_desc', e.target.value)} />
            </Field>
            <Field label="Research experience" hint="Labs, projects, papers in progress — skip if not applicable.">
              <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={form.research_experience} onChange={(e) => set('research_experience', e.target.value)} />
            </Field>
          </div>
        );
      case 4:
        return (
          <div style={{ display: 'grid', gap: 18 }}>
            <p style={{ fontSize: 13, color: S.muted, fontFamily: S.font, margin: 0 }}>
              We track readiness, not content — no essay or recommender drafting here.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
              <Field label="Letters of recommendation secured">
                <input style={inputStyle} inputMode="numeric" value={form.lors_secured} onChange={(e) => set('lors_secured', e.target.value)} />
              </Field>
              <Field label="Letters required by programs">
                <input style={inputStyle} inputMode="numeric" value={form.lors_required} onChange={(e) => set('lors_required', e.target.value)} />
              </Field>
            </div>
            <Field label="Statement of purpose status">
              <ChipGroup options={SOP_STATUSES} value={form.sop_status} onChange={(v) => set('sop_status', v)} />
            </Field>
          </div>
        );
      case 5:
        return (
          <div style={{ display: 'grid', gap: 18 }}>
            <Field label="Target countries">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {COUNTRIES.map((c) => {
                  const on = countries.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCountries((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                      style={{
                        padding: '9px 16px', borderRadius: 100,
                        border: `1px solid ${on ? ACCENT : S.border2}`,
                        background: on ? h2r(ACCENT, 0.18) : 'transparent',
                        color: on ? ACCENT : S.muted, fontSize: 13, fontWeight: on ? 700 : 500,
                        cursor: 'pointer', fontFamily: S.font,
                      }}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        );
      case 6:
      default:
        return (
          <div>
            <div style={{ display: 'grid', gap: 2 }}>
              <SummaryRow label="Degree" value={form.target_degree_type} />
              <SummaryRow label="Program" value={form.intended_program} />
              <SummaryRow label="Specialization" value={form.intended_specialization} />
              <SummaryRow label="Target intake" value={`${form.target_intake_term} ${form.target_intake_year}`} />
              <SummaryRow label="Undergrad" value={`${form.undergrad_institution} — ${form.undergrad_major}`} />
              <SummaryRow label="GPA" value={form.undergrad_gpa ? `${form.undergrad_gpa}/${form.undergrad_gpa_scale}` : ''} />
              <SummaryRow label="Tests" value={[form.gre_quant && 'GRE', form.gmat_total && 'GMAT', form.toefl_score && 'TOEFL', form.ielts_score && 'IELTS'].filter(Boolean).join(', ')} />
              <SummaryRow label="Work experience" value={form.work_experience_years ? `${form.work_experience_years} yrs` : ''} />
              <SummaryRow label="Recommendations" value={`${form.lors_secured || 0}/${form.lors_required || 3}`} />
              <SummaryRow label="SOP" value={form.sop_status.replace('_', ' ')} />
              <SummaryRow label="Target countries" value={countries.join(', ')} />
            </div>
          </div>
        );
    }
  };

  const theme = STEP_THEMES[Math.min(step, STEP_THEMES.length - 1)];

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, padding: '40px 24px', fontFamily: S.font, transition: 'background 0.5s ease' }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <GraduationCap size={22} style={{ color: theme.accent, transition: 'color 0.5s ease' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, color: S.text, fontFamily: S.font, margin: 0 }}>Graduate Application Profile</h1>
        </div>

        <StepProgress step={step} accent={theme.accent} />

        <div style={{
          background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20,
          padding: 28, animation: 'fadeUp 0.25s ease both',
        }} key={step}>
          {renderStep()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
          <button
            type="button"
            onClick={back}
            disabled={step === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '11px 20px', borderRadius: 10,
              background: 'transparent', border: `1px solid ${S.border2}`, color: S.muted,
              fontSize: 13, fontWeight: 600, cursor: step === 0 ? 'default' : 'pointer',
              opacity: step === 0 ? 0.4 : 1, fontFamily: S.font,
            }}
          >
            <ChevronLeft size={16} /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 10,
                background: ACCENT, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: canAdvance ? 'pointer' : 'default', opacity: canAdvance ? 1 : 0.5, fontFamily: S.font,
              }}
            >
              Continue <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '11px 22px', borderRadius: 10,
                background: ACCENT, border: 'none', color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: S.font,
              }}
            >
              <Check size={16} /> {saving ? 'Saving…' : 'Finish & view dashboard'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MastersOnboarding;
