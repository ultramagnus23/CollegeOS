// College Data Index
// Exports all college data from JSON files for use in the application
// EXPANDED DATABASE: 1050+ colleges across 4 countries

import usCollegesData from './usColleges.json';
import indianCollegesData from './indianColleges.json';
import ukCollegesData from './ukColleges.json';
import germanCollegesData from './germanColleges.json';

// Expanded college data (1050+ institutions)
import usCollegesExpandedData from './usCollegesExpanded.json';
import indianCollegesExpandedData from './indianCollegesExpanded.json';
import ukCollegesExpandedData from './ukCollegesExpanded.json';
import germanCollegesExpandedData from './germanCollegesExpanded.json';
import statsData from './stats.json';

import type { USCollege, IndianCollege, UKCollege, GermanCollege } from './types';

// Type for expanded college data (simplified unified format)
export interface ExpandedCollege {
  rank: number;
  name: string;
  website: string;
  location: {
    city: string;
    state?: string;
    country: string;
    countryFull?: string;
  };
  type?: string;
  tier: number; // 1-4, with 1 being top tier
  [key: string]: unknown; // Allow country-specific fields
}

// Original detailed data (smaller set)
export const usColleges = usCollegesData as USCollege[];
export const indianColleges = indianCollegesData as IndianCollege[];
export const ukColleges = ukCollegesData as UKCollege[];
export const germanColleges = germanCollegesData as GermanCollege[];

// Expanded data (1050+ colleges)
export const usCollegesExpanded = usCollegesExpandedData as ExpandedCollege[];
export const indianCollegesExpanded = indianCollegesExpandedData as ExpandedCollege[];
export const ukCollegesExpanded = ukCollegesExpandedData as ExpandedCollege[];
export const germanCollegesExpanded = germanCollegesExpandedData as ExpandedCollege[];

// Database statistics
export const databaseStats = statsData;

// Export types
export * from './types';

// Utility function to get all colleges combined (original detailed data)
export function getAllColleges() {
  return {
    us: usColleges,
    india: indianColleges,
    uk: ukColleges,
    germany: germanColleges,
  };
}

// Get all expanded colleges (1050+ colleges)
export function getAllExpandedColleges() {
  return {
    us: usCollegesExpanded,
    india: indianCollegesExpanded,
    uk: ukCollegesExpanded,
    germany: germanCollegesExpanded,
  };
}

// Get total count of all colleges (original)
export function getTotalCollegeCount() {
  return usColleges.length + indianColleges.length + ukColleges.length + germanColleges.length;
}

// Get total count of all expanded colleges
export function getExpandedCollegeCount() {
  return usCollegesExpanded.length + indianCollegesExpanded.length + ukCollegesExpanded.length + germanCollegesExpanded.length;
}

// Search colleges by name across all countries (expanded database)
export function searchCollegesByName(query: string, useExpanded = true) {
  const normalizedQuery = query.toLowerCase();
  
  if (useExpanded) {
    return {
      us: usCollegesExpanded.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
      india: indianCollegesExpanded.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
      uk: ukCollegesExpanded.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
      germany: germanCollegesExpanded.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    };
  }
  
  return {
    us: usColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    india: indianColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    uk: ukColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    germany: germanColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
  };
}

// Get colleges by country (supports both original and expanded)
export function getCollegesByCountry(country: 'us' | 'india' | 'uk' | 'germany', expanded = true) {
  if (expanded) {
    switch (country) {
      case 'us':
        return usCollegesExpanded;
      case 'india':
        return indianCollegesExpanded;
      case 'uk':
        return ukCollegesExpanded;
      case 'germany':
        return germanCollegesExpanded;
    }
  }
  
  switch (country) {
    case 'us':
      return usColleges;
    case 'india':
      return indianColleges;
    case 'uk':
      return ukColleges;
    case 'germany':
      return germanColleges;
  }
}

// Get colleges by tier (1-4, with 1 being top tier)
export function getCollegesByTier(tier: 1 | 2 | 3 | 4) {
  const allExpanded = [
    ...usCollegesExpanded,
    ...indianCollegesExpanded,
    ...ukCollegesExpanded,
    ...germanCollegesExpanded,
  ];
  
  return allExpanded.filter(c => c.tier === tier);
}

// Get database statistics
export function getDatabaseStats() {
  return {
    ...databaseStats,
    originalCounts: {
      us: usColleges.length,
      india: indianColleges.length,
      uk: ukColleges.length,
      germany: germanColleges.length,
      total: getTotalCollegeCount(),
    },
    expandedCounts: {
      us: usCollegesExpanded.length,
      india: indianCollegesExpanded.length,
      uk: ukCollegesExpanded.length,
      germany: germanCollegesExpanded.length,
      total: getExpandedCollegeCount(),
    },
  };
}
