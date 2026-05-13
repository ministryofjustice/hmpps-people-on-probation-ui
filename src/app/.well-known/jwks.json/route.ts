import { NextResponse } from 'next/server'
import { getOneLoginPublicJwk } from '../../../lib/server/auth/oneLoginKeys'

export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json({
    keys: [getOneLoginPublicJwk()],
  })
}
