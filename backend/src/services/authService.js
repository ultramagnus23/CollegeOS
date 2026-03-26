const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const dbManager = require('../config/database');
const config = require('../config/env');
const securityConfig = require('../config/security');
const logger = require('../utils/logger');
const { sanitizeForLog } = require('../utils/security');

class AuthService {
  /**
   * Check if an account is locked due to failed login attempts (SQLite-backed)
   */
  static isAccountLocked(email) {
    try {
      const db = dbManager.getDatabase();
      const row = db.prepare('SELECT count, last_attempt, locked_until FROM login_attempts WHERE email = ?').get(email);
      if (!row) return false;

      const now = Date.now();

      // Check if still locked
      if (row.locked_until && now < row.locked_until) {
        return true;
      }

      // Reset if lock has expired
      if (row.locked_until && now >= row.locked_until) {
        db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
        return false;
      }

      return false;
    } catch (error) {
      logger.error('isAccountLocked DB error:', { error: error?.message });
      return false;
    }
  }

  /**
   * Record a failed login attempt (SQLite-backed)
   */
  static recordFailedAttempt(email) {
    try {
      const db = dbManager.getDatabase();
      const now = Date.now();
      const existing = db.prepare('SELECT count, last_attempt FROM login_attempts WHERE email = ?').get(email);

      let newCount = 1;
      if (existing) {
        // Reset count if outside the window
        const resetWindow = securityConfig.accountLockout?.resetWindowMs || 900000;
        newCount = (now - existing.last_attempt > resetWindow) ? 1 : existing.count + 1;
      }

      const maxAttempts = securityConfig.accountLockout?.maxAttempts || 5;
      const lockoutDuration = securityConfig.accountLockout?.lockoutDuration || 900000;
      const lockedUntil = newCount >= maxAttempts ? now + lockoutDuration : 0;

      if (lockedUntil) {
        logger.warn('Account locked due to failed login attempts', { email: sanitizeForLog(email) });
      }

      db.prepare(`
        INSERT INTO login_attempts (email, count, last_attempt, locked_until)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          count = excluded.count,
          last_attempt = excluded.last_attempt,
          locked_until = excluded.locked_until
      `).run(email, newCount, now, lockedUntil);
    } catch (error) {
      logger.error('recordFailedAttempt DB error:', { error: error?.message });
    }
  }

  /**
   * Clear failed login attempts after successful login (SQLite-backed)
   */
  static clearFailedAttempts(email) {
    try {
      const db = dbManager.getDatabase();
      db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
    } catch (error) {
      logger.error('clearFailedAttempts DB error:', { error: error?.message });
    }
  }

  // Register new user with email/password
  static async register(email, password, fullName, country) {
    try {
      // Normalize email
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user exists
      const existingUser = User.findByEmail(normalizedEmail);
      if (existingUser) {
        throw new Error('User already exists with this email');
      }
      
      // Hash password
      const passwordHash = await User.hashPassword(password);
      
      // Create user
      const user = User.create({
        email: normalizedEmail,
        passwordHash,
        googleId: null,
        fullName,
        country
      });
      
      // Generate tokens
      const tokens = this.generateTokens(user);
      
      // Store refresh token
      this.storeRefreshToken(user.id, tokens.refreshToken);
      
      logger.info(`User registered: ${sanitizeForLog(normalizedEmail)}`);
      
      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      logger.error('Registration failed:', error);
      throw error;
    }
  }
  
  // Login with email/password
  static async login(email, password) {
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    
    try {
      // Check if account is locked
      if (this.isAccountLocked(normalizedEmail)) {
        logger.warn(`Login attempt on locked account: ${sanitizeForLog(normalizedEmail)}`);
        throw new Error('Account temporarily locked. Please try again later.');
      }
      
      // Find user
      const user = User.findByEmail(normalizedEmail);
      if (!user || !user.password_hash) {
        this.recordFailedAttempt(normalizedEmail);
        throw new Error('Invalid email or password');
      }
      
      // Verify password
      const isValid = await User.comparePassword(password, user.password_hash);
      if (!isValid) {
        this.recordFailedAttempt(normalizedEmail);
        throw new Error('Invalid email or password');
      }
      
      // Clear failed attempts on successful login
      this.clearFailedAttempts(normalizedEmail);
      
      // Generate tokens
      const tokens = this.generateTokens(user);
      
      // Store refresh token
      this.storeRefreshToken(user.id, tokens.refreshToken);
      
      logger.info(`User logged in: ${sanitizeForLog(normalizedEmail)}`);
      
      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }
  
  // Google OAuth login/register (legacy Passport.js profile format)
  static async googleAuth(profile) {
    try {
      let user = User.findByGoogleId(profile.id);
      
      if (!user) {
        // Check if email exists
        user = User.findByEmail(profile.emails[0].value);
        
        if (user) {
          // Link Google account to existing user
          const db = dbManager.getDatabase();
          const stmt = db.prepare('UPDATE users SET google_id = ? WHERE id = ?');
          stmt.run(profile.id, user.id);
          user = User.findById(user.id);
        } else {
          // Create new user
          user = User.create({
            email: profile.emails[0].value,
            passwordHash: null,
            googleId: profile.id,
            fullName: profile.displayName,
            country: 'Unknown' // Will be set during onboarding
          });
        }
      }
      
      // Generate tokens
      const tokens = this.generateTokens(user);
      
      // Store refresh token
      this.storeRefreshToken(user.id, tokens.refreshToken);
      
      logger.info(`User authenticated via Google: ${sanitizeForLog(user.email)}`);
      
      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      logger.error('Google auth failed:', error);
      throw error;
    }
  }

  // Google login / register via Firebase (googleId, email, name)
  static async googleLogin(googleId, email, name) {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      let user = User.findByGoogleId(googleId);

      if (!user) {
        // Check if email already exists and link account
        user = User.findByEmail(normalizedEmail);

        if (user) {
          const db = dbManager.getDatabase();
          const stmt = db.prepare('UPDATE users SET google_id = ? WHERE id = ?');
          stmt.run(googleId, user.id);
          user = User.findById(user.id);
        } else {
          // Create new user
          user = User.create({
            email: normalizedEmail,
            passwordHash: null,
            googleId,
            fullName: name,
            country: 'Unknown' // Will be set during onboarding
          });
        }
      }

      // Generate tokens
      const tokens = this.generateTokens(user);

      // Store refresh token
      this.storeRefreshToken(user.id, tokens.refreshToken);

      logger.info('User authenticated via Google Firebase', { email: sanitizeForLog(normalizedEmail) });

      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      logger.error('Google Firebase login failed:', { error: error?.message });
      throw error;
    }
  }

  // Refresh access token — rotates refresh token on each use
  static async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token signature and expiry
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);

      // Check if token exists in database and has not expired
      const db = dbManager.getDatabase();
      const tokenRecord = db.prepare(`
        SELECT * FROM refresh_tokens
        WHERE token = ? AND user_id = ? AND expires_at > datetime('now')
      `).get(refreshToken, decoded.userId);

      if (!tokenRecord) {
        throw new Error('Invalid refresh token');
      }

      // Get user
      const user = User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // --- Token rotation: delete old token, issue new refresh token ---
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);

      const newRefreshToken = this.generateRefreshToken(user);
      this.storeRefreshToken(user.id, newRefreshToken);

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw error;
    }
  }
  
  // Logout
  static async logout(refreshToken) {
    try {
      const db = dbManager.getDatabase();
      const stmt = db.prepare('DELETE FROM refresh_tokens WHERE token = ?');
      stmt.run(refreshToken);
      
      logger.info('User logged out');
    } catch (error) {
      logger.error('Logout failed:', error);
      throw error;
    }
  }
  
  // Generate access and refresh tokens
  static generateTokens(user) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);
    
    return { accessToken, refreshToken };
  }
  
  // Generate access token
  static generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );
  }
  
  // Generate refresh token
  static generateRefreshToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        tokenId: crypto.randomBytes(32).toString('hex')
      },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );
  }
  
  // Store refresh token in database
  static storeRefreshToken(userId, token) {
    const db = dbManager.getDatabase();
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 7); // 7 days
    
    const stmt = db.prepare(`
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(userId, token, expiryDate.toISOString());
  }
  
  // Sanitize user object (remove sensitive data)
  static sanitizeUser(user) {
    const { password_hash, ...sanitized } = user;
    return sanitized;
  }
  
  // Verify JWT token
  static verifyToken(token) {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      // Provide detailed error logging to distinguish different error types
      if (error.name === 'TokenExpiredError') {
        logger.warn('Token verification failed: Token expired', {
          expiredAt: error.expiredAt
        });
        throw new Error('Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        logger.warn('Token verification failed: Malformed token', {
          message: error.message
        });
        throw new Error('Invalid token - malformed');
      } else if (error.name === 'NotBeforeError') {
        logger.warn('Token verification failed: Token not yet valid', {
          date: error.date
        });
        throw new Error('Token not yet valid');
      } else {
        logger.error('Token verification failed: Unknown error', {
          name: error.name,
          message: error.message
        });
        throw new Error('Invalid token');
      }
    }
  }
}

module.exports = AuthService;