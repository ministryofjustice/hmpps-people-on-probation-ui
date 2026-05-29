import * as govukFrontend from 'govuk-frontend'
import * as mojFrontend from '@ministryofjustice/frontend'

govukFrontend.initAll()
mojFrontend.initAll()

document.querySelectorAll<HTMLElement>('.pop-show-details').forEach(wrapper => {
  const btn = wrapper.querySelector<HTMLButtonElement>('.pop-show-details__btn')
  const masked = wrapper.querySelector<HTMLElement>('.pop-show-details__masked')
  const revealed = wrapper.querySelector<HTMLElement>('.pop-show-details__revealed')
  if (!btn || !masked || !revealed) return
  btn.addEventListener('click', () => {
    const isExpanded = btn.getAttribute('aria-expanded') === 'true'
    btn.setAttribute('aria-expanded', String(!isExpanded))
    btn.textContent = isExpanded ? (btn.dataset.showText ?? 'Show details') : (btn.dataset.hideText ?? 'Hide details')
    masked.hidden = !isExpanded
    revealed.hidden = isExpanded
  })
})
