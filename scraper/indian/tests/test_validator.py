from __future__ import annotations

import unittest

from scraper.indian.validators.indian_record_validator import IndianRecordValidator


class IndianValidatorTests(unittest.TestCase):
    def test_rejects_editorial_or_review_content(self):
        validator = IndianRecordValidator()
        payload = {
            "identity": {"name": "IIT Delhi"},
            "admissions": {},
            "fees": {},
            "placements": {},
            "academics": {},
            "rankings": {},
            "deadlines": {},
            "international": {},
            "compliance": {"contains_editorial": True, "contains_reviews": False},
        }
        ok, errors = validator.validate(payload)
        self.assertFalse(ok)
        self.assertTrue(any("editorial" in item for item in errors))


if __name__ == "__main__":
    unittest.main()
