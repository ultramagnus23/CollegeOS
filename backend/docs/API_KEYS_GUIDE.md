# 🔑 API Keys Guide for College Data Scraping

## Overview

The CollegeOS scraping system can work with **NO API keys** for basic functionality, but adding API keys significantly improves data quality and coverage.

---

## ✅ Quick Start (No API Keys)

**You can start scraping immediately without any API keys:**

```bash
cd backend
npm run scrape
```

**What works without API keys:**
- ✅ College website scraping
- ✅ IPEDS CSV bulk downloads (public, no key needed)
- ✅ CDS PDF downloads (public)
- ✅ Basic data collection for all colleges

**Limitations without API keys:**
- ⚠️ No College Scorecard API data (salary, debt metrics)
- ⚠️ Slower IPEDS updates (manual CSV import vs API)
- ⚠️ Limited rate limits for some sources

---

## 🎯 Recommended API Keys (All Free)

### Priority 1: Data.gov API Key (for College Scorecard)

**Why you need it:**
- Access Department of Education's College Scorecard API
- Get median salary data (6-year, 10-year post-graduation)
- Get median debt at graduation
- Get net price data
- Get completion rates

**How to get it:**
1. Go to https://api.data.gov/signup/
2. Fill out the form (takes 2 minutes)
   - Email address
   - First name, last name
   - Purpose: "Educational research"
3. Check your email for API key (instant)
4. Copy the key (format: `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`)

**Add to .env:**
```bash
DATA_GOV_API_KEY=your_40_character_key_here
```

**Rate Limits:**
- Free tier: 1,000 requests/hour
- 30,000 requests/day
- More than enough for our needs

**Test it:**
```bash
curl "https://api.data.gov/ed/collegescorecard/v1/schools?\
school.name=Duke%20University&\
api_key=YOUR_KEY&\
fields=school.name,latest.earnings.10_yrs_after_entry.median"
```

Expected response:
```json
{
  "results": [{
    "school.name": "Duke University",
    "latest.earnings.10_yrs_after_entry.median": 97800
  }]
}
```

**Cost:** FREE ✅  
**Required:** Highly Recommended 🌟🌟🌟  
**Improves:** Salary data, debt data, completion rates

---

### Priority 2: IPEDS API Key (Future Enhancement)

**Current Status:** Not actively used - we use CSV bulk downloads instead

**Why it exists:**
- NCES (National Center for Education Statistics) has an experimental API
- Currently in beta and not well-documented
- CSV bulk downloads are more reliable

**How we currently get IPEDS data:**
1. Download CSV files from https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx
2. Import via script: `npm run import:ipeds` (to be created)
3. No API key needed for CSV downloads

**Future:** If IPEDS API becomes stable, we'll add support

**Cost:** FREE ✅  
**Required:** No (using CSV instead) ⚪  
**Status:** Watching for beta improvements

---

### Priority 3: US News API (Not Publicly Available)

**Status:** US News does not offer a public API

**How we get US News data:**
- Web scraping (respectful, rate-limited)
- Robots.txt compliant
- 1 request per 3 seconds
- Only during business hours

**No API key needed** - we scrape publicly available pages

**Alternative:** Manual entry for top 100 colleges (one-time)

**Cost:** N/A (no API)  
**Required:** No ⚪

---

### Priority 4: QS World Rankings API

**Status:** QS offers an API but requires partnership

**Current approach:**
- Web scraping of public rankings pages
- Annual manual import of rankings CSV
- Available at: https://www.topuniversities.com/university-rankings

**For API access:**
- Email: data@qs.com
- Request: Academic/research partnership
- May require institutional affiliation

**Current:** Works without API via web scraping  
**Cost:** Partnership required (for API)  
**Required:** No (scraping works) ⚪

---

## 🔧 How to Add API Keys

### Step 1: Copy the example file

```bash
cd backend
cp .env.example .env
```

### Step 2: Edit .env file

Open `backend/.env` in your text editor:

```bash
# Required keys (highly recommended)
DATA_GOV_API_KEY=paste_your_40_character_key_here

# Optional keys (future enhancements)
# IPEDS_API_KEY=not_currently_used
# QS_API_KEY=requires_partnership
```

### Step 3: Test the connection

```bash
# Test College Scorecard API
node -e "
const axios = require('axios');
const key = process.env.DATA_GOV_API_KEY || require('dotenv').config() && process.env.DATA_GOV_API_KEY;
axios.get('https://api.data.gov/ed/collegescorecard/v1/schools', {
  params: {
    'school.name': 'Duke University',
    'api_key': key,
    'fields': 'school.name,latest.earnings.10_yrs_after_entry.median'
  }
}).then(r => console.log('✅ API works!', r.data.results[0]))
  .catch(e => console.error('❌ API failed:', e.response?.data || e.message));
"
```

Expected output:
```
✅ API works! {
  school.name: 'Duke University',
  latest.earnings.10_yrs_after_entry.median: 97800
}
```

---

## 📊 Impact of API Keys on Data Quality

### Without DATA_GOV_API_KEY:

**Available fields:**
- ✅ Basic info (name, location, website)
- ✅ Acceptance rates (from websites/CDS)
- ✅ Tuition (from websites/IPEDS CSV)
- ✅ Enrollment (from websites/IPEDS CSV)
- ❌ Median salary 6-year
- ❌ Median salary 10-year
- ❌ Median debt
- ❌ Net price by income bracket
- ❌ Completion rates by demographics

**Data completeness:** ~60-70% of fields

### With DATA_GOV_API_KEY:

**Additional fields available:**
- ✅ Median salary 6 years after entry
- ✅ Median salary 10 years after entry
- ✅ Median debt at graduation
- ✅ Net price by income level (0-30k, 30-48k, 48-75k, 75-110k, 110k+)
- ✅ Completion rate overall
- ✅ Completion rate by race/ethnicity
- ✅ Completion rate by Pell Grant status
- ✅ Retention rate (first-time, full-time students)
- ✅ Transfer rate
- ✅ Loan default rates

**Data completeness:** ~85-90% of fields

**Improvement:** +25-30 percentage points!

---

## 🔐 Security Best Practices

### DO:
- ✅ Store keys in `.env` file (never in code)
- ✅ Add `.env` to `.gitignore` (already done)
- ✅ Use separate keys for dev/production
- ✅ Rotate keys periodically (annually)
- ✅ Monitor usage on api.data.gov dashboard

### DON'T:
- ❌ Commit keys to Git
- ❌ Share keys publicly
- ❌ Hard-code keys in scripts
- ❌ Use same key across multiple projects
- ❌ Email keys in plain text

### Check if key is exposed:

```bash
# Make sure .env is in .gitignore
cat .gitignore | grep .env

# Check if .env is tracked by git (should be empty)
git ls-files | grep .env
```

If `.env` shows up in second command:
```bash
# Remove from Git (keep local file)
git rm --cached .env
git commit -m "Remove .env from version control"
```

---

## 🚨 Troubleshooting

### Problem: "API key invalid"

**Solution:**
1. Check key has no spaces or newlines
2. Verify on https://api.data.gov/signup/ (sign in to see your key)
3. Regenerate if necessary

### Problem: "Rate limit exceeded"

**Solution:**
1. Check daily usage: https://api.data.gov/signup/ (dashboard)
2. Free tier allows 1,000/hour, 30,000/day
3. Add delays: Increase `DELAY_BETWEEN_REQUESTS_MS` in config

### Problem: "API not working, scraper still succeeds"

**Explanation:** This is normal! The scraper has fallbacks:
1. Try API first
2. If fails, try web scraping
3. If fails, try CSV data
4. If fails, use existing data

### Problem: Environment variables not loading

**Solution:**
```bash
# Make sure dotenv is installed
npm install dotenv

# Test loading
node -e "require('dotenv').config(); console.log(process.env.DATA_GOV_API_KEY)"
```

---

## 📈 Monitoring API Usage

### Check remaining quota:

**Data.gov Dashboard:**
1. Go to https://api.data.gov/signup/
2. Sign in with your email
3. View "API Usage" tab
4. Shows requests today/this hour

**In logs:**
```bash
# Check scraper logs
cat backend/data/scrape_log.json | grep "api_request"

# Count API calls
cat backend/data/scrape_log.json | grep -c "college_scorecard_api"
```

---

## 🎯 Summary

### Required vs Optional

| API Key | Required? | Impact | Free? | Setup Time |
|---------|-----------|--------|-------|------------|
| DATA_GOV_API_KEY | ⭐ Recommended | +30% fields | ✅ Yes | 2 minutes |
| IPEDS API | ⚪ Optional | None (using CSV) | ✅ Yes | N/A |
| US News API | ⚪ N/A | None (scraping works) | N/A | N/A |
| QS API | ⚪ Optional | Minor | ❌ Partnership | Varies |

### Recommendation:

**Minimum Setup (5 minutes):**
1. Get DATA_GOV_API_KEY (2 min)
2. Add to `.env` file (1 min)
3. Test connection (2 min)
4. Start scraping!

**Why spend 5 minutes?**
- +30% more data fields
- Better salary data (critical for students!)
- Better debt data (critical for decisions!)
- Still works even if API is down (graceful fallback)

---

## 📞 Support

### Data.gov API Issues:
- Email: api.data.gov@gsa.gov
- Docs: https://api.data.gov/docs/

### IPEDS Issues:
- Email: ipedshelp@rti.org
- Phone: 1-877-225-2568
- Docs: https://nces.ed.gov/ipeds/

### CollegeOS Issues:
- Check logs: `backend/data/scrape_log.json`
- Test script: `node scripts/testScraperDuke.js`
- Reset: `npm run scrape:reset`

---

**Last Updated:** February 10, 2026  
**Version:** 2.0
