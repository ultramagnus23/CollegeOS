'use strict';
/**
 * requireMastersTrack.js — Phase 4 of docs/MASTERS_TRACK_PLAN.md.
 *
 * Two guards:
 *  - mastersFeatureGate: the whole masters router is dark unless MASTERS_TRACK_ENABLED.
 *    Returns 404 when off so the surface is indistinguishable from "not a route".
 *  - requireMastersTrackForWrite: profile-mutating routes require the user's
 *    program_track to be 'masters'. Fails LOUD (409) rather than silently applying
 *    masters logic to an undergrad/unset profile.
 */
const config = require('../config/env');
const mastersProfileService = require('../services/masters/mastersProfileService');
const logger = require('../utils/logger');

function mastersFeatureGate(req, res, next) {
  if (!config.features || !config.features.mastersTrackEnabled) {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  return next();
}

async function requireMastersTrackForWrite(req, res, next) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const track = await mastersProfileService.getTrack(userId);
    if (!track || !track.program_track) {
      // Should be impossible given the NOT NULL DEFAULT, but never default-through.
      logger.error('Masters write blocked: program_track unset', { userId });
      return res.status(409).json({ success: false, message: 'Program track is not set for this user.' });
    }
    if (track.program_track !== 'masters') {
      return res.status(409).json({
        success: false,
        message: `This endpoint requires the masters track (current: ${track.program_track}).`,
      });
    }
    req.mastersTrack = track;
    return next();
  } catch (err) {
    logger.error('requireMastersTrackForWrite failed', { error: err.message });
    return res.status(500).json({ success: false, message: 'Track verification failed' });
  }
}

module.exports = { mastersFeatureGate, requireMastersTrackForWrite };
