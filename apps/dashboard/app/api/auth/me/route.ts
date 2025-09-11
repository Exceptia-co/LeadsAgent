import { NextRequest, NextResponse } from 'next/server'
import { getUnifiedUser, UnifiedAuthError } from '../../../../lib/auth/unified-auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getUnifiedUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      user,
      success: true
    })
  } catch (error) {
    console.error('Error in /api/auth/me:', error)

    if (error instanceof UnifiedAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
