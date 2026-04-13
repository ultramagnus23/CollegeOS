// src/pages/FinancialAid.tsx — Financial Aid Intelligence Centre
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { ExternalLink, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

/* ─── Design tokens ──────────────────────────────────────────────── */
const ACCENT = '#6C63FF';
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  bg: 'var(--color-bg-primary)',
  surface: 'var(--color-bg-surface)',
  border: 'var(--color-border)',
  border2: 'var(--color-border-strong)',
  text: 'var(--color-text-primary)',
  muted: 'var(--color-text-secondary)',
  dim: 'var(--color-text-disabled)',
  font: "'Inter', system-ui, sans-serif",
};
const GLOBAL = `
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:var(--color-bg-surface);color:var(--color-text-primary);}
`;

/* ─── Types ──────────────────────────────────────────────────────── */
interface CollegeFinancialProfile {
  college_id: number;
  college_name: string;
  data_freshness: 'verified' | 'estimated' | 'unavailable';
  tuition_out_state_usd?: number;
  total_coa_usd?: number;
  avg_net_price_usd?: number;
  predicted_net_price_usd?: number;
  predicted_net_price_inr?: number;
  net_price_basis?: string;
  predicted_merit_aid_usd?: number;
  predicted_need_aid_usd?: number;
  total_aid_usd?: number;
  net_cost_usd?: number;
  net_cost_inr?: number;
  net_cost_4yr_usd?: number;
  net_cost_4yr_inr?: number;
  net_price_by_income?: Record<string, number | null>;
  median_earnings_6yr?: number;
  median_earnings_10yr?: number;
  loan_default_rate_pct?: number;
  avg_total_debt_usd?: number;
  roi_score?: number;
  accessibility_score?: number;
  need_blind_domestic?: boolean;
  need_blind_international?: boolean;
  meets_full_need?: boolean;
  css_profile_required?: boolean;
  international_aid_available?: boolean;
  international_aid_avg_usd?: number;
  badge?: string;
  badge_roi?: string;
  usd_to_inr?: number;
}

interface Scholarship {
  id: number;
  name: string;
  provider?: string;
  amount_min?: number;
  amount_max?: number;
  scholarship_type?: string;
  deadline_month?: number;
  deadline_day?: number;
  renewable?: boolean;
  description?: string;
  application_url?: string;
  match_score?: number;
  match_reasons?: string[];
}

interface LoanOption {
  id: number;
  name?: string;
  provider?: string;
  amount_max_usd?: number;
  interest_rate_pct?: number;
  collateral_required?: boolean;
  cosigner_required?: boolean;
  moratorium_months?: number;
  repayment_months?: number;
  fit_score?: number;
  fit_reasons?: string[];
  emi_usd?: number;
  emi_inr?: number;
}

/* ─── Helpers ────────────────────────────────────────────────────── */
const fmt$ = (n?: number | null) => n != null ? `$${n.toLocaleString()}` : '—';
const fmtINR = (n?: number | null) => n != null ? `₹${(n / 100000).toFixed(1)}L` : '—';
const fmtPct = (n?: number | null) => n != null ? `${n.toFixed(1)}%` : '—';

const freshnessBadge = (f: string) => {
  if (f === 'verified') return { label: '✓ Live data', color: '#10B981', bg: 'rgba(16,185,129,0.1)' };
  if (f === 'estimated') return { label: '≈ Estimated', color: '#FBBF24', bg: 'rgba(251,191,36,0.1)' };
  return { label: '? Unavailable', color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)' };
};

const BRACKET_LABELS: Record<string, string> = {
  bracket_0_30k:    '$0–30k income',
  bracket_30_48k:   '$30–48k income',
  bracket_48_75k:   '$48–75k income',
  bracket_75_110k:  '$75–110k income',
  bracket_110k_plus:'$110k+ income',
};

/* ─── Sub-components ─────────────────────────────────────────────── */

const CollegeFinCard: React.FC<{ profile: CollegeFinancialProfile; index: number }> = ({ profile, index }) => {
  const [expanded, setExpanded] = useState(false);
  const badge = freshnessBadge(profile.data_freshness);
  const roiGood = profile.roi_score != null && profile.roi_score > 1;

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderTop: `2px solid ${ACCENT}`, borderRadius: 14,
      padding: '20px 22px', marginBottom: 14,
      animation: `fadeUp 0.3s ease both`, animationDelay: `${index * 0.05}s`,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: S.text, fontFamily: S.font }}>{profile.college_name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: badge.bg, color: badge.color, fontFamily: S.font }}>{badge.label}</span>
            {profile.badge && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.12)', color: '#10B981', fontFamily: S.font }}>🏆 {profile.badge}</span>}
            {profile.badge_roi && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: 'rgba(168,85,247,0.12)', color: '#A855F7', fontFamily: S.font }}>📈 {profile.badge_roi}</span>}
          </div>
        </div>
        {profile.accessibility_score != null && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: profile.accessibility_score >= 70 ? '#10B981' : profile.accessibility_score >= 40 ? '#FBBF24' : '#F87171', fontFamily: S.font }}>{profile.accessibility_score}</div>
            <div style={{ fontSize: 9, color: S.dim, fontFamily: S.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Accessibility</div>
          </div>
        )}
      </div>

      {/* Key metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Est. Net Cost/yr', value: fmt$(profile.net_cost_usd), sub: fmtINR(profile.net_cost_inr), highlight: true },
          { label: 'Predicted Aid', value: fmt$(profile.total_aid_usd), sub: profile.predicted_merit_aid_usd ? `Merit: ${fmt$(profile.predicted_merit_aid_usd)}` : undefined },
          { label: 'Total COA', value: fmt$(profile.total_coa_usd || profile.avg_net_price_usd) },
          { label: 'Median Earnings 6yr', value: fmt$(profile.median_earnings_6yr) },
          { label: 'Avg Total Debt', value: fmt$(profile.avg_total_debt_usd), sub: fmtINR(profile.avg_total_debt_usd ? profile.avg_total_debt_usd * (profile.usd_to_inr || 85) : undefined) },
          { label: 'ROI Score', value: profile.roi_score != null ? profile.roi_score.toFixed(2) : '—', colorVal: roiGood ? '#10B981' : '#F87171' },
        ].map((m, i) => (
          <div key={i} style={{ background: h2r(ACCENT, 0.05), borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: S.dim, fontFamily: S.font, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: m.colorVal || (m.highlight ? ACCENT : S.text), fontFamily: S.font }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 10, color: S.muted, fontFamily: S.font }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Policy badges */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {profile.need_blind_international && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontFamily: S.font }}>Need-blind international</span>}
        {profile.meets_full_need && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(168,85,247,0.1)', color: '#A855F7', fontFamily: S.font }}>Meets 100% demonstrated need</span>}
        {profile.international_aid_available && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(59,158,255,0.1)', color: '#3B9EFF', fontFamily: S.font }}>Intl aid available</span>}
        {profile.css_profile_required && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(251,191,36,0.1)', color: '#FBBF24', fontFamily: S.font }}>CSS Profile required</span>}
        {profile.loan_default_rate_pct != null && profile.loan_default_rate_pct < 3 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontFamily: S.font }}>Low default rate ({fmtPct(profile.loan_default_rate_pct)})</span>}
      </div>

      {/* Expand for income bracket table */}
      <button onClick={() => setExpanded(e => !e)} style={{
        width: '100%', padding: '6px', background: 'transparent', border: `1px solid ${S.border}`,
        borderRadius: 8, cursor: 'pointer', color: S.muted, fontFamily: S.font, fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      }}>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {expanded ? 'Hide income brackets' : 'Show net price by income'}
      </button>

      {expanded && profile.net_price_by_income && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, color: S.dim, fontFamily: S.font, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Net Price by Family Income</div>
          {Object.entries(profile.net_price_by_income).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${S.border}`, fontSize: 12, fontFamily: S.font }}>
              <span style={{ color: S.muted }}>{BRACKET_LABELS[key] || key}</span>
              <span style={{ color: val != null ? S.text : S.dim, fontWeight: val != null ? 600 : 400 }}>{val != null ? fmt$(val) : 'Data not available'}</span>
            </div>
          ))}
          {profile.net_price_basis && (
            <div style={{ fontSize: 10, color: S.dim, fontFamily: S.font, marginTop: 8 }}>
              📊 Prediction basis: {profile.net_price_basis}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ScholarshipCard: React.FC<{ s: Scholarship; index: number }> = ({ s, index }) => {
  const now = new Date();
  let deadlineStr = '—';
  let deadlineDays: number | null = null;
  if (s.deadline_month && s.deadline_day) {
    const dl = new Date(now.getFullYear(), s.deadline_month - 1, s.deadline_day);
    if (dl < now) dl.setFullYear(now.getFullYear() + 1);
    deadlineDays = Math.ceil((dl.getTime() - now.getTime()) / 86400000);
    deadlineStr = dl.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const dlColor = deadlineDays == null ? S.dim : deadlineDays <= 30 ? '#F97316' : '#10B981';

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14,
      padding: '18px 20px', animation: `fadeUp 0.3s ease both`, animationDelay: `${index * 0.04}s`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: S.text, fontFamily: S.font }}>{s.name}</div>
          {s.provider && <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{s.provider}</div>}
        </div>
        {s.match_score != null && (
          <div style={{ background: h2r(ACCENT, 0.15), color: ACCENT, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 100, fontFamily: S.font, flexShrink: 0, marginLeft: 8 }}>
            {s.match_score}% match
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {(s.amount_min || s.amount_max) && (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981', fontFamily: S.font }}>
            {s.amount_min === s.amount_max ? fmt$(s.amount_max) : `${fmt$(s.amount_min)}–${fmt$(s.amount_max)}`}
          </span>
        )}
        {s.scholarship_type && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: h2r(ACCENT, 0.1), color: ACCENT, fontFamily: S.font }}>{s.scholarship_type}</span>}
        {s.renewable && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontFamily: S.font }}>Renewable</span>}
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(255,255,255,0.06)', color: dlColor, fontFamily: S.font }}>
          📅 {deadlineStr}{deadlineDays != null ? ` · ${deadlineDays}d` : ''}
        </span>
      </div>

      {s.description && <div style={{ fontSize: 11, color: S.muted, fontFamily: S.font, lineHeight: 1.5, marginBottom: 8 }}>{s.description.slice(0, 160)}{s.description.length > 160 ? '…' : ''}</div>}

      {s.match_reasons && s.match_reasons.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {s.match_reasons.map((r, i) => <div key={i} style={{ fontSize: 10, color: '#10B981', fontFamily: S.font }}>✓ {r}</div>)}
        </div>
      )}

      {s.application_url && (
        <a href={s.application_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: ACCENT, fontFamily: S.font, textDecoration: 'none' }}>
          Apply <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
};

const LoanCard: React.FC<{ loan: LoanOption; index: number }> = ({ loan, index }) => (
  <div style={{
    background: S.surface, border: `1px solid ${S.border}`, borderRadius: 14,
    padding: '18px 20px', animation: `fadeUp 0.3s ease both`, animationDelay: `${index * 0.04}s`,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: S.text, fontFamily: S.font }}>{loan.name || loan.provider}</div>
        {loan.provider && loan.name && <div style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>{loan.provider}</div>}
      </div>
      {loan.fit_score != null && (
        <div style={{ background: h2r(ACCENT, 0.15), color: ACCENT, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 100, fontFamily: S.font }}>{loan.fit_score}/100</div>
      )}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
      {[
        { label: 'Max Amount', value: fmt$(loan.amount_max_usd) },
        { label: 'Interest Rate', value: loan.interest_rate_pct ? `${loan.interest_rate_pct}% p.a.` : 'Varies' },
        { label: 'Monthly EMI', value: loan.emi_usd ? `${fmt$(loan.emi_usd)} / ${fmtINR(loan.emi_inr)}` : '—' },
        { label: 'Repayment', value: loan.repayment_months ? `${loan.repayment_months / 12} years` : '—' },
      ].map((m, i) => (
        <div key={i} style={{ background: h2r(ACCENT, 0.05), borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: S.dim, fontFamily: S.font, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: S.text, fontFamily: S.font, marginTop: 2 }}>{m.value}</div>
        </div>
      ))}
    </div>

    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: loan.fit_reasons?.length ? 8 : 0 }}>
      {!loan.collateral_required && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontFamily: S.font }}>No collateral</span>}
      {!loan.cosigner_required && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(16,185,129,0.1)', color: '#10B981', fontFamily: S.font }}>No cosigner</span>}
      {loan.moratorium_months && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 100, background: 'rgba(59,158,255,0.1)', color: '#3B9EFF', fontFamily: S.font }}>{loan.moratorium_months}mo moratorium</span>}
    </div>

    {loan.fit_reasons && loan.fit_reasons.length > 0 && (
      <div>{loan.fit_reasons.map((r, i) => <div key={i} style={{ fontSize: 10, color: S.muted, fontFamily: S.font }}>• {r}</div>)}</div>
    )}
  </div>
);

/* ─── Tab types ──────────────────────────────────────────────────── */
type Tab = 'colleges' | 'scholarships' | 'loans' | 'international';

const TAB_CONFIG: { key: Tab; label: string; emoji: string }[] = [
  { key: 'colleges', label: 'College Costs', emoji: '🏫' },
  { key: 'scholarships', label: 'Scholarships', emoji: '🎓' },
  { key: 'loans', label: 'Loans & EMI', emoji: '💳' },
  { key: 'international', label: 'Intl Aid', emoji: '🌍' },
];

/* ─── Main ────────────────────────────────────────────────────────── */
const FinancialAid: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('colleges');
  const [summary, setSummary] = useState<CollegeFinancialProfile[]>([]);
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [loans, setLoans] = useState<LoanOption[]>([]);
  const [intlColleges, setIntlColleges] = useState<CollegeFinancialProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [scholarshipSearch, setScholarshipSearch] = useState('');
  const [scholarshipType, setScholarshipType] = useState('');
  const [loanAmount, setLoanAmount] = useState(50000);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.financial.getSummary();
      setSummary(res?.data || []);
      setIntlColleges((res?.data || []).filter((p: CollegeFinancialProfile) => p.international_aid_available || p.need_blind_international || p.meets_full_need));
    } catch (err: any) {
      if (err?.status !== 401) toast.error('Failed to load financial summary');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadScholarships = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.financial.searchScholarships({
        search: scholarshipSearch || undefined,
        limit: 50,
      });
      setScholarships(res?.data || []);
    } catch { toast.error('Failed to load scholarships'); } finally { setLoading(false); }
  }, [scholarshipSearch]);

  const loadLoans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.financial.getLoans(loanAmount);
      setLoans(res?.data || []);
    } catch { toast.error('Failed to load loans'); } finally { setLoading(false); }
  }, [loanAmount]);

  useEffect(() => { if (activeTab === 'colleges' || activeTab === 'international') loadSummary(); }, [activeTab, loadSummary]);
  useEffect(() => { if (activeTab === 'scholarships') loadScholarships(); }, [activeTab, loadScholarships]);
  useEffect(() => { if (activeTab === 'loans') loadLoans(); }, [activeTab, loadLoans]);

  const Spinner = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: `3px solid var(--color-border)`, borderTopColor: ACCENT, animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight: '100vh', background: S.bg, color: S.text, fontFamily: S.font }}>

        {/* Header */}
        <div style={{ padding: '44px 48px 0', background: `linear-gradient(180deg,${h2r(ACCENT,0.07)} 0%,transparent 100%)`, borderBottom: `1px solid ${S.border}` }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ paddingBottom: 28 }}>
              <div style={{ fontSize: 12, color: h2r(ACCENT,0.8), textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, fontWeight: 600 }}>Financial Aid Intelligence</div>
              <h1 style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Your <span style={{ color: ACCENT }}>Financial Aid.</span>
              </h1>
              <p style={{ fontSize: 14, color: S.muted, maxWidth: 520 }}>
                Personalised cost predictions, scholarship matching, and loan recommendations — all based on your profile.
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 2, marginBottom: -1 }}>
              {TAB_CONFIG.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: '10px 20px', background: activeTab === tab.key ? S.surface : 'transparent',
                    border: `1px solid ${activeTab === tab.key ? S.border : 'transparent'}`,
                    borderBottom: activeTab === tab.key ? `1px solid ${S.surface}` : `1px solid ${S.border}`,
                    borderRadius: '10px 10px 0 0', cursor: 'pointer',
                    fontSize: 13, fontWeight: activeTab === tab.key ? 700 : 400,
                    color: activeTab === tab.key ? ACCENT : S.muted,
                    fontFamily: S.font,
                  }}
                >
                  {tab.emoji} {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 48px 80px' }}>

          {/* ── College Costs tab ── */}
          {activeTab === 'colleges' && (
            <>
              {loading ? <Spinner /> : summary.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No colleges in your list yet</div>
                  <div style={{ color: S.muted, fontSize: 13 }}>Add colleges on the Applications page to see personalised cost analysis</div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom: 20, padding: '12px 16px', background: h2r(ACCENT, 0.06), border: `1px solid ${h2r(ACCENT, 0.2)}`, borderRadius: 10, fontSize: 12, color: S.muted, fontFamily: S.font }}>
                    📊 Costs shown are personalised to your income and academic profile. Sorted by estimated net cost (lowest first).
                  </div>
                  {summary.map((p, i) => <CollegeFinCard key={p.college_id} profile={p} index={i} />)}
                </>
              )}
            </>
          )}

          {/* ── Scholarships tab ── */}
          {activeTab === 'scholarships' && (
            <>
              {/* Filter bar */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                <input
                  value={scholarshipSearch}
                  onChange={e => setScholarshipSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadScholarships()}
                  placeholder="Search scholarships…"
                  style={{ flex: 1, minWidth: 200, padding: '10px 14px', background: S.surface, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font, outline: 'none' }}
                />
                <button onClick={loadScholarships} style={{ padding: '10px 20px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}>Search</button>
              </div>
              {loading ? <Spinner /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                  {scholarships.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: S.muted, fontSize: 14 }}>No scholarships found</div>
                  ) : (
                    scholarships.map((s, i) => <ScholarshipCard key={s.id} s={s} index={i} />)
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Loans tab ── */}
          {activeTab === 'loans' && (
            <>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: S.muted, fontFamily: S.font }}>Loan amount needed:</div>
                <input
                  type="number"
                  value={loanAmount}
                  onChange={e => setLoanAmount(Number(e.target.value))}
                  min={1000} step={1000}
                  style={{ width: 120, padding: '8px 12px', background: S.surface, border: `1px solid ${S.border2}`, borderRadius: 10, color: S.text, fontSize: 13, fontFamily: S.font, outline: 'none' }}
                />
                <div style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>USD</div>
                <button onClick={loadLoans} style={{ padding: '8px 18px', background: ACCENT, border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: S.font }}>Calculate EMI</button>
              </div>
              {loading ? <Spinner /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                  {loans.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', color: S.muted, fontSize: 14 }}>No loan options found</div>
                  ) : (
                    loans.map((l, i) => <LoanCard key={l.id} loan={l} index={i} />)
                  )}
                </div>
              )}
            </>
          )}

          {/* ── International Aid tab ── */}
          {activeTab === 'international' && (
            <>
              <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(59,158,255,0.06)', border: '1px solid rgba(59,158,255,0.2)', borderRadius: 10, fontSize: 12, color: S.muted, fontFamily: S.font }}>
                🌍 Showing colleges in your list that offer international financial aid, need-blind admissions, or meet full demonstrated need.
              </div>
              {loading ? <Spinner /> : intlColleges.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🌍</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: S.text }}>No international aid data yet</div>
                  <div style={{ color: S.muted, fontSize: 13 }}>Add colleges to your list — ones with international aid will appear here</div>
                </div>
              ) : (
                intlColleges.map((p, i) => <CollegeFinCard key={p.college_id} profile={p} index={i} />)
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
};

export default FinancialAid;
