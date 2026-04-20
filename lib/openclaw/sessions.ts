import { access, readFile, readdir } from 'node:fs/promises'
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
  sourceRecordId?: string
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

interface SessionIndexMetadata {
  sessionId: string
  sessionKey: string
  updatedAt: number
  startedAt?: number
  status?: string
  model?: string
  channel?: string
}

interface SessionSegment {
  sessionId: string
  startedAt?: number
  updatedAt?: number
  title: string
  messageCount: number
  messages: SessionMessage[]
}

interface SessionFileDescriptor {
  fileName: string
  logicalSessionId: string
  sourceSessionId: string
}

interface SessionsContext {
  root: string
  sessionsDirectory: string
}

function isSessionContentPart(value: unknown): value is SessionContentPart {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const MAX_TITLE_LENGTH = 80
const JSONL_EXTENSION = '.jsonl'
const RESET_FILE_MARKER = '.jsonl.reset.'
const SESSION_RESET_MARKER = 'A new session was started via /new or /reset.'
const SESSION_SEGMENT_ID_SEPARATOR = '::segment:'

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

function isSessionResetMessage(text: string): boolean {
  return text.includes(SESSION_RESET_MARKER)
}

function isResetTimelineEntry(message: SessionMessage): boolean {
  return message.role === 'user' && isSessionResetMessage(message.text)
}

function fallbackTitle(sessionKey: string, sessionId: string): string {
  if (sessionKey) {
    return sessionKey
  }

  return `session:${sessionId}`
}

function buildSegmentSessionId(baseSessionId: string, segmentIndex: number, segmentCount: number): string {
  if (segmentCount <= 1) {
    return baseSessionId
  }

  return `${baseSessionId}${SESSION_SEGMENT_ID_SEPARATOR}${segmentIndex + 1}`
}

function parseSegmentSessionId(sessionId: string): {
  baseSessionId: string
  segmentOrdinal?: number
} {
  const separatorIndex = sessionId.lastIndexOf(SESSION_SEGMENT_ID_SEPARATOR)

  if (separatorIndex === -1) {
    return {
      baseSessionId: sessionId,
    }
  }

  const baseSessionId = sessionId.slice(0, separatorIndex)
  const rawSegmentOrdinal = sessionId.slice(separatorIndex + SESSION_SEGMENT_ID_SEPARATOR.length)
  const segmentOrdinal = Number.parseInt(rawSegmentOrdinal, 10)

  if (!baseSessionId || Number.isNaN(segmentOrdinal) || segmentOrdinal < 1) {
    return {
      baseSessionId: sessionId,
    }
  }

  return {
    baseSessionId,
    segmentOrdinal,
  }
}

function buildSegmentFallbackTitle(
  sessionKey: string,
  sessionId: string,
  segmentIndex: number,
  segmentCount: number,
): string {
  const baseTitle = fallbackTitle(sessionKey, sessionId)

  if (segmentCount <= 1) {
    return baseTitle
  }

  return `${baseTitle} #${segmentIndex + 1}`
}

function parseSessionFileDescriptor(fileName: string): SessionFileDescriptor | null {
  if (fileName.endsWith(JSONL_EXTENSION)) {
    const sourceSessionId = fileName.slice(0, -JSONL_EXTENSION.length)

    if (!sourceSessionId) {
      return null
    }

    return {
      fileName,
      logicalSessionId: sourceSessionId,
      sourceSessionId,
    }
  }

  const resetMarkerIndex = fileName.indexOf(RESET_FILE_MARKER)

  if (resetMarkerIndex === -1) {
    return null
  }

  const sourceSessionId = fileName.slice(0, resetMarkerIndex)

  if (!sourceSessionId) {
    return null
  }

  return {
    fileName,
    logicalSessionId: fileName,
    sourceSessionId,
  }
}

function resolveSessionFileName(sessionId: string): string {
  if (sessionId.endsWith(JSONL_EXTENSION) || sessionId.includes(RESET_FILE_MARKER)) {
    return sessionId
  }

  return `${sessionId}${JSONL_EXTENSION}`
}

function extractConversationChatId(text: string): string | undefined {
  const match = text.match(/"chat_id"\s*:\s*"([^"]+)"/)

  return match?.[1]
}

function inferSessionIdentity(messages: SessionMessage[] | undefined): {
  sessionKey?: string
  channel?: string
} {
  for (const message of messages ?? []) {
    if (message.role !== 'user') {
      continue
    }

    const chatId = extractConversationChatId(message.text)

    if (chatId) {
      if (chatId.startsWith('telegram:')) {
        return {
          channel: 'telegram',
          sessionKey: `agent:main:telegram:direct:${chatId.slice('telegram:'.length)}`,
        }
      }

      if (chatId.toLowerCase().endsWith('@im.wechat')) {
        return {
          channel: 'openclaw-weixin',
          sessionKey: `agent:main:openclaw-weixin:direct:${chatId.toLowerCase()}`,
        }
      }

      return {
        sessionKey: chatId,
      }
    }

    if (message.text.includes('openclaw-control-ui')) {
      return {
        channel: 'webchat',
        sessionKey: 'agent:main:main',
      }
    }
  }

  return {}
}

function buildSessionSegments(
  baseSessionId: string,
  sessionKey: string,
  messages: SessionMessage[] | undefined,
): SessionSegment[] {
  const timeline = messages ?? []

  if (timeline.length === 0) {
    return [
      {
        sessionId: baseSessionId,
        startedAt: undefined,
        updatedAt: undefined,
        title: fallbackTitle(sessionKey, baseSessionId),
        messageCount: 0,
        messages: [],
      },
    ]
  }

  const rawSegments: SessionMessage[][] = []
  let currentSegment: SessionMessage[] = []
  let hasSeenConversation = false

  for (const message of timeline) {
    const isResetMessage = isResetTimelineEntry(message)

    if (isResetMessage && hasSeenConversation && currentSegment.length > 0) {
      rawSegments.push(currentSegment)
      currentSegment = []
      hasSeenConversation = false
    }

    currentSegment.push(message)

    if (message.role === 'assistant') {
      hasSeenConversation = true
      continue
    }

    if (message.role === 'user' && message.text.trim() && !isResetMessage) {
      hasSeenConversation = true
    }
  }

  if (currentSegment.length > 0) {
    rawSegments.push(currentSegment)
  }

  return rawSegments.map((segmentMessages, segmentIndex, segments): SessionSegment => {
    const visibleMessages = segmentMessages.filter((message) => !isResetTimelineEntry(message))
    let startedAt: number | undefined
    let updatedAt: number | undefined
    let title: string | undefined
    let messageCount = 0
    const countedRecordIds = new Set<string>()

    for (const message of segmentMessages) {
      if (startedAt === undefined && message.timestamp !== undefined) {
        startedAt = message.timestamp
      }

      if (message.timestamp !== undefined) {
        updatedAt = message.timestamp
      }

      if ((message.role !== 'user' && message.role !== 'assistant') || !message.text.trim()) {
        continue
      }

      if (isResetTimelineEntry(message)) {
        continue
      }

      if (!title && message.role === 'user') {
        title = buildTitleFromText(message.text)
      }

      const recordId = message.sourceRecordId ?? message.id

      if (countedRecordIds.has(recordId)) {
        continue
      }

      countedRecordIds.add(recordId)
      messageCount += 1
    }

    return {
      sessionId: buildSegmentSessionId(baseSessionId, segmentIndex, segments.length),
      startedAt,
      updatedAt,
      title:
        title ??
        buildSegmentFallbackTitle(sessionKey, baseSessionId, segmentIndex, segments.length),
      messageCount,
      messages: visibleMessages,
    }
  })
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
  const sourceRecordId = record.id ?? `${speaker}-${timestamp ?? 'unknown'}-${messageCount}`
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
      sourceRecordId,
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

  let sessionIndex: Record<string, SessionIndexRecord> = {}
  const rawIndex = await readFile(sessionsIndexPath, 'utf8').catch(() => null)

  if (rawIndex !== null) {
    try {
      const parsedIndex = JSON.parse(rawIndex) as unknown

      if (parsedIndex && !Array.isArray(parsedIndex) && typeof parsedIndex === 'object') {
        sessionIndex = parsedIndex as Record<string, SessionIndexRecord>
      }
    } catch {
      sessionIndex = {}
    }
  }

  const sessionMetadataById = new Map<string, SessionIndexMetadata>()

  for (const [sessionKey, record] of Object.entries(sessionIndex)) {
    if (typeof record?.sessionId !== 'string' || !record.sessionId.trim()) {
      continue
    }

    const metadata: SessionIndexMetadata = {
      sessionId: record.sessionId,
      sessionKey,
      updatedAt: record.updatedAt,
      startedAt: record.startedAt,
      status: record.status,
      model: record.model,
      channel: record.deliveryContext?.channel ?? record.lastChannel,
    }
    const existingMetadata = sessionMetadataById.get(record.sessionId)

    if (!existingMetadata || metadata.updatedAt >= existingMetadata.updatedAt) {
      sessionMetadataById.set(record.sessionId, metadata)
    }
  }

  const sessionFiles = await readdir(sessionsDirectory, {
    withFileTypes: true,
  }).catch(() => [])

  const sessions = await Promise.all(
    sessionFiles
      .filter((entry) => entry.isFile())
      .map(async (entry): Promise<SessionSummary[]> => {
        try {
          const descriptor = parseSessionFileDescriptor(entry.name)

          if (!descriptor) {
            return []
          }

          const metadata = sessionMetadataById.get(descriptor.sourceSessionId)
          const parsed = await parseSessionFile(join(sessionsDirectory, descriptor.fileName), {
            includeMessages: true,
          })
          const inferredIdentity = inferSessionIdentity(parsed.messages)
          const sessionKey =
            metadata?.sessionKey ??
            inferredIdentity.sessionKey ??
            `session:${descriptor.sourceSessionId}`

          return buildSessionSegments(descriptor.logicalSessionId, sessionKey, parsed.messages).map(
            (segment) => ({
            sessionId: segment.sessionId,
            sessionKey,
            updatedAt: segment.updatedAt ?? metadata?.updatedAt ?? segment.startedAt ?? 0,
            startedAt: segment.startedAt ?? parsed.startedAt ?? metadata?.startedAt,
            status: metadata?.status,
            model: metadata?.model,
            channel: metadata?.channel ?? inferredIdentity.channel,
            messageCount: segment.messageCount,
            title: segment.title,
            }),
          )
        } catch {
          return []
        }
      }),
  )

  const validSessions = sessions.flat()

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

  const { baseSessionId, segmentOrdinal } = parseSegmentSessionId(normalizedSessionId)
  const context = await resolveSessionsContext()

  if (!context.ok) {
    return context
  }

  const { root, sessionsDirectory } = context.data
  const sessionFilePath = join(sessionsDirectory, resolveSessionFileName(baseSessionId))

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
  const segments = buildSessionSegments(baseSessionId, '', parsed.messages)
  const selectedSegment =
    segmentOrdinal === undefined
      ? segments.find((segment) => segment.sessionId === normalizedSessionId)
      : segments[segmentOrdinal - 1]
  const segmentedMessages = selectedSegment?.messages

  if (!segmentedMessages) {
    return {
      ok: false,
      error: `找不到逻辑会话片段：${normalizedSessionId}`,
      root,
    }
  }

  return {
    ok: true,
    data: {
      root,
      sessionsDirectory,
      sessionId: normalizedSessionId,
      messages: segmentedMessages,
    },
  }
}
