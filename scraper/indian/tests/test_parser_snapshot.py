from __future__ import annotations

import unittest

from scraper.indian.parsers.config_institution_parser import ConfigInstitutionParser


class ParserSnapshotTests(unittest.TestCase):
    def test_parser_extracts_structured_sections(self):
        parser = ConfigInstitutionParser()
        html = """
        <html>
          <body>
            <h1>Indian Institute of Technology Bombay</h1>
            <div data-test='city'>Mumbai</div>
            <div data-test='state'>Maharashtra</div>
            <ul class='exams-accepted'><li>JEE Main</li><li>JEE Advanced</li></ul>
            <div data-test='tuition'>2 lakh</div>
            <div data-test='median-package'>20 lakh</div>
          </body>
        </html>
        """
        source_config = {
            "selectors": {
                "college_name": ["h1"],
                "city": ["[data-test='city']"],
                "state": ["[data-test='state']"],
                "entrance_exams": [".exams-accepted li"],
                "tuition": ["[data-test='tuition']"],
                "median_package": ["[data-test='median-package']"],
            }
        }
        payload = parser.parse(html, source_config)
        self.assertEqual(payload["identity"]["name"], "Indian Institute of Technology Bombay")
        self.assertEqual(payload["identity"]["city"], "Mumbai")
        self.assertIn("JEE Main", payload["admissions"]["entrance_exams"])


if __name__ == "__main__":
    unittest.main()
