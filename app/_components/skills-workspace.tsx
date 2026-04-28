'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import type { FinalizedSkillDraft, SkillFileDraft, SkillFileRecord, SkillLocation, SkillSummary } from '@/lib/skills'

import SkillContentEditor from './skill-content-editor'
import SkillDraftFilesEditor from './skill-draft-files-editor'

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

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  return `${(size / 1024).toFixed(1)} KB`
}

function getReadOnlyReasonLabel(reason: SkillFileRecord['readOnlyReason']): string {
  if (reason === 'binary') {
    return '二进制文件'
  }

  if (reason === 'too-large') {
    return '文件过大'
  }

  if (reason === 'unsupported-encoding') {
    return '编码不支持'
  }

  if (reason === 'protected') {
    return '受保护文件'
  }

  return '只读'
}

function sortSkillFiles<T extends { path: string }>(files: T[]): T[] {
  return [...files].sort((left, right) => {
    if (left.path === 'SKILL.md') {
      return -1
    }

    if (right.path === 'SKILL.md') {
      return 1
    }

    return left.path.localeCompare(right.path)
  })
}

function normalizeSkillFiles(files: SkillFileDraft[], fallbackContent = ''): SkillFileDraft[] {
  if (files.length > 0) {
    return sortSkillFiles(files)
  }

  return [{ path: 'SKILL.md', content: fallbackContent }]
}

function getFileContentSize(content: string): number {
  return new TextEncoder().encode(content).byteLength
}

function serializeFileDrafts(files: SkillFileRecord[]): string {
  return sortSkillFiles(files)
    .map((file) => [file.path, file.content, String(file.editable), file.readOnlyReason ?? ''].join('\u0000'))
    .join('\u0001')
}

function getSkillEditorDraftStorageKey(location: SkillLocation, folderName: string): string {
  return `skill-editor-draft:${location}:${folderName}`
}

function getValidatedSkillFilePath(value: string, existingPaths: string[], currentPath?: string):
  | {
      ok: true
      path: string
    }
  | {
      ok: false
      error: string
    } {
  const path = value.trim().replace(/\\/g, '/')

  if (!path || path === '.' || path.startsWith('/')) {
    return { ok: false, error: '请输入合法的相对文件路径。' }
  }

  if (path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    return { ok: false, error: '文件路径不能包含空段、. 或 ..。' }
  }

  if (path !== currentPath && existingPaths.includes(path)) {
    return { ok: false, error: `文件已存在：${path}` }
  }

  return { ok: true, path }
}

interface StoredSkillEditorDraft {
  savedSignature: string
  selectedFilePath: string
  files: SkillFileRecord[]
}

function toEditableFileRecords(files: SkillFileDraft[]): SkillFileRecord[] {
  return sortSkillFiles(
    files.map((file) => ({
      path: file.path,
      content: file.content,
      size: getFileContentSize(file.content),
      editable: true,
    })),
  )
}

interface SkillColumnProps {
  title: string
  location: SkillLocation
  skills: SkillSummary[]
  selectedFolderNames: string[]
  disabled: boolean
  confirmingDeleteSkillKey: string
  deletingSkillKey: string
  onToggle: (folderName: string) => void
  onPreview: (skill: SkillSummary) => void
  onDelete: (skill: SkillSummary) => void
}

interface SkillPreviewDialogProps {
  skill: SkillSummary
  onSaved: (previousSkill: SkillSummary, nextSkill: SkillSummary) => void
  onClose: () => void
}

function SkillPreviewDialog({ skill, onSaved, onClose }: SkillPreviewDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const generatedSkillContentRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingTextareaViewStateRef = useRef<TextareaViewState | null>(null)
  const [currentSkill, setCurrentSkill] = useState(skill)
  const [savedFiles, setSavedFiles] = useState<SkillFileRecord[]>([])
  const [draftFiles, setDraftFiles] = useState<SkillFileRecord[]>([])
  const [selectedFilePath, setSelectedFilePath] = useState('SKILL.md')
  const [isLoadingFiles, setIsLoadingFiles] = useState(false)
  const [fileLoadError, setFileLoadError] = useState('')
  const [isAddingFile, setIsAddingFile] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const [renamingFilePath, setRenamingFilePath] = useState('')
  const [renameFilePath, setRenameFilePath] = useState('')
  const [confirmingDeleteFilePath, setConfirmingDeleteFilePath] = useState('')
  const [fileDraftError, setFileDraftError] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [draftContent, setDraftContent] = useState(skill.skillContent)
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const [skillSaveError, setSkillSaveError] = useState('')
  const [skillSaveSummary, setSkillSaveSummary] = useState('')
  const [skillContentSelection, setSkillContentSelection] = useState<SkillContentSelection | null>(null)
  const [isSelectionRewriteDialogOpen, setIsSelectionRewriteDialogOpen] = useState(false)
  const [selectionRewriteInstruction, setSelectionRewriteInstruction] = useState('')
  const [selectionRewritePreview, setSelectionRewritePreview] = useState<string | null>(null)
  const [selectionRewriteError, setSelectionRewriteError] = useState('')
  const [isRewritingSelection, setIsRewritingSelection] = useState(false)
  const [directoryRewriteInstruction, setDirectoryRewriteInstruction] = useState('')
  const [directoryRewriteError, setDirectoryRewriteError] = useState('')
  const [isRewritingDirectory, setIsRewritingDirectory] = useState(false)

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
  }, [draftContent])

  const activeSkill = currentSkill
  const selectedSavedFile = savedFiles.find((file) => file.path === selectedFilePath) ?? null
  const selectedDraftFile = draftFiles.find((file) => file.path === selectedFilePath) ?? null
  const savedSelectedFileContent = selectedSavedFile?.content ?? (selectedFilePath === 'SKILL.md' ? activeSkill.skillContent : '')
  const selectedFileContent = selectedDraftFile?.content ?? savedSelectedFileContent
  const isSelectedFileEditable = selectedDraftFile?.editable ?? true
  const hasUnsavedChanges = serializeFileDrafts(draftFiles) !== serializeFileDrafts(savedFiles)
  const draftStorageKey = getSkillEditorDraftStorageKey(activeSkill.location, activeSkill.folderName)

  useEffect(() => {
    let isCurrent = true

    async function loadSkillFiles() {
      await Promise.resolve()

      if (!isCurrent) {
        return
      }

      setIsLoadingFiles(true)
      setFileLoadError('')

      try {
        const response = await fetch('/api/skills/files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderName: skill.folderName,
            location: skill.location,
          }),
        })
        const result = (await response.json()) as {
          skill?: SkillSummary & { files?: SkillFileRecord[] }
          error?: string
        }

        if (!response.ok || !result.skill || !Array.isArray(result.skill.files)) {
          throw new Error(result.error || '读取 skill 文件失败。')
        }

        if (!isCurrent) {
          return
        }

        const nextFiles = result.skill.files
        const nextSavedSignature = serializeFileDrafts(nextFiles)
        const storedDraftValue = window.localStorage.getItem(
          getSkillEditorDraftStorageKey(result.skill.location, result.skill.folderName),
        )
        let storedDraft: StoredSkillEditorDraft | null = null

        if (storedDraftValue) {
          try {
            storedDraft = JSON.parse(storedDraftValue) as StoredSkillEditorDraft
          } catch {
            window.localStorage.removeItem(getSkillEditorDraftStorageKey(result.skill.location, result.skill.folderName))
          }
        }
        const restoredFiles =
          storedDraft?.savedSignature === nextSavedSignature && Array.isArray(storedDraft.files)
            ? storedDraft.files
            : nextFiles
        const nextSelectedFilePath = nextFiles.some((file) => file.path === 'SKILL.md')
          ? 'SKILL.md'
          : nextFiles[0]?.path ?? 'SKILL.md'
        const restoredSelectedFilePath = restoredFiles.some((file) => file.path === storedDraft?.selectedFilePath)
          ? storedDraft?.selectedFilePath ?? nextSelectedFilePath
          : nextSelectedFilePath
        const nextSkillContent = restoredFiles.find((file) => file.path === restoredSelectedFilePath)?.content ?? result.skill.skillContent

        setCurrentSkill(result.skill)
        setSavedFiles(nextFiles)
        setDraftFiles(restoredFiles)
        setSelectedFilePath(restoredSelectedFilePath)
        setDraftContent(nextSkillContent)
        setIsEditing(Boolean(storedDraft && storedDraft.savedSignature === nextSavedSignature))
        setSkillSaveSummary(storedDraft && storedDraft.savedSignature === nextSavedSignature ? '已恢复上次未保存的本地草稿。' : '')
      } catch (error) {
        if (!isCurrent) {
          return
        }

        setFileLoadError(error instanceof Error ? error.message : '读取 skill 文件失败。')
        setSavedFiles([])
        setDraftFiles([])
        setSelectedFilePath('SKILL.md')
        setDraftContent(skill.skillContent)
      } finally {
        if (isCurrent) {
          setIsLoadingFiles(false)
        }
      }
    }

    void loadSkillFiles()

    return () => {
      isCurrent = false
    }
  }, [skill])

  useEffect(() => {
    if (!isEditing || savedFiles.length === 0) {
      return
    }

    if (!hasUnsavedChanges) {
      window.localStorage.removeItem(draftStorageKey)
      return
    }

    const draft: StoredSkillEditorDraft = {
      savedSignature: serializeFileDrafts(savedFiles),
      selectedFilePath,
      files: draftFiles,
    }

    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft))
  }, [draftFiles, draftStorageKey, hasUnsavedChanges, isEditing, savedFiles, selectedFilePath])

  useEffect(() => {
    if (!isEditing || !hasUnsavedChanges) {
      return
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges, isEditing])

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

  function handleDialogClose() {
    if (isSavingSkill || isRewritingSelection || isRewritingDirectory) {
      return
    }

    if (isEditing && hasUnsavedChanges && !window.confirm('存在未保存的 skill 修改，确认放弃并关闭吗？')) {
      return
    }

    if (isEditing && hasUnsavedChanges) {
      window.localStorage.removeItem(draftStorageKey)
    }

    onClose()
  }

  function discardAllLocalDraftChanges() {
    window.localStorage.removeItem(draftStorageKey)
    handleResetFileDrafts()
  }

  function handleOpenSelectionRewriteDialog() {
    if (!skillContentSelection) {
      return
    }

    setSelectionRewriteError('')
    setIsSelectionRewriteDialogOpen(true)
  }

  function handleCloseSelectionRewriteDialog() {
    if (isRewritingSelection) {
      return
    }

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

  function handleDirectoryRewriteInstructionChange(nextValue: string) {
    setDirectoryRewriteInstruction(nextValue)
    setDirectoryRewriteError('')
  }

  function handleDraftContentChange(nextValue: string) {
    setDraftContent(nextValue)
    setDraftFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.path === selectedFilePath
          ? {
              ...file,
              content: nextValue,
              size: getFileContentSize(nextValue),
            }
          : file,
      ),
    )
    setSkillSaveError('')
    setSkillSaveSummary('')
    setFileDraftError('')
    setDirectoryRewriteError('')

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

  function handleStartEditing() {
    setIsEditing(true)
    setDraftContent(selectedFileContent)
    setSkillSaveError('')
    setSkillSaveSummary('')
    clearSelectedFragment()
  }

  function handleResetDraft() {
    const nextContent = selectedSavedFile?.content ?? (selectedFilePath === 'SKILL.md' ? activeSkill.skillContent : '')

    setDraftContent(nextContent)
    setDraftFiles((currentFiles) =>
      currentFiles.map((file) =>
        file.path === selectedFilePath
          ? {
              ...file,
              content: nextContent,
              size: getFileContentSize(nextContent),
            }
          : file,
      ),
    )
    setSkillSaveError('')
    setSkillSaveSummary('')
    setFileDraftError('')
    clearSelectedFragment()
  }

  function handleSaveCurrentFileDraft() {
    handleDraftContentChange(draftContent)
    setSkillSaveSummary(`已保存 ${selectedFilePath} 到本次编辑草稿。`)
  }

  function handleSelectFile(filePath: string) {
    const nextFile = draftFiles.find((file) => file.path === filePath) ?? savedFiles.find((file) => file.path === filePath)

    setSelectedFilePath(filePath)
    setDraftContent(nextFile?.content ?? '')
    setSkillSaveError('')
    setSkillSaveSummary('')
    setFileDraftError('')
    setConfirmingDeleteFilePath('')
    clearSelectedFragment()
  }

  function handleStartAddFile() {
    setIsAddingFile(true)
    setNewFilePath('')
    setFileDraftError('')
    setConfirmingDeleteFilePath('')
  }

  function handleCancelAddFile() {
    setIsAddingFile(false)
    setNewFilePath('')
  }

  function handleCreateFileFromInput() {
    const validation = getValidatedSkillFilePath(
      newFilePath,
      draftFiles.map((file) => file.path),
    )

    if (!newFilePath.trim()) {
      handleCancelAddFile()
      return
    }

    if (!validation.ok) {
      setFileDraftError(validation.error)
      return
    }

    const nextFile: SkillFileRecord = {
      path: validation.path,
      content: '',
      size: 0,
      editable: true,
    }

    setDraftFiles((currentFiles) => sortSkillFiles([...currentFiles, nextFile]))
    setSelectedFilePath(validation.path)
    setDraftContent('')
    setIsAddingFile(false)
    setNewFilePath('')
    setFileDraftError('')
    setSkillSaveError('')
    setSkillSaveSummary('')
    clearSelectedFragment()
  }

  function handleStartRenameFile(filePath: string) {
    setRenamingFilePath(filePath)
    setRenameFilePath(filePath)
    setIsAddingFile(false)
    setConfirmingDeleteFilePath('')
    setFileDraftError('')
  }

  function handleCancelRenameFile() {
    setRenamingFilePath('')
    setRenameFilePath('')
  }

  function handleRenameFileFromInput() {
    if (!renamingFilePath) {
      return
    }

    const validation = getValidatedSkillFilePath(
      renameFilePath,
      draftFiles.map((file) => file.path),
      renamingFilePath,
    )

    if (!validation.ok) {
      setFileDraftError(validation.error)
      return
    }

    if (validation.path === renamingFilePath) {
      handleCancelRenameFile()
      return
    }

    setDraftFiles((currentFiles) =>
      sortSkillFiles(
        currentFiles.map((file) =>
          file.path === renamingFilePath
            ? {
                ...file,
                path: validation.path,
              }
            : file,
        ),
      ),
    )

    if (selectedFilePath === renamingFilePath) {
      setSelectedFilePath(validation.path)
    }

    setRenamingFilePath('')
    setRenameFilePath('')
    setFileDraftError('')
    setSkillSaveError('')
    setSkillSaveSummary('')
    clearSelectedFragment()
  }

  function handleConfirmDeleteFile(filePath: string) {
    const targetFile = draftFiles.find((file) => file.path === filePath)

    if (!targetFile?.editable) {
      return
    }

    if (confirmingDeleteFilePath !== filePath) {
      setConfirmingDeleteFilePath(filePath)
      setFileDraftError('')
      return
    }

    const nextFiles = draftFiles.filter((file) => file.path !== filePath)
    const nextSelectedFilePath = nextFiles.some((file) => file.path === 'SKILL.md')
      ? 'SKILL.md'
      : nextFiles[0]?.path ?? 'SKILL.md'
    const nextSelectedFile = nextFiles.find((file) => file.path === nextSelectedFilePath)

    setDraftFiles(nextFiles)
    setSelectedFilePath(nextSelectedFilePath)
    setDraftContent(nextSelectedFile?.content ?? '')
    setConfirmingDeleteFilePath('')
    setFileDraftError('')
    setSkillSaveError('')
    setSkillSaveSummary('')
    clearSelectedFragment()
  }

  function handleResetFileDrafts() {
    const nextSelectedFilePath = savedFiles.some((file) => file.path === 'SKILL.md')
      ? 'SKILL.md'
      : savedFiles[0]?.path ?? 'SKILL.md'
    const nextSelectedFile = savedFiles.find((file) => file.path === nextSelectedFilePath)

    setDraftFiles(savedFiles)
    setSelectedFilePath(nextSelectedFilePath)
    setDraftContent(nextSelectedFile?.content ?? activeSkill.skillContent)
    setIsAddingFile(false)
    setNewFilePath('')
    setRenamingFilePath('')
    setRenameFilePath('')
    setConfirmingDeleteFilePath('')
    setFileDraftError('')
    setSkillSaveError('')
    setSkillSaveSummary('')
    clearSelectedFragment()
  }

  function handleCancelEditing() {
    if (hasUnsavedChanges && !window.confirm('存在未保存的 skill 修改，确认放弃并退出编辑吗？')) {
      return
    }

    if (hasUnsavedChanges) {
      discardAllLocalDraftChanges()
    }

    setIsEditing(false)
  }

  async function handleRewriteDirectory() {
    const trimmedInstruction = directoryRewriteInstruction.trim()

    if (!trimmedInstruction) {
      setDirectoryRewriteError('请先填写整目录修改指令。')
      return
    }

    const editableFiles = sortSkillFiles(draftFiles)
      .filter((file) => file.editable)
      .map((file) => ({
        path: file.path,
        content: file.content,
      }))

    if (!editableFiles.some((file) => file.path === 'SKILL.md')) {
      setDirectoryRewriteError('当前可编辑草稿必须包含 SKILL.md。')
      return
    }

    setIsRewritingDirectory(true)
    setDirectoryRewriteError('')
    setSelectionRewriteError('')
    setSkillSaveError('')
    setSkillSaveSummary('')

    try {
      const response = await fetch('/api/skills/rewrite-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: activeSkill.name,
          description: activeSkill.description,
          folderName: activeSkill.folderName,
          currentFilePath: selectedFilePath,
          files: editableFiles,
          instruction: trimmedInstruction,
        }),
      })

      const result = (await response.json()) as {
        files?: SkillFileDraft[]
        error?: string
      }

      if (!response.ok || !Array.isArray(result.files)) {
        throw new Error(result.error || '整目录修改失败。')
      }

      const editableFileRecords = toEditableFileRecords(result.files)
      const editableFilePathSet = new Set(editableFileRecords.map((file) => file.path))
      const nextFiles = sortSkillFiles([
        ...editableFileRecords,
        ...draftFiles.filter((file) => !file.editable && !editableFilePathSet.has(file.path)),
      ])
      const nextSelectedFilePath = nextFiles.some((file) => file.path === selectedFilePath)
        ? selectedFilePath
        : nextFiles.some((file) => file.path === 'SKILL.md')
          ? 'SKILL.md'
          : nextFiles[0]?.path ?? 'SKILL.md'
      const nextSelectedFile = nextFiles.find((file) => file.path === nextSelectedFilePath)

      setDraftFiles(nextFiles)
      setSelectedFilePath(nextSelectedFilePath)
      setDraftContent(nextSelectedFile?.content ?? '')
      setDirectoryRewriteInstruction('')
      setSkillSaveSummary('已生成整目录修改草稿，确认后可保存。')
      clearSelectedFragment()
    } catch (error) {
      setDirectoryRewriteError(error instanceof Error ? error.message : '整目录修改失败。')
    } finally {
      setIsRewritingDirectory(false)
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

    const currentSelectedText = draftContent.slice(skillContentSelection.start, skillContentSelection.end)

    if (currentSelectedText !== skillContentSelection.text) {
      setSelectionRewriteError('当前选区已经变化，请重新选择要修改的内容。')
      return
    }

    setIsRewritingSelection(true)
    setSelectionRewriteError('')
    setSkillSaveError('')
    setSkillSaveSummary('')

    try {
      const response = await fetch('/api/skills/rewrite-merged-selection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: activeSkill.name,
          description: activeSkill.description,
          fullContent: draftContent,
          currentFilePath: selectedFilePath,
          files: sortSkillFiles(draftFiles)
            .filter((file) => file.editable)
            .map((file) => ({
              path: file.path,
              content: file.content,
            })),
          selectedText: skillContentSelection.text,
          instruction: trimmedInstruction,
          selectedSkills: [
            {
              folderName: activeSkill.folderName,
              location: activeSkill.location,
            },
          ],
        }),
      })

      const result = (await response.json()) as {
        mode?: 'draft'
        replacement?: string
        files?: SkillFileDraft[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(result.error || '局部修改失败。')
      }

      if (result.mode === 'draft' && Array.isArray(result.files) && result.files.length > 0) {
        const editableFiles = toEditableFileRecords(result.files)
        const editableFilePathSet = new Set(editableFiles.map((file) => file.path))
        const nextFiles = sortSkillFiles([
          ...editableFiles,
          ...draftFiles.filter((file) => !file.editable && !editableFilePathSet.has(file.path)),
        ])
        const nextSelectedFilePath = nextFiles.some((file) => file.path === selectedFilePath)
          ? selectedFilePath
          : nextFiles.some((file) => file.path === 'SKILL.md')
            ? 'SKILL.md'
            : nextFiles[0]?.path ?? 'SKILL.md'
        const nextSelectedFile = nextFiles.find((file) => file.path === nextSelectedFilePath)

        setDraftFiles(nextFiles)
        setSelectedFilePath(nextSelectedFilePath)
        setDraftContent(nextSelectedFile?.content ?? '')
        setSelectionRewritePreview(null)
        setIsSelectionRewriteDialogOpen(false)
        setSkillSaveSummary('已生成跨文件草稿预览，确认后可保存。')
        clearSelectedFragment()
        return
      }

      if (typeof result.replacement !== 'string') {
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

    const currentSelectedText = draftContent.slice(skillContentSelection.start, skillContentSelection.end)

    if (currentSelectedText !== skillContentSelection.text) {
      setSelectionRewriteError('当前选区已经变化，请重新选择要修改的内容。')
      return
    }

    const nextSelectionStart = skillContentSelection.start
    const nextSelectionEnd = skillContentSelection.start + selectionRewritePreview.length
    const nextContent = [
      draftContent.slice(0, skillContentSelection.start),
      selectionRewritePreview,
      draftContent.slice(skillContentSelection.end),
    ].join('')

    queueGeneratedContentViewRestore(nextSelectionStart, nextSelectionEnd)
    handleDraftContentChange(nextContent)
    clearSelectedFragment()
  }

  async function handleSaveSkill() {
    const files = sortSkillFiles(draftFiles)
      .filter((file) => file.editable)
      .map((file) => ({
        path: file.path,
        content: file.content,
      }))

    if (!files.some((file) => file.path === 'SKILL.md')) {
      setSkillSaveError('最终结果必须包含 SKILL.md。')
      return
    }

    setIsSavingSkill(true)
    setSkillSaveError('')
    setSkillSaveSummary('')

    try {
      const response = await fetch('/api/skills/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderName: activeSkill.folderName,
          location: activeSkill.location,
          files,
        }),
      })

      const result = (await response.json()) as {
        skill?: SkillSummary & { files?: SkillFileRecord[] }
        error?: string
      }

      if (!response.ok || !result.skill) {
        throw new Error(result.error || '保存失败。')
      }

      onSaved(activeSkill, result.skill)
      setCurrentSkill(result.skill)
      const nextFiles = result.skill.files ?? []
      const nextSelectedFilePath = nextFiles.some((file) => file.path === selectedFilePath)
        ? selectedFilePath
        : nextFiles.some((file) => file.path === 'SKILL.md')
          ? 'SKILL.md'
          : nextFiles[0]?.path ?? 'SKILL.md'
      const nextSelectedFile = nextFiles.find((file) => file.path === nextSelectedFilePath)

      setSavedFiles(nextFiles)
      setDraftFiles(nextFiles)
      setSelectedFilePath(nextSelectedFilePath)
      setDraftContent(nextSelectedFile?.content ?? result.skill.skillContent)
      setIsEditing(false)
      window.localStorage.removeItem(draftStorageKey)
      clearSelectedFragment()
      setSkillSaveSummary(`已保存 ${result.skill.location}:${result.skill.folderName}。`)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" onClick={handleDialogClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${activeSkill.name} preview`}
        aria-busy={isSavingSkill || isRewritingSelection || isRewritingDirectory || isPending}
        className="app-scrollbar max-h-full w-full max-w-5xl overflow-y-auto border border-black bg-white p-4 shadow-[8px_8px_0_0_#000] sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-medium tracking-[-0.02em]">{activeSkill.name}</h3>
            <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">
              {activeSkill.location}:{activeSkill.folderName}
            </p>
            <p className="mt-2 text-sm text-neutral-600">{activeSkill.description}</p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {isEditing ? (
              <button
                type="button"
                onClick={() => {
                  void handleSaveSkill()
                }}
                disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory || !hasUnsavedChanges}
                className="border border-black bg-black px-3 py-1.5 text-sm text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
              >
                {isSavingSkill ? 'Saving...' : '保存修改'}
              </button>
            ) : null}
            {isEditing ? (
              <button
                type="button"
                onClick={handleResetFileDrafts}
                disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory || !hasUnsavedChanges}
                className="border border-black px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
              >
                重置全部文件
              </button>
            ) : null}
            {isEditing ? (
              <button
                type="button"
                onClick={handleCancelEditing}
                disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory}
                className="border border-black px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
              >
                放弃编辑
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartEditing}
                disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory}
                className="border border-black bg-black px-3 py-1.5 text-sm text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500"
              >
                编辑
              </button>
            )}

            <button
              type="button"
              onClick={handleDialogClose}
              disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory}
              className="shrink-0 border border-black px-3 py-1.5 text-sm transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
            >
              关闭
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <time>{formatTimestamp(activeSkill.updatedAt)}</time>
          <span>{activeSkill.filePaths.join(', ')}</span>
          <span>当前文件：{selectedDraftFile?.path ?? selectedFilePath}</span>
        </div>

        {isLoadingFiles ? <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">正在加载完整文件集...</div> : null}
        {fileLoadError ? <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">{fileLoadError}</div> : null}

        {skillSaveError ? <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">{skillSaveError}</div> : null}
        {skillSaveSummary ? (
          <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">{skillSaveSummary}</div>
        ) : null}

        {isEditing ? (
          <>
          <div className="mt-5 grid min-h-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col border border-black bg-white p-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Files</div>
              <div className="app-scrollbar mt-3 grid max-h-[min(62vh,720px)] gap-2 overflow-y-auto pr-1">
                {isAddingFile ? (
                  <input
                    type="text"
                    value={newFilePath}
                    onChange={(event) => setNewFilePath(event.target.value)}
                    onBlur={handleCreateFileFromInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleCreateFileFromInput()
                      }

                      if (event.key === 'Escape') {
                        handleCancelAddFile()
                      }
                    }}
                    placeholder="references/example.md"
                    autoFocus
                    className="min-h-[58px] border border-black bg-white p-2 font-mono text-xs outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={handleStartAddFile}
                    className="grid min-h-[58px] gap-1 border border-dashed border-black bg-white p-2 text-left text-xs transition-colors hover:bg-neutral-100"
                  >
                    <span className="font-mono">+ 新增文件</span>
                    <span className="text-neutral-500">输入路径后回车或失焦创建</span>
                  </button>
                )}
                {draftFiles.map((file) => {
                  const isSelected = file.path === selectedFilePath
                  const readOnlyReason = file.editable ? '' : getReadOnlyReasonLabel(file.readOnlyReason)
                  const isConfirmingDelete = confirmingDeleteFilePath === file.path
                  const isRenaming = renamingFilePath === file.path

                  return (
                    <div
                      key={file.path}
                      className={[
                        'group flex items-stretch gap-2 border p-2 text-xs transition-colors',
                        isSelected ? 'border-black bg-black text-white' : 'border-black bg-white text-black hover:bg-neutral-100',
                      ].join(' ')}
                    >
                      {isRenaming ? (
                        <input
                          type="text"
                          value={renameFilePath}
                          onChange={(event) => setRenameFilePath(event.target.value)}
                          onBlur={handleRenameFileFromInput}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              handleRenameFileFromInput()
                            }

                            if (event.key === 'Escape') {
                              handleCancelRenameFile()
                            }
                          }}
                          autoFocus
                          className="min-w-0 flex-1 border border-black bg-white px-2 py-1.5 font-mono text-xs text-black outline-none transition-colors focus:bg-neutral-50"
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSelectFile(file.path)}
                            className="grid min-w-0 flex-1 gap-1 text-left"
                          >
                            <span className="break-all font-mono">{file.path}</span>
                            <span className={isSelected ? 'text-neutral-300' : 'text-neutral-500'}>
                              {formatFileSize(file.size)} · {file.editable ? '可编辑' : readOnlyReason}
                            </span>
                          </button>
                          {file.editable ? (
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleStartRenameFile(file.path)
                                }}
                                className={[
                                  'border px-2 py-1 transition-colors opacity-0 group-hover:opacity-100',
                                  isSelected
                                    ? 'border-white text-white hover:bg-neutral-800'
                                    : 'border-black text-black hover:bg-neutral-200',
                                ].join(' ')}
                              >
                                重命名
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleConfirmDeleteFile(file.path)
                                }}
                                className={[
                                  'border px-2 py-1 transition-colors',
                                  isConfirmingDelete
                                    ? 'border-red-600 bg-red-600 text-white opacity-100 hover:bg-red-700'
                                    : isSelected
                                      ? 'border-white text-white opacity-0 hover:bg-neutral-800 group-hover:opacity-100'
                                      : 'border-black text-black opacity-0 hover:bg-neutral-200 group-hover:opacity-100',
                                ].join(' ')}
                              >
                                {isConfirmingDelete ? '确认删除？' : '删除'}
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
              {fileDraftError ? <div className="mt-3 border border-black bg-neutral-50 px-2 py-1.5 text-xs text-black">{fileDraftError}</div> : null}
            </div>

            <div className="border border-black bg-neutral-50 p-4 sm:p-5">
              <SkillContentEditor
                title={`Edit ${selectedFilePath}`}
                description={isSelectedFileEditable ? '支持直接手动编辑，也支持先在正文中选区，再让 AI 只改写该片段。' : `该文件只读：${getReadOnlyReasonLabel(selectedDraftFile?.readOnlyReason)}。`}
                value={draftContent}
                placeholder={`${selectedFilePath} 内容会显示在这里。`}
                disabled={!isSelectedFileEditable}
                textareaRef={generatedSkillContentRef}
                selection={skillContentSelection}
                isSelectionRewriteDialogOpen={isSelectionRewriteDialogOpen}
                selectionRewriteInstruction={selectionRewriteInstruction}
                selectionRewritePreview={selectionRewritePreview}
                selectionRewriteError={selectionRewriteError}
                isRewritingSelection={isRewritingSelection}
                selectionRewriteTitle="Selected Fragment Rewrite"
                selectionRewriteDescription="基于当前 skill 正文和源文件上下文生成局部改写预览。确认后才会替换正文，也可以先手动编辑预览内容再替换。"
                selectionRewritePlaceholder="例如：保留原意，但把重复步骤改成更清晰的分点说明。"
                selectionRewriteSubmitLabel={selectionRewritePreview === null ? '生成预览' : '重新生成预览'}
                selectionRewriteConfirmLabel="确认替换"
                selectionRewriteTriggerLabel="打开选区改写弹窗"
                onChange={handleDraftContentChange}
                onSelectionChange={handleGeneratedContentSelection}
                onSelectionRewriteInstructionChange={handleSelectionRewriteInstructionChange}
                onSelectionRewritePreviewChange={handleSelectionRewritePreviewChange}
                onOpenSelectionRewriteDialog={handleOpenSelectionRewriteDialog}
                onCloseSelectionRewriteDialog={handleCloseSelectionRewriteDialog}
                onRewriteSelection={() => {
                  void handleRewriteSelection()
                }}
                onApplyRewritePreview={handleApplyRewritePreview}
              />

              <div className="mt-4 flex flex-wrap items-center gap-2 border border-black bg-white p-3 text-sm">
                <button
                  type="button"
                  onClick={handleSaveCurrentFileDraft}
                  disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory || !isSelectedFileEditable}
                  className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                >
                  保存当前文件
                </button>
                <button
                  type="button"
                  onClick={handleResetDraft}
                  disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory || !hasUnsavedChanges}
                  className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
                >
                  重置当前文件
                </button>
                <span className="text-neutral-500">
                  {hasUnsavedChanges ? '存在未保存修改。' : '当前内容与已保存版本一致。'}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 border border-black bg-neutral-50 p-4 text-sm">
            <div className="flex flex-col gap-1">
              <h4 className="font-medium">整目录修改</h4>
              <p className="text-neutral-600">
                对当前 skill 文件集合下指令，AI 可以新增、删除、合并、重命名或同时修改多个文本文件；结果会先写入草稿。
              </p>
            </div>
            <textarea
              value={directoryRewriteInstruction}
              onChange={(event) => handleDirectoryRewriteInstructionChange(event.target.value)}
              placeholder="例如：把 references 下重复的说明合并成一个文件，删除过时脚本说明，并在 SKILL.md 中改为引用新文件。"
              rows={4}
              className="app-scrollbar mt-3 min-h-24 w-full resize-y border border-black bg-white px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50 disabled:cursor-not-allowed disabled:bg-neutral-100"
              disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleRewriteDirectory()
                }}
                disabled={isSavingSkill || isRewritingSelection || isRewritingDirectory || !directoryRewriteInstruction.trim()}
                className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
              >
                {isRewritingDirectory ? 'Rewriting...' : '生成整目录草稿'}
              </button>
              <span className="text-neutral-500">不会直接保存，确认无误后再点击“保存修改”。</span>
            </div>
            {directoryRewriteError ? (
              <div className="mt-3 border border-black bg-white px-3 py-2 text-black">
                {directoryRewriteError}
              </div>
            ) : null}
          </div>
          </>
        ) : (
          <div className="mt-5 border border-black bg-neutral-50 p-3">
            <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
              <span>{selectedFilePath}</span>
              <span>{selectedFileContent.length} chars</span>
            </div>
            <pre className="app-scrollbar mt-3 max-h-[70vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-black">
              {selectedFileContent || `${selectedFilePath} 为空。`}
            </pre>
          </div>
        )}
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
  confirmingDeleteSkillKey,
  deletingSkillKey,
  onToggle,
  onPreview,
  onDelete,
}: SkillColumnProps) {
  const selectedFolderNameSet = new Set(selectedFolderNames)

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border border-black bg-white">
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
              const skillKey = getSkillSelectionKey(skill.location, skill.folderName)
              const isConfirmingDelete = confirmingDeleteSkillKey === skillKey
              const isDeletingSkill = deletingSkillKey === skillKey

              return (
                <div
                  key={`${skill.location}:${skill.folderName}`}
                  className={[
                    'grid gap-3 border p-3 transition-colors',
                    isSelected
                      ? 'border-white bg-white text-black'
                      : 'border-black bg-white text-black hover:bg-neutral-100',
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

                    <button
                      type="button"
                      onClick={() => onDelete(skill)}
                      disabled={disabled}
                      className={[
                        'shrink-0 border px-3 py-1.5 text-xs transition-colors',
                        isConfirmingDelete
                          ? 'border-red-600 bg-red-600 text-white hover:bg-red-700'
                          : isSelected
                            ? 'border-white text-white hover:bg-neutral-800'
                            : 'border-black text-black hover:bg-neutral-200',
                        disabled ? 'cursor-not-allowed opacity-60' : '',
                      ].join(' ')}
                    >
                      {isDeletingSkill ? '删除中...' : isConfirmingDelete ? '确认删除？' : '删除'}
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
  const [deleteError, setDeleteError] = useState('')
  const [deleteSummary, setDeleteSummary] = useState('')
  const [confirmingDeleteSkillKey, setConfirmingDeleteSkillKey] = useState('')
  const [deletingSkillKey, setDeletingSkillKey] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [isDownloadingSkills, setIsDownloadingSkills] = useState(false)
  const [hasRequestedMerge, setHasRequestedMerge] = useState(false)
  const [skillName, setSkillName] = useState('')
  const [skillDescription, setSkillDescription] = useState('')
  const [generatedSkillContent, setGeneratedSkillContent] = useState('')
  const [generatedSkillFiles, setGeneratedSkillFiles] = useState<SkillFileDraft[]>([{ path: 'SKILL.md', content: '' }])
  const [selectedGeneratedSkillFilePath, setSelectedGeneratedSkillFilePath] = useState('SKILL.md')
  const [isGeneratingSkill, setIsGeneratingSkill] = useState(false)
  const [skillGenerationError, setSkillGenerationError] = useState('')
  const [skillContentSelection, setSkillContentSelection] = useState<SkillContentSelection | null>(null)
  const [isSelectionRewriteDialogOpen, setIsSelectionRewriteDialogOpen] = useState(false)
  const [selectionRewriteInstruction, setSelectionRewriteInstruction] = useState('')
  const [selectionRewritePreview, setSelectionRewritePreview] = useState<string | null>(null)
  const [selectionRewriteError, setSelectionRewriteError] = useState('')
  const [isRewritingSelection, setIsRewritingSelection] = useState(false)
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
    isSavingSkill ||
    Boolean(deletingSkillKey) ||
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
    setGeneratedSkillFiles([{ path: 'SKILL.md', content: '' }])
    setSelectedGeneratedSkillFilePath('SKILL.md')
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
    setDeleteError('')
    setDeleteSummary('')
    setConfirmingDeleteSkillKey('')
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
    setGeneratedSkillFiles((currentFiles) => normalizeSkillFiles(currentFiles, generatedSkillContent).map((file) => (
      file.path === selectedGeneratedSkillFilePath
        ? { ...file, content: nextValue }
        : file
    )))

    if (
      skillContentSelection &&
      nextValue.slice(skillContentSelection.start, skillContentSelection.end) !== skillContentSelection.text
    ) {
      clearSelectedFragment()
    }
  }

  function handleGeneratedSkillFilesChange(nextFiles: SkillFileDraft[], nextSelectedFilePath: string) {
    resetFinalizedSkillState()
    const normalizedFiles = normalizeSkillFiles(nextFiles)
    const nextSelectedFile = normalizedFiles.find((file) => file.path === nextSelectedFilePath) ?? normalizedFiles[0]

    setGeneratedSkillFiles(normalizedFiles)
    setSelectedGeneratedSkillFilePath(nextSelectedFile?.path ?? 'SKILL.md')
    setGeneratedSkillContent(nextSelectedFile?.content ?? '')
    clearSelectedFragment()
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
    setConfirmingDeleteSkillKey('')
    setPreviewSkill(skill)
  }

  function handlePreviewSkillSaved(previousSkill: SkillSummary, nextSkill: SkillSummary) {
    const replaceFolderName = (folderNames: string[]) =>
      folderNames.map((folderName) =>
        folderName === previousSkill.folderName ? nextSkill.folderName : folderName,
      )

    if (previousSkill.location === 'available') {
      setSelectedAvailableFolderNames(replaceFolderName)
    } else {
      setSelectedEnabledFolderNames(replaceFolderName)
    }

    setPreviewSkill(nextSkill)
  }

  function handleClosePreview() {
    setPreviewSkill(null)
  }

  async function handleDeleteSkill(skill: SkillSummary) {
    const skillKey = getSkillSelectionKey(skill.location, skill.folderName)

    if (confirmingDeleteSkillKey !== skillKey) {
      setConfirmingDeleteSkillKey(skillKey)
      setDeleteError('')
      setDeleteSummary('')
      return
    }

    setDeletingSkillKey(skillKey)
    setDeleteError('')
    setDeleteSummary('')

    try {
      const response = await fetch('/api/skills/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location: skill.location,
          folderName: skill.folderName,
        }),
      })

      const result = (await response.json()) as {
        deletedSkillFolderName?: string
        location?: SkillLocation
        error?: string
      }

      if (!response.ok || typeof result.deletedSkillFolderName !== 'string') {
        throw new Error(result.error || '删除失败。')
      }

      if (skill.location === 'available') {
        setSelectedAvailableFolderNames((folderNames) =>
          folderNames.filter((folderName) => folderName !== skill.folderName),
        )
      } else {
        setSelectedEnabledFolderNames((folderNames) =>
          folderNames.filter((folderName) => folderName !== skill.folderName),
        )
      }

      if (previewSkill && getSkillSelectionKey(previewSkill.location, previewSkill.folderName) === skillKey) {
        setPreviewSkill(null)
      }

      resetMergeEditorState()
      setHasRequestedMerge(false)
      setConfirmingDeleteSkillKey('')
      setDeleteSummary(`已删除 ${skill.location}:${result.deletedSkillFolderName}。`)

      startTransition(() => {
        router.refresh()
      })
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '删除失败。')
    } finally {
      setDeletingSkillKey('')
    }
  }

  async function handleMoveSkills(from: SkillLocation) {
    const skillFolderNames =
      from === 'available' ? selectedAvailableFolderNames : selectedEnabledFolderNames

    if (skillFolderNames.length === 0) {
      return
    }

    setMoveError('')
    setMoveSummary('')
    setDeleteError('')
    setDeleteSummary('')
    setConfirmingDeleteSkillKey('')

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
        files?: SkillFileDraft[]
        error?: string
      }

      if (!response.ok || !result.content) {
        throw new Error(result.error || '合并失败。')
      }

      handleGeneratedSkillFilesChange(normalizeSkillFiles(result.files ?? [], result.content), 'SKILL.md')
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
          currentFilePath: selectedGeneratedSkillFilePath,
          files: normalizeSkillFiles(generatedSkillFiles, generatedSkillContent),
          selectedText: skillContentSelection.text,
          instruction: trimmedInstruction,
          selectedSkills,
        }),
      })

      const result = (await response.json()) as {
        mode?: 'draft'
        replacement?: string
        files?: SkillFileDraft[]
        error?: string
      }

      if (!response.ok) {
        throw new Error(result.error || '局部修改失败。')
      }

      if (result.mode === 'draft' && Array.isArray(result.files)) {
        handleGeneratedSkillFilesChange(result.files, selectedGeneratedSkillFilePath)
        clearSelectedFragment()
        return
      }

      if (typeof result.replacement !== 'string') {
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

  function buildDirectSaveDraft(): FinalizedSkillDraft | null {
    const trimmedSkillName = skillName.trim()
    const trimmedSkillDescription = skillDescription.trim()
    const draftFiles = normalizeSkillFiles(generatedSkillFiles, generatedSkillContent)
    const skillFileContent = draftFiles.find((file) => file.path === 'SKILL.md')?.content.trim() ?? ''

    if (!trimmedSkillName) {
      setSkillFinalizeError('请先填写 skill name。')
      return null
    }

    if (!trimmedSkillDescription) {
      setSkillFinalizeError('请先填写 skill description。')
      return null
    }

    if (!skillFileContent) {
      setSkillFinalizeError('请先生成或填写 SKILL.md 内容。')
      return null
    }

    return {
      folderName: trimmedSkillName,
      files: draftFiles,
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

  async function handleDirectSaveSkill() {
    const draft = buildDirectSaveDraft()

    if (!draft) {
      return
    }

    setSkillFinalizeError('')
    await saveSkillDraft(draft)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {previewSkill ? (
        <SkillPreviewDialog
          key={`${previewSkill.location}:${previewSkill.folderName}:${previewSkill.updatedAt ?? 0}`}
          skill={previewSkill}
          onSaved={handlePreviewSkillSaved}
          onClose={handleClosePreview}
        />
      ) : null}

      <section className="shrink-0 border border-black bg-white px-4 py-3 sm:px-5">
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
        {deleteError ? <p className="mt-3 text-sm text-red-600">{deleteError}</p> : null}
        {downloadError ? <p className="mt-3 text-sm text-red-600">{downloadError}</p> : null}
        {moveSummary ? <p className="mt-3 text-sm text-neutral-700">{moveSummary}</p> : null}
        {deleteSummary ? <p className="mt-3 text-sm text-neutral-700">{deleteSummary}</p> : null}
      </section>

      {hasRequestedMerge ? (
        <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="grid gap-4">
          <section className="border border-black bg-white p-4 sm:p-5">
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-medium tracking-[-0.02em]">Merge Skill Editor</h2>
                <p className="text-sm text-neutral-600">
                  已选择 {selectedSkillCount} 个 skills。先生成合并草稿，再支持多文件编辑、选区改写和直接保存到 `workspace/skills.available`。
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
            <SkillDraftFilesEditor
              files={normalizeSkillFiles(generatedSkillFiles, generatedSkillContent)}
              selectedFilePath={selectedGeneratedSkillFilePath}
              title="Generated Content"
              description="生成后可继续手动编辑文件集合，并支持仅改写当前选中的局部片段。"
              placeholder="合并结果会出现在这里。"
              textareaRef={generatedSkillContentRef}
              selection={skillContentSelection}
              isSelectionRewriteDialogOpen={isSelectionRewriteDialogOpen}
              selectionRewriteInstruction={selectionRewriteInstruction}
              selectionRewritePreview={selectionRewritePreview}
              selectionRewriteError={selectionRewriteError}
              isRewritingSelection={isRewritingSelection}
              selectionRewriteTitle="Selected Fragment Rewrite"
              selectionRewriteDescription="基于当前选区和源 skills 上下文生成优化预览。确认后才会替换正文，也可以先手动编辑预览内容再替换。"
              selectionRewritePlaceholder="例如：保留原意，但把重复步骤合并成更清晰的说明。"
              selectionRewriteSubmitLabel={selectionRewritePreview === null ? '生成预览' : '重新生成预览'}
              selectionRewriteConfirmLabel="确认替换"
              selectionRewriteTriggerLabel="打开选区改写弹窗"
              onFilesChange={handleGeneratedSkillFilesChange}
              onSelectionChange={handleGeneratedContentSelection}
              onSelectionRewriteInstructionChange={handleSelectionRewriteInstructionChange}
              onSelectionRewritePreviewChange={handleSelectionRewritePreviewChange}
              onOpenSelectionRewriteDialog={handleOpenSelectionRewriteDialog}
              onCloseSelectionRewriteDialog={handleCloseSelectionRewriteDialog}
              onRewriteSelection={() => {
                void handleRewriteSelection()
              }}
              onApplyRewritePreview={handleApplyRewritePreview}
            />

            <div className="mt-4 border border-black bg-neutral-50 p-4">
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-medium">Save Skill Files</h4>
                <p className="text-sm text-neutral-600">
                  修改满意后，直接把当前文件集合保存到 `workspace/skills.available`。
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                        void handleDirectSaveSkill()
                      }}
                      disabled={isSavingSkill}
                      className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                    >
                      {isSavingSkill ? 'Saving...' : 'Save to skills.available'}
                    </button>
                    <span className="text-sm text-neutral-500">将写入当前文件集合，包含 `SKILL.md` 和所有辅助文件。</span>
                  </>
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
            </div>
          </section>
          </div>
        </div>
      ) : (
        <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4 lg:grid-cols-2 lg:grid-rows-1">
          <SkillColumn
            title="Available Skills"
            location="available"
            skills={availableSkills}
            selectedFolderNames={selectedAvailableFolderNames}
            disabled={interactionDisabled}
            confirmingDeleteSkillKey={confirmingDeleteSkillKey}
            deletingSkillKey={deletingSkillKey}
            onToggle={(folderName) => toggleSelectedFolderName('available', folderName)}
            onPreview={handleOpenPreview}
            onDelete={(skill) => {
              void handleDeleteSkill(skill)
            }}
          />

          <SkillColumn
            title="Enabled Skills"
            location="enabled"
            skills={enabledSkills}
            selectedFolderNames={selectedEnabledFolderNames}
            disabled={interactionDisabled}
            confirmingDeleteSkillKey={confirmingDeleteSkillKey}
            deletingSkillKey={deletingSkillKey}
            onToggle={(folderName) => toggleSelectedFolderName('enabled', folderName)}
            onPreview={handleOpenPreview}
            onDelete={(skill) => {
              void handleDeleteSkill(skill)
            }}
          />
        </section>
      )}
    </div>
  )
}
