// Redis Configuration for LeadsCRM WhatsApp Service
import Redis from 'ioredis'

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: 0, // Use DB 0 for WhatsApp service
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
})

// Redis Keys Structure
export const REDIS_KEYS = {
  // Session management
  WHATSAPP_SESSION: (sessionId: string) => `wa:session:${sessionId}`,
  SESSION_STATUS: (sessionId: string) => `wa:status:${sessionId}`,
  
  // Lead caching
  LEAD_BY_PHONE: (phone: string) => `lead:phone:${phone}`,
  LEAD_CONVERSATIONS: (leadId: string) => `lead:conv:${leadId}`,
  
  // Rate limiting
  RATE_LIMIT_PHONE: (phone: string) => `rate:phone:${phone}`,
  RATE_LIMIT_SESSION: (sessionId: string) => `rate:session:${sessionId}`,
  
  // AI processing queue
  AI_QUEUE: 'queue:ai_processing',
  AI_PRIORITY_QUEUE: 'queue:ai_priority',
  
  // Statistics
  STATS_MESSAGES_TODAY: 'stats:messages:today',
  STATS_LEADS_CONTACTED: 'stats:leads:contacted',
  STATS_AI_RESPONSES: 'stats:ai:responses'
} as const

// Utility functions
export class RedisService {
  // Cache lead data
  async cacheLeadData(phone: string, leadData: any, ttl: number = 300) {
    const key = REDIS_KEYS.LEAD_BY_PHONE(phone)
    await redis.setex(key, ttl, JSON.stringify(leadData))
  }
  
  // Get cached lead
  async getCachedLead(phone: string) {
    const key = REDIS_KEYS.LEAD_BY_PHONE(phone)
    const cached = await redis.get(key)
    return cached ? JSON.parse(cached) : null
  }
  
  // Rate limiting check
  async checkRateLimit(phone: string, maxRequests: number = 5, windowMinutes: number = 1): Promise<boolean> {
    const key = REDIS_KEYS.RATE_LIMIT_PHONE(phone)
    const current = await redis.incr(key)
    
    if (current === 1) {
      await redis.expire(key, windowMinutes * 60)
    }
    
    return current <= maxRequests
  }
  
  // Queue message for AI processing
  async queueAIMessage(messageData: any, priority: boolean = false) {
    const queueKey = priority ? REDIS_KEYS.AI_PRIORITY_QUEUE : REDIS_KEYS.AI_QUEUE
    await redis.lpush(queueKey, JSON.stringify(messageData))
  }
  
  // Update statistics
  async updateStats(statType: keyof typeof REDIS_KEYS, increment: number = 1) {
    await redis.incr(statType)
    
    // Set daily expiration for daily stats
    if (statType.includes('today')) {
      await redis.expireat(statType, this.getEndOfDayTimestamp())
    }
  }
  
  private getEndOfDayTimestamp(): number {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return Math.floor(tomorrow.getTime() / 1000)
  }
}

export default new RedisService()
