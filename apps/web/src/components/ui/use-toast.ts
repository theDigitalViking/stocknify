'use client'

// Minimal toast state — simplified shadcn variant, no action slot for Phase 3B.
import * as React from 'react'

import type { ToastProps } from './toast'

type ToasterToast = Omit<ToastProps, 'title'> & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
}

const TOAST_REMOVE_DELAY = 4000

type State = { toasts: ToasterToast[] }

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(newState: State): void {
  memoryState = newState
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

function genId(): string {
  return Math.random().toString(36).slice(2)
}

export function toast({
  title,
  description,
  variant,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  variant?: 'default' | 'destructive'
}): { id: string } {
  const id = genId()
  const newToast: ToasterToast = { id, title, description, variant, open: true }
  dispatch({ toasts: [newToast, ...memoryState.toasts].slice(0, 5) })
  setTimeout(() => {
    dispatch({ toasts: memoryState.toasts.filter((t) => t.id !== id) })
  }, TOAST_REMOVE_DELAY)
  return { id }
}

export function useToast(): { toasts: ToasterToast[]; toast: typeof toast } {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return (): void => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return { toasts: state.toasts, toast }
}
