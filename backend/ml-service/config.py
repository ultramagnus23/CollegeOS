# backend/ml-service/config.py
# Configuration for the ML prediction service

import os

# Model storage configuration
MODEL_DIR = os.environ.get('ML_MODEL_DIR', os.path.join(os.path.dirname(__file__), 'models'))
DATA_DIR = os.environ.get('ML_DATA_DIR', os.path.join(os.path.dirname(__file__), 'data'))

# Training configuration
MIN_SAMPLES_FOR_TRAINING = int(os.environ.get('MIN_SAMPLES_FOR_TRAINING', 30))
MIN_SAMPLES_PER_CLASS = int(os.environ.get('MIN_SAMPLES_PER_CLASS', 10))
MIN_ACCURACY_THRESHOLD = float(os.environ.get('MIN_ACCURACY_THRESHOLD', 0.55))
VALIDATION_SPLIT = float(os.environ.get('VALIDATION_SPLIT', 0.2))
CV_FOLDS = int(os.environ.get('CV_FOLDS', 5))

# Data quality thresholds
MIN_CONFIDENCE_SCORE = float(os.environ.get('MIN_CONFIDENCE_SCORE', 0.5))
HIGH_CONFIDENCE_THRESHOLD = float(os.environ.get('HIGH_CONFIDENCE_THRESHOLD', 0.8))

# Feature configuration - features used for LDA
FEATURE_COLUMNS = [
    'gpa_normalized',           # Normalized to 0-4.0 scale
    'test_score_percentile',    # SAT/ACT converted to percentile
    'class_rank_percentile',    # Class rank as percentile
    'ap_ib_count',              # Number of AP/IB courses
    'activity_tier1_count',     # Tier 1 activities
    'activity_tier2_count',     # Tier 2 activities
    'activity_tier3_count',     # Tier 3+ activities
    'is_first_gen',             # First generation flag
    'is_legacy',                # Legacy flag
    'is_athlete',               # Recruited athlete flag
    'is_in_state',              # In-state applicant flag
    'college_acceptance_rate',  # College's overall acceptance rate
]

# Feature weights for interpretability (used in explanations)
FEATURE_IMPORTANCE_NAMES = {
    'gpa_normalized': 'GPA',
    'test_score_percentile': 'Test Scores (SAT/ACT)',
    'class_rank_percentile': 'Class Rank',
    'ap_ib_count': 'Course Rigor (AP/IB)',
    'activity_tier1_count': 'National/International Achievements',
    'activity_tier2_count': 'State/Regional Achievements',
    'activity_tier3_count': 'School-Level Activities',
    'is_first_gen': 'First Generation Status',
    'is_legacy': 'Legacy Status',
    'is_athlete': 'Recruited Athlete',
    'is_in_state': 'In-State Advantage',
    'college_acceptance_rate': 'College Selectivity',
}

# Service configuration
SERVICE_HOST = os.environ.get('ML_SERVICE_HOST', '127.0.0.1')
SERVICE_PORT = int(os.environ.get('ML_SERVICE_PORT', 5050))
DEBUG_MODE = os.environ.get('ML_DEBUG', 'false').lower() == 'true'

# Cache configuration
MODEL_CACHE_SIZE = int(os.environ.get('MODEL_CACHE_SIZE', 100))
MODEL_CACHE_TTL = int(os.environ.get('MODEL_CACHE_TTL', 3600))  # 1 hour
