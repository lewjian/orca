import { dirname } from '@/lib/path'
import type { AppState } from '@/store/types'

/**
 * Tracks an in-flight cross-repo group so that, once every repo's create settles, the shared
 * `cross-repo-{name}` folder becomes a visible home for the task in the sidebar: a project
 * group (folder-scan semantics, parentPath = the shared folder) plus a folder workspace that
 * opens the group folder. Without it the worktrees would only appear scattered under each
 * repo with no single "cross-repo project" entry under Projects.
 */
type CrossRepoGroupImportTracking = {
  expected: number
  settled: number
  worktreePaths: string[]
  /** Group folder name, e.g. `cross-repo-feature-x`. */
  group: string
  importing: boolean
}

const registry = new Map<string, CrossRepoGroupImportTracking>()

/** Called once per submit with the number of repos participating in the group. */
export function registerCrossRepoGroupImport(group: string, expected: number): void {
  if (expected < 1) {
    return
  }
  registry.set(group, {
    expected,
    settled: 0,
    worktreePaths: [],
    group,
    importing: false
  })
}

/** The slices `openCrossRepoGroupHome` touches; keeps the test stub free of type assertions. */
type CrossRepoGroupHomeStore = Pick<
  AppState,
  | 'projectGroups'
  | 'folderWorkspaces'
  | 'createFolderWorkspace'
  | 'setActiveFolderWorkspace'
  | 'setActiveView'
>

/** Called when one repo's cross-repo worktree create settles (success or failure). */
export async function noteCrossRepoWorktreeSettled(
  store: { getState: () => CrossRepoGroupHomeStore },
  input: {
    group: string
    created: boolean
    worktreePath?: string
  },
  deps: Parameters<typeof openCrossRepoGroupHome>[3] = {}
): Promise<void> {
  const tracking = registry.get(input.group)
  if (!tracking) {
    return
  }
  if (input.created && input.worktreePath) {
    tracking.worktreePaths.push(input.worktreePath)
  }
  tracking.settled += 1
  if (tracking.settled < tracking.expected || tracking.importing) {
    return
  }
  tracking.importing = true
  registry.delete(input.group)
  // A group needs at least two worktrees to be worth a project entry of its own;
  // singletons stay under their main repo as usual.
  if (tracking.worktreePaths.length < 2) {
    return
  }
  try {
    await openCrossRepoGroupHome(
      store.getState(),
      tracking.group,
      tracking.worktreePaths,
      deps.createProjectGroup
        ? deps
        : { createProjectGroup: (args) => window.api.projectGroups.create(args) }
    )
  } catch (error) {
    console.error('cross-repo create: project group setup failed', tracking.group, error)
  }
}

/** Idempotently ensure the shared folder has a project group + folder workspace, then open it. */
export async function openCrossRepoGroupHome(
  state: CrossRepoGroupHomeStore,
  group: string,
  worktreePaths: string[],
  deps: {
    createProjectGroup?: (args: {
      name: string
      parentPath: string
      createdFrom: 'folder-scan'
    }) => Promise<{ id: string; name: string; parentPath: string | null } | null>
  } = {}
): Promise<void> {
  // Every worktree lives at <root>/<group>/<repoName>/<name>; its grandparent is the shared folder.
  const groupDir = dirname(dirname(worktreePaths[0]))

  const existingGroup = state.projectGroups.find(
    (entry) => entry.parentPath === groupDir || entry.name === group
  )
  const projectGroup =
    existingGroup ??
    (await (deps.createProjectGroup ?? window.api.projectGroups.create)({
      name: group,
      parentPath: groupDir,
      createdFrom: 'folder-scan'
    }))
  if (!projectGroup) {
    return
  }

  const existingFolderWorkspace = state.folderWorkspaces.find(
    (entry) => entry.projectGroupId === projectGroup.id
  )
  const folderWorkspace =
    existingFolderWorkspace ??
    (await state.createFolderWorkspace(
      { projectGroupId: projectGroup.id, name: group, folderPath: groupDir },
      { runtimeEnvironmentId: null }
    ))
  if (!folderWorkspace) {
    return
  }

  state.setActiveFolderWorkspace(folderWorkspace.id)
  state.setActiveView('terminal')
}
