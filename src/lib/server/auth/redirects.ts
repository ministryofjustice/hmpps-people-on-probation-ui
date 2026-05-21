import 'server-only'

import { nextServerConfig } from '../config'

export function getApplicationRedirectUrl(path: string) {
  return new URL(path, nextServerConfig.ingressUrl)
}
