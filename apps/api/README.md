# LeadsCRM API Backend

Backend API completo para el sistema LeadsCRM construido con NestJS, TypeScript y Prisma. Proporciona endpoints REST para gestión de leads, WhatsApp y autenticación.

**Estado Actual:** ✅ **100% Operativo - 0 errores TypeScript**

## 🚀 Stack Tecnológico

- **Framework**: NestJS 10+ con TypeScript strict
- **Base de Datos**: PostgreSQL con Prisma ORM
- **Autenticación**: Clerk JWT + Guards personalizados
- **Validación**: class-validator + DTOs tipados
- **Documentación**: Swagger/OpenAPI automática
- **Testing**: Jest + Supertest (E2E)
- **Deployment**: Puerto 3003 (development/production)

## 📂 Estructura del Proyecto

```
apps/api/
├── src/
│   ├── app.module.ts           # Módulo raíz con imports
│   ├── app.controller.ts       # Controller principal
│   ├── app.service.ts          # Service principal
│   ├── main.ts                # Bootstrap de la aplicación
│   ├── auth/                  # 🔐 Módulo de autenticación
│   │   ├── auth.module.ts     # Configuración Clerk
│   │   ├── auth.guard.ts      # Guard JWT para proteger rutas
│   │   └── auth.service.ts    # Servicios de autenticación
│   ├── leads/                 # 📊 Gestión de leads
│   │   ├── leads.module.ts    # Módulo leads
│   │   ├── leads.controller.ts # Endpoints de leads
│   │   ├── leads.service.ts   # Lógica de negocio
│   │   ├── public-leads.controller.ts # Endpoints públicos
│   │   └── dto/              # DTOs tipados
│   │       ├── create-lead.dto.ts
│   │       └── update-lead.dto.ts
│   ├── whatsapp/             # 💬 Integración WhatsApp
│   │   ├── whatsapp.module.ts
│   │   ├── whatsapp.controller.ts
│   │   ├── whatsapp.service.ts
│   │   └── automation.service.ts # IA automation
│   ├── prisma/               # 🗄️ Configuración Prisma
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   └── common/               # Utilidades compartidas
│       ├── decorators/
│       ├── filters/
│       └── interceptors/
├── test/                     # Tests E2E
├── dist/                     # Build output
└── package.json             # Dependencias y scripts
```

## 📦 Instalación y Setup

```bash
# Desde el directorio raíz del monorepo
pnpm install

# Generar cliente Prisma
pnpm db:generate

# Ejecutar migraciones de desarrollo
pnpm db:migrate:dev

# (Opcional) Seed de datos de prueba
pnpm db:seed
```

## 🔥 Desarrollo Local

```bash
# Desde la raíz del monorepo
pnpm dev:api

# O desde este directorio
cd apps/api
pnpm dev

# API disponible en http://localhost:3003
```

### Scripts Disponibles
```bash
pnpm dev              # Modo desarrollo con hot reload
pnpm build            # Build de producción
pnpm start            # Ejecutar build de producción
pnpm test             # Tests unitarios (Jest)
pnpm test:e2e         # Tests de integración
pnpm test:watch       # Tests en modo watch
pnpm lint             # ESLint
pnpm type-check       # TypeScript check
```

## 🌐 Endpoints API

### Autenticación
**Nota**: Todos los endpoints excepto `/health` y `/api/webhooks/*` requieren JWT token de Clerk.

### Módulo de Leads
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/leads` | Lista paginada de leads | ✅ |
| `POST` | `/api/leads` | Crear nuevo lead | ✅ |
| `GET` | `/api/leads/:id` | Obtener lead por ID | ✅ |
| `PATCH` | `/api/leads/:id` | Actualizar lead | ✅ |
| `DELETE` | `/api/leads/:id` | Eliminar lead | ✅ |
| `GET` | `/api/leads/stats` | Estadísticas de leads | ✅ |
| `PATCH` | `/api/leads/:id/status` | Cambiar estado del lead | ✅ |

### Endpoints Públicos (Testing)
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `GET` | `/api/public/leads` | Lista pública de leads | ❌ |
| `POST` | `/api/public/leads` | Crear lead (público) | ❌ |
| `PATCH` | `/api/public/leads/:id/whatsapp` | Toggle WhatsApp auth | ❌ |

### Módulo WhatsApp
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `POST` | `/api/whatsapp/webhook` | Webhook de mensajes | ❌ |
| `POST` | `/api/whatsapp/send` | Enviar mensaje | ✅ |
| `GET` | `/api/whatsapp/conversations` | Lista conversaciones | ✅ |

### Sistema
| Método | Endpoint | Descripción | Auth |
|--------|----------|-------------|------|
| `GET` | `/health` | Health check | ❌ |
| `GET` | `/api/docs` | Documentación Swagger | ❌ |

## 📊 Modelo de Datos

### Entidades Principales

#### Lead
```typescript
interface Lead {
  id: string                    // UUID
  name?: string                 // Nombre del contacto
  email?: string                // Email (opcional)
  phone: string                 // Teléfono único
  status: LeadStatus            // NUEVO | CONTACTADO | QUALIFIED | GANADO | PERDIDO
  source?: string               // Fuente del lead
  tags?: Json                   // Tags personalizadas
  whatsappAuthorized?: boolean  // Autorización WhatsApp IA
  moodScore?: Decimal           // Score de ánimo (IA)
  lastContact?: DateTime        // Último contacto
  assignedTo?: string           // Usuario asignado
  createdAt: DateTime
  updatedAt: DateTime
  messages: Message[]           // Relación con mensajes
}
```

#### Message
```typescript
interface Message {
  id: string
  leadId: string                // FK a Lead
  content: string               // Contenido del mensaje
  direction: MessageDirection   // INBOUND | OUTBOUND
  messageType: MessageType      // TEXT | IMAGE | AUDIO | VIDEO | DOCUMENT
  status: MessageStatus         // PENDING | SENT | DELIVERED | READ | FAILED
  sessionId?: string            // Sesión WhatsApp
  whatsappMessageId?: string    // ID del mensaje en WhatsApp
  metadata?: Json               // Metadatos adicionales
  createdAt: DateTime
  updatedAt: DateTime
}
```

### Enums en Español
```typescript
enum LeadStatus {
  NUEVO = 'new',
  CONTACTADO = 'contacted',
  QUALIFIED = 'qualified',
  GANADO = 'won',
  PERDIDO = 'lost'
}

enum MessageDirection {
  INBOUND = 'incoming',
  OUTBOUND = 'outgoing'
}

enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document'
}
```

## 🔐 Autenticación y Seguridad

### Clerk Integration
```typescript
// auth.guard.ts - Protección de rutas
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = this.extractTokenFromHeader(request)
    
    if (!token) throw new UnauthorizedException()
    
    // Verificar JWT con Clerk
    const payload = await this.clerkService.verifyToken(token)
    request.user = payload
    return true
  }
}
```

### CORS Configuration
```typescript
// main.ts - Configuración CORS
app.enableCors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
})
```

## ✅ Validación y DTOs

### CreateLeadDto
```typescript
export class CreateLeadDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEmail()
  email?: string

  @IsString()
  @IsNotEmpty()
  phone: string

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus

  @IsOptional()
  @IsString()
  source?: string

  @IsOptional()
  @IsArray()
  tags?: string[]

  @IsOptional()
  @IsString()
  assignedTo?: string
}
```

## 📚 Documentación Swagger

Una vez ejecutándose en desarrollo:
- **Swagger UI**: `http://localhost:3003/api/docs`
- **OpenAPI JSON**: `http://localhost:3003/api/docs-json`

### Swagger Configuration
```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('LeadsCRM API')
  .setDescription('API completa para gestión de leads y WhatsApp')
  .setVersion('1.0')
  .addBearerAuth()
  .build()
```

## 🧪 Testing

### Testing Strategy
- **Unit Tests**: Servicios y utilidades (Jest)
- **Integration Tests**: Endpoints con Supertest
- **E2E Tests**: Flujos completos de negocio

### Configuración Jest
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "testEnvironment": "node"
}
```

### Ejecutar Tests
```bash
pnpm test              # Tests unitarios
pnpm test:e2e          # Tests de integración
pnpm test:watch        # Modo watch
pnpm test:cov          # Con coverage
```

## 🔧 Variables de Entorno

Crear `.env` en la raíz del proyecto:

```bash
# Puerto del servidor
PORT=3003

# Base de datos PostgreSQL
DATABASE_URL="postgresql://user:pass@localhost:5432/leadcrm"
DIRECT_URL="postgresql://user:pass@localhost:5432/leadcrm"

# Autenticación Clerk
CLERK_SECRET_KEY="sk_test_..."
CLERK_PUBLISHABLE_KEY="pk_test_..."

# JWT para desarrollo local (opcional)
JWT_SECRET="your-jwt-secret-for-local-dev"

# WhatsApp Service URL
WHATSAPP_SERVICE_URL="http://localhost:3002"

# Configuración IA (si se usa en API)
OPENROUTER_API_KEY="..."
GEMINI_API_KEY="..."
```

## 🚀 Build y Deploy

### Production Build
```bash
pnpm build              # TypeScript → JavaScript (dist/)
pnpm start              # Ejecutar build de producción
```

### Docker (opcional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY dist/ ./dist/
EXPOSE 3003
CMD ["node", "dist/main"]
```

## 🐛 Debugging

### Logs
- **Development**: Console logging con colores
- **Production**: JSON structured logs
- **Error tracking**: Stack traces completos

### Common Issues
- **Database connection**: Verificar `DATABASE_URL`
- **Clerk auth**: Verificar `CLERK_SECRET_KEY`
- **CORS errors**: Verificar origins en `main.ts`
- **TypeScript errors**: Ejecutar `pnpm type-check`

## 📈 Performance

### Optimizaciones Implementadas
- **Database indexing**: Índices en campos de búsqueda frecuente
- **Query optimization**: Prisma queries optimizadas
- **Response caching**: Headers de cache apropiados
- **Validation pipes**: Validación eficiente con class-validator

### Monitoring
- **Health checks**: `/health` endpoint
- **Response times**: Logging de performance
- **Error rates**: Tracking de errores automático

## 🔄 Integración con WhatsApp Service

### Webhook Configuration
```typescript
// whatsapp.controller.ts
@Post('webhook')
async handleWebhook(@Body() payload: WhatsAppWebhookDto) {
  // Procesar mensaje entrante de WhatsApp
  const lead = await this.leadService.findByPhone(payload.phone)
  
  // Crear mensaje en la base de datos
  await this.messageService.create({
    leadId: lead.id,
    content: payload.message,
    direction: MessageDirection.INBOUND,
    messageType: MessageType.TEXT
  })
}
```

## 🎯 Próximos Pasos

- [ ] WebSocket support para real-time updates
- [ ] Redis caching layer
- [ ] Rate limiting más granular
- [ ] Metrics y observability
- [ ] API versioning
- [ ] GraphQL endpoint (opcional)

Visita [http://localhost:3003](http://localhost:3003) después de ejecutar `pnpm dev`.
