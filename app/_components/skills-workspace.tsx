'use client'

import { useMemo, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { FinalizedSkillDraft, SkillFileDraft, SkillLocation, SkillSummary } from '@/lib/skills'

interface SkillsWorkspaceProps {
  availableSkills: SkillSummary[]
  enabledSkills: SkillSummary[]
}

interface SkillReference {
  folderName: string
  location: SkillLocation
}

interface SkillContentSelection {
  start: number
  end: number
  text: string
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

function getSkillSelectionKey(location: SkillLocation, folderName: string): string {
  return `${location}:${folderName}`
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
  const generatedSkillContentRef = useRef<HTMLTextAreaElement | null>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedAvailableFolderNames, setSelectedAvailableFolderNames] = useState<string[]>([])
  const [selectedEnabledFolderNames, setSelectedEnabledFolderNames] = useState<string[]>([])
  const [moveError, setMoveError] = useState('')
  const [moveSummary, setMoveSummary] = useState('')
  const [hasRequestedMerge, setHasRequestedMerge] = useState(false)
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [generatedSkillContent, setGeneratedSkillContent] = useState('')
  const [isGeneratingSkill, setIsGeneratingSkill] = useState(false)
  const [skillGenerationError, setSkillGenerationError] = useState('')
  const [skillContentSelection, setSkillContentSelection] = useState<SkillContentSelection | null>(null)
  const [selectionRewriteInstruction, setSelectionRewriteInstruction] = useState('')
  const [selectionRewriteError, setSelectionRewriteError] = useState('')
  const [isRewritingSelection, setIsRewritingSelection] = useState(false)
  const [finalizedSkill, setFinalizedSkill] = useState<FinalizedSkillDraft | null>(null)
  const [isFinalizingSkill, setIsFinalizingSkill] = useState(false)
  const [skillFinalizeError, setSkillFinalizeError] = useState('')
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const [skillSaveError, setSkillSaveError] = useState('')
  const [savedSkillDirectory, setSavedSkillDirectory] = useState('')

  const selectedSkills = useMemo<SkillReference[]>(
    () => [
      ...selectedAvailableFolderNames.map((folderName) => ({ folderName, location: 'available' as const })),
      ...selectedEnabledFolderNames.map((folderName) => ({ folderName, location: 'enabled' as const })),
    ],
    [selectedAvailableFolderNames, selectedEnabledFolderNames],
  )
  const selectedSkillKeySet = useMemo(
    () => new Set(selectedSkills.map((skill) => getSkillSelectionKey(skill.location, skill.folderName))),
    [selectedSkills],
  )
  const selectedSkillSummaries = useMemo(
    () =>
      [...availableSkills, ...enabledSkills].filter((skill) =>
        selectedSkillKeySet.has(getSkillSelectionKey(skill.location, skill.folderName)),
      ),
    [availableSkills, enabledSkills, selectedSkillKeySet],
  )
  const selectedSkillCount = selectedSkills.length
  const interactionDisabled =
    isPending || isGeneratingSkill || isRewritingSelection || isFinalizingSkill || isSavingSkill

  function resetFinalizedSkillState() {
    setFinalizedSkill(null)
    setIsFinalizingSkill(false)
    setSkillFinalizeError('')
    setIsSavingSkill(false)
    setSkillSaveError('')
    setSavedSkillDirectory('')
  }

  function resetMergeEditorState() {
    setSkillName('')
    setSkillDescription('')
    setGeneratedSkillContent('')
    setIsGeneratingSkill(false)
    setSkillGenerationError('')
    setSkillContentSelection(null)
    setSelectionRewriteInstruction('')
    setSelectionRewriteError('')
    setIsRewritingSelection(false)
    resetFinalizedSkillState()
  }

  function toggleSelectedFolderName(location: SkillLocation, folderName: string) {
    const setter =
      location === 'available' ? setSelectedAvailableFolderNames : setSelectedEnabledFolderNames

    setMoveError('')
    setMoveSummary('')

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

  function handleSkillNameChange(nextValue: string) {
    resetFinalizedSkillState()
    setSkillName(nextValue)
  }

  function handleSkillDescriptionChange(nextValue: string) {
    resetFinalizedSkillState()
    setSkillDescription(nextValue)
  }

  function handleGeneratedSkillContentChange(nextValue: string) {
    resetFinalizedSkillState()
    setGeneratedSkillContent(nextValue)

    setSkillContentSelection((currentSelection) => {
      if (!currentSelection) {
        return null
      }

      if (nextValue.slice(currentSelection.start, currentSelection.end) !== currentSelection.text) {
        return null
      }

      return currentSelection
    })
  }

  function handleGeneratedContentSelection() {
    const textarea = generatedSkillContentRef.current

    if (!textarea) {
      return
    }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd

    if (selectionStart === selectionEnd) {
      setSkillContentSelection(null)
      setSelectionRewriteError('')
      return
    }

    const selectedText = textarea.value.slice(selectionStart, selectionEnd)

    if (!selectedText.trim()) {
      setSkillContentSelection(null)
      setSelectionRewriteError('')
      return
    }

    setSkillContentSelection({
      start: selectionStart,
      end: selectionEnd,
      text: selectedText,
    })
    setSelectionRewriteError('')
  }

  function handleStartMerge() {
    if (selectedSkillCount < 2) {
      return
    }

    const defaultSkillName = skillName.trim() || `${selectedSkillSummaries[0]?.folderName ?? 'merged'}-merged`

    setHasRequestedMerge(true)
    setSkillName(defaultSkillName)
    setMoveError('')
    setMoveSummary('')
    setSkillGenerationError('')
    setSelectionRewriteError('')
    setSkillFinalizeError('')
    setSkillSaveError('')
  }

  function handleBackToLibrary() {
    setHasRequestedMerge(false)
    setSkillContentSelection(null)
    setSelectionRewriteInstruction('')
    setSelectionRewriteError('')
    setSkillGenerationError('')
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
      resetMergeEditorState()
      setHasRequestedMerge(false)
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

  async function handleGenerateMergedSkillContent() {
    const trimmedSkillName = skillName.trim()
    const trimmedSkillDescription = skillDescription.trim()

    if (!trimmedSkillName) {
      setSkillGenerationError('请先填写 skill name。')
      return
    }

    if (!trimmedSkillDescription) {
      setSkillGenerationError('请先填写 skill description。')
      return
    }

    if (selectedSkillCount < 2) {
      setSkillGenerationError('至少需要选择两个 skill。')
      return
    }

    setIsGeneratingSkill(true)
    setSkillGenerationError('')
    setSelectionRewriteError('')
    resetFinalizedSkillState()

    try {
      const response = await fetch('/api/skills/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedSkillName,
          description: trimmedSkillDescription,
          selectedSkills,
        }),
      })

      const result = (await response.json()) as {
        content?: string
        error?: string
      }

      if (!response.ok || !result.content) {
        throw new Error(result.error || '合并失败。')
      }

      handleGeneratedSkillContentChange(result.content)
      setSkillContentSelection(null)
      setSelectionRewriteInstruction('')
    } catch (error) {
      setSkillGenerationError(error instanceof Error ? error.message : '合并失败。')
    } finally {
      setIsGeneratingSkill(false)
    }
  }

  async function handleRewriteSelection() {
    if (!skillContentSelection) {
      return
    }

    const trimmedInstruction = selectionRewriteInstruction.trim()

    if (!trimmedInstruction) {
      setSelectionRewriteError('请先填写修改意见。')
      return
    }

    const currentSelectedText = generatedSkillContent.slice(
      skillContentSelection.start,
      skillContentSelection.end,
    )

    if (currentSelectedText !== skillContentSelection.text) {
      setSelectionRewriteError('当前选区已经变化，请重新选择要修改的内容。')
      setSkillContentSelection(null)
      return
    }

    setIsRewritingSelection(true)
    setSelectionRewriteError('')
    setSkillGenerationError('')
    setSkillFinalizeError('')
    setSkillSaveError('')
    setSavedSkillDirectory('')

    try {
      const response = await fetch('/api/skills/rewrite-merged-selection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: skillName.trim(),
          description: skillDescription.trim(),
          fullContent: generatedSkillContent,
          selectedText: skillContentSelection.text,
          instruction: trimmedInstruction,
          selectedSkills,
        }),
      })

      const result = (await response.json()) as {
        replacement?: string
        error?: string
      }

      if (!response.ok || typeof result.replacement !== 'string') {
        throw new Error(result.error || '局部修改失败。')
      }

      const nextContent = [
        generatedSkillContent.slice(0, skillContentSelection.start),
        result.replacement,
        generatedSkillContent.slice(skillContentSelection.end),
      ].join('')

      handleGeneratedSkillContentChange(nextContent)

      const nextSelectionStart = skillContentSelection.start
      const nextSelectionEnd = skillContentSelection.start + result.replacement.length

      setSkillContentSelection({
        start: nextSelectionStart,
        end: nextSelectionEnd,
        text: result.replacement,
      })
      setSelectionRewriteInstruction('')

      window.requestAnimationFrame(() => {
        const textarea = generatedSkillContentRef.current

        if (!textarea) {
          return
        }

        textarea.focus()
        textarea.setSelectionRange(nextSelectionStart, nextSelectionEnd)
      })
    } catch (error) {
      setSelectionRewriteError(error instanceof Error ? error.message : '局部修改失败。')
    } finally {
      setIsRewritingSelection(false)
    }
  }

  async function handleFinalizeSkill() {
    const trimmedSkillName = skillName.trim()
    const trimmedSkillDescription = skillDescription.trim()
    const trimmedGeneratedSkillContent = generatedSkillContent.trim()

    if (!trimmedSkillName) {
      setSkillFinalizeError('请先填写 skill name。')
      return
    }

    if (!trimmedSkillDescription) {
      setSkillFinalizeError('请先填写 skill description。')
      return
    }

    if (!trimmedGeneratedSkillContent) {
      setSkillFinalizeError('请先生成或填写完整 skill 内容。')
      return
    }

    if (selectedSkillCount < 2) {
      setSkillFinalizeError('至少需要选择两个 skill。')
      return
    }

    setIsFinalizingSkill(true)
    setSkillFinalizeError('')
    setSkillSaveError('')
    setSavedSkillDirectory('')

    try {
      const response = await fetch('/api/skills/finalize-merged', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedSkillName,
          description: trimmedSkillDescription,
          fullContent: trimmedGeneratedSkillContent,
          selectedSkills,
        }),
      })

      const result = (await response.json()) as {
        folderName?: string
        files?: SkillFileDraft[]
        error?: string
      }

      if (
        !response.ok ||
        typeof result.folderName !== 'string' ||
        !Array.isArray(result.files) ||
        result.files.length === 0
      ) {
        throw new Error(result.error || '定稿失败。')
      }

      setFinalizedSkill({
        folderName: result.folderName,
        files: result.files,
      })
    } catch (error) {
      setSkillFinalizeError(error instanceof Error ? error.message : '定稿失败。')
      setFinalizedSkill(null)
    } finally {
      setIsFinalizingSkill(false)
    }
  }

  async function handleSaveSkill() {
    if (!finalizedSkill) {
      return
    }

    setIsSavingSkill(true)
    setSkillSaveError('')
    setSavedSkillDirectory('')

    try {
      const response = await fetch('/api/skills/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalizedSkill),
      })

      const result = (await response.json()) as {
        skillDirectory?: string
        error?: string
      }

      if (!response.ok || typeof result.skillDirectory !== 'string') {
        throw new Error(result.error || '保存失败。')
      }

      setSavedSkillDirectory(result.skillDirectory)

      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setSkillSaveError(error instanceof Error ? error.message : '保存失败。')
    } finally {
      setIsSavingSkill(false)
    }
  }

  return (
    <div className="grid gap-4">
      <section className="border border-black bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base font-medium tracking-[-0.02em]">Skills Library</h1>
            <p className="mt-1 text-sm text-neutral-600">
              展示 `available-skills` 和 `enabled-skills`，支持多选后转移，或直接合并多个 skills。
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
              disabled={interactionDisabled || hasRequestedMerge || selectedAvailableFolderNames.length === 0}
              className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
            >
              Move to enabled ({selectedAvailableFolderNames.length})
            </button>
            <button
              type="button"
              onClick={() => handleMoveSkills('enabled')}
              disabled={interactionDisabled || hasRequestedMerge || selectedEnabledFolderNames.length === 0}
              className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
            >
              Move to available ({selectedEnabledFolderNames.length})
            </button>
            {hasRequestedMerge ? (
              <button
                type="button"
                onClick={handleBackToLibrary}
                disabled={interactionDisabled}
                className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
              >
                Back to Library
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartMerge}
                disabled={interactionDisabled || selectedSkillCount < 2}
                className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
              >
                Merge Skill ({selectedSkillCount})
              </button>
            )}
          </div>
        </div>

        {moveError ? <p className="mt-3 text-sm text-red-600">{moveError}</p> : null}
        {moveSummary ? <p className="mt-3 text-sm text-neutral-700">{moveSummary}</p> : null}
      </section>

      {hasRequestedMerge ? (
        <div className="grid gap-4">
          <section className="border border-black bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium tracking-[-0.02em]">Merge Skill Editor</h2>
              <p className="text-sm text-neutral-600">
                已选择 {selectedSkillCount} 个 skills。先生成合并草稿，再支持选区改写、定稿和保存到 `available-skills`。
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-600">
              {selectedSkillSummaries.map((skill) => (
                <span
                  key={getSkillSelectionKey(skill.location, skill.folderName)}
                  className="border border-black px-2 py-1"
                >
                  {skill.location}:{skill.folderName}
                </span>
              ))}
            </div>

            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="font-medium">name</span>
                <input
                  type="text"
                  value={skillName}
                  onChange={(event) => handleSkillNameChange(event.target.value)}
                  placeholder="例如：merged-skill"
                  className="w-full border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                />
              </label>

              <label className="grid gap-2 text-sm">
                <span className="font-medium">description</span>
                <textarea
                  value={skillDescription}
                  onChange={(event) => handleSkillDescriptionChange(event.target.value)}
                  placeholder="简要描述这个合并后的 skill 解决什么问题、适用于什么场景。"
                  rows={6}
                  className="app-scrollbar min-h-36 w-full resize-y border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border border-black bg-neutral-50 p-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  void handleGenerateMergedSkillContent()
                }}
                disabled={isGeneratingSkill}
                className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
              >
                {isGeneratingSkill ? 'Merging...' : 'Generate Merged Skill Content'}
              </button>
              <span className="text-neutral-500">将基于当前选中的 {selectedSkillCount} 个 skills 生成。</span>
            </div>

            {skillGenerationError ? (
              <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">
                {skillGenerationError}
              </div>
            ) : null}
          </section>

          <section className="border border-black bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium tracking-[-0.02em]">Generated Content</h3>
              <p className="text-sm text-neutral-600">
                生成后可继续手动编辑，并支持仅改写当前选中的局部片段。
              </p>
            </div>

            <textarea
              ref={generatedSkillContentRef}
              value={generatedSkillContent}
              onChange={(event) => handleGeneratedSkillContentChange(event.target.value)}
              onSelect={handleGeneratedContentSelection}
              onKeyUp={handleGeneratedContentSelection}
              onMouseUp={handleGeneratedContentSelection}
              placeholder="合并结果会出现在这里。"
              rows={18}
              className="app-scrollbar mt-5 min-h-80 w-full resize-y border border-black px-3 py-2 font-mono text-xs leading-6 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
            />

            <div className="mt-4 border border-black bg-neutral-50 p-4">
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">Selected Fragment Rewrite</h4>
                <p className="text-sm text-neutral-600">
                  在上方选中一段文本后，输入修改意见，AI 只会返回该选中片段的替换内容。
                </p>
              </div>

              {skillContentSelection ? (
                <div className="mt-4 grid gap-4">
                  <div className="border border-black bg-white p-3">
                    <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                      <span>selected</span>
                      <span>{skillContentSelection.text.length} chars</span>
                    </div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-black">
                      {skillContentSelection.text}
                    </pre>
                  </div>

                  <label className="grid gap-2 text-sm">
                    <span className="font-medium">修改意见</span>
                    <textarea
                      value={selectionRewriteInstruction}
                      onChange={(event) => setSelectionRewriteInstruction(event.target.value)}
                      placeholder="例如：保留原意，但把重复步骤合并成更清晰的说明。"
                      rows={4}
                      className="app-scrollbar min-h-24 w-full resize-y border border-black bg-white px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void handleRewriteSelection()
                      }}
                      disabled={isRewritingSelection}
                      className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                    >
                      {isRewritingSelection ? 'Rewriting...' : 'Rewrite Selection'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSkillContentSelection(null)
                        setSelectionRewriteInstruction('')
                        setSelectionRewriteError('')
                      }}
                      className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
                    >
                      Clear Selected Fragment
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 border border-dashed border-black bg-white px-3 py-4 text-sm text-neutral-500">
                  先在上方 textarea 中选中要修改的片段。
                </div>
              )}

              {selectionRewriteError ? (
                <div className="mt-4 border border-black bg-white px-3 py-2 text-sm text-black">
                  {selectionRewriteError}
                </div>
              ) : null}
            </div>

            <div className="mt-4 border border-black bg-neutral-50 p-4">
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">Finalize & Save</h4>
                <p className="text-sm text-neutral-600">
                  修改满意后，可让 AI 把当前草稿整理成最终 skill 文件集合；内容较小时会只保留 `SKILL.md`。
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleFinalizeSkill()
                  }}
                  disabled={isFinalizingSkill}
                  className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  {isFinalizingSkill ? 'Finalizing...' : 'Finalize Skill Files'}
                </button>

                {finalizedSkill ? (
                  <span className="text-sm text-neutral-500">
                    目录名：`{finalizedSkill.folderName}`，共 {finalizedSkill.files.length} 个文件。
                  </span>
                ) : (
                  <span className="text-sm text-neutral-500">尚未生成最终文件集合。</span>
                )}
              </div>

              {skillFinalizeError ? (
                <div className="mt-4 border border-black bg-white px-3 py-2 text-sm text-black">
                  {skillFinalizeError}
                </div>
              ) : null}

              {finalizedSkill ? (
                <div className="mt-4 grid gap-4">
                  {finalizedSkill.files.map((file) => (
                    <div key={file.path} className="border border-black bg-white p-3">
                      <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                        <span>{file.path}</span>
                        <span>{file.content.length} chars</span>
                      </div>
                      <pre className="app-scrollbar mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-black">
                        {file.content}
                      </pre>
                    </div>
                  ))}

                  <div className="flex flex-wrap items-center gap-2 border border-black bg-white p-3">
                    <button
                      type="button"
                      onClick={() => {
                        void handleSaveSkill()
                      }}
                      disabled={isSavingSkill}
                      className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                    >
                      {isSavingSkill ? 'Saving...' : 'Save to available-skills'}
                    </button>

                    {savedSkillDirectory ? (
                      <span className="break-all text-sm text-neutral-600">已保存到：{savedSkillDirectory}</span>
                    ) : (
                      <span className="text-sm text-neutral-500">
                        将写入 `config.openclaw.root/available-skills/{finalizedSkill.folderName}`
                      </span>
                    )}
                  </div>

                  {skillSaveError ? (
                    <div className="border border-black bg-white px-3 py-2 text-sm text-black">
                      {skillSaveError}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          <SkillColumn
            title="Available Skills"
            location="available"
            skills={availableSkills}
            selectedFolderNames={selectedAvailableFolderNames}
            disabled={interactionDisabled}
            onToggle={(folderName) => toggleSelectedFolderName('available', folderName)}
          />

          <SkillColumn
            title="Enabled Skills"
            location="enabled"
            skills={enabledSkills}
            selectedFolderNames={selectedEnabledFolderNames}
            disabled={interactionDisabled}
            onToggle={(folderName) => toggleSelectedFolderName('enabled', folderName)}
          />
        </section>
      )}
    </div>
  )
}
