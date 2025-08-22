import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const searchParams = url.searchParams
    
    // Construir la URL del backend con los parámetros de búsqueda
    const backendUrl = new URL('http://localhost:3002/api/stats')
    searchParams.forEach((value, key) => {
      backendUrl.searchParams.set(key, value)
    })

    const response = await fetch(backendUrl.toString())
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error fetching stats from backend' },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error in stats API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
