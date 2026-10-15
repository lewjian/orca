#!/usr/bin/env node
// One-command fork maintenance: merge upstream main, gate on typecheck + tests,
// then package a local mac build for over-install. Re-run after resolving merge
// conflicts — the script detects an in-progress merge and continues from there.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const UPSTREAM_REMOTE = 'upstream'
const UPSTREAM_URL = 'https://github.com/stablyai/orca.git'

const step = (title) => console.log(`\n==> ${title}`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    ...options
  })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`)
  }
  return result
}

function git(args, options = {}) {
  return run('git', args, options)
}

function gitOut(args) {
  return run('git', args, { capture: true, allowFailure: false }).stdout.trim()
}

function die(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

function assertInsideRepo() {
  if (!existsSync('.git') || !existsSync('package.json')) {
    die('Run this script from the fork repository root.')
  }
}

function ensureCleanWorktree() {
  const status = gitOut(['status', '--porcelain'])
  // An in-progress merge with no unresolved files means the user finished
  // resolving; finish the merge instead of demanding a clean tree.
  if (status.length > 0 && !existsSync('.git/MERGE_HEAD')) {
    die('Worktree is not clean. Commit or stash first, then re-run.')
  }
}

function ensureUpstreamRemote() {
  const remotes = gitOut(['remote'])
  if (!remotes.split('\n').includes(UPSTREAM_REMOTE)) {
    step(`Adding ${UPSTREAM_REMOTE} remote`)
    git(['remote', 'add', UPSTREAM_REMOTE, UPSTREAM_URL])
  }
  step('Fetching upstream main')
  git(['fetch', UPSTREAM_REMOTE, 'main'])
}

function finishOrStartMerge() {
  const unmerged = gitOut(['diff', '--name-only', '--diff-filter=U'])
  if (existsSync('.git/MERGE_HEAD')) {
    if (unmerged.length > 0) {
      die(
        `Merge conflicts still unresolved:\n${unmerged.map((f) => `  - ${f}`).join('\n')}\n` +
          'Resolve, `git add` the files, then re-run.'
      )
    }
    step('Finishing the previously resolved merge')
    git(['commit', '--no-edit'])
    return
  }

  const behind = Number(gitOut(['rev-list', '--count', 'HEAD..upstream/main']))
  if (behind === 0) {
    console.log('Already up to date with upstream/main.')
  } else {
    step(`Merging upstream main (${behind} new commits)`)
    try {
      git(['merge', '--no-edit', 'upstream/main'])
    } catch {
      const conflicted = gitOut(['diff', '--name-only', '--diff-filter=U'])
      die(
        `Merge conflicts:\n${conflicted.map((f) => `  - ${f}`).join('\n')}\n` +
          'Resolve, `git add` the files, then re-run this script.'
      )
    }
  }
}

/** Files the merge changed; empty when there was no merge this run. */
function mergedChangedFiles() {
  try {
    const origHead = gitOut(['rev-parse', 'ORIG_HEAD'])
    const head = gitOut(['rev-parse', 'HEAD'])
    if (origHead === head) {
      return []
    }
    return gitOut(['diff', '--name-only', 'ORIG_HEAD', 'HEAD']).split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function verify(changedFiles) {
  step('Typecheck (pnpm tc)')
  run('pnpm', ['tc'])

  const testFiles = collectRelatedTestFiles(changedFiles)
  if (testFiles.length === 0) {
    console.log('No directly related test files for the merged changes; the mac build is the gate.')
    return
  }
  step(`Tests for changed files (${testFiles.length} files)`)
  run('pnpm', ['run', 'build:packages'])
  run('npx', ['vitest', 'run', '--config', 'config/vitest.config.ts', ...testFiles])
}

/** Test files that directly cover the merged changes: touched tests plus the
 *  co-located tests of every touched source file. Anything broader stays to the
 *  mac build, which is the real gate for local over-install builds. */
function collectRelatedTestFiles(changedFiles) {
  const testFiles = new Set()
  for (const file of changedFiles) {
    if (/\.test\.(ts|tsx)$/.test(file) && existsSync(file)) {
      testFiles.add(file)
      continue
    }
    const base = file.replace(/\.(ts|tsx)$/, '')
    for (const candidate of [`${base}.test.ts`, `${base}.test.tsx`]) {
      if (existsSync(candidate)) {
        testFiles.add(candidate)
      }
    }
    const testsDir = join(dirname(file), '__tests__')
    const sourceName = basename(base)
    if (existsSync(testsDir)) {
      for (const entry of readdirSync(testsDir)) {
        if (entry.startsWith(`${sourceName}.`)) {
          testFiles.add(join(testsDir, entry))
        }
      }
    }
  }
  return [...testFiles]
}

function packageMac() {
  step('Packaging mac build (pnpm build:mac)')
  run('pnpm', ['build:mac'])
  const dist = 'dist'
  const dmgs = existsSync(dist) ? readdirSync(dist).filter((name) => name.endsWith('.dmg')) : []
  if (dmgs.length === 0) {
    die('No .dmg found in dist/ — check the build output above.')
  }
  step('Done')
  console.log(
    `Built: ${dmgs.map((name) => join(dist, name)).join(', ')}\n` +
      'Open the dmg and drag Orca into Applications to over-install this fork.\n' +
      'Tip: keep in-app auto-update off so an official release cannot overwrite your customizations.'
  )
}

const steps = [
  assertInsideRepo,
  ensureCleanWorktree,
  ensureUpstreamRemote,
  finishOrStartMerge,
  () => verify(mergedChangedFiles()),
  packageMac
]
try {
  for (const runStep of steps) {
    runStep()
  }
} catch (error) {
  die(error instanceof Error ? error.message : String(error))
}
