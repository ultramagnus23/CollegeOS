const dbManager = require('../config/database');

// Helper to normalize acceptance rate (ensure it's in decimal form 0-1)
function normalizeAcceptanceRate(rate) {
  if (rate === null || rate === undefined) return null;
  // Validate rate is a number
  const numRate = Number(rate);
  if (isNaN(numRate)) return null;
  // If stored as percentage (e.g., 9 for 9%), convert to decimal
  // Use threshold of > 1 to determine if it's percentage form
  // Edge case: 1.0 is 100%, values > 100 are invalid
  if (numRate > 100) {
    console.warn(`Invalid acceptance rate value: ${numRate}. Expected 0-100 or 0-1.`);
    return null;
  }
  if (numRate > 1) {
    return numRate / 100;
  }
  return numRate;
}

// Helper to safely parse JSON
function safeJsonParse(str, defaultValue = []) {
  if (!str) return defaultValue;
  if (typeof str === 'object') return str; // Already parsed
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

class College {
  static create(data) {
    const db = dbManager.getDatabase();
    
    // Check for duplicate before inserting
    const existing = db.prepare(`
      SELECT id FROM colleges 
      WHERE LOWER(name) = LOWER(?) AND LOWER(country) = LOWER(?)
    `).get(data.name, data.country);
    
    if (existing) {
      // Return existing college instead of creating duplicate
      return this.findById(existing.id);
    }
    
    const stmt = db.prepare(`
      INSERT INTO colleges (
        name, country, location, type, official_website, admissions_url, programs_url,
        application_portal_url, programs, major_categories, academic_strengths,
        application_portal, acceptance_rate, requirements, deadline_templates,
        tuition_cost, financial_aid_available, research_data, description, logo_url,
        cbse_requirements, igcse_requirements, ib_requirements, studielink_required,
        numerus_fixus_programs, ucas_code, common_app_id, trust_tier, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    // Normalize acceptance rate before storing (store as decimal 0-1)
    const acceptanceRate = normalizeAcceptanceRate(data.acceptanceRate || data.acceptance_rate);
    
    const result = stmt.run(
      data.name,
      data.country,
      data.location || null,
      data.type || null,
      data.officialWebsite || data.official_website,
      data.admissionsUrl || data.admissions_url || null,
      data.programsUrl || data.programs_url || null,
      data.applicationPortalUrl || data.application_portal_url || null,
      JSON.stringify(data.programs || []),
      JSON.stringify(data.majorCategories || data.major_categories || []),
      JSON.stringify(data.academicStrengths || data.academic_strengths || []),
      data.applicationPortal || data.application_portal || null,
      acceptanceRate,
      JSON.stringify(data.requirements || {}),
      JSON.stringify(data.deadlineTemplates || data.deadline_templates || {}),
      data.tuitionCost || data.tuition_cost || null,
      data.financialAidAvailable || data.financial_aid_available || 0,
      JSON.stringify(data.researchData || data.research_data || {}),
      data.description || null,
      data.logoUrl || data.logo_url || null,
      JSON.stringify(data.cbseRequirements || data.cbse_requirements || {}),
      JSON.stringify(data.igcseRequirements || data.igcse_requirements || {}),
      JSON.stringify(data.ibRequirements || data.ib_requirements || {}),
      data.studielinkRequired || data.studielink_required || 0,
      JSON.stringify(data.numerusFixusPrograms || data.numerus_fixus_programs || null),
      data.ucasCode || data.ucas_code || null,
      data.commonAppId || data.common_app_id || null,
      data.trustTier || data.trust_tier || 'official',
      data.isVerified || data.is_verified || 0
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM colleges WHERE id = ?');
    const college = stmt.get(id);
    
    if (college) {
      // Parse JSON fields safely and normalize data
      college.programs = safeJsonParse(college.programs, []);
      college.academicStrengths = safeJsonParse(college.academic_strengths, []);
      college.majorCategories = safeJsonParse(college.major_categories, []);
      college.requirements = safeJsonParse(college.requirements, {});
      college.deadlineTemplates = safeJsonParse(college.deadline_templates, {});
      college.researchData = safeJsonParse(college.research_data, {});
      college.cbseRequirements = safeJsonParse(college.cbse_requirements, {});
      college.igcseRequirements = safeJsonParse(college.igcse_requirements, {});
      college.ibRequirements = safeJsonParse(college.ib_requirements, {});
      if (college.numerus_fixus_programs) {
        college.numerusFixusPrograms = safeJsonParse(college.numerus_fixus_programs, null);
      }
      
      // Normalize acceptance rate (ensure it's in decimal form 0-1)
      college.acceptanceRate = normalizeAcceptanceRate(college.acceptance_rate);
      college.acceptance_rate = college.acceptanceRate;
      
      // Extract rich data from research_data for frontend display
      const researchData = college.researchData || {};
      
      // Enrollment
      college.enrollment = researchData.enrollment || null;
      
      // Test Scores
      const reqs = college.requirements || {};
      college.testScores = {
        satRange: reqs.satRange || null,
        actRange: reqs.actRange || null,
        averageGPA: reqs.averageGPA || null
      };
      
      // Graduation Rates
      college.graduationRates = researchData.graduationRates || null;
      
      // Student Faculty Ratio
      college.studentFacultyRatio = researchData.studentFacultyRatio || null;
      
      // Rankings
      college.ranking = researchData.rank || researchData.nirfRank || researchData.qsRank || null;
      college.tier = researchData.tier || null;
      
      // Indian-specific: placements, cutoffs
      if (college.country === 'India') {
        college.placements = researchData.placements || null;
        college.cutoffs = reqs.cutoffs || null;
        college.entranceExam = reqs.entranceExam || null;
        college.nirfRank = researchData.nirfRank || null;
      }
      
      // UK-specific: Russell Group, A-levels, IB
      if (college.country === 'United Kingdom') {
        college.russellGroup = researchData.russellGroup || false;
        college.aLevelRequirements = reqs.aLevels || null;
        college.ibPointsRequired = reqs.ibPoints || null;
        college.qsRank = researchData.qsRank || null;
      }
      
      // Germany-specific
      if (college.country === 'Germany') {
        college.abiturRequirement = reqs.abitur || null;
        college.germanLevel = reqs.germanLevel || null;
        college.englishLevel = reqs.englishLevel || null;
      }
    }
    
    return college;
  }
  
  static findAll(filters = {}) {
    const db = dbManager.getDatabase();
    // Use GROUP BY to deduplicate results (Issue 1)
    let query = 'SELECT * FROM colleges WHERE 1=1';
    const params = [];
    
    if (filters.country) {
      query += ' AND country = ?';
      params.push(filters.country);
    }
    
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters.search) {
      query += ' AND name LIKE ?';
      params.push(`%${filters.search}%`);
    }
    
    if (filters.applicationPortal) {
      query += ' AND application_portal = ?';
      params.push(filters.applicationPortal);
    }
    
    // Add GROUP BY to deduplicate (pick first by name+country)
    query += ' GROUP BY LOWER(name), LOWER(country)';
    query += ' ORDER BY name ASC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
    
    const stmt = db.prepare(query);
    const colleges = stmt.all(...params);
    
    return colleges.map(college => {
      const programs = safeJsonParse(college.programs, []);
      const researchData = safeJsonParse(college.research_data, {});
      const requirements = safeJsonParse(college.requirements, {});
      const acceptanceRate = normalizeAcceptanceRate(college.acceptance_rate);
      
      return {
        ...college,
        programs,
        academicStrengths: safeJsonParse(college.academic_strengths, []),
        majorCategories: safeJsonParse(college.major_categories, []),
        requirements,
        deadlineTemplates: safeJsonParse(college.deadline_templates, {}),
        researchData,
        acceptanceRate,
        acceptance_rate: acceptanceRate,
        // Rich data for cards
        enrollment: researchData.enrollment || null,
        ranking: researchData.rank || researchData.nirfRank || researchData.qsRank || null,
        averageGPA: requirements.averageGPA || null,
        testScores: {
          satRange: requirements.satRange || null,
          actRange: requirements.actRange || null
        },
        graduationRates: researchData.graduationRates || null,
        studentFacultyRatio: researchData.studentFacultyRatio || null
      };
    });
  }
  
  static search(searchTerm, filters = {}) {
    const db = dbManager.getDatabase();
    
    // Keyword synonyms for intelligent search (Issue 6)
    const synonyms = {
      'tech': ['technology', 'technical', 'institute of technology', 'polytechnic'],
      'engineering': ['engineer', 'engineering', 'tech', 'technical'],
      'business': ['business', 'commerce', 'management', 'mba'],
      'medical': ['medicine', 'medical', 'health', 'hospital'],
      'law': ['law', 'legal', 'jurisprudence'],
      'arts': ['art', 'arts', 'liberal arts', 'humanities'],
      'science': ['science', 'sciences', 'stem'],
      'cs': ['computer science', 'computing', 'information technology'],
      'it': ['information technology', 'computer', 'computing']
    };
    
    // Build search patterns including synonyms
    const searchTermLower = searchTerm.toLowerCase().trim();
    const searchWords = searchTermLower.split(/\s+/);
    const searchPatterns = new Set([`%${searchTerm}%`]);
    
    // Add synonyms to search if applicable (using word boundary matching)
    for (const [key, values] of Object.entries(synonyms)) {
      // Check if any word in search matches the synonym key exactly
      if (searchWords.includes(key)) {
        values.forEach(synonym => {
          searchPatterns.add(`%${synonym}%`);
        });
      }
    }
    
    // Limit number of patterns to avoid performance issues
    const patternsArray = Array.from(searchPatterns).slice(0, 5);
    
    // Build query with multiple search patterns
    let query = `
      SELECT * FROM colleges 
      WHERE (
    `;
    const params = [];
    
    // Add search conditions for each pattern
    const patternConditions = patternsArray.map((pattern, idx) => {
      params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
      return `(
        name LIKE ?
        OR location LIKE ?
        OR country LIKE ?
        OR major_categories LIKE ?
        OR academic_strengths LIKE ?
        OR programs LIKE ?
        OR description LIKE ?
      )`;
    });
    
    query += patternConditions.join(' OR ');
    query += ')';
    
    if (filters.country) {
      query += ' AND country = ?';
      params.push(filters.country);
    }
    
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    if (filters.applicationPortal) {
      query += ' AND application_portal = ?';
      params.push(filters.applicationPortal);
    }
    
    if (filters.maxTuition) {
      query += ' AND tuition_cost <= ?';
      params.push(filters.maxTuition);
    }
    
    // Search in major categories more precisely
    if (filters.program) {
      query += ' AND (major_categories LIKE ? OR programs LIKE ?)';
      params.push(`%"${filters.program}"%`, `%"${filters.program}"%`);
    }
    
    // Deduplicate results (Issue 1)
    query += ' GROUP BY LOWER(name), LOWER(country)';
    query += ' ORDER BY acceptance_rate ASC, name ASC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = db.prepare(query);
    const colleges = stmt.all(...params);
    
    return colleges.map(college => {
      const programs = safeJsonParse(college.programs, []);
      const researchData = safeJsonParse(college.research_data, {});
      const requirements = safeJsonParse(college.requirements, {});
      const acceptanceRate = normalizeAcceptanceRate(college.acceptance_rate);
      
      return {
        ...college,
        programs,
        academicStrengths: safeJsonParse(college.academic_strengths, []),
        majorCategories: safeJsonParse(college.major_categories, []),
        requirements,
        deadlineTemplates: safeJsonParse(college.deadline_templates, {}),
        researchData,
        acceptanceRate,
        acceptance_rate: acceptanceRate,
        // Rich data for cards
        enrollment: researchData.enrollment || null,
        ranking: researchData.rank || researchData.nirfRank || researchData.qsRank || null,
        averageGPA: requirements.averageGPA || null,
        testScores: {
          satRange: requirements.satRange || null,
          actRange: requirements.actRange || null
        },
        graduationRates: researchData.graduationRates || null,
        studentFacultyRatio: researchData.studentFacultyRatio || null
      };
    });
  }
  
  // Browse by major (Issue 7)
  static findByMajor(majorName, filters = {}) {
    const db = dbManager.getDatabase();
    const searchPattern = `%${majorName}%`;
    
    let query = `
      SELECT * FROM colleges 
      WHERE (
        major_categories LIKE ? 
        OR programs LIKE ?
        OR academic_strengths LIKE ?
      )
    `;
    const params = [searchPattern, searchPattern, searchPattern];
    
    if (filters.country) {
      query += ' AND country = ?';
      params.push(filters.country);
    }
    
    // Deduplicate
    query += ' GROUP BY LOWER(name), LOWER(country)';
    query += ' ORDER BY acceptance_rate ASC, name ASC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
    
    const stmt = db.prepare(query);
    const colleges = stmt.all(...params);
    
    return colleges.map(college => ({
      ...college,
      programs: safeJsonParse(college.programs, []),
      academicStrengths: safeJsonParse(college.academic_strengths, []),
      majorCategories: safeJsonParse(college.major_categories, []),
      acceptanceRate: normalizeAcceptanceRate(college.acceptance_rate),
      acceptance_rate: normalizeAcceptanceRate(college.acceptance_rate)
    }));
  }
  
  // Get all unique majors with counts (Issue 7)
  static getMajorsWithCounts() {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT major_categories, programs FROM colleges WHERE major_categories IS NOT NULL OR programs IS NOT NULL');
    const rows = stmt.all();
    
    const majorCounts = {};
    
    rows.forEach(row => {
      const categories = safeJsonParse(row.major_categories, []);
      const programs = safeJsonParse(row.programs, []);
      
      [...categories, ...programs].forEach(major => {
        if (major && typeof major === 'string') {
          majorCounts[major] = (majorCounts[major] || 0) + 1;
        }
      });
    });
    
    // Convert to array sorted by count
    return Object.entries(majorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }
  
  // Get total count of colleges (for pagination)
  static getCount(filters = {}) {
    const db = dbManager.getDatabase();
    // Use delimiter to avoid collision (e.g., "New" + "York" vs "NewY" + "ork")
    let query = "SELECT COUNT(DISTINCT LOWER(name) || '|' || LOWER(country)) as count FROM colleges WHERE 1=1";
    const params = [];
    
    if (filters.country) {
      query += ' AND country = ?';
      params.push(filters.country);
    }
    
    if (filters.type) {
      query += ' AND type = ?';
      params.push(filters.type);
    }
    
    const stmt = db.prepare(query);
    const result = stmt.get(...params);
    return result.count;
  }
}

module.exports = College;