/**
 * QuickEditModal Component
 * Modal for quick inline editing of profile fields without navigating away
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, X } from 'lucide-react';
import HelpTooltip, { FIELD_HELP_TEXT } from './HelpTooltip';

type EditType = 'gpa' | 'test-scores' | 'basic' | 'preferences';

interface QuickEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  editType: EditType;
  initialData?: any;
  onSave?: (updatedData: any) => void;
}

interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'email';
  placeholder?: string;
  helpKey?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

const EDIT_CONFIGS: { [key in EditType]: { title: string; fields: FormField[] } } = {
  gpa: {
    title: 'Edit GPA',
    fields: [
      { key: 'gpa_weighted', label: 'GPA (Weighted)', type: 'number', placeholder: 'e.g., 3.8', min: 0, max: 5, step: 0.01, helpKey: 'gpa_weighted' },
      { key: 'gpa_unweighted', label: 'GPA (Unweighted)', type: 'number', placeholder: 'e.g., 3.5', min: 0, max: 4, step: 0.01, helpKey: 'gpa_unweighted' },
      { key: 'gpa_scale', label: 'GPA Scale', type: 'select', helpKey: 'gpa_scale', options: [
        { value: '4.0', label: '4.0 Scale' },
        { value: '5.0', label: '5.0 Scale' },
        { value: '10.0', label: '10.0 Scale' },
        { value: '100', label: '100 Scale' }
      ]}
    ]
  },
  'test-scores': {
    title: 'Edit Test Scores',
    fields: [
      { key: 'sat_total', label: 'SAT Total', type: 'number', placeholder: '400-1600', min: 400, max: 1600, helpKey: 'sat_total' },
      { key: 'sat_math', label: 'SAT Math', type: 'number', placeholder: '200-800', min: 200, max: 800 },
      { key: 'sat_ebrw', label: 'SAT EBRW', type: 'number', placeholder: '200-800', min: 200, max: 800 },
      { key: 'act_composite', label: 'ACT Composite', type: 'number', placeholder: '1-36', min: 1, max: 36, helpKey: 'act_composite' },
      { key: 'ielts_score', label: 'IELTS Score', type: 'number', placeholder: '0-9', min: 0, max: 9, step: 0.5, helpKey: 'ielts_score' },
      { key: 'toefl_score', label: 'TOEFL Score', type: 'number', placeholder: '0-120', min: 0, max: 120, helpKey: 'toefl_score' }
    ]
  },
  basic: {
    title: 'Edit Basic Info',
    fields: [
      { key: 'first_name', label: 'First Name', type: 'text', placeholder: 'Your first name' },
      { key: 'last_name', label: 'Last Name', type: 'text', placeholder: 'Your last name' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'your.email@example.com' },
      { key: 'phone', label: 'Phone', type: 'text', placeholder: '+1 234 567 8900' }
    ]
  },
  preferences: {
    title: 'Edit Preferences',
    fields: [
      { key: 'preferred_college_size', label: 'College Size', type: 'select', helpKey: 'college_size', options: [
        { value: '', label: 'Any' },
        { value: 'Small', label: 'Small (<5,000)' },
        { value: 'Medium', label: 'Medium (5,000-15,000)' },
        { value: 'Large', label: 'Large (>15,000)' }
      ]},
      { key: 'preferred_setting', label: 'Campus Setting', type: 'select', helpKey: 'campus_setting', options: [
        { value: '', label: 'Any' },
        { value: 'Urban', label: 'Urban' },
        { value: 'Suburban', label: 'Suburban' },
        { value: 'Rural', label: 'Rural' }
      ]}
    ]
  }
};

const QuickEditModal: React.FC<QuickEditModalProps> = ({
  isOpen,
  onClose,
  editType,
  initialData = {},
  onSave
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = EDIT_CONFIGS[editType];

  useEffect(() => {
    if (isOpen && initialData) {
      const initialFormData: any = {};
      config.fields.forEach(field => {
        initialFormData[field.key] = initialData[field.key] ?? '';
      });
      setFormData(initialFormData);
      setError(null);
    }
  }, [isOpen, initialData, config.fields]);

  const handleChange = (key: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);
    setError(null);

    try {
      // Prepare data for API
      const dataToSave: any = {};
      config.fields.forEach(field => {
        const value = formData[field.key];
        if (field.type === 'number' && value !== '') {
          dataToSave[field.key] = parseFloat(value);
        } else if (value !== '') {
          dataToSave[field.key] = value;
        }
      });

      // Call appropriate API based on edit type
      let response;
      switch (editType) {
        case 'gpa':
          response = await api.updateAcademicInfo(user.id, dataToSave);
          break;
        case 'test-scores':
          response = await api.updateTestScores(user.id, dataToSave);
          break;
        case 'basic':
          response = await api.updateBasicInfo(user.id, dataToSave);
          break;
        case 'preferences':
          response = await api.updatePreferences(user.id, dataToSave);
          break;
      }

      if (onSave) {
        onSave(response?.data);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    }

    setSaving(false);
  };

  const renderField = (field: FormField) => {
    const value = formData[field.key] ?? '';
    
    return (
      <div key={field.key} className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Label htmlFor={field.key}>{field.label}</Label>
          {field.helpKey && FIELD_HELP_TEXT[field.helpKey] && (
            <HelpTooltip content={FIELD_HELP_TEXT[field.helpKey]} iconSize={12} />
          )}
        </div>
        
        {field.type === 'select' ? (
          <select
            id={field.key}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:ring-2 focus:ring-primary focus:border-primary"
          >
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <Input
            id={field.key}
            type={field.type}
            value={value}
            onChange={(e) => handleChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            min={field.min}
            max={field.max}
            step={field.step}
          />
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{config.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {config.fields.map(renderField)}
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X size={16} className="mr-1" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Save size={16} className="mr-1" />
            )}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * QuickEditButton Component
 * A small button that triggers the quick edit modal
 */
interface QuickEditButtonProps {
  editType: EditType;
  initialData?: any;
  onSave?: (data: any) => void;
  className?: string;
}

export const QuickEditButton: React.FC<QuickEditButtonProps> = ({
  editType,
  initialData,
  onSave,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors ${className}`}
        aria-label={`Edit ${editType}`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
      <QuickEditModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        editType={editType}
        initialData={initialData}
        onSave={onSave}
      />
    </>
  );
};

export default QuickEditModal;
