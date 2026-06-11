import { COLLEGE_CARD_FIELDS, FRONTEND_CANONICAL_RELATION } from './collegeContracts';

export interface DashboardContract {
  sourceRelation: typeof FRONTEND_CANONICAL_RELATION;
  cardFields: readonly string[];
  requiredSections: readonly string[];
}

export const DASHBOARD_CONTRACT: DashboardContract = {
  sourceRelation: FRONTEND_CANONICAL_RELATION,
  cardFields: COLLEGE_CARD_FIELDS,
  requiredSections: ['overview', 'deadlines', 'recommendations'],
};
