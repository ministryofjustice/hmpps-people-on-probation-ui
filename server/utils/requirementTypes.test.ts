import fs from 'fs'
import path from 'path'
import { REQUIREMENT_TYPES, explanationTemplate, getRequirementType, helpTemplate } from './requirementTypes'

describe('REQUIREMENT_TYPES', () => {
  it('has a template file for every type with an explanation', () => {
    REQUIREMENT_TYPES.filter(type => type.hasExplanation).forEach(type => {
      const file = path.join(__dirname, '../views', explanationTemplate(type) as string)
      expect(fs.existsSync(file)).toBe(true)
    })
  })

  it('has no template file for a type without an explanation', () => {
    REQUIREMENT_TYPES.filter(type => !type.hasExplanation).forEach(type => {
      const file = path.join(__dirname, '../views/partials/requirement-explanations', `${type.kind}.njk`)
      expect(fs.existsSync(file)).toBe(false)
    })
  })

  it('has a help template file for every type with help, and none for types without', () => {
    REQUIREMENT_TYPES.forEach(type => {
      const file = path.join(__dirname, '../views/partials/requirement-help', `${type.kind}.njk`)
      expect(fs.existsSync(file)).toBe(Boolean(type.hasHelp))
      if (type.hasHelp) expect(helpTemplate(type)).toBe(`partials/requirement-help/${type.kind}.njk`)
    })
  })

  it('maps each code to only one type', () => {
    const codes = REQUIREMENT_TYPES.flatMap(type => type.codes)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

describe('getRequirementType', () => {
  it.each([
    ['RM59', 'Wear a GPS tag'],
    ['T', 'Wear an alcohol tag'],
    ['RM49', 'Follow a curfew'],
    ['W', 'Community payback (unpaid work)'],
    ['F', 'Rehabilitation Activity Requirement (RAR)'],
    ['R', 'Things you are not allowed to do'],
    ['RM38', 'Programme requirement'],
    ['7', 'Programme requirement'],
    ['P', 'Address your mental health'],
    ['G', 'Address drug use'],
    ['H', 'Address alcohol use'],
    ['X', 'Areas or places you must not enter'],
    ['3', 'Address you must live in'],
  ])('labels %s as "%s"', (code, label) => {
    expect(getRequirementType(code)?.label).toBe(label)
  })

  it.each([undefined, '', 'Q', 'UNKNOWN'])('has no type for %p', code => {
    expect(getRequirementType(code)).toBeUndefined()
  })
})
