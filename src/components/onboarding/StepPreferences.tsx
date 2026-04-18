import React, { useState } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const INCOME_OPTIONS: Array<{ value: 1 | 2 | 3 | 4; label: string }> = [
  { value: 1, label: 'Under $30,000 / year' },
  { value: 2, label: '$30,000 – $60,000 / year' },
  { value: 3, label: '$60,000 – $100,000 / year' },
  { value: 4, label: 'Over $100,000 / year' },
];

interface StepPreferencesProps {
  onNext: () => void;
  onBack: () => void;
}

const StepPreferences: React.FC<StepPreferencesProps> = ({ onNext, onBack }) => {
  const { profile, updateProfile } = useOnboarding();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (profile.maxTuition < 5000) {
      errs.tuition = 'Budget must be at least $5,000/year to get useful results.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  const fmt = (v: number) =>
    v >= 100000 ? '$100,000+' : `$${v.toLocaleString()}`;

  return (
    <div className="mx-auto max-w-xl space-y-7">
      <div>
        <h2 className="text-2xl font-bold text-white">Preferences</h2>
        <p className="mt-1 text-sm text-slate-400">
          Help us filter colleges to ones you can realistically afford.
        </p>
      </div>

      {/* Max tuition slider */}
      <div className="space-y-3">
        <Label className="text-slate-300">
          Max Annual Tuition Budget —{' '}
          <span className="text-indigo-400 font-semibold">{fmt(profile.maxTuition)}</span>
        </Label>
        <Slider
          min={5000}
          max={100000}
          step={1000}
          value={[profile.maxTuition]}
          onValueChange={([v]) => updateProfile({ maxTuition: v })}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>$5,000</span>
          <span>$100,000+</span>
        </div>
        {errors.tuition && (
          <p className="text-xs text-red-400">{errors.tuition}</p>
        )}
      </div>

      {/* Income bracket */}
      <div className="space-y-2">
        <Label className="text-slate-300">Household Income Bracket</Label>
        <Select
          value={String(profile.incomeLevel)}
          onValueChange={(v) =>
            updateProfile({ incomeLevel: parseInt(v, 10) as 1 | 2 | 3 | 4 })
          }
        >
          <SelectTrigger className="w-full bg-slate-800 text-white border-slate-600">
            <SelectValue placeholder="Select income bracket" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 text-white border-slate-700">
            {INCOME_OPTIONS.map((o) => (
              <SelectItem
                key={o.value}
                value={String(o.value)}
                className="focus:bg-slate-700"
              >
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-slate-500">
          Used to estimate financial aid eligibility, not stored publicly.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-slate-600 bg-transparent py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleNext}
          className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-colors"
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

export default StepPreferences;
