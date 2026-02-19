const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const { validate } = require('../middleware/validation');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const validators = require('../utils/validators');

// Public routes
router.post('/register', authLimiter, validate(validators.registerUser), AuthController.register);
router.post('/login', authLimiter, validate(validators.loginUser), AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);

// Protected routes
router.get('/me', authenticate, AuthController.getCurrentUser);
router.put('/onboarding', authenticate, validate(validators.onboarding), AuthController.completeOnboarding);

module.exports = router;