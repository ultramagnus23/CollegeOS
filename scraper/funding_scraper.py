"""
scraper/funding_scraper.py
Seed script for government_loans, private_loans, and grants tables.

Requirements:
    pip install asyncpg aiohttp

Usage:
    DATABASE_URL=postgresql://... python scraper/funding_scraper.py
"""

import asyncio
import os
import sys
import json
from datetime import datetime, timezone

import asyncpg
import aiohttp

# ─── Exchange rate validation ─────────────────────────────────────────────────

EXCHANGE_RATE_URL = "https://open.er-api.com/v6/latest/USD"
RATE_MIN = 50
RATE_MAX = 150


async def fetch_usd_to_inr(session: aiohttp.ClientSession) -> float:
    """Fetch live USD→INR rate and validate it is within plausible bounds.
    Never hardcodes a rate — raises if the API is unreachable or returns garbage.
    """
    async with session.get(EXCHANGE_RATE_URL, timeout=aiohttp.ClientTimeout(total=10)) as resp:
        resp.raise_for_status()
        data = await resp.json(content_type=None)

    rate = data.get("rates", {}).get("INR")
    if not isinstance(rate, (int, float)):
        raise ValueError(f"INR rate not found in exchange rate API response: {data}")
    if not (RATE_MIN < rate < RATE_MAX):
        raise ValueError(
            f"Implausible USD→INR rate received: {rate}. "
            f"Expected between {RATE_MIN} and {RATE_MAX}."
        )
    print(f"[exchange] Live USD→INR rate: {rate:.4f}", flush=True)
    return float(rate)


# ─── Upsert helpers ───────────────────────────────────────────────────────────

NOW = datetime.now(timezone.utc)


async def upsert_government_loan(conn: asyncpg.Connection, rec: dict) -> None:
    await conn.execute(
        """
        INSERT INTO government_loans (
            name, provider, provider_type, scheme_name, country_of_study,
            eligible_nationalities, degree_levels, max_loan_amount_inr,
            interest_rate_pct, interest_rate_type, subsidy_available, subsidy_scheme,
            moratorium_months, repayment_years, collateral_required_above_inr,
            processing_fee_pct, requires_co_applicant, eligible_colleges_type,
            portal_url, official_source_url, status, last_verified_at, notes
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
        )
        ON CONFLICT (name, provider) DO UPDATE SET
            provider_type             = EXCLUDED.provider_type,
            scheme_name               = EXCLUDED.scheme_name,
            country_of_study          = EXCLUDED.country_of_study,
            eligible_nationalities    = EXCLUDED.eligible_nationalities,
            degree_levels             = EXCLUDED.degree_levels,
            max_loan_amount_inr       = EXCLUDED.max_loan_amount_inr,
            interest_rate_pct         = EXCLUDED.interest_rate_pct,
            interest_rate_type        = EXCLUDED.interest_rate_type,
            subsidy_available         = EXCLUDED.subsidy_available,
            subsidy_scheme            = EXCLUDED.subsidy_scheme,
            moratorium_months         = EXCLUDED.moratorium_months,
            repayment_years           = EXCLUDED.repayment_years,
            collateral_required_above_inr = EXCLUDED.collateral_required_above_inr,
            processing_fee_pct        = EXCLUDED.processing_fee_pct,
            requires_co_applicant     = EXCLUDED.requires_co_applicant,
            eligible_colleges_type    = EXCLUDED.eligible_colleges_type,
            portal_url                = EXCLUDED.portal_url,
            official_source_url       = EXCLUDED.official_source_url,
            status                    = EXCLUDED.status,
            last_verified_at          = EXCLUDED.last_verified_at,
            notes                     = EXCLUDED.notes,
            updated_at                = NOW()
        """,
        rec["name"], rec["provider"], rec["provider_type"], rec.get("scheme_name"),
        rec["country_of_study"], rec["eligible_nationalities"], rec.get("degree_levels"),
        rec.get("max_loan_amount_inr"), rec["interest_rate_pct"], rec["interest_rate_type"],
        rec["subsidy_available"], rec.get("subsidy_scheme"),
        rec["moratorium_months"], rec["repayment_years"],
        rec.get("collateral_required_above_inr"), rec["processing_fee_pct"],
        rec["requires_co_applicant"], rec.get("eligible_colleges_type"),
        rec.get("portal_url"), rec.get("official_source_url"),
        rec.get("status", "active"), NOW, rec.get("notes"),
    )
    print(f"[gov_loans] upserted: {rec['name']}", flush=True)


async def upsert_private_loan(conn: asyncpg.Connection, rec: dict) -> None:
    await conn.execute(
        """
        INSERT INTO private_loans (
            name, provider, provider_type, country_of_study,
            eligible_nationalities, degree_levels,
            requires_co_signer, requires_collateral, collateral_required_above_inr,
            max_loan_amount_usd, max_loan_amount_inr,
            interest_rate_min_pct, interest_rate_max_pct, rate_type,
            disbursement_currency, repayment_years_min, repayment_years_max,
            moratorium_months, processing_fee_pct, covers_living_costs,
            eligible_colleges_type, portal_url, status, last_verified_at, notes
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
        )
        ON CONFLICT (name, provider) DO UPDATE SET
            provider_type             = EXCLUDED.provider_type,
            country_of_study          = EXCLUDED.country_of_study,
            eligible_nationalities    = EXCLUDED.eligible_nationalities,
            degree_levels             = EXCLUDED.degree_levels,
            requires_co_signer        = EXCLUDED.requires_co_signer,
            requires_collateral       = EXCLUDED.requires_collateral,
            collateral_required_above_inr = EXCLUDED.collateral_required_above_inr,
            max_loan_amount_usd       = EXCLUDED.max_loan_amount_usd,
            max_loan_amount_inr       = EXCLUDED.max_loan_amount_inr,
            interest_rate_min_pct     = EXCLUDED.interest_rate_min_pct,
            interest_rate_max_pct     = EXCLUDED.interest_rate_max_pct,
            rate_type                 = EXCLUDED.rate_type,
            disbursement_currency     = EXCLUDED.disbursement_currency,
            repayment_years_min       = EXCLUDED.repayment_years_min,
            repayment_years_max       = EXCLUDED.repayment_years_max,
            moratorium_months         = EXCLUDED.moratorium_months,
            processing_fee_pct        = EXCLUDED.processing_fee_pct,
            covers_living_costs       = EXCLUDED.covers_living_costs,
            eligible_colleges_type    = EXCLUDED.eligible_colleges_type,
            portal_url                = EXCLUDED.portal_url,
            status                    = EXCLUDED.status,
            last_verified_at          = EXCLUDED.last_verified_at,
            notes                     = EXCLUDED.notes,
            updated_at                = NOW()
        """,
        rec["name"], rec["provider"], rec["provider_type"],
        rec["country_of_study"], rec["eligible_nationalities"], rec.get("degree_levels"),
        rec["requires_co_signer"], rec["requires_collateral"],
        rec.get("collateral_required_above_inr"),
        rec.get("max_loan_amount_usd"), rec.get("max_loan_amount_inr"),
        rec["interest_rate_min_pct"], rec["interest_rate_max_pct"], rec["rate_type"],
        rec.get("disbursement_currency", "USD"),
        rec["repayment_years_min"], rec["repayment_years_max"],
        rec["moratorium_months"], rec["processing_fee_pct"], rec["covers_living_costs"],
        rec.get("eligible_colleges_type"),
        rec.get("portal_url"),
        rec.get("status", "active"), NOW, rec.get("notes"),
    )
    print(f"[private_loans] upserted: {rec['name']}", flush=True)


async def upsert_grant(conn: asyncpg.Connection, rec: dict) -> None:
    await conn.execute(
        """
        INSERT INTO grants (
            name, provider, provider_type, country_of_study, country_of_origin,
            eligible_nationalities, eligible_states, degree_levels,
            eligible_majors, eligible_genders, minority_required,
            first_gen_required, income_based, max_family_income_inr,
            award_inr_per_year, award_usd_per_year, award_covers,
            renewable, renewal_conditions, application_deadline, deadline_is_rolling,
            portal_url, official_source_url, status, last_verified_at, notes
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
        )
        ON CONFLICT (name, provider) DO UPDATE SET
            provider_type             = EXCLUDED.provider_type,
            country_of_study          = EXCLUDED.country_of_study,
            country_of_origin         = EXCLUDED.country_of_origin,
            eligible_nationalities    = EXCLUDED.eligible_nationalities,
            eligible_states           = EXCLUDED.eligible_states,
            degree_levels             = EXCLUDED.degree_levels,
            eligible_majors           = EXCLUDED.eligible_majors,
            eligible_genders          = EXCLUDED.eligible_genders,
            minority_required         = EXCLUDED.minority_required,
            first_gen_required        = EXCLUDED.first_gen_required,
            income_based              = EXCLUDED.income_based,
            max_family_income_inr     = EXCLUDED.max_family_income_inr,
            award_inr_per_year        = EXCLUDED.award_inr_per_year,
            award_usd_per_year        = EXCLUDED.award_usd_per_year,
            award_covers              = EXCLUDED.award_covers,
            renewable                 = EXCLUDED.renewable,
            renewal_conditions        = EXCLUDED.renewal_conditions,
            application_deadline      = EXCLUDED.application_deadline,
            deadline_is_rolling       = EXCLUDED.deadline_is_rolling,
            portal_url                = EXCLUDED.portal_url,
            official_source_url       = EXCLUDED.official_source_url,
            status                    = EXCLUDED.status,
            last_verified_at          = EXCLUDED.last_verified_at,
            notes                     = EXCLUDED.notes,
            updated_at                = NOW()
        """,
        rec["name"], rec["provider"], rec["provider_type"],
        rec.get("country_of_study"), rec.get("country_of_origin"),
        rec.get("eligible_nationalities", ["Indian"]),
        rec.get("eligible_states"),
        rec.get("degree_levels"),
        rec.get("eligible_majors", ["All"]),
        rec.get("eligible_genders", ["All"]),
        rec.get("minority_required"),
        rec.get("first_gen_required", False),
        rec.get("income_based", False),
        rec.get("max_family_income_inr"),
        rec.get("award_inr_per_year"), rec.get("award_usd_per_year"),
        rec.get("award_covers"),
        rec.get("renewable", False),
        rec.get("renewal_conditions"),
        rec.get("application_deadline"),
        rec.get("deadline_is_rolling", False),
        rec.get("portal_url"), rec.get("official_source_url"),
        rec.get("status", "active"), NOW, rec.get("notes"),
    )
    print(f"[grants] upserted: {rec['name']}", flush=True)


# ─── Seed data ────────────────────────────────────────────────────────────────

STUDY_COUNTRIES_MAIN = ["USA", "UK", "Canada", "Germany", "Australia", "Singapore", "Japan", "France"]

GOVERNMENT_LOANS = [
    {
        "name": "SBI Student Loan Scheme",
        "provider": "State Bank of India",
        "provider_type": "public_sector_bank",
        "scheme_name": "Vidya Lakshmi Portal",
        "country_of_study": STUDY_COUNTRIES_MAIN,
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate", "phd"],
        "max_loan_amount_inr": 15_000_000,
        "interest_rate_pct": 10.05,
        "interest_rate_type": "floating",
        "subsidy_available": True,
        "subsidy_scheme": "CSIS — Central Sector Interest Subsidy Scheme",
        "moratorium_months": 12,
        "repayment_years": 15,
        "collateral_required_above_inr": 750_000,
        "processing_fee_pct": 0.0,
        "requires_co_applicant": True,
        "eligible_colleges_type": "any",
        "portal_url": "https://www.vidyalakshmi.co.in",
        "official_source_url": "https://sbi.co.in/web/personal-banking/loans/education-loans",
        "notes": (
            "Covers tuition, hostel, books, travel, laptop. "
            "CSIS subsidy available for family income under ₹4.5L per year."
        ),
    },
    {
        "name": "Baroda Vidya",
        "provider": "Bank of Baroda",
        "provider_type": "public_sector_bank",
        "scheme_name": "Vidya Lakshmi Portal",
        "country_of_study": STUDY_COUNTRIES_MAIN,
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate", "phd"],
        "max_loan_amount_inr": 15_000_000,
        "interest_rate_pct": 9.70,
        "interest_rate_type": "floating",
        "subsidy_available": True,
        "subsidy_scheme": "CSIS",
        "moratorium_months": 12,
        "repayment_years": 15,
        "collateral_required_above_inr": 750_000,
        "processing_fee_pct": 0.0,
        "requires_co_applicant": True,
        "eligible_colleges_type": "any",
        "portal_url": "https://www.vidyalakshmi.co.in",
        "official_source_url": "https://www.bankofbaroda.in/personal-banking/loans/education-loan",
        "notes": "Competitive rate among PSBs. CSIS subsidy for qualifying income brackets.",
    },
    {
        "name": "Axis Bank Education Loan",
        "provider": "Axis Bank",
        "provider_type": "private_bank",
        "scheme_name": None,
        "country_of_study": STUDY_COUNTRIES_MAIN,
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate"],
        "max_loan_amount_inr": 40_000_000,
        "interest_rate_pct": 13.70,
        "interest_rate_type": "floating",
        "subsidy_available": False,
        "subsidy_scheme": None,
        "moratorium_months": 12,
        "repayment_years": 15,
        "collateral_required_above_inr": 750_000,
        "processing_fee_pct": 0.5,
        "requires_co_applicant": True,
        "eligible_colleges_type": "any",
        "portal_url": "https://www.axisbank.com/retail/loans/education-loan",
        "official_source_url": "https://www.axisbank.com/retail/loans/education-loan",
        "notes": "Higher ceiling (₹4Cr) useful for expensive US programs. No subsidy.",
    },
    {
        "name": "HDFC Credila Education Loan",
        "provider": "HDFC Credila",
        "provider_type": "nbfc",
        "scheme_name": None,
        "country_of_study": STUDY_COUNTRIES_MAIN,
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate", "phd"],
        "max_loan_amount_inr": None,
        "interest_rate_pct": 11.50,
        "interest_rate_type": "floating",
        "subsidy_available": False,
        "subsidy_scheme": None,
        "moratorium_months": 18,
        "repayment_years": 12,
        "collateral_required_above_inr": None,  # case by case
        "processing_fee_pct": 1.0,
        "requires_co_applicant": True,
        "eligible_colleges_type": "top_ranked",
        "portal_url": "https://www.hdfccredila.com",
        "official_source_url": "https://www.hdfccredila.com/education-loan.html",
        "notes": (
            "Specialised education NBFC. Faster disbursement than PSBs. "
            "No fixed ceiling for top schools. Collateral assessed case by case."
        ),
    },
]

PRIVATE_LOANS = [
    {
        "name": "Prodigy Finance International Student Loan",
        "provider": "Prodigy Finance",
        "provider_type": "international_lender",
        "country_of_study": ["USA", "UK", "Canada", "Germany", "France", "Singapore", "Australia"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["postgraduate"],
        "requires_co_signer": False,
        "requires_collateral": False,
        "collateral_required_above_inr": None,
        "max_loan_amount_usd": 220_000,
        "max_loan_amount_inr": None,
        "interest_rate_min_pct": 9.0,
        "interest_rate_max_pct": 14.0,
        "rate_type": "variable",
        "disbursement_currency": "USD",
        "repayment_years_min": 7,
        "repayment_years_max": 20,
        "moratorium_months": 6,
        "processing_fee_pct": 5.0,
        "covers_living_costs": True,
        "eligible_colleges_type": "approved_list",
        "portal_url": "https://prodigyfinance.com",
        "notes": (
            "No co-signer, no collateral. Only approved universities — check portal. "
            "Rate is SOFR plus margin. Postgraduate only."
        ),
    },
    {
        "name": "MPower Financing",
        "provider": "MPower",
        "provider_type": "international_lender",
        "country_of_study": ["USA", "Canada"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate"],
        "requires_co_signer": False,
        "requires_collateral": False,
        "collateral_required_above_inr": None,
        "max_loan_amount_usd": 100_000,
        "max_loan_amount_inr": None,
        "interest_rate_min_pct": 13.98,
        "interest_rate_max_pct": 13.98,
        "rate_type": "fixed",
        "disbursement_currency": "USD",
        "repayment_years_min": 10,
        "repayment_years_max": 10,
        "moratorium_months": 6,
        "processing_fee_pct": 5.0,
        "covers_living_costs": True,
        "eligible_colleges_type": "approved_list",
        "portal_url": "https://www.mpowerfinancing.com",
        "notes": (
            "Good for undergrad since Prodigy Finance is postgrad-only. "
            "No co-signer, no collateral. USA and Canada only."
        ),
    },
    {
        "name": "Leap Finance Education Loan",
        "provider": "Leap Finance",
        "provider_type": "edtech_lender",
        "country_of_study": ["USA", "Canada", "UK", "Australia", "Germany"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate"],
        "requires_co_signer": False,
        "requires_collateral": False,
        "collateral_required_above_inr": None,
        "max_loan_amount_usd": 80_000,
        "max_loan_amount_inr": None,
        "interest_rate_min_pct": 10.0,
        "interest_rate_max_pct": 14.5,
        "rate_type": "variable",
        "disbursement_currency": "USD",
        "repayment_years_min": 5,
        "repayment_years_max": 12,
        "moratorium_months": 6,
        "processing_fee_pct": 2.0,
        "covers_living_costs": False,
        "eligible_colleges_type": "any",
        "portal_url": "https://www.leapfinance.com",
        "notes": (
            "India-based lender. Lower processing fee (2%). "
            "Tuition only — does not cover living costs."
        ),
    },
    {
        "name": "Avanse International Education Loan",
        "provider": "Avanse Financial Services",
        "provider_type": "indian_nbfc",
        "country_of_study": STUDY_COUNTRIES_MAIN,
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate", "phd"],
        "requires_co_signer": True,
        "requires_collateral": False,
        "collateral_required_above_inr": 7_500_000,
        "max_loan_amount_usd": None,
        "max_loan_amount_inr": 100_000_000,
        "interest_rate_min_pct": 11.0,
        "interest_rate_max_pct": 14.5,
        "rate_type": "variable",
        "disbursement_currency": "INR",
        "repayment_years_min": 10,
        "repayment_years_max": 15,
        "moratorium_months": 12,
        "processing_fee_pct": 1.0,
        "covers_living_costs": True,
        "eligible_colleges_type": "any",
        "portal_url": "https://www.avanse.com",
        "notes": (
            "Disburses in INR. Good for non-US programs where USD disbursement is not needed. "
            "Co-signer required. Collateral required above ₹75L."
        ),
    },
    {
        "name": "InCred Education Loan",
        "provider": "InCred Finance",
        "provider_type": "indian_nbfc",
        "country_of_study": ["USA", "UK", "Canada", "Germany", "Australia"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["undergraduate", "postgraduate"],
        "requires_co_signer": True,
        "requires_collateral": False,
        "collateral_required_above_inr": None,
        "max_loan_amount_usd": None,
        "max_loan_amount_inr": 80_000_000,
        "interest_rate_min_pct": 11.5,
        "interest_rate_max_pct": 13.5,
        "rate_type": "variable",
        "disbursement_currency": "INR",
        "repayment_years_min": 7,
        "repayment_years_max": 12,
        "moratorium_months": 12,
        "processing_fee_pct": 0.75,
        "covers_living_costs": True,
        "eligible_colleges_type": "any",
        "portal_url": "https://www.incred.com",
        "notes": (
            "Lower processing fee (0.75%). "
            "Accepts admit from any accredited institution. Co-signer required."
        ),
    },
]

GRANTS = [
    {
        "name": "National Overseas Scholarship",
        "provider": "Ministry of Social Justice and Empowerment, Government of India",
        "provider_type": "central_government",
        "country_of_study": None,  # any country
        "country_of_origin": ["India"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["postgraduate", "phd"],
        "income_based": True,
        "max_family_income_inr": 600_000,
        "minority_required": ["SC", "ST", "OBC", "denotified tribes"],
        "award_covers": ["tuition", "living", "visa", "travel", "books"],
        "renewable": True,
        "portal_url": "https://www.nosmsje.gov.in",
        "official_source_url": "https://www.nosmsje.gov.in",
        "notes": (
            "Full cost coverage. Approximately 100 slots per year. "
            "One of the best-funded Indian government scholarships for studying abroad."
        ),
    },
    {
        "name": "Chevening Scholarship",
        "provider": "UK FCDO",
        "provider_type": "foreign_government",
        "country_of_study": "UK",
        "country_of_origin": ["India"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["postgraduate"],
        "income_based": False,
        "award_covers": ["tuition", "living", "travel", "visa"],
        "renewable": False,
        "portal_url": "https://www.chevening.org/apply",
        "official_source_url": "https://www.chevening.org",
        "notes": (
            "Fully funded 1-year UK masters. "
            "Requires 2+ years of work experience. Opens August, closes November typically."
        ),
    },
    {
        "name": "DAAD Scholarship India",
        "provider": "Deutscher Akademischer Austauschdienst",
        "provider_type": "foreign_government",
        "country_of_study": "Germany",
        "country_of_origin": ["India"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["postgraduate", "phd", "research"],
        "income_based": False,
        "award_covers": ["living", "travel", "health_insurance"],
        "renewable": True,
        "portal_url": "https://www.daad.in",
        "official_source_url": "https://www.daad.de/en/study-and-research-in-germany/scholarships/",
        "notes": (
            "Monthly stipend (around €934/month) not tuition, since most German universities charge no fees. "
            "Strong for STEM programs. Health insurance and travel grant included."
        ),
    },
    {
        "name": "Australia Awards South and West Asia",
        "provider": "Australian Government DFAT",
        "provider_type": "foreign_government",
        "country_of_study": "Australia",
        "country_of_origin": ["India"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["postgraduate"],
        "income_based": False,
        "award_covers": ["tuition", "living", "travel", "health_insurance", "visa"],
        "renewable": True,
        "portal_url": "https://www.australiaawards.gov.au",
        "official_source_url": "https://www.dfat.gov.au/people-to-people/australia-awards",
        "notes": (
            "Full Australian government scholarship for 2-year masters. "
            "Must return to India for 2 years after completion."
        ),
    },
    {
        "name": "Fulbright-Nehru Masters Fellowship",
        "provider": "United States-India Educational Foundation",
        "provider_type": "foreign_government",
        "country_of_study": "USA",
        "country_of_origin": ["India"],
        "eligible_nationalities": ["Indian"],
        "degree_levels": ["postgraduate"],
        "income_based": False,
        "award_covers": ["tuition", "living", "travel", "health_insurance", "visa"],
        "renewable": False,
        "portal_url": "https://www.usief.org.in",
        "official_source_url": "https://www.usief.org.in/Fellowships/Fulbright-Nehru-Fellowships.aspx",
        "notes": (
            "1-2 year US masters. Requires 3 years of work experience post-bachelor for most tracks. "
            "Opens February."
        ),
    },
]

# ─── College funding ──────────────────────────────────────────────────────────

COLLEGE_FUNDING_SEEDS = [
    {
        "college_name_match": "Massachusetts Institute of Technology",
        "funding_name": "MIT Need-Based Aid",
        "funding_type": "need_based_grant",
        "eligible_nationalities": ["All"],
        "degree_levels": ["undergraduate"],
        "meets_full_demonstrated_need": True,
        "percentage_students_receiving": 55.0,
        "average_award_usd": 55000,
        "international_students_eligible": True,
        "application_required": True,
        "application_form": "CSS Profile",
        "deadline_type": "with_admission",
        "notes": "MIT meets 100% of demonstrated need for ALL students including international. No loans in aid package.",
    },
    {
        "college_name_match": "Harvard University",
        "funding_name": "Harvard Financial Aid",
        "funding_type": "need_based_grant",
        "eligible_nationalities": ["All"],
        "degree_levels": ["undergraduate"],
        "meets_full_demonstrated_need": True,
        "percentage_students_receiving": 55.0,
        "average_award_usd": 55000,
        "international_students_eligible": True,
        "application_required": True,
        "application_form": "CSS Profile",
        "deadline_type": "with_admission",
        "notes": "Families earning under $85k USD pay nothing. No loans in package.",
    },
    {
        "college_name_match": "Stanford University",
        "funding_name": "Stanford Financial Aid",
        "funding_type": "need_based_grant",
        "eligible_nationalities": ["All"],
        "degree_levels": ["undergraduate"],
        "meets_full_demonstrated_need": True,
        "percentage_students_receiving": 55.0,
        "average_award_usd": 58000,
        "international_students_eligible": True,
        "application_required": True,
        "application_form": "CSS Profile",
        "deadline_type": "with_admission",
        "notes": "Families under $75k USD pay nothing.",
    },
    {
        "college_name_match": "University of Toronto",
        "funding_name": "Lester B. Pearson International Scholarship",
        "funding_type": "merit_grant",
        "eligible_nationalities": ["All"],
        "degree_levels": ["undergraduate"],
        "award_usd_per_year": 30000,
        "meets_full_demonstrated_need": False,
        "percentage_students_receiving": 0.2,
        "international_students_eligible": True,
        "application_required": True,
        "application_form": "nominated by school",
        "deadline_type": "separate",
        "notes": "Full cost scholarship. Very competitive — covers tuition, books, incidentals, residence.",
    },
]

TU_MUNICH_FUNDING = {
    "funding_name": "TU Munich No Tuition Fee",
    "funding_type": "tuition_waiver",
    "eligible_nationalities": ["All"],
    "degree_levels": ["undergraduate", "postgraduate", "phd"],
    "award_usd_per_year": 0,
    "meets_full_demonstrated_need": False,
    "international_students_eligible": True,
    "application_required": False,
    "deadline_type": "with_admission",
    "notes": "No tuition fees at TU Munich. Student pays ~€150 semester contribution. Living costs ~€900/month in Munich.",
}


async def upsert_college_funding(conn: asyncpg.Connection, rec: dict, college_id: str, college_name: str) -> None:
    await conn.execute(
        """
        INSERT INTO college_funding (
            college_id, college_name, funding_name, funding_type,
            eligible_nationalities, degree_levels, eligible_majors,
            award_usd_per_year, meets_full_demonstrated_need,
            percentage_students_receiving, average_award_usd,
            renewable, application_required, application_form,
            deadline_type, application_deadline,
            international_students_eligible, notes,
            last_verified_at
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
        )
        ON CONFLICT (college_id, funding_name) DO UPDATE SET
            funding_type                    = EXCLUDED.funding_type,
            eligible_nationalities          = EXCLUDED.eligible_nationalities,
            degree_levels                   = EXCLUDED.degree_levels,
            award_usd_per_year              = EXCLUDED.award_usd_per_year,
            meets_full_demonstrated_need    = EXCLUDED.meets_full_demonstrated_need,
            percentage_students_receiving   = EXCLUDED.percentage_students_receiving,
            average_award_usd               = EXCLUDED.average_award_usd,
            renewable                       = EXCLUDED.renewable,
            application_required            = EXCLUDED.application_required,
            application_form                = EXCLUDED.application_form,
            deadline_type                   = EXCLUDED.deadline_type,
            international_students_eligible = EXCLUDED.international_students_eligible,
            notes                           = EXCLUDED.notes,
            last_verified_at                = EXCLUDED.last_verified_at,
            updated_at                      = NOW()
        """,
        college_id, college_name, rec["funding_name"], rec["funding_type"],
        rec.get("eligible_nationalities", ["All"]),
        rec.get("degree_levels"),
        rec.get("eligible_majors", ["All"]),
        rec.get("award_usd_per_year"),
        rec.get("meets_full_demonstrated_need", False),
        rec.get("percentage_students_receiving"),
        rec.get("average_award_usd"),
        rec.get("renewable", False),
        rec.get("application_required", True),
        rec.get("application_form"),
        rec.get("deadline_type"),
        rec.get("application_deadline"),
        rec.get("international_students_eligible", False),
        rec.get("notes"),
        NOW,
    )
    print(f"[college_funding] upserted: {rec['funding_name']} → {college_name}", flush=True)


# ─── Main ──────────────────────────────────────────────────────────────────────

async def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set.", file=sys.stderr)
        sys.exit(1)

    async with aiohttp.ClientSession() as session:
        usd_to_inr = await fetch_usd_to_inr(session)
        print(f"[main] Exchange rate validated: 1 USD = {usd_to_inr:.4f} INR", flush=True)

    conn = await asyncpg.connect(database_url)
    try:
        # Government loans
        print("\n--- Seeding government_loans ---", flush=True)
        for rec in GOVERNMENT_LOANS:
            await upsert_government_loan(conn, rec)

        # Private loans
        print("\n--- Seeding private_loans ---", flush=True)
        for rec in PRIVATE_LOANS:
            await upsert_private_loan(conn, rec)

        # Grants
        print("\n--- Seeding grants ---", flush=True)
        for rec in GRANTS:
            await upsert_grant(conn, rec)

        # College funding — look up college_id by name
        print("\n--- Seeding college_funding ---", flush=True)
        for seed in COLLEGE_FUNDING_SEEDS:
            match = seed["college_name_match"]
            row = await conn.fetchrow(
                "SELECT id, name FROM colleges WHERE name ILIKE $1 LIMIT 1",
                f"%{match}%"
            )
            if row:
                rec = {k: v for k, v in seed.items() if k != "college_name_match"}
                await upsert_college_funding(conn, rec, str(row["id"]), row["name"])
            else:
                print(f"[college_funding] college not found, skipping: {match}", flush=True)

        # TU Munich (name match with ILIKE)
        tum_row = await conn.fetchrow(
            "SELECT id, name FROM colleges WHERE name ILIKE '%Technical University of Munich%' OR name ILIKE '%TU Munich%' LIMIT 1"
        )
        if tum_row:
            await upsert_college_funding(conn, TU_MUNICH_FUNDING, str(tum_row["id"]), tum_row["name"])
        else:
            print("[college_funding] TU Munich not found, skipping", flush=True)

        print("\n[main] Funding seed complete.", flush=True)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
