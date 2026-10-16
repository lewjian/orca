import { describe, expect, it } from 'vitest'
import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type {
  WorktreeOccurrence,
  WorktreeOccurrencePlan
} from '../../../../../../shared/worktree-occurrence-plan'
import type { Row } from './row-types'
import { appendWorktreeRows } from './row-builders'
import { WORKTREE_GROUP_VISIBLE_LIMIT } from './row-types'

const repo: Repo = {
  id: 'repo-1',
  path: '/repos/repo-1',
  displayName: 'repo-1',
  badgeColor: '#000',
  addedAt: 1
}

const repoMap = new Map([['repo-1', repo]])

const makeWorktree = (id: string): Worktree => ({
  id: `repo-1::/ws/${id}`,
  repoId: repo.id,
  path: `/ws/${id}`,
  head: 'abc123',
  branch: `refs/heads/${id}`,
  isBare: false,
  isMainWorktree: false,
  displayName: id,
  comment: '',
  linkedIssue: null,
  linkedPR: null,
  linkedLinearIssue: null,
  linkedGitLabMR: null,
  linkedGitLabIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
})

type Occurrence = WorktreeOccurrence<Worktree>

function makeOccurrence(id: string, depth: number): Occurrence {
  const worktree = makeWorktree(id)
  return {
    key: `repo:repo-1:${worktree.id}`,
    row: worktree,
    sectionKey: 'repo:repo-1',
    placement: 'natural',
    sectionPath: { key: 'repo:repo-1' },
    depth,
    childCount: 0,
    isLastChild: false,
    showProjectName: false
  }
}

function makePlan(occurrences: readonly Occurrence[]): WorktreeOccurrencePlan<Worktree> {
  return { bySection: new Map([['repo:repo-1', occurrences]]), preferredByIdentity: new Map() }
}

function appendRows(
  occurrences: readonly Occurrence[],
  options: {
    overflowVisibleLimit?: number
    overflowExpandedKeys?: ReadonlySet<string>
    forceOpenWorktreeIds?: ReadonlySet<string>
  } = {}
) {
  const result: Row[] = []
  appendWorktreeRows(result, repoMap, makePlan(occurrences), {
    collapsedGroups: new Set(),
    groupDepth: 0,
    sectionKey: 'repo:repo-1',
    ...options
  })
  return result
}

describe('per-project worktree overflow collapse', () => {
  it('shows a show-more toggle when a project has more worktrees than the limit', () => {
    const occurrences = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 2 }, (_, i) =>
      makeOccurrence(`wt-${i}`, 0)
    )
    const rows = appendRows(occurrences, {
      overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT
    })

    expect(rows.filter((row) => row.type === 'item')).toHaveLength(WORKTREE_GROUP_VISIBLE_LIMIT)
    const toggle = rows.find((row) => row.type === 'overflow-toggle')
    expect(toggle).toMatchObject({ hiddenCount: 2, expanded: false })
  })

  it('keeps lineage children attached to their kept root and fixes the tail chrome', () => {
    // Root 0 with one child, root 1, root 2, root 3: limit 3 keeps root 0 (with child), 1, 2.
    const occurrences = [
      makeOccurrence('root-0', 0),
      makeOccurrence('child-0', 1),
      makeOccurrence('root-1', 0),
      makeOccurrence('root-2', 0),
      makeOccurrence('root-3', 0)
    ]
    const rows = appendRows(occurrences, { overflowVisibleLimit: 3 })

    const items = rows.filter((row) => row.type === 'item')
    expect(items).toHaveLength(4)
    // The truncated tail (root 2) must read as the last row of its lineage.
    const keptItems = rows.filter(
      (row): row is Extract<(typeof rows)[number], { type: 'item' }> => row.type === 'item'
    )
    // Why the tail: a truncated list must end its lineage chrome on the last kept row.
    const lastKept = keptItems.at(-1)
    expect(lastKept?.isLastLineageChild).toBe(true)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toMatchObject({
      hiddenCount: 1
    })
  })

  it('keeps short projects untouched', () => {
    const occurrences = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT }, (_, i) =>
      makeOccurrence(`wt-${i}`, 0)
    )
    const rows = appendRows(occurrences, {
      overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT
    })
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(WORKTREE_GROUP_VISIBLE_LIMIT)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toBeUndefined()
  })

  it('lists every occurrence once the section is expanded, with a show-less toggle', () => {
    const occurrences = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 2 }, (_, i) =>
      makeOccurrence(`wt-${i}`, 0)
    )
    const rows = appendRows(occurrences, {
      overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT,
      overflowExpandedKeys: new Set(['repo:repo-1'])
    })
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(occurrences.length)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toMatchObject({ expanded: true })
  })

  it('never collapses a section holding a forced-open worktree', () => {
    const occurrences = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 2 }, (_, i) =>
      makeOccurrence(`wt-${i}`, 0)
    )
    const rows = appendRows(occurrences, {
      overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT,
      forceOpenWorktreeIds: new Set([occurrences.at(-1)!.row.id])
    })
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(occurrences.length)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toBeUndefined()
  })

  it('does not collapse when no limit is set (pinned and flat modes)', () => {
    const occurrences = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 5 }, (_, i) =>
      makeOccurrence(`wt-${i}`, 0)
    )
    const rows = appendRows(occurrences)
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(occurrences.length)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toBeUndefined()
  })
})
