import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/js/pdf.worker.min.mjs'

function clearContainer(container: HTMLElement): void {
  while (container.firstChild) container.removeChild(container.firstChild)
}

async function renderPage(container: HTMLElement, page: Awaited<ReturnType<pdfjsLib.PDFDocumentProxy['getPage']>>) {
  const viewport = page.getViewport({ scale: 1.5 })

  const canvas = document.createElement('canvas')
  canvas.className = 'pop-document-viewer__page'
  canvas.width = viewport.width
  canvas.height = viewport.height
  container.appendChild(canvas)

  const context = canvas.getContext('2d')
  if (!context) return

  await page.render({ canvasContext: context, viewport, canvas }).promise
}

// Renders every page of the PDF at `url` into `container` as a stack of <canvas> elements,
// view-only - there is no download/print affordance, and the source PDF is never exposed as
// a plain link the browser could navigate to directly. `url` may be same-origin (a server
// endpoint) or a presigned S3 URL, or a `blob:` URL created from a locally-selected File
// (used by the admin upload preview) - PDF.js fetches it the same way either way.
export default async function renderPdfIntoContainer(container: HTMLElement, url: string): Promise<void> {
  clearContainer(container)

  const pdf = await pdfjsLib.getDocument({ url }).promise

  const pageNumbers = Array.from({ length: pdf.numPages }, (_, index) => index + 1)
  for (const pageNumber of pageNumbers) {
    // eslint-disable-next-line no-await-in-loop -- pages must render in order, one at a time
    const page = await pdf.getPage(pageNumber)
    // eslint-disable-next-line no-await-in-loop -- pages must render in order, one at a time
    await renderPage(container, page)
  }
}
