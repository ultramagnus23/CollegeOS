/**
 * Normalized Majors Database Seeder
 * 
 * This script:
 * 1. Creates the master majors catalog from parsed college data
 * 2. Normalizes major names using fuzzy matching and synonyms
 * 3. Maps colleges to majors using the join table
 * 4. Assigns CIP codes and STEM flags
 * 5. Tracks sources and confidence scores
 */

const fs = require('fs');
const path = require('path');

// Load database manager
const dbManager = require('../src/config/database');

// Data paths
const UNIFIED_DATA_FILE = path.join(__dirname, '..', 'data', 'unified_colleges.json');
const MIGRATION_FILE = path.join(__dirname, '..', 'migrations', '012_normalized_majors.sql');
