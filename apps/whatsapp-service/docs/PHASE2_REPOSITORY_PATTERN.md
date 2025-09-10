# Phase 2: Database Repository Pattern Implementation

## Overview

Phase 2 of the WhatsApp service refactoring introduces a **repository pattern** with feature toggle that allows switching between:

- **Legacy Architecture** (default): Uses monolithic `DatabaseService.ts` with direct SQL queries
- **Repository Architecture**: Uses modular repository classes (`LeadRepository`, `ConversationRepository`)

## Feature Toggle Usage

### Environment Variable

Add to your `.env` file:

```bash
# Database Architecture Configuration
# Set to 'true' to use the new repository pattern (LeadRepository, ConversationRepository)
# Set to 'false' to use the legacy monolithic DatabaseService
USE_DATABASE_REPOSITORIES=false
```

### Values

- `USE_DATABASE_REPOSITORIES=false` (default): Uses legacy monolithic DatabaseService
- `USE_DATABASE_REPOSITORIES=true`: Uses new repository pattern architecture

## Architecture Diagram

```
┌─────────────────────────────┐
│     DatabaseService.ts      │  ← Unified Facade (Entry Point)
│    (Facade + Statistics)    │
└────────────┬────────────────┘
             │ Feature Toggle: USE_DATABASE_REPOSITORIES
             │
    ┌────────▼─────────┐    ┌─────────────────────────┐
    │ Legacy Database  │    │  Repository Pattern     │
    │ (Monolithic)     │    │  (Modular)             │
    │                  │    │                         │
    │ • Direct SQL     │    │ • LeadRepository        │
    │ • 3000+ lines    │    │ • ConversationRepository│
    │ • All-in-one     │    │ • BaseRepository        │
    │                  │    │ • Type Safety           │
    │                  │    │ • Error Handling        │
    └──────────────────┘    └─────────────────────────┘
```

## Repository Pattern Components

### Core Repositories Implemented

1. **LeadRepository**
   - `findAll()` - Get all leads
   - `findById(id)` - Find lead by ID
   - `findByPhone(phone)` - Find lead by phone (with number equivalence)
   - `create(leadData)` - Create new lead with validation
   - `updateWhatsAppAuth(phone, authorized)` - Update WhatsApp authorization
   - `update(id, data)` - Update lead data
   - `delete(id)` - Delete lead

2. **ConversationRepository**
   - `save(data)` - Save conversation entry
   - `findById(id)` - Find conversation by ID
   - `findBySessionId(sessionId, limit)` - Get conversations by session
   - `findByPhoneNumber(phoneNumber, limit)` - Get conversations by phone
   - `getHistory(sessionId, limit)` - Get conversation history
   - `getRecentContext(sessionId, messageCount)` - Get recent context for AI
   - `search(query, limit)` - Search conversations by text content
   - `getStats(sessionId?)` - Get conversation statistics

### Base Infrastructure

1. **BaseRepository** - Abstract base class providing:
   - Database connection management
   - Query execution with error handling and logging
   - Table creation (abstract method)
   - Data validation and sanitization
   - Common utility methods (WHERE clause building, etc.)

2. **DatabaseConnectionAdapter** - Adapter pattern for PostgreSQL:
   - Abstracts pg.Pool specifics
   - Provides consistent interface
   - Error handling and connection testing

3. **RepositoryFactory** - Factory pattern for repository creation:
   - Manages repository instances
   - Handles dependency injection
   - Provides cleanup methods

## API Compatibility

The facade maintains **100% API compatibility** regardless of which implementation is used. All existing routes, controllers, and external integrations continue to work without any changes.

### Delegated Methods (Examples)

```typescript
// DatabaseService.ts - Facade with delegation
public async getAllLeads(): Promise<Lead[]> {
  // Phase 2: Repository pattern delegation
  if (this.useRepositories && this.leadRepository) {
    try {
      logger.debug('🏛️ Using LeadRepository for getAllLeads');
      return await this.leadRepository.findAll();
    } catch (error) {
      logger.error('❌ Repository method failed, falling back to legacy:', error);
      // Fallback to legacy implementation below
    }
  }

  // Legacy implementation continues...
}
```

## Implementation Details

### Repository Pattern Features

1. **Type Safety**: Full TypeScript interfaces and type checking
2. **Error Handling**: Comprehensive error handling with fallback to legacy
3. **Logging**: Detailed operation logging with performance metrics
4. **Validation**: Input validation and data sanitization
5. **Caching**: Built-in query result caching capabilities
6. **Metrics**: Repository-specific metrics and monitoring

### Database Schema Management

- Repositories automatically create tables if they don't exist
- Proper indexes for performance
- UUID primary keys
- Consistent timestamp handling
- PostgreSQL-specific optimizations

## Testing the Repository Pattern

### Test Legacy Mode (Default)

```bash
# Don't set the variable or set it to false
USE_DATABASE_REPOSITORIES=false pnpm dev
```

### Test Repository Mode

```bash
# Set to true to enable new repository pattern
USE_DATABASE_REPOSITORIES=true pnpm dev
```

### Verify Which Mode is Active

Check the startup logs:

```
🗄️ Database Service Architecture: LEGACY (v1.0)
# or
🗄️ Database Service Architecture: REPOSITORIES (v2.0)
```

## Migration Strategy

### Gradual Migration

The repository pattern can be enabled incrementally:

1. **Phase 2a**: Core repositories (Lead, Conversation) ✅
2. **Phase 2b**: Knowledge Base and AI Config repositories
3. **Phase 2c**: Training and Whitelist repositories
4. **Phase 2d**: Complete migration with legacy code removal

### Fallback Safety

- If repository initialization fails, service automatically falls back to legacy mode
- If individual repository methods fail, they fallback to legacy SQL implementation
- Zero downtime during migration
- Full rollback capability

## Current Status

✅ **Completed:**

- Repository pattern infrastructure (BaseRepository, Factory, Adapter)
- LeadRepository with full CRUD operations and phone number normalization
- ConversationRepository with message handling and AI context
- DatabaseService facade with feature toggle
- Automatic fallback mechanisms
- Type-safe interfaces

⏳ **Remaining (Future Phases):**

- KnowledgeBaseRepository implementation
- AIConfigRepository implementation
- WhitelistLogRepository implementation
- TrainingRepository implementation
- Performance optimization and caching
- Legacy code cleanup

## Benefits

1. **Maintainability**: Smaller, focused classes following Single Responsibility Principle
2. **Testability**: Easy to unit test individual repositories
3. **Type Safety**: Full TypeScript support with proper interfaces
4. **Performance**: Optimized queries and built-in caching
5. **Scalability**: Easy to add new repository types
6. **Error Handling**: Consistent error handling patterns
7. **Monitoring**: Built-in metrics and logging

## Next Steps

Phase 3 will focus on refactoring `AIThinkingService.ts` into smaller, modular components while maintaining the same facade approach for backward compatibility.
