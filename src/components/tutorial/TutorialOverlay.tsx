// src/components/tutorial/TutorialOverlay.tsx
// Full tour system + contextual help panel for all pages.
//
// Usage:
//   // Wrap your app or page with TutorialProvider to enable the tour.
//   <TutorialProvider>
//     <YourPage />
//     <TutorialOverlay />
//   </TutorialProvider>
//
//   // In any component, mark a step target:
//   <div data-tutorial="step-id">…</div>
//
//   // Or use the contextual help panel stand-alone:
//   <ContextualHelp topic="financial" />

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { X, ChevronLeft, ChevronRight, HelpCircle, BookOpen, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ── Tour step definitions ─────────────────────────────────────────────────────

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  /** CSS selector or data-tutorial attribute value to highlight */
  target?: string;
  /** Preferred tooltip placement */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

const DEFAULT_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to CollegeOS 👋',
    body: 'This tour will walk you through the key features. Press Next to continue or skip at any time.',
    placement: 'bottom',
  },
  {
    id: 'college-search',
    title: 'Search Colleges',
    body: 'Use the search bar to find colleges by name, location, or major. Results update instantly.',
    target: '[data-tutorial="college-search"]',
    placement: 'bottom',
  },
  {
    id: 'fit-badge',
    title: 'Fit Classification',
    body: 'Each college card shows whether it is a Reach, Target, or Safety school based on your profile.',
    target: '[data-tutorial="fit-badge"]',
    placement: 'right',
  },
  {
    id: 'coa-card',
    title: 'Cost of Attendance',
    body: 'Click the $ icon on any college card to view the full cost breakdown with USD/INR toggle.',
    target: '[data-tutorial="coa-card"]',
    placement: 'left',
  },
  {
    id: 'financing',
    title: 'Financing Options',
    body: 'Compare loans, grants, and scholarships — each scored for your specific situation with EMI calculations.',
    target: '[data-tutorial="financing-table"]',
    placement: 'top',
  },
  {
    id: 'timeline',
    title: 'Application Timeline',
    body: 'Track deadlines and to-dos for every school in your list.  Deadlines are auto-populated from official sources.',
    target: '[data-tutorial="timeline"]',
    placement: 'bottom',
  },
  {
    id: 'profile',
    title: 'Your Profile',
    body: 'Keep your academic profile up to date for the most accurate chancing and recommendations.',
    target: '[data-tutorial="profile-nav"]',
    placement: 'bottom',
  },
  {
    id: 'done',
    title: 'You\'re all set! 🎉',
    body: 'You can restart this tour anytime from the Help menu.  Good luck with your applications!',
    placement: 'bottom',
  },
];

// ── Contextual help content ───────────────────────────────────────────────────

const HELP_TOPICS: Record<string, { title: string; tips: string[] }> = {
  financial: {
    title: 'Financial Aid Tips',
    tips: [
      'Toggle between USD and INR using the currency switch on the Cost of Attendance card.',
      'Net cost = COA minus any scholarships already awarded to you.',
      'Fit Score reflects how well a loan matches your citizenship, income, and required amount.',
      'EMI is calculated using the standard formula: P × r × (1+r)^n / ((1+r)^n − 1).',
      'All costs are sourced from official college pages — check source links for the latest figures.',
    ],
  },
  chancing: {
    title: 'Chancing Tips',
    tips: [
      'Chancing percentages are estimates based on historical admission data.',
      'Reach: < 30% chance. Target: 30–70%. Safety: > 70%.',
      'Update your GPA and test scores in your profile to improve accuracy.',
      'Your extracurriculars and essays can significantly shift your chances.',
    ],
  },
  timeline: {
    title: 'Timeline Tips',
    tips: [
      'Deadlines are auto-populated but always verify with the official college website.',
      'Use the "Add College" button to track additional schools.',
      'Mark tasks as done to see your progress towards each application.',
      'Enable notifications to get reminders 30/7/1 days before deadlines.',
    ],
  },
  profile: {
    title: 'Profile Tips',
    tips: [
      'A complete profile unlocks personalized recommendations and chancing.',
      'Add all your test scores — the system uses the best one for matching.',
      'Activities are tiered 1–4: Tier 1 = national/international level.',
      'International students: fill in your citizenship and home country for accurate scholarship matching.',
    ],
  },
  search: {
    title: 'Search Tips',
    tips: [
      'Search by college name, city, state, or major.',
      'Use the filter panel to narrow by acceptance rate, tuition range, or program type.',
      'Click the heart icon to save a college to your list.',
      'Compare up to 5 colleges side-by-side using the Compare button.',
    ],
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

interface TutorialContextValue {
  isActive: boolean;
  currentStep: number;
  steps: TutorialStep[];
  start: (steps?: TutorialStep[]) => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used inside <TutorialProvider>');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'collegeos_tutorial_done';

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TutorialStep[]>(DEFAULT_STEPS);

  const start = useCallback((customSteps?: TutorialStep[]) => {
    setSteps(customSteps ?? DEFAULT_STEPS);
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const stop = useCallback(() => {
    setIsActive(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }, []);

  const next = useCallback(() => {
    setCurrentStep(i => {
      if (i >= steps.length - 1) { stop(); return i; }
      return i + 1;
    });
  }, [steps.length, stop]);

  const prev = useCallback(() => {
    setCurrentStep(i => Math.max(0, i - 1));
  }, []);

  const goTo = useCallback((index: number) => {
    setCurrentStep(Math.max(0, Math.min(index, steps.length - 1)));
  }, [steps.length]);

  // Auto-start for first-time visitors
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => start(), 800);
      return () => clearTimeout(timer);
    }
  }, [start]);

  return (
    <TutorialContext.Provider value={{ isActive, currentStep, steps, start, stop, next, prev, goTo }}>
      {children}
    </TutorialContext.Provider>
  );
}

// ── Tooltip positioner ────────────────────────────────────────────────────────

function useTargetRect(target?: string) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!target) { setRect(null); return; }

    function update() {
      const el = document.querySelector(
        target.startsWith('[') ? target : `[data-tutorial="${target}"]`
      );
      setRect(el ? el.getBoundingClientRect() : null);
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [target]);

  return rect;
}

// ── Overlay ───────────────────────────────────────────────────────────────────

export function TutorialOverlay() {
  const { isActive, currentStep, steps, stop, next, prev } = useTutorial();
  const step = steps[currentStep];
  const targetRect = useTargetRect(step?.target);
  const tooltipRef = useRef<HTMLDivElement>(null);

  if (!isActive || !step) return null;

  // Compute tooltip position
  let tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
  };

  if (targetRect) {
    const PADDING = 12;
    switch (step.placement ?? 'bottom') {
      case 'bottom':
        tooltipStyle = {
          ...tooltipStyle,
          top: targetRect.bottom + PADDING,
          left: Math.max(8, targetRect.left + targetRect.width / 2 - 160),
        };
        break;
      case 'top':
        tooltipStyle = {
          ...tooltipStyle,
          bottom: window.innerHeight - targetRect.top + PADDING,
          left: Math.max(8, targetRect.left + targetRect.width / 2 - 160),
        };
        break;
      case 'right':
        tooltipStyle = {
          ...tooltipStyle,
          top: targetRect.top,
          left: targetRect.right + PADDING,
        };
        break;
      case 'left':
        tooltipStyle = {
          ...tooltipStyle,
          top: targetRect.top,
          right: window.innerWidth - targetRect.left + PADDING,
        };
        break;
    }
  } else {
    // Centred modal when no target
    tooltipStyle = {
      ...tooltipStyle,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  return (
    <>
      {/* Dim overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-[9998] transition-opacity"
        onClick={stop}
        aria-hidden
      />

      {/* Highlight cutout — rendered when a target exists */}
      {targetRect && (
        <div
          className="fixed z-[9998] rounded ring-2 ring-blue-400 ring-offset-2 pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
          aria-hidden
        />
      )}

      {/* Tooltip card */}
      <div ref={tooltipRef} style={tooltipStyle} className="w-80 shadow-2xl" role="dialog" aria-modal aria-label={step.title}>
        <Card className="border-blue-200">
          <CardContent className="pt-4 pb-3 px-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
              <p className="font-semibold text-sm text-gray-900 leading-snug pr-6">{step.title}</p>
              <button
                onClick={stop}
                className="text-gray-400 hover:text-gray-600 shrink-0 -mt-0.5"
                aria-label="Close tutorial"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <p className="text-sm text-gray-600 leading-relaxed mb-4">{step.body}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1 mb-3">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === currentStep ? 'w-4 bg-blue-500' : 'w-1.5 bg-gray-200'}`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={stop} className="text-xs text-gray-400 h-7">
                Skip tour
              </Button>
              <div className="flex gap-2">
                {!isFirst && (
                  <Button variant="outline" size="sm" className="h-7 px-2" onClick={prev}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button size="sm" className="h-7 px-3 text-xs" onClick={next}>
                  {isLast ? 'Finish' : 'Next'}
                  {!isLast && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ── Contextual help panel ─────────────────────────────────────────────────────

interface ContextualHelpProps {
  topic: keyof typeof HELP_TOPICS;
  className?: string;
}

export function ContextualHelp({ topic, className = '' }: ContextualHelpProps) {
  const [open, setOpen] = useState(false);
  const helpContent = HELP_TOPICS[topic];

  if (!helpContent) return null;

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 transition-colors"
        aria-expanded={open}
        aria-label={`Help: ${helpContent.title}`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Help
      </button>

      {open && (
        <>
          {/* Click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />

          <Card className="absolute right-0 top-7 w-72 z-50 shadow-xl border-blue-100">
            <CardContent className="pt-3 pb-3 px-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm text-gray-900 flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5 text-blue-500" />
                  {helpContent.title}
                </p>
                <button onClick={() => setOpen(false)} aria-label="Close help">
                  <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              </div>
              <ul className="space-y-2">
                {helpContent.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600">
                    <Lightbulb className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── Help trigger button (for nav bars) ───────────────────────────────────────

export function TutorialTrigger({ className = '' }: { className?: string }) {
  const { start } = useTutorial();
  return (
    <button
      onClick={() => start()}
      className={`flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors ${className}`}
      aria-label="Start tour"
    >
      <HelpCircle className="h-4 w-4" />
      <span>Tour</span>
    </button>
  );
}

export default TutorialOverlay;
