/**
 * RequirementService.js
 * Handles task decomposition for college applications
 * Breaks down applications into atomic tasks with dependency tracking
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * @typedef {Object} Task
 * @property {number} id
 * @property {string} type - 'essay', 'test', 'transcript', 'recommendation', 'portfolio', 'form', 'interview', 'other'
 * @property {string} title
 * @property {string} status - 'not_started', 'in_progress', 'blocked', 'complete', 'skipped'
 * @property {number[]} dependencies - Task IDs that must complete first
 * @property {Date} deadline
 * @property {number} estimatedHours
 * @property {string} [blockingReason]
 */

class RequirementService {
  /**
   * Standard task templates for different application systems
   */
  static TASK_TEMPLATES = {
    CommonApp: [
      { type: 'form', title: 'Complete Common App Profile', estimatedHours: 2, priority: 1 },
      { type: 'essay', title: 'Write Personal Statement (650 words)', estimatedHours: 15, priority: 2 },
      { type: 'transcript', title: 'Request Official Transcript', estimatedHours: 0.5, priority: 1 },
      { type: 'recommendation', title: 'Request Counselor Recommendation', estimatedHours: 1, priority: 2 },
      { type: 'recommendation', title: 'Request Teacher Recommendation 1', estimatedHours: 1, priority: 2 },
      { type: 'recommendation', title: 'Request Teacher Recommendation 2', estimatedHours: 1, priority: 2 },
      { type: 'test', title: 'Send SAT/ACT Scores', estimatedHours: 0.5, priority: 3 },
      { type: 'form', title: 'Complete Activities Section', estimatedHours: 3, priority: 2 },
      { type: 'form', title: 'Complete Honors Section', estimatedHours: 1, priority: 2 },
      { type: 'form', title: 'Pay Application Fee', estimatedHours: 0.5, priority: 3 }
    ],
    UCAS: [
      { type: 'form', title: 'Create UCAS Account', estimatedHours: 0.5, priority: 1 },
      { type: 'essay', title: 'Write Personal Statement (4000 characters)', estimatedHours: 12, priority: 1 },
      { type: 'form', title: 'Complete Education Section', estimatedHours: 1, priority: 2 },
      { type: 'form', title: 'Add Predicted Grades', estimatedHours: 0.5, priority: 2 },
      { type: 'recommendation', title: 'Request Teacher Reference', estimatedHours: 1, priority: 2 },
      { type: 'form', title: 'Pay UCAS Fee', estimatedHours: 0.5, priority: 3 }
    ],
    UniAssist: [
      { type: 'form', title: 'Create Uni-Assist Account', estimatedHours: 0.5, priority: 1 },
      { type: 'transcript', title: 'Upload Secondary School Certificate', estimatedHours: 1, priority: 1 },
      { type: 'transcript', title: 'Upload Grade Transcripts (Certified)', estimatedHours: 2, priority: 1 },
      { type: 'test', title: 'Submit Language Proficiency Certificate', estimatedHours: 0.5, priority: 2 },
      { type: 'essay', title: 'Write Motivation Letter', estimatedHours: 5, priority: 2 },
      { type: 'form', title: 'Upload CV/Resume', estimatedHours: 2, priority: 2 },
      { type: 'form', title: 'Pay Uni-Assist Fee', estimatedHours: 0.5, priority: 3 }
    ],
    JEE: [
      { type: 'test', title: 'Prepare for JEE Main', estimatedHours: 500, priority: 1 },
      { type: 'test', title: 'Take JEE Main Exam', estimatedHours: 3, priority: 1 },
      { type: 'form', title: 'Register for JEE Advanced', estimatedHours: 1, priority: 1 },
      { type: 'test', title: 'Take JEE Advanced Exam', estimatedHours: 3, priority: 1 },
      { type: 'form', title: 'Complete JoSAA Registration', estimatedHours: 2, priority: 2 },
      { type: 'form', title: 'Document Verification', estimatedHours: 3, priority: 2 }
    ],
    Direct: [
      { type: 'form', title: 'Complete Online Application', estimatedHours: 2, priority: 1 },
      { type: 'transcript', title: 'Request Official Transcript', estimatedHours: 0.5, priority: 1 },
      { type: 'essay', title: 'Write Application Essays', estimatedHours: 10, priority: 2 },
      { type: 'recommendation', title: 'Request Recommendations', estimatedHours: 1, priority: 2 },
      { type: 'test', title: 'Submit Test Scores', estimatedHours: 0.5, priority: 3 },
      { type: 'form', title: 'Pay Application Fee', estimatedHours: 0.5, priority: 3 }
    ]
  };

  /**
   * Decompose a college application into atomic tasks
   * @param {number} collegeId - College ID
   * @returns {Promise<Task[]>}
   */
  static async decomposeApplication(collegeId) {
    const pool = dbManager.getDatabase();
    
    // Get college info to determine application system
    const college = (await pool.query('SELECT * FROM colleges WHERE id = $1', [collegeId])).rows[0];
    if (!college) {
      throw new Error('College not found');
    }
    
    // Try to get application system
    let system = 'Direct'; // Default
    try {
      const appSystem = (await pool.query(`
        SELECT system_type FROM application_systems WHERE college_id = $1
      `, [collegeId])).rows[0];
      if (appSystem) {
        system = appSystem.system_type;
      } else {
        // Infer from country
        system = this.inferApplicationSystem(college.country);
      }
    } catch (error) {
      system = this.inferApplicationSystem(college.country);
    }
    
    // Get template tasks
    const templateTasks = this.TASK_TEMPLATES[system] || this.TASK_TEMPLATES.Direct;
    
    // Add college-specific supplemental essays if available
    const tasks = [...templateTasks];
    
    try {
      const essays = (await pool.query(`
        SELECT * FROM essay_prompts WHERE college_id = $1 ORDER BY prompt_order
      `, [collegeId])).rows;
      
      essays.forEach((essay, index) => {
        tasks.push({
          type: 'essay',
          title: `Supplemental Essay ${index + 1}: ${essay.prompt_text.substring(0, 50)}...`,
          estimatedHours: Math.max(3, Math.round((essay.word_limit || 250) / 50)),
          priority: 2,
          wordLimit: essay.word_limit,
          isRequired: essay.is_required === true
        });
      });
    } catch (error) {
      logger.debug('No essay prompts table or data:', error.message);
    }
    
    // Add interview task if required
    if (college.has_interview_requirement) {
      tasks.push({
        type: 'interview',
        title: 'Prepare for Interview',
        estimatedHours: 5,
        priority: 2
      });
    }
    
    // Add portfolio task if required
    if (college.has_portfolio_requirement) {
      tasks.push({
        type: 'portfolio',
        title: 'Prepare Portfolio',
        estimatedHours: 20,
        priority: 1
      });
    }
    
    logger.debug(`Decomposed application for college ${collegeId} (${system}): ${tasks.length} tasks`);
    
    return tasks.map((task, index) => ({
      ...task,
      id: index + 1,
      collegeId,
      status: 'not_started',
      dependencies: []
    }));
  }

  /**
   * Infer application system from country
   * @param {string} country - Country name
   * @returns {string} Application system type
   */
  static inferApplicationSystem(country) {
    const countryLower = (country || '').toLowerCase();
    
    if (countryLower.includes('united states') || countryLower === 'usa' || countryLower === 'us') {
      return 'CommonApp';
    }
    if (countryLower.includes('united kingdom') || countryLower === 'uk') {
      return 'UCAS';
    }
    if (countryLower === 'germany') {
      return 'UniAssist';
    }
    if (countryLower === 'india') {
      return 'JEE'; // Or NEET for medical
    }
    
    return 'Direct';
  }

  /**
   * Create tasks for a user's college application
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @param {number} [applicationId] - Optional application ID
   * @returns {Promise<Task[]>}
   */
  static async createApplicationTasks(userId, collegeId, applicationId = null) {
    const pool = dbManager.getDatabase();
    
    // Get decomposed tasks
    const taskTemplates = await this.decomposeApplication(collegeId);
    
    const createdTasks = [];
    
    for (const template of taskTemplates) {
      try {
        const result = await pool.query(`
          INSERT INTO tasks (
            user_id, college_id, application_id, task_type, title, description,
            status, deadline, estimated_hours, priority
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [
          userId,
          collegeId,
          applicationId,
          template.type,
          template.title,
          template.description || null,
          'not_started',
          template.deadline || null,
          template.estimatedHours || 1,
          template.priority || 3
        ]);
        
        createdTasks.push({
          id: result.rows[0].id,
          ...template,
          status: 'not_started'
        });
      } catch (error) {
        logger.error(`Failed to create task "${template.title}":`, error);
      }
    }
    
    // Create default dependencies
    await this.createDefaultDependencies(createdTasks);
    
    logger.info(`Created ${createdTasks.length} tasks for user ${userId}, college ${collegeId}`);
    
    return createdTasks;
  }

  /**
   * Create default task dependencies based on task types
   * @param {Task[]} tasks - Array of tasks
   */
  static async createDefaultDependencies(tasks) {
    const pool = dbManager.getDatabase();
    
    // Find form/profile tasks (usually need to complete first)
    const formTasks = tasks.filter(t => t.type === 'form' && t.title.toLowerCase().includes('profile'));
    const essayTasks = tasks.filter(t => t.type === 'essay');
    const submitTasks = tasks.filter(t => t.title.toLowerCase().includes('pay') || t.title.toLowerCase().includes('submit'));
    
    // Essays should be done after profile
    for (const formTask of formTasks) {
      for (const essayTask of essayTasks) {
        try {
          await pool.query(`
            INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
            VALUES ($1, $2, 'should_complete_first')
            ON CONFLICT DO NOTHING
          `, [essayTask.id, formTask.id]);
        } catch (error) {
          logger.debug('Could not create dependency:', error.message);
        }
      }
    }
    
    // Submit/pay should be last
    const nonSubmitTasks = tasks.filter(t => !submitTasks.includes(t));
    for (const submitTask of submitTasks) {
      for (const otherTask of nonSubmitTasks) {
        try {
          await pool.query(`
            INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
            VALUES ($1, $2, 'blocks')
            ON CONFLICT DO NOTHING
          `, [submitTask.id, otherTask.id]);
        } catch (error) {
          logger.debug('Could not create dependency:', error.message);
        }
      }
    }
  }

  /**
   * Build dependency graph for a user's tasks
   * @param {number} userId - User ID
   * @param {number} [collegeId] - Optional college ID to filter
   * @returns {Promise<Object>} Dependency graph
   */
  static async buildDependencyGraph(userId, collegeId = null) {
    const pool = dbManager.getDatabase();
    
    let query = 'SELECT * FROM tasks WHERE user_id = $1';
    const params = [userId];
    
    if (collegeId) {
      query += ' AND college_id = $2';
      params.push(collegeId);
    }
    
    const tasks = (await pool.query(query, params)).rows;
    
    // Build adjacency list
    const graph = {};
    const taskMap = {};
    
    for (const task of tasks) {
      taskMap[task.id] = task;
      graph[task.id] = {
        task,
        dependsOn: [],
        blockedBy: [],
        blocks: []
      };
    }
    
    // Get dependencies
    try {
      const deps = tasks.length > 0
        ? (await pool.query(`
            SELECT * FROM task_dependencies 
            WHERE task_id IN (${tasks.map((_, i) => `$${i + 1}`).join(',')})
          `, tasks.map(t => t.id))).rows
        : [];
      
      for (const dep of deps) {
        if (graph[dep.task_id] && graph[dep.depends_on_task_id]) {
          graph[dep.task_id].dependsOn.push(dep.depends_on_task_id);
          graph[dep.depends_on_task_id].blocks.push(dep.task_id);
          
          // Check if blocked
          if (dep.dependency_type === 'blocks' && taskMap[dep.depends_on_task_id]?.status !== 'complete') {
            graph[dep.task_id].blockedBy.push(dep.depends_on_task_id);
          }
        }
      }
    } catch (error) {
      logger.debug('Could not get dependencies:', error.message);
    }
    
    return {
      tasks: taskMap,
      graph,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'complete').length,
      blockedTasks: Object.values(graph).filter(n => n.blockedBy.length > 0).length
    };
  }

  /**
   * Detect blocked tasks for a user and college
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<Task[]>}
   */
  static async detectBlockedTasks(userId, collegeId) {
    const pool = dbManager.getDatabase();
    
    const blockedTasks = (await pool.query(`
      SELECT t.*, 
             STRING_AGG(dt.title, ', ') as blocking_task_titles
      FROM tasks t
      JOIN task_dependencies td ON td.task_id = t.id AND td.dependency_type = 'blocks'
      JOIN tasks dt ON dt.id = td.depends_on_task_id AND dt.status != 'complete'
      WHERE t.user_id = $1 AND t.college_id = $2 AND t.status != 'complete'
      GROUP BY t.id
    `, [userId, collegeId])).rows;
    
    // Update blocked status
    for (const task of blockedTasks) {
      if (task.status !== 'blocked') {
        await pool.query(`
          UPDATE tasks SET status = 'blocked', blocking_reason = $1, updated_at = NOW()
          WHERE id = $2
        `, [`Blocked by: ${task.blocking_task_titles}`, task.id]);
      }
    }
    
    return blockedTasks;
  }

  /**
   * Get task completion percentage
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<number>} Completion percentage 0-100
   */
  static async getTaskCompletion(userId, collegeId) {
    const pool = dbManager.getDatabase();
    
    const stats = (await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) as completed
      FROM tasks
      WHERE user_id = $1 AND college_id = $2
    `, [userId, collegeId])).rows[0];
    
    if (!stats || parseInt(stats.total) === 0) return 0;
    
    return Math.round((parseInt(stats.completed) / parseInt(stats.total)) * 100);
  }

  /**
   * Find critical path - tasks that must be done in sequence
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<Task[]>}
   */
  static async getCriticalPath(userId, collegeId) {
    const pool = dbManager.getDatabase();
    
    // Get all incomplete tasks with deadlines, ordered by urgency
    const tasks = (await pool.query(`
      SELECT t.*, 
             EXTRACT(EPOCH FROM (t.deadline::timestamptz - NOW())) / 3600 as hours_until_deadline,
             t.estimated_hours
      FROM tasks t
      WHERE t.user_id = $1 AND t.college_id = $2 
        AND t.status NOT IN ('complete', 'skipped')
        AND t.deadline IS NOT NULL
      ORDER BY t.deadline ASC, t.priority ASC
    `, [userId, collegeId])).rows;
    
    // Calculate critical path - tasks where hours_until_deadline < estimated_hours remaining
    const criticalTasks = [];
    let cumulativeHours = 0;
    
    for (const task of tasks) {
      cumulativeHours += task.estimated_hours || 0;
      const bufferHours = task.hours_until_deadline - cumulativeHours;
      
      if (bufferHours < 20) {
        criticalTasks.push({
          ...task,
          bufferHours,
          isCritical: bufferHours < 0,
          urgencyLevel: bufferHours < 0 ? 'impossible' : bufferHours < 10 ? 'critical' : 'tight'
        });
      }
    }
    
    return criticalTasks;
  }

  /**
   * Get all tasks for a user's college application
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Promise<Task[]>}
   */
  static async getTasks(userId, collegeId) {
    const pool = dbManager.getDatabase();
    
    const tasks = (await pool.query(`
      SELECT * FROM tasks
      WHERE user_id = $1 AND college_id = $2
      ORDER BY priority ASC, deadline ASC
    `, [userId, collegeId])).rows;
    
    return tasks;
  }

  /**
   * Update task status
   * @param {number} taskId - Task ID
   * @param {string} newStatus - New status
   * @param {string} [reason] - Optional reason for change
   * @returns {Promise<Object>}
   */
  static async updateTaskStatus(taskId, newStatus, reason = null) {
    const pool = dbManager.getDatabase();
    
    const task = (await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId])).rows[0];
    if (!task) {
      throw new Error('Task not found');
    }
    
    const oldStatus = task.status;
    
    // Update task
    await pool.query(`
      UPDATE tasks SET 
        status = $1,
        updated_at = NOW(),
        completed_at = CASE WHEN $2 = 'complete' THEN NOW() ELSE completed_at END
      WHERE id = $3
    `, [newStatus, newStatus, taskId]);
    
    // Log status change
    try {
      await pool.query(`
        INSERT INTO task_status_history (task_id, old_status, new_status, change_reason)
        VALUES ($1, $2, $3, $4)
      `, [taskId, oldStatus, newStatus, reason]);
    } catch (error) {
      logger.debug('Could not log status change:', error.message);
    }
    
    // If task was blocking others, check if they can now proceed
    if (newStatus === 'complete') {
      await this.checkUnblockedTasks(taskId);
    }
    
    return (await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId])).rows[0];
  }

  /**
   * Check if completing a task unblocks other tasks
   * @param {number} completedTaskId - The task that was just completed
   */
  static async checkUnblockedTasks(completedTaskId) {
    const pool = dbManager.getDatabase();
    
    try {
      // Find tasks that were blocked by this task
      const blockedTasks = (await pool.query(`
        SELECT t.* FROM tasks t
        JOIN task_dependencies td ON td.task_id = t.id
        WHERE td.depends_on_task_id = $1 AND t.status = 'blocked'
      `, [completedTaskId])).rows;
      
      for (const task of blockedTasks) {
        // Check if all blockers are now complete
        const remainingBlockers = (await pool.query(`
          SELECT COUNT(*) as count FROM task_dependencies td
          JOIN tasks bt ON bt.id = td.depends_on_task_id
          WHERE td.task_id = $1 AND td.dependency_type = 'blocks' AND bt.status != 'complete'
        `, [task.id])).rows[0];
        
        if (parseInt(remainingBlockers.count) === 0) {
          await pool.query(`
            UPDATE tasks SET status = 'not_started', blocking_reason = NULL, updated_at = NOW()
            WHERE id = $1
          `, [task.id]);
          
          logger.debug(`Task ${task.id} unblocked after completion of task ${completedTaskId}`);
        }
      }
    } catch (error) {
      logger.debug('Could not check unblocked tasks:', error.message);
    }
  }

  /**
   * Get reusable content across colleges
   * @param {number} userId - User ID
   * @returns {Promise<Object>}
   */
  static async getReusableContent(userId) {
    const pool = dbManager.getDatabase();
    
    // Find essays that can be reused
    const reusableEssays = (await pool.query(`
      SELECT t.*, c.name as college_name
      FROM tasks t
      JOIN colleges c ON c.id = t.college_id
      WHERE t.user_id = $1 AND t.is_reusable = true AND t.status = 'complete' AND t.task_type = 'essay'
    `, [userId])).rows;
    
    // Group by similarity
    const essayGroups = {};
    for (const essay of reusableEssays) {
      const key = essay.title.toLowerCase().includes('personal') ? 'personal_statement' :
                  essay.title.toLowerCase().includes('why') ? 'why_college' :
                  essay.title.toLowerCase().includes('major') ? 'why_major' : 'other';
      
      if (!essayGroups[key]) {
        essayGroups[key] = [];
      }
      essayGroups[key].push(essay);
    }
    
    return {
      essays: essayGroups,
      totalReusable: reusableEssays.length
    };
  }
}

module.exports = RequirementService;
