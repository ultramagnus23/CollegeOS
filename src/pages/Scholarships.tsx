// src/pages/Scholarships.tsx — Dark Editorial Redesign with Tabs
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Scholarship {
  id: number; name: string; provider: string; country: string;
  amount: string; amount_min?: number; amount_max?: number; currency: string;
  deadline?: string; eligibility?: string; nationality_requirements: string[];
  academic_requirements: string[]; need_based: number; merit_based: number;
  description?: string; application_url?: string; is_renewable: number; renewal_criteria?: string;
}
interface TrackedScholarship {
  id: number; scholarship_id: number; status: string; notes?: string;
  name: string; provider: string; country: string; amount: string; deadline?: string;
}
interface Grant { id: number; name: string; provider: string; provider_type?: string; award_amount_inr?: number; deadline?: string; status?: string; }
interface GovernmentLoan { id: number; bank_name?: string; scheme_name?: string; max_loan_amount_inr?: number; interest_rate?: number; csis_subsidy?: boolean; provider?: string; status?: string; }
interface PrivateLoan { id: number; lender_name?: string; max_amount?: number; interest_rate_min?: number; interest_rate_max?: number; cosigner_required?: boolean; provider?: string; status?: string; }

type Tab = 'scholarships' | 'grants' | 'government' | 'private' | 'college';

/* ─── Design ─────────────────────────────────────────────────────────── */
const ACCENT = '#A855F7';
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
  font: "'DM Sans',sans-serif",
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Deadline helpers ─────────────────────────────────────────────────── */
const deadlinePill = (deadline?: string) => {
  if (!deadline) return { label: 'Unknown', color: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.07)', border: 'rgba(255,255,255,0.1)' };
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0)  return { label: 'Overdue', color: '#F87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' };
  if (days < 30) return { label: `${days}d left`, color: '#FB923C', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.25)' };
  if (days < 60) return { label: `${days}d left`, color: '#FBBF24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' };
  return             { label: `${days}d left`, color: '#10B981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)'  };
};

const Scholarships: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('scholarships');
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [trackedIds, setTrackedIds] = useState<Set<number>>(new Set());
  const [grants, setGrants] = useState<Grant[]>([]);
  const [govLoans, setGovLoans] = useState<GovernmentLoan[]>([]);
  const [privLoans, setPrivLoans] = useState<PrivateLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [matchScores, setMatchScores] = useState<Record<number, number>>({});
  const [matchLoading, setMatchLoading] = useState(false);
  const [trackingId, setTrackingId] = useState<number | null>(null);

  useEffect(() => { loadScholarships(); }, [searchTerm]);
  useEffect(() => { if (activeTab === 'grants') loadGrants(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'government') loadGovLoans(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'private') loadPrivLoans(); }, [activeTab]);

  const loadScholarships = async () => {
    setLoading(true);
    try {
      const [schRes, trackedRes] = await Promise.all([
        api.scholarships.search({ search: searchTerm || undefined }),
        api.scholarships.getUserTracked(),
      ]) as [any, any];
      setScholarships(schRes.data || []);
      const ids = new Set<number>((trackedRes.data || []).map((t: TrackedScholarship) => t.scholarship_id));
      setTrackedIds(ids);
    } catch { toast.error('Failed to load scholarships'); }
    finally { setLoading(false); }
  };

  const loadGrants = async () => {
    try {
      const res = await (api.scholarships as any).getGrants() as any;
      setGrants(res.data || []);
    } catch { setGrants([]); }
  };
  const loadGovLoans = async () => {
    try {
      const res = await (api.scholarships as any).getGovernmentLoans() as any;
      setGovLoans(res.data || []);
    } catch { setGovLoans([]); }
  };
  const loadPrivLoans = async () => {
    try {
      const res = await (api.scholarships as any).getPrivateLoans() as any;
      setPrivLoans(res.data || []);
    } catch { setPrivLoans([]); }
  };

  const handleTrack = async (id: number) => {
    setTrackingId(id);
    try {
      await api.scholarships.track(id, 'interested');
      setTrackedIds(prev => new Set([...prev, id]));
      toast.success('Scholarship tracked!');
    } catch { toast.error('Failed to track scholarship'); }
    finally { setTrackingId(null); }
  };

  const handleMatch = async () => {
    setMatchLoading(true);
    try {
      const res = await api.scholarships.match() as any;
      const scores: Record<number, number> = {};
      (res.data || []).forEach((m: any) => { scores[m.id] = m.match_score ?? m.score ?? 0; });
      setMatchScores(scores);
      toast.success('Match scores updated!');
    } catch { toast.error('Failed to run matching'); }
    finally { setMatchLoading(false); }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: 'scholarships', label: 'Scholarships' },
    { id: 'grants', label: 'Grants' },
    { id: 'government', label: 'Government Loans' },
    { id: 'private', label: 'Private Loans' },
    { id: 'college', label: 'College Aid' },
  ];

  const pagedScholarships = scholarships.slice(0, page * 10);

  return (
    <div style={{ minHeight: '100vh', background: S.bg, padding: '32px 24px', fontFamily: S.font }}>
      <style>{GLOBAL}</style>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font, marginBottom: 6 }}>Financial Aid</h1>
          <p style={{ fontSize: 14, color: S.muted }}>
            Based on your profile, you qualify for <strong style={{ color: 'var(--color-text-primary)' }}>{scholarships.length}</strong> scholarships and funding options.
          </p>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: `1px solid ${S.border}`, paddingBottom: 0, overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 700, fontFamily: S.font, cursor: 'pointer', border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${ACCENT}` : '2px solid transparent',
              background: 'transparent', color: activeTab === tab.id ? ACCENT : S.muted,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}>{tab.label}</button>
          ))}
        </div>

        {/* Scholarships Tab */}
        {activeTab === 'scholarships' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <input
                placeholder="Search scholarships…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  flex: 1, minWidth: 200, padding: '10px 14px', background: S.surface2,
                  border: `1px solid ${S.border2}`, borderRadius: 10,
                  color: 'var(--color-text-primary)', fontSize: 14, fontFamily: S.font,
                }}
              />
              <button onClick={handleMatch} disabled={matchLoading} style={{
                padding: '10px 18px', background: h2r(ACCENT, 0.15), border: `1px solid ${h2r(ACCENT, 0.3)}`,
                borderRadius: 10, color: ACCENT, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font,
              }}>
                {matchLoading ? '…' : '✦ Run Match'}
              </button>
            </div>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${S.border2}`, borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : scholarships.length === 0 ? (
              <EmptyState icon="🎓" title="No scholarships found" desc="Try a different search or broaden your filters." />
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {pagedScholarships.map((s, i) => {
                    const dp = deadlinePill(s.deadline);
                    const score = matchScores[s.id];
                    const tracked = trackedIds.has(s.id);
                    return (
                      <div key={s.id} style={{
                        background: S.surface, border: `1px solid ${S.border}`,
                        borderLeft: `3px solid ${ACCENT}`, borderRadius: 16, padding: '18px 22px',
                        animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 0.04}s`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{s.name}</h3>
                              {score !== undefined && (
                                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(ACCENT, 0.15), color: ACCENT, fontWeight: 700 }}>
                                  {Math.round(score * 100)}% match
                                </span>
                              )}
                            </div>
                            <p style={{ fontSize: 13, color: S.muted, marginBottom: 10 }}>{s.provider} · {s.country}</p>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 700 }}>{s.amount} {s.currency}</span>
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: dp.bg, color: dp.color, border: `1px solid ${dp.border}`, fontWeight: 600 }}>
                                {dp.label}
                              </span>
                              {s.need_based === 1 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(59,158,255,0.12)', color: '#3B9EFF', fontWeight: 600 }}>Need-based</span>}
                              {s.merit_based === 1 && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}>Merit-based</span>}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
                            {s.application_url && (
                              <button onClick={() => window.open(s.application_url, '_blank')} style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'rgba(255,255,255,0.06)', border: `1px solid ${S.border2}`, color: S.muted, fontFamily: S.font }}>
                                ↗ Apply
                              </button>
                            )}
                            <button onClick={() => !tracked && handleTrack(s.id)} disabled={tracked || trackingId === s.id} style={{
                              padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: tracked ? 'default' : 'pointer',
                              background: tracked ? 'rgba(16,185,129,0.12)' : h2r(ACCENT, 0.15),
                              border: `1px solid ${tracked ? 'rgba(16,185,129,0.3)' : h2r(ACCENT, 0.3)}`,
                              color: tracked ? '#10B981' : ACCENT, fontFamily: S.font,
                            }}>
                              {tracked ? '✓ Tracked' : trackingId === s.id ? '…' : '+ Track'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {pagedScholarships.length < scholarships.length && (
                  <button onClick={() => setPage(p => p + 1)} style={{
                    marginTop: 20, width: '100%', padding: '12px', background: S.surface2,
                    border: `1px solid ${S.border2}`, borderRadius: 12, color: S.muted,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: S.font,
                  }}>
                    Load More ({scholarships.length - pagedScholarships.length} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Grants Tab */}
        {activeTab === 'grants' && (
          <div>
            {grants.length === 0 ? (
              <EmptyState icon="💰" title="No grants available" desc="Grant data will appear here once available." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {grants.map((g, i) => (
                  <div key={g.id} style={{
                    background: S.surface, border: `1px solid ${S.border}`, borderLeft: '3px solid #3B9EFF',
                    borderRadius: 16, padding: '18px 22px', animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 0.04}s`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{g.name}</h3>
                      {g.provider_type && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(59,158,255,0.12)', color: '#3B9EFF', fontWeight: 600 }}>{g.provider_type}</span>
                      )}
                    </div>
                    <p style={{ fontSize: 13, color: S.muted, marginBottom: 10 }}>{g.provider}</p>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {g.award_amount_inr && <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 700 }}>₹{g.award_amount_inr.toLocaleString('en-IN')} / year</span>}
                      {g.deadline && <span style={{ fontSize: 12, color: S.dim }}>Deadline: {new Date(g.deadline).toLocaleDateString()}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Government Loans Tab */}
        {activeTab === 'government' && (
          <div>
            {govLoans.length === 0 ? (
              <EmptyState icon="🏛️" title="No government loans available" desc="Government loan data will appear here once available." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {govLoans.map((l, i) => (
                  <div key={l.id} style={{
                    background: S.surface, border: `1px solid ${S.border}`, borderLeft: '3px solid #10B981',
                    borderRadius: 16, padding: '18px 22px', animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 0.04}s`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{l.bank_name || l.provider || 'Bank'}</h3>
                      {l.csis_subsidy && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.12)', color: '#10B981', fontWeight: 600 }}>CSIS Subsidy</span>
                      )}
                    </div>
                    {l.scheme_name && <p style={{ fontSize: 13, color: S.muted, marginBottom: 10 }}>{l.scheme_name}</p>}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {l.max_loan_amount_inr && <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 700 }}>Max: ₹{l.max_loan_amount_inr.toLocaleString('en-IN')}</span>}
                      {l.interest_rate && <span style={{ fontSize: 13, color: S.muted }}>Rate: {l.interest_rate}%</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Private Loans Tab */}
        {activeTab === 'private' && (
          <div>
            {privLoans.length === 0 ? (
              <EmptyState icon="🏦" title="No private loans available" desc="Private loan data will appear here once available." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {privLoans.map((l, i) => (
                  <div key={l.id} style={{
                    background: S.surface, border: `1px solid ${S.border}`, borderLeft: '3px solid #FBBF24',
                    borderRadius: 16, padding: '18px 22px', animation: 'fadeUp 0.3s ease both', animationDelay: `${i * 0.04}s`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{l.lender_name || l.provider || 'Lender'}</h3>
                      {l.cosigner_required && (
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: 'rgba(251,191,36,0.12)', color: '#FBBF24', fontWeight: 600 }}>Co-signer Required</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {l.max_amount && <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 700 }}>Max: ${l.max_amount.toLocaleString()}</span>}
                      {(l.interest_rate_min || l.interest_rate_max) && (
                        <span style={{ fontSize: 13, color: S.muted }}>
                          Rate: {l.interest_rate_min ?? '?'}%–{l.interest_rate_max ?? '?'}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* College Aid Tab */}
        {activeTab === 'college' && (
          <EmptyState icon="🏫" title="College Aid" desc="Select a college to view its institutional aid options. This feature is coming soon." />
        )}

      </div>
    </div>
  );
};

/* ─── Shared empty state ──────────────────────────────────────────────── */
const EmptyState: React.FC<{ icon: string; title: string; desc: string }> = ({ icon, title, desc }) => (
  <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '64px 24px', textAlign: 'center', animation: 'fadeUp 0.3s ease both' }}>
    <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
    <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 8 }}>{title}</h3>
    <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{desc}</p>
  </div>
);

export default Scholarships;
