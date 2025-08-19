import { Request, Response, NextFunction } from 'express'
import logger from '../utils/logger'

// Validation schemas
export interface CreateSessionRequest {
  sessionId: string
  webhookUrl?: string
}

export interface SendMessageRequest {
  to: string
  message: string
  sessionId?: string
}

// Helper function to validate phone number format
export function isValidPhoneNumber(phone: string): boolean {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  // Should have at least 10 digits and at most 15 digits (international format)
  return digits.length >= 10 && digits.length <= 15
}

// Helper function to format phone number for WhatsApp
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '')
  
  // If it starts with +, remove it
  if (phone.startsWith('+')) {
    digits = phone.substring(1).replace(/\D/g, '')
  }
  
  // Ensure it has country code (if it starts with 9 and has 9 digits, add 54 for Argentina)
  if (digits.length === 9 && digits.startsWith('9')) {
    digits = '54' + digits
  }
  
  return digits + '@c.us'
}

// Middleware to validate session creation request
export function validateCreateSession(req: Request, res: Response, next: NextFunction): void {
  try {
    const { sessionId, webhookUrl } = req.body as CreateSessionRequest
    
    // Validate sessionId
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'sessionId is required and must be a string',
        code: 'INVALID_SESSION_ID'
      })
      return
    }
    
    // Validate sessionId format (alphanumeric, hyphens, underscores allowed)
    const sessionIdRegex = /^[a-zA-Z0-9_-]+$/
    if (!sessionIdRegex.test(sessionId)) {
      res.status(400).json({
        success: false,
        error: 'sessionId must contain only letters, numbers, hyphens, and underscores',
        code: 'INVALID_SESSION_ID_FORMAT'
      })
      return
    }
    
    // Validate sessionId length
    if (sessionId.length < 3 || sessionId.length > 50) {
      res.status(400).json({
        success: false,
        error: 'sessionId must be between 3 and 50 characters',
        code: 'INVALID_SESSION_ID_LENGTH'
      })
      return
    }
    
    // Validate webhookUrl if provided
    if (webhookUrl) {
      try {
        new URL(webhookUrl)
      } catch (error) {
        res.status(400).json({
          success: false,
          error: 'webhookUrl must be a valid URL',
          code: 'INVALID_WEBHOOK_URL'
        })
        return
      }
    }
    
    next()
  } catch (error) {
    logger.error('Error in validateCreateSession middleware:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation',
      code: 'VALIDATION_ERROR'
    })
  }
}

// Middleware to validate send message request
export function validateSendMessage(req: Request, res: Response, next: NextFunction): void {
  try {
    const { to, message } = req.body as SendMessageRequest
    const { sessionId } = req.params
    
    // Validate sessionId from params
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'sessionId is required in the URL path',
        code: 'MISSING_SESSION_ID'
      })
      return
    }
    
    // Validate recipient phone number
    if (!to || typeof to !== 'string') {
      res.status(400).json({
        success: false,
        error: 'to field is required and must be a string',
        code: 'MISSING_RECIPIENT'
      })
      return
    }
    
    // Validate phone number format
    if (!isValidPhoneNumber(to)) {
      res.status(400).json({
        success: false,
        error: 'to field must be a valid phone number (10-15 digits)',
        code: 'INVALID_PHONE_NUMBER',
        examples: ['1234567890', '+1234567890', '54911234567']
      })
      return
    }
    
    // Validate message content
    if (!message || typeof message !== 'string') {
      res.status(400).json({
        success: false,
        error: 'message field is required and must be a string',
        code: 'MISSING_MESSAGE'
      })
      return
    }
    
    // Validate message length (WhatsApp limit is around 4096 characters)
    if (message.length === 0) {
      res.status(400).json({
        success: false,
        error: 'message cannot be empty',
        code: 'EMPTY_MESSAGE'
      })
      return
    }
    
    if (message.length > 4096) {
      res.status(400).json({
        success: false,
        error: 'message is too long (maximum 4096 characters)',
        code: 'MESSAGE_TOO_LONG'
      })
      return
    }
    
    // Format the phone number for WhatsApp
    req.body.to = formatPhoneNumber(to)
    
    next()
  } catch (error) {
    logger.error('Error in validateSendMessage middleware:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation',
      code: 'VALIDATION_ERROR'
    })
  }
}

// Middleware to validate sessionId in URL params
export function validateSessionId(req: Request, res: Response, next: NextFunction): void {
  try {
    const { sessionId } = req.params
    
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'sessionId is required in the URL path',
        code: 'MISSING_SESSION_ID'
      })
      return
    }
    
    const sessionIdRegex = /^[a-zA-Z0-9_-]+$/
    if (!sessionIdRegex.test(sessionId)) {
      res.status(400).json({
        success: false,
        error: 'sessionId must contain only letters, numbers, hyphens, and underscores',
        code: 'INVALID_SESSION_ID_FORMAT'
      })
      return
    }
    
    next()
  } catch (error) {
    logger.error('Error in validateSessionId middleware:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error during validation',
      code: 'VALIDATION_ERROR'
    })
  }
}

// Rate limiting middleware (simple in-memory implementation)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60 // 60 requests per minute

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  try {
    const clientId = req.ip || 'unknown'
    const now = Date.now()
    
    // Clean up old entries
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime) {
        rateLimitStore.delete(key)
      }
    }
    
    // Check current client's rate limit
    const clientData = rateLimitStore.get(clientId)
    
    if (!clientData) {
      // First request from this client
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW
      })
      next()
      return
    }
    
    if (now > clientData.resetTime) {
      // Reset window
      rateLimitStore.set(clientId, {
        count: 1,
        resetTime: now + RATE_LIMIT_WINDOW
      })
      next()
      return
    }
    
    if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
      // Rate limit exceeded
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      })
      return
    }
    
    // Increment count
    clientData.count++
    next()
    
  } catch (error) {
    logger.error('Error in rateLimit middleware:', error)
    // Don't block request on rate limit error
    next()
  }
}

