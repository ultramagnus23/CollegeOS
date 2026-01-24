// backend/src/services/intelligentSearch.js
// Intelligent search service with query type detection and context-aware responses

const knowledgeBase = require('../data/knowledgeBase');
const College = require('../models/College');

class IntelligentSearch {
  /**
   * Detect the type of query
   * @param {string} query - User's search query
   * @returns {object} - Query classification
   */
  static detectQueryType(query) {
    const lowerQuery = query.toLowerCase();
    
    // College-specific queries
    if (this.isCollegeQuery(lowerQuery)) {
      return { type: 'college', confidence: 'high' };
    }
    
    // Application process queries
    if (this.isProcessQuery(lowerQuery)) {
      return { type: 'process', confidence: 'high' };
    }
    
    // Requirements queries
    if (this.isRequirementsQuery(lowerQuery)) {
      return { type: 'requirements', confidence: 'high' };
    }
    
    // Educational board queries
    if (this.isBoardQuery(lowerQuery)) {
      return { type: 'board', confidence: 'high' };
    }
    
    // Exam queries
    if (this.isExamQuery(lowerQuery)) {
      return { type: 'exam', confidence: 'high' };
    }
    
    // Default to general search
    return { type: 'general', confidence: 'medium' };
  }
  
  static isCollegeQuery(query) {
    const collegeKeywords = ['university', 'college', 'mit', 'stanford', 'harvard', 'oxford', 'cambridge', 'tu delft', 'uva', 'iit', 'delhi university', 'du'];
    return collegeKeywords.some(keyword => query.includes(keyword));
  }
  
  static isProcessQuery(query) {
    const processKeywords = ['how to apply', 'application process', 'studielink', 'ucas', 'common app', 'numerus fixus', 'deadline', 'apply to'];
    return processKeywords.some(keyword => query.includes(keyword));
  }
  
  static isRequirementsQuery(query) {
    const reqKeywords = ['requirements', 'minimum', 'eligibility', 'need', 'required', 'admission criteria'];
    return reqKeywords.some(keyword => query.includes(keyword));
  }
  
  static isBoardQuery(query) {
    const boardKeywords = ['cbse', 'ib', 'igcse', 'isc', 'icse', 'a-level', 'board', 'grade'];
    return boardKeywords.some(keyword => query.includes(keyword));
  }
  
  static isExamQuery(query) {
    const examKeywords = ['jee', 'cuet', 'sat', 'act', 'ielts', 'toefl', 'duolingo', 'exam', 'test'];
    return examKeywords.some(keyword => query.includes(keyword));
  }
  
  /**
   * Main intelligent search function
   * @param {string} query - User's search query
   * @param {object} context - Additional context (user profile, filters, etc.)
   * @returns {object} - Comprehensive response with data and explanations
   */
  static async search(query, context = {}) {
    // Input validation
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        type: 'error',
        error: 'Query must be a non-empty string',
        suggestion: 'Please provide a valid search query'
      };
    }
    
    const queryType = this.detectQueryType(query);
    
    switch (queryType.type) {
      case 'college':
        return await this.handleCollegeQuery(query, context);
      
      case 'process':
        return this.handleProcessQuery(query, context);
      
      case 'requirements':
        return await this.handleRequirementsQuery(query, context);
      
      case 'board':
        return this.handleBoardQuery(query, context);
      
      case 'exam':
        return this.handleExamQuery(query, context);
      
      case 'general':
      default:
        return await this.handleGeneralQuery(query, context);
    }
  }
  
  /**
   * Handle college-specific queries
   */
  static async handleCollegeQuery(query, context) {
    // Extract college name or search term
    const colleges = await College.search(query, context.filters || {});
    
    // Get relevant knowledge base info
    const country = this.extractCountry(query);
    const applicationProcess = country ? knowledgeBase.applicationProcesses[country] : null;
    
    return {
      type: 'college',
      colleges: colleges,
      totalResults: colleges.length,
      applicationInfo: applicationProcess,
      relatedInfo: this.getRelatedInfo(query, 'college')
    };
  }
  
  /**
   * Handle application process queries
   */
  static handleProcessQuery(query, context) {
    const lowerQuery = query.toLowerCase();
    let processInfo = null;
    let explanation = '';
    
    // Studielink queries
    if (lowerQuery.includes('studielink')) {
      processInfo = knowledgeBase.applicationProcesses.Netherlands?.studielink;
      explanation = 'Studielink is the central application portal for all Dutch universities.';
    }
    
    // Numerus Fixus queries
    if (lowerQuery.includes('numerus fixus')) {
      processInfo = knowledgeBase.applicationProcesses.Netherlands?.studielink?.numerus_fixus;
      explanation = 'Numerus Fixus programs have limited enrollment in the Netherlands. Admission is through weighted lottery or selection.';
    }
    
    // UCAS queries
    if (lowerQuery.includes('ucas')) {
      processInfo = knowledgeBase.applicationProcesses.UK?.ucas;
      explanation = 'UCAS is the centralized application service for all UK universities.';
    }
    
    // Common App queries
    if (lowerQuery.includes('common app')) {
      processInfo = knowledgeBase.applicationProcesses.US?.common_app;
      explanation = 'The Common Application is used by 900+ US colleges for undergraduate admissions.';
    }
    
    // General "how to apply" queries
    if (lowerQuery.includes('how to apply')) {
      const country = this.extractCountry(query);
      if (country) {
        processInfo = knowledgeBase.applicationProcesses[country];
        explanation = `Application process for ${country} universities.`;
      }
    }
    
    return {
      type: 'process',
      processInfo: processInfo,
      explanation: explanation,
      relatedInfo: this.getRelatedInfo(query, 'process')
    };
  }
  
  /**
   * Handle requirements queries
   */
  static async handleRequirementsQuery(query, context) {
    const board = this.extractBoard(query);
    const country = this.extractCountry(query);
    const exam = this.extractExam(query);
    
    let response = {
      type: 'requirements',
      boardInfo: null,
      languageRequirements: null,
      countrySpecific: null,
      colleges: []
    };
    
    // Board-specific requirements
    if (board) {
      response.boardInfo = knowledgeBase.educationalSystems[board];
    }
    
    // Language exam requirements
    if (exam && (exam === 'IELTS' || exam === 'TOEFL')) {
      response.languageRequirements = knowledgeBase.entranceExams[exam];
    }
    
    // Country-specific requirements
    if (country) {
      response.countrySpecific = knowledgeBase.countryInfo?.[country];
    }
    
    // Search for colleges matching the criteria
    if (country || board) {
      const searchFilters = {};
      if (country) searchFilters.country = country;
      response.colleges = await College.search(query, searchFilters);
    }
    
    return response;
  }
  
  /**
   * Handle educational board queries
   */
  static handleBoardQuery(query, context) {
    const board = this.extractBoard(query);
    
    if (board) {
      return {
        type: 'board',
        boardInfo: knowledgeBase.educationalSystems[board],
        explanation: `Information about ${board} educational system`,
        relatedInfo: this.getRelatedInfo(query, 'board')
      };
    }
    
    // Return all boards if no specific board mentioned
    return {
      type: 'board',
      boards: knowledgeBase.educationalSystems,
      explanation: 'Overview of educational systems'
    };
  }
  
  /**
   * Handle exam queries
   */
  static handleExamQuery(query, context) {
    const exam = this.extractExam(query);
    
    if (exam) {
      return {
        type: 'exam',
        examInfo: knowledgeBase.entranceExams[exam],
        explanation: `Information about ${exam} exam`,
        relatedInfo: this.getRelatedInfo(query, 'exam')
      };
    }
    
    // Return all exams if no specific exam mentioned
    return {
      type: 'exam',
      exams: knowledgeBase.entranceExams,
      explanation: 'Overview of entrance exams'
    };
  }
  
  /**
   * Handle general queries
   * Layer 3: Attempts broader search when specific query types don't match
   */
  static async handleGeneralQuery(query, context) {
    // Perform broad search across colleges with higher limit for better results
    const colleges = await College.search(query, context.filters || { limit: 100 });
    
    // Add helpful suggestions based on query content
    let suggestion = 'Try being more specific about what you\'re looking for';
    const lowerQuery = query.toLowerCase();
    
    if (colleges.length === 0) {
      if (lowerQuery.includes('university') || lowerQuery.includes('college')) {
        suggestion = 'No results in database. Try searching by location (e.g., "US universities") or field of study (e.g., "engineering programs"). You can also add colleges manually if they\'re not in our database.';
      } else {
        suggestion = 'No results found in database. Try using different keywords, check spelling, or add the college manually if it\'s not in our system.';
      }
    } else if (colleges.length > 50) {
      suggestion = 'Many results found. Add filters like country or program to narrow down your search.';
    }
    
    return {
      type: 'general',
      colleges: colleges,
      totalResults: colleges.length,
      suggestion: suggestion,
      query: query,
      note: colleges.length === 0 ? 
        'No colleges found in database. You can add colleges manually using the "Add College" feature in the Colleges page.' : 
        undefined
    };
  }
  
  /**
   * Extract country from query
   */
  static extractCountry(query) {
    const lowerQuery = query.toLowerCase();
    const countryMap = {
      'us': 'US',
      'usa': 'US',
      'united states': 'US',
      'america': 'US',
      'uk': 'UK',
      'united kingdom': 'UK',
      'britain': 'UK',
      'england': 'UK',
      'canada': 'Canada',
      'netherlands': 'Netherlands',
      'holland': 'Netherlands',
      'dutch': 'Netherlands',
      'australia': 'Australia',
      'germany': 'Germany',
      'india': 'India'
    };
    
    for (const [keyword, country] of Object.entries(countryMap)) {
      if (lowerQuery.includes(keyword)) {
        return country;
      }
    }
    return null;
  }
  
  /**
   * Extract educational board from query
   */
  static extractBoard(query) {
    const lowerQuery = query.toLowerCase();
    const boards = ['CBSE', 'IB', 'IGCSE', 'ISC', 'A-Levels'];
    
    for (const board of boards) {
      if (lowerQuery.includes(board.toLowerCase())) {
        return board;
      }
    }
    return null;
  }
  
  /**
   * Extract exam name from query
   */
  static extractExam(query) {
    const lowerQuery = query.toLowerCase();
    const exams = ['JEE', 'CUET', 'SAT', 'ACT', 'IELTS', 'TOEFL', 'Duolingo'];
    
    for (const exam of exams) {
      if (lowerQuery.includes(exam.toLowerCase())) {
        return exam;
      }
    }
    return null;
  }
  
  /**
   * Get related information based on query context
   */
  static getRelatedInfo(query, queryType) {
    const relatedInfo = [];
    
    // Add contextual suggestions
    switch (queryType) {
      case 'college':
        relatedInfo.push({
          title: 'Application Process',
          description: 'Learn about how to apply to this college'
        });
        relatedInfo.push({
          title: 'Requirements',
          description: 'Check admission requirements for your educational background'
        });
        break;
      
      case 'process':
        relatedInfo.push({
          title: 'Deadlines',
          description: 'Important application deadlines'
        });
        relatedInfo.push({
          title: 'Required Documents',
          description: 'What documents you need to prepare'
        });
        break;
      
      case 'requirements':
        relatedInfo.push({
          title: 'Language Tests',
          description: 'IELTS/TOEFL requirements and preparation'
        });
        break;
    }
    
    return relatedInfo;
  }
}

module.exports = IntelligentSearch;
