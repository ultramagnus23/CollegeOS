/**
 * FitClassificationService Tests
 */

const FitClassificationService = require('../../src/services/fitClassificationService');

describe('FitClassificationService', () => {
  describe('normalizeGPA', () => {
    it('should return same value for 4.0 scale', () => {
      expect(FitClassificationService.normalizeGPA(3.5, '4.0')).toBe(3.5);
    });

    it('should convert 5.0 scale to 4.0', () => {
      expect(FitClassificationService.normalizeGPA(5.0, '5.0')).toBe(4.0);
      expect(FitClassificationService.normalizeGPA(4.0, '5.0')).toBe(3.2);
    });

    it('should convert 10.0 scale to 4.0', () => {
      expect(FitClassificationService.normalizeGPA(10.0, '10.0')).toBe(4.0);
      expect(FitClassificationService.normalizeGPA(8.0, '10.0')).toBe(3.2);
    });

    it('should convert percentage to 4.0', () => {
      expect(FitClassificationService.normalizeGPA(100, 'percentage')).toBe(4.0);
      expect(FitClassificationService.normalizeGPA(80, 'percentage')).toBe(3.2);
    });
  });

  describe('parseSATRange', () => {
    it('should parse valid SAT range', () => {
      const [min, max] = FitClassificationService.parseSATRange('1400-1550');
      expect(min).toBe(1400);
      expect(max).toBe(1550);
    });

    it('should handle null/undefined', () => {
      const [min, max] = FitClassificationService.parseSATRange(null);
      expect(min).toBe(0);
      expect(max).toBe(1600);
    });

    it('should handle single value', () => {
      const [min, max] = FitClassificationService.parseSATRange('1500');
      expect(min).toBe(1500);
      expect(max).toBe(1500);
    });
  });

  describe('parseACTRange', () => {
    it('should parse valid ACT range', () => {
      const [min, max] = FitClassificationService.parseACTRange('32-35');
      expect(min).toBe(32);
      expect(max).toBe(35);
    });

    it('should handle null/undefined', () => {
      const [min, max] = FitClassificationService.parseACTRange(null);
      expect(min).toBe(0);
      expect(max).toBe(36);
    });
  });

  describe('scoreToCategory', () => {
    it('should classify safety for scores >= 80', () => {
      expect(FitClassificationService.scoreToCategory(80)).toBe('safety');
      expect(FitClassificationService.scoreToCategory(95)).toBe('safety');
    });

    it('should classify target for scores 55-79', () => {
      expect(FitClassificationService.scoreToCategory(55)).toBe('target');
      expect(FitClassificationService.scoreToCategory(79)).toBe('target');
    });

    it('should classify reach for scores 30-54', () => {
      expect(FitClassificationService.scoreToCategory(30)).toBe('reach');
      expect(FitClassificationService.scoreToCategory(54)).toBe('reach');
    });

    it('should classify unrealistic for scores < 30', () => {
      expect(FitClassificationService.scoreToCategory(29)).toBe('unrealistic');
      expect(FitClassificationService.scoreToCategory(0)).toBe('unrealistic');
    });
  });

  describe('determineCategory', () => {
    it('should return safety when both scores are high', () => {
      expect(FitClassificationService.determineCategory(90, 85)).toBe('safety');
    });

    it('should return target for moderate scores', () => {
      expect(FitClassificationService.determineCategory(70, 65)).toBe('target');
    });

    it('should return reach for lower scores', () => {
      expect(FitClassificationService.determineCategory(45, 40)).toBe('reach');
    });

    it('should return unrealistic for very low scores', () => {
      expect(FitClassificationService.determineCategory(20, 15)).toBe('unrealistic');
    });

    it('should factor in academic score as tiebreaker', () => {
      // High overall but low academic - academic score is weighted heavily
      // With overall 80 and academic 50, the academic score pulls it down from safety
      expect(FitClassificationService.determineCategory(80, 50)).toBe('reach');
    });
  });

  describe('calculateAcademicFit', () => {
    it('should calculate academic fit with GPA comparison', () => {
      const profile = {
        gpa: 3.8,
        gpaScale: '4.0',
        satTotal: 1500
      };
      
      const college = {
        averageGpa: 3.5,
        satRange: '1400-1550'
      };
      
      const result = FitClassificationService.calculateAcademicFit(profile, college);
      
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('factors');
      expect(result.score).toBeGreaterThan(0);
      expect(result.factors.length).toBeGreaterThan(0);
    });

    it('should return safety for significantly higher GPA', () => {
      const profile = {
        gpa: 4.0,
        gpaScale: '4.0'
      };
      
      const college = {
        averageGpa: 3.5
      };
      
      const result = FitClassificationService.calculateAcademicFit(profile, college);
      
      // 4.0 - 3.5 = 0.5 difference, which is >= 0.3, so should be high score
      expect(result.score).toBeGreaterThan(80);
    });

    it('should return lower score for lower GPA', () => {
      const profile = {
        gpa: 3.0,
        gpaScale: '4.0'
      };
      
      const college = {
        averageGpa: 3.8
      };
      
      const result = FitClassificationService.calculateAcademicFit(profile, college);
      
      // 3.0 - 3.8 = -0.8 difference, which is a significant gap
      expect(result.score).toBeLessThan(50);
    });
  });

  describe('calculateFinancialFit', () => {
    it('should return high score when budget exceeds cost', () => {
      const profile = {
        budgetMax: 80000
      };
      
      const college = {
        tuitionInternational: 50000
      };
      
      const result = FitClassificationService.calculateFinancialFit(profile, college);
      
      expect(result.score).toBeGreaterThan(70);
    });

    it('should return low score when cost exceeds budget', () => {
      const profile = {
        budgetMax: 30000
      };
      
      const college = {
        tuitionInternational: 80000
      };
      
      const result = FitClassificationService.calculateFinancialFit(profile, college);
      
      expect(result.score).toBeLessThan(50);
    });
  });

  describe('calculateConfidence', () => {
    it('should return higher confidence with more data points', () => {
      const fullProfile = {
        gpa: 3.5,
        satTotal: 1400,
        actComposite: 32,
        activitiesCount: 5
      };
      
      const fullCollege = {
        averageGpa: 3.6,
        satRange: '1400-1550',
        acceptanceRate: 0.15,
        tuitionInternational: 70000
      };
      
      const confidence1 = FitClassificationService.calculateConfidence(fullProfile, fullCollege);
      
      const sparseProfile = {
        gpa: 3.5
      };
      
      const sparseCollege = {
        averageGpa: 3.6
      };
      
      const confidence2 = FitClassificationService.calculateConfidence(sparseProfile, sparseCollege);
      
      expect(confidence1).toBeGreaterThan(confidence2);
    });
  });

  describe('DEFAULT_WEIGHTS', () => {
    it('should have weights that sum to 1.0', () => {
      const weights = FitClassificationService.DEFAULT_WEIGHTS;
      const sum = weights.academic + weights.profile + weights.financial + weights.timeline;
      
      expect(sum).toBe(1.0);
    });
  });
});
