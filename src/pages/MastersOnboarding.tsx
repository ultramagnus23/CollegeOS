/**
 * MastersOnboarding.tsx — Phase 3 of docs/MASTERS_TRACK_PLAN.md.
 *
 * Sibling to the undergrad onboarding, NOT a modification of it — the validated
 * undergrad flow is untouched. Rebuilt as a premium, always-dark MULTI-STEP flow
 * that mirrors StudentOnboarding's visual language (per-step accent themes, a
 * constellation stepper, segmented controls, country cards, a live profile
 * preview) so the masters track feels like the same product rather than a plain
 * form. Collects masters_profile fields and persists via /api/masters. Flag-gated:
 * redirects out when MASTERS_TRACK_ENABLED is off.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GraduationCap, ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';

const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));

const hexToRgba = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

const STEPS = [
  { label: 'Goal', accent: '#7A73F0', title: 'Your masters goal', sub: 'What degree, and in what field?' },
  { label: 'Background', accent: '#5BA9F8', title: 'Academic background', sub: 'Where you studied, and how you did.' },
  { label: 'Scores', accent: '#B06CF0', title: 'Test scores', sub: 'All optional — many programs waive these.' },
  { label: 'Targets', accent: '#3FC495', title: 'Where & when', sub: 'Your intake and target countries.' },
] as const;

const COUNTRY_CARDS = [
  { code: 'US', flag: '🇺🇸', name: 'United States' },
  { code: 'UK', flag: '🇬🇧', name: 'United Kingdom' },
  { code: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: 'SG', flag: '🇸🇬', name: 'Singapore' },
];

const DEGREES = ['MS', 'MA', 'MBA'] as const;
const TERMS = ['fall', 'spring', 'summer', 'winter'] as const;

// ── Small styled primitives (scoped, always-dark to match StudentOnboarding) ──
const TextField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent: string;
  placeholder?: string;
  numeric?: boolean;
  decimal?: boolean;
}> = ({ label, value, onChange, accent, placeholder, numeric, decimal }) => (
  <label className="block">
    <span className="mb-1.5 block text-[13px] font-medium text-white/70">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={decimal ? 'decimal' : numeric ? 'numeric' : undefined}
      className="w-full rounded-xl px-3.5 py-2.5 text-[15px] text-white outline-none transition-colors placeholder:text-white/30"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
      onFocus={(e) => (e.currentTarget.style.borderColor = hexToRgba(accent, 0.6))}
      onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
    />
  </label>
);

const Segmented: React.FC<{ options: readonly string[]; value: string; onChange: (v: string) => void; accent: string }> = ({
  options,
  value,
  onChange,
  accent,
}) => (
  <div
    className="flex gap-1 rounded-xl p-1"
    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
  >
    {options.map((opt) => {
      const on = value.toLowerCase() === opt.toLowerCase();
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className="flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold capitalize transition-all"
          style={{
            background: on ? accent : 'transparent',
            color: on ? '#0B0B16' : 'rgba(255,255,255,0.6)',
          }}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const TextArea: React.FC<{
  label: string; value: string; onChange: (v: string) => void; accent: string; placeholder?: string;
}> = ({ label, value, onChange, accent, placeholder }) => (
  <label className="block">
    <span className="mb-1.5 block text-[13px] font-medium text-white/70">{label}</span>
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full resize-y rounded-xl px-3.5 py-2.5 text-[14px] text-white outline-none transition-colors placeholder:text-white/30"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
      onFocus={(e) => (e.currentTarget.style.borderColor = hexToRgba(accent, 0.6))}
      onBlur={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
    />
  </label>
);

const MastersOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    target_degree_type: 'MS',
    intended_program: '',
    intended_specialization: '',
    undergrad_institution: '',
    undergrad_major: '',
    undergrad_country: '',
    undergrad_gpa: '',
    undergrad_gpa_scale: '4',
    gre_verbal: '', gre_quant: '', gre_awa: '',
    gmat_total: '', gmat_focus_total: '',
    toefl_score: '', ielts_score: '',
    work_experience_years: '', publication_count: '',
    research_experience: '', work_experience_desc: '',
    lors_secured: '', target_intake_term: 'fall', target_intake_year: '',
    target_budget_max: '', target_budget_currency: 'USD',
  });
  const [countries, setCountries] = useState<string[]>([]);

  useEffect(() => {
    if (!isMastersTrackEnabled()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const theme = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canContinue = step === 0 ? form.intended_program.trim().length > 0 : true;

  // Live profile-strength meter — light heuristic, purely for feedback.
  const strength = useMemo(() => {
    const filled = [
      form.intended_program, form.intended_specialization, form.undergrad_institution,
      form.undergrad_major, form.undergrad_country, form.undergrad_gpa, form.gre_quant || form.gmat_total,
      form.toefl_score || form.ielts_score, form.work_experience_years, form.lors_secured,
      form.research_experience || form.work_experience_desc, form.target_intake_year, form.target_budget_max,
    ].filter((v) => String(v).trim().length > 0).length;
    const total = 13 + (countries.length > 0 ? 1 : 0);
    return Math.min(100, Math.round(((filled + (countries.length > 0 ? 1 : 0)) / total) * 100));
  }, [form, countries]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.masters.setTrack({ programTrack: 'masters' });
      await api.masters.saveProfile({
        target_degree_type: form.target_degree_type,
        intended_program: form.intended_program,
        intended_specialization: form.intended_specialization,
        undergrad_institution: form.undergrad_institution,
        undergrad_major: form.undergrad_major,
        undergrad_country: form.undergrad_country,
        undergrad_gpa: num(form.undergrad_gpa),
        undergrad_gpa_scale: num(form.undergrad_gpa_scale),
        research_experience: form.research_experience,
        work_experience_desc: form.work_experience_desc,
        gre_verbal: num(form.gre_verbal),
        gre_quant: num(form.gre_quant),
        gre_awa: num(form.gre_awa),
        gmat_total: num(form.gmat_total),
        gmat_focus_total: num(form.gmat_focus_total),
        toefl_score: num(form.toefl_score),
        ielts_score: num(form.ielts_score),
        work_experience_years: num(form.work_experience_years),
        publication_count: num(form.publication_count),
        lors_secured: num(form.lors_secured),
        target_intake_term: form.target_intake_term,
        target_intake_year: num(form.target_intake_year),
        target_countries: countries,
        target_budget_max: num(form.target_budget_max),
        target_budget_currency: form.target_budget_currency,
      });
      toast.success('Masters profile saved');
      navigate('/masters');
    } catch {
      toast.error('Could not save your masters profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const next = () => (isLast ? handleSubmit() : setStep((s) => Math.min(s + 1, STEPS.length - 1)));

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: `radial-gradient(120% 70% at 50% -10%, ${hexToRgba(theme.accent, 0.16)} 0%, #0B0B16 55%)`, transition: 'background 0.4s ease' }}
    >
      <div className="mx-auto max-w-2xl px-5 py-10">
        {/* Top bar: badge + stepper */}
        <div className="mb-2 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white"
            style={{ background: hexToRgba(theme.accent, 0.18), border: `1px solid ${hexToRgba(theme.accent, 0.4)}` }}
          >
            <GraduationCap className="h-3.5 w-3.5" /> Masters
          </span>
          <span className="text-xs text-white/40">Step {step + 1} of {STEPS.length}</span>
        </div>

        {/* Stepper */}
        <div className="relative mb-8 mt-4 flex items-center justify-between">
          <div className="absolute left-0 right-0 top-1.5 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div
            className="absolute left-0 top-1.5 h-px transition-all duration-500"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%`, background: theme.accent }}
          />
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s.label}
                type="button"
                onClick={() => i <= step && setStep(i)}
                className="relative z-10 flex flex-col items-center gap-2"
                style={{ cursor: i <= step ? 'pointer' : 'default' }}
              >
                <span
                  className="flex items-center justify-center rounded-full transition-all"
                  style={{
                    width: active ? 16 : 12,
                    height: active ? 16 : 12,
                    background: done || active ? s.accent : 'rgba(255,255,255,0.18)',
                    boxShadow: active ? `0 0 12px ${hexToRgba(s.accent, 0.5)}` : 'none',
                  }}
                >
                  {done && <Check className="h-2.5 w-2.5 text-[#0B0B16]" strokeWidth={3} />}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: active ? s.accent : 'rgba(255,255,255,0.4)' }}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Heading */}
        <h1 className="text-[26px] font-extrabold leading-tight text-white">{theme.title}</h1>
        <p className="mt-1.5 text-[15px] text-white/55">{theme.sub}</p>

        {/* Card */}
        <div
          className="mt-6 rounded-2xl p-6"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}
        >
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <span className="mb-1.5 block text-[13px] font-medium text-white/70">Degree type</span>
                <Segmented options={DEGREES} value={form.target_degree_type} onChange={(v) => set('target_degree_type', v)} accent={theme.accent} />
              </div>
              <TextField label="Intended program (e.g. Computer Science)" value={form.intended_program} onChange={(v) => set('intended_program', v)} accent={theme.accent} placeholder="Computer Science" />
              <TextField label="Specialization (optional)" value={form.intended_specialization} onChange={(v) => set('intended_specialization', v)} accent={theme.accent} placeholder="Machine Learning" />
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <TextField label="Undergrad institution" value={form.undergrad_institution} onChange={(v) => set('undergrad_institution', v)} accent={theme.accent} />
                <TextField label="Undergrad major" value={form.undergrad_major} onChange={(v) => set('undergrad_major', v)} accent={theme.accent} />
                <TextField label="Undergrad country" value={form.undergrad_country} onChange={(v) => set('undergrad_country', v)} accent={theme.accent} placeholder="India" />
                <TextField label="Undergrad GPA" value={form.undergrad_gpa} onChange={(v) => set('undergrad_gpa', v)} accent={theme.accent} decimal placeholder="3.6" />
                <TextField label="GPA scale (4 / 10 / 100)" value={form.undergrad_gpa_scale} onChange={(v) => set('undergrad_gpa_scale', v)} accent={theme.accent} decimal />
              </div>
              {/* Experience signals — the grad-level equivalent of undergrad
                  extracurriculars/essays (free-text context, like undergrad's
                  careerGoals/whyCollege). Persisted to masters_profile. */}
              <TextArea label="Research experience (projects, labs, thesis)" value={form.research_experience} onChange={(v) => set('research_experience', v)} accent={theme.accent} placeholder="Briefly describe research projects, labs, or a thesis." />
              <TextArea label="Work experience (roles, impact)" value={form.work_experience_desc} onChange={(v) => set('work_experience_desc', v)} accent={theme.accent} placeholder="Roles, companies, and what you owned." />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TextField label="GRE Verbal" value={form.gre_verbal} onChange={(v) => set('gre_verbal', v)} accent={theme.accent} numeric />
                <TextField label="GRE Quant" value={form.gre_quant} onChange={(v) => set('gre_quant', v)} accent={theme.accent} numeric />
                <TextField label="GRE AWA" value={form.gre_awa} onChange={(v) => set('gre_awa', v)} accent={theme.accent} decimal />
                <TextField label="GMAT (/800)" value={form.gmat_total} onChange={(v) => set('gmat_total', v)} accent={theme.accent} numeric />
                <TextField label="GMAT Focus (/805)" value={form.gmat_focus_total} onChange={(v) => set('gmat_focus_total', v)} accent={theme.accent} numeric />
                <TextField label="TOEFL" value={form.toefl_score} onChange={(v) => set('toefl_score', v)} accent={theme.accent} numeric />
                <TextField label="IELTS" value={form.ielts_score} onChange={(v) => set('ielts_score', v)} accent={theme.accent} decimal />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TextField label="Years of work exp." value={form.work_experience_years} onChange={(v) => set('work_experience_years', v)} accent={theme.accent} decimal />
                <TextField label="Publications" value={form.publication_count} onChange={(v) => set('publication_count', v)} accent={theme.accent} numeric />
                <TextField label="LORs secured" value={form.lors_secured} onChange={(v) => set('lors_secured', v)} accent={theme.accent} numeric />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-white/70">Target intake term</span>
                  <Segmented options={TERMS} value={form.target_intake_term} onChange={(v) => set('target_intake_term', v)} accent={theme.accent} />
                </div>
                <TextField label="Target intake year" value={form.target_intake_year} onChange={(v) => set('target_intake_year', v)} accent={theme.accent} numeric placeholder="2027" />
              </div>
              {/* Budget — undergrad collects this; masters discovery already
                  filters on budgetMax, so it's fed straight into matching. */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <TextField label="Max annual tuition budget" value={form.target_budget_max} onChange={(v) => set('target_budget_max', v)} accent={theme.accent} numeric placeholder="50000" />
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-white/70">Currency</span>
                  <Segmented options={['USD', 'EUR', 'GBP', 'INR']} value={form.target_budget_currency} onChange={(v) => set('target_budget_currency', v)} accent={theme.accent} />
                </div>
              </div>
              <div>
                <span className="mb-2 block text-[13px] font-medium text-white/70">Target countries</span>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {COUNTRY_CARDS.map((c) => {
                    const on = countries.includes(c.code);
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setCountries((prev) => (on ? prev.filter((x) => x !== c.code) : [...prev, c.code]))}
                        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all"
                        style={{
                          background: on ? hexToRgba(theme.accent, 0.16) : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${on ? hexToRgba(theme.accent, 0.6) : 'rgba(255,255,255,0.1)'}`,
                        }}
                      >
                        <span className="text-xl">{c.flag}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] font-semibold text-white">{c.code}</span>
                          <span className="block truncate text-[11px] text-white/45">{c.name}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Profile strength */}
        <div className="mt-5 flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-white/40">Profile</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${strength}%`, background: theme.accent }} />
          </div>
          <span className="text-[11px] font-semibold text-white/50">{strength}%</span>
        </div>

        {/* Nav */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(s - 1, 0))}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white/60 transition-colors hover:text-white disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <button
            type="button"
            onClick={next}
            disabled={saving || !canContinue}
            className="flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
            style={{ background: theme.accent, boxShadow: `0 8px 24px ${hexToRgba(theme.accent, 0.3)}` }}
          >
            {isLast ? (
              <>{saving ? 'Saving…' : 'Save & finish'} <Sparkles className="h-4 w-4" /></>
            ) : (
              <>Continue <ArrowRight className="h-4 w-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MastersOnboarding;
