'use client'

import { ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface HorizontalScrollFadeProps {
  children: ReactNode
  className?: string
}

// Wraps content that may overflow horizontally (e.g. min-width tables inside
// narrow containers like the Quick-View Sheet) and paints a right-edge fade
// when there's still content to scroll to. The fade hides once the inner
// scroll area is at its rightmost position so the cue disappears as soon as
// the user has reached the end. The chevron icon makes the affordance
// noticeable at a glance — the gradient alone read as a visual artifact in
// production.
export function HorizontalScrollFade({
  children,
  className,
}: HorizontalScrollFadeProps): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = (): void => {
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])

  return (
    <div className={cn('relative rounded-md border border-border', className)}>
      <div ref={scrollRef} className="overflow-x-auto rounded-md">
        {children}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-14 rounded-r-md bg-gradient-to-l from-background via-background/95 to-transparent flex items-center justify-end pr-2 transition-opacity duration-200',
          canScrollRight ? 'opacity-100' : 'opacity-0',
        )}
      >
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}
