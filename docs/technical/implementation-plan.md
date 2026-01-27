# Implementation Plan

## Overview

This implementation plan outlines the steps to clean up and improve the LeadsCRM codebase with best practices. The goal is to enhance code quality, maintainability, and performance while preserving existing functionality. The project is a lead management system with WhatsApp integration and AI automation capabilities.

## Types

Standardize type definitions across the entire codebase to improve type safety and developer experience.

### Backend API Types

```typescript
// apps/api/src/leads/dto/create-lead.dto.ts
export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsPhoneNumber()
  phone: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;
}

// apps/api/src/leads/dto/update-lead.dto.ts
export class UpdateLeadDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(LeadStatus)
  @IsOptional()
  status?: LeadStatus;

  @IsNumber()
  @IsOptional()
  moodScore?: number;
}

// apps/api/src/leads/dto/leads-query.dto.ts
export class LeadsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}
```

### Frontend Types

```typescript
// apps/dashboard/types/index.ts
export interface Lead {
  id: string;
  name: string | null;
  phone: string;
  email?: string;
  status: LeadStatus;
  moodScore: number | null;
  tags: string[];
  lastContact?: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | "NUEVO"
  | "CONTACTADO"
  | "QUALIFIED"
  | "GANADO"
  | "PERDIDO";

export interface Message {
  id: string;
  leadId: string;
  content: string;
  type: MessageType;
  direction: MessageDirection;
  status: MessageStatus;
  timestamp: string;
  aiAnalyzed: boolean;
  sentiment?: string;
  confidence?: number;
  createdAt: string;
  updatedAt: string;
}

export enum MessageType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO",
  DOCUMENT = "DOCUMENT",
}

export enum MessageDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

export enum MessageStatus {
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  READ = "READ",
  FAILED = "FAILED",
}
```

## Files

Organize and standardize file structure across all applications.

### New Files to Create

1. `apps/api/src/common/dto/pagination.dto.ts` - Standard pagination DTO
2. `apps/api/src/common/exceptions/validation.exception.ts` - Custom validation exception
3. `apps/api/src/common/guards/auth.guard.ts` - Enhanced authentication guard
4. `apps/dashboard/src/lib/auth.ts` - Authentication utilities
5. `apps/dashboard/src/types/api.ts` - API response types
6. `packages/config-eslint/backend.js` - ESLint config for backend
7. `packages/config-eslint/dashboard.js` - ESLint config for dashboard

### Files to Modify

1. `apps/api/src/leads/leads.service.ts` - Improve query optimization and error handling
2. `apps/api/src/whatsapp/whatsapp.service.ts` - Enhance error handling and logging
3. `apps/api/src/whatsapp/automation.service.ts` - Refactor automation rules to be database-driven
4. `apps/dashboard/lib/api.ts` - Standardize API error handling
5. `apps/dashboard/hooks/use-whatsapp-api.ts` - Improve type safety and error handling
6. All controller files - Add proper Swagger documentation and validation

### Files to Delete

1. Remove any unused or duplicate type definitions
2. Clean up temporary files in `apps/whatsapp-service/temp/`

## Functions

Standardize function signatures and improve code organization.

### New Functions

1. `apps/api/src/common/utils/pagination.util.ts`:

   ```typescript
   export function buildPaginationMeta(
     total: number,
     page: number,
     limit: number,
   ) {
     return {
       page,
       limit,
       total,
       totalPages: Math.ceil(total / limit),
       hasNext: page * limit < total,
       hasPrev: page > 1,
     };
   }
   ```

2. `apps/api/src/common/utils/error.util.ts`:
   ```typescript
   export function handlePrismaError(error: unknown): HttpException {
     if (error instanceof Prisma.PrismaClientKnownRequestError) {
       switch (error.code) {
         case "P2002":
           return new ConflictException("Resource already exists");
         case "P2025":
           return new NotFoundException("Resource not found");
         default:
           return new InternalServerErrorException("Database error");
       }
     }
     return new InternalServerErrorException("Unknown error");
   }
   ```

### Modified Functions

1. `LeadsService.findAll` - Optimize database queries and add proper pagination
2. `WhatsAppService.handleIncomingMessage` - Improve error handling and add more robust validation
3. `AutomationService.processAutoResponses` - Refactor to fetch rules from database instead of hardcoded values
4. All API service functions in dashboard - Standardize error handling and loading states

### Removed Functions

1. Deprecated public endpoints that should be replaced with authenticated versions
2. Any duplicate utility functions

## Classes

Refactor and organize classes for better maintainability.

### New Classes

1. `apps/api/src/common/interceptors/logging.interceptor.ts` - Standard logging interceptor
2. `apps/api/src/common/filters/http-exception.filter.ts` - Global exception filter
3. `apps/api/src/leads/leads.repository.ts` - Data access layer for leads

### Modified Classes

1. `LeadsService` - Extract data access to repository pattern
2. `WhatsAppService` - Improve session management and error handling
3. `AutomationService` - Refactor to use database-driven rules
4. All controller classes - Add proper validation and documentation

### Removed Classes

1. Any unused or deprecated service classes

## Dependencies

Update and standardize dependencies across all packages.

### New Dependencies

1. Add `class-validator` and `class-transformer` to dashboard for form validation
2. Add `zod` for schema validation in shared packages
3. Add `winston` for structured logging in all services

### Updated Dependencies

1. Update all packages to latest stable versions
2. Standardize ESLint and Prettier configurations
3. Update Prisma to latest version

### Removed Dependencies

1. Remove any unused or deprecated packages
2. Consolidate duplicate dependencies

## Testing

Implement comprehensive testing strategy.

### Test Files to Create

1. `apps/api/src/leads/leads.service.spec.ts` - Unit tests for leads service
2. `apps/api/src/whatsapp/whatsapp.service.spec.ts` - Unit tests for WhatsApp service
3. `apps/api/src/automation/automation.service.spec.ts` - Unit tests for automation service
4. `apps/dashboard/__tests__/lib/api.test.ts` - Tests for API utilities
5. `apps/dashboard/__tests__/hooks/use-whatsapp-api.test.ts` - Tests for WhatsApp API hook

### Existing Test Modifications

1. Update existing tests to use new type definitions
2. Add integration tests for critical workflows
3. Improve test coverage for error handling

## Implementation Order

Follow this sequence to minimize conflicts and ensure successful integration.

1. **Setup and Configuration**
   - Update ESLint and Prettier configurations
   - Standardize tsconfig files
   - Set up shared configuration packages

2. **Type Definitions**
   - Create standardized type definitions for all services
   - Update existing code to use new types
   - Remove duplicate type definitions

3. **API Layer Improvements**
   - Refactor leads service with repository pattern
   - Improve WhatsApp service error handling
   - Refactor automation service to be database-driven
   - Add proper validation and documentation to all endpoints

4. **Frontend Improvements**
   - Standardize API hooks and utilities
   - Improve type safety in components
   - Enhance error handling and loading states

5. **Testing**
   - Add unit tests for all services
   - Add integration tests for critical workflows
   - Improve test coverage

6. **Documentation**
   - Update API documentation
   - Add code comments where needed
   - Update README files

7. **Final Validation**
   - Run all tests
   - Verify all functionality works as expected
   - Perform code review
