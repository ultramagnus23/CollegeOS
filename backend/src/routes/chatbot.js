// backend/src/routes/chatbot.js
// Smart chatbot that uses student profile for personalized responses

const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const StudentProfile = require('../models/StudentProfile');
const College = require('../models/College');
const { getChancingForStudent } = require('../services/chancingCalculator');
const config = require('../config/env');
const logger = require('../utils/logger');
const rateLimit = require('express-rate-limit');

// SECURITY: Get API key from config
const HF_API_KEY = config.apiKeys.huggingFace;

// SECURITY: Rate limiting for chatbot endpoints
const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 chat requests per 15 minutes per IP
  message: {
    success: false,
    message: 'Too many chat requests. Please try again later.',
    code: 'CHAT_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
router.use(chatRateLimiter);

/**
 * Smart chat endpoint - uses student profile for personalized responses
 * POST /api/chatbot/chat
 */
router.post('/chat', authenticate, async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Input validation - limit message length
    if (typeof message !== 'string' || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message must be a string with maximum 2000 characters'
      });
    }

    // Get student profile for personalized responses
    let profile = null;
    try {
      profile = StudentProfile.getCompleteProfile(req.user.userId);
    } catch (e) {
      logger.debug('Could not load profile:', { error: e.message, userId: req.user.userId });
    }

    // Generate smart, personalized response
    const response = getSmartResponse(message, profile);

    res.json({
      success: true,
      reply: response.text,
      colleges: response.colleges || [],
      suggestions: response.suggestions || []
    });

  } catch (error) {
    logger.error('Chatbot error:', { error: error.message, userId: req.user?.userId });
    res.json({
      success: true,
      reply: "I'm here to help! Ask me about college applications.",
      fallback: true
    });
  }
});

/**
 * Chat without auth (for unauthenticated users)
 * POST /api/chatbot/chat-public
 */
router.post('/chat-public', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Input validation - limit message length
    if (typeof message !== 'string' || message.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message must be a string with maximum 2000 characters'
      });
    }

    const response = getSimpleResponse(message);

    res.json({
      success: true,
      reply: response
    });

  } catch (error) {
    logger.error('Chatbot public error:', { error: error.message });
    res.json({
      success: true,
      reply: "I'm here to help! Ask me about college applications.",
      fallback: true
    });
  }
});

/**
 * Status endpoint
 * GET /api/chatbot/status
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    message: 'Chatbot is running'
  });
});

/**
 * Smart response function that uses profile data
 */
function getSmartResponse(message, profile) {
  const lower = message.toLowerCase();
  
  // Questions about colleges for a specific major (e.g., "give me target colleges for CS")
  if ((lower.includes('college') || lower.includes('school') || lower.includes('university')) &&
      (lower.includes('target') || lower.includes('recommend') || lower.includes('suggest') || lower.includes('give me'))) {
    return getCollegeRecommendations(message, profile);
  }
  
  // Questions about chancing
  if (lower.includes('chance') || lower.includes('admission') || lower.includes('acceptance')) {
    return getChancingResponse(message, profile);
  }
  
  // Questions about major with profile context
  if (lower.includes('major') || lower.includes('degree') || lower.includes('field')) {
    return getMajorResponse(message, profile);
  }
  
  // Questions about activities
  if (lower.includes('activities') || lower.includes('extracurricular')) {
    return getActivitiesResponse(message, profile);
  }
  
  // Questions about test scores
  if (lower.includes('sat') || lower.includes('act') || lower.includes('test score')) {
    return getTestScoreResponse(message, profile);
  }
  
  // Fall back to simple response
  return { text: getSimpleResponse(message) };
}

/**
 * Generate college recommendations based on profile
 */
function getCollegeRecommendations(message, profile) {
  // Extract major from message if mentioned
  const majorMatch = message.match(/for\s+(cs|computer science|engineering|business|biology|medicine|law|psychology)/i);
  let intendedMajor = majorMatch ? majorMatch[1] : null;
  
  if (!profile) {
    return {
      text: "I'd love to give you personalized college recommendations! Please complete your profile first with your GPA, test scores, and intended major so I can match you with the right schools.",
      suggestions: ['Complete your profile', 'Add test scores', 'Set intended major']
    };
  }
  
  // Use profile's intended major if not specified in message
  if (!intendedMajor && profile.intendedMajors && profile.intendedMajors.length > 0) {
    intendedMajor = profile.intendedMajors[0];
  }
  
  // Build personalized response
  const gpa = profile.gpa_unweighted || profile.gpa_weighted;
  const sat = profile.sat_total;
  const act = profile.act_composite;
  
  let response = '';
  const colleges = [];
  const suggestions = [];
  
  if (gpa && (sat || act)) {
    response = `Based on your ${gpa ? 'GPA of ' + gpa.toFixed(2) : ''} ${sat ? 'and SAT of ' + sat : ''} ${act ? 'and ACT of ' + act : ''}, `;
    
    // Provide specific recommendations based on stats
    if (sat >= 1500 || act >= 34 || gpa >= 3.9) {
      response += `here are some ${intendedMajor || 'recommended'} programs for you:\n\n`;
      response += `**Reach Schools:**\n`;
      response += `- MIT (Match: ~15%)\n`;
      response += `- Stanford University (Match: ~12%)\n`;
      response += `- Carnegie Mellon University (Match: ~25%)\n\n`;
      response += `**Target Schools:**\n`;
      response += `- Georgia Tech (Match: ~45%)\n`;
      response += `- University of Michigan (Match: ~50%)\n`;
      response += `- UC Berkeley (Match: ~40%)\n\n`;
      response += `**Safety Schools:**\n`;
      response += `- University of Illinois (Match: ~70%)\n`;
      response += `- Purdue University (Match: ~75%)\n`;
      response += `- University of Washington (Match: ~65%)`;
      
      suggestions.push('View detailed chancing', 'Add more activities', 'Explore these colleges');
    } else if (sat >= 1400 || act >= 31 || gpa >= 3.7) {
      response += `here are some ${intendedMajor || 'recommended'} programs for you:\n\n`;
      response += `**Reach Schools:**\n`;
      response += `- Georgia Tech (Match: ~30%)\n`;
      response += `- University of Michigan (Match: ~35%)\n`;
      response += `- UC Berkeley (Match: ~25%)\n\n`;
      response += `**Target Schools:**\n`;
      response += `- University of Illinois (Match: ~55%)\n`;
      response += `- University of Washington (Match: ~50%)\n`;
      response += `- University of Wisconsin (Match: ~55%)\n\n`;
      response += `**Safety Schools:**\n`;
      response += `- Purdue University (Match: ~70%)\n`;
      response += `- Ohio State University (Match: ~75%)\n`;
      response += `- Penn State University (Match: ~75%)`;
      
      suggestions.push('Improve test scores', 'Strengthen activities', 'View all matches');
    } else {
      response += `here are some ${intendedMajor || 'recommended'} programs to consider:\n\n`;
      response += `**Target Schools:**\n`;
      response += `- University of Illinois (Match: ~45%)\n`;
      response += `- Purdue University (Match: ~50%)\n`;
      response += `- University of Washington (Match: ~45%)\n\n`;
      response += `**Safety Schools:**\n`;
      response += `- Ohio State University (Match: ~65%)\n`;
      response += `- Penn State University (Match: ~65%)\n`;
      response += `- Arizona State University (Match: ~85%)`;
      
      suggestions.push('Improve your GPA', 'Retake SAT/ACT', 'Add more activities');
    }
  } else {
    response = "I need more information to give you specific recommendations. Please add your GPA and test scores to your profile, and I'll provide personalized college matches with acceptance chances!";
    suggestions.push('Add GPA', 'Add test scores', 'Complete profile');
  }
  
  return { text: response, colleges, suggestions };
}

/**
 * Generate chancing response
 */
function getChancingResponse(message, profile) {
  if (!profile || (!profile.gpa_unweighted && !profile.gpa_weighted && !profile.sat_total && !profile.act_composite)) {
    return {
      text: "To calculate your admission chances, I need your academic profile. Please add your GPA and test scores first!",
      suggestions: ['Complete profile', 'Add GPA', 'Add test scores']
    };
  }
  
  const gpa = profile.gpa_unweighted || profile.gpa_weighted;
  const sat = profile.sat_total;
  const activities = profile.activities || [];
  const tier1 = activities.filter(a => a.tier_rating === 1).length;
  
  let response = `Based on your profile:\n\n`;
  response += `📊 **Your Stats:**\n`;
  if (gpa) response += `- GPA: ${gpa.toFixed(2)}\n`;
  if (sat) response += `- SAT: ${sat}\n`;
  if (profile.act_composite) response += `- ACT: ${profile.act_composite}\n`;
  response += `- Activities: ${activities.length} (${tier1} national-level)\n\n`;
  
  response += `To see specific chances for any college, add it to your list and check the chancing page!`;
  
  return {
    text: response,
    suggestions: ['View chancing dashboard', 'Add colleges to list', 'Improve profile strength']
  };
}

/**
 * Major-related response with profile context
 */
function getMajorResponse(message, profile) {
  if (!profile || !profile.intendedMajors || profile.intendedMajors.length === 0) {
    return {
      text: "Choosing a major is an important decision! Here are some tips:\n\n" +
            "1. **Explore your interests** - What subjects excite you?\n" +
            "2. **Consider your strengths** - What are you naturally good at?\n" +
            "3. **Research careers** - What jobs can this major lead to?\n" +
            "4. **Talk to people** - Reach out to professionals in fields you're considering\n\n" +
            "It's also okay to be undecided - many students explore in their first year!",
      suggestions: ['Add intended major', 'Browse majors', 'View career paths']
    };
  }
  
  const majors = profile.intendedMajors;
  return {
    text: `I see you're interested in ${majors.join(', ')}! Here's how to strengthen your application:\n\n` +
          `1. **Take relevant courses** - AP/IB classes in related subjects\n` +
          `2. **Build related activities** - Clubs, research, competitions\n` +
          `3. **Show passion** - Personal projects, internships\n` +
          `4. **Connect your essay** - Explain why this major excites you\n\n` +
          `Would you like specific college recommendations for ${majors[0]}?`,
    suggestions: ['Get college recommendations', 'View program rankings', 'Find related activities']
  };
}

/**
 * Activities response with profile context
 */
function getActivitiesResponse(message, profile) {
  if (!profile || !profile.activities || profile.activities.length === 0) {
    return {
      text: "Extracurricular activities are crucial for college applications! Here's what admissions officers look for:\n\n" +
            "**Tier 1 (Exceptional):** National/international achievements\n" +
            "**Tier 2 (Outstanding):** State/regional recognition\n" +
            "**Tier 3 (Strong):** School leadership, significant contributions\n" +
            "**Tier 4 (Standard):** Participation and membership\n\n" +
            "Focus on quality over quantity. Aim for 2-3 activities you're deeply committed to!",
      suggestions: ['Add activities', 'Learn about tiers', 'View activity ideas']
    };
  }
  
  const activities = profile.activities;
  const tier1 = activities.filter(a => a.tier_rating === 1).length;
  const tier2 = activities.filter(a => a.tier_rating === 2).length;
  const totalHours = activities.reduce((sum, a) => sum + (a.total_hours || 0), 0);
  
  let response = `You have ${activities.length} activities logged!\n\n`;
  response += `📊 **Your Activity Profile:**\n`;
  response += `- Tier 1 (National): ${tier1}\n`;
  response += `- Tier 2 (State): ${tier2}\n`;
  response += `- Total Hours: ${totalHours}\n\n`;
  
  if (tier1 === 0) {
    response += `💡 **Tip:** To strengthen your profile, try to achieve state or national-level recognition in your strongest activity.`;
  } else {
    response += `✅ **Great job!** Your national-level achievements will help your applications stand out.`;
  }
  
  return {
    text: response,
    suggestions: ['View activities', 'Add new activity', 'Improve tier ratings']
  };
}

/**
 * Test score response with profile context
 */
function getTestScoreResponse(message, profile) {
  if (!profile || (!profile.sat_total && !profile.act_composite)) {
    return {
      text: "Test scores are still important for many universities. Here's a quick guide:\n\n" +
            "**SAT Targets by School Type:**\n" +
            "- Top 20 Schools: 1500+\n" +
            "- Top 50 Schools: 1400+\n" +
            "- State Flagships: 1300+\n\n" +
            "**ACT Equivalents:**\n" +
            "- 1500 SAT ≈ 34 ACT\n" +
            "- 1400 SAT ≈ 32 ACT\n" +
            "- 1300 SAT ≈ 29 ACT\n\n" +
            "Many schools are now test-optional, but strong scores can still help!",
      suggestions: ['Add test scores', 'View test-optional schools', 'SAT prep resources']
    };
  }
  
  const sat = profile.sat_total;
  const act = profile.act_composite;
  
  let response = `Your test scores:\n`;
  if (sat) response += `- SAT: ${sat}\n`;
  if (act) response += `- ACT: ${act}\n\n`;
  
  if (sat >= 1500 || act >= 34) {
    response += `🌟 **Excellent scores!** You're competitive for top universities.`;
  } else if (sat >= 1400 || act >= 32) {
    response += `✅ **Strong scores!** You're competitive for many excellent universities.`;
  } else if (sat >= 1300 || act >= 29) {
    response += `📈 **Good scores!** Consider retaking if aiming for highly selective schools.`;
  } else {
    response += `💪 Consider retaking to improve your competitiveness for selective schools.`;
  }
  
  return {
    text: response,
    suggestions: ['View matching colleges', 'SAT prep tips', 'Test-optional schools']
  };
}

// Simple response function
function getSimpleResponse(message) {
  const lower = message.toLowerCase();
  
  if (lower.includes('deadline')) {
    return "Most US universities have application deadlines in January. Early Action is usually November 1st, and Regular Decision is around January 1st. UK universities (UCAS) have a deadline of January 15th for most courses.";
  }
  
  if (lower.includes('sat') || lower.includes('test')) {
    return "For competitive US universities, aim for SAT 1400+ or ACT 30+. However, many schools are now test-optional. Check each university's specific requirements.";
  }
  
  if (lower.includes('toefl') || lower.includes('ielts')) {
    return "International students typically need TOEFL 90-100+ or IELTS 6.5-7.0+. Top universities often require higher scores.";
  }
  
  if (lower.includes('essay') || lower.includes('personal statement')) {
    return "Your essay should tell YOUR unique story. Be authentic, specific, and show growth. Start early, write multiple drafts, and get feedback from teachers or mentors.";
  }
  
  if (lower.includes('gpa') || lower.includes('grades')) {
    return "For competitive universities, aim for 85%+ (or 3.5+ GPA). Consistent performance is important. If you had a rough semester, explain it in your application.";
  }
  
  if (lower.includes('major') || lower.includes('degree')) {
    return "It's okay to be undecided! Many students change majors. Focus on your interests and strengths. Consider taking introductory courses in different fields.";
  }
  
  if (lower.includes('financial aid') || lower.includes('scholarship')) {
    return "US universities may offer need-based or merit aid to international students. Check each school's policy. Many have generous aid programs. Apply for external scholarships too!";
  }
  
  if (lower.includes('recommendation') || lower.includes('lor')) {
    return "Choose teachers who know you well and can speak to your strengths. Ask early (2-3 months before deadline), provide them with your resume and goals, and send a thank you note!";
  }
  
  if (lower.includes('extracurricular') || lower.includes('activities')) {
    return "Quality over quantity! Focus on 2-3 activities you're passionate about. Show leadership, impact, and commitment. Depth matters more than breadth.";
  }
  
  if (lower.includes('interview')) {
    return "Be yourself, be prepared, and be enthusiastic! Research the university, prepare questions to ask, practice common questions, and dress appropriately.";
  }
  
  // Default response
  return "I can help with college applications! Ask me about:\n- Application deadlines\n- Test scores (SAT, ACT, TOEFL, IELTS)\n- Essays and personal statements\n- Financial aid\n- Choosing a major\n- Extracurriculars\n- Letters of recommendation";
}

module.exports = router;