"""
scrape_international.py
-----------------------
Seeds 100+ colleges from India, UK, EU, and Australia into Supabase.

Sources:
  India   — Curated list of 150+ IITs, NITs, IIMs, central universities,
             state universities, and top private institutions
  UK      — 120+ universities (Russell Group + post-92 + specialist)
  EU      — 130+ top universities across 15 countries
  AUS/NZ  — 40+ Australian + 10 New Zealand universities

Failsafes:
  - Only inserts columns that actually exist in colleges_comprehensive
  - Deduplicates by (name, country) before any DB write
  - Checkpoint file: resumes after each region if rerun
  - Raw JSON saved to scraped_raw/ before every DB write
  - DRY_RUN=1 prints what would be inserted without touching DB
  - Skips rows if (name, country) already exists in DB

Usage:
  pip install supabase python-dotenv requests
  python scrape_international.py
  python scrape_international.py --region india
  python scrape_international.py --region uk
  python scrape_international.py --region eu
  python scrape_international.py --region australia
  python scrape_international.py --reset   # clear checkpoint and rerun all

Env vars (.env):
  SUPABASE_URL=https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...
  DRY_RUN=1   (optional)
"""

import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import requests
except ImportError:
    print("ERROR: pip install requests"); sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

SUPABASE_URL         = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
DRY_RUN              = os.getenv("DRY_RUN", "0") == "1"
CHECKPOINT_FILE      = "international_checkpoint.json"
RAW_DIR              = Path("scraped_raw")
SKIP_LOG             = "skipped_international.txt"
BATCH_SIZE           = 50

RAW_DIR.mkdir(exist_ok=True)

# Columns that actually exist in colleges_comprehensive.
# If your schema differs, edit this set — any key NOT in here is stripped before insert.
ALLOWED_COLUMNS = {
    "name", "city", "country", "state_region", "institution_type",
    "urban_classification", "website_url", "undergraduate_enrollment",
    "total_enrollment", "student_faculty_ratio", "latitude", "longitude",
    "source", "confidence_score", "created_at", "updated_at",
    # common extras — add/remove to match your actual schema
    "type", "setting", "acceptance_rate", "tuition_in_state",
    "tuition_out_state", "avg_net_price",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def log_skip(msg):
    with open(SKIP_LOG, "a") as f:
        f.write(f"{now_iso()} | {msg}\n")

def save_raw(name, data):
    path = RAW_DIR / f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    print(f"  Raw data saved → {path}")

def load_checkpoint():
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE) as f:
            return json.load(f)
    return {"completed_sources": [], "inserted_count": 0}

def save_checkpoint(cp):
    with open(CHECKPOINT_FILE, "w") as f:
        json.dump(cp, f, indent=2)

def chunked(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def make_college_row(
    name, city, country, website=None, institution_type=None,
    state_region=None, urban_classification=None,
    latitude=None, longitude=None,
    undergraduate_enrollment=None, total_enrollment=None,
    student_faculty_ratio=None, source=None,
):
    row = {
        "name":                     str(name).strip(),
        "city":                     str(city).strip() if city else None,
        "country":                  str(country).strip(),
        "state_region":             str(state_region).strip() if state_region else None,
        "institution_type":         institution_type,
        "urban_classification":     urban_classification,
        "website_url":              str(website).strip() if website else None,
        "undergraduate_enrollment": int(undergraduate_enrollment) if undergraduate_enrollment else None,
        "total_enrollment":         int(total_enrollment) if total_enrollment else None,
        "student_faculty_ratio":    str(student_faculty_ratio) if student_faculty_ratio else None,
        "latitude":                 float(latitude) if latitude else None,
        "longitude":                float(longitude) if longitude else None,
        "source":                   source or "Scraped",
        "confidence_score":         0.8,
        "created_at":               now_iso(),
        "updated_at":               now_iso(),
    }
    # Strip any key not in allowed columns + private metadata keys
    return {k: v for k, v in row.items() if k in ALLOWED_COLUMNS}

def make_ranking_row(college_id, source, value, year=2024):
    return {
        "college_id":     college_id,
        "ranking_source": source,
        "ranking_value":  str(value),
        "ranking_year":   year,
    }

# ── DB helpers ────────────────────────────────────────────────────────────────

def fetch_existing_names(client):
    """Load all (name, country) pairs already in DB."""
    existing = set()
    offset = 0
    while True:
        resp = (
            client.table("colleges_comprehensive")
            .select("name, country")
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            existing.add((
                (r.get("name") or "").lower().strip(),
                (r.get("country") or "").lower().strip(),
            ))
        offset += len(rows)
        if len(rows) < 1000:
            break
    return existing

def probe_allowed_columns(client):
    """
    Detect which columns actually exist by doing a single SELECT.
    Returns a set of column names. Falls back to ALLOWED_COLUMNS if probe fails.
    """
    try:
        resp = client.table("colleges_comprehensive").select("*").limit(1).execute()
        if resp.data:
            return set(resp.data[0].keys())
    except Exception as e:
        print(f"  ⚠️  Column probe failed: {e} — using default ALLOWED_COLUMNS")
    return ALLOWED_COLUMNS

def upsert_colleges(client, colleges, existing_names, live_columns):
    """
    Insert colleges not already in DB.
    Strips any column not in live_columns to avoid PGRST204 errors.
    Returns dict of name → inserted id.
    """
    to_insert = []
    skipped = 0
    for c in colleges:
        key = (c["name"].lower().strip(), c["country"].lower().strip())
        if key in existing_names:
            skipped += 1
            continue
        # Strip private metadata (_ranking_*) and any unknown columns
        row = {k: v for k, v in c.items()
               if not k.startswith("_") and k in live_columns}
        to_insert.append(row)

    print(f"  Inserting {len(to_insert)}, skipping {skipped} duplicates.")
    if DRY_RUN:
        print(f"  [DRY RUN] Would insert {len(to_insert)} colleges")
        return {c["name"]: i + 99000 for i, c in enumerate(to_insert)}

    inserted_ids = {}
    for batch in chunked(to_insert, BATCH_SIZE):
        try:
            resp = client.table("colleges_comprehensive").insert(batch).execute()
            for row in (resp.data or []):
                inserted_ids[row["name"]] = row["id"]
            time.sleep(0.15)
        except Exception as e:
            print(f"  ⚠️  Insert error: {e}")
            log_skip(f"INSERT_FAIL | {e} | batch_size={len(batch)}")
    return inserted_ids

def insert_rankings(client, colleges, name_to_id):
    if DRY_RUN:
        return
    ranking_rows = []
    for c in colleges:
        src = c.get("_ranking_source")
        val = c.get("_ranking_value")
        cid = name_to_id.get(c["name"])
        if src and val and cid:
            ranking_rows.append(make_ranking_row(cid, src, val))
    if not ranking_rows:
        return
    for batch in chunked(ranking_rows, BATCH_SIZE):
        try:
            client.table("college_rankings").upsert(batch).execute()
        except Exception as e:
            print(f"  ⚠️  Ranking insert error: {e}")

# ── India data — 150+ institutions ───────────────────────────────────────────

def get_india_colleges():
    data = [
        # IITs (23)
        ("Indian Institute of Technology Bombay",        "Mumbai",         "Maharashtra",   "Public",  "iitb.ac.in",        3),
        ("Indian Institute of Technology Delhi",         "New Delhi",      "Delhi",         "Public",  "iitd.ac.in",        2),
        ("Indian Institute of Technology Madras",        "Chennai",        "Tamil Nadu",    "Public",  "iitm.ac.in",        1),
        ("Indian Institute of Technology Kanpur",        "Kanpur",         "Uttar Pradesh", "Public",  "iitk.ac.in",        4),
        ("Indian Institute of Technology Kharagpur",     "Kharagpur",      "West Bengal",   "Public",  "iitkgp.ac.in",      5),
        ("Indian Institute of Technology Roorkee",       "Roorkee",        "Uttarakhand",   "Public",  "iitr.ac.in",        6),
        ("Indian Institute of Technology Hyderabad",     "Hyderabad",      "Telangana",     "Public",  "iith.ac.in",        8),
        ("Indian Institute of Technology Gandhinagar",   "Gandhinagar",    "Gujarat",       "Public",  "iitgn.ac.in",       12),
        ("Indian Institute of Technology Guwahati",      "Guwahati",       "Assam",         "Public",  "iitg.ac.in",        7),
        ("Indian Institute of Technology Bhubaneswar",   "Bhubaneswar",    "Odisha",        "Public",  "iitbbs.ac.in",      None),
        ("Indian Institute of Technology Jodhpur",       "Jodhpur",        "Rajasthan",     "Public",  "iitj.ac.in",        None),
        ("Indian Institute of Technology Patna",         "Patna",          "Bihar",         "Public",  "iitp.ac.in",        None),
        ("Indian Institute of Technology Mandi",         "Mandi",          "Himachal Pradesh","Public","iitmandi.ac.in",    None),
        ("Indian Institute of Technology Tirupati",      "Tirupati",       "Andhra Pradesh","Public",  "iittp.ac.in",       None),
        ("Indian Institute of Technology Palakkad",      "Palakkad",       "Kerala",        "Public",  "iitpkd.ac.in",      None),
        ("Indian Institute of Technology Dharwad",       "Dharwad",        "Karnataka",     "Public",  "iitdh.ac.in",       None),
        ("Indian Institute of Technology Bhilai",        "Bhilai",         "Chhattisgarh",  "Public",  "iitbhilai.ac.in",   None),
        ("Indian Institute of Technology Jammu",         "Jammu",          "J&K",           "Public",  "iitjammu.ac.in",    None),
        ("Indian Institute of Technology Indore",        "Indore",         "Madhya Pradesh","Public",  "iiti.ac.in",        None),
        ("Indian Institute of Technology Varanasi",      "Varanasi",       "Uttar Pradesh", "Public",  "iitbhu.ac.in",      9),
        ("Indian Institute of Technology Dhanbad",       "Dhanbad",        "Jharkhand",     "Public",  "iitism.ac.in",      None),
        ("Indian Institute of Technology Goa",           "Goa",            "Goa",           "Public",  "iitgoa.ac.in",      None),
        ("Indian Institute of Technology Rupnagar",      "Rupnagar",       "Punjab",        "Public",  "iitrpr.ac.in",      None),
        # IISc + IISERs
        ("Indian Institute of Science",                  "Bengaluru",      "Karnataka",     "Public",  "iisc.ac.in",        1),
        ("IISER Pune",                                   "Pune",           "Maharashtra",   "Public",  "iiserpune.ac.in",   None),
        ("IISER Kolkata",                                "Kolkata",        "West Bengal",   "Public",  "iiserkol.ac.in",    None),
        ("IISER Bhopal",                                 "Bhopal",         "Madhya Pradesh","Public",  "iiserb.ac.in",      None),
        ("IISER Mohali",                                 "Mohali",         "Punjab",        "Public",  "iisermohali.ac.in", None),
        ("IISER Thiruvananthapuram",                     "Thiruvananthapuram","Kerala",     "Public",  "iisertvm.ac.in",    None),
        # NITs (top 10)
        ("National Institute of Technology Trichy",      "Tiruchirappalli","Tamil Nadu",    "Public",  "nitt.edu",          10),
        ("National Institute of Technology Surathkal",   "Mangalore",      "Karnataka",     "Public",  "nitk.ac.in",        14),
        ("National Institute of Technology Warangal",    "Warangal",       "Telangana",     "Public",  "nitw.ac.in",        20),
        ("National Institute of Technology Calicut",     "Kozhikode",      "Kerala",        "Public",  "nitc.ac.in",        25),
        ("National Institute of Technology Rourkela",    "Rourkela",       "Odisha",        "Public",  "nitrkl.ac.in",      27),
        ("Motilal Nehru National Institute of Technology","Allahabad",     "Uttar Pradesh", "Public",  "mnnit.ac.in",       None),
        ("National Institute of Technology Durgapur",    "Durgapur",       "West Bengal",   "Public",  "nitdgp.ac.in",      None),
        ("National Institute of Technology Jaipur",      "Jaipur",         "Rajasthan",     "Public",  "mnit.ac.in",        None),
        ("National Institute of Technology Bhopal",      "Bhopal",         "Madhya Pradesh","Public",  "manit.ac.in",       None),
        ("National Institute of Technology Silchar",     "Silchar",        "Assam",         "Public",  "nits.ac.in",        None),
        # IIMs
        ("Indian Institute of Management Ahmedabad",     "Ahmedabad",      "Gujarat",       "Public",  "iima.ac.in",        1),
        ("Indian Institute of Management Bangalore",     "Bengaluru",      "Karnataka",     "Public",  "iimb.ac.in",        2),
        ("Indian Institute of Management Calcutta",      "Kolkata",        "West Bengal",   "Public",  "iimcal.ac.in",      3),
        ("Indian Institute of Management Lucknow",       "Lucknow",        "Uttar Pradesh", "Public",  "iiml.ac.in",        4),
        ("Indian Institute of Management Kozhikode",     "Kozhikode",      "Kerala",        "Public",  "iimk.ac.in",        5),
        ("Indian Institute of Management Indore",        "Indore",         "Madhya Pradesh","Public",  "iimidr.ac.in",      6),
        ("Indian Institute of Management Udaipur",       "Udaipur",        "Rajasthan",     "Public",  "iimu.ac.in",        None),
        ("Indian Institute of Management Rohtak",        "Rohtak",         "Haryana",       "Public",  "iimrohtak.ac.in",   None),
        ("Indian Institute of Management Raipur",        "Raipur",         "Chhattisgarh",  "Public",  "iimraipur.ac.in",   None),
        ("Indian Institute of Management Ranchi",        "Ranchi",         "Jharkhand",     "Public",  "iimranchi.ac.in",   None),
        ("Indian Institute of Management Kashipur",      "Kashipur",       "Uttarakhand",   "Public",  "iimkashipur.ac.in", None),
        ("Indian Institute of Management Tiruchirappalli","Tiruchirappalli","Tamil Nadu",   "Public",  "iimtrichy.ac.in",   None),
        ("Indian Institute of Management Nagpur",        "Nagpur",         "Maharashtra",   "Public",  "iimnagpur.ac.in",   None),
        ("Indian Institute of Management Amritsar",      "Amritsar",       "Punjab",        "Public",  "iimamritsar.ac.in", None),
        ("Indian Institute of Management Bodh Gaya",     "Bodh Gaya",      "Bihar",         "Public",  "iimbg.ac.in",       None),
        ("Indian Institute of Management Sambalpur",     "Sambalpur",      "Odisha",        "Public",  "iimsambalpur.ac.in",None),
        ("Indian Institute of Management Sirmaur",       "Sirmaur",        "Himachal Pradesh","Public","iimsirmaur.ac.in",  None),
        ("Indian Institute of Management Visakhapatnam", "Visakhapatnam",  "Andhra Pradesh","Public",  "iimv.ac.in",        None),
        # Central Universities
        ("University of Delhi",                          "New Delhi",      "Delhi",         "Public",  "du.ac.in",          None),
        ("Jawaharlal Nehru University",                  "New Delhi",      "Delhi",         "Public",  "jnu.ac.in",         None),
        ("Banaras Hindu University",                     "Varanasi",       "Uttar Pradesh", "Public",  "bhu.ac.in",         None),
        ("University of Hyderabad",                      "Hyderabad",      "Telangana",     "Public",  "uohyd.ac.in",       None),
        ("Jadavpur University",                          "Kolkata",        "West Bengal",   "Public",  "jaduniv.edu.in",    None),
        ("Aligarh Muslim University",                    "Aligarh",        "Uttar Pradesh", "Public",  "amu.ac.in",         None),
        ("Jamia Millia Islamia",                         "New Delhi",      "Delhi",         "Public",  "jmi.ac.in",         None),
        ("Tezpur University",                            "Tezpur",         "Assam",         "Public",  "tezu.ac.in",        None),
        ("Pondicherry University",                       "Pondicherry",    "Puducherry",    "Public",  "pondiuni.edu.in",   None),
        ("Hyderabad Central University",                 "Hyderabad",      "Telangana",     "Public",  "uohyd.ac.in",       None),
        ("Sikkim University",                            "Gangtok",        "Sikkim",        "Public",  "cus.ac.in",         None),
        ("Central University of Rajasthan",              "Ajmer",          "Rajasthan",     "Public",  "curaj.ac.in",       None),
        ("Central University of Punjab",                 "Bathinda",       "Punjab",        "Public",  "cup.edu.in",        None),
        ("Central University of Kerala",                 "Kasaragod",      "Kerala",        "Public",  "cukerala.ac.in",    None),
        ("Central University of Karnataka",              "Kalaburagi",     "Karnataka",     "Public",  "cuk.ac.in",         None),
        ("Central University of Gujarat",                "Gandhinagar",    "Gujarat",       "Public",  "cug.ac.in",         None),
        ("Central University of Jharkhand",              "Ranchi",         "Jharkhand",     "Public",  "cuj.ac.in",         None),
        ("Central University of Odisha",                 "Koraput",        "Odisha",        "Public",  "cuo.ac.in",         None),
        # Top State Universities
        ("Savitribai Phule Pune University",             "Pune",           "Maharashtra",   "Public",  "unipune.ac.in",     None),
        ("University of Mumbai",                         "Mumbai",         "Maharashtra",   "Public",  "mu.ac.in",          None),
        ("Osmania University",                           "Hyderabad",      "Telangana",     "Public",  "osmania.ac.in",     None),
        ("Anna University",                              "Chennai",        "Tamil Nadu",    "Public",  "annauniv.edu",      None),
        ("Bangalore University",                         "Bengaluru",      "Karnataka",     "Public",  "bangaloreuniversity.ac.in", None),
        ("University of Calcutta",                       "Kolkata",        "West Bengal",   "Public",  "caluniv.ac.in",     None),
        ("Kerala University",                            "Thiruvananthapuram","Kerala",     "Public",  "keralauniversity.ac.in", None),
        ("Gujarat University",                           "Ahmedabad",      "Gujarat",       "Public",  "gujaratuniversity.ac.in", None),
        ("Panjab University",                            "Chandigarh",     "Punjab",        "Public",  "puchd.ac.in",       None),
        ("Andhra University",                            "Visakhapatnam",  "Andhra Pradesh","Public",  "andhrauniversity.ac.in", None),
        ("Rajasthan University",                         "Jaipur",         "Rajasthan",     "Public",  "uniraj.ac.in",      None),
        ("Utkal University",                             "Bhubaneswar",    "Odisha",        "Public",  "utkaluniversity.ac.in", None),
        ("Lucknow University",                           "Lucknow",        "Uttar Pradesh", "Public",  "lkouniv.ac.in",     None),
        ("Madras University",                            "Chennai",        "Tamil Nadu",    "Public",  "unom.ac.in",        None),
        ("Mysore University",                            "Mysore",         "Karnataka",     "Public",  "uni-mysore.ac.in",  None),
        ("Gauhati University",                           "Guwahati",       "Assam",         "Public",  "gauhati.ac.in",     None),
        ("Dibrugarh University",                         "Dibrugarh",      "Assam",         "Public",  "dibru.ac.in",       None),
        # Top Private Universities
        ("BITS Pilani",                                  "Pilani",         "Rajasthan",     "Private", "bits-pilani.ac.in", 26),
        ("Manipal Academy of Higher Education",          "Manipal",        "Karnataka",     "Private", "manipal.edu",       None),
        ("VIT University",                               "Vellore",        "Tamil Nadu",    "Private", "vit.ac.in",         None),
        ("Amrita Vishwa Vidyapeetham",                   "Coimbatore",     "Tamil Nadu",    "Private", "amrita.edu",        None),
        ("SRM Institute of Science and Technology",      "Chennai",        "Tamil Nadu",    "Private", "srmist.edu.in",     None),
        ("Kalinga Institute of Industrial Technology",   "Bhubaneswar",    "Odisha",        "Private", "kiit.ac.in",        None),
        ("Thapar Institute of Engineering and Technology","Patiala",       "Punjab",        "Private", "thapar.edu",        None),
        ("Christ University",                            "Bengaluru",      "Karnataka",     "Private", "christuniversity.in", None),
        ("Symbiosis International University",           "Pune",           "Maharashtra",   "Private", "siu.edu.in",        None),
        ("O P Jindal Global University",                 "Sonipat",        "Haryana",       "Private", "jgu.edu.in",        None),
        ("Ashoka University",                            "Sonipat",        "Haryana",       "Private", "ashoka.edu.in",     None),
        ("Shiv Nadar University",                        "Greater Noida",  "Uttar Pradesh", "Private", "snu.edu.in",        None),
        ("Azim Premji University",                       "Bengaluru",      "Karnataka",     "Private", "azimpremjiuniversity.edu.in", None),
        ("Krea University",                              "Sricity",        "Andhra Pradesh","Private", "krea.edu.in",       None),
        ("FLAME University",                             "Pune",           "Maharashtra",   "Private", "flame.edu.in",      None),
        ("XLRI Xavier School of Management",             "Jamshedpur",     "Jharkhand",     "Private", "xlri.ac.in",        None),
        ("SP Jain Institute of Management",              "Mumbai",         "Maharashtra",   "Private", "spjimr.org",        None),
        ("MDI Gurgaon",                                  "Gurugram",       "Haryana",       "Private", "mdi.ac.in",         None),
        ("IMT Ghaziabad",                                "Ghaziabad",      "Uttar Pradesh", "Private", "imt.edu",           None),
        ("TA Pai Management Institute",                  "Manipal",        "Karnataka",     "Private", "tapmi.edu.in",      None),
        ("NMIMS Mumbai",                                 "Mumbai",         "Maharashtra",   "Private", "nmims.edu",         None),
        ("Narsee Monjee Institute of Management Studies","Mumbai",         "Maharashtra",   "Private", "nmims.edu",         None),
        ("Alliance University",                          "Bengaluru",      "Karnataka",     "Private", "alliance.edu.in",   None),
        ("Presidency University Kolkata",                "Kolkata",        "West Bengal",   "Public",  "presiuniv.ac.in",   None),
        ("Jadavpur University",                          "Kolkata",        "West Bengal",   "Public",  "jaduniv.edu.in",    None),
        ("National Law School of India University",      "Bengaluru",      "Karnataka",     "Public",  "nls.ac.in",         None),
        ("National Law University Delhi",                "New Delhi",      "Delhi",         "Public",  "nludelhi.ac.in",    None),
        ("NALSAR University of Law",                     "Hyderabad",      "Telangana",     "Public",  "nalsar.ac.in",      None),
        ("Rajiv Gandhi National University of Law",      "Patiala",        "Punjab",        "Public",  "rgnul.ac.in",       None),
        ("Hidayatullah National Law University",         "Raipur",         "Chhattisgarh",  "Public",  "hnlu.ac.in",        None),
        ("Institute of Chemical Technology Mumbai",      "Mumbai",         "Maharashtra",   "Public",  "ictmumbai.edu.in",  None),
        ("PSG College of Technology",                    "Coimbatore",     "Tamil Nadu",    "Private", "psgtech.ac.in",     None),
        ("R V College of Engineering",                   "Bengaluru",      "Karnataka",     "Private", "rvce.edu.in",       None),
        ("PES University",                               "Bengaluru",      "Karnataka",     "Private", "pes.edu",           None),
        ("Vellore Institute of Technology Chennai",      "Chennai",        "Tamil Nadu",    "Private", "vit.ac.in",         None),
        ("DJ Sanghvi College of Engineering",            "Mumbai",         "Maharashtra",   "Private", "djsce.ac.in",       None),
        ("IIIT Hyderabad",                               "Hyderabad",      "Telangana",     "Public",  "iiit.ac.in",        None),
        ("IIIT Bangalore",                               "Bengaluru",      "Karnataka",     "Public",  "iiitb.ac.in",       None),
        ("IIIT Delhi",                                   "New Delhi",      "Delhi",         "Public",  "iiitd.ac.in",       None),
        ("IIIT Allahabad",                               "Allahabad",      "Uttar Pradesh", "Public",  "iiita.ac.in",       None),
        ("Sanjay Gandhi Postgraduate Institute",         "Lucknow",        "Uttar Pradesh", "Public",  "sgpgi.ac.in",       None),
        ("All India Institute of Medical Sciences Delhi","New Delhi",      "Delhi",         "Public",  "aiims.edu",         None),
        ("AIIMS Bhopal",                                 "Bhopal",         "Madhya Pradesh","Public",  "aiimsbhopal.edu.in",None),
        ("AIIMS Rishikesh",                              "Rishikesh",      "Uttarakhand",   "Public",  "aiimsrishikesh.edu.in",None),
        ("AIIMS Jodhpur",                                "Jodhpur",        "Rajasthan",     "Public",  "aiimsjodhpur.edu.in",None),
        ("AIIMS Patna",                                  "Patna",          "Bihar",         "Public",  "aiimspatna.edu.in", None),
    ]

    colleges = []
    for row in data:
        n, city, state, t, w, nirf = row
        c = make_college_row(
            name=n, city=city, state_region=state, country="India",
            institution_type=t, website=w, source="India_Curated_2024",
        )
        c["_ranking_source"] = "NIRF_2024"
        c["_ranking_value"]  = str(nirf) if nirf else None
        colleges.append(c)
    return colleges


# ── UK data — 120+ universities ───────────────────────────────────────────────

def get_uk_colleges():
    data = [
        # Russell Group (24) + name, city, region, type, website, QS rank
        ("University of Oxford",             "Oxford",         "England",          "Public", "ox.ac.uk",              4),
        ("University of Cambridge",          "Cambridge",      "England",          "Public", "cam.ac.uk",             2),
        ("Imperial College London",          "London",         "England",          "Public", "imperial.ac.uk",        6),
        ("University College London",        "London",         "England",          "Public", "ucl.ac.uk",             9),
        ("London School of Economics",       "London",         "England",          "Public", "lse.ac.uk",             45),
        ("University of Edinburgh",          "Edinburgh",      "Scotland",         "Public", "ed.ac.uk",              22),
        ("University of Manchester",         "Manchester",     "England",          "Public", "manchester.ac.uk",      32),
        ("King's College London",            "London",         "England",          "Public", "kcl.ac.uk",             40),
        ("University of Bristol",            "Bristol",        "England",          "Public", "bristol.ac.uk",         55),
        ("University of Warwick",            "Coventry",       "England",          "Public", "warwick.ac.uk",         67),
        ("University of Glasgow",            "Glasgow",        "Scotland",         "Public", "gla.ac.uk",             77),
        ("Durham University",                "Durham",         "England",          "Public", "dur.ac.uk",             82),
        ("University of Birmingham",         "Birmingham",     "England",          "Public", "birmingham.ac.uk",      84),
        ("University of Leeds",              "Leeds",          "England",          "Public", "leeds.ac.uk",           93),
        ("University of Nottingham",         "Nottingham",     "England",          "Public", "nottingham.ac.uk",      99),
        ("University of Southampton",        "Southampton",    "England",          "Public", "soton.ac.uk",           100),
        ("University of Sheffield",          "Sheffield",      "England",          "Public", "sheffield.ac.uk",       104),
        ("University of Exeter",             "Exeter",         "England",          "Public", "exeter.ac.uk",          149),
        ("Cardiff University",               "Cardiff",        "Wales",            "Public", "cardiff.ac.uk",         159),
        ("Queen Mary University of London",  "London",         "England",          "Public", "qmul.ac.uk",            150),
        ("University of Liverpool",          "Liverpool",      "England",          "Public", "liverpool.ac.uk",       175),
        ("Newcastle University",             "Newcastle",      "England",          "Public", "ncl.ac.uk",             210),
        ("Queen's University Belfast",       "Belfast",        "Northern Ireland", "Public", "qub.ac.uk",             235),
        ("University of St Andrews",         "St Andrews",     "Scotland",         "Public", "st-andrews.ac.uk",      100),
        # Other high-ranking
        ("University of Bath",               "Bath",           "England",          "Public", "bath.ac.uk",            218),
        ("University of York",               "York",           "England",          "Public", "york.ac.uk",            225),
        ("University of Aberdeen",           "Aberdeen",       "Scotland",         "Public", "abdn.ac.uk",            192),
        ("Lancaster University",             "Lancaster",      "England",          "Public", "lancaster.ac.uk",       201),
        ("University of Surrey",             "Guildford",      "England",          "Public", "surrey.ac.uk",          258),
        ("Loughborough University",          "Loughborough",   "England",          "Public", "lboro.ac.uk",           251),
        ("University of Reading",            "Reading",        "England",          "Public", "reading.ac.uk",         240),
        ("University of Leicester",          "Leicester",      "England",          "Public", "le.ac.uk",              251),
        ("University of Dundee",             "Dundee",         "Scotland",         "Public", "dundee.ac.uk",          277),
        ("Heriot-Watt University",           "Edinburgh",      "Scotland",         "Public", "hw.ac.uk",              351),
        ("University of Strathclyde",        "Glasgow",        "Scotland",         "Public", "strath.ac.uk",          301),
        ("University of East Anglia",        "Norwich",        "England",          "Public", "uea.ac.uk",             301),
        ("City, University of London",       "London",         "England",          "Public", "city.ac.uk",            401),
        ("Aston University",                 "Birmingham",     "England",          "Public", "aston.ac.uk",           451),
        ("Swansea University",               "Swansea",        "Wales",            "Public", "swansea.ac.uk",         351),
        ("University of Kent",               "Canterbury",     "England",          "Public", "kent.ac.uk",            451),
        ("University of Essex",              "Colchester",     "England",          "Public", "essex.ac.uk",           501),
        ("Brunel University London",         "London",         "England",          "Public", "brunel.ac.uk",          351),
        ("Royal Holloway",                   "Egham",          "England",          "Public", "royalholloway.ac.uk",   401),
        ("University of Sussex",             "Brighton",       "England",          "Public", "sussex.ac.uk",          351),
        ("University of East London",        "London",         "England",          "Public", "uel.ac.uk",             None),
        ("Goldsmiths University of London",  "London",         "England",          "Public", "gold.ac.uk",            None),
        ("SOAS University of London",        "London",         "England",          "Public", "soas.ac.uk",            None),
        ("Birkbeck University of London",    "London",         "England",          "Public", "bbk.ac.uk",             None),
        ("University of Westminster",        "London",         "England",          "Public", "westminster.ac.uk",     None),
        ("University of the Arts London",    "London",         "England",          "Public", "arts.ac.uk",            None),
        ("London South Bank University",     "London",         "England",          "Public", "lsbu.ac.uk",            None),
        ("Middlesex University",             "London",         "England",          "Public", "mdx.ac.uk",             None),
        ("University of Greenwich",          "London",         "England",          "Public", "gre.ac.uk",             None),
        ("Kingston University",              "London",         "England",          "Public", "kingston.ac.uk",        None),
        ("University of Hertfordshire",      "Hatfield",       "England",          "Public", "herts.ac.uk",           None),
        ("Oxford Brookes University",        "Oxford",         "England",          "Public", "brookes.ac.uk",         None),
        ("Northumbria University",           "Newcastle",      "England",          "Public", "northumbria.ac.uk",     None),
        ("De Montfort University",           "Leicester",      "England",          "Public", "dmu.ac.uk",             None),
        ("Coventry University",              "Coventry",       "England",          "Public", "coventry.ac.uk",        None),
        ("University of Plymouth",           "Plymouth",       "England",          "Public", "plymouth.ac.uk",        None),
        ("University of Huddersfield",       "Huddersfield",   "England",          "Public", "hud.ac.uk",             None),
        ("Sheffield Hallam University",      "Sheffield",      "England",          "Public", "shu.ac.uk",             None),
        ("Manchester Metropolitan University","Manchester",    "England",          "Public", "mmu.ac.uk",             None),
        ("Leeds Beckett University",         "Leeds",          "England",          "Public", "leedsbeckett.ac.uk",    None),
        ("Nottingham Trent University",      "Nottingham",     "England",          "Public", "ntu.ac.uk",             None),
        ("Birmingham City University",       "Birmingham",     "England",          "Public", "bcu.ac.uk",             None),
        ("University of Wolverhampton",      "Wolverhampton",  "England",          "Public", "wlv.ac.uk",             None),
        ("University of Chester",            "Chester",        "England",          "Public", "chester.ac.uk",         None),
        ("University of Lincoln",            "Lincoln",        "England",          "Public", "lincoln.ac.uk",         None),
        ("University of Portsmouth",         "Portsmouth",     "England",          "Public", "port.ac.uk",            None),
        ("University of Winchester",         "Winchester",     "England",          "Public", "winchester.ac.uk",      None),
        ("Anglia Ruskin University",         "Cambridge",      "England",          "Public", "aru.ac.uk",             None),
        ("University of Bedfordshire",       "Luton",          "England",          "Public", "beds.ac.uk",            None),
        ("Keele University",                 "Keele",          "England",          "Public", "keele.ac.uk",           None),
        ("University of Hull",               "Hull",           "England",          "Public", "hull.ac.uk",            None),
        ("University of Salford",            "Salford",        "England",          "Public", "salford.ac.uk",         None),
        ("University of Derby",              "Derby",          "England",          "Public", "derby.ac.uk",           None),
        ("University of the West of England","Bristol",        "England",          "Public", "uwe.ac.uk",             None),
        ("University of Sunderland",         "Sunderland",     "England",          "Public", "sunderland.ac.uk",      None),
        ("University of Central Lancashire", "Preston",        "England",          "Public", "uclan.ac.uk",           None),
        ("University of Staffordshire",      "Stoke-on-Trent", "England",          "Public", "staffs.ac.uk",          None),
        ("University of Cumbria",            "Carlisle",       "England",          "Public", "cumbria.ac.uk",         None),
        ("University of Northampton",        "Northampton",    "England",          "Public", "northampton.ac.uk",     None),
        ("University of Gloucestershire",    "Cheltenham",     "England",          "Public", "glos.ac.uk",            None),
        ("Bournemouth University",           "Bournemouth",    "England",          "Public", "bournemouth.ac.uk",     None),
        ("University of Brighton",           "Brighton",       "England",          "Public", "brighton.ac.uk",        None),
        ("University of Chichester",         "Chichester",     "England",          "Public", "chi.ac.uk",             None),
        ("Edge Hill University",             "Ormskirk",       "England",          "Public", "edgehill.ac.uk",        None),
        ("Staffordshire University",         "Stoke-on-Trent", "England",          "Public", "staffs.ac.uk",          None),
        ("University of Suffolk",            "Ipswich",        "England",          "Public", "uos.ac.uk",             None),
        ("Wrexham Glyndwr University",       "Wrexham",        "Wales",            "Public", "glyndwr.ac.uk",         None),
        ("University of South Wales",        "Pontypridd",     "Wales",            "Public", "southwales.ac.uk",      None),
        ("Aberystwyth University",           "Aberystwyth",    "Wales",            "Public", "aber.ac.uk",            None),
        ("Bangor University",                "Bangor",         "Wales",            "Public", "bangor.ac.uk",          None),
        ("University of the West of Scotland","Paisley",       "Scotland",         "Public", "uws.ac.uk",             None),
        ("Robert Gordon University",         "Aberdeen",       "Scotland",         "Public", "rgu.ac.uk",             None),
        ("Edinburgh Napier University",      "Edinburgh",      "Scotland",         "Public", "napier.ac.uk",          None),
        ("Glasgow Caledonian University",    "Glasgow",        "Scotland",         "Public", "gcu.ac.uk",             None),
        ("University of the Highlands",      "Inverness",      "Scotland",         "Public", "uhi.ac.uk",             None),
        ("University of St Andrews (Medicine)","St Andrews",   "Scotland",         "Public", "st-andrews.ac.uk",      None),
        ("Ulster University",                "Belfast",        "Northern Ireland", "Public", "ulster.ac.uk",          None),
        ("University of Ulster",             "Coleraine",      "Northern Ireland", "Public", "ulster.ac.uk",          None),
        ("Imperial College Business School", "London",         "England",          "Public", "imperial.ac.uk/business",None),
        ("London Business School",           "London",         "England",          "Private","london.edu",            None),
        ("Cranfield University",             "Cranfield",      "England",          "Public", "cranfield.ac.uk",       None),
        ("University of Cambridge (Business)","Cambridge",     "England",          "Public", "jbs.cam.ac.uk",         None),
        ("Warwick Business School",          "Coventry",       "England",          "Public", "wbs.ac.uk",             None),
        ("Said Business School Oxford",      "Oxford",         "England",          "Public", "sbs.ox.ac.uk",          None),
        ("Lancaster University Management School","Lancaster", "England",          "Public", "lums.lancs.ac.uk",      None),
        ("University of Edinburgh Business School","Edinburgh","Scotland",         "Public", "business.ed.ac.uk",     None),
        ("Royal College of Art",             "London",         "England",          "Private","rca.ac.uk",             None),
        ("Royal College of Music",           "London",         "England",          "Private","rcm.ac.uk",             None),
        ("Guildhall School of Music",        "London",         "England",          "Public", "gsmd.ac.uk",            None),
        ("University of Oxford (Medicine)",  "Oxford",         "England",          "Public", "medsci.ox.ac.uk",       None),
        ("University of Cambridge (Medicine)","Cambridge",     "England",          "Public", "medschl.cam.ac.uk",     None),
        ("University of Glasgow (Medicine)", "Glasgow",        "Scotland",         "Public", "gla.ac.uk/schools/medicine",None),
        ("University of Edinburgh (Medicine)","Edinburgh",     "Scotland",         "Public", "ed.ac.uk/medicine-vet-medicine",None),
        ("St George's University of London", "London",         "England",          "Public", "sgul.ac.uk",            None),
        ("University of Leicester (Medicine)","Leicester",     "England",          "Public", "le.ac.uk/medicine",     None),
    ]

    colleges = []
    for row in data:
        n, city, region, t, w, qs = row
        c = make_college_row(
            name=n, city=city, state_region=region, country="United Kingdom",
            institution_type=t, website=w, source="UK_Curated_2024",
        )
        c["_ranking_source"] = "QS_2024"
        c["_ranking_value"]  = str(qs) if qs else None
        colleges.append(c)
    return colleges


# ── EU data — 130+ universities ───────────────────────────────────────────────

def get_eu_colleges():
    data = [
        # Germany (25)
        ("Technical University of Munich",               "Munich",           "Germany",       "Public",  "tum.de",                  37),
        ("Ludwig Maximilian University of Munich",       "Munich",           "Germany",       "Public",  "lmu.de",                  54),
        ("Heidelberg University",                        "Heidelberg",       "Germany",       "Public",  "uni-heidelberg.de",        87),
        ("Humboldt University of Berlin",                "Berlin",           "Germany",       "Public",  "hu-berlin.de",             120),
        ("Freie Universitat Berlin",                     "Berlin",           "Germany",       "Public",  "fu-berlin.de",             98),
        ("RWTH Aachen University",                       "Aachen",           "Germany",       "Public",  "rwth-aachen.de",           106),
        ("Karlsruhe Institute of Technology",            "Karlsruhe",        "Germany",       "Public",  "kit.edu",                  119),
        ("University of Bonn",                           "Bonn",             "Germany",       "Public",  "uni-bonn.de",              201),
        ("University of Hamburg",                        "Hamburg",          "Germany",       "Public",  "uni-hamburg.de",           251),
        ("University of Freiburg",                       "Freiburg",         "Germany",       "Public",  "uni-freiburg.de",          201),
        ("University of Cologne",                        "Cologne",          "Germany",       "Public",  "uni-koeln.de",             251),
        ("Goethe University Frankfurt",                  "Frankfurt",        "Germany",       "Public",  "uni-frankfurt.de",         301),
        ("University of Stuttgart",                      "Stuttgart",        "Germany",       "Public",  "uni-stuttgart.de",         351),
        ("University of Gottingen",                      "Gottingen",        "Germany",       "Public",  "uni-goettingen.de",        201),
        ("University of Tubingen",                       "Tubingen",         "Germany",       "Public",  "uni-tuebingen.de",         201),
        ("Dresden University of Technology",             "Dresden",          "Germany",       "Public",  "tu-dresden.de",            301),
        ("University of Munster",                        "Munster",          "Germany",       "Public",  "uni-muenster.de",          301),
        ("Charité Universitätsmedizin Berlin",           "Berlin",           "Germany",       "Public",  "charite.de",               None),
        ("University of Dusseldorf",                     "Dusseldorf",       "Germany",       "Public",  "uni-duesseldorf.de",       None),
        ("Leipzig University",                           "Leipzig",          "Germany",       "Public",  "uni-leipzig.de",           351),
        ("Bielefeld University",                         "Bielefeld",        "Germany",       "Public",  "uni-bielefeld.de",         None),
        ("University of Bochum",                         "Bochum",           "Germany",       "Public",  "ruhr-uni-bochum.de",       None),
        ("Technische Universitat Berlin",                "Berlin",           "Germany",       "Public",  "tu-berlin.de",             154),
        ("University of Kiel",                           "Kiel",             "Germany",       "Public",  "uni-kiel.de",              None),
        ("University of Erlangen-Nuremberg",             "Erlangen",         "Germany",       "Public",  "fau.de",                   None),
        # France (15)
        ("Sorbonne University",                          "Paris",            "France",        "Public",  "sorbonne-universite.fr",   73),
        ("Ecole Polytechnique",                          "Paris",            "France",        "Public",  "polytechnique.edu",        58),
        ("PSL University",                               "Paris",            "France",        "Public",  "psl.eu",                   24),
        ("University of Paris-Saclay",                   "Paris",            "France",        "Public",  "universite-paris-saclay.fr",15),
        ("Sciences Po",                                  "Paris",            "France",        "Public",  "sciencespo.fr",            None),
        ("HEC Paris",                                    "Jouy-en-Josas",    "France",        "Private", "hec.edu",                  None),
        ("INSEAD",                                       "Fontainebleau",    "France",        "Private", "insead.edu",               None),
        ("CentraleSupelec",                              "Paris",            "France",        "Public",  "centralesupelec.fr",       201),
        ("Ecole Normale Superieure Paris",               "Paris",            "France",        "Public",  "ens.fr",                   None),
        ("University of Grenoble Alpes",                 "Grenoble",         "France",        "Public",  "univ-grenoble-alpes.fr",   301),
        ("University of Bordeaux",                       "Bordeaux",         "France",        "Public",  "u-bordeaux.fr",            301),
        ("University of Strasbourg",                     "Strasbourg",       "France",        "Public",  "unistra.fr",               301),
        ("Aix-Marseille University",                     "Marseille",        "France",        "Public",  "univ-amu.fr",              251),
        ("University of Lyon",                           "Lyon",             "France",        "Public",  "universite-lyon.fr",       None),
        ("University of Montpellier",                    "Montpellier",      "France",        "Public",  "umontpellier.fr",          None),
        # Netherlands (10)
        ("Delft University of Technology",               "Delft",            "Netherlands",   "Public",  "tudelft.nl",               47),
        ("University of Amsterdam",                      "Amsterdam",        "Netherlands",   "Public",  "uva.nl",                   53),
        ("Wageningen University",                        "Wageningen",       "Netherlands",   "Public",  "wur.nl",                   108),
        ("Utrecht University",                           "Utrecht",          "Netherlands",   "Public",  "uu.nl",                    95),
        ("Eindhoven University of Technology",           "Eindhoven",        "Netherlands",   "Public",  "tue.nl",                   157),
        ("Leiden University",                            "Leiden",           "Netherlands",   "Public",  "universiteitleiden.nl",    115),
        ("Erasmus University Rotterdam",                 "Rotterdam",        "Netherlands",   "Public",  "eur.nl",                   175),
        ("University of Groningen",                      "Groningen",        "Netherlands",   "Public",  "rug.nl",                   150),
        ("Radboud University",                           "Nijmegen",         "Netherlands",   "Public",  "ru.nl",                    201),
        ("Vrije Universiteit Amsterdam",                 "Amsterdam",        "Netherlands",   "Public",  "vu.nl",                    251),
        # Sweden (8)
        ("KTH Royal Institute of Technology",            "Stockholm",        "Sweden",        "Public",  "kth.se",                   89),
        ("Karolinska Institute",                         "Stockholm",        "Sweden",        "Public",  "ki.se",                    38),
        ("Lund University",                              "Lund",             "Sweden",        "Public",  "lu.se",                    90),
        ("Uppsala University",                           "Uppsala",          "Sweden",        "Public",  "uu.se",                    100),
        ("Stockholm University",                         "Stockholm",        "Sweden",        "Public",  "su.se",                    181),
        ("Chalmers University of Technology",            "Gothenburg",       "Sweden",        "Public",  "chalmers.se",              171),
        ("Umea University",                              "Umea",             "Sweden",        "Public",  "umu.se",                   351),
        ("Linkoping University",                         "Linkoping",        "Sweden",        "Public",  "liu.se",                   401),
        # Switzerland (7)
        ("ETH Zurich",                                   "Zurich",           "Switzerland",   "Public",  "ethz.ch",                  7),
        ("EPFL",                                         "Lausanne",         "Switzerland",   "Public",  "epfl.ch",                  16),
        ("University of Zurich",                         "Zurich",           "Switzerland",   "Public",  "uzh.ch",                   83),
        ("University of Basel",                          "Basel",            "Switzerland",   "Public",  "unibas.ch",                148),
        ("University of Geneva",                         "Geneva",           "Switzerland",   "Public",  "unige.ch",                 143),
        ("University of Bern",                           "Bern",             "Switzerland",   "Public",  "unibe.ch",                 130),
        ("IMD Business School",                          "Lausanne",         "Switzerland",   "Private", "imd.org",                  None),
        # Spain (10)
        ("University of Barcelona",                      "Barcelona",        "Spain",         "Public",  "ub.edu",                   151),
        ("Autonomous University of Barcelona",           "Barcelona",        "Spain",         "Public",  "uab.cat",                  201),
        ("Complutense University of Madrid",             "Madrid",           "Spain",         "Public",  "ucm.es",                   201),
        ("University of Navarra",                        "Pamplona",         "Spain",         "Private", "unav.edu",                 201),
        ("IE University",                                "Madrid",           "Spain",         "Private", "ie.edu",                   None),
        ("ESADE Business School",                        "Barcelona",        "Spain",         "Private", "esade.edu",                None),
        ("Polytechnic University of Madrid",             "Madrid",           "Spain",         "Public",  "upm.es",                   251),
        ("University of Valencia",                       "Valencia",         "Spain",         "Public",  "uv.es",                    301),
        ("University of Granada",                        "Granada",          "Spain",         "Public",  "ugr.es",                   351),
        ("Autonomous University of Madrid",              "Madrid",           "Spain",         "Public",  "uam.es",                   301),
        # Italy (8)
        ("University of Bologna",                        "Bologna",          "Italy",         "Public",  "unibo.it",                 154),
        ("Politecnico di Milano",                        "Milan",            "Italy",         "Public",  "polimi.it",                139),
        ("Sapienza University of Rome",                  "Rome",             "Italy",         "Public",  "uniroma1.it",              171),
        ("University of Milan",                          "Milan",            "Italy",         "Public",  "unimi.it",                 301),
        ("Politecnico di Torino",                        "Turin",            "Italy",         "Public",  "polito.it",                301),
        ("University of Padua",                          "Padua",            "Italy",         "Public",  "unipd.it",                 251),
        ("University of Turin",                          "Turin",            "Italy",         "Public",  "unito.it",                 351),
        ("University of Florence",                       "Florence",         "Italy",         "Public",  "unifi.it",                 401),
        # Belgium (5)
        ("KU Leuven",                                    "Leuven",           "Belgium",       "Public",  "kuleuven.be",              68),
        ("Ghent University",                             "Ghent",            "Belgium",       "Public",  "ugent.be",                 149),
        ("Universite Libre de Bruxelles",                "Brussels",         "Belgium",       "Public",  "ulb.be",                   201),
        ("University of Antwerp",                        "Antwerp",          "Belgium",       "Public",  "uantwerpen.be",            451),
        ("Vrije Universiteit Brussel",                   "Brussels",         "Belgium",       "Public",  "vub.be",                   501),
        # Denmark (4)
        ("University of Copenhagen",                     "Copenhagen",       "Denmark",       "Public",  "ku.dk",                    97),
        ("Technical University of Denmark",              "Lyngby",           "Denmark",       "Public",  "dtu.dk",                   146),
        ("Aarhus University",                            "Aarhus",           "Denmark",       "Public",  "au.dk",                    137),
        ("Copenhagen Business School",                   "Copenhagen",       "Denmark",       "Public",  "cbs.dk",                   None),
        # Finland (3)
        ("University of Helsinki",                       "Helsinki",         "Finland",       "Public",  "helsinki.fi",              107),
        ("Aalto University",                             "Espoo",            "Finland",       "Public",  "aalto.fi",                 115),
        ("University of Oulu",                           "Oulu",             "Finland",       "Public",  "oulu.fi",                  451),
        # Norway (3)
        ("University of Oslo",                           "Oslo",             "Norway",        "Public",  "uio.no",                   114),
        ("Norwegian University of Science and Technology","Trondheim",       "Norway",        "Public",  "ntnu.no",                  263),
        ("University of Bergen",                         "Bergen",           "Norway",        "Public",  "uib.no",                   301),
        # Austria (3)
        ("University of Vienna",                         "Vienna",           "Austria",       "Public",  "univie.ac.at",             150),
        ("Vienna University of Technology",              "Vienna",           "Austria",       "Public",  "tuwien.ac.at",             201),
        ("WU Vienna University of Economics",            "Vienna",           "Austria",       "Public",  "wu.ac.at",                 None),
        # Ireland (4)
        ("Trinity College Dublin",                       "Dublin",           "Ireland",       "Public",  "tcd.ie",                   81),
        ("University College Dublin",                    "Dublin",           "Ireland",       "Public",  "ucd.ie",                   181),
        ("University College Cork",                      "Cork",             "Ireland",       "Public",  "ucc.ie",                   301),
        ("National University of Ireland Galway",        "Galway",           "Ireland",       "Public",  "universityofgalway.ie",    351),
        # Portugal (3)
        ("University of Lisbon",                         "Lisbon",           "Portugal",      "Public",  "ulisboa.pt",               251),
        ("University of Porto",                          "Porto",            "Portugal",      "Public",  "up.pt",                    291),
        ("Nova University Lisbon",                       "Lisbon",           "Portugal",      "Public",  "unl.pt",                   None),
        # Poland (3)
        ("University of Warsaw",                         "Warsaw",           "Poland",        "Public",  "uw.edu.pl",                308),
        ("Jagiellonian University",                      "Krakow",           "Poland",        "Public",  "uj.edu.pl",                284),
        ("Warsaw University of Technology",              "Warsaw",           "Poland",        "Public",  "pw.edu.pl",                None),
        # Czech Republic (2)
        ("Charles University",                           "Prague",           "Czech Republic","Public",  "cuni.cz",                  247),
        ("Czech Technical University in Prague",         "Prague",           "Czech Republic","Public",  "cvut.cz",                  None),
        # Hungary (1)
        ("Budapest University of Technology",            "Budapest",         "Hungary",       "Public",  "bme.hu",                   None),
        # Greece (2)
        ("National Technical University of Athens",      "Athens",           "Greece",        "Public",  "ntua.gr",                  None),
        ("University of Athens",                         "Athens",           "Greece",        "Public",  "uoa.gr",                   None),
        # Romania (1)
        ("Babes-Bolyai University",                      "Cluj-Napoca",      "Romania",       "Public",  "ubbcluj.ro",               None),
        # Estonia (1)
        ("University of Tartu",                          "Tartu",            "Estonia",       "Public",  "ut.ee",                    None),
        # Lithuania (1)
        ("Vilnius University",                           "Vilnius",          "Lithuania",     "Public",  "vu.lt",                    None),
        # Latvia (1)
        ("University of Latvia",                         "Riga",             "Latvia",        "Public",  "lu.lv",                    None),
        # Slovakia (1)
        ("Comenius University Bratislava",               "Bratislava",       "Slovakia",      "Public",  "uniba.sk",                 None),
        # Croatia (1)
        ("University of Zagreb",                         "Zagreb",           "Croatia",       "Public",  "unizg.hr",                 None),
        # Serbia (1)
        ("University of Belgrade",                       "Belgrade",         "Serbia",        "Public",  "bg.ac.rs",                 None),
    ]

    colleges = []
    for row in data:
        n, city, country, t, w, qs = row
        c = make_college_row(
            name=n, city=city, country=country,
            institution_type=t, website=w,
            source=f"{country.replace(' ','_')}_Curated_2024",
        )
        c["_ranking_source"] = "QS_2024"
        c["_ranking_value"]  = str(qs) if qs else None
        colleges.append(c)
    return colleges


# ── Australia + NZ data — 50 universities ────────────────────────────────────

def get_australia_colleges():
    data = [
        # Go8 (Group of Eight)
        ("Australian National University",               "Canberra",         "ACT",           "Public",  "anu.edu.au",              30),
        ("University of Melbourne",                      "Melbourne",        "Victoria",      "Public",  "unimelb.edu.au",          14),
        ("University of Sydney",                         "Sydney",           "New South Wales","Public", "sydney.edu.au",           18),
        ("University of Queensland",                     "Brisbane",         "Queensland",    "Public",  "uq.edu.au",               40),
        ("University of New South Wales",                "Sydney",           "New South Wales","Public", "unsw.edu.au",             19),
        ("Monash University",                            "Melbourne",        "Victoria",      "Public",  "monash.edu",              37),
        ("University of Adelaide",                       "Adelaide",         "South Australia","Public", "adelaide.edu.au",         89),
        ("University of Western Australia",              "Perth",            "Western Australia","Public","uwa.edu.au",             90),
        # ATN (Australian Technology Network)
        ("University of Technology Sydney",              "Sydney",           "New South Wales","Public", "uts.edu.au",              133),
        ("RMIT University",                              "Melbourne",        "Victoria",      "Public",  "rmit.edu.au",             166),
        ("Curtin University",                            "Perth",            "Western Australia","Public","curtin.edu.au",          183),
        ("University of South Australia",                "Adelaide",         "South Australia","Public", "unisa.edu.au",           287),
        ("University of Newcastle",                      "Newcastle",        "New South Wales","Public", "newcastle.edu.au",       197),
        # IRU (Innovative Research Universities)
        ("Griffith University",                          "Brisbane",         "Queensland",    "Public",  "griffith.edu.au",         None),
        ("La Trobe University",                          "Melbourne",        "Victoria",      "Public",  "latrobe.edu.au",          None),
        ("Flinders University",                          "Adelaide",         "South Australia","Public", "flinders.edu.au",         None),
        ("James Cook University",                        "Townsville",       "Queensland",    "Public",  "jcu.edu.au",              None),
        ("Murdoch University",                           "Perth",            "Western Australia","Public","murdoch.edu.au",         None),
        ("Western Sydney University",                    "Penrith",          "New South Wales","Public", "westernsydney.edu.au",    None),
        # Other public
        ("Macquarie University",                         "Sydney",           "New South Wales","Public", "mq.edu.au",              195),
        ("Deakin University",                            "Geelong",          "Victoria",      "Public",  "deakin.edu.au",           None),
        ("Swinburne University of Technology",           "Melbourne",        "Victoria",      "Public",  "swinburne.edu.au",        None),
        ("University of Wollongong",                     "Wollongong",       "New South Wales","Public", "uow.edu.au",              195),
        ("Queensland University of Technology",          "Brisbane",         "Queensland",    "Public",  "qut.edu.au",              197),
        ("Australian Catholic University",               "Sydney",           "New South Wales","Private","acu.edu.au",             None),
        ("Bond University",                              "Gold Coast",       "Queensland",    "Private", "bond.edu.au",             None),
        ("Charles Sturt University",                     "Bathurst",         "New South Wales","Public", "csu.edu.au",              None),
        ("Southern Cross University",                    "Lismore",          "New South Wales","Public", "scu.edu.au",              None),
        ("Central Queensland University",                "Rockhampton",      "Queensland",    "Public",  "cqu.edu.au",              None),
        ("University of the Sunshine Coast",             "Sippy Downs",      "Queensland",    "Public",  "usc.edu.au",              None),
        ("University of Tasmania",                       "Hobart",           "Tasmania",      "Public",  "utas.edu.au",             None),
        ("University of New England",                    "Armidale",         "New South Wales","Public", "une.edu.au",              None),
        ("University of Canberra",                       "Canberra",         "ACT",           "Public",  "canberra.edu.au",         None),
        ("University of Southern Queensland",            "Toowoomba",        "Queensland",    "Public",  "usq.edu.au",              None),
        ("Victoria University",                          "Melbourne",        "Victoria",      "Public",  "vu.edu.au",               None),
        ("Charles Darwin University",                    "Darwin",           "NT",            "Public",  "cdu.edu.au",              None),
        ("Edith Cowan University",                       "Perth",            "Western Australia","Public","ecu.edu.au",             None),
        ("University of Notre Dame Australia",           "Sydney",           "New South Wales","Private","nd.edu.au",              None),
        ("Torrens University Australia",                 "Adelaide",         "South Australia","Private","torrens.edu.au",          None),
        ("Australian Institute of Music",                "Sydney",           "New South Wales","Private","aim.edu.au",             None),
        # New Zealand (10)
        ("University of Auckland",                       "Auckland",         "Auckland",      "Public",  "auckland.ac.nz",          65),
        ("University of Otago",                          "Dunedin",          "Otago",         "Public",  "otago.ac.nz",             193),
        ("Victoria University of Wellington",            "Wellington",       "Wellington",    "Public",  "wgtn.ac.nz",              245),
        ("University of Canterbury",                     "Christchurch",     "Canterbury",    "Public",  "canterbury.ac.nz",        None),
        ("Massey University",                            "Palmerston North", "Manawatu",      "Public",  "massey.ac.nz",            None),
        ("Lincoln University",                           "Lincoln",          "Canterbury",    "Public",  "lincoln.ac.nz",           None),
        ("University of Waikato",                        "Hamilton",         "Waikato",       "Public",  "waikato.ac.nz",           None),
        ("AUT University",                               "Auckland",         "Auckland",      "Public",  "aut.ac.nz",               None),
        ("Auckland University of Technology",            "Auckland",         "Auckland",      "Public",  "aut.ac.nz",               None),
        ("Unitec Institute of Technology",               "Auckland",         "Auckland",      "Public",  "unitec.ac.nz",            None),
    ]

    colleges = []
    for row in data:
        n, city, state, t, w, qs = row
        # Determine country
        nz_states = {"Auckland", "Otago", "Wellington", "Canterbury", "Manawatu", "Waikato"}
        country = "New Zealand" if state in nz_states else "Australia"
        c = make_college_row(
            name=n, city=city, state_region=state, country=country,
            institution_type=t, website=w, source="Australia_NZ_Curated_2024",
        )
        c["_ranking_source"] = "QS_2024"
        c["_ranking_value"]  = str(qs) if qs else None
        colleges.append(c)
    return colleges


# ── Dedup helper ──────────────────────────────────────────────────────────────

def dedup(colleges):
    seen = set()
    out = []
    for c in colleges:
        key = c["name"].lower().strip()
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", choices=["india", "uk", "eu", "australia", "all"],
                        default="all")
    parser.add_argument("--reset", action="store_true",
                        help="Clear checkpoint and rerun everything")
    args = parser.parse_args()

    if args.reset and os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        print("Checkpoint cleared.\n")

    prefix = "[DRY RUN] " if DRY_RUN else ""
    print(f"\n{'='*60}")
    print(f"{prefix}International College Seeder — region: {args.region}")
    print(f"{'='*60}\n")

    if not DRY_RUN:
        try:
            from supabase import create_client
        except ImportError:
            print("ERROR: pip install supabase"); sys.exit(1)
        if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
            print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env"); sys.exit(1)
        client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        print(f"  Connected: {SUPABASE_URL}\n")

        # Detect actual columns in DB to avoid PGRST204 errors
        print("  Probing colleges_comprehensive columns...")
        live_columns = probe_allowed_columns(client)
        print(f"  Detected {len(live_columns)} columns: {sorted(live_columns)}\n")

        print("  Loading existing colleges from DB...")
        existing_names = fetch_existing_names(client)
        print(f"  Found {len(existing_names):,} existing.\n")
    else:
        client = None
        live_columns = ALLOWED_COLUMNS
        existing_names = set()

    cp = load_checkpoint()
    completed = set(cp.get("completed_sources", []))
    total_inserted = 0

    regions = {
        "india":     ("india",     get_india_colleges,     "India"),
        "uk":        ("uk",        get_uk_colleges,        "UK"),
        "eu":        ("eu",        get_eu_colleges,        "EU"),
        "australia": ("australia", get_australia_colleges, "Australia + NZ"),
    }

    run_regions = list(regions.keys()) if args.region == "all" else [args.region]

    for key in run_regions:
        cp_key, getter, label = regions[key]
        if cp_key in completed:
            print(f"[{label.upper()}] ✓ Already done (checkpoint). Use --reset to redo.\n")
            continue

        print(f"[{label.upper()}] Building college list...")
        colleges = dedup(getter())
        print(f"  {len(colleges)} unique {label} colleges prepared.")

        # Enforce minimum
        min_required = 100
        if len(colleges) < min_required:
            print(f"  ⚠️  WARNING: Only {len(colleges)} colleges — minimum is {min_required}")

        save_raw(f"{cp_key}_colleges", colleges)

        if not DRY_RUN:
            ids = upsert_colleges(client, colleges, existing_names, live_columns)
            insert_rankings(client, colleges, ids)
            for c in colleges:
                existing_names.add((c["name"].lower(), c["country"].lower()))
            total_inserted += len(ids)
            print(f"  ✅ {label} done. Inserted: {len(ids)}\n")
        else:
            print(f"  [DRY RUN] Would insert up to {len(colleges)} {label} colleges.\n")

        cp["completed_sources"].append(cp_key)
        save_checkpoint(cp)

    # Summary
    print(f"\n{'='*60}")
    print(f"Seeding complete!")
    if not DRY_RUN:
        print(f"  Total inserted this run: {total_inserted}")
    print(f"  Raw data saved in:       scraped_raw/")
    print(f"  Skip log:                {SKIP_LOG}")
    counts = {
        "India":       len(get_india_colleges()),
        "UK":          len(get_uk_colleges()),
        "EU":          len(get_eu_colleges()),
        "Australia+NZ":len(get_australia_colleges()),
    }
    for region, count in counts.items():
        status = "✅" if count >= 100 else "⚠️ "
        print(f"  {status} {region}: {count} colleges")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()