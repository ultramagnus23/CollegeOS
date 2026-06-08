from __future__ import annotations

import unittest

from scraper.indian.normalizers.exam_taxonomy import normalize_exam_name
from scraper.indian.normalizers.indian_institution_normalizer import IndianInstitutionNormalizer
from scraper.indian.normalizers.indian_value_normalizer import IndianValueNormalizer


class IndianNormalizersTests(unittest.TestCase):
    def test_money_normalization(self):
        self.assertEqual(IndianValueNormalizer.normalize_money_to_inr("12 lakh"), 1200000)
        self.assertEqual(IndianValueNormalizer.normalize_money_to_inr("1.5 crore"), 15000000)

    def test_percent_and_dates(self):
        self.assertEqual(IndianValueNormalizer.normalize_percent("95%"), 95.0)
        self.assertEqual(IndianValueNormalizer.normalize_date("2026-01-15"), "2026-01-15")

    def test_exam_taxonomy(self):
        self.assertEqual(normalize_exam_name("jee mains"), "JEE Main")
        self.assertEqual(normalize_exam_name("SAT"), "SAT")

    def test_institution_alias_resolution(self):
        normalizer = IndianInstitutionNormalizer()
        normalizer.register_aliases("Indian Institute of Technology Bombay", ["IIT Bombay", "IITB"])
        self.assertEqual(normalizer.resolve("IIT Bombay"), "Indian Institute of Technology Bombay")
        self.assertEqual(normalizer.resolve("IITB"), "Indian Institute of Technology Bombay")


if __name__ == "__main__":
    unittest.main()
