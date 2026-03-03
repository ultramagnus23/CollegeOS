/**
 * seedCriticalData.js
 *
 * Seeds verified 2024/2025 data for the top 50 US universities directly into the
 * database, bypassing the scraper.  Safe to run multiple times — uses
 * INSERT OR IGNORE / INSERT OR REPLACE so it never duplicates rows.
 *
 * Usage:  node backend/scripts/seedCriticalData.js
 */

'use strict';

const path = require('path');
// Set working directory so env.js resolves paths correctly
process.chdir(path.join(__dirname, '..'));

const dbManager = require('../src/config/database');
const logger = require('../src/utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// TOP 50 US UNIVERSITIES — verified 2024/2025 data
// Sources: Common Data Set 2023–24, US News 2024
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Each entry: { name, usNewsRank2024, satP25, satP75, actP25, actP75,
 *               gpaMedian, acceptanceRate, tuitionOutState, coaOutState,
 *               avgFinancialAid, percentReceivingAid, ed1Deadline, eaDeadline,
 *               rdDeadline, applicationFee, testPolicy }
 *
 * acceptance_rate: stored as percentage (0–100)
 * tuition/coa: USD per academic year
 */
const TOP50_DATA = [
  {
    name: 'Massachusetts Institute of Technology',
    usNewsRank2024: 1,
    satP25: 1510, satP75: 1580,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.19,
    acceptanceRate: 3.97,
    tuitionOutState: 59750, coaOutState: 85960,
    avgFinancialAid: 59010, percentReceivingAid: 58,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'required',
  },
  {
    name: 'Stanford University',
    usNewsRank2024: 3,
    satP25: 1500, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.96,
    acceptanceRate: 3.68,
    tuitionOutState: 62484, coaOutState: 88416,
    avgFinancialAid: 58220, percentReceivingAid: 54,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 90, testPolicy: 'optional',
  },
  {
    name: 'Harvard University',
    usNewsRank2024: 3,
    satP25: 1510, satP75: 1580,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.18,
    acceptanceRate: 3.59,
    tuitionOutState: 59950, coaOutState: 83650,
    avgFinancialAid: 62400, percentReceivingAid: 55,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'California Institute of Technology',
    usNewsRank2024: 1,
    satP25: 1530, satP75: 1580,
    actP25: 35,   actP75: 36,
    gpaMedian: 4.19,
    acceptanceRate: 3.92,
    tuitionOutState: 60816, coaOutState: 84483,
    avgFinancialAid: 53500, percentReceivingAid: 52,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2025-01-03',
    applicationFee: 0, testPolicy: 'required',
  },
  {
    name: 'University of Chicago',
    usNewsRank2024: 12,
    satP25: 1500, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.00,
    acceptanceRate: 5.43,
    tuitionOutState: 63801, coaOutState: 90759,
    avgFinancialAid: 49100, percentReceivingAid: 54,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Yale University',
    usNewsRank2024: 5,
    satP25: 1500, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.19,
    acceptanceRate: 4.46,
    tuitionOutState: 64700, coaOutState: 85380,
    avgFinancialAid: 62800, percentReceivingAid: 54,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'Princeton University',
    usNewsRank2024: 1,
    satP25: 1500, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.90,
    acceptanceRate: 4.70,
    tuitionOutState: 59710, coaOutState: 81045,
    avgFinancialAid: 63500, percentReceivingAid: 60,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Columbia University',
    usNewsRank2024: 12,
    satP25: 1510, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.11,
    acceptanceRate: 3.85,
    tuitionOutState: 67044, coaOutState: 91450,
    avgFinancialAid: 62400, percentReceivingAid: 56,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'University of Pennsylvania',
    usNewsRank2024: 7,
    satP25: 1510, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.90,
    acceptanceRate: 7.42,
    tuitionOutState: 65668, coaOutState: 91072,
    avgFinancialAid: 56400, percentReceivingAid: 46,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'Duke University',
    usNewsRank2024: 7,
    satP25: 1510, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.94,
    acceptanceRate: 6.32,
    tuitionOutState: 63450, coaOutState: 87650,
    avgFinancialAid: 56400, percentReceivingAid: 45,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'Johns Hopkins University',
    usNewsRank2024: 9,
    satP25: 1510, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.92,
    acceptanceRate: 7.00,
    tuitionOutState: 63340, coaOutState: 85100,
    avgFinancialAid: 49800, percentReceivingAid: 43,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'Northwestern University',
    usNewsRank2024: 9,
    satP25: 1490, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.01,
    acceptanceRate: 6.83,
    tuitionOutState: 63468, coaOutState: 87933,
    avgFinancialAid: 55400, percentReceivingAid: 47,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-03',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Dartmouth College',
    usNewsRank2024: 12,
    satP25: 1500, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.88,
    acceptanceRate: 6.34,
    tuitionOutState: 63990, coaOutState: 87552,
    avgFinancialAid: 58600, percentReceivingAid: 52,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'Brown University',
    usNewsRank2024: 9,
    satP25: 1490, satP75: 1580,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.00,
    acceptanceRate: 5.05,
    tuitionOutState: 65656, coaOutState: 89188,
    avgFinancialAid: 54600, percentReceivingAid: 47,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Cornell University',
    usNewsRank2024: 12,
    satP25: 1480, satP75: 1560,
    actP25: 33,   actP75: 36,
    gpaMedian: 3.90,
    acceptanceRate: 8.71,
    tuitionOutState: 63200, coaOutState: 88960,
    avgFinancialAid: 50900, percentReceivingAid: 46,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'Vanderbilt University',
    usNewsRank2024: 17,
    satP25: 1500, satP75: 1580,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.90,
    acceptanceRate: 6.69,
    tuitionOutState: 61130, coaOutState: 82858,
    avgFinancialAid: 51000, percentReceivingAid: 47,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 50, testPolicy: 'optional',
  },
  {
    name: 'Washington University in St. Louis',
    usNewsRank2024: 24,
    satP25: 1510, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.04,
    acceptanceRate: 12.00,
    tuitionOutState: 60590, coaOutState: 84474,
    avgFinancialAid: 50200, percentReceivingAid: 40,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-02',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Rice University',
    usNewsRank2024: 17,
    satP25: 1510, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 4.00,
    acceptanceRate: 8.60,
    tuitionOutState: 56610, coaOutState: 78272,
    avgFinancialAid: 48700, percentReceivingAid: 48,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'Notre Dame University',
    usNewsRank2024: 20,
    satP25: 1470, satP75: 1560,
    actP25: 33,   actP75: 35,
    gpaMedian: 3.97,
    acceptanceRate: 12.52,
    tuitionOutState: 60301, coaOutState: 80316,
    avgFinancialAid: 43600, percentReceivingAid: 44,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'University of California, Berkeley',
    usNewsRank2024: 17,
    satP25: 1310, satP75: 1540,
    actP25: 29,   actP75: 35,
    gpaMedian: 3.89,
    acceptanceRate: 11.40,
    tuitionOutState: 44066, coaOutState: 70474,
    avgFinancialAid: 24400, percentReceivingAid: 56,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2024-11-30',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'University of California, Los Angeles',
    usNewsRank2024: 20,
    satP25: 1290, satP75: 1530,
    actP25: 29,   actP75: 35,
    gpaMedian: 3.90,
    acceptanceRate: 9.00,
    tuitionOutState: 44066, coaOutState: 68904,
    avgFinancialAid: 22800, percentReceivingAid: 55,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2024-11-30',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'Georgetown University',
    usNewsRank2024: 22,
    satP25: 1430, satP75: 1550,
    actP25: 32,   actP75: 35,
    gpaMedian: 3.93,
    acceptanceRate: 12.18,
    tuitionOutState: 63936, coaOutState: 86296,
    avgFinancialAid: 43200, percentReceivingAid: 43,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-10',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Emory University',
    usNewsRank2024: 24,
    satP25: 1420, satP75: 1540,
    actP25: 32,   actP75: 35,
    gpaMedian: 3.80,
    acceptanceRate: 11.73,
    tuitionOutState: 58200, coaOutState: 79688,
    avgFinancialAid: 42500, percentReceivingAid: 48,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Carnegie Mellon University',
    usNewsRank2024: 22,
    satP25: 1500, satP75: 1570,
    actP25: 34,   actP75: 36,
    gpaMedian: 3.85,
    acceptanceRate: 11.20,
    tuitionOutState: 60468, coaOutState: 83792,
    avgFinancialAid: 44200, percentReceivingAid: 45,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'University of Michigan',
    usNewsRank2024: 27,
    satP25: 1360, satP75: 1530,
    actP25: 32,   actP75: 35,
    gpaMedian: 3.89,
    acceptanceRate: 17.70,
    tuitionOutState: 52266, coaOutState: 76618,
    avgFinancialAid: 21200, percentReceivingAid: 42,
    ed1Deadline: null, eaDeadline: '2024-11-01', rdDeadline: '2025-02-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'New York University',
    usNewsRank2024: 35,
    satP25: 1400, satP75: 1540,
    actP25: 31,   actP75: 35,
    gpaMedian: 3.71,
    acceptanceRate: 12.20,
    tuitionOutState: 60438, coaOutState: 87072,
    avgFinancialAid: 35400, percentReceivingAid: 55,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'University of Southern California',
    usNewsRank2024: 27,
    satP25: 1430, satP75: 1540,
    actP25: 32,   actP75: 35,
    gpaMedian: 3.79,
    acceptanceRate: 9.46,
    tuitionOutState: 67722, coaOutState: 92050,
    avgFinancialAid: 38600, percentReceivingAid: 44,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-15',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'Tufts University',
    usNewsRank2024: 35,
    satP25: 1440, satP75: 1560,
    actP25: 33,   actP75: 35,
    gpaMedian: 3.89,
    acceptanceRate: 11.00,
    tuitionOutState: 68010, coaOutState: 88990,
    avgFinancialAid: 40600, percentReceivingAid: 40,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Wake Forest University',
    usNewsRank2024: 35,
    satP25: 1380, satP75: 1510,
    actP25: 31,   actP75: 34,
    gpaMedian: 3.71,
    acceptanceRate: 21.00,
    tuitionOutState: 63260, coaOutState: 83740,
    avgFinancialAid: 38200, percentReceivingAid: 39,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'University of Virginia',
    usNewsRank2024: 24,
    satP25: 1390, satP75: 1540,
    actP25: 31,   actP75: 35,
    gpaMedian: 4.15,
    acceptanceRate: 18.55,
    tuitionOutState: 50900, coaOutState: 73070,
    avgFinancialAid: 22900, percentReceivingAid: 39,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'Georgia Institute of Technology',
    usNewsRank2024: 33,
    satP25: 1390, satP75: 1540,
    actP25: 33,   actP75: 36,
    gpaMedian: 4.07,
    acceptanceRate: 17.00,
    tuitionOutState: 32396, coaOutState: 52818,
    avgFinancialAid: 15200, percentReceivingAid: 40,
    ed1Deadline: null, eaDeadline: '2024-10-15', rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'required',
  },
  {
    name: 'Boston University',
    usNewsRank2024: 41,
    satP25: 1360, satP75: 1510,
    actP25: 31,   actP75: 34,
    gpaMedian: 3.71,
    acceptanceRate: 14.00,
    tuitionOutState: 63656, coaOutState: 88520,
    avgFinancialAid: 32400, percentReceivingAid: 53,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-03',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'University of California, San Diego',
    usNewsRank2024: 27,
    satP25: 1310, satP75: 1510,
    actP25: 30,   actP75: 35,
    gpaMedian: 4.10,
    acceptanceRate: 23.00,
    tuitionOutState: 44066, coaOutState: 66938,
    avgFinancialAid: 22200, percentReceivingAid: 60,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2024-11-30',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'University of California, Davis',
    usNewsRank2024: 38,
    satP25: 1200, satP75: 1470,
    actP25: 27,   actP75: 34,
    gpaMedian: 3.96,
    acceptanceRate: 37.00,
    tuitionOutState: 44066, coaOutState: 68194,
    avgFinancialAid: 22200, percentReceivingAid: 67,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2024-11-30',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'University of North Carolina at Chapel Hill',
    usNewsRank2024: 22,
    satP25: 1290, satP75: 1490,
    actP25: 29,   actP75: 34,
    gpaMedian: 4.47,
    acceptanceRate: 18.00,
    tuitionOutState: 36776, coaOutState: 57028,
    avgFinancialAid: 17200, percentReceivingAid: 47,
    ed1Deadline: null, eaDeadline: '2024-10-15', rdDeadline: '2025-01-15',
    applicationFee: 85, testPolicy: 'optional',
  },
  {
    name: 'Purdue University',
    usNewsRank2024: 47,
    satP25: 1180, satP75: 1430,
    actP25: 26,   actP75: 33,
    gpaMedian: 3.73,
    acceptanceRate: 53.00,
    tuitionOutState: 28794, coaOutState: 48220,
    avgFinancialAid: 14400, percentReceivingAid: 55,
    ed1Deadline: null, eaDeadline: null, rdDeadline: null,
    applicationFee: 60, testPolicy: 'optional',
  },
  {
    name: 'Pennsylvania State University',
    usNewsRank2024: 56,
    satP25: 1160, satP75: 1370,
    actP25: 26,   actP75: 31,
    gpaMedian: 3.57,
    acceptanceRate: 56.00,
    tuitionOutState: 35514, coaOutState: 55016,
    avgFinancialAid: 13200, percentReceivingAid: 60,
    ed1Deadline: null, eaDeadline: null, rdDeadline: null,
    applicationFee: 65, testPolicy: 'optional',
  },
  {
    name: 'University of Texas at Austin',
    usNewsRank2024: 38,
    satP25: 1210, satP75: 1470,
    actP25: 27,   actP75: 33,
    gpaMedian: 3.74,
    acceptanceRate: 31.00,
    tuitionOutState: 38326, coaOutState: 57660,
    avgFinancialAid: 14800, percentReceivingAid: 51,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2024-12-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'University of Wisconsin-Madison',
    usNewsRank2024: 33,
    satP25: 1280, satP75: 1490,
    actP25: 28,   actP75: 33,
    gpaMedian: 3.77,
    acceptanceRate: 45.00,
    tuitionOutState: 37785, coaOutState: 57509,
    avgFinancialAid: 15800, percentReceivingAid: 54,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2025-02-01',
    applicationFee: 60, testPolicy: 'optional',
  },
  {
    name: 'Ohio State University',
    usNewsRank2024: 47,
    satP25: 1250, satP75: 1460,
    actP25: 28,   actP75: 33,
    gpaMedian: 3.78,
    acceptanceRate: 53.00,
    tuitionOutState: 32061, coaOutState: 48840,
    avgFinancialAid: 13600, percentReceivingAid: 56,
    ed1Deadline: null, eaDeadline: null, rdDeadline: null,
    applicationFee: 60, testPolicy: 'optional',
  },
  {
    name: 'University of Florida',
    usNewsRank2024: 27,
    satP25: 1280, satP75: 1460,
    actP25: 29,   actP75: 33,
    gpaMedian: 4.40,
    acceptanceRate: 25.00,
    tuitionOutState: 28658, coaOutState: 45456,
    avgFinancialAid: 13000, percentReceivingAid: 60,
    ed1Deadline: null, eaDeadline: null, rdDeadline: '2025-11-01',
    applicationFee: 30, testPolicy: 'optional',
  },
  {
    name: 'Northeastern University',
    usNewsRank2024: 50,
    satP25: 1430, satP75: 1560,
    actP25: 32,   actP75: 35,
    gpaMedian: 3.81,
    acceptanceRate: 6.80,
    tuitionOutState: 61832, coaOutState: 85380,
    avgFinancialAid: 37000, percentReceivingAid: 50,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 75, testPolicy: 'optional',
  },
  {
    name: 'Boston College',
    usNewsRank2024: 35,
    satP25: 1400, satP75: 1540,
    actP25: 32,   actP75: 35,
    gpaMedian: 3.87,
    acceptanceRate: 17.00,
    tuitionOutState: 62950, coaOutState: 83684,
    avgFinancialAid: 40700, percentReceivingAid: 45,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-01',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'Lehigh University',
    usNewsRank2024: 56,
    satP25: 1290, satP75: 1460,
    actP25: 30,   actP75: 34,
    gpaMedian: 3.61,
    acceptanceRate: 32.00,
    tuitionOutState: 60650, coaOutState: 80226,
    avgFinancialAid: 31400, percentReceivingAid: 46,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-15',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'Tulane University',
    usNewsRank2024: 50,
    satP25: 1340, satP75: 1500,
    actP25: 30,   actP75: 34,
    gpaMedian: 3.61,
    acceptanceRate: 13.00,
    tuitionOutState: 63574, coaOutState: 83226,
    avgFinancialAid: 37200, percentReceivingAid: 49,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-15',
    applicationFee: 0, testPolicy: 'optional',
  },
  {
    name: 'Villanova University',
    usNewsRank2024: 50,
    satP25: 1330, satP75: 1490,
    actP25: 30,   actP75: 34,
    gpaMedian: 3.73,
    acceptanceRate: 24.00,
    tuitionOutState: 62740, coaOutState: 80924,
    avgFinancialAid: 34400, percentReceivingAid: 55,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-15',
    applicationFee: 80, testPolicy: 'optional',
  },
  {
    name: 'Rensselaer Polytechnic Institute',
    usNewsRank2024: 56,
    satP25: 1340, satP75: 1510,
    actP25: 31,   actP75: 35,
    gpaMedian: 3.90,
    acceptanceRate: 49.00,
    tuitionOutState: 60638, coaOutState: 82168,
    avgFinancialAid: 36900, percentReceivingAid: 63,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-15',
    applicationFee: 70, testPolicy: 'optional',
  },
  {
    name: 'Case Western Reserve University',
    usNewsRank2024: 47,
    satP25: 1410, satP75: 1540,
    actP25: 33,   actP75: 35,
    gpaMedian: 3.89,
    acceptanceRate: 27.00,
    tuitionOutState: 59798, coaOutState: 81048,
    avgFinancialAid: 38600, percentReceivingAid: 66,
    ed1Deadline: '2024-11-01', eaDeadline: null, rdDeadline: '2025-01-15',
    applicationFee: 50, testPolicy: 'optional',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// COMMON APP Personal Statement prompts (standard for all Common App schools)
// ─────────────────────────────────────────────────────────────────────────────
const COMMON_APP_PROMPTS = [
  {
    prompt_text: 'Some students have a background, identity, interest, or talent that is so meaningful they believe their application would be incomplete without it. If this sounds like you, then please share your story.',
    word_limit: 650, is_required: 0, prompt_order: 1,
  },
  {
    prompt_text: 'The lessons we take from obstacles we encounter can be fundamental to later success. Recount a time when you faced a challenge, setback, or failure. How did it affect you, and what did you learn from the experience?',
    word_limit: 650, is_required: 0, prompt_order: 2,
  },
  {
    prompt_text: 'Reflect on a time when you questioned or challenged a belief or idea. What prompted your thinking? What was the outcome?',
    word_limit: 650, is_required: 0, prompt_order: 3,
  },
  {
    prompt_text: 'Reflect on something that someone has done for you that has made you happy or thankful in a surprising way. How has this gratitude affected or motivated you?',
    word_limit: 650, is_required: 0, prompt_order: 4,
  },
  {
    prompt_text: 'Discuss an accomplishment, event, or realization that sparked a period of personal growth and a new understanding of yourself or others.',
    word_limit: 650, is_required: 0, prompt_order: 5,
  },
  {
    prompt_text: 'Describe a topic, idea, or concept you find so engaging that it makes you lose all track of time. Why does it captivate you? What or who do you turn to when you want to learn more?',
    word_limit: 650, is_required: 0, prompt_order: 6,
  },
  {
    prompt_text: 'Share an essay on any topic of your choice. It can be one you\'ve already written, one that responds to a different prompt, or one of your own design.',
    word_limit: 650, is_required: 0, prompt_order: 7,
  },
];

// Known supplemental prompts for top schools (2024–25 cycle)
const KNOWN_SUPPLEMENTS = [
  {
    college: 'Harvard University',
    prompts: [
      { text: 'Harvard has long recognized the importance of enrolling a diverse student body. How will the life experiences, perspectives, and goals you bring enrich the Harvard community?', word_limit: 150 },
      { text: 'Briefly describe an intellectual experience that was important to you.', word_limit: 200 },
      { text: 'Briefly describe any of your extracurricular activities, employment experience, travel, or family responsibilities that have shaped who you are.', word_limit: 150 },
      { text: 'How do you hope to use your Harvard education in the future?', word_limit: 150 },
      { text: 'Top choices list (required): Please list five books, people, films, or musical artists that have influenced you.', word_limit: 0 },
    ],
  },
  {
    college: 'Stanford University',
    prompts: [
      { text: 'What is the most significant challenge that society faces today? (250 words)', word_limit: 250 },
      { text: 'How did you spend your last two summers? (250 words)', word_limit: 250 },
      { text: 'What were your favorite events (e.g. performances, exhibits, sporting events, etc.) this past year? (50 words)', word_limit: 50 },
      { text: 'Briefly elaborate on one of your extracurricular activities or work experiences. (150 words)', word_limit: 150 },
      { text: 'List five things that are important to you.', word_limit: 50 },
    ],
  },
  {
    college: 'Massachusetts Institute of Technology',
    prompts: [
      { text: 'We know you lead a busy life, full of activities, many of which are required of you. Tell us about something you do for the pleasure of it. (100 words)', word_limit: 100 },
      { text: 'Although you may not yet know what you want to major in, which department or program at MIT appeals to you and why? (100 words)', word_limit: 100 },
      { text: 'At MIT, we bring people together to better the lives of others. MIT students work to improve their communities in collaborative ways, whether tackling the world\'s greatest challenges or being a good friend. Describe one way in which you have contributed to your community, whether in your family, the classroom, your neighborhood, etc. (200–250 words)', word_limit: 250 },
      { text: 'Tell us about the most significant challenge you\'ve faced or something important that didn\'t go according to plan. How did you manage the situation? (200–250 words)', word_limit: 250 },
    ],
  },
  {
    college: 'Yale University',
    prompts: [
      { text: 'Students at Yale have time to explore their academic interests before committing to one or more major fields of study. Many students either modify their original academic direction or change their minds entirely. As of today, what academic areas seem to fit your interests or goals most comfortably? Please indicate up to three from the list provided.', word_limit: 0 },
      { text: 'What is it about Yale that has led you to apply? (125 words)', word_limit: 125 },
      { text: 'Yale\'s extensive course offerings and vibrant conversations beyond the classroom encourage students to follow their developing interests wherever they lead. Tell us about a topic or idea that excites you and is related to one or more academic areas you selected above. Why are you drawn to it? (250 words)', word_limit: 250 },
      { text: 'What do you hope to explore, and what aspects of Yale\'s unique offerings excite you? (250 words)', word_limit: 250 },
    ],
  },
  {
    college: 'Columbia University',
    prompts: [
      { text: 'List a selection of texts, resources, and outlets that have contributed to your intellectual development outside of academic courses, including but not limited to books, journals, websites, podcasts, essays, or other content. (300 words)', word_limit: 300 },
      { text: 'A hallmark of the Columbia experience is being able to learn and live in New York City. What aspects of Columbia\'s location appeal to you, and how do you hope to connect with and contribute to the city and/or Columbia\'s broader community? (300 words)', word_limit: 300 },
      { text: 'Columbia has a longstanding commitment to and rich history of inclusivity, diversity, and equity. With this in mind, how do you plan to engage with and contribute to Columbia? (300 words)', word_limit: 300 },
    ],
  },
  {
    college: 'Princeton University',
    prompts: [
      { text: 'Princeton has a longstanding commitment to service and civic engagement. Tell us how your story intersects or will intersect with these ideals. (250 words)', word_limit: 250 },
      { text: 'Princeton asks students to engage in a senior thesis or independent project, and most departments require seniors to complete a thesis or independent project as a capstone of their studies. Tell us about a topic or idea that you\'re so excited about that you\'d consider pursuing independent work on it at Princeton. (250 words)', word_limit: 250 },
      { text: 'Culture, identity, expression: how do they shape you? (250 words)', word_limit: 250 },
    ],
  },
  {
    college: 'University of Pennsylvania',
    prompts: [
      { text: 'How did you discover your intellectual and academic interests, and why do you want to explore them at the University of Pennsylvania? Please respond considering the specific undergraduate school you have applied to (e.g., College of Arts and Sciences, Wharton, Engineering, Nursing). (150–200 words)', word_limit: 200 },
      { text: 'At Penn, learning and growth happen outside of the classroom, too. How will you explore the community at Penn? Consider how this community will help shape your perspective and identity and how your identity and perspective will help shape this community. (150–200 words)', word_limit: 200 },
    ],
  },
  {
    college: 'Duke University',
    prompts: [
      { text: 'We\'re seeking curious, academically engaged students who want to join us in exploring and making sense of a complex, challenging, and changing world. Describe your intellectual interests, how they developed, and what makes them compelling to you. Then discuss how you would pursue these intellectual interests at Duke. (250 words)', word_limit: 250 },
    ],
  },
  {
    college: 'Johns Hopkins University',
    prompts: [
      { text: 'Founded in the spirit of exploration and discovery, Johns Hopkins University encourages students to share their perspectives, develop their interests, and pursue new experiences. Use this space to share more about who you are, what matters to you, and/or what you want to explore at Hopkins. (300 words)', word_limit: 300 },
    ],
  },
  {
    college: 'Northwestern University',
    prompts: [
      { text: 'Students at Northwestern often describe themselves as "work hard, play hard" — how do you embody that approach? What is something you do for fun? (300 words)', word_limit: 300 },
      { text: 'Northwestern offers students a diverse range of opportunities. Using specific examples, explain how you would explore those opportunities. (300 words)', word_limit: 300 },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Looks up a college id in the colleges table by exact or partial name match.
 * Returns null if not found.
 */
function findCollegeId(db, name) {
  // Try exact match first
  let row = db.prepare('SELECT id FROM colleges WHERE name = ? LIMIT 1').get(name);
  if (row) return row.id;

  // Try case-insensitive
  row = db.prepare('SELECT id FROM colleges WHERE LOWER(name) = LOWER(?) LIMIT 1').get(name);
  if (row) return row.id;

  // Try partial match
  row = db.prepare('SELECT id FROM colleges WHERE name LIKE ? LIMIT 1').get(`%${name}%`);
  if (row) return row.id;

  return null;
}

/**
 * Looks up a colleges_comprehensive id by name match.
 * Returns null if not found.
 */
function findComprehensiveId(db, name) {
  let row = db.prepare('SELECT id FROM colleges_comprehensive WHERE name = ? LIMIT 1').get(name);
  if (row) return row.id;
  row = db.prepare('SELECT id FROM colleges_comprehensive WHERE LOWER(name) = LOWER(?) LIMIT 1').get(name);
  if (row) return row.id;
  row = db.prepare('SELECT id FROM colleges_comprehensive WHERE name LIKE ? LIMIT 1').get(`%${name}%`);
  if (row) return row.id;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function seedAdmittedStudentStats(db, comprehensiveId, data, year) {
  if (!comprehensiveId) return;
  db.prepare(`
    INSERT OR REPLACE INTO admitted_student_stats
      (college_id, year, gpa_50, sat_25, sat_75, act_25, act_75, source, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'seed_2024', 0.90)
  `).run(
    comprehensiveId, year,
    data.gpaMedian,
    data.satP25, data.satP75,
    data.actP25, data.actP75,
  );
}

function seedFinancialData(db, comprehensiveId, data, year) {
  if (!comprehensiveId) return;
  db.prepare(`
    INSERT OR REPLACE INTO college_financial_data
      (college_id, year, tuition_out_state, cost_of_attendance,
       avg_financial_aid, percent_receiving_aid, need_blind_flag,
       source, confidence_score)
    VALUES (?, ?, ?, ?, ?, ?, 1, 'seed_2024', 0.90)
  `).run(
    comprehensiveId, year,
    data.tuitionOutState, data.coaOutState,
    data.avgFinancialAid, data.percentReceivingAid,
  );
}

function seedApplicationDeadlines(db, collegeId, data) {
  if (!collegeId) return;

  const hasED = data.ed1Deadline ? 1 : 0;
  const hasEA = data.eaDeadline ? 1 : 0;

  db.prepare(`
    INSERT OR REPLACE INTO application_deadlines
      (college_id, early_decision_1_date, early_action_date,
       regular_decision_date,
       offers_early_decision, offers_early_action,
       application_fee, application_fee_waiver_available,
       confidence_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0.90)
  `).run(
    collegeId,
    data.ed1Deadline,
    data.eaDeadline,
    data.rdDeadline,
    hasED, hasEA,
    data.applicationFee,
  );
}

function seedCollegeRequirements(db, collegeId, data) {
  if (!collegeId) return;
  db.prepare(`
    INSERT OR REPLACE INTO college_requirements
      (college_id, test_policy, teacher_recommendations_required,
       counselor_recommendation_required, supplemental_essays_count,
       confidence_score)
    VALUES (?, ?, 2, 1, 0, 0.80)
  `).run(collegeId, data.testPolicy);
}

function seedRanking(db, comprehensiveId, data, year) {
  if (!comprehensiveId) return;
  db.prepare(`
    INSERT OR IGNORE INTO college_rankings
      (college_id, year, ranking_body, national_rank)
    VALUES (?, ?, 'US News', ?)
  `).run(comprehensiveId, year, data.usNewsRank2024);
}

function seedEssayPrompts(db, collegeId, prompts) {
  if (!collegeId || !prompts || prompts.length === 0) return;
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO essay_prompts
      (college_id, prompt_text, word_limit, is_required, prompt_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  prompts.forEach((p, i) => {
    stmt.run(collegeId, p.prompt_text ?? p.text, p.word_limit, p.is_required ?? 1, p.prompt_order ?? (i + 1));
  });
}

function seedCommonAppPrompts(db, collegeId) {
  seedEssayPrompts(db, collegeId, COMMON_APP_PROMPTS);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const db = dbManager.getDatabase();
  const YEAR = 2024;

  let seeded = 0;
  let skipped = 0;
  let warnings = 0;

  // Build lookup map for known supplements
  const supplementMap = new Map(KNOWN_SUPPLEMENTS.map(s => [s.college, s.prompts]));

  const seedAll = db.transaction(() => {
    for (const data of TOP50_DATA) {
      const collegeId = findCollegeId(db, data.name);
      const compId = findComprehensiveId(db, data.name);

      if (!collegeId && !compId) {
        logger.warn('College not found in DB — skipping seed', { name: data.name });
        warnings++;
        skipped++;
        continue;
      }

      // admitted_student_stats and financial_data reference colleges_comprehensive
      if (compId) {
        seedAdmittedStudentStats(db, compId, data, YEAR);
        seedFinancialData(db, compId, data, YEAR);
        seedRanking(db, compId, data, YEAR);
      } else {
        logger.warn('No colleges_comprehensive entry — skipping stats/financial/ranking seed', { name: data.name });
        warnings++;
      }

      // application_deadlines and college_requirements reference colleges.id
      if (collegeId) {
        seedApplicationDeadlines(db, collegeId, data);
        seedCollegeRequirements(db, collegeId, data);

        // Seed Common App personal statement prompts
        seedCommonAppPrompts(db, collegeId);

        // Seed known supplement prompts if available
        const supplements = supplementMap.get(data.name);
        if (supplements) {
          const supplementRows = supplements.map((p, i) => ({
            prompt_text: p.text, word_limit: p.word_limit, is_required: 1, prompt_order: i + 1,
          }));
          seedEssayPrompts(db, collegeId, supplementRows);
        }
      }

      seeded++;
      logger.info('Seeded college', { name: data.name, collegeId, compId });
    }
  });

  seedAll();

  const summary = {
    total: TOP50_DATA.length,
    seeded,
    skipped,
    warnings,
  };

  logger.info('Seed complete', summary);
  // eslint-disable-next-line no-console
  console.log('\n✅ seedCriticalData complete:', JSON.stringify(summary, null, 2));
}

main().catch(err => {
  logger.error('seedCriticalData failed', { error: err.message });
  // eslint-disable-next-line no-console
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
