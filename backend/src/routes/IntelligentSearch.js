// backend/src/routes/intelligentSearch.js
// 3-Layer Search Protocol:
// Layer 1: Search YOUR database
// Layer 2: Scrape university websites
// Layer 3: General web search

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const cheerio = require('cheerio'); // npm install cheerio

/**
 * 3-LAYER INTELLIGENT SEARCH
 * POST /api/intelligent-search
 */
router.post('/', async (req, res) => {
  try {
    const { query, filters = {} } = req.body;
    
    console.log('🔍 Starting 3-layer search for:', query);
    
    // LAYER 1: Search YOUR database first
    console.log('📊 Layer 1: Searching local database...');
    const layer1Results = await searchLocalDatabase(query, filters);
    
    if (layer1Results.length > 0) {
      console.log(`✅ Layer 1: Found ${layer1Results.length} results in database`);
      
      // Save search query and results to database for indexing
      await indexSearch(query, layer1Results, 'database');
      
      return res.json({
        success: true,
        layer: 1,
        source: 'database',
        results: layer1Results,
        total: layer1Results.length
      });
    }
    
    // LAYER 2: Scrape specific university websites
    console.log('🌐 Layer 2: No database results, scraping university sites...');
    const layer2Results = await scrapeUniversityWebsites(query);
    
    if (layer2Results.length > 0) {
      console.log(`✅ Layer 2: Found ${layer2Results.length} results from university sites`);
      
      // Save to database for future searches
      await saveScrapedColleges(layer2Results);
      await indexSearch(query, layer2Results, 'university_scrape');
      
      return res.json({
        success: true,
        layer: 2,
        source: 'university_websites',
        results: layer2Results,
        total: layer2Results.length
      });
    }
    
    // LAYER 3: General web crawl
    console.log('🌍 Layer 3: Still nothing, doing general web search...');
    const layer3Results = await generalWebSearch(query);
    
    console.log(`✅ Layer 3: Found ${layer3Results.length} results from web`);
    
    // Categorize and save the information
    const categorized = await categorizeInformation(layer3Results);
    await indexSearch(query, categorized, 'web_search');
    
    res.json({
      success: true,
      layer: 3,
      source: 'web_search',
      results: categorized,
      total: categorized.length
    });
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed',
      error: error.message
    });
  }
});

/**
 * LAYER 1: Search local database
 */
async function searchLocalDatabase(query, filters) {
  return new Promise((resolve, reject) => {
    let sql = `
      SELECT * FROM colleges 
      WHERE (
        LOWER(name) LIKE LOWER(?) OR
        LOWER(location) LIKE LOWER(?) OR
        LOWER(programs) LIKE LOWER(?) OR
        LOWER(description) LIKE LOWER(?)
      )
    `;
    
    const params = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];
    
    // Apply filters
    if (filters.country) {
      sql += ` AND country = ?`;
      params.push(filters.country);
    }
    
    if (filters.min_rate) {
      sql += ` AND acceptance_rate >= ?`;
      params.push(parseFloat(filters.min_rate));
    }
    
    if (filters.max_rate) {
      sql += ` AND acceptance_rate <= ?`;
      params.push(parseFloat(filters.max_rate));
    }
    
    sql += ` LIMIT 20`;
    
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else {
        // Parse JSON fields
        const formatted = rows.map(row => ({
          ...row,
          programs: JSON.parse(row.programs || '[]'),
          requirements: JSON.parse(row.requirements || '{}'),
          research_data: JSON.parse(row.research_data || '{}')
        }));
        resolve(formatted);
      }
    });
  });
}

/**
 * LAYER 2: Scrape university websites
 * Scrapes official university sites for information
 */
async function scrapeUniversityWebsites(query) {
  const results = [];
  
  // List of major university domains to scrape
  const universityDomains = [
    'mit.edu',
    'stanford.edu',
    'harvard.edu',
    'berkeley.edu',
    'ox.ac.uk',
    'cam.ac.uk',
    'utoronto.ca',
    'ubc.ca'
  ];
  
  // Search for universities that match the query
  const searchTerms = query.toLowerCase().split(' ');
  
  for (const domain of universityDomains) {
    try {
      // Check if query matches this university
      if (searchTerms.some(term => domain.includes(term))) {
        const data = await scrapeUniversitySite(domain, query);
        if (data) results.push(data);
      }
    } catch (error) {
      console.error(`Failed to scrape ${domain}:`, error.message);
    }
  }
  
  return results;
}

/**
 * Scrape individual university site
 */
async function scrapeUniversitySite(domain, query) {
  try {
    // Use a free proxy or direct fetch
    const response = await fetch(`https://${domain}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Extract basic information
    const name = $('title').text().split('|')[0].trim() || domain.split('.')[0];
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') ||
                       'Information extracted from university website';
    
    // Try to find programs mentioned
    const bodyText = $('body').text().toLowerCase();
    const programs = [];
    const programKeywords = ['computer science', 'engineering', 'business', 'medicine', 'law'];
    programKeywords.forEach(prog => {
      if (bodyText.includes(prog)) programs.push(prog);
    });
    
    return {
      name: name,
      country: domain.includes('.uk') ? 'UK' : domain.includes('.ca') ? 'Canada' : 'US',
      location: 'Extracted from website',
      website_url: `https://${domain}`,
      description: description.substring(0, 200),
      programs: programs.length > 0 ? programs : ['Multiple programs'],
      source: 'university_website',
      scraped_at: new Date().toISOString()
    };
    
  } catch (error) {
    console.error(`Error scraping ${domain}:`, error.message);
    return null;
  }
}

/**
 * LAYER 3: General web search
 * Uses DuckDuckGo or SerpAPI for general search
 */
async function generalWebSearch(query) {
  try {
    // Use DuckDuckGo's free API
    const searchQuery = `${query} university college admission`;
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&format=json`
    );
    
    const data = await response.json();
    const results = [];
    
    // Parse DuckDuckGo results
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 10)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.substring(0, 100),
            url: topic.FirstURL,
            snippet: topic.Text,
            source: 'web_search'
          });
        }
      }
    }
    
    // If no results, try abstract
    if (results.length === 0 && data.Abstract) {
      results.push({
        title: data.Heading || query,
        snippet: data.Abstract,
        url: data.AbstractURL || '',
        source: 'web_search'
      });
    }
    
    return results;
    
  } catch (error) {
    console.error('General web search error:', error);
    return [];
  }
}

/**
 * Categorize information from web search
 */
async function categorizeInformation(results) {
  const categorized = results.map(result => {
    const text = (result.title + ' ' + result.snippet).toLowerCase();
    
    // Determine category
    let category = 'general';
    if (text.includes('admission') || text.includes('apply')) {
      category = 'admissions';
    } else if (text.includes('program') || text.includes('major')) {
      category = 'programs';
    } else if (text.includes('tuition') || text.includes('cost')) {
      category = 'financial';
    } else if (text.includes('deadline')) {
      category = 'deadlines';
    } else if (text.includes('requirement')) {
      category = 'requirements';
    }
    
    return {
      ...result,
      category: category,
      relevance: calculateRelevance(result, query)
    };
  });
  
  // Sort by relevance
  return categorized.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Calculate relevance score
 */
function calculateRelevance(result, query) {
  const text = (result.title + ' ' + result.snippet).toLowerCase();
  const queryTerms = query.toLowerCase().split(' ');
  
  let score = 0;
  queryTerms.forEach(term => {
    const count = (text.match(new RegExp(term, 'g')) || []).length;
    score += count * 10;
  });
  
  return score;
}

/**
 * Save scraped colleges to database
 */
async function saveScrapedColleges(colleges) {
  const insertQuery = `
    INSERT OR IGNORE INTO colleges 
    (name, country, location, website_url, description, programs, requirements, deadline_templates, research_data, acceptance_rate, type, application_portal, logo_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  for (const college of colleges) {
    try {
      await new Promise((resolve, reject) => {
        db.run(insertQuery, [
          college.name,
          college.country || 'Unknown',
          college.location || 'Unknown',
          college.website_url || '',
          college.description || '',
          JSON.stringify(college.programs || []),
          JSON.stringify({}),
          JSON.stringify({}),
          JSON.stringify({}),
          0.5,
          'Public',
          'Direct',
          null
        ], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.error('Failed to save college:', error.message);
    }
  }
}

/**
 * Index search query and results for analytics
 */
async function indexSearch(query, results, source) {
  try {
    // Create searches table if doesn't exist
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS search_index (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          source TEXT NOT NULL,
          results_count INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Insert search record
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO search_index (query, source, results_count) VALUES (?, ?, ?)`,
        [query, source, results.length],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
    
    console.log(`📝 Indexed search: "${query}" from ${source}`);
  } catch (error) {
    console.error('Indexing error:', error);
  }
}

/**
 * Get search analytics
 * GET /api/intelligent-search/analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          source,
          COUNT(*) as total_searches,
          AVG(results_count) as avg_results
        FROM search_index
        GROUP BY source
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const recentSearches = await new Promise((resolve, reject) => {
      db.all(`
        SELECT query, source, results_count, timestamp
        FROM search_index
        ORDER BY timestamp DESC
        LIMIT 20
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    res.json({
      success: true,
      stats: stats,
      recent: recentSearches
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;