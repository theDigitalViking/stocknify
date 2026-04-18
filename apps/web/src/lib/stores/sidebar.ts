import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarStore {
  isCollapsed: boolean
  isMobileOpen: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
  openMobile: () => void
  closeMobile: () => void
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      isCollapsed: false,
      isMobileOpen: false,
      toggle: () => {
        set((s) => ({ isCollapsed: !s.isCollapsed }))
      },
      setCollapsed: (collapsed) => {
        set({ isCollapsed: collapsed })
      },
      openMobile: () => {
        set({ isMobileOpen: true })
      },
      closeMobile: () => {
        set({ isMobileOpen: false })
      },
    }),
    {
      name: 'stocknify-sidebar',
      partialize: (state) => ({ isCollapsed: state.isCollapsed }),
    },
  ),
)
