// src/pages/MastersProgramDetails.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Globe, ExternalLink, Calendar, Clock, BookOpen } from 'lucide-react';
import { api } from '../services/api';
import MastersChancingCard, { ChancingAssessment } from '../components/masters/MastersChancingCard';

/* ─── Design tokens ──────────────────────────────────────────────── */
const ACCENT = '#3B9EFF';
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
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
  font: "'Inter', system-ui, sans-serif",
};
const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ==================== TYPES ==================== */
interface Pathway {
  id: string;
  pathway_type: string;
  description: string;
  confidence: number | null;
  source_url: string | null;
}

interface MastersDeadline {
  id: string;
  deadline_type: string;
  deadline_date: string | null;
  is_rolling: boolean;
  notes: string | null;
}

interface ProgramDetail {
  id: string;
  institution_name: string;
  program_name: string;
  degree_type: string;
  specialization?: string;
  country?: string;
  tuition_total?: number;
  tuition_currency?: string;
  funding_availability?: string;
  is_stem_designated?: boolean;
  data_quality_score?: number;
  duration_months?: number;
  official_website?: string;
  pathways?: Pathway[];
  deadlines?: MastersDeadline[];
  gre_requirement?: string;
  gmat_requirement?: string;
  min_gpa?: number;
  min_gpa_scale?: number;
  min_toefl?: number;
  min_ielts?: number;
  assistantship_types?: string[];
  tuition_waiver_available?: boolean;
  median_earnings?: number;
  median_debt?: number;
  roi_source?: string;
}

/* ==================== MAIN ==================== */
const MastersProgramDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [program, setProgram] = useState<ProgramDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chancingResult, setChancingResult] = useState<ChancingAssessment | null>(null);
  const [chancingLoading, setChancingLoading] = useState(false);

  useEffect(() => {
    if (id) loadProgram(id);
  }, [id]);

  const loadProgram = async (programId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.masters.getProgram(programId);
      setProgram(res?.data || null);

      // Load chancing for logged-in users
      try {
        setChancingLoading(true);
        const chanceRes = await api.masters.getChances(programId);
        setChancingResult(chanceRes?.data || null);
      } catch {
        console.warn('Chancing failed (non-critical)');
      } finally {
        setChancingLoading(false);
      }
    } catch (err) {
      console.error('Failed to load program:', err);
      setError(err instanceof Error ? err.message : 'Failed to load program');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: S.bg }}>
        <style>{GLOBAL}</style>
        <div style={{ width: 40, height: 40, border: `3px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (!program) {
    return (
      <div style={{ padding: '64px 24px', textAlign: 'center', background: S.bg, fontFamily: S.font }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>Program Not Found</div>
        <div style={{ color: S.muted, fontSize: 14, marginBottom: 20 }}>The program you're looking for doesn't exist or has been removed.</div>
        <button onClick={() => navigate('/masters/programs')} style={{ padding: '9px 22px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: S.font, cursor: 'pointer' }}>Back to Programs</button>
      </div>
    );
  }

  const country = program.country || 'Unknown';
  const accent = country === 'United States' ? '#3B9EFF' : country === 'UK' ? '#A855F7' : country === 'Canada' ? '#EF4444' : '#10B981';

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: 'var(--color-text-primary)', fontFamily: S.font }}>
        {/* Hero */}
        <div style={{
          padding: '32px 48px',
          background: `linear-gradient(180deg,${h2r(accent,0.08)} 0%,transparent 100%)`,
          borderBottom: `1px solid ${S.border}`,
        }}>
          <div style={{ maxWidth: 1080, margin: '0 auto' }}>
            <button onClick={() => navigate('/masters/programs')} style={{ display: 'flex', alignItems: 'center', gap: 6, color: S.muted, fontSize: 13, fontWeight: 600, fontFamily: S.font, cursor: 'pointer', background: 'none', border: 'none', marginBottom: 16 }}>
              ← Back to Programs
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(accent, 0.12), color: accent, fontWeight: 600, fontFamily: S.font }}>{program.degree_type}</span>
                  {program.is_stem_designated && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.18)', color: '#10B981', fontWeight: 600, fontFamily: S.font }}>STEM Designated</span>
                  )}
                  {program.data_quality_score != null && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(251,191,36,0.12)', color: '#FBBF24', fontWeight: 600, fontFamily: S.font }}>Quality: {Math.round(program.data_quality_score)}%</span>
                  )}
                </div>
                <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 4 }}>{program.program_name}</h1>
                <div style={{ fontSize: 18, fontWeight: 700, color: S.muted, fontFamily: S.font }}>{program.institution_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: S.muted, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Globe style={{ width: 14, height: 14 }} /> {country}
                  </span>
                  {program.duration_months && (
                    <span style={{ fontSize: 13, color: S.muted, fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Clock style={{ width: 14, height: 14 }} /> {program.duration_months} months
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {program.official_website && (
                  <a href={program.official_website} target="_blank" rel="noopener noreferrer" style={{ padding: '9px 18px', background: h2r(accent, 0.15), border: `1px solid ${h2r(accent, 0.3)}`, borderRadius: 10, color: ACCENT, fontSize: 13, fontWeight: 700, fontFamily: S.font, cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ExternalLink style={{ width: 14, height: 14 }} /> Website
                  </a>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div style={{ display: 'flex', gap: 16, marginTop: 24, flexWrap: 'wrap' }}>
              {program.tuition_total != null && (
                <div style={{ padding: '12px 20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 4 }}>Tuition</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT, fontFamily: S.font }}>${program.tuition_total.toLocaleString()} {program.tuition_currency || ''}</div>
                </div>
              )}
              {program.funding_availability && (
                <div style={{ padding: '12px 20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 4 }}>Funding</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#FBBF24', fontFamily: S.font }}>{program.funding_availability}</div>
                </div>
              )}
              {program.specialization && (
                <div style={{ padding: '12px 20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12 }}>
                  <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginBottom: 4 }}>Specialization</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{program.specialization}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Chancing */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 48px' }}>
          {chancingLoading ? (
            <div style={{ padding: '20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 20, height: 20, border: `2px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>Calculating admission chances…</span>
            </div>
          ) : chancingResult && (
            <MastersChancingCard assessment={chancingResult} />
          )}
        </div>

        {/* Admission requirements + outcomes — already returned by the API, just
            not rendered before. These are the fields students actually need to
            self-filter (test minimums, GPA, funding, ROI). */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 48px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div style={{ padding: '20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: S.font, marginBottom: 16 }}>Admission Requirements</h3>
            {(program.gre_requirement || program.gmat_requirement || program.min_gpa != null || program.min_toefl != null || program.min_ielts != null) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {program.gre_requirement && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>GRE</span><span style={{ fontWeight: 700 }}>{program.gre_requirement}</span>
                  </div>
                )}
                {program.gmat_requirement && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>GMAT</span><span style={{ fontWeight: 700 }}>{program.gmat_requirement}</span>
                  </div>
                )}
                {program.min_gpa != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Minimum GPA</span><span style={{ fontWeight: 700 }}>{program.min_gpa}{program.min_gpa_scale ? ` / ${program.min_gpa_scale}` : ''}</span>
                  </div>
                )}
                {program.min_toefl != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Minimum TOEFL</span><span style={{ fontWeight: 700 }}>{program.min_toefl}</span>
                  </div>
                )}
                {program.min_ielts != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Minimum IELTS</span><span style={{ fontWeight: 700 }}>{program.min_ielts}</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No requirements data available</div>
            )}
          </div>

          <div style={{ padding: '20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: S.font, marginBottom: 16 }}>Outcomes &amp; Funding</h3>
            {(program.median_earnings != null || program.median_debt != null || program.tuition_waiver_available || (program.assistantship_types && program.assistantship_types.length > 0)) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {program.median_earnings != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Median earnings</span><span style={{ fontWeight: 700 }}>${program.median_earnings.toLocaleString()}</span>
                  </div>
                )}
                {program.median_debt != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Median debt</span><span style={{ fontWeight: 700 }}>${program.median_debt.toLocaleString()}</span>
                  </div>
                )}
                {program.tuition_waiver_available != null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Tuition waiver</span><span style={{ fontWeight: 700 }}>{program.tuition_waiver_available ? 'Available' : 'Not available'}</span>
                  </div>
                )}
                {program.assistantship_types && program.assistantship_types.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontFamily: S.font }}>
                    <span style={{ color: S.muted }}>Assistantships</span><span style={{ fontWeight: 700, textAlign: 'right' }}>{program.assistantship_types.join(', ')}</span>
                  </div>
                )}
                {program.roi_source && (
                  <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginTop: 4 }}>Source: {program.roi_source}</div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No outcomes data available</div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 48px 48px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Pathways */}
          <div style={{ padding: '20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, animation: 'fadeUp 0.3s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <BookOpen style={{ width: 18, height: 18, color: ACCENT }} />
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: S.font }}>Pathways</h3>
              <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>{program.pathways?.length || 0}</span>
            </div>
            {program.pathways && program.pathways.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {program.pathways.map((pw) => (
                  <div key={pw.id} style={{ padding: '12px 14px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: S.font, marginBottom: 2, textTransform: 'capitalize' }}>{pw.pathway_type.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>{pw.description}</div>
                    {pw.confidence != null && <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginTop: 2 }}>Confidence: {Math.round(pw.confidence * 100)}%</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No pathways available</div>
            )}
          </div>

          {/* Deadlines */}
          <div style={{ padding: '20px', background: S.surface, border: `1px solid ${S.border}`, borderRadius: 16, animation: 'fadeUp 0.3s ease both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Calendar style={{ width: 18, height: 18, color: ACCENT }} />
              <h3 style={{ fontSize: 16, fontWeight: 800, fontFamily: S.font }}>Deadlines</h3>
              <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>{program.deadlines?.length || 0}</span>
            </div>
            {program.deadlines && program.deadlines.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {program.deadlines.map((dl) => (
                  <div key={dl.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: S.font }}>{dl.deadline_type.replace(/_/g, ' ')}</div>
                      {dl.notes && <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font, marginTop: 2 }}>{dl.notes}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, fontFamily: S.font }}>
                      {dl.deadline_date
                        ? new Date(dl.deadline_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : (dl.is_rolling ? 'Rolling' : 'TBD')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: S.dim, fontFamily: S.font }}>No deadlines available</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default MastersProgramDetails;
