// Lead types
export interface Lead {
  id: string
  name: string
  phone: string
  status: LeadStatus
  score: number | null
  createdAt: string
  updatedAt: string
  conversation?: Conversation | null
}

export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST'

export interface Conversation {
  id: string
  leadId: string
  createdAt: string
  updatedAt: string
  _count?: {
    messages: number
  }
}

export interface Message {
  id: string
  conversationId: string
  content: string
  fromUser: boolean
  timestamp: string
  createdAt: string
  updatedAt: string
}

// API Response types
export interface LeadsResponse {
  leads: Lead[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface LeadStatsResponse {
  total: number
  averageScore: number
  byStatus: Record<LeadStatus, number>
}

// Form types
export interface CreateLeadData {
  name: string
  phone: string
  status?: LeadStatus
}

export interface UpdateLeadData {
  name?: string
  phone?: string
  status?: LeadStatus
  score?: number
}

// UI Component types
export interface TableColumn<T> {
  key: keyof T
  header: string
  width?: string
  render?: (value: any, item: T) => React.ReactNode
}

export interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  hasNext: boolean
  hasPrev: boolean
}

// Status badge variants
export const STATUS_VARIANTS: Record<LeadStatus, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  NEW: 'default',
  CONTACTED: 'secondary', 
  QUALIFIED: 'warning',
  CONVERTED: 'success',
  LOST: 'destructive'
}

// Status labels for UI
export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Nuevo',
  CONTACTED: 'Contactado',
  QUALIFIED: 'Calificado', 
  CONVERTED: 'Convertido',
  LOST: 'Perdido'
}
