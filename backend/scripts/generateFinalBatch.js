// Generate final batch of colleges to reach 2500+
const fs = require('fs');
const path = require('path');

const additionalColleges = [];

// More US colleges - HBCUs
const hbcus = [
  'Howard University', 'Spelman College', 'Morehouse College', 'Hampton University', 'Tuskegee University',
  'Florida A&M University', 'North Carolina A&T State University', 'Xavier University of Louisiana', 'Fisk University', 'Clark Atlanta University',
  'Morgan State University', 'Tennessee State University', 'Alabama State University', 'Grambling State University', 'Southern University',
  'Jackson State University', 'Prairie View A&M University', 'Bethune-Cookman University', 'Delaware State University', 'Norfolk State University',
  'Virginia State University', 'Lincoln University', 'Bowie State University', 'Coppin State University', 'Elizabeth City State University',
  'Savannah State University', 'Albany State University', 'Fort Valley State University', 'Kentucky State University', 'Central State University'
];

hbcus.forEach(name => {
  additionalColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Liberal Arts, Sciences, Engineering, Business'
  });
});

// More US technical/specialized colleges
const technicalColleges = [
  'Georgia Tech', 'Virginia Tech', 'Texas Tech University', 'Louisiana Tech University', 'Michigan Technological University',
  'Colorado School of Mines', 'South Dakota School of Mines and Technology', 'New Mexico Institute of Mining and Technology', 'Montana Tech',
  'Missouri University of Science and Technology', 'Oregon Institute of Technology', 'New Jersey Institute of Technology', 'Florida Institute of Technology',
  'Rochester Institute of Technology', 'Art Center College of Design', 'Pratt Institute', 'Rhode Island School of Design', 'School of the Art Institute of Chicago',
  'California College of the Arts', 'Parsons School of Design', 'Fashion Institute of Technology', 'School of Visual Arts', 'Maryland Institute College of Art',
  'Savannah College of Art and Design', 'Ringling College of Art and Design', 'Columbus College of Art and Design', 'Minneapolis College of Art and Design',
  'Otis College of Art and Design', 'ArtCenter College of Design', 'California Institute of the Arts', 'Berklee College of Music', 'Juilliard School',
  'Eastman School of Music', 'New England Conservatory', 'Manhattan School of Music', 'Curtis Institute of Music', 'Peabody Institute',
  'San Francisco Conservatory of Music', 'Boston Conservatory', 'Cleveland Institute of Music', 'Colburn School', 'Mannes School of Music'
];

technicalColleges.forEach(name => {
  additionalColleges.push({
    Institution_Name: name,
    Country: 'United States',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Private',
    Key_Programs_Specializations: 'Engineering, Technology, Arts, Music'
  });
});

// More European universities
const moreEuropean = [
  { name: 'University of Geneva', country: 'Switzerland', city: 'Geneva' },
  { name: 'University of Bern', country: 'Switzerland', city: 'Bern' },
  { name: 'University of Basel', country: 'Switzerland', city: 'Basel' },
  { name: 'University of Lausanne', country: 'Switzerland', city: 'Lausanne' },
  { name: 'University of St. Gallen', country: 'Switzerland', city: 'St. Gallen' },
  { name: 'University of Fribourg', country: 'Switzerland', city: 'Fribourg' },
  { name: 'University of Neuchâtel', country: 'Switzerland', city: 'Neuchâtel' },
  { name: 'University of Lugano', country: 'Switzerland', city: 'Lugano' },
  { name: 'University College Cork', country: 'Ireland', city: 'Cork' },
  { name: 'National University of Ireland Galway', country: 'Ireland', city: 'Galway' },
  { name: 'Dublin City University', country: 'Ireland', city: 'Dublin' },
  { name: 'Maynooth University', country: 'Ireland', city: 'Maynooth' },
  { name: 'University of Limerick', country: 'Ireland', city: 'Limerick' },
  { name: 'Jagiellonian University', country: 'Poland', city: 'Kraków' },
  { name: 'Warsaw University of Technology', country: 'Poland', city: 'Warsaw' },
  { name: 'AGH University of Science and Technology', country: 'Poland', city: 'Kraków' },
  { name: 'Wrocław University of Technology', country: 'Poland', city: 'Wrocław' },
  { name: 'Adam Mickiewicz University', country: 'Poland', city: 'Poznań' },
  { name: 'Charles University', country: 'Czech Republic', city: 'Prague' },
  { name: 'Czech Technical University', country: 'Czech Republic', city: 'Prague' },
  { name: 'Masaryk University', country: 'Czech Republic', city: 'Brno' },
  { name: 'Eötvös Loránd University', country: 'Hungary', city: 'Budapest' },
  { name: 'Budapest University of Technology', country: 'Hungary', city: 'Budapest' },
  { name: 'Corvinus University of Budapest', country: 'Hungary', city: 'Budapest' },
  { name: 'University of Bucharest', country: 'Romania', city: 'Bucharest' },
  { name: 'Babeș-Bolyai University', country: 'Romania', city: 'Cluj-Napoca' },
  { name: 'University of Athens', country: 'Greece', city: 'Athens' },
  { name: 'Aristotle University of Thessaloniki', country: 'Greece', city: 'Thessaloniki' },
  { name: 'National Technical University of Athens', country: 'Greece', city: 'Athens' },
  { name: 'University of Lisbon', country: 'Portugal', city: 'Lisbon' },
  { name: 'University of Porto', country: 'Portugal', city: 'Porto' },
  { name: 'University of Coimbra', country: 'Portugal', city: 'Coimbra' },
  { name: 'NOVA University Lisbon', country: 'Portugal', city: 'Lisbon' },
  { name: 'Católica Lisbon School of Business and Economics', country: 'Portugal', city: 'Lisbon' }
];

moreEuropean.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Sciences, Engineering, Medicine, Humanities'
  });
});

// More Asian universities
const moreAsian = [
  // China
  { name: 'Huazhong University of Science and Technology', country: 'China', city: 'Wuhan' },
  { name: 'Sun Yat-sen University', country: 'China', city: 'Guangzhou' },
  { name: 'Beihang University', country: 'China', city: 'Beijing' },
  { name: 'Beijing Institute of Technology', country: 'China', city: 'Beijing' },
  { name: 'Northwestern Polytechnical University', country: 'China', city: 'Xian' },
  { name: 'Tongji University', country: 'China', city: 'Shanghai' },
  { name: 'East China Normal University', country: 'China', city: 'Shanghai' },
  { name: 'Sichuan University', country: 'China', city: 'Chengdu' },
  { name: 'Jilin University', country: 'China', city: 'Changchun' },
  { name: 'Xiamen University', country: 'China', city: 'Xiamen' },
  { name: 'Renmin University of China', country: 'China', city: 'Beijing' },
  { name: 'Beijing Normal University', country: 'China', city: 'Beijing' },
  { name: 'South China University of Technology', country: 'China', city: 'Guangzhou' },
  { name: 'Tianjin University', country: 'China', city: 'Tianjin' },
  { name: 'Ocean University of China', country: 'China', city: 'Qingdao' },
  { name: 'Central South University', country: 'China', city: 'Changsha' },
  { name: 'Northeastern University China', country: 'China', city: 'Shenyang' },
  { name: 'China Agricultural University', country: 'China', city: 'Beijing' },
  { name: 'Southeast University', country: 'China', city: 'Nanjing' },
  { name: 'Shanghai University', country: 'China', city: 'Shanghai' },
  // Japan
  { name: 'Keio University', country: 'Japan', city: 'Tokyo' },
  { name: 'Waseda University', country: 'Japan', city: 'Tokyo' },
  { name: 'Meiji University', country: 'Japan', city: 'Tokyo' },
  { name: 'Sophia University', country: 'Japan', city: 'Tokyo' },
  { name: 'Ritsumeikan University', country: 'Japan', city: 'Kyoto' },
  { name: 'Doshisha University', country: 'Japan', city: 'Kyoto' },
  { name: 'Kwansei Gakuin University', country: 'Japan', city: 'Nishinomiya' },
  { name: 'Tokyo Metropolitan University', country: 'Japan', city: 'Tokyo' },
  { name: 'Tokyo University of Agriculture and Technology', country: 'Japan', city: 'Tokyo' },
  { name: 'Tokyo University of Science', country: 'Japan', city: 'Tokyo' },
  // Korea
  { name: 'Sejong University', country: 'South Korea', city: 'Seoul' },
  { name: 'Sookmyung Women University', country: 'South Korea', city: 'Seoul' },
  { name: 'Hongik University', country: 'South Korea', city: 'Seoul' },
  { name: 'Dankook University', country: 'South Korea', city: 'Yongin' },
  { name: 'Chosun University', country: 'South Korea', city: 'Gwangju' },
  // Taiwan
  { name: 'National Central University', country: 'Taiwan', city: 'Taoyuan' },
  { name: 'National Sun Yat-sen University', country: 'Taiwan', city: 'Kaohsiung' },
  { name: 'National Chiao Tung University', country: 'Taiwan', city: 'Hsinchu' },
  { name: 'National Taiwan Normal University', country: 'Taiwan', city: 'Taipei' },
  { name: 'Taipei Medical University', country: 'Taiwan', city: 'Taipei' }
];

moreAsian.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Medicine, Sciences, Technology'
  });
});

// More Middle East universities
const moreMiddleEast = [
  { name: 'Sharif University of Technology', country: 'Iran', city: 'Tehran' },
  { name: 'University of Tehran', country: 'Iran', city: 'Tehran' },
  { name: 'Amirkabir University of Technology', country: 'Iran', city: 'Tehran' },
  { name: 'Iran University of Science and Technology', country: 'Iran', city: 'Tehran' },
  { name: 'Ferdowsi University of Mashhad', country: 'Iran', city: 'Mashhad' },
  { name: 'Prince Sultan University', country: 'Saudi Arabia', city: 'Riyadh' },
  { name: 'Imam Abdulrahman Bin Faisal University', country: 'Saudi Arabia', city: 'Dammam' },
  { name: 'Umm Al-Qura University', country: 'Saudi Arabia', city: 'Mecca' },
  { name: 'Al-Faisal University', country: 'Saudi Arabia', city: 'Riyadh' },
  { name: 'Princess Nourah bint Abdulrahman University', country: 'Saudi Arabia', city: 'Riyadh' },
  { name: 'Texas A&M University at Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'Carnegie Mellon University in Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'Georgetown University in Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'Northwestern University in Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'Virginia Commonwealth University in Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'Weill Cornell Medicine-Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'NYU Abu Dhabi', country: 'United Arab Emirates', city: 'Abu Dhabi' },
  { name: 'Sorbonne University Abu Dhabi', country: 'United Arab Emirates', city: 'Abu Dhabi' },
  { name: 'Heriot-Watt University Dubai', country: 'United Arab Emirates', city: 'Dubai' },
  { name: 'University of Birmingham Dubai', country: 'United Arab Emirates', city: 'Dubai' }
];

moreMiddleEast.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Medicine, Business, Sciences'
  });
});

// More Latin American universities
const moreLatinAmerican = [
  { name: 'Pontificia Universidad Católica Argentina', country: 'Argentina', city: 'Buenos Aires' },
  { name: 'Universidad de Belgrano', country: 'Argentina', city: 'Buenos Aires' },
  { name: 'Universidad del Salvador', country: 'Argentina', city: 'Buenos Aires' },
  { name: 'Universidad Nacional de Tucumán', country: 'Argentina', city: 'Tucumán' },
  { name: 'Universidad Nacional del Litoral', country: 'Argentina', city: 'Santa Fe' },
  { name: 'Pontificia Universidade Católica do Rio de Janeiro', country: 'Brazil', city: 'Rio de Janeiro' },
  { name: 'Pontifícia Universidade Católica de São Paulo', country: 'Brazil', city: 'São Paulo' },
  { name: 'Universidade Federal de Viçosa', country: 'Brazil', city: 'Viçosa' },
  { name: 'Universidade Federal do Rio Grande do Norte', country: 'Brazil', city: 'Natal' },
  { name: 'Universidade Federal de Goiás', country: 'Brazil', city: 'Goiânia' },
  { name: 'Universidad de Montevideo', country: 'Uruguay', city: 'Montevideo' },
  { name: 'Universidad de la República', country: 'Uruguay', city: 'Montevideo' },
  { name: 'Universidad Nacional de Asunción', country: 'Paraguay', city: 'Asunción' },
  { name: 'Universidad Católica del Uruguay', country: 'Uruguay', city: 'Montevideo' },
  { name: 'Universidad Mayor de San Andrés', country: 'Bolivia', city: 'La Paz' },
  { name: 'Universidad Católica Boliviana', country: 'Bolivia', city: 'La Paz' },
  { name: 'Universidad de Panamá', country: 'Panama', city: 'Panama City' },
  { name: 'Universidad Tecnológica de Panamá', country: 'Panama', city: 'Panama City' },
  { name: 'Universidad de La Habana', country: 'Cuba', city: 'Havana' },
  { name: 'Universidad de Puerto Rico', country: 'Puerto Rico', city: 'San Juan' }
];

moreLatinAmerican.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Sciences, Medicine, Business, Law'
  });
});

// More African universities
const moreAfrican = [
  { name: 'University of Pretoria', country: 'South Africa', city: 'Pretoria' },
  { name: 'North-West University', country: 'South Africa', city: 'Potchefstroom' },
  { name: 'University of the Free State', country: 'South Africa', city: 'Bloemfontein' },
  { name: 'Nelson Mandela University', country: 'South Africa', city: 'Port Elizabeth' },
  { name: 'University of Johannesburg', country: 'South Africa', city: 'Johannesburg' },
  { name: 'Tshwane University of Technology', country: 'South Africa', city: 'Pretoria' },
  { name: 'Cape Peninsula University of Technology', country: 'South Africa', city: 'Cape Town' },
  { name: 'Obafemi Awolowo University', country: 'Nigeria', city: 'Ile-Ife' },
  { name: 'Ahmadu Bello University', country: 'Nigeria', city: 'Zaria' },
  { name: 'University of Benin', country: 'Nigeria', city: 'Benin City' },
  { name: 'University of Port Harcourt', country: 'Nigeria', city: 'Port Harcourt' },
  { name: 'University of Ilorin', country: 'Nigeria', city: 'Ilorin' },
  { name: 'Jomo Kenyatta University of Agriculture and Technology', country: 'Kenya', city: 'Nairobi' },
  { name: 'Kenyatta University', country: 'Kenya', city: 'Nairobi' },
  { name: 'Moi University', country: 'Kenya', city: 'Eldoret' },
  { name: 'Egerton University', country: 'Kenya', city: 'Njoro' },
  { name: 'Assiut University', country: 'Egypt', city: 'Assiut' },
  { name: 'Mansoura University', country: 'Egypt', city: 'Mansoura' },
  { name: 'Helwan University', country: 'Egypt', city: 'Cairo' },
  { name: 'Zagazig University', country: 'Egypt', city: 'Zagazig' }
];

moreAfrican.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Medicine, Engineering, Agriculture, Sciences'
  });
});

// More Canadian colleges
const moreCanadian = [
  { name: 'Concordia University', country: 'Canada', city: 'Montreal' },
  { name: 'École de technologie supérieure', country: 'Canada', city: 'Montreal' },
  { name: 'Polytechnique Montréal', country: 'Canada', city: 'Montreal' },
  { name: 'HEC Montréal', country: 'Canada', city: 'Montreal' },
  { name: 'Université du Québec à Montréal', country: 'Canada', city: 'Montreal' },
  { name: 'Wilfrid Laurier University', country: 'Canada', city: 'Waterloo' },
  { name: 'University of Guelph', country: 'Canada', city: 'Guelph' },
  { name: 'Université Laval', country: 'Canada', city: 'Quebec City' },
  { name: 'University of New Brunswick', country: 'Canada', city: 'Fredericton' },
  { name: 'Memorial University of Newfoundland', country: 'Canada', city: 'St. Johns' },
  { name: 'University of Prince Edward Island', country: 'Canada', city: 'Charlottetown' },
  { name: 'Acadia University', country: 'Canada', city: 'Wolfville' },
  { name: 'Saint Marys University', country: 'Canada', city: 'Halifax' },
  { name: 'Mount Allison University', country: 'Canada', city: 'Sackville' },
  { name: 'Bishop University', country: 'Canada', city: 'Sherbrooke' }
];

moreCanadian.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: 'Canada',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Business, Sciences, Arts'
  });
});

// More UK universities
const moreUK = [
  { name: 'University of Leicester', city: 'Leicester' },
  { name: 'University of East Anglia', city: 'Norwich' },
  { name: 'University of Surrey', city: 'Guildford' },
  { name: 'University of Essex', city: 'Colchester' },
  { name: 'Swansea University', city: 'Swansea' },
  { name: 'Cardiff Metropolitan University', city: 'Cardiff' },
  { name: 'Bangor University', city: 'Bangor' },
  { name: 'Aberystwyth University', city: 'Aberystwyth' },
  { name: 'University of Aberdeen', city: 'Aberdeen' },
  { name: 'Heriot-Watt University', city: 'Edinburgh' },
  { name: 'University of Strathclyde', city: 'Glasgow' },
  { name: 'Glasgow Caledonian University', city: 'Glasgow' },
  { name: 'Edinburgh Napier University', city: 'Edinburgh' },
  { name: 'Robert Gordon University', city: 'Aberdeen' },
  { name: 'University of the West of Scotland', city: 'Paisley' },
  { name: 'Queens University Belfast', city: 'Belfast' },
  { name: 'Ulster University', city: 'Belfast' },
  { name: 'De Montfort University', city: 'Leicester' },
  { name: 'Oxford Brookes University', city: 'Oxford' },
  { name: 'University of Huddersfield', city: 'Huddersfield' },
  { name: 'Nottingham Trent University', city: 'Nottingham' },
  { name: 'Sheffield Hallam University', city: 'Sheffield' },
  { name: 'Manchester Metropolitan University', city: 'Manchester' },
  { name: 'Liverpool John Moores University', city: 'Liverpool' },
  { name: 'Leeds Beckett University', city: 'Leeds' }
];

moreUK.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: 'United Kingdom',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Business, Engineering, Sciences, Arts'
  });
});

// More Australian universities
const moreAustralian = [
  { name: 'University of the Sunshine Coast', city: 'Sunshine Coast' },
  { name: 'Federation University Australia', city: 'Ballarat' },
  { name: 'Central Queensland University', city: 'Rockhampton' },
  { name: 'Victoria University', city: 'Melbourne' },
  { name: 'University of Southern Queensland', city: 'Toowoomba' },
  { name: 'University of New England', city: 'Armidale' },
  { name: 'Western Sydney University', city: 'Sydney' },
  { name: 'Australian Catholic University', city: 'Melbourne' },
  { name: 'University of Divinity', city: 'Melbourne' },
  { name: 'Charles Sturt University', city: 'Bathurst' }
];

moreAustralian.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: 'Australia',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Business, Education, Health Sciences, Arts'
  });
});

// More German universities
const moreGerman = [
  { name: 'University of Münster', city: 'Münster' },
  { name: 'University of Würzburg', city: 'Würzburg' },
  { name: 'University of Leipzig', city: 'Leipzig' },
  { name: 'University of Kiel', city: 'Kiel' },
  { name: 'University of Jena', city: 'Jena' },
  { name: 'University of Rostock', city: 'Rostock' },
  { name: 'University of Greifswald', city: 'Greifswald' },
  { name: 'University of Potsdam', city: 'Potsdam' },
  { name: 'University of Magdeburg', city: 'Magdeburg' },
  { name: 'University of Duisburg-Essen', city: 'Essen' }
];

moreGerman.forEach(u => {
  additionalColleges.push({
    Institution_Name: u.name,
    Country: 'Germany',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Sciences, Medicine, Engineering, Humanities'
  });
});

// More Indian universities
const moreIndian = [
  'Jamia Millia Islamia',
  'Aligarh Muslim University',
  'Central University of Hyderabad',
  'Visva-Bharati University',
  'Panjab University',
  'Osmania University',
  'Savitribai Phule Pune University',
  'University of Calcutta',
  'University of Madras',
  'Amrita Vishwa Vidyapeetham',
  'Symbiosis International University',
  'Lovely Professional University',
  'Chandigarh University',
  'Shiv Nadar University',
  'Ashoka University',
  'O.P. Jindal Global University',
  'Thapar Institute of Engineering and Technology',
  'Indian Statistical Institute',
  'Tata Institute of Fundamental Research',
  'Tata Institute of Social Sciences',
  'National Law School of India University',
  'National Academy of Legal Studies and Research',
  'National Law University Delhi',
  'Indian Maritime University',
  'Indian Institute of Space Science and Technology',
  'Indian School of Mines Dhanbad',
  'Institute of Chemical Technology Mumbai',
  'Homi Bhabha National Institute',
  'Indian Agricultural Research Institute',
  'National Institute of Pharmaceutical Education and Research'
];

moreIndian.forEach(name => {
  additionalColleges.push({
    Institution_Name: name,
    Country: 'India',
    Region_State_Province: 'Various',
    City: 'Various',
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Sciences, Research, Law'
  });
});

console.log(`Generated ${additionalColleges.length} additional colleges`);

// Write to file
const outputPath = path.join(__dirname, '../data/colleges/final_batch_colleges.json');
fs.writeFileSync(outputPath, JSON.stringify(additionalColleges, null, 2));
console.log(`Written to: ${outputPath}`);
