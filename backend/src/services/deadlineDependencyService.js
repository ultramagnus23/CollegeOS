/**
 * DeadlineDependencyService.js
 * Manages deadline dependencies and interconnected task relationships
 * Ensures proper sequencing of application tasks
 */

const dbManager = require('../config/database');
const logger = require('../utils/logger');

/**
 * Common deadline dependency templates
 */
const DEPENDENCY_TEMPLATES = {
  TRANSCRIPT: {
    task: 'Request Official Transcript',
    dependsOn: [],
    blocks: ['Submit Application', 'Complete Application']
  },
  RECOMMENDATION: {
    task: 'Request Recommendation',
    dependsOn: [],
    blocks: ['Submit Application', 'Complete Application'],
    leadTime: 21 // days before deadline to request
  },
  ESSAY: {
    task: 'Write Essay',
    dependsOn: ['Complete Profile', 'Research College'],
    blocks: ['Submit Application']
  },
  TEST_SCORES: {
    task: 'Send Test Scores',
    dependsOn: ['Take Test'],
    blocks: ['Submit Application'],
    leadTime: 14
  },
  FINANCIAL_AID: {
    task: 'Submit Financial Aid Application',
    dependsOn: ['Submit FAFSA', 'Submit CSS Profile'],
    blocks: []
  }
};

class DeadlineDependencyService {
  /**
   * Create a dependency between two tasks
   * @param {number} taskId - The dependent task ID
   * @param {number} dependsOnTaskId - The task that must be completed first
   * @param {string} dependencyType - Type of dependency (blocks, soft_depends, should_complete_first)
   * @returns {Object} Created dependency
   */
  static async createDependency(taskId, dependsOnTaskId, dependencyType = 'blocks') {
    const db = dbManager.getDatabase();
    
    try {
      // Check for circular dependencies
      const wouldBeCyclic = await this.checkCircularDependency(taskId, dependsOnTaskId);
      if (wouldBeCyclic) {
        throw new Error('Creating this dependency would cause a circular dependency');
      }
      
      const result = db.prepare(`
        INSERT OR IGNORE INTO task_dependencies (task_id, depends_on_task_id, dependency_type)
        VALUES (?, ?, ?)
      `).run(taskId, dependsOnTaskId, dependencyType);
      
      logger.debug(`Created dependency: Task ${taskId} depends on Task ${dependsOnTaskId}`);
      
      return {
        id: result.lastInsertRowid,
        taskId,
        dependsOnTaskId,
        dependencyType
      };
    } catch (error) {
      logger.error('Failed to create dependency:', error);
      throw error;
    }
  }

  /**
   * Check if adding a dependency would create a circular dependency
   * @param {number} taskId - The task that would depend on another
   * @param {number} dependsOnTaskId - The task to depend on
   * @returns {boolean} True if it would create a cycle
   */
  static async checkCircularDependency(taskId, dependsOnTaskId) {
    if (taskId === dependsOnTaskId) return true;
    
    const db = dbManager.getDatabase();
    
    // Get all tasks that depend on taskId (directly or indirectly)
    const visited = new Set();
    const stack = [taskId];
    
    while (stack.length > 0) {
      const current = stack.pop();
      if (visited.has(current)) continue;
      visited.add(current);
      
      const dependents = db.prepare(`
        SELECT task_id FROM task_dependencies WHERE depends_on_task_id = ?
      `).all(current);
      
      for (const dep of dependents) {
        if (dep.task_id === dependsOnTaskId) return true;
        stack.push(dep.task_id);
      }
    }
    
    return false;
  }

  /**
   * Get all dependencies for a task
   * @param {number} taskId - Task ID
   * @returns {Object} Dependencies (what this task depends on, what depends on this task)
   */
  static async getTaskDependencies(taskId) {
    const db = dbManager.getDatabase();
    
    try {
      // What this task depends on
      const dependsOn = db.prepare(`
        SELECT td.*, t.title, t.status, t.deadline
        FROM task_dependencies td
        JOIN tasks t ON t.id = td.depends_on_task_id
        WHERE td.task_id = ?
      `).all(taskId);
      
      // What depends on this task
      const blockedBy = db.prepare(`
        SELECT td.*, t.title, t.status, t.deadline
        FROM task_dependencies td
        JOIN tasks t ON t.id = td.task_id
        WHERE td.depends_on_task_id = ?
      `).all(taskId);
      
      // Check if task is blocked
      const isBlocked = dependsOn.some(d => d.status !== 'complete' && d.dependency_type === 'blocks');
      
      return {
        taskId,
        dependsOn,
        blockedBy,
        isBlocked,
        blockingTasks: dependsOn.filter(d => d.status !== 'complete' && d.dependency_type === 'blocks')
      };
    } catch (error) {
      logger.error('Failed to get task dependencies:', error);
      throw error;
    }
  }

  /**
   * Build complete dependency graph for a user's tasks
   * @param {number} userId - User ID
   * @param {number} [collegeId] - Optional college filter
   * @returns {Object} Full dependency graph
   */
  static async buildDependencyGraph(userId, collegeId = null) {
    const db = dbManager.getDatabase();
    
    try {
      let query = `
        SELECT t.*, c.name as college_name
        FROM tasks t
        LEFT JOIN colleges c ON c.id = t.college_id
        WHERE t.user_id = ?
      `;
      const params = [userId];
      
      if (collegeId) {
        query += ' AND t.college_id = ?';
        params.push(collegeId);
      }
      
      const tasks = db.prepare(query).all(...params);
      
      // Build graph structure
      const graph = {
        nodes: [],
        edges: [],
        levels: {},
        criticalPath: []
      };
      
      // Create nodes
      for (const task of tasks) {
        const deps = await this.getTaskDependencies(task.id);
        
        graph.nodes.push({
          id: task.id,
          label: task.title,
          status: task.status,
          deadline: task.deadline,
          collegeId: task.college_id,
          collegeName: task.college_name,
          isBlocked: deps.isBlocked,
          dependencyCount: deps.dependsOn.length,
          blocksCount: deps.blockedBy.length
        });
        
        // Create edges
        for (const dep of deps.dependsOn) {
          graph.edges.push({
            from: dep.depends_on_task_id,
            to: task.id,
            type: dep.dependency_type
          });
        }
      }
      
      // Calculate levels (for visualization)
      graph.levels = this.calculateLevels(graph.nodes, graph.edges);
      
      // Find critical path
      graph.criticalPath = this.findCriticalPath(graph.nodes, graph.edges);
      
      return graph;
    } catch (error) {
      logger.error('Failed to build dependency graph:', error);
      throw error;
    }
  }

  /**
   * Calculate levels for topological visualization
   * @param {Object[]} nodes - Graph nodes
   * @param {Object[]} edges - Graph edges
   * @returns {Object} Levels mapping
   */
  static calculateLevels(nodes, edges) {
    const levels = {};
    const inDegree = {};
    
    // Initialize
    for (const node of nodes) {
      inDegree[node.id] = 0;
      levels[node.id] = 0;
    }
    
    // Count incoming edges
    for (const edge of edges) {
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1;
    }
    
    // BFS to assign levels
    const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    
    while (queue.length > 0) {
      const current = queue.shift();
      
      for (const edge of edges.filter(e => e.from === current)) {
        levels[edge.to] = Math.max(levels[edge.to], levels[current] + 1);
        inDegree[edge.to]--;
        
        if (inDegree[edge.to] === 0) {
          queue.push(edge.to);
        }
      }
    }
    
    return levels;
  }

  /**
   * Find critical path (longest path through dependency graph)
   * @param {Object[]} nodes - Graph nodes
   * @param {Object[]} edges - Graph edges
   * @returns {number[]} Task IDs in critical path
   */
  static findCriticalPath(nodes, edges) {
    // Build adjacency list
    const adj = {};
    const nodeMap = {};
    
    for (const node of nodes) {
      adj[node.id] = [];
      nodeMap[node.id] = node;
    }
    
    for (const edge of edges) {
      if (adj[edge.from]) {
        adj[edge.from].push(edge.to);
      }
    }
    
    // Find longest path using DFS
    const visited = new Set();
    const pathLength = {};
    const parent = {};
    
    function dfs(nodeId) {
      if (visited.has(nodeId)) return pathLength[nodeId];
      visited.add(nodeId);
      
      let maxLength = 0;
      let maxChild = null;
      
      for (const child of (adj[nodeId] || [])) {
        const childLength = dfs(child) + 1;
        if (childLength > maxLength) {
          maxLength = childLength;
          maxChild = child;
        }
      }
      
      pathLength[nodeId] = maxLength;
      parent[nodeId] = maxChild;
      return maxLength;
    }
    
    // Find start node with longest path
    let maxStart = null;
    let maxLen = 0;
    
    for (const node of nodes) {
      const len = dfs(node.id);
      if (len > maxLen) {
        maxLen = len;
        maxStart = node.id;
      }
    }
    
    // Reconstruct path
    const criticalPath = [];
    let current = maxStart;
    
    while (current !== null) {
      criticalPath.push(current);
      current = parent[current];
    }
    
    return criticalPath;
  }

  /**
   * Auto-create dependencies based on task templates
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Object} Created dependencies summary
   */
  static async autoCreateDependencies(userId, collegeId) {
    const db = dbManager.getDatabase();
    const created = [];
    
    try {
      const tasks = db.prepare(`
        SELECT * FROM tasks WHERE user_id = ? AND college_id = ?
      `).all(userId, collegeId);
      
      const taskByType = {};
      for (const task of tasks) {
        const type = task.task_type;
        if (!taskByType[type]) taskByType[type] = [];
        taskByType[type].push(task);
      }
      
      // Submit task should depend on essays, transcripts, recommendations
      const submitTasks = tasks.filter(t => 
        t.title.toLowerCase().includes('submit') || 
        t.title.toLowerCase().includes('complete application')
      );
      
      for (const submitTask of submitTasks) {
        // Essays should be done before submit
        const essays = taskByType['essay'] || [];
        for (const essay of essays) {
          try {
            await this.createDependency(submitTask.id, essay.id, 'blocks');
            created.push({ taskId: submitTask.id, dependsOn: essay.id });
          } catch (e) { /* Already exists or would be circular */ }
        }
        
        // Transcripts should be done before submit
        const transcripts = taskByType['transcript'] || [];
        for (const transcript of transcripts) {
          try {
            await this.createDependency(submitTask.id, transcript.id, 'blocks');
            created.push({ taskId: submitTask.id, dependsOn: transcript.id });
          } catch (e) { /* Already exists */ }
        }
        
        // Recommendations should be done before submit
        const recommendations = taskByType['recommendation'] || [];
        for (const rec of recommendations) {
          try {
            await this.createDependency(submitTask.id, rec.id, 'blocks');
            created.push({ taskId: submitTask.id, dependsOn: rec.id });
          } catch (e) { /* Already exists */ }
        }
      }
      
      logger.info(`Auto-created ${created.length} dependencies for user ${userId}, college ${collegeId}`);
      
      return {
        created: created.length,
        dependencies: created
      };
    } catch (error) {
      logger.error('Failed to auto-create dependencies:', error);
      throw error;
    }
  }

  /**
   * Get impact of completing a task (what gets unblocked)
   * @param {number} taskId - Task ID
   * @returns {Object} Impact analysis
   */
  static async getCompletionImpact(taskId) {
    const db = dbManager.getDatabase();
    
    try {
      // Find tasks that would be unblocked
      const potentiallyUnblocked = db.prepare(`
        SELECT t.*, td.dependency_type
        FROM tasks t
        JOIN task_dependencies td ON td.task_id = t.id
        WHERE td.depends_on_task_id = ? AND t.status = 'blocked'
      `).all(taskId);
      
      // Check if completing this task would actually unblock each one
      const willUnblock = [];
      
      for (const task of potentiallyUnblocked) {
        // Get other blockers
        const otherBlockers = db.prepare(`
          SELECT t.id FROM tasks t
          JOIN task_dependencies td ON td.depends_on_task_id = t.id
          WHERE td.task_id = ? AND t.id != ? AND t.status != 'complete' AND td.dependency_type = 'blocks'
        `).all(task.id, taskId);
        
        if (otherBlockers.length === 0) {
          willUnblock.push(task);
        }
      }
      
      return {
        taskId,
        tasksBlocked: potentiallyUnblocked.length,
        willUnblock,
        unblockCount: willUnblock.length,
        highImpact: willUnblock.length >= 2
      };
    } catch (error) {
      logger.error('Failed to get completion impact:', error);
      throw error;
    }
  }

  /**
   * Get recommended task order based on dependencies and deadlines
   * @param {number} userId - User ID
   * @param {number} collegeId - College ID
   * @returns {Object[]} Ordered task list
   */
  static async getRecommendedOrder(userId, collegeId) {
    const db = dbManager.getDatabase();
    
    try {
      const graph = await this.buildDependencyGraph(userId, collegeId);
      
      // Topological sort with priority consideration
      const inDegree = {};
      const adj = {};
      
      for (const node of graph.nodes) {
        inDegree[node.id] = 0;
        adj[node.id] = [];
      }
      
      for (const edge of graph.edges) {
        adj[edge.from].push(edge.to);
        inDegree[edge.to]++;
      }
      
      // Use priority queue (nodes with no dependencies, sorted by priority/deadline)
      const result = [];
      const ready = graph.nodes
        .filter(n => inDegree[n.id] === 0)
        .sort((a, b) => {
          // First by dependency count (items that block more should be done first)
          if (a.blocksCount !== b.blocksCount) return b.blocksCount - a.blocksCount;
          // Then by deadline
          if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
          if (a.deadline) return -1;
          if (b.deadline) return 1;
          return 0;
        });
      
      while (ready.length > 0) {
        const node = ready.shift();
        result.push({
          order: result.length + 1,
          taskId: node.id,
          title: node.label,
          status: node.status,
          deadline: node.deadline,
          blocksCount: node.blocksCount,
          reason: node.blocksCount > 0 ? `Blocks ${node.blocksCount} other task(s)` : 'No blockers'
        });
        
        for (const childId of adj[node.id]) {
          inDegree[childId]--;
          if (inDegree[childId] === 0) {
            const childNode = graph.nodes.find(n => n.id === childId);
            ready.push(childNode);
            ready.sort((a, b) => {
              if (a.blocksCount !== b.blocksCount) return b.blocksCount - a.blocksCount;
              if (a.deadline && b.deadline) return new Date(a.deadline) - new Date(b.deadline);
              return 0;
            });
          }
        }
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to get recommended order:', error);
      throw error;
    }
  }
}

module.exports = DeadlineDependencyService;
