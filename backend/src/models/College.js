const dbManager = require('../config/database');

class College {
  static create(data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO colleges (
        name, country, official_website, admissions_url, programs_url,
        application_portal_url, academic_strengths, major_categories,
        trust_tier, is_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      data.name,
      data.country,
      data.officialWebsite,
      data.admissionsUrl || null,
      data.programsUrl || null,
      data.applicationPortalUrl || null,
      JSON.stringify(data.academicStrengths || []),
      JSON.stringify(data.majorCategories || []),
      data.trustTier || 'official',
      data.isVerified || 0
    );
    
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM colleges WHERE id = ?');
    const college = stmt.get(id);
    
    if (college) {
      college.academicStrengths = JSON.parse(college.academic_strengths || '[]');
      college.majorCategories = JSON.parse(college.major_categories || '[]');
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
    
    if (filters.search) {
      query += ' AND name LIKE ?';
      params.push(`%${filters.search}%`);
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
      academicStrengths: JSON.parse(college.academic_strengths || '[]'),
      majorCategories: JSON.parse(college.major_categories || '[]')
    }));
  }
  
  static search(searchTerm, filters = {}) {
    const db = dbManager.getDatabase();
    const searchPattern = `%${searchTerm}%`;
    
    // Comprehensive search across name, location, country, and major categories
    let query = `
      SELECT * FROM colleges 
      WHERE (
        name LIKE ? 
        OR location LIKE ?
        OR country LIKE ?
        OR major_categories LIKE ?
        OR academic_strengths LIKE ?
      )
    `;
    const params = [
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
    
    // Search in major categories more precisely
    if (filters.program) {
      query += ' AND major_categories LIKE ?';
      params.push(`%"${filters.program}"%`);
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
      academicStrengths: JSON.parse(college.academic_strengths || '[]'),
      majorCategories: JSON.parse(college.major_categories || '[]')
    }));
  }
}

module.exports = College;