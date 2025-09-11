import { useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  title?: string
  message: string
  duration?: number
}

// This will be managed by a global toast provider
let toastListener: ((toast: Toast) => void) | null = null

export const setToastListener = (listener: ((toast: Toast) => void) | null) => {
  toastListener = listener
}

export const useToast = () => {
  const toast = useCallback((options: Omit<Toast, 'id'>) => {
    if (toastListener) {
      toastListener({
        ...options,
        id: Date.now().toString(),
        duration: options.duration || 5000,
      })
    }
  }, [])

  const success = useCallback((message: string, title?: string) => {
    toast({ type: 'success', message, title })
  }, [toast])

  const error = useCallback((message: string, title?: string) => {
    toast({ type: 'error', message, title })
  }, [toast])

  const info = useCallback((message: string, title?: string) => {
    toast({ type: 'info', message, title })
  }, [toast])

  const warning = useCallback((message: string, title?: string) => {
    toast({ type: 'warning', message, title })
  }, [toast])

  return {
    toast,
    success,
    error,
    info,
    warning,
  }
}
