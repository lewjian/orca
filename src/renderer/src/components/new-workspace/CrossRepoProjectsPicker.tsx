import React, { useCallback, useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { searchRepos } from '@/lib/repo-search'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { Repo } from '../../../../shared/repo-types'

type CrossRepoProjectsPickerProps = {
  /** Candidate repos for cross-repo grouping (main project already excluded by the caller). */
  repos: readonly Repo[]
  /** Repo ids picked for the cross-repo group, in pick order. */
  selectedIds: readonly string[]
  onSelectedIdsChange: (ids: string[]) => void
  disabled?: boolean
}

/** Add/remove picker for the extra repos that share a `cross-repo-{name}` worktree group.
 *  Unlike RepoMultiCombobox this allows returning to an empty selection (single-repo mode). */
export default function CrossRepoProjectsPicker({
  repos,
  selectedIds,
  onSelectedIdsChange,
  disabled = false
}: CrossRepoProjectsPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => new Set(selectedIds), [selectedIds])
  const candidates = useMemo(() => {
    const available = repos.filter((repo) => !selected.has(repo.id))
    return searchRepos(available, query)
  }, [repos, query, selected])

  const addRepo = useCallback(
    (repoId: string) => {
      if (!selected.has(repoId)) {
        onSelectedIdsChange([...selectedIds, repoId])
      }
      setQuery('')
    },
    [onSelectedIdsChange, selected, selectedIds]
  )

  const removeRepo = useCallback(
    (repoId: string) => {
      onSelectedIdsChange(selectedIds.filter((id) => id !== repoId))
    },
    [onSelectedIdsChange, selectedIds]
  )

  const selectedRepos = useMemo(
    () => selectedIds.map((id) => repos.find((repo) => repo.id === id)).filter(isDefinedRepo),
    [repos, selectedIds]
  )

  return (
    <div className="space-y-1" data-workspace-cross-repo-picker="true">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span
              className={cn(
                'min-w-0 truncate',
                selectedIds.length === 0 && 'text-muted-foreground'
              )}
            >
              {selectedIds.length === 0
                ? translate(
                    'auto.components.new.workspace.CrossRepoProjectsPicker.addProjects',
                    'Add cross-repo projects...'
                  )
                : translate(
                    'auto.components.new.workspace.CrossRepoProjectsPicker.projectCount',
                    '{count} cross-repo projects'
                  ).replace('{count}', String(selectedIds.length))}
            </span>
            <Plus className="size-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(320px,calc(100vw-1rem))] min-w-[var(--radix-popover-trigger-width)]"
        >
          <Command shouldFilter={false}>
            <CommandInput
              autoFocus
              placeholder={translate(
                'auto.components.new.workspace.CrossRepoProjectsPicker.search',
                'Search projects...'
              )}
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {translate(
                  'auto.components.new.workspace.CrossRepoProjectsPicker.noMatches',
                  'No projects match your search.'
                )}
              </CommandEmpty>
              {candidates.map((repo) => (
                <CommandItem key={repo.id} value={repo.id} onSelect={() => addRepo(repo.id)}>
                  <span className="min-w-0 truncate">{repo.displayName}</span>
                  <span className="ml-auto min-w-0 truncate pl-2 text-[11px] text-muted-foreground">
                    {repo.path}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedRepos.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selectedRepos.map((repo) => (
            <span
              key={repo.id}
              className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[11px] text-foreground"
            >
              <span className="min-w-0 truncate">{repo.displayName}</span>
              <button
                type="button"
                onClick={() => removeRepo(repo.id)}
                disabled={disabled}
                aria-label={translate(
                  'auto.components.new.workspace.CrossRepoProjectsPicker.remove',
                  'Remove {name}'
                ).replace('{name}', repo.displayName)}
                className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function isDefinedRepo(repo: Repo | undefined): repo is Repo {
  return repo !== undefined
}
