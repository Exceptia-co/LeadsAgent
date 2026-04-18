// Lead types
export interface Lead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string;
  status: LeadStatus;
  source: string | null;
  score: number | null;
  whatsappAuthorized?: boolean | null;
  createdAt: string;
  updatedAt: string;
  conversation?: Conversation | null;
}

export type LeadStatus = "NUEVO" | "CONTACTADO" | "QUALIFIED" | "GANADO" | "PERDIDO";

export interface Conversation {
  id: string;
  leadId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    messages: number;
  };
}

export interface Message {
  id: string;
  conversationId: string;
  content: string;
  fromUser: boolean;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

// API Response types
export interface LeadsResponse {
  leads: Lead[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface LeadStatsResponse {
  total: number;
  averageScore: number;
  byStatus: Record<LeadStatus, number>;
}

// Form types
export interface CreateLeadData {
  name?: string;
  email?: string;
  phone: string;
  status?: LeadStatus;
  source?: string;
}

export interface UpdateLeadData {
  name?: string;
  email?: string;
  phone?: string;
  status?: LeadStatus;
  source?: string;
  score?: number;
}

// UI Component types
export interface TableColumn<T> {
  key: keyof T;
  header: string;
  width?: string;
  render?: (value: any, item: T) => React.ReactNode;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
}

// Status badge variants
export const STATUS_VARIANTS: Record<
  LeadStatus,
  "default" | "secondary" | "success" | "warning" | "destructive"
> = {
  NUEVO: "default",
  CONTACTADO: "secondary",
  QUALIFIED: "warning",
  GANADO: "success",
  PERDIDO: "destructive",
};

// Status labels for UI
export const STATUS_LABELS: Record<LeadStatus, string> = {
  NUEVO: "Nuevo",
  CONTACTADO: "Contactado",
  QUALIFIED: "Calificado",
  GANADO: "Ganado",
  PERDIDO: "Perdido",
};

// Sorting types
export type SortOrder = "asc" | "desc";
export type SortableLeadField =
  | "name"
  | "phone"
  | "status"
  | "score"
  | "createdAt"
  | "updatedAt"
  | "whatsappAuthorized";

export interface LeadSortConfig {
  sortBy?: SortableLeadField;
  sortOrder?: SortOrder;
}

// Bulk actions types
export interface BulkUpdateWhatsAppData {
  leadIds: string[];
  whatsappAuthorized: boolean;
}

// WhatsApp types
export interface WhatsAppSession {
  id: string;
  name?: string;
  status: "DISCONNECTED" | "AUTH_INVALID" | "CONNECTING" | "CONNECTED" | "QR_READY" | "QR_PENDING";
  qr?: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
  lastSeen?: string;
  lastHeartbeat?: string;
  backupStatus?: {
    hasBackup: boolean;
    lastBackupDate?: string;
    sizeBytes?: number;
  };
}

export interface WhatsAppMessage {
  id: string;
  sessionId: string;
  phone: string;
  content: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: "text" | "image" | "document" | "audio" | "video";
  status: "sent" | "delivered" | "read" | "failed" | "received";
  timestamp: string;
  createdAt: string;
}

export interface MessageAnalytics {
  totalSent: number;
  totalReceived: number;
  byStatus: Record<string, number>;
  byHour: Record<string, number>;
  topContacts: Array<{
    phone: string;
    count: number;
    lastMessage: string;
  }>;
}

export interface SendMessageData {
  sessionId: string;
  phone: string;
  message: string;
  type?: "text" | "image" | "document" | "audio" | "video";
}
