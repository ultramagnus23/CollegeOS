'use strict';

// ============================================================================
// Common Data Set (CDS) PDF adapter -- undergraduate deadlines.
//
// WHY THIS EXISTS: the existing usOfficialDeadlines.js adapter parses each
// school's marketing admissions HTML page, which has zero standardization
// across schools (one regex per site design) -- that's why it plateaus at a
// ~63-school hand-verified target list. The Common Data Set is a REAL,
// standardized annual survey nearly every US 4-year institution publishes
// (originally for the College Board/Peterson's/US News); every school's CDS
// uses the SAME section/question numbering (C14 = regular decision closing
// date, C21 = early decision closing date, C22 = early action closing date),
// so ONE parser generalizes across hundreds of schools instead of one
// regex per school.
//
// SOURCING: real CDS PDFs, primarily discovered via the College Transitions
// CDS repository (a public aggregator of schools' own self-published CDS
// files: https://www.collegetransitions.com/dataverse/common-data-set-repository/),
// hosted on Google Drive by that site. Each PDF is the school's own official
// self-reported CDS document -- a primary source, not a third-party estimate.
//
// Extraction is regex-based on the standardized CDS question labels, same
// posture as usOfficialDeadlines.js: a date is only emitted if a plausible
// month-day value follows the known CDS field label; unparseable PDFs are
// skipped, never fabricated.
// ============================================================================

const PARSER_NAME = 'commonDataSetDeadlines';
const PARSER_VERSION = '1.0.0';

// Some schools' CDS PDFs use fonts whose ligature glyphs the PDF text layer
// can't map to real characters, substituting a Unicode placeholder instead
// -- verified live on Carnegie Mellon's CDS: "ti" collapses to U+019F "Ɵ"
// ("insƟtuƟon", "applicaƟons") while "tt" collapses to a DIFFERENT
// placeholder, U+01A9 "Ʃ" ("admiƩed"). (A naive ASCII-only debug print
// renders both as a literal "?", which is misleading -- neither is the
// ASCII question mark, and they are NOT interchangeable with each other.)
// A regex looking for the literal word then silently never matches on any
// affected school -- this is likely why several deadline extractions and
// most admission-rate extractions were missing hits. fuzzyWord() makes each
// bigram optionally collapse to its OWN specific placeholder so the same
// pattern matches both clean and ligature-corrupted PDFs. fi/ffi/fl/ffl
// placeholders haven't been observed in a live sample yet; they fall back to
// accepting either of the two known placeholders as a best-effort guess.
const LIGATURE_MAP = { ti: 'Ɵ', tt: 'Ʃ' };
function fuzzyWord(word) {
  return word.replace(/ti|tt|ffi|ffl|fi|fl/g, (m) => `(?:${m}|${LIGATURE_MAP[m] || '[ƟƩ]'})`);
}
const CYCLE_YEAR = '2025-2026';
const CYCLE_YEAR_KEY = 2026;
const CYCLE_START_YEAR = 2025;

function driveUrl(fileId) {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

// name (must exact-match canonical.institutions.canonical_name) -> Google
// Drive file id (2024-25 CDS) or a direct https URL. Sourced 2026-07-04 from
// the College Transitions CDS repository + direct institutional-research
// site search for a couple of schools not listed there. Google Sheets-format
// entries on that page (Allegheny, Auburn, Cal State Fullerton, W&M, Elon)
// are skipped -- this parser only handles PDF text extraction.
const TARGETS = [
  ['Adelphi University', driveUrl('1qpkPRWwieFukaOofJ07eqFd9nSb8Os9W')],
  ['Agnes Scott College', driveUrl('1nRJ99g-JMFDwniZ1u1TgHYMONy-Lnxq-')],
  ['Alfred University', driveUrl('1-2US9PhaZrZuo3dGIhelSmsBCRbar3Ax')],
  ['American University', driveUrl('12DxzDmbQxx2vRyBudBN3jFlk-HWvxGIm')],
  ['Amherst College', driveUrl('1nyc6IMyEA2YcnGR-0O0PXFTQufJsn-bp')],
  ['Appalachian State University', driveUrl('1BSu4wJPfG2j8SpHEA3vUk1GBN3jGYg1n')],
  ['Arizona State University-Tempe', driveUrl('1MQ9KpAdeaF8NfcNMUjSFwbHlvh7NzmzF')],
  ['Austin College', driveUrl('1uMj-mqH5hxQW2QuwlOuo2keF4zTp2T8I')],
  ['Babson College', driveUrl('1FJBtof5Ijx3McnIUNpz7aFlpPoXbTjk6')],
  ['Bard College', driveUrl('18JnWkO0gn0m8SJCQkUBCwbwj3ASI8avH')],
  ['Barnard College', driveUrl('14vhVmc0XznYoJKVISzkYaaGwIxY2uLZA')],
  ['Bates College', driveUrl('1wCt4XWMTb2wcJMTu7OwayKgSnt_Aip10')],
  ['Baylor University', driveUrl('16aCRFHoaRKjSyEVitqj-6OTkNf7bJNM9')],
  ['Belmont University', driveUrl('1S3YOAXK782hvRvBduoIGgF02dXedYafp')],
  ['Beloit College', driveUrl('1Apb7fPlyQXqISvL3QAK8D6ck42jSjIj_')],
  ['Bennington College', driveUrl('1aZNXmdJBFlm4323lOhMSXaZ4KA8bUfMX')],
  ['Bentley University', driveUrl('10et1a0IuSwyI57Me-zG7gMPoKAPc26k-')],
  ['Binghamton University', driveUrl('1OEtsa2GOsTWIlmYhe3-ZA0fn-n63mtBb')],
  ['Boston College', driveUrl('1Wz4J6SRfCTTibOEHavBLweEnYAxG_oJR')],
  ['Boston University', driveUrl('1fytFte6I1NTerPCk46RMBBsXE1qAgiAv')],
  ['Bowdoin College', driveUrl('13Euz1Dl23nxhWLdLc-6sESXFzSmpLcb4')],
  ['Bradley University', driveUrl('1jV0iWll0uRYQr5alcn6WbbAot8IlLx1p')],
  ['Brandeis University', driveUrl('1uboViz1S-MMQXAMsHFh5WgJSohSTdrMO')],
  ['Brown University', driveUrl('1_2XjGF3xL3MAzLbkAauPAeTmfTPFAyYX')],
  ['Bryn Mawr College', driveUrl('1GHHBZasqXHUBlr7elAB4Sigve5-tCoNg')],
  ['Bucknell University', driveUrl('16UZKiEisEpRSEgaQavmXrShaypwqcRJl')],
  ['Butler University', driveUrl('1EwcVaexL3MUER9jj_mWnF4l2AF-JWB2Z')],
  ['California State Polytechnic University-Pomona', driveUrl('1lwH_X-KfROFlSNBf0fxZoTtnJuMd5F7H')],
  ['California Polytechnic State University-San Luis Obispo', driveUrl('1VrNsgkRcj2z9jsLiovwRDmT4DpDl0-7m')],
  ['California Institute of Technology', driveUrl('16JODH2rg6DZu5CUEeEQx_8UogBYooIM1')],
  ['California State University-Los Angeles', driveUrl('19xk9izL3dPFoI27yihvy13fym5RmCxns')],
  ['California State University-Long Beach', driveUrl('1Jmfc1Ed7ucf7wTBjEphzcAJReyYPu8jJ')],
  ['Carleton College', driveUrl('1WstOtBocYVh6OjCsaItre7Th0bYSBj-p')],
  ['Carnegie Mellon University', driveUrl('1HnxkIUM-bg8caT8Yxw5xB2yQP6gdDsKG')],
  ['Case Western Reserve University', driveUrl('1f_RKOyi-tvUNi1NNhTcppmW2vC4ypNOl')],
  ['Chapman University', driveUrl('1OK5t-z7CB1oRLJQTv2Du4gtpjTxIsneN')],
  ['Claremont McKenna College', driveUrl('1sM7h2ED1zlVpDJLGy8a072oSfQDwhhNn')],
  ['Clark University', driveUrl('1N1uTQ18c9lkIBOsljnsWBwl3PR0lQPxG')],
  ['Clarkson University', driveUrl('1WdWuUHlqhhfHLLRiY9lOmsgQ39It3q7m')],
  ['Clemson University', driveUrl('1lgFGWD7h6i7J0ZzYy1p-6c4d26Is1Kgj')],
  ['Coastal Carolina University', driveUrl('1hyAZ9FlsdI_z6JAY8ZiuulcTtLEwEWbe')],
  ['Colgate University', driveUrl('1IqjJEZCqBf_tRwZlSjj65BYUabxaHyoB')],
  ['College of Charleston', driveUrl('1Fn6DeJuD-KBiKm0rw6EC5oHwDGWdGtz3')],
  ['The College of New Jersey', driveUrl('1XaZFpI1Y5fyEwqtCaRpohM63rKb1Jd8W')],
  ['Colorado College', driveUrl('1p0TnSu0PlZq7aAOmPeu7z1K55ZpNW9jj')],
  ['Colorado State University-Fort Collins', driveUrl('104HAlHr6kClPur16ZTVt4jsCL8kyb04S')],
  ['Columbia University in the City of New York', driveUrl('1rwmOmrBle2xnIB7bkqJyA2_YKpEVc_g8')],
  ['Connecticut College', driveUrl('1UF-9IFl3HSUrllZwEO4NCwCb2NFqWjxH')],
  ['Cornell University', driveUrl('1Nf0ewDcnAshCu2HNkHNGTN45DNR3ZPo7')],
  ['Creighton University', driveUrl('19HfgYpxmfyQUsSnaLws8Kz29PWnAHwny')],
  ['Dartmouth College', driveUrl('1-NJW__ec_WpOlJWK8r_wgTM_4YNUCjoZ')],
  ['Davidson College', driveUrl('1qCqNmwDGxCfnue4NFnbw-5pf5CPhKgm8')],
  ['Denison University', driveUrl('1gmNXk-Ziz_x3o1ybWE3CAhrRtckOryqU')],
  ['DePaul University', driveUrl('1IdI_x1wH_nknqoRgU9P49Wvq7XZBO1Rb')],
  ['DePauw University', driveUrl('1H0BDWS4g91wjnlSqI9HfncCRb9rTBud2')],
  ['Dickinson College', driveUrl('1EBQXWzp_k2jN1JV9edCVRVTziRIB5Zfp')],
  ['Drexel University', driveUrl('1PaUMIYNGkh0aIf1CKJLxmYcOC6QOOXok')],
  ['Duke University', driveUrl('1GSANSJf5yJPlMSYCXYy_tImg1X4zUv-K')],
  ['Duquesne University', driveUrl('1H7YFLk-rFo0YUUz7qYdz2GjKa4FoMzeY')],
  ['Earlham College', driveUrl('19Ua2rP4LU9OYNEYmoZdRYlWDEGO4-ZBt')],
  ['East Carolina University', driveUrl('1de7FH5I8a0USlrRfFV2PKBJkznEwifZV')],
  ['Eckerd College', driveUrl('1moNC9WOY7sHso55hcW-0wq330tuqanEK')],
  ['Georgia Institute of Technology-Main Campus', 'https://irp.gatech.edu/files/CDS/CDS_2024-2025_FINAL_20FEB2025.pdf'],

  // Added 2026-07-18: 178 more institutions discovered via the same College
  // Transitions CDS repository, each individually resolved against
  // canonical.institutions by IPEDS UnitID / verified name (not name-similarity
  // alone -- see docs/audits/DATA_SEED_SPRINT_2026-07-18.md for the
  // investigation; several institutions here would have matched the WRONG row
  // under naive fuzzy matching, e.g. "Purdue University" -> "Purdue University
  // Global", "Arizona State University" -> a branch campus). Two institutions
  // from the source repository (Whitman College / Worcester Polytechnic
  // Institute) shared an identical CDS file link in the source table -- a
  // data error there, not resolvable safely, so only Whitman is included below
  // and WPI is left out rather than guessed.
  ['Arizona State University Campus Immersion', driveUrl('1MQ9KpAdeaF8NfcNMUjSFwbHlvh7NzmzF')],
  ['CUNY Bernard M Baruch College', driveUrl('12Y-yqkMAUDhkjU3tuhYWJ6wTNPUvhlZl')],
  ['Emory University', driveUrl('19af3S6BGFGf-5vx_UuSEpO585T_9XWgc')],
  ['Fairfield University', driveUrl('1ISj2X8bGe3-Nltk9Sbe6vjfz3cQ6-ZFf')],
  ['Florida Atlantic University', driveUrl('1yo9NmVY6J7LdFquTzPy9kyw5A0wQvJcF')],
  ['Florida Gulf Coast University', driveUrl('1adQcqwkHToXN9XmWPSjI48GFgTTrV0ag')],
  ['Florida Institute of Technology', driveUrl('1_XxPcyrnq6Z6X7IjQD3jAL5kcDH3wn8l')],
  ['Florida International University', driveUrl('1Fm1ykRIK2RVMenQuPqY7O4SJUdU-Gsq7')],
  ['Franklin and Marshall College', driveUrl('1NuyZFZDFBfRfRWDfEJT5Qvyecof6LODb')],
  ['George Mason University', driveUrl('1Tqkqg-EwnGfBky0TDuoILMPR319va5A9')],
  ['George Washington University', driveUrl('1AhearVT8y2coaAUoxoUqBpkM3-zWUhjV')],
  ['Georgetown University', driveUrl('1msvBhqWzTph5m5dUBiyzH6ev4kwzYS03')],
  ['Georgia State University', driveUrl('1Ap8NU-yVvU59DFPiAZjkIhQ0ldcLS6oB')],
  ['Gettysburg College', driveUrl('1MrtGcaA7MCqYeY_a1mI02J2NQT219OOS')],
  ['Gonzaga University', driveUrl('190xggcmt8TabAu-esMgX8_A5asG1Yf4p')],
  ['Grinnell College', driveUrl('1VYF-nDPRFsRgSqcCKysq67uwp_LXeliM')],
  ['Gustavus Adolphus College', driveUrl('1V8MmDkggCYsDCg2dVZ2at-R_vdHEAsbO')],
  ['Hamilton College', driveUrl('1fCvhLgLv11Hdy14kJe9Co2TQbdOWJFz3')],
  ['Harvard University', driveUrl('1oj6wK7sDYZWs2iyHGKkGALfKdxhkRWYY')],
  ['Harvey Mudd College', driveUrl('1xrGZ8osuCGZZsOhXyyZG7fCxGAHJrKT6')],
  ['Haverford College', driveUrl('1bmaI6uLUoLUsPBJjdmEqHTRj2thUSvmW')],
  ['Hobart William Smith Colleges', driveUrl('1gl6pYr1fLrlJaC4m8weDH-OVPXtqFGC3')],
  ['Hofstra University', driveUrl('1y74-oLPPqrwWUmEBaB0Yv5nasWNENRo0')],
  ['Howard University', driveUrl('1lKdA81e3D2xorUbSQ1xsNHlcbMsDrcs8')],
  ['Illinois Wesleyan University', driveUrl('1n2smyitAMGAXYMiFVJFa6IWE9kXfelqr')],
  ['Indiana University-Bloomington', driveUrl('1XC4cMR7dtCX9EeDB2D8cCFD3C5m4XSer')],
  ['Iowa State University', driveUrl('1FYwQEjtQSn3RhBfPJGzJM_rIF8Jp1KlU')],
  ['Ithaca College', driveUrl('120jXX2ti-cerOxGj1kTvom9yik5kA-Ip')],
  ['James Madison University', driveUrl('1kj_-0jXPoavgkukyQS2BYbdGNH47eUJo')],
  ['Johns Hopkins University', driveUrl('1493J-a9EGTyGekgy-NAohQ_LSEQ3jtDp')],
  ['Kansas State University', driveUrl('1P7ERuv7L9KSbuNr3xtcmQJNWaiCvkx8F')],
  ['Kenyon College', driveUrl('1hfPzqGX73C93ypIbsy6kskZiKN7GQpyC')],
  ['Lafayette College', driveUrl('1SVRu8JxPZePCIGvV85Fpk1KD2jOnVsuE')],
  ['Lake Forest College', driveUrl('1_OrsgCRpIIkeTvaw2QfQPvJpiU6DkP32')],
  ['Lawrence University', driveUrl('1vbpflMfSVh-tIqFcyxW2h3VcbrIY0mO1')],
  ['Lehigh University', driveUrl('1hO8mSkkaq8yLmB3OgT12tef2aXjbEpXh')],
  ['Lewis & Clark College', driveUrl('1YnyxrF1bQ5fXTFzVdbYaRT4yXpTIwm9f')],
  ['Loyola Marymount University', driveUrl('1-NFEQb641NiDM3NHvckRSaX0IutJaFdg')],
  ['Loyola University Chicago', driveUrl('1ib9bboKvy5ygQMjbhMnYDR-w819C4BSL')],
  ['Loyola University Maryland', driveUrl('1kSz8TLd3h8ym74wCHD4AhFXye1mT0vOJ')],
  ['Marquette University', driveUrl('1pMFO3GmBO9kB8qWC77zXPoZac4E6ZGdv')],
  ['Michigan State University', driveUrl('1xASdIYvOH3Ef_BNyRTEtiw_ICgUenhjp')],
  ['Michigan Technological University', driveUrl('1ACJsbWaW5AcEDqwaPiLRm3ykwi5W4z0c')],
  ['Middlebury College', driveUrl('1h-ek-1m3tiN70uCse2JRNZMl5dJs6mQB')],
  ['Milwaukee School of Engineering', driveUrl('1UfktquQ7-QoSXphcbISlNXBk_k3btZlI')],
  ['Mississippi State University', driveUrl('10lH0gTtVe7I2lBcNzg6iQMd96E45Lfnw')],
  ['Mount Holyoke College', driveUrl('1zsl-tIQenh5GI5u0qspsNbS9VFZumvMr')],
  ['New College of Florida', driveUrl('1gSVEkP_B06RBTm7zMaoytyWfoBJNe9vb')],
  ['New York University', driveUrl('1WxzME_JwpWRKEFabR7KhIW2vuOh8q0Dy')],
  ['North Carolina State University at Raleigh', driveUrl('1XljFDDPmh4nxoQq2q4gT6qhq5pi_wFJ9')],
  ['Northern Arizona University', driveUrl('1p4Qb-m3iDJ_2l0gQgYw7sHVbFSf-e2Oe')],
  ['Northwestern University', driveUrl('1w2QtvSXBK8cuV3r10E4g3-beRqP0lilk')],
  ['Oberlin College', driveUrl('1n6XHQfN6By8JTLmj1c69WMK71T2N-irU')],
  ['Occidental College', driveUrl('16wnaErEtBPpbCQLXrtclCMe7bYk-GLxr')],
  ['Ohio University', driveUrl('1eF4wMAxLPfHoS-AB0ONJ1EkJvFVHnU1l')],
  ['Oklahoma State University-Main Campus', driveUrl('1On4y0LYs6PoF53v_KauQrfF1ywWMsyAo')],
  ['Oregon State University', driveUrl('1PzNfPYjSWUw3Q5AKkX4TNLSnZgD11ayq')],
  ['Pepperdine University', driveUrl('16KVLUw3ll1EXe0Xz5cuBjeHtDGMGGf8A')],
  ['Pitzer College', driveUrl('1vzdUhj0H16b29zNeUCKb9JW2FC5_GY2S')],
  ['Pomona College', driveUrl('1fNK-xuOFd68wURbzkvOqw4xasPPbs_MV')],
  ['Princeton University', driveUrl('1-Bd6UWP4t5siS6G-i4TCpsHD5I0ymgPK')],
  ['Providence College', driveUrl('1eoVemsrMuPO0W0u6_xOsnSBa0y9ITAbp')],
  ['Purdue University-Main Campus', driveUrl('1lfbKE3X0Htyuj-rSDRiF90bDw98vVOHL')],
  ['Ramapo College of New Jersey', driveUrl('1IVhYs7ZLtvCi5Yvj1SJMB8mbozXWb3-Z')],
  ['Reed College', driveUrl('1o3FD7pfAbFDV4jkuw1HI0AzpIAkkNUKu')],
  ['Rensselaer Polytechnic Institute', driveUrl('1tBAOw4poCLk_A2pajxqlq5EgjyClsQfK')],
  ['Rhodes College', driveUrl('1MSFfcclrmrPBsNdS5VxBifCHXxgYRxx-')],
  ['Rice University', driveUrl('1qmogyW7ArtG9IezDZdZ9XK8qSx08mboV')],
  ['Rochester Institute of Technology', driveUrl('1TV7ziFnPLhVqwnaAMjBNF2BEFKhQcOsJ')],
  ['Rollins College', driveUrl('1kuzTrfMGGpU6FncJ1kqxT6hav0ir20L5')],
  ['Rose-Hulman Institute of Technology', driveUrl('1da72P1KPJhrKAU-fTEfM6zK4YMovnhhM')],
  ['Saint Mary\'s College of California', driveUrl('1W7GgBPTshUk_CJUnwInhpoQ0Ko2RdrZ0')],
  ['San Diego State University', driveUrl('1UMYUZhiVwgtg2d82M18BXQfD7oYFykTk')],
  ['San Jose State University', driveUrl('1OgrHSD1Z3sYa7aAcQeRa2_kc6bfjXdOb')],
  ['Santa Clara University', driveUrl('1vfbrOrkoUKUMqrcIBqcg60yigVWD3jTD')],
  ['Sarah Lawrence College', driveUrl('19kkrFxuCWgjj1sBw3VUQ3F2azU1JPm6o')],
  ['Scripps College', driveUrl('1MWZXiqPqf9z9qlQnJ6jOl4nSvUHS8l9p')],
  ['Skidmore College', driveUrl('1bfHOPe7daJWmDOEREOIk_U4eRzrIplR5')],
  ['Smith College', driveUrl('13nmysLrdi_X_Hv5O0iWFxIZiA6ht9i0r')],
  ['Southern Methodist University', driveUrl('1wgLsYaj01l55rF2swI7cDGbNa2Thuq0E')],
  ['Southwestern University', driveUrl('13fdsNdsBjbfUJzEXnrpI2zON74oeilHv')],
  ['Spelman College', driveUrl('1RV_xwZPY2OHS3AkJSf-mf5p6q38-0zGi')],
  ['St Lawrence University', driveUrl('1U0fX_eImG2cjZl1HjX4u3AYru7oWmMUE')],
  ['St Olaf College', driveUrl('1-pnWyqC_p3XdjYDvKRMY_xDAyo9KCGj0')],
  ['St. Mary\'s College of Maryland', driveUrl('1x-ulsS2LCvnaJM3xujIuBHIB-mwugRLV')],
  ['Stanford University', driveUrl('1fF9sgzkK3Upmn-DUzfsNKpZm9uEWXUVY')],
  ['Stetson University', driveUrl('1VcJ_hPkcy9edY2EXFcVrf_SzJyUOE-dY')],
  ['Stevens Institute of Technology', driveUrl('1Cm2IelF4P_u-R5pua5V__zuUtK6S2-je')],
  ['Stony Brook University', driveUrl('1Xau4LIrBSBCWtgZUPZ_HkjMcbduJBWg0')],
  ['University at Albany, SUNY', driveUrl('1pbDA_iRgJAQoG1PF7_ANrr2m-wKcxyIC')],
  ['SUNY at Purchase College', driveUrl('10GKLizwEpsBZPyzyFr-kOLQIHKT1VFn6')],
  ['SUNY College at Geneseo', driveUrl('1LdTI380difIIPSGArsGEFxl1pYJKulzh')],
  ['SUNY Oneonta', driveUrl('1ONOj6xLAnukWzgpdfP9VaJCFO8D57xmx')],
  ['Swarthmore College', driveUrl('1oD9dzXLIxZnr0vtXXMsPkMqmE1SQA_Uv')],
  ['Temple University', driveUrl('1aa95wCsAHPMHqTrxzY7KJ6drIfQ4WAaa')],
  ['Texas A&M University-College Station', driveUrl('1Rm3p55-BQv7auVzQmWeZqpA2Kxbtc7yF')],
  ['Texas Christian University', driveUrl('1b3XQP8__0DeifnlAwcvcGlpHQg9bnAlT')],
  ['Texas Tech University', driveUrl('1pXFSa14XaZ8VVRBIhSgEtp-PpzMds2YF')],
  ['The College of Wooster', driveUrl('1s15mPw4CPv-jsjrepmzMpykl8hS5Ftnt')],
  ['Trinity College', driveUrl('1FWsepbbZ43xGI2pdckioWvT1wwBBgr9G')],
  ['Tufts University', driveUrl('1hEj-ItSJm3HogJxkfPJ94oeHWFAGYEjK')],
  ['Tulane University of Louisiana', driveUrl('1eFKI8ONkOBUJHoYwP7kd2oONKvmq0noX')],
  ['United States Military Academy', driveUrl('174sqXbb9g2TngG1snmzJAMzIpxxxq7Xj')],
  ['University at Buffalo', driveUrl('1pidFTY6XPoJz2IZOKLfxzqpAbEXoDZg5')],
  ['The University of Alabama', driveUrl('1bsTUmnKckOHY60qYEJwLEyJFRqbuShkC')],
  ['University of Alabama at Birmingham', driveUrl('1nB2mlDG1ZeLTIp_pQpu8moQJEvIaBm1F')],
  ['University of Arizona', driveUrl('1PGoc4761a6S46OjcdyE9zBskCExkK_PF')],
  ['University of Arkansas', driveUrl('1kZW2Nw-mbHq5XwahRohGTGIJggGXIYvc')],
  ['University of California-Davis', driveUrl('1xd_2g4L1SqR_csHIwhIpBMTyhY_2E71l')],
  ['University of California-Irvine', driveUrl('1E6CPsg5A5FC83Kl5AzRfhXifxSd5O2j9')],
  ['University of California-Los Angeles', driveUrl('1eMo8pBZjLcqhav3k6uXL1qPmFwLE12FZ')],
  ['University of California-Riverside', driveUrl('1JohMGxxpZKhv9l_iAdExlI5AV3b9GI6g')],
  ['University of California-San Diego', driveUrl('1Be780xVVbU98euP4LPBud63QxodXxGd5')],
  ['University of California-Santa Barbara', driveUrl('1992WqPbdNyHeaw0-sqQTw9kLNVXGSm8c')],
  ['University of California-Santa Cruz', driveUrl('14YjGYXfskam0VrxaeYKGQqjlHmVpxKLA')],
  ['University of Central Florida', driveUrl('1Dt0KgZS-C2-gJ5EYHYZQ8KdGZvSqx6LQ')],
  ['University of Chicago', driveUrl('1j8fjxHqSZR2Z2S2fTV1pzd3bmtBWGD75')],
  ['University of Cincinnati-Main Campus', driveUrl('1TFCKKp506jyfte-PPHa9fp_xTAYvkd9J')],
  ['University of Colorado Boulder', driveUrl('1mt1VGZ8MZpVBVXvruAjglcNTHmOvz5bA')],
  ['University of Connecticut', driveUrl('1BBILZKCO-i59J0oRpd2d3FK2NOzlMbIz')],
  ['University of Delaware', driveUrl('1oiwhsiGKFpTRnaOBdnbVvK8Q9Z6FmmC4')],
  ['University of Denver', driveUrl('1YDF8c3INLr3Ke6cidxKfJLGZNn2S-yi1')],
  ['University of Florida', driveUrl('1supON3TTW5qWMXI8yaUjQ3WtIYNhRBS3')],
  ['University of Georgia', driveUrl('1a8JnGMIdJH7D5xQtpO7LTJ7ojak0rLDf')],
  ['University of Illinois at Chicago', driveUrl('1bAG_I6iDlDzwShrPDoRR8h5TbsMHya2f')],
  ['University of Iowa', driveUrl('1MtghmvweQC5Wrgf0sQiTK8OZ_GDGpWbd')],
  ['University of Kansas', driveUrl('1onbBmW6f0MChReH7rejG8yiVc2-Sg1bc')],
  ['University of Kentucky', driveUrl('1vK2rYV9tNVcfcnXlkkQPxMP2Kjy5-c4U')],
  ['University of Louisville', driveUrl('14lbBcIAcvM1hj6bU4hGVQ1FikU9K_jBe')],
  ['University of Maine', driveUrl('1iIm6kbdpySc_APcfykY1gICTMkNIQHN0')],
  ['University of Mary Washington', driveUrl('13VDoiHo8fuSDOt0iVvncycamqQ4dJ7CC')],
  ['University of Maryland-Baltimore County', driveUrl('1O2Z4koVh6i8E1YxLhCvAy61RIpeL0-6m')],
  ['University of Massachusetts-Amherst', driveUrl('1szAao2jFOzxBWnk9Ed1-OVIJP7IeqL6U')],
  ['University of Massachusetts-Lowell', driveUrl('10UClTvfzWBDOnODkRzcM6kLRq4zBYrz4')],
  ['University of Miami', driveUrl('1ZvslnFy0qAwmK6pGg354SpNDlWSHqxl8')],
  ['University of Michigan-Ann Arbor', driveUrl('15mEFGiO9bUNcPutjIkWnVE4l4tPLtXWk')],
  ['University of Minnesota-Twin Cities', driveUrl('1x8Pg9Po2_MoAoPgvdGcQSLNTOMT1g8Ou')],
  ['University of Mississippi', driveUrl('1zkKqpes6AHDRsUFPDK37u39NIIgfMwdf')],
  ['University of Missouri-Columbia', driveUrl('1NbaWvHf-4bYOTiKZcqYC01uraioI4u5q')],
  ['University of Nevada-Las Vegas', driveUrl('1sjBRzIdfn0hrt99hjdNgyiTessBWtP9X')],
  ['University of Nevada-Reno', driveUrl('1w7Dcw1jb2wOl1YyiKkgVMdjFIFLGxjfh')],
  ['University of New Hampshire-Main Campus', driveUrl('1dVBJf19IOUasykgym79xz8CSeJEjyyBg')],
  ['University of New Mexico-Main Campus', driveUrl('1i7ibnRlfy7PK5eEyGwbhMGjgLw75qSiW')],
  ['University of North Carolina Asheville', driveUrl('1zkzFPegvFEr6iJR0rcB2O-S4wJT6g-iD')],
  ['University of North Carolina at Chapel Hill', driveUrl('1Qgrv6eXLxN4sAnQHndYVNPgWshzBT22S')],
  ['University of North Carolina Wilmington', driveUrl('1ZDufOKYw6zJgqvg-nR06RJK-CvOqMA6U')],
  ['University of Notre Dame', driveUrl('1UbEUcDYK0qBNm3g5JoyeGjrP1W1ITCIS')],
  ['University of Oklahoma-Norman Campus', driveUrl('1Rd_jXwuvVxhs2JC5gMB0nsAh5-QjdcQW')],
  ['University of Oregon', driveUrl('1zwLGl0L_2NTWAc5L4ITKInrUXoDdbsiR')],
  ['University of Pennsylvania', driveUrl('1KPBFxXtdM6jbBCbjPldiwisgb2uMoR69')],
  ['University of Pittsburgh-Pittsburgh Campus', driveUrl('1-YIIa2QsxiCAGs_mTKItZ8M_lz3ekIAC')],
  ['University of Portland', driveUrl('1prgfAP2B4e2ocRosGec0dk_9Q0xu_u6q')],
  ['University of Puget Sound', driveUrl('1OaFaCV_d54yJCHVUmPKSu6C7Rermnahs')],
  ['University of Richmond', driveUrl('1H7OYRSCi-ZdQoFbAGqs-mG5_SORO5DRH')],
  ['University of San Diego', driveUrl('1iMnPz_OurBr8YPJrcgKQFekTlykchVRi')],
  ['University of San Francisco', driveUrl('1zKU2_jGW_cQgxxQ74oHLkKlebIgyrjq3')],
  ['University of South Carolina-Columbia', driveUrl('1NL9FMDkvcWRsIrwu26wWK1w2cLsdr-C1')],
  ['University of South Florida', driveUrl('1kkmDK_SchRW-Z1SpRocTkpFRk9G7HOdH')],
  ['University of Southern California', driveUrl('1TPSsXNRvdeFCI2Oeb4cYvx6A1uxl_EAP')],
  ['The University of Tennessee-Knoxville', driveUrl('1VGqZ_eyOPG76Uh0LtPrJQHpaMlrbsdlQ')],
  ['The University of Texas at Austin', driveUrl('1IfM-WLguczkEG1sfDhg4OhihHeQkchY9')],
  ['University of Texas at Dallas', driveUrl('1cigaguVyYb-5dDGoizNviBdvfunLmx4n')],
  ['University of Utah', driveUrl('1UwytoPwwp6jPanBxAuvQ6K_CxrvsaLS3')],
  ['University of Vermont', driveUrl('12FCOjvosoqVjNMv_w0fhPmKzKgQvAuvm')],
  ['University of Virginia-Main Campus', driveUrl('1_YeCKoq6qh9clB_COd1PsB7YmTQPhmFG')],
  ['University of Washington-Seattle Campus', driveUrl('1PyXz0wOoGw86bFaA37RKvhGboKIkyMtx')],
  ['University of Wisconsin-Madison', driveUrl('14UNcqVitOmVpukkpaj0kFv-4N4N_Df9v')],
  ['Vassar College', driveUrl('1z0j5Kg3RM7etfiIlFsdEltI0i34IGGOf')],
  ['Villanova University', driveUrl('1TJi4oOjU6bQQIdhnpeaPWgfwHb_tq_60')],
  ['Virginia Commonwealth University', driveUrl('1xfH-y0pomGwS5DsfTjCmfEg2VnY8fkAj')],
  ['Wake Forest University', driveUrl('1kAPUzBRf-egu4NIKQw_n4wl-7UJY_dRQ')],
  ['Washington and Lee University', driveUrl('1_K2Y0eIfYNKULckC9h51h_FeGqJ0GyC7')],
  ['Wellesley College', driveUrl('1CjYXubW4tfKsKnvHjgpU-kgvN6r3V1Bj')],
  ['Wesleyan University', driveUrl('1Tu6btPPH-IrFDCQbFCmtwha7kLe8-enJ')],
  ['West Virginia University', driveUrl('1HJqpIcCSMUMx4s6xX1AgegpamvtCkLm5')],
  ['Whitman College', driveUrl('1IPdvZGD-gzDYjb8QUWKuj8UgZk-wgpFr')],
  ['Williams College', driveUrl('1FTUbdWL56QfCfQCalPhJrHvq5NjOKNjr')],
  ['Yale University', driveUrl('12eLoqgFEtiRqe8v8DX7UEu2rn1ZNmzsf')],
];

// CDS PDFs vary in date format across schools: some use "MM-D" dash dates
// ("11-1", "1-2"), others spell the month out ("January 5"). Both are handled.
const DASH_DATE_RE = /\b(\d{1,2})[-/](\d{1,2})\b/;
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const MONTH_NAME_DATE_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i;

function yearForMonth(month) {
  return month >= 8 ? CYCLE_START_YEAR : CYCLE_YEAR_KEY;
}

function toISODate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Looks for a date within `windowChars` of the label match (not requiring
// adjacency, since some schools put "Yes" or a line break between the CDS
// question label and its answer value).
function parseDateNear(text, windowChars = 150) {
  const dash = DASH_DATE_RE.exec(text.slice(0, windowChars));
  if (dash) {
    const month = parseInt(dash[1], 10);
    const day = parseInt(dash[2], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { date: toISODate(yearForMonth(month), month, day), snippet: dash[0] };
    }
  }
  const named = MONTH_NAME_DATE_RE.exec(text.slice(0, windowChars));
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = parseInt(named[2], 10);
    if (day >= 1 && day <= 31) {
      return { date: toISODate(yearForMonth(month), month, day), snippet: named[0] };
    }
  }
  return null;
}

// Extract deadlines from linear CDS text. Each CDS question label is followed
// closely (within a short window) by its answer value in the raw extracted
// text -- reliable for scalar fields like dates, unlike the C7/C8A checkbox
// tables which lose column alignment in linear PDF text extraction (not
// attempted here -- we do not guess which column an "X" belongs to).
// Each entry: [deadline_type, is_binding, array of label regexes to try (first
// match wins) -- multiple phrasings because different schools' CDS text
// extraction renders the same standardized question differently].
const FIELD_PATTERNS = [
  ['regular_decision', false, [
    new RegExp(`${fuzzyWord('Application')} closing date \\(fall\\)`, 'i'),
    new RegExp(`Does your ${fuzzyWord('institution')} have an ${fuzzyWord('application')} closing\\s*date\\?\\s*Yes`, 'i'),
  ]],
  ['early_decision_1', true, [
    new RegExp('First or only early decision plan closing date', 'i'),
  ]],
  ['early_decision_2', true, [
    new RegExp('Other early decision plan closing date', 'i'),
  ]],
  ['early_action', false, [
    new RegExp(`Early ${fuzzyWord('action')} closing date`, 'i'),
  ]],
];

function extractDeadlines(text) {
  const out = [];
  const seen = new Set();
  for (const [type, binding, patterns] of FIELD_PATTERNS) {
    for (const pattern of patterns) {
      const m = pattern.exec(text);
      if (!m) continue;
      const after = text.slice(m.index + m[0].length);
      // Some schools' CDS carries the "Application closing date (fall)" label
      // even when they use rolling admission (no fixed closing date) --
      // verified live on Bradley University's CDS: the label is present, blank,
      // and the nearest date in the linear text is actually the ROLLING START
      // date from a different, nearby question ("On a rolling basis beginning
      // (date): 10/1"), not a real regular-decision deadline. If "rolling
      // basis" appears before the date we'd otherwise extract, skip this type
      // rather than mislabel a rolling program's start date as a fixed
      // closing date.
      const rollingIdx = after.search(/rolling\s+basis/i);
      const found = parseDateNear(after);
      if (found) {
        const dateIdx = after.indexOf(found.snippet);
        if (rollingIdx !== -1 && dateIdx !== -1 && rollingIdx < dateIdx) continue; // eslint-disable-line no-continue
        if (!seen.has(type)) {
          out.push({ deadline_type: type, deadline_date: found.date, is_binding: binding, snippet: found.snippet });
          seen.add(type);
        }
        break;
      }
    }
  }
  return out;
}

// CDS C21/C22 also state applicant/admit counts for ED/EA right next to the
// deadline questions we already parse -- extracting these gives
// early_decision_rate / early_action_rate for canonical.institution_admissions
// with no new fetching (same PDFs, same TARGETS list).
// Numbers can carry thousands-comma separators ("4,423") and the label is
// sometimes followed by a colon before the value ("institution:     4,423").
// Bounded to a short window: some schools leave the field blank (don't
// publicly report the count), and an unbounded scan would skip right past
// the blank field into the NEXT question's text and grab an unrelated
// number (verified live: this produced impossible >100% "rates" for several
// schools, e.g. Bowdoin's blank ED fields matching a stray "22" from the
// following "C22." section header several dozen characters away).
// The gap is bounded to WHITESPACE/COLON ONLY (never arbitrary characters),
// so a blank field (no number reported) can't accidentally skip past real
// words into the next question and grab an unrelated number -- but the gap
// itself can be long, since these forms pad values with many spaces for
// column alignment (CMU's admitted-count field has ~25 spaces before the
// digits).
const NUM_AFTER = /^[:\s]{0,60}([\d,]{2,7})\b/;

function extractApplicationRates(text) {
  const grab = (labelRe) => {
    const m = labelRe.exec(text);
    if (!m) return null;
    const numMatch = NUM_AFTER.exec(text.slice(m.index + m[0].length, m.index + m[0].length + 70));
    if (!numMatch) return null;
    const n = parseInt(numMatch[1].replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  const applications = fuzzyWord('applications');
  const institution = fuzzyWord('institution');
  const admitted = fuzzyWord('admitted');
  const action = fuzzyWord('action');
  const edApplied = grab(new RegExp(`Number of early decision ${applications} received by your ${institution}`, 'i'));
  const edAdmitted = grab(new RegExp(`Number of applicants ${admitted} under early decision plan`, 'i'));
  const eaApplied = grab(new RegExp(`Number of early ${action} ${applications} received by your ${institution}`, 'i'));
  const eaAdmitted = grab(new RegExp(`Number of applicants ${admitted} under early ${action} plan`, 'i'));

  const out = {};
  if (edApplied && edAdmitted != null && edApplied > 0) out.early_decision_rate = Math.round((10000 * edAdmitted) / edApplied) / 100;
  if (eaApplied && eaAdmitted != null && eaApplied > 0) out.early_action_rate = Math.round((10000 * eaAdmitted) / eaApplied) / 100;
  return out;
}

async function resolveInstitutionId(pool, name) {
  const r = await pool.query(`SELECT id FROM canonical.institutions WHERE canonical_name = $1 LIMIT 1`, [name]);
  return r.rows[0] ? r.rows[0].id : null;
}

async function fetchPdfText(url, logger) {
  // Deferred require: pdf-parse is a scraper-only dependency, not needed by the
  // main backend app; keeping it out of the top-level require list avoids
  // adding a prod dependency for a script-only code path.
  let pdfParse;
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    pdfParse = require('pdf-parse');
  } catch (e) {
    throw new Error('pdf-parse is not installed; run `npm install pdf-parse` in backend/ to use this adapter');
  }
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
    if (!res.ok) { logger.warn(`[${PARSER_NAME}] ${url} -> HTTP ${res.status}; skipping`); return null; }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) { logger.warn(`[${PARSER_NAME}] ${url} -> body too small (${buf.length}b), likely a Drive confirm page; skipping`); return null; }
    const parsed = await pdfParse(buf);
    return parsed.text;
  } catch (e) {
    logger.warn(`[${PARSER_NAME}] fetch/parse failed for ${url}: ${e.message}; skipping`);
    return null;
  }
}

async function fetchRows({ pool, logger = console, limit }) {
  const rows = [];
  const now = new Date().toISOString();
  // CDS_OFFSET lets a checkpointed sprint run this 241-institution list in
  // batches (e.g. CDS_OFFSET=100 node scripts/runScraper.js cdsDeadlines
  // --limit=100) without refetching earlier institutions each time.
  const offset = Math.max(0, parseInt(process.env.CDS_OFFSET || '0', 10) || 0);
  const batch = limit ? TARGETS.slice(offset, offset + limit) : TARGETS.slice(offset);
  logger.info(`[${PARSER_NAME}] batch: offset=${offset}, size=${batch.length} (of ${TARGETS.length} total targets)`);
  for (const [name, url] of batch) {
    const institutionId = await resolveInstitutionId(pool, name); // eslint-disable-line no-await-in-loop
    if (!institutionId) { logger.warn(`[${PARSER_NAME}] no institution match for "${name}"; skipping`); continue; }
    const text = await fetchPdfText(url, logger); // eslint-disable-line no-await-in-loop
    if (!text) continue;
    const deadlines = extractDeadlines(text);
    if (!deadlines.length) { logger.warn(`[${PARSER_NAME}] no deadlines extracted for ${name}; skipping (not fabricating)`); continue; }
    for (const d of deadlines) {
      rows.push({
        institution_id: institutionId,
        cycle_year: CYCLE_YEAR,
        cycle_year_key: CYCLE_YEAR_KEY,
        degree_level: 'undergraduate',
        applicant_type: 'international',
        intake_term: 'fall',
        deadline_type: d.deadline_type,
        deadline_date: d.deadline_date,
        deadline_date_key: d.deadline_date,
        is_binding: d.is_binding,
        is_rolling: false,
        is_estimated: false,
        source_url: url,
        source_domain: 'Common Data Set (self-reported)',
        source_type: 'official',
        parser_name: PARSER_NAME,
        parser_version: PARSER_VERSION,
        last_verified: now,
        confidence_score: 0.85,
        source_priority: 95,
        conflict_status: 'clean',
        raw_payload: JSON.stringify({ snippet: d.snippet, institution: name }),
        parser_trace: JSON.stringify({ parser: PARSER_NAME, version: PARSER_VERSION, matched: d.snippet }),
        created_at: now,
        updated_at: now,
      });
    }
    logger.info(`[${PARSER_NAME}] ${name}: extracted ${deadlines.length} deadline(s)`);
  }
  return rows;
}

const VALID_TYPES = new Set([
  'early_action', 'early_decision_1', 'early_decision_2', 'regular_decision',
  'rolling', 'priority', 'scholarship', 'transfer', 'ucas_equal_consideration',
]);

function validateRow(row) {
  if (!row.institution_id) return { valid: false, reason: 'missing institution_id' };
  if (!VALID_TYPES.has(row.deadline_type)) return { valid: false, reason: `bad deadline_type ${row.deadline_type}` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.deadline_date || '')) return { valid: false, reason: `bad deadline_date ${row.deadline_date}` };
  return { valid: true };
}

const adapter = {
  name: 'common-data-set-deadlines',
  source: 'Common Data Set (school self-reported, standardized survey)',
  table: 'canonical.institution_deadlines',
  columns: [
    'institution_id', 'cycle_year', 'cycle_year_key', 'degree_level', 'applicant_type',
    'intake_term', 'deadline_type', 'deadline_date', 'deadline_date_key', 'is_binding',
    'is_rolling', 'is_estimated', 'source_url', 'source_domain', 'source_type',
    'parser_name', 'parser_version', 'last_verified', 'confidence_score', 'source_priority',
    'conflict_status', 'raw_payload', 'parser_trace', 'created_at', 'updated_at',
  ],
  conflictColumns: ['institution_id', 'cycle_year_key', 'applicant_type', 'degree_level', 'intake_term', 'deadline_type'],
  fetchRows,
  validateRow,
  requireNewRows: true,
};

module.exports = {
  adapter, extractDeadlines, parseDateNear, TARGETS, extractApplicationRates, fetchPdfText, resolveInstitutionId,
};
