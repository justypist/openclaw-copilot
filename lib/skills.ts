import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

import { config } from '@/config'
import type { SessionMessage } from '@/lib/openclaw/sessions'

export interface SkillFileDraft {
  path: string
  content: string
}

export interface FinalizedSkillDraft {
  folderName: string
  files: SkillFileDraft[]
}

interface SkillsContext {
  root: string
  availableSkillsDirectory: string
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export function formatSessionMessage(message: SessionMessage, index: number): string {
  const lines = [`## Entry ${index + 1}`]

  lines.push(`- role: ${message.role}`)

  if (message.label) {
    lines.push(`- label: ${message.label}`)
  }

  if (message.timestamp) {
    lines.push(`- timestamp: ${new Date(message.timestamp).toISOString()}`)
  }

  if (message.toolName) {
    lines.push(`- toolName: ${message.toolName}`)
  }

  if (message.toolCallId) {
    lines.push(`- toolCallId: ${message.toolCallId}`)
  }

  if (message.details) {
    lines.push(`- details: ${message.details}`)
  }

  lines.push('```text')
  lines.push(message.text || '(empty)')
  lines.push('```')

  return lines.join('\n')
}

export function buildConversationContext(messages: SessionMessage[]): string {
  return messages.map(formatSessionMessage).join('\n\n')
}

export function slugifySkillName(name: string): string {
  const normalized = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\\/]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}\s_-]+/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'skill'
}

function normalizeRelativePath(path: string): string {
  return normalize(path).replace(/\\/g, '/')
}

function validateSkillFilePath(path: string): string {
  const normalizedPath = normalizeRelativePath(path).trim()

  if (!normalizedPath || normalizedPath === '.' || normalizedPath.startsWith('/')) {
    throw new Error('skill 文件路径不合法。')
  }

  const segments = normalizedPath.split('/')

  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('skill 文件路径不能包含 . 或 ..。')
  }

  return normalizedPath
}

export function validateFinalizedSkillDraft(input: FinalizedSkillDraft): FinalizedSkillDraft {
  const folderName = slugifySkillName(normalizeText(input.folderName))

  if (!Array.isArray(input.files) || input.files.length === 0) {
    throw new Error('至少需要一个 skill 文件。')
  }

  const files = input.files.map((file) => {
    const path = validateSkillFilePath(file.path)
    const content = typeof file.content === 'string' ? file.content.trim() : ''

    if (!content) {
      throw new Error(`skill 文件内容为空：${path}`)
    }

    return {
      path,
      content,
    }
  })

  const hasSkillMd = files.some((file) => file.path === 'SKILL.md')

  if (!hasSkillMd) {
    throw new Error('最终结果必须包含 SKILL.md。')
  }

  return {
    folderName,
    files,
  }
}

export async function resolveSkillsContext(): Promise<
  | {
      ok: true
      data: SkillsContext
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

  return {
    ok: true,
    data: {
      root,
      availableSkillsDirectory: join(root, 'available-skills'),
    },
  }
}

export async function writeFinalizedSkillDraft(input: FinalizedSkillDraft): Promise<{
  root: string
  availableSkillsDirectory: string
  skillDirectory: string
  savedFiles: string[]
}> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    throw new Error(context.error)
  }

  const draft = validateFinalizedSkillDraft(input)
  const { root, availableSkillsDirectory } = context.data
  const skillDirectory = join(availableSkillsDirectory, draft.folderName)

  await mkdir(availableSkillsDirectory, { recursive: true })

  await Promise.all(
    draft.files.map(async (file) => {
      const targetPath = join(skillDirectory, file.path)

      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath, `${file.content.trim()}\n`, 'utf8')
    }),
  )

  return {
    root,
    availableSkillsDirectory,
    skillDirectory,
    savedFiles: draft.files.map((file) => file.path),
  }
}
