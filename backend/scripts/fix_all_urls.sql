-- Fix common incorrect domain patterns in college URLs

-- Arizona State University
UPDATE colleges 
SET official_website = REPLACE(official_website, 'arizonastateuniversity.edu', 'asu.edu'),
    admissions_url = REPLACE(admissions_url, 'arizonastateuniversity.edu', 'asu.edu')
WHERE official_website LIKE '%arizonastateuniversity.edu%' 
   OR admissions_url LIKE '%arizonastateuniversity.edu%';

-- MIT
UPDATE colleges 
SET official_website = REPLACE(official_website, 'massachusettsinstituteoftechnology.edu', 'mit.edu'),
    admissions_url = REPLACE(admissions_url, 'massachusettsinstituteoftechnology.edu', 'mit.edu')
WHERE official_website LIKE '%massachusettsinstituteoftechnology.edu%' 
   OR admissions_url LIKE '%massachusettsinstituteoftechnology.edu%';

-- Stanford
UPDATE colleges 
SET official_website = REPLACE(official_website, 'stanforduniversity.edu', 'stanford.edu'),
    admissions_url = REPLACE(admissions_url, 'stanforduniversity.edu', 'stanford.edu')
WHERE official_website LIKE '%stanforduniversity.edu%' 
   OR admissions_url LIKE '%stanforduniversity.edu%';

-- Harvard
UPDATE colleges 
SET official_website = REPLACE(official_website, 'harvarduniversity.edu', 'harvard.edu'),
    admissions_url = REPLACE(admissions_url, 'harvarduniversity.edu', 'harvard.edu')
WHERE official_website LIKE '%harvarduniversity.edu%' 
   OR admissions_url LIKE '%harvarduniversity.edu%';

-- Oxford
UPDATE colleges 
SET official_website = REPLACE(official_website, 'universityofoxford.ac.uk', 'ox.ac.uk'),
    admissions_url = REPLACE(admissions_url, 'universityofoxford.ac.uk', 'ox.ac.uk')
WHERE official_website LIKE '%universityofoxford.ac.uk%' 
   OR admissions_url LIKE '%universityofoxford.ac.uk%';

-- Cambridge
UPDATE colleges 
SET official_website = REPLACE(official_website, 'universityofcambridge.ac.uk', 'cam.ac.uk'),
    admissions_url = REPLACE(admissions_url, 'universityofcambridge.ac.uk', 'cam.ac.uk')
WHERE official_website LIKE '%universityofcambridge.ac.uk%' 
   OR admissions_url LIKE '%universityofcambridge.ac.uk%';

-- Yale
UPDATE colleges 
SET official_website = REPLACE(official_website, 'yaleuniversity.edu', 'yale.edu'),
    admissions_url = REPLACE(admissions_url, 'yaleuniversity.edu', 'yale.edu')
WHERE official_website LIKE '%yaleuniversity.edu%' 
   OR admissions_url LIKE '%yaleuniversity.edu%';

-- Princeton
UPDATE colleges 
SET official_website = REPLACE(official_website, 'princetonuniversity.edu', 'princeton.edu'),
    admissions_url = REPLACE(admissions_url, 'princetonuniversity.edu', 'princeton.edu')
WHERE official_website LIKE '%princetonuniversity.edu%' 
   OR admissions_url LIKE '%princetonuniversity.edu%';

-- Columbia
UPDATE colleges 
SET official_website = REPLACE(official_website, 'columbiauniversity.edu', 'columbia.edu'),
    admissions_url = REPLACE(admissions_url, 'columbiauniversity.edu', 'columbia.edu')
WHERE official_website LIKE '%columbiauniversity.edu%' 
   OR admissions_url LIKE '%columbiauniversity.edu%';

-- UC Berkeley
UPDATE colleges 
SET official_website = REPLACE(official_website, 'universityofcaliforniaberkeley.edu', 'berkeley.edu'),
    admissions_url = REPLACE(admissions_url, 'universityofcaliforniaberkeley.edu', 'berkeley.edu')
WHERE official_website LIKE '%universityofcaliforniaberkeley.edu%' 
   OR admissions_url LIKE '%universityofcaliforniaberkeley.edu%';

SELECT 'URLs fixed successfully';
