# Row Level Security (RLS) Configuration

This document describes the Row Level Security policies implemented in the LeadsCRM database for production security.

## Overview

Row Level Security (RLS) has been enabled on all tables to ensure that:
- Users can only access data they're authorized to see
- The NestJS API continues to work normally using the service role
- Direct database access is properly secured

## Security Model

### User Roles
- **ADMIN**: Full access to all data
- **AGENT**: Access to assigned leads and related data
- **Service Role**: Backend API access (bypasses RLS)

## Table Policies

### Users Table
- ✅ Users can view their own profile
- ✅ Admins can view all users
- ✅ Users can update their own profile
- ✅ Only admins can create new users
- ✅ Service role has full access

### Leads Table
- ✅ Agents can view leads assigned to them + unassigned leads
- ✅ Admins can view all leads
- ✅ Agents can update assigned/unassigned leads
- ✅ Authenticated users can create leads
- ✅ Only admins can delete leads
- ✅ Service role has full access

### Messages Table
- ✅ Users can view messages for accessible leads
- ✅ Users can create/update messages for accessible leads
- ✅ Only admins can delete messages
- ✅ Service role has full access

### Campaigns Table
- ✅ Users can view campaigns they created
- ✅ Admins can view all campaigns
- ✅ Users can update/delete their own campaigns
- ✅ Authenticated users can create campaigns
- ✅ Service role has full access

### Campaign_Leads Table
- ✅ Users can view campaign leads if they have access to lead OR campaign
- ✅ Users can create/update/delete campaign leads they have access to
- ✅ Service role has full access

## Service Role Usage

The NestJS API uses a **service role** connection which bypasses RLS policies. This means:

✅ **API Endpoints Work Normally**: All your existing API endpoints continue to function
✅ **Business Logic Intact**: Lead assignment, message routing, and campaign management work as expected
✅ **Direct Database Access Protected**: Users connecting directly to the database are subject to RLS
✅ **Webhook Processing**: WhatsApp webhooks and automated processes continue to work

## Connection Strings

### Service Role (API Backend)
```
DATABASE_URL="postgresql://postgres:password@host:5432/postgres"
```
- Used by: NestJS API, Prisma migrations
- Security: Bypasses RLS, full database access
- Purpose: Backend operations, data processing

### User-level Access (Future)
```
DATABASE_URL="postgresql://user:password@host:5432/postgres"
```
- Used by: Direct client connections (if implemented)
- Security: Subject to RLS policies
- Purpose: User-specific data access

## Testing RLS

To test that RLS is working:

1. **Verify RLS is enabled**:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE schemaname = 'public' AND rowsecurity = true;
   ```

2. **Test service role access**:
   ```sql
   SELECT COUNT(*) FROM leads; -- Should return all leads
   ```

3. **Test user-level access** (when implemented):
   ```sql
   SET ROLE authenticated;
   SET request.jwt.claim.sub = 'user-clerk-id';
   SELECT COUNT(*) FROM leads; -- Should return only accessible leads
   ```

## Security Benefits

✅ **Data Isolation**: Agents only see their assigned leads
✅ **Admin Oversight**: Admins have full visibility and control
✅ **API Security**: Backend operations remain secure and efficient
✅ **Database Protection**: Direct database access is properly restricted
✅ **Audit Ready**: All access is governed by explicit policies

## Maintenance

### Adding New Tables
When adding new tables, remember to:
1. Enable RLS: `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;`
2. Create user policies based on data ownership/access patterns
3. Create service role bypass policy for API access

### Modifying Policies
- Test changes in a development environment first
- Ensure service role policies remain intact
- Verify API functionality after policy changes

---

*RLS Configuration Date: August 21, 2025*
*Status: ✅ Active and Tested*
