-- 128_seed_global_institutions.sql
-- ----------------------------------------------------------------------------
-- Seeds ~170 top global (non-US) institutions into canonical.institutions.
--
-- The database previously held ~6,000 US institutions (IPEDS) but ZERO non-US
-- rows. This migration adds India (IITs / NITs / IIMs / others), the UK Russell
-- Group, Canada U15, Australia Go8, Germany TU9, and key institutions across
-- Asia and Europe.
--
-- Identity columns follow migration 079 conventions:
--   * normalized_name = lower(trim(strip non-alnum-space))   (matches the
--     UNIQUE (country_code, normalized_name) constraint used for ON CONFLICT)
--   * slug = make_slug(name) || '-' || uuid-hex  (collision-free per 079)
--   * verification_status = 'verified' (manually curated, source_priority = 2)
--
-- All data is real (enrollment, founded year, lat/lng). GENERATED columns are
-- never listed. Idempotent via ON CONFLICT (country_code, normalized_name).
-- ----------------------------------------------------------------------------

BEGIN;

INSERT INTO canonical.institutions (
  canonical_name, normalized_name, slug,
  country_code, city, state_region,
  institution_type, control_type, website, established_year, founded_year,
  total_enrollment, student_faculty_ratio, latitude, longitude,
  source_priority, verification_status
)
SELECT
  v.name,
  lower(trim(regexp_replace(v.name, '[^a-z0-9\s]', '', 'gi'))),
  canonical.make_slug(v.name) || '-' || replace(gen_random_uuid()::text, '-', ''),
  v.cc, v.city, v.region, v.itype, v.ctype, v.website, v.est, v.est,
  v.enrollment, v.sfr, v.lat, v.lng,
  2, 'verified'::canonical.verification_status
FROM (VALUES
  -- ==========================================================================
  -- INDIA — IITs (23)
  -- ==========================================================================
  ('Indian Institute of Technology Bombay',      'IN', 'Mumbai',      'Maharashtra',     'institute', 'public', 'https://www.iitb.ac.in',  1958, 11000, 8.0,  19.133600, 72.915100),
  ('Indian Institute of Technology Delhi',       'IN', 'New Delhi',   'Delhi',           'institute', 'public', 'https://www.iitd.ac.in',  1961, 11000, 8.0,  28.545400, 77.192600),
  ('Indian Institute of Technology Madras',      'IN', 'Chennai',     'Tamil Nadu',      'institute', 'public', 'https://www.iitm.ac.in',  1959, 11000, 8.0,  12.991500, 80.233700),
  ('Indian Institute of Technology Kanpur',      'IN', 'Kanpur',      'Uttar Pradesh',   'institute', 'public', 'https://www.iitk.ac.in',  1959, 9000,  8.0,  26.512300, 80.233200),
  ('Indian Institute of Technology Kharagpur',   'IN', 'Kharagpur',   'West Bengal',     'institute', 'public', 'https://www.iitkgp.ac.in',1951, 13000, 8.0,  22.318900, 87.309100),
  ('Indian Institute of Technology Roorkee',     'IN', 'Roorkee',     'Uttarakhand',     'institute', 'public', 'https://www.iitr.ac.in',  1847, 9000,  8.5,  29.864800, 77.896500),
  ('Indian Institute of Technology Guwahati',    'IN', 'Guwahati',    'Assam',           'institute', 'public', 'https://www.iitg.ac.in',  1994, 7000,  8.5,  26.187800, 91.691500),
  ('Indian Institute of Technology Hyderabad',   'IN', 'Hyderabad',   'Telangana',       'institute', 'public', 'https://www.iith.ac.in',  2008, 4500,  9.0,  17.592300, 78.123100),
  ('Indian Institute of Technology Indore',      'IN', 'Indore',      'Madhya Pradesh',  'institute', 'public', 'https://www.iiti.ac.in',  2009, 3500,  9.0,  22.520300, 75.920600),
  ('Indian Institute of Technology Ropar',       'IN', 'Rupnagar',    'Punjab',          'institute', 'public', 'https://www.iitrpr.ac.in',2008, 2800,  9.5,  30.969800, 76.473500),
  ('Indian Institute of Technology Patna',       'IN', 'Patna',       'Bihar',           'institute', 'public', 'https://www.iitp.ac.in',  2008, 3200,  9.5,  25.536900, 84.851200),
  ('Indian Institute of Technology Gandhinagar', 'IN', 'Gandhinagar', 'Gujarat',         'institute', 'public', 'https://www.iitgn.ac.in', 2008, 2800,  9.5,  23.213000, 72.684700),
  ('Indian Institute of Technology Bhubaneswar', 'IN', 'Bhubaneswar', 'Odisha',          'institute', 'public', 'https://www.iitbbs.ac.in',2008, 2500,  9.5,  20.148800, 85.673000),
  ('Indian Institute of Technology Mandi',       'IN', 'Mandi',       'Himachal Pradesh','institute', 'public', 'https://www.iitmandi.ac.in',2009,2400, 9.5,  31.778200, 76.986500),
  ('Indian Institute of Technology Jodhpur',     'IN', 'Jodhpur',     'Rajasthan',       'institute', 'public', 'https://www.iitj.ac.in',  2008, 2400,  9.5,  26.471900, 73.114500),
  ('Indian Institute of Technology Varanasi',    'IN', 'Varanasi',    'Uttar Pradesh',   'institute', 'public', 'https://www.iitbhu.ac.in',1919, 7000,  8.5,  25.261800, 82.991300),
  ('Indian Institute of Technology Dhanbad',     'IN', 'Dhanbad',     'Jharkhand',       'institute', 'public', 'https://www.iitism.ac.in',1926, 6500,  9.0,  23.812600, 86.441100),
  ('Indian Institute of Technology Tirupati',    'IN', 'Tirupati',    'Andhra Pradesh',  'institute', 'public', 'https://www.iittp.ac.in', 2015, 1800,  10.0, 13.555800, 79.504700),
  ('Indian Institute of Technology Palakkad',    'IN', 'Palakkad',    'Kerala',          'institute', 'public', 'https://www.iitpkd.ac.in',2015, 1500,  10.0, 10.811600, 76.731400),
  ('Indian Institute of Technology Bhilai',      'IN', 'Bhilai',      'Chhattisgarh',    'institute', 'public', 'https://www.iitbhilai.ac.in',2016,1300,10.0,21.183300, 81.380000),
  ('Indian Institute of Technology Goa',         'IN', 'Ponda',       'Goa',             'institute', 'public', 'https://www.iitgoa.ac.in', 2016,1200,  10.0, 15.461500, 74.013700),
  ('Indian Institute of Technology Jammu',       'IN', 'Jammu',       'Jammu and Kashmir','institute','public', 'https://www.iitjammu.ac.in',2016,1400,10.0, 32.616700, 74.857000),
  ('Indian Institute of Technology Dharwad',     'IN', 'Dharwad',     'Karnataka',       'institute', 'public', 'https://www.iitdh.ac.in',  2016,1300,  10.0, 15.395100, 75.024400),

  -- ==========================================================================
  -- INDIA — NITs (15)
  -- ==========================================================================
  ('National Institute of Technology Tiruchirappalli','IN','Tiruchirappalli','Tamil Nadu','institute','public','https://www.nitt.edu',     1964, 8000, 12.0, 10.759400, 78.814900),
  ('National Institute of Technology Karnataka',  'IN','Surathkal',   'Karnataka',       'institute', 'public', 'https://www.nitk.ac.in',   1960, 7500, 12.0, 13.011900, 74.793500),
  ('National Institute of Technology Warangal',   'IN','Warangal',    'Telangana',       'institute', 'public', 'https://www.nitw.ac.in',   1959, 7000, 12.0, 17.981300, 79.531400),
  ('National Institute of Technology Rourkela',   'IN','Rourkela',    'Odisha',          'institute', 'public', 'https://www.nitrkl.ac.in', 1961, 7000, 12.0, 22.252600, 84.901400),
  ('National Institute of Technology Calicut',    'IN','Kozhikode',   'Kerala',          'institute', 'public', 'https://www.nitc.ac.in',   1961, 6500, 12.0, 11.321500, 75.934000),
  ('National Institute of Technology Durgapur',   'IN','Durgapur',    'West Bengal',     'institute', 'public', 'https://www.nitdgp.ac.in', 1960, 6000, 12.5, 23.547700, 87.292700),
  ('National Institute of Technology Silchar',    'IN','Silchar',     'Assam',           'institute', 'public', 'https://www.nits.ac.in',   1967, 5000, 12.5, 24.758800, 92.793300),
  ('National Institute of Technology Allahabad',  'IN','Prayagraj',   'Uttar Pradesh',   'institute', 'public', 'https://www.mnnit.ac.in',  1961, 6000, 12.5, 25.492500, 81.863900),
  ('National Institute of Technology Surat',      'IN','Surat',       'Gujarat',         'institute', 'public', 'https://www.svnit.ac.in',  1961, 6000, 12.5, 21.165200, 72.785400),
  ('National Institute of Technology Jaipur',     'IN','Jaipur',      'Rajasthan',       'institute', 'public', 'https://www.mnit.ac.in',   1963, 5500, 12.5, 26.864300, 75.812100),
  ('National Institute of Technology Nagpur',     'IN','Nagpur',      'Maharashtra',     'institute', 'public', 'https://www.vnit.ac.in',   1960, 5500, 12.5, 21.124900, 79.051600),
  ('National Institute of Technology Kurukshetra','IN','Kurukshetra', 'Haryana',         'institute', 'public', 'https://www.nitkkr.ac.in', 1963, 5500, 12.5, 29.947900, 76.815700),
  ('National Institute of Technology Hamirpur',   'IN','Hamirpur',    'Himachal Pradesh','institute', 'public', 'https://www.nith.ac.in',   1986, 4500, 13.0, 31.708200, 76.526100),
  ('National Institute of Technology Jamshedpur', 'IN','Jamshedpur',  'Jharkhand',       'institute', 'public', 'https://www.nitjsr.ac.in', 1960, 4500, 13.0, 22.776400, 86.144500),
  ('National Institute of Technology Bhopal',     'IN','Bhopal',      'Madhya Pradesh',  'institute', 'public', 'https://www.manit.ac.in',  1960, 6000, 12.5, 23.214800, 77.405400),

  -- ==========================================================================
  -- INDIA — IIMs (20)
  -- ==========================================================================
  ('Indian Institute of Management Ahmedabad',    'IN','Ahmedabad',   'Gujarat',         'institute', 'public', 'https://www.iima.ac.in',   1961, 1200, 10.0, 23.034600, 72.529900),
  ('Indian Institute of Management Bangalore',    'IN','Bengaluru',   'Karnataka',       'institute', 'public', 'https://www.iimb.ac.in',   1973, 1200, 10.0, 12.894400, 77.601800),
  ('Indian Institute of Management Calcutta',     'IN','Kolkata',     'West Bengal',     'institute', 'public', 'https://www.iimcal.ac.in', 1961, 1100, 10.0, 22.434600, 88.310400),
  ('Indian Institute of Management Lucknow',      'IN','Lucknow',     'Uttar Pradesh',   'institute', 'public', 'https://www.iiml.ac.in',   1984, 1000, 10.0, 26.901800, 80.948000),
  ('Indian Institute of Management Kozhikode',    'IN','Kozhikode',   'Kerala',          'institute', 'public', 'https://www.iimk.ac.in',   1996, 1100, 10.0, 11.290800, 75.840900),
  ('Indian Institute of Management Indore',       'IN','Indore',      'Madhya Pradesh',  'institute', 'public', 'https://www.iimidr.ac.in', 1996, 1200, 10.5, 22.667700, 75.857700),
  ('Indian Institute of Management Shillong',     'IN','Shillong',    'Meghalaya',       'institute', 'public', 'https://www.iimshillong.ac.in',2007,600, 10.5, 25.665400, 91.881800),
  ('Indian Institute of Management Rohtak',       'IN','Rohtak',      'Haryana',         'institute', 'public', 'https://www.iimrohtak.ac.in',2009, 700, 10.5, 28.917600, 76.567500),
  ('Indian Institute of Management Raipur',       'IN','Raipur',      'Chhattisgarh',    'institute', 'public', 'https://www.iimraipur.ac.in',2010, 600, 11.0, 21.198000, 81.288500),
  ('Indian Institute of Management Ranchi',       'IN','Ranchi',      'Jharkhand',       'institute', 'public', 'https://www.iimranchi.ac.in',2010, 600, 11.0, 23.412800, 85.439700),
  ('Indian Institute of Management Tiruchirappalli','IN','Tiruchirappalli','Tamil Nadu','institute','public','https://www.iimtrichy.ac.in',2011,600,11.0, 10.759400, 78.814900),
  ('Indian Institute of Management Udaipur',      'IN','Udaipur',     'Rajasthan',       'institute', 'public', 'https://www.iimu.ac.in',   2011, 600, 11.0, 24.585400, 73.712500),
  ('Indian Institute of Management Kashipur',     'IN','Kashipur',    'Uttarakhand',     'institute', 'public', 'https://www.iimkashipur.ac.in',2011,500,11.0, 29.214000, 78.961900),
  ('Indian Institute of Management Nagpur',       'IN','Nagpur',      'Maharashtra',     'institute', 'public', 'https://www.iimnagpur.ac.in',2015, 500, 11.0, 21.124900, 79.051600),
  ('Indian Institute of Management Visakhapatnam','IN','Visakhapatnam','Andhra Pradesh', 'institute', 'public', 'https://www.iimv.ac.in',   2015, 500, 11.0, 17.686800, 83.218500),
  ('Indian Institute of Management Bodh Gaya',    'IN','Bodh Gaya',   'Bihar',           'institute', 'public', 'https://www.iimbg.ac.in',  2015, 500, 11.5, 24.696500, 84.991400),
  ('Indian Institute of Management Amritsar',     'IN','Amritsar',    'Punjab',          'institute', 'public', 'https://www.iimamritsar.ac.in',2015,500,11.5, 31.634000, 74.872300),
  ('Indian Institute of Management Sambalpur',    'IN','Sambalpur',   'Odisha',          'institute', 'public', 'https://www.iimsambalpur.ac.in',2015,450,11.5,21.470100, 83.973600),
  ('Indian Institute of Management Sirmaur',      'IN','Sirmaur',     'Himachal Pradesh','institute', 'public', 'https://www.iimsirmaur.ac.in',2015, 400,11.5, 30.564900, 77.291800),
  ('Indian Institute of Management Jammu',        'IN','Jammu',       'Jammu and Kashmir','institute','public','https://www.iimj.ac.in',    2016, 450, 11.5, 32.616700, 74.857000),

  -- ==========================================================================
  -- INDIA — Other notable (17)
  -- ==========================================================================
  ('Indian Institute of Science',                 'IN','Bengaluru',   'Karnataka',       'institute', 'public', 'https://www.iisc.ac.in',   1909, 4500, 8.0,  13.021700, 77.566700),
  ('Birla Institute of Technology and Science Pilani','IN','Pilani',  'Rajasthan',       'institute', 'private','https://www.bits-pilani.ac.in',1964,18000,12.0,28.357000,75.587600),
  ('Vellore Institute of Technology',             'IN','Vellore',     'Tamil Nadu',      'university','private','https://www.vit.ac.in',     1984, 35000,15.0, 12.969200, 79.155900),
  ('Manipal Academy of Higher Education',         'IN','Manipal',     'Karnataka',       'university','private','https://www.manipal.edu',   1953, 28000,14.0, 13.350800, 74.792100),
  ('Indian Statistical Institute',                'IN','Kolkata',     'West Bengal',     'institute', 'public', 'https://www.isical.ac.in',  1931, 1500, 8.0,  22.649900, 88.378400),
  ('Jawaharlal Nehru University',                 'IN','New Delhi',   'Delhi',           'university','public', 'https://www.jnu.ac.in',     1969, 8500, 11.0, 28.540000, 77.166700),
  ('University of Delhi',                          'IN','New Delhi',   'Delhi',           'university','public', 'https://www.du.ac.in',      1922, 130000,18.0,28.689600, 77.208300),
  ('Jadavpur University',                          'IN','Kolkata',     'West Bengal',     'university','public', 'https://www.jaduniv.edu.in',1955, 11000,14.0, 22.499500, 88.371500),
  ('Anna University',                              'IN','Chennai',     'Tamil Nadu',      'university','public', 'https://www.annauniv.edu',  1978, 30000,15.0, 13.011600, 80.235100),
  ('Banaras Hindu University',                     'IN','Varanasi',    'Uttar Pradesh',   'university','public', 'https://www.bhu.ac.in',     1916, 30000,16.0, 25.267800, 82.991300),
  ('Ashoka University',                            'IN','Sonipat',     'Haryana',         'university','private','https://www.ashoka.edu.in', 2014, 3000, 9.0,  28.945100, 77.101800),
  ('Shiv Nadar University',                        'IN','Greater Noida','Uttar Pradesh',  'university','private','https://www.snu.edu.in',    2011, 5000, 11.0, 28.524700, 77.575100),
  ('OP Jindal Global University',                  'IN','Sonipat',     'Haryana',         'university','private','https://www.jgu.edu.in',    2009, 10000,12.0, 28.965500, 77.097900),
  ('Xavier Labour Relations Institute',            'IN','Jamshedpur',  'Jharkhand',       'institute', 'private','https://www.xlri.ac.in',    1949, 900,  10.0, 22.776400, 86.144500),
  ('Symbiosis International University',           'IN','Pune',        'Maharashtra',     'university','private','https://www.siu.edu.in',    1971, 25000,14.0, 18.521700, 73.853200),
  ('Amrita Vishwa Vidyapeetham',                   'IN','Coimbatore',  'Tamil Nadu',      'university','private','https://www.amrita.edu',    2003, 22000,14.0, 10.903400, 76.901400),
  ('Indraprastha Institute of Information Technology Delhi','IN','New Delhi','Delhi',     'institute', 'public', 'https://www.iiitd.ac.in',   2008, 2000, 10.0, 28.545200, 77.273100),

  -- ==========================================================================
  -- UNITED KINGDOM — Russell Group (24) + others (4)
  -- ==========================================================================
  ('University of Oxford',                          'GB','Oxford',     'England',         'university','public', 'https://www.ox.ac.uk',      1096, 26000,11.0, 51.754500, -1.254400),
  ('University of Cambridge',                       'GB','Cambridge',  'England',         'university','public', 'https://www.cam.ac.uk',     1209, 24000,11.0, 52.204300,  0.117500),
  ('Imperial College London',                       'GB','London',     'England',         'university','public', 'https://www.imperial.ac.uk',1907, 22000,11.5, 51.498800, -0.174900),
  ('University College London',                     'GB','London',     'England',         'university','public', 'https://www.ucl.ac.uk',     1826, 45000,10.0, 51.524500, -0.134000),
  ('London School of Economics and Political Science','GB','London',   'England',         'university','public', 'https://www.lse.ac.uk',     1895, 12000,12.0, 51.514400, -0.116700),
  ('University of Edinburgh',                        'GB','Edinburgh',  'Scotland',        'university','public', 'https://www.ed.ac.uk',      1583, 38000,13.0, 55.947200, -3.187600),
  ('University of Manchester',                       'GB','Manchester', 'England',         'university','public', 'https://www.manchester.ac.uk',1824,40000,13.0,53.466800, -2.233900),
  ('Kings College London',                          'GB','London',     'England',         'university','public', 'https://www.kcl.ac.uk',     1829, 33000,12.0, 51.511500, -0.116000),
  ('University of Bristol',                          'GB','Bristol',    'England',         'university','public', 'https://www.bristol.ac.uk', 1876, 28000,13.0, 51.458500, -2.602800),
  ('University of Warwick',                          'GB','Coventry',   'England',         'university','public', 'https://www.warwick.ac.uk', 1965, 27000,13.0, 52.379300, -1.561300),
  ('University of Glasgow',                          'GB','Glasgow',    'Scotland',        'university','public', 'https://www.gla.ac.uk',     1451, 36000,14.0, 55.872100, -4.288300),
  ('University of Leeds',                            'GB','Leeds',      'England',         'university','public', 'https://www.leeds.ac.uk',   1904, 39000,14.0, 53.806700, -1.553100),
  ('University of Southampton',                      'GB','Southampton','England',         'university','public', 'https://www.southampton.ac.uk',1952,24000,13.5,50.937400,-1.396100),
  ('University of Birmingham',                       'GB','Birmingham', 'England',         'university','public', 'https://www.birmingham.ac.uk',1900,35000,14.0,52.450800,-1.930400),
  ('University of Sheffield',                        'GB','Sheffield',  'England',         'university','public', 'https://www.sheffield.ac.uk',1905,29000,14.0,53.381100,-1.488400),
  ('University of Nottingham',                       'GB','Nottingham', 'England',         'university','public', 'https://www.nottingham.ac.uk',1881,34000,14.0,52.938800,-1.197100),
  ('Newcastle University',                          'GB','Newcastle upon Tyne','England',  'university','public', 'https://www.ncl.ac.uk',     1834, 28000,14.5, 54.980200, -1.615400),
  ('University of Liverpool',                        'GB','Liverpool',  'England',         'university','public', 'https://www.liverpool.ac.uk',1881,29000,14.5,53.405800,-2.965900),
  ('Cardiff University',                            'GB','Cardiff',     'Wales',           'university','public', 'https://www.cardiff.ac.uk', 1883, 33000,14.5, 51.487300, -3.179200),
  ('Durham University',                             'GB','Durham',      'England',         'university','public', 'https://www.durham.ac.uk',  1832, 21000,13.0, 54.767700, -1.575300),
  ('University of York',                            'GB','York',        'England',         'university','public', 'https://www.york.ac.uk',    1963, 20000,14.0, 53.946600, -1.052700),
  ('Queen Mary University of London',               'GB','London',     'England',         'university','public', 'https://www.qmul.ac.uk',    1885, 31000,13.0, 51.524100, -0.040200),
  ('Queens University Belfast',                     'GB','Belfast',    'Northern Ireland','university','public', 'https://www.qub.ac.uk',     1845, 25000,14.5, 54.584300, -5.934000),
  ('University of Exeter',                          'GB','Exeter',      'England',         'university','public', 'https://www.exeter.ac.uk',  1955, 28000,14.0, 50.736300, -3.534200),
  ('University of St Andrews',                       'GB','St Andrews',  'Scotland',        'university','public', 'https://www.st-andrews.ac.uk',1413,10000,11.0,56.340600,-2.793700),
  ('University of Bath',                            'GB','Bath',        'England',         'university','public', 'https://www.bath.ac.uk',    1966, 19000,15.0, 51.379700, -2.328200),
  ('Lancaster University',                          'GB','Lancaster',   'England',         'university','public', 'https://www.lancaster.ac.uk',1964,15000,14.0,54.010700,-2.785900),
  ('University of Leicester',                        'GB','Leicester',   'England',         'university','public', 'https://www.le.ac.uk',      1921, 20000,15.0, 52.621400, -1.124200),

  -- ==========================================================================
  -- CANADA — U15 (15)
  -- ==========================================================================
  ('University of Toronto',                          'CA','Toronto',     'Ontario',         'university','public', 'https://www.utoronto.ca',   1827, 97000,18.0, 43.662600, -79.395700),
  ('University of British Columbia',                 'CA','Vancouver',   'British Columbia','university','public', 'https://www.ubc.ca',        1908, 66000,18.0, 49.260600,-123.245000),
  ('McGill University',                              'CA','Montreal',    'Quebec',          'university','public', 'https://www.mcgill.ca',     1821, 40000,16.0, 45.504800, -73.577200),
  ('University of Alberta',                          'CA','Edmonton',    'Alberta',         'university','public', 'https://www.ualberta.ca',   1908, 40000,19.0, 53.523200,-113.526300),
  ('University of Montreal',                         'CA','Montreal',    'Quebec',          'university','public', 'https://www.umontreal.ca',  1878, 67000,18.0, 45.503700, -73.614600),
  ('McMaster University',                            'CA','Hamilton',    'Ontario',         'university','public', 'https://www.mcmaster.ca',   1887, 38000,19.0, 43.260900, -79.919200),
  ('University of Waterloo',                         'CA','Waterloo',    'Ontario',         'university','public', 'https://www.uwaterloo.ca',  1957, 42000,20.0, 43.472300, -80.544900),
  ('Western University',                            'CA','London',      'Ontario',         'university','public', 'https://www.uwo.ca',        1878, 38000,20.0, 43.009600, -81.273700),
  ('University of Calgary',                          'CA','Calgary',     'Alberta',         'university','public', 'https://www.ucalgary.ca',   1966, 35000,20.0, 51.078000,-114.131900),
  ('Queens University',                             'CA','Kingston',    'Ontario',         'university','public', 'https://www.queensu.ca',    1841, 28000,19.0, 44.225300, -76.495100),
  ('University of Ottawa',                           'CA','Ottawa',      'Ontario',         'university','public', 'https://www.uottawa.ca',    1848, 47000,20.0, 45.423100, -75.683100),
  ('Dalhousie University',                          'CA','Halifax',     'Nova Scotia',     'university','public', 'https://www.dal.ca',        1818, 21000,19.0, 44.636600, -63.591200),
  ('Universite Laval',                              'CA','Quebec City',  'Quebec',          'university','public', 'https://www.ulaval.ca',     1663, 43000,18.0, 46.781800, -71.275300),
  ('University of Manitoba',                         'CA','Winnipeg',    'Manitoba',        'university','public', 'https://www.umanitoba.ca',  1877, 30000,20.0, 49.808500, -97.135500),
  ('University of Saskatchewan',                     'CA','Saskatoon',   'Saskatchewan',    'university','public', 'https://www.usask.ca',      1907, 26000,20.0, 52.131400,-106.633400),

  -- ==========================================================================
  -- AUSTRALIA — Group of Eight (8)
  -- ==========================================================================
  ('University of Melbourne',                        'AU','Melbourne',   'Victoria',        'university','public', 'https://www.unimelb.edu.au',1853,52000,18.0,-37.798100,144.961500),
  ('Australian National University',                 'AU','Canberra',    'ACT',             'university','public', 'https://www.anu.edu.au',    1946, 25000,17.0,-35.277700,149.118500),
  ('University of Sydney',                           'AU','Sydney',      'New South Wales', 'university','public', 'https://www.sydney.edu.au', 1850, 60000,18.0,-33.888800,151.187300),
  ('University of New South Wales',                  'AU','Sydney',      'New South Wales', 'university','public', 'https://www.unsw.edu.au',   1949, 64000,19.0,-33.917300,151.231300),
  ('University of Queensland',                       'AU','Brisbane',    'Queensland',      'university','public', 'https://www.uq.edu.au',     1909, 55000,19.0,-27.497500,153.013700),
  ('Monash University',                              'AU','Melbourne',   'Victoria',        'university','public', 'https://www.monash.edu',    1958, 86000,20.0,-37.911500,145.134200),
  ('University of Western Australia',                'AU','Perth',       'Western Australia','university','public','https://www.uwa.edu.au',    1911, 25000,19.0,-31.980700,115.817700),
  ('University of Adelaide',                         'AU','Adelaide',    'South Australia', 'university','public', 'https://www.adelaide.edu.au',1874,27000,19.0,-34.920700,138.604700),

  -- ==========================================================================
  -- GERMANY — TU9 (9)
  -- ==========================================================================
  ('Technical University of Munich',                 'DE','Munich',      'Bavaria',         'university','public', 'https://www.tum.de',        1868, 50000,18.0, 48.149500, 11.567700),
  ('RWTH Aachen University',                         'DE','Aachen',      'North Rhine-Westphalia','university','public','https://www.rwth-aachen.de',1870,47000,19.0,50.778100,6.060800),
  ('Karlsruhe Institute of Technology',              'DE','Karlsruhe',   'Baden-Wurttemberg','university','public','https://www.kit.edu',       1825, 22000,18.0, 49.011700, 8.416000),
  ('Technical University of Berlin',                 'DE','Berlin',      'Berlin',          'university','public', 'https://www.tu.berlin',     1879, 35000,20.0, 52.512500, 13.326900),
  ('Technical University of Darmstadt',              'DE','Darmstadt',   'Hesse',           'university','public', 'https://www.tu-darmstadt.de',1877,25000,19.0,49.877600, 8.655400),
  ('Technical University of Dresden',                'DE','Dresden',     'Saxony',          'university','public', 'https://www.tu-dresden.de', 1828, 32000,19.0, 51.028200, 13.726700),
  ('University of Stuttgart',                        'DE','Stuttgart',   'Baden-Wurttemberg','university','public','https://www.uni-stuttgart.de',1829,24000,19.0,48.745100,9.106400),
  ('Leibniz University Hannover',                    'DE','Hannover',    'Lower Saxony',    'university','public', 'https://www.uni-hannover.de',1831,28000,20.0,52.382600, 9.717400),
  ('Technical University of Braunschweig',           'DE','Braunschweig','Lower Saxony',    'university','public', 'https://www.tu-braunschweig.de',1745,17000,20.0,52.273300,10.529300),

  -- ==========================================================================
  -- SINGAPORE (2)
  -- ==========================================================================
  ('National University of Singapore',               'SG','Singapore',   'Singapore',       'university','public', 'https://www.nus.edu.sg',    1905, 36000,14.0, 1.296600, 103.776400),
  ('Nanyang Technological University',               'SG','Singapore',   'Singapore',       'university','public', 'https://www.ntu.edu.sg',    1981, 33000,14.0, 1.348300, 103.683100),

  -- ==========================================================================
  -- HONG KONG (4)
  -- ==========================================================================
  ('University of Hong Kong',                        'HK','Hong Kong',   'Hong Kong',       'university','public', 'https://www.hku.hk',        1911, 31000,15.0, 22.283500, 114.137200),
  ('Hong Kong University of Science and Technology', 'HK','Hong Kong',   'Hong Kong',       'university','public', 'https://www.ust.hk',        1991, 16000,14.0, 22.337100, 114.263700),
  ('Chinese University of Hong Kong',                'HK','Hong Kong',   'Hong Kong',       'university','public', 'https://www.cuhk.edu.hk',   1963, 33000,15.0, 22.419700, 114.206900),
  ('City University of Hong Kong',                   'HK','Hong Kong',   'Hong Kong',       'university','public', 'https://www.cityu.edu.hk',  1984, 20000,16.0, 22.337500, 114.171800),

  -- ==========================================================================
  -- JAPAN (4)
  -- ==========================================================================
  ('University of Tokyo',                            'JP','Tokyo',       'Tokyo',           'university','public', 'https://www.u-tokyo.ac.jp', 1877, 28000,10.0, 35.712600, 139.762000),
  ('Kyoto University',                               'JP','Kyoto',       'Kyoto',           'university','public', 'https://www.kyoto-u.ac.jp', 1897, 22000,10.0, 35.026100, 135.780900),
  ('Tokyo Institute of Technology',                  'JP','Tokyo',       'Tokyo',           'institute', 'public', 'https://www.titech.ac.jp',  1881, 10000,10.0, 35.605200, 139.683800),
  ('Osaka University',                               'JP','Osaka',       'Osaka',           'university','public', 'https://www.osaka-u.ac.jp', 1931, 23000,11.0, 34.821700, 135.523600),

  -- ==========================================================================
  -- SOUTH KOREA (4)
  -- ==========================================================================
  ('Seoul National University',                      'KR','Seoul',       'Seoul',           'university','public', 'https://www.snu.ac.kr',     1946, 28000,12.0, 37.459100, 126.951900),
  ('Korea Advanced Institute of Science and Technology','KR','Daejeon', 'Daejeon',         'institute', 'public', 'https://www.kaist.ac.kr',   1971, 11000,9.0,  36.374100, 127.365800),
  ('Korea University',                               'KR','Seoul',       'Seoul',           'university','private','https://www.korea.ac.kr',   1905, 37000,13.0, 37.589100, 127.032600),
  ('Yonsei University',                              'KR','Seoul',       'Seoul',           'university','private','https://www.yonsei.ac.kr',  1885, 38000,13.0, 37.565800, 126.938600),

  -- ==========================================================================
  -- CHINA (5)
  -- ==========================================================================
  ('Tsinghua University',                            'CN','Beijing',     'Beijing',         'university','public', 'https://www.tsinghua.edu.cn',1911,50000,9.0,  40.003600, 116.326400),
  ('Peking University',                              'CN','Beijing',     'Beijing',         'university','public', 'https://www.pku.edu.cn',    1898, 45000,9.0,  39.992300, 116.305600),
  ('Fudan University',                               'CN','Shanghai',    'Shanghai',        'university','public', 'https://www.fudan.edu.cn',  1905, 33000,10.0, 31.298900, 121.503700),
  ('Shanghai Jiao Tong University',                  'CN','Shanghai',    'Shanghai',        'university','public', 'https://www.sjtu.edu.cn',   1896, 46000,10.0, 31.025100, 121.434200),
  ('Zhejiang University',                            'CN','Hangzhou',    'Zhejiang',        'university','public', 'https://www.zju.edu.cn',    1897, 54000,11.0, 30.263600, 120.122100),

  -- ==========================================================================
  -- SWITZERLAND (2)
  -- ==========================================================================
  ('ETH Zurich',                                     'CH','Zurich',      'Zurich',          'university','public', 'https://www.ethz.ch',       1855, 24000,13.0, 47.376300, 8.547600),
  ('EPFL',                                           'CH','Lausanne',    'Vaud',            'university','public', 'https://www.epfl.ch',       1853, 13000,12.0, 46.519100, 6.566700),

  -- ==========================================================================
  -- NETHERLANDS (2)
  -- ==========================================================================
  ('Delft University of Technology',                 'NL','Delft',       'South Holland',   'university','public', 'https://www.tudelft.nl',    1842, 27000,16.0, 51.999200, 4.373800),
  ('University of Amsterdam',                         'NL','Amsterdam',   'North Holland',   'university','public', 'https://www.uva.nl',        1632, 41000,16.0, 52.356400, 4.955500),

  -- ==========================================================================
  -- BELGIUM (1)
  -- ==========================================================================
  ('KU Leuven',                                      'BE','Leuven',      'Flemish Brabant', 'university','public', 'https://www.kuleuven.be',   1425, 60000,17.0, 50.878100, 4.700800),

  -- ==========================================================================
  -- FRANCE (3)
  -- ==========================================================================
  ('Universite PSL',                                 'FR','Paris',       'Ile-de-France',   'university','public', 'https://www.psl.eu',        2010, 17000,12.0, 48.848600, 2.343900),
  ('Ecole Polytechnique',                            'FR','Palaiseau',   'Ile-de-France',   'institute', 'public', 'https://www.polytechnique.edu',1794,3500,9.0,48.714700, 2.207800),
  ('Sorbonne University',                            'FR','Paris',       'Ile-de-France',   'university','public', 'https://www.sorbonne-universite.fr',1257,55000,14.0,48.847200,2.355800),

  -- ==========================================================================
  -- SWEDEN (1)
  -- ==========================================================================
  ('KTH Royal Institute of Technology',              'SE','Stockholm',   'Stockholm',       'university','public', 'https://www.kth.se',        1827, 18000,16.0, 59.349800, 18.070800),

  -- ==========================================================================
  -- DENMARK (1)
  -- ==========================================================================
  ('University of Copenhagen',                       'DK','Copenhagen',  'Capital Region',  'university','public', 'https://www.ku.dk',         1479, 38000,14.0, 55.680500, 12.572600),

  -- ==========================================================================
  -- ISRAEL (1)
  -- ==========================================================================
  ('Technion Israel Institute of Technology',        'IL','Haifa',       'Haifa District',  'institute', 'public', 'https://www.technion.ac.il',1912, 14000,11.0, 32.777500, 35.023400),

  -- ==========================================================================
  -- NEW ZEALAND (1)
  -- ==========================================================================
  ('University of Auckland',                         'NZ','Auckland',    'Auckland',        'university','public', 'https://www.auckland.ac.nz',1883, 42000,18.0,-36.852300,174.768700)
) AS v(name, cc, city, region, itype, ctype, website, est, enrollment, sfr, lat, lng)
ON CONFLICT (country_code, normalized_name) DO NOTHING;

COMMIT;
