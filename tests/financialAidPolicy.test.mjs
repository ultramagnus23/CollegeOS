import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAidGuidance, isUSPerson } from '../src/lib/financialAidPolicy.mjs';

const hasFafsa = (g) => g.forms.some((f) => /fafsa/i.test(f.name));

test('Indian citizen at a US college is NEVER shown FAFSA', () => {
  const g = getAidGuidance({ country: 'India', citizenship: 'Indian' }, { name: 'Some University', country: 'US' });
  assert.equal(g.fafsaEligible, false);
  assert.equal(g.isInternational, true);
  assert.equal(hasFafsa(g), false, 'FAFSA must not appear for a non-US citizen');
  assert.ok(g.forms.some((f) => /css profile/i.test(f.name)), 'CSS Profile path should be offered');
});

test('country=India with no citizenship still treated as international (no FAFSA)', () => {
  const g = getAidGuidance({ country: 'India' }, { name: 'Some University', country: 'US' });
  assert.equal(hasFafsa(g), false);
});

test('US citizen at a US college IS shown FAFSA', () => {
  const g = getAidGuidance({ country: 'USA', citizenship: 'US' }, { name: 'Some University', country: 'US', css_profile_required: true });
  assert.equal(g.fafsaEligible, true);
  assert.ok(hasFafsa(g));
  assert.ok(g.forms.some((f) => /css profile/i.test(f.name) && f.required === true));
});

test('curated need-blind-for-international school is surfaced', () => {
  const g = getAidGuidance({ country: 'India' }, { name: 'Massachusetts Institute of Technology', country: 'US' });
  assert.equal(g.needPolicy, 'need-blind-intl');
  assert.equal(g.meetsFullNeed, true);
  assert.equal(hasFafsa(g), false);
});

test('DB flags override curated fallback', () => {
  const g = getAidGuidance({ country: 'India' }, { name: 'Unknown College', country: 'US', need_aware_intl: true, meets_full_need: true, css_profile_required: true });
  assert.equal(g.needPolicy, 'need-aware-intl');
  assert.equal(g.meetsFullNeed, true);
});

test('international aid unavailable produces a warning, never FAFSA', () => {
  const g = getAidGuidance({ country: 'India' }, { name: 'No Intl Aid U', country: 'US', international_aid_available: false });
  assert.equal(hasFafsa(g), false);
  assert.ok(g.warnings.some((w) => /does not offer need-based aid to international/i.test(w)));
});

test('isUSPerson basics', () => {
  assert.equal(isUSPerson({ citizenship: 'US' }), true);
  assert.equal(isUSPerson({ country: 'United States' }), true);
  assert.equal(isUSPerson({ country: 'India' }), false);
  assert.equal(isUSPerson({ citizenship: 'Indian', country: 'USA' }), false, 'citizenship beats country');
});

test('every branch always includes a verify-on-official-page warning', () => {
  for (const s of [{ country: 'India' }, { country: 'USA', citizenship: 'US' }]) {
    const g = getAidGuidance(s, { name: 'X', country: 'US' });
    assert.ok(g.warnings.some((w) => /verify/i.test(w)));
  }
});
