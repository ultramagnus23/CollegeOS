// ==========================================
// FILE: src/pages/StudentOnboarding.tsx
// REDESIGNED — Premium Collegiate Onboarding System
// ==========================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { StudentProfile } from '../types';
import { useProfileCompletion } from '@/hooks/useProfileCompletion';
import {
  ACTIVITY_LIMITS,
  buildTraitProfile,
  dedupeNormalized,
  inferTraitIntelligence,
  parseBoundedInteger,
  sanitizeActivities,
  sanitizeIntegerInput,
} from '@/utils/onboarding';
import {
  CURRICULUM_OPTIONS,
  MAJOR_OPTIONS,
  SCHOOL_SUGGESTIONS,
  SUBJECT_OPTIONS,
  TRAIT_OPTIONS,
} from '@/constants/onboardingOptions';
import { logProfileTelemetry } from '@/lib/profileTelemetry';

// ── Types ──────────────────────────────────────────────────────────────────
interface StructuredActivity {
  name: string;
  type: string;
  tier: number;
  yearsInvolved: number;
  hoursPerWeek: number;
  weeksPerYear: number;
  leadership: string;
  achievements: string;
}

interface StudentOnboardingProps {
  onComplete: (profile: StudentProfile) => void | Promise<void>;
}

// ── Color System ───────────────────────────────────────────────────────────
const STEP_THEMES = [
  { bg: '#0C0C1B', accent: '#7A73F0', surface: '#15152B', label: 'Identity',    glow: 'rgba(122,115,240,0.24)' },
  { bg: '#0C1728', accent: '#5BA9F8', surface: '#13203A', label: 'Academics',   glow: 'rgba(91,169,248,0.22)'  },
  { bg: '#150D28', accent: '#B06CF0', surface: '#1E1237', label: 'Interests',   glow: 'rgba(176,108,240,0.22)' },
  { bg: '#1B0D0D', accent: '#F38A42', surface: '#2B1512', label: 'Preferences', glow: 'rgba(243,138,66,0.2)'   },
  { bg: '#0C1A15', accent: '#3FC495', surface: '#12251C', label: 'Activities',  glow: 'rgba(63,196,149,0.22)'  },
  { bg: '#1B150D', accent: '#F1B84E', surface: '#2C210F', label: 'Goals',       glow: 'rgba(241,184,78,0.22)'  },
  { bg: '#07070B', accent: '#E3C66A', surface: '#101018', label: 'Reveal',      glow: 'rgba(227,198,106,0.24)' },
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
                boxShadow: isDone ? `0 0 8px ${hexToRgba(n.accent, 0.45)}` :
                           isActive ? `0 0 14px ${hexToRgba(n.accent, 0.5)}` : 'none',
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
                fontFamily: "'Inter', system-ui, sans-serif",
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
    transform: selected ? 'scale(1.02)' : 'scale(1)',
    boxShadow: selected ? `0 0 8px ${hexToRgba(accent, 0.22)}` : 'none',
    fontFamily: "'Inter', system-ui, sans-serif",
    whiteSpace: 'nowrap',
  }}>{label}</button>
);

// ── Segmented Control ──────────────────────────────────────────────────────
const SegmentedControl: React.FC<{
  options: string[]; value: string; onChange: (v: string) => void; accent: string;
}> = ({ options, value, onChange, accent }) => (
  <div style={{
    display: 'flex', background: 'var(--color-surface-subtle)', borderRadius: 12,
    padding: 4, gap: 4, border: '1px solid var(--color-border-strong)',
  }}>
    {options.map(opt => {
      const isSelected = value.toLowerCase() === opt.toLowerCase();
      return (
        <button key={opt} onClick={() => onChange(opt)} style={{
          flex: 1, padding: '10px 16px', borderRadius: 8, border: isSelected ? `1px solid ${accent}` : '1px solid transparent',
          background: isSelected ? accent : 'transparent',
          color: isSelected ? '#000' : 'var(--color-text-secondary)',
          fontWeight: isSelected ? 700 : 400, fontSize: 13,
          cursor: 'pointer', transition: 'all 0.15s ease',
          fontFamily: "'Inter', system-ui, sans-serif",
        }}>{opt}</button>
      );
    })}
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
        fontFamily: "'Inter', system-ui, sans-serif",
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
    boxShadow: '0 0 22px rgba(108,99,255,0.1)',
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
    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6, fontFamily: "'Inter', system-ui, sans-serif" }}>ADMISSIONS PROFILE</div>
    <div style={{
      fontSize: name ? 28 : 20, fontWeight: 800, color: name ? '#fff' : 'rgba(255,255,255,0.2)',
      marginBottom: 8, minHeight: 40, fontFamily: "'Inter', system-ui, sans-serif",
      transition: 'all 0.2s ease',
    }}>{name || 'Your Name'}</div>
    {country && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>📍 {country}</div>}
    {dreamSchool && <div style={{ fontSize: 13, color: 'rgba(122,115,240,0.72)', marginBottom: 20, fontFamily: "'Inter', system-ui, sans-serif" }}>🎯 {dreamSchool}</div>}
    <div style={{ marginTop: 24 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 8, fontFamily: "'Inter', system-ui, sans-serif" }}>PROFILE STRENGTH</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <div style={{ width: '15%', height: '100%', background: '#6C63FF', borderRadius: 4, transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'Inter', system-ui, sans-serif" }}>Building...</span>
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
    <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: "'Inter', system-ui, sans-serif" }}>
      Your matches unlock at the end
    </div>
  </div>
);

// ── GPA Score Display ──────────────────────────────────────────────────────
const GPADisplay: React.FC<{ value: string; accent: string; gpaType: string }> = ({ value, accent, gpaType }) => {
  const numVal = parseFloat(value);
  let label = '', labelColor = accent;
  if (!isNaN(numVal) && value) {
    if (gpaType === 'percentage') {
      if (numVal > 90)       { label = 'Exceptional academic profile'; labelColor = '#10B981'; }
      else if (numVal >= 80) { label = 'Strong academic profile';      labelColor = '#10B981'; }
      else if (numVal >= 70) { label = 'Good academic profile';        labelColor = accent; }
      else if (numVal >= 55) { label = 'Average academic profile';     labelColor = accent; }
      else if (numVal >= 40) { label = 'Below average profile';        labelColor = '#F59E0B'; }
      else if (numVal > 0)   { label = 'Weak academic profile';        labelColor = '#F87171'; }
    } else {
      // GPA scale (0–4.0)
      if (numVal >= 3.7)      { label = 'Exceptional academic profile'; labelColor = '#10B981'; }
      else if (numVal >= 3.5) { label = 'Strong academic profile';      labelColor = '#10B981'; }
      else if (numVal >= 3.0) { label = 'Solid foundation';             labelColor = accent; }
      else if (numVal > 0)    { label = "We'll find programs that fit"; labelColor = '#F59E0B'; }
    }
  }
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontSize: 72, fontWeight: 800, color: value ? '#fff' : 'rgba(255,255,255,0.15)',
        lineHeight: 1, marginBottom: 8, fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'color 0.2s ease',
      }}>{value || '—'}</div>
      {label && (
        <div style={{ fontSize: 14, color: labelColor, fontWeight: 600, fontFamily: "'Inter', system-ui, sans-serif", transition: 'all 0.3s ease' }}>
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
      <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 4, transition: 'width 0.3s ease', boxShadow: `0 0 6px ${hexToRgba(accent, 0.32)}` }} />
    </div>
  );
};

const ONBOARDING_RECENT_MAJORS_KEY = 'collegeos_onboarding_recent_majors';

const categorizeMajor = (major: string): string => {
  if (/computer|data|artificial intelligence|cyber|robotics|information|hci|game/i.test(major)) return 'Computing & AI';
  if (/engineering|physics|mathematics|statistics|biology|chemistry|biotech/i.test(major)) return 'Engineering & Science';
  if (/business|finance|accounting|economics|marketing|supply chain|management|entrepreneur/i.test(major)) return 'Business & Economics';
  if (/psychology|sociology|political|policy|international|legal|philosophy|liberal/i.test(major)) return 'Social Impact & Humanities';
  if (/design|architecture|film|music|media|communications|arts/i.test(major)) return 'Design & Media';
  if (/environment|urban/i.test(major)) return 'Environment & Built World';
  return 'General';
};

const POPULAR_MAJORS = [
  'Computer Science',
  'Artificial Intelligence',
  'Data Science',
  'Engineering',
  'Business Administration',
  'Psychology',
  'Economics',
  'Biology',
];

const fuzzyScore = (query: string, value: string): number => {
  const q = query.trim().toLowerCase();
  const v = value.toLowerCase();
  if (!q) return 1;
  if (v === q) return 1000;
  if (v.startsWith(q)) return 800 - (v.length - q.length);
  if (v.includes(q)) return 500 - v.indexOf(q);

  let qi = 0;
  let score = 0;
  for (let i = 0; i < v.length && qi < q.length; i += 1) {
    if (v[i] === q[qi]) {
      score += 6;
      qi += 1;
    }
  }
  return qi === q.length ? score : -1;
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

interface MajorSelectorProps {
  majors: string[];
  selectedMajors: string[];
  customMajors: string[];
  majorCertain: boolean;
  onSelectMajor: (major: string) => void;
  onAddCustomMajor: (major: string) => void;
  onRemoveCustomMajor: (major: string) => void;
  accent: string;
}

const MajorSelector: React.FC<MajorSelectorProps> = ({
  majors,
  selectedMajors,
  customMajors,
  majorCertain,
  onSelectMajor,
  onAddCustomMajor,
  onRemoveCustomMajor,
  accent,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ONBOARDING_RECENT_MAJORS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setRecents(dedupeNormalized(parsed.filter((x): x is string => typeof x === 'string')).slice(0, 6));
      }
    } catch {
      setRecents([]);
    }
  }, []);

  const registerRecent = useCallback((major: string) => {
    setRecents((prev) => {
      const next = dedupeNormalized([major, ...prev]).slice(0, 6);
      try {
        localStorage.setItem(ONBOARDING_RECENT_MAJORS_KEY, JSON.stringify(next));
      } catch {
        // ignore localStorage failures
      }
      return next;
    });
  }, []);

  const filteredMajors = majors
    .map((major) => ({ major, score: fuzzyScore(query, major) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.major.localeCompare(b.major))
    .map((entry) => entry.major)
    .slice(0, 36);

  const grouped = filteredMajors.reduce<Record<string, string[]>>((acc, major) => {
    const cat = categorizeMajor(major);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(major);
    return acc;
  }, {});

  const flattened = Object.values(grouped).flat();
  const normalizedQuery = query.trim();
  const canQuickAdd =
    normalizedQuery.length > 1 &&
    !majors.some((m) => m.toLowerCase() === normalizedQuery.toLowerCase()) &&
    !customMajors.some((m) => m.toLowerCase() === normalizedQuery.toLowerCase());

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const commitMajorSelection = (major: string) => {
    onSelectMajor(major);
    registerRecent(major);
  };

  const onPaletteKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((idx) => (flattened.length ? (idx + 1) % flattened.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((idx) => (flattened.length ? (idx - 1 + flattened.length) % flattened.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flattened[activeIndex]) {
        commitMajorSelection(flattened[activeIndex]);
      } else if (canQuickAdd) {
        onAddCustomMajor(normalizedQuery);
        setQuery('');
      }
    }
  };

  return (
    <div style={{
      marginTop: 10,
      borderRadius: 14,
      border: `1px solid ${hexToRgba(accent, 0.24)}`,
      background: 'rgba(255,255,255,0.04)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '12px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onPaletteKeyDown}
          placeholder="Search majors (e.g., data, design, policy)..."
          aria-label="Search majors"
          role="combobox"
          aria-expanded
          aria-controls="major-palette-list"
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${hexToRgba(accent, 0.3)}`,
            color: '#fff',
            borderRadius: 10,
            padding: '11px 12px',
            fontSize: 13,
            outline: 'none',
            fontFamily: "'Inter', system-ui, sans-serif",
          }}
        />
      </div>

      {(recents.length > 0 || POPULAR_MAJORS.length > 0) && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {recents.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Recent</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {recents.map((major) => (
                  <button
                    key={`recent-${major}`}
                    onClick={() => commitMajorSelection(major)}
                    style={{
                      borderRadius: 999,
                      border: `1px solid ${hexToRgba(accent, 0.25)}`,
                      background: 'rgba(255,255,255,0.03)',
                      color: 'rgba(255,255,255,0.82)',
                      fontSize: 12,
                      padding: '6px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {major}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Popular</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {POPULAR_MAJORS.map((major) => (
                <button
                  key={`popular-${major}`}
                  onClick={() => commitMajorSelection(major)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${hexToRgba(accent, 0.2)}`,
                    background: selectedMajors.includes(major) ? hexToRgba(accent, 0.22) : 'rgba(255,255,255,0.03)',
                    color: selectedMajors.includes(major) ? accent : 'rgba(255,255,255,0.75)',
                    fontSize: 12,
                    padding: '6px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {major}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div id="major-palette-list" style={{ maxHeight: 250, overflowY: 'auto', padding: '8px 0' }}>
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {group}
            </div>
            {items.map((major) => {
              const idx = flattened.indexOf(major);
              const selected = selectedMajors.includes(major);
              const active = idx === activeIndex;
              return (
                <button
                  key={major}
                  onClick={() => commitMajorSelection(major)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    cursor: 'pointer',
                    color: selected ? '#fff' : 'rgba(255,255,255,0.82)',
                    background: selected ? hexToRgba(accent, 0.3) : active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    borderLeft: selected ? `2px solid ${accent}` : '2px solid transparent',
                    fontSize: 13,
                    transition: 'background 120ms ease',
                  }}
                >
                  {major}
                  {selected && <span style={{ marginLeft: 8, color: accent }}>✓</span>}
                </button>
              );
            })}
          </div>
        ))}

        {canQuickAdd && (
          <button
            onClick={() => {
              onAddCustomMajor(normalizedQuery);
              setQuery('');
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '12px',
              border: 'none',
              cursor: 'pointer',
              color: accent,
              background: 'rgba(255,255,255,0.03)',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              fontSize: 13,
            }}
          >
            + Quick add “{normalizedQuery}” as a custom major
          </button>
        )}
      </div>

      {customMajors.length > 0 && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {customMajors.map((major) => (
            <Chip
              key={major}
              label={`${major} ×`}
              selected
              accent={accent}
              onClick={() => onRemoveCustomMajor(major)}
            />
          ))}
        </div>
      )}

      <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        {majorCertain
          ? 'Decided mode: selecting a major replaces your previous major.'
          : 'Exploring mode: select up to 3 majors to compare fit.'}
      </div>
    </div>
  );
};

// ── Activities Step ────────────────────────────────────────────────────────
const ACTIVITY_TYPES = ['Academic Club','Athletics/Sports','Arts/Music/Drama','Community Service','Research/Science','Student Government','Debate/Speech','Journalism/Publication','Religious/Cultural','Work Experience','Internship','Entrepreneurship','Other'];

const TIER_DATA = {
  1: { name: 'National / International', desc: 'National competitions, published research, international recognition', color: '#FFD700' },
  2: { name: 'State / Regional', desc: 'State awards, regional leadership, significant community impact', color: '#C0C0C0' },
  3: { name: 'School Leadership', desc: 'Club president, team captain, significant school role', color: '#CD7F32' },
  4: { name: 'Participation', desc: 'Club member, general participation, personal hobbies', color: '#666' },
};

const emptyActivity: StructuredActivity = {
  name: '',
  type: '',
  tier: 4,
  yearsInvolved: 1,
  hoursPerWeek: 2,
  weeksPerYear: 40,
  leadership: '',
  achievements: '',
};

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
            <circle key={i} cx={p.x} cy={p.y} r="4" fill={accent} style={{ filter: `drop-shadow(0 0 4px ${hexToRgba(accent, 0.55)})` }} />
          ))}
        </>
      )}
      {/* Labels */}
      {Array.from({ length: axes }, (_, i) => {
        const end = getAxisEnd(i);
        const lx = cx + (r + 20) * Math.cos((i * Math.PI * 2) / axes - Math.PI / 2);
        const ly = cy + (r + 20) * Math.sin((i * Math.PI * 2) / axes - Math.PI / 2);
        return <text key={i} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="'Inter', system-ui, sans-serif">{RADAR_AXES[i]}</text>;
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
        <div style={{ fontSize: 42, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 8, fontFamily: "'Inter', system-ui, sans-serif" }}>
          Your<br />
          <span style={{ color: accent }}>Spike.</span>
        </div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
          Colleges don't want well-rounded students. They want well-rounded <em>classes</em>. What makes you irreplaceable?
        </p>

        <div style={{
          background: validCount >= 2 ? hexToRgba('#10B981', 0.1) : hexToRgba('#F59E0B', 0.1),
          border: `1px solid ${validCount >= 2 ? '#10B981' : '#F59E0B'}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13,
          color: validCount >= 2 ? '#10B981' : '#F59E0B', fontFamily: "'Inter', system-ui, sans-serif",
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
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, fontFamily: "'Inter', system-ui, sans-serif" }}>{act.name}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  {act.type} · {act.yearsInvolved}yr · {act.hoursPerWeek}h/wk · {act.weeksPerYear}wk/yr
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
            fontSize: 14, fontFamily: "'Inter', system-ui, sans-serif", transition: 'all 0.15s',
          }}>+ Add Activity</button>
        )}

        {/* Editing form */}
        {editing !== null && (
          <div style={{
            background: surface, border: `1px solid ${hexToRgba(accent, 0.3)}`,
            borderRadius: 12, padding: 20, marginTop: 12,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'Inter', system-ui, sans-serif" }}>
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
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, fontFamily: "'Inter', system-ui, sans-serif" }}>Tier</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', height: 36 }}>
                {[1,2,3,4].map(tier => (
                  <button key={tier} onClick={() => setCurrent({ ...current, tier })} style={{
                    flex: 1, height: '100%', border: 'none', cursor: 'pointer',
                    background: current.tier === tier ? TIER_DATA[tier as keyof typeof TIER_DATA].color : 'transparent',
                    color: current.tier === tier ? '#000' : 'rgba(255,255,255,0.5)',
                    fontSize: 11, fontWeight: current.tier === tier ? 700 : 400,
                    transition: 'all 0.15s', fontFamily: "'Inter', system-ui, sans-serif",
                  }}>{tier === 1 ? 'Natl' : tier === 2 ? 'State' : tier === 3 ? 'School' : 'Partic.'}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6, fontFamily: "'Inter', system-ui, sans-serif" }}>
                {TIER_DATA[current.tier as keyof typeof TIER_DATA]?.desc}
              </div>
            </div>
            <div style={{ marginTop: 12, marginBottom: 6, display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)' }}>
                <strong style={{ color: '#fff' }}>Years:</strong> How many years did you participate in this activity?
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)' }}>
                <strong style={{ color: '#fff' }}>Hours/week:</strong> Average weekly time commitment.
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.56)' }}>
                <strong style={{ color: '#fff' }}>Weeks/year:</strong> How many weeks each year did you actively participate?
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                value={String(current.yearsInvolved)}
                onChange={(e) => {
                  const clean = sanitizeIntegerInput(e.target.value, 2);
                  const bounded = parseBoundedInteger(clean, ACTIVITY_LIMITS.years.min, ACTIVITY_LIMITS.years.max);
                  setCurrent({ ...current, yearsInvolved: bounded ?? 0 });
                }}
                style={inputStyle(accent)}
                placeholder="Years participated (Example: 4 years)"
              />
              <input
                type="text"
                inputMode="numeric"
                value={String(current.hoursPerWeek)}
                onChange={(e) => {
                  const clean = sanitizeIntegerInput(e.target.value, 3);
                  const bounded = parseBoundedInteger(clean, ACTIVITY_LIMITS.hoursPerWeek.min, ACTIVITY_LIMITS.hoursPerWeek.max);
                  setCurrent({ ...current, hoursPerWeek: bounded ?? 0 });
                }}
                style={inputStyle(accent)}
                placeholder="Average hours spent weekly"
              />
              <input
                type="text"
                inputMode="numeric"
                value={String(current.weeksPerYear)}
                onChange={(e) => {
                  const clean = sanitizeIntegerInput(e.target.value, 2);
                  const bounded = parseBoundedInteger(clean, ACTIVITY_LIMITS.weeksPerYear.min, ACTIVITY_LIMITS.weeksPerYear.max);
                  setCurrent({ ...current, weeksPerYear: bounded ?? 0 });
                }}
                style={inputStyle(accent)}
                placeholder="Weeks/year (Example: 40)"
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              Allowed ranges: {ACTIVITY_LIMITS.years.min}-{ACTIVITY_LIMITS.years.max} years, {ACTIVITY_LIMITS.hoursPerWeek.min}-{ACTIVITY_LIMITS.hoursPerWeek.max} hours/week, {ACTIVITY_LIMITS.weeksPerYear.min}-{ACTIVITY_LIMITS.weeksPerYear.max} weeks/year.
            </div>
            <input value={current.leadership} onChange={e => setCurrent({ ...current, leadership: e.target.value })} placeholder="Role/position" style={{ ...inputStyle(accent), marginTop: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={save} disabled={!current.name.trim()} style={{
                padding: '10px 20px', background: accent, border: 'none', borderRadius: 8,
                color: '#000', fontWeight: 700, cursor: 'pointer', fontSize: 13,
                fontFamily: "'Inter', system-ui, sans-serif", opacity: current.name.trim() ? 1 : 0.4,
              }}>Save</button>
              <button onClick={() => setEditing(null)} style={{
                padding: '10px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
                color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, fontFamily: "'Inter', system-ui, sans-serif",
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {/* Right panel — radar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: "'Inter', system-ui, sans-serif" }}>Your Spike Map</div>
        <RadarChart activities={structured} accent={accent} />
        {validCount === 0 && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}>
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
  outline: 'none', fontFamily: "'Inter', system-ui, sans-serif", boxSizing: 'border-box',
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
      <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: "'Inter', system-ui, sans-serif", textAlign: 'center' }}>
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
        style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', filter: 'drop-shadow(0 0 7px rgba(227,198,106,0.45))' }}
      />
      <text x="100" y="95" textAnchor="middle" dominantBaseline="middle" fill="#FFD700" fontSize="36" fontWeight="800" fontFamily="'Inter', system-ui, sans-serif">{displayed}</text>
      <text x="100" y="125" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.4)" fontSize="12" fontFamily="'Inter', system-ui, sans-serif">Profile Score</text>
    </svg>
  );
};

// ── Between-step Insight ───────────────────────────────────────────────────
const Insight: React.FC<{ message: string; onDone: () => void }> = ({ message, onDone }) => {
  useEffect(() => { const t = setTimeout(onDone, 2000); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)',
    }}>
      <div style={{ fontSize: 22, fontWeight: 600, color: '#fff', textAlign: 'center', maxWidth: 500, lineHeight: 1.6, fontFamily: "'Inter', system-ui, sans-serif", padding: '0 24px' }}>
        {message}
      </div>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────
const StudentOnboarding: React.FC<StudentOnboardingProps> = ({ onComplete }) => {
  const navigate = useNavigate();
  const { user, completeOnboarding, refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [showInsight, setShowInsight] = useState(false);
  const [insightMsg, setInsightMsg] = useState('');
  const [showLoading, setShowLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [showTraitRefine, setShowTraitRefine] = useState(false);
  const progressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionSeqRef = useRef(0);

  const { completionPercent: backendCompletionPercent, refetch: refetchCompletion } = useProfileCompletion();

  const [studentData, setStudentData] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('onboarding_data');
      return saved ? JSON.parse(saved) : defaultData();
    } catch { return defaultData(); }
  });

  function defaultData() {
    return {
      name: '', grade: '', currentBoard: '', country: '', dreamSchool: '',
      current_grade: '', gender: '', phone: '', date_of_birth: '', graduation_year: '',
      school_name: '', curriculum_type: '', curriculum_other: '',
      currentGPA: '', gpaType: 'percentage', satScore: '', actScore: '', ibPredicted: '', subjects: [],
      customSubjects: [], customMajorInput: '', customSubjectInput: '',
      careerInterests: [], majorCertain: false, potentialMajors: [], customMajors: [], skillsStrengths: [],
      traitWeights: {} as Record<string, number>,
      preferredCountries: [], budgetRange: '', campusSize: '', locationPreference: '',
      activities: [], leadership: [], awards: [],
      careerGoals: '', whyCollege: '',
      draft_updated_at: 0,
    };
  }

  // On mount: restore draft from localStorage
  useEffect(() => {
    const localDraftRaw = localStorage.getItem('onboarding_data');
    if (!localDraftRaw) return;
    try {
      const localDraft = JSON.parse(localDraftRaw);
      setStudentData((prev: any) => ({ ...defaultData(), ...prev, ...localDraft }));
    } catch {
      // ignore malformed local draft
    }
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (step >= 7) return;
      logProfileTelemetry({
        event: 'onboarding_abandoned',
        userId: user?.id ?? null,
        metadata: { step, hasName: !!studentData?.name, hasCurriculum: !!studentData?.curriculum_type },
      });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [step, user?.id, studentData?.name, studentData?.curriculum_type]);

  const updateData = useCallback((field: string, value: any) => {
    setStudentData((prev: any) => {
      const next = { ...prev, [field]: value, draft_updated_at: Date.now() };
      try { localStorage.setItem('onboarding_data', JSON.stringify(next)); } catch {}
      if (progressDebounceRef.current) clearTimeout(progressDebounceRef.current);
      progressDebounceRef.current = setTimeout(() => {}, 1500);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (progressDebounceRef.current) clearTimeout(progressDebounceRef.current);
      completionSeqRef.current += 1;
    };
  }, []);

  const normalizedMajors = dedupeNormalized([
    ...(studentData.potentialMajors || []),
    ...(studentData.customMajors || []),
  ]);
  const normalizedSubjects = dedupeNormalized([
    ...(studentData.subjects || []),
    ...(studentData.customSubjects || []),
  ]);
  const normalizedTraits = dedupeNormalized(studentData.skillsStrengths || []);
  const liveTraitIntelligence = inferTraitIntelligence(normalizedTraits, studentData.traitWeights || {});

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
      case 1: return !!(studentData.name && studentData.country && studentData.phone && studentData.date_of_birth);
      case 2:
        return !!(
          studentData.currentGPA &&
          normalizedSubjects.length > 0 &&
          (studentData.curriculum_type || studentData.currentBoard) &&
          ((studentData.curriculum_type || studentData.currentBoard) !== 'Other' || studentData.curriculum_other)
        );
      case 3: return studentData.majorCertain !== null && normalizedMajors.length > 0 && normalizedTraits.length > 0;
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

  const getStepValidationMessage = (): string => {
    switch(step) {
      case 1: {
        if (!studentData.name && !studentData.country) return 'Please enter your name and select your country to continue.';
        if (!studentData.phone) return 'Please enter your phone number with country code.';
        if (!studentData.date_of_birth) return 'Please add your date of birth to continue.';
        if (!studentData.name) return 'Please enter your name to continue.';
        return 'Please select your country to continue.';
      }
      case 2: {
        if (!studentData.curriculum_type && !studentData.currentBoard) return 'Please select your curriculum or board.';
        if ((studentData.curriculum_type || studentData.currentBoard) === 'Other' && !studentData.curriculum_other) {
          return 'Please specify your curriculum.';
        }
        if (!studentData.currentGPA && normalizedSubjects.length === 0) return 'Please enter your GPA and select at least one subject.';
        if (!studentData.currentGPA) return 'Please enter your GPA to continue.';
        return 'Please select at least one subject to continue.';
      }
      case 3: return 'Please select at least one major and at least one trait to continue.';
      case 4: {
        if (studentData.preferredCountries.length === 0 && !studentData.budgetRange) return 'Please select a preferred country and a budget range to continue.';
        if (studentData.preferredCountries.length === 0) return 'Please select at least one preferred country to continue.';
        return 'Please select a budget range to continue.';
      }
      case 5: return 'Please add at least 2 activities to continue. Use the "+ Add Activity" button.';
      case 6: return 'Please describe your career goals to continue.';
      default: return 'Please complete this step to continue.';
    }
  };

  const handleNextClick = () => {
    if (!isStepComplete()) {
      toast.error(getStepValidationMessage());
      return;
    }
    nextStep();
  };

  const calcProfileScore = (): number => {
    let score = 0;
    if (studentData.name) score += 10;
    if (studentData.currentGPA) score += 15;
    if (normalizedSubjects.length > 0) score += 10;
    if (normalizedMajors.length > 0) score += 10;
    if (normalizedTraits.length > 0) score += 10;
    if (studentData.preferredCountries.length > 0) score += 10;
    if (studentData.activities.filter((a: any) => a?.name?.trim()).length >= 2) score += 20;
    if (studentData.careerGoals.length > 50) score += 15;
    if (studentData.whyCollege.length > 50) score += 10;
    return Math.min(Math.max(score, 60), 97);
  };

  const majors = MAJOR_OPTIONS;
  const skills = TRAIT_OPTIONS;
  const subjects = SUBJECT_OPTIONS;
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
            <h1 style={{ fontSize: 48, fontWeight: 800, color: '#fff', lineHeight: 1.1, marginBottom: 12, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, sans-serif" }}>
              Your college<br />journey starts<br /><span style={{ color: accent }}>here.</span>
            </h1>
            <p style={{ fontSize: 18, color: hexToRgba(accent, 0.7), marginBottom: 40, fontFamily: "'Inter', system-ui, sans-serif" }}>
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
                <label style={labelStyle}>School Name</label>
                <input
                  value={studentData.school_name}
                  onChange={(e) => updateData('school_name', e.target.value)}
                  list="school-suggestions"
                  placeholder="Search or type your school"
                  style={{ ...inputFieldStyle(accent), marginTop: 6 }}
                />
                <datalist id="school-suggestions">
                  {SCHOOL_SUGGESTIONS.map((school) => <option key={school} value={school} />)}
                </datalist>
              </div>
              <div>
                <label style={labelStyle}>Country</label>
                <select value={studentData.country} onChange={e => updateData('country', e.target.value)} style={{ ...inputFieldStyle(accent), marginTop: 6 }}>
                  <option value="">Select your country</option>
                  {['India','USA','UK','Canada','Singapore','UAE','Pakistan','Bangladesh','Sri Lanka','Nepal','Other'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Phone Number</label>
                  <input
                    value={studentData.phone}
                    onChange={(e) => updateData('phone', e.target.value)}
                    placeholder="+1 555 123 4567"
                    inputMode="tel"
                    style={{ ...inputFieldStyle(accent), marginTop: 6 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Date of Birth</label>
                  <input
                    type="date"
                    value={studentData.date_of_birth}
                    onChange={(e) => updateData('date_of_birth', e.target.value)}
                    style={{ ...inputFieldStyle(accent), marginTop: 6 }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Current Grade</label>
                  <select value={studentData.current_grade} onChange={e => updateData('current_grade', e.target.value)} style={{ ...inputFieldStyle(accent), marginTop: 6 }}>
                    <option value="">Select grade</option>
                    <option value="9th Grade (Freshman)">9th Grade (Freshman)</option>
                    <option value="10th Grade (Sophomore)">10th Grade (Sophomore)</option>
                    <option value="11th Grade (Junior)">11th Grade (Junior)</option>
                    <option value="12th Grade (Senior)">12th Grade (Senior)</option>
                    <option value="Gap Year">Gap Year</option>
                    <option value="Transfer Student">Already in College (Transfer)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Graduation Year</label>
                  <input
                    type="number"
                    value={studentData.graduation_year}
                    onChange={(e) => updateData('graduation_year', sanitizeIntegerInput(e.target.value, 4))}
                    placeholder="2028"
                    min={2020}
                    max={2040}
                    style={{ ...inputFieldStyle(accent), marginTop: 6 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>
                    Gender
                    <span title="Used only for scholarship matching" style={{ marginLeft: 6, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>ℹ️ for scholarships</span>
                  </label>
                  <select value={studentData.gender} onChange={e => updateData('gender', e.target.value)} style={{ ...inputFieldStyle(accent), marginTop: 6 }}>
                    <option value="">Prefer not to say</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Transgender">Transgender</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                    Used only for scholarship matching
                  </div>
                </div>
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
          <div style={{ marginTop: 24 }}>
            <label style={labelStyle}>Curriculum / Board</label>
            <select
              value={studentData.curriculum_type || studentData.currentBoard}
              onChange={(e) => {
                updateData('curriculum_type', e.target.value);
                updateData('currentBoard', e.target.value);
              }}
              style={{ ...inputFieldStyle(accent), marginTop: 8 }}
            >
              <option value="">Select curriculum</option>
              {CURRICULUM_OPTIONS.map((curriculum) => (
                <option key={curriculum} value={curriculum}>{curriculum}</option>
              ))}
            </select>
            {(studentData.curriculum_type === 'Other' || studentData.currentBoard === 'Other') && (
              <input
                value={studentData.curriculum_other}
                onChange={(e) => updateData('curriculum_other', e.target.value)}
                placeholder="Enter your curriculum"
                style={{ ...inputFieldStyle(accent), marginTop: 10 }}
              />
            )}
          </div>
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={labelStyle}>GPA / Percentage</label>
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 3, gap: 3 }}>
                {(['percentage', 'gpa'] as const).map(type => {
                  const sel = studentData.gpaType === type;
                  return (
                    <button key={type} onClick={() => updateData('gpaType', type)} style={{
                      padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                      background: sel ? accent : 'transparent',
                      color: sel ? '#000' : 'rgba(255,255,255,0.5)',
                      fontWeight: sel ? 700 : 400, fontSize: 12,
                      fontFamily: "'Inter', system-ui, sans-serif", transition: 'all 0.15s',
                    }}>
                      {type === 'percentage' ? 'Percentage (out of 100)' : 'GPA (out of 4.0)'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ background: surface, border: `1px solid ${hexToRgba(accent, 0.3)}`, borderRadius: 16, padding: '24px 32px', textAlign: 'center' }}>
              <input
                type="number"
                value={studentData.currentGPA}
                onChange={e => updateData('currentGPA', e.target.value)}
                min={0}
                max={studentData.gpaType === 'percentage' ? 100 : 4}
                step={studentData.gpaType === 'percentage' ? 1 : 0.1}
                placeholder={studentData.gpaType === 'percentage' ? '0–100' : '0.0–4.0'}
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 64, fontWeight: 800, color: '#fff', width: '100%', textAlign: 'center', fontFamily: "'Inter', system-ui, sans-serif" }}
              />
              {studentData.currentGPA && (() => {
                const v = parseFloat(studentData.currentGPA);
                const max = studentData.gpaType === 'percentage' ? 100 : 4.0;
                return !isNaN(v) && (v < 0 || v > max) ? (
                  <div style={{ fontSize: 12, color: '#F87171', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>
                    {studentData.gpaType === 'percentage' ? 'Percentage must be between 0 and 100' : 'GPA must be between 0.0 and 4.0'}
                  </div>
                ) : null;
              })()}
              {studentData.currentGPA && <GPADisplay value={studentData.currentGPA} accent={accent} gpaType={studentData.gpaType} />}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 24 }}>
            <div>
              <label style={labelStyle}>SAT Score <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span></label>
              <input type="number" value={studentData.satScore}
                onChange={e => updateData('satScore', e.target.value)}
                min={400} max={1600}
                placeholder="400–1600" style={{ ...inputFieldStyle(accent), marginTop: 6 }} />
              {studentData.satScore && (() => {
                const satVal = parseInt(studentData.satScore, 10);
                return !isNaN(satVal) && (satVal < 400 || satVal > 1600) ? (
                  <div style={{ fontSize: 11, color: '#F87171', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>SAT score must be between 400 and 1600</div>
                ) : null;
              })()}
              <ScoreBar value={+studentData.satScore} min={400} max={1600} accent={accent} />
            </div>
            <div>
              <label style={labelStyle}>ACT Score <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>(optional)</span></label>
              <input type="number" value={studentData.actScore}
                onChange={e => updateData('actScore', e.target.value)}
                min={1} max={36}
                placeholder="1–36" style={{ ...inputFieldStyle(accent), marginTop: 6 }} />
              {studentData.actScore && (() => {
                const actVal = parseInt(studentData.actScore, 10);
                return !isNaN(actVal) && (actVal < 1 || actVal > 36) ? (
                  <div style={{ fontSize: 11, color: '#F87171', marginTop: 4, fontFamily: "'Inter', system-ui, sans-serif" }}>ACT score must be between 1 and 36</div>
                ) : null;
              })()}
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
            <div style={{ marginTop: 12 }}>
              <input
                value={studentData.customSubjectInput}
                onChange={(e) => updateData('customSubjectInput', e.target.value)}
                placeholder="Add custom subject"
                style={inputFieldStyle(accent)}
              />
              <button
                onClick={() => {
                  const value = (studentData.customSubjectInput || '').trim();
                  if (!value) return;
                  updateData('customSubjects', dedupeNormalized([...(studentData.customSubjects || []), value]));
                  updateData('customSubjectInput', '');
                }}
                style={{ marginTop: 8, ...inputFieldStyle(accent), cursor: 'pointer', textAlign: 'center' }}
              >
                Add custom subject
              </button>
              {(studentData.customSubjects || []).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {studentData.customSubjects.map((subject: string) => (
                    <Chip
                      key={subject}
                      label={`${subject} ×`}
                      selected
                      accent={accent}
                      onClick={() => updateData('customSubjects', (studentData.customSubjects || []).filter((s: string) => s !== subject))}
                    />
                  ))}
                </div>
              )}
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
                <span style={{ fontSize: 13, color: studentData.majorCertain === false ? accent : 'rgba(255,255,255,0.4)', fontFamily: "'Inter', system-ui, sans-serif" }}>Exploring</span>
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
                <span style={{ fontSize: 13, color: studentData.majorCertain === true ? accent : 'rgba(255,255,255,0.4)', fontFamily: "'Inter', system-ui, sans-serif" }}>Decided</span>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 8, fontFamily: "'Inter', system-ui, sans-serif" }}>
                {studentData.majorCertain ? "Great — select your intended major." : "No worries — pick a few you're curious about."}
              </p>
            </div>
            <MajorSelector
              majors={majors}
              selectedMajors={studentData.potentialMajors}
              customMajors={studentData.customMajors || []}
              majorCertain={studentData.majorCertain}
              onSelectMajor={(major) => {
                if (studentData.majorCertain) {
                  updateData('potentialMajors', [major]);
                  return;
                }
                if (studentData.potentialMajors.includes(major)) {
                  updateData('potentialMajors', studentData.potentialMajors.filter((x: string) => x !== major));
                  return;
                }
                if (studentData.potentialMajors.length < 3) {
                  updateData('potentialMajors', [...studentData.potentialMajors, major]);
                }
              }}
              onAddCustomMajor={(major) => {
                updateData('customMajors', dedupeNormalized([...(studentData.customMajors || []), major]));
              }}
              onRemoveCustomMajor={(major) => {
                updateData('customMajors', (studentData.customMajors || []).filter((s: string) => s !== major));
              }}
              accent={accent}
            />
          </div>

          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12, marginTop: 68, fontFamily: "'Inter', system-ui, sans-serif" }}>Traits &amp; Working Style</div>
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
            {normalizedTraits.length > 0 && (
              <div style={{
                marginTop: 16,
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => setShowTraitRefine((v) => !v)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.86)',
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '12px 14px',
                  }}
                >
                  {showTraitRefine ? '▾' : '▸'} Advanced personalization (optional)
                </button>
                {showTraitRefine && (
                  <div style={{ padding: '0 14px 12px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                      Refine trait intensity subtly to improve recommendation quality.
                    </div>
                    {normalizedTraits.slice(0, 8).map((trait) => (
                      <div key={trait} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <span style={{ width: 170, fontSize: 12, color: 'rgba(255,255,255,0.76)' }}>{trait}</span>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={studentData.traitWeights?.[trait] || 3}
                          onChange={(e) => updateData('traitWeights', {
                            ...(studentData.traitWeights || {}),
                            [trait]: Number(e.target.value),
                          })}
                          style={{ flex: 1, accentColor: accent, opacity: 0.9 }}
                        />
                        <span style={{ width: 16, fontSize: 12, color: accent }}>{studentData.traitWeights?.[trait] || 3}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Archetype */}
            {normalizedTraits.length > 0 && (
              <div style={{
                marginTop: 24, padding: '16px 20px',
                background: hexToRgba(accent, 0.1), border: `1px solid ${hexToRgba(accent, 0.28)}`,
                borderRadius: 12, transition: 'all 0.3s ease',
              }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6, fontFamily: "'Inter', system-ui, sans-serif" }}>Trait Intelligence</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: accent, fontFamily: "'Inter', system-ui, sans-serif" }}>
                  {liveTraitIntelligence.primaryArchetype}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                  Hybrid: {liveTraitIntelligence.hybridArchetype}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                  Confidence {liveTraitIntelligence.confidence}% · {liveTraitIntelligence.dominantClusters.slice(0, 2).join(' + ')}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
                  {liveTraitIntelligence.synergies[0]?.label
                    ? `${liveTraitIntelligence.synergies[0].label}: ${liveTraitIntelligence.synergies[0].description}`
                    : (buildTraitProfile(normalizedTraits, studentData.traitWeights || {}).pairings || []).slice(0, 2).join(' · ')}
                </div>
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
                    boxShadow: sel ? `0 0 8px ${hexToRgba(accent, 0.2)}` : 'none',
                    position: 'relative',
                  }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>{c.flag}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 2, fontFamily: "'Inter', system-ui, sans-serif" }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Inter', system-ui, sans-serif" }}>{c.desc}</div>
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
                    fontFamily: "'Inter', system-ui, sans-serif", transition: 'all 0.15s',
                    boxShadow: sel ? `0 0 6px ${hexToRgba(accent, 0.18)}` : 'none',
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
            <div style={{ fontSize: 11, color: studentData.careerGoals.length >= 100 ? '#10B981' : 'rgba(255,255,255,0.3)', marginTop: 6, fontFamily: "'Inter', system-ui, sans-serif" }}>
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
                fontFamily: "'Inter', system-ui, sans-serif", transition: 'all 0.3s',
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

          <h1 style={{ fontSize: 52, fontWeight: 900, color: '#fff', marginBottom: 16, letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, sans-serif" }}>
            {studentData.name ? `${studentData.name},` : ''}<br />
            <span style={{ color: '#FFD700' }}>your matches are ready.</span>
          </h1>
          <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.5)', marginBottom: 48, lineHeight: 1.6, fontFamily: "'Inter', system-ui, sans-serif" }}>
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
                <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,215,0,0.6)', fontFamily: "'Inter', system-ui, sans-serif" }}>{label}</div>
                <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, marginTop: 8, filter: 'blur(2px)' }} />
                <div style={{ height: 8, width: '70%', background: 'rgba(255,255,255,0.08)', borderRadius: 4, marginTop: 6, filter: 'blur(2px)' }} />
              </div>
            ))}
          </div>

          {/* Profile ring */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 40 }}>
            <ProfileRing score={backendCompletionPercent > 0 ? backendCompletionPercent : calcProfileScore()} />
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 8, fontFamily: "'Inter', system-ui, sans-serif" }}>
              Your profile is in the top {100 - (backendCompletionPercent > 0 ? backendCompletionPercent : calcProfileScore())}% of applicants from {studentData.country || 'your region'}
            </div>
          </div>

          {/* Big CTA */}
          <button onClick={async () => {
            if (showLoading) return;
            setShowLoading(true);
          }} style={{
            width: 280, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
            border: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700,
            color: '#000', fontFamily: "'Inter', system-ui, sans-serif",
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
    fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
    fontFamily: "'Inter', system-ui, sans-serif",
  };

  const headlineStyle = (acc: string): React.CSSProperties => ({
    fontSize: 48, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: 10,
    letterSpacing: '-0.02em', fontFamily: "'Inter', system-ui, sans-serif",
  });

  const subStyle = (acc: string): React.CSSProperties => ({
    fontSize: 18, color: hexToRgba(acc, 0.65), marginBottom: 0, fontFamily: "'Inter', system-ui, sans-serif",
  });

  const inputFieldStyle = (acc: string): React.CSSProperties => ({
    width: '100%', padding: '14px 18px', background: surface,
    border: `1px solid var(--color-border-strong)`, borderRadius: 12, color: 'var(--color-text-primary)', fontSize: 15,
    outline: 'none', fontFamily: "'Inter', system-ui, sans-serif", boxSizing: 'border-box',
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
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.16); } }
        @keyframes float { 0%,100% { transform: translateY(0); opacity: 0; } 50% { transform: translateY(-200px); opacity: 0.6; } 0% { opacity: 0; } 10% { opacity: 0.6; } 90% { opacity: 0.4; } }
        @keyframes shimmer { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
        @keyframes glow-pulse { 0%,100% { box-shadow: 0 0 12px rgba(227,198,106,0.2); } 50% { box-shadow: 0 0 20px rgba(227,198,106,0.36); } }
        @keyframes slide-in { from { opacity: 0; transform: translateX(60px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slide-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-60px); } }
        input::placeholder, textarea::placeholder { color: var(--color-text-disabled); }
        input:focus, textarea:focus, select:focus { border-color: ${accent} !important; box-shadow: 0 0 0 2px ${hexToRgba(accent, 0.18)}; outline: none; }
        select option { background: var(--color-bg-surface); color: var(--color-text-primary); }
        textarea { font-family: 'Inter', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: var(--color-surface-subtle); } ::-webkit-scrollbar-thumb { background: var(--color-border-strong); border-radius: 4px; }
      `}</style>

      {showLoading && <LoadingSequence name={studentData.name} onDone={async () => {
        const completionSeq = ++completionSeqRef.current;
        const isStaleCompletion = () => completionSeq !== completionSeqRef.current;
        try {
          const cleanedActivities = sanitizeActivities(studentData.activities || [], { strict: true });
          const budgetMap: Record<string, number> = {
            '20k': 20000,
            '40k': 40000,
            '40-60k': 60000,
            '60k+': 60000,
            'aid': 0,
          };
          const maxBudgetPerYear = budgetMap[String(studentData.budgetRange || '')] ?? null;
          const gpaRaw = parseFloat(String(studentData.currentGPA).replace(/[^0-9.]/g, '')) || null;
          const intendedMajor = normalizedMajors[0] ?? null;

          // 1. Save onboarding payload to users table and mark onboarding complete
          await completeOnboarding({
            target_countries: studentData.preferredCountries,
            intended_majors: normalizedMajors,
            intended_major: intendedMajor,
            country: studentData.country || null,
            career_goals: studentData.careerGoals || null,
            budget: maxBudgetPerYear,
            max_budget_per_year: maxBudgetPerYear,
            need_financial_aid: studentData.budgetRange === 'aid',
            can_take_loan: null,
            family_income_usd: null,
            test_status: {
              sat_score: studentData.satScore
                ? Number(studentData.satScore) : null,
              act_score: studentData.actScore
                ? Number(studentData.actScore) : null,
              ib_predicted: studentData.ibPredicted
                ? Number(studentData.ibPredicted) : null,
            },
            sat_score: studentData.satScore ? Number(studentData.satScore) : null,
            act_score: studentData.actScore ? Number(studentData.actScore) : null,
            gpa: gpaRaw,
            gpa_type: studentData.gpaType || 'percentage',
            grade_level: studentData.current_grade || null,
            graduation_year: studentData.graduation_year ? Number(studentData.graduation_year) : null,
          });

          // 2b. Send why_college_matters to trigger values_vector computation via valuesEngine.js
          if (studentData.whyCollege && studentData.whyCollege.trim().length > 0) {
            try {
              await api.updateProfile({ why_college_matters: studentData.whyCollege.trim() });
            } catch { /* non-critical — values_vector will be computed on next profile update */ }
          }

          // 2. Pre-compute instant recommendations and store in localStorage
          try {
            const recRes = await api.automation.getInstantRecommendations({
              gpa: studentData.currentGPA,
              satScore: studentData.satScore,
              preferredCountries: studentData.preferredCountries,
              potentialMajors: normalizedMajors,
              budgetRange: studentData.budgetRange,
              activities: cleanedActivities,
              careerGoals: studentData.careerGoals,
              whyCollege: studentData.whyCollege,
            });
            localStorage.setItem('instant_recommendations', JSON.stringify(recRes?.data || recRes || []));
          } catch { /* non-critical */ }

          try {
            await api.completeTour();
            await refreshUser();
            refetchCompletion();
          } catch {
            // non-blocking
          }

          // Clear localStorage draft
          try { localStorage.removeItem('onboarding_data'); } catch {}

          await onComplete(studentData);

          // 3. Attempt to pre-fetch ML chances so the suggestions page loads instantly.
          // Fire-and-forget: if HF is cold/down, the user can refresh on the suggestions page.
          try {
            const chancesRes = await (api as any).chances.get() as { success: boolean; data: any[]; isFallback: boolean; source: string };
            if (chancesRes?.data && chancesRes.data.length > 0) {
              localStorage.setItem('collegeos_suggestions', JSON.stringify({
                ...chancesRes,
                generatedAt: new Date().toISOString(),
              }));
              if (isStaleCompletion()) return;
              navigate('/suggestions');
              return;
            }
          } catch { /* non-critical — fall through to dashboard */ }

          if (isStaleCompletion()) return;
          navigate('/dashboard');
        } catch (err) {
          if (isStaleCompletion()) return;
          console.error('Failed to save profile:', err);
          toast.error('Failed to save profile. Please try again.');
          setShowLoading(false);
        }
      }} />}
      {showInsight && <Insight message={insightMsg} onDone={() => { setShowInsight(false); doNextStep(); }} />}

      <div style={{
        minHeight: '100vh', background: bg,
        transition: 'background 0.5s ease',
        fontFamily: "'Inter', system-ui, sans-serif",
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
          background: hexToRgba(bg, 0.88), backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--color-border)',
          padding: '20px 48px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button onClick={prevStep} disabled={step === 1} style={{
            padding: '12px 24px', borderRadius: 10,
            background: 'var(--color-surface-subtle)', border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)', cursor: step === 1 ? 'not-allowed' : 'pointer',
            fontSize: 14, fontFamily: "'Inter', system-ui, sans-serif",
            opacity: step === 1 ? 0.3 : 1,
          }}>← Back</button>

          <span style={{ fontSize: 13, color: 'var(--color-text-disabled)', fontFamily: "'Inter', system-ui, sans-serif" }}>
            Step {step} of 7
          </span>

          {step < 7 ? (
            <button onClick={handleNextClick} style={{
              padding: '14px 32px', borderRadius: 12,
              background: isStepComplete() ? accent : 'var(--color-surface-subtle)',
              border: 'none', cursor: 'pointer',
              color: isStepComplete() ? '#000' : 'var(--color-text-disabled)',
              fontSize: 15, fontWeight: 700, fontFamily: "'Inter', system-ui, sans-serif",
              transition: 'all 0.2s ease',
              boxShadow: isStepComplete() ? `0 0 10px ${hexToRgba(accent, 0.25)}` : 'none',
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
