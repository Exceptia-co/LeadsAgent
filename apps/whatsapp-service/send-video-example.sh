#!/bin/bash

# 🎥 SCRIPT DE EJEMPLO - ENVÍO DE VIDEO POR WHATSAPP
# =================================================

echo "🎥 Enviando video por WhatsApp..."

# Configuración
SESSION_ID="multimedia-session"
PHONE_NUMBER="+34630803461"
SERVER_URL="http://localhost:3003"

# Ruta al archivo de video (CAMBIAR POR TU VIDEO REAL)
VIDEO_PATH="$PWD/mi-video.mp4"  # <-- Aquí pones la ruta de tu video

# Verificar que el video existe
if [ ! -f "$VIDEO_PATH" ]; then
    echo "❌ Error: No se encuentra el video en: $VIDEO_PATH"
    echo "💡 Para usar este script:"
    echo "   1. Coloca un archivo de video (.mp4, .mov, .avi) en este directorio"
    echo "   2. Renómbralo a 'mi-video.mp4' o cambia la variable VIDEO_PATH"
    echo "   3. Ejecuta: bash send-video-example.sh"
    exit 1
fi

# Verificar tamaño del video
VIDEO_SIZE=$(stat -f%z "$VIDEO_PATH" 2>/dev/null || stat -c%s "$VIDEO_PATH" 2>/dev/null)
MAX_SIZE=$((16 * 1024 * 1024))  # 16MB en bytes

if [ "$VIDEO_SIZE" -gt "$MAX_SIZE" ]; then
    echo "⚠️  Advertencia: El video es muy grande ($(($VIDEO_SIZE / 1024 / 1024))MB)"
    echo "   WhatsApp tiene un límite de ~16MB para videos"
    echo "   Recomendación: Comprimir el video antes de enviar"
fi

# Enviar el video
echo "📤 Enviando video de $(($VIDEO_SIZE / 1024))KB..."

response=$(curl -s -X POST "${SERVER_URL}/sessions/${SESSION_ID}/send-media" \
  -H "Content-Type: application/json" \
  -d "{
    \"to\": \"$PHONE_NUMBER\",
    \"mediaPath\": \"$VIDEO_PATH\",
    \"caption\": \"🎬 Video enviado automáticamente desde LeadsCRM\\n\\n📹 Archivo: $(basename "$VIDEO_PATH")\\n📏 Tamaño: $(($VIDEO_SIZE / 1024))KB\\n⚡ Enviado via API REST\\n\\n🚀 Sistema multimedia 100% funcional!\"
  }")

# Verificar resultado
if echo "$response" | grep -q '"success":true'; then
    message_id=$(echo "$response" | grep -o '"messageId":"[^"]*"' | cut -d'"' -f4)
    echo "✅ Video enviado exitosamente!"
    echo "📱 ID del mensaje: $message_id"
    echo "🎯 Enviado a: $PHONE_NUMBER"
else
    echo "❌ Error enviando el video:"
    echo "$response" | jq '.' 2>/dev/null || echo "$response"
fi

echo ""
echo "🎥 FORMATOS DE VIDEO SOPORTADOS:"
echo "   • MP4 (recomendado)"
echo "   • MOV (Apple)"  
echo "   • AVI"
echo "   • 3GP"
echo ""
echo "📏 LÍMITES WHATSAPP:"
echo "   • Tamaño máximo: ~16MB"
echo "   • Resolución: Hasta 1080p"
echo "   • Duración: Hasta 3 minutos"
echo ""
echo "💡 Para comprimir videos grandes:"
echo "   ffmpeg -i input.mp4 -vcodec h264 -acodec mp2 output.mp4"
