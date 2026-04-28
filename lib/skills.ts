import { execFile as execFileCallback } from 'node:child_process'
import { access, mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'
import { promisify } from 'node:util'

import { config } from '@/config'
import type { SessionMessage } from '@/lib/openclaw/sessions'

const SESSION_MESSAGE_ROLES = new Set<SessionMessage['role']>([
  'user',
  'assistant',
  'thinking',
  'tool-call',
  'tool-result',
  'session',
  'model-change',
  'thinking-level-change',
  'custom',
  'content-part',
  'event',
])

const MAX_AI_SELECTED_MESSAGES = 200
const MAX_AI_SKILL_CONTENT_LENGTH = 100_000
const MAX_AI_CONVERSATION_CONTEXT_LENGTH = 120_000
const MAX_AI_SKILL_SOURCES_CONTEXT_LENGTH = 160_000
const MAX_EDITABLE_SKILL_FILE_BYTES = 256 * 1024

export class SkillsInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillsInputError'
  }
}

export interface SkillFileDraft {
  path: string
  content: string
}

export type SkillFileReadOnlyReason = 'binary' | 'too-large' | 'unsupported-encoding' | 'protected'

export interface SkillFileRecord extends SkillFileDraft {
  size: number
  editable: boolean
  readOnlyReason?: SkillFileReadOnlyReason
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
  skillContent: string
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

export interface SkillFileSet extends SkillSummary {
  files: SkillFileRecord[]
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

const execFile = promisify(execFileCallback)

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function assertMaxLength(value: string, maxLength: number, errorMessage: string): void {
  if (value.length > maxLength) {
    throw new SkillsInputError(errorMessage)
  }
}

function isValidSessionTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value).getTime())
}

export function isSessionMessage(value: unknown): value is SessionMessage {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>

  return (
    typeof candidate.id === 'string' &&
    SESSION_MESSAGE_ROLES.has(candidate.role as SessionMessage['role']) &&
    typeof candidate.text === 'string' &&
    (candidate.timestamp === undefined || isValidSessionTimestamp(candidate.timestamp)) &&
    (candidate.toolName === undefined || typeof candidate.toolName === 'string') &&
    (candidate.toolCallId === undefined || typeof candidate.toolCallId === 'string') &&
    (candidate.isError === undefined || typeof candidate.isError === 'boolean') &&
    (candidate.label === undefined || typeof candidate.label === 'string') &&
    (candidate.details === undefined || typeof candidate.details === 'string')
  )
}

export function isSessionMessageArray(value: unknown): value is SessionMessage[] {
  return Array.isArray(value) && value.every(isSessionMessage)
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

  if (isValidSessionTimestamp(message.timestamp)) {
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

export function buildConversationContextForAi(messages: SessionMessage[]): string {
  if (messages.length > MAX_AI_SELECTED_MESSAGES) {
    throw new SkillsInputError(`选中的聊天记录过多，最多允许 ${MAX_AI_SELECTED_MESSAGES} 条。`)
  }

  const conversationContext = buildConversationContext(messages)

  assertMaxLength(
    conversationContext,
    MAX_AI_CONVERSATION_CONTEXT_LENGTH,
    `选中的聊天记录内容过长，最多允许 ${MAX_AI_CONVERSATION_CONTEXT_LENGTH} 个字符。请减少选择范围后重试。`,
  )

  return conversationContext
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

export function buildSkillSourcesContextForAi(sources: SkillSource[]): string {
  const sourcesContext = buildSkillSourcesContext(sources)

  assertMaxLength(
    sourcesContext,
    MAX_AI_SKILL_SOURCES_CONTEXT_LENGTH,
    `源 skill 内容过长，最多允许 ${MAX_AI_SKILL_SOURCES_CONTEXT_LENGTH} 个字符。请减少选择的 skills 后重试。`,
  )

  return sourcesContext
}

export function validateSkillContentForAi(value: string): string {
  assertMaxLength(
    value,
    MAX_AI_SKILL_CONTENT_LENGTH,
    `完整 skill 内容过长，最多允许 ${MAX_AI_SKILL_CONTENT_LENGTH} 个字符。请精简内容后重试。`,
  )

  return value
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

  return files.flat().sort((left, right) => {
    if (left === 'SKILL.md') {
      return -1
    }

    if (right === 'SKILL.md') {
      return 1
    }

    return left.localeCompare(right)
  })
}

function readTextFromSkillFile(buffer: Buffer):
  | {
      ok: true
      content: string
    }
  | {
      ok: false
      reason: SkillFileReadOnlyReason
    } {
  if (buffer.includes(0)) {
    return { ok: false, reason: 'binary' }
  }

  try {
    return {
      ok: true,
      content: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
    }
  } catch {
    return { ok: false, reason: 'unsupported-encoding' }
  }
}

async function readSkillFileRecords(directory: string, filePaths: string[]): Promise<SkillFileRecord[]> {
  return Promise.all(
    filePaths.map(async (filePath) => {
      const buffer = await readFile(join(directory, filePath))
      const decoded = readTextFromSkillFile(buffer)

      if (!decoded.ok) {
        return {
          path: filePath,
          content: '',
          size: buffer.byteLength,
          editable: false,
          readOnlyReason: decoded.reason,
        } satisfies SkillFileRecord
      }

      const tooLarge = buffer.byteLength > MAX_EDITABLE_SKILL_FILE_BYTES

      return {
        path: filePath,
        content: decoded.content,
        size: buffer.byteLength,
        editable: !tooLarge,
        readOnlyReason: tooLarge ? 'too-large' : undefined,
      } satisfies SkillFileRecord
    }),
  )
}

async function readSkillFileSet(
  directory: string,
  location: SkillLocation,
  folderName: string,
): Promise<SkillFileSet> {
  const normalizedFolderName = validateSkillDirectoryName(folderName)
  const skillDirectory = join(directory, normalizedFolderName)
  const skillFilePath = join(skillDirectory, 'SKILL.md')

  if (!(await pathExists(skillDirectory)) || !(await pathExists(skillFilePath))) {
    throw new Error(`skill 不存在：${normalizedFolderName}`)
  }

  const filePaths = await collectSkillFiles(skillDirectory)
  const files = await readSkillFileRecords(skillDirectory, filePaths)
  const skillContent = files.find((file) => file.path === 'SKILL.md')?.content ?? ''
  const metadata = parseSkillMetadata(skillContent, normalizedFolderName)
  const skillStat = await stat(skillDirectory)

  return {
    folderName: normalizedFolderName,
    location,
    name: metadata.name,
    description: metadata.description,
    skillContent,
    filePaths,
    updatedAt: skillStat.mtimeMs,
    files,
  }
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
          skillContent: content,
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
    skillContent: files.find((file) => file.path === 'SKILL.md')?.content ?? '',
    filePaths,
    updatedAt: skillStat.mtimeMs,
    files,
  }
}

export async function getSkillFileSet(input: {
  location: SkillLocation
  folderName: string
}): Promise<SkillFileSet> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    throw new Error(context.error)
  }

  return readSkillFileSet(
    resolveSkillDirectory(context.data, input.location),
    input.location,
    input.folderName,
  )
}

function toSkillSummary(source: SkillSource): SkillSummary {
  return {
    folderName: source.folderName,
    location: source.location,
    name: source.name,
    description: source.description,
    skillContent: source.skillContent,
    filePaths: source.filePaths,
    updatedAt: source.updatedAt,
  }
}

function resolveSkillDirectory(context: SkillsContext, location: SkillLocation): string {
  return location === 'enabled' ? context.enabledSkillsDirectory : context.availableSkillsDirectory
}

export function validateFinalizedSkillDraft(input: FinalizedSkillDraft): FinalizedSkillDraft {
  const folderName = slugifySkillName(normalizeText(input.folderName))

  return {
    folderName,
    files: validateSkillFileDrafts(input.files),
  }
}

export function validateSkillFileDrafts(input: SkillFileDraft[]): SkillFileDraft[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('至少需要一个 skill 文件。')
  }

  const seenPaths = new Set<string>()
  const files = input.map((file) => {
    const path = validateSkillFilePath(file.path)
    const content = typeof file.content === 'string' ? file.content.trim() : ''

    if (seenPaths.has(path)) {
      throw new Error(`skill 文件路径重复：${path}`)
    }

    seenPaths.add(path)

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

  return files
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
      availableSkillsDirectory: join(root, 'workspace', 'skills.available'),
      enabledSkillsDirectory: join(root, 'workspace', 'skills'),
    },
  }
}

function getSkillArchiveBasePath(location: SkillLocation): string {
  return location === 'enabled' ? 'workspace/skills' : 'workspace/skills.available'
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

  const movedSkillFolderNames: string[] = []

  try {
    for (const folderName of skillFolderNames) {
      await rename(join(sourceDirectory, folderName), join(targetDirectory, folderName))
      movedSkillFolderNames.push(folderName)
    }
  } catch (error) {
    const rollbackFailedFolderNames: string[] = []

    for (const folderName of [...movedSkillFolderNames].reverse()) {
      try {
        await rename(join(targetDirectory, folderName), join(sourceDirectory, folderName))
      } catch {
        rollbackFailedFolderNames.push(folderName)
      }
    }

    const message = error instanceof Error ? error.message : '转移失败。'

    if (rollbackFailedFolderNames.length > 0) {
      throw new Error(
        `转移失败，且以下 skill 回滚失败：${rollbackFailedFolderNames.join('、')}。原始错误：${message}`,
      )
    }

    throw new Error(message)
  }

  return {
    movedSkillFolderNames: skillFolderNames,
    sourceDirectory,
    targetDirectory,
    targetLocation,
  }
}

export async function deleteSkill(input: {
  location: SkillLocation
  folderName: string
}): Promise<{
  deletedSkillFolderName: string
  location: SkillLocation
}> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    throw new Error(context.error)
  }

  const folderName = validateSkillDirectoryName(input.folderName)
  const skillDirectory = join(resolveSkillDirectory(context.data, input.location), folderName)
  const skillFilePath = join(skillDirectory, 'SKILL.md')

  if (!(await pathExists(skillDirectory)) || !(await pathExists(skillFilePath))) {
    throw new Error(`skill 不存在：${folderName}`)
  }

  await rm(skillDirectory, { recursive: true })

  return {
    deletedSkillFolderName: folderName,
    location: input.location,
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

export async function buildSkillDownloadArchive(input: { skills: SkillReference[] }): Promise<{
  fileName: string
  archive: Buffer
}> {
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

  const archivePaths = await Promise.all(
    references.map(async (reference) => {
      const archivePath = normalizeRelativePath(
        join(getSkillArchiveBasePath(reference.location), reference.folderName),
      )

      if (!(await pathExists(join(context.data.root, archivePath)))) {
        throw new Error(`skill 不存在：${reference.folderName}`)
      }

      return archivePath
    }),
  )

  const singleReference = references[0]
  const fileName =
    references.length === 1
      ? `${singleReference.folderName}.tar.gz`
      : `skills-${references.length}.tar.gz`

  try {
    const result = await execFile('tar', ['-czf', '-', '-C', context.data.root, ...archivePaths], {
      encoding: 'buffer',
      maxBuffer: 10 * 1024 * 1024,
    })

    return {
      fileName,
      archive: result.stdout,
    }
  } catch {
    throw new Error('打包 skill 下载文件失败。')
  }
}

export async function updateSkillContent(input: {
  location: SkillLocation
  folderName: string
  content: string
}): Promise<SkillSummary> {
  const context = await resolveSkillsContext()

  if (!context.ok) {
    throw new Error(context.error)
  }

  const folderName = validateSkillDirectoryName(input.folderName)
  const content = typeof input.content === 'string' ? input.content.trim() : ''

  if (!content) {
    throw new Error('skill 内容不能为空。')
  }

  const skillsDirectory = resolveSkillDirectory(context.data, input.location)
  const skillDirectory = join(skillsDirectory, folderName)
  const skillFilePath = join(skillDirectory, 'SKILL.md')

  if (!(await pathExists(skillDirectory)) || !(await pathExists(skillFilePath))) {
    throw new Error(`skill 不存在：${folderName}`)
  }

  const nextFolderName = validateSkillDirectoryName(slugifySkillName(parseSkillMetadata(content, folderName).name))
  const nextSkillDirectory = join(skillsDirectory, nextFolderName)

  if (nextFolderName !== folderName && (await pathExists(nextSkillDirectory))) {
    throw new Error(`目标目录已存在同名 skill：${nextFolderName}`)
  }

  const previousContent = await readFile(skillFilePath, 'utf8')

  try {
    await writeFile(skillFilePath, `${content}\n`, 'utf8')

    if (nextFolderName !== folderName) {
      await rename(skillDirectory, nextSkillDirectory)
    }
  } catch (error) {
    if (await pathExists(skillFilePath)) {
      await writeFile(skillFilePath, previousContent, 'utf8')
    }

    throw error
  }

  const now = new Date()
  const updatedSkillDirectory = join(skillsDirectory, nextFolderName)

  await utimes(updatedSkillDirectory, now, now)

  const updatedSkill = await readSkillSource(
    skillsDirectory,
    input.location,
    nextFolderName,
  )

  return toSkillSummary(updatedSkill)
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
  const transientDirectorySuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const stagingSkillDirectory = join(
    availableSkillsDirectory,
    `.${draft.folderName}.staging-${transientDirectorySuffix}`,
  )
  const backupSkillDirectory = join(
    availableSkillsDirectory,
    `.${draft.folderName}.backup-${transientDirectorySuffix}`,
  )

  await mkdir(availableSkillsDirectory, { recursive: true })
  await mkdir(stagingSkillDirectory, { recursive: true })

  await Promise.all(
    draft.files.map(async (file) => {
      const targetPath = join(stagingSkillDirectory, file.path)

      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath, `${file.content.trim()}\n`, 'utf8')
    }),
  )

  try {
    if (await pathExists(skillDirectory)) {
      await rename(skillDirectory, backupSkillDirectory)
    }

    await rename(stagingSkillDirectory, skillDirectory)

    if (await pathExists(backupSkillDirectory)) {
      await rm(backupSkillDirectory, { recursive: true, force: true })
    }
  } catch (error) {
    if (await pathExists(stagingSkillDirectory)) {
      await rm(stagingSkillDirectory, { recursive: true, force: true })
    }

    if (!(await pathExists(skillDirectory)) && (await pathExists(backupSkillDirectory))) {
      await rename(backupSkillDirectory, skillDirectory)
    }

    throw error
  }

  return {
    root,
    availableSkillsDirectory,
    skillDirectory,
    savedFiles: draft.files.map((file) => file.path),
  }
}
