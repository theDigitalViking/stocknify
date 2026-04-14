import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Notifications' }

export default function NotificationsPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Notification Channels</h1>
      <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
        Notification channel settings — implement in Phase 2
      </div>
    </div>
  )
}
