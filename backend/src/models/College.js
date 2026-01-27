const dbManager = require('../config/database');

class College {
  static create(data) {
    const db = dbManager.getDatabase();
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
      data.acceptanceRate || data.acceptance_rate || null,
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
      // Parse JSON fields
      college.programs = JSON.parse(college.programs || '[]');
      college.academicStrengths = JSON.parse(college.academic_strengths || '[]');
      college.majorCategories = JSON.parse(college.major_categories || '[]');
      college.requirements = JSON.parse(college.requirements || '{}');
      college.deadlineTemplates = JSON.parse(college.deadline_templates || '{}');
      college.researchData = JSON.parse(college.research_data || '{}');
      college.cbseRequirements = JSON.parse(college.cbse_requirements || '{}');
      college.igcseRequirements = JSON.parse(college.igcse_requirements || '{}');
      college.ibRequirements = JSON.parse(college.ib_requirements || '{}');
      if (college.numerus_fixus_programs) {
        college.numerusFixusPrograms = JSON.parse(college.numerus_fixus_programs);
      }
      
      // Format admission stats for API response
      college.admissionStats = {
        acceptanceRate: college.acceptance_rate,
        sat: {
          reading25: college.sat_reading_25,
          reading75: college.sat_reading_75,
          math25: college.sat_math_25,
          math75: college.sat_math_75,
          totalAvg: college.sat_total_avg
        },
        act: {
          composite25: college.act_composite_25,
          composite75: college.act_composite_75,
          compositeAvg: college.act_composite_avg
        },
        gpa: {
          avg: college.gpa_avg,
          percentile25: college.gpa_25,
          percentile75: college.gpa_75
        },
        tuition: {
          inState: college.in_state_tuition,
          outOfState: college.out_of_state_tuition,
          international: college.international_tuition
        },
        enrollment: college.total_enrollment,
        graduationRate: college.graduation_rate,
        dataSource: college.admission_data_source,
        dataYear: college.admission_data_year
      };
    }
    
    return college;
  }
  
  static findAll(filters = {}) {
    const db = dbManager.getDatabase();
    let query = 'SELECT * FROM colleges WHERE 1=1';
    const params = [];
    
    // Support multiple countries (for regions like ASIA, EU)
    if (filters.countries && Array.isArray(filters.countries) && filters.countries.length > 0) {
      const placeholders = filters.countries.map(() => '?').join(', ');
      query += ` AND country IN (${placeholders})`;
      params.push(...filters.countries);
    } else if (filters.country) {
      // Handle UK alias (UK and GB are the same)
      if (filters.country === 'UK') {
        query += ' AND country IN (?, ?)';
        params.push('UK', 'GB');
      } else {
        query += ' AND country = ?';
        params.push(filters.country);
      }
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
    
    query += ' ORDER BY name ASC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = db.prepare(query);
    const colleges = stmt.all(...params);
    
    return colleges.map(college => ({
      ...college,
      programs: JSON.parse(college.programs || '[]'),
      academicStrengths: JSON.parse(college.academic_strengths || '[]'),
      majorCategories: JSON.parse(college.major_categories || '[]'),
      requirements: JSON.parse(college.requirements || '{}'),
      deadlineTemplates: JSON.parse(college.deadline_templates || '{}'),
      researchData: JSON.parse(college.research_data || '{}')
    }));
  }
  
  static search(searchTerm, filters = {}) {
    const db = dbManager.getDatabase();
    const searchPattern = `%${searchTerm}%`;
    
    // Comprehensive search across multiple fields
    let query = `
      SELECT * FROM colleges 
      WHERE (
        name LIKE ? 
        OR location LIKE ?
        OR country LIKE ?
        OR major_categories LIKE ?
        OR academic_strengths LIKE ?
        OR programs LIKE ?
        OR description LIKE ?
      )
    `;
    const params = [
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern,
      searchPattern
    ];
    
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
    
    query += ' ORDER BY acceptance_rate ASC, name ASC';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = db.prepare(query);
    const colleges = stmt.all(...params);
    
    return colleges.map(college => ({
      ...college,
      programs: JSON.parse(college.programs || '[]'),
      academicStrengths: JSON.parse(college.academic_strengths || '[]'),
      majorCategories: JSON.parse(college.major_categories || '[]'),
      requirements: JSON.parse(college.requirements || '{}'),
      deadlineTemplates: JSON.parse(college.deadline_templates || '{}'),
      researchData: JSON.parse(college.research_data || '{}')
    }));
  }
}

module.exports = College;