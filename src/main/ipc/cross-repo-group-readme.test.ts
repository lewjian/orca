import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { crossRepoGroupBranchLabel, writeCrossRepoGroupReadme } from './cross-repo-group-readme'

const created: string[] = []

async function makeGroupDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'orca-cross-repo-readme-'))
  created.push(dir)
  return dir
}

const created_At = new Date('2026-10-20T10:50:00Z')

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('cross-repo group README', () => {
  it('creates the README with the group title and the first repo row', async () => {
    const groupDir = await makeGroupDir()
    await writeCrossRepoGroupReadme(groupDir, {
      repoName: 'fms-treasury-app',
      branch: 'feature-x',
      worktreePath: join(groupDir, 'fms-treasury-app'),
      createdAt: created_At
    })

    const content = await readFile(join(groupDir, 'README.md'), 'utf8')
    expect(content).toContain('# ')
    expect(content).toContain('跨仓工作区')
    expect(content).toContain('| 仓库 | 分支 | 工作树路径 | 创建时间 |')
    expect(content).toContain('| fms-treasury-app | feature-x |')
  })

  it('appends each repo as its own row and rewrites on repeat', async () => {
    const groupDir = await makeGroupDir()
    const base = { worktreePath: '/ws/x', createdAt: created_At }
    await writeCrossRepoGroupReadme(groupDir, { ...base, repoName: 'alpha', branch: 'f' })
    await writeCrossRepoGroupReadme(groupDir, { ...base, repoName: 'beta', branch: 'f' })
    await writeCrossRepoGroupReadme(groupDir, { ...base, repoName: 'alpha', branch: 'f-2' })

    const content = await readFile(join(groupDir, 'README.md'), 'utf8')
    const alphaRows = content.split('\n').filter((line) => line.startsWith('| alpha |'))
    expect(alphaRows).toHaveLength(1)
    expect(alphaRows[0]).toContain('f-2')
    expect(content).toContain('| beta | f |')
  })

  it('strips the refs/heads prefix from the branch label', () => {
    expect(crossRepoGroupBranchLabel('refs/heads/feature/x')).toBe('feature/x')
    expect(crossRepoGroupBranchLabel('feature/x')).toBe('feature/x')
  })
})
