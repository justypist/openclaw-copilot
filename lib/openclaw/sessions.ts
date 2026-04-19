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
  type?: string
  timestamp?: string
  message?: {
    role?: string
    content?: SessionContentPart[]
  }
}

interface SessionContentPart {
  type?: string
  text?: string
}

interface ParsedSessionFile {
  startedAt?: number
  title?: string
  messageCount: number
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
  if (!content) {
    return ''
  }

  return content
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

async function parseSessionFile(sessionFilePath: string): Promise<ParsedSessionFile> {
  const contents = await readFile(sessionFilePath, 'utf8')
  const lines = contents.split('\n').filter(Boolean)

  let startedAt: number | undefined
  let title: string | undefined
  let messageCount = 0

  for (const line of lines) {
    let record: SessionFileRecord

    try {
      record = JSON.parse(line) as SessionFileRecord
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
      continue
    }

    const role = record.message?.role

    if (role !== 'user' && role !== 'assistant') {
      continue
    }

    const text = extractText(record.message?.content)

    if (!text) {
      continue
    }

    messageCount += 1

    if (!title && role === 'user') {
      title = buildTitleFromText(text)
    }
  }

  return {
    startedAt,
    title,
    messageCount,
  }
}

export async function getSessionsOverview(): Promise<SessionsOverviewResult> {
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

  const sessionsIndexPath = join(sessionsDirectory, 'sessions.json')

  if (!(await pathExists(sessionsIndexPath))) {
    return {
      ok: false,
      error: `找不到会话索引文件：${sessionsIndexPath}`,
      root,
    }
  }

  const rawIndex = await readFile(sessionsIndexPath, 'utf8')
  const sessionIndex = JSON.parse(rawIndex) as Record<string, SessionIndexRecord>

  const sessions = await Promise.all(
    Object.entries(sessionIndex).map(async ([sessionKey, record]) => {
      const sessionFilePath = join(sessionsDirectory, `${record.sessionId}.jsonl`)
      const parsed = (await pathExists(sessionFilePath))
        ? await parseSessionFile(sessionFilePath)
        : { messageCount: 0 }

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

  return {
    ok: true,
    data: {
      root,
      sessionsDirectory,
      sessions: sessions.toSorted((left, right) => right.updatedAt - left.updatedAt),
    },
  }
}
