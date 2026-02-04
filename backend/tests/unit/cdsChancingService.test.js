/**
 * CDSChancingService Tests
 * Tests the CDS-based chancing calculations without database dependency
 */

// Mock the database manager to avoid actual DB connection
jest.mock('../../src/config/database', () => ({
  getDatabase: jest.fn()
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const { calculateCDSChance, hasCDSData, getCDSKey } = require('../../src/services/cdsChancingService');

describe('CDSChancingService', () => {
  describe('getCDSKey', () => {
    it('should find Harvard University', () => {
      const key = getCDSKey('Harvard University');
      expect(key).toBe('harvard_university');
    });

    it('should find MIT', () => {
      const key = getCDSKey('Massachusetts Institute of Technology');
      expect(key).toBe('mit');
    });

    it('should return null for unknown college', () => {
      const key = getCDSKey('Unknown College XYZ');
      expect(key).toBeNull();
    });

    it('should find Stanford', () => {
      const key = getCDSKey('Stanford University');
      expect(key).toBe('stanford_university');
    });
  });

  describe('hasCDSData', () => {
    it('should return true for colleges with CDS data', () => {
      expect(hasCDSData('Harvard University')).toBe(true);
      expect(hasCDSData('Yale University')).toBe(true);
      expect(hasCDSData('Princeton University')).toBe(true);
    });

    it('should return false for colleges without CDS data', () => {
      expect(hasCDSData('Random State University')).toBe(false);
      expect(hasCDSData('Unknown College')).toBe(false);
    });
  });

  describe('calculateCDSChance', () => {
    it('should calculate chance for Harvard with strong profile', () => {
      const studentProfile = {
        sat_total: 1550,
        gpa_unweighted: 3.95,
        activities: [
          { tier_rating: 1 },
          { tier_rating: 1 },
          { tier_rating: 2 }
        ],
        coursework: [
          { course_level: 'AP' },
          { course_level: 'AP' },
          { course_level: 'AP' },
          { course_level: 'AP' },
          { course_level: 'AP' },
          { course_level: 'AP' },
          { course_level: 'AP' },
          { course_level: 'AP' }
        ]
      };
      
      const college = { name: 'Harvard University' };
      
      const result = calculateCDSChance(studentProfile, college);
      
      expect(result).not.toBeNull();
      expect(result.percentage).toBeGreaterThan(0);
      expect(result.percentage).toBeLessThan(100);
      expect(result.cdsBasedCalculation).toBe(true);
      expect(result.factors).toBeDefined();
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should return null for college without CDS data', () => {
      const studentProfile = {
        sat_total: 1400,
        gpa_unweighted: 3.5
      };
      
      const college = { name: 'Unknown College XYZ' };
      
      const result = calculateCDSChance(studentProfile, college);
      
      expect(result).toBeNull();
    });

    it('should include comparison to admitted students', () => {
      const studentProfile = {
        sat_total: 1480,
        gpa_unweighted: 3.8
      };
      
      const college = { name: 'Yale University' };
      
      const result = calculateCDSChance(studentProfile, college);
      
      expect(result).not.toBeNull();
      expect(result.comparisonToAdmitted).toBeDefined();
      expect(result.comparisonToAdmitted.sat).toBeDefined();
      expect(result.comparisonToAdmitted.sat.student).toBe(1480);
    });

    it('should calculate improvement suggestions', () => {
      const studentProfile = {
        sat_total: 1350, // Below 25th percentile for most top schools
        gpa_unweighted: 3.5,
        activities: [{ tier_rating: 3 }]
      };
      
      const college = { name: 'MIT' };
      
      const result = calculateCDSChance(studentProfile, college);
      
      expect(result).not.toBeNull();
      expect(result.improvements).toBeDefined();
      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it('should classify as reach for highly selective schools', () => {
      const studentProfile = {
        sat_total: 1400,
        gpa_unweighted: 3.7
      };
      
      const college = { name: 'Stanford University' };
      
      const result = calculateCDSChance(studentProfile, college);
      
      expect(result).not.toBeNull();
      // Stanford with 3.6% acceptance rate should be reach for most
      expect(result.category).toBe('reach');
    });

    it('should handle profile with first-gen status', () => {
      const studentProfile = {
        sat_total: 1500,
        gpa_unweighted: 3.9,
        is_first_generation: true
      };
      
      const college = { name: 'Columbia University' };
      
      const result = calculateCDSChance(studentProfile, college);
      
      expect(result).not.toBeNull();
      const firstGenFactor = result.factors.find(f => f.name === 'First-Generation');
      expect(firstGenFactor).toBeDefined();
      expect(firstGenFactor.impact).toBe('positive');
    });

    it('should calculate confidence level based on data completeness', () => {
      // Complete profile
      const completeProfile = {
        sat_total: 1500,
        gpa_unweighted: 3.9,
        activities: [{ tier_rating: 2 }]
      };
      
      // Sparse profile
      const sparseProfile = {
        gpa_unweighted: 3.9
      };
      
      const college = { name: 'Duke University' };
      
      const result1 = calculateCDSChance(completeProfile, college);
      const result2 = calculateCDSChance(sparseProfile, college);
      
      expect(result1.confidence).toBeGreaterThan(result2.confidence);
    });
  });
});
