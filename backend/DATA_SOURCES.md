# 📊 College Data Sources - Complete Transparency Document

This document provides complete transparency about where every piece of college data comes from, including exact URLs, extraction methods, and confidence scores.

---

## 🎯 Data Source Hierarchy

### Tier 1: Official Federal Databases (Confidence: 0.95-1.0)

#### 1. IPEDS (Integrated Postsecondary Education Data System)
- **Authority:** U.S. Department of Education, National Center for Education Statistics
- **Website:** https://nces.ed.gov/ipeds/
- **API:** No official API - uses bulk CSV downloads
- **Update Frequency:** Annually (October release)
- **Coverage:** All US institutions
- **Cost:** FREE

**Data Fields Provided:**
- Institution name, address, control (public/private)
- Total enrollment, undergraduate/graduate breakdown
- Tuition and fees (in-state, out-of-state)
- Financial aid statistics
- Graduation rates (4-year, 6-year, 8-year)
- Student demographics (race, gender, age)
- Faculty counts and salaries
- Revenue and expenditures

**How We Access:**
```
Source: CSV bulk download
URL: https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx
File: IPEDS{YEAR}_Data_Preliminary.csv
Method: Annual import via script
```

**Example Fields:**
| Field | IPEDS Variable | Source File |
|-------|----------------|-------------|
| `total_enrollment` | EFYTOTLT | Fall Enrollment |
| `acceptance_rate` | ADMSSN / APPLCN | Admissions |
| `tuition_in_state` | TUITION2 | Institutional Characteristics |
| `graduation_rate_4yr` | GRTYPE31 | Graduation Rates |

---

#### 2. College Scorecard API
- **Authority:** U.S. Department of Education
- **Website:** https://collegescorecard.ed.gov/
- **API:** https://api.data.gov/ed/collegescorecard/v1/schools
- **Update Frequency:** Annually (September)
- **API Key Required:** YES (free)
- **Cost:** FREE

**Get API Key:** https://api.data.gov/signup/

**Data Fields Provided:**
- Completion rates by demographics
- Median earnings 6 years after entry
- Median earnings 10 years after entry
- Median debt at graduation
- Loan repayment rates
- Program-level debt and earnings
- Cost of attendance (net price)

**How We Access:**
```
Source: REST API
URL: https://api.data.gov/ed/collegescorecard/v1/schools
Method: GET request with filters
Headers: { "X-Api-Key": "YOUR_KEY" }
```

**Example API Call:**
```bash
curl "https://api.data.gov/ed/collegescorecard/v1/schools?\
school.name=Duke%20University&\
fields=school.name,latest.admissions.admission_rate.overall,\
latest.cost.tuition.in_state,latest.earnings.10_yrs_after_entry.median&\
api_key=YOUR_KEY"
```

**Response Fields Mapping:**
| Our Field | API Field | URL |
|-----------|-----------|-----|
| `acceptance_rate` | `latest.admissions.admission_rate.overall` | See API call |
| `median_salary_6yr` | `latest.earnings.6_yrs_after_entry.median` | See API call |
| `median_salary_10yr` | `latest.earnings.10_yrs_after_entry.median` | See API call |
| `median_debt` | `latest.aid.median_debt.completers.overall` | See API call |

---

### Tier 2: Official Institutional Sources (Confidence: 0.90-0.95)

#### 3. Common Data Set (CDS)
- **Authority:** Individual colleges (self-reported)
- **Standard:** Developed by College Board, Peterson's, US News
- **Update Frequency:** Annually (October/November)
- **Coverage:** ~1000 US colleges voluntarily publish
- **Cost:** FREE

**What is CDS?**
A standardized format for reporting institutional data. Colleges publish PDFs on their websites, typically under:
- `/institutional-research/common-data-set`
- `/about/facts/common-data-set`
- `/oir/common-data-set`

**Data Fields Provided:** (47 page PDF with sections A-J)
- **Section B:** Enrollment by level, gender, ethnicity
- **Section C:** Admissions (acceptance rate, test scores, GPA)
- **Section D:** Transfer admissions
- **Section E:** Academic offerings (majors, degrees)
- **Section F:** Student life (housing, organizations)
- **Section G:** Annual expenses
- **Section H:** Financial aid
- **Section J:** Graduation rates

**How We Access:**
```
Source: PDF download from college website
URL Pattern: {college_domain}/institutional-research/common-data-set-{year}.pdf
Method: 
  1. Search college website for "common data set"
  2. Download most recent year's PDF
  3. Parse PDF to extract tables
  4. Validate against IPEDS for consistency
```

**Example URLs:**
- Duke: `https://oir.duke.edu/institutional-research/common-data-set/`
- Stanford: `https://ucomm.stanford.edu/cds/`
- Harvard: `https://oir.harvard.edu/common-data-set`

**CDS Sections Used:**
| Field | CDS Section | Page | Table |
|-------|-------------|------|-------|
| `acceptance_rate` | C1 | 8 | First-time freshmen |
| `sat_25th` | C9 | 12 | SAT scores |
| `gpa_avg` | C11 | 14 | GPA distribution |
| `student_faculty_ratio` | I2 | 25 | Faculty |
| `retention_rate` | B22 | 6 | Retention |

---

#### 4. Official College Websites (.edu domains)
- **Authority:** Individual institutions
- **Update Frequency:** Varies (daily to annually)
- **Coverage:** All colleges with websites
- **Cost:** FREE

**Pages We Scrape:**

##### A. Admissions Pages
**Common URLs:**
- `{domain}/admissions`
- `{domain}/admissions/class-profile`
- `{domain}/apply/requirements`

**Data Extracted:**
| Field | CSS Selector | Regex Fallback |
|-------|--------------|----------------|
| `acceptance_rate` | `.admissions-rate`, `[data-stat="acceptance"]` | `/acceptance\s+rate:?\s*(\d+\.?\d*)%/i` |
| `test_optional_flag` | `.test-optional`, `.standardized-tests` | `/test.{0,20}optional/i` |
| `application_deadlines` | `.deadline`, `[data-deadline]` | `/deadline:?\s*(\w+\s+\d+)/i` |

**Example:** Duke Admissions
- URL: `https://admissions.duke.edu/apply/first-year-applicants/`
- Selector: `.stats-grid .stat-value` for acceptance rate
- Extracted: "5.4%" → Stored as 0.054
- Confidence: 0.90 (official .edu, structured data)

##### B. Financial Aid Pages
**Common URLs:**
- `{domain}/financial-aid`
- `{domain}/tuition-costs`
- `{domain}/cost-of-attendance`

**Data Extracted:**
| Field | CSS Selector | Regex Fallback |
|-------|--------------|----------------|
| `tuition_in_state` | `.tuition`, `[data-tuition]` | `/in-state.*\$?([\d,]+)/i` |
| `median_debt` | `.median-debt`, `.student-debt` | `/median\s+debt:?\s*\$?([\d,]+)/i` |
| `percent_receiving_aid` | `.financial-aid-percent` | `/(\d+)%.*receive.*aid/i` |

**Example:** Duke Financial Aid
- URL: `https://financialaid.duke.edu/undergraduate-applicants/cost-attendance`
- Selector: `.cost-table td` for tuition
- Extracted: "$65,805" → Stored as 65805
- Confidence: 0.90 (official .edu, current year)

##### C. About/Facts Pages
**Common URLs:**
- `{domain}/about/facts`
- `{domain}/facts`
- `{domain}/about/glance`

**Data Extracted:**
| Field | CSS Selector | Regex Fallback |
|-------|--------------|----------------|
| `founding_year` | `.founded`, `[data-founded]` | `/founded:?\s*(\d{4})/i` |
| `campus_size_acres` | `.campus-size`, `.acres` | `/(\d+)\s*acres/i` |
| `total_enrollment` | `.enrollment`, `[data-enrollment]` | `/enrollment:?\s*([\d,]+)/i` |

**Example:** Duke Facts
- URL: `https://today.duke.edu/about-duke/facts`
- Selector: `.fact-grid .fact-value`
- Extracted: Multiple data points
- Confidence: 0.85 (official but less structured)

##### D. Diversity/Demographics Pages
**Common URLs:**
- `{domain}/diversity`
- `{domain}/about/diversity`
- `{domain}/admissions/diversity`

**Data Extracted:**
| Field | CSS Selector | Regex Fallback |
|-------|--------------|----------------|
| `percent_international` | `.international`, `[data-international]` | `/international.*(\d+\.?\d*)%/i` |
| `percent_female` | `.gender-ratio`, `.female` | `/female.*(\d+\.?\d*)%/i` |

---

### Tier 3: Verified Third-Party Sources (Confidence: 0.75-0.85)

#### 5. US News & World Report
- **Website:** https://www.usnews.com/best-colleges
- **Update Frequency:** Annually (September)
- **Data Type:** Rankings and selected metrics
- **Access:** Web scraping (respectful, rate-limited)

**What We Extract:**
- National/regional rankings
- Acceptance rates (if displayed)
- Test score ranges
- Peer assessment scores

**How We Access:**
```
Source: Web scraping
URL: https://www.usnews.com/best-colleges/{college-name}
Method: Cheerio HTML parsing
Rate Limit: 1 request per 3 seconds
Robots.txt: Compliant
```

**Example:** Duke on US News
- URL: `https://www.usnews.com/best-colleges/duke-university-2920`
- Selector: `.ranking-value` for ranking
- Extracted: "#7 National Universities"
- Confidence: 0.80 (verified source, but secondary)

---

#### 6. QS World Rankings (International)
- **Website:** https://www.topuniversities.com/
- **API:** https://www.topuniversities.com/rankings-api
- **Update Frequency:** Annually (June)
- **Coverage:** Global universities

**What We Extract:**
- QS World Ranking position
- Academic reputation score
- Employer reputation score
- Faculty/student ratio
- International student percentage

**How We Access:**
```
Source: API (if available) or web scraping
URL: https://www.topuniversities.com/universities/{college-name}
Method: JSON API or Cheerio parsing
```

---

#### 7. Niche.com
- **Website:** https://www.niche.com/colleges/
- **Data Type:** User reviews + aggregated data
- **Confidence:** 0.70 (crowd-sourced + verified data mix)

**What We Use:**
- Student reviews (qualitative)
- Campus life ratings
- Academic quality ratings
- Safety grades

**Note:** Used only as supplementary data, not primary source.

---

## 🔍 Extraction Methods & Confidence Scores

### Method 1: JSON-LD Structured Data (Confidence: 1.0)
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollegeOrUniversity",
  "name": "Duke University",
  "acceptanceRate": 0.054
}
</script>
```

**Why 1.0 confidence?**
- Structured format
- Machine-readable
- Less likely to have parsing errors

---

### Method 2: Meta Tags (Confidence: 0.95)
```html
<meta property="og:title" content="Duke University" />
<meta name="admissions:acceptance_rate" content="5.4%" />
```

**Why 0.95 confidence?**
- Structured
- Intended for machines
- May not be updated as frequently as visible content

---

### Method 3: CSS Selectors (Confidence: 0.85)
```javascript
const acceptanceRate = $('.admissions-rate').text();
// "5.4%" → 0.054
```

**Why 0.85 confidence?**
- Reliable if selector is specific
- Site redesigns can break selectors
- Requires maintenance

---

### Method 4: Regex Text Matching (Confidence: 0.75)
```javascript
const match = text.match(/acceptance\s+rate:?\s*(\d+\.?\d*)%/i);
// "Acceptance Rate: 5.4%" → 0.054
```

**Why 0.75 confidence?**
- Flexible, works across sites
- Prone to false positives
- Context-dependent

---

### Method 5: API Endpoints (Confidence: 0.90)
```javascript
const response = await axios.get(
  'https://api.data.gov/ed/collegescorecard/v1/schools',
  { params: { 'school.name': 'Duke University' } }
);
```

**Why 0.90 confidence?**
- Structured, authoritative
- May have lag (annual updates)
- Dependency on API availability

---

## 📋 Field-by-Field Source Documentation

### Admissions Fields

| Field | Primary Source | Secondary Source | Fallback | Page URL Example |
|-------|----------------|------------------|----------|------------------|
| `acceptance_rate` | CDS (C1) | College Scorecard API | College website `/admissions` | `duke.edu/admissions/class-profile` |
| `test_optional_flag` | College website | CDS (C8) | Manual research | `duke.edu/admissions/requirements` |
| `application_deadlines` | College website | CDS (C21) | - | `duke.edu/apply/deadlines` |
| `sat_25th` | CDS (C9) | College Scorecard | College website | `duke.edu/admissions/statistics` |
| `sat_75th` | CDS (C9) | College Scorecard | College website | `duke.edu/admissions/statistics` |
| `act_25th` | CDS (C9) | College Scorecard | College website | `duke.edu/admissions/statistics` |
| `act_75th` | CDS (C9) | College Scorecard | College website | `duke.edu/admissions/statistics` |
| `gpa_avg` | CDS (C11) | College website | IPEDS | `duke.edu/admissions/profile` |

---

### Financial Fields

| Field | Primary Source | Secondary Source | Fallback | Page URL Example |
|-------|----------------|------------------|----------|------------------|
| `tuition_in_state` | IPEDS | CDS (G1) | College website | `duke.edu/financial-aid/cost` |
| `tuition_out_state` | IPEDS | CDS (G1) | College website | `duke.edu/financial-aid/cost` |
| `tuition_international` | College website | CDS (G5) | IPEDS | `duke.edu/international/costs` |
| `room_and_board` | IPEDS | CDS (G3) | College website | `duke.edu/housing/costs` |
| `median_debt` | College Scorecard | CDS (H2) | College website | `duke.edu/financial-aid/outcomes` |
| `percent_receiving_aid` | IPEDS | CDS (H2) | College website | `duke.edu/financial-aid/statistics` |
| `avg_net_price` | College Scorecard | IPEDS | College website | `duke.edu/financial-aid/net-price` |

---

### Enrollment & Demographics

| Field | Primary Source | Secondary Source | Fallback | Page URL Example |
|-------|----------------|------------------|----------|------------------|
| `total_enrollment` | IPEDS | CDS (B1) | College website | `duke.edu/about/facts` |
| `undergraduate_enrollment` | IPEDS | CDS (B1) | College website | `duke.edu/about/enrollment` |
| `graduate_enrollment` | IPEDS | CDS (B1) | College website | `duke.edu/about/enrollment` |
| `percent_female` | IPEDS | CDS (B1) | College website | `duke.edu/diversity/statistics` |
| `percent_international` | College website | IPEDS | CDS (B2) | `duke.edu/global/statistics` |
| `percent_white` | IPEDS | CDS (B2) | College website | `duke.edu/diversity/data` |
| `percent_asian` | IPEDS | CDS (B2) | College website | `duke.edu/diversity/data` |
| `percent_hispanic` | IPEDS | CDS (B2) | College website | `duke.edu/diversity/data` |
| `percent_black` | IPEDS | CDS (B2) | College website | `duke.edu/diversity/data` |

---

### Outcomes Fields

| Field | Primary Source | Secondary Source | Fallback | Page URL Example |
|-------|----------------|------------------|----------|------------------|
| `graduation_rate_4yr` | IPEDS | CDS (B22) | College website | `duke.edu/outcomes/graduation` |
| `graduation_rate_6yr` | IPEDS | CDS (B22) | College Scorecard | `duke.edu/outcomes/graduation` |
| `retention_rate` | IPEDS | CDS (B22) | College website | `duke.edu/admissions/success` |
| `median_salary_6yr` | College Scorecard | - | College website | API only |
| `median_salary_10yr` | College Scorecard | - | College website | API only |
| `employment_rate` | College website | CDS | - | `duke.edu/career-services/outcomes` |

---

### Campus Life Fields

| Field | Primary Source | Secondary Source | Fallback | Page URL Example |
|-------|----------------|------------------|----------|------------------|
| `housing_guarantee` | College website | CDS (F1) | - | `duke.edu/housing/guarantee` |
| `greek_life_percent` | College website | Niche | - | `duke.edu/student-life/greek` |
| `student_organizations_count` | College website | - | - | `duke.edu/student-life/clubs` |
| `athletics_division` | College website | NCAA.org | - | `duke.edu/athletics` |
| `religious_affiliation` | IPEDS | College website | - | `duke.edu/about/history` |

---

## 🔐 API Keys Required

### Free API Keys (Recommended)

1. **Data.gov API Key** (for College Scorecard)
   - Sign up: https://api.data.gov/signup/
   - Free tier: 1,000 requests/hour
   - Use in: `.env` as `DATA_GOV_API_KEY=your_key_here`

### No API Key Needed

1. **IPEDS** - Public CSV downloads (free)
2. **College websites** - Public web scraping
3. **CDS PDFs** - Public downloads

---

## 🎯 Data Quality Assurance

### Cross-Validation

For each field, we:
1. ✅ **Compare sources** - IPEDS vs CDS vs website
2. ✅ **Flag discrepancies** - >10% difference triggers review
3. ✅ **Track confidence** - Lower confidence if sources disagree
4. ✅ **Update frequency** - Prefer newer data

### Example Cross-Validation:
```
Duke University - acceptance_rate
- IPEDS 2023: 5.9%
- CDS 2024: 5.4%
- Website: 5.4%

Decision: Use 5.4% (confidence: 0.95)
Reason: CDS and website agree, more recent than IPEDS
```

---

## 📅 Update Schedule

| Source | Frequency | Release Month | Our Update |
|--------|-----------|---------------|------------|
| IPEDS | Annual | October | November |
| College Scorecard | Annual | September | October |
| CDS | Annual | October-December | As published |
| College Websites | Varies | Year-round | Daily scraping |
| US News Rankings | Annual | September | September |
| QS Rankings | Annual | June | July |

---

## 📞 Contact & Corrections

If you find incorrect data:
1. Check `scrape_audit_log` table for source
2. Verify at original source URL
3. Submit correction with source documentation
4. We'll update and note the correction

**Data Transparency Commitment:**
Every field update is logged with:
- Source URL
- Extraction method
- Timestamp
- Old vs new value
- Confidence score

---

**Last Updated:** February 10, 2026  
**Document Version:** 2.0  
**Total Sources Documented:** 7 primary + 3 secondary
