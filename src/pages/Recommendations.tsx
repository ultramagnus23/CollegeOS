// src/pages/Recommendations.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Recommender {
  id: number; name: string; email?: string; phone?: string; type: string;
  relationship?: string; subject?: string; institution?: string;
  years_known?: number; notes?: string; letters_submitted?: number; total_requests?: number;
}
interface RecommendationRequest {
  id: number; recommender_id: number; recommender_name: string; recommender_email?: string;
  recommender_type: string; college_id?: number; college_name?: string;
  application_system?: string; status: string; request_date?: string; deadline?: string;
  submitted_date?: string; reminder_sent?: number; thank_you_sent?: number; notes?: string;
}
interface Summary {
  total_requests: number; not_requested: number; requested: number; in_progress: number;
  submitted: number; declined: number; overdue: number; needs_thank_you: number;
  overdueRequests: RecommendationRequest[]; pendingReminders: RecommendationRequest[];
}

/* ─── Design ─────────────────────────────────────────────────────────── */
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};
const ACCENT = '#F59E0B'; // gold — recommendation/trust theme
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
const inp: React.CSSProperties = { width:'100%', padding:'10px 14px', background:S.surface2, border:`1px solid ${S.border2}`, borderRadius:10, color:'var(--color-text-primary)', fontSize:14, fontFamily:S.font };
const lbl: React.CSSProperties = { fontSize:11, color:S.dim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, fontWeight:600, display:'block', fontFamily:S.font };

const REC_TYPES: Record<string,{emoji:string;label:string;color:string}> = {
  teacher:   { emoji:'🏫', label:'Teacher',   color:'#3B9EFF' },
  counselor: { emoji:'🧭', label:'Counselor', color:'#10B981' },
  mentor:    { emoji:'⭐', label:'Mentor',    color:'#A855F7' },
  employer:  { emoji:'💼', label:'Employer',  color:'#F97316' },
  other:     { emoji:'👤', label:'Other',     color:S.dim },
};

const STATUS_CFG: Record<string,{label:string;color:string;bg:string}> = {
  not_requested: { label:'Not Requested', color:S.dim, bg:'rgba(255,255,255,0.06)' },
  requested:     { label:'Requested',     color:'#FBBF24', bg:'rgba(251,191,36,0.12)' },
  in_progress:   { label:'In Progress',   color:'#3B9EFF', bg:'rgba(59,158,255,0.12)' },
  submitted:     { label:'Submitted',     color:'#10B981', bg:'rgba(16,185,129,0.12)' },
  declined:      { label:'Declined',      color:'#F87171', bg:'rgba(248,113,113,0.12)' },
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option{background:#0F0F1C;color:#fff;}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Recommender Card ───────────────────────────────────────────────── */
const RecommenderCard: React.FC<{
  rec: Recommender; index: number;
  onDelete: (id: number) => void;
  onRequest: (rec: Recommender) => void;
}> = ({ rec, index, onDelete, onRequest }) => {
  const type = REC_TYPES[rec.type] || REC_TYPES.other;
  const submitted = rec.letters_submitted || 0;
  const total = rec.total_requests || 0;
  const pct = total > 0 ? (submitted / total) * 100 : 0;

  return (
    <div style={{
      background: S.surface, border: `1px solid ${S.border}`,
      borderTop: `2px solid ${type.color}`,
      borderRadius: 16, padding: '18px 20px',
      animation: 'fadeUp 0.35s ease both', animationDelay: `${index * 0.06}s`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: h2r(type.color, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{type.emoji}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-text-primary)', fontFamily: S.font }}>{rec.name}</div>
            <div style={{ fontSize: 11, padding: '2px 8px', borderRadius: 100, background: h2r(type.color, 0.15), color: type.color, fontWeight: 600, display: 'inline-block', marginTop: 4, fontFamily: S.font }}>{type.label}</div>
          </div>
        </div>
        <button onClick={() => onDelete(rec.id)} style={{
          width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0,
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.15)',
          color: '#F87171', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>🗑</button>
      </div>

      {rec.subject && <div style={{ fontSize: 13, color: S.muted, marginBottom: 4, fontFamily: S.font }}>📚 {rec.subject}</div>}
      {rec.institution && <div style={{ fontSize: 12, color: S.dim, marginBottom: 10, fontFamily: S.font }}>🏛 {rec.institution}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        {rec.email && (
          <a href={`mailto:${rec.email}`} style={{ fontSize: 12, color: '#3B9EFF', fontFamily: S.font, display: 'flex', alignItems: 'center', gap: 4 }}>
            ✉ {rec.email}
          </a>
        )}
        {rec.phone && <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>📞 {rec.phone}</span>}
      </div>

      {/* Letter progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: S.dim, fontFamily: S.font }}>Letters</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981', fontFamily: S.font }}>{submitted}/{total}</span>
        </div>
        <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#10B981', borderRadius: 4, transition: 'width 0.6s ease' }} />
        </div>
      </div>

      <button onClick={() => onRequest(rec)} style={{
        width: '100%', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
        background: h2r(ACCENT, 0.15), border: `1px solid ${h2r(ACCENT, 0.35)}`,
        color: ACCENT, cursor: 'pointer', fontFamily: S.font,
        transition: 'all 0.15s',
      }}
        onMouseEnter={e => (e.currentTarget.style.background = h2r(ACCENT, 0.25))}
        onMouseLeave={e => (e.currentTarget.style.background = h2r(ACCENT, 0.15))}
      >+ New Request</button>
    </div>
  );
};

/* ─── Request Row ────────────────────────────────────────────────────── */
const RequestRow: React.FC<{
  req: RecommendationRequest; index: number;
  onStatusChange: (id: number, s: string) => void;
  onReminder: (req: RecommendationRequest) => void;
  onThankYou: (req: RecommendationRequest) => void;
}> = ({ req, index, onStatusChange, onReminder, onThankYou }) => {
  const status = STATUS_CFG[req.status] || STATUS_CFG.not_requested;
  const isOverdue = req.deadline && new Date(req.deadline) < new Date() && req.status !== 'submitted';
  const days = req.deadline ? Math.ceil((new Date(req.deadline).getTime() - Date.now()) / 86400000) : null;

  return (
    <div style={{
      background: S.surface, border: `1px solid ${isOverdue ? 'rgba(248,113,113,0.3)' : S.border}`,
      borderLeft: `3px solid ${isOverdue ? '#F87171' : status.color}`,
      borderRadius: 14, padding: '14px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      animation: 'fadeUp 0.3s ease both', animationDelay: `${index * 0.04}s`,
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: S.font }}>{req.recommender_name}</span>
          <span style={{ fontSize: 12, color: S.dim, fontFamily: S.font }}>for</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#3B9EFF', fontFamily: S.font }}>{req.college_name || 'General'}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {req.application_system && (
            <span style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(255,255,255,0.07)', borderRadius: 6, color: S.dim, fontFamily: S.font }}>{req.application_system}</span>
          )}
          {days !== null && req.status !== 'submitted' && (
            <span style={{ fontSize: 12, color: isOverdue ? '#F87171' : days <= 7 ? '#FBBF24' : S.dim, fontFamily: S.font }}>
              {isOverdue ? `⚠ Overdue ${Math.abs(days)}d` : days === 0 ? '⚡ Due today' : `📅 ${days}d left`}
            </span>
          )}
          {req.submitted_date && (
            <span style={{ fontSize: 12, color: '#10B981', fontFamily: S.font }}>✓ {new Date(req.submitted_date).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={req.status} onChange={e => onStatusChange(req.id, e.target.value)} style={{
          padding: '5px 10px', borderRadius: 100, fontSize: 11, fontWeight: 600,
          background: status.bg, border: `1px solid ${h2r(status.color, 0.4)}`,
          color: status.color, cursor: 'pointer', fontFamily: S.font,
        }}>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {req.status === 'requested' && (
          <button onClick={() => onReminder(req)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: h2r(ACCENT, 0.15), border: `1px solid ${h2r(ACCENT, 0.3)}`, color: ACCENT, fontFamily: S.font }}>
            📨 Remind
          </button>
        )}
        {req.status === 'submitted' && !req.thank_you_sent && (
          <button onClick={() => onThankYou(req)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', fontFamily: S.font }}>
            🙏 Thank You
          </button>
        )}
      </div>
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Recommendations = () => {
  const [recommenders, setRecommenders] = useState<Recommender[]>([]);
  const [requests, setRequests] = useState<RecommendationRequest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'recommenders'|'requests'|'templates'>('recommenders');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedRecommender, setSelectedRecommender] = useState<Recommender | null>(null);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [form, setForm] = useState({ name:'', email:'', phone:'', type:'teacher', relationship:'', subject:'', institution:'', yearsKnown:'', notes:'' });
  const [reqForm, setReqForm] = useState({ collegeName:'', applicationSystem:'CommonApp', deadline:'', notes:'' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [rr, reqR, sr] = await Promise.all([
        api.recommenders.getAll(),
        api.recommenders.requests.getAll(),
        api.recommenders.getSummary(),
      ]) as [any,any,any];
      setRecommenders(rr.data||[]);
      setRequests(reqR.data||[]);
      setSummary(sr.data||null);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const handleAddRecommender = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    try {
      await api.recommenders.create({ ...form, yearsKnown: form.yearsKnown ? parseInt(form.yearsKnown) : undefined });
      toast.success('Recommender added');
      setShowAddForm(false);
      setForm({ name:'', email:'', phone:'', type:'teacher', relationship:'', subject:'', institution:'', yearsKnown:'', notes:'' });
      loadData();
    } catch { toast.error('Failed'); }
  };

  const handleCreateRequest = async () => {
    if (!selectedRecommender) return;
    try {
      await api.recommenders.requests.create(selectedRecommender.id, { ...reqForm, deadline: reqForm.deadline||undefined, status:'not_requested' });
      toast.success('Request created');
      setShowRequestForm(false);
      setSelectedRecommender(null);
      setReqForm({ collegeName:'', applicationSystem:'CommonApp', deadline:'', notes:'' });
      loadData();
    } catch { toast.error('Failed'); }
  };

  const handleGenerateEmail = async (type: 'request'|'reminder'|'thank_you', req?: RecommendationRequest) => {
    try {
      const rec = req ? recommenders.find(r => r.id === req.recommender_id) : selectedRecommender;
      const res = await api.recommenders.generateEmailTemplate(type, {
        recommenderName: rec?.name || 'Teacher',
        collegeName: req?.college_name || reqForm.collegeName || 'the university',
        subject: rec?.subject || 'the subject',
        deadline: req?.deadline || reqForm.deadline || 'soon',
      }) as any;
      setEmailTemplate(res.data?.template || '');
      setActiveTab('templates');
    } catch { toast.error('Failed to generate'); }
  };

  const TABS = [
    { key: 'recommenders', label: `People (${recommenders.length})` },
    { key: 'requests',     label: `Requests (${requests.length})` },
    { key: 'templates',    label: 'Email Templates' },
  ] as const;

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight:'100vh', background:S.bg, color:'var(--color-text-primary)', fontFamily:S.font }}>

        {/* Header */}
        <div style={{ padding:'44px 48px 0', background:`linear-gradient(180deg,${h2r(ACCENT,0.07)} 0%,transparent 100%)`, borderBottom:`1px solid ${S.border}` }}>
          <div style={{ maxWidth:1100, margin:'0 auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingBottom:28, flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:12, color:h2r(ACCENT,0.8), textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10, fontWeight:600 }}>Letters of Rec</div>
                <h1 style={{ fontSize:40, fontWeight:900, letterSpacing:'-0.02em', marginBottom:6 }}>
                  Recom<span style={{ color:ACCENT }}>mendations.</span>
                </h1>
                <p style={{ color:S.muted, fontSize:14 }}>
                  {recommenders.length} recommenders · {summary?.submitted||0} submitted · {summary?.overdue||0} overdue
                </p>
              </div>
              {/* Summary stat pills */}
              <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                {[
                  { label:'People', value:recommenders.length, color:'#3B9EFF' },
                  { label:'Pending', value:summary?.requested||0, color:'#FBBF24' },
                  { label:'Done', value:summary?.submitted||0, color:'#10B981' },
                  { label:'Overdue', value:summary?.overdue||0, color:'#F87171' },
                ].map(s=>(
                  <div key={s.label} style={{ padding:'10px 16px', background:h2r(s.color,0.1), border:`1px solid ${h2r(s.color,0.25)}`, borderRadius:12, textAlign:'center', minWidth:72 }}>
                    <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:S.font }}>{s.value}</div>
                    <div style={{ fontSize:11, color:h2r(s.color,0.7), fontFamily:S.font }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:4 }}>
              {TABS.map(t=>(
                <button key={t.key} onClick={()=>setActiveTab(t.key)} style={{
                  padding:'10px 20px', fontSize:13, fontWeight:activeTab===t.key?700:400,
                  background:'transparent', border:'none', borderBottom:`2px solid ${activeTab===t.key?ACCENT:'transparent'}`,
                  color:activeTab===t.key?ACCENT:S.muted, cursor:'pointer', fontFamily:S.font, transition:'all 0.15s',
                }}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 48px 80px' }}>

          {/* Overdue alert */}
          {(summary?.overdueRequests?.length||0)>0 && (
            <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:14, padding:'14px 18px', marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#F87171', marginBottom:10 }}>⚠ Overdue Recommendations</div>
              {summary!.overdueRequests.map(req=>(
                <div key={req.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
                  <span>{req.recommender_name} → {req.college_name}</span>
                  <button onClick={()=>handleGenerateEmail('reminder',req)} style={{ padding:'4px 12px', background:h2r(ACCENT,0.15), border:`1px solid ${h2r(ACCENT,0.3)}`, borderRadius:8, color:ACCENT, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:S.font }}>Send Reminder</button>
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div style={{ display:'flex', justifyContent:'center', padding:'80px 0' }}>
              <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.08)', borderTopColor:ACCENT, animation:'spin 0.8s linear infinite' }} />
            </div>
          )}

          {/* ── Recommenders Tab ── */}
          {!loading && activeTab==='recommenders' && (
            <>
              <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:20 }}>
                <button onClick={()=>setShowAddForm(f=>!f)} style={{ padding:'10px 22px', background:ACCENT, border:'none', borderRadius:10, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:S.font, boxShadow:`0 0 16px ${h2r(ACCENT,0.35)}` }}>+ Add Recommender</button>
              </div>

              {/* Add form */}
              {showAddForm && (
                <div style={{ background:S.surface, border:`1px solid ${h2r(ACCENT,0.3)}`, borderRadius:16, padding:24, marginBottom:24, animation:'fadeUp 0.25s ease' }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:18, fontFamily:S.font }}>New Recommender</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <div><span style={lbl}>Name *</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Dr. John Smith" style={inp} /></div>
                    <div>
                      <span style={lbl}>Type</span>
                      <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={inp}>
                        {Object.entries(REC_TYPES).map(([k,v])=><option key={k} value={k}>{v.emoji} {v.label}</option>)}
                      </select>
                    </div>
                    <div><span style={lbl}>Email</span><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="teacher@school.edu" style={inp} /></div>
                    <div><span style={lbl}>Phone</span><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="+1 234 567 8900" style={inp} /></div>
                    <div><span style={lbl}>Subject</span><input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="AP Physics" style={inp} /></div>
                    <div><span style={lbl}>Institution</span><input value={form.institution} onChange={e=>setForm({...form,institution:e.target.value})} placeholder="School Name" style={inp} /></div>
                    <div style={{gridColumn:'1/-1'}}><span style={lbl}>Notes</span><textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional notes…" style={{...inp,resize:'none',lineHeight:1.6}} /></div>
                  </div>
                  <div style={{ display:'flex', gap:10, marginTop:18 }}>
                    <button onClick={handleAddRecommender} style={{ padding:'10px 24px', background:ACCENT, border:'none', borderRadius:10, color:'#000', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Add</button>
                    <button onClick={()=>setShowAddForm(false)} style={{ padding:'10px 20px', background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, borderRadius:10, color:S.muted, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Cancel</button>
                  </div>
                </div>
              )}

              {recommenders.length === 0 ? (
                <div style={{ textAlign:'center', padding:'80px 0' }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>👥</div>
                  <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>No recommenders yet</div>
                  <div style={{ color:S.muted, fontSize:14 }}>Add teachers, counselors, or mentors</div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:18 }}>
                  {recommenders.map((rec,i)=>(
                    <RecommenderCard key={rec.id} rec={rec} index={i}
                      onDelete={id=>{if(confirm('Delete recommender and all their requests?')) api.recommenders.delete(id).then(()=>{toast.success('Deleted');loadData();}).catch(()=>toast.error('Failed'));}}
                      onRequest={rec=>{setSelectedRecommender(rec);setShowRequestForm(true);}}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Requests Tab ── */}
          {!loading && activeTab==='requests' && (
            requests.length === 0 ? (
              <div style={{ textAlign:'center', padding:'80px 0' }}>
                <div style={{ fontSize:48, marginBottom:16 }}>✉️</div>
                <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>No requests yet</div>
                <div style={{ color:S.muted, fontSize:14 }}>Go to Recommenders and click + New Request</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {requests.map((req,i)=>(
                  <RequestRow key={req.id} req={req} index={i}
                    onStatusChange={(id,s)=>api.recommenders.requests.update(id,{status:s}).then(()=>{toast.success('Updated');loadData();}).catch(()=>toast.error('Failed'))}
                    onReminder={req=>handleGenerateEmail('reminder',req)}
                    onThankYou={req=>handleGenerateEmail('thank_you',req)}
                  />
                ))}
              </div>
            )
          )}

          {/* ── Templates Tab ── */}
          {!loading && activeTab==='templates' && (
            <div style={{ background:S.surface, border:`1px solid ${S.border}`, borderRadius:16, padding:24 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, flexWrap:'wrap', gap:12 }}>
                <div style={{ fontSize:15, fontWeight:700, fontFamily:S.font }}>AI-Generated Email Templates</div>
                <div style={{ display:'flex', gap:8 }}>
                  {(['request','reminder','thank_you'] as const).map(t=>(
                    <button key={t} onClick={()=>handleGenerateEmail(t)} style={{
                      padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                      background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, color:S.muted, fontFamily:S.font,
                    }}>{{ request:'📨 Request', reminder:'🔔 Reminder', thank_you:'🙏 Thank You' }[t]}</button>
                  ))}
                </div>
              </div>

              {emailTemplate ? (
                <div style={{ position:'relative' }}>
                  <textarea value={emailTemplate} onChange={e=>setEmailTemplate(e.target.value)} rows={15}
                    style={{ ...inp, resize:'vertical', lineHeight:1.7, fontFamily:'monospace', fontSize:13 }} />
                  <button onClick={()=>{navigator.clipboard.writeText(emailTemplate);toast.success('Copied!');}} style={{
                    position:'absolute', top:10, right:10, padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer',
                    background:'rgba(255,255,255,0.1)', border:`1px solid ${S.border2}`, color:S.muted, fontFamily:S.font,
                  }}>📋 Copy</button>
                  <div style={{ fontSize:12, color:S.dim, marginTop:8, fontFamily:S.font }}>Edit as needed, then copy and send via your email client</div>
                </div>
              ) : (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <div style={{ fontSize:40, marginBottom:14 }}>✉️</div>
                  <div style={{ color:S.muted, fontSize:14, fontFamily:S.font }}>Click a template type above to generate</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Request Modal ── */}
      {showRequestForm && selectedRecommender && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50 }}>
          <div style={{ background:S.surface, border:`1px solid ${h2r(ACCENT,0.3)}`, borderRadius:18, padding:28, width:'100%', maxWidth:440, animation:'fadeUp 0.25s ease' }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:20, fontFamily:S.font }}>
              Request from <span style={{ color:ACCENT }}>{selectedRecommender.name}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div><span style={lbl}>College/University</span><input value={reqForm.collegeName} onChange={e=>setReqForm({...reqForm,collegeName:e.target.value})} placeholder="Stanford University" style={inp} /></div>
              <div>
                <span style={lbl}>Application System</span>
                <select value={reqForm.applicationSystem} onChange={e=>setReqForm({...reqForm,applicationSystem:e.target.value})} style={inp}>
                  {['CommonApp','Coalition','UCAS','Direct','Other'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><span style={lbl}>Deadline</span><input type="date" value={reqForm.deadline} onChange={e=>setReqForm({...reqForm,deadline:e.target.value})} style={inp} /></div>
              <div><span style={lbl}>Notes</span><textarea rows={2} value={reqForm.notes} onChange={e=>setReqForm({...reqForm,notes:e.target.value})} placeholder="Any specific requirements…" style={{...inp,resize:'none',lineHeight:1.6}} /></div>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:22 }}>
              <button onClick={()=>handleGenerateEmail('request')} style={{ padding:'9px 16px', background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, borderRadius:10, color:S.muted, fontSize:13, cursor:'pointer', fontFamily:S.font }}>✉ Draft Email</button>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{setShowRequestForm(false);setSelectedRecommender(null);}} style={{ padding:'9px 18px', background:'transparent', border:`1px solid ${S.border2}`, borderRadius:10, color:S.muted, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Cancel</button>
                <button onClick={handleCreateRequest} style={{ padding:'9px 22px', background:ACCENT, border:'none', borderRadius:10, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:S.font }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Recommendations;