import renderPdfIntoContainer from './lib/documents/pdfViewer'
import uploadDocument from './lib/documents/uploadDocument'

// Citizen (and admin re-check) view: the server has already resolved a presigned/same-origin
// URL and put it on the viewer container - render it immediately.
const viewContainer = document.querySelector<HTMLElement>('[data-document-view-url]')
if (viewContainer) {
  const url = viewContainer.dataset.documentViewUrl
  if (url) {
    renderPdfIntoContainer(viewContainer, url).catch(() => {
      viewContainer.textContent = 'Sorry, there was a problem loading this document.'
    })
  }
}

// Admin upload preview: nothing is uploaded yet - render straight from the locally-selected
// File object (via a blob: URL) so the admin can confirm it's the right document for the
// right person before anything leaves the browser.
const fileInput = document.querySelector<HTMLInputElement>('[data-document-upload-input]')
const previewContainer = document.querySelector<HTMLElement>('[data-document-upload-preview]')
const confirmButton = document.querySelector<HTMLButtonElement>('[data-document-upload-confirm]')

if (fileInput && previewContainer) {
  let previewObjectUrl: string | null = null
  // Bumped on every selection so a slow-to-render earlier file can't act (enable the confirm
  // button, or overwrite the preview with its own error) after a later selection has already
  // superseded it.
  let selectionToken = 0

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    selectionToken += 1
    const token = selectionToken
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    if (confirmButton) confirmButton.disabled = true

    if (!file) {
      previewContainer.textContent = ''
      return
    }

    previewObjectUrl = URL.createObjectURL(file)
    renderPdfIntoContainer(previewContainer, previewObjectUrl)
      .then(() => {
        if (token !== selectionToken) return
        if (confirmButton) confirmButton.disabled = false
      })
      .catch(() => {
        if (token !== selectionToken) return
        previewContainer.textContent = 'Sorry, this file could not be previewed. Choose a different PDF.'
      })
  })
}

// Matches the API's CreateDocumentRequest.name constraints exactly (@Size(max = 255) +
// @Pattern "^[A-Za-z0-9 _'.,:()/-]+$") - checking it here too is fast feedback before a
// round trip, not a substitute for the API's own validation.
const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9 _'.,:()/-]{1,255}$/

// Mirrors the markup the govukErrorSummary macro renders server-side (see
// document-upload.njk's other error rendering), so a client-side failure looks the same as a
// server-rendered one. Only ever called with our own hardcoded copy, never user input, so
// innerHTML here doesn't need escaping. Moves focus to the summary, matching GOV.UK's own
// error-summary.js behaviour on page load, so screen reader/keyboard users notice it.
function renderUploadError(container: HTMLElement, message: string, fieldId?: string): void {
  const item = fieldId ? `<a href="#${fieldId}">${message}</a>` : message
  // eslint-disable-next-line no-param-reassign -- mutating the passed container's innerHTML is the whole point of this helper
  container.innerHTML = `
    <div class="govuk-error-summary" data-module="govuk-error-summary">
      <div role="alert">
        <h2 class="govuk-error-summary__title">There is a problem</h2>
        <div class="govuk-error-summary__body">
          <ul class="govuk-list govuk-error-summary__list">
            <li>${item}</li>
          </ul>
        </div>
      </div>
    </div>
  `
  const summary = container.querySelector<HTMLElement>('.govuk-error-summary')
  summary?.setAttribute('tabindex', '-1')
  summary?.focus()
}

if (confirmButton && fileInput) {
  confirmButton.addEventListener('click', () => {
    const file = fileInput.files?.[0]
    const { crn } = confirmButton.dataset
    const nameInput = document.querySelector<HTMLInputElement>('#document-name')
    const name = nameInput?.value.trim()
    const typeSelect = document.querySelector<HTMLSelectElement>('#document-type')
    const documentType = typeSelect?.value
    const errorContainer = document.getElementById('document-upload-error')

    if (!file || !crn || !documentType) return

    if (!name) {
      if (errorContainer) {
        renderUploadError(errorContainer, 'Enter a document name', 'document-name')
      }
      return
    }

    if (!DOCUMENT_NAME_PATTERN.test(name)) {
      if (errorContainer) {
        renderUploadError(
          errorContainer,
          "Document name must only contain letters, numbers, spaces and the following: _ ' . , : ( ) / -",
          'document-name',
        )
      }
      return
    }

    confirmButton.disabled = true
    if (errorContainer) errorContainer.innerHTML = ''

    uploadDocument({ crn, name, documentType, file })
      .then(() => {
        window.location.href = '/admin/documents/upload/confirmed'
      })
      .catch(() => {
        confirmButton.disabled = false
        if (errorContainer) {
          renderUploadError(errorContainer, 'Sorry, there was a problem uploading this document. Try again.')
        }
      })
  })
}
