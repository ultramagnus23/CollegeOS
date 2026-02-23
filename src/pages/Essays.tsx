// src/pages/Essays.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { WordCountTracker } from '@/components/WordCountTracker';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Application { id: number; college_name: string; status: string; }
interface Essay {
  id: number; application_id: number; college_name: string; essay_type: string;
  prompt: string; word_limit?: number; google_drive_link?: string;
  status: string; notes?: string; last_edited_at?: string;
}
interface EssayFormData { applicationId:string; essayType:string; prompt:string; wordLimit:string; googleDriveLink:string; notes:string; }

/* ─── Design ─────────────────────────────────────────────────────────── */
const h2r = (hex:string,a:number) => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };
const ACCENT = '#A855F7';
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

const STATUS_CFG: Record<string,{label:string,color:string,bg:string}> = {
  not_started:    { label:'Not Started',    color:S.dim, bg:'rgba(255,255,255,0.07)' },
  in_progress:    { label:'In Progress',    color:'#FBBF24', bg:'rgba(251,191,36,0.12)' },
  draft_complete: { label:'Draft Complete', color:'#3B9EFF', bg:'rgba(59,158,255,0.12)' },
  final:          { label:'Final',          color:'#10B981', bg:'rgba(16,185,129,0.12)' },
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder,textarea::placeholder{color:var(--color-text-disabled)!important;}
  select option,option{background:var(--color-bg-surface);color:var(--color-text-primary);}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Essay Card ─────────────────────────────────────────────────────── */
const EssayCard: React.FC<{
  essay: Essay; index: number;
  onStatusChange: (id:number, s:string) => void;
  onDelete: (id:number) => void;
}> = ({ essay, index, onStatusChange, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState('');
  const status = STATUS_CFG[essay.status] || STATUS_CFG.not_started;

  const progressPct = {
    not_started:0, in_progress:33, draft_complete:66, final:100,
  }[essay.status] ?? 0;

  return (
    <div style={{
      background: S.surface, border:`1px solid ${S.border}`,
      borderLeft:`3px solid ${status.color}`,
      borderRadius:16, overflow:'hidden',
      animation:'fadeUp 0.35s ease both', animationDelay:`${index*0.06}s`,
      transition:'border-color 0.2s',
    }}>
      {/* Progress bar */}
      <div style={{ height:2, background:'rgba(255,255,255,0.06)' }}>
        <div style={{ width:`${progressPct}%`, height:'100%', background:status.color, transition:'width 0.6s ease' }} />
      </div>

      <div style={{ padding:'20px 22px' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:6 }}>
              <h3 style={{ fontSize:17, fontWeight:800, color:'var(--color-text-primary)', fontFamily:S.font }}>{essay.college_name}</h3>
              <span style={{ fontSize:11, padding:'2px 8px', borderRadius:100, background:h2r(ACCENT,0.15), color:ACCENT, fontWeight:600, fontFamily:S.font }}>
                {essay.essay_type.replace(/_/g,' ')}
              </span>
            </div>
            {/* Status selector as pills */}
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {Object.entries(STATUS_CFG).map(([key,cfg]) => (
                <button key={key} onClick={() => onStatusChange(essay.id, key)} style={{
                  padding:'4px 12px', borderRadius:100, fontSize:11, fontWeight:essay.status===key?700:400,
                  background:essay.status===key ? cfg.bg : 'transparent',
                  border:`1px solid ${essay.status===key ? cfg.color : 'rgba(255,255,255,0.1)'}`,
                  color:essay.status===key ? cfg.color : S.dim,
                  cursor:'pointer', fontFamily:S.font, transition:'all 0.12s',
                }}>{cfg.label}</button>
              ))}
            </div>
          </div>
          <button onClick={() => onDelete(essay.id)} style={{
            width:32, height:32, borderRadius:8, cursor:'pointer', flexShrink:0, marginLeft:12,
            background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.2)',
            color:'#F87171', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center',
          }}
            onMouseEnter={e=>(e.currentTarget.style.background='rgba(248,113,113,0.2)')}
            onMouseLeave={e=>(e.currentTarget.style.background='rgba(248,113,113,0.1)')}
          >🗑</button>
        </div>

        {/* Prompt */}
        <div style={{
          padding:'14px 16px', background:'rgba(255,255,255,0.04)', borderRadius:10,
          marginBottom:14, borderLeft:`2px solid ${h2r(ACCENT,0.4)}`,
        }}>
          <div style={{ fontSize:11, color:S.dim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, fontFamily:S.font }}>Prompt</div>
          <p style={{ fontSize:14, color:S.muted, lineHeight:1.6, fontStyle:'italic', fontFamily:S.font }}>{essay.prompt}</p>
        </div>

        {/* Meta row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:16 }}>
            {essay.word_limit && (
              <span style={{ fontSize:12, color:S.dim, fontFamily:S.font }}>📝 {essay.word_limit} words</span>
            )}
            {essay.last_edited_at && (
              <span style={{ fontSize:12, color:S.dim, fontFamily:S.font }}>
                🕐 {new Date(essay.last_edited_at).toLocaleDateString()}
              </span>
            )}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {essay.google_drive_link && (
              <button onClick={() => window.open(essay.google_drive_link,'_blank')} style={{
                padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
                background:h2r(ACCENT,0.15), border:`1px solid ${h2r(ACCENT,0.3)}`, color:ACCENT, fontFamily:S.font,
              }}>↗ Open in Docs</button>
            )}
            <button onClick={()=>setExpanded(e=>!e)} style={{
              padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer',
              background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, color:S.muted, fontFamily:S.font,
            }}>{expanded ? 'Hide' : '≡ Word Check'}</button>
          </div>
        </div>

        {/* Notes */}
        {essay.notes && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:10, fontSize:13, color:'rgba(245,158,11,0.9)', fontFamily:S.font }}>
            📝 {essay.notes}
          </div>
        )}

        {/* Word count expander */}
        {expanded && (
          <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${S.border}` }}>
            <div style={{ fontSize:11, color:S.dim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, fontFamily:S.font }}>Paste essay to check</div>
            <textarea value={preview} onChange={e=>setPreview(e.target.value)}
              placeholder="Paste your essay here…"
              rows={5} style={{ ...inp, resize:'vertical', lineHeight:1.6 }} />
            {preview && (
              <div style={{ marginTop:10, padding:12, background:'rgba(255,255,255,0.04)', borderRadius:10 }}>
                <WordCountTracker text={preview} wordLimit={essay.word_limit} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Essays = () => {
  const [essays, setEssays] = useState<Essay[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<EssayFormData>({ applicationId:'', essayType:'personal_statement', prompt:'', wordLimit:'', googleDriveLink:'', notes:'' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [er, ar] = await Promise.all([
        api.essays.getAll<{data:any[]}>(),
        api.applications.getAll<{data:any[]}>(),
      ]);
      setEssays(er.data || []);
      setApplications(ar.data || []);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.applicationId || !form.prompt) { toast.error('Fill required fields'); return; }
    try {
      await api.essays.create({ ...form, applicationId:Number(form.applicationId), wordLimit:form.wordLimit?Number(form.wordLimit):null });
      toast.success('Essay added');
      setShowForm(false);
      setForm({ applicationId:'', essayType:'personal_statement', prompt:'', wordLimit:'', googleDriveLink:'', notes:'' });
      loadData();
    } catch { toast.error('Failed to add'); }
  };

  const statusCounts = Object.keys(STATUS_CFG).reduce((acc,k) => ({
    ...acc, [k]: essays.filter(e=>e.status===k).length,
  }), {} as Record<string,number>);

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight:'100vh', background:S.bg, color:'var(--color-text-primary)', fontFamily:S.font }}>

        {/* Header */}
        <div style={{ padding:'44px 48px 0', background:'linear-gradient(180deg,rgba(168,85,247,0.07) 0%,transparent 100%)', borderBottom:`1px solid ${S.border}` }}>
          <div style={{ maxWidth:860, margin:'0 auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingBottom:28, flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:12, color:h2r(ACCENT,0.8), textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10, fontWeight:600 }}>Writing Center</div>
                <h1 style={{ fontSize:40, fontWeight:900, letterSpacing:'-0.02em', marginBottom:6 }}>
                  Es<span style={{ color:ACCENT }}>says.</span>
                </h1>
                <p style={{ color:S.muted, fontSize:14 }}>
                  {essays.length} essays · {statusCounts.final || 0} finalized · {statusCounts.in_progress || 0} in progress
                </p>
              </div>
              <button onClick={() => setShowForm(f=>!f)} style={{
                padding:'10px 22px', background:ACCENT, border:'none', borderRadius:10,
                color:'var(--color-text-primary)', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:S.font,
                boxShadow:`0 0 16px ${h2r(ACCENT,0.35)}`,
              }}>+ Add Essay</button>
            </div>

            {/* Status summary bar */}
            {essays.length > 0 && (
              <div style={{ display:'flex', gap:12, paddingBottom:24, flexWrap:'wrap' }}>
                {Object.entries(STATUS_CFG).map(([key,cfg]) => (
                  <div key={key} style={{ padding:'8px 16px', background:cfg.bg, border:`1px solid ${h2r(cfg.color,0.3)}`, borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:18, fontWeight:800, color:cfg.color, fontFamily:S.font }}>{statusCounts[key] || 0}</span>
                    <span style={{ fontSize:12, color:cfg.color, fontFamily:S.font }}>{cfg.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ maxWidth:860, margin:'0 auto', padding:'32px 48px 80px' }}>

          {/* Add form */}
          {showForm && (
            <div style={{ background:S.surface, border:`1px solid ${h2r(ACCENT,0.3)}`, borderRadius:16, padding:24, marginBottom:24, animation:'fadeUp 0.25s ease' }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:18, fontFamily:S.font }}>New Essay</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <span style={lbl}>Application *</span>
                  <select value={form.applicationId} onChange={e=>setForm({...form,applicationId:e.target.value})} style={inp}>
                    <option value="">Select application</option>
                    {applications.map(a=><option key={a.id} value={a.id}>{a.college_name}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>Essay Type</span>
                  <select value={form.essayType} onChange={e=>setForm({...form,essayType:e.target.value})} style={inp}>
                    <option value="personal_statement">Personal Statement</option>
                    <option value="supplemental">Supplemental Essay</option>
                    <option value="why_us">Why Us Essay</option>
                  </select>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <span style={lbl}>Prompt *</span>
                  <textarea rows={3} value={form.prompt} onChange={e=>setForm({...form,prompt:e.target.value})} placeholder="Essay prompt…" style={{ ...inp, resize:'vertical', lineHeight:1.6 }} />
                </div>
                <div>
                  <span style={lbl}>Word Limit</span>
                  <input type="number" value={form.wordLimit} onChange={e=>setForm({...form,wordLimit:e.target.value})} placeholder="650" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Google Drive Link</span>
                  <input type="url" value={form.googleDriveLink} onChange={e=>setForm({...form,googleDriveLink:e.target.value})} placeholder="https://docs.google.com/…" style={inp} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <span style={lbl}>Notes</span>
                  <textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional notes…" style={{ ...inp, resize:'none', lineHeight:1.6 }} />
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:18 }}>
                <button onClick={handleAdd} style={{ padding:'10px 24px', background:ACCENT, border:'none', borderRadius:10, color:'var(--color-text-primary)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Add Essay</button>
                <button onClick={()=>setShowForm(false)} style={{ padding:'10px 20px', background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, borderRadius:10, color:S.muted, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Cancel</button>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ display:'flex', justifyContent:'center', padding:'80px 0' }}>
              <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.08)', borderTopColor:ACCENT, animation:'spin 0.8s linear infinite' }} />
            </div>
          )}

          {!loading && essays.length === 0 && (
            <div style={{ textAlign:'center', padding:'80px 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✍️</div>
              <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>No essays yet</div>
              <div style={{ color:S.muted, fontSize:14 }}>Add your first essay to start tracking your writing</div>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {essays.map((essay, i) => (
              <EssayCard key={essay.id} essay={essay} index={i}
                onStatusChange={(id,s) => api.essays.update(id,{status:s}).then(()=>{toast.success('Updated');loadData();}).catch(()=>toast.error('Failed'))}
                onDelete={(id) => { if(confirm('Delete this essay?')) api.essays.delete(id).then(()=>{toast.success('Deleted');loadData();}).catch(()=>toast.error('Failed')); }}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Essays;