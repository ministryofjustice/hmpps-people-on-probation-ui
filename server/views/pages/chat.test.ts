import path from 'path'
import nunjucks from 'nunjucks'

describe('Chat page banners', () => {
  const env = new nunjucks.Environment(
    new nunjucks.FileSystemLoader([path.join(__dirname, '..'), 'node_modules/govuk-frontend/dist']),
    { autoescape: true },
  )
  env.addFilter('assetMap', (url: string) => url)

  it.each([true, false])('renders one admin preview banner when feedback is enabled: %s', enabled => {
    const html = env.render('pages/chat.njk', {
      user: { previewedByAdmin: true, adminPreviewSubject: { personReference: 'X123456' } },
      feedbackBanner: { enabled },
      csrfToken: 'test-csrf-token',
    })

    expect(html.match(/id="govuk-notification-banner-title"/g)).toHaveLength(1)
    expect(html.match(/action="\/admin\/preview\/end"/g)).toHaveLength(1)
    expect(html).toContain('value="test-csrf-token"')
    expect(html).toContain('X123456')
    expect(html.includes('govuk-phase-banner')).toBe(enabled)
  })

  it('renders the beta banner without preview controls for a citizen', () => {
    const html = env.render('pages/chat.njk', { user: {}, feedbackBanner: { enabled: true } })

    expect(html.match(/class="govuk-phase-banner(?:\s|")/g)).toHaveLength(1)
    expect(html).not.toContain('/admin/preview/end')
    expect(html).toContain('class="govuk-main-wrapper"')
  })
})
