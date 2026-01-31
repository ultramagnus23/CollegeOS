# backend/ml-service/data_processor.py
# Data processing and normalization for ML training

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import config


class DataProcessor:
    """
    Handles data normalization, cleaning, and feature engineering
    for admission prediction ML models.
    """
    
    def __init__(self):
        self.gpa_scales = {
            '4.0': {'max': 4.0, 'min': 0.0},
            '5.0': {'max': 5.0, 'min': 0.0},
            '100': {'max': 100.0, 'min': 0.0},
            '10': {'max': 10.0, 'min': 0.0},
            'percentage': {'max': 100.0, 'min': 0.0},
        }
        
        # SAT to percentile mapping (approximate)
        self.sat_percentiles = {
            1600: 99, 1550: 99, 1500: 98, 1450: 96, 1400: 94,
            1350: 91, 1300: 87, 1250: 82, 1200: 74, 1150: 66,
            1100: 57, 1050: 47, 1000: 38, 950: 29, 900: 22
        }
        
        # ACT to percentile mapping (approximate)
        self.act_percentiles = {
            36: 99, 35: 99, 34: 99, 33: 98, 32: 97, 31: 96,
            30: 94, 29: 92, 28: 89, 27: 86, 26: 82, 25: 78,
            24: 73, 23: 68, 22: 62, 21: 56, 20: 50, 19: 44
        }
        
        # Activity tier keywords for auto-classification
        self.tier_keywords = {
            1: ['national', 'international', 'olympic', 'presidential', 'intel', 
                'regeneron', 'siemens', 'imf', 'model un', 'published', 'patent'],
            2: ['state', 'regional', 'varsity captain', 'president', 'founder',
                'startup', 'research', 'first place', 'winner', 'awardee'],
            3: ['school', 'club president', 'team leader', 'editor', 'varsity',
                'volunteer', 'community', 'internship'],
            4: ['member', 'participant', 'attendee', 'helper', 'assistant']
        }

    def normalize_gpa(self, gpa: float, scale: str = '4.0') -> float:
        """Normalize GPA to 4.0 scale."""
        if gpa is None:
            return None
            
        scale_info = self.gpa_scales.get(scale, self.gpa_scales['4.0'])
        
        # Detect scale if not specified
        if scale == '4.0' and gpa > 4.5:
            if gpa <= 5.0:
                scale_info = self.gpa_scales['5.0']
            elif gpa <= 10.0:
                scale_info = self.gpa_scales['10']
            else:
                scale_info = self.gpa_scales['100']
        
        # Normalize to 4.0 scale
        normalized = (gpa - scale_info['min']) / (scale_info['max'] - scale_info['min']) * 4.0
        return min(max(normalized, 0.0), 4.0)

    def sat_to_percentile(self, sat_score: int) -> float:
        """Convert SAT score to percentile."""
        if sat_score is None:
            return None
            
        # Find closest score
        scores = sorted(self.sat_percentiles.keys(), reverse=True)
        for score in scores:
            if sat_score >= score:
                return self.sat_percentiles[score]
        return 10  # Below minimum in table

    def act_to_percentile(self, act_score: int) -> float:
        """Convert ACT score to percentile."""
        if act_score is None:
            return None
            
        # Find closest score
        scores = sorted(self.act_percentiles.keys(), reverse=True)
        for score in scores:
            if act_score >= score:
                return self.act_percentiles[score]
        return 10  # Below minimum in table

    def get_test_score_percentile(self, sat: Optional[int], act: Optional[int]) -> float:
        """Get best test score as percentile."""
        sat_pct = self.sat_to_percentile(sat) if sat else None
        act_pct = self.act_to_percentile(act) if act else None
        
        if sat_pct and act_pct:
            return max(sat_pct, act_pct)
        return sat_pct or act_pct or 50.0  # Default to median

    def classify_activity_tier(self, activity_name: str, description: str = '') -> int:
        """Classify activity into tiers 1-4 based on keywords."""
        text = (activity_name + ' ' + (description or '')).lower()
        
        for tier, keywords in self.tier_keywords.items():
            if any(kw in text for kw in keywords):
                return tier
        return 4  # Default to tier 4

    def calculate_confidence_score(self, record: Dict) -> float:
        """
        Calculate data quality confidence score (0-1).
        
        Factors:
        - Completeness of data
        - Source reliability
        - Verification status
        - Data consistency
        """
        score = 0.0
        max_score = 0.0
        
        # Essential fields (high weight)
        essential_fields = ['gpa', 'decision']
        for field in essential_fields:
            max_score += 0.3
            if record.get(field) is not None:
                score += 0.3
        
        # Important fields (medium weight)
        important_fields = ['sat_total', 'act_composite', 'class_rank_percentile', 
                          'activity_tier1_count', 'activity_tier2_count']
        for field in important_fields:
            max_score += 0.1
            if record.get(field) is not None:
                score += 0.1
        
        # Source quality
        max_score += 0.2
        source = record.get('source', '').lower()
        if 'verified' in source or record.get('is_verified'):
            score += 0.2
        elif 'user_submitted' in source:
            score += 0.15
        elif 'official' in source:
            score += 0.18
        elif source:
            score += 0.1
        
        return score / max_score if max_score > 0 else 0.0

    def is_suspicious_entry(self, record: Dict) -> Tuple[bool, List[str]]:
        """
        Flag potentially suspicious or invalid entries.
        
        Returns: (is_suspicious, list of reasons)
        """
        reasons = []
        
        # GPA checks
        gpa = record.get('gpa')
        if gpa is not None:
            if gpa > 5.0 and gpa < 10:
                reasons.append('GPA in unusual range (5-10)')
            if gpa > 100:
                reasons.append('GPA exceeds 100')
            if gpa < 0:
                reasons.append('Negative GPA')
        
        # SAT checks
        sat = record.get('sat_total')
        if sat is not None:
            if sat < 400 or sat > 1600:
                reasons.append(f'SAT score out of range: {sat}')
        
        # ACT checks
        act = record.get('act_composite')
        if act is not None:
            if act < 1 or act > 36:
                reasons.append(f'ACT score out of range: {act}')
        
        # Class rank checks
        rank_pct = record.get('class_rank_percentile')
        if rank_pct is not None:
            if rank_pct < 0 or rank_pct > 100:
                reasons.append(f'Class rank percentile invalid: {rank_pct}')
        
        # Inconsistency checks
        if sat and sat >= 1500 and gpa and gpa < 2.0:
            reasons.append('High SAT with very low GPA - inconsistent')
        
        return len(reasons) > 0, reasons

    def prepare_training_data(self, raw_data: List[Dict]) -> pd.DataFrame:
        """
        Process raw admission data into training-ready features.
        
        Args:
            raw_data: List of admission outcome records
            
        Returns:
            DataFrame with normalized features and labels
        """
        processed = []
        
        for record in raw_data:
            # Skip suspicious entries
            is_suspicious, _ = self.is_suspicious_entry(record)
            if is_suspicious:
                continue
            
            # Calculate confidence
            confidence = self.calculate_confidence_score(record)
            if confidence < config.MIN_CONFIDENCE_SCORE:
                continue
            
            # Process features
            features = {
                'gpa_normalized': self.normalize_gpa(
                    record.get('gpa'),
                    record.get('gpa_scale', '4.0')
                ),
                'test_score_percentile': self.get_test_score_percentile(
                    record.get('sat_total'),
                    record.get('act_composite')
                ),
                'class_rank_percentile': record.get('class_rank_percentile', 50.0),
                'ap_ib_count': record.get('num_ap_courses', 0) + record.get('num_ib_courses', 0),
                'activity_tier1_count': record.get('activity_tier1_count', 0),
                'activity_tier2_count': record.get('activity_tier2_count', 0),
                'activity_tier3_count': record.get('activity_tier3_count', 0),
                'is_first_gen': 1 if record.get('is_first_gen') else 0,
                'is_legacy': 1 if record.get('is_legacy') else 0,
                'is_athlete': 1 if record.get('is_athlete') else 0,
                'is_in_state': 1 if record.get('is_in_state') else 0,
                'college_acceptance_rate': record.get('college_acceptance_rate', 50.0),
                # Label
                'admitted': 1 if record.get('decision') == 'accepted' else 0,
                # Metadata
                'college_id': record.get('college_id'),
                'confidence_score': confidence,
            }
            
            processed.append(features)
        
        df = pd.DataFrame(processed)
        
        # Fill missing values with medians for numerical features
        numerical_cols = ['gpa_normalized', 'test_score_percentile', 'class_rank_percentile',
                         'ap_ib_count', 'activity_tier1_count', 'activity_tier2_count',
                         'activity_tier3_count', 'college_acceptance_rate']
        
        for col in numerical_cols:
            if col in df.columns:
                df[col] = df[col].fillna(df[col].median())
        
        return df

    def prepare_prediction_input(self, student_profile: Dict, college: Dict) -> Dict:
        """
        Prepare a single student profile for prediction.
        
        Args:
            student_profile: Student's academic profile
            college: Target college info
            
        Returns:
            Dictionary of normalized features
        """
        return {
            'gpa_normalized': self.normalize_gpa(
                student_profile.get('gpa_unweighted') or student_profile.get('gpa_weighted'),
                student_profile.get('gpa_scale', '4.0')
            ),
            'test_score_percentile': self.get_test_score_percentile(
                student_profile.get('sat_total'),
                student_profile.get('act_composite')
            ),
            'class_rank_percentile': student_profile.get('class_rank_percentile', 50.0),
            'ap_ib_count': student_profile.get('num_ap_courses', 0) + student_profile.get('num_ib_courses', 0),
            'activity_tier1_count': student_profile.get('activity_tier1_count', 0),
            'activity_tier2_count': student_profile.get('activity_tier2_count', 0),
            'activity_tier3_count': student_profile.get('activity_tier3_count', 0),
            'is_first_gen': 1 if student_profile.get('is_first_generation') else 0,
            'is_legacy': 1 if student_profile.get('is_legacy') else 0,
            'is_athlete': 1 if student_profile.get('is_athlete') else 0,
            'is_in_state': 1 if (student_profile.get('state_province') == 
                                college.get('location_state')) else 0,
            'college_acceptance_rate': college.get('acceptance_rate', 50.0),
        }


# Singleton instance
data_processor = DataProcessor()
