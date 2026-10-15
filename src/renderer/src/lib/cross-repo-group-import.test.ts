import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type { FolderWorkspace } from '../../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../../shared/project-group-types'
import {
  noteCrossRepoWorktreeSettled,
  registerCrossRepoGroupImport
} from './cross-repo-group-import'

type CreateFolderWorkspaceArgs = Parameters<AppState['createFolderWorkspace']>[0]

const groupFixtures = vi.hoisted(() => {
  const state: { groups: ProjectGroup[]; folderWorkspaces: FolderWorkspace[] } = {
    groups: [],
    folderWorkspaces: []
  }
  return state
})

let createdFolderCount = 0
let activatedFolderId: string | null = null

function makeFolderWorkspace(args: CreateFolderWorkspaceArgs): FolderWorkspace {
  createdFolderCount += 1
  const existing = groupFixtures.folderWorkspaces.find(
    (f) => f.projectGroupId === args.projectGroupId
  )
  if (existing) {
    return existing
  }
  const workspace: FolderWorkspace = {
    id: `fw-${groupFixtures.folderWorkspaces.length + 1}`,
    projectGroupId: args.projectGroupId,
    name: args.name ?? '',
    folderPath: args.folderPath ?? '',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 0,
    createdAt: 0,
    updatedAt: 0
  }
  groupFixtures.folderWorkspaces.push(workspace)
  return workspace
}

function createStore() {
  return {
    getState: () => ({
      projectGroups: groupFixtures.groups,
      folderWorkspaces: groupFixtures.folderWorkspaces,
      createFolderWorkspace: async (args: CreateFolderWorkspaceArgs) => makeFolderWorkspace(args),
      setActiveFolderWorkspace: (id: string) => {
        activatedFolderId = id
      },
      setActiveView: () => {}
    })
  }
}

function makeDeps() {
  return {
    createProjectGroup: async (args: {
      name: string
      parentPath: string
      createdFrom: 'folder-scan'
    }) => {
      const existing = groupFixtures.groups.find((g) => g.parentPath === args.parentPath)
      if (existing) {
        return existing
      }
      const group: ProjectGroup = {
        id: `group-${groupFixtures.groups.length + 1}`,
        name: args.name,
        parentPath: args.parentPath,
        parentGroupId: null,
        createdFrom: args.createdFrom,
        tabOrder: groupFixtures.groups.length,
        isCollapsed: false,
        color: null,
        createdAt: 0,
        updatedAt: 0
      }
      groupFixtures.groups.push(group)
      return group
    }
  }
}

describe('cross-repo group import', () => {
  beforeEach(() => {
    groupFixtures.groups = []
    groupFixtures.folderWorkspaces = []
    createdFolderCount = 0
    activatedFolderId = null
  })

  it('creates a project group and folder workspace for the shared folder once every repo settles', async () => {
    const deps = makeDeps()
    const store = createStore()
    registerCrossRepoGroupImport('cross-repo-feature-x', 2)

    await noteCrossRepoWorktreeSettled(
      store,
      {
        group: 'cross-repo-feature-x',
        created: true,
        worktreePath: '/ws/cross-repo-feature-x/alpha/feature-x'
      },
      deps
    )
    expect(groupFixtures.groups).toHaveLength(0)

    await noteCrossRepoWorktreeSettled(
      store,
      {
        group: 'cross-repo-feature-x',
        created: true,
        worktreePath: '/ws/cross-repo-feature-x/beta/feature-x'
      },
      deps
    )
    expect(groupFixtures.groups).toHaveLength(1)
    expect(groupFixtures.groups[0]).toMatchObject({
      name: 'cross-repo-feature-x',
      parentPath: '/ws/cross-repo-feature-x'
    })
    expect(groupFixtures.folderWorkspaces).toHaveLength(1)
    expect(activatedFolderId).toBe('fw-1')
  })

  it('skips the project entry when fewer than two worktrees were created', async () => {
    const store = createStore()
    registerCrossRepoGroupImport('cross-repo-feature-x', 2)

    await noteCrossRepoWorktreeSettled(store, {
      group: 'cross-repo-feature-x',
      created: true,
      worktreePath: '/ws/cross-repo-feature-x/alpha/feature-x'
    })
    await noteCrossRepoWorktreeSettled(store, {
      group: 'cross-repo-feature-x',
      created: false
    })

    expect(groupFixtures.groups).toHaveLength(0)
    expect(activatedFolderId).toBeNull()
  })

  it('imports the successful subset when a repo fails', async () => {
    const store = createStore()
    registerCrossRepoGroupImport('cross-repo-feature-x', 3)

    await noteCrossRepoWorktreeSettled(store, {
      group: 'cross-repo-feature-x',
      created: true,
      worktreePath: '/ws/cross-repo-feature-x/alpha/feature-x'
    })
    await noteCrossRepoWorktreeSettled(store, { group: 'cross-repo-feature-x', created: false })
    await noteCrossRepoWorktreeSettled(
      store,
      {
        group: 'cross-repo-feature-x',
        created: true,
        worktreePath: '/ws/cross-repo-feature-x/gamma/feature-x'
      },
      makeDeps()
    )

    expect(groupFixtures.groups).toHaveLength(1)
    expect(groupFixtures.folderWorkspaces[0].folderPath).toBe('/ws/cross-repo-feature-x')
  })

  it('ignores settles for unknown groups and single-repo groups', async () => {
    const store = createStore()

    await noteCrossRepoWorktreeSettled(store, {
      group: 'cross-repo-unknown',
      created: true,
      worktreePath: '/ws/x'
    })
    expect(groupFixtures.groups).toHaveLength(0)

    registerCrossRepoGroupImport('cross-repo-solo', 1)
    await noteCrossRepoWorktreeSettled(store, {
      group: 'cross-repo-solo',
      created: true,
      worktreePath: '/ws/cross-repo-solo/alpha/f'
    })
    expect(groupFixtures.groups).toHaveLength(0)
    expect(activatedFolderId).toBeNull()
  })
})
