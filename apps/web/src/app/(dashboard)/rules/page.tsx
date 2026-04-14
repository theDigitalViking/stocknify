import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Rules' }

export default function RulesPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Alert Rules</h1>
      <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
        Rule builder — implement in Phase 2
      </div>
    </div>
  )
}
