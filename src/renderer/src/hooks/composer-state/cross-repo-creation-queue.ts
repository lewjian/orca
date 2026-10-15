import { runBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import type { SetupDecision } from '../../../../shared/worktree/create-types'
import { buildCrossRepoCreationRequest } from './quick-creation-request'

/** Queue same-named creates for the extra repos of a cross-repo group. Queued BEFORE the main
 *  repo's request so the main repo's pending panel stays active and its workspace is the one
 *  that opens when creation settles. */
export function queueCrossRepoCreations(input: {
  mainRepoId: string
  crossRepoIds: readonly string[]
  workspaceName: string
  branchNameOverride: string | undefined
  setupDecision: SetupDecision
  telemetrySource: WorktreeCreationRequest['telemetrySource']
  isSubmissionCancelled: () => boolean
}): void {
  for (const crossRepoId of input.crossRepoIds) {
    if (crossRepoId === input.mainRepoId || input.isSubmissionCancelled()) {
      continue
    }
    runBackgroundWorktreeCreation(
      buildCrossRepoCreationRequest({
        repoId: crossRepoId,
        workspaceName: input.workspaceName,
        branchNameOverride: input.branchNameOverride,
        setupDecision: input.setupDecision,
        telemetrySource: input.telemetrySource
      })
    )
  }
}
