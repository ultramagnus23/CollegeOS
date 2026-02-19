const crypto = require('crypto');

class Helpers {
  // Generate unique ID
  static generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const randomStr = crypto.randomBytes(4).toString('hex');
    return `${prefix}${timestamp}${randomStr}`;
  }
  
  // Calculate days until date
  static daysUntil(targetDate) {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
  
  // Format date for display
  static formatDate(date, format = 'short') {
    const d = new Date(date);
    
    if (format === 'short') {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } else if (format === 'long') {
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    
    return d.toISOString();
  }
  
  // Sanitize string for database
  static sanitize(str) {
    if (!str) return '';
    return str.trim().replace(/[<>]/g, '');
  }
  
  // Extract domain from URL
  static extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return null;
    }
  }
  
  // Sleep function for rate limiting
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Chunk array
  static chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = Helpers;