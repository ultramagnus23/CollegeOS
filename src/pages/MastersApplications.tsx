// src/pages/MastersApplications.tsx — Dark Editorial, mirrors MastersDeadlines structure.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, ExternalLink, ChevronDown, ChevronUp, Plus, Trash2, Link as LinkIcon } from 'lucide-react';
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
  application_portal_link: string | null;
  application_fee: number | null;
  application_fee_currency: string | null;
}

interface AppDocument {
  id: number;
  document_type: string;
  status: string;
  notes: string | null;
}

interface AppRecommender {
  id: number;
  recommender_id: number;
  status: string;
  name: string;
  email: string | null;
  relationship: string | null;
}

interface Recommender {
  id: number;
  name: string;
  relationship?: string;
}

const DOC_STATUSES = ['not_started', 'in_progress', 'completed', 'not_applicable'];
const REC_STATUSES = ['not_requested', 'requested', 'in_progress', 'completed', 'declined'];
const DOC_STATUS_STYLE: Record<string, { color: string }> = {
  not_started: { color: '#94A3B8' },
  in_progress: { color: '#3B9EFF' },
  completed: { color: '#10B981' },
  not_applicable: { color: '#64748B' },
  not_requested: { color: '#94A3B8' },
  requested: { color: '#FBBF24' },
  declined: { color: '#F87171' },
};

const MastersApplications: React.FC = () => {
  const navigate = useNavigate();
  const [apps, setApps] = useState<MastersApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [docsByApp, setDocsByApp] = useState<Record<number, AppDocument[]>>({});
  const [recsByApp, setRecsByApp] = useState<Record<number, AppRecommender[]>>({});
  const [allRecommenders, setAllRecommenders] = useState<Recommender[]>([]);
  const [newDocType, setNewDocType] = useState('');
  const [newRecId, setNewRecId] = useState('');
  const [portalLinkDraft, setPortalLinkDraft] = useState('');
  const [feeDraft, setFeeDraft] = useState('');

  useEffect(() => { load(); }, []);

  const toggleExpand = async (app: MastersApplication) => {
    if (expandedId === app.id) { setExpandedId(null); return; }
    setExpandedId(app.id);
    setPortalLinkDraft(app.application_portal_link || '');
    setFeeDraft(app.application_fee != null ? String(app.application_fee) : '');
    try {
      const [docsRes, recsRes, allRecsRes] = await Promise.all([
        api.masters.listApplicationDocuments(app.id),
        api.masters.listApplicationRecommenders(app.id),
        allRecommenders.length ? Promise.resolve(null) : api.recommenders.getAll(),
      ]);
      setDocsByApp((prev) => ({ ...prev, [app.id]: (docsRes as any)?.data || [] }));
      setRecsByApp((prev) => ({ ...prev, [app.id]: (recsRes as any)?.data || [] }));
      if (allRecsRes) setAllRecommenders((allRecsRes as any)?.data || []);
    } catch {
      toast.error('Failed to load application details');
    }
  };

  const saveMeta = async (app: MastersApplication) => {
    try {
      await api.masters.updateApplication(app.id, {
        applicationPortalLink: portalLinkDraft || undefined,
        applicationFee: feeDraft ? Number(feeDraft) : undefined,
      });
      setApps((prev) => prev.map((a) => (a.id === app.id
        ? { ...a, application_portal_link: portalLinkDraft, application_fee: feeDraft ? Number(feeDraft) : a.application_fee }
        : a)));
      toast.success('Saved');
    } catch { toast.error('Could not save'); }
  };

  const addDocument = async (appId: number) => {
    if (!newDocType.trim()) return;
    try {
      const res = await api.masters.addApplicationDocument(appId, { documentType: newDocType.trim() });
      setDocsByApp((prev) => ({ ...prev, [appId]: [...(prev[appId] || []), (res as any).data] }));
      setNewDocType('');
    } catch { toast.error('Could not add document'); }
  };

  const cycleDocStatus = async (appId: number, doc: AppDocument) => {
    const next = DOC_STATUSES[(DOC_STATUSES.indexOf(doc.status) + 1) % DOC_STATUSES.length];
    try {
      await api.masters.updateApplicationDocument(appId, doc.id, { status: next });
      setDocsByApp((prev) => ({ ...prev, [appId]: prev[appId].map((d) => (d.id === doc.id ? { ...d, status: next } : d)) }));
    } catch { toast.error('Could not update document'); }
  };

  const removeDocument = async (appId: number, docId: number) => {
    try {
      await api.masters.deleteApplicationDocument(appId, docId);
      setDocsByApp((prev) => ({ ...prev, [appId]: prev[appId].filter((d) => d.id !== docId) }));
    } catch { toast.error('Could not remove document'); }
  };

  const addRecommender = async (appId: number) => {
    if (!newRecId) return;
    try {
      const res = await api.masters.addApplicationRecommender(appId, { recommenderId: Number(newRecId) });
      const rec = allRecommenders.find((r) => r.id === Number(newRecId));
      setRecsByApp((prev) => ({
        ...prev,
        [appId]: [...(prev[appId] || []), { ...(res as any).data, name: rec?.name || 'Recommender' }],
      }));
      setNewRecId('');
    } catch { toast.error('Could not add recommender'); }
  };

  const cycleRecStatus = async (appId: number, rec: AppRecommender) => {
    const next = REC_STATUSES[(REC_STATUSES.indexOf(rec.status) + 1) % REC_STATUSES.length];
    try {
      await api.masters.updateApplicationRecommender(appId, rec.id, { status: next });
      setRecsByApp((prev) => ({ ...prev, [appId]: prev[appId].map((r) => (r.id === rec.id ? { ...r, status: next } : r)) }));
    } catch { toast.error('Could not update recommender'); }
  };

  const removeRecommender = async (appId: number, recId: number) => {
    try {
      await api.masters.deleteApplicationRecommender(appId, recId);
      setRecsByApp((prev) => ({ ...prev, [appId]: prev[appId].filter((r) => r.id !== recId) }));
    } catch { toast.error('Could not remove recommender'); }
  };

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
                    <button
                      onClick={() => toggleExpand(app)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, padding: '7px 10px', color: S.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: S.font }}
                    >
                      Documents &amp; recommenders {expandedId === app.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                  </div>

                  {expandedId === app.id && (
                    <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${S.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      {/* Portal link + fee */}
                      <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        <LinkIcon size={14} style={{ color: S.dim }} />
                        <input
                          value={portalLinkDraft}
                          onChange={(e) => setPortalLinkDraft(e.target.value)}
                          onBlur={() => saveMeta(app)}
                          placeholder="Application portal link"
                          style={{ flex: 1, minWidth: 220, padding: '7px 10px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, fontFamily: S.font }}
                        />
                        <input
                          value={feeDraft}
                          onChange={(e) => setFeeDraft(e.target.value)}
                          onBlur={() => saveMeta(app)}
                          placeholder="Fee"
                          type="number"
                          style={{ width: 90, padding: '7px 10px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, fontFamily: S.font }}
                        />
                      </div>

                      {/* Documents */}
                      <div>
                        <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 10 }}>Documents</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {(docsByApp[app.id] || []).map((doc) => (
                            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', background: S.surface2, borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: S.text }}>{doc.document_type}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  onClick={() => cycleDocStatus(app.id, doc)}
                                  style={{ fontSize: 10, fontWeight: 700, color: DOC_STATUS_STYLE[doc.status]?.color, background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}
                                >
                                  {doc.status.replace(/_/g, ' ')}
                                </button>
                                <button onClick={() => removeDocument(app.id, doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, display: 'flex' }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {!(docsByApp[app.id] || []).length && <div style={{ fontSize: 12, color: S.dim }}>No documents tracked yet.</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            value={newDocType}
                            onChange={(e) => setNewDocType(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addDocument(app.id)}
                            placeholder="e.g. SOP, Transcript, Resume"
                            style={{ flex: 1, padding: '7px 10px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, fontFamily: S.font }}
                          />
                          <button onClick={() => addDocument(app.id)} style={{ padding: '7px 10px', background: h2r(ACCENT, 0.15), border: 'none', borderRadius: 8, color: ACCENT, cursor: 'pointer', display: 'flex' }}>
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Recommenders */}
                      <div>
                        <div style={{ fontSize: 11, color: S.dim, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 10 }}>Recommenders</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {(recsByApp[app.id] || []).map((rec) => (
                            <div key={rec.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', background: S.surface2, borderRadius: 8 }}>
                              <span style={{ fontSize: 12, color: S.text }}>{rec.name}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button
                                  onClick={() => cycleRecStatus(app.id, rec)}
                                  style={{ fontSize: 10, fontWeight: 700, color: DOC_STATUS_STYLE[rec.status]?.color, background: 'none', border: 'none', cursor: 'pointer', textTransform: 'capitalize' }}
                                >
                                  {rec.status.replace(/_/g, ' ')}
                                </button>
                                <button onClick={() => removeRecommender(app.id, rec.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.dim, display: 'flex' }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                          {!(recsByApp[app.id] || []).length && <div style={{ fontSize: 12, color: S.dim }}>No recommenders linked yet.</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <select
                            value={newRecId}
                            onChange={(e) => setNewRecId(e.target.value)}
                            style={{ flex: 1, padding: '7px 10px', background: S.surface2, border: `1px solid ${S.border}`, borderRadius: 8, color: S.text, fontSize: 12, fontFamily: S.font }}
                          >
                            <option value="">Select recommender…</option>
                            {allRecommenders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          <button onClick={() => addRecommender(app.id)} style={{ padding: '7px 10px', background: h2r(ACCENT, 0.15), border: 'none', borderRadius: 8, color: ACCENT, cursor: 'pointer', display: 'flex' }}>
                            <Plus size={14} />
                          </button>
                        </div>
                        {!allRecommenders.length && (
                          <div style={{ fontSize: 11, color: S.dim, marginTop: 6 }}>
                            No recommenders yet. Add one from <button onClick={() => navigate('/recommenders')} style={{ background: 'none', border: 'none', color: ACCENT, cursor: 'pointer', fontSize: 11, padding: 0 }}>Recommenders</button>.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
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
