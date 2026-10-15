import { CROSS_REPO_GROUP_PREFIX } from '../../shared/worktree/cross-repo-group'
import { sanitizeWorktreeName } from './worktree-logic'

/** Validate + normalize a cross-repo group folder name coming from the wire. Undefined passes
 *  through; anything else must already carry the `cross-repo-` prefix and stay a safe slug. */
export function normalizeCrossRepoGroup(crossRepoGroup: string | undefined): string | undefined {
  if (!crossRepoGroup) {
    return undefined
  }
  if (!crossRepoGroup.startsWith(CROSS_REPO_GROUP_PREFIX)) {
    throw new Error(
      `Invalid cross-repo group "${crossRepoGroup}": must start with "${CROSS_REPO_GROUP_PREFIX}".`
    )
  }
  return sanitizeWorktreeName(crossRepoGroup)
}
