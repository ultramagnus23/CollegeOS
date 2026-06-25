/**
 * MastersOnboarding.tsx — Phase 3 of docs/MASTERS_TRACK_PLAN.md.
 *
 * Sibling to the undergrad onboarding, NOT a modification of it — the validated
 * undergrad flow is untouched. Collects masters_profile fields and persists via
 * /api/masters. Carries an explicit "Masters" badge throughout. Flag-gated:
 * redirects out when MASTERS_TRACK_ENABLED is off.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GraduationCap } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';

const DEGREES = ['MS', 'MA', 'MBA'] as const;
const TERMS = ['fall', 'spring', 'summer', 'winter'] as const;
const COUNTRIES = ['US', 'UK', 'CA', 'DE', 'NL', 'AU', 'SG'];

const num = (v: string): number | undefined => (v === '' ? undefined : Number(v));

const MastersBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
    <GraduationCap className="h-3.5 w-3.5" /> Masters
  </span>
);

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
    {children}
  </label>
);

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500';

const MastersOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    target_degree_type: 'MS',
    intended_program: '',
    intended_specialization: '',
    undergrad_institution: '',
    undergrad_major: '',
    undergrad_gpa: '',
    undergrad_gpa_scale: '4',
    gre_verbal: '', gre_quant: '', gre_awa: '',
    gmat_total: '', gmat_focus_total: '',
    toefl_score: '', ielts_score: '',
    work_experience_years: '', publication_count: '',
    lors_secured: '', target_intake_term: 'fall', target_intake_year: '',
  });
  const [countries, setCountries] = useState<string[]>([]);

  useEffect(() => {
    if (!isMastersTrackEnabled()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
        undergrad_gpa: num(form.undergrad_gpa),
        undergrad_gpa_scale: num(form.undergrad_gpa_scale),
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
      });
      toast.success('Masters profile saved');
      navigate('/masters');
    } catch {
      toast.error('Could not save your masters profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Graduate Application Profile</h1>
        <MastersBadge />
      </div>

      <div className="space-y-6 rounded-2xl bg-white p-6 shadow">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Degree type">
            <select className={inputCls} value={form.target_degree_type} onChange={(e) => set('target_degree_type', e.target.value)}>
              {DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Intended program (e.g. Computer Science)">
            <input className={inputCls} value={form.intended_program} onChange={(e) => set('intended_program', e.target.value)} />
          </Field>
          <Field label="Specialization (optional)">
            <input className={inputCls} value={form.intended_specialization} onChange={(e) => set('intended_specialization', e.target.value)} />
          </Field>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Undergrad institution">
            <input className={inputCls} value={form.undergrad_institution} onChange={(e) => set('undergrad_institution', e.target.value)} />
          </Field>
          <Field label="Undergrad major">
            <input className={inputCls} value={form.undergrad_major} onChange={(e) => set('undergrad_major', e.target.value)} />
          </Field>
          <Field label="Undergrad GPA">
            <input className={inputCls} inputMode="decimal" value={form.undergrad_gpa} onChange={(e) => set('undergrad_gpa', e.target.value)} />
          </Field>
          <Field label="GPA scale (4 / 10 / 100)">
            <input className={inputCls} inputMode="decimal" value={form.undergrad_gpa_scale} onChange={(e) => set('undergrad_gpa_scale', e.target.value)} />
          </Field>
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-gray-600">Tests (all optional — many programs waive them)</p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <Field label="GRE Verbal"><input className={inputCls} inputMode="numeric" value={form.gre_verbal} onChange={(e) => set('gre_verbal', e.target.value)} /></Field>
            <Field label="GRE Quant"><input className={inputCls} inputMode="numeric" value={form.gre_quant} onChange={(e) => set('gre_quant', e.target.value)} /></Field>
            <Field label="GRE AWA"><input className={inputCls} inputMode="decimal" value={form.gre_awa} onChange={(e) => set('gre_awa', e.target.value)} /></Field>
            <Field label="GMAT (classic /800)"><input className={inputCls} inputMode="numeric" value={form.gmat_total} onChange={(e) => set('gmat_total', e.target.value)} /></Field>
            <Field label="GMAT Focus (/805)"><input className={inputCls} inputMode="numeric" value={form.gmat_focus_total} onChange={(e) => set('gmat_focus_total', e.target.value)} /></Field>
            <Field label="TOEFL"><input className={inputCls} inputMode="numeric" value={form.toefl_score} onChange={(e) => set('toefl_score', e.target.value)} /></Field>
            <Field label="IELTS"><input className={inputCls} inputMode="decimal" value={form.ielts_score} onChange={(e) => set('ielts_score', e.target.value)} /></Field>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Years of work experience"><input className={inputCls} inputMode="decimal" value={form.work_experience_years} onChange={(e) => set('work_experience_years', e.target.value)} /></Field>
          <Field label="Publications"><input className={inputCls} inputMode="numeric" value={form.publication_count} onChange={(e) => set('publication_count', e.target.value)} /></Field>
          <Field label="LORs secured"><input className={inputCls} inputMode="numeric" value={form.lors_secured} onChange={(e) => set('lors_secured', e.target.value)} /></Field>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Target intake term">
            <select className={inputCls} value={form.target_intake_term} onChange={(e) => set('target_intake_term', e.target.value)}>
              {TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Target intake year">
            <input className={inputCls} inputMode="numeric" value={form.target_intake_year} onChange={(e) => set('target_intake_year', e.target.value)} />
          </Field>
        </section>

        <section>
          <p className="mb-2 text-sm font-medium text-gray-700">Target countries</p>
          <div className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => {
              const on = countries.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCountries((prev) => (on ? prev.filter((x) => x !== c) : [...prev, c]))}
                  className={`rounded-lg px-3 py-1.5 text-sm ${on ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </section>

        <div className="flex justify-end border-t pt-4">
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save & continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MastersOnboarding;
