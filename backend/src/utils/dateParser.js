const logger = require('./logger');

/**
 * Robust date parser for college application deadlines
 * Handles multiple date formats and infers years based on application cycle
 */
class DateParser {
  constructor() {
    // Month names for parsing
    this.monthNames = {
      'january': 0, 'jan': 0,
      'february': 1, 'feb': 1,
      'march': 2, 'mar': 2,
      'april': 3, 'apr': 3,
      'may': 4,
      'june': 5, 'jun': 5,
      'july': 6, 'jul': 6,
      'august': 7, 'aug': 7,
      'september': 8, 'sep': 8, 'sept': 8,
      'october': 9, 'oct': 9,
      'november': 10, 'nov': 10,
      'december': 11, 'dec': 11
    };
    
    // Relative date approximations
    this.relativeApproximations = {
      'early november': { month: 10, day: 7 },
      'mid november': { month: 10, day: 15 },
      'late november': { month: 10, day: 25 },
      'early december': { month: 11, day: 7 },
      'mid december': { month: 11, day: 15 },
      'late december': { month: 11, day: 25 },
      'early january': { month: 0, day: 7 },
      'mid january': { month: 0, day: 15 },
      'late january': { month: 0, day: 25 },
      'early march': { month: 2, day: 7 },
      'mid march': { month: 2, day: 15 },
      'late march': { month: 2, day: 25 },
      'early april': { month: 3, day: 7 },
      'mid april': { month: 3, day: 15 },
      'late april': { month: 3, day: 25 }
    };
  }
  
  /**
   * Determine application year based on current date
   * August-December = next year's cycle, January-July = current year's cycle
   */
  getApplicationYear() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    // August (7) through December (11) = next year's application cycle
    return month >= 7 ? year + 1 : year;
  }
  
  /**
   * Parse various date formats
   * @param {string} dateStr - Date string to parse
   * @returns {Date|null} Parsed date or null if parsing failed
   */
  parse(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      return null;
    }
    
    const cleaned = dateStr.trim().toLowerCase();
    
    try {
      // Try relative date approximations first
      for (const [phrase, approx] of Object.entries(this.relativeApproximations)) {
        if (cleaned.includes(phrase)) {
          return this._createDateWithYear(approx.month, approx.day);
        }
      }
      
      // Format 1: "November 1, 2025" or "Nov 1, 2025"
      let match = cleaned.match(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (match) {
        const month = this.monthNames[match[1]];
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        if (month !== undefined) {
          return new Date(year, month, day);
        }
      }
      
      // Format 2: "1 Nov 2025" or "1 November 2025"
      match = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (match) {
        const day = parseInt(match[1]);
        const month = this.monthNames[match[2]];
        const year = parseInt(match[3]);
        if (month !== undefined) {
          return new Date(year, month, day);
        }
      }
      
      // Format 3: "November 1" or "Nov 1" (no year)
      match = cleaned.match(/(\w+)\s+(\d{1,2})(?![,\d])/);
      if (match) {
        const month = this.monthNames[match[1]];
        const day = parseInt(match[2]);
        if (month !== undefined) {
          return this._createDateWithYear(month, day);
        }
      }
      
      // Format 4: "11/1/2025" (US format: month/day/year)
      match = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (match) {
        const month = parseInt(match[1]) - 1; // 0-indexed
        const day = parseInt(match[2]);
        const year = parseInt(match[3]);
        return new Date(year, month, day);
      }
      
      // Format 5: "11/1" or "11-1" (no year)
      match = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})(?![\/\-\d])/);
      if (match) {
        const month = parseInt(match[1]) - 1; // 0-indexed
        const day = parseInt(match[2]);
        return this._createDateWithYear(month, day);
      }
      
      // Format 6: "2025-11-01" (ISO format)
      match = cleaned.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        const year = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; // 0-indexed
        const day = parseInt(match[3]);
        return new Date(year, month, day);
      }
      
      // Format 7: Try standard Date constructor as fallback
      const attemptParse = new Date(dateStr);
      if (!isNaN(attemptParse.getTime())) {
        return attemptParse;
      }
      
    } catch (error) {
      logger.debug(`Date parsing failed for "${dateStr}":`, error.message);
    }
    
    return null;
  }
  
  /**
   * Create date with inferred year based on application cycle
   * @param {number} month - Month (0-11)
   * @param {number} day - Day of month
   * @returns {Date} Date with inferred year
   */
  _createDateWithYear(month, day) {
    const appYear = this.getApplicationYear();
    const now = new Date();
    const currentMonth = now.getMonth();
    
    // If current month is August-December and date month is August-December,
    // use current year. Otherwise use application year.
    let year;
    if (currentMonth >= 7 && month >= 7) {
      year = now.getFullYear();
    } else if (currentMonth < 7 && month < 7) {
      year = appYear;
    } else if (month >= 7) {
      // Date is in fall, use current year or next year
      year = currentMonth >= 7 ? now.getFullYear() : now.getFullYear() - 1;
    } else {
      // Date is in spring, use application year
      year = appYear;
    }
    
    return new Date(year, month, day);
  }
  
  /**
   * Extract all dates from text
   * @param {string} text - Text to extract dates from
   * @returns {Array<{date: Date, originalText: string}>} Array of parsed dates
   */
  extractDates(text) {
    if (!text) return [];
    
    const dates = [];
    const patterns = [
      // "November 1, 2025"
      /(\w+\s+\d{1,2},?\s+\d{4})/gi,
      // "1 Nov 2025"
      /(\d{1,2}\s+\w+\s+\d{4})/gi,
      // "November 1"
      /(\w+\s+\d{1,2})(?![,\d])/gi,
      // "11/1/2025"
      /(\d{1,2}\/\d{1,2}\/\d{4})/gi,
      // "2025-11-01"
      /(\d{4}-\d{2}-\d{2})/gi,
      // "mid-December", "early November"
      /(early|mid|late)\s+(\w+)/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const dateStr = match[0];
        const parsed = this.parse(dateStr);
        if (parsed && !isNaN(parsed.getTime())) {
          dates.push({
            date: parsed,
            originalText: dateStr
          });
        }
      }
    });
    
    // Remove duplicates (same date)
    const uniqueDates = [];
    const seen = new Set();
    for (const item of dates) {
      const key = item.date.toISOString().split('T')[0];
      if (!seen.has(key)) {
        seen.add(key);
        uniqueDates.push(item);
      }
    }
    
    return uniqueDates;
  }
  
  /**
   * Format date as YYYY-MM-DD for database storage
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatForDatabase(date) {
    if (!date || isNaN(date.getTime())) {
      return null;
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
}

module.exports = new DateParser();
