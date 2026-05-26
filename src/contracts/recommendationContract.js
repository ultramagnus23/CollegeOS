import { COLLEGE_CARD_FIELDS, FRONTEND_CANONICAL_RELATION } from './collegeContracts';

export const RECOMMENDATION_CONTRACT = {
  sourceRelation: FRONTEND_CANONICAL_RELATION,
  requiredCollegeFields: COLLEGE_CARD_FIELDS,
  requiredResponseFields: ['id', 'canonical_name', 'matchScore'],
};
