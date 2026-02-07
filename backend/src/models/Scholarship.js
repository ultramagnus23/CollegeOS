/**
 * Scholarship Model
 * Database model for scholarships
 */
const dbManager = require('../config/database');

class Scholarship {
  /**
   * Create scholarships table if not exists
   */
  static ensureTable() {
    const db = dbManager.getDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS scholarships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT,
        country TEXT,
        amount TEXT,
        amount_min INTEGER,
        amount_max INTEGER,
        currency TEXT DEFAULT 'USD',
        deadline DATE,
        eligibility TEXT,
        nationality_requirements TEXT,
        academic_requirements TEXT,
        major_requirements TEXT,
        need_based INTEGER DEFAULT 0,
        merit_based INTEGER DEFAULT 0,
        demographic_requirements TEXT,
        description TEXT,
        application_url TEXT,
        documentation_required TEXT,
        is_renewable INTEGER DEFAULT 0,
        renewal_criteria TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_scholarships_country ON scholarships(country);
      CREATE INDEX IF NOT EXISTS idx_scholarships_deadline ON scholarships(deadline);
      CREATE INDEX IF NOT EXISTS idx_scholarships_status ON scholarships(status);
    `);
    
    // Create user scholarship tracking table
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_scholarships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        scholarship_id INTEGER NOT NULL,
        status TEXT DEFAULT 'interested',
        notes TEXT,
        application_date DATE,
        decision_date DATE,
        award_amount INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (scholarship_id) REFERENCES scholarships(id) ON DELETE CASCADE,
        UNIQUE(user_id, scholarship_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_scholarships_user ON user_scholarships(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_scholarships_status ON user_scholarships(status);
    `);
  }

  /**
   * Seed initial scholarships data
   */
  static seedInitialData() {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    // Check if already seeded
    const count = db.prepare('SELECT COUNT(*) as count FROM scholarships').get();
    if (count.count > 0) return;
    
    const scholarships = [
      {
        name: 'Fulbright Foreign Student Program',
        provider: 'U.S. Department of State',
        country: 'United States',
        amount: 'Full funding',
        amount_min: 20000,
        amount_max: 100000,
        currency: 'USD',
        eligibility: 'Graduate students from eligible countries',
        nationality_requirements: JSON.stringify(['non-US citizens']),
        academic_requirements: JSON.stringify(['Bachelor\'s degree required', 'Strong academic record']),
        need_based: 0,
        merit_based: 1,
        description: 'Full grants for graduate study, research, or teaching assistantships in the United States',
        application_url: 'https://foreign.fulbrightonline.org/',
        is_renewable: 0
      },
      {
        name: 'Chevening Scholarships',
        provider: 'UK Foreign, Commonwealth & Development Office',
        country: 'United Kingdom',
        amount: 'Full funding',
        amount_min: 30000,
        amount_max: 50000,
        currency: 'GBP',
        eligibility: 'International students with leadership potential',
        nationality_requirements: JSON.stringify(['non-UK citizens', 'Chevening-eligible countries']),
        academic_requirements: JSON.stringify(['Bachelor\'s degree required', 'Work experience preferred']),
        need_based: 0,
        merit_based: 1,
        description: 'UK government\'s global scholarship programme for future leaders',
        application_url: 'https://www.chevening.org/',
        is_renewable: 0
      },
      {
        name: 'DAAD Scholarships',
        provider: 'German Academic Exchange Service',
        country: 'Germany',
        amount: '850-1200 EUR/month',
        amount_min: 10200,
        amount_max: 14400,
        currency: 'EUR',
        eligibility: 'Graduate and doctoral students',
        academic_requirements: JSON.stringify(['Bachelor\'s degree required', 'Good academic standing']),
        need_based: 0,
        merit_based: 1,
        description: 'Scholarships for studying in Germany at all academic levels',
        application_url: 'https://www.daad.de/',
        is_renewable: 1
      },
      {
        name: 'Commonwealth Scholarships',
        provider: 'Commonwealth Scholarship Commission',
        country: 'United Kingdom',
        amount: 'Full funding',
        amount_min: 25000,
        amount_max: 45000,
        currency: 'GBP',
        eligibility: 'Citizens of Commonwealth countries',
        nationality_requirements: JSON.stringify(['Commonwealth countries']),
        academic_requirements: JSON.stringify(['Bachelor\'s degree with first class/upper second']),
        need_based: 1,
        merit_based: 1,
        description: 'Full scholarships for Master\'s and PhD study in the UK',
        application_url: 'http://cscuk.dfid.gov.uk/',
        is_renewable: 0
      },
      {
        name: 'Erasmus Mundus Joint Masters',
        provider: 'European Commission',
        country: 'European Union',
        amount: 'Full tuition + stipend',
        amount_min: 25000,
        amount_max: 50000,
        currency: 'EUR',
        eligibility: 'Students from any country',
        academic_requirements: JSON.stringify(['Bachelor\'s degree required']),
        need_based: 0,
        merit_based: 1,
        description: 'Scholarships for joint Master\'s programmes offered by EU universities',
        application_url: 'https://ec.europa.eu/programmes/erasmus-plus/',
        is_renewable: 0
      },
      {
        name: 'Gates Cambridge Scholarship',
        provider: 'Bill & Melinda Gates Foundation',
        country: 'United Kingdom',
        amount: 'Full cost of study',
        amount_min: 40000,
        amount_max: 80000,
        currency: 'GBP',
        eligibility: 'Outstanding applicants from outside the UK',
        academic_requirements: JSON.stringify(['Bachelor\'s degree with first class', 'Leadership potential']),
        need_based: 0,
        merit_based: 1,
        description: 'Full-cost scholarship for postgraduate study at Cambridge',
        application_url: 'https://www.gatescambridge.org/',
        is_renewable: 0
      },
      {
        name: 'Rhodes Scholarship',
        provider: 'Rhodes Trust',
        country: 'United Kingdom',
        amount: 'Full funding',
        amount_min: 50000,
        amount_max: 80000,
        currency: 'GBP',
        eligibility: 'Young leaders from eligible countries',
        academic_requirements: JSON.stringify(['Bachelor\'s degree', 'Outstanding academic achievement']),
        need_based: 0,
        merit_based: 1,
        description: 'Oldest international scholarship for postgraduate study at Oxford',
        application_url: 'https://www.rhodeshouse.ox.ac.uk/',
        is_renewable: 0
      },
      {
        name: 'Australia Awards Scholarships',
        provider: 'Australian Government',
        country: 'Australia',
        amount: 'Full tuition + living',
        amount_min: 30000,
        amount_max: 60000,
        currency: 'AUD',
        eligibility: 'Students from eligible developing countries',
        nationality_requirements: JSON.stringify(['developing countries']),
        academic_requirements: JSON.stringify(['Bachelor\'s degree']),
        need_based: 1,
        merit_based: 1,
        description: 'Scholarships for study and research at Australian universities',
        application_url: 'https://www.dfat.gov.au/people-to-people/australia-awards/',
        is_renewable: 0
      },
      {
        name: 'Vanier Canada Graduate Scholarships',
        provider: 'Government of Canada',
        country: 'Canada',
        amount: '$50,000 CAD/year',
        amount_min: 50000,
        amount_max: 150000,
        currency: 'CAD',
        eligibility: 'Doctoral students',
        academic_requirements: JSON.stringify(['Enrolled in doctoral program', 'First-class academic record']),
        need_based: 0,
        merit_based: 1,
        description: 'Canada\'s most prestigious doctoral scholarship',
        application_url: 'https://vanier.gc.ca/',
        is_renewable: 1,
        renewal_criteria: 'Up to 3 years'
      },
      {
        name: 'Singapore Government Scholarship',
        provider: 'Ministry of Education Singapore',
        country: 'Singapore',
        amount: 'Full funding',
        amount_min: 30000,
        amount_max: 50000,
        currency: 'SGD',
        eligibility: 'International students',
        academic_requirements: JSON.stringify(['Strong academic record', 'Leadership qualities']),
        need_based: 0,
        merit_based: 1,
        description: 'Scholarships for undergraduate and graduate study in Singapore',
        application_url: 'https://www.moe.gov.sg/',
        is_renewable: 1
      }
    ];
    
    const stmt = db.prepare(`
      INSERT INTO scholarships (
        name, provider, country, amount, amount_min, amount_max, currency,
        eligibility, nationality_requirements, academic_requirements, need_based,
        merit_based, description, application_url, is_renewable, renewal_criteria
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const s of scholarships) {
      stmt.run(
        s.name, s.provider, s.country, s.amount, s.amount_min, s.amount_max,
        s.currency, s.eligibility, s.nationality_requirements || null,
        s.academic_requirements || null, s.need_based, s.merit_based,
        s.description, s.application_url, s.is_renewable, s.renewal_criteria || null
      );
    }
  }

  /**
   * Search scholarships with filters
   */
  static search(filters = {}) {
    this.ensureTable();
    this.seedInitialData();
    const db = dbManager.getDatabase();
    
    let query = 'SELECT * FROM scholarships WHERE status = ?';
    const params = ['active'];
    
    if (filters.country) {
      query += ' AND country = ?';
      params.push(filters.country);
    }
    
    if (filters.needBased === true) {
      query += ' AND need_based = 1';
    }
    
    if (filters.meritBased === true) {
      query += ' AND merit_based = 1';
    }
    
    if (filters.minAmount) {
      query += ' AND amount_min >= ?';
      params.push(filters.minAmount);
    }
    
    if (filters.deadlineAfter) {
      query += ' AND deadline >= ?';
      params.push(filters.deadlineAfter);
    }
    
    if (filters.search) {
      query += ' AND (name LIKE ? OR description LIKE ? OR provider LIKE ?)';
      const searchTerm = `%${filters.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }
    
    query += ' ORDER BY deadline ASC NULLS LAST';
    
    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }
    
    const stmt = db.prepare(query);
    return stmt.all(...params).map(s => ({
      ...s,
      nationality_requirements: s.nationality_requirements ? JSON.parse(s.nationality_requirements) : [],
      academic_requirements: s.academic_requirements ? JSON.parse(s.academic_requirements) : [],
      major_requirements: s.major_requirements ? JSON.parse(s.major_requirements) : [],
      demographic_requirements: s.demographic_requirements ? JSON.parse(s.demographic_requirements) : [],
      documentation_required: s.documentation_required ? JSON.parse(s.documentation_required) : []
    }));
  }

  /**
   * Get scholarship by ID
   */
  static getById(id) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM scholarships WHERE id = ?');
    const s = stmt.get(id);
    
    if (s) {
      return {
        ...s,
        nationality_requirements: s.nationality_requirements ? JSON.parse(s.nationality_requirements) : [],
        academic_requirements: s.academic_requirements ? JSON.parse(s.academic_requirements) : [],
        major_requirements: s.major_requirements ? JSON.parse(s.major_requirements) : [],
        demographic_requirements: s.demographic_requirements ? JSON.parse(s.demographic_requirements) : [],
        documentation_required: s.documentation_required ? JSON.parse(s.documentation_required) : []
      };
    }
    return null;
  }

  /**
   * Track scholarship for user
   */
  static trackForUser(userId, scholarshipId, status = 'interested', notes = '') {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      INSERT INTO user_scholarships (user_id, scholarship_id, status, notes)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, scholarship_id) DO UPDATE SET
        status = excluded.status,
        notes = excluded.notes,
        updated_at = CURRENT_TIMESTAMP
    `);
    
    stmt.run(userId, scholarshipId, status, notes);
    return this.getUserScholarship(userId, scholarshipId);
  }

  /**
   * Get user's tracked scholarships
   */
  static getUserScholarships(userId, status = null) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    let query = `
      SELECT us.*, s.name, s.provider, s.country, s.amount, s.deadline
      FROM user_scholarships us
      JOIN scholarships s ON us.scholarship_id = s.id
      WHERE us.user_id = ?
    `;
    const params = [userId];
    
    if (status) {
      query += ' AND us.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY s.deadline ASC';
    
    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Get specific user scholarship tracking
   */
  static getUserScholarship(userId, scholarshipId) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const stmt = db.prepare(`
      SELECT us.*, s.name, s.provider, s.country, s.amount, s.deadline
      FROM user_scholarships us
      JOIN scholarships s ON us.scholarship_id = s.id
      WHERE us.user_id = ? AND us.scholarship_id = ?
    `);
    
    return stmt.get(userId, scholarshipId);
  }

  /**
   * Update user scholarship tracking
   */
  static updateUserScholarship(userId, scholarshipId, updates) {
    this.ensureTable();
    const db = dbManager.getDatabase();
    
    const allowedFields = ['status', 'notes', 'application_date', 'decision_date', 'award_amount'];
    const setClause = [];
    const params = [];
    
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (allowedFields.includes(snakeKey)) {
        setClause.push(`${snakeKey} = ?`);
        params.push(value);
      }
    }
    
    if (setClause.length === 0) return null;
    
    setClause.push('updated_at = CURRENT_TIMESTAMP');
    params.push(userId, scholarshipId);
    
    const stmt = db.prepare(`
      UPDATE user_scholarships SET ${setClause.join(', ')}
      WHERE user_id = ? AND scholarship_id = ?
    `);
    
    stmt.run(...params);
    return this.getUserScholarship(userId, scholarshipId);
  }

  /**
   * Get eligible scholarships based on user profile
   */
  static getEligibleScholarships(userProfile) {
    this.ensureTable();
    this.seedInitialData();
    const db = dbManager.getDatabase();
    
    // Get all active scholarships and filter by eligibility
    const scholarships = this.search({ limit: 100 });
    
    return scholarships.filter(s => {
      // Check country match if user has target countries
      if (userProfile.targetCountries && userProfile.targetCountries.length > 0) {
        const countryMatch = userProfile.targetCountries.some(c => 
          s.country.toLowerCase().includes(c.toLowerCase()) || 
          c.toLowerCase().includes(s.country.toLowerCase())
        );
        if (!countryMatch) return false;
      }
      
      return true;
    });
  }

  /**
   * Get countries with scholarships
   */
  static getCountries() {
    this.ensureTable();
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT DISTINCT country FROM scholarships WHERE status = ? ORDER BY country');
    return stmt.all('active').map(r => r.country);
  }
}

module.exports = Scholarship;
