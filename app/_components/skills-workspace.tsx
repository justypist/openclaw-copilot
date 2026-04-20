'use client'

import { useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { FinalizedSkillDraft, SkillFileDraft, SkillLocation, SkillSummary } from '@/lib/skills'

import SelectionRewriteDialog from './selection-rewrite-dialog'

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

interface TextareaViewState {
  scrollTop: number
  scrollLeft: number
  selectionStart: number
  selectionEnd: number
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
  return location === 'available' ? 'workspace/skills' : 'workspace/skills.available'
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
  onPreview: (skill: SkillSummary) => void
}

interface SkillPreviewDialogProps {
  skill: SkillSummary | null
  onClose: () => void
}

function SkillPreviewDialog({ skill, onClose }: SkillPreviewDialogProps) {
  if (!skill) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} preview`}
        className="app-scrollbar max-h-full w-full max-w-5xl overflow-y-auto border border-black bg-white p-4 shadow-[8px_8px_0_0_#000] sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-medium tracking-[-0.02em]">{skill.name}</h3>
            <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">
              {skill.location}:{skill.folderName}
            </p>
            <p className="mt-2 text-sm text-neutral-600">{skill.description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-black px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100"
          >
            关闭
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <time>{formatTimestamp(skill.updatedAt)}</time>
          <span>{skill.filePaths.join(', ')}</span>
        </div>

        <div className="mt-5 border border-black bg-neutral-50 p-3">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
            <span>SKILL.md</span>
            <span>{skill.skillContent.length} chars</span>
          </div>
          <pre className="app-scrollbar mt-3 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-black">
            {skill.skillContent || 'SKILL.md 为空。'}
          </pre>
        </div>
      </div>
    </div>
  )
}

function SkillColumn({
  title,
  location,
  skills,
  selectedFolderNames,
  disabled,
  onToggle,
  onPreview,
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
                <div
                  key={`${skill.location}:${skill.folderName}`}
                  className={[
                    'grid gap-3 border border-black p-3 transition-colors',
                    isSelected ? 'bg-black text-white' : 'bg-white text-black hover:bg-neutral-100',
                    disabled ? 'opacity-60' : '',
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

                    <button
                      type="button"
                      onClick={() => onToggle(skill.folderName)}
                      disabled={disabled}
                      className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                    >
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
                    </button>

                    <button
                      type="button"
                      onClick={() => onPreview(skill)}
                      disabled={disabled}
                      className={[
                        'shrink-0 border px-3 py-1.5 text-xs transition-colors',
                        isSelected
                          ? 'border-white text-white hover:bg-neutral-800'
                          : 'border-black text-black hover:bg-neutral-200',
                        disabled ? 'cursor-not-allowed opacity-60' : '',
                      ].join(' ')}
                    >
                      预览
                    </button>
                  </div>
                </div>
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
  const pendingTextareaViewStateRef = useRef<TextareaViewState | null>(null)
  const [isPending, startTransition] = useTransition()
  const [selectedAvailableFolderNames, setSelectedAvailableFolderNames] = useState<string[]>([])
  const [selectedEnabledFolderNames, setSelectedEnabledFolderNames] = useState<string[]>([])
  const [moveError, setMoveError] = useState('')
  const [moveSummary, setMoveSummary] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [isDownloadingSkills, setIsDownloadingSkills] = useState(false)
  const [hasRequestedMerge, setHasRequestedMerge] = useState(false)
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [generatedSkillContent, setGeneratedSkillContent] = useState('')
  const [isGeneratingSkill, setIsGeneratingSkill] = useState(false)
  const [skillGenerationError, setSkillGenerationError] = useState('')
  const [skillContentSelection, setSkillContentSelection] = useState<SkillContentSelection | null>(null)
  const [isSelectionRewriteDialogOpen, setIsSelectionRewriteDialogOpen] = useState(false)
  const [selectionRewriteInstruction, setSelectionRewriteInstruction] = useState('')
  const [selectionRewritePreview, setSelectionRewritePreview] = useState<string | null>(null)
  const [selectionRewriteError, setSelectionRewriteError] = useState('')
  const [isRewritingSelection, setIsRewritingSelection] = useState(false)
  const [finalizedSkill, setFinalizedSkill] = useState<FinalizedSkillDraft | null>(null)
  const [isFinalizingSkill, setIsFinalizingSkill] = useState(false)
  const [skillFinalizeError, setSkillFinalizeError] = useState('')
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const [skillSaveError, setSkillSaveError] = useState('')
  const [savedSkillDirectory, setSavedSkillDirectory] = useState('')
  const [previewSkill, setPreviewSkill] = useState<SkillSummary | null>(null)

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
    isPending ||
    isGeneratingSkill ||
    isRewritingSelection ||
    isFinalizingSkill ||
    isSavingSkill ||
    isDownloadingSkills

  useLayoutEffect(() => {
    const textarea = generatedSkillContentRef.current
    const pendingViewState = pendingTextareaViewStateRef.current

    if (!textarea || !pendingViewState) {
      return
    }

    pendingTextareaViewStateRef.current = null
    textarea.focus()
    textarea.setSelectionRange(pendingViewState.selectionStart, pendingViewState.selectionEnd)
    textarea.scrollTop = pendingViewState.scrollTop
    textarea.scrollLeft = pendingViewState.scrollLeft
  }, [generatedSkillContent])

  function resetFinalizedSkillState() {
    setFinalizedSkill(null)
    setIsFinalizingSkill(false)
    setSkillFinalizeError('')
    setIsSavingSkill(false)
    setSkillSaveError('')
    setSavedSkillDirectory('')
  }

  function clearSelectedFragment() {
    setSkillContentSelection(null)
    setIsSelectionRewriteDialogOpen(false)
    setSelectionRewriteInstruction('')
    setSelectionRewritePreview(null)
    setSelectionRewriteError('')
  }

  function queueGeneratedContentViewRestore(selectionStart: number, selectionEnd: number) {
    const textarea = generatedSkillContentRef.current

    if (!textarea) {
      return
    }

    pendingTextareaViewStateRef.current = {
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
      selectionStart,
      selectionEnd,
    }
  }

  function handleOpenSelectionRewriteDialog() {
    if (!skillContentSelection) {
      return
    }

    setSelectionRewriteError('')
    setIsSelectionRewriteDialogOpen(true)
  }

  function handleCloseSelectionRewriteDialog() {
    setIsSelectionRewriteDialogOpen(false)
  }

  function handleSelectionRewriteInstructionChange(nextValue: string) {
    setSelectionRewriteInstruction(nextValue)
    setSelectionRewritePreview(null)
    setSelectionRewriteError('')
  }

  function handleSelectionRewritePreviewChange(nextValue: string) {
    setSelectionRewritePreview(nextValue)
    setSelectionRewriteError('')
  }

  function resetMergeEditorState() {
    setSkillName('')
    setSkillDescription('')
    setGeneratedSkillContent('')
    setIsGeneratingSkill(false)
    setSkillGenerationError('')
    clearSelectedFragment()
    setIsRewritingSelection(false)
    resetFinalizedSkillState()
  }

  function resetSelectedSkillsDependentMergeState() {
    resetMergeEditorState()
    setHasRequestedMerge(false)
  }

  function toggleSelectedFolderName(location: SkillLocation, folderName: string) {
    const setter =
      location === 'available' ? setSelectedAvailableFolderNames : setSelectedEnabledFolderNames

    resetSelectedSkillsDependentMergeState()
    setMoveError('')
    setMoveSummary('')
    setDownloadError('')

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

    if (
      skillContentSelection &&
      nextValue.slice(skillContentSelection.start, skillContentSelection.end) !== skillContentSelection.text
    ) {
      clearSelectedFragment()
    }
  }

  function handleGeneratedContentSelection() {
    const textarea = generatedSkillContentRef.current

    if (!textarea) {
      return
    }

    const selectionStart = textarea.selectionStart
    const selectionEnd = textarea.selectionEnd

    if (selectionStart === selectionEnd) {
      clearSelectedFragment()
      return
    }

    const selectedText = textarea.value.slice(selectionStart, selectionEnd)

    if (!selectedText.trim()) {
      clearSelectedFragment()
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
    clearSelectedFragment()
    setSkillFinalizeError('')
    setSkillSaveError('')
  }

  function handleBackToLibrary() {
    setHasRequestedMerge(false)
    clearSelectedFragment()
    setSkillGenerationError('')
  }

  function handleFinishMergeFlow() {
    resetSelectedSkillsDependentMergeState()
  }

  function handleOpenPreview(skill: SkillSummary) {
    setPreviewSkill(skill)
  }

  function handleClosePreview() {
    setPreviewSkill(null)
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
      clearSelectedFragment()
    } catch (error) {
      setSkillGenerationError(error instanceof Error ? error.message : '合并失败。')
    } finally {
      setIsGeneratingSkill(false)
    }
  }

  async function handleDownloadSelectedSkills() {
    if (selectedSkillCount === 0) {
      return
    }

    setDownloadError('')
    setIsDownloadingSkills(true)

    try {
      const response = await fetch('/api/skills/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          skills: selectedSkills,
        }),
      })

      if (!response.ok) {
        const result = (await response.json()) as { error?: string }

        throw new Error(result.error || '下载失败。')
      }

      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition')
      const fileNameMatch = disposition?.match(/filename="([^"]+)"/)
      const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : 'skills.tar.gz'
      const downloadUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')

      anchor.href = downloadUrl
      anchor.download = fileName
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : '下载失败。')
    } finally {
      setIsDownloadingSkills(false)
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

      setSelectionRewritePreview(result.replacement)
    } catch (error) {
      setSelectionRewriteError(error instanceof Error ? error.message : '局部修改失败。')
    } finally {
      setIsRewritingSelection(false)
    }
  }

  function handleApplyRewritePreview() {
    if (!skillContentSelection || selectionRewritePreview === null) {
      return
    }

    const currentSelectedText = generatedSkillContent.slice(
      skillContentSelection.start,
      skillContentSelection.end,
    )

    if (currentSelectedText !== skillContentSelection.text) {
      setSelectionRewriteError('当前选区已经变化，请重新选择要修改的内容。')
      return
    }

    const nextSelectionStart = skillContentSelection.start
    const nextSelectionEnd = skillContentSelection.start + selectionRewritePreview.length
    const nextContent = [
      generatedSkillContent.slice(0, skillContentSelection.start),
      selectionRewritePreview,
      generatedSkillContent.slice(skillContentSelection.end),
    ].join('')

    queueGeneratedContentViewRestore(nextSelectionStart, nextSelectionEnd)
    handleGeneratedSkillContentChange(nextContent)
    clearSelectedFragment()
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

  function buildDirectSaveDraft(): FinalizedSkillDraft | null {
    const trimmedSkillName = skillName.trim()
    const trimmedSkillDescription = skillDescription.trim()
    const trimmedGeneratedSkillContent = generatedSkillContent.trim()

    if (!trimmedSkillName) {
      setSkillFinalizeError('请先填写 skill name。')
      return null
    }

    if (!trimmedSkillDescription) {
      setSkillFinalizeError('请先填写 skill description。')
      return null
    }

    if (!trimmedGeneratedSkillContent) {
      setSkillFinalizeError('请先生成或填写完整 skill 内容。')
      return null
    }

    return {
      folderName: trimmedSkillName,
      files: [
        {
          path: 'SKILL.md',
          content: trimmedGeneratedSkillContent,
        },
      ],
    }
  }

  async function saveSkillDraft(draft: FinalizedSkillDraft) {
    setIsSavingSkill(true)
    setSkillSaveError('')
    setSavedSkillDirectory('')

    try {
      const response = await fetch('/api/skills/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
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

  async function handleSaveSkill() {
    if (!finalizedSkill) {
      return
    }

    await saveSkillDraft(finalizedSkill)
  }

  async function handleDirectSaveSkill() {
    const draft = buildDirectSaveDraft()

    if (!draft) {
      return
    }

    setSkillFinalizeError('')
    setFinalizedSkill(draft)
    await saveSkillDraft(draft)
  }

  return (
    <div className="grid gap-4">
      <SkillPreviewDialog skill={previewSkill} onClose={handleClosePreview} />

      <section className="border border-black bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-base font-medium tracking-[-0.02em]">Skills Library</h1>
            <p className="mt-1 text-sm text-neutral-600">
              展示 `workspace/skills.available` 和 `workspace/skills`，支持多选后转移、下载，或直接合并多个 skills。
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
              onClick={() => {
                void handleDownloadSelectedSkills()
              }}
              disabled={interactionDisabled || hasRequestedMerge || selectedSkillCount === 0}
              className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
            >
              {isDownloadingSkills ? 'Downloading...' : `Download Skill${selectedSkillCount > 1 ? 's' : ''} (${selectedSkillCount})`}
            </button>
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
        {downloadError ? <p className="mt-3 text-sm text-red-600">{downloadError}</p> : null}
        {moveSummary ? <p className="mt-3 text-sm text-neutral-700">{moveSummary}</p> : null}
      </section>

      {hasRequestedMerge ? (
        <div className="grid gap-4">
          <section className="border border-black bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium tracking-[-0.02em]">Merge Skill Editor</h2>
                <p className="text-sm text-neutral-600">
                  已选择 {selectedSkillCount} 个 skills。先生成合并草稿，再支持选区改写、定稿和保存到 `workspace/skills.available`。
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

            <div className="relative mt-5">
              <textarea
                ref={generatedSkillContentRef}
                value={generatedSkillContent}
                onChange={(event) => handleGeneratedSkillContentChange(event.target.value)}
                onSelect={handleGeneratedContentSelection}
                onKeyUp={handleGeneratedContentSelection}
                onMouseUp={handleGeneratedContentSelection}
                placeholder="合并结果会出现在这里。"
                rows={18}
                className="app-scrollbar min-h-80 w-full resize-y border border-black px-3 py-2 pr-14 font-mono text-xs leading-6 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
              />
              <SelectionRewriteDialog
                selection={skillContentSelection}
                isOpen={isSelectionRewriteDialogOpen}
                instruction={selectionRewriteInstruction}
                replacementPreview={selectionRewritePreview}
                error={selectionRewriteError}
                isSubmitting={isRewritingSelection}
                title="Selected Fragment Rewrite"
                description="基于当前选区和源 skills 上下文生成优化预览。确认后才会替换正文，也可以先手动编辑预览内容再替换。"
                placeholder="例如：保留原意，但把重复步骤合并成更清晰的说明。"
                submitLabel={selectionRewritePreview === null ? '生成预览' : '重新生成预览'}
                confirmLabel="确认替换"
                triggerLabel="打开选区改写弹窗"
                onInstructionChange={handleSelectionRewriteInstructionChange}
                onReplacementPreviewChange={handleSelectionRewritePreviewChange}
                onOpen={handleOpenSelectionRewriteDialog}
                onClose={handleCloseSelectionRewriteDialog}
                onSubmit={() => {
                  void handleRewriteSelection()
                }}
                onConfirmReplace={handleApplyRewritePreview}
              />
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
                <button
                  type="button"
                  onClick={() => {
                    void handleDirectSaveSkill()
                  }}
                  disabled={isSavingSkill}
                  className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
                >
                  {isSavingSkill ? 'Saving...' : 'Direct Save as SKILL.md'}
                </button>

                {finalizedSkill ? (
                  <span className="text-sm text-neutral-500">
                    目录名：`{finalizedSkill.folderName}`，共 {finalizedSkill.files.length} 个文件。
                  </span>
                ) : (
                  <span className="text-sm text-neutral-500">可先定稿拆分，也可直接把当前内容保存为 `SKILL.md`。</span>
                )}
              </div>

              {skillFinalizeError ? (
                <div className="mt-4 border border-black bg-white px-3 py-2 text-sm text-black">
                  {skillFinalizeError}
                </div>
              ) : null}

              {skillSaveError ? (
                <div className="mt-4 border border-black bg-white px-3 py-2 text-sm text-black">
                  {skillSaveError}
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
                    {savedSkillDirectory ? (
                      <>
                        <span className="break-all text-sm text-neutral-600">已保存到：{savedSkillDirectory}</span>
                        <button
                          type="button"
                          onClick={handleFinishMergeFlow}
                          className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800"
                        >
                          完成并返回列表
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveSkill()
                          }}
                          disabled={isSavingSkill}
                          className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                        >
                          {isSavingSkill ? 'Saving...' : 'Save to skills.available'}
                        </button>
                        <span className="text-sm text-neutral-500">
                          将写入 `config.openclaw.root/workspace/skills.available/{finalizedSkill.folderName}`
                        </span>
                      </>
                    )}
                  </div>

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
            onPreview={handleOpenPreview}
          />

          <SkillColumn
            title="Enabled Skills"
            location="enabled"
            skills={enabledSkills}
            selectedFolderNames={selectedEnabledFolderNames}
            disabled={interactionDisabled}
            onToggle={(folderName) => toggleSelectedFolderName('enabled', folderName)}
            onPreview={handleOpenPreview}
          />
        </section>
      )}
    </div>
  )
}
