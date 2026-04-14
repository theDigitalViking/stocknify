import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Stock' }

export default function StockPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inventory Overview</h1>
      <div className="rounded-md border border-dashed border-border p-12 text-center text-muted-foreground">
        Stock dashboard — implement in Phase 2
      </div>
    </div>
  )
}
