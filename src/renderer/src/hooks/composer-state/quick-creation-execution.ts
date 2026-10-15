import type { ComposerModel } from './composer-model'

type QuickCreationExecutionInput = Pick<
  ComposerModel,
  | 'clearNewWorkspaceDraft'
  | 'createMultiple'
  | 'crossRepoIds'
  | 'effectivePresetId'
  | 'ephemeralVmRecipes'
  | 'ephemeralVmsEnabled'
  | 'isSubmissionCancelled'
  | 'linkedGitLabIssue'
  | 'linkedGitLabMR'
  | 'normalizedSparseDirectories'
  | 'onCreated'
  | 'parentWorktreeId'
  | 'persistDraft'
  | 'persistSetupAgentStartupPolicy'
  | 'prepareQuickSubmit'
  | 'resetForNextCreate'
  | 'resolvedInitialWorkspaceStatus'
  | 'selectedEphemeralVmRecipeId'
  | 'selectedRepoAgentLaunchFact'
  | 'selectedRepoExecutionHostId'
  | 'selectedRepoIsGit'
  | 'selectedRepoIsRemote'
  | 'selectedRepoTarget'
  | 'selectedRepoStartupShell'
  | 'selectedWorkspaceTarget'
  | 'settings'
  | 'sparseEnabled'
  | 'taskSourceContext'
  | 'telemetrySource'
>

import { useCallback } from 'react'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { WorktreeCreationRequest } from '@/lib/pending-worktree-creation'
import { useAppStore } from '@/store'
import { settleComposerSubmit } from '@/lib/composer-submit-cancellation'
import { runBackgroundWorktreeCreation } from '@/lib/worktree-creation-flow'
import { translate } from '@/i18n/i18n'
import { resolveQuickCreateLinkedWorkItemPrompt } from '@/lib/linked-work-item-context'
import { buildQuickComposerStartup } from './quick-startup-plan'
import { registerCrossRepoGroupImport } from '@/lib/cross-repo-group-import'
import { buildCrossRepoGroupName } from '../../../../shared/worktree/cross-repo-group'
import { queueCrossRepoCreations } from './cross-repo-creation-queue'
import { buildQuickCreationRequest, type QuickSubmitOptions } from './quick-creation-request'
import type { PendingSmartGitHubSubmitResolution } from './source-selection-decisions'
import { resolveAgentSessionLaunchRoute } from '@/lib/agent-session-launch-plan'

export function useQuickCreationExecution(input: QuickCreationExecutionInput) {
  const {
    clearNewWorkspaceDraft,
    createMultiple,
    crossRepoIds,
    effectivePresetId,
    ephemeralVmRecipes,
    ephemeralVmsEnabled,
    isSubmissionCancelled,
    linkedGitLabIssue,
    linkedGitLabMR,
    normalizedSparseDirectories,
    onCreated,
    parentWorktreeId,
    persistDraft,
    persistSetupAgentStartupPolicy,
    prepareQuickSubmit,
    resetForNextCreate,
    resolvedInitialWorkspaceStatus,
    selectedEphemeralVmRecipeId,
    selectedRepoAgentLaunchFact,
    selectedRepoExecutionHostId,
    selectedRepoIsGit,
    selectedRepoIsRemote,
    selectedRepoTarget,
    selectedRepoStartupShell,
    selectedWorkspaceTarget,
    settings,
    sparseEnabled,
    taskSourceContext,
    telemetrySource
  } = input

  const executeQuickCreation = useCallback(
    async (
      smartGitHubResolution: PendingSmartGitHubSubmitResolution,
      requestedAgent: TuiAgent | null,
      workspaceNameSeed: string,
      workspaceRunContext: WorktreeCreationRequest['workspaceRunContext'],
      repoId: string,
      options?: QuickSubmitOptions
    ): Promise<void> => {
      const prepared = await prepareQuickSubmit(
        smartGitHubResolution,
        requestedAgent,
        workspaceNameSeed
      )

      if (!prepared) {
        return
      }

      const {
        submitLinkedWorkItem,
        agent,
        submitLinkedIssueNumber,
        submitLinkedPR,
        workspaceName,
        nameWasGenerated,
        nameIsAutoManaged,
        submitCompareBaseRef,
        submitPushTarget,
        effectiveSetupDecision,
        hookPreparation,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        effectiveBranchNameOverride,
        submitBaseBranch,
        createDisplayName,
        pendingFirstAgentMessageRename,
        trimmedNote
      } = prepared

      const promptLinkedWorkItem = agent === null ? null : submitLinkedWorkItem

      const { prompt: quickPrompt, draftPrompt: quickDraftPrompt } =
        resolveQuickCreateLinkedWorkItemPrompt(promptLinkedWorkItem, trimmedNote)

      const {
        startupPlan,
        backendStartup,
        telemetry: quickTelemetry
      } = buildQuickComposerStartup({
        agent,
        prompt: quickPrompt,
        draftPrompt: quickDraftPrompt,
        settings,
        launchHost: selectedRepoAgentLaunchFact,
        shell: selectedRepoStartupShell,
        isRemote: selectedRepoIsRemote,
        telemetrySource
      })

      const startupPolicySettlement = await settleComposerSubmit(
        persistSetupAgentStartupPolicy(),
        isSubmissionCancelled
      )

      if (startupPolicySettlement.status === 'cancelled') {
        return
      }

      if (!startupPolicySettlement.value) {
        throw new Error(
          translate(
            'auto.hooks.useComposerState.setupAgentStartupPolicySaveFailed',
            'Failed to save setup startup behavior.'
          )
        )
      }

      let ephemeralVmRecipe: WorktreeCreationRequest['ephemeralVmRecipe']

      const activeEphemeralVmRecipeId = ephemeralVmsEnabled ? selectedEphemeralVmRecipeId : null

      if (activeEphemeralVmRecipeId && selectedWorkspaceTarget.status === 'ready') {
        const selectedRecipe = ephemeralVmRecipes.find(
          (recipe) => recipe.id === activeEphemeralVmRecipeId
        )
        ephemeralVmRecipe = {
          sourceRepoId: repoId,
          recipeId: activeEphemeralVmRecipeId,
          projectId: selectedWorkspaceTarget.target.projectId,
          ...(selectedRecipe?.checkoutMode ? { checkoutMode: selectedRecipe.checkoutMode } : {})
        }
      }

      const promptDelivery = quickDraftPrompt ? 'draft' : 'auto-submit'
      // Cross-repo group folder shared by every repo of this create; set only when extra repos
      // beyond the main one were picked in the composer.
      const crossRepoGroup =
        crossRepoIds.filter((id) => id !== repoId).length > 0
          ? buildCrossRepoGroupName(workspaceName)
          : undefined
      // Why: the verdict is persisted on the request as data and re-entered once the worktree exists.
      const agentLaunchRoute = agent
        ? resolveAgentSessionLaunchRoute(useAppStore.getState(), {
            agent,
            workspace: {
              kind: selectedRepoIsGit ? 'git-worktree' : 'folder',
              repoId,
              executionHostId: ephemeralVmRecipe
                ? 'runtime:pending-ephemeral-vm'
                : (workspaceRunContext?.hostId ?? selectedRepoExecutionHostId ?? undefined)
            },
            prompt: quickDraftPrompt ?? quickPrompt,
            promptDelivery
          })
        : 'terminal-tui'
      const structuredLaunch = agentLaunchRoute === 'structured-native-chat'

      const request = buildQuickCreationRequest({
        repoId,
        ephemeralVmRecipe,
        indeterminateProgress:
          Boolean(activeEphemeralVmRecipeId) || selectedRepoTarget?.kind === 'environment',
        taskSourceContext,
        linkedWorkItem: submitLinkedWorkItem,
        workspaceRunContext,
        workspaceName,
        nameWasGenerated,
        displayName: createDisplayName,
        displayNameKind: createDisplayName ? (nameIsAutoManaged ? 'generated' : 'user') : undefined,
        selectedRepoIsGit,
        baseBranch: submitBaseBranch,
        compareBaseRef: submitCompareBaseRef,
        setupDecision: effectiveSetupDecision,
        sparseDirectories: selectedRepoIsGit && sparseEnabled ? normalizedSparseDirectories : null,
        sparsePresetId: effectivePresetId,
        telemetrySource,
        linkedIssue: submitLinkedIssueNumber,
        linkedPR: submitLinkedPR,
        pushTarget: submitPushTarget,
        agent,
        agentLaunchRoute,
        linkedLinearIssue,
        linkedLinearIssueWorkspaceId,
        linkedLinearIssueOrganizationUrlKey,
        branchNameOverride: effectiveBranchNameOverride,
        crossRepoGroup,
        parentWorktreeId,
        workspaceStatus: resolvedInitialWorkspaceStatus,
        linkedGitLabMR,
        linkedGitLabIssue,
        includeGitLabLinks: smartGitHubResolution.kind === 'none',
        startup: structuredLaunch ? undefined : backendStartup,
        hookPreparation: ephemeralVmRecipe
          ? {
              ...hookPreparation,
              executionHostId: selectedRepoExecutionHostId ?? undefined,
              confirmVmRecipe: true
            }
          : hookPreparation,
        pendingFirstAgentMessageRename,
        note: trimmedNote,
        startupPlan,
        quickPrompt,
        launchDraftPrompt: quickDraftPrompt,
        promptDelivery,
        quickTelemetry,
        suppressTerminalFocusOnCompletion: createMultiple,
        setupOnly: options?.setupOnly === true
      })

      if (isSubmissionCancelled()) {
        return
      }

      if (persistDraft) {
        clearNewWorkspaceDraft()
      }

      // Cross-repo group: queue the extra repos FIRST so the main repo's pending panel stays
      // active and its workspace is the one that opens when creation settles.
      if (crossRepoGroup) {
        registerCrossRepoGroupImport(
          crossRepoGroup,
          crossRepoIds.filter((id) => id !== repoId).length + 1
        )
        queueCrossRepoCreations({
          mainRepoId: repoId,
          crossRepoIds,
          workspaceName,
          branchNameOverride: effectiveBranchNameOverride,
          setupDecision: effectiveSetupDecision,
          telemetrySource,
          isSubmissionCancelled
        })
      }

      runBackgroundWorktreeCreation(request)

      if (createMultiple) {
        resetForNextCreate()
      } else {
        onCreated?.()
      }
    },
    [
      clearNewWorkspaceDraft,
      createMultiple,
      crossRepoIds,
      effectivePresetId,
      ephemeralVmRecipes,
      ephemeralVmsEnabled,
      isSubmissionCancelled,
      linkedGitLabIssue,
      linkedGitLabMR,
      normalizedSparseDirectories,
      onCreated,
      parentWorktreeId,
      persistDraft,
      persistSetupAgentStartupPolicy,
      prepareQuickSubmit,
      resetForNextCreate,
      resolvedInitialWorkspaceStatus,
      selectedEphemeralVmRecipeId,
      selectedRepoAgentLaunchFact,
      selectedRepoExecutionHostId,
      selectedRepoIsGit,
      selectedRepoIsRemote,
      selectedRepoTarget,
      selectedRepoStartupShell,
      selectedWorkspaceTarget,
      settings,
      sparseEnabled,
      taskSourceContext,
      telemetrySource
    ]
  )

  return {
    executeQuickCreation
  }
}
