#!/usr/bin/env node

/**
 * Test script for deadline scraping
 * Usage: node backend/scripts/testDeadlineScraper.js [college_name]
 */

const db = require('../src/config/database');
const orchestrator = require('../src/services/deadlineScrapingOrchestrator');
const logger = require('../src/utils/logger');

// Test colleges with different website formats
const TEST_COLLEGES = [
  'Duke University',
  'Stanford University',
  'Harvard University',
  'Massachusetts Institute of Technology',
  'University of California, Berkeley'
];

async function testSingleCollege(collegeName) {
  console.log(`\n========================================`);
  console.log(`Testing: ${collegeName}`);
  console.log(`========================================\n`);
  
  // Find college in database
  const college = db.prepare('SELECT * FROM colleges WHERE name = ?').get(collegeName);
  
  if (!college) {
    console.error(`❌ College not found: ${collegeName}`);
    return { success: false };
  }
  
  console.log(`College ID: ${college.id}`);
  console.log(`Website: ${college.website_url || 'N/A'}`);
  console.log(`Current priority tier: ${college.priority_tier || 2}`);
  console.log(`Last scraped: ${college.last_scraped_deadlines || 'Never'}`);
  console.log('');
  
  // Run scraping
  const result = await orchestrator.scrapeAndUpdateCollege(college);
  
  console.log('\n--- Scraping Result ---');
  console.log(`Success: ${result.success ? '✓' : '✗'}`);
  
  if (!result.success) {
    console.log(`Error: ${result.error}`);
    return result;
  }
  
  console.log(`Changes detected: ${result.changes || 0}`);
  console.log('');
  
  // Show extracted deadlines
  const deadlines = db.prepare('SELECT * FROM application_deadlines WHERE college_id = ?').get(college.id);
  
  if (deadlines) {
    console.log('--- Extracted Deadlines ---');
    
    if (deadlines.offers_early_decision) {
      console.log(`✓ Early Decision I: ${deadlines.early_decision_1_date || 'N/A'}`);
      if (deadlines.early_decision_1_notification) {
        console.log(`  Notification: ${deadlines.early_decision_1_notification}`);
      }
      
      if (deadlines.early_decision_2_date) {
        console.log(`✓ Early Decision II: ${deadlines.early_decision_2_date}`);
        if (deadlines.early_decision_2_notification) {
          console.log(`  Notification: ${deadlines.early_decision_2_notification}`);
        }
      }
    }
    
    if (deadlines.offers_early_action) {
      console.log(`✓ Early Action: ${deadlines.early_action_date || 'N/A'}`);
      if (deadlines.early_action_notification) {
        console.log(`  Notification: ${deadlines.early_action_notification}`);
      }
    }
    
    if (deadlines.offers_restrictive_ea) {
      console.log(`✓ Restrictive Early Action: ${deadlines.restrictive_early_action_date || 'N/A'}`);
      if (deadlines.restrictive_early_action_notification) {
        console.log(`  Notification: ${deadlines.restrictive_early_action_notification}`);
      }
    }
    
    console.log(`✓ Regular Decision: ${deadlines.regular_decision_date || 'N/A'}`);
    if (deadlines.regular_decision_notification) {
      console.log(`  Notification: ${deadlines.regular_decision_notification}`);
    }
    
    if (deadlines.offers_rolling_admission) {
      console.log(`✓ Rolling Admission: Yes`);
    }
    
    console.log('');
    console.log(`Source: ${deadlines.source_url || 'N/A'}`);
    console.log(`Confidence: ${deadlines.confidence_score ? (deadlines.confidence_score * 100).toFixed(0) + '%' : 'N/A'}`);
    console.log(`Last verified: ${deadlines.last_verified || 'N/A'}`);
  } else {
    console.log('No deadline data found in database');
  }
  
  return result;
}

async function testMultipleColleges() {
  console.log('===========================================');
  console.log('TESTING DEADLINE SCRAPER ON MULTIPLE COLLEGES');
  console.log('===========================================\n');
  
  const results = [];
  
  for (const collegeName of TEST_COLLEGES) {
    const result = await testSingleCollege(collegeName);
    results.push({ collegeName, success: result.success });
    
    // Wait between requests
    console.log('\nWaiting 3 seconds before next college...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Summary
  console.log('\n===========================================');
  console.log('SUMMARY');
  console.log('===========================================\n');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Total tested: ${results.length}`);
  console.log(`Successful: ${successful} (${Math.round(successful / results.length * 100)}%)`);
  console.log(`Failed: ${failed}`);
  console.log('');
  
  results.forEach(r => {
    console.log(`${r.success ? '✓' : '✗'} ${r.collegeName}`);
  });
}

// Main execution
async function main() {
  const collegeName = process.argv[2];
  
  try {
    if (collegeName) {
      // Test single college
      await testSingleCollege(collegeName);
    } else {
      // Test multiple colleges
      await testMultipleColleges();
    }
    
    console.log('\n✓ Testing complete\n');
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
