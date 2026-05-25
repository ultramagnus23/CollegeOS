import { COLLEGE_CARD_FIELDS } from './collegeCardFields';

export const DASHBOARD_CONTRACT = {
  sourceRelation: 'canonical.mv_college_cards',
  cardFields: COLLEGE_CARD_FIELDS,
  requiredSections: ['overview', 'deadlines', 'recommendations'],
};
