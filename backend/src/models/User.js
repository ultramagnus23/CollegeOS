const bcrypt = require('bcrypt');
const dbManager = require('../config/database');

class User {
  static create({ email, passwordHash, googleId, fullName, country }) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, google_id, full_name, country)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(email, passwordHash, googleId, fullName, country);
    return this.findById(result.lastInsertRowid);
  }
  
  static findById(id) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id);
    
    if (user) {
      user.targetCountries = user.target_countries ? JSON.parse(user.target_countries) : [];
      user.intendedMajors = user.intended_majors ? JSON.parse(user.intended_majors) : [];
      user.testStatus = user.test_status ? JSON.parse(user.test_status) : {};
      user.languagePreferences = user.language_preferences ? JSON.parse(user.language_preferences) : [];
    }
    
    return user;
  }
  
  static findByEmail(email) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    return stmt.get(email);
  }
  
  static findByGoogleId(googleId) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare('SELECT * FROM users WHERE google_id = ?');
    return stmt.get(googleId);
  }
  
  static updateOnboarding(userId, data) {
    const db = dbManager.getDatabase();
    const stmt = db.prepare(`
      UPDATE users 
      SET target_countries = ?,
          intended_majors = ?,
          test_status = ?,
          language_preferences = ?,
          onboarding_complete = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    stmt.run(
      JSON.stringify(data.targetCountries),
      JSON.stringify(data.intendedMajors),
      JSON.stringify(data.testStatus),
      JSON.stringify(data.languagePreferences),
      userId
    );
    
    return this.findById(userId);
  }
  
  static async comparePassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
  
  static async hashPassword(password) {
    return bcrypt.hash(password, 10);
  }
}

module.exports = User;
