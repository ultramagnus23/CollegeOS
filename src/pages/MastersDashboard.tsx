/**
 * MastersDashboard.tsx — Phases 4.5/5/6 of docs/MASTERS_TRACK_PLAN.md.
 *
 * The masters home: persistent disclosure, program discovery, and inline
 * competitiveness bands. Reads only the masters API surface. Flag-gated.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Search, ChevronDown, Check } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';
import MastersDisclosure from '../components/masters/MastersDisclosure';
import MastersChancingCard, { ChancingAssessment } from '../components/masters/MastersChancingCard';

/**
 * Theme-aware custom dropdown — replaces the native <select>, whose OS-rendered
 * option list looked broken on the dark theme. Closes on outside click / Escape.
 */
const Dropdown: React.FC<{
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  placeholder: string;
}> = ({ value, options, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-foreground transition-colors hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <span className={current?.value ? '' : 'text-muted-foreground'}>{current?.label || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <button
                key={o.value || 'any'}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  active ? 'bg-primary/15 text-primary' : 'hover:bg-muted'
                }`}
              >
                {o.label}
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface ProgramCard {
  id: string;
  institution_name: string;
  institution_country: string;
  program_name: string;
  degree_type: string;
  specialization: string | null;
  is_stem_designated: boolean | null;
  funding_availability: string | null;
  tuition_total: number | null;
  tuition_currency: string | null;
  pathway_count: number | null;
  datapoint_count: number | null;
}

const COUNTRIES = ['', 'US', 'UK', 'CA', 'DE', 'NL', 'AU', 'SG'];
const DEGREES = ['', 'MS', 'MA', 'MBA'];

const MastersDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [field, setField] = useState('');
  const [country, setCountry] = useState('');
  const [degreeType, setDegreeType] = useState('');
  const [programs, setPrograms] = useState<ProgramCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [chances, setChances] = useState<Record<string, ChancingAssessment>>({});

  useEffect(() => {
    if (!isMastersTrackEnabled()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const search = async () => {
    setLoading(true);
    try {
      const res = await api.masters.discover({
        field: field || undefined,
        countries: country ? [country] : undefined,
        degreeType: degreeType || undefined,
        limit: 25,
      });
      setPrograms((res?.data as ProgramCard[]) || []);
    } catch {
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  };

  const loadChances = async (programId: string) => {
    try {
      const res = await api.masters.getChances(programId);
      if (res?.data) setChances((prev) => ({ ...prev, [programId]: res.data as ChancingAssessment }));
    } catch {
      /* surfaced as no card */
    }
  };

  const inputCls =
    'rounded-lg border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

  return (
    // min-h-screen + explicit theme tokens so the page is self-sufficient: it
    // renders outside DashboardLayout, so it must not rely on a parent for the
    // themed background/foreground (root cause of the masters contrast bug).
    <div className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">Masters Programs</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">
          <GraduationCap className="h-3.5 w-3.5" /> Masters
        </span>
      </div>

      <MastersDisclosure variant="banner" />

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm md:grid-cols-4">
        <input
          className={`${inputCls} md:col-span-2`}
          placeholder="Field or specialization (e.g. machine learning)"
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <Dropdown
          value={country}
          onChange={setCountry}
          placeholder="Any country"
          options={COUNTRIES.map((c) => ({ value: c, label: c || 'Any country' }))}
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <Dropdown
              value={degreeType}
              onChange={setDegreeType}
              placeholder="Any degree"
              options={DEGREES.map((d) => ({ value: d, label: d || 'Any degree' }))}
            />
          </div>
          <button
            onClick={search}
            className="flex items-center gap-1 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            <Search className="h-4 w-4" /> Find
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4 animate-pulse" /> Searching…
          </p>
        )}
        {!loading && programs.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center text-muted-foreground">
            No programs to show yet. Program data is populated by the per-program scraper (Phase 2);
            until then this list is empty rather than guessed.
          </div>
        )}
        {programs.map((p) => {
          const open = !!chances[p.id];
          return (
            <div
              key={p.id}
              className="animate-fade-in rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-foreground">{p.program_name}</h3>
                  <p className="text-sm text-muted-foreground">{p.institution_name} · {p.institution_country} · {p.degree_type}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {p.is_stem_designated && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-700 dark:text-emerald-300">STEM</span>}
                    {p.funding_availability && <span className="rounded-full bg-blue-500/15 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300">{p.funding_availability}</span>}
                    {p.tuition_total != null && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                        {p.tuition_currency || ''} {Number(p.tuition_total).toLocaleString()}
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{p.datapoint_count || 0} self-reports</span>
                  </div>
                </div>
                <button
                  onClick={() => loadChances(p.id)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    open
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-primary/40 text-primary hover:bg-primary/10'
                  }`}
                >
                  {open ? 'Showing competitiveness' : 'Check my competitiveness'}
                </button>
              </div>
              {chances[p.id] && (
                <div className="mt-4">
                  <MastersChancingCard assessment={chances[p.id]} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
};

export default MastersDashboard;
