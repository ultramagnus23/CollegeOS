// src/pages/MastersApplications.tsx — Dark Editorial, mirrors MastersDeadlines structure.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ExternalLink } from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';

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
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
`;

const STATUSES = ['planning', 'in_progress', 'submitted', 'interview', 'admitted', 'rejected', 'waitlisted', 'deferred', 'enrolled'];

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  planning: { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  in_progress: { color: ACCENT, bg: h2r(ACCENT, 0.12) },
  submitted: { color: '#A78BFA', bg: 'rgba(167,139,250,0.12)' },
  interview: { color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  admitted: { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  rejected: { color: '#F87171', bg: 'rgba(248,113,113,0.12)' },
  waitlisted: { color: '#FB923C', bg: 'rgba(251,146,60,0.12)' },
  deferred: { color: '#94A3B8', bg: 'rgba(148,163,184,0.12)' },
  enrolled: { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
};

interface MastersApplication {
  id: number;
  masters_program_id: string;
  status: string;
  intake_term: string | null;
  intake_year: number | null;
  priority: string | null;
  notes: string | null;
  decision_outcome: string | null;
  created_at: string;
  institution_name: string;
  program_name: string;
  degree_type: string;
}

const MastersApplications: React.FC = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState<MastersApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.masters.listApplications();
      setApps((res?.data as MastersApplication[]) || []);
    } catch {
      toast.error('Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (app: MastersApplication, status: string) => {
    setUpdating(app.id);
    try {
      await api.masters.saveApplication({
        mastersProgramId: app.masters_program_id,
        status,
        intakeTerm: app.intake_term || undefined,
        intakeYear: app.intake_year || undefined,
        priority: app.priority || undefined,
        notes: app.notes || undefined,
      });
      setApps((prev) => prev.map((a) => (a.id === app.id ? { ...a, status } : a)));
      toast.success('Status updated');
    } catch {
      toast.error('Could not update status');
    } finally {
      setUpdating(null);
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

  return (
    <div style={{ minHeight: '100vh', background: S.bg, padding: '32px 24px', fontFamily: S.font }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: S.text, fontFamily: S.font, marginBottom: 6 }}>Applications</h1>
          <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font }}>{apps.length} programs tracked</p>
        </div>

        {apps.length === 0 ? (
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 20, padding: '64px 24px', textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
            <FileText size={40} style={{ color: S.dim, margin: '0 auto 16px' }} />
            <h3 style={{ fontSize: 20, fontWeight: 800, color: S.text, fontFamily: S.font, marginBottom: 8 }}>No applications yet</h3>
            <p style={{ fontSize: 14, color: S.muted, fontFamily: S.font, marginBottom: 16 }}>Save a program from the catalog to start tracking it here.</p>
            <button
              onClick={() => navigate('/masters/programs')}
              style={{ padding: '10px 20px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: S.font }}
            >
              Browse programs
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {apps.map((app, index) => {
              const style = STATUS_STYLE[app.status] || STATUS_STYLE.planning;
              return (
                <div key={app.id} style={{
                  background: S.surface, border: `1px solid ${S.border}`, borderLeft: `3px solid ${style.color}`,
                  borderRadius: 16, padding: '18px 22px', animation: 'fadeUp 0.3s ease both', animationDelay: `${index * 0.04}s`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 240 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                        <h3
                          onClick={() => navigate(`/masters/programs/${app.masters_program_id}`)}
                          style={{ fontSize: 16, fontWeight: 800, color: S.text, margin: 0, cursor: 'pointer' }}
                        >
                          {app.institution_name}
                        </h3>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: style.bg, color: style.color, fontWeight: 700, textTransform: 'capitalize' }}>
                          {app.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: S.muted, marginBottom: 4 }}>{app.program_name} · {app.degree_type}</div>
                      {(app.intake_term || app.intake_year) && (
                        <div style={{ fontSize: 12, color: S.dim }}>
                          {app.intake_term} {app.intake_year}
                        </div>
                      )}
                    </div>
                    <select
                      value={app.status}
                      disabled={updating === app.id}
                      onChange={(e) => updateStatus(app, e.target.value)}
                      style={{ padding: '8px 12px', background: S.surface2, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font }}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                    <button
                      onClick={() => navigate(`/masters/programs/${app.masters_program_id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: ACCENT, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: S.font }}
                    >
                      View program <ExternalLink size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MastersApplications;
