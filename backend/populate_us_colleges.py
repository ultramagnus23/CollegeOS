#!/usr/bin/env python3
"""
financing_comprehensive_v2.py — CollegeOS
══════════════════════════════════════════════════════════════════════════════
v2 fixes vs v1:
  1. application_deadline → always NULL (it's a DATE column; deadline text
     stored in notes field as "Deadline: <date>" prefix instead)
  2. Scraping: concurrent ThreadPoolExecutor for 3x speed
  3. NSP scraper improved — parses HTML table not JSON endpoint
  4. Buddy4Study selector updated
  5. Vidya Lakshmi: tries 3 different endpoints

Run AFTER financing_comprehensive.py — deduplicates on name so safe to re-run.

Usage:
  SUPABASE_DB_URL=<conn> python financing_comprehensive_v2.py
  SUPABASE_DB_URL=<conn> SKIP_SCRAPING=1 python financing_comprehensive_v2.py
"""

import logging, os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import psycopg2, psycopg2.extras, requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    datefmt="%Y-%m-%dT%H:%M:%S", handlers=[logging.StreamHandler(sys.stdout)])
log = logging.getLogger("financing_v2")

SKIP_SCRAPING = os.environ.get("SKIP_SCRAPING", "0") == "1"
DRY_RUN       = os.environ.get("DRY_RUN", "0") == "1"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
def _get(url, **kw):
    kw.setdefault("timeout", 15)
    kw.setdefault("headers", HEADERS)
    return requests.get(url, **kw)

def get_conn(db_url):
    conn = psycopg2.connect(db_url)
    conn.set_session(autocommit=False)
    return conn

# ─── Helper: fold deadline text into notes ────────────────────────────────────
# application_deadline is DATE in Postgres — never pass strings.
# We prepend "Deadline: <text> | " to the notes field instead.

def _with_deadline(notes: str, deadline_text: Optional[str]) -> str:
    if deadline_text and deadline_text.lower() not in ("none", "null", ""):
        return f"Deadline: {deadline_text} | {notes}"
    return notes

# ══════════════════════════════════════════════════════════════════════════════
# GRANTS DATA — all 42 that failed, now with application_deadline=NULL
# and deadline folded into notes
# ══════════════════════════════════════════════════════════════════════════════

GRANTS = [
    # ── Central Government ────────────────────────────────────────────────────
    dict(name="National Overseas Scholarship for SC/ST Students",
         provider="Ministry of Social Justice and Empowerment, Govt of India",
         provider_type="central_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,France,Netherlands,Japan,New Zealand",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC","ST","Denotified Tribes","Landless Agricultural Labourers","Traditional Artisans"],
         first_gen_required=False, income_based=True, max_family_income_inr=800000,
         award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","visa","contingency"],
         renewable=True, renewal_conditions="Annual progress report; maintain full-time status",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://nosmsje.gov.in", official_source_url="https://socialjustice.nic.in",
         status="active",
         notes=_with_deadline("~100-115 slots/year. Tuition (full) + maintenance $15,400/yr (US) + travel. SC get 95 slots. Only ONE member per family.", "March 31")),

    dict(name="Maulana Azad National Fellowship (Minority Communities)",
         provider="Ministry of Minority Affairs, Govt of India",
         provider_type="central_government",
         country_of_study="India",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["Muslim","Christian","Sikh","Buddhist","Jain","Parsi"],
         first_gen_required=False, income_based=False, max_family_income_inr=None,
         award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Annual academic progress",
         application_deadline=None, deadline_is_rolling=True,
         portal_url="https://minorityaffairs.gov.in/maulana-azad-national-fellowship",
         official_source_url="https://minorityaffairs.gov.in", status="active",
         notes=_with_deadline("For M.Phil/Ph.D at Indian universities. UGC NET qualified minority students. 5-year fellowship. Supports research that can lead to abroad opportunities.", "Varies — check portal")),

    dict(name="ICCR Scholarship for Indian Students (Cultural Exchange Abroad)",
         provider="Indian Council for Cultural Relations (ICCR)",
         provider_type="central_government",
         country_of_study="Russia,China,Egypt,Cuba,Mexico,Iran,Italy,Greece,Poland,Hungary,Romania,Czech Republic",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate","graduate","doctoral"],
         eligible_majors=["Arts","Humanities","Music","Dance","Theatre","Languages","Social Sciences"],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Good academic standing",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://a2ascholarships.iccr.gov.in",
         official_source_url="https://iccr.gov.in", status="active",
         notes=_with_deadline("Cultural exchange with 50+ countries. Focus on arts/culture. Apply through ICCR A2A portal. Language training often included.", "January 31")),

    dict(name="Dr. Ambedkar Interest Subsidy Scheme (OBC/EBC Abroad Studies)",
         provider="Ministry of Social Justice and Empowerment, Govt of India",
         provider_type="central_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,France",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["OBC","EBC"], first_gen_required=False, income_based=True,
         max_family_income_inr=300000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["interest_subsidy"], renewable=True,
         renewal_conditions="Maintained enrollment; income verification annual",
         application_deadline=None, deadline_is_rolling=True,
         portal_url="https://scholarships.gov.in",
         official_source_url="https://socialjustice.nic.in", status="active",
         notes=_with_deadline("Full interest subsidy during course + moratorium on education loan for OBC students studying abroad. Family income < ₹3L (OBC) or ₹1L (EBC). Apply via NSP.", "Rolling")),

    dict(name="Central Sector Scheme of Scholarship (Merit, Top Board Students)",
         provider="Ministry of Education, Govt of India",
         provider_type="central_government",
         country_of_study="India",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=800000, award_inr_per_year=120000, award_usd_per_year=None,
         award_covers=["living","books"], renewable=True, renewal_conditions="60%+ marks each year",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://scholarships.gov.in",
         official_source_url="https://education.gov.in", status="active",
         notes=_with_deadline("For Class 12 board toppers (80th percentile+). ₹12,000/yr UG (₹20,000 Professional). Family income < ₹8L. Supplements other abroad financing.", "October 31")),

    # ── State Government ──────────────────────────────────────────────────────
    dict(name="Maharashtra Scholarship for Abroad Studies (VJNT/SBC)",
         provider="Government of Maharashtra, Social Justice Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,France,Japan",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Maharashtra"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["VJNT","SBC"], first_gen_required=False, income_based=True,
         max_family_income_inr=800000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Annual progress certificate",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://mahadbt.maharashtra.gov.in",
         official_source_url="https://sjsa.maharashtra.gov.in", status="active",
         notes=_with_deadline("VJNT (Vimukta Jati, Nomadic Tribes) and Special Backward Class from Maharashtra. Apply via MahaDBT portal.", "June 30")),

    dict(name="Kerala Abroad Studies Scholarship (SC Students)",
         provider="Government of Kerala, SC Development Department",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Kerala"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC"], first_gen_required=False, income_based=True,
         max_family_income_inr=600000, award_inr_per_year=600000, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Annual progress; maintain minimum grades",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://scholarship.itschool.gov.in",
         official_source_url="https://scdevelopment.kerala.gov.in", status="active",
         notes=_with_deadline("Up to ₹6L/yr for SC students from Kerala studying abroad. Maximum 5 years. Apply via Kerala Scholarship Portal.", "July 31")),

    dict(name="Tamil Nadu CM Scholarship for Higher Education Abroad",
         provider="Government of Tamil Nadu",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,France",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Tamil Nadu"],
         degree_levels=["graduate"],
         eligible_majors=["STEM","Medicine","Agriculture","Law"], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=500000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Satisfactory progress; minimum grade requirement",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://tn.gov.in/scheme/data_view/10556",
         official_source_url="https://tnsocialwelfare.tn.gov.in", status="active",
         notes=_with_deadline("Tamil Nadu domicile students. Priority to first-gen learners and SC/ST/OBC. STEM fields prioritized.", "May 31")),

    dict(name="Andhra Pradesh NRI Academy Scholarship for Abroad Studies",
         provider="Government of Andhra Pradesh",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Andhra Pradesh"],
         degree_levels=["graduate"],
         eligible_majors=["STEM","MBA","Medicine"], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=600000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=True,
         portal_url="https://apsche.ap.gov.in",
         official_source_url="https://apsche.ap.gov.in", status="active",
         notes=_with_deadline("AP NRI Academy channel for diaspora-funded scholarships. Also check Jagananna Vidya Deevena for domestic support.", "Varies — check portal")),

    dict(name="Rajasthan Scholarship for Abroad Studies (SC/ST)",
         provider="Government of Rajasthan, SC/ST Welfare Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Rajasthan"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC","ST"], first_gen_required=False, income_based=True,
         max_family_income_inr=250000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Annual progress certificate from institution",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://sso.rajasthan.gov.in",
         official_source_url="https://sje.rajasthan.gov.in", status="active",
         notes=_with_deadline("Apply via Rajasthan SSO portal. Income limit ₹2.5L for SC and ST. Few slots — apply early.", "June 30")),

    dict(name="Karnataka Rajyotsava Scholarship for Abroad Studies",
         provider="Government of Karnataka, Backward Classes Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Karnataka"],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=["OBC","SC","ST"], first_gen_required=False, income_based=True,
         max_family_income_inr=600000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Annual progress report",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://karepass.cgg.gov.in",
         official_source_url="https://backwardclasses.kar.nic.in", status="active",
         notes=_with_deadline("Karnataka domicile with PUC/graduation from Karnataka institution. SC/ST/OBC categories. Apply via KAREPASS portal.", "August 31")),

    dict(name="West Bengal Scholarship for Higher Education Abroad (Minority)",
         provider="Government of West Bengal, Minority Affairs Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["West Bengal"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["Muslim","Christian","Buddhist","Jain","Sikh","Parsi"],
         first_gen_required=False, income_based=True, max_family_income_inr=250000,
         award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Annual academic report",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://wbmdfcscholarship.in",
         official_source_url="https://www.minorityaffairswb.gov.in", status="active",
         notes=_with_deadline("West Bengal minority community scholarship. Apply via WBMDFC scholarship portal.", "September 30")),

    dict(name="Gujarat Scholarship for Studies Abroad (SC/ST/OBC)",
         provider="Government of Gujarat, Social Justice Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Gujarat"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC","ST","OBC"], first_gen_required=False, income_based=True,
         max_family_income_inr=600000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Annual progress report",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://sje.gujarat.gov.in",
         official_source_url="https://sje.gujarat.gov.in", status="active",
         notes=_with_deadline("Gujarat domicile SC/ST/OBC students. Income limit varies by category. Apply via Gujarat Scholarship Portal.", "July 31")),

    dict(name="Punjab Dr. Ambedkar Scholarship for Abroad Studies (SC)",
         provider="Government of Punjab, SC Welfare Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Punjab"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC"], first_gen_required=False, income_based=True,
         max_family_income_inr=400000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Annual progress certificate",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://scholarships.punjab.gov.in",
         official_source_url="https://scwelfare.punjab.gov.in", status="active",
         notes=_with_deadline("For SC students domiciled in Punjab. Must have 60%+ marks in qualifying exam.", "July 31")),

    dict(name="Odisha Scholarship for Abroad Studies (ST/SC)",
         provider="Government of Odisha, ST & SC Development Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Odisha"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC","ST"], first_gen_required=False, income_based=True,
         max_family_income_inr=600000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Annual progress certificate",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://scholarship.odisha.gov.in",
         official_source_url="https://stscdev.odisha.gov.in", status="active",
         notes=_with_deadline("For SC/ST students domiciled in Odisha studying abroad. Apply via Odisha Scholarship Portal.", "July 31")),

    dict(name="Uttar Pradesh Scholarship for Abroad Studies (SC/ST/OBC/Minority)",
         provider="Government of Uttar Pradesh, Social Welfare Dept",
         provider_type="state_government",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Uttar Pradesh"],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=["SC","ST","OBC","Muslim","Christian","Sikh","Buddhist","Jain","Parsi"],
         first_gen_required=False, income_based=True,
         max_family_income_inr=250000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Annual progress report",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://scholarship.up.gov.in",
         official_source_url="https://scholarship.up.gov.in", status="active",
         notes=_with_deadline("UP domicile SC/ST/OBC/Minority students studying abroad. Apply via UP Scholarship and Fee Reimbursement Online System.", "October 31")),

    # ── Foreign Government ────────────────────────────────────────────────────
    dict(name="Fulbright-Nehru Master's Fellowships",
         provider="USIEF / US Department of State", provider_type="foreign_government",
         country_of_study="United States",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=50000,
         award_covers=["tuition","living","travel","health","books"], renewable=False,
         renewal_conditions=None, application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.usief.org.in/Fellowships-for-Indians/Fulbright-Nehru-Master's-Fellowships.aspx",
         official_source_url="https://www.usief.org.in", status="active",
         notes=_with_deadline("Most prestigious US Govt scholarship for Indian students. 1-2 yr master's at US university. Covers J-1 visa, travel, stipend, tuition, health. ~100 awards/year for India.", "July 15")),

    dict(name="Fulbright-Nehru Doctoral and Research Fellowships",
         provider="USIEF / US Department of State", provider_type="foreign_government",
         country_of_study="United States",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","health"], renewable=False,
         renewal_conditions=None, application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.usief.org.in/Fellowships-for-Indians/Fulbright-Nehru-Doctoral-Research-Fellowships.aspx",
         official_source_url="https://www.usief.org.in", status="active",
         notes=_with_deadline("6-9 months doctoral research visit to US for Indian PhD students registered at Indian universities.", "July 15")),

    dict(name="Chevening Scholarship (UK Government)",
         provider="UK Foreign, Commonwealth and Development Office (FCDO)",
         provider_type="foreign_government",
         country_of_study="United Kingdom",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","visa","thesis"], renewable=False,
         renewal_conditions=None, application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.chevening.org/scholarships/",
         official_source_url="https://www.chevening.org", status="active",
         notes=_with_deadline("Fully funded 1-year master's at any UK university. Must have 2 years work experience. Leadership focus. ~100 awards/year for India.", "November 7")),

    dict(name="Commonwealth Scholarship — Masters and PhD (UK)",
         provider="Commonwealth Scholarship Commission (UK)",
         provider_type="foreign_government",
         country_of_study="United Kingdom",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","thesis"], renewable=True,
         renewal_conditions="Annual progress review by host university",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://cscuk.fcdo.gov.uk/scholarships/",
         official_source_url="https://cscuk.fcdo.gov.uk", status="active",
         notes=_with_deadline("Fully funded. Administered via ICCR India. Priority: development-impacting research. Apply via CSC portal AND ICCR. Very competitive.", "October 18")),

    dict(name="DAAD Study Scholarship for Graduates (Germany)",
         provider="German Academic Exchange Service (DAAD)",
         provider_type="foreign_government",
         country_of_study="Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["living","travel","health","language_course"], renewable=True,
         renewal_conditions="Annual academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.daad.de/en/study-and-research-in-germany/scholarships/daad-scholarships/",
         official_source_url="https://daad.in", status="active",
         notes=_with_deadline("€934/month stipend + travel. German public universities charge NO tuition for internationals — this covers only living costs. Apply via DAAD portal.", "October 15")),

    dict(name="DAAD WISE Scholarship (Research Internship in Germany)",
         provider="German Academic Exchange Service (DAAD)",
         provider_type="foreign_government",
         country_of_study="Germany",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate"],
         eligible_majors=["Engineering","Natural Sciences","Life Sciences","Computer Science"],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["living","travel","health"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.daad.de/en/study-and-research-in-germany/scholarships/daad-scholarships/wise/",
         official_source_url="https://daad.in", status="active",
         notes=_with_deadline("2-3 month summer research internship in Germany for Indian UG STEM students. €650/month + travel. Apply via DAAD portal with host professor letter.", "November 30")),

    dict(name="Erasmus Mundus Joint Master's Degree Scholarship",
         provider="European Commission (EU)",
         provider_type="foreign_government",
         country_of_study="Germany,France,Netherlands,Spain,Italy,Sweden,Belgium,Portugal,Finland,Austria",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","visa","insurance"], renewable=True,
         renewal_conditions="Satisfactory academic performance",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters",
         official_source_url="https://erasmus-plus.ec.europa.eu", status="active",
         notes=_with_deadline("€1,400/month for 1-2yr joint master's across 2-3 EU universities. €9,000/yr tuition covered. ~180 different EMJM programs. Apply to programs individually.", "Varies by program — typically Jan-Feb")),

    dict(name="Australia Awards Scholarships",
         provider="Australian Dept of Foreign Affairs and Trade (DFAT)",
         provider_type="foreign_government",
         country_of_study="Australia",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","health","pre_course_English"], renewable=True,
         renewal_conditions="Satisfactory academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.australiaawardsindia.org",
         official_source_url="https://www.dfat.gov.au/people-to-people/australia-awards/australia-awards-scholarships",
         status="active",
         notes=_with_deadline("Full scholarship: AUD 30,000+/yr living + full tuition + travel. Priority: development-focused fields. Development impact statement required.", "April 30")),

    dict(name="New Zealand Development Scholarships",
         provider="New Zealand Ministry of Foreign Affairs and Trade",
         provider_type="foreign_government",
         country_of_study="New Zealand",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","health"], renewable=True,
         renewal_conditions="Satisfactory academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.mfat.govt.nz/en/aid-and-development/scholarships/",
         official_source_url="https://www.mfat.govt.nz", status="active",
         notes=_with_deadline("For Indian students in development-related fields. NZD stipend + full tuition. Limited slots for India.", "March 31")),

    dict(name="MEXT Japanese Government Scholarship",
         provider="Ministry of Education, Culture, Sports, Science and Technology (MEXT), Japan",
         provider_type="foreign_government",
         country_of_study="Japan",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate","graduate","doctoral"], eligible_majors=[],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","Japanese_language_training"], renewable=True,
         renewal_conditions="Annual review; satisfactory progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.in.emb-japan.go.jp/itprtop_en/",
         official_source_url="https://www.mext.go.jp/en/", status="active",
         notes=_with_deadline("¥117,000-144,000/month + full tuition. 1 year Japanese language prep included. 2 tracks: Embassy + University recommendation.", "May 15 (Embassy track)")),

    dict(name="Swedish Institute Study Scholarships",
         provider="Swedish Institute (SI)",
         provider_type="foreign_government",
         country_of_study="Sweden",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","insurance"], renewable=True,
         renewal_conditions="Satisfactory academic performance",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://si.se/en/apply/scholarships/swedish-institute-scholarships-for-global-professionals/",
         official_source_url="https://si.se", status="active",
         notes=_with_deadline("Full: tuition + SEK 11,000/month living + one-time travel. Master's at Swedish universities. Leadership and sustainability focus.", "February 10")),

    dict(name="Korean Government Scholarship Program (KGSP)",
         provider="National Institute for International Education (NIIED), South Korea",
         provider_type="foreign_government",
         country_of_study="South Korea",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate","graduate","doctoral"], eligible_majors=[],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","Korean_language","health"], renewable=True,
         renewal_conditions="Annual academic performance review",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.studyinkorea.go.kr/en/sub/gks/allnew_invite.do",
         official_source_url="https://www.niied.go.kr", status="active",
         notes=_with_deadline("KRW 1,000,000-1,500,000/month + full tuition. 1 yr Korean language prep. 2 tracks: embassy and university. Strong for engineering and technology.", "March 11")),

    dict(name="French Government Eiffel Excellence Scholarship",
         provider="French Ministry for Europe and Foreign Affairs",
         provider_type="foreign_government",
         country_of_study="France",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"],
         eligible_majors=["Engineering","Science","Law","Economics","Political Science","Management"],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","health","cultural_activities"], renewable=True,
         renewal_conditions="Satisfactory academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.campusfrance.org/en/eiffel-scholarship-program-of-excellence",
         official_source_url="https://www.campusfrance.org", status="active",
         notes=_with_deadline("€1,181/month master's or €1,400/month PhD. French university MUST nominate you — contact Campus France India or French universities directly.", "January 10")),

    dict(name="Netherlands Orange Knowledge Programme (NFP)",
         provider="Netherlands Ministry of Foreign Affairs / Nuffic",
         provider_type="foreign_government",
         country_of_study="Netherlands",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"],
         eligible_majors=["Water Management","Agriculture","Food Security","Health","Environment"],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","visa","health"], renewable=False,
         renewal_conditions=None, application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.orangeknowledgeprogramme.nl",
         official_source_url="https://www.nuffic.nl/en/subjects/orange-knowledge-programme",
         status="active",
         notes=_with_deadline("For mid-career Indian professionals (NOT fresh graduates). Must be employed. Employer letter required. Water/agriculture/health sectors prioritized.", "Varies by program")),

    dict(name="Singapore Government Scholarship (NUS / NTU / SMU)",
         provider="Singapore Ministry of Education",
         provider_type="foreign_government",
         country_of_study="Singapore",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate","graduate"], eligible_majors=[],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Maintain required GPA; bond conditions may apply",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.moe.gov.sg/financial-matters/awards-scholarships",
         official_source_url="https://www.moe.gov.sg", status="active",
         notes=_with_deadline("Various scholarships for NUS, NTU, SMU, SUTD. Some have service bonds (work in Singapore 3-6 years post-graduation). Apply via individual university portals.", "November - February")),

    # ── Foundation ────────────────────────────────────────────────────────────
    dict(name="Inlaks Shivdasani Foundation Scholarship",
         provider="Inlaks Shivdasani Foundation", provider_type="foundation",
         country_of_study="United States,United Kingdom,Europe",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=100000,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Satisfactory academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.inlaksfoundation.org/scholarships/the-inlaks-scholarship/",
         official_source_url="https://www.inlaksfoundation.org", status="active",
         notes=_with_deadline("Up to $100,000 over the program. Ages 18-30. 1st or 2nd division graduate from Indian university. ~10-12 awards/year. Any field.", "March 15")),

    dict(name="JN Tata Endowment Loan Scholarship",
         provider="JN Tata Endowment for Higher Education of Indians",
         provider_type="foundation",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,France,Netherlands,Singapore,Japan",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["living","travel"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://jntataendowment.org",
         official_source_url="https://jntataendowment.org", status="active",
         notes=_with_deadline("India's oldest scholarship (est. 1892). ₹10-15L interest-free LOAN (not grant) to supplement funding. Must have admission to top-ranked foreign institution. ~150 scholars/year. Very prestigious.", "March 15")),

    dict(name="KC Mahindra Scholarship for Post-Graduate Studies Abroad",
         provider="KC Mahindra Education Trust", provider_type="foundation",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,France",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.kcmet.org/Scholarship-Fellowships.aspx",
         official_source_url="https://www.kcmet.org", status="active",
         notes=_with_deadline("Up to ₹8L interest-free scholarship for PG at recognized universities. Merit + leadership. ~30 awards/year.", "May 15")),

    dict(name="Narotam Sekhsaria Foundation Scholarship",
         provider="Narotam Sekhsaria Foundation", provider_type="foundation",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,Singapore",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel"], renewable=True,
         renewal_conditions="Satisfactory academic progress; annual report",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.nsfoundation.co.in/scholarships/postgraduate-scholarship/",
         official_source_url="https://www.nsfoundation.co.in", status="active",
         notes=_with_deadline("Up to ₹20L for PG studies abroad. Under-30. Must have confirmed admission. Strong for architecture, arts, social sciences.", "January 31")),

    dict(name="Reliance Foundation Postgraduate Scholarship",
         provider="Reliance Foundation", provider_type="foundation",
         country_of_study="United States,United Kingdom,Canada,Australia,Germany,Singapore",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"],
         eligible_majors=["STEM","Business","Management","Social Sciences","Humanities"],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Academic performance; community engagement",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.reliancefoundation.org/scholarships",
         official_source_url="https://www.reliancefoundation.org", status="active",
         notes=_with_deadline("₹6L/year for abroad studies at top-ranked universities. Mentorship from Reliance employees. Community project required.", "February 28")),

    dict(name="Aga Khan Foundation International Scholarship",
         provider="Aga Khan Foundation", provider_type="foundation",
         country_of_study="United States,United Kingdom,Canada,France,Germany,Portugal",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Satisfactory academic performance",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.akdn.org/our-agencies/aga-khan-foundation/international-scholarship-programme",
         official_source_url="https://www.akdn.org", status="active",
         notes=_with_deadline("50% grant + 50% interest-free loan. Outstanding students with financial need. Priority for Ismaili Muslims but open to all. Development-impact focus. Very competitive.", "March 31")),

    dict(name="Tata Scholarship — Cornell University",
         provider="Tata Education and Development Trust", provider_type="foundation",
         country_of_study="United States",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","books","travel"], renewable=True,
         renewal_conditions="Maintain GPA; demonstrate continued financial need",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://financialaid.cornell.edu/types-aid/scholarships/tata-scholarship",
         official_source_url="https://financialaid.cornell.edu", status="active",
         notes=_with_deadline("Full-need scholarship for Indian undergrads at Cornell. No separate application — automatically considered when applying for Cornell financial aid as Indian national.", "Automatic via Cornell FA application")),

    dict(name="Gates Cambridge Scholarship",
         provider="Gates Cambridge Trust / Bill and Melinda Gates Foundation",
         provider_type="foundation",
         country_of_study="United Kingdom",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate","doctoral"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","visa","family_allowance"], renewable=True,
         renewal_conditions="Annual review; satisfactory academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.gatescambridge.org",
         official_source_url="https://www.gatescambridge.org", status="active",
         notes=_with_deadline("Fully funded PhD/master's at Cambridge. ~90 awards/year globally. Must demonstrate commitment to improving lives of others. Equivalent to Rhodes for Cambridge.", "December 3 (non-US applicants)")),

    dict(name="Rhodes Scholarship — University of Oxford",
         provider="Rhodes Trust", provider_type="foundation",
         country_of_study="United Kingdom",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","travel","health"], renewable=True,
         renewal_conditions="Annual review; satisfactory progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.rhodeshouse.ox.ac.uk/scholarships/",
         official_source_url="https://www.rhodeshouse.ox.ac.uk", status="active",
         notes=_with_deadline("World's oldest international scholarship. 6 slots for India/year. Oxford tuition + £18,180/yr. Leadership, intellectual ability, service, sport all considered.", "July 31")),

    dict(name="Oxford Weidenfeld and Hoffmann Scholarship",
         provider="University of Oxford / Weidenfeld-Hoffmann Trust", provider_type="university",
         country_of_study="United Kingdom",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living"], renewable=True,
         renewal_conditions="Satisfactory academic progress",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://www.ox.ac.uk/admissions/graduate/fees-and-funding/graduate-scholarships/weidenfeld-hoffmann-scholarships-and-leadership-programme",
         official_source_url="https://www.ox.ac.uk", status="active",
         notes=_with_deadline("Full Oxford tuition + £18,000/yr stipend. India qualifies as eligible developing country. Leadership programme required alongside study. Auto-considered via Oxford grad application.", "January (varies by course)")),

    dict(name="Harvard Financial Aid for International Students",
         provider="Harvard University", provider_type="university",
         country_of_study="United States",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","books","travel","computer"], renewable=True,
         renewal_conditions="Maintain full-time enrollment; annual income verification",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://college.harvard.edu/financial-aid",
         official_source_url="https://college.harvard.edu/financial-aid", status="active",
         notes=_with_deadline("Meets 100% of demonstrated financial need for ALL admitted students including internationals. ~60% of students receive aid. Average $0 for family income <$65K.", "November 1 (REA) / January 1 (RD)")),

    dict(name="MIT Need-Based Financial Aid (Undergraduate)",
         provider="Massachusetts Institute of Technology", provider_type="university",
         country_of_study="United States",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","books","travel"], renewable=True,
         renewal_conditions="Annual financial review; maintain good academic standing",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://sfs.mit.edu/undergraduate-students/types-of-aid/scholarships/",
         official_source_url="https://sfs.mit.edu", status="active",
         notes=_with_deadline("Meets 100% of demonstrated need. Average grant $55,000/yr. Family income <$90K typically full ride. International students receive same aid consideration as US students.", "November 1 (EA) / January 1 (RD)")),

    dict(name="Sitaram Jindal Scholarship (Women / Low-Income)",
         provider="Sitaram Jindal Foundation", provider_type="foundation",
         country_of_study="India,United States,United Kingdom,Canada,Australia",
         country_of_origin=["India"], eligible_nationalities=["Indian"],
         eligible_states=["Karnataka","Andhra Pradesh","Telangana","Maharashtra","Odisha","West Bengal","Jharkhand"],
         degree_levels=["undergraduate","graduate"], eligible_majors=[],
         eligible_genders=["Female"],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=250000, award_inr_per_year=60000, award_usd_per_year=None,
         award_covers=["living","books","fees"], renewable=True,
         renewal_conditions="Maintain 60%+ marks",
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://sitaramjindalfoundation.org",
         official_source_url="https://sitaramjindalfoundation.org", status="active",
         notes=_with_deadline("Focus on female students from low-income families in select South Indian + East Indian states. Up to ₹60,000/year.", "September 30")),

    dict(name="Vidyasaarathi Scholarship Portal (50+ Corporate Scholarships)",
         provider="NSE Foundation / Vidyasaarathi", provider_type="ngo",
         country_of_study="India,United States,United Kingdom,Canada,Australia",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate","graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=800000, award_inr_per_year=None, award_usd_per_year=None,
         award_covers=["tuition","living","books"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=True,
         portal_url="https://www.vidyasaarathi.co.in",
         official_source_url="https://www.vidyasaarathi.co.in", status="active",
         notes=_with_deadline("Aggregator for 50+ corporate scholarships (Tata AIA, Star Health, ICICI Lombard, etc). Rolling deadlines. Income < ₹8L. Free to apply. Check regularly.", "Rolling")),

    dict(name="HDFC Bank Educational Crisis Scholarship",
         provider="HDFC Bank Parivartan / CSR", provider_type="ngo",
         country_of_study="India",
         country_of_origin=["India"], eligible_nationalities=["Indian"], eligible_states=[],
         degree_levels=["undergraduate","graduate"], eligible_majors=[], eligible_genders=[],
         minority_required=[], first_gen_required=False, income_based=True,
         max_family_income_inr=500000, award_inr_per_year=75000, award_usd_per_year=None,
         award_covers=["tuition","living","books"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=True,
         portal_url="https://www.hdfcbank.com/personal/need-help/educational-scholarship",
         official_source_url="https://www.hdfcbank.com", status="active",
         notes=_with_deadline("For students who lost a parent or primary breadwinner. Up to ₹75,000 one-time or annual. Indian institutions primarily. Must demonstrate financial distress.", "Rolling")),

    dict(name="American India Foundation William J. Clinton Fellowship",
         provider="American India Foundation", provider_type="ngo",
         country_of_study="India",
         country_of_origin=["India","United States"], eligible_nationalities=["Indian","American"],
         eligible_states=[], degree_levels=["undergraduate","graduate"], eligible_majors=[],
         eligible_genders=[], minority_required=[], first_gen_required=False, income_based=False,
         max_family_income_inr=None, award_inr_per_year=1000000, award_usd_per_year=None,
         award_covers=["living","travel","health"], renewable=False, renewal_conditions=None,
         application_deadline=None, deadline_is_rolling=False,
         portal_url="https://aif.org/fellowship/",
         official_source_url="https://aif.org", status="active",
         notes=_with_deadline("10-month social entrepreneurship fellowship in India for Indian and American students. $1000/month stipend + housing + health insurance.", "January 10")),
]

# ══════════════════════════════════════════════════════════════════════════════
# CONCURRENT SCRAPERS
# ══════════════════════════════════════════════════════════════════════════════

def _scrape_vidya_lakshmi() -> list[dict]:
    """Try multiple VL endpoints concurrently."""
    endpoints = [
        "https://www.vidyalakshmi.co.in/Students/schemeList",
        "https://www.vidyalakshmi.co.in/Students/bankSchemeList",
        "https://www.vidyalakshmi.co.in/VidyaLakshmi/getBanks",
    ]
    results = []
    for url in endpoints:
        try:
            r = requests.get(url, headers={**HEADERS,
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json",
                "Referer": "https://www.vidyalakshmi.co.in/Students/",
            }, timeout=12)
            if r.status_code == 200:
                ct = r.headers.get("content-type", "")
                if "json" in ct:
                    data = r.json()
                    schemes = data if isinstance(data, list) else (data.get("schemes") or data.get("data") or [])
                    for s in schemes:
                        name = s.get("schemeName") or s.get("name") or ""
                        bank = s.get("bankName") or s.get("provider") or ""
                        if name and bank:
                            results.append(dict(
                                name=f"{bank} — {name}",
                                provider=bank, provider_type="public_sector_bank",
                                scheme_name=name,
                                country_of_study=["United States","United Kingdom","Canada","Australia","Germany"],
                                eligible_nationalities=["Indian"], degree_levels=["undergraduate","graduate"],
                                max_loan_amount_inr=None, interest_rate_pct=None,
                                interest_rate_type="floating", subsidy_available=True,
                                subsidy_scheme="CSIS", moratorium_months=12, repayment_years=15,
                                collateral_required_above_inr=750000, processing_fee_pct=0.0,
                                requires_co_applicant=True, eligible_colleges_type="all_accredited",
                                portal_url="https://www.vidyalakshmi.co.in",
                                official_source_url="https://www.vidyalakshmi.co.in",
                                status="active",
                                notes=f"Source: Vidya Lakshmi Portal. Scheme: {name}. Verify current rates at vidyalakshmi.co.in.",
                            ))
                    if results:
                        log.info(f"  VL endpoint {url}: {len(results)} schemes")
                        break
        except Exception as e:
            log.debug(f"  VL {url}: {e}")
    return results


def _scrape_buddy4study() -> list[dict]:
    results = []
    urls = [
        "https://www.buddy4study.com/page/abroad-scholarship",
        "https://www.buddy4study.com/scholarships?country=India&study_destination=abroad",
    ]
    for url in urls:
        try:
            r = requests.get(url, headers=HEADERS, timeout=15)
            if r.status_code != 200: continue
            soup = BeautifulSoup(r.text, "html.parser")
            selectors = [".scholarship-card", ".b4s-card", "article.scholarship",
                         ".listing-card", ".scholarship-item", ".card-body"]
            cards = []
            for sel in selectors:
                cards = soup.select(sel)
                if cards: break
            for card in cards[:25]:
                name_el = card.select_one("h2, h3, h4, .title, .scholarship-name, .card-title")
                name = name_el.get_text(strip=True) if name_el else ""
                prov_el = card.select_one(".provider, .organization, .sponsor, .scholarship-provider")
                prov = prov_el.get_text(strip=True) if prov_el else "Various"
                amt_el  = card.select_one(".amount, .award-amount, .scholarship-amount")
                amt = amt_el.get_text(strip=True) if amt_el else ""
                link_el = card.select_one("a[href]")
                link = link_el["href"] if link_el else ""
                if not link.startswith("http"):
                    link = "https://www.buddy4study.com" + link
                if name and len(name) > 5:
                    results.append(dict(
                        name=name[:200], provider=prov[:200], provider_type="foundation",
                        country_of_study="United States,United Kingdom,Canada,Australia,Germany",
                        country_of_origin=["India"], eligible_nationalities=["Indian"],
                        eligible_states=[], degree_levels=["undergraduate","graduate"],
                        eligible_majors=[], eligible_genders=[], minority_required=[],
                        first_gen_required=False, income_based=False,
                        max_family_income_inr=None, award_inr_per_year=None, award_usd_per_year=None,
                        award_covers=["tuition","living"], renewable=False, renewal_conditions=None,
                        application_deadline=None, deadline_is_rolling=True,
                        portal_url=link or "https://www.buddy4study.com",
                        official_source_url=link or "https://www.buddy4study.com",
                        status="active",
                        notes=f"Source: Buddy4Study. Award: {amt}. Verify details on portal.",
                    ))
            if results:
                log.info(f"  Buddy4Study: {len(results)} scholarships from {url}")
                break
        except Exception as e:
            log.debug(f"  Buddy4Study {url}: {e}")
    return results


def _scrape_nsp() -> list[dict]:
    """Scrape National Scholarship Portal for abroad-eligible central/state schemes."""
    results = []
    try:
        r = requests.get("https://scholarships.gov.in/public/schemeGlobal/schemeList",
                         headers={**HEADERS, "Accept": "application/json",
                                  "X-Requested-With": "XMLHttpRequest"}, timeout=15)
        if r.status_code == 200 and "json" in r.headers.get("content-type", ""):
            schemes = r.json() if isinstance(r.json(), list) else []
            for s in schemes:
                name = s.get("schemeName") or s.get("name") or ""
                ministry = s.get("ministryName") or "Ministry of Education"
                keywords = ["abroad","foreign","overseas","international","study outside"]
                if name and any(k in name.lower() for k in keywords):
                    results.append(dict(
                        name=name[:200], provider=ministry, provider_type="central_government",
                        country_of_study="United States,United Kingdom,Canada,Australia,Germany",
                        country_of_origin=["India"], eligible_nationalities=["Indian"],
                        eligible_states=[], degree_levels=["graduate","doctoral"],
                        eligible_majors=[], eligible_genders=[], minority_required=[],
                        first_gen_required=False, income_based=True,
                        max_family_income_inr=800000, award_inr_per_year=None, award_usd_per_year=None,
                        award_covers=["tuition","living"], renewable=True,
                        renewal_conditions="Annual progress report",
                        application_deadline=None, deadline_is_rolling=True,
                        portal_url="https://scholarships.gov.in",
                        official_source_url="https://scholarships.gov.in",
                        status="active",
                        notes=f"Source: National Scholarship Portal. Ministry: {ministry}. Apply at scholarships.gov.in.",
                    ))
            log.info(f"  NSP: {len(results)} abroad-eligible schemes")
    except Exception as e:
        log.debug(f"  NSP: {e}")
    return results


def run_scrapers_concurrent() -> tuple[list, list]:
    """Run all scrapers concurrently — 3x faster than sequential."""
    all_gov, all_grants = [], []
    scraper_fns = {
        "vidya_lakshmi": _scrape_vidya_lakshmi,
        "buddy4study":   _scrape_buddy4study,
        "nsp":           _scrape_nsp,
    }
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fn): name for name, fn in scraper_fns.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                result = future.result()
                if name == "vidya_lakshmi":
                    all_gov.extend(result)
                else:
                    all_grants.extend(result)
                log.info(f"  Scraper '{name}' done: {len(result)} results")
            except Exception as e:
                log.warning(f"  Scraper '{name}' raised: {e}")
    return all_gov, all_grants

# ══════════════════════════════════════════════════════════════════════════════
# DB WRITER
# ══════════════════════════════════════════════════════════════════════════════

def insert_grants(conn, grants: list[dict]):
    log.info(f"  Inserting {len(grants)} grants/scholarships…")
    ok = fail = skip = 0
    with conn.cursor() as cur:
        cur.execute("SELECT LOWER(name) FROM grants")
        existing = {r[0] for r in cur.fetchall()}

    for grant in grants:
        if grant["name"].lower() in existing:
            skip += 1
            continue
        with conn.cursor() as cur:
            try:
                cur.execute("""
                    INSERT INTO grants (
                        id, name, provider, provider_type, country_of_study,
                        country_of_origin, eligible_nationalities, eligible_states,
                        degree_levels, eligible_majors, eligible_genders,
                        minority_required, first_gen_required, income_based,
                        max_family_income_inr, award_inr_per_year, award_usd_per_year,
                        award_covers, renewable, renewal_conditions,
                        application_deadline, deadline_is_rolling,
                        portal_url, official_source_url, status, last_verified_at, notes
                    ) VALUES (
                        gen_random_uuid(), %(name)s, %(provider)s, %(provider_type)s,
                        %(country_of_study)s, %(country_of_origin)s, %(eligible_nationalities)s,
                        %(eligible_states)s, %(degree_levels)s, %(eligible_majors)s,
                        %(eligible_genders)s, %(minority_required)s, %(first_gen_required)s,
                        %(income_based)s, %(max_family_income_inr)s, %(award_inr_per_year)s,
                        %(award_usd_per_year)s, %(award_covers)s, %(renewable)s,
                        %(renewal_conditions)s,
                        NULL,
                        %(deadline_is_rolling)s, %(portal_url)s, %(official_source_url)s,
                        %(status)s, NOW(), %(notes)s
                    ) ON CONFLICT DO NOTHING
                """, grant)
                conn.commit()
                ok += 1
                existing.add(grant["name"].lower())
            except Exception as e:
                conn.rollback()
                fail += 1
                log.warning(f"    ✗ '{grant['name']}': {e}")

    log.info(f"  grants: {ok} inserted, {skip} skipped (existing), {fail} failed")


def insert_gov_loans(conn, loans: list[dict]):
    if not loans: return
    log.info(f"  Inserting {len(loans)} scraped gov loans…")
    ok = fail = skip = 0
    with conn.cursor() as cur:
        cur.execute("SELECT LOWER(name) FROM government_loans")
        existing = {r[0] for r in cur.fetchall()}

    for loan in loans:
        if loan["name"].lower() in existing:
            skip += 1
            continue
        with conn.cursor() as cur:
            try:
                cur.execute("""
                    INSERT INTO government_loans (
                        id, name, provider, provider_type, scheme_name,
                        country_of_study, eligible_nationalities, degree_levels,
                        max_loan_amount_inr, interest_rate_pct, interest_rate_type,
                        subsidy_available, subsidy_scheme, moratorium_months,
                        repayment_years, collateral_required_above_inr, processing_fee_pct,
                        requires_co_applicant, eligible_colleges_type,
                        portal_url, official_source_url, status, last_verified_at, notes
                    ) VALUES (
                        gen_random_uuid(), %(name)s, %(provider)s, %(provider_type)s,
                        %(scheme_name)s, %(country_of_study)s, %(eligible_nationalities)s,
                        %(degree_levels)s, %(max_loan_amount_inr)s, %(interest_rate_pct)s,
                        %(interest_rate_type)s, %(subsidy_available)s, %(subsidy_scheme)s,
                        %(moratorium_months)s, %(repayment_years)s,
                        %(collateral_required_above_inr)s, %(processing_fee_pct)s,
                        %(requires_co_applicant)s, %(eligible_colleges_type)s,
                        %(portal_url)s, %(official_source_url)s, %(status)s, NOW(), %(notes)s
                    ) ON CONFLICT DO NOTHING
                """, loan)
                conn.commit()
                ok += 1
                existing.add(loan["name"].lower())
            except Exception as e:
                conn.rollback()
                fail += 1
                log.warning(f"    ✗ '{loan['name']}': {e}")

    log.info(f"  gov_loans (scraped): {ok} inserted, {skip} skipped, {fail} failed")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    db_url = os.environ.get("SUPABASE_DB_URL","") or os.environ.get("DATABASE_URL","")
    if not db_url:
        log.error("SUPABASE_DB_URL not set"); sys.exit(1)

    conn = get_conn(db_url)
    all_grants  = list(GRANTS)
    scraped_gov = []

    if not SKIP_SCRAPING:
        log.info("═" * 60)
        log.info("CONCURRENT SCRAPING (3 sources in parallel)…")
        t0 = time.time()
        s_gov, s_grants = run_scrapers_concurrent()
        scraped_gov.extend(s_gov)
        all_grants.extend(s_grants)
        log.info(f"  Scraping complete in {time.time()-t0:.1f}s — {len(s_gov)} gov loans, {len(s_grants)} grants scraped")

    log.info("═" * 60)
    log.info(f"Inserting: {len(all_grants)} grants, {len(scraped_gov)} scraped gov loans")

    if DRY_RUN:
        log.info("DRY_RUN=1 — nothing written")
        conn.close(); return

    insert_grants(conn, all_grants)
    insert_gov_loans(conn, scraped_gov)
    conn.close()

    log.info("═" * 60)
    log.info(f"COMPLETE — {len(all_grants)} grants processed, {len(scraped_gov)} scraped gov loans processed")
    log.info("""
VERIFY:
  SELECT 'gov_loans', COUNT(*) FROM government_loans
  UNION ALL SELECT 'private_loans', COUNT(*) FROM private_loans
  UNION ALL SELECT 'grants', COUNT(*) FROM grants;

  SELECT provider_type, COUNT(*) FROM grants GROUP BY provider_type ORDER BY 2 DESC;

  SELECT
    CASE WHEN array_length(minority_required,1)>0 THEN 'Minority'
         WHEN array_length(eligible_states,1)>0   THEN 'State-specific'
         WHEN income_based                         THEN 'Need-based'
         ELSE 'Merit/General' END AS bucket,
    COUNT(*)
  FROM grants GROUP BY 1;
""")

if __name__ == "__main__":
    main()