/**
 * ApplicationTypeStep.tsx — Phase 3 root branch (docs/MASTERS_TRACK_PLAN.md §5).
 *
 * The "what are you applying for" pre-step that runs BEFORE the existing undergrad
 * onboarding. Styled to match the premium, always-dark undergrad onboarding
 * (StudentOnboarding) so the two tracks feel like one product — not a plain form.
 *
 * Routing per the brief:
 *   - Not enrolled in a university      -> undergrad flow (unchanged)
 *   - Enrolled, year 1–2                -> choose Masters (early planning); Transfer disabled
 *   - Enrolled, year 3–4                -> Masters only (too late to start undergrad fresh)
 *
 * Pure presentational + callback; the wrapper decides what to render/navigate.
 */
import React, { useState } from 'react';
import { GraduationCap, School, ArrowRight, Sparkles } from 'lucide-react';

type Enrollment = 'not_enrolled' | 'enrolled_yr1_2' | 'enrolled_yr3_4';

interface Props {
  onUndergrad: () => void;
  onMasters: (enrollment: Enrollment, year: number | null) => void;
}

const ACCENT = '#7A73F0';

const OPTIONS: { v: Enrollment; icon: typeof School; title: string; sub: string }[] = [
  { v: 'not_enrolled', icon: School, title: 'I’m in school / pre-university', sub: 'Applying to undergraduate programs' },
  { v: 'enrolled_yr1_2', icon: GraduationCap, title: 'University student, year 1–2', sub: 'Planning ahead for a master’s' },
  { v: 'enrolled_yr3_4', icon: GraduationCap, title: 'University student, year 3–4', sub: 'Applying to master’s programs now' },
];

const ApplicationTypeStep: React.FC<Props> = ({ onUndergrad, onMasters }) => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [hovered, setHovered] = useState<Enrollment | null>(null);

  return (
    <div
      className="min-h-screen w-full"
      style={{ background: 'radial-gradient(120% 80% at 50% -10%, #15152B 0%, #0B0B16 55%)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-14">
        {/* Header */}
        <div className="text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: 'rgba(122,115,240,0.16)',
              border: '1px solid rgba(122,115,240,0.4)',
              boxShadow: '0 0 28px rgba(122,115,240,0.28)',
            }}
          >
            <GraduationCap className="h-8 w-8" style={{ color: '#9b95ff' }} />
          </div>
          <h1 className="text-[28px] font-extrabold leading-tight text-white">What are you applying for?</h1>
          <p className="mt-2 text-[15px] text-white/55">
            This decides the whole experience — we keep the two tracks separate.
          </p>
        </div>

        {/* Options */}
        <div className="mt-9 space-y-3">
          {OPTIONS.map((opt) => {
            const selected = enrollment === opt.v;
            const active = selected || hovered === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setEnrollment(opt.v)}
                onMouseEnter={() => setHovered(opt.v)}
                onMouseLeave={() => setHovered(null)}
                className="flex w-full items-center gap-4 rounded-2xl p-4 text-left transition-all duration-150"
                style={{
                  background: selected ? 'rgba(122,115,240,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${active ? 'rgba(122,115,240,0.7)' : 'rgba(255,255,255,0.09)'}`,
                  boxShadow: selected ? '0 0 24px rgba(122,115,240,0.22)' : 'none',
                  transform: active ? 'translateY(-1px)' : 'none',
                }}
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors"
                  style={{
                    background: active ? 'rgba(122,115,240,0.22)' : 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <opt.icon className="h-5 w-5" style={{ color: active ? '#9b95ff' : 'rgba(255,255,255,0.55)' }} />
                </span>
                <div className="min-w-0">
                  <div className="font-semibold text-white">{opt.title}</div>
                  <div className="text-sm text-white/50">{opt.sub}</div>
                </div>
                <ArrowRight
                  className="ml-auto h-4 w-4 shrink-0 transition-opacity"
                  style={{ color: ACCENT, opacity: selected ? 1 : 0 }}
                />
              </button>
            );
          })}
        </div>

        {/* Routing CTA */}
        <div className="mt-6 min-h-[64px]">
          {enrollment === 'not_enrolled' && (
            <button
              onClick={onUndergrad}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-white transition-transform hover:-translate-y-0.5"
              style={{ background: ACCENT, boxShadow: '0 8px 24px rgba(122,115,240,0.3)' }}
            >
              Continue to undergraduate setup <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {enrollment === 'enrolled_yr1_2' && (
            <div className="space-y-3">
              <button
                onClick={() => onMasters('enrolled_yr1_2', 2)}
                className="flex w-full items-center justify-between rounded-xl px-4 py-3.5 font-semibold text-white transition-transform hover:-translate-y-0.5"
                style={{ background: ACCENT, boxShadow: '0 8px 24px rgba(122,115,240,0.3)' }}
              >
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Plan for a Master’s (early)</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                disabled
                className="w-full cursor-not-allowed rounded-xl px-4 py-3.5 text-left text-white/35"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                Transfer to another undergrad <span className="ml-1 text-xs">(coming soon)</span>
              </button>
            </div>
          )}

          {enrollment === 'enrolled_yr3_4' && (
            <div className="space-y-3">
              <div
                className="rounded-xl p-4 text-sm"
                style={{ background: 'rgba(243,138,66,0.1)', border: '1px solid rgba(243,138,66,0.35)', color: '#f6b27a' }}
              >
                You’re in your final undergraduate years, so we’ll set you up for <strong>master’s</strong> applications —
                applying fresh to undergraduate isn’t a fit at this stage. (Transfer support is coming later.)
              </div>
              <button
                onClick={() => onMasters('enrolled_yr3_4', 4)}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-white transition-transform hover:-translate-y-0.5"
                style={{ background: ACCENT, boxShadow: '0 8px 24px rgba(122,115,240,0.3)' }}
              >
                Continue to Master’s setup <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApplicationTypeStep;
