import { NextRequest, NextResponse } from 'next/server'

async function fetchWithRetry(url: string, retries: number = 3, delay: number = 1000): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json'
        },
        // Add timeout
        signal: AbortSignal.timeout(10000) // 10 second timeout
      })
      return response
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed for ${url}:`, error)
      
      // If this is the last retry, throw the error
      if (i === retries - 1) {
        throw error
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('All retry attempts failed')
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams
    
    // Construir la URL del backend con los parámetros de búsqueda
    const backendUrl = new URL('http://127.0.0.1:3001/public/leads') // Use 127.0.0.1 instead of localhost
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.set(key, value)
    })

    console.log('Fetching leads from:', backendUrl.toString())
    const response = await fetchWithRetry(backendUrl.toString())
    
    if (!response.ok) {
      console.error(`Backend returned ${response.status}: ${response.statusText}`)
      return NextResponse.json(
        { error: `Backend error: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    console.log('Successfully fetched leads:', data.meta || { total: data.data?.length || 0 })
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in leads API:', error)
    
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
