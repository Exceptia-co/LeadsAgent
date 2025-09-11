# Architecture Diagrams - LeadsCRM

## 🏗️ Diagramas de Arquitectura y Flujos

Esta documentación visual explica los flujos de datos y arquitectura del sistema LeadsCRM.

## 📊 Flujo de Procesamiento de Mensajes IA

```mermaid
sequenceDiagram
    participant WA as WhatsApp
    participant WS as WhatsApp Service
    participant AI as AI Service
    participant DB as Database
    participant API as NestJS API
    participant UI as Dashboard

    WA->>WS: Mensaje entrante
    WS->>WS: Validar whitelist
    
    alt Lead autorizado
        WS->>AI: Analizar intención
        AI-->>AI: Clasificar mensaje
        AI-->>AI: Generar respuesta
        AI->>WS: Respuesta + análisis
        WS->>DB: Guardar mensaje + análisis
        WS->>WA: Enviar respuesta automática
        WS->>API: Webhook notificación
        API->>UI: Actualizar en tiempo real
    else Lead no autorizado
        WS->>DB: Solo guardar mensaje
        WS->>API: Notificar mensaje bloqueado
    end
```

## 🎯 Árbol de Decisión de Auto-Respuestas

```mermaid
flowchart TD
    A[Mensaje Recibido] --> B{¿En whitelist?}
    B -->|No| C[Guardar sin procesar]
    B -->|Sí| D[Analizar con IA]
    
    D --> E{¿Intención detectada?}
    E -->|No| F[Respuesta genérica]
    E -->|Sí| G{¿Confianza > 0.8?}
    
    G -->|No| H[Respuesta cautelosa]
    G -->|Sí| I{¿Tipo de intención?}
    
    I -->|Saludo| J[Respuesta amigable]
    I -->|Consulta producto| K[Info producto + CTA]
    I -->|Precio| L[Derivar a especialista]
    I -->|Urgente| M[Respuesta prioritaria]
    I -->|Queja| N[Escalate a soporte]
    
    J --> O[Enviar respuesta]
    K --> O
    L --> O
    M --> O
    N --> O
    F --> O
    H --> O
    
    O --> P[Actualizar lead score]
    P --> Q[Notificar dashboard]
```

## 🔄 Integración de Proveedores IA

```mermaid
graph TB
    subgraph "AI Service Layer"
        AS[AI Service Controller]
        AS --> PP[Provider Pool]
        
        PP --> OR[OpenRouter]
        PP --> GM[Google Gemini]
        PP --> FB[Fallback Responses]
        
        OR --> |"Primary"| Claude[Claude 3.5 Sonnet]
        GM --> |"Secondary"| Gemini[Gemini 1.5 Pro]
        FB --> |"Emergency"| Static[Static Responses]
    end
    
    subgraph "WhatsApp Service"
        WS[WhatsApp Handler]
        WS --> AS
        AS --> |"AI Response"| WS
        WS --> |"Send Message"| WA[WhatsApp Client]
    end
    
    subgraph "Configuration"
        ENV[Environment Variables]
        ENV --> |"AI_PROVIDER"| AS
        ENV --> |"API_KEYS"| PP
    end
    
    subgraph "Monitoring"
        AS --> METRICS[Metrics Collection]
        METRICS --> LOGS[Structured Logging]
        METRICS --> ALERTS[Error Alerts]
    end
```

## 📈 Flujo de Análisis de Sentimiento

```mermaid
flowchart LR
    subgraph "Input Processing"
        MSG[Mensaje Entrante]
        MSG --> CLEAN[Limpiar texto]
        CLEAN --> EXTRACT[Extraer contexto]
    end
    
    subgraph "AI Analysis"
        EXTRACT --> PROMPT[Generar prompt]
        PROMPT --> PROVIDER[Proveedor IA]
        PROVIDER --> PARSE[Parsear respuesta]
    end
    
    subgraph "Sentiment Classification"
        PARSE --> POSITIVE{¿Positivo?}
        PARSE --> NEGATIVE{¿Negativo?}
        PARSE --> NEUTRAL{¿Neutral?}
        
        POSITIVE --> |"Score: 0.8+"| HOT[Lead Caliente]
        NEGATIVE --> |"Score: 0.3-"| SUPPORT[Requiere Soporte]
        NEUTRAL --> |"Score: 0.3-0.8"| WARM[Lead Templado]
    end
    
    subgraph "Actions"
        HOT --> PRIORITIZE[Priorizar contacto]
        SUPPORT --> ESCALATE[Escalar a agente]
        WARM --> NURTURE[Campaña nurturing]
    end
```

## 🌐 Arquitectura MCP Integration

```mermaid
graph TB
    subgraph "AI Assistant Session"
        CHAT[AI Chat Request]
        CHAT --> MCP[MCP Server Pool]
        
        MCP --> C7[context7]
        MCP --> PA[perplexity-ask]
        MCP --> SER[serena]
        MCP --> ST[sequential-thinking]
        
        C7 --> |"Documentation"| CONTEXT[Project Context]
        PA --> |"External Knowledge"| RESEARCH[Real-time Research]
        SER --> |"Code Navigation"| SYMBOLS[Symbol Analysis]
        ST --> |"Problem Solving"| REASONING[Step-by-step Reasoning]
    end
    
    subgraph "LeadsCRM Repository"
        CONTEXT --> DOCS[Documentation Files]
        SYMBOLS --> CODE[Source Code]
        
        DOCS --> WARP[WARP.md]
        DOCS --> GUIDES[Guidelines]
        CODE --> APPS[Apps Directory]
        CODE --> PKGS[Packages Directory]
    end
    
    subgraph "Enhanced Development"
        RESEARCH --> DECISIONS[Informed Decisions]
        REASONING --> VALIDATION[Solution Validation]
        SYMBOLS --> DEPENDENCIES[Dependency Mapping]
        
        DECISIONS --> CHANGES[Code Changes]
        VALIDATION --> CHANGES
        DEPENDENCIES --> CHANGES
    end
```

## 🔄 Workflow de Automatización

```mermaid
stateDiagram-v2
    [*] --> MessageReceived
    
    MessageReceived --> WhitelistCheck
    
    WhitelistCheck --> Blocked: Not Authorized
    WhitelistCheck --> AIProcessing: Authorized
    
    Blocked --> DatabaseLog
    DatabaseLog --> [*]
    
    AIProcessing --> IntentAnalysis
    IntentAnalysis --> SentimentAnalysis
    SentimentAnalysis --> ResponseGeneration
    
    ResponseGeneration --> AutoResponse: High Confidence
    ResponseGeneration --> HumanReview: Low Confidence
    
    AutoResponse --> SendMessage
    HumanReview --> QueueForAgent
    
    SendMessage --> UpdateLeadScore
    QueueForAgent --> UpdateLeadScore
    
    UpdateLeadScore --> DatabaseUpdate
    DatabaseUpdate --> NotifyDashboard
    NotifyDashboard --> [*]
    
    state AIProcessing {
        [*] --> ProviderSelection
        ProviderSelection --> OpenRouter: Primary
        ProviderSelection --> Gemini: Fallback
        ProviderSelection --> StaticResponse: Emergency
        
        OpenRouter --> Success
        Gemini --> Success
        StaticResponse --> Success
        
        OpenRouter --> Error
        Gemini --> Error
        
        Error --> Gemini: Retry Fallback
        Error --> StaticResponse: All Failed
        
        Success --> [*]
    }
```

## 📊 Flujo de Datos Multi-Sesión WhatsApp

```mermaid
graph TD
    subgraph "Multiple WhatsApp Sessions"
        WA1[WhatsApp Session 1]
        WA2[WhatsApp Session 2]
        WA3[WhatsApp Session N]
    end
    
    subgraph "Session Management"
        SM[Session Manager]
        WA1 --> SM
        WA2 --> SM
        WA3 --> SM
        
        SM --> QR1[QR Generator 1]
        SM --> QR2[QR Generator 2]
        SM --> QR3[QR Generator N]
    end
    
    subgraph "Message Processing Pool"
        SM --> MQ[Message Queue]
        MQ --> MP1[Message Processor 1]
        MQ --> MP2[Message Processor 2]
        MQ --> MP3[Message Processor N]
        
        MP1 --> AI[AI Service]
        MP2 --> AI
        MP3 --> AI
    end
    
    subgraph "Data Persistence"
        AI --> DB[(Database)]
        DB --> LEADS[Leads Table]
        DB --> MESSAGES[Messages Table]
        DB --> SESSIONS[Sessions Table]
    end
    
    subgraph "Real-time Updates"
        DB --> WH[Webhooks]
        WH --> DASH[Dashboard UI]
        WH --> API[REST API]
    end
```

## 🔍 Clasificación de Leads - Decision Tree

```mermaid
flowchart TD
    START([Nuevo Mensaje]) --> EXTRACT[Extraer características]
    
    EXTRACT --> KEYWORDS{¿Contiene keywords<br/>de compra?}
    KEYWORDS -->|Sí| HIGH_INTENT[Alta Intención]
    KEYWORDS -->|No| CHECK_CONTACT{¿Proporciona<br/>contacto?}
    
    CHECK_CONTACT -->|Sí| MEDIUM_INTENT[Media Intención]
    CHECK_CONTACT -->|No| CHECK_QUESTIONS{¿Hace preguntas<br/>específicas?}
    
    CHECK_QUESTIONS -->|Sí| LOW_INTENT[Baja Intención]
    CHECK_QUESTIONS -->|No| VERY_LOW[Muy Baja Intención]
    
    HIGH_INTENT --> SCORE_HIGH[Score: 0.8-1.0<br/>Status: Caliente]
    MEDIUM_INTENT --> SCORE_MED[Score: 0.6-0.8<br/>Status: Templado]
    LOW_INTENT --> SCORE_LOW[Score: 0.3-0.6<br/>Status: Frío]
    VERY_LOW --> SCORE_VERY_LOW[Score: 0.0-0.3<br/>Status: Muy Frío]
    
    SCORE_HIGH --> ACTION_HIGH[Contacto inmediato<br/>Asignar agente]
    SCORE_MED --> ACTION_MED[Seguimiento 24h<br/>Enviar info]
    SCORE_LOW --> ACTION_LOW[Nurturing campaign<br/>Contenido educativo]
    SCORE_VERY_LOW --> ACTION_VERY_LOW[Monitor<br/>Sin acción]
```

## ⚡ Performance Optimization Flow

```mermaid
graph LR
    subgraph "Request Optimization"
        REQ[API Request] --> CACHE{Cache Hit?}
        CACHE -->|Yes| CACHED[Return Cached]
        CACHE -->|No| PROCESS[Process Request]
    end
    
    subgraph "AI Provider Selection"
        PROCESS --> HEALTH_CHECK{Provider Health}
        HEALTH_CHECK --> PRIMARY[OpenRouter]
        HEALTH_CHECK --> SECONDARY[Gemini Fallback]
        HEALTH_CHECK --> EMERGENCY[Static Responses]
    end
    
    subgraph "Response Processing"
        PRIMARY --> TIMEOUT{Response Time}
        TIMEOUT -->|< 2s| SUCCESS[Return Response]
        TIMEOUT -->|> 2s| FALLBACK[Try Next Provider]
        
        SECONDARY --> SUCCESS
        EMERGENCY --> SUCCESS
        
        SUCCESS --> UPDATE_CACHE[Update Cache]
        UPDATE_CACHE --> LOG_METRICS[Log Performance]
    end
    
    subgraph "Monitoring"
        LOG_METRICS --> DASHBOARD_METRICS[Metrics Dashboard]
        LOG_METRICS --> ALERTS{Thresholds}
        ALERTS -->|Exceeded| NOTIFICATION[Alert Team]
        ALERTS -->|Normal| CONTINUE[Continue]
    end
```

## 🔒 Security & Privacy Flow

```mermaid
flowchart TD
    subgraph "Input Sanitization"
        INPUT[User Message] --> SCAN[Scan for PII]
        SCAN --> REMOVE[Remove/Mask sensitive data]
        REMOVE --> CLEAN[Clean Message]
    end
    
    subgraph "AI Processing"
        CLEAN --> PROVIDER[AI Provider]
        PROVIDER --> SECURE[Secure API Call]
        SECURE --> |"No PII Leaked"| RESPONSE[AI Response]
    end
    
    subgraph "Output Filtering"
        RESPONSE --> FILTER[Filter Response]
        FILTER --> VALIDATE[Validate Content]
        VALIDATE --> SAFE[Safe Response]
    end
    
    subgraph "Audit Trail"
        CLEAN --> LOG[Log Sanitized Input]
        SAFE --> LOG_OUTPUT[Log Safe Output]
        LOG --> AUDIT[(Audit Database)]
        LOG_OUTPUT --> AUDIT
    end
    
    subgraph "Rate Limiting"
        INPUT --> RATE_CHECK{Rate Limit OK?}
        RATE_CHECK -->|No| REJECT[Reject Request]
        RATE_CHECK -->|Yes| SCAN
        REJECT --> ERROR[Return Error]
    end
```

Estos diagramas proporcionan una visión completa de los flujos y arquitectura del sistema LeadsCRM, desde el procesamiento de mensajes hasta la integración MCP y optimización de performance.
