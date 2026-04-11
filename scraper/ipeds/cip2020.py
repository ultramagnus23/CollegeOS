"""
CIP 2020 taxonomy reference data.

Source: NCES Classification of Instructional Programs (CIP) 2020
https://nces.ed.gov/ipeds/cipcode/

STRUCTURE
---------
CIP_SERIES : dict[str, dict]
  Key   → 2-digit CIP series (e.g. "11")
  Value → {
      "broad_category": human-readable category grouping used in this app,
      "is_stem": bool,
      "name": generic series-level name
  }

CIP_CODES : dict[str, str]
  Key   → full CIP code string (4 or 6 digits, dot-separated, e.g. "11.07" or "11.0701")
  Value → human-readable program name

Usage in build scripts
-----------------------
>>> from cip2020 import get_major_info
>>> info = get_major_info("11.0701")
>>> info
{'name': 'Computer Science', 'broad_category': 'Computer & Information Sciences', 'is_stem': True}
"""

# ─── 2-digit series → category, STEM flag, generic name ─────────────────────

CIP_SERIES: dict[str, dict] = {
    "01": {"broad_category": "Agriculture",                  "is_stem": True,  "name": "Agriculture, Agriculture Operations & Related Sciences"},
    "03": {"broad_category": "Natural Resources",            "is_stem": True,  "name": "Natural Resources & Conservation"},
    "04": {"broad_category": "Architecture",                 "is_stem": False, "name": "Architecture & Related Services"},
    "05": {"broad_category": "Area & Ethnic Studies",        "is_stem": False, "name": "Area, Ethnic, Cultural, Gender & Group Studies"},
    "09": {"broad_category": "Communications",               "is_stem": False, "name": "Communication, Journalism & Related Programs"},
    "10": {"broad_category": "Communications",               "is_stem": False, "name": "Communications Technologies"},
    "11": {"broad_category": "Computer & Information Sciences", "is_stem": True,  "name": "Computer & Information Sciences"},
    "12": {"broad_category": "Personal Services",            "is_stem": False, "name": "Personal & Culinary Services"},
    "13": {"broad_category": "Education",                    "is_stem": False, "name": "Education"},
    "14": {"broad_category": "Engineering",                  "is_stem": True,  "name": "Engineering"},
    "15": {"broad_category": "Engineering",                  "is_stem": True,  "name": "Engineering Technologies & Engineering-Related Fields"},
    "16": {"broad_category": "Foreign Languages",            "is_stem": False, "name": "Foreign Languages, Literatures & Linguistics"},
    "19": {"broad_category": "Family & Consumer Sciences",   "is_stem": False, "name": "Family & Consumer Sciences / Human Sciences"},
    "22": {"broad_category": "Law & Legal Studies",          "is_stem": False, "name": "Legal Professions & Studies"},
    "23": {"broad_category": "English & Literature",         "is_stem": False, "name": "English Language & Literature / Letters"},
    "24": {"broad_category": "Liberal Arts",                 "is_stem": False, "name": "Liberal Arts & Sciences, General Studies & Humanities"},
    "25": {"broad_category": "Library Science",              "is_stem": False, "name": "Library Science"},
    "26": {"broad_category": "Biological Sciences",          "is_stem": True,  "name": "Biological & Biomedical Sciences"},
    "27": {"broad_category": "Mathematics & Statistics",     "is_stem": True,  "name": "Mathematics & Statistics"},
    "29": {"broad_category": "Military Sciences",            "is_stem": False, "name": "Military Technologies & Applied Sciences"},
    "30": {"broad_category": "Interdisciplinary Studies",    "is_stem": False, "name": "Multi / Interdisciplinary Studies"},
    "31": {"broad_category": "Parks & Recreation",           "is_stem": False, "name": "Parks, Recreation, Leisure, Fitness & Kinesiology"},
    "38": {"broad_category": "Philosophy & Religion",        "is_stem": False, "name": "Philosophy & Religious Studies"},
    "39": {"broad_category": "Philosophy & Religion",        "is_stem": False, "name": "Theology & Religious Vocations"},
    "40": {"broad_category": "Physical Sciences",            "is_stem": True,  "name": "Physical Sciences"},
    "41": {"broad_category": "Physical Sciences",            "is_stem": True,  "name": "Science Technologies / Technicians"},
    "42": {"broad_category": "Psychology",                   "is_stem": False, "name": "Psychology"},
    "43": {"broad_category": "Security & Protective Services","is_stem": False, "name": "Homeland Security, Law Enforcement, Firefighting"},
    "44": {"broad_category": "Public Administration",        "is_stem": False, "name": "Public Administration & Social Service Professions"},
    "45": {"broad_category": "Social Sciences",              "is_stem": False, "name": "Social Sciences"},
    "46": {"broad_category": "Construction",                 "is_stem": False, "name": "Construction Trades"},
    "47": {"broad_category": "Mechanics & Repair",           "is_stem": False, "name": "Mechanic & Repair Technologies / Technicians"},
    "48": {"broad_category": "Precision Production",         "is_stem": False, "name": "Precision Production"},
    "49": {"broad_category": "Transportation",               "is_stem": True,  "name": "Transportation & Materials Moving"},
    "50": {"broad_category": "Visual & Performing Arts",     "is_stem": False, "name": "Visual & Performing Arts"},
    "51": {"broad_category": "Health Professions",           "is_stem": True,  "name": "Health Professions & Related Programs"},
    "52": {"broad_category": "Business",                     "is_stem": False, "name": "Business, Management, Marketing & Related Support Services"},
    "54": {"broad_category": "History",                      "is_stem": False, "name": "History"},
    "60": {"broad_category": "Health Professions",           "is_stem": True,  "name": "Residency Programs"},
}

# ─── 4 and 6-digit specific program names ────────────────────────────────────
# Key format: "XX.YYYY" (4-digit) or "XX.YYYY ZZ" (6-digit without leading zeros
# but as IPEDS stores them, e.g. "11.0701")
# Most IPEDS rows use 6-digit codes but 4-digit matches serve as fallback.

CIP_CODES: dict[str, str] = {
    # ── Agriculture (01) ──────────────────────────────────────────────────────
    "01.0000": "Agriculture, General",
    "01.0101": "Agricultural Business and Management",
    "01.0200": "Agricultural Mechanization",
    "01.0301": "Agricultural Production Operations",
    "01.0401": "Agricultural and Food Products Processing",
    "01.0601": "Applied Horticulture",
    "01.0901": "Animal Sciences",
    "01.1001": "Food Science",
    "01.1101": "Plant Sciences",
    "01.1201": "Soil Science and Agronomy",

    # ── Natural Resources (03) ────────────────────────────────────────────────
    "03.0103": "Environmental Studies",
    "03.0104": "Environmental Science",
    "03.0199": "Natural Resources and Conservation, Other",
    "03.0301": "Fishing and Fisheries Sciences",
    "03.0501": "Forestry",
    "03.0601": "Wildlife and Wildlands Science and Management",

    # ── Architecture (04) ─────────────────────────────────────────────────────
    "04.0201": "Architecture",
    "04.0301": "City/Urban, Community and Regional Planning",
    "04.0401": "Environmental Design",
    "04.0501": "Interior Architecture",
    "04.0601": "Landscape Architecture",
    "04.0801": "Architectural History and Criticism",
    "04.0902": "Architectural and Building Sciences/Technology",

    # ── Area & Ethnic Studies (05) ────────────────────────────────────────────
    "05.0102": "American/United States Studies/Civilization",
    "05.0103": "Asian Studies/Civilization",
    "05.0104": "East Asian Studies",
    "05.0106": "Latin American Studies",
    "05.0107": "Near and Middle Eastern Studies",
    "05.0108": "Pacific Area/Pacific Rim Studies",
    "05.0109": "South Asian Studies",
    "05.0110": "Southeast Asian Studies",
    "05.0111": "Western European Studies",
    "05.0201": "African-American/Black Studies",
    "05.0203": "Hispanic-American Studies",
    "05.0206": "Asian-American Studies",
    "05.0207": "Women's Studies",
    "05.0209": "LGBTQ Studies",
    "05.0299": "Ethnic, Cultural Minority, Gender, and Group Studies, Other",

    # ── Communications (09) ───────────────────────────────────────────────────
    "09.0101": "Speech Communication and Rhetoric",
    "09.0102": "Mass Communication / Media Studies",
    "09.0201": "Advertising",
    "09.0401": "Journalism",
    "09.0501": "Public Relations / Image Management",
    "09.0702": "Digital Communication and Media/Multimedia",
    "09.0900": "Public Relations, Advertising and Applied Communication",
    "09.1001": "Organizational Communication",

    # ── Computer & Info Sciences (11) ─────────────────────────────────────────
    "11.0101": "Computer and Information Sciences, General",
    "11.0103": "Information Technology",
    "11.0104": "Informatics",
    "11.0199": "Computer and Information Sciences, Other",
    "11.0201": "Computer Programming",
    "11.0301": "Data Processing and Data Processing Technology",
    "11.0401": "Information Science/Studies",
    "11.0501": "Computer Systems Analysis",
    "11.0601": "Data Entry / Microcomputer Applications",
    "11.0701": "Computer Science",
    "11.0801": "Web Page, Digital/Multimedia and Information Resources Design",
    "11.0802": "Data Modeling/Warehousing and Database Administration",
    "11.0803": "Computer Graphics",
    "11.0901": "Computer Systems Networking and Telecommunications",
    "11.1001": "Network and System Administration",
    "11.1002": "System, Networking, and LAN/WAN Management",
    "11.1003": "Computer and Information Systems Security",
    "11.1004": "Web/Multimedia Management and Webmaster",
    "11.1005": "Information Technology Project Management",
    "11.1006": "Computer Support Specialist",
    "11.1099": "Computer/Information Technology Services Administration, Other",

    # ── Education (13) ────────────────────────────────────────────────────────
    "13.0101": "Education, General",
    "13.0201": "Bilingual and Multilingual Education",
    "13.0301": "Curriculum and Instruction",
    "13.0401": "Educational Leadership and Administration",
    "13.0501": "Educational/Instructional Technology",
    "13.0601": "Educational Evaluation and Research",
    "13.0701": "International and Comparative Education",
    "13.0901": "Social and Philosophical Foundations of Education",
    "13.1001": "Special Education and Teaching",
    "13.1101": "Counselor Education/School Counseling",
    "13.1202": "Elementary Education and Teaching",
    "13.1203": "Junior High/Intermediate/Middle School Education",
    "13.1205": "Secondary Education and Teaching",
    "13.1206": "Teacher Education, Multiple Levels",
    "13.1209": "Kindergarten/PreSchool Education",
    "13.1299": "Teacher Education and Professional Development, Other",
    "13.1302": "Art Teacher Education",
    "13.1303": "Business Teacher Education",
    "13.1305": "English/Language Arts Teacher Education",
    "13.1311": "Mathematics Teacher Education",
    "13.1312": "Music Teacher Education",
    "13.1314": "Physical Education Teaching and Coaching",
    "13.1316": "Science Teacher Education",
    "13.1317": "Social Science Teacher Education",
    "13.1323": "History Teacher Education",
    "13.1399": "Teacher Education and Professional Development, Subject-Specific, Other",
    "13.1401": "Teaching English as a Second Language",
    "13.1501": "Education/Teaching of Individuals with Specific Learning Disabilities",
    "13.1601": "Educational Administration and Supervision",

    # ── Engineering (14) ─────────────────────────────────────────────────────
    "14.0101": "Engineering, General",
    "14.0201": "Aerospace, Aeronautical and Astronautical Engineering",
    "14.0301": "Agricultural Engineering",
    "14.0401": "Architectural Engineering",
    "14.0501": "Biomedical/Medical Engineering",
    "14.0601": "Ceramic Sciences and Engineering",
    "14.0701": "Chemical Engineering",
    "14.0801": "Civil Engineering",
    "14.0901": "Computer Engineering",
    "14.1001": "Electrical and Electronics Engineering",
    "14.1101": "Engineering Mechanics",
    "14.1201": "Engineering Physics",
    "14.1301": "Engineering Science",
    "14.1401": "Environmental/Environmental Health Engineering",
    "14.1801": "Materials Engineering",
    "14.1901": "Mechanical Engineering",
    "14.2001": "Metallurgical Engineering",
    "14.2101": "Mining and Mineral Engineering",
    "14.2201": "Naval Architecture and Marine Engineering",
    "14.2301": "Nuclear Engineering",
    "14.2401": "Ocean Engineering",
    "14.2501": "Petroleum Engineering",
    "14.2701": "Systems Engineering",
    "14.3101": "Industrial Engineering",
    "14.3201": "Polymer/Plastics Engineering",
    "14.3501": "Industrial Engineering and Engineering Management",
    "14.3601": "Manufacturing Engineering",
    "14.3701": "Operations Research",
    "14.3801": "Surveying Engineering",
    "14.3901": "Geological/Geophysical Engineering",
    "14.4101": "Mechatronics, Robotics, and Automation Engineering",
    "14.4201": "Biochemical Engineering",
    "14.4301": "Engineering Chemistry",
    "14.4401": "Data Science",
    "14.9999": "Engineering, Other",

    # ── Engineering Tech (15) ─────────────────────────────────────────────────
    "15.0000": "Engineering Technologies/Technicians, General",
    "15.0303": "Electrical, Electronic and Communications Engineering Technology",
    "15.0612": "Industrial Technology",
    "15.1501": "Engineering/Industrial Management",

    # ── Foreign Languages (16) ────────────────────────────────────────────────
    "16.0101": "Foreign Languages and Literatures, General",
    "16.0102": "Linguistics",
    "16.0104": "Comparative Literature",
    "16.0199": "Linguistic, Comparative, and Related Language Studies, Other",
    "16.0301": "Chinese Language and Literature",
    "16.0302": "Japanese Language and Literature",
    "16.0303": "Korean Language and Literature",
    "16.0399": "East Asian Languages, Literatures, and Linguistics, Other",
    "16.0402": "Russian Language and Literature",
    "16.0501": "German Language and Literature",
    "16.0601": "Modern Greek Language and Literature",
    "16.0901": "French Language and Literature",
    "16.0905": "Spanish Language and Literature",
    "16.0906": "Portuguese Language and Literature",
    "16.1001": "American Sign Language",
    "16.1101": "Arabic Language and Literature",
    "16.1102": "Hebrew Language and Literature",
    "16.1199": "Middle/Near Eastern and Semitic Languages, Other",

    # ── English & Lit (23) ────────────────────────────────────────────────────
    "23.0101": "English Language and Literature, General",
    "23.0301": "English Literature (British and Commonwealth)",
    "23.1001": "Speech and Rhetorical Studies",
    "23.1302": "Creative Writing",
    "23.1401": "American Literature (United States)",

    # ── Liberal Arts (24) ─────────────────────────────────────────────────────
    "24.0101": "Liberal Arts and Sciences/Liberal Studies",
    "24.0102": "General Studies",
    "24.0103": "Humanities/Humanistic Studies",

    # ── Biological Sciences (26) ──────────────────────────────────────────────
    "26.0101": "Biology/Biological Sciences, General",
    "26.0102": "Biomedical Sciences",
    "26.0201": "Biochemistry",
    "26.0202": "Biophysics",
    "26.0203": "Molecular Biochemistry",
    "26.0204": "Molecular Biophysics",
    "26.0207": "Structural Biology",
    "26.0210": "Biochemistry and Molecular Biology",
    "26.0299": "Biochemistry, Biophysics and Molecular Biology, Other",
    "26.0301": "Botany/Plant Biology",
    "26.0401": "Cell/Cellular Biology and Histology",
    "26.0403": "Anatomy",
    "26.0404": "Developmental Biology and Embryology",
    "26.0406": "Molecular Biology",
    "26.0501": "Microbiology, General",
    "26.0502": "Medical Microbiology and Bacteriology",
    "26.0503": "Virology",
    "26.0504": "Parasitology",
    "26.0507": "Immunology",
    "26.0601": "Physiology, General",
    "26.0602": "Molecular Physiology",
    "26.0607": "Reproductive Biology",
    "26.0608": "Endocrinology",
    "26.0701": "Zoology/Animal Biology",
    "26.0702": "Entomology",
    "26.0707": "Marine Biology and Biological Oceanography",
    "26.0799": "Zoology/Animal Biology, Other",
    "26.0801": "Genetics, General",
    "26.0806": "Human/Medical Genetics",
    "26.0901": "Physiology, Pathology and Related Sciences",
    "26.1001": "Pharmacology",
    "26.1003": "Molecular Pharmacology",
    "26.1099": "Pharmacology and Toxicology, Other",
    "26.1101": "Biometry/Biometrics",
    "26.1102": "Biostatistics",
    "26.1103": "Bioinformatics",
    "26.1104": "Computational Biology",
    "26.1199": "Biomathematics, Bioinformatics, and Computational Biology, Other",
    "26.1301": "Ecology",
    "26.1302": "Marine Biology",
    "26.1303": "Evolutionary Biology",
    "26.1309": "Conservation Biology",
    "26.1401": "Toxicology",
    "26.1501": "Neuroscience",
    "26.9999": "Biological and Biomedical Sciences, Other",

    # ── Mathematics & Statistics (27) ─────────────────────────────────────────
    "27.0101": "Mathematics, General",
    "27.0102": "Algebra and Number Theory",
    "27.0103": "Analysis and Functional Analysis",
    "27.0104": "Geometry/Geometric Analysis",
    "27.0105": "Topology and Foundations",
    "27.0199": "Mathematics, Other",
    "27.0301": "Applied Mathematics, General",
    "27.0303": "Computational Mathematics",
    "27.0304": "Computational and Applied Mathematics",
    "27.0501": "Statistics, General",
    "27.0502": "Mathematical Statistics and Probability",
    "27.0503": "Mathematics and Statistics",
    "27.0601": "Applied Statistics",
    "27.9999": "Mathematics and Statistics, Other",

    # ── Interdisciplinary (30) ────────────────────────────────────────────────
    "30.0101": "Biological and Physical Sciences",
    "30.0601": "System Science and Theory",
    "30.0801": "Mathematics and Computer Science",
    "30.1001": "Biopsychology",
    "30.1101": "Gerontology",
    "30.1401": "Museology/Museum Studies",
    "30.1501": "Science, Technology and Society",
    "30.1601": "Accounting and Computer Science",
    "30.1701": "Behavioral Sciences",
    "30.1901": "Nutrition Sciences",
    "30.2001": "International/Global Studies",
    "30.2201": "Ancient Studies/Civilization",
    "30.2301": "Intercultural/Multicultural and Diversity Studies",
    "30.2501": "Cognitive Science",
    "30.2601": "Cultural Studies/Critical Theory and Analysis",
    "30.2801": "Dispute Resolution",
    "30.3001": "Computational Science",
    "30.3301": "Sustainability Studies",
    "30.3401": "Urban Studies/Affairs",
    "30.3501": "Climate Science",
    "30.3601": "Economics and Computer Science",
    "30.3801": "Data Science, General",
    "30.3802": "Data Analytics",
    "30.9999": "Multi/Interdisciplinary Studies, Other",

    # ── Parks & Recreation (31) ───────────────────────────────────────────────
    "31.0101": "Parks, Recreation and Leisure Studies",
    "31.0301": "Dance",
    "31.0501": "Health and Physical Education, General",
    "31.0505": "Kinesiology and Exercise Science",
    "31.0901": "Sports and Fitness Administration/Management",

    # ── Philosophy & Religion (38) ────────────────────────────────────────────
    "38.0101": "Philosophy",
    "38.0102": "Logic",
    "38.0103": "Ethics",
    "38.0199": "Philosophy, Other",
    "38.0201": "Religion/Religious Studies",
    "38.0203": "Christian Studies",
    "38.0204": "Hindu Studies",
    "38.0205": "Islamic Studies",
    "38.0206": "Jewish/Judaic Studies",

    # ── Physical Sciences (40) ────────────────────────────────────────────────
    "40.0101": "Physical Sciences, General",
    "40.0401": "Atmospheric Sciences and Meteorology",
    "40.0501": "Chemistry, General",
    "40.0502": "Analytical Chemistry",
    "40.0503": "Inorganic Chemistry",
    "40.0504": "Organic Chemistry",
    "40.0506": "Physical Chemistry",
    "40.0507": "Polymer Chemistry",
    "40.0599": "Chemistry, Other",
    "40.0601": "Geology/Earth Science",
    "40.0602": "Geochemistry",
    "40.0603": "Geophysics and Seismology",
    "40.0604": "Paleontology",
    "40.0606": "Geochemistry and Petrology",
    "40.0607": "Hydrology and Water Resources Science",
    "40.0699": "Geological and Earth Sciences, Other",
    "40.0801": "Physics, General",
    "40.0806": "Nuclear Physics",
    "40.0809": "Optics",
    "40.0810": "Theoretical and Mathematical Physics",
    "40.0899": "Physics, Other",
    "40.1001": "Materials Science",
    "40.1002": "Materials Chemistry",
    "40.1099": "Materials Sciences, Other",

    # ── Psychology (42) ───────────────────────────────────────────────────────
    "42.0101": "Psychology, General",
    "42.0201": "Clinical Psychology",
    "42.0202": "Community Psychology",
    "42.0203": "Comparative Psychology",
    "42.0204": "Developmental and Child Psychology",
    "42.0205": "Experimental Psychology",
    "42.0206": "Industrial and Organizational Psychology",
    "42.0207": "Social Psychology",
    "42.0208": "Psychometrics and Quantitative Psychology",
    "42.0209": "Personality Psychology",
    "42.0301": "Counseling Psychology",
    "42.2803": "Forensic Psychology",
    "42.2806": "Educational Psychology",
    "42.2807": "School Psychology",
    "42.9999": "Psychology, Other",

    # ── Security & Protective Services (43) ──────────────────────────────────
    "43.0100": "Criminal Justice and Corrections, General",
    "43.0102": "Corrections",
    "43.0103": "Criminal Justice/Law Enforcement Administration",
    "43.0104": "Criminal Justice/Safety Studies",
    "43.0107": "Criminal Justice/Police Science",
    "43.0200": "Fire Protection",
    "43.0302": "Crisis/Emergency/Disaster Management",
    "43.0303": "Critical Infrastructure Protection",
    "43.0401": "Intelligence Studies",

    # ── Public Administration (44) ────────────────────────────────────────────
    "44.0000": "Human Services, General",
    "44.0201": "Community Organization and Advocacy",
    "44.0401": "Public Administration",
    "44.0501": "Public Policy Analysis",
    "44.0701": "Social Work",
    "44.9999": "Public Administration and Social Service Professions, Other",

    # ── Social Sciences (45) ─────────────────────────────────────────────────
    "45.0101": "Social Sciences, General",
    "45.0201": "Anthropology",
    "45.0202": "Physical Anthropology",
    "45.0203": "Cultural Anthropology",
    "45.0301": "Archeology",
    "45.0401": "Criminology",
    "45.0601": "Economics, General",
    "45.0602": "Applied Economics",
    "45.0603": "Econometrics and Quantitative Economics",
    "45.0604": "Development Economics and International Development",
    "45.0605": "International Economics",
    "45.0699": "Economics, Other",
    "45.0701": "Geography",
    "45.0702": "Geographic Information Science and Cartography",
    "45.0801": "History and Philosophy of Science and Technology",
    "45.0901": "International Relations and Affairs",
    "45.1001": "Political Science and Government, General",
    "45.1002": "American Government and Politics",
    "45.1003": "Political Science and Government, Other",
    "45.1101": "Sociology",
    "45.1201": "Urban Studies/Affairs",
    "45.1401": "Social Science Research Methods",
    "45.9999": "Social Sciences, Other",

    # ── Visual & Performing Arts (50) ─────────────────────────────────────────
    "50.0101": "Visual and Performing Arts, General",
    "50.0201": "Crafts/Craft Design, Folk Art and Artisanry",
    "50.0299": "Crafts/Craft Design, Other",
    "50.0301": "Dance, General",
    "50.0302": "Ballet",
    "50.0399": "Dance, Other",
    "50.0401": "Design and Applied Arts, General",
    "50.0402": "Commercial and Advertising Art",
    "50.0404": "Industrial and Product Design",
    "50.0406": "Commercial Photography",
    "50.0407": "Fashion/Apparel Design",
    "50.0408": "Interior Design",
    "50.0409": "Graphic Design",
    "50.0410": "Illustration",
    "50.0411": "Game and Interactive Media Design",
    "50.0499": "Design and Applied Arts, Other",
    "50.0501": "Drama and Dramatics/Theatre Arts, General",
    "50.0502": "Technical Theatre/Theatre Design and Technology",
    "50.0506": "Acting",
    "50.0507": "Directing and Theatrical Production",
    "50.0599": "Drama/Theatre Arts and Stagecraft, Other",
    "50.0601": "Film/Cinema/Video Studies",
    "50.0602": "Cinematography and Film/Video Production",
    "50.0605": "Photography",
    "50.0607": "Documentary Production",
    "50.0699": "Film/Video and Photographic Arts, Other",
    "50.0701": "Art/Art Studies, General",
    "50.0702": "Fine/Studio Arts, General",
    "50.0703": "Art History, Criticism and Conservation",
    "50.0705": "Drawing",
    "50.0708": "Painting",
    "50.0709": "Sculpture",
    "50.0710": "Printmaking",
    "50.0799": "Fine and Studio Arts, Other",
    "50.0901": "Music, General",
    "50.0902": "Music History, Literature, and Theory",
    "50.0903": "Music Performance, General",
    "50.0904": "Music Theory and Composition",
    "50.0906": "Conducting",
    "50.0908": "Piano and Organ",
    "50.0909": "Stringed Instruments",
    "50.0910": "Voice and Opera",
    "50.0912": "Music Pedagogy",
    "50.0999": "Music, Other",
    "50.1001": "Arts, Entertainment, and Media Management",
    "50.1002": "Music Management",
    "50.1003": "Theatre/Theatre Arts Management",
    "50.1004": "Arts Administration and Policy",
    "50.9999": "Visual and Performing Arts, Other",

    # ── Health Professions (51) ───────────────────────────────────────────────
    "51.0000": "Health Services/Allied Health/Health Sciences, General",
    "51.0201": "Communication Sciences and Disorders",
    "51.0202": "Audiology",
    "51.0203": "Speech-Language Pathology",
    "51.0301": "Chiropractic",
    "51.0401": "Dentistry",
    "51.0601": "Dental Hygiene",
    "51.0701": "Health/Health Care Administration and Management",
    "51.0706": "Health Information/Medical Records Administration",
    "51.0707": "Health Information/Medical Records Technology",
    "51.0708": "Health Services Administration",
    "51.0901": "Cardiovascular Technology",
    "51.0904": "Emergency Medical Technology",
    "51.0907": "Medical Radiologic Technology",
    "51.0908": "Respiratory Therapy Technician",
    "51.1004": "Clinical/Medical Laboratory Science",
    "51.1005": "Clinical Laboratory Science/Medical Technology",
    "51.1101": "Pre-Medicine/Pre-Medical Studies",
    "51.1102": "Pre-Dentistry Studies",
    "51.1103": "Pre-Pharmacy Studies",
    "51.1104": "Pre-Veterinary Studies",
    "51.1199": "Health Professions, Pre-Clinical Sciences, Other",
    "51.1201": "Medicine",
    "51.1401": "Medical Scientist",
    "51.1502": "Psychiatric/Mental Health Services Technology",
    "51.1504": "Community Health Services/Liaison/Counseling",
    "51.1599": "Mental and Social Health Services, Other",
    "51.1601": "Nursing/Registered Nurse",
    "51.1602": "Nursing Administration",
    "51.1603": "Adult Health Nursing",
    "51.1609": "Maternity Nursing",
    "51.1613": "Practical Nursing",
    "51.1614": "Nurse Midwifery",
    "51.1699": "Nursing, Other",
    "51.1701": "Optometry",
    "51.1801": "Opticianry/Ophthalmic Dispensing Optician",
    "51.1901": "Osteopathic Medicine/Osteopathy",
    "51.2001": "Pharmacy",
    "51.2002": "Pharmacy Administration and Pharmacy Policy",
    "51.2099": "Pharmacy, Pharmaceutical Sciences, and Administration, Other",
    "51.2101": "Podiatric Medicine/Podiatry",
    "51.2201": "Public Health, General",
    "51.2202": "Environmental Health",
    "51.2205": "Maternal and Child Health",
    "51.2207": "Community Health and Preventive Medicine",
    "51.2208": "Community Health Education",
    "51.2209": "Community Mental Health Services",
    "51.2299": "Public Health, Other",
    "51.2301": "Art Therapy",
    "51.2302": "Dance Therapy",
    "51.2305": "Music Therapy",
    "51.2306": "Occupational Therapy",
    "51.2307": "Orthotics/Prosthetics",
    "51.2308": "Physical Therapy",
    "51.2309": "Recreational Therapy",
    "51.2399": "Rehabilitation and Therapeutic Professions, Other",
    "51.2401": "Veterinary Medicine",
    "51.3101": "Dietetics and Clinical Nutrition Services",
    "51.3401": "Clinical/Medical Social Work",
    "51.3501": "Somatic Bodywork",
    "51.9999": "Health Professions and Related Clinical Sciences, Other",

    # ── Business (52) ─────────────────────────────────────────────────────────
    "52.0101": "Business/Commerce, General",
    "52.0201": "Business Administration and Management",
    "52.0203": "Logistics, Materials, and Supply Chain Management",
    "52.0204": "Office Management and Supervision",
    "52.0205": "Operations Management and Supervision",
    "52.0206": "Non-Profit/Public/Organizational Management",
    "52.0207": "E-Commerce/Electronic Commerce",
    "52.0208": "Business Analytics",
    "52.0209": "Data Analytics, Business",
    "52.0299": "Business Administration and Management, Other",
    "52.0301": "Accounting",
    "52.0302": "Accounting Technology/Technician and Bookkeeping",
    "52.0399": "Accounting and Related Services, Other",
    "52.0401": "Administrative Assistant and Secretarial Science",
    "52.0601": "Business/Managerial Economics",
    "52.0701": "Entrepreneurship/Entrepreneurial Studies",
    "52.0801": "Finance, General",
    "52.0803": "Banking and Financial Support Services",
    "52.0806": "International Finance",
    "52.0807": "Investments and Securities",
    "52.0809": "Financial Planning and Services",
    "52.0899": "Finance and Financial Management Services, Other",
    "52.0901": "Hospitality Administration/Management",
    "52.0904": "Hotel/Motel Administration/Management",
    "52.0905": "Restaurant, Culinary, and Catering Management",
    "52.0906": "Resort Management",
    "52.1001": "Human Resources Management",
    "52.1002": "Labor and Industrial Relations",
    "52.1101": "International Business",
    "52.1201": "Management Information Systems",
    "52.1202": "Management Information Systems and Services, Other",
    "52.1203": "Computer/Information Technology Services Administration",
    "52.1299": "Management Information Systems and Statistics, Other",
    "52.1301": "Management Science",
    "52.1302": "Operations Research",
    "52.1304": "Actuarial Science",
    "52.1401": "Marketing",
    "52.1402": "Marketing Research",
    "52.1499": "Marketing, Other",
    "52.1501": "Real Estate",
    "52.1601": "Taxation",
    "52.1701": "Insurance",
    "52.1801": "Sales, Distribution, and Marketing Operations",
    "52.1901": "Telecommunications Management",
    "52.1902": "Fashion Merchandising",
    "52.9999": "Business, Management, Marketing, and Related Support Services, Other",

    # ── History (54) ──────────────────────────────────────────────────────────
    "54.0101": "History, General",
    "54.0102": "American History (United States)",
    "54.0103": "European History",
    "54.0104": "History and Philosophy of Science and Technology",
    "54.0105": "Public/Applied History",
    "54.0199": "History, Other",
}


def get_major_info(cip_code: str) -> dict:
    """
    Look up a CIP code and return a dict with:
      name, broad_category, is_stem

    Lookup cascade:
      1. Exact 6-digit match in CIP_CODES  (e.g. "11.0701")
      2. 4-digit prefix match             (e.g. "11.07")
      3. 2-digit series fallback          (e.g. "11")

    Parameters
    ----------
    cip_code : str
        Raw CIP code as it appears in IPEDS, e.g. "11.0701" or "11.07"

    Returns
    -------
    dict with keys: name (str), broad_category (str), is_stem (bool)
    """
    code = str(cip_code).strip()

    # ── 1. Exact match ────────────────────────────────────────────────────────
    if code in CIP_CODES:
        series = code.split(".")[0]
        meta = CIP_SERIES.get(series, {})
        return {
            "name": CIP_CODES[code],
            "broad_category": meta.get("broad_category", "Other"),
            "is_stem": meta.get("is_stem", False),
        }

    # ── 2. 4-digit prefix (e.g. "11.07" from "11.0701") ──────────────────────
    if "." in code and len(code) > 5:
        prefix4 = code[:5]  # e.g. "11.07"
        if prefix4 in CIP_CODES:
            series = prefix4.split(".")[0]
            meta = CIP_SERIES.get(series, {})
            return {
                "name": CIP_CODES[prefix4],
                "broad_category": meta.get("broad_category", "Other"),
                "is_stem": meta.get("is_stem", False),
            }

    # ── 3. 2-digit series fallback ────────────────────────────────────────────
    series = code.split(".")[0] if "." in code else code[:2]
    meta = CIP_SERIES.get(series, {})
    if meta:
        return {
            "name": meta["name"],
            "broad_category": meta.get("broad_category", "Other"),
            "is_stem": meta.get("is_stem", False),
        }

    return {"name": f"Program Code {cip_code}", "broad_category": "Other", "is_stem": False}
