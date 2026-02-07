/**
 * EligibilityAutoFulfillService
 * 
 * Automatically determines which eligibility requirements are fulfilled
 * based on the student's profile, without needing manual input.
 * 
 * Key Features:
 * - Auto-fulfill high school diploma based on GPA and graduation status
 * - Auto-fulfill IB Diploma if IB total >= 24
 * - Auto-fulfill A-Levels if 3+ subjects with grades
 * - Auto-fulfill English proficiency if educated in English-medium school
 */

const logger = require('../utils/logger');

class EligibilityAutoFulfillService {
  /**
   * Check all auto-fulfillable requirements for a student
   * @param {Object} profile - Student profile
   * @returns {Object} Auto-fulfilled requirements with status
   */
  static checkAutoFulfillments(profile) {
    const fulfillments = {
      high_school_diploma: this.checkHighSchoolDiploma(profile),
      ib_diploma: this.checkIBDiploma(profile),
      a_levels: this.checkALevels(profile),
      english_proficiency: this.checkEnglishProficiency(profile),
      cbse_board: this.checkCBSEBoard(profile),
      icse_board: this.checkICSEBoard(profile)
    };

    return fulfillments;
  }

  /**
   * Check if high school diploma requirement is fulfilled
   * @param {Object} profile - Student profile
   * @returns {Object} Status object
   */
  static checkHighSchoolDiploma(profile) {
    const currentYear = new Date().getFullYear();
    const graduationYear = parseInt(profile.graduation_year) || 0;
    const gpa = parseFloat(profile.gpa) || 0;
    const percentage = parseFloat(profile.percentage) || 0;
    const gradeLevel = (profile.grade || profile.grade_level || '').toLowerCase();
    
    // Check if graduated
    const hasGraduated = graduationYear > 0 && graduationYear <= currentYear;
    const isGraduating = gradeLevel.includes('12') || gradeLevel.includes('senior');
    
    // GPA threshold (70% or 2.0 GPA minimum for most colleges)
    const MIN_PERCENTAGE = 60;
    const MIN_GPA = 2.0;
    
    const hasAcceptableGPA = gpa >= MIN_GPA;
    const hasAcceptablePercentage = percentage >= MIN_PERCENTAGE;
    const hasAcceptableGrades = hasAcceptableGPA || hasAcceptablePercentage;
    
    // Determine status
    if (hasGraduated && hasAcceptableGrades) {
      return {
        status: 'fulfilled',
        display: `✓ High School Diploma (${percentage > 0 ? percentage + '%' : gpa + ' GPA'})`,
        color: 'green',
        details: `Graduated ${graduationYear} with ${percentage > 0 ? percentage + '%' : gpa + ' GPA'}`,
        icon: 'check'
      };
    } else if (isGraduating && hasAcceptableGrades) {
      return {
        status: 'on_track',
        display: `⏳ High School Diploma (Expected ${graduationYear || currentYear})`,
        color: 'yellow',
        details: 'Currently in final year with acceptable grades',
        icon: 'clock'
      };
    } else if (!hasAcceptableGrades && (gpa > 0 || percentage > 0)) {
      return {
        status: 'below_threshold',
        display: `⚠️ High School Diploma (Below typical requirement)`,
        color: 'orange',
        details: `Your ${percentage > 0 ? percentage + '%' : gpa + ' GPA'} is below the typical ${MIN_PERCENTAGE}%/${MIN_GPA} GPA threshold for most colleges`,
        icon: 'alert'
      };
    } else {
      return {
        status: 'incomplete',
        display: '○ High School Diploma (Add grades)',
        color: 'gray',
        details: 'Add your GPA or percentage to check eligibility',
        icon: 'empty'
      };
    }
  }

  /**
   * Check if IB Diploma requirement is fulfilled
   * @param {Object} profile - Student profile
   * @returns {Object} Status object
   */
  static checkIBDiploma(profile) {
    const curriculum = (profile.curriculum || profile.curriculum_type || '').toUpperCase();
    const ibTotal = parseInt(profile.ib_total) || parseInt(profile.ib_predicted) || 0;
    const subjects = profile.subjects || profile.ib_subjects || [];
    
    // IB Diploma minimum is 24 points
    const IB_DIPLOMA_MINIMUM = 24;
    const IB_COMPETITIVE_MINIMUM = 38;
    
    if (!curriculum.includes('IB') && ibTotal === 0) {
      return {
        status: 'not_applicable',
        display: null,
        details: 'Not following IB curriculum'
      };
    }
    
    if (ibTotal >= IB_COMPETITIVE_MINIMUM) {
      return {
        status: 'fulfilled',
        display: `✓ IB Diploma (${ibTotal}/45 - Competitive)`,
        color: 'green',
        details: `Strong IB score of ${ibTotal} points`,
        icon: 'check'
      };
    } else if (ibTotal >= IB_DIPLOMA_MINIMUM) {
      return {
        status: 'fulfilled',
        display: `✓ IB Diploma (${ibTotal}/45)`,
        color: 'green',
        details: `IB Diploma with ${ibTotal} points`,
        icon: 'check'
      };
    } else if (ibTotal > 0) {
      return {
        status: 'below_threshold',
        display: `⚠️ IB Score Below Diploma Requirement (${ibTotal}/24 needed)`,
        color: 'orange',
        details: `Your predicted ${ibTotal} points is below the 24-point IB Diploma threshold`,
        icon: 'alert'
      };
    } else if (curriculum.includes('IB')) {
      return {
        status: 'pending',
        display: '⏳ IB Diploma (Awaiting scores)',
        color: 'yellow',
        details: 'Add your IB predicted or actual score',
        icon: 'clock'
      };
    }
    
    return { status: 'not_applicable', display: null };
  }

  /**
   * Check if A-Levels requirement is fulfilled
   * @param {Object} profile - Student profile
   * @returns {Object} Status object
   */
  static checkALevels(profile) {
    const curriculum = (profile.curriculum || profile.curriculum_type || '').toUpperCase();
    const aLevelSubjects = profile.a_level_subjects || profile.subjects || [];
    const aLevelGrades = profile.a_level_grades || {};
    
    // A-Levels requirement: typically 3+ subjects
    const MIN_SUBJECTS = 3;
    
    if (!curriculum.includes('A-LEVEL') && !curriculum.includes('CAMBRIDGE') && aLevelSubjects.length === 0) {
      return {
        status: 'not_applicable',
        display: null,
        details: 'Not following A-Level curriculum'
      };
    }
    
    const subjectCount = Array.isArray(aLevelSubjects) ? aLevelSubjects.length : 0;
    const hasGrades = Object.keys(aLevelGrades).length >= MIN_SUBJECTS;
    
    if (subjectCount >= MIN_SUBJECTS && hasGrades) {
      const grades = Object.values(aLevelGrades).join(', ');
      return {
        status: 'fulfilled',
        display: `✓ A-Levels (${subjectCount} subjects: ${grades})`,
        color: 'green',
        details: `${subjectCount} A-Level subjects with grades`,
        icon: 'check'
      };
    } else if (subjectCount >= MIN_SUBJECTS) {
      return {
        status: 'on_track',
        display: `⏳ A-Levels (${subjectCount} subjects, awaiting grades)`,
        color: 'yellow',
        details: 'Add your A-Level predicted or actual grades',
        icon: 'clock'
      };
    } else if (curriculum.includes('A-LEVEL') || curriculum.includes('CAMBRIDGE')) {
      return {
        status: 'incomplete',
        display: '○ A-Levels (Add subjects)',
        color: 'gray',
        details: 'Add your A-Level subjects',
        icon: 'empty'
      };
    }
    
    return { status: 'not_applicable', display: null };
  }

  /**
   * Check if English proficiency requirement is fulfilled
   * @param {Object} profile - Student profile
   * @returns {Object} Status object
   */
  static checkEnglishProficiency(profile) {
    const mediumOfInstruction = (profile.medium_of_instruction || '').toLowerCase();
    const country = (profile.country || '').toLowerCase();
    const ieltsScore = parseFloat(profile.ielts_score) || 0;
    const toeflScore = parseInt(profile.toefl_score) || 0;
    const duolingoScore = parseInt(profile.duolingo_score) || 0;
    
    // English-speaking countries
    const englishSpeakingCountries = ['united states', 'usa', 'uk', 'united kingdom', 
      'canada', 'australia', 'new zealand', 'ireland', 'singapore'];
    
    // Check for English-medium education
    const hasEnglishMedium = mediumOfInstruction === 'english' || 
                             mediumOfInstruction.includes('english');
    const isFromEnglishCountry = englishSpeakingCountries.some(c => country.includes(c));
    
    // Score thresholds
    const IELTS_MIN = 6.0;
    const IELTS_COMPETITIVE = 7.0;
    const TOEFL_MIN = 80;
    const TOEFL_COMPETITIVE = 100;
    const DUOLINGO_MIN = 105;
    const DUOLINGO_COMPETITIVE = 120;
    
    // Auto-waiver scenarios
    if (isFromEnglishCountry) {
      return {
        status: 'waived',
        display: '✓ English Proficiency (Native/Exempt)',
        color: 'green',
        details: 'Exempt as native English speaker or from English-speaking country',
        icon: 'check'
      };
    }
    
    if (hasEnglishMedium) {
      return {
        status: 'waiver_eligible',
        display: '✓ English Proficiency (Medium of Instruction Waiver)',
        color: 'green',
        details: 'May be eligible for waiver - education in English medium. Check with each university.',
        icon: 'check'
      };
    }
    
    // Check test scores
    if (ieltsScore >= IELTS_COMPETITIVE || toeflScore >= TOEFL_COMPETITIVE || duolingoScore >= DUOLINGO_COMPETITIVE) {
      const scoreDisplay = ieltsScore > 0 ? `IELTS ${ieltsScore}` : 
                          toeflScore > 0 ? `TOEFL ${toeflScore}` : `Duolingo ${duolingoScore}`;
      return {
        status: 'fulfilled',
        display: `✓ English Proficiency (${scoreDisplay} - Competitive)`,
        color: 'green',
        details: `Strong English proficiency score`,
        icon: 'check'
      };
    }
    
    if (ieltsScore >= IELTS_MIN || toeflScore >= TOEFL_MIN || duolingoScore >= DUOLINGO_MIN) {
      const scoreDisplay = ieltsScore > 0 ? `IELTS ${ieltsScore}` : 
                          toeflScore > 0 ? `TOEFL ${toeflScore}` : `Duolingo ${duolingoScore}`;
      return {
        status: 'fulfilled',
        display: `✓ English Proficiency (${scoreDisplay})`,
        color: 'green',
        details: 'Meets minimum English proficiency requirements',
        icon: 'check'
      };
    }
    
    if (ieltsScore > 0 || toeflScore > 0 || duolingoScore > 0) {
      const scoreDisplay = ieltsScore > 0 ? `IELTS ${ieltsScore}` : 
                          toeflScore > 0 ? `TOEFL ${toeflScore}` : `Duolingo ${duolingoScore}`;
      return {
        status: 'below_threshold',
        display: `⚠️ English Proficiency (${scoreDisplay} - Below typical requirement)`,
        color: 'orange',
        details: 'Score may not meet requirements for competitive programs',
        icon: 'alert'
      };
    }
    
    return {
      status: 'required',
      display: '○ English Proficiency (IELTS/TOEFL required)',
      color: 'gray',
      details: 'Take IELTS (min 6.0) or TOEFL (min 80) for international applications',
      icon: 'empty'
    };
  }

  /**
   * Check CBSE board recognition
   * @param {Object} profile - Student profile
   * @returns {Object} Status object
   */
  static checkCBSEBoard(profile) {
    const curriculum = (profile.curriculum || profile.curriculum_type || profile.academic_board || '').toUpperCase();
    
    if (!curriculum.includes('CBSE')) {
      return { status: 'not_applicable', display: null };
    }
    
    return {
      status: 'fulfilled',
      display: '✓ CBSE Board (Internationally Recognized)',
      color: 'green',
      details: 'CBSE is accepted by most international universities',
      icon: 'check'
    };
  }

  /**
   * Check ICSE board recognition
   * @param {Object} profile - Student profile
   * @returns {Object} Status object
   */
  static checkICSEBoard(profile) {
    const curriculum = (profile.curriculum || profile.curriculum_type || profile.academic_board || '').toUpperCase();
    
    if (!curriculum.includes('ICSE') && !curriculum.includes('ISC')) {
      return { status: 'not_applicable', display: null };
    }
    
    return {
      status: 'fulfilled',
      display: '✓ ICSE/ISC Board (Internationally Recognized)',
      color: 'green',
      details: 'ICSE/ISC is well-recognized internationally',
      icon: 'check'
    };
  }

  /**
   * Get eligibility summary for a college
   * @param {Object} profile - Student profile
   * @param {Object} college - College info
   * @returns {Object} Complete eligibility summary
   */
  static getEligibilitySummary(profile, college = {}) {
    const autoFulfillments = this.checkAutoFulfillments(profile);
    
    // Filter out not_applicable items
    const applicableFulfillments = Object.entries(autoFulfillments)
      .filter(([key, value]) => value.status !== 'not_applicable' && value.display)
      .map(([key, value]) => ({
        requirement: key,
        ...value
      }));
    
    // Calculate summary
    const fulfilled = applicableFulfillments.filter(f => 
      f.status === 'fulfilled' || f.status === 'waived' || f.status === 'waiver_eligible'
    ).length;
    
    const pending = applicableFulfillments.filter(f => 
      f.status === 'on_track' || f.status === 'pending'
    ).length;
    
    const issues = applicableFulfillments.filter(f => 
      f.status === 'below_threshold' || f.status === 'incomplete' || f.status === 'required'
    ).length;
    
    return {
      fulfillments: applicableFulfillments,
      summary: {
        fulfilled,
        pending,
        issues,
        total: applicableFulfillments.length
      },
      overallStatus: issues > 0 ? 'needs_attention' : pending > 0 ? 'in_progress' : 'eligible',
      displayText: issues > 0 
        ? `${issues} requirement(s) need attention`
        : pending > 0 
        ? `${pending} requirement(s) in progress`
        : `All ${fulfilled} requirements met`
    };
  }
}

module.exports = EligibilityAutoFulfillService;
