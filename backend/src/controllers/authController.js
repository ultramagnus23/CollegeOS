const AuthService = require('../services/authService');
const User = require('../models/User');
const { processOnboardingPayload, OnboardingValidationError } = require('../services/onboardingService');
const { getSnapshot, logSnapshot } = require('../services/onboardingMetrics');
const { safeError, safeLog } = require('../utils/safeLogger');
const logger = require('../utils/logger');
const { reportError } = require('../utils/errorReporter');

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
      const { refreshToken } = req.validatedData || req.body;
      
      if (!refreshToken) {
        logger.warn('REFRESH_REQUEST_NO_TOKEN', {
          ip: req.ip,
          path: req.path
        });
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }
      
      logger.info('REFRESH_CONTROLLER_START', {
        userId: req.user?.userId || 'none',
        ip: req.ip,
        hasRefreshToken: !!refreshToken
      });
      
      const result = await AuthService.refreshAccessToken(refreshToken);
      
      logger.info('REFRESH_CONTROLLER_SUCCESS', {
        userId: req.user?.userId || 'none',
        hasNewAccessToken: !!result.accessToken,
        hasNewRefreshToken: !!result.refreshToken
      });
      
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('REFRESH_CONTROLLER_FAILURE', {
        error: error.message,
        ip: req.ip
      });
      next(error);
    }
  }
  
  // Logout
  static async logout(req, res, next) {
    try {
      const { refreshToken } = req.validatedData || req.body;
      if (!refreshToken) {
        return res.status(400).json({
          success: false,
          message: 'Refresh token is required'
        });
      }
      await AuthService.logout(refreshToken);
      
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
      const requestId = req.requestId || null;
      const { user, warnings, invalidFields } = await processOnboardingPayload({
        payload: req.body,
        requestId,
        userId,
      });

      safeLog('onboarding.completed', {
        requestId,
        userId,
        warningsCount: warnings.length,
        invalidFieldsCount: invalidFields.length,
        metrics: getSnapshot(),
      });
      logSnapshot({ requestId, userId, phase: 'complete_onboarding' });

      res.json({
        success: true,
        message: 'Onboarding completed successfully',
        warnings: warnings.map((warning) => warning.message),
        data: AuthService.sanitizeUser(user)
      });
    } catch (error) {
      if (error instanceof OnboardingValidationError) {
        reportError(logger, {
          category: 'onboarding',
          error,
          requestId: req.requestId || null,
          onboardingCorrelationId: req.requestId || `onboarding-${req.user?.userId || 'unknown'}`,
          context: {
            userId: req.user?.userId,
            invalidFields: error.details?.invalidFields || [],
            validationErrors: error.details?.validationErrors || [],
          },
          level: 'warn',
        });
        safeError('onboarding.validation_failed_response', {
          requestId: req.requestId || null,
          userId: req.user?.userId,
          invalidFields: error.details?.invalidFields || [],
          validationErrors: error.details?.validationErrors || [],
        });
        return res.status(400).json({
          success: false,
          message: error.message,
          warnings: (error.details?.warnings || []).map((warning) => warning.message),
          invalidFields: error.details?.invalidFields || [],
          errors: error.details?.validationErrors || [],
        });
      }
      reportError(logger, {
        category: 'onboarding',
        error,
        requestId: req.requestId || null,
        onboardingCorrelationId: req.requestId || `onboarding-${req.user?.userId || 'unknown'}`,
        context: {
          userId: req.user?.userId,
          route: '/api/auth/onboarding',
        },
      });
      return next(error);
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
      reportError(logger, {
        category: 'auth',
        error,
        requestId: req.requestId || null,
        context: {
          route: '/api/auth/google',
          hasGoogleId: Boolean(req.body?.googleId),
          hasEmail: Boolean(req.body?.email),
        },
      });
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

      logger.info('GOOGLE_LOGIN_START', {
        googleId: googleId.substring(0, 10) + '...',
        email: email,
        ip: req.ip
      });

      const result = await AuthService.googleLogin(googleId, email, name || 'Google User');

      logger.info('GOOGLE_LOGIN_SUCCESS', {
        userId: result.user.id,
        email: result.user.email,
        isNewUser: false,
        hasAccessToken: !!result.tokens?.accessToken,
        hasRefreshToken: !!result.tokens?.refreshToken
      });

      res.json({
        success: true,
        message: 'Google authentication successful',
        data: result
      });
    } catch (error) {
      logger.error('GOOGLE_LOGIN_FAILURE', {
        error: error.message,
        googleId: req.body?.googleId?.substring(0, 10) + '...',
        ip: req.ip
      });
      next(error);
    }
  }
}

module.exports = AuthController;
