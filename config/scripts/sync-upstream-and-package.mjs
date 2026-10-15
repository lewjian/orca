#!/usr/bin/env node
// One-command fork maintenance: merge upstream main, gate on typecheck + tests,
// then package a local mac build for over-install. Re-run after resolving merge
// conflicts — the script detects an in-progress merge and continues from there.
import { spawn, spawnSync } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const UPSTREAM_REMOTE = 'upstream'
const UPSTREAM_URL = 'https://github.com/stablyai/orca.git'

// --auto: launchd/unattended mode. Non-interactive, installs the built app into
// /Applications itself, and reports through macOS notifications instead of a terminal.
const AUTO = process.argv.includes('--auto')
// --force-build: skip the "nothing merged" shortcut and (re)package + install anyway.
const FORCE_BUILD = process.argv.includes('--force-build')

// Why resolve from the script location: launchd runs with an arbitrary cwd, so
// every repo-relative command is pinned to the fork checkout this script lives in.
const repoRoot = join(import.meta.dirname, '..', '..')

// Why: launchd provides a minimal PATH without node/pnpm; derive it from the
// interpreter that is already running this script.
const launchEnv = {
  ...process.env,
  PATH: `${dirname(process.execPath)}:${process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'}`
}

const step = (title) => console.log(`\n==> ${title}`)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.capture ? 'pipe' : 'inherit',
    encoding: 'utf8',
    cwd: repoRoot,
    env: launchEnv,
    ...options
  })
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${args.join(' ')} failed (exit ${result.status})`)
  }
  return result
}

function notify(message) {
  if (!AUTO) {
    return
  }
  const script = `display notification "${message.replace(/"/g, '')}" with title "Orca fork sync"`
  spawnSync('osascript', ['-e', script], { stdio: 'ignore' })
}

function git(args, options = {}) {
  return run('git', args, options)
}

function gitOut(args) {
  return run('git', args, { capture: true, allowFailure: false }).stdout.trim()
}

function die(message) {
  console.error(`\n✖ ${message}`)
  notify(`同步失败：${message.slice(0, 80)}`)
  process.exit(1)
}

function assertInsideRepo() {
  if (!existsSync(join(repoRoot, '.git')) || !existsSync(join(repoRoot, 'package.json'))) {
    die('This script must live in the fork repository it syncs.')
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
    mergedNewCommits = false
    return
  }
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

let mergedNewCommits = true

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

function newestDmg() {
  const dist = join(repoRoot, 'dist')
  const dmgs = existsSync(dist) ? readdirSync(dist).filter((name) => name.endsWith('.dmg')) : []
  if (dmgs.length === 0) {
    die('No .dmg found in dist/ — check the build output above.')
  }
  // Auto-install the freshest dmg (name sort desc ≈ newest, the version carries a timestamp).
  dmgs.sort((left, right) => right.name.localeCompare(left.name))
  return join(dist, dmgs[0].name)
}

function installDmg(dmgPath) {
  step('Installing into /Applications')
  run('hdiutil', ['attach', dmgPath, '-nobrowse', '-quiet'])
  try {
    const volume = readdirSync('/Volumes').find(
      (entry) => entry.startsWith('Orca') && existsSync(join('/Volumes', entry, 'Orca.app'))
    )
    if (!volume) {
      die('Mounted dmg has no Orca.app at its root.')
    }
    // Why rm first: ditto merges, which would leave stale files from the old build.
    run('rm', ['-rf', '/Applications/Orca.app'])
    run('ditto', [join('/Volumes', volume, 'Orca.app'), '/Applications/Orca.app'])
  } finally {
    run('hdiutil', ['detach', '/Volumes/Orca*', '-quiet'], { allowFailure: true, shell: true })
  }
}

function packageMac() {
  if (AUTO && !mergedNewCommits && !FORCE_BUILD) {
    // Why: unattended runs happen daily; only an actual merge is worth a repack.
    console.log('No new upstream commits merged — skipping the build.')
    return
  }
  step('Packaging mac build (pnpm build:mac, host architecture only)')
  // Why detached: under launchd an attached multi-minute electron-builder chain was
  // observed dying with exit null; a detached process outlives the job's process group.
  const buildLog = '/tmp/orca-fork-build.log'
  const buildOut = openSync(buildLog, 'w')
  const build = spawn('pnpm', ['build:mac'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', buildOut, buildOut],
    env: { ...launchEnv, ORCA_MAC_ARCH: process.arch }
  })
  closeSync(buildOut)
  build.unref()
  // Why: unattended builds get 45 minutes; a stuck builder should not run forever.
  for (let waited = 0; waited < 45 * 60; waited += 30) {
    spawnSync('sleep', ['30'])
    let alive = true
    try {
      process.kill(build.pid, 0)
    } catch {
      alive = false
    }
    if (!alive) {
      break
    }
  }
  const fresh = spawnSync('find', [newestDmg(), '-newermt', '-45 minutes'])
  if (!existsSync(newestDmg()) || fresh.status !== 0) {
    die(`Build did not produce a fresh dmg within 45 minutes — see ${buildLog}`)
  }
  const dmgPath = newestDmg()
  if (AUTO) {
    installDmg(dmgPath)
    step('Done')
    notify('新版本已构建并安装，重启 Orca 生效')
    console.log('Installed /Applications/Orca.app. Restart Orca to run the new build.')
    return
  }
  step('Done')
  console.log(
    `Built: ${dmgPath}\n` +
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
