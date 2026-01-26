import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface MigratedUser {
  id: string
  email: string
  role: string
  clerk_id: string
  first_name?: string
  last_name?: string
  is_active?: boolean
  settings?: Record<string, unknown>
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Endpoint para obtener usuarios reales de Clerk y migrarlos a Supabase
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'list' } = body

    if (action === 'list') {
      return await listClerkUsers()
    } else if (action === 'migrate') {
      return await migrateRealClerkUsers()
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "list" or "migrate"' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error in real-clerk-migration endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Lista usuarios reales de Clerk
 */
async function listClerkUsers() {
  try {
    console.log('📋 Fetching real users from Clerk...')
    
    const response = await fetch('https://api.clerk.dev/v1/users', {
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Clerk API error: ${response.status} - ${errorText}`)
    }

    const clerkUsers = await response.json()
    console.log(`Found ${clerkUsers.length} users in Clerk`)

    // Formatear usuarios para mostrar información relevante
    const formattedUsers = clerkUsers.map((user: any) => ({
      id: user.id,
      email: user.email_addresses?.[0]?.email_address || 'No email',
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      createdAt: new Date(user.created_at).toISOString(),
      lastSignInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at).toISOString() : null,
      imageUrl: user.image_url || null,
      username: user.username || null
    }))

    return NextResponse.json({
      success: true,
      message: `Found ${clerkUsers.length} users in Clerk`,
      totalUsers: clerkUsers.length,
      users: formattedUsers
    })
  } catch (error) {
    console.error('Error fetching Clerk users:', error)
    throw error
  }
}

/**
 * Migra usuarios reales de Clerk a Supabase
 */
async function migrateRealClerkUsers() {
  try {
    console.log('🔄 Starting real Clerk user migration...')
    
    // Obtener usuarios de Clerk
    const response = await fetch('https://api.clerk.dev/v1/users', {
      headers: {
        'Authorization': `Bearer ${process.env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Clerk API error: ${response.status} - ${errorText}`)
    }

    const clerkUsers = await response.json()
    console.log(`Found ${clerkUsers.length} users in Clerk to migrate`)

    const migratedUsers: MigratedUser[] = []
    const errors: { clerkId: string; email?: string; error: string }[] = []
    const skippedUsers: { clerkId: string; email?: string; reason: string }[] = []

    for (const clerkUser of clerkUsers) {
      try {
        const primaryEmail = clerkUser.email_addresses?.[0]?.email_address
        if (!primaryEmail) {
          console.warn(`Skipping user ${clerkUser.id} - no primary email`)
          skippedUsers.push({ clerkId: clerkUser.id, reason: 'No primary email' })
          continue
        }

        // Verificar si el usuario ya existe en Supabase
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, clerk_id')
          .eq('clerk_id', clerkUser.id)
          .single()

        if (existingUser) {
          console.log(`User ${clerkUser.id} already exists in Supabase, skipping...`)
          skippedUsers.push({ 
            clerkId: clerkUser.id, 
            email: primaryEmail,
            reason: 'Already exists in Supabase' 
          })
          continue
        }

        // Determinar rol basado en email domain o username
        let role = 'user' // default role
        if (primaryEmail.includes('admin') || clerkUser.username?.includes('admin')) {
          role = 'admin'
        } else if (primaryEmail.includes('manager') || clerkUser.username?.includes('manager')) {
          role = 'manager'
        }

        // Crear usuario en Supabase con datos reales de Clerk
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            clerk_id: clerkUser.id,
            email: primaryEmail,
            first_name: clerkUser.first_name || null,
            last_name: clerkUser.last_name || null,
            profile_image_url: clerkUser.image_url || null,
            role: role,
            is_active: true,
            settings: {
              notifications: {
                email: true,
                push: true,
                whatsapp: true
              },
              preferences: {
                language: 'es',
                timezone: 'Europe/Madrid',
                dashboard_view: 'grid'
              }
            },
            // Usar fechas reales de Clerk
            created_at: new Date(clerkUser.created_at).toISOString(),
            last_login_at: clerkUser.last_sign_in_at ? new Date(clerkUser.last_sign_in_at).toISOString() : new Date().toISOString()
          })
          .select()
          .single()

        if (error) {
          console.error(`Error creating user ${clerkUser.id}:`, error)
          errors.push({
            clerkId: clerkUser.id,
            email: primaryEmail,
            error: error.message
          })
        } else if (newUser) {
          console.log(`✅ Migrated real user: ${primaryEmail} (${role}) - Clerk ID: ${clerkUser.id}`)
          migratedUsers.push(newUser as MigratedUser)
        }
      } catch (err) {
        console.error(`Error processing user ${clerkUser.id}:`, err)
        errors.push({ 
          clerkId: clerkUser.id, 
          error: err instanceof Error ? err.message : 'Processing failed' 
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Real Clerk migration completed. ${migratedUsers.length} users migrated, ${skippedUsers.length} skipped, ${errors.length} errors.`,
      migratedUsers: migratedUsers.length,
      skippedUsers: skippedUsers.length,
      errors: errors.length,
      users: migratedUsers.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        clerk_id: u.clerk_id,
        first_name: u.first_name,
        last_name: u.last_name
      })),
      skipped: skippedUsers,
      errorDetails: errors
    })
  } catch (error) {
    console.error('Error in migrateRealClerkUsers:', error)
    throw error
  }
}

// También permitir GET para info
export async function GET() {
  return NextResponse.json({
    message: 'Real Clerk migration endpoint',
    description: 'This endpoint fetches real users from your Clerk dashboard and migrates them to Supabase',
    endpoints: {
      'POST /api/debug/real-clerk-migration': 'List or migrate real Clerk users',
      'actions': ['list', 'migrate']
    },
    usage: {
      list: 'POST with { "action": "list" } - Shows users in Clerk without migrating',
      migrate: 'POST with { "action": "migrate" } - Migrates real Clerk users to Supabase'
    },
    warning: 'This endpoint uses real Clerk API credentials'
  })
}
