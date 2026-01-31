const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const dbManager = require('../config/database');
const config = require('../config/env');
const securityConfig = require('../config/security');
const logger = require('../utils/logger');

// In-memory store for login attempts (use Redis in production)
const loginAttempts = new Map();

class AuthService {
  /**
   * Check if an account is locked due to failed login attempts
   */
  static isAccountLocked(email) {
    const attempts = loginAttempts.get(email);
    if (!attempts) return false;
    
    const { count, lastAttempt, lockedUntil } = attempts;
    
    // Check if still locked
    if (lockedUntil && Date.now() < lockedUntil) {
      return true;
    }
    
    // Reset if lock has expired
    if (lockedUntil && Date.now() >= lockedUntil) {
      loginAttempts.delete(email);
      return false;
    }
    
    return false;
  }

  /**
   * Record a failed login attempt
   */
  static recordFailedAttempt(email) {
    const now = Date.now();
    const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: now };
    
    // Reset count if outside the window
    if (now - attempts.lastAttempt > securityConfig.accountLockout.resetWindowMs) {
      attempts.count = 0;
    }
    
    attempts.count += 1;
    attempts.lastAttempt = now;
    
    // Lock account if max attempts exceeded
    if (attempts.count >= securityConfig.accountLockout.maxAttempts) {
      attempts.lockedUntil = now + securityConfig.accountLockout.lockoutDuration;
      logger.warn(`Account locked due to failed login attempts: ${email}`);
    }
    
    loginAttempts.set(email, attempts);
  }

  /**
   * Clear failed login attempts after successful login
   */
  static clearFailedAttempts(email) {
    loginAttempts.delete(email);
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
      
      logger.info(`User registered: ${normalizedEmail}`);
      
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
        logger.warn(`Login attempt on locked account: ${normalizedEmail}`);
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
      
      logger.info(`User logged in: ${normalizedEmail}`);
      
      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }
  
  // Google OAuth login/register
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
      
      logger.info(`User authenticated via Google: ${user.email}`);
      
      return {
        user: this.sanitizeUser(user),
        tokens
      };
    } catch (error) {
      logger.error('Google auth failed:', error);
      throw error;
    }
  }
  
  // Refresh access token
  static async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      
      // Check if token exists in database
      const db = dbManager.getDatabase();
      const stmt = db.prepare(`
        SELECT * FROM refresh_tokens 
        WHERE token = ? AND user_id = ? AND expires_at > datetime('now')
      `);
      const tokenRecord = stmt.get(refreshToken, decoded.userId);
      
      if (!tokenRecord) {
        throw new Error('Invalid refresh token');
      }
      
      // Get user
      const user = User.findById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }
      
      // Generate new access token
      const accessToken = this.generateAccessToken(user);
      
      return { accessToken };
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
      throw new Error('Invalid token');
    }
  }
}

module.exports = AuthService;