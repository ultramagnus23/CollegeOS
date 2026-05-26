import { COLLEGE_CARD_FIELDS, FRONTEND_CANONICAL_RELATION } from './collegeContracts';

export const DASHBOARD_CONTRACT = {
  sourceRelation: FRONTEND_CANONICAL_RELATION,
  cardFields: COLLEGE_CARD_FIELDS,
  requiredSections: ['overview', 'deadlines', 'recommendations'],
};
