/**
 * Parse and Deduplicate College Data Script
 * 
 * This script:
 * 1. Parses data.txt from the backend/data directory
 * 2. Removes duplicate colleges (by normalized name)
 * 3. Normalizes all data fields
 * 4. Maps to the comprehensive schema
 * 5. Tracks sources and assigns confidence scores
 * 6. Outputs a unified JSON file for database seeding
 */

const fs = require('fs');
const path = require('path');

// Input/output paths
const DATA_FILE = path.join(__dirname, '..', 'data', 'data.txt');
const VERIFIED_DIR = path.join(__dirname, '..', 'data', 'verified');
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'unified_colleges.json');

// Helper to normalize names for deduplication
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ')     // Normalize spaces
    .replace(/\buniversity\b/g, 'univ')
    .replace(/\bcollege\b/g, 'coll')
    .replace(/\binstitute\b/g, 'inst')
    .replace(/\btechnology\b/g, 'tech')
    .replace(/\bof\b/g, '')
    .replace(/\band\b/g, '')
    .replace(/\bthe\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize country names
function normalizeCountry(country) {
  if (!country) return null;
  const countryMap = {
    'us': 'United States',
    'usa': 'United States',
    'united states of america': 'United States',
    'uk': 'United Kingdom',
    'england': 'United Kingdom',
    'britain': 'United Kingdom',
    'great britain': 'United Kingdom',
    'uae': 'United Arab Emirates',
    's korea': 'South Korea',
    'south korea': 'South Korea',
    'korea': 'South Korea',
    'prc': 'China',
    "people's republic of china": 'China',
    'hk': 'Hong Kong',
    'hongkong': 'Hong Kong'
  };
  
  const normalized = country.toLowerCase().trim();
  return countryMap[normalized] || country.trim();
}

// Map campus_type to urban_classification
function mapUrbanClassification(campusType) {
  if (!campusType) return null;
  const mapping = {
    'urban': 'Urban',
    'suburban': 'Suburban',
    'rural': 'Rural',
    'small town': 'Small Town',
    'city': 'Urban',
    'town': 'Small Town'
  };
  return mapping[campusType.toLowerCase()] || campusType;
}

// Calculate confidence score based on data completeness
function calculateConfidence(college) {
  const importantFields = [
    'name', 'country', 'city', 'website', 
    'acceptance_rate', 'student_population', 
    'tuition_international_usd', 'qs_ranking'
  ];
  
  let present = 0;
  for (const field of importantFields) {
    if (college[field] !== null && college[field] !== undefined) {
      present++;
    }
  }
  
  // Base confidence from data completeness
  let confidence = present / importantFields.length;
  
  // Boost if from verified source
  if (college._source && college._source.includes('verified')) {
    confidence = Math.min(1.0, confidence + 0.1);
  }
  
  return Math.round(confidence * 100) / 100;
}

// Extract state from city or location
function extractState(city, state, country) {
  if (state) return state;
  if (!city) return null;
  
  // US state abbreviations
  const usStates = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };
  
  // Check if city contains state abbreviation
  const match = city.match(/,\s*([A-Z]{2})\s*$/);
  if (match && usStates[match[1]]) {
    return usStates[match[1]];
  }
  
  // Check for full state names
  for (const [abbr, fullName] of Object.entries(usStates)) {
    if (city.toLowerCase().includes(fullName.toLowerCase())) {
      return fullName;
    }
  }
  
  return state || null;
}

// Parse a single college entry
function parseCollege(raw, source = 'data.txt') {
  const college = {
    // Core fields
    name: raw.name || null,
    alternate_names: null,
    country: normalizeCountry(raw.country),
    state_region: extractState(raw.city, raw.state, raw.country),
    city: raw.city || raw.location || null,
    urban_classification: mapUrbanClassification(raw.campus_type),
    institution_type: raw.type || raw.institution_type || null,
    classification: null, // Would need CDS data
    religious_affiliation: raw.religious_affiliation || null,
    founding_year: raw.founding_year ? parseInt(raw.founding_year) : null,
    campus_size_acres: raw.campus_size_acres ? parseFloat(raw.campus_size_acres) : null,
    
    // Enrollment
    undergraduate_enrollment: raw.undergraduate_enrollment ? parseInt(raw.undergraduate_enrollment) : null,
    graduate_enrollment: raw.graduate_enrollment ? parseInt(raw.graduate_enrollment) : null,
    total_enrollment: raw.student_population ? parseInt(raw.student_population) : 
                      (raw.enrollment ? parseInt(raw.enrollment) : null),
    student_faculty_ratio: raw.student_faculty_ratio || null,
    
    // Website
    website_url: raw.website || raw.official_website || null,
    
    // Admissions data
    admissions: {
      year: new Date().getFullYear(),
      acceptance_rate: raw.acceptance_rate !== undefined ? 
        (raw.acceptance_rate > 1 ? raw.acceptance_rate / 100 : raw.acceptance_rate) : null,
      test_optional_flag: raw.test_optional ? 1 : 0,
      source: source,
      confidence_score: 0.5
    },
    
    // Financial data
    financial: {
      year: new Date().getFullYear(),
      tuition_international: raw.tuition_international_usd || raw.tuition_international || null,
      tuition_in_state: raw.tuition_domestic_usd || raw.tuition_domestic || null,
      tuition_out_state: raw.tuition_out_state || null,
      source: source,
      confidence_score: 0.5
    },
    
    // Student stats
    student_stats: {
      year: new Date().getFullYear(),
      sat_range: raw.sat_range || null,
      act_range: raw.act_range || null,
      gpa_50: raw.average_gpa || null,
      source: source,
      confidence_score: 0.5
    },
    
    // Academic outcomes
    outcomes: {
      year: new Date().getFullYear(),
      graduation_rate_4yr: raw.graduation_rate_4yr || raw.graduation_rate || null,
      source: source,
      confidence_score: 0.5
    },
    
    // Programs (popular majors)
    programs: (raw.popular_majors || []).map(major => ({
      program_name: major,
      degree_type: "Bachelor's",
      source: source
    })),
    
    // Rankings
    rankings: [],
    
    // Campus life
    campus_life: {
      housing_guarantee: raw.housing_guaranteed || null,
      source: source
    },
    
    // Demographics
    demographics: {
      year: new Date().getFullYear(),
      percent_international: raw.international_pct ? raw.international_pct / 100 : null,
      source: source
    },
    
    // Source tracking
    _source: source,
    _confidence: 0
  };
  
  // Add QS ranking if available
  if (raw.qs_ranking) {
    college.rankings.push({
      year: new Date().getFullYear(),
      ranking_body: 'QS',
      global_rank: parseInt(raw.qs_ranking)
    });
  }
  
  // Add THE ranking if available
  if (raw.the_ranking) {
    college.rankings.push({
      year: new Date().getFullYear(),
      ranking_body: 'THE',
      global_rank: parseInt(raw.the_ranking)
    });
  }
  
  // Calculate overall confidence
  college._confidence = calculateConfidence(raw);
  college.admissions.confidence_score = college._confidence;
  college.financial.confidence_score = college._confidence;
  college.student_stats.confidence_score = college._confidence;
  college.outcomes.confidence_score = college._confidence;
  
  return college;
}

// Load and parse data.txt
function loadDataTxt() {
  console.log('📖 Loading data.txt...');
  
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ data.txt not found at', DATA_FILE);
    return [];
  }
  
  try {
    const content = fs.readFileSync(DATA_FILE, 'utf8');
    
    // Try parsing as a single JSON array first
    try {
      const data = JSON.parse(content);
      console.log(`✓ Loaded ${data.length} entries from data.txt`);
      return data.map(entry => parseCollege(entry, 'data.txt'));
    } catch (singleParseErr) {
      // If that fails, parse line by line
      console.log('  ℹ️ Parsing line by line...');
      
      const allData = [];
      const lines = content.split('\n');
      let skipped = 0;
      
      for (const line of lines) {
        let trimmed = line.trim();
        
        // Skip array brackets and empty lines
        if (trimmed === '[' || trimmed === ']' || trimmed === '') {
          continue;
        }
        
        // Check if line looks like a JSON object
        if (trimmed.startsWith('{')) {
          // Remove trailing comma if present
          if (trimmed.endsWith(',')) {
            trimmed = trimmed.slice(0, -1);
          }
          
          try {
            const obj = JSON.parse(trimmed);
            if (obj && obj.name) {
              allData.push(obj);
            }
          } catch (err) {
            skipped++;
          }
        }
      }
      
      console.log(`✓ Loaded ${allData.length} entries from data.txt (line by line)`);
      if (skipped > 0) {
        console.log(`  ⚠️ Skipped ${skipped} malformed entries`);
      }
      
      return allData.map(entry => parseCollege(entry, 'data.txt'));
    }
  } catch (err) {
    console.error('❌ Error reading data.txt:', err.message);
    return [];
  }
}

// Load verified JSON files
function loadVerifiedFiles() {
  console.log('\n📖 Loading verified data files...');
  
  const colleges = [];
  
  if (!fs.existsSync(VERIFIED_DIR)) {
    console.log('⚠️ Verified directory not found');
    return colleges;
  }
  
  const files = fs.readdirSync(VERIFIED_DIR).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(VERIFIED_DIR, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Handle different JSON structures
      let data = [];
      if (Array.isArray(content)) {
        data = content;
      } else if (content.universities) {
        data = content.universities;
      } else if (content.colleges) {
        data = content.colleges;
      }
      
      for (const entry of data) {
        colleges.push(parseCollege(entry, `verified/${file}`));
      }
      
      console.log(`  ✓ ${file}: ${data.length} entries`);
    } catch (err) {
      console.error(`  ✗ ${file}: ${err.message}`);
    }
  }
  
  return colleges;
}

// Merge duplicate colleges (keep the one with more data)
function mergeColleges(existing, newEntry) {
  const merged = { ...existing };
  
  // For each field, prefer non-null values
  for (const key of Object.keys(newEntry)) {
    if (key.startsWith('_')) continue;
    
    if (newEntry[key] !== null && newEntry[key] !== undefined) {
      if (existing[key] === null || existing[key] === undefined) {
        merged[key] = newEntry[key];
      } else if (typeof newEntry[key] === 'object' && !Array.isArray(newEntry[key])) {
        // Merge nested objects
        merged[key] = { ...existing[key], ...newEntry[key] };
        // Remove null/undefined from merged
        for (const k of Object.keys(merged[key])) {
          if (merged[key][k] === null || merged[key][k] === undefined) {
            if (existing[key] && existing[key][k] !== null && existing[key][k] !== undefined) {
              merged[key][k] = existing[key][k];
            } else if (newEntry[key] && newEntry[key][k] !== null && newEntry[key][k] !== undefined) {
              merged[key][k] = newEntry[key][k];
            }
          }
        }
      } else if (Array.isArray(newEntry[key]) && Array.isArray(existing[key])) {
        // Merge arrays (unique values)
        const seen = new Set();
        merged[key] = [...existing[key], ...newEntry[key]].filter(item => {
          const key = typeof item === 'object' ? JSON.stringify(item) : item;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    }
  }
  
  // Update confidence to higher value
  if (newEntry._confidence > existing._confidence) {
    merged._confidence = newEntry._confidence;
  }
  
  // Track multiple sources
  if (existing._source !== newEntry._source) {
    merged._sources = [existing._source, newEntry._source];
  }
  
  return merged;
}

// Main deduplication logic
function deduplicateColleges(allColleges) {
  console.log('\n🔄 Deduplicating colleges...');
  
  const seen = new Map(); // normalized_name -> college
  let duplicates = 0;
  let merged = 0;
  
  for (const college of allColleges) {
    if (!college.name) continue;
    
    const key = normalizeName(college.name);
    
    if (seen.has(key)) {
      // Merge with existing entry
      const existing = seen.get(key);
      seen.set(key, mergeColleges(existing, college));
      duplicates++;
      merged++;
    } else {
      seen.set(key, college);
    }
  }
  
  console.log(`  📊 Total processed: ${allColleges.length}`);
  console.log(`  🔄 Duplicates found: ${duplicates}`);
  console.log(`  ✅ Unique colleges: ${seen.size}`);
  
  return Array.from(seen.values());
}

// Validate numeric fields
function validateNumeric(value, min = 0, max = Infinity) {
  if (value === null || value === undefined) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

// Final validation pass
function validateColleges(colleges) {
  console.log('\n✅ Validating colleges...');
  
  let fixed = 0;
  
  for (const college of colleges) {
    // Validate acceptance rate (0-1)
    if (college.admissions && college.admissions.acceptance_rate !== null) {
      const rate = validateNumeric(college.admissions.acceptance_rate, 0, 1);
      if (rate !== college.admissions.acceptance_rate) {
        college.admissions.acceptance_rate = rate;
        fixed++;
      }
    }
    
    // Validate tuition (reasonable range)
    if (college.financial) {
      if (college.financial.tuition_international !== null) {
        college.financial.tuition_international = validateNumeric(
          college.financial.tuition_international, 0, 200000
        );
      }
      if (college.financial.tuition_in_state !== null) {
        college.financial.tuition_in_state = validateNumeric(
          college.financial.tuition_in_state, 0, 200000
        );
      }
    }
    
    // Validate enrollment
    if (college.total_enrollment !== null) {
      college.total_enrollment = validateNumeric(college.total_enrollment, 0, 500000);
    }
    
    // Validate graduation rate (0-100 or 0-1)
    if (college.outcomes && college.outcomes.graduation_rate_4yr !== null) {
      let rate = validateNumeric(college.outcomes.graduation_rate_4yr, 0, 100);
      if (rate !== null && rate > 1) {
        rate = rate / 100; // Convert percentage to decimal
      }
      college.outcomes.graduation_rate_4yr = rate;
    }
    
    // Validate rankings
    for (const ranking of (college.rankings || [])) {
      if (ranking.global_rank !== null) {
        ranking.global_rank = validateNumeric(ranking.global_rank, 1, 5000);
      }
    }
  }
  
  console.log(`  🔧 Fixed ${fixed} validation issues`);
  
  return colleges;
}

// Generate summary statistics
function generateStats(colleges) {
  console.log('\n📊 Generating statistics...');
  
  const stats = {
    total: colleges.length,
    byCountry: {},
    withAcceptanceRate: 0,
    withTuition: 0,
    withRankings: 0,
    avgConfidence: 0
  };
  
  let totalConfidence = 0;
  
  for (const college of colleges) {
    // By country
    const country = college.country || 'Unknown';
    stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
    
    // Data completeness
    if (college.admissions?.acceptance_rate !== null) stats.withAcceptanceRate++;
    if (college.financial?.tuition_international !== null || 
        college.financial?.tuition_in_state !== null) stats.withTuition++;
    if (college.rankings && college.rankings.length > 0) stats.withRankings++;
    
    totalConfidence += college._confidence || 0;
  }
  
  stats.avgConfidence = Math.round((totalConfidence / colleges.length) * 100) / 100;
  
  // Sort countries by count
  stats.topCountries = Object.entries(stats.byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  
  return stats;
}

// Main function
async function main() {
  console.log('='.repeat(60));
  console.log('  COLLEGE DATA PARSER & DEDUPLICATOR');
  console.log('='.repeat(60));
  console.log();
  
  // Load all data sources
  const dataTxtColleges = loadDataTxt();
  const verifiedColleges = loadVerifiedFiles();
  
  // Combine all sources (verified data takes priority)
  const allColleges = [...verifiedColleges, ...dataTxtColleges];
  console.log(`\n📚 Total entries from all sources: ${allColleges.length}`);
  
  // Deduplicate
  const uniqueColleges = deduplicateColleges(allColleges);
  
  // Validate
  const validatedColleges = validateColleges(uniqueColleges);
  
  // Generate stats
  const stats = generateStats(validatedColleges);
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total unique colleges: ${stats.total}`);
  console.log(`  With acceptance rate: ${stats.withAcceptanceRate}`);
  console.log(`  With tuition data: ${stats.withTuition}`);
  console.log(`  With rankings: ${stats.withRankings}`);
  console.log(`  Average confidence: ${stats.avgConfidence}`);
  console.log();
  console.log('  Top 15 countries:');
  for (const [country, count] of stats.topCountries.slice(0, 15)) {
    console.log(`    ${country}: ${count}`);
  }
  
  // Prepare output
  const output = {
    metadata: {
      version: '1.0',
      generated_at: new Date().toISOString(),
      total_colleges: stats.total,
      sources: ['data.txt', 'verified/*.json'],
      schema_version: '011_comprehensive_college_schema',
      stats: {
        with_acceptance_rate: stats.withAcceptanceRate,
        with_tuition: stats.withTuition,
        with_rankings: stats.withRankings,
        avg_confidence: stats.avgConfidence,
        countries: Object.keys(stats.byCountry).length
      }
    },
    colleges: validatedColleges
  };
  
  // Write output
  console.log(`\n💾 Writing unified data to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log('✅ Done!');
  
  return output;
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, parseCollege, deduplicateColleges, normalizeName };
