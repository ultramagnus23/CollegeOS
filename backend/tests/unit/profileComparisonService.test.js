// backend/tests/unit/profileComparisonService.test.js
// Tests for the profile comparison service

const profileComparisonService = require('../../services/profileComparisonService');
const { COMPARISON_STATUS } = require('../../services/profileComparisonService');

describe('ProfileComparisonService', () => {
  describe('compareProfile', () => {
    const mockCollegeData = {
      name: 'Test University',
      admissions_stats: {
        sat_math_25: 700,
        sat_math_75: 780,
        sat_reading_25: 680,
        sat_reading_75: 760,
        act_25: 31,
        act_75: 35,
        data_source: 'Test Data Source'
      }
    };

    it('should return a valid comparison result', () => {
      const userProfile = {
        gpa: 3.8,
        sat_math: 750,
        sat_reading: 720,
        sat_total: 1470
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);

      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('overall_context');
      expect(result).toHaveProperty('data_sources');
      expect(result).toHaveProperty('disclaimer');
    });

    it('should classify SAT score above range as ABOVE_AVERAGE', () => {
      const userProfile = {
        sat_math: 800,
        sat_reading: 780
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      const satMathDim = result.dimensions.find(d => d.dimension_name === 'SAT Math');
      expect(satMathDim.status).toBe(COMPARISON_STATUS.ABOVE_AVERAGE);
    });

    it('should classify SAT score in range as ABOUT_AVERAGE', () => {
      const userProfile = {
        sat_math: 740
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      const satMathDim = result.dimensions.find(d => d.dimension_name === 'SAT Math');
      expect(satMathDim.status).toBe(COMPARISON_STATUS.ABOUT_AVERAGE);
    });

    it('should classify SAT score below range as BELOW_AVERAGE', () => {
      const userProfile = {
        sat_math: 600
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      const satMathDim = result.dimensions.find(d => d.dimension_name === 'SAT Math');
      expect(satMathDim.status).toBe(COMPARISON_STATUS.BELOW_AVERAGE);
    });

    it('should compare ACT scores correctly', () => {
      const userProfile = {
        act_composite: 34
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      const actDim = result.dimensions.find(d => d.dimension_name === 'ACT Composite');
      expect(actDim).toBeDefined();
      expect(actDim.status).toBe(COMPARISON_STATUS.ABOUT_AVERAGE);
    });

    it('should mark data unavailable when college has no stats', () => {
      const userProfile = {
        gpa: 3.9
      };

      const collegeWithoutStats = {
        name: 'No Stats College',
        admissions_stats: {}
      };

      const result = profileComparisonService.compareProfile(userProfile, collegeWithoutStats);
      
      const gpaDim = result.dimensions.find(d => d.dimension_name === 'GPA');
      expect(gpaDim.status).toBe(COMPARISON_STATUS.DATA_UNAVAILABLE);
    });

    it('should generate explanation for each dimension', () => {
      const userProfile = {
        sat_math: 750
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      const satMathDim = result.dimensions.find(d => d.dimension_name === 'SAT Math');
      expect(satMathDim.explanation).toBeTruthy();
      expect(typeof satMathDim.explanation).toBe('string');
    });

    it('should throw error if user profile is null', () => {
      expect(() => {
        profileComparisonService.compareProfile(null, mockCollegeData);
      }).toThrow('User profile is required');
    });

    it('should throw error if college data is null', () => {
      expect(() => {
        profileComparisonService.compareProfile({ gpa: 3.5 }, null);
      }).toThrow('College data is required');
    });

    it('should add data sources to result', () => {
      const userProfile = {
        sat_math: 750
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      expect(result.data_sources).toContain('Test Data Source');
    });

    it('should generate overall context', () => {
      const userProfile = {
        sat_math: 750,
        sat_reading: 720,
        act_composite: 33
      };

      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      expect(result.overall_context).toBeTruthy();
      expect(typeof result.overall_context).toBe('string');
    });

    it('should include timestamp', () => {
      const userProfile = { sat_math: 750 };
      const result = profileComparisonService.compareProfile(userProfile, mockCollegeData);
      
      expect(result.generated_at).toBeTruthy();
      expect(new Date(result.generated_at)).toBeInstanceOf(Date);
    });
  });

  describe('COMPARISON_STATUS constants', () => {
    it('should have all required status values', () => {
      expect(COMPARISON_STATUS.ABOVE_AVERAGE).toBe('Above average');
      expect(COMPARISON_STATUS.ABOUT_AVERAGE).toBe('About average');
      expect(COMPARISON_STATUS.BELOW_AVERAGE).toBe('Below average');
      expect(COMPARISON_STATUS.DATA_UNAVAILABLE).toBe('Data unavailable');
    });
  });
});
