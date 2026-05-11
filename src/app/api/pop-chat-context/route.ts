import { NextRequest, NextResponse } from 'next/server'
import { getStaticProfileForChatContext } from '@/lib/server/pop/staticData'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const crn = searchParams.get('crn')?.trim()

    if (!crn) {
      return NextResponse.json({ error: 'CRN is required' }, { status: 400 })
    }

    const chatContext = getStaticProfileForChatContext(crn)

    if (!chatContext) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    return NextResponse.json(chatContext)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
