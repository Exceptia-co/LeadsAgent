import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getApiUrl } from '../../../../lib/api-config'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authentication token
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Parse the request body
    const body = await request.json()
    console.log('Updating lead:', params.id, 'with data:', { ...body, phone: body.phone ? '***' : undefined })
    
    // Forward the request to the backend service
    const backendUrl = `${getApiUrl()}/leads/${params.id}`
    const response = await fetch(backendUrl, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error(`Backend returned ${response.status}:`, errorData)
      
      return NextResponse.json(
        errorData,
        { status: response.status }
      )
    }
    
    const updatedLead = await response.json()
    console.log('Successfully updated lead:', { id: updatedLead.id, name: updatedLead.name })
    
    return NextResponse.json(updatedLead)
  } catch (error) {
    console.error('Error in update lead API:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { error: 'API service is not available. Please ensure the backend service is running on port 3001.' },
          { status: 503 }
        )
      }
      
      if (error.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Request timeout. The backend service is taking too long to respond.' },
          { status: 504 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authentication token
    const { getToken } = await auth()
    const token = await getToken()

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    console.log('Deleting lead:', params.id)
    
    // Forward the request to the backend service
    const backendUrl = `${getApiUrl()}/leads/${params.id}`
    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })
    
    if (!response.ok && response.status !== 204) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error(`Backend returned ${response.status}:`, errorData)
      
      return NextResponse.json(
        errorData,
        { status: response.status }
      )
    }
    
    console.log('Successfully deleted lead:', params.id)
    
    // Return 204 No Content for successful deletion
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('Error in delete lead API:', error)
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED')) {
        return NextResponse.json(
          { error: 'API service is not available. Please ensure the backend service is running on port 3001.' },
          { status: 503 }
        )
      }
      
      if (error.name === 'TimeoutError') {
        return NextResponse.json(
          { error: 'Request timeout. The backend service is taking too long to respond.' },
          { status: 504 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
