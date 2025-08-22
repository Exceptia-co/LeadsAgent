import useSWR from 'swr'
import { useAuth } from '@clerk/nextjs'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Helper para obtener el token de Clerk
const getAuthHeaders = async (getToken?: () => Promise<string | null>) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  if (getToken) {
    try {
      const token = await getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    } catch (error) {
      console.warn('Error getting auth token:', error)
    }
  }
  
  return headers
}

// Configuración del fetcher para SWR
const createFetcher = (getToken?: () => Promise<string | null>) => async (url: string) => {
  const headers = await getAuthHeaders(getToken)
  
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers,
  })
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  return response.json()
}

// Función helper para POST/PUT/PATCH requests
const createMutate = (getToken?: () => Promise<string | null>) => async (url: string, options: RequestInit = {}) => {
  const headers = await getAuthHeaders(getToken)
  
  const response = await fetch(`${API_BASE_URL}${url}`, {
    headers: {
      ...headers,
      ...options.headers,
    },
    ...options,
  })
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  
  return response.json()
}

// Hooks para diferentes endpoints
export const useLeads = (page = 1, limit = 20) => {
  // Temporalmente usar endpoint público hasta arreglar autenticación
  const { data, error, mutate: refetch } = useSWR(
    `/api/public/leads?page=${page}&limit=${limit}`,
    async (url: string) => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return response.json()
    }
  )
  
  return {
    leads: data?.data || [], // La API devuelve data: [...]
    pagination: data?.meta,
    isLoading: !error && !data,
    isError: error,
    refetch,
  }
}

export const useLeadStats = () => {
  // Temporalmente usar endpoint público hasta arreglar autenticación
  const { data, error, mutate: refetch } = useSWR('/api/public/leads/stats', async (url: string) => {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response.json()
  })
  
  return {
    stats: data,
    isLoading: !error && !data,
    isError: error,
    refetch,
  }
}

export const useLead = (id: string) => {
  const { getToken } = useAuth()
  const fetcher = createFetcher(getToken)
  
  const { data, error, mutate: refetch } = useSWR(
    id ? `/leads/${id}` : null,
    fetcher
  )
  
  return {
    lead: data,
    isLoading: !error && !data,
    isError: error,
    refetch,
  }
}

// Custom hook para obtener las funciones de mutación autenticadas
export const useAuthenticatedApi = () => {
  const { getToken } = useAuth()
  const mutate = createMutate(getToken)
  
  return {
    createLead: async (leadData: {
      name: string
      phone: string
      status?: string
    }) => {
      return mutate('/leads', {
        method: 'POST',
        body: JSON.stringify(leadData),
      })
    },
    
    updateLead: async (id: string, updates: Record<string, any>) => {
      return mutate(`/leads/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      })
    },
    
    updateLeadStatus: async (id: string, status: string) => {
      return mutate(`/leads/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
    },
    
    deleteLead: async (id: string) => {
      return mutate(`/leads/${id}`, {
        method: 'DELETE',
      })
    },
  }
}

// Funciones compatibles hacia atrás (deprecadas - usar useAuthenticatedApi)
export const createLead = async (leadData: {
  name: string
  phone: string
  status?: string
}) => {
  console.warn('createLead is deprecated. Use useAuthenticatedApi() hook instead.')
  const mutate = createMutate()
  return mutate('/leads', {
    method: 'POST',
    body: JSON.stringify(leadData),
  })
}

export const updateLead = async (id: string, updates: Record<string, any>) => {
  console.warn('updateLead is deprecated. Use useAuthenticatedApi() hook instead.')
  const mutate = createMutate()
  return mutate(`/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export const updateLeadStatus = async (id: string, status: string) => {
  console.warn('updateLeadStatus is deprecated. Use useAuthenticatedApi() hook instead.')
  const mutate = createMutate()
  return mutate(`/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export const deleteLead = async (id: string) => {
  console.warn('deleteLead is deprecated. Use useAuthenticatedApi() hook instead.')
  const mutate = createMutate()
  return mutate(`/leads/${id}`, {
    method: 'DELETE',
  })
}

// Export the base functions for custom usage
export { createFetcher, createMutate }
