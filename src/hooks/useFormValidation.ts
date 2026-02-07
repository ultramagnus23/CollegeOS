/**
 * useFormValidation Hook
 * Real-time form validation with inline feedback
 */
import React, { useState, useCallback, useMemo } from 'react';

export interface ValidationRule {
  validate: (value: any, formData?: any) => boolean;
  message: string;
  severity: 'error' | 'warning';
}

export interface FieldValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface FormValidationState {
  [fieldName: string]: FieldValidation;
}

// Pre-defined validation rules
export const ValidationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    validate: (value) => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value != null && value !== '';
    },
    message,
    severity: 'error'
  }),

  email: (message = 'Please enter a valid email address'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Optional field
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
    severity: 'error'
  }),

  phone: (message = 'Please enter a valid phone number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const phoneRegex = /^[\d\s+\-()]+$/;
      return phoneRegex.test(value) && value.replace(/\D/g, '').length >= 7;
    },
    message,
    severity: 'error'
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return String(value).length >= min;
    },
    message: message || `Must be at least ${min} characters`,
    severity: 'error'
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return String(value).length <= max;
    },
    message: message || `Must be at most ${max} characters`,
    severity: 'error'
  }),

  min: (min: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (value === '' || value == null) return true;
      return Number(value) >= min;
    },
    message: message || `Must be at least ${min}`,
    severity: 'error'
  }),

  max: (max: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (value === '' || value == null) return true;
      return Number(value) <= max;
    },
    message: message || `Must be at most ${max}`,
    severity: 'error'
  }),

  // SAT validation
  satTotal: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const num = Number(value);
      return num >= 400 && num <= 1600;
    },
    message: 'SAT total must be between 400 and 1600',
    severity: 'error'
  }),

  satSection: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const num = Number(value);
      return num >= 200 && num <= 800;
    },
    message: 'SAT section score must be between 200 and 800',
    severity: 'error'
  }),

  satBreakdownSum: (formData: any): ValidationRule => ({
    validate: (_value, data) => {
      const form = data || formData;
      if (!form?.sat_total || !form?.sat_math || !form?.sat_ebrw) return true;
      const total = Number(form.sat_total);
      const math = Number(form.sat_math);
      const ebrw = Number(form.sat_ebrw);
      return math + ebrw === total;
    },
    message: "Your section scores don't add up to the total",
    severity: 'error'
  }),

  // ACT validation
  actScore: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const num = Number(value);
      return num >= 1 && num <= 36;
    },
    message: 'ACT score must be between 1 and 36',
    severity: 'error'
  }),

  // IELTS validation
  ieltsScore: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const num = Number(value);
      return num >= 0 && num <= 9;
    },
    message: 'IELTS score must be between 0 and 9',
    severity: 'error'
  }),

  // TOEFL validation
  toeflScore: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const num = Number(value);
      return num >= 0 && num <= 120;
    },
    message: 'TOEFL score must be between 0 and 120',
    severity: 'error'
  }),

  // Hours per week validation
  hoursPerWeek: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return Number(value) <= 168;
    },
    message: 'There are only 168 hours in a week',
    severity: 'error'
  }),

  hoursPerWeekWarning: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      return Number(value) <= 50;
    },
    message: 'This is over 7 hours per day - are you sure?',
    severity: 'warning'
  }),

  // GPA validation
  gpaWithinScale: (gpaScaleField: string): ValidationRule => ({
    validate: (value, formData) => {
      if (!value || !formData?.[gpaScaleField]) return true;
      return Number(value) <= Number(formData[gpaScaleField]);
    },
    message: 'GPA cannot exceed your GPA scale',
    severity: 'error'
  }),

  gpaScale: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const num = Number(value);
      // Only common GPA scales are accepted (warning is informational)
      return [4.0, 5.0, 10.0, 100].includes(num);
    },
    message: 'Common GPA scales are 4.0, 5.0, 10.0, or 100',
    severity: 'warning'
  }),

  // Year validation
  graduationYear: (): ValidationRule => ({
    validate: (value) => {
      if (!value) return true;
      const currentYear = new Date().getFullYear();
      const num = Number(value);
      return num >= currentYear - 4 && num <= currentYear + 10;
    },
    message: 'Graduation year should be within a valid range',
    severity: 'error'
  })
};

interface UseFormValidationOptions {
  rules: { [fieldName: string]: ValidationRule[] };
  validateOnChange?: boolean;
}

export function useFormValidation(options: UseFormValidationOptions) {
  const { rules, validateOnChange = true } = options;
  const [validationState, setValidationState] = useState<FormValidationState>({});
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const validateField = useCallback((fieldName: string, value: any, formData?: any): FieldValidation => {
    const fieldRules = rules[fieldName] || [];
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of fieldRules) {
      const isValid = rule.validate(value, formData);
      if (!isValid) {
        if (rule.severity === 'error') {
          errors.push(rule.message);
        } else {
          warnings.push(rule.message);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }, [rules]);

  const validateForm = useCallback((formData: any): { isValid: boolean; state: FormValidationState } => {
    const newState: FormValidationState = {};
    let isFormValid = true;

    for (const fieldName of Object.keys(rules)) {
      const validation = validateField(fieldName, formData[fieldName], formData);
      newState[fieldName] = validation;
      if (!validation.isValid) {
        isFormValid = false;
      }
    }

    setValidationState(newState);
    return { isValid: isFormValid, state: newState };
  }, [rules, validateField]);

  const handleFieldChange = useCallback((fieldName: string, value: any, formData?: any) => {
    if (!validateOnChange && !touchedFields.has(fieldName)) {
      return;
    }

    const validation = validateField(fieldName, value, formData);
    setValidationState(prev => ({
      ...prev,
      [fieldName]: validation
    }));
  }, [validateOnChange, touchedFields, validateField]);

  const handleFieldBlur = useCallback((fieldName: string, value: any, formData?: any) => {
    setTouchedFields(prev => new Set(prev).add(fieldName));
    const validation = validateField(fieldName, value, formData);
    setValidationState(prev => ({
      ...prev,
      [fieldName]: validation
    }));
  }, [validateField]);

  const clearValidation = useCallback((fieldName?: string) => {
    if (fieldName) {
      setValidationState(prev => {
        const newState = { ...prev };
        delete newState[fieldName];
        return newState;
      });
    } else {
      setValidationState({});
      setTouchedFields(new Set());
    }
  }, []);

  const hasErrors = useMemo(() => {
    return Object.values(validationState).some(v => !v.isValid);
  }, [validationState]);

  const getFieldValidation = useCallback((fieldName: string): FieldValidation | undefined => {
    return validationState[fieldName];
  }, [validationState]);

  return {
    validationState,
    validateField,
    validateForm,
    handleFieldChange,
    handleFieldBlur,
    clearValidation,
    hasErrors,
    getFieldValidation
  };
}

/**
 * ValidationMessage Component
 * Displays inline validation errors/warnings
 */
interface ValidationMessageProps {
  validation?: FieldValidation;
  showOnlyIfTouched?: boolean;
}

export const ValidationMessage: React.FC<ValidationMessageProps> = ({
  validation,
  showOnlyIfTouched = false
}) => {
  if (!validation) return null;

  const { errors, warnings } = validation;

  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="mt-1 space-y-1">
      {errors.map((error, index) => (
        <p key={`error-${index}`} className="text-sm text-red-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      ))}
      {warnings.map((warning, index) => (
        <p key={`warning-${index}`} className="text-sm text-amber-600 flex items-center gap-1">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {warning}
        </p>
      ))}
    </div>
  );
};

export default useFormValidation;
