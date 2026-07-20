import type { AuthenticatedUserSession } from '../../auth/sessionStore'

export declare module 'express-session' {
  interface SessionData {
    returnTo: string
  }
}

export declare global {
  namespace Express {
    interface Request {
      id: string
      flash(type: string, message?: string | string[]): string[] | void
    }

    // Shape of the HMPPS Auth identity used only by the admin preview
    // sign-in flow (server/middleware/setUpAdminAuthentication.ts). Not the
    // citizen identity — see Locals.user below for that.
    interface User {
      token: string
      username: string
      authSource: string
    }

    interface Locals {
      user?: AuthenticatedUserSession
      // Set only under /admin routes by setUpAdminAuthentication.ts — the
      // signed-in admin's HMPPS Auth identity. Never used to derive a CRN or
      // gate any citizen-facing route.
      adminUser?: User
    }
  }
}
