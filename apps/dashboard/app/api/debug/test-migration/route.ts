import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Endpoint de prueba para migrar usuarios SIN autenticación
 * SOLO PARA TESTING - NO USAR EN PRODUCCIÓN
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action = 'migrate' } = body

    if (action === 'migrate') {
      return await migrateExistingUsers()
    } else if (action === 'create-test-users') {
      return await createTestUsers()
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "migrate" or "create-test-users"' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error in test-migration endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Migra usuarios existentes de Clerk (simulado)
 */
async function migrateExistingUsers() {
  try {
    console.log('🔄 Starting user migration...')

    // Usuarios de ejemplo (simulando respuesta de Clerk API)
    const mockClerkUsers = [
      {
        id: 'user_demo_admin',
        email_addresses: [{ email_address: 'admin@leadcrm.com' }],
        first_name: 'Admin',
        last_name: 'LeadsCRM',
        image_url: null,
        created_at: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 días atrás
        updated_at: Date.now()
      },
      {
        id: 'user_demo_manager',
        email_addresses: [{ email_address: 'manager@leadcrm.com' }],
        first_name: 'Manager',
        last_name: 'Test',
        image_url: null,
        created_at: Date.now() - (15 * 24 * 60 * 60 * 1000), // 15 días atrás
        updated_at: Date.now()
      },
      {
        id: 'user_demo_user',
        email_addresses: [{ email_address: 'user@leadcrm.com' }],
        first_name: 'Usuario',
        last_name: 'Demo',
        image_url: null,
        created_at: Date.now() - (7 * 24 * 60 * 60 * 1000), // 7 días atrás
        updated_at: Date.now()
      }
    ]

    const migratedUsers: Record<string, unknown>[] = []
    const errors: { clerkId: string; error: string }[] = []

    for (const clerkUser of mockClerkUsers) {
      try {
        const primaryEmail = clerkUser.email_addresses[0]?.email_address
        if (!primaryEmail) {
          console.warn(`Skipping user ${clerkUser.id} - no primary email`)
          continue
        }

        // Verificar si el usuario ya existe
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, clerk_id')
          .eq('clerk_id', clerkUser.id)
          .single()

        if (existingUser) {
          console.log(`User ${clerkUser.id} already exists, skipping...`)
          continue
        }

        // Determinar rol basado en email
        let role = 'user'
        if (primaryEmail.includes('admin')) role = 'admin'
        else if (primaryEmail.includes('manager')) role = 'manager'

        // Crear usuario en Supabase
        const { data: newUser, error } = await supabase
          .from('users')
          .insert({
            clerk_id: clerkUser.id,
            email: primaryEmail,
            first_name: clerkUser.first_name,
            last_name: clerkUser.last_name,
            profile_image_url: clerkUser.image_url,
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
            created_at: new Date(clerkUser.created_at).toISOString(),
            last_login_at: new Date().toISOString()
          })
          .select()
          .single()

        if (error) {
          console.error(`Error creating user ${clerkUser.id}:`, error)
          errors.push({ clerkId: clerkUser.id, error: error.message })
        } else {
          console.log(`✅ Migrated user: ${primaryEmail} (${role})`)
          migratedUsers.push(newUser)
        }
      } catch (err) {
        console.error(`Error processing user ${clerkUser.id}:`, err)
        errors.push({ clerkId: clerkUser.id, error: 'Processing failed' })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration completed. ${migratedUsers.length} users migrated.`,
      migratedUsers: migratedUsers.length,
      errors: errors.length,
      users: migratedUsers.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        clerk_id: u.clerk_id
      })),
      errorDetails: errors
    })
  } catch (error) {
    console.error('Error in migrateExistingUsers:', error)
    throw error
  }
}

/**
 * Crea usuarios de prueba para testing
 */
async function createTestUsers() {
  try {
    console.log('🔄 Creating test users...')

    const testUsers = [
      {
        clerk_id: 'user_test_admin_123',
        email: 'admin@test.com',
        first_name: 'Admin',
        last_name: 'Test',
        role: 'admin'
      },
      {
        clerk_id: 'user_test_manager_456',
        email: 'manager@test.com',
        first_name: 'Manager',
        last_name: 'Test',
        role: 'manager'
      },
      {
        clerk_id: 'user_test_user_789',
        email: 'user@test.com',
        first_name: 'Usuario',
        last_name: 'Test',
        role: 'user'
      }
    ]

    const createdUsers: Record<string, unknown>[] = []

    for (const user of testUsers) {
      // Verificar si ya existe
      const { data: existingUser } = await supabase
        .from('users')
        .select('id, clerk_id')
        .eq('clerk_id', user.clerk_id)
        .single()

      if (existingUser) {
        console.log(`User ${user.clerk_id} already exists, skipping...`)
        continue
      }

      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          ...user,
          is_active: true,
          settings: {
            notifications: { email: true, push: true, whatsapp: true },
            preferences: { language: 'es', timezone: 'Europe/Madrid', dashboard_view: 'grid' }
          }
        })
        .select()
        .single()

      if (!error) {
        createdUsers.push(newUser)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Created ${createdUsers.length} test users`,
      users: createdUsers.map(u => ({
        id: u.id,
        email: u.email,
        role: u.role,
        clerk_id: u.clerk_id
      }))
    })
  } catch (error) {
    console.error('Error creating test users:', error)
    throw error
  }
}

// También permitir GET para info
export async function GET() {
  return NextResponse.json({
    message: 'Test migration endpoint',
    endpoints: {
      'POST /api/debug/test-migration': 'Migrate users',
      'actions': ['migrate', 'create-test-users']
    },
    usage: {
      migrate: 'POST with { "action": "migrate" }',
      createTest: 'POST with { "action": "create-test-users" }'
    }
  })
}
