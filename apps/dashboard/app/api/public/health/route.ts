import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@leadcrm/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  let prisma: PrismaClient | null = null
  
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
    
    // Test de conexión a base de datos
    prisma = new PrismaClient()
    console.log('📊 Probando conexión a base de datos...')
    
    // Simple query para verificar conectividad
    await prisma.$queryRaw`SELECT 1 as test`
    
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
    
  } finally {
    if (prisma) {
      await prisma.$disconnect()
    }
  }
}
