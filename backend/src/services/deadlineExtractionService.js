const dateParser = require('../utils/dateParser');
const logger = require('../utils/logger');

/**
 * Service for extracting application deadlines from college websites
 * Handles multiple formats: tables, lists, and paragraph text
 */
class DeadlineExtractionService {
  constructor() {
    // Deadline type patterns
    this.deadlinePatterns = {
      ED1: /early\s+decision\s*(i|1|one)?/i,
      ED2: /early\s+decision\s*(ii|2|two)/i,
      EA: /early\s+action(?!\s+restrictive)/i,
      REA: /restrictive\s+early\s+action|single\s+choice\s+early/i,
      RD: /regular\s+decision/i,
      rolling: /rolling\s+admission/i
    };
    
    // Notification date keywords
    this.notificationKeywords = [
      'decision', 'notification', 'results', 'released',
      'you will hear', 'admission decision', 'notified'
    ];
  }
  
  /**
   * Main extraction method - tries multiple strategies
   * @param {object} scrapedData - Data from scraping service
   * @returns {object} Extracted deadline data with confidence score
   */
  async extract(scrapedData) {
    const { $, url } = scrapedData;
    
    logger.info(`Extracting deadlines from ${url}`);
    
    // Try extraction methods in order of preference
    let result = this._extractFromTable($, url);
    if (result && result.deadlines.length > 0) {
      result.extractionMethod = 'table';
      return result;
    }
    
    result = this._extractFromLists($, url);
    if (result && result.deadlines.length > 0) {
      result.extractionMethod = 'list';
      return result;
    }
    
    result = this._extractFromParagraphs($, url);
    if (result && result.deadlines.length > 0) {
      result.extractionMethod = 'paragraph';
      return result;
    }
    
    // No deadlines found
    logger.warn(`No deadlines extracted from ${url}`);
    return {
      deadlines: [],
      confidence: 0.0,
      extractionMethod: 'none',
      source_url: url
    };
  }
  
  /**
   * Extract deadlines from HTML tables
   * @param {CheerioStatic} $ - Cheerio instance
   * @param {string} url - Source URL
   * @returns {object|null} Extracted deadlines or null
   */
  _extractFromTable($, url) {
    const deadlines = [];
    
    // Find tables with deadline-related content
    $('table').each((i, table) => {
      const $table = $(table);
      const tableText = $table.text().toLowerCase();
      
      // Check if this table contains deadlines
      if (!tableText.match(/deadline|application|decision|early|regular/i)) {
        return;
      }
      
      // Find header row to understand structure
      const headers = [];
      $table.find('thead tr, tr').first().find('th, td').each((j, cell) => {
        headers.push($(cell).text().trim().toLowerCase());
      });
      
      // Process data rows
      $table.find('tbody tr, tr').each((j, row) => {
        if (j === 0 && headers.length === 0) return; // Skip if header row
        
        const cells = [];
        $(row).find('td, th').each((k, cell) => {
          cells.push($(cell).text().trim());
        });
        
        if (cells.length < 2) return;
        
        // Try to identify deadline type and dates
        const rowText = cells.join(' ');
        const deadlineType = this._identifyDeadlineType(rowText);
        
        if (deadlineType) {
          const dates = dateParser.extractDates(rowText);
          
          if (dates.length >= 1) {
            const deadline = {
              type: deadlineType,
              applicationDate: dates[0].date,
              notificationDate: dates.length >= 2 ? dates[1].date : null,
              extractedText: rowText
            };
            deadlines.push(deadline);
          }
        }
      });
    });
    
    if (deadlines.length > 0) {
      return {
        deadlines,
        confidence: 1.0, // Tables are highly structured
        source_url: url
      };
    }
    
    return null;
  }
  
  /**
   * Extract deadlines from lists (ul, ol, dl)
   * @param {CheerioStatic} $ - Cheerio instance
   * @param {string} url - Source URL
   * @returns {object|null} Extracted deadlines or null
   */
  _extractFromLists($, url) {
    const deadlines = [];
    
    // Process definition lists
    $('dl').each((i, dl) => {
      const $dl = $(dl);
      let currentType = null;
      let currentText = '';
      
      $dl.children().each((j, elem) => {
        const tagName = $(elem).prop('tagName').toLowerCase();
        const text = $(elem).text().trim();
        
        if (tagName === 'dt') {
          // Process previous if exists
          if (currentType && currentText) {
            const deadline = this._extractDeadlineFromText(currentType, currentText);
            if (deadline) deadlines.push(deadline);
          }
          
          // Start new deadline type
          currentType = this._identifyDeadlineType(text);
          currentText = text;
        } else if (tagName === 'dd') {
          currentText += ' ' + text;
        }
      });
      
      // Process last item
      if (currentType && currentText) {
        const deadline = this._extractDeadlineFromText(currentType, currentText);
        if (deadline) deadlines.push(deadline);
      }
    });
    
    // Process unordered and ordered lists
    $('ul, ol').each((i, list) => {
      const $list = $(list);
      const listText = $list.text().toLowerCase();
      
      if (!listText.match(/deadline|application|decision/i)) {
        return;
      }
      
      $list.find('li').each((j, item) => {
        const text = $(item).text().trim();
        const deadlineType = this._identifyDeadlineType(text);
        
        if (deadlineType) {
          const deadline = this._extractDeadlineFromText(deadlineType, text);
          if (deadline) deadlines.push(deadline);
        }
      });
    });
    
    if (deadlines.length > 0) {
      return {
        deadlines,
        confidence: 0.8, // Lists are fairly structured
        source_url: url
      };
    }
    
    return null;
  }
  
  /**
   * Extract deadlines from paragraph text (last resort)
   * @param {CheerioStatic} $ - Cheerio instance
   * @param {string} url - Source URL
   * @returns {object|null} Extracted deadlines or null
   */
  _extractFromParagraphs($, url) {
    const deadlines = [];
    const processedSentences = new Set();
    
    // Find paragraphs and headings with deadline content
    $('p, h1, h2, h3, h4, h5, h6, div').each((i, elem) => {
      const text = $(elem).text().trim();
      
      if (text.length < 20 || text.length > 1000) return;
      if (!text.match(/deadline|application|due|submit|decision/i)) return;
      
      // Split into sentences
      const sentences = text.split(/[.!?]+/);
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length < 20) continue;
        if (processedSentences.has(trimmed)) continue;
        
        processedSentences.add(trimmed);
        
        const deadlineType = this._identifyDeadlineType(trimmed);
        if (deadlineType) {
          const deadline = this._extractDeadlineFromText(deadlineType, trimmed);
          if (deadline) deadlines.push(deadline);
        }
      }
    });
    
    if (deadlines.length > 0) {
      return {
        deadlines,
        confidence: 0.6, // Paragraph extraction is less reliable
        source_url: url
      };
    }
    
    return null;
  }
  
  /**
   * Identify deadline type from text
   * @param {string} text - Text to analyze
   * @returns {string|null} Deadline type or null
   */
  _identifyDeadlineType(text) {
    const lower = text.toLowerCase();
    
    // Check patterns in order of specificity
    if (this.deadlinePatterns.REA.test(lower)) return 'REA';
    if (this.deadlinePatterns.ED2.test(lower)) return 'ED2';
    if (this.deadlinePatterns.ED1.test(lower)) return 'ED1';
    if (this.deadlinePatterns.EA.test(lower)) return 'EA';
    if (this.deadlinePatterns.RD.test(lower)) return 'RD';
    if (this.deadlinePatterns.rolling.test(lower)) return 'rolling';
    
    return null;
  }
  
  /**
   * Extract deadline information from text snippet
   * @param {string} type - Deadline type
   * @param {string} text - Text containing deadline info
   * @returns {object|null} Deadline object or null
   */
  _extractDeadlineFromText(type, text) {
    const dates = dateParser.extractDates(text);
    
    if (dates.length === 0) return null;
    
    // Separate application date from notification date
    let applicationDate = null;
    let notificationDate = null;
    
    // Look for keywords to distinguish application vs notification
    const lower = text.toLowerCase();
    const parts = text.split(/[,;]/);
    
    for (let i = 0; i < parts.length && i < dates.length; i++) {
      const part = parts[i].toLowerCase();
      const isNotification = this.notificationKeywords.some(kw => part.includes(kw));
      
      if (isNotification && !notificationDate) {
        notificationDate = dates[i].date;
      } else if (!applicationDate) {
        applicationDate = dates[i].date;
      } else if (!notificationDate) {
        notificationDate = dates[i].date;
      }
    }
    
    // If we only found one date, assume it's application date
    if (!applicationDate && dates.length > 0) {
      applicationDate = dates[0].date;
    }
    
    return {
      type,
      applicationDate,
      notificationDate,
      extractedText: text.substring(0, 200)
    };
  }
  
  /**
   * Calculate confidence score based on extraction results
   * @param {object} result - Extraction result
   * @param {string} url - Source URL
   * @returns {number} Confidence score (0.0-1.0)
   */
  calculateConfidence(result, url) {
    let confidence = result.confidence || 0.5;
    
    // Boost confidence for .edu domains
    if (url.includes('.edu')) {
      confidence += 0.1;
    }
    
    // Boost if we found multiple deadline types
    if (result.deadlines.length >= 3) {
      confidence += 0.1;
    }
    
    // Reduce if missing notification dates
    const missingNotifications = result.deadlines.filter(d => !d.notificationDate).length;
    if (missingNotifications > 0) {
      confidence -= 0.05 * missingNotifications;
    }
    
    // Ensure confidence stays in valid range
    return Math.max(0.2, Math.min(1.0, confidence));
  }
  
  /**
   * Determine which deadline types are offered
   * @param {Array} deadlines - Extracted deadlines
   * @returns {object} Boolean flags for each deadline type
   */
  getOfferedTypes(deadlines) {
    const offered = {
      offers_early_decision: false,
      offers_early_action: false,
      offers_restrictive_ea: false,
      offers_rolling_admission: false
    };
    
    for (const deadline of deadlines) {
      switch (deadline.type) {
        case 'ED1':
        case 'ED2':
          offered.offers_early_decision = true;
          break;
        case 'EA':
          offered.offers_early_action = true;
          break;
        case 'REA':
          offered.offers_restrictive_ea = true;
          break;
        case 'rolling':
          offered.offers_rolling_admission = true;
          break;
      }
    }
    
    return offered;
  }
}

module.exports = new DeadlineExtractionService();
