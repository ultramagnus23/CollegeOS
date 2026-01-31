const fs = require('fs');
const path = require('path');

// Read the unified colleges data (source of truth)
const dataPath = path.join(__dirname, '..', 'data', 'unified_colleges.json');
const rawData = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(rawData);

console.log('=== COMPLETE COLLEGE DATA LIST ===\n');
console.log('Total Colleges:', data.metadata.total_colleges);
console.log('Generated:', data.metadata.generated_at);
console.log('Countries:', data.metadata.stats.countries);
console.log('\nData Completeness:');
console.log('  With Acceptance Rate:', data.metadata.stats.with_acceptance_rate);
console.log('  With Tuition:', data.metadata.stats.with_tuition);
console.log('  With Rankings:', data.metadata.stats.with_rankings);
console.log('  Average Confidence:', data.metadata.stats.avg_confidence);

// Group by country
const byCountry = {};
data.colleges.forEach(c => {
  if (!byCountry[c.country]) byCountry[c.country] = [];
  byCountry[c.country].push(c);
});

console.log('\n=== COLLEGES BY COUNTRY ===\n');

// Sort countries by count
const sortedCountries = Object.entries(byCountry)
  .sort((a, b) => b[1].length - a[1].length);

sortedCountries.forEach(([country, colleges]) => {
  console.log(`\n${country} (${colleges.length} colleges):`);
  console.log('-'.repeat(50));
  
  // Sort by rankings
  const sorted = colleges.sort((a, b) => {
    const rankA = a.rankings?.[0]?.global_rank || 9999;
    const rankB = b.rankings?.[0]?.global_rank || 9999;
    return rankA - rankB;
  });
  
  sorted.forEach((c, i) => {
    const rank = c.rankings?.[0]?.global_rank ? `#${c.rankings[0].global_rank}` : '';
    const acceptance = c.admissions?.acceptance_rate 
      ? `${(c.admissions.acceptance_rate * 100).toFixed(0)}%` 
      : '';
    const tuition = c.financial?.tuition_international 
      ? `$${c.financial.tuition_international.toLocaleString()}`
      : (c.financial?.tuition_out_state 
        ? `$${c.financial.tuition_out_state.toLocaleString()}`
        : '');
    const city = c.city || '';
    const state = c.state_region || '';
    const location = [city, state].filter(Boolean).join(', ');
    
    console.log(`${i+1}. ${c.name}`);
    if (location) console.log(`   Location: ${location}`);
    if (rank) console.log(`   QS Rank: ${rank}`);
    if (acceptance) console.log(`   Acceptance: ${acceptance}`);
    if (tuition) console.log(`   Tuition: ${tuition}`);
    if (c.programs?.length > 0) {
      console.log(`   Programs: ${c.programs.map(p => p.program_name).join(', ')}`);
    }
  });
});

// Export summary stats
console.log('\n\n=== SUMMARY STATISTICS ===\n');

// Acceptance rate distribution
const acceptanceRates = data.colleges
  .filter(c => c.admissions?.acceptance_rate)
  .map(c => c.admissions.acceptance_rate);

if (acceptanceRates.length > 0) {
  const avg = acceptanceRates.reduce((a, b) => a + b, 0) / acceptanceRates.length;
  const min = Math.min(...acceptanceRates);
  const max = Math.max(...acceptanceRates);
  
  console.log('Acceptance Rates:');
  console.log(`  Average: ${(avg * 100).toFixed(1)}%`);
  console.log(`  Most Selective: ${(min * 100).toFixed(1)}%`);
  console.log(`  Least Selective: ${(max * 100).toFixed(1)}%`);
}

// Tuition distribution
const tuitions = data.colleges
  .filter(c => c.financial?.tuition_international || c.financial?.tuition_out_state)
  .map(c => c.financial.tuition_international || c.financial.tuition_out_state);

if (tuitions.length > 0) {
  const avg = tuitions.reduce((a, b) => a + b, 0) / tuitions.length;
  const min = Math.min(...tuitions);
  const max = Math.max(...tuitions);
  
  console.log('\nTuition (Annual):');
  console.log(`  Average: $${Math.round(avg).toLocaleString()}`);
  console.log(`  Lowest: $${min.toLocaleString()}`);
  console.log(`  Highest: $${max.toLocaleString()}`);
}

// Top ranked colleges
console.log('\n=== TOP 25 GLOBALLY RANKED COLLEGES ===\n');
const ranked = data.colleges
  .filter(c => c.rankings?.[0]?.global_rank)
  .sort((a, b) => a.rankings[0].global_rank - b.rankings[0].global_rank)
  .slice(0, 25);

ranked.forEach((c, i) => {
  const rank = c.rankings[0].global_rank;
  const acceptance = c.admissions?.acceptance_rate 
    ? `${(c.admissions.acceptance_rate * 100).toFixed(0)}%` 
    : 'N/A';
  console.log(`${i+1}. #${rank} ${c.name} (${c.country}) - ${acceptance} acceptance`);
});

// Export clean JSON version
const cleanExport = data.colleges.map(c => ({
  name: c.name,
  country: c.country,
  state_region: c.state_region,
  city: c.city,
  website: c.website_url,
  acceptance_rate: c.admissions?.acceptance_rate,
  tuition_international: c.financial?.tuition_international,
  tuition_domestic: c.financial?.tuition_in_state || c.financial?.tuition_out_state,
  sat_range: c.student_stats?.sat_range,
  act_range: c.student_stats?.act_range,
  gpa_50: c.student_stats?.gpa_50,
  global_rank: c.rankings?.[0]?.global_rank,
  ranking_body: c.rankings?.[0]?.ranking_body,
  programs: c.programs?.map(p => p.program_name) || [],
  total_enrollment: c.total_enrollment,
  graduation_rate: c.outcomes?.graduation_rate_4yr
}));

const exportPath = path.join(__dirname, '..', 'data', 'college_list_clean.json');
fs.writeFileSync(exportPath, JSON.stringify(cleanExport, null, 2));
console.log(`\n✓ Clean export saved to: ${exportPath}`);
console.log(`  Total records: ${cleanExport.length}`);
