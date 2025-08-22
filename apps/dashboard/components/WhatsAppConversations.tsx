'use client'

import dynamic from 'next/dynamic'

// Importar dinámicamente la página de conversaciones para evitar problemas de SSR
const WhatsAppConversationsPage = dynamic(
  () => import('../app/dashboard/whatsapp/conversations/page'),
  { 
    ssr: false,
    loading: () => (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    )
  }
)

export default function WhatsAppConversations() {
  return <WhatsAppConversationsPage />
}
