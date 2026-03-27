const bcrypt = require('bcrypt');
const dbManager = require('../config/database');

class User {
  static async create({ email, passwordHash, googleId, fullName, country }) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, google_id, full_name, country)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [email, passwordHash, googleId, fullName, country]
    );
    return this.findById(rows[0].id);
  }

  static async findById(id) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    const user = rows[0];
    if (user) {
      user.targetCountries = user.target_countries ? JSON.parse(user.target_countries) : [];
      user.intendedMajors = user.intended_majors ? JSON.parse(user.intended_majors) : [];
      user.testStatus = user.test_status ? JSON.parse(user.test_status) : {};
      user.languagePreferences = user.language_preferences ? JSON.parse(user.language_preferences) : [];
    }
    return user || null;
  }

  static async findByEmail(email) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] || null;
  }

  static async findByGoogleId(googleId) {
    const pool = dbManager.getDatabase();
    const { rows } = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
    return rows[0] || null;
  }

  static async updateOnboarding(userId, data) {
    const pool = dbManager.getDatabase();
    await pool.query(
      `UPDATE users
       SET target_countries = $1, intended_majors = $2, test_status = $3,
           language_preferences = $4, onboarding_complete = TRUE, updated_at = NOW()
       WHERE id = $5`,
      [
        JSON.stringify(data.target_countries),
        JSON.stringify(data.intended_majors),
        JSON.stringify(data.test_status),
        JSON.stringify(data.language_preferences),
        userId
      ]
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
