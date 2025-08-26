const http = require('http')

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3002,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    }

    const req = http.request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => body += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch (e) {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })

    req.on('error', reject)
    
    if (data) {
      req.write(JSON.stringify(data))
    }
    req.end()
  })
}

async function testRoutes() {
  console.log('🧪 Testing WhatsApp Service New Routes...\n')

  try {
    // Test 1: Health check
    console.log('✅ Test 1: Health check')
    const health = await makeRequest('GET', '/api/health')
    console.log(`   Status: ${health.status}`)
    console.log(`   Response:`, health.data)
    console.log()

    // Test 2: Get sessions health
    console.log('✅ Test 2: Get sessions health')
    const sessionsHealth = await makeRequest('GET', '/api/sessions/health')
    console.log(`   Status: ${sessionsHealth.status}`)
    console.log(`   Response:`, sessionsHealth.data)
    console.log()

    // Test 3: Get session stats
    console.log('✅ Test 3: Get session stats')
    const sessionStats = await makeRequest('GET', '/api/sessions/stats')
    console.log(`   Status: ${sessionStats.status}`)
    console.log(`   Response:`, sessionStats.data)
    console.log()

    // Test 4: Get enhanced sessions
    console.log('✅ Test 4: Get enhanced sessions')
    const enhancedSessions = await makeRequest('GET', '/api/sessions/enhanced')
    console.log(`   Status: ${enhancedSessions.status}`)
    console.log(`   Response:`, enhancedSessions.data)
    console.log()

    // Test 5: Create a new session
    console.log('✅ Test 5: Create a new session')
    const newSession = await makeRequest('POST', '/api/sessions', {
      sessionId: 'test-session-' + Date.now(),
      name: 'Test Persistence Session'
    })
    console.log(`   Status: ${newSession.status}`)
    console.log(`   Response:`, newSession.data)
    console.log()

    // Test 6: Get all sessions
    console.log('✅ Test 6: Get all sessions')
    const allSessions = await makeRequest('GET', '/api/sessions')
    console.log(`   Status: ${allSessions.status}`)
    console.log(`   Response:`, allSessions.data)
    console.log()

    // Test 7: Restore sessions
    console.log('✅ Test 7: Restore sessions')
    const restoreSessions = await makeRequest('POST', '/api/sessions/restore')
    console.log(`   Status: ${restoreSessions.status}`)
    console.log(`   Response:`, restoreSessions.data)
    console.log()

    console.log('✨ All route tests completed!')

  } catch (error) {
    console.error('❌ Test failed:', error.message)
  }
}

testRoutes().catch(console.error)
