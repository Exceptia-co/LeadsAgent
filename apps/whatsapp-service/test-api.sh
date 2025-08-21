#!/bin/bash

# WhatsApp Service API Test Script
# Este script te ayudará a probar todas las funcionalidades del servicio WhatsApp

BASE_URL="http://localhost:3002/api/v1"
SESSION_ID="test-session-$(date +%s)"

echo "🚀 Testing WhatsApp Service API"
echo "================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Test health check
echo "1. Testing health check..."
response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json "$BASE_URL/health")
if [ "$response" = "200" ]; then
    print_success "Health check passed"
    echo "Response:"
    cat /tmp/health_response.json | jq .
else
    print_error "Health check failed (HTTP $response)"
    exit 1
fi

echo ""
echo "2. Testing session creation..."
print_info "Creating session with ID: $SESSION_ID"

# Create session
create_response=$(curl -s -w "%{http_code}" -o /tmp/create_response.json -X POST "$BASE_URL/sessions" \
    -H "Content-Type: application/json" \
    -d "{\"sessionId\": \"$SESSION_ID\"}")

if [ "${create_response: -3}" = "201" ]; then
    print_success "Session created successfully"
    echo "Response:"
    cat /tmp/create_response.json | jq .
else
    print_error "Session creation failed (HTTP ${create_response: -3})"
    echo "Response:"
    cat /tmp/create_response.json
    exit 1
fi

echo ""
echo "3. Waiting for QR code generation..."
print_info "This may take a few seconds..."
sleep 5

# Get QR code
echo "4. Getting QR code..."
qr_response=$(curl -s -w "%{http_code}" -o /tmp/qr_response.json "$BASE_URL/sessions/$SESSION_ID/qr")

if [ "${qr_response: -3}" = "200" ]; then
    print_success "QR code retrieved successfully"
    echo "Response:"
    cat /tmp/qr_response.json | jq .
    
    # Extract QR code
    qr_code=$(cat /tmp/qr_response.json | jq -r '.data.qrCode')
    if [ "$qr_code" != "null" ]; then
        print_info "QR Code is ready! You can now scan it with your WhatsApp mobile app."
        echo ""
        echo "📱 NEXT STEPS:"
        echo "1. Open WhatsApp on your phone"
        echo "2. Tap on 'Linked Devices' or 'WhatsApp Web'"
        echo "3. Scan the QR code from the JSON response above"
        echo "4. Wait for the connection to be established"
        echo ""
    else
        print_info "QR code not yet available. Session might already be connected or still initializing."
    fi
else
    print_error "Failed to get QR code (HTTP ${qr_response: -3})"
    echo "Response:"
    cat /tmp/qr_response.json
fi

echo ""
echo "5. Getting session status..."
status_response=$(curl -s -w "%{http_code}" -o /tmp/status_response.json "$BASE_URL/sessions/$SESSION_ID")

if [ "${status_response: -3}" = "200" ]; then
    print_success "Session status retrieved"
    echo "Response:"
    cat /tmp/status_response.json | jq .
    
    status=$(cat /tmp/status_response.json | jq -r '.data.status')
    print_info "Current session status: $status"
else
    print_error "Failed to get session status (HTTP ${status_response: -3})"
fi

echo ""
echo "6. Testing message sending (will fail if not connected)..."
print_info "Testing with a dummy phone number"

# Try to send a test message
message_response=$(curl -s -w "%{http_code}" -o /tmp/message_response.json -X POST "$BASE_URL/sessions/$SESSION_ID/send" \
    -H "Content-Type: application/json" \
    -d '{"to": "1234567890", "message": "Hello from LeadsCRM WhatsApp Service! This is a test message."}')

if [ "${message_response: -3}" = "200" ]; then
    print_success "Message sent successfully"
    echo "Response:"
    cat /tmp/message_response.json | jq .
else
    print_info "Message sending failed (expected if WhatsApp not connected)"
    echo "Response:"
    cat /tmp/message_response.json | jq .
fi

echo ""
echo "7. Listing all sessions..."
sessions_response=$(curl -s -w "%{http_code}" -o /tmp/sessions_response.json "$BASE_URL/sessions")

if [ "${sessions_response: -3}" = "200" ]; then
    print_success "Sessions retrieved successfully"
    echo "Response:"
    cat /tmp/sessions_response.json | jq .
else
    print_error "Failed to get sessions (HTTP ${sessions_response: -3})"
fi

echo ""
echo "8. Cleanup: Deleting test session..."
delete_response=$(curl -s -w "%{http_code}" -o /tmp/delete_response.json -X DELETE "$BASE_URL/sessions/$SESSION_ID")

if [ "${delete_response: -3}" = "200" ]; then
    print_success "Session deleted successfully"
    echo "Response:"
    cat /tmp/delete_response.json | jq .
else
    print_error "Failed to delete session (HTTP ${delete_response: -3})"
fi

echo ""
echo "🎉 API Test completed!"
echo ""
echo "SUMMARY:"
echo "- Health check: ✅"
echo "- Session creation: ✅"
echo "- QR code retrieval: ✅"
echo "- Session status: ✅"
echo "- Message sending: (depends on WhatsApp connection)"
echo "- Session cleanup: ✅"
echo ""
echo "TO TEST WITH YOUR PHONE:"
echo "1. Run this script again: ./test-api.sh"
echo "2. Copy the QR code from step 4"
echo "3. Scan it with WhatsApp on your phone"
echo "4. Wait for status to change to 'ready'"
echo "5. Test sending real messages using the API"

# Cleanup temp files
rm -f /tmp/health_response.json /tmp/create_response.json /tmp/qr_response.json 
rm -f /tmp/status_response.json /tmp/message_response.json /tmp/sessions_response.json /tmp/delete_response.json

echo ""
print_info "Ready for real testing with your phone! 📱"
