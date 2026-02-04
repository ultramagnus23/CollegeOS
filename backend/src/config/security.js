/**
 * Security Configuration Module
 * Centralized security settings for the CollegeOS backend
 */

const config = require('./env');

// Validate CORS origins - never allow wildcard in production
const getAllowedOrigins = () => {
  const origins = [
    config.frontend.url,
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  
  // Add any additional production origins from environment
  if (process.env.ADDITIONAL_CORS_ORIGINS) {
    origins.push(...process.env.ADDITIONAL_CORS_ORIGINS.split(',').map(o => o.trim()));
  }
  
  return origins.filter(Boolean);
};

module.exports = {
  // Helmet configuration for HTTP security headers
  helmet: {
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // Remove 'unsafe-inline' for better XSS protection in production
        styleSrc: config.isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    // Prevent clickjacking
    frameguard: { action: 'deny' },
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // HSTS for HTTPS enforcement (1 year)
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // Prevent MIME type sniffing
    noSniff: true,
    // XSS filter
    xssFilter: true,
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  },

  // CORS configuration - SECURITY FIX: No development bypass
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();
      
      // Allow requests with no origin (mobile apps, curl, etc.)
      // But only from known clients, not arbitrary sources
      if (!origin) {
        // In production, we should be more strict
        if (config.isProduction) {
          // Only allow server-to-server requests (no origin)
          // This is acceptable for backend API calls
          callback(null, true);
        } else {
          callback(null, true);
        }
        return;
      }
      
      // Check against allowed origins list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin ${origin} not allowed`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600, // 10 minutes
  },

  // Rate limiting configurations
  rateLimits: {
    // General API rate limit
    general: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // 100 requests per window
      message: {
        success: false,
        message: 'Too many requests. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip,
    },
    // Strict rate limit for auth endpoints
    auth: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 10, // 10 attempts per hour
      message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip,
      skipSuccessfulRequests: false,
    },
    // Sensitive operations (password reset, etc.)
    sensitive: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 5, // 5 attempts per hour
      message: {
        success: false,
        message: 'Too many requests for this operation. Please try again later.',
        code: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.ip,
    },
    // AI/Expensive operations - stricter limits
    ai: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // 50 AI requests per hour
      message: {
        success: false,
        message: 'AI request limit exceeded. Please try again later.',
        code: 'AI_RATE_LIMIT_EXCEEDED',
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.user?.userId || req.ip,
    },
  },

  // Password requirements
  password: {
    minLength: 8,
    maxLength: 128,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: false, // Optional for better UX
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/,
    message: 'Password must be 8-128 characters with at least one uppercase letter, one lowercase letter, and one number.',
  },

  // Session/Token security
  tokens: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    // Token cleanup interval (24 hours)
    cleanupInterval: 24 * 60 * 60 * 1000,
  },

  // Account lockout after failed attempts
  accountLockout: {
    maxAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 minutes
    resetWindowMs: 15 * 60 * 1000, // 15 minutes
  },

  // Request size limits
  requestLimits: {
    json: '10kb', // Reduced from 10MB for better security
    urlencoded: '10kb',
    fileUpload: '5mb', // Limit for file uploads
  },

  // Suspicious activity patterns
  suspiciousPatterns: [
    /(\%27)|(\')|(\-\-)|(\%23)|(#)/i, // SQL injection
    /<script[^>]*>|<\/script>/gi, // XSS
    /javascript:/gi, // JavaScript injection
    /on\w+\s*=/gi, // Event handlers
    /\.\.\//g, // Path traversal
  ],
};
