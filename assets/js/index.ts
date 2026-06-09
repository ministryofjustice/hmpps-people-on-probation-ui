import * as govukFrontend from 'govuk-frontend'
import * as mojFrontend from '@ministryofjustice/frontend'

govukFrontend.initAll()
mojFrontend.initAll()

const goalTabNav = document.querySelector<HTMLElement>('[data-module="pop-goal-tabs"]')
if (goalTabNav) {
  const tabLinks = goalTabNav.querySelectorAll<HTMLAnchorElement>('[data-tab-target]')
  const panels = document.querySelectorAll<HTMLElement>('#panel-current, #panel-future, #panel-achieved')
  const lastUpdatedBanner = document.getElementById('goals-last-updated')
  const achievedBanner = document.getElementById('goals-achieved-banner')
  const mobileHeading = document.getElementById('goals-mobile-heading')

  tabLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault()
      const targetId = link.dataset.tabTarget!
      const isAchieved = targetId === 'panel-achieved'

      panels.forEach(panel => {
        // eslint-disable-next-line no-param-reassign
        panel.hidden = panel.id !== targetId
      })

      tabLinks.forEach(l => {
        const isActive = l.dataset.tabTarget === targetId
        l.classList.toggle('moj-sub-navigation__link--active', isActive)
        if (isActive) {
          l.setAttribute('aria-current', 'page')
        } else {
          l.removeAttribute('aria-current')
        }
      })

      const targetPanel = document.getElementById(targetId)
      const panelHasGoals = !!targetPanel?.querySelector('.pop-goal-card')
      if (lastUpdatedBanner) lastUpdatedBanner.hidden = isAchieved || !panelHasGoals
      if (achievedBanner) achievedBanner.hidden = !isAchieved
      if (mobileHeading) mobileHeading.textContent = link.textContent?.trim() ?? ''

      window.history.replaceState(null, '', link.href)
    })
  })
}

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

document.querySelectorAll<HTMLElement>('.pop-timeout-warning').forEach(timeoutWarning => {
  const dialog = timeoutWarning.querySelector<HTMLElement>('.pop-timeout-warning__dialog')
  const staySignedInButton = timeoutWarning.querySelector<HTMLButtonElement>('.pop-timeout-warning__stay-signed-in')
  const countdown = timeoutWarning.querySelector<HTMLElement>('.pop-timeout-warning__countdown')
  const { warningAfterSeconds, countdownSeconds, keepAliveUrl, timeoutUrl } = timeoutWarning.dataset
  const warningAfterSecondsValue = Number(warningAfterSeconds)
  const countdownSecondsValue = Number(countdownSeconds)

  if (!dialog || !staySignedInButton || !countdown || !keepAliveUrl || !timeoutUrl) return
  if (
    !Number.isFinite(warningAfterSecondsValue) ||
    !Number.isFinite(countdownSecondsValue) ||
    countdownSecondsValue <= 0
  )
    return

  let warningTimer: number | undefined
  let countdownTimer: number | undefined
  let remainingSeconds = countdownSecondsValue
  let lastFocusedElement: HTMLElement | null = null

  const formatRemainingTime = (seconds: number) => {
    if (seconds < 60) {
      return seconds === 1 ? '1 second' : `${seconds} seconds`
    }
    const minutes = Math.ceil(seconds / 60)
    return minutes === 1 ? '1 minute' : `${minutes} minutes`
  }

  const clearTimers = () => {
    if (warningTimer) window.clearTimeout(warningTimer)
    if (countdownTimer) window.clearInterval(countdownTimer)
  }

  const redirectToTimeoutPage = () => {
    window.location.assign(timeoutUrl)
  }

  const startWarningTimer = () => {
    clearTimers()
    warningTimer = window.setTimeout(showWarning, warningAfterSecondsValue * 1000)
  }

  const getFocusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return
    const focusable = getFocusableElements()
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    } else if (document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const hideWarning = () => {
    timeoutWarning.setAttribute('hidden', '')
    if (countdownTimer) window.clearInterval(countdownTimer)
    countdownTimer = undefined
    document.removeEventListener('keydown', trapFocus)
    lastFocusedElement?.focus()
  }

  function showWarning() {
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    remainingSeconds = countdownSecondsValue
    countdown!.textContent = formatRemainingTime(remainingSeconds)
    timeoutWarning.removeAttribute('hidden')
    dialog!.focus()
    document.addEventListener('keydown', trapFocus)

    countdownTimer = window.setInterval(() => {
      remainingSeconds -= 1
      countdown!.textContent = formatRemainingTime(Math.max(remainingSeconds, 0))

      if (remainingSeconds <= 0) {
        clearTimers()
        redirectToTimeoutPage()
      }
    }, 1000)
  }

  staySignedInButton.addEventListener('click', async () => {
    staySignedInButton.disabled = true

    try {
      const response = await fetch(keepAliveUrl, { method: 'POST' })
      if (!response.ok) {
        redirectToTimeoutPage()
        return
      }

      hideWarning()
      startWarningTimer()
    } catch {
      redirectToTimeoutPage()
    } finally {
      staySignedInButton.disabled = false
    }
  })

  startWarningTimer()
})
