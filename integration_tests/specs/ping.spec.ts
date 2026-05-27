import { expect, test } from '@playwright/test'

test('ping returns UP', async ({ page }) => {
  const response = await page.request.get('/ping')
  const payload = await response.json()
  expect(payload.status).toBe('UP')
})
