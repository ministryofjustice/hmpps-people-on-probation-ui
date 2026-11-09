import type { Express } from 'express'
import request from 'supertest'
import { appWithAllRoutes } from './testutils/appSetup'
import config from '../config'

let app: Express

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const researchSections = [
  { path: '', title: 'Who is doing this research and why' },
  { path: '/what-happens', title: 'What will happen if you take part' },
  { path: '/how-to-participate', title: 'How to tell us if you want to take part' },
  { path: '/data-support', title: 'What happens with your data' },
]
const researchGuides = [
  { project: 'generic-feedback', guideTitle: 'Help us learn about [what]' },
  { project: 'feature-feedback', guideTitle: 'Help us make [what] better' },
]
const researchPages = researchGuides.flatMap(({ project, guideTitle }) =>
  researchSections.map((section, index) => ({
    url: `/research/${project}${section.path}`,
    guideTitle,
    title: section.title,
    otherSections: researchSections.filter(other => other !== section),
    previous: researchSections[index - 1],
    next: researchSections[index + 1],
    basePath: `/research/${project}`,
  })),
)

beforeEach(() => {
  app = appWithAllRoutes({})
})

describe('Research guidance', () => {
  const originalFlag = config.features.researchGuidance

  beforeEach(() => {
    config.features.researchGuidance = true
  })

  afterEach(() => {
    config.features.researchGuidance = originalFlag
  })

  describe.each(researchPages)('GET $url', page => {
    let html: string

    beforeEach(async () => {
      const response = await request(app).get(page.url).expect('Content-Type', /html/).expect(200)
      html = response.text
    })

    it('renders without authentication, with the guide and section titles', () => {
      expect(html).toContain(
        `<title>${page.title} – ${page.guideTitle} – Check your probation account – GOV.UK</title>`,
      )
      expect(html).toMatch(new RegExp(`<h1 class="govuk-heading-l">${escapeRegExp(page.guideTitle)}</h1>`))
      expect(html).toContain(`<h2 class="govuk-heading-m">${page.title}</h2>`)
    })

    it('lists the current section as text and links to the other sections', () => {
      const contents = /<nav class="pop-guide-contents"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? ''

      expect(contents).toContain(`<span aria-current="page">${page.title}</span>`)
      expect(Array.from(contents.matchAll(/href="([^"]+)"/g), match => match[1])).toEqual(
        page.otherSections.map(section => `${page.basePath}${section.path}`),
      )
    })

    it('links to the previous and next sections', () => {
      const previous = /govuk-pagination__prev">\s*<a [^>]*href="([^"]+)"/.exec(html)?.[1]
      const next = /govuk-pagination__next">\s*<a [^>]*href="([^"]+)"/.exec(html)?.[1]

      expect(previous).toBe(page.previous && `${page.basePath}${page.previous.path}`)
      expect(next).toBe(page.next && `${page.basePath}${page.next.path}`)
    })
  })

  it.each(['/research/unknown', '/research/generic-feedback/unknown', '/research/constructor'])(
    'returns 404 for %s',
    async url => {
      await request(app).get(url).expect(404)
    },
  )

  it('returns 404 when the feature is switched off', async () => {
    config.features.researchGuidance = false

    await request(app).get('/research/generic-feedback').expect(404)
  })
})

describe('GET /cookies', () => {
  it('should render the cookies page without authentication', async () => {
    const response = await request(app).get('/cookies').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('Cookies')
    expect(response.text).toContain('hmpps-people-on-probation-ui.app-session')
    expect(response.text).toContain('hmpps-people-on-probation-ui.session')
  })

  it('should display the session expiry duration from config', async () => {
    const response = await request(app).get('/cookies').expect(200)

    expect(response.text).toMatch(/after \d+ minutes of inactivity/)
  })
})

describe('GET /privacy', () => {
  it('should render the privacy page without authentication', async () => {
    const response = await request(app).get('/privacy').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('Privacy notice')
    expect(response.text).toContain('Probation Service')
  })

  it('should contain key privacy notice sections', async () => {
    const response = await request(app).get('/privacy').expect(200)

    expect(response.text).toContain('Purpose')
    expect(response.text).toContain('Types of personal data we process')
    expect(response.text).toContain('Complaints')
    expect(response.text).toContain('Information Commissioner')
  })
})

describe('GET /accessibility', () => {
  it('should render the accessibility statement page without authentication', async () => {
    const response = await request(app).get('/accessibility').expect('Content-Type', /html/).expect(200)

    expect(response.text).toContain('Accessibility statement for Check your probation account')
    expect(response.text).toContain('HM Prison and Probation Service')
  })

  it('should contain key accessibility statement sections', async () => {
    const response = await request(app).get('/accessibility').expect(200)

    expect(response.text).toContain('How accessible this website is')
    expect(response.text).toContain('Feedback and contact information')
    expect(response.text).toContain('Enforcement procedure')
    expect(response.text).toContain('Preparation of this accessibility statement')
    expect(response.text).toContain('probationaccounts@justice.gov.uk')
  })
})

describe('GET /autherror', () => {
  it('should render the auth error page with 403 without authentication', async () => {
    const response = await request(app).get('/autherror').expect('Content-Type', /html/).expect(403)

    expect(response.text).toContain('You cannot use this service')
    expect(response.text).toContain('You do not have permission to access this service.')
  })
})

describe('GET /invite-expired', () => {
  it('should render the invite expired page with 410 without authentication', async () => {
    const response = await request(app).get('/invite-expired').expect('Content-Type', /html/).expect(410)

    expect(response.text).toContain('Your invite has expired')
    expect(response.text).toContain('Contact your probation officer to ask them to send a new link.')
  })
})

describe('GET /sign-in-error', () => {
  it('should render the sign-in error page with 500 without authentication', async () => {
    const response = await request(app).get('/sign-in-error').expect('Content-Type', /html/).expect(500)

    expect(response.text).toContain('Sorry, we could not sign you in')
    expect(response.text).toContain('We could not sign you in using GOV.UK One Login.')
  })
})
