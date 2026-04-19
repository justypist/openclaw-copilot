'use client'

import { useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { SkillLocation, SkillSummary } from '@/lib/skills'

interface SkillsWorkspaceProps {
  availableSkills: SkillSummary[]
  enabledSkills: SkillSummary[]
}

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return '未知'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function getNextLocationLabel(location: SkillLocation): string {
  return location === 'available' ? 'enabled-skills' : 'available-skills'
}

interface SkillColumnProps {
  title: string
  location: SkillLocation
  skills: SkillSummary[]
  selectedFolderNames: string[]
  disabled: boolean
  onToggle: (folderName: string) => void
}

function SkillColumn({
  title,
  location,
  skills,
  selectedFolderNames,
  disabled,
  onToggle,
}: SkillColumnProps) {
  const selectedFolderNameSet = new Set(selectedFolderNames)

  return (
    <section className="flex min-h-0 flex-col overflow-hidden border border-black bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-black px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-1 text-xs text-neutral-500">{skills.length} skills</p>
        </div>

        <span className="border border-black px-2 py-1 text-[11px] uppercase">{location}</span>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
        {skills.length === 0 ? (
          <div className="border border-dashed border-black p-4 text-sm text-neutral-500">
            当前目录为空。
          </div>
        ) : (
          <div className="grid gap-3">
            {skills.map((skill) => {
              const isSelected = selectedFolderNameSet.has(skill.folderName)

              return (
                <label
                  key={`${skill.location}:${skill.folderName}`}
                  className={[
                    'grid cursor-pointer gap-3 border border-black p-3 transition-colors',
                    isSelected ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100',
                    disabled ? 'cursor-not-allowed opacity-60' : '',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={disabled}
                      onChange={() => onToggle(skill.folderName)}
                      className="mt-0.5 h-4 w-4 accent-black"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{skill.name}</p>
                          <p
                            className={[
                              'mt-1 break-all font-mono text-[11px]',
                              isSelected ? 'text-neutral-300' : 'text-neutral-500',
                            ].join(' ')}
                          >
                            {skill.folderName}
                          </p>
                        </div>

                        <span
                          className={[
                            'shrink-0 border px-2 py-1 text-[11px]',
                            isSelected ? 'border-white text-white' : 'border-black text-black',
                          ].join(' ')}
                        >
                          {skill.filePaths.length} files
                        </span>
                      </div>

                      <p
                        className={[
                          'mt-3 line-clamp-3 text-sm',
                          isSelected ? 'text-neutral-200' : 'text-neutral-700',
                        ].join(' ')}
                      >
                        {skill.description}
                      </p>

                      <div
                        className={[
                          'mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs',
                          isSelected ? 'text-neutral-300' : 'text-neutral-500',
                        ].join(' ')}
                      >
                        <time>{formatTimestamp(skill.updatedAt)}</time>
                        <span>{skill.filePaths.join(', ')}</span>
                      </div>
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default function SkillsWorkspace({ availableSkills, enabledSkills }: SkillsWorkspaceProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedAvailableFolderNames, setSelectedAvailableFolderNames] = useState<string[]>([])
  const [selectedEnabledFolderNames, setSelectedEnabledFolderNames] = useState<string[]>([])
  const [moveError, setMoveError] = useState('')
  const [moveSummary, setMoveSummary] = useState('')

  function toggleSelectedFolderName(location: SkillLocation, folderName: string) {
    const setter =
      location === 'available' ? setSelectedAvailableFolderNames : setSelectedEnabledFolderNames

    setter((currentFolderNames) =>
      currentFolderNames.includes(folderName)
        ? currentFolderNames.filter((currentFolderName) => currentFolderName !== folderName)
        : [...currentFolderNames, folderName],
    )
  }

  function resetSelection(location: SkillLocation) {
    if (location === 'available') {
      setSelectedAvailableFolderNames([])
      return
    }

    setSelectedEnabledFolderNames([])
  }

  async function handleMoveSkills(from: SkillLocation) {
    const skillFolderNames =
      from === 'available' ? selectedAvailableFolderNames : selectedEnabledFolderNames

    if (skillFolderNames.length === 0) {
      return
    }

    setMoveError('')
    setMoveSummary('')

    try {
      const response = await fetch('/api/skills/move', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          skillFolderNames,
        }),
      })

      const result = (await response.json()) as {
        movedSkillFolderNames?: string[]
        targetLocation?: SkillLocation
        error?: string
      }

      if (
        !response.ok ||
        !Array.isArray(result.movedSkillFolderNames) ||
        typeof result.targetLocation !== 'string'
      ) {
        throw new Error(result.error || '转移失败。')
      }

      resetSelection(from)
      setMoveSummary(
        `已将 ${result.movedSkillFolderNames.length} 个 skill 转移到 ${getNextLocationLabel(from)}。`,
      )

      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : '转移失败。')
    }
  }

  return (
    <div className="grid gap-4">
      <section className="border border-black bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base font-medium tracking-[-0.02em]">Skills Library</h1>
            <p className="mt-1 text-sm text-neutral-600">
              展示 `available-skills` 和 `enabled-skills`，支持多选后整目录转移。
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
            <Link
              href="/"
              className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
            >
              Sessions
            </Link>
            <button
              type="button"
              onClick={() => handleMoveSkills('available')}
              disabled={isPending || selectedAvailableFolderNames.length === 0}
              className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
            >
              Move to enabled ({selectedAvailableFolderNames.length})
            </button>
            <button
              type="button"
              onClick={() => handleMoveSkills('enabled')}
              disabled={isPending || selectedEnabledFolderNames.length === 0}
              className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
            >
              Move to available ({selectedEnabledFolderNames.length})
            </button>
          </div>
        </div>

        {moveError ? <p className="mt-3 text-sm text-red-600">{moveError}</p> : null}
        {moveSummary ? <p className="mt-3 text-sm text-neutral-700">{moveSummary}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SkillColumn
          title="Available Skills"
          location="available"
          skills={availableSkills}
          selectedFolderNames={selectedAvailableFolderNames}
          disabled={isPending}
          onToggle={(folderName) => toggleSelectedFolderName('available', folderName)}
        />

        <SkillColumn
          title="Enabled Skills"
          location="enabled"
          skills={enabledSkills}
          selectedFolderNames={selectedEnabledFolderNames}
          disabled={isPending}
          onToggle={(folderName) => toggleSelectedFolderName('enabled', folderName)}
        />
      </section>
    </div>
  )
}
