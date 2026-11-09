import { Router } from 'express'

import config from '../config'

type Section = {
  // Path after /research/<project>; '' is the guide's first page.
  slug: string
  title: string
  view: string
}

// Both guides share these sections. Each project keeps its own templates
// (server/views/pages/research-guidance/<project>/<view>.njk) so their
// content can differ.
const SECTIONS: ReadonlyArray<Section> = [
  { slug: '', title: 'Who is doing this research and why', view: 'overview' },
  { slug: 'what-happens', title: 'What will happen if you take part', view: 'what-happens' },
  { slug: 'how-to-participate', title: 'How to tell us if you want to take part', view: 'how-to-participate' },
  { slug: 'data-support', title: 'What happens with your data', view: 'data-support' },
]

const GUIDE_TITLES: Readonly<Record<string, string>> = {
  'generic-feedback': 'Help us learn about [what]',
  'feature-feedback': 'Help us make [what] better',
}

export default function researchRoutes(): Router {
  const router = Router()

  // Checked per request rather than when mounting, so tests can switch it.
  router.use((_req, _res, next) => (config.features.researchGuidance ? next() : next('router')))

  router.get('/:project{/:section}', (req, res, next) => {
    const { project, section = '' } = req.params
    const guideTitle = Object.hasOwn(GUIDE_TITLES, project) ? GUIDE_TITLES[project] : undefined
    const index = SECTIONS.findIndex(({ slug }) => slug === section)
    if (!guideTitle || index === -1) return next()

    const basePath = `/research/${project}`
    const hrefOf = ({ slug }: Section) => (slug ? `${basePath}/${slug}` : basePath)
    // govukPagination's previous/next shape.
    const toPaginationLink = (item?: Section) => item && { href: hrefOf(item), labelText: item.title }
    const current = SECTIONS[index]

    return res.render(`pages/research-guidance/${project}/${current.view}`, {
      guideTitle,
      sectionTitle: current.title,
      contents: SECTIONS.map(item => ({ href: hrefOf(item), text: item.title, current: item === current })),
      previous: toPaginationLink(SECTIONS[index - 1]),
      next: toPaginationLink(SECTIONS[index + 1]),
    })
  })

  return router
}
