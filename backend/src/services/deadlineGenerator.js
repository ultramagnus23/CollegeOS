// backend/services/deadlineGenerator.js
// This service automatically generates appropriate deadlines when a user selects a college
// It understands different countries, application types, and deadlines specific to each college

/**
 * Generate all relevant deadlines for a college application
 * This is called when a user adds a college to their application list
 * 
 * @param {Object} college - The college object with all its data
 * @param {Number} userId - The user's ID
 * @param {Number} applicationId - The application ID that was just created
 * @returns {Array} Array of deadline objects ready to be inserted into the database
 */
function generateDeadlinesForCollege(college, userId, applicationId) {
  const deadlines = [];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // JavaScript months are 0-indexed
  
  // Determine which application year we're working with
  // If it's after July, we're working on next year's applications
  const applicationYear = currentMonth >= 7 ? currentYear + 1 : currentYear;
  
  // Get the deadline templates from the college data
  const templates = college.deadline_templates || {};
  
  // COUNTRY-SPECIFIC DEADLINE GENERATION
  
  if (college.country === 'US') {
    deadlines.push(...generateUSDeadlines(templates, applicationYear, college, userId, applicationId));
  } else if (college.country === 'UK') {
    deadlines.push(...generateUKDeadlines(templates, applicationYear, college, userId, applicationId));
  } else if (college.country === 'Canada') {
    deadlines.push(...generateCanadaDeadlines(templates, applicationYear, college, userId, applicationId));
  } else {
    // Generic deadlines for other countries
    deadlines.push(...generateGenericDeadlines(templates, applicationYear, college, userId, applicationId));
  }
  
  // Filter out any deadlines that are in the past
  const now = new Date();
  return deadlines.filter(deadline => new Date(deadline.deadline_date) > now);
}

/**
 * Generate deadlines for US universities
 * US universities typically have: Early Action, Early Decision, Regular Decision, and Financial Aid deadlines
 */
function generateUSDeadlines(templates, year, college, userId, applicationId) {
  const deadlines = [];
  
  // Early Action deadline (typically November 1)
  if (templates.early_action) {
    const eaDate = parseDeadlineTemplate(templates.early_action, year);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Early Action Deadline - ${college.name}`,
      description: 'Non-binding early application deadline. You\'ll receive your decision earlier, typically by mid-December.',
      deadline_date: eaDate,
      deadline_type: 'application',
      priority: 'high',
      is_optional: true
    });
    
    // Add a reminder 2 weeks before
    const eaReminder = new Date(eaDate);
    eaReminder.setDate(eaReminder.getDate() - 14);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Early Action Reminder - ${college.name}`,
      description: 'Two weeks until the Early Action deadline. Make sure your application is ready!',
      deadline_date: eaReminder.toISOString().split('T')[0],
      deadline_type: 'application',
      priority: 'medium',
      is_optional: true
    });
  }
  
  // Early Decision deadline (typically November 1 or November 15)
  if (templates.early_decision) {
    const edDate = parseDeadlineTemplate(templates.early_decision, year);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Early Decision Deadline - ${college.name}`,
      description: 'BINDING early application. If accepted, you must attend this school and withdraw all other applications.',
      deadline_date: edDate,
      deadline_type: 'application',
      priority: 'critical',
      is_optional: true
    });
  }
  
  // Regular Decision deadline (typically January 1 or January 15)
  if (templates.regular_decision) {
    const rdDate = parseDeadlineTemplate(templates.regular_decision, year);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Regular Decision Deadline - ${college.name}`,
      description: 'Standard application deadline. Decisions typically released by late March or early April.',
      deadline_date: rdDate,
      deadline_type: 'application',
      priority: 'high',
      is_optional: false
    });
    
    // Add reminder deadlines
    const rdReminder1Month = new Date(rdDate);
    rdReminder1Month.setMonth(rdReminder1Month.getMonth() - 1);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Application Reminder - ${college.name}`,
      description: 'One month until the Regular Decision deadline. Start preparing your materials!',
      deadline_date: rdReminder1Month.toISOString().split('T')[0],
      deadline_type: 'application',
      priority: 'medium',
      is_optional: false
    });
  }
  
  // Financial Aid deadline (typically February 1 or February 15)
  if (templates.financial_aid) {
    const faidDate = parseDeadlineTemplate(templates.financial_aid, year);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Financial Aid Deadline - ${college.name}`,
      description: 'CSS Profile and any additional financial aid forms must be submitted by this date.',
      deadline_date: faidDate,
      deadline_type: 'financial_aid',
      priority: 'high',
      is_optional: false
    });
  }
  
  // Enrollment deposit deadline (typically May 1)
  if (templates.enrollment_deposit) {
    const enrollDate = parseDeadlineTemplate(templates.enrollment_deposit, year);
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Enrollment Deposit Deadline - ${college.name}`,
      description: 'Deadline to submit your enrollment deposit and confirm your attendance.',
      deadline_date: enrollDate,
      deadline_type: 'enrollment',
      priority: 'critical',
      is_optional: false
    });
  }
  
  return deadlines;
}

/**
 * Generate deadlines for UK universities (UCAS system)
 * UK has fixed UCAS deadlines that apply to most universities
 */
function generateUKDeadlines(templates, year, college, userId, applicationId) {
  const deadlines = [];
  
  // Oxbridge deadline (October 15)
  const isOxbridge = college.name.includes('Oxford') || college.name.includes('Cambridge');
  if (isOxbridge) {
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `UCAS Deadline (Oxbridge) - ${college.name}`,
      description: 'Early UCAS deadline for Oxford and Cambridge applications.',
      deadline_date: `${year - 1}-10-15`,
      deadline_type: 'application',
      priority: 'critical',
      is_optional: false
    });
  }
  
  // Standard UCAS deadline (January 15)
  const ucasDate = templates.ucas_deadline || `${year}-01-15`;
  deadlines.push({
    user_id: userId,
    application_id: applicationId,
    college_id: college.id,
    title: `UCAS Application Deadline - ${college.name}`,
    description: 'Standard UCAS deadline for UK university applications.',
    deadline_date: ucasDate,
    deadline_type: 'application',
    priority: 'high',
    is_optional: false
  });
  
  // UCAS Extra (February 25)
  deadlines.push({
    user_id: userId,
    application_id: applicationId,
    college_id: college.id,
    title: `UCAS Extra Opens - ${college.name}`,
    description: 'If you haven\'t received any offers, you can apply to additional courses through UCAS Extra.',
    deadline_date: `${year}-02-25`,
    deadline_type: 'application',
    priority: 'medium',
    is_optional: true
  });
  
  // Reply deadline for offers (typically June)
  deadlines.push({
    user_id: userId,
    application_id: applicationId,
    college_id: college.id,
    title: `Reply to Offers Deadline - ${college.name}`,
    description: 'Deadline to respond to your university offers (firm and insurance choices).',
    deadline_date: `${year}-06-08`,
    deadline_type: 'enrollment',
    priority: 'critical',
    is_optional: false
  });
  
  return deadlines;
}

/**
 * Generate deadlines for Canadian universities
 */
function generateCanadaDeadlines(templates, year, college, userId, applicationId) {
  const deadlines = [];
  
  // Most Canadian universities have deadlines between January and March
  const appDeadline = templates.application_deadline || `${year}-01-15`;
  deadlines.push({
    user_id: userId,
    application_id: applicationId,
    college_id: college.id,
    title: `Application Deadline - ${college.name}`,
    description: 'Standard application deadline for Canadian universities.',
    deadline_date: appDeadline,
    deadline_type: 'application',
    priority: 'high',
    is_optional: false
  });
  
  // Document submission deadlines (typically 2-4 weeks after application)
  const docDeadline = new Date(appDeadline);
  docDeadline.setDate(docDeadline.getDate() + 21);
  deadlines.push({
    user_id: userId,
    application_id: applicationId,
    college_id: college.id,
    title: `Supporting Documents Deadline - ${college.name}`,
    description: 'Deadline to submit transcripts, test scores, and other supporting documents.',
    deadline_date: docDeadline.toISOString().split('T')[0],
    deadline_type: 'transcript',
    priority: 'high',
    is_optional: false
  });
  
  return deadlines;
}

/**
 * Generate generic deadlines for other countries
 */
function generateGenericDeadlines(templates, year, college, userId, applicationId) {
  const deadlines = [];
  
  // Use whatever deadline templates are provided
  if (templates.application_deadline) {
    deadlines.push({
      user_id: userId,
      application_id: applicationId,
      college_id: college.id,
      title: `Application Deadline - ${college.name}`,
      description: 'Submit your complete application by this date.',
      deadline_date: parseDeadlineTemplate(templates.application_deadline, year),
      deadline_type: 'application',
      priority: 'high',
      is_optional: false
    });
  }
  
  return deadlines;
}

/**
 * Parse a deadline template string into a full date
 * Templates are in format "MM-DD" and we add the year
 * 
 * @param {String} template - Date in "MM-DD" format like "11-01"
 * @param {Number} year - The application year
 * @returns {String} Full date in YYYY-MM-DD format
 */
function parseDeadlineTemplate(template, year) {
  // Handle both "MM-DD" format and full "YYYY-MM-DD" format
  if (template.length === 5) {
    // It's in "MM-DD" format
    return `${year}-${template}`;
  }
  // It's already a full date, return as is
  return template;
}

module.exports = {
  generateDeadlinesForCollege
};