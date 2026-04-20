'use client'

import { useMemo, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import type { SessionMessage, SessionSummary } from '@/lib/openclaw/sessions'

import SelectionRewriteDialog from './selection-rewrite-dialog'

interface SessionsWorkspaceProps {
  sessions: SessionSummary[]
  selectedSession: SessionSummary | null
  messages: SessionMessage[]
  messagesError?: string
}

interface SelectionState {
  sessionId: string
  selectedMessageKeys: string[]
  hasRequestedSkillCreation: boolean
  skillName: string
  skillDescription: string
  generatedSkillContent: string
}

interface SkillContentSelection {
  start: number
  end: number
  text: string
}

interface SkillFileDraft {
  path: string
  content: string
}

interface FinalizedSkillDraft {
  folderName: string
  files: SkillFileDraft[]
}

const EMPTY_MESSAGE_KEYS: string[] = []

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

export default function SessionsWorkspace({
  sessions,
  selectedSession,
  messages,
  messagesError,
}: SessionsWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const generatedSkillContentRef = useRef<HTMLTextAreaElement | null>(null)
  const skillGenerationRequestIdRef = useRef(0)
  const [isPending, startTransition] = useTransition()
  const activeSessionId = selectedSession?.sessionId ?? ''
  const [selectionState, setSelectionState] = useState<SelectionState>({
    sessionId: activeSessionId,
    selectedMessageKeys: [],
    hasRequestedSkillCreation: false,
    skillName: '',
    skillDescription: '',
    generatedSkillContent: '',
  })
  const selectedMessageKeys =
    selectionState.sessionId === activeSessionId
      ? selectionState.selectedMessageKeys
      : EMPTY_MESSAGE_KEYS
  const hasRequestedSkillCreation =
    selectionState.sessionId === activeSessionId ? selectionState.hasRequestedSkillCreation : false
  const skillName = selectionState.sessionId === activeSessionId ? selectionState.skillName : ''
  const skillDescription =
    selectionState.sessionId === activeSessionId ? selectionState.skillDescription : ''
  const generatedSkillContent =
    selectionState.sessionId === activeSessionId ? selectionState.generatedSkillContent : ''
  const [isGeneratingSkill, setIsGeneratingSkill] = useState(false)
  const [skillGenerationError, setSkillGenerationError] = useState('')
  const [skillContentSelection, setSkillContentSelection] = useState<SkillContentSelection | null>(null)
  const [isSelectionRewriteDialogOpen, setIsSelectionRewriteDialogOpen] = useState(false)
  const [selectionRewriteInstruction, setSelectionRewriteInstruction] = useState('')
  const [selectionRewriteError, setSelectionRewriteError] = useState('')
  const [isRewritingSelection, setIsRewritingSelection] = useState(false)
  const [finalizedSkill, setFinalizedSkill] = useState<FinalizedSkillDraft | null>(null)
  const [isFinalizingSkill, setIsFinalizingSkill] = useState(false)
  const [skillFinalizeError, setSkillFinalizeError] = useState('')
  const [isSavingSkill, setIsSavingSkill] = useState(false)
  const [skillSaveError, setSkillSaveError] = useState('')
  const [savedSkillDirectory, setSavedSkillDirectory] = useState('')

  const selectableMessageKeys = useMemo(() => messages.map(getMessageKey), [messages])
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
    setSelectionRewriteError('')
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
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : []
      const nextSelectedMessageKeys = getNextSelectedMessageKeys(currentKeys)

      return {
        sessionId: activeSessionId,
        selectedMessageKeys: nextSelectedMessageKeys,
        hasRequestedSkillCreation:
          nextSelectedMessageKeys.length > 0 &&
          currentState.sessionId === activeSessionId &&
          currentState.hasRequestedSkillCreation,
        skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
        skillDescription:
          currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
        generatedSkillContent: '',
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
      skillName: '',
      skillDescription: '',
      generatedSkillContent: '',
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
      skillName: skillName || selectedSession?.title || '',
      skillDescription,
      generatedSkillContent,
    })
  }

  function handleBackToTimeline() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys,
      hasRequestedSkillCreation: false,
      skillName,
      skillDescription,
      generatedSkillContent,
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
      skillName: nextValue,
      skillDescription:
        currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
      generatedSkillContent:
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
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
      skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
      skillDescription: nextValue,
      generatedSkillContent:
        currentState.sessionId === activeSessionId ? currentState.generatedSkillContent : '',
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
      skillName: currentState.sessionId === activeSessionId ? currentState.skillName : '',
      skillDescription:
        currentState.sessionId === activeSessionId ? currentState.skillDescription : '',
      generatedSkillContent: nextValue,
    }))

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

  async function handleGenerateSkillContent() {
    if (!selectedSession || selectedMessages.length === 0) {
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
        error?: string
      }

      if (requestId !== skillGenerationRequestIdRef.current) {
        return
      }

      if (!response.ok || !result.content) {
        throw new Error(result.error || '生成失败。')
      }

      handleGeneratedSkillContentChange(result.content)
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
          selectedText: skillContentSelection.text,
          instruction: trimmedInstruction,
          selectedMessages,
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

      clearSelectedFragment()

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
    if (!selectedSession) {
      return
    }

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

    setIsFinalizingSkill(true)
    setSkillFinalizeError('')
    setSkillSaveError('')
    setSavedSkillDirectory('')

    try {
      const response = await fetch('/api/skills/finalize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: trimmedSkillName,
          description: trimmedSkillDescription,
          sessionTitle: selectedSession.title,
          sessionKey: selectedSession.sessionKey,
          fullContent: trimmedGeneratedSkillContent,
          selectedMessages,
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

  function handleFinishSkillCreation() {
    handleClearSelection()
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="flex h-[42vh] min-h-0 flex-col overflow-hidden border border-black bg-white lg:h-[calc(100vh-7.5rem)]">
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
                        ? 'border-black bg-black text-white'
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

      <section className="flex h-[62vh] min-h-0 flex-col overflow-hidden border border-black bg-white lg:h-[calc(100vh-7.5rem)]">
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
                    onClick={allSelected ? handleClearSelection : handleSelectAll}
                    className="border border-black px-3 py-1.5 transition-colors hover:bg-neutral-100"
                  >
                    {allSelected ? 'Clear selection' : 'Select all'}
                  </button>

                  <span className="text-neutral-500">
                    {selectedCount === 0 ? '未选择记录' : `已选择 ${selectedCount} / ${messages.length}`}
                  </span>

                  {selectedCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleCreateSkill}
                      className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800"
                    >
                      Create Skill
                    </button>
                  ) : null}
                </div>
              ) : null}

              {hasRequestedSkillCreation && selectedCount > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border border-black bg-neutral-50 p-2 text-xs text-neutral-600">
                  <span>基于已选 {selectedCount} 条记录创建 Skill</span>
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
            ) : hasRequestedSkillCreation && selectedCount > 0 ? (
              <>
                <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5">
                  <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                    <section className="border border-black p-4 sm:p-5">
                    <div className="flex flex-col gap-2">
                      <h3 className="text-sm font-medium tracking-[-0.02em]">Skill Editor</h3>
                      <p className="text-sm text-neutral-600">
                        已隐藏原始时间线。填写 `name` 和 `description` 后，可直接基于已选记录生成完整 SKILL 内容。
                      </p>
                    </div>

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

                    <div className="mt-5 flex flex-wrap items-center gap-2 border border-black bg-neutral-50 p-3 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          void handleGenerateSkillContent()
                        }}
                        disabled={isGeneratingSkill}
                        className="border border-black bg-black px-3 py-1.5 text-white transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
                      >
                        {isGeneratingSkill ? 'Generating...' : 'Generate Skill Content'}
                      </button>
                      <span className="text-neutral-500">将基于当前选中的 {selectedCount} 条时间线记录生成。</span>
                    </div>

                    {skillGenerationError ? (
                      <div className="mt-4 border border-black bg-neutral-50 px-3 py-2 text-sm text-black">
                        {skillGenerationError}
                      </div>
                    ) : null}
                  </section>

                  <section className="border border-black p-4 sm:p-5">
                    <div className="flex flex-col gap-2">
                      <h3 className="text-sm font-medium tracking-[-0.02em]">Generated Content</h3>
                      <p className="text-sm text-neutral-600">
                        生成后可直接在下方继续编辑，作为后续局部修改与保存的基础内容。
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
                        placeholder="生成结果会出现在这里。"
                        rows={18}
                        className="app-scrollbar min-h-80 w-full resize-y border border-black px-3 py-2 pr-14 font-mono text-xs leading-6 outline-none transition-colors placeholder:text-neutral-400 focus:bg-neutral-50"
                      />
                      <SelectionRewriteDialog
                        selection={skillContentSelection}
                        isOpen={isSelectionRewriteDialogOpen}
                        instruction={selectionRewriteInstruction}
                        error={selectionRewriteError}
                        isSubmitting={isRewritingSelection}
                        title="Selected Fragment Rewrite"
                        description="基于当前选区和会话上下文填写修改意见，AI 只会返回当前片段的替换内容。"
                        placeholder="例如：保留原意，但改成更清晰的步骤式写法。"
                        submitLabel="Rewrite Selection"
                        triggerLabel="打开选区改写弹窗"
                        onInstructionChange={setSelectionRewriteInstruction}
                        onOpen={handleOpenSelectionRewriteDialog}
                        onClose={handleCloseSelectionRewriteDialog}
                        onSubmit={() => {
                          void handleRewriteSelection()
                        }}
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
                </div>
              </>
            ) : (
              <div className="app-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 sm:p-5">
                <div className="grid gap-3">
                  {messages.map((message) => {
                    const messageKey = getMessageKey(message)
                    const isChecked = selectedMessageKeySet.has(messageKey)
                    const isUser = message.role === 'user'
                    const isAssistant = message.role === 'assistant'
                    const isThinking = message.role === 'thinking'
                    const isStructured = !isUser && !isAssistant && !isThinking

                    return (
                      <article
                        key={messageKey}
                        className={isUser ? 'flex min-w-0 justify-end' : 'flex min-w-0 justify-start'}
                      >
                        <div
                          className={[
                            'flex min-w-0 max-w-full items-start gap-3',
                            isUser ? 'flex-row-reverse' : 'flex-row',
                          ].join(' ')}
                        >
                          <label className="mt-3 flex shrink-0 cursor-pointer items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleMessage(messageKey)}
                              className="h-4 w-4 rounded-none border-black text-black accent-black"
                            />
                            <span className="sr-only">选择当前记录</span>
                          </label>

                          <div
                            className={[
                              'w-full max-w-3xl overflow-hidden border px-4 py-4 transition-colors sm:px-5',
                              isStructured
                                ? message.isError
                                  ? 'border-black bg-neutral-100 text-black'
                                  : 'border-black bg-neutral-50 text-black'
                                : isUser
                                ? 'border-black bg-black text-white'
                                : isThinking
                                ? 'border-black bg-neutral-100 text-black'
                                : 'border-black bg-white text-black',
                              isChecked ? 'ring-1 ring-black' : '',
                            ].join(' ')}
                          >
                            <div
                              className={[
                                'flex items-center justify-between gap-4 text-[11px] uppercase tracking-[0.2em]',
                                isStructured || isThinking
                                  ? 'text-neutral-500'
                                  : isUser
                                  ? 'text-neutral-400'
                                  : 'text-neutral-500',
                              ].join(' ')}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <span>{getItemLabel(message)}</span>
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
                              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">
                                {message.text}
                              </p>
                            )}
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
