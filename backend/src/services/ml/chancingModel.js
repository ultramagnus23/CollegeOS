'use strict';

// Inference for the calibrated chancing model (artifact: backend/ml/chancing_model.json,
// produced by ml/trainChancingModel.js). Returns a probability ONLY when the required
// real inputs exist (college acceptance_rate + median SAT, student SAT or ACT); otherwise
// returns null so the caller falls back to the heuristic (hybrid design).
//
// HONESTY: the model was fit on applicants simulated from real per-college stats, not on
// real admission outcomes — see backend/ml/model_metrics.json and MODEL_REPORT.md.

const fs = require('fs');
const path = require('path');

const ACT_TO_SAT = {
  36: 1590, 35: 1540, 34: 1500, 33: 1460, 32: 1430, 31: 1400, 30: 1370, 29: 1340,
  28: 1310, 27: 1280, 26: 1240, 25: 1210, 24: 1180, 23: 1140, 22: 1110, 21: 1080,
  20: 1020, 19: 980, 18: 940, 17: 910, 16: 880, 15: 850, 14: 820, 13: 780,
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let MODEL;
function loadModel() {
  if (MODEL !== undefined) return MODEL;
  try {
    MODEL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'ml', 'chancing_model.json'), 'utf8'));
  } catch {
    MODEL = null; // artifact not built yet → callers fall back to heuristic
  }
  return MODEL;
}

function isLoaded() { return !!loadModel(); }

/**
 * @param {{sat?:number|null, act?:number|null, gpa?:number|null}} student
 * @param {{acceptanceRate?:number|null, medianSat?:number|null}} college
 * @returns {{ probability:number, source:'model' }|null} null when inputs insufficient
 */
function predictAdmitProbability(student = {}, college = {}) {
  const m = loadModel();
  if (!m) return null;
  const ar = Number(college.acceptanceRate);
  const medianSat = Number(college.medianSat);
  if (!Number.isFinite(ar) || ar <= 0 || ar >= 1) return null;
  if (!Number.isFinite(medianSat)) return null;

  let sat = Number(student.sat);
  if (!Number.isFinite(sat) && Number.isFinite(Number(student.act))) {
    sat = ACT_TO_SAT[Math.round(Number(student.act))] ?? null;
  }
  if (!Number.isFinite(sat)) return null;

  const gpa = Number(student.gpa);
  const satZ = (sat - medianSat) / (m.sat_sigma || 130);
  const gpaCentered = Number.isFinite(gpa) ? (gpa - 3.5) / 0.4 : 0;
  const la = logit(clamp(ar, 0.01, 0.99));
  const raw = [satZ, gpaCentered, la];

  let z = m.b;
  for (let j = 0; j < m.w.length; j += 1) {
    const std = m.std[j] || 1;
    z += m.w[j] * ((raw[j] - m.mean[j]) / std);
  }
  return { probability: clamp(sigmoid(z), 0.01, 0.97), source: 'model' };
}

module.exports = { predictAdmitProbability, isLoaded };
