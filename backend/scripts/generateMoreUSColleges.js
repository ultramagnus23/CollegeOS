// Generate more US colleges to reach 2500+
const fs = require('fs');
const path = require('path');

const moreUSColleges = [];

// More state university campuses
const stateSystemsExpanded = [
  // California State University full system
  'Cal State LA', 'Cal State Fullerton', 'Cal State Long Beach', 'Cal State Northridge', 'Cal State Dominguez Hills',
  'Cal State San Bernardino', 'Cal State Fresno', 'Cal State Bakersfield', 'Cal State Stanislaus', 'Cal State East Bay',
  'Cal State Monterey Bay', 'Cal State Channel Islands', 'Cal State Maritime Academy', 'Cal State San Marcos', 'Humboldt State',
  // University of Wisconsin System
  'UW Oshkosh', 'UW La Crosse', 'UW Eau Claire', 'UW Whitewater', 'UW Stevens Point', 'UW Stout', 'UW Superior', 'UW Platteville',
  'UW Parkside', 'UW Green Bay', 'UW River Falls',
  // University of Minnesota System  
  'UMN Duluth', 'UMN Morris', 'UMN Crookston', 'UMN Rochester',
  // SUNY Full System
  'SUNY Maritime College', 'SUNY Empire State College', 'SUNY Farmingdale', 'SUNY Old Westbury', 'SUNY Canton',
  'SUNY Cobleskill', 'SUNY Delhi', 'SUNY Morrisville', 'SUNY Alfred', 'Fashion Institute of Technology',
  // Texas A&M System
  'Texas A&M Galveston', 'Texas A&M Texarkana', 'Texas A&M Central Texas', 'Texas A&M San Antonio', 'Texas A&M International',
  'West Texas A&M', 'Tarleton State', 'Prairie View A&M',
  // University of Texas System
  'UT Dallas', 'UT Arlington', 'UT San Antonio', 'UT El Paso', 'UT Tyler', 'UT Permian Basin', 'UT Rio Grande Valley',
  // Penn State Commonwealth Campuses
  'Penn State Harrisburg', 'Penn State Erie', 'Penn State Berks', 'Penn State Altoona', 'Penn State Abington',
  'Penn State Brandywine', 'Penn State Hazleton', 'Penn State Schuylkill', 'Penn State York', 'Penn State Mont Alto',
  // Ohio State Regional Campuses
  'Ohio State Lima', 'Ohio State Mansfield', 'Ohio State Marion', 'Ohio State Newark',
  // University of Colorado System
  'CU Colorado Springs', 'CU Denver', 'CU Anschutz',
  // Indiana University System
  'IU South Bend', 'IU Fort Wayne', 'IU Kokomo', 'IU Northwest', 'IU East', 'IU Southeast',
  // Purdue System
  'Purdue Fort Wayne', 'Purdue Northwest', 'Purdue Global',
  // University of Missouri System
  'UMKC', 'Missouri S&T', 'UMSL',
  // University of Connecticut Regional
  'UConn Hartford', 'UConn Stamford', 'UConn Waterbury', 'UConn Avery Point',
  // University of South Carolina System
  'USC Upstate', 'USC Aiken', 'USC Beaufort', 'USC Lancaster', 'USC Sumter',
  // University of North Carolina System
  'UNC Charlotte', 'UNC Greensboro', 'UNC Wilmington', 'UNC Asheville', 'UNC Pembroke', 'East Carolina University',
  'North Carolina A&T', 'North Carolina Central', 'Fayetteville State', 'Winston-Salem State', 'Elizabeth City State',
  'Western Carolina University', 'Appalachian State University',
  // University of Georgia System
  'Georgia State University', 'Georgia Southern University', 'Kennesaw State University', 'University of West Georgia',
  'Valdosta State University', 'Columbus State University', 'Augusta University', 'Albany State University',
  'Clayton State University', 'Fort Valley State University', 'Savannah State University', 'Georgia College',
  'Georgia Southwestern State University', 'Middle Georgia State University', 'South Georgia State College',
  // Florida State University System
  'Florida Atlantic University', 'Florida Gulf Coast University', 'Florida International University', 'Florida Polytechnic University',
  'University of West Florida', 'University of North Florida', 'New College of Florida',
  // Louisiana State University System
  'LSU Alexandria', 'LSU Eunice', 'LSU Shreveport', 'University of New Orleans',
  // University of Kentucky Regional Campuses
  // Tennessee Board of Regents
  'Middle Tennessee State', 'East Tennessee State', 'Austin Peay State', 'Tennessee Tech',
  // Alabama System
  'University of Alabama Birmingham', 'University of Alabama Huntsville', 'University of South Alabama',
  'Auburn University Montgomery', 'Troy University', 'Jacksonville State University', 'University of North Alabama',
  'University of West Alabama', 'University of Montevallo',
  // Arkansas System
  'Arkansas State University', 'University of Central Arkansas', 'Arkansas Tech University', 'University of Arkansas Fort Smith',
  'Southern Arkansas University', 'Henderson State University', 'Harding University',
  // Mississippi System
  'University of Southern Mississippi', 'Mississippi Valley State', 'Alcorn State', 'Delta State', 'Jackson State',
  // Oklahoma System
  'Oklahoma State University Tulsa', 'Rogers State University', 'Cameron University', 'Northwestern Oklahoma State',
  'Southwestern Oklahoma State', 'Northeastern State University', 'Southeastern Oklahoma State', 'East Central University',
  // Kansas System
  'Kansas State', 'Wichita State', 'Fort Hays State', 'Pittsburg State', 'Emporia State', 'Washburn University',
  // Nebraska System
  'University of Nebraska Omaha', 'University of Nebraska Kearney', 'Wayne State College', 'Chadron State', 'Peru State',
  // Iowa System
  'University of Northern Iowa', 'Iowa State University',
  // Additional state schools
  'Utah State University', 'Weber State University', 'Southern Utah University', 'Dixie State University', 'Utah Valley University',
  'Idaho State University', 'Boise State University', 'Lewis-Clark State College',
  'Montana State University Billings', 'University of Montana Western', 'Montana State University Northern',
  'Northern Arizona University', 'Grand Canyon University', 'Embry-Riddle Aeronautical University',
  'University of Nevada Reno', 'Nevada State College', 'Great Basin College',
  'New Mexico State University', 'New Mexico Highlands University', 'Western New Mexico University', 'Eastern New Mexico University',
  'University of North Dakota', 'Minot State University', 'Mayville State University', 'Valley City State University', 'Dickinson State University',
  'South Dakota State University', 'Northern State University', 'Black Hills State University', 'Dakota State University',
  'University of Wyoming Laramie',
  'University of Maine Orono', 'University of Maine Farmington', 'University of Maine Augusta', 'University of Maine Fort Kent',
  'University of New Hampshire', 'Plymouth State University', 'Keene State College', 'Granite State College',
  'University of Vermont', 'Castleton University', 'Johnson State College', 'Lyndon State College',
  'University of Rhode Island', 'Rhode Island College', 'Community College of Rhode Island',
  'University of Delaware', 'Delaware State University', 'Wesley College',
  'Towson University', 'Salisbury University', 'Frostburg State University', 'Coppin State University', 'Morgan State University',
  'George Mason University', 'James Madison University', 'Old Dominion University', 'Christopher Newport University', 'Longwood University',
  'University of Mary Washington', 'Radford University', 'Virginia Commonwealth University', 'Norfolk State University', 'Virginia State University',
  'West Virginia University Tech', 'Marshall University', 'Fairmont State University', 'Shepherd University', 'Concord University', 'Glenville State College'
];

stateSystemsExpanded.forEach(name => {
  moreUSColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Liberal Arts, Business, Education, Sciences'
  });
});

// More private colleges
const morePrivateColleges = [
  // More liberal arts
  'St. John\'s College', 'Deep Springs College', 'Sarah Lawrence College', 'Hampshire College', 'Bard College',
  'Eugene Lang College', 'Bennington College', 'Marlboro College', 'Evergreen State College', 'Warren Wilson College',
  'Agnes Scott College', 'Sweet Briar College', 'Hollins University', 'Randolph College', 'Mills College',
  'Mount Holyoke College', 'Smith College', 'Scripps College', 'Barnard College', 'Wellesley College',
  // Regional privates
  'University of Scranton', 'Wilkes University', 'Kings College', 'Misericordia University', 'Marywood University',
  'Immaculata University', 'Cabrini University', 'Widener University', 'Neumann University', 'Chestnut Hill College',
  'Gwynedd Mercy University', 'Rosemont College', 'Manor College', 'Holy Family University', 'La Salle University',
  'University of the Sciences', 'Philadelphia University', 'Arcadia University', 'Eastern University', 'Messiah College',
  'Elizabethtown College', 'Lebanon Valley College', 'Albright College', 'Moravian University', 'Cedar Crest College',
  'DeSales University', 'Muhlenberg College', 'Kutztown University', 'East Stroudsburg University', 'Bloomsburg University',
  // New England
  'University of New England', 'Husson University', 'Thomas College', 'Unity College', 'College of the Atlantic',
  'University of Maine Presque Isle', 'Maine Maritime Academy', 'Southern New Hampshire University', 'Rivier University',
  'Franklin Pierce University', 'New England College', 'Colby-Sawyer College', 'Saint Anselm College', 'Southern Connecticut State',
  'Central Connecticut State', 'Eastern Connecticut State', 'Western Connecticut State', 'Albertus Magnus College',
  'Post University', 'University of Hartford', 'Sacred Heart University', 'Fairfield University', 'University of Bridgeport',
  'Mitchell College', 'Eastern Nazarene College', 'Gordon College', 'Wheaton College Massachusetts', 'Stonehill College',
  'Merrimack College', 'Endicott College', 'Salem State University', 'Bridgewater State University', 'Fitchburg State University',
  'Framingham State University', 'Westfield State University', 'Worcester State University', 'Massachusetts College of Art',
  'Massachusetts Maritime Academy', 'MCPHS University', 'Lasell University', 'Bay State College', 'Fisher College',
  // Midwest
  'Augustana College Illinois', 'Augustana University South Dakota', 'Luther College', 'Wartburg College', 'Central College Iowa',
  'Simpson College', 'Drake University', 'Clarke University', 'Loras College', 'Buena Vista University',
  'Northwestern College Iowa', 'Dordt University', 'Morningside University', 'Briar Cliff University', 'Graceland University',
  'William Penn University', 'Grand View University', 'Iowa Wesleyan University', 'Saint Ambrose University', 'Coe College',
  'Cornell College Iowa', 'Grinnell College', 'Marycrest International University', 'Upper Iowa University', 'Ashford University',
  'Viterbo University', 'Alverno College', 'Cardinal Stritch University', 'Marian University Wisconsin', 'Edgewood College',
  'Beloit College', 'Ripon College', 'Lawrence University', 'St. Norbert College', 'Lakeland University',
  'Carthage College', 'Concordia University Wisconsin', 'Milwaukee School of Engineering', 'Marquette University', 'University of Wisconsin Milwaukee',
  // Great Lakes
  'Calvin University', 'Hope College', 'Albion College', 'Kalamazoo College', 'Hillsdale College',
  'Adrian College', 'Alma College', 'Olivet College', 'Spring Arbor University', 'Cornerstone University',
  'Aquinas College Michigan', 'Grand Valley State University', 'Ferris State University', 'Northern Michigan University', 'Lake Superior State University',
  'Saginaw Valley State University', 'Madonna University', 'Lawrence Technological University', 'University of Detroit Mercy', 'Marygrove College',
  'Siena Heights University', 'Concordia University Ann Arbor', 'Eastern Michigan University', 'Wayne State University', 'Oakland University'
];

morePrivateColleges.forEach(name => {
  moreUSColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Private',
    Key_Programs_Specializations: 'Liberal Arts, Business, Sciences, Education'
  });
});

// More community colleges across all states
const moreCommunityColleges = [
  // Arizona
  'Maricopa Community Colleges', 'Pima Community College', 'Yavapai College', 'Coconino Community College', 'Mohave Community College',
  // Colorado
  'Community College of Denver', 'Community College of Aurora', 'Arapahoe Community College', 'Red Rocks Community College', 'Front Range Community College',
  'Pikes Peak Community College', 'Pueblo Community College', 'Trinidad State College', 'Northeastern Junior College', 'Lamar Community College',
  // Nevada
  'College of Southern Nevada', 'Truckee Meadows Community College', 'Western Nevada College',
  // New Mexico
  'Central New Mexico Community College', 'San Juan College', 'Santa Fe Community College', 'Dona Ana Community College', 'Clovis Community College',
  // Utah
  'Salt Lake Community College', 'Snow College', 'LDS Business College',
  // Washington
  'Seattle Central College', 'Bellevue College', 'Edmonds College', 'Shoreline Community College', 'Green River College',
  'Highline College', 'Pierce College', 'Tacoma Community College', 'Clark College', 'Whatcom Community College',
  'Skagit Valley College', 'Everett Community College', 'Olympic College', 'South Puget Sound Community College', 'Spokane Community College',
  // Oregon
  'Portland Community College', 'Lane Community College', 'Mt. Hood Community College', 'Clackamas Community College', 'Chemeketa Community College',
  'Linn-Benton Community College', 'Central Oregon Community College', 'Rogue Community College', 'Umpqua Community College', 'Blue Mountain Community College',
  // Georgia
  'Georgia Piedmont Technical College', 'Atlanta Technical College', 'Chattahoochee Technical College', 'Georgia Northwestern Technical College', 'Gwinnett Technical College',
  // North Carolina
  'Wake Technical Community College', 'Central Piedmont Community College', 'Guilford Technical Community College', 'Fayetteville Technical Community College', 'Durham Technical Community College',
  // Virginia
  'Northern Virginia Community College', 'Tidewater Community College', 'Virginia Western Community College', 'Thomas Nelson Community College', 'J. Sargeant Reynolds Community College',
  // Maryland
  'Montgomery College', 'Prince Georges Community College', 'Anne Arundel Community College', 'Community College of Baltimore County', 'Howard Community College',
  // New Jersey
  'Raritan Valley Community College', 'County College of Morris', 'Brookdale Community College', 'Middlesex County College', 'Ocean County College',
  'Union County College', 'Hudson County Community College', 'Essex County College', 'Passaic County Community College', 'Mercer County Community College',
  // Pennsylvania
  'Community College of Philadelphia', 'Montgomery County Community College', 'Bucks County Community College', 'Delaware County Community College', 'Northampton Community College',
  'Lehigh Carbon Community College', 'Reading Area Community College', 'Harrisburg Area Community College', 'Pennsylvania Highlands Community College', 'Pittsburgh Community College',
  // Ohio
  'Cuyahoga Community College', 'Columbus State Community College', 'Sinclair Community College', 'Lorain County Community College', 'Stark State College',
  'Lakeland Community College', 'Terra State Community College', 'Owens Community College', 'Cincinnati State', 'Clark State Community College',
  // Michigan
  'Macomb Community College', 'Oakland Community College', 'Schoolcraft College', 'Henry Ford College', 'Wayne County Community College',
  'Lansing Community College', 'Grand Rapids Community College', 'Muskegon Community College', 'Jackson College', 'Kellogg Community College',
  // Illinois
  'City Colleges of Chicago', 'College of DuPage', 'Harper College', 'Elgin Community College', 'Oakton Community College',
  'Moraine Valley Community College', 'Triton College', 'College of Lake County', 'Joliet Junior College', 'Waubonsee Community College',
  // Missouri
  'St. Louis Community College', 'Metropolitan Community College Kansas City', 'State Fair Community College', 'Ozarks Technical Community College', 'Jefferson College',
  // Minnesota
  'Minneapolis Community and Technical College', 'Saint Paul College', 'Normandale Community College', 'North Hennepin Community College', 'Inver Hills Community College',
  'Century College', 'Anoka-Ramsey Community College', 'Dakota County Technical College', 'Rochester Community and Technical College', 'Minnesota State Community and Technical College'
];

moreCommunityColleges.forEach(name => {
  moreUSColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Community',
    Key_Programs_Specializations: 'Transfer Programs, Career Training, Vocational'
  });
});

console.log(`Generated ${moreUSColleges.length} additional US colleges`);

// Write to file
const outputPath = path.join(__dirname, '../data/colleges/more_us_colleges.json');
fs.writeFileSync(outputPath, JSON.stringify(moreUSColleges, null, 2));
console.log(`Written to: ${outputPath}`);
