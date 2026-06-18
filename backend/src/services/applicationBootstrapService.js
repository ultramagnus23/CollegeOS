// backend/src/services/applicationBootstrapService.js
//
// P1 — Automatic college pipeline. When an application is created, this single
// entry point bootstraps everything a student needs to act on, by ORCHESTRATING
// the existing services (no duplicate systems):
//
//   1. deadlines      -> deadlineGenerator (rule-based templates by country/platform)
//   2. essays         -> essayAutoLoadingService (Common App / Coalition / UC prompts)
//   3. documents      -> rule-based checklist below (Document model)
//   4. tasks          -> requirementService.createApplicationTasks
//   5. timeline        -> timelineService.generateTimelineActions
//
// Real institution deadline/requirement data lives in canonical.institution_*
// tables (populated by the scraper effort); until those fill, deadlines/essays
// come from the rule templates the underlying services already implement. The
// document checklist is the user's required-docs list derived from application
// rules (transcript, recommendations, test scores, plus international docs) — not
// fabricated institution facts. Every step is best-effort: one failure is recorded
// but does not abort the others, mirroring the existing createApplication pattern.

const logger = require('../utils/logger');
const Document = require('../models/Document');

class ApplicationBootstrapService {
  static async bootstrap(userId, application, college) {
    const collegeId = application?.college_id;
    const summary = { deadlines: 0, essays: 0, documents: 0, tasks: 0, timeline: 0, errors: [] };

    if (!userId || !application?.id || !collegeId) {
      summary.errors.push({ step: 'precondition', error: 'missing userId/application.id/collegeId' });
      return summary;
    }

    await this._step('deadlines', summary, async () => {
      const { generateDeadlinesForCollege } = require('./deadlineGenerator');
      const result = await generateDeadlinesForCollege(college, userId, application.id);
      summary.deadlines = this._count(result);
    });

    await this._step('essays', summary, async () => {
      const EssayAutoLoadingService = require('./essayAutoLoadingService');
      const result = await EssayAutoLoadingService.loadEssaysForApplication(userId, application.id, collegeId);
      summary.essays = this._count(result, ['loaded', 'essays', 'count']);
    });

    await this._step('documents', summary, async () => {
      summary.documents = await this._generateDocumentChecklist(userId, collegeId, college);
    });

    await this._step('tasks', summary, async () => {
      const RequirementService = require('./requirementService');
      const result = await RequirementService.createApplicationTasks(userId, collegeId, application.id);
      summary.tasks = this._count(result, ['tasks', 'count']);
    });

    await this._step('timeline', summary, async () => {
      const timelineService = require('./timelineService');
      const result = await timelineService.generateTimelineActions(userId);
      summary.timeline = this._count(result, ['actions_generated', 'actions', 'count']);
    });

    logger.info('ApplicationBootstrap complete', {
      userId, applicationId: application.id, collegeId,
      ...summary, errorCount: summary.errors.length,
    });
    return summary;
  }

  static async _step(step, summary, fn) {
    try {
      await fn();
    } catch (err) {
      summary.errors.push({ step, error: err.message });
      logger.error(`ApplicationBootstrap step "${step}" failed (non-fatal)`, { error: err.message });
    }
  }

  // Best-effort count extraction across the varied return shapes of the reused services.
  static _count(result, keys = ['count']) {
    if (Array.isArray(result)) return result.length;
    if (result && typeof result === 'object') {
      for (const k of keys) {
        if (Array.isArray(result[k])) return result[k].length;
        if (Number.isFinite(result[k])) return result[k];
      }
    }
    return 0;
  }

  // Rule-based required-document checklist. Derived from application rules + the
  // college's country (a real field), NOT from fabricated institution requirement
  // rows. Idempotent: skips a document already present for this college.
  static async _generateDocumentChecklist(userId, collegeId, college) {
    const C = Document.CATEGORIES;
    const country = String(college?.country || '').trim().toUpperCase();
    const isUS = ['US', 'USA', 'UNITED STATES'].includes(country);

    const checklist = [
      { name: 'Official Transcript', category: C.TRANSCRIPT, required: true },
      { name: 'Counselor Recommendation', category: C.RECOMMENDATION, required: true },
      { name: 'Teacher Recommendation', category: C.RECOMMENDATION, required: true },
      { name: 'SAT / ACT Scores', category: C.TEST_SCORE, required: false },
      { name: 'Resume / Activities List', category: C.OTHER, required: false },
    ];

    if (!isUS) {
      // International applications: English proficiency + passport are standard.
      checklist.push({ name: 'English Proficiency (TOEFL / IELTS / Duolingo)', category: C.TEST_SCORE, required: true });
      checklist.push({ name: 'Passport', category: C.PASSPORT, required: true });
      checklist.push({ name: 'Proof of Funds / Financial Documents', category: C.FINANCIAL, required: true });
    } else {
      checklist.push({ name: 'FAFSA / CSS Profile (Financial Aid)', category: C.FINANCIAL, required: false });
    }

    const existing = await Document.getByUserId(userId, { collegeId });
    const existingNames = new Set((existing || []).map((d) => String(d.name).toLowerCase()));

    let created = 0;
    for (const item of checklist) {
      if (existingNames.has(item.name.toLowerCase())) continue;
      await Document.create(userId, {
        name: item.name,
        category: item.category,
        status: Document.STATUS.PENDING,
        collegeIds: [collegeId],
        metadata: { auto_generated: true, required: item.required, source: 'application_bootstrap_rules' },
      });
      created += 1;
    }
    return created;
  }
}

module.exports = ApplicationBootstrapService;
