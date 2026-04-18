import React, { useState } from 'react';
import { useOnboarding } from '../../contexts/OnboardingContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';

const ESSAY_LABELS: Record<number, string> = {
  1: 'First draft',
  2: 'Revised once',
  3: 'Polished',
  4: 'Peer reviewed',
  5: 'Professionally edited',
};

interface StepProfileProps {
  onNext: () => void;
  onBack: () => void;
}

const StepProfile: React.FC<StepProfileProps> = ({ onNext, onBack }) => {
  const { profile, updateProfile } = useOnboarding();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!profile.extracurriculars || profile.extracurriculars < 1) {
      errs.extracurriculars = 'You must have at least 1 extracurricular.';
    }
    if (profile.leadershipPositions > profile.extracurriculars) {
      errs.leadership = 'Leadership positions cannot exceed total extracurriculars.';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validate()) onNext();
  };

  return (
    <div className="mx-auto max-w-xl space-y-7">
      <div>
        <h2 className="text-2xl font-bold text-white">Profile</h2>
        <p className="mt-1 text-sm text-slate-400">
          Extracurricular depth and character flags help calibrate your chances.
        </p>
      </div>

      {/* Essay quality slider */}
      <div className="space-y-3">
        <Label className="text-slate-300">
          Essays Quality — <span className="text-indigo-400">{ESSAY_LABELS[profile.essayQuality]}</span>
        </Label>
        <Slider
          min={1}
          max={5}
          step={1}
          value={[profile.essayQuality]}
          onValueChange={([v]) => updateProfile({ essayQuality: v as 1 | 2 | 3 | 4 | 5 })}
          className="w-full"
        />
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>1 – First draft</span>
          <span>5 – Professionally edited</span>
        </div>
      </div>

      {/* Extracurriculars */}
      <div className="space-y-1">
        <Label className="text-slate-300">Number of Extracurriculars *</Label>
        <Input
          type="number"
          min={1}
          max={15}
          placeholder="1–15"
          value={profile.extracurriculars || ''}
          onChange={(e) =>
            updateProfile({ extracurriculars: Math.min(15, Math.max(1, parseInt(e.target.value, 10) || 1)) })
          }
          className="w-32 bg-slate-800 text-white border-slate-600"
        />
        {errors.extracurriculars && (
          <p className="text-xs text-red-400">{errors.extracurriculars}</p>
        )}
      </div>

      {/* Leadership positions */}
      <div className="space-y-1">
        <Label className="text-slate-300">Leadership Positions</Label>
        <Input
          type="number"
          min={0}
          max={profile.extracurriculars}
          placeholder="0"
          value={profile.leadershipPositions}
          onChange={(e) =>
            updateProfile({
              leadershipPositions: Math.max(0, parseInt(e.target.value, 10) || 0),
            })
          }
          className="w-32 bg-slate-800 text-white border-slate-600"
        />
        {errors.leadership && (
          <p className="text-xs text-red-400">{errors.leadership}</p>
        )}
        <p className="text-xs text-slate-500">e.g., club president, team captain</p>
      </div>

      {/* Character flags */}
      <div className="space-y-4 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Applicant Flags
        </p>
        {(
          [
            { id: 'firstGen', label: 'First-generation college student', key: 'firstGen' },
            { id: 'legacy', label: 'Legacy applicant (parent attended)', key: 'legacy' },
            { id: 'recruitedAthlete', label: 'Recruited athlete', key: 'recruitedAthlete' },
          ] as const
        ).map(({ id, label, key }) => (
          <div key={id} className="flex items-center gap-3">
            <Checkbox
              id={id}
              checked={profile[key] as boolean}
              onCheckedChange={(checked) =>
                updateProfile({ [key]: checked === true } as Partial<typeof profile>)
              }
              className="border-slate-600"
            />
            <Label htmlFor={id} className="cursor-pointer text-sm text-slate-300">
              {label}
            </Label>
          </div>
        ))}
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

export default StepProfile;
