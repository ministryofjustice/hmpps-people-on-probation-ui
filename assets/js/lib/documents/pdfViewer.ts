import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/js/pdf.worker.min.mjs'

function clearContainer(container: HTMLElement): void {
  while (container.firstChild) container.removeChild(container.firstChild)
}

async function renderPage(
  container: HTMLElement,
  page: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy['getPage']>>,
  signal: AbortSignal | undefined,
) {
  const viewport = page.getViewport({ scale: 1.5 })

  const canvas = document.createElement('canvas')
  canvas.className = 'pop-document-viewer__page'
  canvas.width = viewport.width
  canvas.height = viewport.height

  const context = canvas.getContext('2d')
  if (context) {
    await page.render({ canvasContext: context, viewport, canvas }).promise
  }

  // Bail before touching the DOM if a newer render (a second file selected before this one
  // finished) has superseded this one - otherwise both renders' pages can interleave into the
  // same container, which matters here since this screen's whole job is letting an admin
  // visually confirm the right document for the right person.
  if (signal?.aborted) return
  container.appendChild(canvas)

  // A <canvas> alone has no text in the accessibility tree, so without this a screen reader
  // gets an empty viewer and can't read the court order. This appends the page's real text,
  // in reading order, visually hidden alongside the canvas - a plain text fallback rather
  // than a positioned PDF.js text layer, since the latter's absolute-positioned overlay is
  // designed to sit over the official PDF.js viewer's own page chrome/CSS custom properties,
  // which this standalone canvas-only viewer doesn't provide.
  const textContent = await page.getTextContent()
  if (signal?.aborted) return

  const pageText = textContent.items.map(item => ('str' in item ? item.str + (item.hasEOL ? '\n' : '') : '')).join('')

  if (pageText.trim()) {
    const textElement = document.createElement('p')
    textElement.className = 'govuk-visually-hidden'
    textElement.textContent = pageText
    container.appendChild(textElement)
  }
}

// Renders every page of the PDF at `url` into `container` as a stack of <canvas> elements,
// view-only - there is no download/print affordance, and the source PDF is never exposed as
// a plain link the browser could navigate to directly. `url` may be same-origin (a server
// endpoint) or a presigned S3 URL, or a `blob:` URL created from a locally-selected File
// (used by the admin upload preview) - PDF.js fetches it the same way either way. `signal`
// lets a caller that might trigger overlapping renders (e.g. picking a second file before the
// first finished) cancel this one - checked before every appendChild.
export default async function renderPdfIntoContainer(
  container: HTMLElement,
  url: string,
  signal?: AbortSignal,
): Promise<void> {
  clearContainer(container)

  const pdf = await pdfjsLib.getDocument({ url }).promise
  if (signal?.aborted) return

  const pageNumbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1)
  for (const pageNumber of pageNumbers) {
    if (signal?.aborted) return
    // eslint-disable-next-line no-await-in-loop -- pages must render in order, one at a time
    const page = await pdf.getPage(pageNumber)
    if (signal?.aborted) return
    // eslint-disable-next-line no-await-in-loop -- pages must render in order, one at a time
    await renderPage(container, page, signal)
  }
}
