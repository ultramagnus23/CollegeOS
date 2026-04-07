const AuthService = require('../services/authService');
const User = require('../models/User');
const StudentProfile = require('../models/StudentProfile');
const logger = require('../utils/logger');

class AuthController {
  // Register
  static async register(req, res, next) {
    try {
      const { email, password, fullName, country } = req.validatedData;
      
      const result = await AuthService.register(email, password, fullName, country);
      
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Login
  static async login(req, res, next) {
    try {
      const { email, password } = req.validatedData;
      
      const result = await AuthService.login(email, password);
      
      res.json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Refresh token
  static async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }
      
      const result = await AuthService.refreshAccessToken(refreshToken);
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Logout
  static async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        await AuthService.logout(refreshToken);
      }
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Get current user
  static async getCurrentUser(req, res, next) {
    try {
      const user = await User.findById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        data: AuthService.sanitizeUser(user)
      });
    } catch (error) {
      next(error);
    }
  }
  
  // Complete onboarding
  static async completeOnboarding(req, res, next) {
    try {
      const userId = req.user.userId;
      const data = req.validatedData;

      const user = await User.updateOnboarding(userId, data);

      // Persist extended profile fields (always — students need not fill every field)
      try {
        await StudentProfile.upsert(userId, {
          ...data,
          why_college_matters: data.why_college_matters || null,
          life_goals_raw:      data.life_goals_raw      || null,
        });
      } catch (profileErr) {
        logger.error('Failed to upsert student profile during onboarding', { userId, error: profileErr?.message });
      }

      // Compute values vector asynchronously (non-blocking — does not affect response)
      const whyText  = (data.why_college_matters || '').trim();
      const goalsText = (data.life_goals_raw      || '').trim();
      if (whyText || goalsText) {
        setImmediate(async () => {
          try {
            const { computeValuesVector } = require('../services/valuesEngine');
            const dbManager = require('../config/database');
            const vector = await computeValuesVector(whyText, goalsText);
            if (vector) {
              const pool = dbManager.getDatabase();
              await pool.query(
                `UPDATE student_profiles
                    SET values_vector = $1, values_computed_at = NOW()
                  WHERE user_id = $2`,
                [JSON.stringify(vector), userId]
              );
              logger.info('Values vector computed and saved during onboarding', { userId });
            }
          } catch (veErr) {
            logger.error('Values vector computation failed (non-fatal)', { userId, error: veErr?.message });
          }
        });
      }

      res.json({
        success: true,
        message: 'Onboarding completed successfully',
        data: AuthService.sanitizeUser(user)
      });
    } catch (error) {
      next(error);
    }
  }

  // Mark tour complete
  static async completeTour(req, res, next) {
    try {
      const user = await User.markTourComplete(req.user.userId);
      res.json({
        success: true,
        data: AuthService.sanitizeUser(user)
      });
    } catch (error) {
      next(error);
    }
  }
  // Google login / register via Firebase
  static async googleLogin(req, res, next) {
    try {
      const { googleId, email, name } = req.body;

      if (!googleId || !email) {
        return res.status(400).json({
          success: false,
          message: 'googleId and email are required'
        });
      }

      const result = await AuthService.googleLogin(googleId, email, name || 'Google User');

      res.json({
        success: true,
        message: 'Google authentication successful',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
