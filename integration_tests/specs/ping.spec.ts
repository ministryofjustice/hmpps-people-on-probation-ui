import { expect, test } from '@playwright/test'

test('ping returns UP', async ({ request }) => {
  const response = await request.get('/ping')
  const payload = await response.json()
  expect(payload.status).toBe('UP')
})
