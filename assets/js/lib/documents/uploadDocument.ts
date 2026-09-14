function getCsrfToken(): string {
  return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''
}

type PresignResponse = {
  s3Key: string
  uploadUrl: string
  contentType: string
}

type UploadDocumentParams = {
  crn: string
  name: string
  documentType: string
  file: File
}

// Orchestrates the single-continuous-screen upload sequence: presign -> PUT the file
// directly to S3 -> tell the API the upload succeeded. Nothing is persisted (in S3 or via
// the API) unless every step here succeeds - if the browser leaves before this resolves, at
// most an unreferenced S3 object is left behind, never a document record pointing at a
// missing/incomplete file.
export default async function uploadDocument({ crn, name, documentType, file }: UploadDocumentParams): Promise<void> {
  const csrfToken = getCsrfToken()

  const presignResponse = await fetch('/admin/documents/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crn, documentType, _csrf: csrfToken }),
  })
  if (!presignResponse.ok) throw new Error('Failed to request an upload URL')
  const { s3Key, uploadUrl, contentType } = (await presignResponse.json()) as PresignResponse

  // Must match exactly what was baked into the presigned URL's signature (see
  // DocumentStorageService.presignUpload on the API) - any other Content-Type value here
  // makes S3 reject the PUT with SignatureDoesNotMatch.
  const putResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!putResponse.ok) throw new Error('Failed to upload the file to storage')

  const confirmResponse = await fetch('/admin/documents/upload/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ crn, name, s3Key, documentType, _csrf: csrfToken }),
  })
  if (!confirmResponse.ok) throw new Error('Failed to save the document')
}
