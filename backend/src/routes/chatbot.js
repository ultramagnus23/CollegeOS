// backend/src/routes/chatbot.js
// Simple chatbot route (can use this or the AI counselor)

const express = require('express');
const router = express.Router();

const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;

/**
 * Simple chat endpoint
 * POST /api/chatbot/chat
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Simple fallback response
    const response = getSimpleResponse(message);

    res.json({
      success: true,
      reply: response
    });

  } catch (error) {
    console.error('Chatbot error:', error);
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