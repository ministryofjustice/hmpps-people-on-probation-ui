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

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    if (confirmButton) confirmButton.disabled = true

    if (!file) {
      previewContainer.textContent = ''
      return
    }

    previewObjectUrl = URL.createObjectURL(file)
    renderPdfIntoContainer(previewContainer, previewObjectUrl)
      .then(() => {
        if (confirmButton) confirmButton.disabled = false
      })
      .catch(() => {
        previewContainer.textContent = 'Sorry, this file could not be previewed. Choose a different PDF.'
      })
  })
}

// Matches the API's CreateDocumentRequest.name constraints exactly (@Size(max = 255) +
// @Pattern "^[A-Za-z0-9 _'.,:()/-]+$") - checking it here too is fast feedback before a
// round trip, not a substitute for the API's own validation.
const DOCUMENT_NAME_PATTERN = /^[A-Za-z0-9 _'.,:()/-]{1,255}$/

if (confirmButton && fileInput) {
  confirmButton.addEventListener('click', () => {
    const file = fileInput.files?.[0]
    const { crn } = confirmButton.dataset
    const nameInput = document.querySelector<HTMLInputElement>('#document-name')
    const name = nameInput?.value.trim()
    const typeSelect = document.querySelector<HTMLSelectElement>('#document-type')
    const documentType = typeSelect?.value
    const errorContainer = document.getElementById('document-upload-error')

    if (!file || !crn || !name || !documentType) return

    if (!DOCUMENT_NAME_PATTERN.test(name)) {
      if (errorContainer) {
        errorContainer.textContent =
          "Document name must only contain letters, numbers, spaces and the following: _ ' . , : ( ) / -"
      }
      return
    }

    confirmButton.disabled = true
    if (errorContainer) errorContainer.textContent = ''

    uploadDocument({ crn, name, documentType, file })
      .then(() => {
        window.location.href = '/admin/documents/upload/confirmed'
      })
      .catch(() => {
        confirmButton.disabled = false
        if (errorContainer) {
          errorContainer.textContent = 'Sorry, there was a problem uploading this document. Try again.'
        }
      })
  })
}
