// Groups nDelius disposal (sentence) types into the categories we explain to people on probation,
// based on the "ND sentence codes". Lookups are by disposal type code;
// descriptions are kept alongside for readability.

export type SentenceCategory =
  | 'standard-determinate'
  | 'extended-determinate'
  | 'life'
  | 'special-custodial'
  | 'community-order'
  | 'suspended-sentence-order'

type DisposalType = [code: string, description: string]

const DISPOSAL_TYPES_BY_CATEGORY: Record<SentenceCategory, DisposalType[]> = {
  'standard-determinate': [
    ['301', 'CJA - Std Determinate Custody'],
    ['304', 'Adult Custody 12m plus'],
    ['305', 'Young Offender Inst - <12 mths'],
    ['306', 'Young Offender Inst - >=12 mths'],
    ['307', 'Adult Custody < 12m'],
    ['318', 'Detention and Training Order'],
    ['320', 'CJA - Weekday Int Custody'],
    ['321', 'CJA - Weekend Int Custody'],
    ['323', 'CJA - Custody Plus'],
    ['325', 'ORA Adult Custody (inc PSS)'],
    ['327', 'ORA Adult Custody (not PSS)'],
    ['328', 'ORA Youth Custody (inc PSS)'],
    ['401', 'Imprisonment - No Supervision'],
    ['402', 'CJA - Trans Custody - Adult'],
    ['403', 'CJA - Trans Custody - Youth'],
    ['418', 'Secure Training Order'],
    ['419', 'Detention Centre'],
    ['428', 'Imprisonment - Fine Default'],
    ['429', 'One Day Imprisonment'],
    ['497', 'Conc/Consec Adult Custody <12m'],
    ['604', 'CtsMtl - Detention Cust Order'],
    ['607', 'CtsMtl - Detention CTC'],
    ['810', 'Adult Short Custody - SA2026'],
    ['811', 'Adult 24mth Plus Custody SA2026'],
    ['NI4', 'NI Only - Determinate Custody'],
    ['OU07', 'Adult Custody Consecutive'],
    ['OU08', 'Adult Custody Concurrent'],
    ['OU10', 'Youth Custody Consecutive'],
    ['OU11', 'Youth Custody Concurrent'],
    ['OU14', 'Borstal'],
    ['OU15', 'Youth Custody (migration)'],
    ['OU21', 'Adult Custody (Migration)'],
    ['OU22', 'Detained S53(1) or S250 (s.91)'],
    ['OU23', 'Detained S53(2) or S250 (s.91)'],
  ],
  'extended-determinate': [
    ['302', 'CJA - Extended Sentence'],
    ['311', 'Extended Sentence (pre-Oct92)'],
    ['324', 'Extended Determinate Sentence'],
    ['NI2', 'NI use only - Extended Custodial'],
  ],
  life: [
    ['246', 'Scotland - Indeterminate Custody'],
    ['303', 'CJA - Indeterminate Public Prot.'],
    ['308', 'Life imprisonment (Adult)'],
    ['310', 'Life imprisonment (Youth)'],
    ['602', 'CtsMtl - Detention/HM Pleasure'],
    ['603', 'CtsMtl - Detention - Sec State'],
    ['NI1', 'NI use only - Life Imprisonment'],
    ['NI3', 'NI use only - Indeterminate Cust'],
  ],
  'special-custodial': [
    ['242', 'Special Cust Sentence (S236aCJA)'],
    ['245', 'Special Cust Sentence (S278CJA)'],
  ],
  'community-order': [
    ['201', 'CJA - Community Order'],
    ['204', 'CJA - Youth Rehabilitation Order'],
    ['205', 'Community Rehabilitation Order'],
    ['206', 'Community Punishment Order'],
    ['207', 'CPRO'],
    ['208', 'DTTO - Low Intensity'],
    ['209', 'DTTO - High Intensity'],
    ['210', 'Drug Abstinence Order'],
    ['211', 'Supervision Order (C&YPA)'],
    ['212', 'Enforcement Order (Pre-CJA)'],
    ['213', 'CPO - Persistent Petty Offenders'],
    ['214', 'CPO - Fine Defaulters'],
    ['217', 'Money Payment Supervision Order'],
    ['218', 'Curfew Order'],
    ['219', 'Action Plan Order CDA1998 S69'],
    ['220', 'Reparation Order CDA1998 S67'],
    ['221', 'Parenting Order CDA1998 S8'],
    ['222', 'CP component of CPRO'],
    ['223', 'Rehabilitation component of CPRO'],
    ['224', 'Family Assistance Order'],
    ['225', 'Care and Supervision Order'],
    ['226', 'CJA -Enforcement Order (C&AA 06)'],
    ['227', 'Intensive Alternative to Custody'],
    ['228', 'Intensive Supervision & Control'],
    ['233', 'ORA Supervision Default Order'],
    ['234', 'Scottish Community Order (CPA95)'],
    ['235', 'Scottish Comm Payback (CJLA2010)'],
    ['237', 'CS & Probation Order - Jersey'],
    ['238', 'Restriction of Liberty Order'],
    ['239', 'Scottish DTTO'],
    ['244', 'Probation Order - IoM (CJA1963)'],
    ['329', 'ORA Community Order'],
    ['331', 'ORA Youth Rehabilitation Order'],
    ['332', 'Referral Orders - YOS'],
    ['340', 'SA2020 Community Order'],
    ['342', 'SA2020 Youth Rehab Order'],
    ['430', 'Attendance Centre Order'],
    ['OU38', 'DTTO - intensity not specified'],
  ],
  'suspended-sentence-order': [
    ['203', 'CJA - Suspended Sentence Order'],
    ['216', 'Suspended Sentence Supn Order'],
    ['229', 'Supervision and Control (SSO)'],
    ['231', 'CJA- Suspended SO (unsupervised)'],
    ['330', 'ORA Suspended Sentence Order'],
    ['341', 'SA2020 Suspended Sentence Order'],
    ['408', 'Suspended Sentence'],
  ],
}

const CATEGORY_BY_CODE = new Map<string, SentenceCategory>(
  (Object.entries(DISPOSAL_TYPES_BY_CATEGORY) as [SentenceCategory, DisposalType[]][]).flatMap(
    ([category, disposalTypes]) => disposalTypes.map(([code]) => [code, category]),
  ),
)

export const getSentenceCategory = (typeCode?: string): SentenceCategory | undefined =>
  typeCode ? CATEGORY_BY_CODE.get(typeCode.trim().toUpperCase()) : undefined

// Categories with a "What this means" explanation, each in
// views/partials/sentence-type-explanations/<category>.njk. Add a category here once its
// template exists.
const CATEGORIES_WITH_EXPLANATION: SentenceCategory[] = [
  'standard-determinate',
  'extended-determinate',
  'life',
  'special-custodial',
]

export const getSentenceTypeExplanationTemplate = (typeCode?: string): string | undefined => {
  const category = getSentenceCategory(typeCode)
  return category && CATEGORIES_WITH_EXPLANATION.includes(category)
    ? `partials/sentence-type-explanations/${category}.njk`
    : undefined
}
