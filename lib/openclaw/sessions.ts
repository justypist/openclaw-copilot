import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { config } from '@/config'

export interface SessionSummary {
  sessionId: string
  sessionKey: string
  updatedAt: number
  startedAt?: number
  status?: string
  model?: string
  channel?: string
  messageCount: number
  title: string
}

export interface SessionMessage {
  id: string
  role:
    | 'user'
    | 'assistant'
    | 'thinking'
    | 'tool-call'
    | 'tool-result'
    | 'session'
    | 'model-change'
    | 'thinking-level-change'
    | 'custom'
    | 'content-part'
    | 'event'
  text: string
  timestamp?: number
  toolName?: string
  toolCallId?: string
  isError?: boolean
  label?: string
  details?: string
}

interface SessionsOverviewData {
  root: string
  sessionsDirectory: string
  sessions: SessionSummary[]
}

export type SessionsOverviewResult =
  | {
      ok: true
      data: SessionsOverviewData
    }
  | {
      ok: false
      error: string
      root: string
    }

interface SessionIndexRecord {
  sessionId: string
  updatedAt: number
  sessionKey?: string
  startedAt?: number
  status?: string
  model?: string
  lastChannel?: string
  deliveryContext?: {
    channel?: string
  }
}

interface SessionFileRecord {
  id?: string
  parentId?: string
  type?: string
  timestamp?: string
  version?: number
  cwd?: string
  provider?: string
  modelId?: string
  thinkingLevel?: string
  customType?: string
  data?: unknown
  message?: {
    role?: string
    content?: SessionContentPart[]
    timestamp?: number
    toolCallId?: string
    toolName?: string
    isError?: boolean
    api?: string
    provider?: string
    model?: string
    usage?: unknown
    stopReason?: string
    responseId?: string
  }
}

interface SessionContentPart {
  type?: string
  text?: string
  thinking?: string
  thinkingSignature?: string
  id?: string
  name?: string
  arguments?: unknown
  partialJson?: string
}

interface ParsedSessionFile {
  startedAt?: number
  title?: string
  messageCount: number
  messages?: SessionMessage[]
}

interface SessionsContext {
  root: string
  sessionsDirectory: string
}

function isSessionContentPart(value: unknown): value is SessionContentPart {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const MAX_TITLE_LENGTH = 80

function getSessionsDirectory(root: string): string {
  return join(root, 'agents', 'main', 'sessions')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function extractText(content: SessionContentPart[] | undefined): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .filter(isSessionContentPart)
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n')
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, maxLength - 1)}…`
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function stringifyRecordDetails(value: Record<string, unknown>): string {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)

  if (entries.length === 0) {
    return ''
  }

  return stringifyUnknown(Object.fromEntries(entries))
}

function buildTitleFromText(text: string): string | undefined {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]

    if (
      line === '```' ||
      line === '```json' ||
      line.startsWith('Sender (untrusted metadata):') ||
      line.startsWith('Conversation info (untrusted metadata):')
    ) {
      continue
    }

    return truncate(line.replace(/\s+/g, ' '), MAX_TITLE_LENGTH)
  }

  return undefined
}

function fallbackTitle(sessionKey: string, sessionId: string): string {
  if (sessionKey) {
    return sessionKey
  }

  return `session:${sessionId}`
}

function extractTextParts(content: SessionContentPart[] | undefined): string[] {
  if (!Array.isArray(content)) {
    return []
  }

  return content
    .filter(isSessionContentPart)
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
}

function buildEventEntry(input: {
  id: string
  role: SessionMessage['role']
  timestamp?: number
  text: string
  label?: string
  details?: string
  toolName?: string
  toolCallId?: string
  isError?: boolean
}): SessionMessage {
  return input
}

function buildToolCallEntry(
  part: SessionContentPart,
  fallbackId: string,
  index: number,
  timestamp: number | undefined,
): SessionMessage {
  const argumentsText =
    part.arguments !== undefined ? stringifyUnknown(part.arguments) : part.partialJson?.trim() ?? ''

  return {
    id: part.id ?? `${fallbackId}-tool-call-${index + 1}`,
    role: 'tool-call',
    text: argumentsText,
    timestamp,
    toolName: part.name,
    toolCallId: part.id,
    label: part.name,
  }
}

function getMessageTimestamp(record: SessionFileRecord): number | undefined {
  if (typeof record.message?.timestamp === 'number') {
    return record.message.timestamp
  }

  if (!record.timestamp) {
    return undefined
  }

  const timestamp = Date.parse(record.timestamp)

  if (Number.isNaN(timestamp)) {
    return undefined
  }

  return timestamp
}

function extractTimelineEntries(record: SessionFileRecord, messageCount: number): SessionMessage[] {
  const recordTimestamp =
    typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp))
      ? Date.parse(record.timestamp)
      : undefined
  const role = record.message?.role
  const timestamp = getMessageTimestamp(record)

  if (record.type === 'session') {
    return [
      buildEventEntry({
        id: record.id ?? `session-${messageCount}`,
        role: 'session',
        timestamp: recordTimestamp,
        text: stringifyRecordDetails({
          version: record.version,
          cwd: record.cwd,
        }),
        label: 'session',
        details: record.id,
      }),
    ]
  }

  if (record.type === 'model_change') {
    return [
      buildEventEntry({
        id: record.id ?? `model-change-${messageCount}`,
        role: 'model-change',
        timestamp: recordTimestamp,
        text: stringifyRecordDetails({
          provider: record.provider,
          modelId: record.modelId,
        }),
        label: 'model change',
        details: record.parentId,
      }),
    ]
  }

  if (record.type === 'thinking_level_change') {
    return [
      buildEventEntry({
        id: record.id ?? `thinking-level-${messageCount}`,
        role: 'thinking-level-change',
        timestamp: recordTimestamp,
        text: stringifyRecordDetails({
          thinkingLevel: record.thinkingLevel,
        }),
        label: 'thinking level',
        details: record.parentId,
      }),
    ]
  }

  if (record.type === 'custom') {
    return [
      buildEventEntry({
        id: record.id ?? `custom-${messageCount}`,
        role: 'custom',
        timestamp: recordTimestamp,
        text: stringifyUnknown(record.data ?? '(empty custom data)'),
        label: record.customType ?? 'custom',
        details: record.parentId,
      }),
    ]
  }

  if (record.type !== 'message') {
    return [
      buildEventEntry({
        id: record.id ?? `event-${messageCount}`,
        role: 'event',
        timestamp: recordTimestamp,
        text: stringifyUnknown(record),
        label: record.type ?? 'event',
        details: record.parentId,
      }),
    ]
  }

  if (role === 'toolResult') {
    const textParts = extractTextParts(record.message?.content)
    const contentText = textParts.join('\n\n').trim()

    return [
      buildEventEntry({
        id: record.id ?? `tool-result-${messageCount}`,
        role: 'tool-result',
        text: contentText || '(empty tool result)',
        timestamp,
        toolName: record.message?.toolName,
        toolCallId: record.message?.toolCallId,
        isError: record.message?.isError,
        label: record.message?.toolName ?? 'tool result',
        details: record.message?.toolCallId,
      }),
    ]
  }

  if (role !== 'user' && role !== 'assistant') {
    return [
      buildEventEntry({
        id: record.id ?? `message-${messageCount}`,
        role: 'event',
        text: stringifyUnknown(record.message ?? '(empty message)'),
        timestamp,
        label: role ?? 'message',
        details: record.id,
      }),
    ]
  }

  const speaker: 'user' | 'assistant' = role
  const entries: SessionMessage[] = []
  const content = Array.isArray(record.message?.content)
    ? record.message.content.filter(isSessionContentPart)
    : []
  let textParts: string[] = []
  let textIndex = 0
  let thinkingIndex = 0
  let toolCallIndex = 0
  let contentPartIndex = 0

  function flushTextParts() {
    const text = textParts.join('\n\n').trim()

    if (!text) {
      textParts = []
      return
    }

    textIndex += 1
    entries.push({
      id: `${record.id ?? speaker}-text-${textIndex}`,
      role: speaker,
      text,
      timestamp,
    })
    textParts = []
  }

  for (const part of content) {
    if (part.type === 'text' && typeof part.text === 'string') {
      const value = part.text.trim()

      if (value) {
        textParts.push(value)
      }

      continue
    }

    if (part.type === 'thinking') {
      flushTextParts()
      thinkingIndex += 1
      entries.push(
        buildEventEntry({
          id: `${record.id ?? speaker}-thinking-${thinkingIndex}`,
          role: 'thinking',
          text: part.thinking?.trim() || '(empty thinking block)',
          timestamp,
          label: 'thinking',
          details: part.thinkingSignature,
        }),
      )
      continue
    }

    if (part.type === 'toolCall' && typeof part.name === 'string') {
      flushTextParts()
      toolCallIndex += 1
      entries.push(buildToolCallEntry(part, record.id ?? speaker, toolCallIndex, timestamp))
      continue
    }

    flushTextParts()
    contentPartIndex += 1
    entries.push(
      buildEventEntry({
        id: `${record.id ?? speaker}-part-${contentPartIndex}`,
        role: 'content-part',
        text: stringifyUnknown(part),
        timestamp,
        label: part.type ?? 'content part',
      }),
    )
  }

  flushTextParts()

  return entries
}

function parseSessionContents(
  contents: string,
  options?: {
    includeMessages?: boolean
  },
): ParsedSessionFile {
  const lines = contents.split('\n').filter(Boolean)

  let startedAt: number | undefined
  let title: string | undefined
  let messageCount = 0
  const messages: SessionMessage[] | undefined = options?.includeMessages ? [] : undefined

  for (const line of lines) {
    let record: SessionFileRecord

    try {
      const parsedRecord = JSON.parse(line) as unknown

      if (!parsedRecord || typeof parsedRecord !== 'object' || Array.isArray(parsedRecord)) {
        continue
      }

      record = parsedRecord as SessionFileRecord
    } catch {
      continue
    }

    if (!startedAt && record.type === 'session' && record.timestamp) {
      const timestamp = Date.parse(record.timestamp)

      if (!Number.isNaN(timestamp)) {
        startedAt = timestamp
      }
    }

    if (record.type !== 'message') {
      messages?.push(...extractTimelineEntries(record, messageCount))
      continue
    }

    const role = record.message?.role

    if (role === 'toolResult') {
      messages?.push(...extractTimelineEntries(record, messageCount))
      continue
    }

    if (role !== 'user' && role !== 'assistant') {
      continue
    }

    const text = extractText(record.message?.content)

    if (text) {
      messageCount += 1

      if (!title && role === 'user') {
        title = buildTitleFromText(text)
      }
    }

    messages?.push(...extractTimelineEntries(record, messageCount))
  }

  return {
    startedAt,
    title,
    messageCount,
    messages,
  }
}

async function parseSessionFile(
  sessionFilePath: string,
  options?: {
    includeMessages?: boolean
  },
): Promise<ParsedSessionFile> {
  const contents = await readFile(sessionFilePath, 'utf8')

  return parseSessionContents(contents, options)
}

async function resolveSessionsContext(): Promise<
  | {
      ok: true
      data: SessionsContext
    }
  | {
      ok: false
      error: string
      root: string
    }
> {
  const root = config.openclaw.root.trim()

  if (!root) {
    return {
      ok: false,
      error: '未配置 OPENCLAW_ROOT。',
      root,
    }
  }

  if (!(await pathExists(root))) {
    return {
      ok: false,
      error: `OPENCLAW_ROOT 不存在：${root}`,
      root,
    }
  }

  const sessionsDirectory = getSessionsDirectory(root)

  if (!(await pathExists(sessionsDirectory))) {
    return {
      ok: false,
      error: `聊天记录目录不存在：${sessionsDirectory}`,
      root,
    }
  }

  return {
    ok: true,
    data: {
      root,
      sessionsDirectory,
    },
  }
}

export async function getSessionsOverview(): Promise<SessionsOverviewResult> {
  const context = await resolveSessionsContext()

  if (!context.ok) {
    return context
  }

  const { root, sessionsDirectory } = context.data

  const sessionsIndexPath = join(sessionsDirectory, 'sessions.json')

  if (!(await pathExists(sessionsIndexPath))) {
    return {
      ok: false,
      error: `找不到会话索引文件：${sessionsIndexPath}`,
      root,
    }
  }

  let sessionIndex: Record<string, SessionIndexRecord>
  const rawIndex = await readFile(sessionsIndexPath, 'utf8')

  try {
    const parsedIndex = JSON.parse(rawIndex) as unknown

    if (!parsedIndex || Array.isArray(parsedIndex) || typeof parsedIndex !== 'object') {
      return {
        ok: true,
        data: {
          root,
          sessionsDirectory,
          sessions: [],
        },
      }
    }

    sessionIndex = parsedIndex as Record<string, SessionIndexRecord>
  } catch {
    return {
      ok: true,
      data: {
        root,
        sessionsDirectory,
        sessions: [],
      },
    }
  }

  const sessions = await Promise.all(
    Object.entries(sessionIndex).map(async ([sessionKey, record]) => {
      if (typeof record?.sessionId !== 'string' || !record.sessionId.trim()) {
        return null
      }

      const sessionFilePath = join(sessionsDirectory, `${record.sessionId}.jsonl`)
      let parsed: ParsedSessionFile = { messageCount: 0 }

      if (await pathExists(sessionFilePath)) {
        const contents = await readFile(sessionFilePath, 'utf8').catch(() => null)

        if (contents !== null) {
          parsed = parseSessionContents(contents)
        }
      }

      return {
        sessionId: record.sessionId,
        sessionKey,
        updatedAt: record.updatedAt,
        startedAt: parsed.startedAt ?? record.startedAt,
        status: record.status,
        model: record.model,
        channel: record.deliveryContext?.channel ?? record.lastChannel,
        messageCount: parsed.messageCount,
        title: parsed.title ?? fallbackTitle(sessionKey, record.sessionId),
      } satisfies SessionSummary
    }),
  )

  const validSessions = sessions.filter((session): session is SessionSummary => session !== null)

  return {
    ok: true,
    data: {
      root,
      sessionsDirectory,
      sessions: validSessions.toSorted((left, right) => right.updatedAt - left.updatedAt),
    },
  }
}

export type SessionMessagesResult =
  | {
      ok: true
      data: {
        root: string
        sessionsDirectory: string
        sessionId: string
        messages: SessionMessage[]
      }
    }
  | {
      ok: false
      error: string
      root: string
    }

export async function getSessionMessages(sessionId: string): Promise<SessionMessagesResult> {
  const normalizedSessionId = sessionId.trim()
  const fallbackRoot = config.openclaw.root.trim()

  if (!normalizedSessionId) {
    return {
      ok: false,
      error: '缺少 sessionId。',
      root: fallbackRoot,
    }
  }

  const context = await resolveSessionsContext()

  if (!context.ok) {
    return context
  }

  const { root, sessionsDirectory } = context.data
  const sessionFilePath = join(sessionsDirectory, `${normalizedSessionId}.jsonl`)

  if (!(await pathExists(sessionFilePath))) {
    return {
      ok: false,
      error: `找不到会话文件：${sessionFilePath}`,
      root,
    }
  }

  const parsed = await parseSessionFile(sessionFilePath, {
    includeMessages: true,
  })

  return {
    ok: true,
    data: {
      root,
      sessionsDirectory,
      sessionId: normalizedSessionId,
      messages: parsed.messages ?? [],
    },
  }
}
