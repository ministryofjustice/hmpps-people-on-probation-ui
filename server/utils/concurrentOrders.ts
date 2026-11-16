import type { RequirementResponse, SentenceResponse } from '../data/peopleOnProbationApiClient'
import { getRequirementType } from './requirementTypes'
import { isLicenceSentence } from './utils'

// Concurrent orders of the same type, starting and ending on the same dates, are shown as one order.
const isSameOrder = (order: SentenceResponse, other: SentenceResponse): boolean =>
  order.typeCode === other.typeCode &&
  order.startDate === other.startDate &&
  order.expectedEndDate === other.expectedEndDate

// The same requirement has the same main and sub-category. Without a main category there's nothing to
// match on, so it's kept on its own.
const requirementKey = (requirement: RequirementResponse): string | undefined =>
  requirement.mainCategory?.code && `${requirement.mainCategory.code}|${requirement.subCategory?.code ?? ''}`

const total = (values: (number | undefined)[]): number | undefined =>
  values.some(value => value !== undefined) ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) : undefined

// Completed is capped at required, as on the requirement detail page, so one requirement's overrun
// doesn't count towards another.
const cappedCompleted = ({ completed, required }: RequirementResponse): number | undefined =>
  completed === undefined || completed === null ? undefined : Math.min(completed, required ?? completed)

// The same requirement is shown once. Count-based ones (unpaid work, RAR) add up their required and
// completed amounts.
// Others (date-based, such as curfew or exclusion) are assumed to have the same dates and amounts in
// every order, so the first one's details are used and the rest are not checked. If they ever differ,
// only the first one's dates are shown.
const mergeSameRequirement = (requirements: RequirementResponse[]): RequirementResponse => {
  const [first] = requirements
  if (requirements.length === 1) return first

  const lastUpdatedAt = requirements
    .map(requirement => requirement.lastUpdatedAt)
    .filter(Boolean)
    .sort()
    .pop()
  if (!getRequirementType(first.mainCategory?.code)?.countsProgress) return { ...first, lastUpdatedAt }

  return {
    ...first,
    required: total(requirements.map(requirement => requirement.required)),
    completed: total(requirements.map(cappedCompleted)),
    lastUpdatedAt,
  }
}

// Each requirement once, in the order it first appears.
export const mergeRequirements = (requirements: RequirementResponse[] = []): RequirementResponse[] => {
  const groups = new Map<string | RequirementResponse, RequirementResponse[]>()
  requirements.forEach(requirement => {
    const key = requirementKey(requirement) ?? requirement
    groups.set(key, [...(groups.get(key) ?? []), requirement])
  })
  return [...groups.values()].map(mergeSameRequirement)
}

// Someone can serve more than one order at once. Matching orders (see isSameOrder) are shown as one order,
// so this returns each order to show, in API order: the first of its matching orders, with their
// requirements merged.
export const groupOrders = (sentences: SentenceResponse[] = []): SentenceResponse[] => {
  const groups: SentenceResponse[][] = []
  sentences.forEach(sentence => {
    const group = groups.find(([first]) => isSameOrder(first, sentence))
    if (group) group.push(sentence)
    else groups.push([sentence])
  })
  return groups.map(group => ({
    ...group[0],
    requirements: mergeRequirements(group.flatMap(sentence => sentence.requirements ?? [])),
  }))
}

// All orders as one: the first order's details, with every order's requirements, each shown once. When
// the orders don't all match, each order's own details come from groupOrders instead.
export const combineSentences = (sentences: SentenceResponse[] = []): SentenceResponse | undefined => {
  const [first] = sentences
  return (
    first && { ...first, requirements: mergeRequirements(sentences.flatMap(sentence => sentence.requirements ?? [])) }
  )
}

// Someone on licence can also be on an order (never two licences). Their licence is then one of the
// items on the "Your probation" summary, with its own page at /your-probation/licence, and the licence
// condition pages sit under that page instead.
export const findLicence = (
  sentences: SentenceResponse[] = [],
): { licence?: SentenceResponse; withOrders: boolean } => {
  const licence = sentences.find(isLicenceSentence)
  return { licence, withOrders: Boolean(licence) && sentences.some(sentence => !isLicenceSentence(sentence)) }
}
