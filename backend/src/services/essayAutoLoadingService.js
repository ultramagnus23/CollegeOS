const dbManager = require('../config/database');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

/**
 * Service for automatically loading essay templates based on application platform
 * Implements TASK 4 from problem statement
 */
class EssayAutoLoadingService {
  /**
   * Auto-load essays when a college is added
   * @param {number} userId - User ID
   * @param {number} applicationId - Application ID
   * @param {number} collegeId - College ID
   * @returns {object} Result with loaded essays and status
   */
  static async loadEssaysForApplication(userId, applicationId, collegeId) {
    const db = dbManager.getDatabase();
    const currentYear = new Date().getFullYear();
    const result = {
      success: false,
      essaysAdded: [],
      message: '',
      usedHistoricalData: false
    };

    try {
      // Get college data including application platform
      const college = await this._getCollegeData(collegeId);
      
      if (!college) {
        result.message = 'College not found';
        return result;
      }

      const platform = this._detectApplicationPlatform(college);
      
      // Load platform-specific main essay (only once per user)
      await this._loadPlatformMainEssay(userId, platform, result);
      
      // Load college-specific supplements
      await this._loadCollegeSupplements(userId, applicationId, collegeId, platform, currentYear, result);
      
      result.success = true;
      result.message = `Essays loaded for ${college.name}`;
      
      logger.info(`Successfully loaded ${result.essaysAdded.length} essays for application ${applicationId}`);
      
      return result;

    } catch (error) {
      logger.error('Error loading essays:', error);
      result.message = 'Failed to load essays';
      throw error;
    }
  }

  /**
   * Get college data from database
   * @private
   */
  static async _getCollegeData(collegeId) {
    const pool = dbManager.getDatabase();
    return (await pool.query(`
      SELECT cc.id, cc.name, cc.country, cd.application_platforms
      FROM public.clean_colleges cc
      LEFT JOIN public.college_deadlines cd ON cc.id = cd.college_id
      WHERE cc.id = $1
    `, [collegeId])).rows[0];
  }

  /**
   * Detect which application platform the college uses
   * @private
   */
  static _detectApplicationPlatform(college) {
    const platforms = college.application_platforms || '';
    
    if (platforms.includes('Common Application') || platforms.includes('Common App')) {
      return 'common_app';
    } else if (platforms.includes('Coalition Application') || platforms.includes('Coalition')) {
      return 'coalition';
    } else if (platforms.includes('UC Application') || platforms.includes('UC')) {
      return 'uc';
    } else if (college.country === 'United Kingdom') {
      return 'ucas';
    } else if (college.country === 'Canada') {
      return 'ouac';
    } else {
      return 'proprietary';
    }
  }

  /**
   * Load platform-specific main essay (Common App, Coalition, UC PIQs)
   * Only loads once per user
   * @private
   */
  static async _loadPlatformMainEssay(userId, platform, result) {
    const pool = dbManager.getDatabase();
    const currentYear = new Date().getFullYear();

    if (platform === 'common_app') {
      // Check if Common App main essay already exists
      const exists = (await pool.query(`
        SELECT id FROM essays WHERE user_id = $1 AND essay_type = 'common_app_main'
      `, [userId])).rows[0];

      if (!exists) {
        const commonAppPrompts = this._getCommonAppPrompts(currentYear);
        await pool.query(`
          INSERT INTO essays (
            application_id, user_id, essay_type, prompt, word_limit,
            is_required, shared_across_colleges, status, platform
          ) VALUES (NULL, $1, $2, $3, $4, true, true, 'not_started', $5)
        `, [userId, 'common_app_main', commonAppPrompts, 650, 'Common Application']);

        result.essaysAdded.push({
          type: 'common_app_main',
          prompt: 'Common App Personal Statement',
          wordLimit: 650
        });
      }
    } else if (platform === 'coalition') {
      const exists = (await pool.query(`
        SELECT id FROM essays WHERE user_id = $1 AND essay_type = 'coalition_main'
      `, [userId])).rows[0];

      if (!exists) {
        const coalitionPrompts = this._getCoalitionPrompts(currentYear);
        await pool.query(`
          INSERT INTO essays (
            application_id, user_id, essay_type, prompt, word_limit,
            is_required, shared_across_colleges, status, platform
          ) VALUES (NULL, $1, $2, $3, $4, true, true, 'not_started', $5)
        `, [userId, 'coalition_main', coalitionPrompts, 650, 'Coalition Application']);

        result.essaysAdded.push({
          type: 'coalition_main',
          prompt: 'Coalition Personal Statement',
          wordLimit: 650
        });
      }
    } else if (platform === 'uc') {
      // UC PIQs - 8 prompts, choose 4
      const exists = (await pool.query(`
        SELECT id FROM essays WHERE user_id = $1 AND essay_type LIKE 'uc_piq_%'
      `, [userId])).rows[0];

      if (!exists) {
        const ucPrompts = this._getUCPrompts(currentYear);

        for (const [index, prompt] of ucPrompts.entries()) {
          await pool.query(`
            INSERT INTO essays (
              application_id, user_id, essay_type, prompt, word_limit,
              is_required, shared_across_colleges, status, platform, essay_number
            ) VALUES (NULL, $1, $2, $3, $4, false, true, 'not_started', $5, $6)
          `, [userId, `uc_piq_${index + 1}`, prompt, 350, 'UC Application', index + 1]);

          result.essaysAdded.push({
            type: `uc_piq_${index + 1}`,
            prompt: `UC PIQ ${index + 1}`,
            wordLimit: 350
          });
        }
      }
    }
  }

  /**
   * Load college-specific supplement essays
   * @private
   */
  static async _loadCollegeSupplements(userId, applicationId, collegeId, platform, currentYear, result) {
    const pool = dbManager.getDatabase();
    
    // Query essay_prompts table for college supplements
    let supplements = (await pool.query(`
      SELECT * FROM essay_prompts 
      WHERE college_id = $1 
      ORDER BY prompt_order ASC
    `, [collegeId])).rows;

    let usedHistorical = false;

    // If no current year data, try to get historical prompts
    if (supplements.length === 0) {
      logger.info(`No current essay prompts for college ${sanitizeForLog(collegeId)}, checking historical data`);
      
      // For now, we'll note this but not load historical data
      // In production, you would query historical prompts here
      result.usedHistoricalData = true;
      usedHistorical = true;
    }

    // Insert supplements
    for (const [index, supplement] of supplements.entries()) {
      await pool.query(`
        INSERT INTO essays (
          application_id, user_id, college_id, essay_type, prompt, 
          word_limit, is_required, status, essay_number, historical_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'not_started', $8, $9)
      `, [
        applicationId,
        userId,
        collegeId,
        'supplemental',
        supplement.prompt_text,
        supplement.word_limit,
        supplement.is_required != null ? !!supplement.is_required : true,
        supplement.prompt_order || index + 1,
        usedHistorical
      ]);

      result.essaysAdded.push({
        type: 'supplemental',
        prompt: supplement.prompt_text.substring(0, 50) + '...',
        wordLimit: supplement.word_limit,
        historical: usedHistorical
      });
    }
  }

  /**
   * Get Common App prompts for a given year
   * @private
   */
  static _getCommonAppPrompts(year) {
    // These would be updated annually
    return `Common Application Essay Prompts (Choose one):

1. Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.

2. The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?

3. Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?

4. Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?

5. Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.

6. Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?

7. Share an essay on any topic of your choice. It can be one you've already written, one that responds to a different prompt, or one of your own design.

Word limit: 650 words`;
  }

  /**
   * Get Coalition App prompts
   * @private
   */
  static _getCoalitionPrompts(year) {
    return `Coalition Application Essay Prompts (Choose one):

1. Tell a story from your life, describing an experience that either demonstrates your character or helped to shape it.

2. Describe a time when you made a meaningful contribution to others in which the greater good was your focus. Discuss the challenges and rewards of making your contribution.

3. Has there been a time when you've had a long-cherished or accepted belief challenged? How did you respond? How did the challenge affect your beliefs?

4. What is the hardest part of being a student now? What's the best part? What advice would you give a younger sibling or friend (assuming they would listen to you)?

5. Submit an essay on a topic of your choice.

Word limit: 500-650 words`;
  }

  /**
   * Get UC Personal Insight Questions
   * @private
   */
  static _getUCPrompts(year) {
    return [
      'Describe an example of your leadership experience in which you have positively influenced others, helped resolve disputes or contributed to group efforts over time.',
      'Every person has a creative side, and it can be expressed in many ways: problem solving, original and innovative thinking, and artistically, to name a few. Describe how you express your creative side.',
      'What would you say is your greatest talent or skill? How have you developed and demonstrated that talent over time?',
      'Describe how you have taken advantage of a significant educational opportunity or worked to overcome an educational barrier you have faced.',
      'Describe the most significant challenge you have faced and the steps you have taken to overcome this challenge. How has this challenge affected your academic achievement?',
      'Think about an academic subject that inspires you. Describe how you have furthered this interest inside and/or outside of the classroom.',
      'What have you done to make your school or your community a better place?',
      'Beyond what has already been shared in your application, what do you believe makes you a strong candidate for admissions to the University of California?'
    ];
  }
}

module.exports = EssayAutoLoadingService;
