// backend/src/services/webScraper.js
// Respectful web scraping service for university websites

const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const dbManager = require('../config/database');
const config = require('../config/env');

class WebScraper {
  constructor() {
    this.rateLimitMs = config.scraping?.delayMs || 2000;
    this.userAgent = config.scraping?.userAgent || 'CollegeAppBot/1.0';
    this.robotsCache = new Map();
    this.lastRequestTime = new Map();
  }
  
  /**
   * Check robots.txt before scraping
   * @param {string} url - URL to check
   * @returns {boolean} - Whether scraping is allowed
   */
  async checkRobotsTxt(url) {
    try {
      const urlObj = new URL(url);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      
      // Check cache
      if (this.robotsCache.has(domain)) {
        const robots = this.robotsCache.get(domain);
        return robots.isAllowed(url, this.userAgent);
      }
      
      // Fetch robots.txt
      const robotsUrl = `${domain}/robots.txt`;
      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });
      
      const robots = robotsParser(robotsUrl, response.data);
      this.robotsCache.set(domain, robots);
      
      return robots.isAllowed(url, this.userAgent);
    } catch (error) {
      // If robots.txt doesn't exist or error, allow scraping
      console.warn(`Could not fetch robots.txt for ${url}:`, error.message);
      return true;
    }
  }
  
  /**
   * Enforce rate limiting
   * @param {string} domain - Domain to rate limit
   */
  async enforceRateLimit(domain) {
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(domain) || 0;
    const timeSinceLastRequest = now - lastRequest;
    
    if (timeSinceLastRequest < this.rateLimitMs) {
      const waitTime = this.rateLimitMs - timeSinceLastRequest;
      console.log(`⏳ Rate limiting: waiting ${waitTime}ms for ${domain}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime.set(domain, Date.now());
  }
  
  /**
   * Scrape a URL with safety checks
   * @param {string} url - URL to scrape
   * @returns {object} - Scraped content
   */
  async scrapeUrl(url) {
    try {
      // Check robots.txt
      const allowed = await this.checkRobotsTxt(url);
      if (!allowed) {
        console.warn(`🚫 Robots.txt disallows scraping: ${url}`);
        return { success: false, error: 'Disallowed by robots.txt' };
      }
      
      // Extract domain
      const urlObj = new URL(url);
      const domain = urlObj.host;
      
      // Enforce rate limiting
      await this.enforceRateLimit(domain);
      
      // Fetch content
      console.log(`🌐 Scraping: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      
      // Parse HTML
      const $ = cheerio.load(response.data);
      
      return {
        success: true,
        html: response.data,
        $: $,
        url: url,
        scrapedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Scraping failed for ${url}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Scrape university admissions page
   * @param {string} admissionsUrl - University admissions URL
   * @returns {object} - Extracted admissions data
   */
  async scrapeAdmissions(admissionsUrl) {
    const result = await this.scrapeUrl(admissionsUrl);
    
    if (!result.success) {
      return null;
    }
    
    const $ = result.$;
    const data = {
      url: admissionsUrl,
      deadlines: [],
      requirements: [],
      contact: null,
      scrapedAt: result.scrapedAt
    };
    
    // Extract deadlines
    $('*').each((i, elem) => {
      const text = $(elem).text();
      
      // Look for deadline patterns
      const deadlinePatterns = [
        /deadline[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi,
        /due[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/gi,
        /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi
      ];
      
      deadlinePatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => data.deadlines.push(match.trim()));
        }
      });
    });
    
    // Extract requirements
    const requirementKeywords = ['requirement', 'test score', 'gpa', 'transcript', 'essay', 'recommendation'];
    $('*:contains("requirement"), *:contains("requirements")').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.length > 20 && text.length < 500) {
        data.requirements.push(text);
      }
    });
    
    // Remove duplicates
    data.deadlines = [...new Set(data.deadlines)].slice(0, 10);
    data.requirements = [...new Set(data.requirements)].slice(0, 5);
    
    return data;
  }
  
  /**
   * Scrape university programs page
   * @param {string} programsUrl - University programs URL
   * @returns {array} - List of programs
   */
  async scrapePrograms(programsUrl) {
    const result = await this.scrapeUrl(programsUrl);
    
    if (!result.success) {
      return [];
    }
    
    const $ = result.$;
    const programs = new Set();
    
    // Look for common program patterns
    $('a, h2, h3, h4, .program, .degree, .major').each((i, elem) => {
      const text = $(elem).text().trim();
      
      // Check if it looks like a program name
      const programPatterns = [
        /^(Bachelor|Master|B\.S\.|B\.A\.|M\.S\.|M\.A\.|PhD).+/i,
        /^(Computer Science|Engineering|Business|Medicine|Law|Psychology|Biology|Chemistry|Physics|Mathematics)/i
      ];
      
      const isProgram = programPatterns.some(pattern => pattern.test(text));
      if (isProgram && text.length > 5 && text.length < 100) {
        programs.add(text);
      }
    });
    
    return Array.from(programs).slice(0, 50);
  }
  
  /**
   * Scrape and save college data
   * @param {number} collegeId - College ID in database
   * @param {string} dataType - Type of data (deadlines, requirements, programs)
   * @param {string} url - URL to scrape
   */
  async scrapeAndSave(collegeId, dataType, url) {
    let data = null;
    
    switch (dataType) {
      case 'deadlines':
      case 'requirements':
        data = await this.scrapeAdmissions(url);
        break;
      
      case 'programs':
        data = await this.scrapePrograms(url);
        break;
      
      default:
        console.warn(`Unknown data type: ${dataType}`);
        return false;
    }
    
    if (!data) {
      return false;
    }
    
    // Save to college_data table
    try {
      const db = dbManager.getDatabase();
      const stmt = db.prepare(`
        INSERT INTO college_data (
          college_id, data_type, data_content, source_url, trust_tier, 
          scraped_at, expires_at, is_valid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 3); // Expire in 3 months
      
      stmt.run(
        collegeId,
        dataType,
        JSON.stringify(data),
        url,
        'scraped',
        new Date().toISOString(),
        expiresAt.toISOString(),
        1
      );
      
      console.log(`✅ Saved ${dataType} data for college ${collegeId}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to save scraped data:`, error.message);
      return false;
    }
  }
  
  /**
   * Validate scraped data
   * @param {object} data - Data to validate
   * @param {string} dataType - Type of data
   * @returns {boolean} - Whether data is valid
   */
  validateData(data, dataType) {
    if (!data) return false;
    
    switch (dataType) {
      case 'deadlines':
        return data.deadlines && data.deadlines.length > 0;
      
      case 'requirements':
        return data.requirements && data.requirements.length > 0;
      
      case 'programs':
        return Array.isArray(data) && data.length > 0;
      
      default:
        return false;
    }
  }
}

// Singleton instance
const webScraper = new WebScraper();

module.exports = webScraper;
