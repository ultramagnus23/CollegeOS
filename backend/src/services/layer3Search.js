// Layer 3 Search Service
// Performs external web search when database results are insufficient

const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class Layer3Search {
  constructor() {
    this.userAgent = 'CollegeAppBot/1.0';
  }

  /**
   * Search DuckDuckGo HTML (no API key needed)
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results to return
   */
  async searchDuckDuckGo(query, maxResults = 10) {
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' university college')}`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const results = [];

      $('.result').each((i, elem) => {
        if (results.length >= maxResults) return false;

        const title = $(elem).find('.result__title').text().trim();
        const snippet = $(elem).find('.result__snippet').text().trim();
        const url = $(elem).find('.result__url').text().trim();

        if (title && url) {
          // Try to extract college name from title
          const collegeName = this.extractCollegeName(title);
          
          results.push({
            name: collegeName || title,
            description: snippet,
            url: url.startsWith('http') ? url : `https://${url}`,
            source: 'DuckDuckGo',
            layer: 3,
            trustTier: 'web_search'
          });
        }
      });

      logger.info(`Layer 3 search found ${results.length} results for: ${query}`);
      return results;

    } catch (error) {
      logger.error(`Layer 3 DuckDuckGo search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract college/university name from search result title
   */
  extractCollegeName(title) {
    // Remove common suffixes and clean up
    let name = title
      .replace(/\s*-\s*Official.*$/i, '')
      .replace(/\s*\|.*$/i, '')
      .replace(/\s*–.*$/i, '')
      .replace(/\s*Home\s*$/i, '')
      .trim();

    return name;
  }

  /**
   * Search Bing (requires API key)
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum results
   */
  async searchBing(query, maxResults = 10) {
    const apiKey = process.env.BING_SEARCH_API_KEY;
    
    if (!apiKey) {
      logger.warn('Bing API key not configured, skipping Bing search');
      return [];
    }

    try {
      const response = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
        params: {
          q: query + ' university college',
          count: maxResults
        },
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey
        },
        timeout: 10000
      });

      const results = response.data.webPages?.value?.map(result => ({
        name: this.extractCollegeName(result.name),
        description: result.snippet,
        url: result.url,
        source: 'Bing',
        layer: 3,
        trustTier: 'web_search'
      })) || [];

      logger.info(`Layer 3 Bing search found ${results.length} results for: ${query}`);
      return results;

    } catch (error) {
      logger.error(`Layer 3 Bing search failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Main Layer 3 search - tries multiple sources
   * @param {string} query - Search query
   * @param {object} options - Search options
   */
  async search(query, options = {}) {
    const maxResults = options.maxResults || 10;
    
    logger.info(`Starting Layer 3 search for: ${query}`);
    
    // Try Bing first (if API key available), then DuckDuckGo
    let results = [];
    
    if (process.env.BING_SEARCH_API_KEY) {
      results = await this.searchBing(query, maxResults);
    }
    
    // If Bing didn't work or not configured, use DuckDuckGo
    if (results.length === 0) {
      results = await this.searchDuckDuckGo(query, maxResults);
    }
    
    return {
      success: results.length > 0,
      layer: 3,
      source: results.length > 0 ? results[0].source : 'none',
      query: query,
      totalResults: results.length,
      results: results,
      message: results.length > 0 
        ? `Found ${results.length} results from web search`
        : 'No results found from web search. Try different keywords or add the college manually.'
    };
  }
}

// Export singleton instance
const layer3Search = new Layer3Search();
module.exports = layer3Search;
