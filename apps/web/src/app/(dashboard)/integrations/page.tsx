import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Integrations' }

export default function IntegrationsPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Integrations</h1>
      <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
        Integration management — implement in Phase 2
      </div>
    </div>
  )
}
