// src/components/CollegeProfileComparison.tsx
// Component for displaying profile comparison with college admission metrics
// Shows GPA, SAT, ACT comparison with "Above average", "About average", "Below average" labels

import React from 'react';
import { TrendingUp, TrendingDown, Minus, AlertCircle } from 'lucide-react';

interface UserMetrics {
  gpa?: number;
  sat_total?: number;
  sat_math?: number;
  sat_reading?: number;
  act_composite?: number;
}

interface CollegeMetrics {
  sat_math_25?: number;
  sat_math_75?: number;
  sat_reading_25?: number;
  sat_reading_75?: number;
  act_25?: number;
  act_75?: number;
  gpa_25?: number;
  gpa_75?: number;
  acceptance_rate?: number;
  data_source?: string;
}

interface DimensionComparison {
  name: string;
  userValue: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  status: 'above' | 'about' | 'below' | 'unavailable';
}

interface Props {
  userMetrics: UserMetrics;
  collegeMetrics: CollegeMetrics;
  collegeName: string;
}

const CollegeProfileComparison: React.FC<Props> = ({
  userMetrics,
  collegeMetrics,
  collegeName
}) => {
  // Calculate comparison for each dimension
  const comparisons: DimensionComparison[] = [];

  // GPA comparison
  if (userMetrics.gpa !== undefined) {
    comparisons.push(
      calculateComparison(
        'GPA',
        userMetrics.gpa,
        collegeMetrics.gpa_25,
        collegeMetrics.gpa_75
      )
    );
  }

  // SAT Math comparison
  if (userMetrics.sat_math !== undefined) {
    comparisons.push(
      calculateComparison(
        'SAT Math',
        userMetrics.sat_math,
        collegeMetrics.sat_math_25,
        collegeMetrics.sat_math_75
      )
    );
  }

  // SAT Reading comparison
  if (userMetrics.sat_reading !== undefined) {
    comparisons.push(
      calculateComparison(
        'SAT Reading',
        userMetrics.sat_reading,
        collegeMetrics.sat_reading_25,
        collegeMetrics.sat_reading_75
      )
    );
  }

  // SAT Total comparison
  if (userMetrics.sat_total !== undefined) {
    const total25 = (collegeMetrics.sat_math_25 && collegeMetrics.sat_reading_25)
      ? collegeMetrics.sat_math_25 + collegeMetrics.sat_reading_25
      : undefined;
    const total75 = (collegeMetrics.sat_math_75 && collegeMetrics.sat_reading_75)
      ? collegeMetrics.sat_math_75 + collegeMetrics.sat_reading_75
      : undefined;

    comparisons.push(
      calculateComparison(
        'SAT Total',
        userMetrics.sat_total,
        total25,
        total75
      )
    );
  }

  // ACT comparison
  if (userMetrics.act_composite !== undefined) {
    comparisons.push(
      calculateComparison(
        'ACT',
        userMetrics.act_composite,
        collegeMetrics.act_25,
        collegeMetrics.act_75
      )
    );
  }

  // Filter to only show comparisons that have data
  const availableComparisons = comparisons.filter(c => c.status !== 'unavailable');

  if (availableComparisons.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 text-gray-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">
            Insufficient data to compare your profile with {collegeName}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b">
        <h4 className="font-semibold text-gray-900">How You Compare</h4>
        <p className="text-xs text-gray-600">
          vs. typical admitted students at {collegeName}
        </p>
      </div>

      <div className="divide-y divide-gray-100">
        {availableComparisons.map((comparison, index) => (
          <ComparisonRow key={index} comparison={comparison} />
        ))}
      </div>

      {collegeMetrics.data_source && (
        <div className="px-4 py-2 bg-gray-50 border-t">
          <p className="text-xs text-gray-500">
            Data source: {collegeMetrics.data_source}
          </p>
        </div>
      )}

      <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
        <p className="text-xs text-amber-700">
          ⚠️ This comparison is based on historical data and does not predict admission outcomes. 
          Admissions decisions consider many factors beyond test scores.
        </p>
      </div>
    </div>
  );
};

// Helper component for each comparison row
const ComparisonRow: React.FC<{ comparison: DimensionComparison }> = ({ comparison }) => {
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'above':
        return {
          label: 'Above average',
          color: 'text-green-700 bg-green-100',
          icon: <TrendingUp className="w-4 h-4 text-green-600" />
        };
      case 'about':
        return {
          label: 'About average',
          color: 'text-blue-700 bg-blue-100',
          icon: <Minus className="w-4 h-4 text-blue-600" />
        };
      case 'below':
        return {
          label: 'Below average',
          color: 'text-orange-700 bg-orange-100',
          icon: <TrendingDown className="w-4 h-4 text-orange-600" />
        };
      default:
        return {
          label: 'Data unavailable',
          color: 'text-gray-700 bg-gray-100',
          icon: <AlertCircle className="w-4 h-4 text-gray-500" />
        };
    }
  };

  const config = getStatusConfig(comparison.status);
  const formatValue = (val: number | null, name: string) => {
    if (val === null) return 'N/A';
    if (name === 'GPA') return val.toFixed(2);
    return val.toString();
  };

  return (
    <div className="px-4 py-3 flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{comparison.name}</span>
          {config.icon}
        </div>
        <div className="text-sm text-gray-600 mt-1">
          <span>Your score: </span>
          <span className="font-semibold">{formatValue(comparison.userValue, comparison.name)}</span>
          {comparison.rangeMin !== null && comparison.rangeMax !== null && (
            <>
              <span className="mx-2">•</span>
              <span>Typical range: </span>
              <span className="font-medium">
                {formatValue(comparison.rangeMin, comparison.name)}–{formatValue(comparison.rangeMax, comparison.name)}
              </span>
            </>
          )}
        </div>
      </div>
      <div className={`px-3 py-1 rounded-full text-sm font-medium ${config.color}`}>
        {config.label}
      </div>
    </div>
  );
};

// Helper function to calculate comparison status
function calculateComparison(
  name: string,
  userValue: number | undefined,
  rangeMin: number | undefined,
  rangeMax: number | undefined
): DimensionComparison {
  if (userValue === undefined) {
    return {
      name,
      userValue: null,
      rangeMin: rangeMin ?? null,
      rangeMax: rangeMax ?? null,
      status: 'unavailable'
    };
  }

  if (rangeMin === undefined || rangeMax === undefined) {
    return {
      name,
      userValue,
      rangeMin: null,
      rangeMax: null,
      status: 'unavailable'
    };
  }

  const midpoint = (rangeMin + rangeMax) / 2;
  const range = rangeMax - rangeMin;
  const tolerance = range * 0.1; // 10% tolerance for "about average"

  let status: 'above' | 'about' | 'below';
  if (userValue >= rangeMax) {
    status = 'above';
  } else if (userValue >= midpoint - tolerance) {
    status = 'about';
  } else {
    status = 'below';
  }

  return {
    name,
    userValue,
    rangeMin,
    rangeMax,
    status
  };
}

export default CollegeProfileComparison;
