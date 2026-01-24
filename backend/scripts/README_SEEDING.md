# College Data Seeding Guide

## Quick Start

### Clean and Reseed Database

```bash
cd backend
node scripts/seed_real_colleges.js
```

This will:
1. **Delete** all existing colleges (including duplicates)
2. **Fetch** real US colleges from Department of Education API
3. **Add** curated colleges from UK, India, Singapore, Australia, Netherlands, Germany
4. **Insert** all colleges with correct URLs and data

## Data Sources

### United States (100+ colleges)
- **Source**: US Department of Education College Scorecard API
- **Data**: Real colleges with official URLs, acceptance rates, majors
- **API**: https://api.data.gov/ed/collegescorecard/v1/schools
- **Note**: Uses DEMO_KEY by default (limited). For more colleges, get free API key from https://api.data.gov/signup/

### United Kingdom (10 universities)
- Oxford, Cambridge, Imperial, UCL, LSE, Edinburgh, Manchester, King's College, Warwick, Bristol
- All with correct official websites and admissions pages

### India (10 universities)
- IIT Bombay, IIT Delhi, IIT Madras, IIT Kanpur, IIT Kharagpur
- IISc Bangalore, JNU, Delhi University, BHU, Jadavpur University

### Singapore (2 universities)
- National University of Singapore (NUS)
- Nanyang Technological University (NTU)

### Australia (4 universities)
- University of Melbourne, Australian National University
- University of Sydney, University of Queensland

### Netherlands (4 universities)
- TU Delft, University of Amsterdam, Utrecht University, Eindhoven University

### Germany (4 universities)
- TU Munich, LMU Munich, Heidelberg University, Humboldt University Berlin

## Getting More US Colleges

### Option 1: Get Free API Key (Recommended)
1. Visit https://api.data.gov/signup/
2. Get your free API key
3. Create backend/.env file:
```bash
US_DOE_API_KEY=your_api_key_here
```
4. Edit script to increase limit:
```javascript
const usColleges = await fetchUSColleges(500); // Fetch 500 colleges
```

### Option 2: Run Multiple Times
```bash
# The script can be modified to fetch different pages
node scripts/seed_real_colleges.js
```

## Customization

### Add More Countries

Edit `seed_real_colleges.js` and add a new function:

```javascript
function getCanadianColleges() {
  return [
    { name: 'University of Toronto', country: 'Canada', ... },
    // Add more...
  ];
}

// Then in main():
allColleges.push(...getCanadianColleges());
```

### Add Individual Colleges

```bash
sqlite3 backend/database/college_app.db
```

```sql
INSERT INTO colleges (name, country, location, official_website, major_categories, trust_tier, is_verified)
VALUES ('New University', 'Country', 'City', 'https://example.edu', '["Engineering"]', 'official', 1);
```

## Verification

Check the seeded data:

```bash
sqlite3 backend/database/college_app.db

-- Count colleges by country
SELECT country, COUNT(*) as count FROM colleges GROUP BY country ORDER BY count DESC;

-- Check for duplicates
SELECT name, COUNT(*) as count FROM colleges GROUP BY name HAVING count > 1;

-- View sample colleges
SELECT name, country, official_website FROM colleges LIMIT 10;
```

## Troubleshooting

### API Rate Limits
If you get rate limit errors:
1. Get a free API key (see above)
2. Reduce the fetch limit
3. Add delays between requests

### Missing Axios
```bash
cd backend
npm install axios
```

### Database Locked
Stop the backend server before running the script:
```bash
# Stop server (Ctrl+C)
node scripts/seed_real_colleges.js
# Restart server
```

## Benefits

- ✅ **Real Data**: Official US government data + curated international universities
- ✅ **No Duplicates**: Clean database with unique colleges
- ✅ **Correct URLs**: All links point to official websites
- ✅ **Comprehensive**: Covers major study destinations (US, UK, India, Singapore, Australia, Netherlands, Germany)
- ✅ **Extensible**: Easy to add more countries or colleges
