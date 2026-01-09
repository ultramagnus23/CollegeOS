const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const dbManager = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');

class AuthService {
  // Register new user with email/password
  static async register(email, password, fullName, country) {
    try {
      // Check if user exists
      const existingUser = User.findByEmail(email);
      if (existingUser) {
        throw new Error('User already exists with this email');
      }
      
      // Hash password
      const passwordHash = await User.hashPassword(password);
      
      // Create user
      const user = User.create({
        email,
        passwordHash,
        googleId: null,
        fullName,
        country
      });
      
      // Generate tokens
      const tokens = this.generateTokens(user);
      
      // Store refresh token
      this.storeRefreshToken(user.id, tokens.refreshToken);
      
      logger.info(`User registered: ${email}`);
      
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
    try {
      // Find user
      const user = User.findByEmail(email);
      if (!user || !user.password_hash) {
        throw new Error('Invalid email or password');
      }
      
      // Verify password
      const isValid = await User.comparePassword(password, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid email or password');
      }
      
      // Generate tokens
      const tokens = this.generateTokens(user);
      
      // Store refresh token
      this.storeRefreshToken(user.id, tokens.refreshToken);
      
      logger.info(`User logged in: ${email}`);
      
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