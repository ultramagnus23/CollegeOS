import React, { useState } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// SAT → approximate percentile lookup (College Board 2023 data)
const SAT_PERCENTILES: Array<[number, number]> = [
  [400, 1], [500, 3], [600, 8], [700, 18], [800, 31], [900, 45],
  [1000, 57], [1050, 63], [1100, 67], [1150, 71], [1200, 74],
  [1250, 78], [1300, 82], [1350, 86], [1400, 89], [1450, 93],
  [1500, 96], [1550, 98], [1600, 99],
];

// ACT → approximate percentile lookup
const ACT_PERCENTILES: Array<[number, number]> = [
  [1, 1], [10, 4], [14, 10], [17, 19], [18, 24], [19, 29],
  [20, 34], [21, 40], [22, 46], [23, 52], [24, 57], [25, 62],
  [26, 67], [27, 72], [28, 77], [29, 81], [30, 85], [31, 89],
  [32, 92], [33, 95], [34, 97], [35, 99], [36, 99],
];

function getPercentile(score: number, table: Array<[number, number]>): number {
  for (let i = table.length - 1; i >= 0; i--) {
    if (score >= table[i][0]) return table[i][1];
  }
  return table[0][1];
}

interface StepAcademicsProps {
  onNext: () => void;
}

const StepAcademics: React.FC<StepAcademicsProps> = ({ onNext }) => {
  const { profile, updateProfile } = useOnboarding();

  const [errors, setErrors] = useState<Record<string, string>>({});

  const satVal = profile.satScore;
  const actVal = profile.actScore;
  const gpaUw = profile.gpaUnweighted;
  const gpaW = profile.gpaWeighted;

  const satPct = satVal ? getPercentile(satVal, SAT_PERCENTILES) : null;
  const actPct = actVal ? getPercentile(actVal, ACT_PERCENTILES) : null;

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!satVal && !actVal) {
      errs.test = 'Please enter at least one test score (SAT or ACT).';
    }
    if (satVal !== null && (satVal < 400 || satVal > 1600)) {
      errs.sat = 'SAT score must be between 400 and 1600.';
    }
    if (actVal !== null && (actVal < 1 || actVal > 36)) {
      errs.act = 'ACT score must be between 1 and 36.';
    }
    if (!gpaUw || gpaUw < 1.5 || gpaUw > 4.0) {
      errs.gpaUw = 'Unweighted GPA must be between 1.5 and 4.0.';
    }
    if (gpaW && (gpaW < 1.5 || gpaW > 5.0)) {
      errs.gpaW = 'Weighted GPA must be between 1.5 and 5.0.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Academics</h2>
        <p className="mt-1 text-sm text-slate-400">
          At least one test score and your unweighted GPA are required.
        </p>
      </div>

      {/* Test error (no test at all) */}
      {errors.test && (
        <p className="text-sm font-medium text-red-400">{errors.test}</p>
      )}

      {/* SAT */}
      <div className="space-y-1">
        <Label className="text-slate-300">
          SAT Score <span className="text-slate-500">(optional)</span>
        </Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={400}
            max={1600}
            placeholder="400–1600"
            value={satVal ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
              updateProfile({ satScore: v });
            }}
            className="w-40 bg-slate-800 text-white border-slate-600"
          />
          {satPct !== null && satVal !== null && !isNaN(satVal) && satVal >= 400 && satVal <= 1600 && (
            <span className="text-sm text-indigo-400 font-medium">
              ~{satPct}th percentile
            </span>
          )}
        </div>
        {errors.sat && <p className="text-xs text-red-400">{errors.sat}</p>}
      </div>

      {/* ACT */}
      <div className="space-y-1">
        <Label className="text-slate-300">
          ACT Score <span className="text-slate-500">(optional)</span>
        </Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={36}
            placeholder="1–36"
            value={actVal ?? ''}
            onChange={(e) => {
              const v = e.target.value === '' ? null : parseInt(e.target.value, 10);
              updateProfile({ actScore: v });
            }}
            className="w-40 bg-slate-800 text-white border-slate-600"
          />
          {actPct !== null && actVal !== null && !isNaN(actVal) && actVal >= 1 && actVal <= 36 && (
            <span className="text-sm text-indigo-400 font-medium">
              ~{actPct}th percentile
            </span>
          )}
        </div>
        {errors.act && <p className="text-xs text-red-400">{errors.act}</p>}
      </div>

      {/* Unweighted GPA */}
      <div className="space-y-1">
        <Label className="text-slate-300">Unweighted GPA (4.0 scale) *</Label>
        <Input
          type="number"
          min={1.5}
          max={4.0}
          step={0.01}
          placeholder="1.5–4.0"
          value={gpaUw || ''}
          onChange={(e) => updateProfile({ gpaUnweighted: parseFloat(e.target.value) || 0 })}
          className="w-40 bg-slate-800 text-white border-slate-600"
        />
        {errors.gpaUw && <p className="text-xs text-red-400">{errors.gpaUw}</p>}
      </div>

      {/* Weighted GPA */}
      <div className="space-y-1">
        <Label className="text-slate-300">
          Weighted GPA <span className="text-slate-500">(optional, up to 5.0)</span>
        </Label>
        <Input
          type="number"
          min={1.5}
          max={5.0}
          step={0.01}
          placeholder="1.5–5.0"
          value={gpaW || ''}
          onChange={(e) => updateProfile({ gpaWeighted: parseFloat(e.target.value) || 0 })}
          className="w-40 bg-slate-800 text-white border-slate-600"
        />
        {errors.gpaW && <p className="text-xs text-red-400">{errors.gpaW}</p>}
      </div>

      <button
        onClick={handleNext}
        className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
      >
        Continue →
      </button>
    </div>
  );
};

export default StepAcademics;
