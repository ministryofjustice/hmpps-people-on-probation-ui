import { getSentenceCategory, getSentenceTypeExplanationTemplate } from './sentenceCategories'

describe('getSentenceCategory', () => {
  it.each([
    ['327', 'standard-determinate'],
    ['324', 'extended-determinate'],
    ['303', 'life'],
    ['245', 'special-custodial'],
    ['340', 'community-order'],
    ['330', 'suspended-sentence-order'],
  ])('categorises disposal code %s as %s', (disposalCode, expected) => {
    expect(getSentenceCategory(disposalCode)).toEqual(expected)
  })

  it('ignores case and surrounding whitespace', () => {
    expect(getSentenceCategory(' ni1 ')).toEqual('life')
  })

  it.each([undefined, '', '406', 'UNKNOWN'])('returns undefined for %p', disposalCode => {
    expect(getSentenceCategory(disposalCode)).toBeUndefined()
  })
})

describe('getSentenceTypeExplanationTemplate', () => {
  it('returns the template for a category with an explanation', () => {
    expect(getSentenceTypeExplanationTemplate('327')).toEqual(
      'partials/sentence-type-explanations/standard-determinate.njk',
    )
  })

  it('returns undefined for a category without an explanation yet', () => {
    expect(getSentenceTypeExplanationTemplate('340')).toBeUndefined()
  })

  it('returns undefined for an uncategorised disposal code', () => {
    expect(getSentenceTypeExplanationTemplate('406')).toBeUndefined()
  })

  it('returns undefined when there is no disposal code', () => {
    expect(getSentenceTypeExplanationTemplate(undefined)).toBeUndefined()
  })
})
