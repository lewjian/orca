import React from 'react'
import type { VirtualItem } from '@tanstack/react-virtual'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Row } from '../grouping/row-types'
import { translate } from '@/i18n/i18n'

type OverflowToggleRowArgs = {
  row: Extract<Row, { type: 'overflow-toggle' }>
  vItem: VirtualItem
  measureVirtualRowElement: (element: HTMLDivElement | null) => void
  onToggle: (sectionKey: string) => void
}

/** "Show N more / Show less" line that ends a collapsed project worktree list. */
export function renderOverflowToggleVirtualRow(args: OverflowToggleRowArgs): React.JSX.Element {
  const { row, vItem, measureVirtualRowElement, onToggle } = args
  const label = row.expanded
    ? translate('auto.components.sidebar.worktreeOverflow.showLess', 'Show less')
    : translate('auto.components.sidebar.worktreeOverflow.showMore', 'Show {count} more').replace(
        '{count}',
        String(row.hiddenCount)
      )
  const Chevron = row.expanded ? ChevronDown : ChevronRight
  return (
    <div
      key={vItem.key}
      role="presentation"
      data-worktree-virtual-row
      data-worktree-virtual-row-key={String(vItem.key)}
      data-worktree-virtual-row-start={vItem.start}
      data-index={vItem.index}
      ref={measureVirtualRowElement}
      className="absolute left-0 right-0 top-0"
      style={{ transform: `translateY(${vItem.start}px)` }}
    >
      <button
        type="button"
        data-worktree-overflow-toggle={row.sectionKey}
        onClick={() => onToggle(row.sectionKey)}
        className="flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Chevron className="size-3 shrink-0" />
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </div>
  )
}
