/** Cross-repo worktree groups: N repos get same-named worktrees scoped under one
 *  `cross-repo-{name}` folder inside the workspace root, so a multi-repo task keeps
 *  every checkout side by side. */
export const CROSS_REPO_GROUP_PREFIX = 'cross-repo-'

/**
 * Git/filesystem-safe slug for a cross-repo group folder. Mirrors the rules of the
 * main-process `sanitizeWorktreeName` (minus emoji shortcodes, which never survive a
 * worktree name) so renderer and host agree on the folder for every repo in the group.
 */
export function sanitizeCrossRepoGroupName(input: string): string {
  const sanitized = input
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (!sanitized) {
    throw new Error('Invalid worktree name')
  }
  return sanitized
}

/** `feature-x` → `cross-repo-feature-x`, the shared parent folder of the group. */
export function buildCrossRepoGroupName(worktreeName: string): string {
  return `${CROSS_REPO_GROUP_PREFIX}${sanitizeCrossRepoGroupName(worktreeName)}`
}
