import { NextRequest, NextResponse } from 'next/server'
import { getApiUrl } from '../../../../../lib/api-config'

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${getApiUrl()}/public/leads/stats`)
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error fetching lead stats from backend' },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in lead stats API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
