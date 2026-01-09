const axios = require('axios');
const cheerio = require('cheerio');
const robotsParser = require('robots-parser');
const config = require('../config/env');
const logger = require('../utils/logger');
const { TRUST_TIERS, OFFICIAL_DOMAINS, SECONDARY_SOURCES, FORUM_SOURCES } = require('../config/constants');

class ScrapingService {
  constructor() {
    this.robotsCache = new Map();
    this.lastRequestTime = new Map();
  }
  
  // Check robots.txt compliance
  async checkRobotsTxt(url) {
    try {
      const urlObj = new URL(url);
      const robotsUrl = `${urlObj.protocol}//${urlObj.host}/robots.txt`;
      
      // Check cache
      if (this.robotsCache.has(robotsUrl)) {
        const robots = this.robotsCache.get(robotsUrl);
        return robots.isAllowed(url, config.scraping.userAgent);
      }
      
      // Fetch robots.txt
      const response = await axios.get(robotsUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500
      });
      
      const robots = robotsParser(robotsUrl, response.data);
      this.robotsCache.set(robotsUrl, robots);
      
      return robots.isAllowed(url, config.scraping.userAgent);
    } catch (error) {
      // If robots.txt doesn't exist or fails, assume allowed
      logger.warn(`robots.txt check failed for ${url}:`, error.message);
      return true;
    }
  }
  
  // Rate limiting per domain
  async respectRateLimit(domain) {
    const now = Date.now();
    const lastRequest = this.lastRequestTime.get(domain) || 0;
    const timeSinceLastRequest = now - lastRequest;
    
    if (timeSinceLastRequest < config.scraping.delayMs) {
      const waitTime = config.scraping.delayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime.set(domain, Date.now());
  }
  
  // Determine trust tier based on URL
  getTrustTier(url) {
    const urlLower = url.toLowerCase();
    
    // Check official domains
    if (OFFICIAL_DOMAINS.some(domain => urlLower.includes(domain))) {
      return TRUST_TIERS.OFFICIAL;
    }
    
    // Check secondary sources
    if (SECONDARY_SOURCES.some(source => urlLower.includes(source))) {
      return TRUST_TIERS.SECONDARY;
    }
    
    // Check forum sources
    if (FORUM_SOURCES.some(forum => urlLower.includes(forum))) {
      return TRUST_TIERS.FORUM;
    }
    
    // Default to secondary
    return TRUST_TIERS.SECONDARY;
  }
  
  // Main scraping function
  async scrape(url, options = {}) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      // Check robots.txt
      if (!options.skipRobotsCheck) {
        const allowed = await this.checkRobotsTxt(url);
        if (!allowed) {
          logger.warn(`Scraping not allowed by robots.txt: ${url}`);
          return {
            success: false,
            error: 'Scraping not allowed by robots.txt',
            url
          };
        }
      }
      
      // Respect rate limit
      await this.respectRateLimit(domain);
      
      // Fetch page
      const response = await axios.get(url, {
        headers: {
          'User-Agent': config.scraping.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout: 30000,
        maxRedirects: 5
      });
      
      // Parse HTML
      const $ = cheerio.load(response.data);
      
      // Determine trust tier
      const trustTier = this.getTrustTier(url);
      
      logger.info(`Successfully scraped ${url} (Trust: ${trustTier})`);
      
      return {
        success: true,
        html: response.data,
        $,
        url,
        finalUrl: response.request.res.responseUrl || url,
        trustTier,
        scrapedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Scraping failed for ${url}:`, error.message);
      return {
        success: false,
        error: error.message,
        url
      };
    }
  }
  
  // Extract admissions requirements from a page
  extractRequirements(scrapedData) {
    try {
      const { $, url } = scrapedData;
      const requirements = {
        gpa: null,
        testScores: {},
        languageRequirements: {},
        essays: [],
        recommendations: null,
        transcript: null,
        extractedAt: new Date().toISOString()
      };
      
      // Extract text content
      const text = $('body').text().toLowerCase();
      
      // GPA patterns
      const gpaMatch = text.match(/gpa[:\s]+(\d+\.\d+)/i) || 
                       text.match(/grade point average[:\s]+(\d+\.\d+)/i);
      if (gpaMatch) {
        requirements.gpa = parseFloat(gpaMatch[1]);
      }
      
      // SAT scores
      const satMatch = text.match(/sat[:\s]+(\d{3,4})/i);
      if (satMatch) {
        requirements.testScores.sat = parseInt(satMatch[1]);
      }
      
      // ACT scores
      const actMatch = text.match(/act[:\s]+(\d{1,2})/i);
      if (actMatch) {
        requirements.testScores.act = parseInt(actMatch[1]);
      }
      
      // IELTS
      const ieltsMatch = text.match(/ielts[:\s]+(\d+\.?\d*)/i);
      if (ieltsMatch) {
        requirements.languageRequirements.ielts = parseFloat(ieltsMatch[1]);
      }
      
      // TOEFL
      const toeflMatch = text.match(/toefl[:\s]+(\d{2,3})/i);
      if (toeflMatch) {
        requirements.languageRequirements.toefl = parseInt(toeflMatch[1]);
      }
      
      // Look for essay requirements
      $('h2, h3, h4').each((i, elem) => {
        const heading = $(elem).text().toLowerCase();
        if (heading.includes('essay') || heading.includes('personal statement')) {
          const content = $(elem).next('p, div, ul').text();
          requirements.essays.push({
            heading: $(elem).text(),
            content: content.substring(0, 500)
          });
        }
      });
      
      return requirements;
    } catch (error) {
      logger.error('Requirements extraction failed:', error);
      return null;
    }
  }
  
  // Extract deadlines from a page
  extractDeadlines(scrapedData) {
    try {
      const { $, url } = scrapedData;
      const deadlines = [];
      
      // Look for date patterns
      const datePatterns = [
        /(\w+\s+\d{1,2},?\s+\d{4})/gi,
        /(\d{1,2}\/\d{1,2}\/\d{4})/gi,
        /(\d{4}-\d{2}-\d{2})/gi
      ];
      
      $('body').find('*').each((i, elem) => {
        const text = $(elem).text();
        
        // Check for deadline keywords nearby
        if (text.match(/(deadline|due|application|submit|early|regular)/i)) {
          datePatterns.forEach(pattern => {
            const matches = text.match(pattern);
            if (matches) {
              matches.forEach(dateStr => {
                // Try to parse date
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                  deadlines.push({
                    date: date.toISOString(),
                    context: text.substring(0, 200),
                    type: this._inferDeadlineType(text)
                  });
                }
              });
            }
          });
        }
      });
      
      // Remove duplicates
      const unique = Array.from(new Set(deadlines.map(d => d.date)))
        .map(date => deadlines.find(d => d.date === date));
      
      return unique;
    } catch (error) {
      logger.error('Deadline extraction failed:', error);
      return [];
    }
  }
  
  _inferDeadlineType(text) {
    const lower = text.toLowerCase();
    if (lower.includes('early decision') || lower.includes('ed')) return 'Early Decision';
    if (lower.includes('early action') || lower.includes('ea')) return 'Early Action';
    if (lower.includes('regular decision') || lower.includes('rd')) return 'Regular Decision';
    if (lower.includes('rolling')) return 'Rolling Admission';
    return 'Application Deadline';
  }
}

module.exports = new ScrapingService();