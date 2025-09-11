# Coding Guidelines - LeadsCRM

Esta documentación define las reglas y convenciones de código para el proyecto LeadsCRM.

## Estilo y Consistencia

### TypeScript
- **Usar TypeScript** en todos los proyectos (frontend, backend, servicios).
- **Variables y funciones**: `camelCase`
- **Clases y componentes**: `PascalCase`
- **Archivos**: `kebab-case.ts` o `PascalCase.tsx` (componentes React)
- **Constantes**: `UPPER_SNAKE_CASE`
- **Interfaces**: Prefijo `I` opcional, preferir `type` para unions
- **Enums**: `PascalCase` para el nombre, `UPPER_SNAKE_CASE` para valores

### Estructura de Archivos
```
src/
├── components/     # Componentes React
├── pages/         # Páginas de Next.js (App Router)
├── lib/           # Utilidades y helpers
├── hooks/         # Custom React hooks
├── types/         # Definiciones de tipos TypeScript
├── styles/        # Archivos CSS/SCSS
└── __tests__/     # Tests unitarios
```

### Funciones
- Mantener funciones **pequeñas y de una sola responsabilidad**
- Usar **arrow functions** para funciones inline
- Usar **function declarations** para funciones principales
- **Documentar** funciones complejas con JSDoc

```typescript
/**
 * Classifies a lead message using AI
 * @param message - The message content to classify
 * @param context - Previous conversation context
 * @returns Promise with classification result
 */
async function classifyMessage(
  message: string, 
  context: ConversationContext
): Promise<ClassificationResult> {
  // Implementation
}
```

## Arquitectura

### Separación de Capas
- **Frontend**: UI, Views, State Management
- **Backend**: Controllers, Services, Repositories  
- **Database**: Prisma schema como única fuente de verdad

### Módulos Backend (NestJS)
```
src/
├── auth/          # Autenticación y autorización
├── leads/         # Gestión de leads
├── messaging/     # Procesamiento de mensajes
├── ai/           # Servicios de IA
├── common/       # DTOs, guards, interceptors
└── config/       # Configuración global
```

### Componentes Frontend
- **Reutilizar componentes** del paquete `@leadcrm/ui`
- **Props tipadas** con TypeScript
- **Children como prop** cuando sea apropiado
- **Composition over inheritance**

## Seguridad

### Variables de Entorno
```typescript
// ❌ No hacer
const apiKey = "sk-1234567890abcdef"

// ✅ Hacer
const apiKey = process.env.OPENAI_API_KEY
if (!apiKey) throw new Error('Missing OPENAI_API_KEY')
```

### Validación de Inputs
```typescript
// Backend - usar class-validator
export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsPhoneNumber()
  phone: string;
}

// Frontend - validar antes de enviar
const createLead = async (data: CreateLeadRequest) => {
  if (!data.phone?.trim()) {
    throw new Error('Phone is required')
  }
  // Send to API
}
```

### Manejo de Errores
```typescript
// ✅ Backend - manejo estructurado
try {
  const result = await this.aiService.classify(message)
  return { success: true, data: result }
} catch (error) {
  this.logger.error('AI classification failed', error)
  return { success: false, error: 'Classification failed' }
}

// ✅ Frontend - error boundaries
<ErrorBoundary fallback={<ErrorFallback />}>
  <LeadsList />
</ErrorBoundary>
```

## Testing

### Estructura de Tests
```
src/
├── components/
│   ├── LeadCard.tsx
│   └── __tests__/
│       └── LeadCard.test.tsx
└── services/
    ├── ai.service.ts
    └── __tests__/
        └── ai.service.spec.ts
```

### Convenciones de Testing
- **Archivos de test**: `.spec.ts` (backend), `.test.tsx` (frontend)
- **Describe blocks**: Describir la unidad bajo prueba
- **Test names**: Describir el comportamiento esperado
- **Setup/Teardown**: Usar `beforeEach`/`afterEach` cuando sea necesario

```typescript
describe('AIService', () => {
  let service: AIService

  beforeEach(() => {
    service = new AIService(mockOpenAI)
  })

  describe('classifyMessage', () => {
    it('should return HOT classification for sales inquiry', async () => {
      const message = 'I want to buy your product'
      const result = await service.classifyMessage(message)
      
      expect(result.classification).toBe('HOT')
      expect(result.score).toBeGreaterThan(0.7)
    })
  })
})
```

## Git Workflow

### Branch Naming
- `feature/descripcion-corta` - Nuevas funcionalidades
- `fix/issue-number` - Corrección de bugs  
- `hotfix/critical-issue` - Fixes críticos para producción
- `refactor/component-name` - Refactoring de código

### Conventional Commits
```bash
# Estructura
type(scope): description

# Ejemplos
feat(leads): add AI classification for incoming messages
fix(whatsapp): resolve session timeout issue  
docs(api): update endpoint documentation
test(messaging): add unit tests for message processing
```

### Pull Requests
- **Título descriptivo** siguiendo conventional commits
- **Descripción clara** del cambio realizado
- **Tests** incluidos para nuevas funcionalidades
- **Screenshots** para cambios de UI
- **Breaking changes** documentados

## Performance

### Base de Datos
```typescript
// ✅ Consultas optimizadas
const leads = await prisma.lead.findMany({
  select: { id: true, name: true, phone: true, status: true }, // Solo campos necesarios
  where: { status: 'NEW' },
  take: 20, // Paginación
  orderBy: { createdAt: 'desc' }
})

// ❌ Evitar N+1 queries
const conversations = await prisma.conversation.findMany({
  include: { messages: true } // Usar include para relaciones
})
```

### Frontend
```typescript
// ✅ Lazy loading de componentes
const LeadDetail = lazy(() => import('./LeadDetail'))

// ✅ Memoización cuando sea necesario
const expensiveCalculation = useMemo(() => {
  return leads.reduce((acc, lead) => acc + lead.score, 0)
}, [leads])

// ✅ Debounce para búsquedas
const debouncedSearch = useDebouncedCallback(
  (term: string) => setSearchTerm(term),
  300
)
```

## Documentación

### JSDoc para Funciones Complejas
```typescript
/**
 * Processes WhatsApp webhook payload and creates/updates lead
 * @param payload - WhatsApp webhook payload
 * @param signature - Webhook signature for verification  
 * @returns Promise resolving to processing result
 * @throws {ValidationError} When payload is invalid
 * @throws {SignatureError} When signature verification fails
 */
export async function processWhatsAppMessage(
  payload: WhatsAppWebhookPayload,
  signature: string
): Promise<ProcessingResult>
```

### README por Módulo
Cada módulo importante debe tener un README explicando:
- Propósito del módulo
- APIs principales
- Ejemplos de uso
- Configuración requerida

## Herramientas de Desarrollo

### ESLint + Prettier
- Configuración compartida en `@leadcrm/config-eslint`
- **Auto-fix** en save habilitado en VSCode
- **Pre-commit hooks** para validar código

### Scripts Útiles
```bash
# Desarrollo
pnpm dev              # Todos los servicios
pnpm dev:dashboard    # Solo frontend  
pnpm dev:api         # Solo backend

# Calidad de código
pnpm lint            # Lint todos los paquetes
pnpm typecheck       # Verificar tipos TypeScript
pnpm test:coverage   # Tests con coverage

# Base de datos
pnpm db:studio       # Interfaz visual Prisma
pnpm db:migrate:dev  # Ejecutar migraciones
```

¡Estas guidelines aseguran código consistente, mantenible y de alta calidad en todo el proyecto LeadsCRM!
