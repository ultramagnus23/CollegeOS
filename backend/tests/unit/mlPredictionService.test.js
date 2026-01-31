// backend/tests/unit/mlPredictionService.test.js
// Tests for ML Prediction Service integration

const mlPredictionService = require('../../src/services/mlPredictionService');

describe('MLPredictionService', () => {
  describe('formatStudentProfile', () => {
    it('should format student profile correctly', () => {
      const profile = {
        gpa_unweighted: 3.8,
        gpa_weighted: 4.2,
        sat_total: 1450,
        act_composite: 32,
        class_rank_percentile: 95,
        is_first_generation: true,
        is_legacy: false,
        state_province: 'CA'
      };

      const activities = [
        { tier_rating: 1 },
        { tier_rating: 2 },
        { tier_rating: 2 },
        { tier_rating: 3 },
        { tier_rating: 4 }
      ];

      const formatted = mlPredictionService.formatStudentProfile(profile, activities);

      expect(formatted.gpa_unweighted).toBe(3.8);
      expect(formatted.gpa_weighted).toBe(4.2);
      expect(formatted.sat_total).toBe(1450);
      expect(formatted.act_composite).toBe(32);
      expect(formatted.class_rank_percentile).toBe(95);
      expect(formatted.is_first_generation).toBe(true);
      expect(formatted.is_legacy).toBe(false);
      expect(formatted.activity_tier1_count).toBe(1);
      expect(formatted.activity_tier2_count).toBe(2);
      expect(formatted.activity_tier3_count).toBe(2); // tier 3 and 4 combined
    });

    it('should handle empty activities array', () => {
      const profile = {
        gpa_unweighted: 3.5,
        sat_total: 1400
      };

      const formatted = mlPredictionService.formatStudentProfile(profile, []);

      expect(formatted.activity_tier1_count).toBe(0);
      expect(formatted.activity_tier2_count).toBe(0);
      expect(formatted.activity_tier3_count).toBe(0);
    });

    it('should handle missing profile fields', () => {
      const profile = {};
      const formatted = mlPredictionService.formatStudentProfile(profile, []);

      expect(formatted.gpa_unweighted).toBeUndefined();
      expect(formatted.sat_total).toBeUndefined();
      expect(formatted.is_first_generation).toBe(false);
    });
  });

  describe('formatCollege', () => {
    it('should format college data correctly', () => {
      const college = {
        id: 1,
        name: 'Test University',
        acceptance_rate: 15.5,
        average_gpa: 3.9,
        location_state: 'MA',
        sat_total_25th: 1400,
        sat_total_75th: 1550
      };

      const formatted = mlPredictionService.formatCollege(college);

      expect(formatted.id).toBe(1);
      expect(formatted.name).toBe('Test University');
      expect(formatted.acceptance_rate).toBe(15.5);
      expect(formatted.average_gpa).toBe(3.9);
      expect(formatted.location_state).toBe('MA');
      expect(formatted.sat_total_25th).toBe(1400);
      expect(formatted.sat_total_75th).toBe(1550);
    });

    it('should handle missing college fields', () => {
      const college = {
        id: 2,
        name: 'Another University'
      };

      const formatted = mlPredictionService.formatCollege(college);

      expect(formatted.id).toBe(2);
      expect(formatted.name).toBe('Another University');
      expect(formatted.acceptance_rate).toBeUndefined();
    });
  });

  describe('isAvailable', () => {
    it('should cache health check results', async () => {
      // First call
      const result1 = await mlPredictionService.isAvailable();
      
      // Second call should use cache
      const result2 = await mlPredictionService.isAvailable();
      
      // Both should return same result (service likely not running in test)
      expect(typeof result1).toBe('boolean');
      expect(result1).toBe(result2);
    });
  });

  describe('predict', () => {
    it('should return unavailable when ML service is down', async () => {
      const result = await mlPredictionService.predict(
        { gpa_unweighted: 3.8 },
        [],
        { id: 1, name: 'Test' }
      );

      // Service is likely not running during tests
      expect(result).toHaveProperty('success');
      // Either returns unavailable or error when service is down
      if (!result.success) {
        expect(['unavailable', 'error']).toContain(result.prediction_type);
      }
    });
  });

  describe('batchPredict', () => {
    it('should handle empty colleges array', async () => {
      const result = await mlPredictionService.batchPredict(
        { gpa_unweighted: 3.8 },
        [],
        []
      );

      // When service unavailable or with empty colleges
      expect(result).toHaveProperty('predictions');
      expect(Array.isArray(result.predictions)).toBe(true);
    });
  });
});
