import React from 'react';

interface Props {
  totalSteps: number;
  currentStep: number; // 0-indexed
}

const STEP_LABELS = ['Academics', 'Profile', 'Preferences', 'Review'];

const OnboardingProgress: React.FC<Props> = ({ totalSteps, currentStep }) => {
  return (
    <div className="w-full px-4 py-6">
      {/* Step dots + connecting lines */}
      <div className="flex items-center justify-center gap-0">
        {Array.from({ length: totalSteps }, (_, i) => {
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          return (
            <React.Fragment key={i}>
              {/* Dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all duration-300 ${
                    isDone
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : isActive
                      ? 'border-indigo-500 bg-indigo-500 text-white shadow-[0_0_12px_rgba(99,102,241,0.6)]'
                      : 'border-slate-600 bg-slate-800 text-slate-500'
                  }`}
                >
                  {isDone ? (
                    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                      <path
                        d="M3 8l3.5 3.5L13 5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={`mt-1 text-[10px] font-medium uppercase tracking-widest transition-colors duration-300 ${
                    isActive ? 'text-indigo-400' : isDone ? 'text-emerald-500' : 'text-slate-600'
                  }`}
                >
                  {STEP_LABELS[i] ?? `Step ${i + 1}`}
                </span>
              </div>
              {/* Connector line between dots */}
              {i < totalSteps - 1 && (
                <div
                  className={`mb-5 h-0.5 flex-1 transition-colors duration-500 ${
                    i < currentStep ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {/* Overall progress bar */}
      <div className="mt-4 h-1 w-full rounded-full bg-slate-800">
        <div
          className="h-1 rounded-full bg-indigo-500 transition-all duration-500"
          style={{ width: `${(currentStep / (totalSteps - 1)) * 100}%` }}
        />
      </div>
    </div>
  );
};

export default OnboardingProgress;
