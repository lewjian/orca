import { useAppStore } from '@/store'
import { toast } from 'sonner'
import { ensureAgentStartupInTerminal } from '@/lib/new-workspace'
import { queueWorkspaceActivationTerminalFocus } from '@/lib/workspace-activation-terminal-focus'
import { seedAgentTabStateAfterWorktreeCreate } from '@/lib/worktree-creation-agent-seeds'
import {
  formatWorkspaceCreateError,
  getWorkspaceCreateErrorToastMessage
} from '@/lib/workspace-create-error-format'
import { noteCrossRepoWorktreeSettled } from '@/lib/cross-repo-group-import'
import type { ActivateAndRevealResult } from '@/lib/worktree-activation'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'

/** Cross-repo group: report a failed create so the group settle count stays accurate. */
export function noteCrossRepoWorktreeFailed(request: WorktreeCreationRequest): Promise<void> {
  if (!request.crossRepoGroup) {
    return Promise.resolve()
  }
  return noteCrossRepoWorktreeSettled(useAppStore, {
    group: request.crossRepoGroup,
    created: false
  })
}

/** Surface a failed create on its own creation surface: inline error, plus a
 *  toast when the user has navigated away, plus cross-repo group bookkeeping. */
export async function handleWorktreeCreateFailure(
  creationId: string,
  request: WorktreeCreationRequest,
  error: unknown,
  options: { panelVisible: boolean }
): Promise<void> {
  const message = getWorkspaceCreateErrorToastMessage(formatWorkspaceCreateError(error))
  // Why: an error must stay on the same creation surface that owns the faux
  // tab strip, rather than falling back to stale previous-workspace tabs.
  useAppStore.getState().updatePendingWorktreeCreation(creationId, {
    status: 'error',
    error: message,
    ...(request.ephemeralVmRecipe ? { request } : {})
  })
  // Why: only toast when the panel isn't already showing this error (the user
  // navigated away), so a visible failure isn't announced twice.
  if (!options.panelVisible) {
    toast.error(message)
  }
  await noteCrossRepoWorktreeFailed(request)
}

export async function completeWorktreeCreation(args: {
  creationId: string
  request: WorktreeCreationRequest
  worktreeId: string
  structuredLaunchAccepted: boolean
  activation: ActivateAndRevealResult | false
  primaryTabId: string | null
  startupTerminalTabId?: string
  backendSpawned: boolean
  focusOnCompletion: boolean
}): Promise<void> {
  const { request } = args
  // Why: clearing synchronously after activation lets React commit the panel-to-terminal swap in one frame.
  useAppStore.getState().removePendingWorktreeCreation(args.creationId, { cleanupVm: false })
  if (!args.structuredLaunchAccepted) {
    seedAgentTabStateAfterWorktreeCreate({
      request,
      worktreeId: args.worktreeId,
      primaryTabId: args.primaryTabId,
      startupTerminalTabId: args.startupTerminalTabId,
      backendSpawned: args.backendSpawned
    })
  }
  if (!args.structuredLaunchAccepted && request.startupPlan && !args.backendSpawned) {
    void ensureAgentStartupInTerminal({
      worktreeId: args.worktreeId,
      primaryTabId: args.primaryTabId,
      startup: request.startupPlan
    })
  }
  if (
    !args.structuredLaunchAccepted &&
    !request.suppressTerminalFocusOnCompletion &&
    args.focusOnCompletion
  ) {
    queueWorkspaceActivationTerminalFocus(args.worktreeId, args.activation)
  }

  // Why: note persistence is cosmetic and should not delay the visible workspace handoff.
  if (request.note) {
    try {
      await useAppStore.getState().updateWorktreeMeta(args.worktreeId, { comment: request.note })
    } catch {
      console.error('Failed to update worktree meta after creation')
    }
  }

  if (request.crossRepoGroup) {
    // Why: the shared folder only becomes a sidebar project entry once every repo has settled.
    const worktreePath = Object.values(useAppStore.getState().worktreesByRepo)
      .flat()
      .find((entry) => entry.id === args.worktreeId)?.path
    await noteCrossRepoWorktreeSettled(useAppStore, {
      group: request.crossRepoGroup,
      created: true,
      worktreePath
    })
  }
}
