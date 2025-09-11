import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import { UnifiedUser } from '../lib/auth/unified-auth'

/**
 * Hook personalizado para obtener el usuario unificado (Clerk + Supabase)
 */
export function useUnifiedUser() {
  const { user: clerkUser, isLoaded: clerkLoaded, isSignedIn } = useUser()
  const [unifiedUser, setUnifiedUser] = useState<UnifiedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!clerkLoaded) return

    const fetchUnifiedUser = async () => {
      if (!isSignedIn || !clerkUser) {
        setUnifiedUser(null)
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch('/api/auth/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const userData = await response.json()
        setUnifiedUser(userData.user)
      } catch (err) {
        console.error('Error fetching unified user:', err)
        setError(err instanceof Error ? err.message : 'Failed to load user data')
        setUnifiedUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUnifiedUser()
  }, [clerkLoaded, isSignedIn, clerkUser?.id])

  const updateSettings = async (settings: Record<string, any>) => {
    if (!unifiedUser) return false

    try {
      const response = await fetch('/api/users/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ settings })
      })

      if (!response.ok) {
        throw new Error('Failed to update settings')
      }

      // Actualizar el estado local
      setUnifiedUser(prev => prev ? {
        ...prev,
        settings: { ...prev.settings, ...settings }
      } : null)

      return true
    } catch (error) {
      console.error('Error updating settings:', error)
      return false
    }
  }

  const refreshUser = async () => {
    if (!isSignedIn || !clerkUser) return

    try {
      setIsLoading(true)
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const userData = await response.json()
        setUnifiedUser(userData.user)
      }
    } catch (error) {
      console.error('Error refreshing user:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    user: unifiedUser,
    clerkUser,
    isLoading,
    error,
    isAuthenticated: !!unifiedUser,
    updateSettings,
    refreshUser
  }
}

/**
 * Hook para obtener estadísticas del usuario actual
 */
export function useUserStats() {
  const [stats, setStats] = useState<{
    totalLeads: number
    activeLeads: number
    completionRate: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { user } = useUnifiedUser()

  useEffect(() => {
    if (!user) {
      setStats(null)
      setIsLoading(false)
      return
    }

    const fetchStats = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch('/api/users/stats', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const statsData = await response.json()
        setStats(statsData)
      } catch (err) {
        console.error('Error fetching user stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to load stats')
        setStats(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [user?.supabaseId])

  return {
    stats,
    isLoading,
    error
  }
}

/**
 * Hook para gestión de usuarios (solo para admins)
 */
export function useUserManagement() {
  const [users, setUsers] = useState<UnifiedUser[]>([])
  const [pagination, setPagination] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { user: currentUser } = useUnifiedUser()

  const fetchUsers = async (filters: any = {}, page = 1, limit = 20) => {
    if (!currentUser || currentUser.role !== 'admin') {
      setError('Access denied: Admin privileges required')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...filters
      })

      const response = await fetch(`/api/admin/users?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setUsers(data.users)
      setPagination(data.pagination)
    } catch (err) {
      console.error('Error fetching users:', err)
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setIsLoading(false)
    }
  }

  const updateUserRole = async (userId: string, role: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Access denied: Admin privileges required')
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role })
      })

      if (!response.ok) {
        throw new Error('Failed to update user role')
      }

      // Actualizar el estado local
      setUsers(prev => prev.map(user => 
        user.supabaseId === userId ? { ...user, role } : user
      ))

      return true
    } catch (error) {
      console.error('Error updating user role:', error)
      throw error
    }
  }

  const deactivateUser = async (userId: string) => {
    if (!currentUser || currentUser.role !== 'admin') {
      throw new Error('Access denied: Admin privileges required')
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}/deactivate`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (!response.ok) {
        throw new Error('Failed to deactivate user')
      }

      // Actualizar el estado local
      setUsers(prev => prev.map(user => 
        user.supabaseId === userId ? { ...user, isActive: false } : user
      ))

      return true
    } catch (error) {
      console.error('Error deactivating user:', error)
      throw error
    }
  }

  return {
    users,
    pagination,
    isLoading,
    error,
    fetchUsers,
    updateUserRole,
    deactivateUser
  }
}
