import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
        Tenant settings, billing, and user management — implement in Phase 2
      </div>
    </div>
  )
}
