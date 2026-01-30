// Generate remaining colleges to reach 2500+
const fs = require('fs');
const path = require('path');

const remainingColleges = [];

// More US Liberal Arts Colleges
const liberalArtsColleges = [
  'Allegheny College', 'Antioch College', 'Austin College', 'Beloit College', 'Berry College',
  'Blackburn College', 'Bridgewater College', 'Buena Vista University', 'Canisius College', 'Carroll College',
  'Carthage College', 'Cedar Crest College', 'Centenary College of Louisiana', 'Central College', 'Centre College',
  'Coe College', 'College of Wooster', 'Colorado College', 'Cornell College', 'Davis and Elkins College',
  'Doane University', 'Drew University', 'Drury University', 'Earlham College', 'Eckerd College',
  'Elizabethtown College', 'Elmhurst University', 'Elon University', 'Emory and Henry College', 'Erskine College',
  'Evergreen State College', 'Flagler College', 'Florida Southern College', 'Franciscan University', 'Franklin College',
  'Goucher College', 'Grove City College', 'Guilford College', 'Gustavus Adolphus College', 'Hampden-Sydney College',
  'Hanover College', 'Hartwick College', 'Hastings College', 'Hendrix College', 'High Point University',
  'Hiram College', 'Hood College', 'Hope College', 'Houghton College', 'Illinois College',
  'Illinois Wesleyan University', 'Ithaca College', 'Juniata College', 'Kalamazoo College', 'Knox College',
  'Lake Forest College', 'Lebanon Valley College', 'Lewis and Clark College', 'Linfield University', 'Loras College',
  'Loyola Marymount University', 'Luther College', 'Lycoming College', 'Lyon College', 'Manchester University',
  'Marietta College', 'Maryville College', 'McDaniel College', 'Millsaps College', 'Monmouth College',
  'Moravian University', 'Muhlenberg College', 'Nebraska Wesleyan University', 'New College of Florida', 'Oglethorpe University',
  'Ohio Northern University', 'Ohio Wesleyan University', 'Otterbein University', 'Pacific Lutheran University', 'Pacific University',
  'Presbyterian College', 'Principia College', 'Roanoke College', 'Rollins College', 'Saint Johns University Minnesota',
  'Saint Josephs University', 'Saint Lawrence University', 'Saint Marys College', 'Saint Michaels College', 'Saint Norbert College',
  'Saint Olaf College', 'Saint Thomas University', 'Saint Vincent College', 'Salem College', 'Sewanee University of the South',
  'Simpson College', 'Southwestern University', 'Spelman College', 'Spring Hill College', 'Stetson University',
  'Stonehill College', 'Sweet Briar College', 'Transylvania University', 'Trinity University', 'Union College',
  'University of Puget Sound', 'University of Redlands', 'University of the South', 'Ursinus College', 'Virginia Wesleyan University',
  'Wabash College', 'Warren Wilson College', 'Wartburg College', 'Washington College', 'Washington and Jefferson College',
  'Washington and Lee University', 'Wells College', 'Westminster College', 'Wheaton College Illinois', 'Whitman College',
  'Whittier College', 'Willamette University', 'William Jewell College', 'Wittenberg University', 'Wofford College'
];

liberalArtsColleges.forEach(name => {
  remainingColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Private',
    Key_Programs_Specializations: 'Liberal Arts, Sciences, Humanities'
  });
});

// More international universities
const moreInternational = [
  // Russia
  { name: 'Moscow State University', country: 'Russia', city: 'Moscow' },
  { name: 'Saint Petersburg State University', country: 'Russia', city: 'Saint Petersburg' },
  { name: 'Novosibirsk State University', country: 'Russia', city: 'Novosibirsk' },
  { name: 'Bauman Moscow State Technical University', country: 'Russia', city: 'Moscow' },
  { name: 'ITMO University', country: 'Russia', city: 'Saint Petersburg' },
  { name: 'HSE University', country: 'Russia', city: 'Moscow' },
  { name: 'Moscow Institute of Physics and Technology', country: 'Russia', city: 'Moscow' },
  { name: 'Kazan Federal University', country: 'Russia', city: 'Kazan' },
  { name: 'Tomsk State University', country: 'Russia', city: 'Tomsk' },
  { name: 'Ural Federal University', country: 'Russia', city: 'Yekaterinburg' },
  // More Pakistan
  { name: 'University of Punjab', country: 'Pakistan', city: 'Lahore' },
  { name: 'University of Karachi', country: 'Pakistan', city: 'Karachi' },
  { name: 'Quaid-i-Azam University', country: 'Pakistan', city: 'Islamabad' },
  { name: 'LUMS', country: 'Pakistan', city: 'Lahore' },
  { name: 'NUST', country: 'Pakistan', city: 'Islamabad' },
  { name: 'COMSATS University', country: 'Pakistan', city: 'Islamabad' },
  { name: 'University of Engineering and Technology Lahore', country: 'Pakistan', city: 'Lahore' },
  { name: 'Aga Khan University', country: 'Pakistan', city: 'Karachi' },
  { name: 'IBA Karachi', country: 'Pakistan', city: 'Karachi' },
  { name: 'FAST-NUCES', country: 'Pakistan', city: 'Islamabad' },
  // Bangladesh
  { name: 'University of Dhaka', country: 'Bangladesh', city: 'Dhaka' },
  { name: 'Bangladesh University of Engineering and Technology', country: 'Bangladesh', city: 'Dhaka' },
  { name: 'North South University', country: 'Bangladesh', city: 'Dhaka' },
  { name: 'BRAC University', country: 'Bangladesh', city: 'Dhaka' },
  { name: 'Independent University Bangladesh', country: 'Bangladesh', city: 'Dhaka' },
  // Sri Lanka
  { name: 'University of Colombo', country: 'Sri Lanka', city: 'Colombo' },
  { name: 'University of Peradeniya', country: 'Sri Lanka', city: 'Peradeniya' },
  { name: 'University of Moratuwa', country: 'Sri Lanka', city: 'Moratuwa' },
  // Nepal
  { name: 'Tribhuvan University', country: 'Nepal', city: 'Kathmandu' },
  { name: 'Kathmandu University', country: 'Nepal', city: 'Dhulikhel' },
  // More African countries
  { name: 'University of Cape Verde', country: 'Cape Verde', city: 'Praia' },
  { name: 'Eduardo Mondlane University', country: 'Mozambique', city: 'Maputo' },
  { name: 'University of Botswana', country: 'Botswana', city: 'Gaborone' },
  { name: 'University of Namibia', country: 'Namibia', city: 'Windhoek' },
  { name: 'National University of Lesotho', country: 'Lesotho', city: 'Roma' },
  { name: 'University of Swaziland', country: 'Eswatini', city: 'Kwaluseni' },
  { name: 'University of Mauritius', country: 'Mauritius', city: 'Moka' },
  { name: 'University of Zimbabwe', country: 'Zimbabwe', city: 'Harare' },
  { name: 'University of Zambia', country: 'Zambia', city: 'Lusaka' },
  { name: 'Makerere University', country: 'Uganda', city: 'Kampala' },
  // Caribbean
  { name: 'University of the West Indies', country: 'Jamaica', city: 'Kingston' },
  { name: 'University of the West Indies Cave Hill', country: 'Barbados', city: 'Bridgetown' },
  { name: 'University of the West Indies St. Augustine', country: 'Trinidad and Tobago', city: 'St. Augustine' },
  { name: 'University of Technology Jamaica', country: 'Jamaica', city: 'Kingston' },
  // More Latin American
  { name: 'Universidad de Guadalajara', country: 'Mexico', city: 'Guadalajara' },
  { name: 'Universidad Veracruzana', country: 'Mexico', city: 'Xalapa' },
  { name: 'Universidad Autónoma de Baja California', country: 'Mexico', city: 'Mexicali' },
  { name: 'Universidad Autónoma de San Luis Potosí', country: 'Mexico', city: 'San Luis Potosí' },
  { name: 'Universidad Autónoma de Yucatán', country: 'Mexico', city: 'Mérida' }
];

moreInternational.forEach(u => {
  remainingColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Sciences, Engineering, Medicine, Humanities'
  });
});

// More community colleges
const finalCommunityColleges = [
  'Collin College', 'Brookhaven College', 'El Centro College', 'Mountain View College', 'North Lake College',
  'Richland College', 'Cedar Valley College', 'Eastfield College', 'Houston Community College Northwest',
  'Houston Community College Southeast', 'Houston Community College Central', 'Houston Community College Northeast',
  'San Jacinto College', 'Blinn College', 'Brazosport College', 'Galveston College', 'Lee College',
  'Alvin Community College', 'Wharton County Junior College', 'Victoria College', 'Del Mar College',
  'South Texas College', 'Texas Southmost College', 'Laredo College', 'El Paso Community College',
  'Odessa College', 'Midland College', 'Howard College', 'Western Texas College', 'Cisco College',
  'Weatherford College', 'North Central Texas College', 'Grayson College', 'Paris Junior College',
  'Northeast Texas Community College', 'Panola College', 'Kilgore College', 'Tyler Junior College',
  'Trinity Valley Community College', 'Navarro College', 'Hill College', 'McLennan Community College',
  'Temple College', 'Central Texas College', 'Blinn College Bryan', 'Angelina College', 'Texarkana College'
];

finalCommunityColleges.forEach(name => {
  remainingColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Texas',
    City: 'Various',
    Institution_Type: 'Community',
    Key_Programs_Specializations: 'Transfer Programs, Career Training'
  });
});

console.log(`Generated ${remainingColleges.length} remaining colleges`);

const outputPath = path.join(__dirname, '../data/colleges/remaining_colleges.json');
fs.writeFileSync(outputPath, JSON.stringify(remainingColleges, null, 2));
console.log(`Written to: ${outputPath}`);
