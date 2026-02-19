// ==========================================
// FILE: src/pages/StudentOnboarding.tsx
// REDESIGNED — Premium Collegiate Onboarding System
// ==========================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudentProfile } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────
interface StructuredActivity {
  name: string;
  type: string;
  tier: number;
  yearsInvolved: number;
  hoursPerWeek: number;
  leadership: string;
  achievements: string;
}

interface StudentOnboardingProps {
  onComplete: (profile: StudentProfile) => void;
}

// ── Color System ───────────────────────────────────────────────────────────
const STEP_THEMES = [
  { bg: '#0A0A1A', accent: '#6C63FF', surface: '#12122A', label: 'Identity',    glow: 'rgba(108,99,255,0.4)'  },
  { bg: '#0A1628', accent: '#3B9EFF', surface: '#0F1E38', label: 'Academics',   glow: 'rgba(59,158,255,0.4)'  },
  { bg: '#130A28', accent: '#A855F7', surface: '#1A0F35', label: 'Interests',   glow: 'rgba(168,85,247,0.4)'  },
  { bg: '#1A0A0A', accent: '#F97316', surface: '#2A1210', label: 'Preferences', glow: 'rgba(249,115,22,0.4)'  },
  { bg: '#0A1A14', accent: '#10B981', surface: '#0F2219', label: 'Activities',  glow: 'rgba(16,185,129,0.4)'  },
  { bg: '#1A130A', accent: '#F59E0B', surface: '#2A1E0F', label: 'Goals',       glow: 'rgba(245,158,11,0.4)'  },
  { bg: '#050508', accent: '#FFD700', surface: '#0D0D14', label: 'Reveal',      glow: 'rgba(255,215,0,0.4)'   },
];

const CONTINUE_LABELS = [
  'Build My Profile →',
  'Add My Academics →',
  'Find My Fit →',
  'Show My Spike →',
  'Set My Goals →',
  'See My Strength →',
  'Reveal My Matches →',
];

// ── Utility ────────────────────────────────────────────────────────────────
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
};

// ── Constellation Progress ─────────────────────────────────────────────────
const Constellation: React.FC<{ step: number }> = ({ step }) => {
  const nodes = STEP_THEMES.map((t, i) => ({ ...t, idx: i + 1 }));
  return (
    <div style={{ position: 'relative', width: '100%', padding: '24px 48px 8px', boxSizing: 'border-box' }}>
      <svg width="100%" height="40" style={{ overflow: 'visible', position: 'absolute', top: 28, left: 0 }}>
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {STEP_THEMES.map((t, i) => (
              <stop key={i} offset={`${(i / 6) * 100}%`} stopColor={i < step ? t.accent : 'rgba(255,255,255,0.08)'} />
            ))}
          </linearGradient>
        </defs>
        <line x1="6.5%" y1="20" x2="93.5%" y2="20" stroke="url(#lineGrad)" strokeWidth="2" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        {nodes.map(n => {
          const isActive = n.idx === step;
          const isDone = n.idx < step;
          const size = isActive ? 18 : isDone ? 12 : 8;
          return (
            <div key={n.idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: size, height: size, borderRadius: '50%',
                background: isDone || isActive ? n.accent : 'rgba(255,255,255,0.2)',
                boxShadow: isDone ? `0 0 12px ${n.accent}, 0 0 24px ${hexToRgba(n.accent, 0.4)}` :
                           isActive ? `0 0 20px ${n.accent}, 0 0 40px ${hexToRgba(n.accent, 0.5)}` : 'none',
                animation: isActive ? 'pulse 2s ease-in-out infinite' : 'none',
                transition: 'all 0.3s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isDone && <svg width="6" height="6" viewBox="0 0 6 6"><path d="M1 3l1.5 1.5L5 1" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>}
              </div>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 700 : 400,
                color: isActive ? n.accent : 'rgba(255,255,255,0.4)',
                letterSpacing: '0.05em', textTransform: 'uppercase',
                fontFamily: "'DM Sans', sans-serif",
              }}>{n.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Chip Component ─────────────────────────────────────────────────────────
const Chip: React.FC<{ label: string; selected: boolean; accent: string; onClick: () => void }> = ({ label, selected, accent, onClick }) => (
  <button onClick={onClick} style={{
    padding: '8px 16px', borderRadius: 100,
    border: `1px solid ${selected ? accent : 'rgba(255,255,255,0.15)'}`,
    background: selected ? hexToRgba(accent, 0.2) : 'transparent',
    color: selected ? accent : 'rgba(255,255,255,0.7)',
    fontSize: 13, fontWeight: selected ? 600 : 400,
    cursor: 'pointer', transition: 'all 0.12s ease',
    transform: selected ? 'scale(1.05)' : 'scale(1)',
    boxShadow: selected ? `0 0 12px ${hexToRgba(accent, 0.3)}` : 'none',
    fontFamily: "'DM Sans', sans-serif",
    whiteSpace: 'nowrap',
  }}>{label}</button>
);

// ── Segmented Control ──────────────────────────────────────────────────────
const SegmentedControl: React.FC<{
  options: string[]; value: string; onChange: (v: string) => void; accent: string;
}> = ({ options, value, onChange, accent }) => (
  <div style={{
    display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 12,
    padding: 4, gap: 4, border: '1px solid rgba(255,255,255,0.1)',
  }}>
    {options.map(opt => (
      <button key={opt} onClick={() => onChange(opt)} style={{
        flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none',
        background: value === opt ? accent : 'transparent',
        color: value === opt ? '#000' : 'rgba(255,255,255,0.6)',
        fontWeight: value === opt ? 700 : 400, fontSize: 13,
        cursor: 'pointer', transition: 'all 0.15s ease',
        fontFamily: "'DM Sans', sans-serif",
      }}>{opt}</button>
    ))}
  </div>
);

// ── Social Proof Rotator ───────────────────────────────────────────────────
const proofs = [
  'Priya from Delhi got into UC Berkeley after completing this',
  'Arjun from Mumbai matched with 34 universities',
  'Sana from Dubai received 3 scholarship alerts',
  'Rohan from Bangalore found his perfect CS program in 2 minutes',
];

const SocialProof: React.FC = () => {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(i => (i + 1) % proofs.length); setVisible(true); }, 400);
    }, 4000);
    return () => clearInterval(interval);
  }, []);
  return (
    <div style={{ textAlign: 'center', marginTop: 24, minHeight: 20 }}>
      <span style={{
        fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic',
        transition: 'opacity 0.4s ease', opacity: visible ? 1 : 0,
        fontFamily: "'DM Sans', sans-serif",
      }}>"{proofs[idx]}"</span>
    </div>
  );
};

// ── Profile Preview Card ───────────────────────────────────────────────────
const ProfileCard: React.FC<{ name: string; country: string; dreamSchool: string }> = ({ name, country, dreamSchool }) => (
  <div style={{
    background: 'linear-gradient(135deg, #12122A 0%, #1A1A3E 100%)',
    border: '1px solid rgba(108,99,255,0.3)',
    borderRadius: 20, padding: '32px 28px', position: 'relative', overflow: 'hidden',
    boxShadow: '0 0 40px rgba(108,99,255,0.15)',
  }}>
    {/* Mesh gradient bg */}
    <div style={{
      position: 'absolute', top: -60, right: -60, width: 200, height: 200,
      background: 'radial-gradient(circle, rgba(108,99,255,0.3) 0%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none',
    }} />
    <div style={{
      position: 'absolute', bottom: -40, left: -40, width: 160, height: 160,
      background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, transparent 70%)',
      borderRadius: '50%', pointerEvents: 'none',
    }} />
    {/* Crest placeholder */}
    <div style={{
      width: 48, height: 48, borderRadius: 12,
      background: 'rgba(108,99,255,0.2)', border: '1px solid rgba(108,99,255,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginBottom: 20, fontSize: 22,
    }}>🎓</div>
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>ADMISSIONS PROFILE</div>
    <div style={{
      fontSize: name ? 28 : 20, fontWeight: 800, color: name ? '#fff' : 'rgba(255,255,255,0.2)',
      marginBottom: 8, minHeight: 40, fontFamily: "'Clash Display', 'DM Sans', sans-serif",
      transition: 'all 0.2s ease',
    }}>{name || 'Your Name'}</div>
    {country && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>📍 {country}</div>}
    {dreamSchool && <div style={{ fontSize: 13, color: 'rgba(108,99,255,0.8)', marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>🎯 {dreamSchool}</div>}
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>PROFILE STRENGTH</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <div style={{ width: '15%', height: '100%', background: '#6C63FF', borderRadius: 4, transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif" }}>Building...</span>
      </div>
    </div>
    {/* Blurred match cards preview */}
    <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          flex: 1, height: 48, borderRadius: 8,
          background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          filter: 'blur(2px)',
        }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>#{i}</span>
        </div>
      ))}
    </div>
    <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'DM Sans', sans-serif" }}>
      Your matches unlock at the end
    </div>
  </div>
);

// ── GPA Score Display ──────────────────────────────────────────────────────
const GPADisplay: React.FC<{ value: string; accent: string }> = ({ value, accent }) => {
  const numVal = parseFloat(value);
  let label = '', labelColor = accent;
  if (!isNaN(numVal) && value) {
    if (numVal >= 85 || numVal >= 3.5) { label = 'Strong academic profile'; labelColor = '#10B981'; }
    else if (numVal >= 75 || numVal >= 3.0) { label = 'Solid foundation'; labelColor = accent; }
    else if (numVal > 0) { label = "We'll find programs that fit"; labelColor = '#F59E0B'; }
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 72, fontWeight: 800, color: value ? '#fff' : 'rgba(255,255,255,0.15)',
        lineHeight: 1, marginBottom: 8, fontFamily: "'Clash Display', 'DM Sans', sans-serif",
        transition: 'color 0.2s ease',
      }}>{value || '—'}</div>
      {label && (
        <div style={{ fontSize: 14, color: labelColor, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.3s ease' }}>
          {label}
        </div>
      )}
    </div>
  );
};

// ── Score Range Bar ────────────────────────────────────────────────────────
const ScoreBar: React.FC<{ value: number; min: number; max: number; accent: string }> = ({ value, min, max, accent }) => {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1) * 100;
  return (
    <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginTop: 8 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 4, transition: 'width 0.3s ease', boxShadow: `0 0 8px ${hexToRgba(accent, 0.5)}` }} />
    </div>
  );
};

// ── Archetype Engine ───────────────────────────────────────────────────────
const getArchetype = (skills: string[]): string => {
  const s = new Set(skills);
  if (s.has('Programming') && s.has('Mathematics') && s.has('Analytical Thinking')) return 'The Builder 🔧';
  if (s.has('Leadership') && s.has('Communication') && s.has('Public Speaking')) return 'The Catalyst 🚀';
  if (s.has('Creativity') && s.has('Design')) return 'The Visionary 🎨';
  if (s.has('Research') && s.has('Science')) return 'The Explorer 🔭';
  if (s.has('Writing') && s.has('Languages')) return 'The Storyteller ✍️';
  if (s.has('Teamwork') && s.has('Leadership')) return 'The Organizer 🎯';
  if (skills.length >= 4) return 'The Renaissance Mind 🌟';
  if (skills.length >= 2) return 'The Specialist ⚡';
  return '';
};

// ── Sentiment Engine ───────────────────────────────────────────────────────
const getSentiment = (text: string): string => {
  const t = text.toLowerCase();
  if (t.includes('family') || t.includes('parents') || t.includes('legacy')) return 'Motivated by: Legacy 🏛️';
  if (t.includes('career') || t.includes('job') || t.includes('money') || t.includes('success')) return 'Motivated by: Ambition 🎯';
  if (t.includes('curious') || t.includes('learn') || t.includes('knowledge') || t.includes('discover')) return 'Motivated by: Discovery 🔭';
  if (t.includes('friend') || t.includes('community') || t.includes('network') || t.includes('people')) return 'Motivated by: Connection 🤝';
  if (t.includes('passion') || t.includes('love') || t.includes('dream')) return 'Motivated by: Passion 💫';
  return '';
};

// ── Country Cards ──────────────────────────────────────────────────────────
const COUNTRIES_DATA = [
  { name: 'USA', flag: '🇺🇸', desc: 'Innovation Hub' },
  { name: 'UK', flag: '🇬🇧', desc: 'Academic Prestige' },
  { name: 'Canada', flag: '🇨🇦', desc: 'Quality of Life' },
  { name: 'Australia', flag: '🇦🇺', desc: 'Global Outlook' },
  { name: 'Germany', flag: '🇩🇪', desc: 'Research Excellence' },
  { name: 'Netherlands', flag: '🇳🇱', desc: 'English-Taught Programs' },
  { name: 'Singapore', flag: '🇸🇬', desc: 'Asia Gateway' },
  { name: 'Ireland', flag: '🇮🇪', desc: 'Tech & Culture' },
];

// ── Activities Step ────────────────────────────────────────────────────────
const ACTIVITY_TYPES = ['Academic Club','Athletics/Sports','Arts/Music/Drama','Community Service','Research/Science','Student Government','Debate/Speech','Journalism/Publication','Religious/Cultural','Work Experience','Internship','Entrepreneurship','Other'];

const TIER_DATA = {
  1: { name: 'National / International', desc: 'National competitions, published research, international recognition', color: '#FFD700' },
  2: { name: 'State / Regional', desc: 'State awards, regional leadership, significant community impact', color: '#C0C0C0' },
  3: { name: 'School Leadership', desc: 'Club president, team captain, significant school role', color: '#CD7F32' },
  4: { name: 'Participation', desc: 'Club member, general participation, personal hobbies', color: '#666' },
};

const emptyActivity: StructuredActivity = { name: '', type: '', tier: 4, yearsInvolved: 1, hoursPerWeek: 2, leadership: '', achievements: '' };

// ── Radar Visualization ────────────────────────────────────────────────────
const RADAR_AXES = ['Academic', 'Athletic', 'Arts', 'Service', 'Leadership', 'Research'];
const ACTIVITY_TYPE_MAP: Record<string, number> = {
  'Academic Club': 0, 'Research/Science': 5,
  'Athletics/Sports': 1,
  'Arts/Music/Drama': 2, 'Journalism/Publication': 2,
  'Community Service': 3, 'Religious/Cultural': 3,
  'Student Government': 4, 'Debate/Speech': 4, 'Entrepreneurship': 4,
  'Work Experience': 0, 'Internship': 5,
};

const RadarChart: React.FC<{ activities: StructuredActivity[]; accent: string }> = ({ activities, accent }) => {
  const cx = 120, cy = 120, r = 90;
  const axes = RADAR_AXES.length;
  const scores = Array(axes).fill(0);
  activities.forEach(a => {
    const axIdx = ACTIVITY_TYPE_MAP[a.type] ?? 0;
    scores[axIdx] = Math.min(scores[axIdx] + (5 - a.tier) * 2, 10);
  });
  const max = 10;
  const getPoint = (angle: number, val: number) => {
    const a = (angle * Math.PI * 2) / axes - Math.PI / 2;
    return { x: cx + (r * val / max) * Math.cos(a), y: cy + (r * val / max) * Math.sin(a) };
  };
  const getAxisEnd = (i: number) => {
    const a = (i * Math.PI * 2) / axes - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const hasData = scores.some(s => s > 0);
  const polyPoints = scores.map((s, i) => getPoint(i, s));
  const polyStr = polyPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width="240" height="240" style={{ overflow: 'visible' }}>
      {/* Grid rings */}
      {[2,4,6,8,10].map(ring => {
        const pts = Array.from({ length: axes }, (_, i) => getPoint(i, ring));
        return <polygon key={ring} points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />;
      })}
      {/* Axis lines */}
      {Array.from({ length: axes }, (_, i) => {
        const end = getAxisEnd(i);
        return <line key={i} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />;
      })}
      {/* Data shape */}
      {hasData && (
        <>
          <polygon points={polyStr} fill={hexToRgba(accent, 0.2)} stroke={accent} strokeWidth="2" />
          {polyPoints.map((p, i) => scores[i] > 0 && (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill={accent} style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />
          ))}
        </>
      )}
      {/* Labels */}
      {Array.from({ length: axes }, (_, i) => {
        const end = getAxisEnd(i);
        const lx = cx + (r + 20) * Math.cos((i * Math.PI * 2) / axes - Math.PI / 2);
        const ly = cy + (r + 20) * Math.sin((i * Math.PI * 2) / axes - Math.PI / 2);
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="'DM Sans', sans-serif">{RADAR_AXES[i]}</text>;
      })}
    </svg>
  );
};

// ── Activities Step Component ──────────────────────────────────────────────
const ActivitiesOnboardingStep: React.FC<{
  activities: StructuredActivity[];
  onActivitiesChange: (a: StructuredActivity[]) => void;
  accent: string;
}> = ({ activities, onActivitiesChange, accent }) => {
  const structured: StructuredActivity[] = Array.isArray(activities)
    ? activities.filter((a): a is StructuredActivity => a && typeof a === 'object' && 'name' in a)
    : [];
  const [editing, setEditing] = useState<number | null>(structured.length === 0 ? 0 : null);
  const [current, setCurrent] = useState<StructuredActivity>(emptyActivity);
  const init = useRef(false);

  useEffect(() => {
    if (!init.current && structured.length === 0) {
      init.current = true;
      onActivitiesChange([{ ...emptyActivity }]);
      setEditing(0);
    }
  }, []);

  const validCount = structured.filter(a => a.name.trim().length > 0).length;
  const surface = STEP_THEMES[4].surface;

  const save = () => {
    if (editing === null) return;
    const next = [...structured]; next[editing] = current;
    onActivitiesChange(next); setEditing(null);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, minHeight: 500 }}>
      {/* Left panel */}
      <div>
        <div style={{ fontSize: 42, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 8, fontFamily: "'Clash Display', 'DM Sans', sans-serif" }}>
          Your<br />
          <span style={{ color: accent }}>Spike.</span>
        </div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 24, fontFamily: "'DM Sans', sans-serif" }}>
          Colleges don't want well-rounded students. They want well-rounded <em>classes</em>. What makes you irreplaceable?
        </p>

        <div style={{
          background: validCount >= 2 ? hexToRgba('#10B981', 0.1) : hexToRgba('#F59E0B', 0.1),
          border: `1px solid ${validCount >= 2 ? '#10B981' : '#F59E0B'}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13,
          color: validCount >= 2 ? '#10B981' : '#F59E0B', fontFamily: "'DM Sans', sans-serif",
        }}>
          {validCount >= 2 ? '✅' : '⚠️'} {validCount}/2 required activities added
        </div>

        {/* Activity list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {structured.map((act, i) => act.name.trim() && editing !== i ? (
            <div key={i} style={{
              background: surface, border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: `3px solid ${TIER_DATA[act.tier as keyof typeof TIER_DATA]?.color || '#666'}`,
              borderRadius: 10, padding: '12px 14px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif" }}>{act.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>
                  {act.type} · {act.yearsInvolved}yr · {act.hoursPerWeek}h/wk
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setCurrent(act); setEditing(i); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>✏️</button>
                <button onClick={() => { if (structured.length > 1) onActivitiesChange(structured.filter((_,j) => j !== i)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>🗑️</button>
              </div>
            </div>
          ) : null)}
        </div>

        {/* Add btn */}
        {structured.length < 10 && editing === null && (
          <button onClick={() => { onActivitiesChange([...structured, { ...emptyActivity }]); setEditing(structured.length); setCurrent({ ...emptyActivity }); }} style={{
            width: '100%', padding: '12px', border: `2px dashed ${hexToRgba(accent, 0.4)}`,
            borderRadius: 10, background: 'none', color: hexToRgba(accent, 0.8), cursor: 'pointer',
            fontSize: 14, fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
          }}>+ Add Activity</button>
        )}

        {/* Editing form */}
        {editing !== null && (
          <div style={{
            background: surface, border: `1px solid ${hexToRgba(accent, 0.3)}`,
            borderRadius: 12, padding: 20, marginTop: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'DM Sans', sans-serif" }}>
              {current.name ? 'Edit Activity' : 'New Activity'}
            </div>
            <input
              value={current.name} onChange={e => setCurrent({ ...current, name: e.target.value })}
              placeholder="Activity name *"
              style={inputStyle(accent)}
            />
            <select value={current.type} onChange={e => setCurrent({ ...current, type: e.target.value })} style={{ ...inputStyle(accent), marginTop: 10 }}>
              <option value="">Select type</option>
              {ACTIVITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {/* Tier bar */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>Tier</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', height: 36 }}>
                {[1,2,3,4].map(tier => (
                  <button key={tier} onClick={() => setCurrent({ ...current, tier })} style={{
                    flex: 1, height: '100%', border: 'none', cursor: 'pointer',
                    background: current.tier === tier ? TIER_DATA[tier as keyof typeof TIER_DATA].color : 'transparent',
                    color: current.tier === tier ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: 11, fontWeight: current.tier === tier ? 700 : 400,
                    transition: 'all 0.15s', fontFamily: "'DM Sans', sans-serif",
                  }}>{tier === 1 ? 'Natl' : tier === 2 ? 'State' : tier === 3 ? 'School' : 'Partic.'}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
                {TIER_DATA[current.tier as keyof typeof TIER_DATA]?.desc}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <input type="number" value={current.yearsInvolved} onChange={e => setCurrent({ ...current, yearsInvolved: +e.target.value })} style={inputStyle(accent)} min={1} max={4} placeholder="Years" />
              <input type="number" value={current.hoursPerWeek} onChange={e => setCurrent({ ...current, hoursPerWeek: +e.target.value })} style={inputStyle(accent)} min={1} max={40} placeholder="Hrs/week" />
            </div>
            <input value={current.leadership} onChange={e => setCurrent({ ...current, leadership: e.target.value })} placeholder="Role/position" style={{ ...inputStyle(accent), marginTop: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={save} disabled={!current.name.trim()} style={{
                padding: '10px 20px', background: accent, border: 'none', borderRadius: 8,
                color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                fontFamily: "'DM Sans', sans-serif", opacity: current.name.trim() ? 1 : 0.4,
              }}>Save</button>
              <button onClick={() => setEditing(null)} style={{
                padding: '10px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — radar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'DM Sans', sans-serif" }}>Your Spike Map</div>
        <RadarChart activities={structured} accent={accent} />
        {validCount === 0 && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontFamily: "'DM Sans', sans-serif" }}>
            Add activities to see your fingerprint form
          </div>
        )}
      </div>
    </div>
  );
};

const inputStyle = (accent: string): React.CSSProperties => ({
  width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff', fontSize: 14,
  outline: 'none', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
  transition: 'border-color 0.15s',
});

// ── Loading Overlay ────────────────────────────────────────────────────────
const LoadingSequence: React.FC<{ name: string; onDone: () => void }> = ({ name, onDone }) => {
  const messages = [
    'Scanning 2,847 universities...',
    'Matching academic profile...',
    'Analyzing your spike...',
    'Calculating scholarship eligibility...',
    `Found 47 strong matches for ${name || 'you'} 🎉`,
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (idx < messages.length - 1) {
      const t = setTimeout(() => setIdx(i => i + 1), 800);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(onDone, 1200);
      return () => clearTimeout(t);
    }
  }, [idx]);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#050508', zIndex: 1000,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: "'Clash Display', 'DM Sans', sans-serif", textAlign: 'center' }}>
        {messages[idx]}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {messages.map((_, i) => (
          <div key={i} style={{
            width: i === idx ? 24 : 8, height: 8, borderRadius: 4,
            background: i === idx ? '#FFD700' : 'rgba(255,255,255,0.15)',
            transition: 'all 0.3s ease',
          }} />
        ))}
      </div>
    </div>
  );
};

// ── Circular Progress Ring ─────────────────────────────────────────────────
const ProfileRing: React.FC<{ score: number }> = ({ score }) => {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = score / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= score) { setDisplayed(score); clearInterval(timer); }
      else setDisplayed(Math.round(start));
    }, 25);
    return () => clearInterval(timer);
  }, [score]);
  const r = 90, c = 2 * Math.PI * r;
  const pct = (displayed / 100) * c;
  return (
    <svg width="200" height="200">
      <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle cx="100" cy="100" r={r} fill="none" stroke="#FFD700" strokeWidth="10"
        strokeDasharray={`${pct} ${c}`} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', filter: 'drop-shadow(0 0 12px rgba(255,215,0,0.6))' }}
      />
      <text x="100" y="95" textAnchor="middle" dominantBaseline="middle" fill="#FFD700" fontSize="36" fontWeight="800" fontFamily="'DM Sans', sans-serif">{displayed}</text>
      <text x="100" y="125" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize="12" fontFamily="'DM Sans', sans-serif">Profile Score</text>
    </svg>
  );
};

// ── Between-step Insight ───────────────────────────────────────────────────
const Insight: React.FC<{ message: string; onDone: () => void }> = ({ message, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(8px)',
    }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', textAlign: 'center', maxWidth: 500, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif", padding: '0 24px' }}>
        {message}
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────
const StudentOnboarding: React.FC<StudentOnboardingProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [showInsight, setShowInsight] = useState(false);
  const [insightMsg, setInsightMsg] = useState('');
  const [showLoading, setShowLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);

  const [studentData, setStudentData] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('onboarding_data');
      return saved ? JSON.parse(saved) : defaultData();
    } catch { return defaultData(); }
  });

  function defaultData() {
    return {
      name: '', grade: '', currentBoard: '', country: '', dreamSchool: '',
      currentGPA: '', satScore: '', actScore: '', ibPredicted: '', subjects: [],
      careerInterests: [], majorCertain: null, potentialMajors: [], skillsStrengths: [],
      preferredCountries: [], budgetRange: '', campusSize: '', locationPreference: '',
      activities: [], leadership: [], awards: [],
      careerGoals: '', whyCollege: '',
    };
  }

  const updateData = useCallback((field: string, value: any) => {
    setStudentData((prev: any) => {
      const next = { ...prev, [field]: value };
      try { localStorage.setItem('onboarding_data', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const theme = STEP_THEMES[step - 1];
  const { accent, bg, surface } = theme;

  const calcUniCount = (gpa: string): number => {
    const v = parseFloat(gpa);
    if (isNaN(v)) return 400;
    if (v >= 90 || v >= 3.7) return 1200;
    if (v >= 80 || v >= 3.3) return 900;
    if (v >= 70 || v >= 3.0) return 600;
    return 400;
  };

  const triggerInsight = (msg: string) => {
    setInsightMsg(msg);
    setShowInsight(true);
  };

  const nextStep = () => {
    if (step === 2) {
      triggerInsight(`Got it, ${studentData.name || 'you'}. With a ${studentData.currentGPA} average, you're academically eligible for ${calcUniCount(studentData.currentGPA)} universities in our network.`);
    } else if (step === 6) {
      const theme = getSentiment(studentData.whyCollege);
      if (theme) triggerInsight(`${studentData.name || 'You'}, your goals show deep ${theme.toLowerCase().replace('motivated by: ', '')}. Universities love applicants who know their why. You're building a compelling narrative.`);
      else doNextStep();
    } else {
      doNextStep();
    }
  };

  const doNextStep = () => {
    setTransitioning(true);
    setTimeout(() => { setStep(s => Math.min(s + 1, 7)); setTransitioning(false); }, 280);
  };

  const prevStep = () => {
    setTransitioning(true);
    setTimeout(() => { setStep(s => Math.max(s - 1, 1)); setTransitioning(false); }, 280);
  };

  const isStepComplete = (): boolean => {
    switch(step) {
      case 1: return !!(studentData.name && studentData.country);
      case 2: return !!(studentData.currentGPA && studentData.subjects.length > 0);
      case 3: return studentData.majorCertain !== null && studentData.potentialMajors.length > 0;
      case 4: return studentData.preferredCountries.length > 0 && !!studentData.budgetRange;
      case 5: {
        const valid = Array.isArray(studentData.activities)
          ? studentData.activities.filter((a: any) => a?.name?.trim?.().length > 0)
          : [];
        return valid.length >= 2;
      }
      case 6: return studentData.careerGoals.trim().length > 0;
      case 7: return true;
      default: return false;
    }
  };

  const calcProfileScore = (): number => {
    let score = 0;
    if (studentData.name) score += 10;
    if (studentData.currentGPA) score += 15;
    if (studentData.subjects.length > 0) score += 10;
    if (studentData.potentialMajors.length > 0) score += 10;
    if (studentData.preferredCountries.length > 0) score += 10;
    if (studentData.activities.filter((a: any) => a?.name?.trim()).length >= 2) score += 20;
    if (studentData.careerGoals.length > 50) score += 15;
    if (studentData.whyCollege.length > 50) score += 10;
    return Math.min(Math.max(score, 60), 97);
  };

  const majors = ['Computer Science','Engineering','Business / Management','Medicine','Psychology','Economics','Data Science','Biology','Mathematics','Physics','Chemistry','Arts & Design','Political Science','Law','Architecture','Environmental Science','Communications','Undecided'];
  const skills = ['Problem Solving','Creativity','Analytical Thinking','Leadership','Communication','Research','Programming','Writing','Mathematics','Science','Languages','Public Speaking','Teamwork','Design'];
  const subjects = ['Mathematics','Physics','Chemistry','Biology','Computer Science','Economics','History','English','Literature','Geography'];
  const BUDGETS = [
    { val: 'under-20k', label: 'Under $20,000 / yr', note: '~$800 universities globally' },
    { val: '20-40k', label: '$20,000 – $40,000 / yr', note: '~1,200 universities globally' },
    { val: '40-60k', label: '$40,000 – $60,000 / yr', note: '~1,800 universities globally' },
    { val: '60k+', label: '$60,000+ / yr', note: 'All top programs accessible' },
    { val: 'aid', label: 'Need Full Financial Aid', note: 'Scholarship-targeted search' },
  ];

  const stepContent = () => {
    switch(step) {
      // ── STEP 1 ──────────────────────────────────────────────────────────
      case 1: return (
        <div style={{ display: 'grid', gridTemplateColumns: '55% 45%', gap: 48 }}>
          <div>
            <h1 style={{ fontSize: 48, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 12, letterSpacing: '-0.02em', fontFamily: "'Clash Display', 'DM Sans', sans-serif" }}>
              Your college<br />journey starts<br /><span style={{ color: accent }}>here.</span>
            </h1>
            <p style={{ fontSize: 18, color: hexToRgba(accent, 0.7), marginBottom: 40, fontFamily: "'DM Sans', sans-serif" }}>
              Tell us who you are.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <label style={labelStyle}>Your Name</label>
                <input value={studentData.name} onChange={e => updateData('name', e.target.value)}
                  placeholder="First name is fine" style={{ ...bigInputStyle(accent), marginTop: 6 }} />
              </div>
              <div>
                <label style={labelStyle}>Dream School <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span></label>
                <input value={studentData.dreamSchool} onChange={e => updateData('dreamSchool', e.target.value)}
                  placeholder="e.g., MIT, Harvard, anywhere with good CS" style={{ ...inputFieldStyle(accent), marginTop: 6 }} />
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <select value={studentData.country} onChange={e => updateData('country', e.target.value)} style={{ ...inputFieldStyle(accent), marginTop: 6 }}>
                  <option value="">Select your country</option>
                  {['India','USA','UK','Canada','Singapore','UAE','Pakistan','Bangladesh','Sri Lanka','Nepal','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <SocialProof />
          </div>
          <ProfileCard name={studentData.name} country={studentData.country} dreamSchool={studentData.dreamSchool} />
        </div>
      );

      // ── STEP 2 ──────────────────────────────────────────────────────────
      case 2: return (
        <div>
          <h1 style={headlineStyle(accent)}>Academic<br /><span style={{ color: accent }}>Profile.</span></h1>
          <p style={subStyle(accent)}>Your numbers tell part of the story.</p>
          <div style={{ marginTop: 32 }}>
            <label style={labelStyle}>GPA / Percentage</label>
            <div style={{ background: surface, border: `1px solid ${hexToRgba(accent, 0.3)}`, borderRadius: 16, padding: '24px 32px', marginTop: 10, textAlign: 'center' }}>
              <input value={studentData.currentGPA} onChange={e => updateData('currentGPA', e.target.value)}
                placeholder="90%" style={{ background: 'none', border: 'none', outline: 'none', fontSize: 64, fontWeight: 800, color: '#fff', width: '100%', textAlign: 'center', fontFamily: "'Clash Display', 'DM Sans', sans-serif" }} />
              {studentData.currentGPA && <GPADisplay value={studentData.currentGPA} accent={accent} />}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
            <div>
              <label style={labelStyle}>SAT Score <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span></label>
              <input type="number" value={studentData.satScore} onChange={e => updateData('satScore', e.target.value)}
                placeholder="400–1600" style={{ ...inputFieldStyle(accent), marginTop: 6 }} />
              <ScoreBar value={+studentData.satScore} min={400} max={1600} accent={accent} />
            </div>
            <div>
              <label style={labelStyle}>ACT Score <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span></label>
              <input type="number" value={studentData.actScore} onChange={e => updateData('actScore', e.target.value)}
                placeholder="1–36" style={{ ...inputFieldStyle(accent), marginTop: 6 }} />
              <ScoreBar value={+studentData.actScore} min={1} max={36} accent={accent} />
            </div>
          </div>
          <div style={{ marginTop: 28 }}>
            <label style={labelStyle}>Current Subjects</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {subjects.map(s => (
                <Chip key={s} label={s} selected={studentData.subjects.includes(s)} accent={accent}
                  onClick={() => {
                    const next = studentData.subjects.includes(s)
                      ? studentData.subjects.filter((x: string) => x !== s)
                      : [...studentData.subjects, s];
                    updateData('subjects', next);
                  }} />
              ))}
            </div>
          </div>
        </div>
      );

      // ── STEP 3 ──────────────────────────────────────────────────────────
      case 3: return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <div>
            <h1 style={headlineStyle(accent)}>Interests &amp;<br /><span style={{ color: accent }}>Major.</span></h1>
            <p style={subStyle(accent)}>What lights you up?</p>
            {/* Toggle */}
            <div style={{ marginTop: 28, marginBottom: 24 }}>
              <label style={labelStyle}>Major Certainty</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
                <span style={{ fontSize: 13, color: studentData.majorCertain === false ? accent : 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif" }}>Exploring</span>
                <div onClick={() => updateData('majorCertain', !studentData.majorCertain)} style={{
                  width: 52, height: 28, borderRadius: 14,
                  background: studentData.majorCertain ? accent : 'rgba(255,255,255,0.15)',
                  position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  border: `1px solid ${hexToRgba(accent, 0.4)}`,
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: studentData.majorCertain ? 26 : 3,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s ease', boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                  }} />
                </div>
                <span style={{ fontSize: 13, color: studentData.majorCertain === true ? accent : 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif" }}>Decided</span>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>
                {studentData.majorCertain ? "Great — select your intended major." : "No worries — pick a few you're curious about."}
              </p>
            </div>
            {/* Major list */}
            <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, paddingRight: 8 }}>
              {majors.map(m => {
                const selected = studentData.potentialMajors.includes(m);
                return (
                  <Chip key={m} label={m} selected={selected} accent={accent} onClick={() => {
                    if (studentData.majorCertain) { updateData('potentialMajors', [m]); return; }
                    if (selected) updateData('potentialMajors', studentData.potentialMajors.filter((x: string) => x !== m));
                    else if (studentData.potentialMajors.length < 3) updateData('potentialMajors', [...studentData.potentialMajors, m]);
                  }} />
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, marginTop: 68, fontFamily: "'DM Sans', sans-serif" }}>Skills &amp; Strengths</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {skills.map(sk => (
                <Chip key={sk} label={sk} selected={studentData.skillsStrengths.includes(sk)} accent={accent}
                  onClick={() => {
                    const next = studentData.skillsStrengths.includes(sk)
                      ? studentData.skillsStrengths.filter((x: string) => x !== sk)
                      : [...studentData.skillsStrengths, sk];
                    updateData('skillsStrengths', next);
                  }} />
              ))}
            </div>
            {/* Archetype */}
            {getArchetype(studentData.skillsStrengths) && (
              <div style={{
                marginTop: 24, padding: '16px 20px',
                background: hexToRgba(accent, 0.12), border: `1px solid ${hexToRgba(accent, 0.4)}`,
                borderRadius: 12, transition: 'all 0.3s ease',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Your Archetype</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: accent, fontFamily: "'DM Sans', sans-serif" }}>{getArchetype(studentData.skillsStrengths)}</div>
              </div>
            )}
          </div>
        </div>
      );

      // ── STEP 4 ──────────────────────────────────────────────────────────
      case 4: return (
        <div>
          <h1 style={headlineStyle(accent)}>Your<br /><span style={{ color: accent }}>Dream.</span></h1>
          <p style={subStyle(accent)}>Where do you want to build your future?</p>
          {/* Country cards */}
          <div style={{ marginTop: 32 }}>
            <label style={labelStyle}>Preferred Countries</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
              {COUNTRIES_DATA.map(c => {
                const sel = studentData.preferredCountries.includes(c.name);
                return (
                  <button key={c.name} onClick={() => {
                    const next = sel ? studentData.preferredCountries.filter((x: string) => x !== c.name) : [...studentData.preferredCountries, c.name];
                    updateData('preferredCountries', next);
                  }} style={{
                    width: 140, padding: '16px 12px', borderRadius: 14, cursor: 'pointer',
                    background: sel ? hexToRgba(accent, 0.2) : surface,
                    border: `1px solid ${sel ? accent : 'rgba(255,255,255,0.1)'}`,
                    textAlign: 'left', transition: 'all 0.15s ease',
                    boxShadow: sel ? `0 0 16px ${hexToRgba(accent, 0.3)}` : 'none',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{c.flag}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif" }}>{c.desc}</div>
                    {sel && <div style={{ position: 'absolute', top: 8, right: 8, width: 16, height: 16, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>✓</div>}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Budget */}
          <div style={{ marginTop: 32 }}>
            <label style={labelStyle}>Annual Budget</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
              {BUDGETS.map(b => {
                const sel = studentData.budgetRange === b.val;
                return (
                  <button key={b.val} onClick={() => updateData('budgetRange', b.val)} style={{
                    padding: '12px 18px', borderRadius: 10, cursor: 'pointer',
                    background: sel ? hexToRgba(accent, 0.2) : surface,
                    border: `1px solid ${sel ? accent : 'rgba(255,255,255,0.1)'}`,
                    color: sel ? accent : 'rgba(255,255,255,0.7)',
                    fontWeight: sel ? 700 : 400, fontSize: 13,
                    fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                    boxShadow: sel ? `0 0 12px ${hexToRgba(accent, 0.25)}` : 'none',
                  }}>
                    <div>{b.label}</div>
                    {sel && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{b.note}</div>}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Size & Location */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 28 }}>
            <div>
              <label style={labelStyle}>Campus Size</label>
              <SegmentedControl
                options={['Small', 'Medium', 'Large', 'Any']}
                value={studentData.campusSize}
                onChange={v => updateData('campusSize', v.toLowerCase())}
                accent={accent}
              />
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <SegmentedControl
                options={['Urban', 'Suburban', 'Rural', 'Any']}
                value={studentData.locationPreference ? (studentData.locationPreference.charAt(0).toUpperCase() + studentData.locationPreference.slice(1)) : ''}
                onChange={v => updateData('locationPreference', v.toLowerCase())}
                accent={accent}
              />
            </div>
          </div>
        </div>
      );

      // ── STEP 5 ──────────────────────────────────────────────────────────
      case 5: return (
        <ActivitiesOnboardingStep
          activities={studentData.activities}
          onActivitiesChange={acts => updateData('activities', acts)}
          accent={accent}
        />
      );

      // ── STEP 6 ──────────────────────────────────────────────────────────
      case 6: return (
        <div style={{ maxWidth: 640 }}>
          <h1 style={headlineStyle(accent)}>Your<br /><span style={{ color: accent }}>Goals.</span></h1>
          <p style={subStyle(accent)}>What drives you? This is where the story gets real.</p>
          <div style={{ marginTop: 40 }}>
            <label style={labelStyle}>Career Goals</label>
            <textarea value={studentData.careerGoals} onChange={e => updateData('careerGoals', e.target.value)}
              placeholder="What do you want to do after college? Be specific — the more detail, the better your matches."
              rows={5} style={{
                ...inputFieldStyle(accent), marginTop: 10, resize: 'none', lineHeight: 1.7,
                fontSize: 16, padding: '16px 20px',
              }} />
            <div style={{ fontSize: 11, color: studentData.careerGoals.length >= 100 ? '#10B981' : 'rgba(255,255,255,0.3)', marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
              {studentData.careerGoals.length >= 100 ? '✅ Great detail' : `${studentData.careerGoals.length}/100 chars for strong match`}
            </div>
          </div>
          <div style={{ marginTop: 32 }}>
            <label style={labelStyle}>Why College?</label>
            <textarea value={studentData.whyCollege} onChange={e => updateData('whyCollege', e.target.value)}
              placeholder="What do you hope to gain? Research? Network? A specific program? Personal growth?"
              rows={4} style={{
                ...inputFieldStyle(accent), marginTop: 10, resize: 'none', lineHeight: 1.7,
                fontSize: 16, padding: '16px 20px', borderColor: getSentiment(studentData.whyCollege) ? hexToRgba(accent, 0.5) : undefined,
              }} />
            {getSentiment(studentData.whyCollege) && (
              <div style={{
                fontSize: 13, color: accent, marginTop: 8, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif", transition: 'all 0.3s',
              }}>✨ {getSentiment(studentData.whyCollege)}</div>
            )}
          </div>
        </div>
      );

      // ── STEP 7 ──────────────────────────────────────────────────────────
      case 7: return (
        <div style={{ textAlign: 'center', position: 'relative' }}>
          {/* Particles */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            {Array.from({ length: 16 }, (_, i) => (
              <div key={i} style={{
                position: 'absolute',
                left: `${10 + Math.random() * 80}%`,
                bottom: '-10px',
                width: 3 + Math.random() * 4,
                height: 3 + Math.random() * 4,
                borderRadius: '50%',
                background: '#FFD700',
                opacity: 0.4 + Math.random() * 0.4,
                animation: `float ${3 + Math.random() * 4}s ease-in-out ${Math.random() * 3}s infinite`,
              }} />
            ))}
          </div>

          <h1 style={{ fontSize: 52, fontWeight: 900, color: '#fff', marginBottom: 16, letterSpacing: '-0.02em', fontFamily: "'Clash Display', 'DM Sans', sans-serif" }}>
            {studentData.name ? `${studentData.name},` : ''}<br />
            <span style={{ color: '#FFD700' }}>your matches are ready.</span>
          </h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', marginBottom: 48, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
            Based on your academic profile, interests, and spike — we found universities that want exactly who you are.
          </p>

          {/* Blurred match cards */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 48 }}>
            {['#1 Match', '#2 Match', '#3 Match'].map((label, i) => (
              <div key={i} style={{
                width: 180, padding: '28px 20px',
                background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.15)',
                borderRadius: 16, backdropFilter: 'blur(12px)',
                animation: 'shimmer 2s ease-in-out infinite',
                animationDelay: `${i * 0.3}s`,
              }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(255,215,0,0.1)', margin: '0 auto 12px', filter: 'blur(4px)' }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,215,0,0.6)', fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginTop: 8, filter: 'blur(2px)' }} />
                <div style={{ height: 8, width: '70%', background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginTop: 6, filter: 'blur(2px)' }} />
              </div>
            ))}
          </div>

          {/* Profile ring */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
            <ProfileRing score={calcProfileScore()} />
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8, fontFamily: "'DM Sans', sans-serif" }}>
              Your profile is in the top {100 - calcProfileScore()}% of applicants from {studentData.country || 'your region'}
            </div>
          </div>

          {/* Big CTA */}
          <button onClick={async () => {
            setShowLoading(true);
          }} style={{
            width: 280, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
            border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700,
            color: '#000', fontFamily: "'DM Sans', sans-serif",
            animation: 'glow-pulse 2s ease-in-out infinite',
            letterSpacing: '0.02em',
          }}>
            Reveal My Matches →
          </button>
        </div>
      );

      default: return null;
    }
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    fontFamily: "'DM Sans', sans-serif",
  };

  const headlineStyle = (acc: string): React.CSSProperties => ({
    fontSize: 48, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 10,
    letterSpacing: '-0.02em', fontFamily: "'Clash Display', 'DM Sans', sans-serif",
  });

  const subStyle = (acc: string): React.CSSProperties => ({
    fontSize: 18, color: hexToRgba(acc, 0.65), marginBottom: 0, fontFamily: "'DM Sans', sans-serif",
  });

  const inputFieldStyle = (acc: string): React.CSSProperties => ({
    width: '100%', padding: '14px 18px', background: surface,
    border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 12, color: '#fff', fontSize: 15,
    outline: 'none', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  });

  const bigInputStyle = (acc: string): React.CSSProperties => ({
    ...inputFieldStyle(acc),
    fontSize: 18, padding: '16px 20px',
  });

  return (
    <>
      {/* Global styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
        @keyframes float { 0%,100% { transform: translateY(0); opacity: 0; } 50% { transform: translateY(-200px); opacity: 0.6; } 0% { opacity: 0; } 10% { opacity: 0.6; } 90% { opacity: 0.4; } }
        @keyframes shimmer { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes glow-pulse { 0%,100% { box-shadow: 0 0 20px rgba(255,215,0,0.3); } 50% { box-shadow: 0 0 40px rgba(255,215,0,0.7); } }
        @keyframes slide-in { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-60px); } }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.2); }
        input:focus, textarea:focus, select:focus { border-color: ${accent} !important; outline: none; }
        select option { background: #1a1a2e; color: #fff; }
        textarea { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: rgba(255,255,255,0.03); } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
      `}</style>

      {showLoading && <LoadingSequence name={studentData.name} onDone={async () => { await onComplete(studentData); navigate('/research'); }} />}
      {showInsight && <Insight message={insightMsg} onDone={() => { setShowInsight(false); doNextStep(); }} />}

      <div style={{
        minHeight: '100vh', background: bg,
        transition: 'background 0.5s ease',
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {/* Top constellation */}
        <div style={{ maxWidth: 1280, margin: '0 auto', paddingTop: 24 }}>
          <Constellation step={step} />
        </div>

        {/* Main content */}
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 48px 120px' }}>
          <div style={{
            animation: transitioning ? 'slide-out 200ms ease forwards' : 'slide-in 280ms ease forwards',
          }}>
            {stepContent()}
          </div>
        </div>

        {/* Footer nav — fixed bottom bar */}
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: hexToRgba(bg, 0.9), backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '20px 48px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={prevStep} disabled={step === 1} style={{
            padding: '12px 24px', borderRadius: 10,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.5)', cursor: step === 1 ? 'not-allowed' : 'pointer',
            fontSize: 14, fontFamily: "'DM Sans', sans-serif",
            opacity: step === 1 ? 0.3 : 1,
          }}>← Back</button>

          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif" }}>
            Step {step} of 7
          </span>

          {step < 7 ? (
            <button onClick={nextStep} disabled={!isStepComplete()} style={{
              padding: '14px 32px', borderRadius: 12,
              background: isStepComplete() ? accent : 'rgba(255,255,255,0.06)',
              border: 'none', cursor: isStepComplete() ? 'pointer' : 'not-allowed',
              color: isStepComplete() ? '#000' : 'rgba(255,255,255,0.2)',
              fontSize: 15, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.2s ease',
              boxShadow: isStepComplete() ? `0 0 20px ${hexToRgba(accent, 0.4)}` : 'none',
            }}>
              {CONTINUE_LABELS[step - 1]}
            </button>
          ) : (
            <div style={{ width: 200 }} /> // spacer — step 7 has its own CTA
          )}
        </div>
      </div>
    </>
  );
};

export default StudentOnboarding;