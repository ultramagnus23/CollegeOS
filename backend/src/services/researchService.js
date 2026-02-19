const crypto = require('crypto');
const dbManager = require('../config/database');
const scrapingService = require('./scrappingService');
const College = require('../models/College');
const logger = require('../utils/logger');
const config = require('../config/env');

class ResearchService {
  // Main on-demand research endpoint
  async conductResearch(collegeId, researchType, options = {}) {
    try {
      const college = College.findById(collegeId);
      if (!college) {
        throw new Error('College not found');
      }
      
      // Generate cache key
      const queryHash = this._generateQueryHash(collegeId, researchType);
      
      // Check cache first (unless force refresh)
      if (!options.forceRefresh) {
        const cached = this._getCachedResearch(queryHash);
        if (cached) {
          logger.info(`Cache hit for research: ${college.name} - ${researchType}`);
          return cached;
        }
      }
      
      logger.info(`Starting on-demand research: ${college.name} - ${researchType}`);
      
      // Conduct research based on type
      let result;
      switch (researchType) {
        case 'requirements':
          result = await this._researchRequirements(college);
          break;
        case 'deadlines':
          result = await this._researchDeadlines(college);
          break;
        case 'programs':
          result = await this._researchPrograms(college);
          break;
        case 'admission_stats':
          result = await this._researchAdmissionStats(college);
          break;
        default:
          throw new Error(`Unknown research type: ${researchType}`);
      }
      
      // Store in cache with TTL
      this._cacheResearch(queryHash, collegeId, researchType, result);
      
      return result;
    } catch (error) {
      logger.error('Research failed:', error);
      throw error;
    }
  }
  
  // Research entry requirements
  async _researchRequirements(college) {
    const sources = [];
    const requirements = {
      gpa: null,
      testScores: {},
      languageRequirements: {},
      essays: [],
      recommendations: null,
      found: false
    };
    
    // Try official admissions page first
    if (college.admissions_url) {
      const scraped = await scrapingService.scrape(college.admissions_url);
      if (scraped.success) {
        sources.push({
          url: college.admissions_url,
          trustTier: scraped.trustTier,
          scrapedAt: scraped.scrapedAt
        });
        
        const extracted = scrapingService.extractRequirements(scraped);
        if (extracted) {
          Object.assign(requirements, extracted);
          requirements.found = true;
        }
      }
    }
    
    // Try official website
    if (!requirements.found && college.official_website) {
      const scraped = await scrapingService.scrape(college.official_website);
      if (scraped.success) {
        sources.push({
          url: college.official_website,
          trustTier: scraped.trustTier,
          scrapedAt: scraped.scrapedAt
        });
        
        const extracted = scrapingService.extractRequirements(scraped);
        if (extracted) {
          Object.assign(requirements, extracted);
          requirements.found = true;
        }
      }
    }
    
    return {
      data: requirements,
      sources,
      message: requirements.found 
        ? 'Requirements found from official sources'
        : 'No requirement data found. Please visit the official website.',
      officialWebsite: college.official_website,
      trustTier: sources.length > 0 ? sources[0].trustTier : null
    };
  }
  
  // Research application deadlines
  async _researchDeadlines(college) {
    const sources = [];
    const deadlines = [];
    
    // Try admissions page
    if (college.admissions_url) {
      const scraped = await scrapingService.scrape(college.admissions_url);
      if (scraped.success) {
        sources.push({
          url: college.admissions_url,
          trustTier: scraped.trustTier,
          scrapedAt: scraped.scrapedAt
        });
        
        const extracted = scrapingService.extractDeadlines(scraped);
        deadlines.push(...extracted);
      }
    }
    
    return {
      data: deadlines,
      sources,
      message: deadlines.length > 0
        ? `Found ${deadlines.length} deadline(s)`
        : 'No deadlines found. Please check the official website.',
      officialWebsite: college.official_website,
      trustTier: sources.length > 0 ? sources[0].trustTier : null
    };
  }
  
  // Research specific programs
  async _researchPrograms(college) {
    const sources = [];
    const programs = [];
    
    if (college.programs_url) {
      const scraped = await scrapingService.scrape(college.programs_url);
      if (scraped.success) {
        sources.push({
          url: college.programs_url,
          trustTier: scraped.trustTier,
          scrapedAt: scraped.scrapedAt
        });
        
        // Extract program information
        const { $ } = scraped;
        
        $('h2, h3, h4').each((i, elem) => {
          const text = $(elem).text();
          if (text.match(/(program|major|degree|bachelor|master|phd)/i)) {
            programs.push({
              name: text,
              description: $(elem).next('p').text().substring(0, 300)
            });
          }
        });
      }
    }
    
    return {
      data: programs,
      sources,
      message: programs.length > 0
        ? `Found ${programs.length} program(s)`
        : 'No program data found. Please visit the official website.',
      officialWebsite: college.official_website,
      trustTier: sources.length > 0 ? sources[0].trustTier : null
    };
  }
  
  // Research admission statistics
  async _researchAdmissionStats(college) {
    // This would typically scrape secondary sources like Niche, US News
    // For now, return placeholder
    return {
      data: null,
      sources: [],
      message: 'Admission statistics research not yet implemented. Check College Board or Niche.',
      officialWebsite: college.official_website,
      trustTier: null
    };
  }
  
  // Generate cache key
  _generateQueryHash(collegeId, researchType) {
    const str = `${collegeId}-${researchType}`;
    return crypto.createHash('md5').update(str).digest('hex');
  }
  
  // Get cached research
  _getCachedResearch(queryHash) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM research_cache
      WHERE query_hash = ? AND expires_at > datetime('now')
    `);
    
    const cached = stmt.get(queryHash);
    if (!cached) return null;
    
    return {
      data: JSON.parse(cached.data_content),
      sources: JSON.parse(cached.source_urls || '[]'),
      cached: true,
      cachedAt: cached.created_at,
      expiresAt: cached.expires_at
    };
  }
  
  // Store research in cache
  _cacheResearch(queryHash, collegeId, researchType, result) {
    const db = dbManager.getDatabase();
    
    // Calculate expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.scraping.cacheTtlHours);
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO research_cache 
      (query_hash, college_id, research_type, data_content, source_urls, trust_tier, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      queryHash,
      collegeId,
      researchType,
      JSON.stringify(result.data),
      JSON.stringify(result.sources),
      result.trustTier,
      expiresAt.toISOString()
    );
    
    logger.info(`Cached research: ${queryHash}`);
  }
}

module.exports = new ResearchService();