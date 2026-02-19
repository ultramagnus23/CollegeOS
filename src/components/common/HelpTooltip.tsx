/**
 * HelpTooltip Component
 * Displays contextual help text for form fields
 * Accessible: keyboard navigable, screen reader friendly
 */
import React from 'react';
import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HelpTooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  iconSize?: number;
  className?: string;
}

/**
 * Pre-defined help text for common fields
 */
export const FIELD_HELP_TEXT: { [key: string]: string } = {
  gpa_scale: "Most US schools use 4.0 scale. Some use 5.0 for weighted GPA. Indian schools typically use 10.0 or 100 scale. Enter the scale YOUR school uses.",
  class_rank: "Your position in your graduating class ranked by GPA. If you are 5th out of 200 students, enter 5 for rank and 200 for class size.",
  ib_predicted_grade: "Your teacher's prediction of your final IB exam grade from 1 (lowest) to 7 (highest).",
  hours_per_week: "Average hours spent per week. Be realistic - admissions offices can spot inflated hours.",
  weeks_per_year: "Number of weeks per year you participated. A full school year is typically 36-40 weeks.",
  sat_total: "Your total SAT score, which should equal Math + Evidence-Based Reading and Writing (EBRW). Range: 400-1600.",
  act_composite: "Your ACT composite score, an average of the four section scores. Range: 1-36.",
  ielts_score: "Your overall IELTS band score. Range: 0-9, with 0.5 increments.",
  toefl_score: "Your total TOEFL iBT score. Range: 0-120.",
  curriculum_type: "The educational system your school follows. This determines how your academic record will be evaluated.",
  graduation_year: "The year you will graduate (or did graduate) from high school.",
  gpa_weighted: "GPA that includes bonus points for honors, AP, or IB courses. Often on a 5.0 scale.",
  gpa_unweighted: "GPA without bonus points. Standard 4.0 scale where A=4.0, B=3.0, etc.",
  budget_max: "Maximum annual cost you can afford for college, including tuition, room, board, and fees.",
  college_size: "Small: <5,000 students. Medium: 5,000-15,000 students. Large: >15,000 students.",
  campus_setting: "Urban: in a city. Suburban: near a city. Rural: in a countryside or small town.",
  activity_tier: "Tier 1: National/International recognition. Tier 2: State/Regional. Tier 3: School-level. Tier 4: Participation only."
};

const HelpTooltip: React.FC<HelpTooltipProps> = ({ 
  content, 
  side = 'right',
  iconSize = 14,
  className = ''
}) => {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center text-gray-400 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-full transition-colors ${className}`}
            aria-label="Help information"
          >
            <HelpCircle size={iconSize} />
          </button>
        </TooltipTrigger>
        <TooltipContent 
          side={side} 
          className="max-w-xs text-sm leading-relaxed"
          role="tooltip"
        >
          <p>{content}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

/**
 * Helper function to get help text for a field
 */
export const getFieldHelpText = (fieldKey: string): string | undefined => {
  return FIELD_HELP_TEXT[fieldKey];
};

/**
 * FormFieldLabel with integrated help tooltip
 */
interface FormFieldLabelProps {
  label: string;
  htmlFor?: string;
  helpKey?: string;
  helpText?: string;
  required?: boolean;
  className?: string;
}

export const FormFieldLabel: React.FC<FormFieldLabelProps> = ({
  label,
  htmlFor,
  helpKey,
  helpText,
  required = false,
  className = ''
}) => {
  const tooltip = helpText || (helpKey ? FIELD_HELP_TEXT[helpKey] : undefined);
  
  return (
    <label 
      htmlFor={htmlFor}
      className={`flex items-center gap-1.5 text-sm font-medium text-gray-700 ${className}`}
    >
      {label}
      {required && <span className="text-red-500">*</span>}
      {tooltip && <HelpTooltip content={tooltip} />}
    </label>
  );
};

export default HelpTooltip;
