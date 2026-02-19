/**
 * Filter Helper Utilities
 * Provides filtering functions for deadlines, essays, and other data
 */

/**
 * Get applicable deadlines for a college (only offered types)
 * @param collegeId - College ID
 * @param allDeadlines - Array of all deadline data
 * @returns Filtered array of applicable deadlines
 */
export function getApplicableDeadlines(collegeId: number, allDeadlines: any[]) {
  return allDeadlines.filter(deadline => {
    // Only include deadlines for this college
    if (deadline.college_id !== collegeId) return false;
    
    // Check if deadline type is offered
    switch (deadline.deadline_type) {
      case 'ED':
      case 'ED1':
      case 'ED2':
        return deadline.offers_early_decision === 1 || deadline.offers_early_decision === true;
      case 'EA':
        return deadline.offers_early_action === 1 || deadline.offers_early_action === true;
      case 'REA':
        return deadline.offers_restrictive_early_action === 1 || deadline.offers_restrictive_early_action === true;
      case 'RD':
        return deadline.offers_regular_decision === 1 || deadline.offers_regular_decision === true;
      case 'Rolling':
        return deadline.offers_rolling === 1 || deadline.offers_rolling === true;
      default:
        return true; // Include unknown types by default
    }
  });
}

/**
 * Filter deadlines by status
 * @param deadlines - Array of deadlines
 * @param status - Status to filter by ('not_started' | 'in_progress' | 'submitted')
 * @returns Filtered deadlines
 */
export function filterDeadlinesByStatus(deadlines: any[], status: string) {
  return deadlines.filter(d => d.status === status);
}

/**
 * Filter deadlines by urgency
 * @param deadlines - Array of deadlines
 * @param urgency - Urgency level ('urgent' | 'upcoming' | 'future' | 'past')
 * @returns Filtered deadlines
 */
export function filterDeadlinesByUrgency(deadlines: any[], urgency: string) {
  const now = new Date();
  
  return deadlines.filter(deadline => {
    const deadlineDate = new Date(deadline.deadline_date);
    const daysUntil = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    switch (urgency) {
      case 'urgent':
        return daysUntil >= 0 && daysUntil <= 7;
      case 'upcoming':
        return daysUntil > 7 && daysUntil <= 30;
      case 'future':
        return daysUntil > 30;
      case 'past':
        return daysUntil < 0;
      default:
        return true;
    }
  });
}

/**
 * Get deadlines for a specific college
 * @param deadlines - Array of all deadlines
 * @param collegeId - College ID to filter by
 * @returns Filtered deadlines
 */
export function getDeadlinesByCollege(deadlines: any[], collegeId: number) {
  return deadlines.filter(d => d.college_id === collegeId);
}

/**
 * Filter essays by completion status
 * @param essays - Array of essays
 * @param status - Status to filter by
 * @returns Filtered essays
 */
export function filterEssaysByStatus(essays: any[], status: string) {
  return essays.filter(e => e.status === status);
}

/**
 * Get essays for a specific college
 * @param essays - Array of all essays
 * @param collegeId - College ID to filter by
 * @returns Filtered essays
 */
export function getEssaysByCollege(essays: any[], collegeId: number) {
  return essays.filter(e => e.college_id === collegeId);
}

/**
 * Group essays by similarity for reuse detection
 * @param essays - Array of essays
 * @returns Grouped essays by similar prompts
 */
export function groupEssaysBySimilarity(essays: any[]) {
  const groups: { [key: string]: any[] } = {};
  
  essays.forEach(essay => {
    // Simple grouping by word limit and prompt keywords
    const key = `${essay.word_limit}_${extractPromptKeywords(essay.prompt)}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(essay);
  });
  
  // Only return groups with multiple essays (reuse opportunities)
  return Object.values(groups).filter(group => group.length > 1);
}

/**
 * Extract keywords from essay prompt for similarity matching
 * @private
 */
function extractPromptKeywords(prompt: string): string {
  const commonWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
  const words = prompt.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3 && !commonWords.includes(word))
    .slice(0, 5);
  return words.join('_');
}

/**
 * Calculate total word count remaining across all essays
 * @param essays - Array of essays
 * @returns Object with total and breakdown
 */
export function calculateTotalWordCount(essays: any[]) {
  const incomplete = essays.filter(e => e.status !== 'submitted');
  
  const totalRequired = incomplete.reduce((sum, essay) => {
    const currentWords = essay.draft ? essay.draft.split(/\s+/).length : 0;
    const remaining = Math.max(0, essay.word_limit - currentWords);
    return sum + remaining;
  }, 0);
  
  const totalEssays = incomplete.length;
  const completedCount = essays.filter(e => e.status === 'submitted').length;
  
  return {
    totalRequired,
    totalEssays,
    completedCount,
    remainingEssays: totalEssays,
    averageWordsPerEssay: totalEssays > 0 ? Math.ceil(totalRequired / totalEssays) : 0
  };
}

/**
 * Sort deadlines by date
 * @param deadlines - Array of deadlines
 * @param ascending - Sort direction (default: true)
 * @returns Sorted deadlines
 */
export function sortDeadlinesByDate(deadlines: any[], ascending = true) {
  return [...deadlines].sort((a, b) => {
    const dateA = new Date(a.deadline_date).getTime();
    const dateB = new Date(b.deadline_date).getTime();
    return ascending ? dateA - dateB : dateB - dateA;
  });
}

/**
 * Get upcoming deadlines within specified days
 * @param deadlines - Array of deadlines
 * @param days - Number of days to look ahead (default: 30)
 * @returns Filtered deadlines
 */
export function getUpcomingDeadlines(deadlines: any[], days = 30) {
  const now = new Date();
  const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  
  return deadlines.filter(deadline => {
    const deadlineDate = new Date(deadline.deadline_date);
    return deadlineDate >= now && deadlineDate <= future && deadline.status !== 'submitted';
  });
}

/**
 * Check if data is stale (needs refresh)
 * @param lastUpdated - Last updated timestamp
 * @param maxAgeDays - Maximum age in days (default: 30)
 * @returns Boolean indicating if data is stale
 */
export function isDataStale(lastUpdated: string, maxAgeDays = 30): boolean {
  if (!lastUpdated) return true;
  
  const updated = new Date(lastUpdated);
  const now = new Date();
  const ageInDays = (now.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);
  
  return ageInDays > maxAgeDays;
}

/**
 * Calculate deadline urgency level
 * @param deadlineDate - Deadline date string
 * @returns Urgency level ('urgent' | 'warning' | 'normal' | 'past')
 */
export function calculateDeadlineUrgency(deadlineDate: string): string {
  const now = new Date();
  const deadline = new Date(deadlineDate);
  const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysUntil < 0) return 'past';
  if (daysUntil <= 7) return 'urgent';
  if (daysUntil <= 30) return 'warning';
  return 'normal';
}

/**
 * Format deadline for display
 * @param deadline - Deadline object
 * @returns Formatted deadline object with computed properties
 */
export function formatDeadlineForDisplay(deadline: any) {
  const urgency = calculateDeadlineUrgency(deadline.deadline_date);
  const daysUntil = Math.ceil(
    (new Date(deadline.deadline_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return {
    ...deadline,
    urgency,
    daysUntil,
    formattedDate: new Date(deadline.deadline_date).toLocaleDateString(),
    isOverdue: daysUntil < 0
  };
}

/**
 * Filter colleges by offered deadline types
 * @param colleges - Array of colleges
 * @param deadlineType - Deadline type to filter by ('ED', 'EA', 'REA', 'RD', 'Rolling')
 * @returns Filtered colleges
 */
export function filterCollegesByDeadlineType(colleges: any[], deadlineType: string) {
  return colleges.filter(college => {
    switch (deadlineType) {
      case 'ED':
      case 'ED1':
      case 'ED2':
        return college.offers_early_decision === 1;
      case 'EA':
        return college.offers_early_action === 1;
      case 'REA':
        return college.offers_restrictive_early_action === 1;
      case 'RD':
        return college.offers_regular_decision === 1;
      case 'Rolling':
        return college.offers_rolling === 1;
      default:
        return true;
    }
  });
}
