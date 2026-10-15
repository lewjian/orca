import { describe, expect, it } from 'vitest'
import type { Worktree } from '../../../../../../shared/worktree/types'
import type { Repo } from '../../../../../../shared/repo-types'
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

type AppendOptions = NonNullable<Parameters<typeof appendWorktreeRows>[5]>

function appendRows(
  worktrees: Worktree[],
  options: Partial<
    Pick<AppendOptions, 'overflowVisibleLimit' | 'overflowExpandedKeys' | 'forceOpenWorktreeIds'>
  > = {}
) {
  const result: Row[] = []
  appendWorktreeRows(result, worktrees, repoMap, {}, new Map(), {
    nestLineage: false,
    collapsedGroups: new Set(),
    groupDepth: 0,
    sectionKey: 'repo:repo-1',
    cyclicLineageIds: new Set<string>(),
    ...options
  })
  return result
}

describe('per-project worktree overflow collapse', () => {
  it('shows a show-more toggle when a project has more worktrees than the limit', () => {
    const worktrees = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 2 }, (_, i) =>
      makeWorktree(`wt-${i}`)
    )
    const rows = appendRows(worktrees, { overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT })

    expect(rows.filter((row) => row.type === 'item')).toHaveLength(WORKTREE_GROUP_VISIBLE_LIMIT)
    const toggle = rows.find((row) => row.type === 'overflow-toggle')
    expect(toggle).toMatchObject({ hiddenCount: 2, expanded: false })
  })

  it('keeps short projects untouched', () => {
    const worktrees = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT }, (_, i) =>
      makeWorktree(`wt-${i}`)
    )
    const rows = appendRows(worktrees, { overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT })
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(WORKTREE_GROUP_VISIBLE_LIMIT)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toBeUndefined()
  })

  it('lists every worktree once the section is expanded, with a show-less toggle', () => {
    const worktrees = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 2 }, (_, i) =>
      makeWorktree(`wt-${i}`)
    )
    const rows = appendRows(worktrees, {
      overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT,
      overflowExpandedKeys: new Set(['repo:repo-1'])
    })
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(worktrees.length)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toMatchObject({ expanded: true })
  })

  it('never collapses a section holding a forced-open worktree', () => {
    const worktrees = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 2 }, (_, i) =>
      makeWorktree(`wt-${i}`)
    )
    const rows = appendRows(worktrees, {
      overflowVisibleLimit: WORKTREE_GROUP_VISIBLE_LIMIT,
      forceOpenWorktreeIds: new Set([worktrees.at(-1)!.id])
    })
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(worktrees.length)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toBeUndefined()
  })

  it('does not collapse when no limit is set (pinned and flat modes)', () => {
    const worktrees = Array.from({ length: WORKTREE_GROUP_VISIBLE_LIMIT + 5 }, (_, i) =>
      makeWorktree(`wt-${i}`)
    )
    const rows = appendRows(worktrees)
    expect(rows.filter((row) => row.type === 'item')).toHaveLength(worktrees.length)
    expect(rows.find((row) => row.type === 'overflow-toggle')).toBeUndefined()
  })
})
