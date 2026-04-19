'use client'

import { useMemo, useState, useTransition } from 'react'

import { usePathname, useRouter } from 'next/navigation'

import type { SessionMessage, SessionSummary } from '@/lib/openclaw/sessions'

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
  const [isPending, startTransition] = useTransition()
  const activeSessionId = selectedSession?.sessionId ?? ''
  const [selectionState, setSelectionState] = useState<SelectionState>({
    sessionId: activeSessionId,
    selectedMessageKeys: [],
    hasRequestedSkillCreation: false,
  })
  const selectedMessageKeys =
    selectionState.sessionId === activeSessionId
      ? selectionState.selectedMessageKeys
      : EMPTY_MESSAGE_KEYS
  const hasRequestedSkillCreation =
    selectionState.sessionId === activeSessionId ? selectionState.hasRequestedSkillCreation : false

  const selectableMessageKeys = useMemo(() => messages.map(getMessageKey), [messages])
  const selectedMessageKeySet = useMemo(
    () => new Set(selectedMessageKeys),
    [selectedMessageKeys],
  )
  const selectedCount = selectedMessageKeys.length
  const allSelected = selectableMessageKeys.length > 0 && selectedCount === selectableMessageKeys.length

  function handleSelectSession(sessionId: string) {
    if (!sessionId || sessionId === selectedSession?.sessionId) {
      return
    }

    startTransition(() => {
      router.push(`${pathname}?session=${encodeURIComponent(sessionId)}`)
    })
  }

  function handleToggleMessage(messageKey: string) {
    setSelectionState((currentState) => {
      const currentKeys =
        currentState.sessionId === activeSessionId ? currentState.selectedMessageKeys : []

      if (currentKeys.includes(messageKey)) {
        return {
          sessionId: activeSessionId,
          selectedMessageKeys: currentKeys.filter((key) => key !== messageKey),
          hasRequestedSkillCreation:
            currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
        }
      }

      return {
        sessionId: activeSessionId,
        selectedMessageKeys: [...currentKeys, messageKey],
        hasRequestedSkillCreation:
          currentState.sessionId === activeSessionId && currentState.hasRequestedSkillCreation,
      }
    })
  }

  function handleSelectAll() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys: selectableMessageKeys,
      hasRequestedSkillCreation,
    })
  }

  function handleClearSelection() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys: [],
      hasRequestedSkillCreation: false,
    })
  }

  function handleCreateSkill() {
    setSelectionState({
      sessionId: activeSessionId,
      selectedMessageKeys,
      hasRequestedSkillCreation: true,
    })
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

              {!messagesError && messages.length > 0 ? (
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
                <div className="mt-3 border border-black bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                  已准备基于选中的 {selectedCount} 条记录进入 Skill Editor。下一步接入名称、描述与内容生成。
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
