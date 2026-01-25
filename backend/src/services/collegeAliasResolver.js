/**
 * College Alias Resolution Service
 * Handles canonical names and common abbreviations
 */

class CollegeAliasResolver {
  constructor() {
    // Common abbreviations and their canonical names
    this.aliases = {
      // US Colleges
      'mit': 'Massachusetts Institute of Technology',
      'stanford': 'Stanford University',
      'harvard': 'Harvard University',
      'yale': 'Yale University',
      'princeton': 'Princeton University',
      'columbia': 'Columbia University',
      'upenn': 'University of Pennsylvania',
      'penn': 'University of Pennsylvania',
      'cornell': 'Cornell University',
      'dartmouth': 'Dartmouth College',
      'brown': 'Brown University',
      'uva': 'University of Virginia',
      'unc': 'University of North Carolina',
      'ucla': 'University of California Los Angeles',
      'ucb': 'University of California Berkeley',
      'berkeley': 'University of California Berkeley',
      'usc': 'University of Southern California',
      'nyu': 'New York University',
      'asu': 'Arizona State University',
      'uiuc': 'University of Illinois Urbana-Champaign',
      'umich': 'University of Michigan',
      'michigan': 'University of Michigan',
      'gatech': 'Georgia Institute of Technology',
      'georgia tech': 'Georgia Institute of Technology',
      'caltech': 'California Institute of Technology',
      'northwestern': 'Northwestern University',
      'duke': 'Duke University',
      'rice': 'Rice University',
      'vanderbilt': 'Vanderbilt University',
      'notre dame': 'University of Notre Dame',
      'cmu': 'Carnegie Mellon University',
      'carnegie mellon': 'Carnegie Mellon University',
      
      // UK Colleges
      'oxbridge': ['University of Oxford', 'University of Cambridge'],
      'oxford': 'University of Oxford',
      'cambridge': 'University of Cambridge',
      'ucl': 'University College London',
      'imperial': 'Imperial College London',
      'lse': 'London School of Economics',
      'kcl': 'King\'s College London',
      'edinburgh': 'University of Edinburgh',
      'manchester': 'University of Manchester',
      'warwick': 'University of Warwick',
      'bristol': 'University of Bristol',
      
      // India
      'iit': 'Indian Institute of Technology', // Generic
      'iit bombay': 'Indian Institute of Technology Bombay',
      'iit delhi': 'Indian Institute of Technology Delhi',
      'iit madras': 'Indian Institute of Technology Madras',
      'iit kanpur': 'Indian Institute of Technology Kanpur',
      'iit kharagpur': 'Indian Institute of Technology Kharagpur',
      'iisc': 'Indian Institute of Science',
      'iisc bangalore': 'Indian Institute of Science',
      'jnu': 'Jawaharlal Nehru University',
      'du': 'University of Delhi',
      'delhi university': 'University of Delhi',
      'bhu': 'Banaras Hindu University',
      
      // Singapore
      'nus': 'National University of Singapore',
      'ntu': 'Nanyang Technological University',
      
      // Australia  
      'unimelb': 'University of Melbourne',
      'melbourne': 'University of Melbourne',
      'anu': 'Australian National University',
      'usyd': 'University of Sydney',
      'sydney': 'University of Sydney',
      'uq': 'University of Queensland',
      
      // Netherlands
      'tu delft': 'Delft University of Technology',
      'delft': 'Delft University of Technology',
      'uva': 'University of Amsterdam',
      'amsterdam': 'University of Amsterdam',
      'utrecht': 'Utrecht University',
      'tue': 'Eindhoven University of Technology',
      
      // Germany
      'tum': 'Technical University of Munich',
      'tu munich': 'Technical University of Munich',
      'lmu': 'Ludwig Maximilian University of Munich',
      'heidelberg': 'Heidelberg University',
      'humboldt': 'Humboldt University of Berlin'
    };
  }

  /**
   * Resolve alias to canonical name(s)
   * @param {string} alias - College abbreviation or common name
   * @returns {string|string[]|null} - Canonical name(s) or null
   */
  resolve(alias) {
    if (!alias) return null;
    
    const normalized = alias.toLowerCase().trim();
    
    // Direct match
    if (this.aliases[normalized]) {
      return this.aliases[normalized];
    }
    
    // Partial match for multi-word queries
    for (const [key, value] of Object.entries(this.aliases)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return value;
      }
    }
    
    return null;
  }

  /**
   * Normalize college name for comparison
   * @param {string} name - College name
   * @returns {string} - Normalized name
   */
  normalize(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .replace(/^the\s+/i, '') // Remove "The"
      .replace(/\s+university$/i, '') // Remove trailing "University"
      .replace(/\s+college$/i, '') // Remove trailing "College"
      .replace(/\s+institute$/i, '') // Remove trailing "Institute"
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .trim();
  }

  /**
   * Check if two college names are likely the same
   * @param {string} name1 
   * @param {string} name2 
   * @returns {boolean}
   */
  isSimilar(name1, name2) {
    const norm1 = this.normalize(name1);
    const norm2 = this.normalize(name2);
    
    // Exact match after normalization
    if (norm1 === norm2) return true;
    
    // One contains the other (for abbreviations)
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    
    // Check if either is an alias of the other
    const resolved1 = this.resolve(norm1);
    const resolved2 = this.resolve(norm2);
    
    if (resolved1 && this.normalize(resolved1) === norm2) return true;
    if (resolved2 && this.normalize(resolved2) === norm1) return true;
    
    return false;
  }

  /**
   * Expand query with aliases for better search
   * @param {string} query - Search query
   * @returns {string[]} - Query variations
   */
  expandQuery(query) {
    const variations = [query];
    const resolved = this.resolve(query);
    
    if (resolved) {
      if (Array.isArray(resolved)) {
        variations.push(...resolved);
      } else {
        variations.push(resolved);
      }
    }
    
    return [...new Set(variations)]; // Remove duplicates
  }
}

// Export singleton
const collegeAliasResolver = new CollegeAliasResolver();
module.exports = collegeAliasResolver;
