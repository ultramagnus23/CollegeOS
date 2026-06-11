import { COLLEGE_CARD_FIELDS, FRONTEND_CANONICAL_RELATION } from './collegeContracts';

export interface RecommendationContract {
  sourceRelation: typeof FRONTEND_CANONICAL_RELATION;
  requiredCollegeFields: readonly string[];
  requiredResponseFields: readonly string[];
}

export const RECOMMENDATION_CONTRACT: RecommendationContract = {
  sourceRelation: FRONTEND_CANONICAL_RELATION,
  requiredCollegeFields: COLLEGE_CARD_FIELDS,
  requiredResponseFields: ['id', 'canonical_name', 'matchScore'],
};
