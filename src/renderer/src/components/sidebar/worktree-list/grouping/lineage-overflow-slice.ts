import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'

export type LineageOverflowSlice = {
  emittedRoots: Worktree[]
  /** Worktrees hidden behind the toggle (cut roots plus their descendants). */
  hiddenCount: number
  showToggle: boolean
  collapsed: boolean
}

/** Keeps the first `limit` root trees (descendants included) of a lineage section and
 *  reports what the toggle row should show; a forced-open worktree disables collapsing. */
export function sliceLineageOverflow(args: {
  worktrees: readonly Worktree[]
  roots: readonly Worktree[]
  childrenByParentIdentity: ReadonlyMap<string, Worktree[]>
  limit: number
  expanded: boolean
  forceOpenWorktreeIds?: ReadonlySet<string>
}): LineageOverflowSlice {
  const overLimit =
    args.limit > 0 &&
    args.roots.length > args.limit &&
    !args.worktrees.some((worktree) => args.forceOpenWorktreeIds?.has(worktree.id))
  const collapsed = overLimit && !args.expanded

  if (!collapsed) {
    return {
      emittedRoots: [...args.roots],
      hiddenCount: 0,
      showToggle: overLimit,
      collapsed
    }
  }

  const keptIds = new Set<string>()
  const keepWithDescendants = (root: Worktree): void => {
    const identity = getWorktreeHostIdentity(root)
    if (keptIds.has(identity)) {
      return
    }
    keptIds.add(identity)
    for (const child of args.childrenByParentIdentity.get(identity) ?? []) {
      keepWithDescendants(child)
    }
  }
  for (const root of args.roots.slice(0, args.limit)) {
    keepWithDescendants(root)
  }

  return {
    emittedRoots: args.roots.filter((root) => keptIds.has(getWorktreeHostIdentity(root))),
    hiddenCount: args.worktrees.length - keptIds.size,
    showToggle: true,
    collapsed
  }
}
