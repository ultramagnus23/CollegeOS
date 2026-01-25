// backend/tests/unit/recommendationService.test.js
// Tests for the rule-based college recommendation service

const {
  generateRecommendations,
  deriveUserSignals,
  normalizeCollegeFeatures,
  calculateSignalScores,
  classifyCollege,
  generateExplanation,
  SCORING_WEIGHTS
} = require('../../services/collegeRecommendationService');

describe('CollegeRecommendationService', () => {
  // Mock user profile
  const mockUserProfile = {
    id: 1,
    email: 'test@example.com',
    full_name: 'Test User',
    academic_board: 'CBSE',
    percentage: 85,
    gpa: 3.7,
    subjects: ['Mathematics', 'Physics', 'Computer Science'],
    exams: {
      SAT: { status: 'completed', score: 1400 },
      IELTS: { status: 'completed', score: 7.5 }
    },
    financial: {
      max_budget_per_year: 4000000, // ~$48K USD
      can_take_loan: true,
      need_financial_aid: false
    },
    preferences: {
      target_countries: ['US', 'UK'],
      intended_major: 'Computer Science',
      intended_majors: ['Computer Science', 'Data Science']
    }
  };

  // Mock colleges
  const mockColleges = [
    {
      id: 1,
      name: 'MIT',
      country: 'US',
      location: 'Cambridge, MA',
      acceptance_rate: 0.04,
      programs: JSON.stringify(['Computer Science', 'Engineering', 'Mathematics']),
      requirements: JSON.stringify({
        min_percentage: 90,
        required_exams: ['SAT', 'TOEFL'],
        test_optional: false
      }),
      research_data: JSON.stringify({ avg_cost: 55000, aid_available: true }),
      trust_tier: 'official',
      financial_aid_available: 1
    },
    {
      id: 2,
      name: 'State University',
      country: 'US',
      location: 'State, USA',
      acceptance_rate: 0.65,
      programs: JSON.stringify(['Computer Science', 'Business', 'Arts']),
      requirements: JSON.stringify({
        min_percentage: 70,
        test_optional: true
      }),
      research_data: JSON.stringify({ avg_cost: 35000 }),
      trust_tier: 'official',
      financial_aid_available: 1
    },
    {
      id: 3,
      name: 'UK University',
      country: 'UK',
      location: 'London, UK',
      acceptance_rate: 0.35,
      programs: JSON.stringify(['Computer Science', 'Engineering']),
      requirements: JSON.stringify({
        min_percentage: 80,
        language_exams: ['IELTS'],
        min_ielts: 7.0
      }),
      research_data: JSON.stringify({ avg_cost: 40000 }),
      trust_tier: 'official'
    }
  ];

  describe('SCORING_WEIGHTS', () => {
    it('should have all required weight categories', () => {
      expect(SCORING_WEIGHTS).toHaveProperty('MAJOR_ALIGNMENT');
      expect(SCORING_WEIGHTS).toHaveProperty('ACADEMIC_FIT');
      expect(SCORING_WEIGHTS).toHaveProperty('TEST_COMPATIBILITY');
      expect(SCORING_WEIGHTS).toHaveProperty('COUNTRY_PREFERENCE');
      expect(SCORING_WEIGHTS).toHaveProperty('COST_ALIGNMENT');
      expect(SCORING_WEIGHTS).toHaveProperty('ADMISSION_PROBABILITY');
    });

    it('should have weights that sum to 1.0', () => {
      const totalWeight = Object.values(SCORING_WEIGHTS).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBeCloseTo(1.0, 2);
    });
  });

  describe('deriveUserSignals', () => {
    it('should derive academic strength level from percentage', () => {
      const signals = deriveUserSignals(mockUserProfile);
      expect(signals.academicStrengthLevel).toBe('strong'); // 85% = strong
    });

    it('should derive test status correctly', () => {
      const signals = deriveUserSignals(mockUserProfile);
      expect(signals.testStatus.hasSAT).toBe(true);
      expect(signals.testStatus.hasIELTS).toBe(true);
      expect(signals.testStatus.hasStandardizedTest).toBe(true);
      expect(signals.testStatus.hasLanguageTest).toBe(true);
      expect(signals.testStatus.satScore).toBe(1400);
    });

    it('should derive major intent', () => {
      const signals = deriveUserSignals(mockUserProfile);
      expect(signals.majorIntent.primary).toBe('Computer Science');
      expect(signals.majorIntent.hasIntent).toBe(true);
    });

    it('should derive country preferences', () => {
      const signals = deriveUserSignals(mockUserProfile);
      expect(signals.countryPreferences).toContain('US');
      expect(signals.countryPreferences).toContain('UK');
    });

    it('should derive budget sensitivity', () => {
      const signals = deriveUserSignals(mockUserProfile);
      // $48K USD falls in 'constrained' bracket (30K-50K)
      expect(['constrained', 'moderate']).toContain(signals.budgetSensitivity.level);
      expect(signals.budgetSensitivity.maxBudget).toBe(4000000);
    });
  });

  describe('normalizeCollegeFeatures', () => {
    it('should parse programs from JSON', () => {
      const features = normalizeCollegeFeatures(mockColleges[0]);
      expect(features.programs).toContain('Computer Science');
      expect(Array.isArray(features.programs)).toBe(true);
    });

    it('should calculate selectivity level', () => {
      const mitFeatures = normalizeCollegeFeatures(mockColleges[0]);
      expect(mitFeatures.selectivityLevel).toBe('highly_selective');
      
      const stateFeatures = normalizeCollegeFeatures(mockColleges[1]);
      expect(stateFeatures.selectivityLevel).toBe('less_selective');
    });

    it('should calculate estimated cost', () => {
      const features = normalizeCollegeFeatures(mockColleges[0]);
      expect(features.estimatedCostUSD).toBeGreaterThan(0);
    });
  });

  describe('classifyCollege', () => {
    it('should classify highly selective schools as Reach', () => {
      const classification = classifyCollege(0.7, 'highly_selective', mockColleges[0]);
      expect(classification).toBe('Reach');
    });

    it('should classify high score + high acceptance rate as Safety', () => {
      const classification = classifyCollege(0.85, 'less_selective', mockColleges[1]);
      expect(classification).toBe('Safety');
    });

    it('should classify medium scores as Match', () => {
      const classification = classifyCollege(0.6, 'moderately_selective', mockColleges[2]);
      expect(classification).toBe('Match');
    });
  });

  describe('generateExplanation', () => {
    it('should generate reasons array', () => {
      const userSignals = deriveUserSignals(mockUserProfile);
      const collegeFeatures = normalizeCollegeFeatures(mockColleges[0]);
      const signalScores = {
        majorAlignment: 1.0,
        academicFit: 0.7,
        testCompatibility: 0.8,
        countryPreference: 1.0,
        costAlignment: 0.6,
        admissionProbability: 0.3
      };
      
      const explanation = generateExplanation(userSignals, collegeFeatures, signalScores, 'Reach');
      
      expect(explanation).toHaveProperty('summary');
      expect(explanation).toHaveProperty('reasons');
      expect(explanation).toHaveProperty('concerns');
      expect(explanation).toHaveProperty('primaryReason');
      expect(Array.isArray(explanation.reasons)).toBe(true);
    });

    it('should include major alignment reason when score is high', () => {
      const userSignals = deriveUserSignals(mockUserProfile);
      const collegeFeatures = normalizeCollegeFeatures(mockColleges[0]);
      const signalScores = {
        majorAlignment: 0.95,
        academicFit: 0.8,
        testCompatibility: 0.8,
        countryPreference: 1.0,
        costAlignment: 0.7,
        admissionProbability: 0.5
      };
      
      const explanation = generateExplanation(userSignals, collegeFeatures, signalScores, 'Match');
      
      expect(explanation.reasons.some(r => r.toLowerCase().includes('computer science') || r.toLowerCase().includes('program'))).toBe(true);
    });
  });

  describe('generateRecommendations', () => {
    it('should return success with valid inputs', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges);
      expect(result.success).toBe(true);
    });

    it('should return reach, match, and safety arrays', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges);
      expect(result).toHaveProperty('reach');
      expect(result).toHaveProperty('match');
      expect(result).toHaveProperty('safety');
      expect(Array.isArray(result.reach)).toBe(true);
      expect(Array.isArray(result.match)).toBe(true);
      expect(Array.isArray(result.safety)).toBe(true);
    });

    it('should return stats', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges);
      expect(result.stats).toHaveProperty('totalConsidered');
      expect(result.stats).toHaveProperty('reachCount');
      expect(result.stats).toHaveProperty('matchCount');
      expect(result.stats).toHaveProperty('safetyCount');
    });

    it('should classify MIT as Reach due to low acceptance rate', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges);
      const mit = [...result.reach, ...result.match, ...result.safety].find(c => c.collegeName === 'MIT');
      expect(mit.category).toBe('Reach');
    });

    it('should include explanation for each recommendation', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges);
      const allRecommendations = [...result.reach, ...result.match, ...result.safety];
      
      allRecommendations.forEach(rec => {
        expect(rec).toHaveProperty('explanation');
        expect(rec.explanation).toHaveProperty('summary');
        expect(rec.explanation).toHaveProperty('reasons');
      });
    });

    it('should include score for each recommendation', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges);
      const allRecommendations = [...result.reach, ...result.match, ...result.safety];
      
      allRecommendations.forEach(rec => {
        expect(typeof rec.score).toBe('number');
        expect(rec.score).toBeGreaterThanOrEqual(0);
        expect(rec.score).toBeLessThanOrEqual(100);
      });
    });

    it('should respect limit option', () => {
      const result = generateRecommendations(mockUserProfile, mockColleges, { limit: 1 });
      expect(result.reach.length).toBeLessThanOrEqual(1);
      expect(result.match.length).toBeLessThanOrEqual(1);
      expect(result.safety.length).toBeLessThanOrEqual(1);
    });

    it('should return error for missing profile', () => {
      const result = generateRecommendations(null, mockColleges);
      expect(result.success).toBe(false);
    });

    it('should return error for empty colleges', () => {
      const result = generateRecommendations(mockUserProfile, []);
      expect(result.success).toBe(false);
    });
  });
});
