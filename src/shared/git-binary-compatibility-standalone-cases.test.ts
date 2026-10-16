// Split from git-binary-compatibility.test.ts to stay under the max-lines budget.
// Runs under the same ORCA_GIT_COMPAT_* env gate as the main compatibility suite.
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GIT_HISTORY_COMMIT_FORMAT, parseGitHistoryLog } from './git-history-log-parser'
import { GitBinaryTestFixture } from './git-binary.test-fixture'

const image = process.env.ORCA_GIT_COMPAT_IMAGE
const binary = process.env.ORCA_GIT_COMPAT_BINARY
const describeStandalone = image || binary ? describe : describe.skip

describeStandalone('standalone git binary compatibility cases', () => {
  let repoPath = ''
  let fixture: GitBinaryTestFixture

  async function runGit(
    args: string[],
    env?: NodeJS.ProcessEnv,
    stdin?: string
  ): Promise<{ stdout: string; stderr: string }> {
    return fixture.exec(args, fixture.executionRoot, env, stdin)
  }

  beforeAll(async () => {
    repoPath = await realpath(await mkdtemp(join(tmpdir(), 'orca-git-binary-standalone-')))
    fixture = new GitBinaryTestFixture(repoPath, '/repo')
    await fixture.start()
    await runGit(['init', '-q'])
    await runGit(['config', 'user.email', 'compatibility@example.invalid'])
    await runGit(['config', 'user.name', 'Compatibility Test'])
  })

  afterAll(async () => {
    await fixture.stop()
  })

  it('reads signed history without launching configured signature verification', async () => {
    const tree = (await runGit(['rev-parse', 'HEAD^{tree}'])).stdout.trim()
    const commit = [
      `tree ${tree}`,
      'author Compatibility Test <compatibility@example.invalid> 1234567890 +0000',
      'committer Compatibility Test <compatibility@example.invalid> 1234567890 +0000',
      'gpgsig -----BEGIN PGP SIGNATURE-----',
      ' ',
      ' ZHVtbXk=',
      ' -----END PGP SIGNATURE-----',
      '',
      'signed history fixture',
      ''
    ].join('\n')
    // Why the initial commit first: hash-object writes an orphan object that log
    // can only walk once a branch points at a commit containing it.
    await runGit(['commit', '-qm', 'initial', '--allow-empty'])
    const oid = (
      await runGit(['hash-object', '-t', 'commit', '-w', '--stdin'], undefined, commit)
    ).stdout.trim()
    await runGit(['update-ref', 'refs/heads/signed', oid])
    const result = await runGit([
      '-c',
      'log.showSignature=true',
      '-c',
      'color.ui=always',
      '-c',
      'gpg.program=orca-nonexistent-signature-verifier',
      'log',
      '--no-show-signature',
      '--no-color',
      `--format=${GIT_HISTORY_COMMIT_FORMAT}`,
      '-z',
      '-n1',
      oid
    ])
    expect(result.stderr).toBe('')
    expect(parseGitHistoryLog(result.stdout)).toMatchObject([
      { id: oid, subject: 'signed history fixture' }
    ])
  })

  it('quietly distinguishes present and absent branch refs', async () => {
    await runGit(['commit', '-qm', 'initial', '--allow-empty'])
    await runGit(['branch', 'present-ref'])
    await expect(
      runGit(['rev-parse', '--verify', '--quiet', 'refs/heads/present-ref'])
    ).resolves.toMatchObject({ stderr: '' })
    const absent = await runGit(['rev-parse', '--verify', '--quiet', 'refs/heads/absent-ref'])
    expect(absent.stdout).toBe('')
    expect(absent.stderr).toBe('')
  })
})
