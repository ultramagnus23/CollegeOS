import { COLLEGE_CARD_FIELDS } from './collegeCardFields';

export const RECOMMENDATION_CONTRACT = {
  sourceRelation: 'canonical.mv_college_cards',
  requiredCollegeFields: COLLEGE_CARD_FIELDS,
  requiredResponseFields: ['id', 'canonical_name', 'matchScore'],
};
