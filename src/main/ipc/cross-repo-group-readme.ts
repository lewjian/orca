import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** One repo participating in a cross-repo group, as shown in the group README. */
export type CrossRepoGroupReadmeEntry = {
  repoName: string
  /** Branch created in that repo, without the `refs/heads/` prefix. */
  branch: string
  worktreePath: string
  createdAt: Date
}

const HEADER_HINT =
  '跨仓工作区：同一个任务在以下仓库中各创建了一个工作树（分支同名）。\n此文件由 Orca 自动维护。'

function renderRow(entry: CrossRepoGroupReadmeEntry): string {
  const stamp = entry.createdAt.toISOString().slice(0, 16).replace('T', ' ')
  return `| ${entry.repoName} | ${entry.branch} | ${entry.worktreePath} | ${stamp} |`
}

const TABLE_HEADER = '| 仓库 | 分支 | 工作树路径 | 创建时间 |\n| --- | --- | --- | --- |'

/**
 * Creates or updates `<groupDir>/README.md` so the shared folder explains itself:
 * which repos and branches belong to the cross-repo task. Idempotent per repo —
 * a repeat create rewrites that repo's row instead of appending a duplicate.
 */
export async function writeCrossRepoGroupReadme(
  groupDir: string,
  entry: CrossRepoGroupReadmeEntry
): Promise<void> {
  const readmePath = join(groupDir, 'README.md')
  const row = renderRow(entry)

  let existing = ''
  try {
    existing = await readFile(readmePath, 'utf8')
  } catch {
    // First repo of the group: no README yet.
  }

  let content: string
  if (!existing.trim()) {
    content = `# ${basename(groupDir)}\n\n${HEADER_HINT}\n\n${TABLE_HEADER}\n${row}\n`
  } else {
    const lines = existing.split('\n')
    const rowIndex = lines.findIndex((line) => line.startsWith(`| ${entry.repoName} |`))
    if (rowIndex !== -1) {
      lines[rowIndex] = row
    } else {
      // Insert after the last table row so the table stays contiguous.
      const lastTableIndex = lines.reduce(
        (last, line, index) => (line.startsWith('|') ? index : last),
        -1
      )
      lines.splice(lastTableIndex + 1, 0, row)
    }
    content = lines.join('\n')
  }

  await mkdir(groupDir, { recursive: true })
  await writeFile(readmePath, content, 'utf8')
}

/** `refs/heads/feature/x` -> `feature/x`; leaves anything else untouched. */
export function crossRepoGroupBranchLabel(branch: string): string {
  return branch.startsWith('refs/heads/') ? branch.slice('refs/heads/'.length) : branch
}
