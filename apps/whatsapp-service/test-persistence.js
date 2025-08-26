const { PrismaClient } = require('@leadcrm/db')

async function testPersistence() {
  console.log('🧪 Testing WhatsApp Session Persistence...')
  
  const prisma = new PrismaClient()
  
  try {
    // Test 1: Create a test session
    console.log('✅ Test 1: Creating test session...')
    const testSession = await prisma.whatsAppSession.create({
      data: {
        sessionId: 'test-persistence-' + Date.now(),
        name: 'Test Persistence Session',
        status: 'connecting',
        lastSeen: new Date(),
        isActive: true,
        reconnectCount: 0,
        metadata: { test: true }
      }
    })
    console.log('📝 Created session:', testSession.sessionId)
    
    // Test 2: Load active sessions
    console.log('✅ Test 2: Loading active sessions...')
    const activeSessions = await prisma.whatsAppSession.findMany({
      where: { isActive: true }
    })
    console.log(`📊 Found ${activeSessions.length} active sessions`)
    
    // Test 3: Update session status
    console.log('✅ Test 3: Updating session status...')
    const updatedSession = await prisma.whatsAppSession.update({
      where: { sessionId: testSession.sessionId },
      data: { 
        status: 'ready',
        connectedNumber: '+1234567890@c.us',
        qrCode: null
      }
    })
    console.log('📱 Session updated to:', updatedSession.status)
    
    // Test 4: Get session statistics
    console.log('✅ Test 4: Getting session statistics...')
    const [total, active, connected] = await Promise.all([
      prisma.whatsAppSession.count(),
      prisma.whatsAppSession.count({ where: { isActive: true } }),
      prisma.whatsAppSession.count({ where: { status: 'ready' } })
    ])
    console.log(`📈 Stats - Total: ${total}, Active: ${active}, Connected: ${connected}`)
    
    // Test 5: Cleanup test session
    console.log('✅ Test 5: Cleaning up test session...')
    await prisma.whatsAppSession.delete({
      where: { sessionId: testSession.sessionId }
    })
    console.log('🧹 Test session cleaned up')
    
    console.log('✨ All persistence tests passed!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

testPersistence().catch(console.error)
