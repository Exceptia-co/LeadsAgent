import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Lazy initialization to avoid build-time errors
let supabaseInstance: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
      throw new Error('Missing Supabase environment variables')
    }

    supabaseInstance = createClient(url, key)
  }
  return supabaseInstance
}

export async function GET(request: NextRequest) {
  try {
    console.log('🏥 Health check iniciado...')

    // Test básico de respuesta
    const healthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'leadcrm-dashboard',
      checks: {
        server: 'ok',
        database: 'checking...'
      }
    }

    // Test de conexión a base de datos usando Supabase
    console.log('📊 Probando conexión a base de datos...')

    const { error } = await getSupabase()
      .from('users')
      .select('id')
      .limit(1)

    if (error) {
      throw new Error(`Database query failed: ${error.message}`)
    }

    healthStatus.checks.database = 'ok'
    console.log('✅ Conexión a base de datos exitosa')

    return NextResponse.json(healthStatus, { status: 200 })

  } catch (error) {
    console.error('❌ Error en health check:', error)

    const healthStatus = {
      status: 'error',
      timestamp: new Date().toISOString(),
      service: 'leadcrm-dashboard',
      checks: {
        server: 'ok',
        database: 'error'
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    }

    return NextResponse.json(healthStatus, { status: 503 })
  }
}
