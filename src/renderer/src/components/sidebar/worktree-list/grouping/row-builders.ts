import type { Repo } from '../../../../../../shared/repo-types'
import type { Worktree } from '../../../../../../shared/worktree/types'
import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { getWorktreeLineageGroupKey } from './group-keys'
import {
  getExpandedWorktreeOccurrences,
  type WorktreeOccurrence,
  type WorktreeOccurrencePlan
} from '../../../../../../shared/worktree-occurrence-plan'
import { buildOverflowToggleRow } from './build-overflow-toggle-row'
import type { NoticeHostContext } from './host-labels'
import type { RenderableFolderWorkspace } from './folder-workspace-lanes'
import type {
  FolderWorkspaceRow,
  ImportedWorktreesCardCandidate,
  ImportedWorktreesCardRow,
  NewExternalWorktreesInboxCandidate,
  NewExternalWorktreesInboxRow,
  PendingCreationRef,
  PendingCreationRow,
  Row
} from './row-types'

export function buildPendingCreationRow(
  creation: PendingCreationRef,
  repoMap: Map<string, Repo>
): PendingCreationRow {
  return {
    type: 'pending-creation',
    key: `pending:${creation.creationId}`,
    creationId: creation.creationId,
    repo: repoMap.get(creation.repoId)
  }
}

export function buildImportedWorktreesCardRow(
  candidate: ImportedWorktreesCardCandidate,
  placement: ImportedWorktreesCardRow['placement'],
  hostContext?: NoticeHostContext
): ImportedWorktreesCardRow {
  return {
    type: 'imported-worktrees-card',
    key: `imported-worktrees-card:${placement}:${candidate.repo.id}`,
    repo: candidate.repo,
    hiddenWorktrees: candidate.hiddenWorktrees,
    placement,
    ...(hostContext
      ? { hostContextLabel: hostContext.label, hostContextHostId: hostContext.hostId }
      : {})
  }
}

export function buildNewExternalWorktreesInboxRow(
  candidate: NewExternalWorktreesInboxCandidate,
  hostContext?: NoticeHostContext
): NewExternalWorktreesInboxRow {
  return {
    type: 'new-external-worktrees-inbox',
    key: `new-external-worktrees-inbox:${candidate.repo.id}`,
    repo: candidate.repo,
    inboxWorktrees: candidate.inboxWorktrees,
    ...(hostContext
      ? { hostContextLabel: hostContext.label, hostContextHostId: hostContext.hostId }
      : {})
  }
}

export function appendWorktreeRows(
  result: Row[],
  repoMap: Map<string, Repo>,
  plan: WorktreeOccurrencePlan<Worktree>,
  options: {
    collapsedGroups: Set<string>
    groupDepth: number
    sectionKey: string
    hostContextLabelByRepoId?: ReadonlyMap<string, string>
    hostContextLabelByWorktreeIdentity?: ReadonlyMap<string, string>
    /** Sections the user expanded past the per-project worktree cap. */
    overflowExpandedKeys?: ReadonlySet<string>
    /** Worktrees whose section never collapses (agent-send target). */
    forceOpenWorktreeIds?: ReadonlySet<string>
    /** Cap before the rest collapse; unset disables the overflow toggle. */
    overflowVisibleLimit?: number
  }
): void {
  const allOccurrences = getExpandedWorktreeOccurrences(
    plan.bySection.get(options.sectionKey) ?? [],
    (worktree) => options.collapsedGroups.has(getWorktreeLineageGroupKey(worktree))
  )
  // Per-project overflow: group the materialized occurrences by their depth-0 root,
  // keep the first N groups, and collapse the rest behind a toggle row. A forced-open
  // worktree (active workspace, agent-send target) disables collapsing for the section.
  const overflowVisibleLimit = options.overflowVisibleLimit ?? 0
  const anyForcedOpen = allOccurrences.some((occurrence) =>
    options.forceOpenWorktreeIds?.has(occurrence.row.id)
  )
  const overLimit =
    overflowVisibleLimit > 0 &&
    !anyForcedOpen &&
    allOccurrences.length > overflowVisibleLimit
  const collapsed = overLimit && !options.overflowExpandedKeys?.has(options.sectionKey)
  let occurrences = allOccurrences
  let hiddenCount = 0
  if (collapsed) {
    const groups: WorktreeOccurrence<Worktree>[][] = []
    for (const occurrence of allOccurrences) {
      if (occurrence.depth === 0 || groups.length === 0) {
        groups.push([occurrence])
      } else {
        groups.at(-1)!.push(occurrence)
      }
    }
    occurrences = groups.slice(0, overflowVisibleLimit).flat()
    hiddenCount = allOccurrences.length - occurrences.length
  }
  const lastKeptKey = occurrences.at(-1)?.key
  for (const occurrence of occurrences) {
    const worktree = occurrence.row
    result.push({
      type: 'item',
      occurrence,
      rowKey: occurrence.key,
      sectionKey: occurrence.sectionKey,
      worktree,
      repo: repoMap.get(worktree.repoId),
      depth: occurrence.depth,
      groupDepth: options.groupDepth,
      // Why: a truncated tail must read as the last row of its lineage even when
      // more (hidden) sibling roots follow in the full plan.
      isLastLineageChild:
        overLimit && occurrence.key === lastKeptKey ? true : occurrence.isLastChild,
      lineageChildCount: occurrence.childCount,
      showProjectName: occurrence.showProjectName,
      hostContextLabel:
        options.hostContextLabelByWorktreeIdentity?.get(getWorktreeHostIdentity(worktree)) ??
        options.hostContextLabelByRepoId?.get(worktree.repoId),
      ...(occurrence.childCount > 0
        ? {
            lineageGroupKey: getWorktreeLineageGroupKey(worktree),
            lineageCollapsed: options.collapsedGroups.has(getWorktreeLineageGroupKey(worktree))
          }
        : {})
    })
  }
  if (overLimit) {
    result.push(
      buildOverflowToggleRow({
        sectionKey: options.sectionKey,
        repo: repoMap.get(occurrences[0]?.row.repoId ?? ''),
        hiddenCount,
        expanded: !collapsed
      })
    )
  }
}

/** The one folder-workspace row constructor, shared by the project-group,
 *  grouped-lane and flat emitters so their rows cannot diverge. */
export function buildFolderWorkspaceRow(
  pair: RenderableFolderWorkspace,
  groupDepth: number
): FolderWorkspaceRow {
  return {
    type: 'folder-workspace',
    key: `folder-workspace:${pair.folderWorkspace.id}`,
    folderWorkspace: pair.folderWorkspace,
    projectGroup: pair.projectGroup,
    depth: 0,
    groupDepth
  }
}
