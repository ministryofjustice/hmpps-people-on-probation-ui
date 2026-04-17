import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    build: {
      name: 'hmpps-people-on-probation-ui',
      framework: 'nextjs',
    },
  })
}
