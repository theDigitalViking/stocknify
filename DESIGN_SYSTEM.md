# Stocknify — Design System

> This document defines the visual language for all Stocknify UI components.
> Every coding agent session that touches frontend code must read this document
> alongside PROJECT.md before writing any UI.
>
> Reference app: Linear (linear.app) — compact, data-dense, professional B2B SaaS.
> When in doubt, ask: "Would this feel at home in Linear?"

---

## 1. Design Principles

**Data-dense over spacious.** Merchants need to see as much inventory data as
possible without scrolling. Prefer compact row heights, tight spacing, and
multi-column layouts over cards with lots of whitespace.

**Functional over decorative.** Every visual element must earn its place by
communicating information or enabling interaction. No gradients, illustrations,
or decorative patterns in the application UI.

**Neutral base, purposeful color.** The UI is predominantly gray. Color is
reserved exclusively for status communication (green = good, red = critical,
amber = warning) and the brand accent (teal) for primary actions only.

**Subtle hierarchy.** Use font weight and color to establish hierarchy — not
size. Body text and table content are 13–14px. Only page titles go above 16px.

**Consistent, predictable interactions.** Hover states, focus rings, and
loading states follow a single pattern throughout the app. No surprises.

---

## 2. Color Tokens

All colors reference CSS variables defined in `globals.css` via shadcn/ui.
Never hardcode hex values in components — always use Tailwind token classes.

### Backgrounds

| Token | Tailwind class | Usage |
|-------|---------------|-------|
| `--background` | `bg-background` | Page background (white / near-black) |
| `--card` | `bg-card` | Panel, sidebar, modal backgrounds |
| `--muted` | `bg-muted` | Table row hover, subtle section backgrounds |
| `--accent` | `bg-accent` | Selected item background in lists/tables |

### Text

| Token | Tailwind class | Usage |
|-------|---------------|-------|
| `--foreground` | `text-foreground` | Primary text — headings, table data |
| `--muted-foreground` | `text-muted-foreground` | Secondary text — labels, metadata, placeholders |

### Border

| Token | Tailwind class | Usage |
|-------|---------------|-------|
| `--border` | `border-border` | All borders — table rows, inputs, dividers |

### Brand (Teal)

| Token | Tailwind class | Usage |
|-------|---------------|-------|
| `brand-500` | `bg-brand-500` | Primary action buttons only |
| `brand-600` | `bg-brand-600` | Button hover state |
| `brand-100` | `bg-brand-100` | Brand accent backgrounds (badges, highlights) |
| `brand-700` | `text-brand-700` | Brand text on light backgrounds |

### Semantic Status Colors

Used exclusively for status badges and alert indicators. Never for decoration.

| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| Success / OK | `bg-green-100` | `text-green-700` | Stock healthy, sync active |
| Warning | `bg-amber-100` | `text-amber-700` | Low stock, approaching threshold |
| Critical | `bg-red-100` | `text-red-700` | Out of stock, rule triggered |
| Info | `bg-blue-100` | `text-blue-700` | In transit, pending |
| Neutral | `bg-gray-100` | `text-gray-600` | Inactive, paused, expired |

---

## 3. Typography

Font: System sans-serif via `--font-sans` (Inter or system fallback).
Never use serif or monospace in application UI (only in code blocks).

| Role | Size | Weight | Class |
|------|------|--------|-------|
| Page title | 16px | 600 | `text-base font-semibold` |
| Section heading | 13px | 600 | `text-sm font-semibold text-foreground` |
| Table header | 12px | 500 | `text-xs font-medium text-muted-foreground uppercase tracking-wide` |
| Table data | 13px | 400 | `text-sm text-foreground` |
| Secondary / metadata | 12px | 400 | `text-xs text-muted-foreground` |
| Label | 13px | 500 | `text-sm font-medium` |
| Button | 13px | 500 | `text-sm font-medium` |

**Rule:** Nothing above `text-base` (16px) except the app name in the sidebar.
Use weight and color to create hierarchy, not size.

---

## 4. Spacing

Base unit: 4px (Tailwind default). Use multiples of 4.

| Context | Value | Tailwind |
|---------|-------|---------|
| Component internal padding (tight) | 8px | `p-2` |
| Component internal padding (normal) | 12px | `p-3` |
| Section padding | 16px | `p-4` |
| Page content padding | 24px | `p-6` |
| Between form fields | 16px | `space-y-4` |
| Table row height | 36px | `h-9` |
| Sidebar item height | 32px | `h-8` |

**Rule:** If a section feels too spacious, reduce by one step (e.g. `p-4` → `p-3`).
Stocknify is a data tool, not a marketing page.

---

## 5. Layout

### Shell

```
┌─────────────────────────────────────────────────┐
│ Sidebar (220px fixed) │ Main content area        │
│                       │                          │
│  Logo                 │  Page header (48px)      │
│  ─────────────────    │  ───────────────────     │
│  Nav items            │  Content                 │
│                       │                          │
│  ─────────────────    │                          │
│  Tenant / User        │                          │
└─────────────────────────────────────────────────┘
```

- Sidebar: `w-[220px]` fixed, `bg-card`, `border-r border-border`
- Main: `flex-1 overflow-auto`
- Page header: `h-12 border-b border-border px-6 flex items-center justify-between`
- Content area: `px-6 py-4`

### Page Header Pattern

Every page has a consistent header:
```tsx
<div className="h-12 border-b border-border px-6 flex items-center justify-between">
  <h1 className="text-base font-semibold">Page Title</h1>
  <div className="flex items-center gap-2">
    {/* Primary action button */}
  </div>
</div>
```

### Content Width

- Tables: full width, no max-width constraint
- Forms / settings: `max-w-2xl`
- Detail panels / modals: `max-w-lg` (simple) or `max-w-2xl` (complex)

---

## 6. Components

### Sidebar Navigation

```tsx
// Nav item — inactive
<div className="flex items-center gap-2 h-8 px-3 rounded-md text-sm
                text-muted-foreground hover:bg-muted hover:text-foreground
                cursor-pointer transition-colors">
  <Icon className="h-4 w-4" />
  <span>Label</span>
</div>

// Nav item — active
<div className="flex items-center gap-2 h-8 px-3 rounded-md text-sm
                bg-accent text-foreground font-medium cursor-pointer">
  <Icon className="h-4 w-4" />
  <span>Label</span>
</div>
```

### Tables

Tables are the most important UI element in Stocknify. They must be fast,
scannable, and compact.

```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-border">
      <th className="h-9 px-4 text-left text-xs font-medium
                     text-muted-foreground uppercase tracking-wide">
        Column
      </th>
    </tr>
  </thead>
  <tbody>
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="h-9 px-4 text-sm text-foreground">
        Value
      </td>
    </tr>
  </tbody>
</table>
```

**Table rules:**
- Row height: always `h-9` (36px)
- No zebra striping — use hover state only
- First column is always the primary identifier (SKU or name), slightly bolder
- Numeric columns (quantity) are right-aligned: `text-right tabular-nums`
- Actions column: right-aligned, icon buttons only, visible on row hover

### Status Badges

```tsx
// Generic badge pattern
<span className="inline-flex items-center px-2 py-0.5 rounded-full
                 text-xs font-medium bg-green-100 text-green-700">
  Active
</span>
```

Stock type badges use the colors defined in `stock_type_definitions.color`.
Render as small colored dot + label, not full badge, in dense table views:

```tsx
<span className="flex items-center gap-1.5 text-sm">
  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
  {label}
</span>
```

### Buttons

Use shadcn/ui `Button` component. Size variants:

| Variant | Usage |
|---------|-------|
| `default` (brand teal) | Primary page action (one per page max) |
| `outline` | Secondary actions, cancel |
| `ghost` | Icon buttons in tables, sidebar items |
| `destructive` | Delete, remove (in confirmation dialogs only) |

Size: always `size="sm"` in page headers and tables. `size="default"` in forms
and modals only.

### Inputs & Forms

- All inputs: `h-8` in dense contexts (filters, inline edits), `h-9` in forms
- Labels always above the input, never floating
- Error messages: `text-xs text-red-600 mt-1`
- Required fields: asterisk in label `<span className="text-red-500">*</span>`
- Form sections separated by `border-t border-border pt-4 mt-4`

### Empty States

When a table or list has no data:

```tsx
<div className="flex flex-col items-center justify-center py-16
                text-center text-muted-foreground">
  <Icon className="h-8 w-8 mb-3 opacity-40" />
  <p className="text-sm font-medium text-foreground">No items yet</p>
  <p className="text-xs mt-1">Description of what will appear here.</p>
  <Button size="sm" className="mt-4">Primary action</Button>
</div>
```

### Loading States

- Tables: render skeleton rows (same height as data rows) using `bg-muted animate-pulse`
- Page sections: skeleton blocks, never spinners
- Button loading: replace label with `<Loader2 className="h-4 w-4 animate-spin" />`
- Never show a full-page loading spinner

### Modals & Dialogs

Use shadcn/ui `Dialog`. Rules:
- Confirmation dialogs: `max-w-sm`, single action
- Create/edit forms: `max-w-lg`
- Complex wizards (integration setup): `max-w-2xl`
- Always include a clear title and close button
- Destructive confirmations: require typing the item name or clicking a red button

---

## 7. Icons

Library: `lucide-react` (already installed).
Size: always `h-4 w-4` in UI elements. `h-5 w-5` for empty state illustrations.

Standard icon assignments:

| Icon | Usage |
|------|-------|
| `Package` | Products |
| `Warehouse` | Locations / storage |
| `BarChart2` | Stock levels |
| `Bell` | Alerts / notifications |
| `Plug` | Integrations |
| `Sliders` | Rules |
| `Settings` | Settings |
| `ChevronDown` | Dropdowns |
| `ArrowUpDown` | Sortable columns |
| `Search` | Search inputs |
| `Plus` | Create actions |
| `Pencil` | Edit actions |
| `Trash2` | Delete actions |
| `RefreshCw` | Manual sync |
| `CheckCircle2` | Success status |
| `AlertTriangle` | Warning status |
| `XCircle` | Error / critical status |
| `Clock` | Pending / in transit |

---

## 8. Data Display Patterns

### Quantity Display

Always display quantities with their unit. Use `tabular-nums` for alignment.
Highlight critical quantities in red, warning in amber:

```tsx
function QuantityCell({ quantity, threshold }: { quantity: number; threshold?: number }) {
  const isCritical = threshold !== undefined && quantity <= 0
  const isWarning = threshold !== undefined && quantity > 0 && quantity <= threshold

  return (
    <span className={cn(
      'tabular-nums text-right',
      isCritical && 'text-red-600 font-medium',
      isWarning && 'text-amber-600 font-medium',
    )}>
      {quantity.toLocaleString('de-DE')}
    </span>
  )
}
```

### Timestamps

- Relative time for recent events (< 24h): "2 minutes ago"
- Date only for older events: "12 Apr"
- Full date + time in detail views: "12 Apr 2026, 14:32"
- Use `date-fns` (already in ecosystem via shadcn)

### Numbers & Currency

- Stock quantities: `de-DE` locale formatting (1.234,56)
- Prices: `€ 1.234,56` — always EUR, always with symbol before number
- Percentages: one decimal place maximum

---

## 9. Responsive Behavior

Stocknify is a desktop-first tool. The minimum supported viewport is 1280px.

- Sidebar: always visible, never collapsible on desktop
- Tables: horizontally scrollable on viewports < 1280px
- Modals: full-screen on mobile (not relevant for MVP)
- No hamburger menus or mobile navigation in MVP

---

## 10. Do's and Don'ts

### Do
- Use `cn()` utility for conditional class merging
- Use shadcn/ui primitives as the base for all components
- Keep components small and composable
- Use `text-muted-foreground` for anything secondary
- Right-align numeric columns
- Use `tabular-nums` for any column with numbers
- Use `transition-colors` on interactive elements

### Don't
- Don't use Tailwind colors outside the token system (no `text-slate-500` directly)
- Don't use `font-bold` — use `font-semibold` or `font-medium` maximum
- Don't add box shadows to cards or tables (use borders instead)
- Don't use `rounded-xl` or larger — use `rounded-md` maximum
- Don't center-align table content unless it's a status icon
- Don't add animations beyond `transition-colors` and skeleton pulses
- Don't use `absolute` or `fixed` positioning outside of modals and dropdowns
- Don't exceed 3 levels of visual hierarchy on any single page
