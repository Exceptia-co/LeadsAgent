import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@leadcrm/db'

// Force dynamic rendering for this route
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Initialize Prisma client
const prisma = new PrismaClient()

interface BulkUpdateRequest {
  leadIds: string[]
  whatsappAuthorized: boolean
}

export async function PATCH(request: NextRequest) {
  console.log('🚀 BULK UPDATE ENDPOINT CALLED')
  console.log('📍 Request URL:', request.url)
  console.log('🔧 Request method:', request.method)
  
  let prismaConnected = false
  
  try {
    console.log('📥 Attempting to parse request body...')
    
    // Parse the request body
    const body: BulkUpdateRequest = await request.json()
    console.log('✅ Request body parsed successfully')
    console.log('📦 Body content:', JSON.stringify(body, null, 2))
    
    // Test database connection first
    console.log('🗄️ Testing database connection...')
    await prisma.$connect()
    prismaConnected = true
    console.log('✅ Database connected successfully')
    
    console.log('Bulk updating WhatsApp authorization:', { 
      leadCount: body.leadIds?.length, 
      authorized: body.whatsappAuthorized 
    })
    
    // Validate required fields
    if (!body.leadIds || !Array.isArray(body.leadIds) || body.leadIds.length === 0) {
      return NextResponse.json(
        { error: 'leadIds array is required and cannot be empty' },
        { status: 400 }
      )
    }

    if (body.leadIds.length > 100) {
      return NextResponse.json(
        { error: 'Cannot update more than 100 leads at once' },
        { status: 400 }
      )
    }
    
    if (typeof body.whatsappAuthorized !== 'boolean') {
      return NextResponse.json(
        { error: 'whatsappAuthorized must be a boolean' },
        { status: 400 }
      )
    }

    // Validate that all IDs are strings
    const validIds = body.leadIds.filter(id => typeof id === 'string' && id.trim() !== '')
    if (validIds.length !== body.leadIds.length) {
      return NextResponse.json(
        { error: 'All lead IDs must be valid non-empty strings' },
        { status: 400 }
      )
    }
    
    // Perform the bulk update using Prisma
    const updateResult = await prisma.lead.updateMany({
      where: {
        id: {
          in: validIds
        }
      },
      data: {
        whatsappAuthorized: body.whatsappAuthorized,
        updatedAt: new Date()
      }
    })
    
    console.log('Successfully bulk updated leads:', { 
      updated: updateResult.count,
      requested: validIds.length
    })

    // Check if any leads were actually updated
    if (updateResult.count === 0) {
      return NextResponse.json(
        { 
          error: 'No leads were found with the provided IDs',
          updatedCount: 0,
          requestedCount: validIds.length
        },
        { status: 404 }
      )
    }

    // Fetch the updated leads to return current state
    const updatedLeads = await prisma.lead.findMany({
      where: {
        id: {
          in: validIds
        }
      },
      select: {
        id: true,
        name: true,
        phone: true,
        whatsappAuthorized: true,
        updatedAt: true
      }
    })
    
    return NextResponse.json({
      message: `${updateResult.count} lead${updateResult.count !== 1 ? 's' : ''} updated successfully`,
      updatedCount: updateResult.count,
      requestedCount: validIds.length,
      leads: updatedLeads
    })
    
  } catch (error) {
    console.error('Error in bulk update WhatsApp API:', error)
    
    // Provide more specific error messages for Prisma errors
    if (error instanceof Error) {
      // Prisma specific error handling
      if (error.message.includes('P2002')) {
        return NextResponse.json(
          { error: 'Database constraint violation' },
          { status: 400 }
        )
      }
      
      if (error.message.includes('P2025')) {
        return NextResponse.json(
          { error: 'One or more leads were not found' },
          { status: 404 }
        )
      }

      if (error.message.includes('P1001')) {
        return NextResponse.json(
          { error: 'Database connection failed. Please check your database configuration.' },
          { status: 503 }
        )
      }
    }
    
    return NextResponse.json(
      { error: 'Internal server error while updating leads' },
      { status: 500 }
    )
  } finally {
    // Ensure Prisma connection is closed
    await prisma.$disconnect()
  }
}
