# Phase 1: WhatsApp Service Architecture Toggle

## Overview

Phase 1 of the WhatsApp service refactoring introduces a **unified facade pattern** with a feature toggle that allows switching between:

- **Legacy Architecture** (default): Uses `WhatsAppServiceSimple.ts` - the original monolithic service
- **Refactored Architecture**: Uses `WhatsAppServiceRefactored.ts` - the new modular component-based service

## Feature Toggle Usage

### Environment Variable

Add to your `.env` file:

```bash
# Service Architecture Configuration
# Set to 'true' to use the new modular architecture (WhatsAppServiceRefactored)
# Set to 'false' to use the legacy monolithic service (WhatsAppServiceSimple)
USE_WHATSAPP_REFACTORED=false
```

### Values

- `USE_WHATSAPP_REFACTORED=false` (default): Uses legacy architecture
- `USE_WHATSAPP_REFACTORED=true`: Uses new modular architecture

## Architecture Diagram

```
┌─────────────────────────────┐
│     WhatsAppService.ts      │  ← Unified Facade (Entry Point)
│    (Facade + Stats/Cache)   │
└────────────┬────────────────┘
             │ delegates to
             │
    ┌────────▼─────────┐    ┌─────────────────────────┐
    │ Legacy Service   │    │  Refactored Service     │
    │ (Simple.ts)      │    │  (Refactored.ts)        │
    │                  │    │                         │
    │ • Monolithic     │    │ • Modular Components    │
    │ • 2300+ lines    │    │ • SessionManager        │
    │ • All-in-one     │    │ • ConnectionManager     │
    │                  │    │ • MessageProcessor      │
    │                  │    │ • EventHandler          │
    │                  │    │ • MediaHandler          │
    │                  │    │ • ContactManager        │
    └──────────────────┘    └─────────────────────────┘
```

## API Compatibility

The facade maintains **100% API compatibility** regardless of which implementation is used. All existing routes, controllers, and external integrations continue to work without any changes.

### Key Methods (Both Implementations)

- `createSession(sessionId: string)`
- `sendMessage(sessionId: string, to: string, message: string)`
- `getSessionStatus(sessionId: string)`
- `getAllSessions()`
- `destroySession(sessionId: string)`
- `forceDisconnectSession(sessionId: string)` (legacy compatibility)
- `getSession(sessionId: string)` (legacy compatibility)

## Implementation Details

### WhatsAppService.ts (Facade)

```typescript
class WhatsAppService {
  private useRefactoredService: boolean;
  private simpleService: typeof WhatsAppServiceSimple;
  private refactoredService: WhatsAppServiceRefactored | null = null;

  constructor() {
    // Feature toggle
    this.useRefactoredService = process.env.USE_WHATSAPP_REFACTORED === 'true';

    // Initialize appropriate service
    this.simpleService = WhatsAppServiceSimple;
    if (this.useRefactoredService) {
      this.refactoredService = new WhatsAppServiceRefactored();
    }
  }

  async createSession(sessionId: string): Promise<WhatsAppSession> {
    if (this.useRefactoredService && this.refactoredService) {
      return await this.refactoredService.createSession(sessionId);
    } else {
      return await this.simpleService.createSession(sessionId);
    }
  }
  // ... other methods delegate similarly
}
```

## Testing the Toggle

### Test Legacy Mode (Default)

```bash
# Don't set the variable or set it to false
USE_WHATSAPP_REFACTORED=false pnpm dev
```

### Test Refactored Mode

```bash
# Set to true to enable new architecture
USE_WHATSAPP_REFACTORED=true pnpm dev
```

### Verify Which Mode is Active

Check the startup logs:

```
🏗️ WhatsApp Service Architecture: LEGACY (v1.0)
# or
🏗️ WhatsApp Service Architecture: REFACTORED (v2.0)
```

## Current Status

✅ **Completed:**

- Unified facade implementation
- Feature toggle mechanism
- API compatibility layer
- Legacy method adapters (`getSession`, `forceDisconnectSession`)
- Documentation and examples

⏳ **Remaining (Future Phases):**

- SocketService.ts integration
- Full end-to-end testing
- Performance comparison metrics
- Database service refactoring

## Troubleshooting

### Service Doesn't Start

- Check that both `WhatsAppServiceSimple.ts` and `WhatsAppServiceRefactored.ts` exist
- Verify all dependencies are installed: `pnpm install`

### API Calls Fail

- Both architectures require the same environment variables (Redis, database, etc.)
- Check that all required services (Redis, PostgreSQL) are running

### Toggle Not Working

- Verify the environment variable is set correctly
- Check startup logs to confirm which architecture is active
- Clear any cached environment variables

## Next Steps

Phase 2 will focus on refactoring `DatabaseService.ts` into smaller repository pattern modules while maintaining the same facade approach for backward compatibility.
