/**
 * ApplicationTypeStep.tsx — Phase 3 root branch (docs/MASTERS_TRACK_PLAN.md §5).
 *
 * The "what are you applying for" pre-step that runs BEFORE the existing undergrad
 * onboarding. Routing per the brief:
 *   - Not enrolled in a university      -> undergrad flow (unchanged)
 *   - Enrolled, year 1–2                -> choose Masters (early planning); Transfer shown disabled
 *   - Enrolled, year 3–4                -> Masters only (too late to start undergrad fresh)
 *
 * Pure presentational + callback; the wrapper decides what to render/navigate.
 */
import React, { useState } from 'react';
import { GraduationCap, School, ArrowRight } from 'lucide-react';

type Enrollment = 'not_enrolled' | 'enrolled_yr1_2' | 'enrolled_yr3_4';

interface Props {
  onUndergrad: () => void;
  onMasters: (enrollment: Enrollment, year: number | null) => void;
}

const ApplicationTypeStep: React.FC<Props> = ({ onUndergrad, onMasters }) => {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">What are you applying for?</h1>
        <p className="mt-2 text-muted-foreground">This decides the whole experience — we keep the two tracks separate.</p>
      </div>

      <div className="mt-8 space-y-3">
        {([
          { v: 'not_enrolled', icon: School, title: 'I’m in school / pre-university', sub: 'Applying to undergraduate programs' },
          { v: 'enrolled_yr1_2', icon: GraduationCap, title: 'University student, year 1–2', sub: 'Planning ahead for a master’s' },
          { v: 'enrolled_yr3_4', icon: GraduationCap, title: 'University student, year 3–4', sub: 'Applying to master’s programs now' },
        ] as { v: Enrollment; icon: typeof School; title: string; sub: string }[]).map((opt) => {
          const selected = enrollment === opt.v;
          return (
            <button
              key={opt.v}
              onClick={() => setEnrollment(opt.v)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left transition-all
                ${selected
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40'}`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${selected ? 'bg-primary/20' : 'bg-muted'}`}>
                <opt.icon className={`h-5 w-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
              </span>
              <div>
                <div className="font-medium text-foreground">{opt.title}</div>
                <div className="text-sm text-muted-foreground">{opt.sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Routing UI based on the selection */}
      {enrollment === 'not_enrolled' && (
        <button onClick={onUndergrad} className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90">
          Continue to undergraduate setup <ArrowRight className="h-4 w-4" />
        </button>
      )}

      {enrollment === 'enrolled_yr1_2' && (
        <div className="mt-6 space-y-3">
          <button onClick={() => onMasters('enrolled_yr1_2', 2)} className="flex w-full items-center justify-between rounded-lg bg-primary px-4 py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90">
            Plan for a Master’s (early) <ArrowRight className="h-4 w-4" />
          </button>
          <button disabled className="w-full cursor-not-allowed rounded-lg border border-border bg-muted/50 px-4 py-3 text-left text-muted-foreground">
            Transfer to another undergrad <span className="ml-1 text-xs">(coming soon)</span>
          </button>
        </div>
      )}

      {enrollment === 'enrolled_yr3_4' && (
        <div className="mt-6">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
            You’re in your final undergraduate years, so we’ll set you up for <strong>master’s</strong> applications — applying fresh
            to undergraduate isn’t a fit at this stage. (Transfer support is coming later.)
          </div>
          <button onClick={() => onMasters('enrolled_yr3_4', 4)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 font-medium text-primary-foreground transition-opacity hover:opacity-90">
            Continue to Master’s setup <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ApplicationTypeStep;
