// src/pages/Documents.tsx — Dark Editorial Redesign
import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── Types ──────────────────────────────────────────────────────────── */
interface Document {
  id:number; name:string; category:string; file_type?:string; file_size?:number;
  file_url?:string; description?:string; status:string; expiry_date?:string;
  tags:string[]; college_ids:number[]; created_at:string; updated_at:string;
}
interface DocSummary {
  categories:{category:string;count:number;verified_count:number;expired_count:number}[];
  expiring:Document[]; totalDocuments:number;
}

/* ─── Config ─────────────────────────────────────────────────────────── */
const h2r = (hex:string,a:number) => { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; };
const ACCENT = '#10B981'; // emerald — document vault theme
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

const CATS: Record<string,{label:string;emoji:string;color:string}> = {
  transcript:     { label:'Transcripts',    emoji:'📋', color:'#3B9EFF' },
  test_score:     { label:'Test Scores',    emoji:'📊', color:'#10B981' },
  essay:          { label:'Essays',         emoji:'✍️',  color:'#A855F7' },
  recommendation: { label:'Recs',           emoji:'👤', color:'#F59E0B' },
  financial:      { label:'Financial',      emoji:'💰', color:'#F97316' },
  proof:          { label:'Proof Docs',     emoji:'📄', color:'#06B6D4' },
  passport:       { label:'Passport/ID',    emoji:'🛂', color:'#F87171' },
  portfolio:      { label:'Portfolio',      emoji:'🎨', color:'#EC4899' },
  other:          { label:'Other',          emoji:'📁', color:S.dim },
};

const STATUS_CFG: Record<string,{label:string;color:string;bg:string}> = {
  pending:  { label:'Pending',  color:'#FBBF24', bg:'rgba(251,191,36,0.12)' },
  uploaded: { label:'Uploaded', color:'#3B9EFF', bg:'rgba(59,158,255,0.12)' },
  verified: { label:'Verified', color:'#10B981', bg:'rgba(16,185,129,0.12)' },
  expired:  { label:'Expired',  color:'#F87171', bg:'rgba(248,113,113,0.12)' },
  rejected: { label:'Rejected', color:'#F87171', bg:'rgba(248,113,113,0.12)' },
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  input::placeholder{color:rgba(255,255,255,0.2)!important;}
  select option{background:#0F0F1C;color:#fff;}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

const getDaysUntilExpiry = (dateStr:string) => {
  const days = Math.ceil((new Date(dateStr).getTime()-Date.now())/86400000);
  if (days < 0) return { text:'Expired', color:'#F87171' };
  if (days === 0) return { text:'Expires today', color:'#F97316' };
  if (days === 1) return { text:'Expires tomorrow', color:'#FBBF24' };
  return { text:`Expires in ${days}d`, color:S.dim };
};

/* ─── Stat Card ──────────────────────────────────────────────────────── */
const StatCard: React.FC<{emoji:string;value:number;label:string;accent:string}> = ({emoji,value,label,accent}) => (
  <div style={{ background:S.surface, border:`1px solid ${S.border}`, borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
    <div style={{ width:44, height:44, borderRadius:12, background:h2r(accent,0.15), display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{emoji}</div>
    <div>
      <div style={{ fontSize:26, fontWeight:800, color:'var(--color-text-primary)', lineHeight:1, fontFamily:S.font }}>{value}</div>
      <div style={{ fontSize:12, color:S.muted, marginTop:3, fontFamily:S.font }}>{label}</div>
    </div>
  </div>
);

/* ─── Doc Card ───────────────────────────────────────────────────────── */
const DocCard: React.FC<{
  doc:Document; index:number;
  onDelete:(id:number)=>void;
  onStatusChange:(id:number,s:string)=>void;
}> = ({doc, index, onDelete, onStatusChange}) => {
  const cat = CATS[doc.category] || CATS.other;
  const status = STATUS_CFG[doc.status] || STATUS_CFG.pending;

  return (
    <div style={{
      background:S.surface, border:`1px solid ${S.border}`,
      borderTop:`2px solid ${cat.color}`,
      borderRadius:14, padding:'16px 18px',
      animation:'fadeUp 0.35s ease both', animationDelay:`${index*0.05}s`,
      display:'flex', flexDirection:'column', gap:12,
    }}>
      {/* Top row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flex:1, minWidth:0 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:h2r(cat.color,0.15), display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{cat.emoji}</div>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--color-text-primary)', fontFamily:S.font, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{doc.name}</div>
            <div style={{ fontSize:11, color:S.dim, fontFamily:S.font }}>{cat.label}</div>
          </div>
        </div>
        <button onClick={()=>onDelete(doc.id)} style={{
          width:30, height:30, borderRadius:8, cursor:'pointer', flexShrink:0, marginLeft:8,
          background:'rgba(248,113,113,0.1)', border:'1px solid rgba(248,113,113,0.15)',
          color:'#F87171', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center',
        }}>🗑</button>
      </div>

      {doc.description && (
        <div style={{ fontSize:12, color:S.muted, lineHeight:1.5, fontFamily:S.font }}>{doc.description}</div>
      )}

      {/* Status + actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <select value={doc.status} onChange={e=>onStatusChange(doc.id,e.target.value)} style={{
          padding:'5px 10px', borderRadius:100, fontSize:11, fontWeight:600,
          background:status.bg, border:`1px solid ${h2r(status.color,0.4)}`,
          color:status.color, cursor:'pointer', fontFamily:S.font,
        }}>
          {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        {doc.file_url && (
          <button onClick={()=>window.open(doc.file_url,'_blank')} style={{
            padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer',
            background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, color:S.muted, fontFamily:S.font,
          }}>↗ Open</button>
        )}
      </div>

      {/* Expiry */}
      {doc.expiry_date && (() => { const exp = getDaysUntilExpiry(doc.expiry_date); return (
        <div style={{ fontSize:11, color:exp.color, fontFamily:S.font }}>⏰ {exp.text}</div>
      );})}

      {/* Tags */}
      {doc.tags?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          {doc.tags.map((t,i)=>(
            <span key={i} style={{ fontSize:10, padding:'2px 8px', borderRadius:100, background:'rgba(255,255,255,0.06)', color:S.dim, fontFamily:S.font }}>#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── Main ────────────────────────────────────────────────────────────── */
const Documents = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [summary, setSummary] = useState<DocSummary|null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedCat, setSelectedCat] = useState('');
  const [form, setForm] = useState({ name:'', category:'transcript', description:'', status:'pending', fileUrl:'', expiryDate:'' });

  useEffect(() => { loadData(); }, [selectedCat]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [dr, sr] = await Promise.all([
        api.documents.getAll({ category:selectedCat||undefined }),
        api.documents.getSummary(),
      ]) as [any,any];
      setDocuments(dr.data||[]);
      setSummary(sr.data||null);
    } catch { toast.error('Failed to load'); } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.name||!form.category){toast.error('Fill required fields');return;}
    try {
      await api.documents.create({ name:form.name, category:form.category, description:form.description, status:form.status, fileUrl:form.fileUrl, expiryDate:form.expiryDate||undefined });
      toast.success('Document added');
      setShowForm(false);
      setForm({name:'',category:'transcript',description:'',status:'pending',fileUrl:'',expiryDate:''});
      loadData();
    } catch { toast.error('Failed'); }
  };

  const totalVerified = summary?.categories?.reduce((s,c)=>s+(c.verified_count||0),0)||0;
  const totalExpired  = summary?.categories?.reduce((s,c)=>s+(c.expired_count||0),0)||0;

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight:'100vh', background:S.bg, color:'var(--color-text-primary)', fontFamily:S.font }}>

        {/* Header */}
        <div style={{ padding:'44px 48px 0', background:'linear-gradient(180deg,rgba(16,185,129,0.07) 0%,transparent 100%)', borderBottom:`1px solid ${S.border}` }}>
          <div style={{ maxWidth:1280, margin:'0 auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', paddingBottom:28, flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:12, color:h2r(ACCENT,0.8), textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:10, fontWeight:600 }}>Secure Vault</div>
                <h1 style={{ fontSize:40, fontWeight:900, letterSpacing:'-0.02em', marginBottom:6 }}>
                  Doc<span style={{ color:ACCENT }}>uments.</span>
                </h1>
                <p style={{ color:S.muted, fontSize:14 }}>{summary?.totalDocuments||0} documents · {totalVerified} verified · {summary?.expiring?.length||0} expiring soon</p>
              </div>
              <button onClick={()=>setShowForm(f=>!f)} style={{
                padding:'10px 22px', background:ACCENT, border:'none', borderRadius:10,
                color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:S.font,
                boxShadow:`0 0 16px ${h2r(ACCENT,0.35)}`,
              }}>+ Add Document</button>
            </div>

            {/* Category filter pills */}
            <div style={{ display:'flex', gap:8, paddingBottom:24, flexWrap:'wrap' }}>
              <button onClick={()=>setSelectedCat('')} style={{
                padding:'7px 16px', borderRadius:100, fontSize:12, fontWeight:!selectedCat?700:400,
                background:!selectedCat?h2r(ACCENT,0.18):'transparent',
                border:`1px solid ${!selectedCat?h2r(ACCENT,0.5):S.border}`,
                color:!selectedCat?ACCENT:S.dim, cursor:'pointer', fontFamily:S.font,
              }}>All ({summary?.totalDocuments||0})</button>
              {Object.entries(CATS).map(([key,cfg])=>{
                const count=summary?.categories?.find(c=>c.category===key)?.count||0;
                const active=selectedCat===key;
                return (
                  <button key={key} onClick={()=>setSelectedCat(active?'':key)} style={{
                    padding:'7px 14px', borderRadius:100, fontSize:12, fontWeight:active?700:400,
                    background:active?h2r(cfg.color,0.18):'transparent',
                    border:`1px solid ${active?h2r(cfg.color,0.5):S.border}`,
                    color:active?cfg.color:S.dim, cursor:'pointer', fontFamily:S.font,
                    display:'flex', alignItems:'center', gap:5,
                  }}>
                    <span>{cfg.emoji}</span> {cfg.label} {count>0&&<span style={{opacity:0.7}}>({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ maxWidth:1280, margin:'0 auto', padding:'32px 48px 80px' }}>

          {/* Summary stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:28 }}>
            <StatCard emoji="📁" value={summary?.totalDocuments||0} label="Total Documents" accent="#3B9EFF" />
            <StatCard emoji="✅" value={totalVerified} label="Verified" accent="#10B981" />
            <StatCard emoji="⏰" value={summary?.expiring?.length||0} label="Expiring Soon" accent="#FBBF24" />
            <StatCard emoji="⚠️" value={totalExpired} label="Expired" accent="#F87171" />
          </div>

          {/* Expiring soon alert */}
          {(summary?.expiring?.length||0)>0 && (
            <div style={{ background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:14, padding:'16px 20px', marginBottom:24 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#FBBF24', marginBottom:10, fontFamily:S.font }}>⏰ Expiring Soon</div>
              {summary!.expiring.slice(0,3).map(doc=>{
                const exp = getDaysUntilExpiry(doc.expiry_date!);
                return (
                  <div key={doc.id} style={{ display:'flex', justifyContent:'space-between', fontSize:13, color:'rgba(255,255,255,0.6)', fontFamily:S.font, marginBottom:4 }}>
                    <span>{doc.name}</span>
                    <span style={{ color:exp.color, fontWeight:600 }}>{exp.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add form */}
          {showForm && (
            <div style={{ background:S.surface, border:`1px solid ${h2r(ACCENT,0.3)}`, borderRadius:16, padding:24, marginBottom:24, animation:'fadeUp 0.25s ease' }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:18, fontFamily:S.font }}>Add Document</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <span style={lbl}>Name *</span>
                  <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="High School Transcript" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Category *</span>
                  <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} style={inp}>
                    {Object.entries(CATS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={lbl}>Description</span>
                  <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Optional" style={inp} />
                </div>
                <div>
                  <span style={lbl}>File / Link URL</span>
                  <input value={form.fileUrl} onChange={e=>setForm({...form,fileUrl:e.target.value})} placeholder="https://drive.google.com/…" style={inp} />
                </div>
                <div>
                  <span style={lbl}>Expiry Date</span>
                  <input type="date" value={form.expiryDate} onChange={e=>setForm({...form,expiryDate:e.target.value})} style={inp} />
                </div>
                <div>
                  <span style={lbl}>Status</span>
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={inp}>
                    {Object.entries(STATUS_CFG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:18 }}>
                <button onClick={handleAdd} style={{ padding:'10px 24px', background:ACCENT, border:'none', borderRadius:10, color:'#000', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Add Document</button>
                <button onClick={()=>setShowForm(false)} style={{ padding:'10px 20px', background:'rgba(255,255,255,0.06)', border:`1px solid ${S.border2}`, borderRadius:10, color:S.muted, fontSize:13, cursor:'pointer', fontFamily:S.font }}>Cancel</button>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ display:'flex', justifyContent:'center', padding:'80px 0' }}>
              <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.08)', borderTopColor:ACCENT, animation:'spin 0.8s linear infinite' }} />
            </div>
          )}

          {!loading && documents.length === 0 && (
            <div style={{ textAlign:'center', padding:'80px 0' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📁</div>
              <div style={{ fontSize:20, fontWeight:700, marginBottom:8 }}>
                {selectedCat ? `No ${CATS[selectedCat]?.label||'documents'} found` : 'No documents yet'}
              </div>
              <div style={{ color:S.muted, fontSize:14 }}>Upload your first document to get started</div>
            </div>
          )}

          {!loading && documents.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
              {documents.map((doc,i)=>(
                <DocCard key={doc.id} doc={doc} index={i}
                  onDelete={id=>{if(confirm('Delete?'))api.documents.delete(id).then(()=>{toast.success('Deleted');loadData();}).catch(()=>toast.error('Failed'));}}
                  onStatusChange={(id,s)=>api.documents.update(id,{status:s}).then(()=>{toast.success('Updated');loadData();}).catch(()=>toast.error('Failed'))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Documents;