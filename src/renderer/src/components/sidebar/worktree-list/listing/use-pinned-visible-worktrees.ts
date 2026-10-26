import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { isAgentSubjectUnread } from '@/attention/agent-attention-acknowledgement'
import { readAgentRowTurnRecords } from '@/components/dashboard/dashboard-row-bucket'
import type { AgentStatusEntry } from '../../../../../../shared/agent-status-types'

// Why: `?? {}` per selector run would hand useShallow a fresh reference on every store
// write and re-render the whole sidebar list.
const EMPTY_AGENT_TURN_RECORD: Readonly<Record<string, AgentStatusEntry>> = Object.freeze({})

/**
 * Worktrees whose sidebar rows must stay visible past the per-project collapse cap:
 * the workspace an agent is working in (or waiting on), a finished turn whose attention
 * marker has not been clicked yet, and the agent-send target.
 */
export function usePinnedVisibleWorktreeIds(
  agentSendTargetWorktreeId: string | null
): ReadonlySet<string> {
  const agentTurnRecords = useAppStore(
    useShallow((s) =>
      readAgentRowTurnRecords({
        agentStatusByPaneKey: s.agentStatusByPaneKey ?? EMPTY_AGENT_TURN_RECORD,
        retainedAgentsByPaneKey: s.retainedAgentsByPaneKey ?? EMPTY_AGENT_TURN_RECORD,
        acknowledgedAgentsByPaneKey: s.acknowledgedAgentsByPaneKey ?? EMPTY_AGENT_TURN_RECORD
      })
    )
  )
  const agentStatusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const retainedAgentsByPaneKey = useAppStore((s) => s.retainedAgentsByPaneKey)
  const tabsByWorktree = useAppStore((s) => s.tabsByWorktree)

  return useMemo(() => {
    const ids = new Set<string>()
    if (agentSendTargetWorktreeId) {
      ids.add(agentSendTargetWorktreeId)
    }
    const tabIdToWorktreeId = new Map<string, string>()
    for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
      for (const tab of tabs) {
        tabIdToWorktreeId.set(tab.id, worktreeId)
      }
    }
    const liveAgents = agentStatusByPaneKey ?? EMPTY_AGENT_TURN_RECORD
    const retainedAgents = retainedAgentsByPaneKey ?? EMPTY_AGENT_TURN_RECORD
    for (const paneKey of new Set([...Object.keys(liveAgents), ...Object.keys(retainedAgents)])) {
      const liveEntry = liveAgents[paneKey]
      const inProgress = Boolean(liveEntry && liveEntry.state !== 'done')
      // Why: a done turn keeps its attention marker until the user clicks it, and a
      // hidden marker is exactly the worktree the user is about to look for.
      const needsAttention = isAgentSubjectUnread(agentTurnRecords, paneKey)
      if (!inProgress && !needsAttention) {
        continue
      }
      const separator = paneKey.indexOf(':')
      const tabId = separator === -1 ? paneKey : paneKey.slice(0, separator)
      const worktreeId = tabIdToWorktreeId.get(tabId)
      if (worktreeId) {
        ids.add(worktreeId)
      }
    }
    return ids
  }, [
    agentSendTargetWorktreeId,
    agentTurnRecords,
    agentStatusByPaneKey,
    retainedAgentsByPaneKey,
    tabsByWorktree
  ])
}
