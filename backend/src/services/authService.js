const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const dbManager = require('../config/database');
const config = require('../config/env');
const securityConfig = require('../config/security');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

class AuthService {
  static async isAccountLocked(email) {
    try {
      const pool = dbManager.getDatabase();
      const { rows } = await pool.query(
        'SELECT count, last_attempt, locked_until FROM login_attempts WHERE email = $1',
        [email]
      );
      if (!rows[0]) return false;
      const row = rows[0];
      const now = Date.now();
      if (row.locked_until && now < parseInt(row.locked_until)) return true;
      if (row.locked_until && now >= parseInt(row.locked_until)) {
        await pool.query('DELETE FROM login_attempts WHERE email = $1', [email]);
        return false;
      }
      return false;
    } catch (error) {
      logger.error('isAccountLocked DB error:', { error: error?.message });
      return false;
    }
  }

  static async recordFailedAttempt(email) {
    try {
      const pool = dbManager.getDatabase();
      const now = Date.now();
      const { rows } = await pool.query(
        'SELECT count, last_attempt FROM login_attempts WHERE email = $1',
        [email]
      );
      const existing = rows[0];
      let newCount = 1;
      if (existing) {
        const resetWindow = securityConfig.accountLockout?.resetWindowMs || 900000;
        newCount = (now - parseInt(existing.last_attempt) > resetWindow) ? 1 : parseInt(existing.count) + 1;
      }
      const maxAttempts = securityConfig.accountLockout?.maxAttempts || 5;
      const lockoutDuration = securityConfig.accountLockout?.lockoutDuration || 900000;
      const lockedUntil = newCount >= maxAttempts ? now + lockoutDuration : 0;
      if (lockedUntil) {
        logger.warn('Account locked due to failed login attempts', { email: sanitizeForLog(email) });
      }
      await pool.query(
        `INSERT INTO login_attempts (email, count, last_attempt, locked_until)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           count = EXCLUDED.count,
           last_attempt = EXCLUDED.last_attempt,
           locked_until = EXCLUDED.locked_until`,
        [email, newCount, now, lockedUntil]
      );
    } catch (error) {
      logger.error('recordFailedAttempt DB error:', { error: error?.message });
    }
  }

  static async clearFailedAttempts(email) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query('DELETE FROM login_attempts WHERE email = $1', [email]);
    } catch (error) {
      logger.error('clearFailedAttempts DB error:', { error: error?.message });
    }
  }

  static async register(email, password, fullName, country) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      const existingUser = await User.findByEmail(normalizedEmail);
      if (existingUser) throw new Error('User already exists with this email');
      const passwordHash = await User.hashPassword(password);
      const user = await User.create({ email: normalizedEmail, passwordHash, googleId: null, fullName, country });
      const tokens = this.generateTokens(user);
      await this.storeRefreshToken(user.id, tokens.refreshToken);
      logger.info('User registered', { email: sanitizeForLog(normalizedEmail) });
      return { user: this.sanitizeUser(user), tokens };
    } catch (error) {
      logger.error('Registration failed:', error);
      throw error;
    }
  }

  static async login(email, password) {
    const normalizedEmail = email.toLowerCase().trim();
    try {
      if (await this.isAccountLocked(normalizedEmail)) {
        logger.warn('Login attempt on locked account', { email: sanitizeForLog(normalizedEmail) });
        throw new Error('Account temporarily locked. Please try again later.');
      }
      const user = await User.findByEmail(normalizedEmail);
      if (!user || !user.password_hash) {
        await this.recordFailedAttempt(normalizedEmail);
        throw new Error('Invalid email or password');
      }
      const isValid = await User.comparePassword(password, user.password_hash);
      if (!isValid) {
        await this.recordFailedAttempt(normalizedEmail);
        throw new Error('Invalid email or password');
      }
      await this.clearFailedAttempts(normalizedEmail);
      const tokens = this.generateTokens(user);
      await this.storeRefreshToken(user.id, tokens.refreshToken);
      logger.info('User logged in', { email: sanitizeForLog(normalizedEmail) });
      return { user: this.sanitizeUser(user), tokens };
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  static async googleAuth(profile) {
    try {
      let user = await User.findByGoogleId(profile.id);
      if (!user) {
        user = await User.findByEmail(profile.emails[0].value);
        if (user) {
          const pool = dbManager.getDatabase();
          await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [profile.id, user.id]);
          user = await User.findById(user.id);
        } else {
          user = await User.create({ email: profile.emails[0].value, passwordHash: null, googleId: profile.id, fullName: profile.displayName, country: 'Unknown' });
        }
      }
      const tokens = this.generateTokens(user);
      await this.storeRefreshToken(user.id, tokens.refreshToken);
      logger.info('User authenticated via Google', { email: sanitizeForLog(user.email) });
      return { user: this.sanitizeUser(user), tokens };
    } catch (error) {
      logger.error('Google auth failed:', error);
      throw error;
    }
  }

  static async googleLogin(googleId, email, name) {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      let user = await User.findByGoogleId(googleId);
      if (!user) {
        user = await User.findByEmail(normalizedEmail);
        if (user) {
          const pool = dbManager.getDatabase();
          await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
          user = await User.findById(user.id);
        } else {
          user = await User.create({ email: normalizedEmail, passwordHash: null, googleId, fullName: name, country: 'Unknown' });
        }
      }
      const tokens = this.generateTokens(user);
      await this.storeRefreshToken(user.id, tokens.refreshToken);
      logger.info('User authenticated via Google Firebase', { email: sanitizeForLog(normalizedEmail) });
      return { user: this.sanitizeUser(user), tokens };
    } catch (error) {
      logger.error('Google Firebase login failed:', { error: error?.message });
      throw error;
    }
  }

  static async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      const pool = dbManager.getDatabase();
      const { rows } = await pool.query(
        `SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2 AND expires_at > NOW()`,
        [refreshToken, decoded.userId]
      );
      if (!rows[0]) throw new Error('Invalid refresh token');
      const user = await User.findById(decoded.userId);
      if (!user) throw new Error('User not found');
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      const newRefreshToken = this.generateRefreshToken(user);
      await this.storeRefreshToken(user.id, newRefreshToken);
      const accessToken = this.generateAccessToken(user);
      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }

  static async logout(refreshToken) {
    try {
      const pool = dbManager.getDatabase();
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      logger.info('User logged out');
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  }

  static generateTokens(user) {
    return { accessToken: this.generateAccessToken(user), refreshToken: this.generateRefreshToken(user) };
  }

  static generateAccessToken(user) {
    return jwt.sign({ userId: user.id, email: user.email }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  }

  static generateRefreshToken(user) {
    return jwt.sign({ userId: user.id, tokenId: crypto.randomBytes(32).toString('hex') }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpiresIn });
  }

  static async storeRefreshToken(userId, token) {
    const pool = dbManager.getDatabase();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7);
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [userId, token, expiryDate.toISOString()]
    );
  }

  static sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        logger.warn('Token verification failed: Token expired', { expiredAt: error.expiredAt });
        throw new Error('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Token verification failed: Malformed token', { message: error.message });
        throw new Error('Invalid token - malformed');
      } else if (error.name === 'NotBeforeError') {
        logger.warn('Token verification failed: Token not yet valid', { date: error.date });
        throw new Error('Token not yet valid');
      } else {
        logger.error('Token verification failed: Unknown error', { name: error.name, message: error.message });
        throw new Error('Invalid token');
      }
    }
  }
}

module.exports = AuthService;
