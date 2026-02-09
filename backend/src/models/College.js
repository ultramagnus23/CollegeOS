const dbManager = require('../config/database');

// Pagination constants
const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

// Helper to normalize acceptance rate (ensure it's in decimal form 0-1)
function normalizeAcceptanceRate(rate) {
  if (rate === null || rate === undefined) return null;
  const numRate = Number(rate);
  if (isNaN(numRate)) return null;
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
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

// Get country-specific requirements
function getCountryRequirements(country) {
  const countryLower = (country || '').toLowerCase();
  
  if (countryLower === 'united states' || countryLower === 'usa' || countryLower === 'us') {
    return {
      applicationType: 'Common App / Coalition App',
      applicationComponents: [
        'Common Application',
        'Application fee ($75-90)',
        'High school transcript',
        'Counselor recommendation',
        '2 teacher recommendations',
        'SAT/ACT scores (many test-optional)',
        'Personal essay (650 words)',
        'Supplemental essays (varies by college)'
      ],
      financialAid: ['FAFSA', 'CSS Profile (for private colleges)'],
      testScores: 'SAT/ACT (many colleges test-optional)',
      region: 'US'
    };
  }
  
  if (countryLower === 'united kingdom' || countryLower === 'uk') {
    return {
      applicationType: 'UCAS Application',
      applicationComponents: [
        'UCAS Application form',
        'Personal Statement (4000 characters)',
        'Academic Reference',
        'Predicted grades',
        'UCAS fee (£27.50 for multiple choices)'
      ],
      financialAid: ['Student Finance England/Wales/Scotland', 'University bursaries'],
      testScores: 'A-Levels or IB Diploma',
      region: 'UK'
    };
  }
  
  if (countryLower === 'india') {
    return {
      applicationType: 'National Entrance Exams',
      applicationComponents: [
        'JEE Main/Advanced (for IITs/NITs)',
        'NEET (for medical colleges)',
        'CAT (for IIMs - MBA)',
        'CUET (for central universities)',
        'Class 12 board exam marks',
        'Category certificate (if applicable)'
      ],
      financialAid: ['Government scholarships', 'Institute-specific scholarships'],
      testScores: 'JEE/NEET/CAT rank & Class 12 percentage',
      region: 'India'
    };
  }
  
  // Europe (Germany, France, Netherlands, Finland, etc.)
  return {
    applicationType: 'National/University Portal',
    applicationComponents: [
      'Online application form',
      'Secondary school leaving certificate (Abitur/Baccalaureate/IB)',
      'Motivation letter',
      'CV/Resume',
      'Language proficiency certificate',
      'Application fee (varies)'
    ],
    financialAid: ['Government grants', 'University scholarships'],
    testScores: 'Abitur/IB/National leaving certificate',
    region: 'Europe'
  };
}

// Get region for filtering
function getRegion(country) {
  const countryLower = (country || '').toLowerCase();
  
  if (countryLower === 'united states' || countryLower === 'usa' || countryLower === 'us') {
    return 'United States';
  }
  if (countryLower === 'united kingdom' || countryLower === 'uk') {
    return 'United Kingdom';
  }
  if (countryLower === 'india') {
    return 'India';
  }
  // All other countries grouped as Europe
  return 'Europe';
}

class College {
  /**
   * Create a new college
   */
  static create(data) {
    const db = dbManager.getDatabase();
    
    // Check for duplicate before inserting
    const existing = db.prepare(`
      SELECT id FROM colleges 
      WHERE LOWER(name) = LOWER(?) AND LOWER(country) = LOWER(?)
    `).get(data.name, data.country);
    
    if (existing) {
      return this.findById(existing.id);
    }
    
    const stmt = db.prepare(`
      INSERT INTO colleges (
        name, country, location, official_website, admissions_url,
        programs_url, application_portal_url, academic_strengths, major_categories,
        acceptance_rate, tuition_domestic, tuition_international, student_population,
        average_gpa, sat_range, act_range, graduation_rate, ranking,
        trust_tier, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const acceptanceRate = normalizeAcceptanceRate(data.acceptanceRate || data.acceptance_rate);
    
    const result = stmt.run(
      data.name,
      data.country,
      data.location || null,
      data.officialWebsite || data.official_website || '',
      data.admissionsUrl || data.admissions_url || null,
      data.programsUrl || data.programs_url || null,
      data.applicationPortalUrl || data.application_portal_url || null,
      JSON.stringify(data.academicStrengths || data.academic_strengths || []),
      JSON.stringify(data.majorCategories || data.major_categories || []),
      acceptanceRate,
      data.tuitionDomestic || data.tuition_domestic || null,
      data.tuitionInternational || data.tuition_international || null,
      data.studentPopulation || data.student_population || null,
      data.averageGpa || data.average_gpa || null,
      data.satRange || data.sat_range || null,
      data.actRange || data.act_range || null,
      data.graduationRate || data.graduation_rate || null,
      data.ranking || null,
      data.trustTier || data.trust_tier || 'official',
      data.isVerified || data.is_verified || 0
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  /**
   * Find college by ID with comprehensive data from all tables
   */
  static findById(id) {
    const db = dbManager.getDatabase();
    
    // Get basic college info
    const stmt = db.prepare('SELECT * FROM colleges WHERE id = ?');
    const college = stmt.get(id);
    
    if (!college) {
      return null;
    }
    
    // Format basic college data
    const formattedCollege = this.formatCollege(college);
    
    // Try to fetch comprehensive data if tables exist
    try {
      // Get comprehensive college info
      const comprehensiveStmt = db.prepare(`
        SELECT * FROM colleges_comprehensive 
        WHERE LOWER(name) = LOWER(?) AND LOWER(country) = LOWER(?)
      `);
      const comprehensive = comprehensiveStmt.get(college.name, college.country);
      
      if (comprehensive) {
        // Merge comprehensive data
        formattedCollege.comprehensiveData = {
          // Basic Information
          alternateName: comprehensive.alternate_names,
          stateRegion: comprehensive.state_region,
          city: comprehensive.city,
          urbanClassification: comprehensive.urban_classification,
          institutionType: comprehensive.institution_type,
          classification: comprehensive.classification,
          religiousAffiliation: comprehensive.religious_affiliation,
          foundingYear: comprehensive.founding_year,
          campusSizeAcres: comprehensive.campus_size_acres,
          
          // Enrollment
          undergraduateEnrollment: comprehensive.undergraduate_enrollment,
          graduateEnrollment: comprehensive.graduate_enrollment,
          totalEnrollment: comprehensive.total_enrollment,
          studentFacultyRatio: comprehensive.student_faculty_ratio,
          
          // URLs
          websiteUrl: comprehensive.website_url,
        };
        
        // Get admissions data
        const admissionsStmt = db.prepare(`
          SELECT * FROM college_admissions 
          WHERE college_id = ?
          ORDER BY year DESC LIMIT 1
        `);
        const admissions = admissionsStmt.get(comprehensive.id);
        if (admissions) {
          formattedCollege.admissionsData = {
            year: admissions.year,
            acceptanceRate: admissions.acceptance_rate,
            earlyDecisionRate: admissions.early_decision_rate,
            earlyActionRate: admissions.early_action_rate,
            regularDecisionRate: admissions.regular_decision_rate,
            waitlistRate: admissions.waitlist_rate,
            transferAcceptanceRate: admissions.transfer_acceptance_rate,
            yieldRate: admissions.yield_rate,
            applicationVolume: admissions.application_volume,
            admitVolume: admissions.admit_volume,
            enrollmentVolume: admissions.enrollment_volume,
            internationalAcceptRate: admissions.international_accept_rate,
            inStateAcceptRate: admissions.in_state_accept_rate,
            outStateAcceptRate: admissions.out_state_accept_rate,
            testOptionalFlag: admissions.test_optional_flag,
            source: admissions.source,
            confidenceScore: admissions.confidence_score,
          };
        }
        
        // Get student stats
        const statsStmt = db.prepare(`
          SELECT * FROM admitted_student_stats 
          WHERE college_id = ?
          ORDER BY year DESC LIMIT 1
        `);
        const stats = statsStmt.get(comprehensive.id);
        if (stats) {
          formattedCollege.studentStats = {
            year: stats.year,
            gpa25: stats.gpa_25,
            gpa50: stats.gpa_50,
            gpa75: stats.gpa_75,
            sat25: stats.sat_25,
            sat50: stats.sat_50,
            sat75: stats.sat_75,
            act25: stats.act_25,
            act50: stats.act_50,
            act75: stats.act_75,
            classRankTop10Percent: stats.class_rank_top10_percent,
            avgCourseRigorIndex: stats.avg_course_rigor_index,
            source: stats.source,
            confidenceScore: stats.confidence_score,
          };
        }
        
        // Get financial data
        const financialStmt = db.prepare(`
          SELECT * FROM college_financial_data 
          WHERE college_id = ?
          ORDER BY year DESC LIMIT 1
        `);
        const financial = financialStmt.get(comprehensive.id);
        if (financial) {
          formattedCollege.financialData = {
            year: financial.year,
            tuitionInState: financial.tuition_in_state,
            tuitionOutState: financial.tuition_out_state,
            tuitionInternational: financial.tuition_international,
            costOfAttendance: financial.cost_of_attendance,
            avgFinancialAid: financial.avg_financial_aid,
            percentReceivingAid: financial.percent_receiving_aid,
            avgDebt: financial.avg_debt,
            netPriceLowIncome: financial.net_price_low_income,
            netPriceMidIncome: financial.net_price_mid_income,
            netPriceHighIncome: financial.net_price_high_income,
            meritScholarshipFlag: financial.merit_scholarship_flag,
            needBlindFlag: financial.need_blind_flag,
            loanDefaultRate: financial.loan_default_rate,
            source: financial.source,
            confidenceScore: financial.confidence_score,
          };
        }
        
        // Get academic outcomes
        const outcomesStmt = db.prepare(`
          SELECT * FROM academic_outcomes 
          WHERE college_id = ?
          ORDER BY year DESC LIMIT 1
        `);
        const outcomes = outcomesStmt.get(comprehensive.id);
        if (outcomes) {
          formattedCollege.academicOutcomes = {
            year: outcomes.year,
            graduationRate4yr: outcomes.graduation_rate_4yr,
            graduationRate6yr: outcomes.graduation_rate_6yr,
            retentionRate: outcomes.retention_rate,
            dropoutRate: outcomes.dropout_rate,
            avgTimeToDegree: outcomes.avg_time_to_degree,
            employmentRate: outcomes.employment_rate,
            gradSchoolRate: outcomes.grad_school_rate,
            medianStartSalary: outcomes.median_start_salary,
            internshipRate: outcomes.internship_rate,
            source: outcomes.source,
            confidenceScore: outcomes.confidence_score,
          };
        }
        
        // Get programs (top 20 for performance)
        const programsStmt = db.prepare(`
          SELECT * FROM college_programs 
          WHERE college_id = ?
          LIMIT 20
        `);
        const programs = programsStmt.all(comprehensive.id);
        if (programs && programs.length > 0) {
          formattedCollege.programs = programs.map(p => ({
            programName: p.program_name,
            degreeType: p.degree_type,
            enrollment: p.enrollment,
            acceptanceRate: p.acceptance_rate,
            accreditationStatus: p.accreditation_status,
            rankingScore: p.ranking_score,
            researchFunding: p.research_funding,
            coopAvailable: p.coop_available,
            licensingPassRate: p.licensing_pass_rate,
            source: p.source,
          }));
        }
        
        // Get student demographics
        const demographicsStmt = db.prepare(`
          SELECT * FROM student_demographics 
          WHERE college_id = ?
          ORDER BY year DESC LIMIT 1
        `);
        const demographics = demographicsStmt.get(comprehensive.id);
        if (demographics) {
          formattedCollege.demographics = {
            year: demographics.year,
            percentInternational: demographics.percent_international,
            genderRatio: demographics.gender_ratio,
            ethnicDistribution: safeJsonParse(demographics.ethnic_distribution, {}),
            percentFirstGen: demographics.percent_first_gen,
            socioeconomicIndex: demographics.socioeconomic_index,
            geographicDiversityIndex: demographics.geographic_diversity_index,
            legacyPercent: demographics.legacy_percent,
            athletePercent: demographics.athlete_percent,
            transferPercent: demographics.transfer_percent,
            source: demographics.source,
          };
        }
        
        // Get campus life
        const campusLifeStmt = db.prepare(`
          SELECT * FROM campus_life 
          WHERE college_id = ?
        `);
        const campusLife = campusLifeStmt.get(comprehensive.id);
        if (campusLife) {
          formattedCollege.campusLife = {
            housingGuarantee: campusLife.housing_guarantee,
            campusSafetyScore: campusLife.campus_safety_score,
            costOfLivingIndex: campusLife.cost_of_living_index,
            climateZone: campusLife.climate_zone,
            studentSatisfactionScore: campusLife.student_satisfaction_score,
            athleticsDivision: campusLife.athletics_division,
            clubCount: campusLife.club_count,
            mentalHealthRating: campusLife.mental_health_rating,
            source: campusLife.source,
          };
        }
        
        // Get rankings
        const rankingsStmt = db.prepare(`
          SELECT * FROM college_rankings 
          WHERE college_id = ?
          ORDER BY year DESC
        `);
        const rankings = rankingsStmt.all(comprehensive.id);
        if (rankings && rankings.length > 0) {
          formattedCollege.rankings = rankings.map(r => ({
            year: r.year,
            rankingBody: r.ranking_body,
            nationalRank: r.national_rank,
            globalRank: r.global_rank,
            subjectRank: r.subject_rank,
            employerReputationScore: r.employer_reputation_score,
            peerAssessmentScore: r.peer_assessment_score,
            prestigeIndex: r.prestige_index,
          }));
        }
      }
    } catch (error) {
      // If comprehensive tables don't exist or there's an error, just return basic data
      console.warn(`Could not fetch comprehensive data for college ${id}:`, error.message);
    }
    
    return formattedCollege;
  }
  
  /**
   * Format college data for API response
   */
  static formatCollege(college) {
    // Parse JSON fields
    const academicStrengths = safeJsonParse(college.academic_strengths, []);
    const majorCategories = safeJsonParse(college.major_categories, []);
    
    // Normalize acceptance rate
    const acceptanceRate = normalizeAcceptanceRate(college.acceptance_rate);
    
    // Get country-specific requirements
    const requirements = getCountryRequirements(college.country);
    const region = getRegion(college.country);
    
    return {
      id: college.id,
      name: college.name,
      country: college.country,
      region: region,
      location: college.location,
      officialWebsite: college.official_website,
      admissionsUrl: college.admissions_url,
      programsUrl: college.programs_url,
      applicationPortalUrl: college.application_portal_url,
      
      // Academic info
      academicStrengths: academicStrengths,
      majorCategories: majorCategories,
      programs: majorCategories, // Alias for compatibility
      
      // Stats
      acceptanceRate: acceptanceRate,
      acceptance_rate: acceptanceRate,
      tuitionDomestic: college.tuition_domestic,
      tuitionInternational: college.tuition_international,
      tuition_cost: college.tuition_domestic || college.tuition_international, // Add tuition_cost alias
      studentPopulation: college.student_population,
      enrollment: college.student_population, // Alias
      averageGpa: college.average_gpa,
      averageGPA: college.average_gpa, // Add uppercase version for frontend compatibility
      satRange: college.sat_range,
      actRange: college.act_range,
      graduationRate: college.graduation_rate,
      ranking: college.ranking,
      
      // Country-specific requirements
      requirements: requirements,
      
      // Trust info
      trustTier: college.trust_tier,
      isVerified: college.is_verified,
      
      // Timestamps
      createdAt: college.created_at,
      updatedAt: college.updated_at
    };
  }
  
  /**
   * Find all colleges with filters
   */
  static findAll(filters = {}) {
    const db = dbManager.getDatabase();
    
    let query = 'SELECT * FROM colleges WHERE 1=1';
    const params = [];
    
    // Country filter - support region grouping
    if (filters.country) {
      const countryLower = filters.country.toLowerCase();
      if (countryLower === 'europe') {
        // Europe includes all countries except USA, UK, India
        query += ` AND country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`;
      } else if (countryLower === 'united states' || countryLower === 'usa') {
        query += ` AND (country = 'United States' OR country = 'USA')`;
      } else if (countryLower === 'united kingdom' || countryLower === 'uk') {
        query += ` AND (country = 'United Kingdom' OR country = 'UK')`;
      } else {
        query += ' AND LOWER(country) = LOWER(?)';
        params.push(filters.country);
      }
    }
    
    // Search filter
    if (filters.search) {
      query += ` AND (
        name LIKE ? OR 
        location LIKE ? OR 
        country LIKE ? OR 
        major_categories LIKE ? OR 
        academic_strengths LIKE ?
      )`;
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    // Acceptance rate range
    if (filters.minAcceptanceRate !== undefined) {
      query += ' AND acceptance_rate >= ?';
      params.push(filters.minAcceptanceRate);
    }
    if (filters.maxAcceptanceRate !== undefined) {
      query += ' AND acceptance_rate <= ?';
      params.push(filters.maxAcceptanceRate);
    }
    
    // Ordering
    query += ' ORDER BY ';
    if (filters.sortBy) {
      const validSorts = ['name', 'acceptance_rate', 'ranking', 'student_population'];
      const sortField = validSorts.includes(filters.sortBy) ? filters.sortBy : 'name';
      const sortDir = filters.sortDir === 'desc' ? 'DESC' : 'ASC';
      query += `${sortField} ${sortDir}`;
    } else {
      query += 'name ASC';
    }
    
    // Pagination using constants
    const limit = Math.min(filters.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = filters.offset || 0;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    
    const stmt = db.prepare(query);
    const colleges = stmt.all(...params);
    
    return colleges.map(college => this.formatCollege(college));
  }
  
  /**
   * Get total count for pagination
   */
  static getCount(filters = {}) {
    const db = dbManager.getDatabase();
    
    let query = 'SELECT COUNT(*) as count FROM colleges WHERE 1=1';
    const params = [];
    
    if (filters.country) {
      const countryLower = filters.country.toLowerCase();
      if (countryLower === 'europe') {
        query += ` AND country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`;
      } else if (countryLower === 'united states' || countryLower === 'usa') {
        query += ` AND (country = 'United States' OR country = 'USA')`;
      } else if (countryLower === 'united kingdom' || countryLower === 'uk') {
        query += ` AND (country = 'United Kingdom' OR country = 'UK')`;
      } else {
        query += ' AND LOWER(country) = LOWER(?)';
        params.push(filters.country);
      }
    }
    
    if (filters.search) {
      query += ` AND (
        name LIKE ? OR 
        location LIKE ? OR 
        country LIKE ? OR 
        major_categories LIKE ? OR 
        academic_strengths LIKE ?
      )`;
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    const result = db.prepare(query).get(...params);
    return result.count;
  }
  
  /**
   * Search colleges
   */
  static search(searchTerm, filters = {}) {
    return this.findAll({
      ...filters,
      search: searchTerm
    });
  }
  
  /**
   * Get country filter options (simplified to 4)
   */
  static getCountryFilters() {
    return [
      { value: 'United States', label: 'United States', count: this.getCountByRegion('United States') },
      { value: 'India', label: 'India', count: this.getCountByRegion('India') },
      { value: 'United Kingdom', label: 'United Kingdom', count: this.getCountByRegion('United Kingdom') },
      { value: 'Europe', label: 'Europe', count: this.getCountByRegion('Europe') }
    ];
  }
  
  /**
   * Get count by region
   */
  static getCountByRegion(region) {
    const db = dbManager.getDatabase();
    
    if (region === 'Europe') {
      return db.prepare(`SELECT COUNT(*) as count FROM colleges 
               WHERE country NOT IN ('United States', 'USA', 'United Kingdom', 'UK', 'India')`).get().count;
    } else if (region === 'United States') {
      return db.prepare(`SELECT COUNT(*) as count FROM colleges 
               WHERE country IN ('United States', 'USA')`).get().count;
    } else if (region === 'United Kingdom') {
      return db.prepare(`SELECT COUNT(*) as count FROM colleges 
               WHERE country IN ('United Kingdom', 'UK')`).get().count;
    } else if (region === 'India') {
      return db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country = 'India'`).get().count;
    }
    // For any other value (shouldn't happen with our 4 regions), use parameterized query
    return db.prepare(`SELECT COUNT(*) as count FROM colleges WHERE country = ?`).get(region).count;
  }
  
  /**
   * Get all unique majors/programs
   */
  static getAllMajors() {
    const db = dbManager.getDatabase();
    const colleges = db.prepare('SELECT major_categories FROM colleges').all();
    
    const majorsSet = new Set();
    colleges.forEach(college => {
      const majors = safeJsonParse(college.major_categories, []);
      majors.forEach(major => majorsSet.add(major));
    });
    
    return Array.from(majorsSet).sort();
  }
  
  /**
   * Update college
   */
  static update(id, data) {
    const db = dbManager.getDatabase();
    
    const updates = [];
    const params = [];
    
    const fieldMap = {
      name: 'name',
      country: 'country',
      location: 'location',
      officialWebsite: 'official_website',
      admissionsUrl: 'admissions_url',
      programsUrl: 'programs_url',
      applicationPortalUrl: 'application_portal_url',
      academicStrengths: 'academic_strengths',
      majorCategories: 'major_categories',
      acceptanceRate: 'acceptance_rate',
      tuitionDomestic: 'tuition_domestic',
      tuitionInternational: 'tuition_international',
      studentPopulation: 'student_population',
      averageGpa: 'average_gpa',
      satRange: 'sat_range',
      actRange: 'act_range',
      graduationRate: 'graduation_rate',
      ranking: 'ranking',
      trustTier: 'trust_tier',
      isVerified: 'is_verified'
    };
    
    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        let value = data[key];
        
        // Handle JSON fields
        if (key === 'academicStrengths' || key === 'majorCategories') {
          value = JSON.stringify(value);
        }
        
        // Normalize acceptance rate
        if (key === 'acceptanceRate') {
          value = normalizeAcceptanceRate(value);
        }
        
        updates.push(`${column} = ?`);
        params.push(value);
      }
    }
    
    if (updates.length === 0) {
      return this.findById(id);
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    
    const query = `UPDATE colleges SET ${updates.join(', ')} WHERE id = ?`;
    db.prepare(query).run(...params);
    
    return this.findById(id);
  }
  
  /**
   * Delete college
   */
  static delete(id) {
    const db = dbManager.getDatabase();
    const result = db.prepare('DELETE FROM colleges WHERE id = ?').run(id);
    return result.changes > 0;
  }
}

module.exports = College;
