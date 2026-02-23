// src/pages/Dashboard.tsx — Dark Editorial Redesign
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Link, useNavigate } from 'react-router-dom';
import AIChatbot from '../components/AIChatbot';
import ProfileStrength from '../components/chancing/ProfileStrength';
import TodaysTasks from '../components/dashboard/TodaysTasks';
import UrgentAlerts from '../components/dashboard/UrgentAlerts';
import RecommendedActions from '../components/dashboard/RecommendedActions';
import CollegeListOverview from '../components/dashboard/CollegeListOverview';
import ProfileCompletionWidget from '../components/common/ProfileCompletionWidget';
import { CompactDecisionCountdown } from '@/components/DecisionCountdown';

/* ─── Design tokens ──────────────────────────────────────────────────── */
const h2r = (hex: string, a: number) => {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
};
const S = {
  bg:'#080810', surface:'#0F0F1C', surface2:'rgba(255,255,255,0.04)',
  border:'rgba(255,255,255,0.08)', border2:'rgba(255,255,255,0.13)',
  accent:'#6C63FF', accent2:'#3B9EFF', gold:'#F59E0B',
  text:'#fff', muted:'rgba(255,255,255,0.45)', dim:'rgba(255,255,255,0.22)',
  font:"'DM Sans',sans-serif",
};

const GLOBAL = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}body{background:#080810;}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
  ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px;}
`;

/* ─── Mini components ─────────────────────────────────────────────────── */

// Stat pill in hero
const HeroStat: React.FC<{ icon: string; label: string; value: number; accent: string }> = ({ icon, label, value, accent }) => (
  <div style={{
    background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)',
    border: `1px solid ${h2r(accent, 0.3)}`, borderRadius: 16, padding: '16px 20px',
    animation: 'fadeUp 0.5s ease both',
  }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span style={{ fontSize: 12, color: h2r(accent, 0.8), fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: S.font }}>{label}</span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: S.font, lineHeight: 1 }}>{value}</div>
  </div>
);

// Section heading
const SectionHead: React.FC<{ emoji: string; title: string; href?: string; linkLabel?: string }> = ({ emoji, title, href, linkLabel }) => (
  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16 }}>
    <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: '#fff', fontFamily: S.font }}>{title}</h2>
    </div>
    {href && linkLabel && (
      <Link to={href} style={{ fontSize: 12, color: h2r(S.accent, 0.8), fontFamily: S.font, textDecoration: 'none', fontWeight: 600, display:'flex', alignItems:'center', gap:4 }}>
        {linkLabel} →
      </Link>
    )}
  </div>
);

// Dark card wrapper
const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 18, padding: '22px 24px', ...style }}>
    {children}
  </div>
);

// Progress bar
const ProgressBar: React.FC<{ value: number; accent: string; height?: number }> = ({ value, accent, height = 6 }) => (
  <div style={{ height, background: 'rgba(255,255,255,0.07)', borderRadius: height, overflow: 'hidden' }}>
    <div style={{ width: `${Math.min(value, 100)}%`, height: '100%', background: accent, borderRadius: height, transition: 'width 0.8s ease' }} />
  </div>
);

// Deadline row
const DeadlineRow: React.FC<{ deadline: any; getDaysUntil: (d: string) => string }> = ({ deadline, getDaysUntil }) => {
  const label = getDaysUntil(deadline.deadline_date);
  const isUrgent = ['Today','Tomorrow','Overdue'].includes(label);
  const urgentColor = label === 'Overdue' ? '#F87171' : label === 'Today' ? '#F97316' : '#FBBF24';
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px',
      background: isUrgent ? h2r(urgentColor, 0.07) : S.surface2,
      border: `1px solid ${isUrgent ? h2r(urgentColor, 0.25) : S.border}`,
      borderLeft: `3px solid ${isUrgent ? urgentColor : S.border2}`,
      borderRadius: 10, marginBottom: 8,
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: S.font, marginBottom: 2 }}>{deadline.college_name}</div>
        <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>{deadline.deadline_type}</div>
      </div>
      <div style={{ padding:'4px 10px', borderRadius: 100, fontSize: 11, fontWeight: 700, background: isUrgent ? h2r(urgentColor, 0.15) : 'rgba(255,255,255,0.07)', color: isUrgent ? urgentColor : S.dim, fontFamily: S.font }}>
        {label}
      </div>
    </div>
  );
};

// Application status badge
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const cfg: Record<string,{bg:string;color:string}> = {
    submitted:  { bg:'rgba(16,185,129,0.15)',  color:'#10B981' },
    accepted:   { bg:'rgba(59,158,255,0.15)',  color:'#3B9EFF' },
    preparing:  { bg:'rgba(251,191,36,0.15)',  color:'#FBBF24' },
    researching:{ bg:'rgba(168,85,247,0.15)',  color:'#A855F7' },
  };
  const s = cfg[status] || { bg:'rgba(255,255,255,0.07)', color:S.muted };
  return (
    <span style={{ padding:'3px 10px', borderRadius:100, fontSize:11, fontWeight:600, background:s.bg, color:s.color, fontFamily:S.font, textTransform:'capitalize' }}>{status}</span>
  );
};

// Quick action card
const QuickAction: React.FC<{ emoji: string; title: string; desc: string; href: string; accent: string }> = ({ emoji, title, desc, href, accent }) => (
  <Link to={href} style={{ textDecoration:'none' }}>
    <div style={{
      background: S.surface, border: `1px solid ${h2r(accent, 0.2)}`,
      borderTop: `2px solid ${h2r(accent, 0.5)}`,
      borderRadius: 16, padding: '20px', cursor: 'pointer',
      transition: 'all 0.2s ease',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 24px ${h2r(accent, 0.15)}`; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
    >
      <div style={{ fontSize: 28, marginBottom: 10 }}>{emoji}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 4, fontFamily: S.font }}>{title}</div>
      <div style={{ fontSize: 12, color: S.muted, fontFamily: S.font }}>{desc}</div>
    </div>
  </Link>
);

/* ─── Main Dashboard ─────────────────────────────────────────────────── */
const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState({ applications:0, deadlines:0, essays:0, colleges:0, completed:0, inProgress:0 });
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<any[]>([]);
  const [recentApplications, setRecentApplications] = useState<any[]>([]);
  const [essayProgress, setEssayProgress] = useState<any[]>([]);
  const [decisionDates, setDecisionDates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommendedActions, setRecommendedActions] = useState<any[]>([]);
  const [profileStrength, setProfileStrength] = useState(0);
  const [urgentAlerts, setUrgentAlerts] = useState<any[]>([]);
  const [collegeList, setCollegeList] = useState<any[]>([]);
  const [todaysTasks, setTodaysTasks] = useState<any[]>([]);

  const targetCountries = user?.target_countries ? JSON.parse(user.target_countries) : [];
  const intendedMajors = user?.intended_majors ? JSON.parse(user.intended_majors) : [];

  useEffect(() => { loadDashboardData(); }, []);

  const loadDashboardData = async () => {
    try {
      const [collegesRes, applicationsRes, deadlinesRes, essaysRes] = await Promise.all([
        api.getColleges({ limit:5 }), api.getApplications(), api.getDeadlines(30), api.getEssays()
      ]);
      const applications = applicationsRes.data || [];
      const deadlines = deadlinesRes.data || [];
      const essays = essaysRes.data || [];

      setStats({
        applications: applications.length,
        deadlines: deadlines.filter((d:any)=>!d.is_completed).length,
        essays: essays.length,
        colleges: collegesRes.data?.length || 0,
        completed: applications.filter((a:any)=>a.status==='submitted'||a.status==='accepted').length,
        inProgress: applications.filter((a:any)=>a.status==='preparing'||a.status==='researching').length,
      });

      setUpcomingDeadlines(deadlines.slice(0,5));
      setRecentApplications(applications.slice(0,5));
      setEssayProgress(essays.slice(0,3));

      const decisions = applications.filter((a:any)=>a.status==='submitted'&&a.notification_date).map((a:any)=>({
        collegeName:a.college_name, deadlineType:a.deadline_type||'Regular Decision',
        notificationDate:a.notification_date, applicationDate:a.application_date||a.created_at, collegeId:a.college_id,
      }));
      setDecisionDates(decisions);
      setCollegeList(applications.map((a:any)=>({ id:a.id, name:a.college_name, category:a.category||'target', chance:a.chance||50, country:a.country||'United States', deadline:a.deadline, status:a.status })));

      const calcDays = (d:string)=>Math.ceil((new Date(d).getTime()-Date.now())/86400000);

      // Alerts
      try {
        const rr = await api.risk.alerts();
        if (rr.success&&rr.data&&Array.isArray(rr.data)) {
          setUrgentAlerts(rr.data.map((a:any)=>({ id:a.id, type:a.type||'warning', severity:a.severity||'warning', title:a.title||a.message, description:a.description||'', college:a.college_name, daysRemaining:a.days_remaining, action:{label:'View',href:'/deadlines'} })));
        } else throw new Error();
      } catch {
        setUrgentAlerts(deadlines.filter((d:any)=>!d.is_completed).slice(0,5).map((d:any)=>{
          const n=calcDays(d.deadline_date);
          return { id:d.id, type:'deadline', severity:n<=1?'critical':n<=3?'warning':n<=7?'info':'success', title:`${d.deadline_type} - ${d.college_name}`, description:`Due ${n<=0?'today':`in ${n} days`}`, college:d.college_name, daysRemaining:n, action:{label:'View',href:'/deadlines'} };
        }));
      }

      // Tasks
      try {
        const tr = await api.tasks.getAll({ status:'pending' });
        if (tr.success&&tr.data&&Array.isArray(tr.data)) {
          setTodaysTasks(tr.data.slice(0,5).map((t:any)=>({ id:t.id, title:t.title||t.type, category:t.type||'deadline', priority:t.priority||'medium', dueDate:t.due_date, college:t.college_name, status:t.status||'pending', estimatedTime:t.estimated_time||30 })));
        } else throw new Error();
      } catch {
        setTodaysTasks(deadlines.filter((d:any)=>!d.is_completed).slice(0,5).map((d:any)=>{
          const n=calcDays(d.deadline_date);
          return { id:d.id, title:d.deadline_type, category:'deadline', priority:n<=1?'critical':n<=3?'high':n<=7?'medium':'low', dueDate:d.deadline_date, college:d.college_name, status:'pending', estimatedTime:30 };
        }));
      }

      // Automation
      try {
        const profile = { gpa:user?.gpa||3.5, satScore:user?.sat_score, actScore:user?.act_score, activities:[], grade:user?.grade||'Grade 12', curriculum:user?.curriculum||'CBSE' };
        const [str, act] = await Promise.all([api.automation.getProfileStrength(profile), api.automation.getRecommendedActions(profile)]);
        if (str.success&&str.data) setProfileStrength(str.data.percentage||0);
        if (act.success&&act.data) setRecommendedActions(act.data.map((a:any,i:number)=>({ id:`action-${i}`, ...a, impactScore:a.impact==='Unlocks personalized college recommendations'?20:a.impact==='Better reach/target/safety classification'?15:10 })));
      } catch {
        setRecommendedActions([
          { id:'a1', priority:'high', category:'profile', action:'Complete your profile', reason:'Unlocks personalized recommendations', impact:'Unlocks personalized college recommendations', impactScore:20 },
          { id:'a2', priority:'medium', category:'applications', action:'Add colleges to your list', reason:'Build a balanced reach/target/safety list', impact:'Better application strategy', impactScore:15 },
        ]);
        setProfileStrength(45);
      }
    } catch (e) { console.error('Dashboard load error:', e); } finally { setLoading(false); }
  };

  const getDaysUntil = (d: string) => {
    const n = Math.ceil((new Date(d).getTime()-Date.now())/86400000);
    if (n < 0) return 'Overdue';
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    return `${n} days`;
  };

  const progressPct = stats.applications === 0 ? 0 : Math.round((stats.completed/stats.applications)*100);
  const firstName = user?.full_name?.split(' ')[0] || 'there';

  if (loading) return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight:'100vh', background:S.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:48, height:48, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.08)', borderTopColor:S.accent, animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
          <div style={{ fontSize:14, color:S.muted, fontFamily:S.font }}>Loading your dashboard…</div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <style>{GLOBAL}</style>
      <div style={{ minHeight:'100vh', background:S.bg, color:'#fff', fontFamily:S.font }}>

        {/* ── HERO ── */}
        <div style={{
          padding:'44px 48px 40px',
          background:`linear-gradient(135deg, ${h2r(S.accent,0.12)} 0%, ${h2r('#3B9EFF',0.06)} 50%, transparent 100%)`,
          borderBottom:`1px solid ${S.border}`,
          position:'relative', overflow:'hidden',
        }}>
          {/* Ambient orb */}
          <div style={{ position:'absolute', top:-100, right:-60, width:400, height:400, background:`radial-gradient(circle, ${h2r(S.accent,0.1)} 0%, transparent 70%)`, borderRadius:'50%', pointerEvents:'none' }} />

          <div style={{ maxWidth:1280, margin:'0 auto', position:'relative', zIndex:1 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28, flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:12, color:h2r(S.accent,0.8), textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:12, fontWeight:600 }}>Mission Control</div>
                <h1 style={{ fontSize:42, fontWeight:900, letterSpacing:'-0.025em', lineHeight:1.1, marginBottom:6 }}>
                  Hey, <span style={{ color:S.accent }}>{firstName}.</span> 👋
                </h1>
                <p style={{ color:S.muted, fontSize:15 }}>Your college application journey at a glance.</p>
              </div>
              <div style={{
                display:'flex', alignItems:'center', gap:8, padding:'8px 16px',
                background:'rgba(255,255,255,0.07)', border:`1px solid ${h2r(S.accent,0.3)}`,
                borderRadius:100, fontSize:13, fontWeight:600, color:h2r(S.accent,0.9),
                animation:'pulse 2s ease infinite',
              }}>
                ✨ Magic Mode Active
              </div>
            </div>

            {/* Hero stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 }}>
              <HeroStat icon="📝" label="Applications" value={stats.applications} accent={S.accent} />
              <HeroStat icon="📅" label="Deadlines"    value={stats.deadlines}    accent="#F97316" />
              <HeroStat icon="✍️"  label="Essays"       value={stats.essays}       accent="#A855F7" />
              <HeroStat icon="✅" label="Completed"    value={stats.completed}    accent="#10B981" />
              <HeroStat icon="⚡" label="In Progress"  value={stats.inProgress}   accent="#FBBF24" />
            </div>
          </div>
        </div>

        <div style={{ maxWidth:1280, margin:'0 auto', padding:'36px 48px 80px' }}>

          {/* ── Urgent alerts ── */}
          {urgentAlerts.length > 0 && (
            <div style={{ marginBottom:28 }}>
              <UrgentAlerts alerts={urgentAlerts} onAlertClick={()=>navigate('/deadlines')} />
            </div>
          )}

          {/* ── Tasks + Recommended Actions ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
            <TodaysTasks tasks={todaysTasks} onTaskClick={()=>navigate('/deadlines')} onTaskComplete={(id)=>console.log('Complete:',id)} />
            <RecommendedActions actions={recommendedActions} profileStrength={profileStrength} onActionClick={(a)=>{
              const routes: Record<string,string> = { profile:'/settings', testing:'/settings', essays:'/essays', applications:'/discover', recommendations:'/recommendations', deadlines:'/deadlines' };
              navigate(routes[a.category]||'/');
            }} />
          </div>

          {/* ── College list overview ── */}
          <div style={{ marginBottom:24 }}>
            <CollegeListOverview colleges={collegeList} onCollegeClick={(id)=>navigate(`/colleges/${id}`)} onAddCollege={()=>navigate('/discover')} />
          </div>

          {/* ── Progress + Profile + Decisions ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:20, marginBottom:24 }}>
            {/* Overall progress */}
            <Card>
              <SectionHead emoji="🏆" title="Overall Progress" />
              <div style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, color:S.muted }}>Completion</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#10B981' }}>{progressPct}%</span>
                </div>
                <ProgressBar value={progressPct} accent="#10B981" height={8} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, paddingTop:14, borderTop:`1px solid ${S.border}` }}>
                <div>
                  <div style={{ fontSize:28, fontWeight:900, color:'#10B981', fontFamily:S.font }}>{stats.completed}</div>
                  <div style={{ fontSize:12, color:S.dim }}>Submitted</div>
                </div>
                <div>
                  <div style={{ fontSize:28, fontWeight:900, color:'#FBBF24', fontFamily:S.font }}>{stats.inProgress}</div>
                  <div style={{ fontSize:12, color:S.dim }}>In Progress</div>
                </div>
              </div>
            </Card>

            {/* Target countries */}
            <Card>
              <SectionHead emoji="🌍" title="Target Countries" />
              {targetCountries.length > 0 ? targetCountries.map((c:string, i:number) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:h2r(S.accent2,0.08), border:`1px solid ${h2r(S.accent2,0.2)}`, borderRadius:8, marginBottom:8 }}>
                  <span style={{ fontSize:14, color:'#fff', fontFamily:S.font }}>{c}</span>
                  <span style={{ fontSize:11, color:S.accent2, fontWeight:600, fontFamily:S.font }}>Active</span>
                </div>
              )) : <p style={{ color:S.dim, fontSize:13 }}>No target countries set</p>}
            </Card>

            {/* Decision countdown or intended majors */}
            {decisionDates.length > 0 ? (
              <div><CompactDecisionCountdown decisions={decisionDates} /></div>
            ) : (
              <Card>
                <SectionHead emoji="📚" title="Intended Majors" />
                {intendedMajors.length > 0 ? intendedMajors.map((m:string, i:number) => (
                  <div key={i} style={{ padding:'8px 12px', background:h2r('#A855F7',0.1), border:`1px solid ${h2r('#A855F7',0.2)}`, borderRadius:8, marginBottom:8 }}>
                    <span style={{ fontSize:14, color:'#fff', fontFamily:S.font }}>{m}</span>
                  </div>
                )) : <p style={{ color:S.dim, fontSize:13 }}>No majors selected</p>}
              </Card>
            )}
          </div>

          {/* ── Profile strength + quick actions ── */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:20, marginBottom:24 }}>
            <ProfileStrength />
            <Card>
              <SectionHead emoji="⚡" title="Quick Actions" />
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { emoji:'🎯', label:'Manage Activities', href:'/activities', color:'#6C63FF' },
                  { emoji:'🏫', label:'Explore Colleges',  href:'/colleges',   color:'#3B9EFF' },
                  { emoji:'✍️', label:'Work on Essays',    href:'/essays',     color:'#A855F7' },
                  { emoji:'📅', label:'Check Deadlines',   href:'/deadlines',  color:'#F97316' },
                ].map(a=>(
                  <Link key={a.href} to={a.href} style={{ textDecoration:'none' }}>
                    <div style={{
                      display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                      background:S.surface2, border:`1px solid ${S.border}`, borderRadius:10,
                      cursor:'pointer', transition:'all 0.15s',
                    }}
                      onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=h2r(a.color,0.4);(e.currentTarget as HTMLElement).style.background=h2r(a.color,0.07);}}
                      onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=S.border;(e.currentTarget as HTMLElement).style.background=S.surface2;}}
                    >
                      <span style={{ fontSize:18 }}>{a.emoji}</span>
                      <span style={{ fontSize:13, color:'rgba(255,255,255,0.75)', fontWeight:500, fontFamily:S.font }}>{a.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Profile completion ── */}
          <div style={{ marginBottom:24 }}>
            <ProfileCompletionWidget variant="full" showMissingFields={true} />
          </div>

          {/* ── Deadlines + Applications ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:24 }}>
            <Card>
              <SectionHead emoji="⏰" title="Upcoming Deadlines" href="/deadlines" linkLabel="View all" />
              {upcomingDeadlines.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
                  <div style={{ color:S.dim, fontSize:13 }}>No upcoming deadlines</div>
                  <Link to="/deadlines"><button style={{ marginTop:12, padding:'8px 18px', background:S.accent, border:'none', borderRadius:10, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:S.font }}>Add Deadline</button></Link>
                </div>
              ) : upcomingDeadlines.map((d:any) => <DeadlineRow key={d.id} deadline={d} getDaysUntil={getDaysUntil} />)}
            </Card>

            <Card>
              <SectionHead emoji="📋" title="Recent Applications" href="/applications" linkLabel="View all" />
              {recentApplications.length === 0 ? (
                <div style={{ textAlign:'center', padding:'32px 0' }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>🏫</div>
                  <div style={{ color:S.dim, fontSize:13 }}>No applications yet</div>
                  <Link to="/discover"><button style={{ marginTop:12, padding:'8px 18px', background:S.accent, border:'none', borderRadius:10, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:S.font }}>Browse Colleges</button></Link>
                </div>
              ) : recentApplications.map((app:any)=>(
                <div key={app.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px',
                  background:S.surface2, border:`1px solid ${S.border}`, borderRadius:10, marginBottom:8,
                  cursor:'pointer', transition:'border-color 0.15s',
                }}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=h2r(S.accent,0.35))}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=S.border)}
                  onClick={()=>navigate('/applications')}
                >
                  <div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#fff', fontFamily:S.font, marginBottom:2 }}>{app.college_name}</div>
                    <div style={{ fontSize:11, color:S.dim }}>{app.country}</div>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
              ))}
            </Card>
          </div>

          {/* ── Essay progress ── */}
          {essayProgress.length > 0 && (
            <Card style={{ marginBottom:24 }}>
              <SectionHead emoji="✍️" title="Essay Progress" href="/essays" linkLabel="View all" />
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
                {essayProgress.map((essay:any)=>{
                  const statusColor: Record<string,string> = { final:'#10B981', draft_complete:'#3B9EFF', in_progress:'#FBBF24' };
                  const color = statusColor[essay.status] || 'rgba(255,255,255,0.25)';
                  return (
                    <div key={essay.id} style={{ padding:'14px 16px', background:S.surface2, border:`1px solid ${h2r(color,0.25)}`, borderTop:`2px solid ${color}`, borderRadius:12 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:4, fontFamily:S.font }}>{essay.college_name}</div>
                      <div style={{ fontSize:12, color:S.dim, marginBottom:10 }}>{essay.essay_type?.replace(/_/g,' ')}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:color }} />
                        <span style={{ fontSize:11, color:color, fontWeight:600, fontFamily:S.font, textTransform:'capitalize' }}>{essay.status?.replace(/_/g,' ')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Quick action nav cards ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
            <QuickAction emoji="🔭" title="Discover Colleges"  desc="Browse universities worldwide"  href="/discover"      accent="#6C63FF" />
            <QuickAction emoji="📋" title="My Applications"    desc="Track your progress"            href="/applications"  accent="#10B981" />
            <QuickAction emoji="📅" title="Deadlines"          desc="Never miss a date"              href="/deadlines"     accent="#F97316" />
            <QuickAction emoji="✍️"  title="Essays"            desc="Write and track your essays"    href="/essays"        accent="#A855F7" />
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
