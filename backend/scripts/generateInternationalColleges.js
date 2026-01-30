// Generate more international colleges to reach 2500+
const fs = require('fs');
const path = require('path');

const internationalColleges = [];

// More Indian universities - Central Universities and State Universities
const indianUniversities = [
  { name: 'Central University of Kerala', city: 'Kasaragod' },
  { name: 'Central University of Karnataka', city: 'Gulbarga' },
  { name: 'Central University of Gujarat', city: 'Gandhinagar' },
  { name: 'Central University of Rajasthan', city: 'Ajmer' },
  { name: 'Central University of Haryana', city: 'Mahendragarh' },
  { name: 'Central University of Punjab', city: 'Bathinda' },
  { name: 'Central University of Himachal Pradesh', city: 'Dharamshala' },
  { name: 'Central University of Jharkhand', city: 'Ranchi' },
  { name: 'Central University of Orissa', city: 'Koraput' },
  { name: 'Central University of Tamil Nadu', city: 'Tiruvarur' },
  { name: 'Central University of Kashmir', city: 'Srinagar' },
  { name: 'Central University of Jammu', city: 'Jammu' },
  { name: 'Central University of South Bihar', city: 'Gaya' },
  { name: 'Dr. Harisingh Gour University', city: 'Sagar' },
  { name: 'Guru Ghasidas Vishwavidyalaya', city: 'Bilaspur' },
  { name: 'Hemwati Nandan Bahuguna Garhwal University', city: 'Srinagar Garhwal' },
  { name: 'Mahatma Gandhi Antarrashtriya Hindi Vishwavidyalaya', city: 'Wardha' },
  { name: 'Maulana Azad National Urdu University', city: 'Hyderabad' },
  { name: 'Nagaland University', city: 'Lumami' },
  { name: 'North Eastern Hill University', city: 'Shillong' },
  { name: 'Pondicherry University', city: 'Puducherry' },
  { name: 'Tripura University', city: 'Agartala' },
  { name: 'University of Allahabad', city: 'Allahabad' },
  { name: 'Rajiv Gandhi University', city: 'Itanagar' },
  { name: 'Sikkim University', city: 'Gangtok' },
  { name: 'Assam University', city: 'Silchar' },
  { name: 'Mizoram University', city: 'Aizawl' },
  { name: 'Manipur University', city: 'Imphal' },
  { name: 'Tezpur University', city: 'Tezpur' },
  { name: 'Visva-Bharati', city: 'Santiniketan' },
  // State Universities
  { name: 'Andhra University', city: 'Visakhapatnam' },
  { name: 'Gujarat University', city: 'Ahmedabad' },
  { name: 'Kurukshetra University', city: 'Kurukshetra' },
  { name: 'Maharaja Sayajirao University of Baroda', city: 'Vadodara' },
  { name: 'Mysore University', city: 'Mysuru' },
  { name: 'Patna University', city: 'Patna' },
  { name: 'Rajasthan University', city: 'Jaipur' },
  { name: 'SNDT Women University', city: 'Mumbai' },
  { name: 'University of Hyderabad', city: 'Hyderabad' },
  { name: 'University of Jammu', city: 'Jammu' },
  { name: 'University of Kashmir', city: 'Srinagar' },
  { name: 'University of Kerala', city: 'Thiruvananthapuram' },
  { name: 'University of Lucknow', city: 'Lucknow' },
  { name: 'University of Mumbai', city: 'Mumbai' },
  { name: 'University of Mysore', city: 'Mysore' },
  { name: 'University of Pune', city: 'Pune' },
  { name: 'Gauhati University', city: 'Guwahati' },
  { name: 'Dibrugarh University', city: 'Dibrugarh' },
  { name: 'Berhampur University', city: 'Berhampur' },
  { name: 'Sambalpur University', city: 'Sambalpur' }
];

indianUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: 'India',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Arts, Sciences, Commerce, Law'
  });
});

// More UK universities
const ukUniversities = [
  { name: 'Anglia Ruskin University', city: 'Cambridge' },
  { name: 'Bath Spa University', city: 'Bath' },
  { name: 'Birmingham City University', city: 'Birmingham' },
  { name: 'Bournemouth University', city: 'Bournemouth' },
  { name: 'Brighton University', city: 'Brighton' },
  { name: 'Canterbury Christ Church University', city: 'Canterbury' },
  { name: 'Cardiff University', city: 'Cardiff' },
  { name: 'Central Lancashire University', city: 'Preston' },
  { name: 'Chester University', city: 'Chester' },
  { name: 'Chichester University', city: 'Chichester' },
  { name: 'Cumbria University', city: 'Carlisle' },
  { name: 'Derby University', city: 'Derby' },
  { name: 'East London University', city: 'London' },
  { name: 'Edge Hill University', city: 'Ormskirk' },
  { name: 'Gloucestershire University', city: 'Cheltenham' },
  { name: 'London Metropolitan University', city: 'London' },
  { name: 'London South Bank University', city: 'London' },
  { name: 'Middlesex University', city: 'London' },
  { name: 'Northampton University', city: 'Northampton' },
  { name: 'Roehampton University', city: 'London' },
  { name: 'Salford University', city: 'Salford' },
  { name: 'Staffordshire University', city: 'Stoke-on-Trent' },
  { name: 'Sunderland University', city: 'Sunderland' },
  { name: 'Teesside University', city: 'Middlesbrough' },
  { name: 'West of England University', city: 'Bristol' },
  { name: 'Wolverhampton University', city: 'Wolverhampton' },
  { name: 'York St John University', city: 'York' },
  { name: 'Lincoln University', city: 'Lincoln' },
  { name: 'Cranfield University', city: 'Cranfield' },
  { name: 'Open University', city: 'Milton Keynes' }
];

ukUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: 'United Kingdom',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Business, Sciences, Arts, Engineering'
  });
});

// More Chinese universities
const chineseUniversities = [
  { name: 'Beijing Foreign Studies University', city: 'Beijing' },
  { name: 'Beijing Jiaotong University', city: 'Beijing' },
  { name: 'Beijing University of Posts and Telecommunications', city: 'Beijing' },
  { name: 'Beijing University of Chemical Technology', city: 'Beijing' },
  { name: 'China University of Geosciences', city: 'Wuhan' },
  { name: 'China University of Mining and Technology', city: 'Xuzhou' },
  { name: 'China University of Petroleum', city: 'Beijing' },
  { name: 'Dalian University of Technology', city: 'Dalian' },
  { name: 'East China University of Science and Technology', city: 'Shanghai' },
  { name: 'Fuzhou University', city: 'Fuzhou' },
  { name: 'Hefei University of Technology', city: 'Hefei' },
  { name: 'Hohai University', city: 'Nanjing' },
  { name: 'Hunan University', city: 'Changsha' },
  { name: 'Jiangnan University', city: 'Wuxi' },
  { name: 'Lanzhou University', city: 'Lanzhou' },
  { name: 'Nanjing Agricultural University', city: 'Nanjing' },
  { name: 'Nanjing University of Aeronautics and Astronautics', city: 'Nanjing' },
  { name: 'Nankai University', city: 'Tianjin' },
  { name: 'Northeast Normal University', city: 'Changchun' },
  { name: 'Northwest A&F University', city: 'Yangling' },
  { name: 'Shaanxi Normal University', city: 'Xian' },
  { name: 'Shandong University', city: 'Jinan' },
  { name: 'Shanghai International Studies University', city: 'Shanghai' },
  { name: 'Southwest University', city: 'Chongqing' },
  { name: 'Wuhan University', city: 'Wuhan' },
  { name: 'Xidian University', city: 'Xian' },
  { name: 'Zhongnan University of Economics and Law', city: 'Wuhan' },
  { name: 'China Agricultural University', city: 'Beijing' },
  { name: 'Beijing Language and Culture University', city: 'Beijing' },
  { name: 'Communication University of China', city: 'Beijing' }
];

chineseUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: 'China',
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Sciences, Technology, Agriculture'
  });
});

// More European universities
const europeanUniversities = [
  // France
  { name: 'Université Paris Cité', country: 'France', city: 'Paris' },
  { name: 'University of Rennes', country: 'France', city: 'Rennes' },
  { name: 'University of Angers', country: 'France', city: 'Angers' },
  { name: 'University of Caen Normandy', country: 'France', city: 'Caen' },
  { name: 'University of Poitiers', country: 'France', city: 'Poitiers' },
  { name: 'University of Orleans', country: 'France', city: 'Orleans' },
  { name: 'University of Clermont Auvergne', country: 'France', city: 'Clermont-Ferrand' },
  { name: 'University of Limoges', country: 'France', city: 'Limoges' },
  { name: 'University of Reims', country: 'France', city: 'Reims' },
  { name: 'University of Lorraine', country: 'France', city: 'Nancy' },
  // Belgium
  { name: 'Université Libre de Bruxelles', country: 'Belgium', city: 'Brussels' },
  { name: 'Vrije Universiteit Brussel', country: 'Belgium', city: 'Brussels' },
  { name: 'University of Antwerp', country: 'Belgium', city: 'Antwerp' },
  { name: 'University of Liège', country: 'Belgium', city: 'Liège' },
  { name: 'University of Louvain', country: 'Belgium', city: 'Louvain-la-Neuve' },
  // Austria
  { name: 'University of Innsbruck', country: 'Austria', city: 'Innsbruck' },
  { name: 'University of Graz', country: 'Austria', city: 'Graz' },
  { name: 'University of Salzburg', country: 'Austria', city: 'Salzburg' },
  { name: 'University of Linz', country: 'Austria', city: 'Linz' },
  { name: 'Graz University of Technology', country: 'Austria', city: 'Graz' },
  // Scandinavia
  { name: 'University of Oslo', country: 'Norway', city: 'Oslo' },
  { name: 'University of Tromsø', country: 'Norway', city: 'Tromsø' },
  { name: 'University of Stavanger', country: 'Norway', city: 'Stavanger' },
  { name: 'University of Agder', country: 'Norway', city: 'Kristiansand' },
  { name: 'University of Tampere', country: 'Finland', city: 'Tampere' },
  { name: 'University of Oulu', country: 'Finland', city: 'Oulu' },
  { name: 'University of Jyväskylä', country: 'Finland', city: 'Jyväskylä' },
  { name: 'Aalborg University', country: 'Denmark', city: 'Aalborg' },
  { name: 'Roskilde University', country: 'Denmark', city: 'Roskilde' },
  { name: 'IT University of Copenhagen', country: 'Denmark', city: 'Copenhagen' }
];

europeanUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Sciences, Medicine, Humanities, Engineering'
  });
});

// More Southeast Asian universities
const southeastAsianUniversities = [
  { name: 'Singapore University of Technology and Design', country: 'Singapore', city: 'Singapore' },
  { name: 'Singapore Institute of Technology', country: 'Singapore', city: 'Singapore' },
  { name: 'SUTD Singapore', country: 'Singapore', city: 'Singapore' },
  { name: 'Monash University Malaysia', country: 'Malaysia', city: 'Subang Jaya' },
  { name: 'Taylor University Malaysia', country: 'Malaysia', city: 'Subang Jaya' },
  { name: 'Sunway University', country: 'Malaysia', city: 'Petaling Jaya' },
  { name: 'HELP University', country: 'Malaysia', city: 'Kuala Lumpur' },
  { name: 'Asia Pacific University', country: 'Malaysia', city: 'Kuala Lumpur' },
  { name: 'INTI International University', country: 'Malaysia', city: 'Nilai' },
  { name: 'University of Nottingham Malaysia', country: 'Malaysia', city: 'Semenyih' },
  { name: 'Sirindhorn International Institute of Technology', country: 'Thailand', city: 'Pathum Thani' },
  { name: 'King Mongkuts University of Technology Thonburi', country: 'Thailand', city: 'Bangkok' },
  { name: 'King Mongkuts Institute of Technology Ladkrabang', country: 'Thailand', city: 'Bangkok' },
  { name: 'Prince of Songkla University', country: 'Thailand', city: 'Hat Yai' },
  { name: 'Khon Kaen University', country: 'Thailand', city: 'Khon Kaen' },
  { name: 'Chiang Mai University', country: 'Thailand', city: 'Chiang Mai' },
  { name: 'Airlangga University', country: 'Indonesia', city: 'Surabaya' },
  { name: 'Padjadjaran University', country: 'Indonesia', city: 'Bandung' },
  { name: 'Diponegoro University', country: 'Indonesia', city: 'Semarang' },
  { name: 'Sepuluh Nopember Institute of Technology', country: 'Indonesia', city: 'Surabaya' },
  { name: 'University of Santo Tomas', country: 'Philippines', city: 'Manila' },
  { name: 'Mapua University', country: 'Philippines', city: 'Manila' },
  { name: 'UP Diliman', country: 'Philippines', city: 'Quezon City' },
  { name: 'UP Los Banos', country: 'Philippines', city: 'Los Banos' },
  { name: 'Hanoi University of Science and Technology', country: 'Vietnam', city: 'Hanoi' },
  { name: 'Ho Chi Minh City University of Technology', country: 'Vietnam', city: 'Ho Chi Minh City' },
  { name: 'Vietnam National University Ho Chi Minh City', country: 'Vietnam', city: 'Ho Chi Minh City' },
  { name: 'Can Tho University', country: 'Vietnam', city: 'Can Tho' },
  { name: 'Foreign Trade University', country: 'Vietnam', city: 'Hanoi' },
  { name: 'Ton Duc Thang University', country: 'Vietnam', city: 'Ho Chi Minh City' }
];

southeastAsianUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Business, Sciences, Technology'
  });
});

// More Latin American universities
const latinAmericanUniversities = [
  { name: 'Federal University of Bahia', country: 'Brazil', city: 'Salvador' },
  { name: 'Federal University of Pará', country: 'Brazil', city: 'Belém' },
  { name: 'Federal University of Amazonas', country: 'Brazil', city: 'Manaus' },
  { name: 'Federal University of Rio Grande', country: 'Brazil', city: 'Rio Grande' },
  { name: 'Federal University of Espírito Santo', country: 'Brazil', city: 'Vitória' },
  { name: 'Federal University of Maranhão', country: 'Brazil', city: 'São Luís' },
  { name: 'Federal University of Piauí', country: 'Brazil', city: 'Teresina' },
  { name: 'Federal University of Sergipe', country: 'Brazil', city: 'São Cristóvão' },
  { name: 'Federal University of Alagoas', country: 'Brazil', city: 'Maceió' },
  { name: 'Federal University of Paraíba', country: 'Brazil', city: 'João Pessoa' },
  { name: 'Universidad ESAN', country: 'Peru', city: 'Lima' },
  { name: 'Universidad Nacional Mayor de San Marcos', country: 'Peru', city: 'Lima' },
  { name: 'Universidad Nacional de Ingeniería', country: 'Peru', city: 'Lima' },
  { name: 'Universidad Peruana de Ciencias Aplicadas', country: 'Peru', city: 'Lima' },
  { name: 'Universidad del Pacífico', country: 'Peru', city: 'Lima' },
  { name: 'Universidad de Lima', country: 'Peru', city: 'Lima' },
  { name: 'Universidad de Piura', country: 'Peru', city: 'Piura' },
  { name: 'Pontificia Universidad Católica de Ecuador', country: 'Ecuador', city: 'Quito' },
  { name: 'Universidad San Francisco de Quito', country: 'Ecuador', city: 'Quito' },
  { name: 'Escuela Politécnica Nacional', country: 'Ecuador', city: 'Quito' }
];

latinAmericanUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Sciences, Engineering, Business, Medicine'
  });
});

// More African universities
const africanUniversities = [
  { name: 'University of South Africa', country: 'South Africa', city: 'Pretoria' },
  { name: 'Durban University of Technology', country: 'South Africa', city: 'Durban' },
  { name: 'Vaal University of Technology', country: 'South Africa', city: 'Vanderbijlpark' },
  { name: 'Mangosuthu University of Technology', country: 'South Africa', city: 'Durban' },
  { name: 'Walter Sisulu University', country: 'South Africa', city: 'Mthatha' },
  { name: 'University of Limpopo', country: 'South Africa', city: 'Polokwane' },
  { name: 'University of Venda', country: 'South Africa', city: 'Thohoyandou' },
  { name: 'University of Zululand', country: 'South Africa', city: 'KwaDlangezwa' },
  { name: 'Suez Canal University', country: 'Egypt', city: 'Ismailia' },
  { name: 'Tanta University', country: 'Egypt', city: 'Tanta' },
  { name: 'Benha University', country: 'Egypt', city: 'Benha' },
  { name: 'Sohag University', country: 'Egypt', city: 'Sohag' },
  { name: 'Fayoum University', country: 'Egypt', city: 'Fayoum' },
  { name: 'University of Nigeria Nsukka', country: 'Nigeria', city: 'Nsukka' },
  { name: 'Federal University of Technology Akure', country: 'Nigeria', city: 'Akure' },
  { name: 'Federal University of Technology Minna', country: 'Nigeria', city: 'Minna' },
  { name: 'Federal University of Technology Owerri', country: 'Nigeria', city: 'Owerri' },
  { name: 'University of Calabar', country: 'Nigeria', city: 'Calabar' },
  { name: 'University of Jos', country: 'Nigeria', city: 'Jos' },
  { name: 'Nnamdi Azikiwe University', country: 'Nigeria', city: 'Awka' }
];

africanUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Sciences, Medicine, Agriculture'
  });
});

// More Middle East universities
const middleEastUniversities = [
  { name: 'University of Sharjah', country: 'United Arab Emirates', city: 'Sharjah' },
  { name: 'Higher Colleges of Technology', country: 'United Arab Emirates', city: 'Abu Dhabi' },
  { name: 'American University of Dubai', country: 'United Arab Emirates', city: 'Dubai' },
  { name: 'Dubai International Academic City', country: 'United Arab Emirates', city: 'Dubai' },
  { name: 'Ajman University', country: 'United Arab Emirates', city: 'Ajman' },
  { name: 'Hamad Bin Khalifa University', country: 'Qatar', city: 'Doha' },
  { name: 'Qatar Foundation', country: 'Qatar', city: 'Doha' },
  { name: 'College of the North Atlantic Qatar', country: 'Qatar', city: 'Doha' },
  { name: 'Effat University', country: 'Saudi Arabia', city: 'Jeddah' },
  { name: 'Dar Al-Hekma University', country: 'Saudi Arabia', city: 'Jeddah' },
  { name: 'Prince Mohammad Bin Fahd University', country: 'Saudi Arabia', city: 'Al Khobar' },
  { name: 'Taibah University', country: 'Saudi Arabia', city: 'Medina' },
  { name: 'Jazan University', country: 'Saudi Arabia', city: 'Jazan' },
  { name: 'Qassim University', country: 'Saudi Arabia', city: 'Buraydah' },
  { name: 'Najran University', country: 'Saudi Arabia', city: 'Najran' }
];

middleEastUniversities.forEach(u => {
  internationalColleges.push({
    Institution_Name: u.name,
    Country: u.country,
    Region_State_Province: u.city,
    City: u.city,
    Institution_Type: 'Public',
    Key_Programs_Specializations: 'Engineering, Business, Sciences, Medicine'
  });
});

console.log(`Generated ${internationalColleges.length} additional international colleges`);

// Write to file
const outputPath = path.join(__dirname, '../data/colleges/international_colleges.json');
fs.writeFileSync(outputPath, JSON.stringify(internationalColleges, null, 2));
console.log(`Written to: ${outputPath}`);
