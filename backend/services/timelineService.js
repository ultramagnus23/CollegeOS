// backend/services/timelineService.js
// Generates personalized monthly action items based on user's applications and timeline

const db = require('../src/config/database');

/**
 * Generate timeline actions for a user based on their applications
 * Called when user adds colleges or at the start of each month
 */
async function generateTimelineActions(userId) {
  try {
    // Get user's applications and target countries
    const applications = await getUserApplications(userId);
    const userProfile = await getUserProfile(userId);
    
    if (applications.length === 0) {
      return { message: 'No applications yet. Add colleges to generate timeline.' };
    }
    
    // Determine target countries from applications
    const countries = [...new Set(applications.map(app => app.country))];
    
    // Get current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    // Generate actions for next 6 months
    const actions = [];
    
    for (let i = 0; i < 6; i++) {
      let month = currentMonth + i;
      let year = currentYear;
      
      if (month > 12) {
        month = month - 12;
        year++;
      }
      
      // Generate country-specific actions for this month
      countries.forEach(country => {
        const monthActions = getActionsForCountryMonth(country, month, year, applications, userProfile);
        actions.push(...monthActions);
      });
      
      // Generate general actions
      const generalActions = getGeneralActionsForMonth(month, year, applications);
      actions.push(...generalActions);
    }
    
    // Delete old auto-generated actions
    await deleteOldTimelineActions(userId);
    
    // Insert new actions
    await insertTimelineActions(userId, actions);
    
    return { success: true, actions_generated: actions.length };
  } catch (error) {
    console.error('Error generating timeline:', error);
    throw error;
  }
}

/**
 * Get actions specific to a country and month
 */
function getActionsForCountryMonth(country, month, year, applications, profile) {
  const actions = [];
  
  if (country === 'US') {
    // US-specific timeline
    if (month === 8 || month === 9) {
      actions.push({
        title: 'Start Common App Account',
        description: 'Create your Common Application account and familiarize yourself with the platform.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'high',
        related_country: 'US'
      });
      
      actions.push({
        title: 'Request Letters of Recommendation',
        description: 'Ask teachers and counselors for recommendation letters. Give them at least 6 weeks notice.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'high',
        related_country: 'US'
      });
      
      // Check if SAT/ACT needed
      if (!profile.exams_taken?.SAT && !profile.exams_taken?.ACT) {
        actions.push({
          title: 'Complete SAT/ACT Testing',
          description: 'Take your standardized tests before Early Action/Decision deadlines.',
          category: 'exam_prep',
          target_month: month,
          target_year: year,
          priority: 'critical',
          related_country: 'US'
        });
      }
    }
    
    if (month === 10) {
      actions.push({
        title: 'Finalize College List',
        description: 'Confirm your final list of colleges including reach, target, and safety schools.',
        category: 'college_research',
        target_month: month,
        target_year: year,
        priority: 'high',
        related_country: 'US'
      });
      
      actions.push({
        title: 'Start Essay Writing',
        description: 'Begin drafting your Common App essay and supplement essays for Early Action schools.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'US'
      });
    }
    
    if (month === 11) {
      // Get Early Action/Decision applications
      const earlyApps = applications.filter(app => 
        app.country === 'US' && 
        app.deadline_templates?.early_action
      );
      
      if (earlyApps.length > 0) {
        actions.push({
          title: 'Submit Early Action/Decision Applications',
          description: `Complete and submit applications for ${earlyApps.length} early deadline colleges.`,
          category: 'application',
          target_month: month,
          target_year: year,
          priority: 'critical',
          related_country: 'US'
        });
      }
    }
    
    if (month === 12) {
      actions.push({
        title: 'Finalize Regular Decision Applications',
        description: 'Polish essays, review all application materials, and prepare for January deadlines.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'US'
      });
    }
    
    if (month === 1) {
      actions.push({
        title: 'Submit Regular Decision Applications',
        description: 'Submit all remaining college applications before deadlines.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'US'
      });
    }
    
    if (month === 2) {
      actions.push({
        title: 'Complete Financial Aid Applications',
        description: 'Submit FAFSA and CSS Profile if applying for financial aid.',
        category: 'financial_aid',
        target_month: month,
        target_year: year,
        priority: 'high',
        related_country: 'US'
      });
    }
  }
  
  if (country === 'UK') {
    if (month === 9) {
      actions.push({
        title: 'Register for UCAS',
        description: 'Create your UCAS account and start your application.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'high',
        related_country: 'UK'
      });
      
      actions.push({
        title: 'Draft Personal Statement',
        description: 'Write your UCAS personal statement (4000 characters). Get feedback from teachers.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'UK'
      });
    }
    
    if (month === 10) {
      // Check for Oxbridge applications
      const oxbridge = applications.filter(app => 
        (app.name?.includes('Oxford') || app.name?.includes('Cambridge'))
      );
      
      if (oxbridge.length > 0) {
        actions.push({
          title: 'Submit Oxbridge Application',
          description: 'Deadline is October 15 for Oxford and Cambridge applications.',
          category: 'application',
          target_month: month,
          target_year: year,
          priority: 'critical',
          related_country: 'UK'
        });
      }
      
      // Check if IELTS needed
      if (!profile.exams_taken?.IELTS && profile.medium_of_instruction !== 'English') {
        actions.push({
          title: 'Take IELTS Exam',
          description: 'Complete your IELTS test for UK university requirements.',
          category: 'exam_prep',
          target_month: month,
          target_year: year,
          priority: 'high',
          related_country: 'UK'
        });
      }
    }
    
    if (month === 1) {
      actions.push({
        title: 'Submit UCAS Application',
        description: 'Final deadline for most UK university applications through UCAS.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'UK'
      });
    }
  }
  
  if (country === 'Canada') {
    if (month === 10 || month === 11) {
      actions.push({
        title: 'Start Canadian University Applications',
        description: 'Begin applications through university portals (Ontario: OUAC, others: direct applications).',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'high',
        related_country: 'Canada'
      });
    }
    
    if (month === 1 || month === 2) {
      actions.push({
        title: 'Submit Canadian Applications',
        description: 'Most Canadian universities have deadlines in January-February.',
        category: 'application',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'Canada'
      });
    }
  }
  
  if (country === 'India') {
    if (month === 11 || month === 12) {
      actions.push({
        title: 'Prepare for Entrance Exams',
        description: 'Focus on JEE/NEET/CUET preparation with mock tests and revision.',
        category: 'exam_prep',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'India'
      });
    }
    
    if (month === 1 || month === 2) {
      actions.push({
        title: 'Register for Entrance Exams',
        description: 'Complete registration for JEE, CUET, or other entrance exams.',
        category: 'exam_prep',
        target_month: month,
        target_year: year,
        priority: 'critical',
        related_country: 'India'
      });
    }
  }
  
  return actions;
}

/**
 * Get general actions applicable to all applications
 */
function getGeneralActionsForMonth(month, year, applications) {
  const actions = [];
  
  // Check for upcoming deadlines
  applications.forEach(app => {
    // This would check actual deadlines from the deadlines table
    // For now, we'll add general reminders
  });
  
  // Add document preparation reminders
  if (month % 2 === 0) { // Every other month
    actions.push({
      title: 'Organize Application Documents',
      description: 'Ensure transcripts, test scores, and other documents are ready and accessible.',
      category: 'documents',
      target_month: month,
      target_year: year,
      priority: 'medium',
      related_country: null
    });
  }
  
  return actions;
}

// Helper functions
async function getUserApplications(userId) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT a.*, c.name, c.country, c.deadline_templates
      FROM applications a
      JOIN colleges c ON a.college_id = c.id
      WHERE a.user_id = ?
    `, [userId], (err, rows) => {
      if (err) reject(err);
      else resolve(rows.map(row => ({
        ...row,
        deadline_templates: JSON.parse(row.deadline_templates || '{}')
      })));
    });
  });
}

async function getUserProfile(userId) {
  return new Promise((resolve, reject) => {
    db.get(`
      SELECT academic_board, subjects, exams_taken, medium_of_instruction
      FROM users WHERE id = ?
    `, [userId], (err, row) => {
      if (err) reject(err);
      else resolve({
        ...row,
        subjects: JSON.parse(row.subjects || '[]'),
        exams_taken: JSON.parse(row.exams_taken || '{}')
      });
    });
  });
}

async function deleteOldTimelineActions(userId) {
  return new Promise((resolve, reject) => {
    db.run(`
      DELETE FROM timeline_actions
      WHERE user_id = ? AND is_system_generated = 1
    `, [userId], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function insertTimelineActions(userId, actions) {
  const promises = actions.map(action => {
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO timeline_actions (
          user_id, title, description, category,
          target_month, target_year, priority,
          related_country, is_system_generated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        userId, action.title, action.description, action.category,
        action.target_month, action.target_year, action.priority,
        action.related_country
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
  
  return Promise.all(promises);
}

/**
 * Get timeline actions for a specific month
 */
async function getMonthlyActions(userId, month, year) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM timeline_actions
      WHERE user_id = ? AND target_month = ? AND target_year = ?
      ORDER BY 
        CASE priority
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        completed ASC
    `, [userId, month, year], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  generateTimelineActions,
  getMonthlyActions
};