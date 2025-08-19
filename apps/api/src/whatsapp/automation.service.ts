import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { WhatsAppService } from './whatsapp.service'

interface AutoResponseRule {
  id: string
  name: string
  trigger: 'keyword' | 'status_change' | 'time_based' | 'first_message'
  conditions: {
    keywords?: string[]
    statuses?: string[]
    timeDelay?: number // in minutes
    priority?: number
  }
  response: {
    message: string
    type: 'text' | 'template'
    delay?: number // in seconds
  }
  isActive: boolean
}

interface WorkflowRule {
  id: string
  name: string
  trigger: 'lead_created' | 'status_changed' | 'message_received' | 'no_response'
  conditions: any
  actions: {
    type: 'send_message' | 'update_lead' | 'assign_user' | 'add_tag' | 'schedule_followup'
    params: any
  }[]
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name)
  
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WhatsAppService))
    private whatsAppService: WhatsAppService
  ) {}

  async processIncomingMessage(lead: any, message: string, sessionId: string): Promise<void> {
    try {
      // Process auto-responses
      await this.processAutoResponses(lead, message, sessionId)
      
      // Process workflows
      await this.processWorkflows('message_received', { lead, message, sessionId })
      
    } catch (error) {
      this.logger.error('Error processing automation:', error)
    }
  }

  async processLeadCreated(lead: any, sessionId: string): Promise<void> {
    try {
      // Welcome message for new leads
      await this.sendWelcomeMessage(lead, sessionId)
      
      // Process workflows
      await this.processWorkflows('lead_created', { lead, sessionId })
      
    } catch (error) {
      this.logger.error('Error processing lead creation automation:', error)
    }
  }

  async processStatusChange(lead: any, oldStatus: string, newStatus: string, sessionId: string): Promise<void> {
    try {
      // Send status-specific messages
      await this.processStatusChangeResponses(lead, oldStatus, newStatus, sessionId)
      
      // Process workflows
      await this.processWorkflows('status_changed', { lead, oldStatus, newStatus, sessionId })
      
    } catch (error) {
      this.logger.error('Error processing status change automation:', error)
    }
  }

  private async processAutoResponses(lead: any, message: string, sessionId: string): Promise<void> {
    // In production, this would fetch from database
    // For now, using hardcoded rules
    const autoResponseRules: AutoResponseRule[] = [
      {
        id: '1',
        name: 'Greeting Response',
        trigger: 'keyword',
        conditions: {
          keywords: ['hola', 'buenos días', 'buenas tardes', 'buenas noches', 'hi', 'hello'],
          priority: 1
        },
        response: {
          message: `¡Hola ${lead.name || ''}! 👋 Gracias por contactarnos. Soy tu asistente virtual y estoy aquí para ayudarte. ¿En qué puedo asistirte hoy?`,
          type: 'text',
          delay: 2
        },
        isActive: true
      },
      {
        id: '2',
        name: 'Pricing Inquiry',
        trigger: 'keyword',
        conditions: {
          keywords: ['precio', 'costo', 'cuánto', 'tarifa', 'cotización', 'presupuesto'],
          priority: 2
        },
        response: {
          message: 'Te ayudo con información sobre precios. 💰\\n\\n¿Podrías decirme qué producto o servicio específico te interesa? Así podremos darte la información más precisa.',
          type: 'text',
          delay: 1
        },
        isActive: true
      },
      {
        id: '3',
        name: 'Information Request',
        trigger: 'keyword',
        conditions: {
          keywords: ['información', 'detalles', 'cuéntame', 'explícame', 'qué', 'cómo'],
          priority: 3
        },
        response: {
          message: '📋 Perfecto, me encanta ayudarte con información.\\n\\n¿Sobre qué aspecto específico te gustaría conocer más detalles?',
          type: 'text',
          delay: 1
        },
        isActive: true
      },
      {
        id: '4',
        name: 'Purchase Intent',
        trigger: 'keyword',
        conditions: {
          keywords: ['quiero comprar', 'necesito', 'adquirir', 'contratar', 'comprar'],
          priority: 1
        },
        response: {
          message: '🎉 ¡Excelente! Me da mucho gusto saber que estás interesado en nuestros productos.\\n\\nUn especialista se pondrá en contacto contigo muy pronto para ayudarte con el proceso de compra.',
          type: 'text',
          delay: 1
        },
        isActive: true
      },
      {
        id: '5',
        name: 'Support Request',
        trigger: 'keyword',
        conditions: {
          keywords: ['ayuda', 'problema', 'soporte', 'no funciona', 'error', 'issue'],
          priority: 2
        },
        response: {
          message: '🛠️ Entiendo que necesitas ayuda. No te preocupes, estamos aquí para solucionarlo.\\n\\n¿Podrías describir brevemente el problema que estás experimentando?',
          type: 'text',
          delay: 1
        },
        isActive: true
      }
    ]

    const lowerMessage = message.toLowerCase()
    
    // Find matching rule with highest priority
    const matchingRule = autoResponseRules
      .filter(rule => rule.isActive)
      .filter(rule => {
        if (rule.trigger === 'keyword' && rule.conditions.keywords) {
          return rule.conditions.keywords.some(keyword => 
            lowerMessage.includes(keyword.toLowerCase())
          )
        }
        return false
      })
      .sort((a, b) => (a.conditions.priority || 999) - (b.conditions.priority || 999))[0]

    if (matchingRule) {
      // Schedule the response
      setTimeout(async () => {
        await this.whatsAppService.sendMessage(
          sessionId, 
          lead.phone, 
          matchingRule.response.message
        )
        
        this.logger.log(`Auto response "${matchingRule.name}" sent to lead ${lead.id}`)
        
        // Update lead if it's a high-priority response
        if (matchingRule.conditions.priority === 1) {
          await this.updateLeadPriority(lead.id, matchingRule.name)
        }
        
      }, (matchingRule.response.delay || 1) * 1000)
    }
  }

  private async sendWelcomeMessage(lead: any, sessionId: string): Promise<void> {
    const welcomeMessage = `🎉 ¡Bienvenido ${lead.name}!

Gracias por contactarnos. Hemos recibido tu mensaje y un miembro de nuestro equipo se pondrá en contacto contigo pronto.

Mientras tanto, aquí tienes algunas cosas que puedes hacer:
• Preguntarme sobre nuestros productos
• Solicitar información de precios
• Conocer más sobre nuestros servicios

¿En qué puedo ayudarte hoy? 😊`

    setTimeout(async () => {
      await this.whatsAppService.sendMessage(sessionId, lead.phone, welcomeMessage)
      this.logger.log(`Welcome message sent to new lead ${lead.id}`)
    }, 3000) // 3 second delay
  }

  private async processStatusChangeResponses(
    lead: any, 
    oldStatus: string, 
    newStatus: string, 
    sessionId: string
  ): Promise<void> {
    const statusMessages: Record<string, string> = {
      'QUALIFIED': `🎯 Excelente ${lead.name}! Hemos calificado tu consulta como prioritaria.

Un especialista senior se pondrá en contacto contigo en las próximas 2 horas para brindarte atención personalizada.`,

      'HOT': `🔥 ¡Perfecto ${lead.name}! Detectamos que tienes una alta intención de compra.

Te conectaremos inmediatamente con nuestro equipo de ventas para acelerar el proceso.`,

      'COLD': `❄️ Entendemos que tal vez ahora no sea el momento ideal ${lead.name}.

No te preocupes, estaremos aquí cuando estés listo. ¿Te gustaría recibir información periódica sobre nuestras ofertas?`
    }

    if (newStatus in statusMessages && oldStatus !== newStatus) {
      setTimeout(async () => {
        await this.whatsAppService.sendMessage(sessionId, lead.phone, statusMessages[newStatus])
        this.logger.log(`Status change message sent to lead ${lead.id} (${oldStatus} -> ${newStatus})`)
      }, 2000)
    }
  }

  private async processWorkflows(trigger: string, context: any): Promise<void> {
    // In production, this would fetch workflows from database
    // For now, using hardcoded workflows
    const workflows: WorkflowRule[] = [
      {
        id: 'follow_up_hot_leads',
        name: 'Follow up hot leads',
        trigger: 'status_changed',
        conditions: {
          newStatus: 'HOT'
        },
        actions: [
          {
            type: 'schedule_followup',
            params: {
              delay: 60, // 1 hour
              message: '👋 Hola de nuevo! ¿Has tenido oportunidad de revisar la información que te enviamos?'
            }
          }
        ]
      },
      {
        id: 'assign_qualified_leads',
        name: 'Assign qualified leads to sales team',
        trigger: 'status_changed',
        conditions: {
          newStatus: 'QUALIFIED'
        },
        actions: [
          {
            type: 'assign_user',
            params: {
              role: 'sales'
            }
          }
        ]
      }
    ]

    const matchingWorkflows = workflows.filter(workflow => 
      workflow.trigger === trigger && this.evaluateConditions(workflow.conditions, context)
    )

    for (const workflow of matchingWorkflows) {
      await this.executeWorkflowActions(workflow.actions, context)
    }
  }

  private evaluateConditions(conditions: any, context: any): boolean {
    // Simple condition evaluation
    if (conditions.newStatus && context.newStatus) {
      return conditions.newStatus === context.newStatus
    }
    
    // Add more condition types as needed
    return true
  }

  private async executeWorkflowActions(actions: any[], context: any): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'schedule_followup':
            await this.scheduleFollowUp(context.lead, action.params, context.sessionId)
            break
          
          case 'assign_user':
            await this.assignToUser(context.lead.id, action.params)
            break
          
          case 'add_tag':
            await this.addTag(context.lead.id, action.params.tag)
            break
          
          default:
            this.logger.warn(`Unknown workflow action type: ${action.type}`)
        }
      } catch (error) {
        this.logger.error(`Error executing workflow action ${action.type}:`, error)
      }
    }
  }

  private async scheduleFollowUp(lead: any, params: any, sessionId: string): Promise<void> {
    const delay = params.delay * 60 * 1000 // Convert minutes to milliseconds
    
    setTimeout(async () => {
      await this.whatsAppService.sendMessage(sessionId, lead.phone, params.message)
      this.logger.log(`Scheduled follow-up message sent to lead ${lead.id}`)
    }, delay)
  }

  private async assignToUser(leadId: string, params: any): Promise<void> {
    // In a real implementation, this would find an available user with the specified role
    // For now, just log the action
    this.logger.log(`Lead ${leadId} should be assigned to user with role: ${params.role}`)
    
    // TODO: Implement user assignment logic
    // const availableUser = await this.findAvailableUser(params.role)
    // if (availableUser) {
    //   await this.prisma.lead.update({
    //     where: { id: leadId },
    //     data: { userId: availableUser.clerkId }
    //   })
    // }
  }

  private async addTag(leadId: string, tag: string): Promise<void> {
    try {
      const lead = await this.prisma.lead.findUnique({
        where: { id: leadId }
      })
      
      if (lead) {
        const currentTags = lead.tags ? JSON.parse(lead.tags) : []
        if (!currentTags.includes(tag)) {
          currentTags.push(tag)
          
          await this.prisma.lead.update({
            where: { id: leadId },
            data: { tags: JSON.stringify(currentTags) }
          })
          
          this.logger.log(`Tag "${tag}" added to lead ${leadId}`)
        }
      }
    } catch (error) {
      this.logger.error(`Error adding tag to lead ${leadId}:`, error)
    }
  }

  private async updateLeadPriority(leadId: string, reason: string): Promise<void> {
    try {
      // Add priority tag or update score based on the auto-response trigger
      await this.addTag(leadId, `priority:${reason}`)
      
      // Optionally update the lead score
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { 
          score: 0.8 // Higher score for leads that trigger priority responses
        }
      })
    } catch (error) {
      this.logger.error(`Error updating lead priority ${leadId}:`, error)
    }
  }
}
