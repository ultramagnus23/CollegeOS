// backend/services/eligibilityChecker.js
// This service determines if a student is eligible for a particular college/program
// It checks academic requirements, exam requirements, and other prerequisites

/**
 * Check a student's eligibility for a college
 * Returns a detailed eligibility status with reasons
 * 
 * @param {Object} student - Student profile with academic info
 * @param {Object} college - College with requirements
 * @param {String} intendedProgram - The program the student wants to apply for (optional)
 * @returns {Object} Eligibility result with status and details
 */
function checkEligibility(student, college, intendedProgram = null) {
  const result = {
    eligible: true, // Overall eligibility
    status: 'eligible', // eligible, conditional, not_eligible
    issues: [], // Array of problems that make student ineligible
    warnings: [], // Array of things to complete (for conditional status)
    recommendations: [], // Helpful suggestions
    details: {}
  };
  
  // Get requirements from the college
  const requirements = college.requirements || {};
  
  // If a specific program is selected, use program-specific requirements
  let programRequirements = requirements;
  if (intendedProgram && requirements.programs && requirements.programs[intendedProgram]) {
    programRequirements = {
      ...requirements,
      ...requirements.programs[intendedProgram]
    };
  }
  
  // CHECK 1: Academic Board Requirements
  checkAcademicBoard(student, programRequirements, result);
  
  // CHECK 2: Subject Requirements
  checkSubjectRequirements(student, programRequirements, result);
  
  // CHECK 3: Exam Requirements
  checkExamRequirements(student, college, programRequirements, result);
  
  // CHECK 4: Language Requirements (for international students)
  checkLanguageRequirements(student, college, programRequirements, result);
  
  // CHECK 5: Grade Requirements
  checkGradeRequirements(student, programRequirements, result);
  
  // Determine final status
  if (result.issues.length > 0) {
    result.eligible = false;
    result.status = 'not_eligible';
  } else if (result.warnings.length > 0) {
    result.status = 'conditional';
  } else {
    result.status = 'eligible';
  }
  
  return result;
}

/**
 * Check if student's academic board is accepted
 */
function checkAcademicBoard(student, requirements, result) {
  // If college doesn't specify accepted boards, assume all are accepted
  if (!requirements.accepted_boards || requirements.accepted_boards.length === 0) {
    return;
  }
  
  const studentBoard = student.academic_board; // e.g., "CBSE", "ISC", "IB", "ICSE"
  
  if (!studentBoard) {
    result.warnings.push({
      type: 'missing_info',
      message: 'Please specify your academic board (CBSE, ISC, IB, etc.)',
      field: 'academic_board'
    });
    return;
  }
  
  const acceptedBoards = requirements.accepted_boards.map(b => b.toUpperCase());
  if (!acceptedBoards.includes(studentBoard.toUpperCase())) {
    result.issues.push({
      type: 'board_not_accepted',
      message: `This college requires one of: ${requirements.accepted_boards.join(', ')}. Your board (${studentBoard}) may not meet requirements.`,
      severity: 'high'
    });
  }
}

/**
 * Check if student has taken required subjects
 */
function checkSubjectRequirements(student, requirements, result) {
  const requiredSubjects = requirements.required_subjects || [];
  const studentSubjects = student.subjects || [];
  
  // Convert to uppercase for comparison
  const studentSubjectsUpper = studentSubjects.map(s => s.toUpperCase());
  
  requiredSubjects.forEach(required => {
    const requiredUpper = required.toUpperCase();
    
    // Check if student took this subject
    if (!studentSubjectsUpper.includes(requiredUpper)) {
      result.issues.push({
        type: 'missing_subject',
        message: `Required subject: ${required}. You haven't listed this in your academic profile.`,
        severity: 'high',
        subject: required
      });
    }
  });
  
  // Check recommended subjects (warnings, not blockers)
  const recommendedSubjects = requirements.recommended_subjects || [];
  recommendedSubjects.forEach(recommended => {
    const recommendedUpper = recommended.toUpperCase();
    
    if (!studentSubjectsUpper.includes(recommendedUpper)) {
      result.warnings.push({
        type: 'recommended_subject',
        message: `Recommended subject: ${recommended}. Having this subject strengthens your application.`,
        subject: recommended
      });
    }
  });
}

/**
 * Check exam requirements (SAT, ACT, IELTS, etc.)
 */
function checkExamRequirements(student, college, requirements, result) {
  const requiredExams = requirements.required_exams || [];
  const optionalExams = requirements.optional_exams || [];
  const studentExams = student.exams || {};
  
  // For test-optional schools
  if (requirements.test_optional && college.country === 'US') {
    result.recommendations.push({
      type: 'test_optional',
      message: 'This college is test-optional. You can apply without SAT/ACT, but submitting strong scores may strengthen your application.'
    });
    return;
  }
  
  // Check required exams
  requiredExams.forEach(exam => {
    const examUpper = exam.toUpperCase();
    
    // Check if student has taken or plans to take this exam
    if (!studentExams[examUpper]) {
      result.warnings.push({
        type: 'missing_exam',
        message: `Required: ${exam}. Please take this exam before the application deadline.`,
        exam: exam
      });
    } else if (studentExams[examUpper].status === 'planned') {
      result.warnings.push({
        type: 'exam_planned',
        message: `${exam} is required. Make sure to complete it before the deadline.`,
        exam: exam
      });
    } else if (studentExams[examUpper].score) {
      // Check if score meets minimum (if specified)
      const minScore = requirements.min_scores?.[examUpper];
      if (minScore && studentExams[examUpper].score < minScore) {
        result.issues.push({
          type: 'score_too_low',
          message: `Your ${exam} score (${studentExams[examUpper].score}) is below the minimum requirement (${minScore}).`,
          severity: 'medium',
          exam: exam
        });
      }
    }
  });
  
  // Handle optional exams (US colleges often accept SAT OR ACT)
  if (optionalExams.length > 0) {
    const hasAnyOptional = optionalExams.some(exam => 
      studentExams[exam.toUpperCase()] && 
      studentExams[exam.toUpperCase()].status === 'completed'
    );
    
    if (!hasAnyOptional) {
      result.warnings.push({
        type: 'optional_exam',
        message: `Choose one: ${optionalExams.join(' or ')}`,
        exams: optionalExams
      });
    }
  }
}

/**
 * Check language proficiency requirements
 */
function checkLanguageRequirements(student, college, requirements, result) {
  // Only for international applications
  if (college.country === 'India') {
    return; // No language requirement for Indian universities for Indian students
  }
  
  // Check if student's medium of instruction was English
  if (student.medium_of_instruction === 'English') {
    result.details.language_waiver = true;
    result.recommendations.push({
      type: 'language_waiver',
      message: 'You may be eligible for an English proficiency test waiver since your medium of instruction was English. Check with the university.'
    });
    return;
  }
  
  // Check for TOEFL/IELTS
  const languageExams = requirements.language_exams || ['IELTS', 'TOEFL'];
  const studentExams = student.exams || {};
  
  const hasLanguageTest = languageExams.some(exam => 
    studentExams[exam.toUpperCase()] && 
    studentExams[exam.toUpperCase()].status === 'completed'
  );
  
  if (!hasLanguageTest) {
    result.warnings.push({
      type: 'language_test_required',
      message: `English proficiency test required: ${languageExams.join(' or ')}`,
      exams: languageExams
    });
  }
}

/**
 * Check grade/percentage requirements
 */
function checkGradeRequirements(student, requirements, result) {
  if (!requirements.min_percentage && !requirements.min_gpa) {
    return; // No grade requirement specified
  }
  
  // Check percentage (for Indian students)
  if (requirements.min_percentage && student.percentage) {
    if (student.percentage < requirements.min_percentage) {
      result.issues.push({
        type: 'grade_too_low',
        message: `Minimum required: ${requirements.min_percentage}%. Your percentage: ${student.percentage}%`,
        severity: 'high'
      });
    }
  }
  
  // Check GPA (for international scale)
  if (requirements.min_gpa && student.gpa) {
    if (student.gpa < requirements.min_gpa) {
      result.issues.push({
        type: 'gpa_too_low',
        message: `Minimum required GPA: ${requirements.min_gpa}. Your GPA: ${student.gpa}`,
        severity: 'high'
      });
    }
  }
  
  // If no grades provided yet
  if (!student.percentage && !student.gpa) {
    result.warnings.push({
      type: 'missing_grades',
      message: 'Please add your grades to check eligibility accurately.',
      field: 'grades'
    });
  }
}

/**
 * Get a human-readable summary of eligibility status
 */
function getEligibilitySummary(eligibilityResult) {
  const { status, issues, warnings } = eligibilityResult;
  
  if (status === 'eligible') {
    return {
      text: 'You meet all requirements',
      color: 'green',
      icon: 'check'
    };
  } else if (status === 'conditional') {
    return {
      text: `${warnings.length} requirement(s) to complete`,
      color: 'yellow',
      icon: 'warning'
    };
  } else {
    return {
      text: `${issues.length} requirement(s) not met`,
      color: 'red',
      icon: 'x'
    };
  }
}

module.exports = {
  checkEligibility,
  getEligibilitySummary
};