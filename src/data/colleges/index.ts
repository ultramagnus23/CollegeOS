// College Data Index
// Exports all college data from JSON files for use in the application

import usCollegesData from './usColleges.json';
import indianCollegesData from './indianColleges.json';
import ukCollegesData from './ukColleges.json';
import germanCollegesData from './germanColleges.json';

import type { USCollege, IndianCollege, UKCollege, GermanCollege } from './types';

// Type assertions for imported JSON data
export const usColleges = usCollegesData as USCollege[];
export const indianColleges = indianCollegesData as IndianCollege[];
export const ukColleges = ukCollegesData as UKCollege[];
export const germanColleges = germanCollegesData as GermanCollege[];

// Export types
export * from './types';

// Utility function to get all colleges combined
export function getAllColleges() {
  return {
    us: usColleges,
    india: indianColleges,
    uk: ukColleges,
    germany: germanColleges,
  };
}

// Get total count of all colleges
export function getTotalCollegeCount() {
  return usColleges.length + indianColleges.length + ukColleges.length + germanColleges.length;
}

// Search colleges by name across all countries
export function searchCollegesByName(query: string) {
  const normalizedQuery = query.toLowerCase();
  
  return {
    us: usColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    india: indianColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    uk: ukColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
    germany: germanColleges.filter(c => c.name.toLowerCase().includes(normalizedQuery)),
  };
}

// Get colleges by country
export function getCollegesByCountry(country: 'us' | 'india' | 'uk' | 'germany') {
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
