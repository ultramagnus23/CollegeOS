const AuthService = require('../services/authService');
const User = require('../models/User');
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
      const user = User.findById(req.user.userId);
      
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
      
      const user = User.updateOnboarding(userId, data);
      
      res.json({
        success: true,
        message: 'Onboarding completed successfully',
        data: AuthService.sanitizeUser(user)
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;