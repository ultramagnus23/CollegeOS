/**
 * MastersDashboard.tsx — Phases 4.5/5/6 of docs/MASTERS_TRACK_PLAN.md.
 *
 * The masters home: persistent disclosure, program discovery, and inline
 * competitiveness bands. Reads only the masters API surface. Flag-gated.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Search } from 'lucide-react';
import { api } from '../services/api';
import { isMastersTrackEnabled } from '../config/featureFlags';
import MastersDisclosure from '../components/masters/MastersDisclosure';
import MastersChancingCard, { ChancingAssessment } from '../components/masters/MastersChancingCard';

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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Masters Programs</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
          <GraduationCap className="h-3.5 w-3.5" /> Masters
        </span>
      </div>

      <MastersDisclosure variant="banner" />

      <div className="mt-5 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-4">
        <input
          className="rounded-lg border border-gray-300 px-3 py-2 md:col-span-2"
          placeholder="Field or specialization (e.g. machine learning)"
          value={field}
          onChange={(e) => setField(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <select className="rounded-lg border border-gray-300 px-3 py-2" value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c || 'Any country'}</option>)}
        </select>
        <div className="flex gap-2">
          <select className="flex-1 rounded-lg border border-gray-300 px-3 py-2" value={degreeType} onChange={(e) => setDegreeType(e.target.value)}>
            {DEGREES.map((d) => <option key={d} value={d}>{d || 'Any degree'}</option>)}
          </select>
          <button onClick={search} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700">
            <Search className="h-4 w-4" /> Find
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {loading && <p className="text-sm text-gray-500">Searching…</p>}
        {!loading && programs.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-gray-500">
            No programs to show yet. Program data is populated by the per-program scraper (Phase 2);
            until then this list is empty rather than guessed.
          </div>
        )}
        {programs.map((p) => (
          <div key={p.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{p.program_name}</h3>
                <p className="text-sm text-gray-500">{p.institution_name} · {p.institution_country} · {p.degree_type}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {p.is_stem_designated && <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">STEM</span>}
                  {p.funding_availability && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{p.funding_availability}</span>}
                  {p.tuition_total != null && (
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                      {p.tuition_currency || ''} {Number(p.tuition_total).toLocaleString()}
                    </span>
                  )}
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-500">{p.datapoint_count || 0} self-reports</span>
                </div>
              </div>
              <button
                onClick={() => loadChances(p.id)}
                className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                Check my competitiveness
              </button>
            </div>
            {chances[p.id] && (
              <div className="mt-4">
                <MastersChancingCard assessment={chances[p.id]} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MastersDashboard;
