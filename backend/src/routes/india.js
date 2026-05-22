'use strict';

const express = require('express');
const indiaIntelligenceService = require('../services/indiaIntelligenceService');

const router = express.Router();

function readFilters(query) {
  return {
    limit: query.limit,
    institutionId: query.institutionId,
    state: query.state,
    city: query.city,
  };
}

router.get('/discovery', async (req, res, next) => {
  try {
    const data = await indiaIntelligenceService.getDiscovery(readFilters(req.query));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/rankings', async (req, res, next) => {
  try {
    const data = await indiaIntelligenceService.getRankings(readFilters(req.query));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/cutoffs', async (req, res, next) => {
  try {
    const data = await indiaIntelligenceService.getCutoffs(readFilters(req.query));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/placements', async (req, res, next) => {
  try {
    const data = await indiaIntelligenceService.getPlacements(readFilters(req.query));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/fees', async (req, res, next) => {
  try {
    const data = await indiaIntelligenceService.getFees(readFilters(req.query));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

router.get('/exams', async (req, res, next) => {
  try {
    const data = await indiaIntelligenceService.getExams(readFilters(req.query));
    res.json({ success: true, data, count: data.length });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
