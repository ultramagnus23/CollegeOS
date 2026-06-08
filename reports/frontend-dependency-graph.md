# Frontend Dependency Graph

| Frontend Flow | API Route | Serializer/Route | DB Query |
|---|---|---|---|
| Discover/Colleges pages | /api/search/colleges + /api/colleges/comprehensive + /api/discovery/* | backend/src/routes/search.js + backend/src/routes/colleges.js + backend/src/routes/discovery.js | SQL FROM canonical.mv_college_cards |
| Dashboard | /api/recommendations + /api/colleges/suggested | backend/src/routes/recommendations.js + backend/src/routes/colleges.js | Recommendation pipeline + canonical.mv_college_cards |
| Onboarding recommendations | /api/recommendations/generate | backend/src/routes/recommendations.js | backend/src/services/recommendation/recommendationPipelineService.js -> canonical.mv_college_cards |
| Search | /api/search/colleges + /api/search/suggestions | backend/src/routes/search.js | canonical.mv_college_cards (+ canonical.institution_programs for suggestions) |
| Compare/details | /api/colleges/comprehensive/:id + /api/colleges/comprehensive/compare | backend/src/routes/colleges.js + backend/src/services/collegeService.js | canonical domain tables (detail path) |
