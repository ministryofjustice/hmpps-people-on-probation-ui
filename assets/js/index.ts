import * as govukFrontend from 'govuk-frontend'
import * as mojFrontend from '@ministryofjustice/frontend'

govukFrontend.initAll()
mojFrontend.initAll()

document.querySelectorAll<HTMLElement>('.pop-progress__bar-area[data-percent]').forEach(el => {
  const pct = Math.min(100, Math.max(0, Number(el.dataset.percent)))
  if (Number.isFinite(pct)) el.style.setProperty('--pop-progress-pct', `${pct}%`)
})

const goalTabNav = document.querySelector<HTMLElement>('[data-module="pop-goal-tabs"]')
if (goalTabNav) {
  const tabLinks = goalTabNav.querySelectorAll<HTMLAnchorElement>('[data-tab-target]')
  const panels = document.querySelectorAll<HTMLElement>('#panel-current, #panel-future, #panel-achieved')
  const lastUpdatedBanner = document.getElementById('goals-last-updated')
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

document.addEventListener('click', (e: MouseEvent) => {
  const link = (e.target as Element).closest<HTMLAnchorElement>('a[href*="/appointments/calendar"]')
  if (!link) return
  e.preventDefault()

  const fallbackFilename = () => {
    const url = new URL(link.href)
    const title = url.searchParams.get('title') ?? 'appointment'
    const date = url.searchParams.get('date')
    const normalisedTitle =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'appointment'
    return `${normalisedTitle}${date ? `-${date}` : ''}.ics`
  }

  const filenameFromResponse = (res: Response) => {
    const contentDisposition = res.headers.get('content-disposition')
    return contentDisposition?.match(/filename="([^"]+)"/)?.[1] ?? fallbackFilename()
  }

  fetch(link.href)
    .then(res => {
      if (!res.ok) throw new Error('Calendar download failed')
      return res.text().then(icsText => ({ filename: filenameFromResponse(res), icsText }))
    })
    .then(({ filename, icsText }) => {
      const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' })
      const blobUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = blobUrl
      downloadLink.download = filename
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    })
    .catch(() => {
      window.location.href = link.href
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
  let sessionExpiresAt = 0
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
    const remaining = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000))
    countdown!.textContent = formatRemainingTime(remaining)
    timeoutWarning.removeAttribute('hidden')
    dialog!.focus()
    document.addEventListener('keydown', trapFocus)

    countdownTimer = window.setInterval(() => {
      const secs = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 1000))
      countdown!.textContent = formatRemainingTime(secs)

      if (secs <= 0) {
        clearTimers()
        redirectToTimeoutPage()
      }
    }, 1000)
  }

  const startWarningTimer = () => {
    clearTimers()
    sessionExpiresAt = Date.now() + (warningAfterSecondsValue + countdownSecondsValue) * 1000
    warningTimer = window.setTimeout(showWarning, warningAfterSecondsValue * 1000)
  }

  // When returning to the tab after being away, browsers may have frozen the timers.
  // Re-check time against the absolute expiry to catch up correctly.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return

    const now = Date.now()

    if (now >= sessionExpiresAt) {
      clearTimers()
      redirectToTimeoutPage()
      return
    }

    const warningShowsAt = sessionExpiresAt - countdownSecondsValue * 1000
    const warningIsShowing = !timeoutWarning.hasAttribute('hidden')

    if (now >= warningShowsAt) {
      if (warningIsShowing) {
        // Interval may have been throttled — update countdown immediately
        countdown!.textContent = formatRemainingTime(Math.ceil((sessionExpiresAt - now) / 1000))
      } else {
        clearTimers()
        showWarning()
      }
    } else if (!warningIsShowing) {
      // The warning timer may have been throttled while the tab was hidden.
      // Reschedule it with the correct remaining delay based on wall-clock time.
      if (warningTimer) window.clearTimeout(warningTimer)
      warningTimer = window.setTimeout(showWarning, warningShowsAt - now)
    }
  })

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
