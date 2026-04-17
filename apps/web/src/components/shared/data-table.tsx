import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface ColumnDef<T> {
  header: string
  accessor: keyof T | ((row: T) => ReactNode)
  className?: string
  render?: (row: T) => ReactNode
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  isLoading?: boolean
  skeletonRows?: number
  emptyIcon?: LucideIcon
  emptyTitle?: string
  emptyDescription?: string
  rowKey: (row: T) => string
}

export function DataTable<T>({
  columns,
  data,
  isLoading = false,
  skeletonRows = 8,
  emptyIcon: EmptyIcon,
  emptyTitle,
  emptyDescription,
  rowKey,
}: DataTableProps<T>): JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="h-9 border-b border-border">
            {columns.map((col) => (
              <th
                key={col.header}
                className={cn(
                  'text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 text-left',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: skeletonRows }).map((_, rowIdx) => (
                <tr key={`skeleton-${String(rowIdx)}`} className="h-9 border-b border-border">
                  {columns.map((col) => (
                    <td key={col.header} className={cn('px-4', col.className)}>
                      <div className="bg-muted animate-pulse rounded h-3 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : data.length === 0
              ? null
              : data.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className="h-9 border-b border-border hover:bg-muted/50 transition-colors"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className={cn('text-sm text-foreground px-4', col.className)}
                      >
                        {col.render
                          ? col.render(row)
                          : typeof col.accessor === 'function'
                            ? col.accessor(row)
                            : (row[col.accessor] as ReactNode)}
                      </td>
                    ))}
                  </tr>
                ))}
        </tbody>
      </table>
      {!isLoading && data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          {EmptyIcon ? <EmptyIcon className="h-8 w-8 mb-3 opacity-40" /> : null}
          {emptyTitle ? (
            <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
          ) : null}
          {emptyDescription ? <p className="text-xs mt-1">{emptyDescription}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
