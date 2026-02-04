/**
 * Grade Conversion Utilities for Universal College Application Tracker
 * Supports CBSE, A-levels, IB, AP, and other curriculum systems
 */

// ==========================================
// CBSE PERCENTAGE TO GPA CONVERSION
// ==========================================
export function cbseToGPA(percentage: number): number {
  if (percentage >= 90) return 4.0;
  if (percentage >= 85) return 3.9;
  if (percentage >= 80) return 3.7;
  if (percentage >= 75) return 3.5;
  if (percentage >= 70) return 3.3;
  if (percentage >= 65) return 3.0;
  if (percentage >= 60) return 2.7;
  if (percentage >= 55) return 2.3;
  if (percentage >= 50) return 2.0;
  if (percentage >= 45) return 1.7;
  if (percentage >= 40) return 1.3;
  return 1.0;
}

// ==========================================
// A-LEVEL GRADES TO UCAS TARIFF POINTS
// ==========================================
const A_LEVEL_TARIFF: Record<string, number> = {
  'A*': 56,
  'A': 48,
  'B': 40,
  'C': 32,
  'D': 24,
  'E': 16,
};

const AS_LEVEL_TARIFF: Record<string, number> = {
  'A': 20,
  'B': 16,
  'C': 12,
  'D': 10,
  'E': 6,
};

const EPQ_TARIFF: Record<string, number> = {
  'A*': 28,
  'A': 24,
  'B': 20,
  'C': 16,
  'D': 12,
  'E': 8,
};

export interface ALevelGrade {
  subject: string;
  grade: string;
  isAS?: boolean;
  isEPQ?: boolean;
}

export function aLevelToUCASPoints(grades: ALevelGrade[]): number {
  let totalPoints = 0;
  
  for (const gradeInfo of grades) {
    if (gradeInfo.isEPQ) {
      totalPoints += EPQ_TARIFF[gradeInfo.grade] || 0;
    } else if (gradeInfo.isAS) {
      totalPoints += AS_LEVEL_TARIFF[gradeInfo.grade] || 0;
    } else {
      totalPoints += A_LEVEL_TARIFF[gradeInfo.grade] || 0;
    }
  }
  
  return totalPoints;
}

export function formatUCASGrades(grades: ALevelGrade[]): string {
  const a2Grades = grades.filter(g => !g.isAS && !g.isEPQ);
  return a2Grades.map(g => g.grade).join('');
}

// ==========================================
// A-LEVEL GRADES TO US GPA
// ==========================================
export function aLevelToGPA(grade: string): number {
  const gradeMap: Record<string, number> = {
    'A*': 4.0,
    'A': 4.0,
    'B': 3.0,
    'C': 2.0,
    'D': 1.0,
    'E': 0.5,
    'U': 0.0,
  };
  return gradeMap[grade] || 0;
}

export function aLevelGradesToGPA(grades: string[]): number {
  if (grades.length === 0) return 0;
  const total = grades.reduce((sum, grade) => sum + aLevelToGPA(grade), 0);
  return Number((total / grades.length).toFixed(2));
}

// ==========================================
// IB PREDICTED SCORE TO GPA
// ==========================================
export function ibToGPA(ibScore: number): number {
  // IB is out of 45 points
  if (ibScore >= 42) return 4.0;
  if (ibScore >= 40) return 3.9;
  if (ibScore >= 38) return 3.7;
  if (ibScore >= 36) return 3.5;
  if (ibScore >= 34) return 3.3;
  if (ibScore >= 32) return 3.0;
  if (ibScore >= 30) return 2.7;
  if (ibScore >= 28) return 2.3;
  if (ibScore >= 26) return 2.0;
  if (ibScore >= 24) return 1.7;
  return 1.3;
}

// IB to UCAS tariff (approximate based on total IB score)
export function ibToUCASPoints(ibScore: number): number {
  // Based on UCAS tariff tables for IB diploma
  if (ibScore >= 45) return 168;
  if (ibScore >= 44) return 162;
  if (ibScore >= 43) return 155;
  if (ibScore >= 42) return 149;
  if (ibScore >= 41) return 143;
  if (ibScore >= 40) return 137;
  if (ibScore >= 39) return 130;
  if (ibScore >= 38) return 124;
  if (ibScore >= 37) return 118;
  if (ibScore >= 36) return 112;
  if (ibScore >= 35) return 105;
  if (ibScore >= 34) return 99;
  if (ibScore >= 33) return 93;
  if (ibScore >= 32) return 87;
  if (ibScore >= 31) return 80;
  if (ibScore >= 30) return 74;
  if (ibScore >= 29) return 68;
  if (ibScore >= 28) return 62;
  if (ibScore >= 27) return 55;
  if (ibScore >= 26) return 49;
  if (ibScore >= 25) return 43;
  if (ibScore >= 24) return 37;
  return 30;
}

// ==========================================
// AP SCORES TO GPA CREDIT
// ==========================================
export interface APScore {
  subject: string;
  score: number; // 1-5
}

export function apToGPA(score: number): number {
  const scoreMap: Record<number, number> = {
    5: 4.0, // A+
    4: 4.0, // A
    3: 3.0, // B+
    2: 2.0, // C
    1: 1.0, // D
  };
  return scoreMap[score] || 0;
}

export function apToCreditHours(score: number): number {
  // Most colleges give 3-4 credit hours for AP score of 4 or 5
  if (score >= 4) return 3;
  if (score === 3) return 3; // Some colleges accept 3
  return 0;
}

export function calculateAPCredits(scores: APScore[]): { totalCredits: number; eligibleCredits: number } {
  const totalCredits = scores.reduce((sum, s) => sum + apToCreditHours(s.score), 0);
  const eligibleCredits = scores.filter(s => s.score >= 3).length * 3;
  return { totalCredits, eligibleCredits };
}

// ==========================================
// BTEC GRADES TO UCAS POINTS
// ==========================================
const BTEC_EXTENDED_DIPLOMA: Record<string, number> = {
  'D*D*D*': 168,
  'D*D*D': 160,
  'D*DD': 152,
  'DDD': 144,
  'DDM': 128,
  'DMM': 112,
  'MMM': 96,
  'MMP': 80,
  'MPP': 64,
  'PPP': 48,
};

const BTEC_DIPLOMA: Record<string, number> = {
  'D*D*': 112,
  'D*D': 104,
  'DD': 96,
  'DM': 80,
  'MM': 64,
  'MP': 48,
  'PP': 32,
};

const BTEC_SUBSIDIARY: Record<string, number> = {
  'D*': 56,
  'D': 48,
  'M': 32,
  'P': 16,
};

export function btecToUCASPoints(grade: string, type: 'extended' | 'diploma' | 'subsidiary'): number {
  switch (type) {
    case 'extended':
      return BTEC_EXTENDED_DIPLOMA[grade] || 0;
    case 'diploma':
      return BTEC_DIPLOMA[grade] || 0;
    case 'subsidiary':
      return BTEC_SUBSIDIARY[grade] || 0;
    default:
      return 0;
  }
}

// ==========================================
// UNIVERSAL GRADE CONVERTER
// ==========================================
export type CurriculumType = 'CBSE' | 'ICSE' | 'IB' | 'A-Levels' | 'AP' | 'BTEC' | 'State Board' | 'Other';

export interface GradeConversionResult {
  gpa: number;
  ucasPoints?: number;
  creditHours?: number;
  originalValue: string | number;
  curriculum: CurriculumType;
}

export function convertGrade(
  value: number | string,
  curriculum: CurriculumType,
  additionalInfo?: { grades?: ALevelGrade[]; apScores?: APScore[]; btecType?: 'extended' | 'diploma' | 'subsidiary' }
): GradeConversionResult {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  switch (curriculum) {
    case 'CBSE':
    case 'ICSE':
    case 'State Board':
      return {
        gpa: cbseToGPA(numValue),
        originalValue: value,
        curriculum,
      };
      
    case 'IB':
      return {
        gpa: ibToGPA(numValue),
        ucasPoints: ibToUCASPoints(numValue),
        originalValue: value,
        curriculum,
      };
      
    case 'A-Levels':
      if (additionalInfo?.grades) {
        const grades = additionalInfo.grades.filter(g => !g.isAS && !g.isEPQ).map(g => g.grade);
        return {
          gpa: aLevelGradesToGPA(grades),
          ucasPoints: aLevelToUCASPoints(additionalInfo.grades),
          originalValue: formatUCASGrades(additionalInfo.grades),
          curriculum,
        };
      }
      return {
        gpa: aLevelToGPA(String(value)),
        ucasPoints: A_LEVEL_TARIFF[String(value)] || 0,
        originalValue: value,
        curriculum,
      };
      
    case 'AP':
      if (additionalInfo?.apScores) {
        const credits = calculateAPCredits(additionalInfo.apScores);
        const avgScore = additionalInfo.apScores.reduce((sum, s) => sum + s.score, 0) / additionalInfo.apScores.length;
        return {
          gpa: apToGPA(Math.round(avgScore)),
          creditHours: credits.totalCredits,
          originalValue: `${additionalInfo.apScores.length} AP exams`,
          curriculum,
        };
      }
      return {
        gpa: apToGPA(numValue),
        creditHours: apToCreditHours(numValue),
        originalValue: value,
        curriculum,
      };
      
    case 'BTEC':
      return {
        gpa: 0, // BTEC doesn't directly convert to GPA
        ucasPoints: btecToUCASPoints(String(value), additionalInfo?.btecType || 'diploma'),
        originalValue: value,
        curriculum,
      };
      
    default:
      return {
        gpa: cbseToGPA(numValue), // Default to percentage-based
        originalValue: value,
        curriculum,
      };
  }
}

// ==========================================
// UNIVERSITY REQUIREMENT CHECKER
// ==========================================
export interface UniversityRequirement {
  name: string;
  minGPA?: number;
  minUCASPoints?: number;
  aLevelGrades?: string; // e.g., "AAA" or "A*AA"
  minIBScore?: number;
}

export function meetsRequirement(
  studentResult: GradeConversionResult,
  requirement: UniversityRequirement
): { meets: boolean; gap?: string } {
  if (requirement.minGPA && studentResult.gpa < requirement.minGPA) {
    return {
      meets: false,
      gap: `GPA ${studentResult.gpa.toFixed(2)} is below minimum ${requirement.minGPA.toFixed(2)}`,
    };
  }
  
  if (requirement.minUCASPoints && studentResult.ucasPoints && studentResult.ucasPoints < requirement.minUCASPoints) {
    return {
      meets: false,
      gap: `UCAS points ${studentResult.ucasPoints} is below minimum ${requirement.minUCASPoints}`,
    };
  }
  
  if (requirement.minIBScore && studentResult.curriculum === 'IB') {
    const ibScore = Number(studentResult.originalValue);
    if (ibScore < requirement.minIBScore) {
      return {
        meets: false,
        gap: `IB score ${ibScore} is below minimum ${requirement.minIBScore}`,
      };
    }
  }
  
  return { meets: true };
}

// ==========================================
// SUPERSCORE CALCULATOR
// ==========================================
export interface TestAttempt {
  date: Date;
  reading?: number;
  writing?: number;
  math?: number;
  total?: number;
  english?: number; // For ACT
  science?: number; // For ACT
}

export function calculateSATSuperscore(attempts: TestAttempt[]): { 
  reading: number; 
  math: number; 
  superscore: number;
  breakdown: { date: Date; section: string; score: number }[];
} {
  if (attempts.length === 0) {
    return { reading: 0, math: 0, superscore: 0, breakdown: [] };
  }
  
  let bestReading = 0;
  let bestMath = 0;
  let readingDate = new Date();
  let mathDate = new Date();
  
  for (const attempt of attempts) {
    const reading = (attempt.reading || 0) + (attempt.writing || 0);
    if (reading > bestReading) {
      bestReading = reading;
      readingDate = attempt.date;
    }
    if ((attempt.math || 0) > bestMath) {
      bestMath = attempt.math || 0;
      mathDate = attempt.date;
    }
  }
  
  return {
    reading: bestReading,
    math: bestMath,
    superscore: bestReading + bestMath,
    breakdown: [
      { date: readingDate, section: 'Evidence-Based Reading & Writing', score: bestReading },
      { date: mathDate, section: 'Math', score: bestMath },
    ],
  };
}

export function calculateACTSuperscore(attempts: TestAttempt[]): {
  english: number;
  math: number;
  reading: number;
  science: number;
  composite: number;
  breakdown: { date: Date; section: string; score: number }[];
} {
  if (attempts.length === 0) {
    return { english: 0, math: 0, reading: 0, science: 0, composite: 0, breakdown: [] };
  }
  
  let bestEnglish = 0, bestMath = 0, bestReading = 0, bestScience = 0;
  let englishDate = new Date(), mathDate = new Date(), readingDate = new Date(), scienceDate = new Date();
  
  for (const attempt of attempts) {
    if ((attempt.english || 0) > bestEnglish) {
      bestEnglish = attempt.english || 0;
      englishDate = attempt.date;
    }
    if ((attempt.math || 0) > bestMath) {
      bestMath = attempt.math || 0;
      mathDate = attempt.date;
    }
    if ((attempt.reading || 0) > bestReading) {
      bestReading = attempt.reading || 0;
      readingDate = attempt.date;
    }
    if ((attempt.science || 0) > bestScience) {
      bestScience = attempt.science || 0;
      scienceDate = attempt.date;
    }
  }
  
  const composite = Math.round((bestEnglish + bestMath + bestReading + bestScience) / 4);
  
  return {
    english: bestEnglish,
    math: bestMath,
    reading: bestReading,
    science: bestScience,
    composite,
    breakdown: [
      { date: englishDate, section: 'English', score: bestEnglish },
      { date: mathDate, section: 'Math', score: bestMath },
      { date: readingDate, section: 'Reading', score: bestReading },
      { date: scienceDate, section: 'Science', score: bestScience },
    ],
  };
}
