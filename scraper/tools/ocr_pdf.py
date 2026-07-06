#!/usr/bin/env python3
"""
scraper/tools/ocr_pdf.py
--------------------------
Standalone OCR helper: extracts text from a PDF, falling back to OCR
(Tesseract via pytesseract) for any page whose direct text layer is empty or
near-empty (i.e. the page is a scanned image / designed infographic with no
selectable text -- common in Indian college placement brochures, which often
present headline package/placement numbers as graphics rather than text).

Used by backend/src/scrapers/adapters/institutionPlacements.js as a final
fallback tier: HTML page text -> linked brochure PDF text -> OCR of that PDF's
image-only pages. Node shells out to this script (pytesseract/fitz have no
practical Node equivalent) and reads the combined text back over stdout.

Usage:
    python scraper/tools/ocr_pdf.py <path-to-pdf> [--dpi 200] [--min-text-len 30]

Prints the combined text (direct extraction + OCR'd pages) to stdout.
Requires: pymupdf, pytesseract, Pillow, and the Tesseract binary on PATH.
"""

import argparse
import io
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument("--min-text-len", type=int, default=30,
                         help="pages with fewer extracted chars than this are OCR'd")
    parser.add_argument("--max-ocr-pages", type=int, default=15,
                         help="cap OCR work per document (brochures can be 30+ pages)")
    args = parser.parse_args()

    try:
        import fitz  # PyMuPDF
        import pytesseract
        from PIL import Image
    except ImportError:
        sys.exit("pip install pymupdf pytesseract Pillow (and install the Tesseract binary)")

    doc = fitz.open(args.pdf_path)
    parts = []
    ocr_count = 0
    for i, page in enumerate(doc):
        text = page.get_text() or ""
        if len(text.strip()) >= args.min_text_len or ocr_count >= args.max_ocr_pages:
            parts.append(text)
            continue
        try:
            pix = page.get_pixmap(dpi=args.dpi)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            ocr_text = pytesseract.image_to_string(img)
            parts.append(ocr_text)
            ocr_count += 1
        except Exception as e:
            print(f"[ocr_pdf] page {i} OCR failed: {e}", file=sys.stderr)
            parts.append(text)

    print(f"[ocr_pdf] {len(doc)} pages, OCR'd {ocr_count}", file=sys.stderr)
    sys.stdout.write("\n".join(parts))


if __name__ == "__main__":
    main()
