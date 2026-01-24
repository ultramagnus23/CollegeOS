// backend/src/data/knowledgeBase.js
// Comprehensive knowledge base for educational systems, exams, and application processes

const knowledgeBase = {
  // Educational Systems
  educationalSystems: {
    CBSE: {
      full_name: 'Central Board of Secondary Education',
      country: 'India',
      description: 'National board of education in India',
      grading_system: 'Percentage (0-100%)',
      accepted_by: ['US', 'UK', 'Canada', 'Netherlands', 'Australia']
    },
    IB: {
      full_name: 'International Baccalaureate',
      country: 'International',
      description: 'Globally recognized diploma program',
      grading_system: 'Points (1-45 total)',
      accepted_by: ['US', 'UK', 'Canada', 'Netherlands', 'Australia']
    },
    IGCSE: {
      full_name: 'International General Certificate of Secondary Education',
      country: 'International',
      description: 'International qualification offered by Cambridge',
      grading_system: 'Letter grades (A*-G)',
      accepted_by: ['US', 'UK', 'Canada', 'Netherlands', 'Australia']
    }
  },
  
  // Entrance Exams
  entranceExams: {
    JEE: {
      full_name: 'Joint Entrance Examination',
      country: 'India',
      purpose: 'Engineering college admissions in India',
      types: ['JEE Main', 'JEE Advanced']
    },
    IELTS: {
      full_name: 'International English Language Testing System',
      purpose: 'English proficiency test',
      score_range: '0-9',
      typical_minimum: { US: 6.5, UK: 6.0, Canada: 6.5, Netherlands: 6.5 }
    },
    TOEFL: {
      full_name: 'Test of English as a Foreign Language',
      purpose: 'English proficiency test',
      score_range: '0-120',
      typical_minimum: { US: 80, UK: 80, Canada: 90, Netherlands: 90 }
    }
  },
  
  // Application Processes
  applicationProcesses: {
    US: {
      common_app: {
        name: 'Common Application',
        description: 'Centralized application platform for 900+ US colleges',
        website: 'https://commonapp.org'
      }
    },
    UK: {
      ucas: {
        name: 'UCAS',
        description: 'Universities and Colleges Admissions Service',
        website: 'https://ucas.com'
      }
    },
    Netherlands: {
      studielink: {
        name: 'Studielink',
        description: 'Central application portal for all Dutch universities',
        website: 'https://studielink.nl',
        numerus_fixus: {
          description: 'Limited enrollment programs',
          common_programs: ['Medicine', 'Dentistry', 'Psychology']
        }
      }
    }
  }
};

module.exports = knowledgeBase;
