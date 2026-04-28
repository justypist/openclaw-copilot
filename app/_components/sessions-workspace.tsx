'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import type { SessionMessage, SessionSummary } from '@/lib/openclaw/sessions'
import type { FinalizedSkillDraft, SkillFileDraft, SkillFileRecord, SkillLocation, SkillSummary } from '@/lib/skills'

import SkillDraftFilesEditor from './skill-draft-files-editor'

interface SessionsWorkspaceProps {
  sessions: SessionSummary[]
  selectedSession: SessionSummary | null
  messages: SessionMessage[]
  availableSkills: SkillSummary[]
  enabledSkills: SkillSummary[]
  messagesError?: string
}

type SkillDraftMode = 'create' | 'update'

interface SelectionState {
  sessionId: string
  selectedMessageKeys: string[]
  hasRequestedSkillCreation: boolean
  skillDraftMode: SkillDraftMode
  targetSkillKey: string
  updateInstruction: string
  skillName: string
  skillDescription: string
  generatedSkillContent: string
  generatedSkillFiles: SkillFileDraft[]
  selectedSkillFilePath: string
}

interface TargetSkillReference {
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

const EMPTY_MESSAGE_KEYS: string[] = []
const EMPTY_SKILL_FILES: SkillFileDraft[] = []
const DEFAULT_SKILL_FILE_PATH = 'SKILL.md'
const NORMAL_MESSAGE_ROLES = new Set<SessionMessage['role']>(['user', 'assistant'])

function sortSkillFiles<T extends { path: string }>(files: T[]): T[] {
  return [...files].sort((left, right) => {
    if (left.path === DEFAULT_SKILL_FILE_PATH) {
      return -1
    }

    if (right.path === DEFAULT_SKILL_FILE_PATH) {
      return 1
    }

    return left.path.localeCompare(right.path)
  })
}

function normalizeSkillFiles(files: SkillFileDraft[], fallbackContent = ''): SkillFileDraft[] {
  if (files.length > 0) {
    return sortSkillFiles(files)
  }

  return [{ path: DEFAULT_SKILL_FILE_PATH, content: fallbackContent }]
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

function getItemLabel(message: SessionMessage): string {
  if (message.label) {
    return message.label
  }

  if (message.role === 'tool-call') {
    return 'tool call'
  }

  if (message.role === 'tool-result') {
    return message.isError ? 'tool error' : 'tool result'
  }

  if (message.role === 'model-change') {
    return 'model change'
  }

  if (message.role === 'thinking-level-change') {
    return 'thinking level'
  }

  return message.role
}

function getMessageKey(message: SessionMessage): string {
  return `${message.id}-${message.timestamp ?? 'unknown'}`
}

function getSkillKey(skill: TargetSkillReference): string {
  return `${skill.location}:${skill.folderName}`
}

function isNormalMessage(message: SessionMessage): boolean {
  return NORMAL_MESSAGE_ROLES.has(message.role) && Boolean(message.text.trim())
}

function isSelectableMessage(message: SessionMessage): boolean {
  return isNormalMessage(message)
}

export default function SessionsWorkspace({
  sessions,
  selectedSession,
  messages,
  availableSkills,
  enabledSkills,
  messagesError,
}: SessionsWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const generatedSkillContentRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingTextareaViewStateRef = useRef<TextareaViewState | null>(null)
  const skillGenerationRequestIdRef = useRef(0)
  const targetSkillFilesRequestIdRef = useRef(0)
  const [isPending, startTransition] = useTransition()
  const activeSessionId = selectedSession?.sessionId ?? ''
  const [selectionState, setSelectionState] = useState<SelectionState>({
    sessionId: activeSessionId,
    selectedMessageKeys: [],
    hasRequestedSkillCreation: false,
    skillDraftMode: 'create',
    targetSkillKey: '',
    updateInstruction: '',
    skillName: '',
    skillDescription: '',
    generatedSkillContent: '',
    generatedSkillFiles: [{ path: DEFAULT_SKILL_FILE_PATH, content: '' }],
    selectedSkillFilePath: DEFAULT_SKILL_FILE_PATH,
  })
  const hasRequestedSkillCreation =
    selectionState.sessionId === activeSessionId ? selectionState.hasRequestedSkillCreation : false
  const skillName = selectionState.sessionId === activeSessionId ? selectionState.skillName : ''
  const skillDescription =
    selectionState.sessionId === activeSessionId ? selectionState.skillDescription : ''
  const generatedSkillContent =
    selectionState.sessionId === activeSessionId ? selectionState.generatedSkillContent : ''
  const generatedSkillFiles =
    selectionState.sessionId === activeSessionId ? selectionState.generatedSkillFiles : EMPTY_SKILL_FILES
  const selectedSkillFilePath =
    selectionState.sessionId === activeSessionId ? selectionState.selectedSkillFilePath : DEFAULT_SKILL_FILE_PATH
  const skillDraftMode =
    selectionState.sessionId === activeSessionId ? selectionState.skillDraftMode : 'create'
  const targetSkillKey = selectionState.sessionId === activeSessionId ? selectionState.targetSkillKey : ''
  const updateInstruction =
    selectionState.sessionId === activeSessionId ? selectionState.updateInstruction : ''
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
  const [showAllMessages, setShowAllMessages] = useState(false)
  const [targetSkillFilesError, setTargetSkillFilesError] = useState('')

  const selectableMessages = useMemo(
    () => messages.filter((message) => isSelectableMessage(message)),
    [messages],
  )
  const selectableMessageKeys = useMemo(
    () => selectableMessages.map(getMessageKey),
    [selectableMessages],
  )
  const selectableMessageKeySet = useMemo(
    () => new Set(selectableMessageKeys),
    [selectableMessageKeys],
  )
  const visibleMessages = useMemo(
    () => (showAllMessages ? messages : selectableMessages),
    [messages, selectableMessages, showAllMessages],
  )
  const existingSkills = useMemo(
    () => [
      ...enabledSkills.map((skill) => ({ ...skill, locationLabel: 'enabled' })),
      ...availableSkills.map((skill) => ({ ...skill, locationLabel: 'available' })),
    ],
    [availableSkills, enabledSkills],
  )
  const selectedTargetSkill = useMemo(
    () => existingSkills.find((skill) => getSkillKey(skill) === targetSkillKey) ?? null,
    [existingSkills, targetSkillKey],
  )
  const canUpdateExistingSkill = existingSkills.length > 0
  const hiddenNonNormalCount = messages.length - selectableMessages.length
  const rawSelectedMessageKeys =
    selectionState.sessionId === activeSessionId
      ? selectionState.selectedMessageKeys
      : EMPTY_MESSAGE_KEYS
  const selectedMessageKeys = useMemo(
    () => rawSelectedMessageKeys.filter((messageKey) => selectableMessageKeySet.has(messageKey)),
    [rawSelectedMessageKeys, selectableMessageKeySet],
  )
  const selectedMessageKeySet = useMemo(
    () => new Set(selectedMessageKeys),
    [selectedMessageKeys],
  )
  const selectedMessages = useMemo(
    () => messages.filter((message) => selectedMessageKeySet.has(getMessageKey(message))),
    [messages, selectedMessageKeySet],
  )
  const selectedCount = selectedMessageKeys.length
  const allSelected = selectableMessageKeys.length > 0 && selectedCount === selectableMessageKeys.length

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

  useEffect(() => {
    if (skillDraftMode !== 'update' || !selectedTargetSkill || !hasRequestedSkillCreation) {
      targetSkillFilesRequestIdRef.current += 1
      return
    }

    const requestId = targetSkillFilesRequestIdRef.current + 1
    targetSkillFilesRequestIdRef.current = requestId

    async function loadTargetSkillFiles() {
      if (!selectedTargetSkill) {
        return
      }

      try {
        const response = await fetch('/api/skills/files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderName: selectedTargetSkill.folderName,
            location: selectedTargetSkill.location,
          }),
        })

        const result = (await response.json()) as {
          skill?: {
            files?: SkillFileRecord[]
          }
          error?: string
        }

        if (requestId !== targetSkillFilesRequestIdRef.current) {
          return
        }

        if (!response.ok || !result.skill || !Array.isArray(result.skill.files)) {
          throw new Error(result.error || '读取目标 skill 文件失败。')
        }

        const editableFiles = normalizeSkillFiles(
          result.skill.files
            .filter((file) => file.editable)
            .map((file) => ({ path: file.path, content: file.content })),
          selectedTargetSkill.skillContent,
        )
        const nextSelectedFile = editableFiles.find((file) => file.path === DEFAULT_SKILL_FILE_PATH) ?? editableFiles[0]

        setSelectionState((currentState) => {
          if (currentState.sessionId !== activeSessionId || currentState.skillDraftMode !== 'update') {
            return currentState
          }

          return {
            ...currentState,
            generatedSkillContent: nextSelectedFile?.content ?? '',
            generatedSkillFiles: editableFiles,
            selectedSkillFilePath: nextSelectedFile?.path ?? DEFAULT_SKILL_FILE_PATH,
          }
        })
      } catch (error) {
        if (requestId === targetSkillFilesRequestIdRef.current) {
          setTargetSkillFilesError(error instanceof Error ? error.message : '读取目标 skill 文件失败。')
        }
      }
    }

    void loadTargetSkillFiles()
  }, [activeSessionId, hasRequestedSkillCreation, selectedTargetSkill, skillDraftMode])

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

  function invalidateSkillGenerationRequest() {
    skillGenerationRequestIdRef.current += 1
  }

  function resetSelectionDependentSkillState() {
    invalidateSkillGenerationRequest()
    setIsGeneratingSkill(false)
    setSkillGenerationError('')
    clearSelectedFragment()
    setIsRewritingSelection(false)
    resetFinalizedSkillState()
  }

  function updateSelectionState(
    getNextSelectedMessageKeys: (currentKeys: string[]) => string[],
  ) {
    resetSelectionDependentSkillState()
    setSelectionState((currentState) => {
      const currentKeys =
        currentState.sessionId === activeSessionId
          ? currentState.selectedMessageKeys.filter((messageKey) =>
              selectableMessageKeySet.has(messageKey),
            )
          : []
      const nextSelectedMessageKeys = Array.from(
        new Set(
          getNextSelectedMessageKeys(currentKeys).filter((messageKey) =>
            selectableMessageKeySet.has(messageKey),
          ),
        ),
      )

      return {
        sessionId: activeSessionId,
        selectedMessageKeys: nextSelectedMessageKeys,
        hasRequestedSkillCreation:
          nextSelectedMessageKeys.length > 0 &&
          currentState.sessionId === activeSessionId &&
          currentState.hasRequestedSkillCreation,
        skillDraftMode:
          currentState.sessionId === activeSessionId ? currentState.skillDraftMode : 'create',
        targetSkillKey: currentState.sessionId === activeSessionId ? currentState.targetSkillKey : '',
        updateInstruction:
          currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
        skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
        skillDescription:
          currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
        generatedSkillContent: '',
        generatedSkillFiles: [{ path: DEFAULT_SKILL_FILE_PATH, content: '' }],
        selectedSkillFilePath: DEFAULT_SKILL_FILE_PATH,
      }
    })
  }

  function handleSelectSession(sessionId: string) {
    if (!sessionId || sessionId === selectedSession?.sessionId) {
      return
    }

    resetSelectionDependentSkillState()

    startTransition(() => {
      router.push(`${pathname}?session=${encodeURIComponent(sessionId)}`)
    })
  }

  function handleToggleMessage(messageKey: string) {
    if (!selectableMessageKeySet.has(messageKey)) {
      return
    }

    updateSelectionState((currentKeys) =>
      currentKeys.includes(messageKey)
        ? currentKeys.filter((key) => key !== messageKey)
        : [...currentKeys, messageKey],
    )
  }

  function handleSelectAll() {
    updateSelectionState(() => selectableMessageKeys)
  }

  function handleClearSelection() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys: [],
      hasRequestedSkillCreation: false,
      skillDraftMode: 'create',
      targetSkillKey: '',
      updateInstruction: '',
      skillName: '',
      skillDescription: '',
      generatedSkillContent: '',
      generatedSkillFiles: [{ path: DEFAULT_SKILL_FILE_PATH, content: '' }],
      selectedSkillFilePath: DEFAULT_SKILL_FILE_PATH,
    })
    setSkillGenerationError('')
    setIsGeneratingSkill(false)
    clearSelectedFragment()
    setIsRewritingSelection(false)
    resetFinalizedSkillState()
  }

  function handleCreateSkill() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys,
      hasRequestedSkillCreation: true,
      skillDraftMode,
      targetSkillKey,
      updateInstruction,
      skillName: skillName || selectedSession?.title || '',
      skillDescription,
      generatedSkillContent,
      generatedSkillFiles: normalizeSkillFiles(generatedSkillFiles, generatedSkillContent),
      selectedSkillFilePath,
    })
  }

  function handleSkillDraftModeChange(nextMode: SkillDraftMode) {
    resetFinalizedSkillState()
    setTargetSkillFilesError('')
    clearSelectedFragment()

    const nextTargetSkill =
      nextMode === 'update' ? selectedTargetSkill ?? existingSkills[0] ?? null : null

    setSelectionState((currentState) => {
      const currentFiles = normalizeSkillFiles(
        currentState.sessionId === activeSessionId ? currentState.generatedSkillFiles : [],
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      )
      const nextFiles = nextTargetSkill
        ? [{ path: DEFAULT_SKILL_FILE_PATH, content: nextTargetSkill.skillContent }]
        : nextMode === 'create'
          ? [{ path: DEFAULT_SKILL_FILE_PATH, content: '' }]
          : currentFiles
      const nextSelectedFilePath = nextFiles.some((file) => file.path === currentState.selectedSkillFilePath)
        ? currentState.selectedSkillFilePath
        : DEFAULT_SKILL_FILE_PATH
      const nextSelectedFile = nextFiles.find((file) => file.path === nextSelectedFilePath) ?? nextFiles[0]

      return {
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode: nextMode,
      targetSkillKey: nextTargetSkill ? getSkillKey(nextTargetSkill) : '',
      updateInstruction:
        currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
      skillName:
        nextTargetSkill?.name ??
        (currentState.sessionId === activeSessionId ? currentState.skillName : selectedSession?.title ?? ''),
      skillDescription:
        nextTargetSkill?.description ??
        (currentState.sessionId === activeSessionId ? currentState.skillDescription : ''),
      generatedSkillContent: nextSelectedFile?.content ?? '',
      generatedSkillFiles: nextFiles,
      selectedSkillFilePath: nextSelectedFilePath,
      }
    })
  }

  function handleTargetSkillChange(nextTargetSkillKey: string) {
    resetFinalizedSkillState()
    setTargetSkillFilesError('')
    clearSelectedFragment()

    const nextTargetSkill = existingSkills.find((skill) => getSkillKey(skill) === nextTargetSkillKey) ?? null

    setSelectionState((currentState) => ({
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode: 'update',
      targetSkillKey: nextTargetSkill ? getSkillKey(nextTargetSkill) : '',
      updateInstruction:
        currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
      skillName: nextTargetSkill?.name ?? '',
      skillDescription: nextTargetSkill?.description ?? '',
      generatedSkillContent: nextTargetSkill?.skillContent ?? '',
      generatedSkillFiles: [{ path: DEFAULT_SKILL_FILE_PATH, content: nextTargetSkill?.skillContent ?? '' }],
      selectedSkillFilePath: DEFAULT_SKILL_FILE_PATH,
    }))
  }

  function handleUpdateInstructionChange(nextValue: string) {
    setSkillGenerationError('')
    setSelectionState((currentState) => ({
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode:
        currentState.sessionId === activeSessionId ? currentState.skillDraftMode : 'update',
      targetSkillKey: currentState.sessionId === activeSessionId ? currentState.targetSkillKey : '',
      updateInstruction: nextValue,
      skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
      skillDescription:
        currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
      generatedSkillContent:
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      generatedSkillFiles: normalizeSkillFiles(
        currentState.sessionId === activeSessionId ? currentState.generatedSkillFiles : [],
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      ),
      selectedSkillFilePath:
        currentState.sessionId === activeSessionId ? currentState.selectedSkillFilePath : DEFAULT_SKILL_FILE_PATH,
    }))
  }

  function handleBackToTimeline() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys,
      hasRequestedSkillCreation: false,
      skillDraftMode,
      targetSkillKey,
      updateInstruction,
      skillName,
      skillDescription,
      generatedSkillContent,
      generatedSkillFiles: normalizeSkillFiles(generatedSkillFiles, generatedSkillContent),
      selectedSkillFilePath,
    })
    clearSelectedFragment()
    setIsRewritingSelection(false)
  }

  function handleSkillNameChange(nextValue: string) {
    resetFinalizedSkillState()
    setSelectionState((currentState) => ({
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode:
        currentState.sessionId === activeSessionId ? currentState.skillDraftMode : 'create',
      targetSkillKey: currentState.sessionId === activeSessionId ? currentState.targetSkillKey : '',
      updateInstruction:
        currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
      skillName: nextValue,
      skillDescription:
        currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
      generatedSkillContent:
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      generatedSkillFiles: normalizeSkillFiles(
        currentState.sessionId === activeSessionId ? currentState.generatedSkillFiles : [],
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      ),
      selectedSkillFilePath:
        currentState.sessionId === activeSessionId ? currentState.selectedSkillFilePath : DEFAULT_SKILL_FILE_PATH,
    }))
  }

  function handleSkillDescriptionChange(nextValue: string) {
    resetFinalizedSkillState()
    setSelectionState((currentState) => ({
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode:
        currentState.sessionId === activeSessionId ? currentState.skillDraftMode : 'create',
      targetSkillKey: currentState.sessionId === activeSessionId ? currentState.targetSkillKey : '',
      updateInstruction:
        currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
      skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
      skillDescription: nextValue,
      generatedSkillContent:
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      generatedSkillFiles: normalizeSkillFiles(
        currentState.sessionId === activeSessionId ? currentState.generatedSkillFiles : [],
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      ),
      selectedSkillFilePath:
        currentState.sessionId === activeSessionId ? currentState.selectedSkillFilePath : DEFAULT_SKILL_FILE_PATH,
    }))
  }

  function handleGeneratedSkillContentChange(nextValue: string) {
    resetFinalizedSkillState()
    setSelectionState((currentState) => ({
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode:
        currentState.sessionId === activeSessionId ? currentState.skillDraftMode : 'create',
      targetSkillKey: currentState.sessionId === activeSessionId ? currentState.targetSkillKey : '',
      updateInstruction:
        currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
      skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
      skillDescription:
        currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
      generatedSkillContent: nextValue,
      generatedSkillFiles: normalizeSkillFiles(
        currentState.sessionId === activeSessionId ? currentState.generatedSkillFiles : [],
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
      ).map((file) => (
        file.path === (currentState.sessionId === activeSessionId ? currentState.selectedSkillFilePath : DEFAULT_SKILL_FILE_PATH)
          ? { ...file, content: nextValue }
          : file
      )),
      selectedSkillFilePath:
        currentState.sessionId === activeSessionId ? currentState.selectedSkillFilePath : DEFAULT_SKILL_FILE_PATH,
    }))

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

    setSelectionState((currentState) => ({
      sessionId: activeSessionId,
      selectedMessageKeys:
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
      hasRequestedSkillCreation:
        currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      skillDraftMode:
        currentState.sessionId === activeSessionId ? currentState.skillDraftMode : 'create',
      targetSkillKey: currentState.sessionId === activeSessionId ? currentState.targetSkillKey : '',
      updateInstruction:
        currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
      skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
      skillDescription:
        currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
      generatedSkillContent: nextSelectedFile?.content ?? '',
      generatedSkillFiles: normalizedFiles,
      selectedSkillFilePath: nextSelectedFile?.path ?? DEFAULT_SKILL_FILE_PATH,
    }))

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

  async function handleGenerateSkillContent() {
    if (!selectedSession || selectedMessages.length === 0) {
      return
    }

    if (skillDraftMode === 'update') {
      await handleGenerateUpdatedSkillContent()
      return
    }

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

    setIsGeneratingSkill(true)
    setSkillGenerationError('')
    setSelectionRewriteError('')
    resetFinalizedSkillState()
    const requestId = skillGenerationRequestIdRef.current + 1
    skillGenerationRequestIdRef.current = requestId

    try {
      const response = await fetch('/api/skills/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedSkillName,
          description: trimmedSkillDescription,
          sessionTitle: selectedSession.title,
          sessionKey: selectedSession.sessionKey,
          selectedMessages,
        }),
      })

      const result = (await response.json()) as {
        content?: string
        files?: SkillFileDraft[]
        error?: string
      }

      if (requestId !== skillGenerationRequestIdRef.current) {
        return
      }

      if (!response.ok || !result.content) {
        throw new Error(result.error || '生成失败。')
      }

      handleGeneratedSkillFilesChange(normalizeSkillFiles(result.files ?? [], result.content), DEFAULT_SKILL_FILE_PATH)
      clearSelectedFragment()
    } catch (error) {
      if (requestId !== skillGenerationRequestIdRef.current) {
        return
      }

      setSkillGenerationError(error instanceof Error ? error.message : '生成失败。')
    } finally {
      if (requestId === skillGenerationRequestIdRef.current) {
        setIsGeneratingSkill(false)
      }
    }
  }

  async function handleGenerateUpdatedSkillContent() {
    if (!selectedSession || selectedMessages.length === 0) {
      return
    }

    if (!selectedTargetSkill) {
      setSkillGenerationError('请先选择要更新的 skill。')
      return
    }

    const trimmedInstruction = updateInstruction.trim()

    if (!trimmedInstruction) {
      setSkillGenerationError('请先填写如何更新这个 skill。')
      return
    }

    setIsGeneratingSkill(true)
    setSkillGenerationError('')
    setSelectionRewriteError('')
    resetFinalizedSkillState()
    const requestId = skillGenerationRequestIdRef.current + 1
    skillGenerationRequestIdRef.current = requestId

    try {
      const response = await fetch('/api/skills/generate-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetSkill: {
            folderName: selectedTargetSkill.folderName,
            location: selectedTargetSkill.location,
          },
          instruction: trimmedInstruction,
          sessionTitle: selectedSession.title,
          sessionKey: selectedSession.sessionKey,
          selectedMessages,
        }),
      })

      const result = (await response.json()) as {
        content?: string
        files?: SkillFileDraft[]
        error?: string
      }

      if (requestId !== skillGenerationRequestIdRef.current) {
        return
      }

      if (!response.ok || !result.content) {
        throw new Error(result.error || '生成更新草稿失败。')
      }

      handleGeneratedSkillFilesChange(normalizeSkillFiles(result.files ?? [], result.content), DEFAULT_SKILL_FILE_PATH)
      clearSelectedFragment()
    } catch (error) {
      if (requestId !== skillGenerationRequestIdRef.current) {
        return
      }

      setSkillGenerationError(error instanceof Error ? error.message : '生成更新草稿失败。')
    } finally {
      if (requestId === skillGenerationRequestIdRef.current) {
        setIsGeneratingSkill(false)
      }
    }
  }

  async function handleRewriteSelection() {
    if (!selectedSession || !skillContentSelection) {
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
      const response = await fetch('/api/skills/rewrite-selection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: skillName.trim(),
          description: skillDescription.trim(),
          sessionTitle: selectedSession.title,
          sessionKey: selectedSession.sessionKey,
          fullContent: generatedSkillContent,
          currentFilePath: selectedSkillFilePath,
          files: normalizeSkillFiles(generatedSkillFiles, generatedSkillContent),
          selectedText: skillContentSelection.text,
          instruction: trimmedInstruction,
          selectedMessages,
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
        handleGeneratedSkillFilesChange(result.files, selectedSkillFilePath)
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
    const skillFileContent = draftFiles.find((file) => file.path === DEFAULT_SKILL_FILE_PATH)?.content.trim() ?? ''

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
    } catch (error) {
      setSkillSaveError(error instanceof Error ? error.message : '保存失败。')
    } finally {
      setIsSavingSkill(false)
    }
  }

  async function handleSaveExistingSkillContent() {
    if (!selectedTargetSkill) {
      setSkillSaveError('请先选择要更新的 skill。')
      return
    }

    const draftFiles = normalizeSkillFiles(generatedSkillFiles, generatedSkillContent)
    const skillFileContent = draftFiles.find((file) => file.path === DEFAULT_SKILL_FILE_PATH)?.content.trim() ?? ''

    if (!skillFileContent) {
      setSkillSaveError('请先生成或填写 SKILL.md 内容。')
      return
    }

    setIsSavingSkill(true)
    setSkillSaveError('')
    setSavedSkillDirectory('')

    try {
      const response = await fetch('/api/skills/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          folderName: selectedTargetSkill.folderName,
          location: selectedTargetSkill.location,
          files: draftFiles,
        }),
      })

      const result = (await response.json()) as {
        skill?: SkillSummary
        error?: string
      }

      if (!response.ok || !result.skill) {
        throw new Error(result.error || '保存失败。')
      }

      const savedSkill = result.skill

      setSelectionState((currentState) => ({
        sessionId: activeSessionId,
        selectedMessageKeys:
          currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : [],
        hasRequestedSkillCreation:
          currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
        skillDraftMode: 'update',
        targetSkillKey: getSkillKey(savedSkill),
        updateInstruction:
          currentState.sessionId === activeSessionId ? currentState.updateInstruction : '',
        skillName: savedSkill.name,
        skillDescription: savedSkill.description,
        generatedSkillContent: skillFileContent,
        generatedSkillFiles: draftFiles,
        selectedSkillFilePath,
      }))
      setSavedSkillDirectory(
        `${savedSkill.location === 'enabled' ? 'workspace/skills' : 'workspace/skills.available'}/${savedSkill.folderName}`,
      )
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
    if (skillDraftMode === 'update') {
      await handleSaveExistingSkillContent()
      return
    }

    const draft = buildDirectSaveDraft()

    if (!draft) {
      return
    }

    setSkillFinalizeError('')
    await saveSkillDraft(draft)
  }

  function handleFinishSkillCreation() {
    handleClearSelection()
  }

  return (
    <section className="grid min-h-0 flex-1 grid-rows-[minmax(0,2fr)_minmax(0,3fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-1">
      <aside className="flex h-full min-h-0 flex-col overflow-hidden border border-black bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-black px-4 py-3">
          <h2 className="text-sm font-medium">Sessions</h2>
          <span className="text-xs text-neutral-500">{isPending ? 'Loading' : sessions.length}</span>
        </div>

        <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="border border-black p-4 text-sm text-neutral-500">
              当前没有可展示的会话。
            </div>
          ) : (
            <div className="grid gap-2">
              {sessions.map((session) => {
                const isSelected = session.sessionId === selectedSession?.sessionId

                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectSession(session.sessionId)}
                    className={[
                      'w-full overflow-hidden border px-3 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-white bg-white text-black'
                        : 'border-black bg-white text-black hover:bg-neutral-100',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{session.title}</p>
                        <p
                          className={[
                            'mt-2 line-clamp-2 break-all font-mono text-[11px]',
                            isSelected ? 'text-neutral-400' : 'text-neutral-500',
                          ].join(' ')}
                        >
                          {session.sessionKey}
                        </p>
                      </div>

                      <span
                        className={[
                          'border px-2 py-1 text-[11px]',
                          isSelected ? 'border-white text-white' : 'border-black text-black',
                        ].join(' ')}
                      >
                        {session.messageCount}
                      </span>
                    </div>

                    <div
                      className={[
                        'mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs',
                        isSelected ? 'text-neutral-300' : 'text-neutral-500',
                      ].join(' ')}
                    >
                      <span className="min-w-0 break-all">{session.channel ?? 'unknown'}</span>
                      <time className="shrink-0">{formatTimestamp(session.updatedAt)}</time>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <section className="flex h-full min-h-0 flex-col overflow-hidden border border-black bg-white">
        {!selectedSession ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center text-neutral-500">
            暂无会话，右侧消息区还没有内容。
          </div>
        ) : (
          <>
            <div className="border-b border-black px-4 py-3 sm:px-5">
              <h2 className="text-base font-medium tracking-[-0.02em]">
                {selectedSession.title}
              </h2>
              <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">
                {selectedSession.sessionKey}
              </p>

              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                <span>{selectedSession.messageCount} messages</span>
                <span>{messages.length} entries</span>
                <span>{selectedSession.status ?? 'unknown'}</span>
                <span>{selectedSession.model ?? 'unknown'}</span>
                <span>{formatTimestamp(selectedSession.startedAt)}</span>
              </div>

              {!messagesError && messages.length > 0 && !hasRequestedSkillCreation ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border border-black p-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setShowAllMessages((currentValue) => !currentValue)}
                    className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
                  >
                    {showAllMessages ? '仅显示普通消息' : '显示所有消息'}
                  </button>

                  <button
                    type="button"
                    onClick={allSelected ? handleClearSelection : handleSelectAll}
                    className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
                    disabled={selectableMessageKeys.length === 0}
                  >
                    {allSelected ? '清空选择' : '全选普通消息'}
                  </button>

                  <span className="text-neutral-500">
                    {selectedCount === 0
                      ? `可选普通消息 ${selectableMessageKeys.length} 条`
                      : `已选择 ${selectedCount} / ${selectableMessageKeys.length}`}
                  </span>

                  {hiddenNonNormalCount > 0 ? (
                    <span className="text-neutral-500">另有 {hiddenNonNormalCount} 条非普通消息</span>
                  ) : null}

                  {selectedCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleCreateSkill}
                      className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800"
                    >
                      Create / Update Skill
                    </button>
                  ) : null}
                </div>
              ) : null}

              {hasRequestedSkillCreation && selectedCount > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border border-black bg-neutral-50 p-2 text-xs text-neutral-600">
                  <span>基于已选 {selectedCount} 条记录创建或更新 Skill</span>
                  <button
                    type="button"
                    onClick={handleBackToTimeline}
                    className="border border-black px-3 py-1.5 text-black transition-colors hover:bg-neutral-100"
                  >
                    Back to Timeline
                  </button>
                </div>
              ) : null}
            </div>

            {messagesError ? (
              <div className="min-h-0 flex-1 p-4 sm:p-5">
                <div className="border border-black p-4 text-sm">
                  {messagesError}
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center text-neutral-500">
                该会话里还没有可展示的 user / assistant 文本消息。
              </div>
            ) : visibleMessages.length === 0 ? (
              <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 text-center text-neutral-500">
                当前默认视图下没有普通消息，可点击上方“显示所有消息”查看全部记录。
              </div>
            ) : hasRequestedSkillCreation && selectedCount > 0 ? (
              <>
                <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5">
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <section className="border border-black p-4 sm:p-5">
                      <div className="flex flex-col gap-2">
                        <h3 className="text-sm font-medium tracking-[-0.02em]">Skill Editor</h3>
                        <p className="text-sm text-neutral-600">
                          已隐藏原始时间线。可以生成新 Skill，也可以选择一个已有 Skill，并用所选记录生成更新草稿。
                        </p>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
                        <button
                          type="button"
                          aria-pressed={skillDraftMode === 'create'}
                          onClick={() => handleSkillDraftModeChange('create')}
                          className={[
                            'border px-3 py-1.5 transition-colors',
                            skillDraftMode === 'create'
                              ? 'border-white bg-white text-black'
                              : 'border-black bg-white text-black hover:bg-neutral-100',
                          ].join(' ')}
                        >
                          生成新 Skill
                        </button>
                        <button
                          type="button"
                          aria-pressed={skillDraftMode === 'update'}
                          onClick={() => handleSkillDraftModeChange('update')}
                          disabled={!canUpdateExistingSkill}
                          className={[
                            'border px-3 py-1.5 transition-colors disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400',
                            skillDraftMode === 'update'
                              ? 'border-white bg-white text-black'
                              : 'border-black bg-white text-black hover:bg-neutral-100',
                          ].join(' ')}
                        >
                          更新已有 Skill
                        </button>
                        {!canUpdateExistingSkill ? (
                          <span className="text-neutral-500">当前没有可更新的已有 Skill。</span>
                        ) : null}
                      </div>

                      {skillDraftMode === 'create' ? (
                        <div className="mt-5 grid gap-4">
                          <label className="grid gap-2 text-sm">
                            <span className="font-medium">name</span>
                            <input
                              type="text"
                              value={skillName}
                              onChange={(event) => handleSkillNameChange(event.target.value)}
                              placeholder="例如：extract-skill-from-chat"
                              className="w-full border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                            />
                          </label>

                          <label className="grid gap-2 text-sm">
                            <span className="font-medium">description</span>
                            <textarea
                              value={skillDescription}
                              onChange={(event) => handleSkillDescriptionChange(event.target.value)}
                              placeholder="简要描述这个 skill 解决什么问题、适用于什么场景。"
                              rows={6}
                              className="app-scrollbar min-h-36 w-full resize-y border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="mt-5 grid gap-4">
                          <label className="grid gap-2 text-sm">
                            <span className="font-medium">要更新的 Skill</span>
                            <select
                              value={targetSkillKey}
                              onChange={(event) => handleTargetSkillChange(event.target.value)}
                              className="w-full border border-black bg-white px-3 py-2 outline-none transition-colors focus:bg-neutral-50"
                            >
                              <option value="">请选择已有 Skill</option>
                              {existingSkills.map((skill) => (
                                <option key={getSkillKey(skill)} value={getSkillKey(skill)}>
                                  {skill.name} ({skill.locationLabel}/{skill.folderName})
                                </option>
                              ))}
                            </select>
                          </label>

                          {selectedTargetSkill ? (
                            <div className="border border-black bg-neutral-50 p-3 text-sm text-neutral-600">
                              <p className="font-medium text-black">{selectedTargetSkill.description}</p>
                              <p className="mt-2 break-all font-mono text-[11px]">
                                {selectedTargetSkill.location === 'enabled' ? 'workspace/skills' : 'workspace/skills.available'}/
                                {selectedTargetSkill.folderName}
                              </p>
                              {selectedTargetSkill.filePaths.length > 1 ? (
                                <p className="mt-2 text-xs">保存时只会更新该目录下的 `SKILL.md`。</p>
                              ) : null}
                            </div>
                          ) : null}

                          <label className="grid gap-2 text-sm">
                            <span className="font-medium">更新指令</span>
                            <textarea
                              value={updateInstruction}
                              onChange={(event) => handleUpdateInstructionChange(event.target.value)}
                              placeholder="例如：把这次对话中确认的新命令和注意事项合并进去，保留原有结构，移除过时步骤。"
                              rows={5}
                              className="app-scrollbar min-h-32 w-full resize-y border border-black px-3 py-2 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                            />
                          </label>
                        </div>
                      )}

                      <div className="mt-5 flex flex-wrap items-center gap-2 border border-black bg-neutral-50 p-3 text-sm">
                        <button
                          type="button"
                          onClick={() => {
                            void handleGenerateSkillContent()
                          }}
                          disabled={isGeneratingSkill || (skillDraftMode === 'update' && !canUpdateExistingSkill)}
                          className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                        >
                          {isGeneratingSkill
                            ? 'Generating...'
                            : skillDraftMode === 'update'
                              ? 'Generate Update Draft'
                              : 'Generate Skill Content'}
                        </button>
                        <span className="text-neutral-500">
                          将基于当前选中的 {selectedCount} 条时间线记录
                          {skillDraftMode === 'update' ? '更新所选 Skill。' : '生成新 Skill。'}
                        </span>
                      </div>

                      {skillGenerationError ? (
                        <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">
                          {skillGenerationError}
                        </div>
                      ) : null}
                    </section>

                  <section className="border border-black p-4 sm:p-5">
                    <SkillDraftFilesEditor
                      files={normalizeSkillFiles(generatedSkillFiles, generatedSkillContent)}
                      selectedFilePath={selectedSkillFilePath}
                      title={skillDraftMode === 'update' ? 'Updated Skill Content' : 'Generated Content'}
                      description={
                        skillDraftMode === 'update'
                          ? '这里是所选 Skill 的文件草稿。生成更新后可继续手动编辑，再写回原 Skill。'
                          : '生成后可直接在下方继续编辑文件集合，作为后续局部修改与保存的基础内容。'
                      }
                      placeholder={skillDraftMode === 'update' ? '选择已有 Skill 后会显示当前文件内容。' : '生成结果会出现在这里。'}
                      textareaRef={generatedSkillContentRef}
                      selection={skillContentSelection}
                      isSelectionRewriteDialogOpen={isSelectionRewriteDialogOpen}
                      selectionRewriteInstruction={selectionRewriteInstruction}
                      selectionRewritePreview={selectionRewritePreview}
                      selectionRewriteError={selectionRewriteError}
                      isRewritingSelection={isRewritingSelection}
                      selectionRewriteTitle="Selected Fragment Rewrite"
                      selectionRewriteDescription="基于当前选区和会话上下文生成优化预览。确认后才会替换正文，也可以先手动编辑预览内容再替换。"
                      selectionRewritePlaceholder="例如：保留原意，但改成更清晰的步骤式写法。"
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

                    {skillDraftMode === 'update' ? (
                      <div className="mt-4 border border-black bg-neutral-50 p-4">
                        <div className="flex flex-col gap-2">
                          <h4 className="text-sm font-medium">Save Existing Skill</h4>
                          <p className="text-sm text-neutral-600">
                            修改满意后，可把当前文件集合写回所选 Skill。
                          </p>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {savedSkillDirectory ? (
                            <>
                              <span className="break-all text-sm text-neutral-600">已保存到：{savedSkillDirectory}</span>
                              <button
                                type="button"
                                onClick={handleFinishSkillCreation}
                                className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800"
                              >
                                完成并返回时间线
                              </button>
                              <Link
                                href="/skills"
                                className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
                              >
                                查看 Skills Library
                              </Link>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  void handleSaveExistingSkillContent()
                                }}
                                disabled={isSavingSkill || !selectedTargetSkill}
                                className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                              >
                                {isSavingSkill ? 'Saving...' : 'Save to Existing Skill'}
                              </button>
                              <span className="text-sm text-neutral-500">会保存当前草稿中的所有文本文件。</span>
                            </>
                          )}
                        </div>

                        {skillSaveError ? (
                          <div className="mt-4 border border-black bg-white px-3 py-2 text-sm text-black">
                            {skillSaveError}
                          </div>
                        ) : null}

                        {targetSkillFilesError ? (
                          <div className="mt-4 border border-black bg-white px-3 py-2 text-sm text-black">
                            {targetSkillFilesError}
                          </div>
                        ) : null}
                      </div>
                    ) : (
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
                                onClick={handleFinishSkillCreation}
                                className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800"
                              >
                                完成并返回时间线
                              </button>
                              <Link
                                href="/skills"
                                className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
                              >
                                查看 Skills Library
                              </Link>
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
                    )}
                    </section>
                  </div>
                </div>
              </>
            ) : (
              <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5">
                <div className="grid gap-3">
                  {visibleMessages.map((message) => {
                    const messageKey = getMessageKey(message)
                    const isChecked = selectedMessageKeySet.has(messageKey)
                    const isSelectable = isSelectableMessage(message)
                    const isUser = message.role === 'user'
                    const isAssistant = message.role === 'assistant'
                    const isThinking = message.role === 'thinking'
                    const isStructured = !isUser && !isAssistant && !isThinking

                    return (
                      <article key={messageKey} className="flex min-w-0 justify-start">
                        <div className="flex min-w-0 max-w-full items-start gap-3">
                          <div
                            onClick={() => {
                              if (!isSelectable) {
                                return
                              }

                              handleToggleMessage(messageKey)
                            }}
                            onKeyDown={(event) => {
                              if (!isSelectable) {
                                return
                              }

                              if (event.key !== 'Enter' && event.key !== ' ') {
                                return
                              }

                              event.preventDefault()
                              handleToggleMessage(messageKey)
                            }}
                            className={[
                              'flex w-full min-w-0 max-w-3xl items-start gap-3 text-left',
                              isSelectable ? 'cursor-pointer' : 'cursor-not-allowed',
                            ].join(' ')}
                            role={isSelectable ? 'button' : undefined}
                            tabIndex={isSelectable ? 0 : -1}
                            aria-pressed={isSelectable ? isChecked : undefined}
                            aria-label={
                              isSelectable
                                ? isChecked
                                  ? '取消选择当前记录'
                                  : '选择当前记录'
                                : '当前记录不是普通消息，暂不支持选择'
                            }
                          >
                            <span className="mt-3 flex shrink-0 items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                              <span
                                aria-hidden="true"
                                className={[
                                  'flex h-4 w-4 items-center justify-center border text-[10px] leading-none',
                                  isChecked
                                    ? 'border-white bg-white text-white'
                                    : 'border-black bg-white text-transparent',
                                  !isSelectable ? 'bg-neutral-100 text-neutral-100' : '',
                                ].join(' ')}
                              >
                                ✓
                              </span>
                              <span className="sr-only">
                                {isSelectable ? '选择当前记录' : '当前记录不可选择'}
                              </span>
                            </span>

                            <div
                              className={[
                                'w-full overflow-hidden border px-4 py-4 transition-colors sm:px-5',
                                !isSelectable
                                  ? 'border-dashed border-neutral-300 bg-neutral-50 text-neutral-500'
                                  : isStructured
                                    ? message.isError
                                      ? 'border-black bg-neutral-100 text-black'
                                      : 'border-black bg-neutral-50 text-black'
                                    : isUser
                                      ? 'border-black bg-neutral-50 text-black'
                                      : isThinking
                                        ? 'border-black bg-neutral-100 text-black'
                                        : 'border-black bg-white text-black',
                                isChecked ? 'ring-1 ring-black' : '',
                              ].join(' ')}
                            >
                              <div
                                className={[
                                  'flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.2em]',
                                  !isSelectable || isStructured || isThinking
                                    ? 'text-neutral-500'
                                    : isUser
                                      ? 'text-neutral-400'
                                      : 'text-neutral-500',
                                ].join(' ')}
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className={isUser ? 'text-xs font-semibold' : undefined}>
                                    {getItemLabel(message)}
                                  </span>
                                  {message.toolName ? (
                                    <span className="truncate font-mono normal-case tracking-normal">
                                      {message.toolName}
                                    </span>
                                  ) : null}
                                </div>
                                <time>{formatTimestamp(message.timestamp)}</time>
                              </div>

                              {message.toolCallId ? (
                                <p className="mt-2 break-all font-mono text-[11px] text-neutral-500">
                                  {message.toolCallId}
                                </p>
                              ) : null}

                              {message.details ? (
                                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-neutral-500">
                                  {message.details}
                                </pre>
                              ) : null}

                              {isStructured ? (
                                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-6">
                                  {message.text}
                                </pre>
                              ) : isThinking ? (
                                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-neutral-700">
                                  {message.text}
                                </p>
                              ) : (
                                <p
                                  className={[
                                    'mt-3 whitespace-pre-wrap break-words leading-7',
                                    isUser ? 'text-[15px] font-medium' : 'text-sm',
                                  ].join(' ')}
                                >
                                  {message.text}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  )
}
