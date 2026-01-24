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
    }
    
    return college;
  }
  
  static findAll(filters = {}) {
    const db = dbManager.getDatabase();
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