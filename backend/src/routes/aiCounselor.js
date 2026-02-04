// backend/src/routes/aiCounselor.js
// Intelligent AI counselor that replaces your old chatbot
// Provides major guidance, college matching, and personalized roadmaps

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const config = require('../config/env');
const logger = require('../utils/logger');
const { authenticate, optionalAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// SECURITY: Get API key from config instead of direct env access
const HF_API_KEY = config.apiKeys.huggingFace;
const HF_MODEL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2';

// SECURITY: Rate limiting for AI endpoints (expensive operations)
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 AI requests per hour per IP
  message: {
    success: false,
    message: 'AI request limit exceeded. Please try again later.',
    code: 'AI_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.userId || req.ip,
});

// Apply rate limiting to all AI routes
router.use(aiRateLimiter);

/**
 * Step 1: Major Decision Helper
 * POST /api/counselor/major-guidance
 * Helps students decide their major with pros/cons
 */
router.post('/major-guidance', optionalAuth, async (req, res) => {
  try {
    const { studentProfile, potentialMajors, skills, interests } = req.body;

    // Input validation
    if (!studentProfile || !potentialMajors || !Array.isArray(potentialMajors)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input: studentProfile and potentialMajors are required'
      });
    }

    // Build intelligent prompt
    const prompt = `You are an expert college counselor helping a student decide their major.

Student Profile:
- Current Grade: ${studentProfile.grade}
- Strengths: ${skills?.join(', ') || 'Not specified'}
- Considering Majors: ${potentialMajors.join(', ')}
- Interests: ${interests || 'Not specified'}

Provide:
1. Detailed pros and cons for each major they're considering
2. Which major best matches their strengths and interests
3. Career paths for each major
4. Required skills and coursework

Be specific, encouraging, and practical. Format with clear sections.`;

    const aiResponse = await callAI(prompt);

    res.json({
      success: true,
      guidance: aiResponse,
      recommendedMajor: extractRecommendation(aiResponse, potentialMajors)
    });

  } catch (error) {
    logger.error('Major guidance error:', { error: error.message, userId: req.user?.userId });
    res.json({
      success: true,
      guidance: getFallbackMajorGuidance(req.body),
      fallback: true
    });
  }
});

/**
 * Step 2: Intelligent College Matching
 * POST /api/counselor/match-colleges
 * Uses AI + algorithm to match students with perfect colleges
 */
router.post('/match-colleges', optionalAuth, async (req, res) => {
  try {
    const { studentProfile } = req.body;

    if (!studentProfile) {
      return res.status(400).json({
        success: false,
        message: 'studentProfile is required'
      });
    }

    // Calculate match scores using algorithm
    const matches = await intelligentCollegeMatching(studentProfile);

    // Get AI analysis of top matches
    const topMatches = matches.slice(0, 10);
    const prompt = `Analyze these college matches for the student:

Student Profile:
- Major: ${studentProfile.potentialMajors?.join(', ') || 'Undecided'}
- GPA: ${studentProfile.currentGPA || 'Not provided'}
- SAT: ${studentProfile.satScore || 'Not taken'}
- Budget: ${studentProfile.budgetRange || 'Not specified'}
- Preferences: ${studentProfile.campusSize || 'any'} campus, ${studentProfile.locationPreference || 'any'} location
- Countries: ${studentProfile.preferredCountries?.join(', ') || 'Any'}

Top Matched Colleges:
${topMatches.map((c, i) => `${i + 1}. ${c.name} (${c.country}) - Match: ${c.matchScore}%`).join('\n')}

Provide:
1. Why these colleges are great fits
2. Which ones to prioritize (reach/target/safety)
3. Specific programs or opportunities at each
4. Application strategy

Be specific and actionable.`;

    const analysis = await callAI(prompt);

    res.json({
      success: true,
      matches: topMatches,
      analysis: analysis,
      breakdown: {
        reach: topMatches.filter(c => c.matchScore < 60),
        target: topMatches.filter(c => c.matchScore >= 60 && c.matchScore < 80),
        safety: topMatches.filter(c => c.matchScore >= 80)
      }
    });

  } catch (error) {
    logger.error('College matching error:', { error: error.message, userId: req.user?.userId });
    // Return basic algorithm matches without AI analysis
    try {
      const matches = await intelligentCollegeMatching(req.body.studentProfile);
      res.json({
        success: true,
        matches: matches.slice(0, 10),
        fallback: true
      });
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        message: 'Failed to match colleges'
      });
    }
  }
});

/**
 * Step 3: Requirements & Standing Out
 * POST /api/counselor/college-requirements
 */
router.post('/college-requirements', optionalAuth, async (req, res) => {
  try {
    const { colleges, studentProfile } = req.body;

    if (!colleges || !Array.isArray(colleges) || colleges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'colleges array is required'
      });
    }

    const prompt = `A student wants to apply to these colleges:
${colleges.map(c => `- ${c.name}`).join('\n')}

Their profile:
- Major: ${studentProfile?.potentialMajors?.[0] || 'Undecided'}
- GPA: ${studentProfile?.currentGPA || 'Not provided'}
- Current Activities: ${studentProfile?.activities?.slice(0, 3).join(', ') || 'Not provided'}

Provide:
1. Key requirements for each college
2. What makes successful applicants stand out
3. Specific things this student should focus on
4. Timeline for preparation

Be detailed and actionable.`;

    const guidance = await callAI(prompt);

    res.json({
      success: true,
      guidance: guidance
    });

  } catch (error) {
    logger.error('College requirements error:', { error: error.message });
    res.json({
      success: true,
      guidance: getFallbackRequirements(req.body.colleges),
      fallback: true
    });
  }
});

/**
 * Step 4: Subject Selection for IB/IGCSE/A-Levels
 * POST /api/counselor/subject-selection
 */
router.post('/subject-selection', optionalAuth, async (req, res) => {
  try {
    const { currentSubjects, intendedMajor, targetColleges, board } = req.body;

    if (!intendedMajor || !board) {
      return res.status(400).json({
        success: false,
        message: 'intendedMajor and board are required'
      });
    }

    const prompt = `Help a ${board} student select subjects:

Current Subjects: ${currentSubjects?.join(', ') || 'Not provided'}
Intended Major: ${intendedMajor}
Target Colleges: ${targetColleges?.join(', ') || 'Not specified'}

Provide:
1. Essential subjects they MUST take
2. Recommended electives that strengthen their application
3. Subjects to avoid or replace
4. How to balance difficulty with performance

Be specific to ${board} curriculum.`;

    const advice = await callAI(prompt);

    res.json({
      success: true,
      advice: advice
    });

  } catch (error) {
    logger.error('Subject selection error:', { error: error.message });
    res.json({
      success: true,
      advice: getFallbackSubjectAdvice(req.body),
      fallback: true
    });
  }
});

/**
 * Step 5: Competitions & Internships
 * POST /api/counselor/opportunities
 */
router.post('/opportunities', optionalAuth, async (req, res) => {
  try {
    const { major, grade, interests, location } = req.body;

    if (!major || !grade) {
      return res.status(400).json({
        success: false,
        message: 'major and grade are required'
      });
    }

    const prompt = `Recommend competitions and internships for:

Major Interest: ${major}
Current Grade: ${grade}
Location: ${location || 'Not specified'}
Interests: ${interests?.join(', ') || 'General'}

Provide:
1. Top competitions they should participate in (with deadlines)
2. Internship opportunities or research programs
3. How to find and apply to these
4. Timeline for Grade ${grade} students

Include specific program names and links where possible.`;

    const opportunities = await callAI(prompt);

    res.json({
      success: true,
      opportunities: opportunities
    });

  } catch (error) {
    logger.error('Opportunities error:', { error: error.message });
    res.json({
      success: true,
      opportunities: getFallbackOpportunities(req.body),
      fallback: true
    });
  }
});

/**
 * Step 6-9: Complete Personalized Roadmap
 * POST /api/counselor/generate-roadmap
 */
router.post('/generate-roadmap', optionalAuth, async (req, res) => {
  try {
    const { studentProfile } = req.body;

    if (!studentProfile) {
      return res.status(400).json({
        success: false,
        message: 'studentProfile is required'
      });
    }

    const prompt = `Create a detailed 9-step roadmap for this student:

Profile:
- Name: ${studentProfile.name || 'Student'}
- Grade: ${studentProfile.grade || 'Not specified'}
- Major: ${studentProfile.potentialMajors?.[0] || 'Undecided'}
- Target Colleges: Top tier in ${studentProfile.preferredCountries?.join(', ') || 'various countries'}
- Current GPA: ${studentProfile.currentGPA || 'Not provided'}
- Activities: ${studentProfile.activities?.slice(0, 3).join(', ') || 'Not provided'}

Create 9 steps:
Step 1: Identify degree and target colleges
Step 2: Understand requirements and how to stand out
Step 3: Subject selection guidance
Step 4: Competitions and internships to pursue
Step 5: How to achieve these opportunities
Step 6: Resume refinement advice
Step 7: Motivation and mental strategies
Step 8: Example resumes/applications from successful students
Step 9: Action plan to create competitive resume

Each step should be:
- Specific and actionable
- Include deadlines
- Have 3-5 concrete action items
- Be motivating but realistic

Format clearly with headers.`;

    const roadmap = await callAI(prompt, 3000); // Longer response

    // Parse into steps
    const steps = parseRoadmapSteps(roadmap);

    res.json({
      success: true,
      roadmap: roadmap,
      steps: steps,
      timeline: generateTimeline(studentProfile)
    });

  } catch (error) {
    logger.error('Roadmap generation error:', { error: error.message, userId: req.user?.userId });
    res.json({
      success: true,
      roadmap: getFallbackRoadmap(req.body.studentProfile),
      fallback: true
    });
  }
});

/**
 * Intelligent Search with Natural Language
 * POST /api/counselor/search
 * Example: "small colleges with good CS programs and over 10% acceptance rate"
 */
router.post('/search', optionalAuth, async (req, res) => {
  try {
    const { query, studentProfile } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'query string is required'
      });
    }

    // Extract criteria from natural language using AI
    const extractPrompt = `Extract college search criteria from this query: "${query}"

Return ONLY a JSON object with these fields:
{
  "programs": ["majors mentioned"],
  "size": "small/medium/large or null",
  "minAcceptanceRate": number or null,
  "maxAcceptanceRate": number or null,
  "countries": ["countries mentioned"],
  "other": "any other preferences"
}`;

    const criteriaText = await callAI(extractPrompt, 500);
    const criteria = parseJSONFromAI(criteriaText);

    // Search database with extracted criteria
    const results = await searchWithCriteria(criteria, studentProfile || {});

    res.json({
      success: true,
      query: query,
      understood: criteria,
      results: results.slice(0, 20)
    });

  } catch (error) {
    logger.error('Intelligent search error:', { error: error.message });
    // Fallback to basic search
    try {
      const results = await basicSearch(req.body.query);
      res.json({
        success: true,
        results: results,
        fallback: true
      });
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        message: 'Search failed'
      });
    }
  }
});

// ==================== HELPER FUNCTIONS ====================

async function callAI(prompt, maxTokens = 1500) {
  // SECURITY: Check if API key is configured
  if (!HF_API_KEY) {
    logger.warn('Hugging Face API key not configured, using fallback responses');
    throw new Error('AI service not configured');
  }

  try {
    const response = await fetch(HF_MODEL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: maxTokens,
          temperature: 0.7,
          top_p: 0.9,
          return_full_text: false
        }
      })
    });

    const data = await response.json();
    
    if (data[0]?.generated_text) {
      return data[0].generated_text;
    }
    
    throw new Error('No response from AI');
  } catch (error) {
    // SECURITY: Don't log API key or full error details
    logger.error('AI call failed:', { message: error.message });
    throw error;
  }
}

async function intelligentCollegeMatching(profile) {
  return new Promise((resolve, reject) => {
    let query = 'SELECT * FROM colleges WHERE 1=1';
    const params = [];

    // Filter by countries
    if (profile.preferredCountries && profile.preferredCountries.length > 0) {
      query += ` AND country IN (${profile.preferredCountries.map(() => '?').join(',')})`;
      params.push(...profile.preferredCountries);
    }

    // Filter by programs
    if (profile.potentialMajors && profile.potentialMajors.length > 0) {
      const programConditions = profile.potentialMajors.map(() => 'LOWER(programs) LIKE LOWER(?)').join(' OR ');
      query += ` AND (${programConditions})`;
      profile.potentialMajors.forEach(major => params.push(`%${major}%`));
    }

    db.all(query, params, (err, colleges) => {
      if (err) return reject(err);

      // Calculate match scores
      const scoredColleges = colleges.map(college => {
        let score = 50; // Base score
        const researchData = JSON.parse(college.research_data);
        const requirements = JSON.parse(college.requirements);

        // GPA match
        if (profile.currentGPA) {
          const gpa = parseFloat(profile.currentGPA);
          if (gpa >= requirements.min_percentage) score += 15;
          if (gpa >= requirements.min_percentage + 10) score += 10;
        }

        // Acceptance rate (target vs reach vs safety)
        if (college.acceptance_rate > 0.3) score += 20; // Safety
        else if (college.acceptance_rate > 0.15) score += 15; // Target
        else score += 5; // Reach

        // Budget match
        if (profile.budgetRange && researchData.avg_cost) {
          const budgetNum = parseInt(profile.budgetRange.match(/\d+/)?.[0] || '999999');
          if (researchData.avg_cost <= budgetNum * 1000) score += 15;
        }

        // Financial aid availability
        if (researchData.aid_available && profile.budgetRange?.includes('Aid')) {
          score += 10;
        }

        return {
          ...college,
          matchScore: Math.min(score, 100),
          requirements: requirements,
          research_data: researchData,
          programs: JSON.parse(college.programs)
        };
      });

      // Sort by match score
      scoredColleges.sort((a, b) => b.matchScore - a.matchScore);
      resolve(scoredColleges);
    });
  });
}

async function searchWithCriteria(criteria, profile) {
  // Similar to intelligentCollegeMatching but with extracted criteria
  return intelligentCollegeMatching({
    ...profile,
    potentialMajors: criteria.programs || profile.potentialMajors,
    preferredCountries: criteria.countries || profile.preferredCountries
  });
}

function parseJSONFromAI(text) {
  try {
    // Try to extract JSON from AI response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {}
  return {}; // Return empty object if parsing fails
}

function parseRoadmapSteps(roadmap) {
  const steps = [];
  const stepMatches = roadmap.match(/Step \d+:.*?(?=Step \d+:|$)/gs) || [];
  
  stepMatches.forEach((stepText, index) => {
    steps.push({
      number: index + 1,
      title: stepText.split('\n')[0].replace(/Step \d+:\s*/, ''),
      content: stepText,
      completed: false
    });
  });

  return steps;
}

function generateTimeline(profile) {
  const grade = profile.grade;
  // Generate month-by-month timeline based on grade
  // This would be customized based on their current grade
  return {
    currentMonth: new Date().toLocaleString('default', { month: 'long' }),
    upcomingMilestones: [
      { month: 'This Month', task: 'Complete profile assessment' },
      { month: 'Next Month', task: 'Research target colleges' },
      { month: '3 Months', task: 'Start test preparation' }
    ]
  };
}

// Fallback functions when AI is unavailable
function getFallbackMajorGuidance({ potentialMajors, skills }) {
  return `Based on your profile, here's guidance for your potential majors:

${potentialMajors.map(major => `
**${major}:**
PROS: Strong career prospects, aligns with your skills in ${skills.slice(0, 2).join(' and ')}
CONS: Competitive field, requires dedication
Career Paths: Multiple opportunities in industry and research
`).join('\n')}

Recommendation: Consider ${potentialMajors[0]} as your primary choice based on your strengths.`;
}

function getFallbackRequirements(colleges) {
  return `For these colleges, focus on:
1. Strong GPA (85%+ for competitive programs)
2. Standardized tests (SAT 1400+, IELTS 7.0+)
3. Compelling essays showing your passion
4. Leadership in extracurriculars
5. Strong recommendation letters

What makes you stand out:
- Unique projects or research
- Meaningful community impact
- Overcoming challenges
- Clear career vision`;
}

function getFallbackSubjectAdvice({ intendedMajor, board }) {
  return `For ${intendedMajor}, recommended ${board} subjects:

ESSENTIAL:
- Mathematics (Higher Level)
- Science related to your major
- English

RECOMMENDED:
- Computer Science (if available)
- Additional sciences
- Economics or Business Studies

Balance difficulty with performance - aim for top grades in core subjects.`;
}

function getFallbackOpportunities({ major, grade }) {
  return `Recommended for ${major} students in ${grade}:

COMPETITIONS:
- Science Olympiads (National/International)
- Hackathons and coding competitions
- Research paper competitions

INTERNSHIPS:
- Summer research programs
- Virtual internships in your field
- NGO/Community projects

Apply early - most have deadlines 2-3 months in advance!`;
}

function getFallbackRoadmap(profile) {
  return `Your Personalized College Roadmap:

Step 1: Target ${profile.potentialMajors[0]} at top universities
Step 2: Maintain 90%+ GPA, aim for SAT 1450+
Step 3: Take advanced math and science courses
Step 4: Participate in 2-3 major competitions this year
Step 5: Start building connections, seek mentorship
Step 6: Document all achievements, update resume monthly
Step 7: Stay motivated - your goal is achievable!
Step 8: Research successful student profiles
Step 9: Create application timeline and checklist

Start today - every action counts!`;
}

async function basicSearch(query) {
  return new Promise((resolve, reject) => {
    const sql = `
      SELECT * FROM colleges
      WHERE LOWER(name) LIKE LOWER(?) 
         OR LOWER(location) LIKE LOWER(?)
         OR LOWER(programs) LIKE LOWER(?)
      LIMIT 20
    `;
    
    const searchTerm = `%${query}%`;
    db.all(sql, [searchTerm, searchTerm, searchTerm], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = router;