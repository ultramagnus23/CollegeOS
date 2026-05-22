from .base_normalizer import BaseNormalizer
from .indian_value_normalizer import IndianValueNormalizer
from .indian_institution_normalizer import IndianInstitutionNormalizer
from .exam_taxonomy import normalize_exam_name

__all__ = [
    "BaseNormalizer",
    "IndianValueNormalizer",
    "IndianInstitutionNormalizer",
    "normalize_exam_name",
]
