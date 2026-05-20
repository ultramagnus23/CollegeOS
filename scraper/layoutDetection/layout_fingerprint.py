from __future__ import annotations

import hashlib
import re


def layout_fingerprint(html: str) -> str:
    reduced = re.sub(r"\s+", " ", html or "").strip().lower()
    anchors = "|".join(sorted(set(re.findall(r"<(h1|h2|table|section|article|div)", reduced))))
    return hashlib.sha1((reduced[:5000] + anchors).encode("utf-8")).hexdigest()
