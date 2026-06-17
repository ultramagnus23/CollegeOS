const logger = require('../utils/logger');

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        value: detail.context?.value,
        expected: detail.type,
        message: detail.message
      }));
      
      logger.warn('Validation failed:', errors);
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    req.validatedData = value;
    next();
  };
};

/**
 * Strictly parse an integer from a string.
 * Returns null if the string contains any non-digit characters,
 * preventing "123abc" → 123 or "123 " → 123 coercion bugs.
 */
function strictInt(value, fallback = null) {
  if (value == null) return fallback;
  const str = String(value).trim();
  if (!/^\d+$/.test(str)) return fallback;
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return num;
}

module.exports = { validate, strictInt };

