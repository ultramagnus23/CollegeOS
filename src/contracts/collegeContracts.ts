export {
  FRONTEND_CANONICAL_RELATION,
  FRONTEND_COLLEGE_CARD_FIELDS as COLLEGE_CARD_FIELDS,
  FRONTEND_COLLEGE_CARD_COLUMNS as COLLEGE_CARD_COLUMNS,
  FrontendCollegeCardSchema as CollegeCardContractSchema,
  FRONTEND_COLLEGE_CARD_ORDER_FIELDS,
  FRONTEND_COLLEGE_CARD_REQUIRED_FIELDS,
  FRONTEND_COLLEGE_CARD_FALLBACKS,
  parseFrontendCollegeCardOrThrow,
  applyFrontendCollegeCardFallback,
} from './frontendCollegeCardContract';

export type { FrontendCollegeCard as CollegeCardContract } from './frontendCollegeCardContract';
