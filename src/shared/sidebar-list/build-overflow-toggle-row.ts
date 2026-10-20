import type { Repo } from '../repo-types'
import type { OverflowToggleRow } from './row-types'

/** The one overflow-toggle row constructor so flat and lineage emitters cannot diverge. */
export function buildOverflowToggleRow(args: {
  sectionKey: string
  repo: Repo | undefined
  hiddenCount: number
  expanded: boolean
}): OverflowToggleRow {
  return {
    type: 'overflow-toggle',
    key: `overflow:${args.sectionKey}`,
    sectionKey: args.sectionKey,
    repo: args.repo,
    hiddenCount: args.hiddenCount,
    expanded: args.expanded
  }
}

/** Shared collapse decision: over the cap, not user-expanded, nothing forced open. */
export function resolveWorktreeOverflow(args: {
  limit: number
  totalCount: number
  expanded: boolean
  anyForcedOpen: boolean
}): { collapsed: boolean; showToggle: boolean } {
  const overLimit = args.limit > 0 && args.totalCount > args.limit && !args.anyForcedOpen
  const collapsed = overLimit && !args.expanded
  return { collapsed, showToggle: overLimit }
}
