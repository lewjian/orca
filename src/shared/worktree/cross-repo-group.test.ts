import { describe, expect, it } from 'vitest'
import {
  buildCrossRepoGroupName,
  sanitizeCrossRepoGroupName,
  CROSS_REPO_GROUP_PREFIX
} from './cross-repo-group'

describe('sanitizeCrossRepoGroupName', () => {
  it('passes a clean worktree name through unchanged', () => {
    expect(sanitizeCrossRepoGroupName('feature-v26.11-pay')).toBe('feature-v26.11-pay')
  })

  it('slugifies unsafe characters and trims separators', () => {
    expect(sanitizeCrossRepoGroupName('  a b/c ')).toBe('a-b-c')
    expect(sanitizeCrossRepoGroupName('-lead-.-trail-')).toBe('lead-.-trail')
  })

  it('rejects names that sanitize to nothing', () => {
    expect(() => sanitizeCrossRepoGroupName('...')).toThrow('Invalid worktree name')
  })
})

describe('buildCrossRepoGroupName', () => {
  it('prefixes the sanitized worktree name', () => {
    expect(buildCrossRepoGroupName('feature x')).toBe(`${CROSS_REPO_GROUP_PREFIX}feature-x`)
  })

  it('is idempotent for already-sanitized names', () => {
    const once = buildCrossRepoGroupName('feature-x')
    expect(buildCrossRepoGroupName(once.slice(CROSS_REPO_GROUP_PREFIX.length))).toBe(once)
  })
})
