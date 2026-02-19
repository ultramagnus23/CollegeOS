const Essay = require('../models/Essay');
const logger = require('../utils/logger');

class EssayService {
  // Get essay progress summary
  static getProgressSummary(userId) {
    try {
      const essays = Essay.findByUser(userId);
      
      const summary = {
        total: essays.length,
        notStarted: 0,
        inProgress: 0,
        draftComplete: 0,
        final: 0,
        totalWords: 0,
        averageCompletion: 0
      };
      
      const statusWeights = {
        not_started: 0,
        in_progress: 0.5,
        draft_complete: 0.75,
        final: 1
      };
      
      let totalCompletion = 0;
      
      essays.forEach(essay => {
        summary[essay.status.replace('_', '')]++;
        totalCompletion += statusWeights[essay.status] || 0;
        if (essay.word_limit) {
          summary.totalWords += essay.word_limit;
        }
      });
      
      summary.averageCompletion = essays.length > 0 ? (totalCompletion / essays.length) * 100 : 0;
      
      return summary;
    } catch (error) {
      logger.error('Failed to get essay progress:', error);
      throw error;
    }
  }
  
  // Validate Google Drive link
  static validateDriveLink(link) {
    if (!link) return false;
    
    const drivePatterns = [
      /^https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+/,
      /^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+/
    ];
    
    return drivePatterns.some(pattern => pattern.test(link));
  }
}

module.exports = EssayService;