import { getSentenceCategory, getSentenceTypeExplanationTemplate } from './sentenceCategories'

describe('getSentenceCategory', () => {
  it.each([
    ['327', 'standard-determinate'],
    ['324', 'extended-determinate'],
    ['303', 'life'],
    ['245', 'special-custodial'],
    ['340', 'community-order'],
    ['330', 'suspended-sentence-order'],
  ])('categorises disposal code %s as %s', (typeCode, expected) => {
    expect(getSentenceCategory(typeCode)).toEqual(expected)
  })

  it('categorises OU23 (s.53(2) or s.250 detention) as standard determinate', () => {
    expect(getSentenceCategory('OU23')).toEqual('standard-determinate')
  })

  it('leaves OU22 uncategorised, as it covers both s.53(1) (indeterminate) and s.250 (determinate) detention', () => {
    expect(getSentenceCategory('OU22')).toBeUndefined()
    expect(getSentenceTypeExplanationTemplate('OU22', 'licence')).toBeUndefined()
  })

  it('ignores case and surrounding whitespace', () => {
    expect(getSentenceCategory(' ni1 ')).toEqual('life')
  })

  it.each([undefined, '', '406', 'UNKNOWN'])('returns undefined for %p', typeCode => {
    expect(getSentenceCategory(typeCode)).toBeUndefined()
  })
})

describe('getSentenceTypeExplanationTemplate', () => {
  it.each([
    ['327', 'standard-determinate'],
    ['324', 'extended-determinate'],
    ['308', 'life'],
    ['245', 'special-custodial'],
  ])('returns the licence page template for %s', (typeCode, category) => {
    expect(getSentenceTypeExplanationTemplate(typeCode, 'licence')).toEqual(
      `partials/sentence-type-explanations/${category}.njk`,
    )
  })

  it.each([
    ['340', 'community-order'],
    ['329', 'community-order'],
    ['341', 'suspended-sentence-order'],
    ['330', 'suspended-sentence-order'],
  ])('returns the requirements page template for %s', (typeCode, category) => {
    expect(getSentenceTypeExplanationTemplate(typeCode, 'order')).toEqual(
      `partials/sentence-type-explanations/${category}.njk`,
    )
  })

  it('keeps each page to its own categories', () => {
    expect(getSentenceTypeExplanationTemplate('340', 'licence')).toBeUndefined()
    expect(getSentenceTypeExplanationTemplate('327', 'order')).toBeUndefined()
  })

  it.each([['406'], [undefined]])('returns undefined for an uncategorised or missing code (%p)', typeCode => {
    expect(getSentenceTypeExplanationTemplate(typeCode, 'licence')).toBeUndefined()
    expect(getSentenceTypeExplanationTemplate(typeCode, 'order')).toBeUndefined()
  })
})
