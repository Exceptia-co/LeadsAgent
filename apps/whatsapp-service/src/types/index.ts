export interface WhatsAppMessage {
  id: string
  from: string
  to: string
  body: string
  timestamp: number
  type: 'text' | 'image' | 'audio' | 'video' | 'document'
  mediaUrl?: string
  isGroup: boolean
  fromMe: boolean
}

export interface WhatsAppContact {
  id: string
  name: string
  number: string
  profilePic?: string
  isBlocked: boolean
}

export interface WhatsAppSession {
  id: string
  clientId: string
  status: 'disconnected' | 'connecting' | 'connected' | 'authenticated' | 'auth_failure' | 'ready'
  qrCode?: string
  lastSeen: Date
  webhookUrl?: string
}

export interface WebhookPayload {
  event: 'message' | 'status_change' | 'qr_updated' | 'authenticated' | 'disconnected'
  sessionId: string
  data: any
  timestamp: string
}

export interface SendMessageRequest {
  to: string
  message: string
  sessionId?: string
}

export interface SendMessageResponse {
  success: boolean
  messageId?: string
  error?: string
}

export interface SessionStatus {
  sessionId: string
  status: WhatsAppSession['status']
  qrCode?: string
  lastSeen: Date
  connectedNumber?: string
}

export interface WhatsAppConfig {
  sessionPath: string
  puppeteerOptions: {
    headless: boolean
    args: string[]
  }
  webhookUrl?: string
  apiBaseUrl: string
  redis: {
    url: string
    prefix: string
  }
}
