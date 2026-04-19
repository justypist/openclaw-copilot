import { access, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
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

export type SkillLocation = 'available' | 'enabled'

export interface SkillSummary {
  folderName: string
  location: SkillLocation
  name: string
  description: string
  filePaths: string[]
  updatedAt?: number
}

export interface SkillReference {
  folderName: string
  location: SkillLocation
}

export interface SkillSource extends SkillSummary {
  files: SkillFileDraft[]
}

export interface SkillsLibrary {
  root: string
  availableSkillsDirectory: string
  enabledSkillsDirectory: string
  availableSkills: SkillSummary[]
  enabledSkills: SkillSummary[]
}

interface SkillsContext {
  root: string
  availableSkillsDirectory: string
  enabledSkillsDirectory: string
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

function formatSkillSource(source: SkillSource, index: number): string {
  const lines = [`## Skill ${index + 1}`]

  lines.push(`- name: ${source.name}`)
  lines.push(`- folderName: ${source.folderName}`)
  lines.push(`- location: ${source.location}`)
  lines.push(`- description: ${source.description}`)
  lines.push(`- fileCount: ${source.files.length}`)

  for (const file of source.files) {
    lines.push('')
    lines.push(`### File: ${file.path}`)
    lines.push('```md')
    lines.push(file.content)
    lines.push('```')
  }

  return lines.join('\n')
}

export function buildSkillSourcesContext(sources: SkillSource[]): string {
  return sources.map(formatSkillSource).join('\n\n')
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

function validateSkillDirectoryName(value: string): string {
  const normalizedValue = normalizeRelativePath(value).trim()

  if (!normalizedValue || normalizedValue === '.' || normalizedValue.startsWith('/')) {
    throw new Error('skill 目录名不合法。')
  }

  const segments = normalizedValue.split('/')

  if (segments.length !== 1 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('skill 目录名不合法。')
  }

  return normalizedValue
}

function parseFrontmatterValue(frontmatter: string, key: string): string {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))

  if (!match) {
    return ''
  }

  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

function parseSkillMetadata(content: string, fallbackFolderName: string): {
  name: string
  description: string
} {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?/)
  const frontmatter = frontmatterMatch?.[1] ?? ''
  const headingMatch = content.match(/^#\s+(.+)$/m)
  const descriptionFromBody = content
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)

  return {
    name: parseFrontmatterValue(frontmatter, 'name') || headingMatch?.[1]?.trim() || fallbackFolderName,
    description: parseFrontmatterValue(frontmatter, 'description') || descriptionFromBody || '暂无描述',
  }
}

async function collectSkillFiles(directory: string, parentPath = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = parentPath ? `${parentPath}/${entry.name}` : entry.name
      const absolutePath = join(directory, entry.name)

      if (entry.isDirectory()) {
        return collectSkillFiles(absolutePath, relativePath)
      }

      return relativePath
    }),
  )

  return files.flat().sort((left, right) => left.localeCompare(right))
}

async function listSkillsFromDirectory(
  directory: string,
  location: SkillLocation,
): Promise<SkillSummary[]> {
  if (!(await pathExists(directory))) {
    return []
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const summaries: Array<SkillSummary | null> = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const folderName = validateSkillDirectoryName(entry.name)
        const skillDirectory = join(directory, folderName)
        const skillFilePath = join(skillDirectory, 'SKILL.md')

        if (!(await pathExists(skillFilePath))) {
          return null
        }

        const [content, filePaths, skillStat] = await Promise.all([
          readFile(skillFilePath, 'utf8'),
          collectSkillFiles(skillDirectory),
          stat(skillDirectory),
        ])
        const metadata = parseSkillMetadata(content, folderName)

        return {
          folderName,
          location,
          name: metadata.name,
          description: metadata.description,
          filePaths,
          updatedAt: skillStat.mtimeMs,
        } satisfies SkillSummary
      }),
  )

  return summaries
    .filter((summary): summary is SkillSummary => summary !== null)
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
}

async function readSkillSource(
  directory: string,
  location: SkillLocation,
  folderName: string,
): Promise<SkillSource> {
  const normalizedFolderName = validateSkillDirectoryName(folderName)
  const skillDirectory = join(directory, normalizedFolderName)
  const skillFilePath = join(skillDirectory, 'SKILL.md')

  if (!(await pathExists(skillDirectory)) || !(await pathExists(skillFilePath))) {
    throw new Error(`skill 不存在：${normalizedFolderName}`)
  }

  const filePaths = await collectSkillFiles(skillDirectory)
  const files = await Promise.all(
    filePaths.map(async (filePath) => ({
      path: filePath,
      content: await readFile(join(skillDirectory, filePath), 'utf8'),
    })),
  )
  const metadata = parseSkillMetadata(
    files.find((file) => file.path === 'SKILL.md')?.content ?? '',
    normalizedFolderName,
  )
  const skillStat = await stat(skillDirectory)

  return {
    folderName: normalizedFolderName,
    location,
    name: metadata.name,
    description: metadata.description,
    filePaths,
    updatedAt: skillStat.mtimeMs,
    files,
  }
}

function resolveSkillDirectory(context: SkillsContext, location: SkillLocation): string {
  return location === 'enabled' ? context.enabledSkillsDirectory : context.availableSkillsDirectory
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
      enabledSkillsDirectory: join(root, 'enabled-skills'),
    },
  }
}

export async function getSkillsLibrary(): Promise<
  | {
      ok: true
      data: SkillsLibrary
    }
  | {
      ok: false
      error: string
      root: string
    }
> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    return context
  }

  const { root, availableSkillsDirectory, enabledSkillsDirectory } = context.data
  const [availableSkills, enabledSkills] = await Promise.all([
    listSkillsFromDirectory(availableSkillsDirectory, 'available'),
    listSkillsFromDirectory(enabledSkillsDirectory, 'enabled'),
  ])

  return {
    ok: true,
    data: {
      root,
      availableSkillsDirectory,
      enabledSkillsDirectory,
      availableSkills,
      enabledSkills,
    },
  }
}

export async function moveSkills(input: {
  from: SkillLocation
  skillFolderNames: string[]
}): Promise<{
  movedSkillFolderNames: string[]
  sourceDirectory: string
  targetDirectory: string
  targetLocation: SkillLocation
}> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    throw new Error(context.error)
  }

  const targetLocation: SkillLocation = input.from === 'available' ? 'enabled' : 'available'
  const sourceDirectory = resolveSkillDirectory(context.data, input.from)
  const targetDirectory = resolveSkillDirectory(context.data, targetLocation)
  const skillFolderNames = Array.from(
    new Set(input.skillFolderNames.map(validateSkillDirectoryName)),
  )

  if (skillFolderNames.length === 0) {
    throw new Error('至少需要选择一个 skill。')
  }

  await mkdir(sourceDirectory, { recursive: true })
  await mkdir(targetDirectory, { recursive: true })

  for (const folderName of skillFolderNames) {
    const sourceSkillDirectory = join(sourceDirectory, folderName)
    const targetSkillDirectory = join(targetDirectory, folderName)

    if (!(await pathExists(sourceSkillDirectory))) {
      throw new Error(`skill 不存在：${folderName}`)
    }

    if (await pathExists(targetSkillDirectory)) {
      throw new Error(`目标目录已存在同名 skill：${folderName}`)
    }
  }

  await Promise.all(
    skillFolderNames.map((folderName) =>
      rename(join(sourceDirectory, folderName), join(targetDirectory, folderName)),
    ),
  )

  return {
    movedSkillFolderNames: skillFolderNames,
    sourceDirectory,
    targetDirectory,
    targetLocation,
  }
}

export async function getSkillSources(input: { skills: SkillReference[] }): Promise<SkillSource[]> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    throw new Error(context.error)
  }

  const references = Array.from(
    new Map(
      input.skills.map((skill) => {
        const location = skill.location

        if (location !== 'available' && location !== 'enabled') {
          throw new Error('存在不合法的 skill 来源目录。')
        }

        const folderName = validateSkillDirectoryName(skill.folderName)

        return [`${location}:${folderName}`, { location, folderName } satisfies SkillReference]
      }),
    ).values(),
  )

  if (references.length === 0) {
    throw new Error('至少需要选择一个 skill。')
  }

  return Promise.all(
    references.map((reference) =>
      readSkillSource(
        resolveSkillDirectory(context.data, reference.location),
        reference.location,
        reference.folderName,
      ),
    ),
  )
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
