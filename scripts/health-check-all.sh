#!/bin/bash
#
# health-check-all.sh - Verifica la salud de todos los servicios de LeadsCRM
#
# Uso:
#   ./scripts/health-check-all.sh                    # Usa URLs por defecto
#   ./scripts/health-check-all.sh tudominio.com      # Especifica dominio
#
# Codigos de salida:
#   0 - Todos los servicios OK
#   1 - Al menos un servicio fallo
#

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Dominio base (puede pasarse como argumento)
DOMAIN=${1:-"localhost"}

# URLs de los servicios
if [ "$DOMAIN" = "localhost" ]; then
    DASHBOARD_URL="http://localhost:3000"
    API_URL="http://localhost:3003/health"
    WHATSAPP_URL="http://localhost:3002/health"
else
    DASHBOARD_URL="https://$DOMAIN"
    API_URL="https://api.$DOMAIN/health"
    WHATSAPP_URL="https://whatsapp.$DOMAIN/health"
fi

# Timeout para cada request (segundos)
TIMEOUT=10

# Contador de errores
ERRORS=0

echo ""
echo "=========================================="
echo "   LeadsCRM - Health Check"
echo "=========================================="
echo ""
echo "Dominio: $DOMAIN"
echo "Fecha: $(date)"
echo ""

# Funcion para verificar un servicio
check_service() {
    local name=$1
    local url=$2
    local expected_code=${3:-200}
    
    printf "%-20s" "$name..."
    
    # Hacer request y capturar codigo HTTP
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$url" 2>/dev/null || echo "000")
    
    if [ "$HTTP_CODE" = "$expected_code" ]; then
        echo -e "${GREEN}OK${NC} (HTTP $HTTP_CODE)"
        return 0
    elif [ "$HTTP_CODE" = "000" ]; then
        echo -e "${RED}FAIL${NC} (Sin respuesta/Timeout)"
        return 1
    else
        echo -e "${YELLOW}WARN${NC} (HTTP $HTTP_CODE, esperado $expected_code)"
        return 1
    fi
}

# Verificar Dashboard
echo "--- Frontend ---"
if ! check_service "Dashboard" "$DASHBOARD_URL"; then
    ((ERRORS++))
fi

echo ""
echo "--- Backend ---"

# Verificar API
if ! check_service "API" "$API_URL"; then
    ((ERRORS++))
fi

# Verificar WhatsApp Service
if ! check_service "WhatsApp Service" "$WHATSAPP_URL"; then
    ((ERRORS++))
fi

echo ""
echo "=========================================="

# Resumen
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}Todos los servicios estan funcionando correctamente${NC}"
    echo "=========================================="
    exit 0
else
    echo -e "${RED}$ERRORS servicio(s) con problemas${NC}"
    echo "=========================================="
    exit 1
fi
