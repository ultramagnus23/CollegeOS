# backend/ml-service/tests/test_data_processor.py
# Tests for data processing and normalization

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import unittest
from data_processor import DataProcessor


class TestDataProcessor(unittest.TestCase):
    def setUp(self):
        self.processor = DataProcessor()

    def test_normalize_gpa_4_scale(self):
        """Test GPA normalization on 4.0 scale"""
        self.assertEqual(self.processor.normalize_gpa(4.0, '4.0'), 4.0)
        self.assertEqual(self.processor.normalize_gpa(3.5, '4.0'), 3.5)
        self.assertEqual(self.processor.normalize_gpa(0.0, '4.0'), 0.0)

    def test_normalize_gpa_5_scale(self):
        """Test GPA normalization from 5.0 scale"""
        result = self.processor.normalize_gpa(5.0, '5.0')
        self.assertEqual(result, 4.0)
        
        result = self.processor.normalize_gpa(2.5, '5.0')
        self.assertEqual(result, 2.0)

    def test_normalize_gpa_100_scale(self):
        """Test GPA normalization from 100-point scale"""
        result = self.processor.normalize_gpa(100, '100')
        self.assertEqual(result, 4.0)
        
        result = self.processor.normalize_gpa(75, '100')
        self.assertEqual(result, 3.0)

    def test_normalize_gpa_auto_detect(self):
        """Test automatic scale detection"""
        # Should detect as 100 scale
        result = self.processor.normalize_gpa(95, '4.0')
        self.assertAlmostEqual(result, 3.8, places=1)

    def test_normalize_gpa_none(self):
        """Test None GPA handling"""
        self.assertIsNone(self.processor.normalize_gpa(None))

    def test_sat_to_percentile(self):
        """Test SAT to percentile conversion"""
        self.assertEqual(self.processor.sat_to_percentile(1600), 99)
        self.assertEqual(self.processor.sat_to_percentile(1500), 98)
        self.assertEqual(self.processor.sat_to_percentile(1200), 74)
        self.assertEqual(self.processor.sat_to_percentile(1000), 38)

    def test_sat_to_percentile_none(self):
        """Test None SAT handling"""
        self.assertIsNone(self.processor.sat_to_percentile(None))

    def test_act_to_percentile(self):
        """Test ACT to percentile conversion"""
        self.assertEqual(self.processor.act_to_percentile(36), 99)
        self.assertEqual(self.processor.act_to_percentile(30), 94)
        self.assertEqual(self.processor.act_to_percentile(25), 78)
        self.assertEqual(self.processor.act_to_percentile(20), 50)

    def test_get_test_score_percentile_sat_only(self):
        """Test with SAT only"""
        result = self.processor.get_test_score_percentile(1500, None)
        self.assertEqual(result, 98)

    def test_get_test_score_percentile_act_only(self):
        """Test with ACT only"""
        result = self.processor.get_test_score_percentile(None, 34)
        self.assertEqual(result, 99)

    def test_get_test_score_percentile_both(self):
        """Test with both SAT and ACT - should return higher"""
        result = self.processor.get_test_score_percentile(1200, 34)  # 74 vs 99
        self.assertEqual(result, 99)

    def test_classify_activity_tier_national(self):
        """Test tier 1 classification for national achievements"""
        tier = self.processor.classify_activity_tier('Intel Science Fair Winner')
        self.assertEqual(tier, 1)
        
        tier = self.processor.classify_activity_tier('International Math Olympiad')
        self.assertEqual(tier, 1)

    def test_classify_activity_tier_state(self):
        """Test tier 2 classification for state achievements"""
        tier = self.processor.classify_activity_tier('State Science Fair')
        self.assertEqual(tier, 2)
        
        tier = self.processor.classify_activity_tier('Varsity Captain')
        self.assertEqual(tier, 2)

    def test_classify_activity_tier_school(self):
        """Test tier 3 classification for school-level"""
        tier = self.processor.classify_activity_tier('School Volunteer')
        self.assertEqual(tier, 3)

    def test_classify_activity_tier_default(self):
        """Test default tier 4 classification"""
        tier = self.processor.classify_activity_tier('Random Activity')
        self.assertEqual(tier, 4)

    def test_calculate_confidence_score_complete(self):
        """Test confidence score for complete record"""
        record = {
            'gpa': 3.8,
            'decision': 'accepted',
            'sat_total': 1500,
            'act_composite': 34,
            'class_rank_percentile': 95,
            'activity_tier1_count': 2,
            'activity_tier2_count': 3,
            'source': 'verified',
            'is_verified': True
        }
        
        score = self.processor.calculate_confidence_score(record)
        self.assertGreater(score, 0.8)

    def test_calculate_confidence_score_minimal(self):
        """Test confidence score for minimal record"""
        record = {
            'gpa': 3.5,
            'decision': 'rejected'
        }
        
        score = self.processor.calculate_confidence_score(record)
        self.assertGreater(score, 0.3)  # Has essential fields

    def test_is_suspicious_entry_valid(self):
        """Test valid entry not flagged as suspicious"""
        record = {
            'gpa': 3.8,
            'sat_total': 1500,
            'act_composite': 34,
            'class_rank_percentile': 95
        }
        
        is_suspicious, reasons = self.processor.is_suspicious_entry(record)
        self.assertFalse(is_suspicious)
        self.assertEqual(len(reasons), 0)

    def test_is_suspicious_entry_invalid_sat(self):
        """Test invalid SAT score flagged"""
        record = {'sat_total': 1700}  # Invalid - max is 1600
        
        is_suspicious, reasons = self.processor.is_suspicious_entry(record)
        self.assertTrue(is_suspicious)
        self.assertTrue(any('SAT' in r for r in reasons))

    def test_is_suspicious_entry_invalid_act(self):
        """Test invalid ACT score flagged"""
        record = {'act_composite': 40}  # Invalid - max is 36
        
        is_suspicious, reasons = self.processor.is_suspicious_entry(record)
        self.assertTrue(is_suspicious)
        self.assertTrue(any('ACT' in r for r in reasons))

    def test_is_suspicious_entry_inconsistent(self):
        """Test inconsistent data flagged"""
        record = {
            'gpa': 1.5,  # Very low
            'sat_total': 1550  # Very high - inconsistent
        }
        
        is_suspicious, reasons = self.processor.is_suspicious_entry(record)
        self.assertTrue(is_suspicious)
        self.assertTrue(any('inconsistent' in r.lower() for r in reasons))

    def test_prepare_prediction_input(self):
        """Test prediction input preparation"""
        student_profile = {
            'gpa_unweighted': 3.8,
            'sat_total': 1450,
            'act_composite': 32,
            'class_rank_percentile': 90,
            'num_ap_courses': 8,
            'activity_tier1_count': 2,
            'activity_tier2_count': 3,
            'is_first_generation': True,
            'is_legacy': False,
            'state_province': 'CA'
        }
        
        college = {
            'acceptance_rate': 10,
            'location_state': 'CA'
        }
        
        result = self.processor.prepare_prediction_input(student_profile, college)
        
        self.assertAlmostEqual(result['gpa_normalized'], 3.8, places=1)
        self.assertGreater(result['test_score_percentile'], 90)
        self.assertEqual(result['class_rank_percentile'], 90)
        self.assertEqual(result['ap_ib_count'], 8)
        self.assertEqual(result['is_first_gen'], 1)
        self.assertEqual(result['is_legacy'], 0)
        self.assertEqual(result['is_in_state'], 1)  # CA matches


if __name__ == '__main__':
    unittest.main()
