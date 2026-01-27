// backend/services/essayPromptsService.js
// Service to provide essay prompts for colleges
// Data is from official sources (Common App, Coalition App, official college websites)

const dbManager = require('../config/database');
const College = require('../models/College');
const logger = require('../utils/logger');

// Common App Personal Essay Prompts (2024-2025)
// Source: https://www.commonapp.org/apply/essay-prompts
const COMMON_APP_PROMPTS = [
  {
    id: 'ca_1',
    prompt: 'Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  },
  {
    id: 'ca_2',
    prompt: 'The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  },
  {
    id: 'ca_3',
    prompt: 'Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  },
  {
    id: 'ca_4',
    prompt: 'Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  },
  {
    id: 'ca_5',
    prompt: 'Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  },
  {
    id: 'ca_6',
    prompt: 'Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  },
  {
    id: 'ca_7',
    prompt: 'Share an essay on any topic of your choice. It can be one you\'ve already written, one that responds to a different prompt, or one of your own design.',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Common Application 2024-2025'
  }
];

// Coalition App Prompts (2024-2025)
// Source: https://www.coalitionforcollegeaccess.org/
const COALITION_APP_PROMPTS = [
  {
    id: 'coal_1',
    prompt: 'Tell a story from your life, describing an experience that either demonstrates your character or helped to shape it.',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Coalition Application 2024-2025'
  },
  {
    id: 'coal_2',
    prompt: 'What interests or excites you? How does it shape who you are now or who you might become in the future?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Coalition Application 2024-2025'
  },
  {
    id: 'coal_3',
    prompt: 'Describe a time when you had a positive impact on others. What were the challenges? What were the rewards?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Coalition Application 2024-2025'
  },
  {
    id: 'coal_4',
    prompt: 'Has there been a time when an idea or belief of yours was questioned? How did you respond? What did you learn?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Coalition Application 2024-2025'
  },
  {
    id: 'coal_5',
    prompt: 'What success have you achieved or obstacle have you faced? What advice would you give a sibling or friend going through a similar experience?',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Coalition Application 2024-2025'
  },
  {
    id: 'coal_6',
    prompt: 'Submit an essay on a topic of your choice.',
    wordLimit: 650,
    type: 'personal_statement',
    source: 'Coalition Application 2024-2025'
  }
];

// College-specific supplemental essay prompts
// These are from official college websites for 2024-2025
const COLLEGE_SUPPLEMENTALS = {
  'Harvard University': [
    {
      prompt: 'Harvard has long recognized the importance of enrolling a diverse student body. How will the life experiences that shape who you are today enable you to contribute to Harvard?',
      wordLimit: 200,
      type: 'supplemental',
      source: 'Harvard Admissions 2024-2025'
    },
    {
      prompt: 'Please briefly elaborate on one of your extracurricular activities or work experiences. (Optional)',
      wordLimit: 150,
      type: 'supplemental',
      source: 'Harvard Admissions 2024-2025'
    }
  ],
  'Yale University': [
    {
      prompt: 'Students at Yale have time to explore their academic interests before declaring a major. Many students either modify their original academic direction or change their minds entirely. As of this moment, what academic areas seem to fit your interests or goals most comfortably?',
      wordLimit: 125,
      type: 'why_us',
      source: 'Yale Admissions 2024-2025'
    },
    {
      prompt: 'Tell us about a topic or idea that excites you and is related to one or more academic areas you selected above. Why are you drawn to it?',
      wordLimit: 250,
      type: 'supplemental',
      source: 'Yale Admissions 2024-2025'
    },
    {
      prompt: 'What is it about Yale that has led you to apply?',
      wordLimit: 125,
      type: 'why_us',
      source: 'Yale Admissions 2024-2025'
    }
  ],
  'Princeton University': [
    {
      prompt: 'As a research institution that also prides itself on its liberal arts curriculum, Princeton allows students to explore areas across the humanities and the arts, the natural sciences, and the social sciences. What academic areas most pique your curiosity, and how do the programs offered at Princeton suit your particular interests?',
      wordLimit: 250,
      type: 'why_us',
      source: 'Princeton Admissions 2024-2025'
    },
    {
      prompt: 'Princeton has a longstanding commitment to service and civic engagement. Please tell us how your story intersects (or will intersect) with these ideals.',
      wordLimit: 250,
      type: 'supplemental',
      source: 'Princeton Admissions 2024-2025'
    }
  ],
  'Stanford University': [
    {
      prompt: 'What is the most significant challenge that society faces today?',
      wordLimit: 50,
      type: 'supplemental',
      source: 'Stanford Admissions 2024-2025'
    },
    {
      prompt: 'How did you spend your last two summers?',
      wordLimit: 50,
      type: 'supplemental',
      source: 'Stanford Admissions 2024-2025'
    },
    {
      prompt: 'What historical moment or event do you wish you could have witnessed?',
      wordLimit: 50,
      type: 'supplemental',
      source: 'Stanford Admissions 2024-2025'
    },
    {
      prompt: 'Tell us about something that is meaningful to you, and why?',
      wordLimit: 250,
      type: 'supplemental',
      source: 'Stanford Admissions 2024-2025'
    }
  ],
  'Massachusetts Institute of Technology': [
    {
      prompt: 'We know you lead a busy life, full of activities, many of which are required of you. Tell us about something you do simply for the pleasure of it.',
      wordLimit: 200,
      type: 'supplemental',
      source: 'MIT Admissions 2024-2025'
    },
    {
      prompt: 'Describe the world you come from (for example, your family, school, community, city, or town). How has that world shaped your dreams and aspirations?',
      wordLimit: 200,
      type: 'supplemental',
      source: 'MIT Admissions 2024-2025'
    },
    {
      prompt: 'MIT brings people with diverse backgrounds together to collaborate, from tackling the world\'s biggest challenges to lending a helping hand. Describe one way you have collaborated with others to learn from them, with them, or contribute to your community together.',
      wordLimit: 200,
      type: 'supplemental',
      source: 'MIT Admissions 2024-2025'
    }
  ],
  'Columbia University': [
    {
      prompt: 'Columbia students take an active role in improving their community, whether in their residence hall, move-in group, or throughout New York City. Their actions, small or large, work to positively impact the lives of others. Share one contribution that you have made to your family, school, friend group, or another community that surrounds you.',
      wordLimit: 200,
      type: 'supplemental',
      source: 'Columbia Admissions 2024-2025'
    },
    {
      prompt: 'Why are you interested in attending Columbia University?',
      wordLimit: 200,
      type: 'why_us',
      source: 'Columbia Admissions 2024-2025'
    }
  ],
  'University of Pennsylvania': [
    {
      prompt: 'Write a short thank-you note to someone you have not yet thanked and would like to acknowledge. (We encourage you to share this letter with that person, if possible, and remember the power of gratitude in your daily life!)',
      wordLimit: 150,
      type: 'supplemental',
      source: 'Penn Admissions 2024-2025'
    },
    {
      prompt: 'How will you explore community at Penn? Consider how Penn will help shape your perspective, and how your experiences and perspective will help shape Penn.',
      wordLimit: 450,
      type: 'why_us',
      source: 'Penn Admissions 2024-2025'
    }
  ],
  'Duke University': [
    {
      prompt: 'What is your sense of Duke as a university and a community, and why do you consider it a good match for you? If there\'s something in particular about our offerings that attracts you, feel free to share that as well.',
      wordLimit: 250,
      type: 'why_us',
      source: 'Duke Admissions 2024-2025'
    },
    {
      prompt: 'We want to emphasize that the following is optional. If you believe there\'s information we should know to better understand your application, please tell us here.',
      wordLimit: 250,
      type: 'supplemental',
      source: 'Duke Admissions 2024-2025'
    }
  ]
};

// UCAS Personal Statement guidance for UK
const UCAS_PROMPTS = [
  {
    prompt: 'Why are you applying for your chosen course(s)? Consider what aspects of the subject interest you, any relevant work experience or voluntary work, and how your studies connect to the course.',
    wordLimit: 4000,
    characterLimit: 4000,
    type: 'personal_statement',
    source: 'UCAS Personal Statement Guidelines',
    notes: 'UCAS personal statements are limited to 4,000 characters (approximately 47 lines), not words.'
  }
];

class EssayPromptsService {
  
  /**
   * Get essay prompts for a specific college
   * @param {number|object} collegeOrId - College ID or college object
   * @returns {object} Essay prompts information
   */
  async getPromptsForCollege(collegeOrId) {
    let college;
    
    if (typeof collegeOrId === 'number') {
      college = College.findById(collegeOrId);
    } else {
      college = collegeOrId;
    }
    
    if (!college) {
      throw new Error('College not found');
    }
    
    const result = {
      collegeName: college.name,
      country: college.country,
      applicationPortal: college.application_portal,
      prompts: [],
      commonAppPrompts: [],
      source: null,
      notes: null
    };
    
    // 1. Check for college-specific supplemental prompts
    const specificPrompts = COLLEGE_SUPPLEMENTALS[college.name];
    if (specificPrompts) {
      result.prompts = specificPrompts;
      result.source = 'Official College Website';
    }
    
    // 2. Add relevant application prompts based on country/portal
    if (college.country === 'US') {
      // Most US colleges accept Common App
      result.commonAppPrompts = COMMON_APP_PROMPTS;
      result.notes = 'Most US colleges accept the Common Application. Choose one personal essay prompt from the list above.';
      
      // If they use Coalition, include those too
      if (college.application_portal === 'Coalition' || college.application_portal === 'Both') {
        result.coalitionAppPrompts = COALITION_APP_PROMPTS;
      }
    } else if (college.country === 'UK') {
      result.prompts = UCAS_PROMPTS;
      result.source = 'UCAS';
      result.notes = 'UK universities require a personal statement through UCAS. This is limited to 4,000 characters (not words).';
    } else {
      result.notes = 'Essay requirements vary by university. Please check the official website for specific requirements.';
    }
    
    return result;
  }
  
  /**
   * Get Common App prompts
   */
  getCommonAppPrompts() {
    return COMMON_APP_PROMPTS;
  }
  
  /**
   * Get Coalition App prompts
   */
  getCoalitionAppPrompts() {
    return COALITION_APP_PROMPTS;
  }
  
  /**
   * Create essay records for an application with pre-populated prompts
   * @param {number} applicationId - Application ID
   * @param {number} collegeId - College ID
   */
  async createEssaysForApplication(applicationId, collegeId) {
    const promptsInfo = await this.getPromptsForCollege(collegeId);
    const db = dbManager.getDatabase();
    
    const insertStmt = db.prepare(`
      INSERT INTO essays (application_id, essay_type, prompt, word_limit, status, notes)
      VALUES (?, ?, ?, ?, 'not_started', ?)
    `);
    
    const createdEssays = [];
    
    // Create essays for college-specific prompts
    for (const prompt of promptsInfo.prompts) {
      try {
        const result = insertStmt.run(
          applicationId,
          prompt.type,
          prompt.prompt,
          prompt.wordLimit || prompt.characterLimit || null,
          `Source: ${prompt.source}`
        );
        
        createdEssays.push({
          id: result.lastInsertRowid,
          type: prompt.type,
          prompt: prompt.prompt,
          wordLimit: prompt.wordLimit
        });
      } catch (error) {
        logger.error(`Failed to create essay: ${error.message}`);
      }
    }
    
    return {
      applicationId,
      createdEssays,
      commonAppPrompts: promptsInfo.commonAppPrompts,
      notes: promptsInfo.notes
    };
  }
}

module.exports = new EssayPromptsService();
