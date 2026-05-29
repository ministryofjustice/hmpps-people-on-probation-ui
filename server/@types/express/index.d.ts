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

    interface Locals {
      user?: AuthenticatedUserSession
    }
  }
}
