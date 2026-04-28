import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildSkillFileDraftsContextForAi,
  SkillsInputError,
  validateFinalizedSkillDraft,
  validateSkillFileDrafts,
  type SkillFileDraft,
} from '@/lib/skills'

interface RewriteSkillFilesRequestBody {
  name?: unknown
  description?: unknown
  folderName?: unknown
  currentFilePath?: unknown
  files?: unknown
  instruction?: unknown
}

const skillFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
})

const rewrittenSkillFilesSchema = z.object({
  folderName: z.string().min(1),
  files: z.array(skillFileSchema).min(1),
})

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSkillFileDrafts(value: unknown): SkillFileDraft[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value.map((item) => {
    const candidate = item as Partial<Record<keyof SkillFileDraft, unknown>>

    return {
      path: typeof candidate.path === 'string' ? candidate.path : '',
      content: typeof candidate.content === 'string' ? candidate.content : '',
    }
  })
}

export async function POST(request: Request) {
  let body: RewriteSkillFilesRequestBody

  try {
    body = (await request.json()) as RewriteSkillFilesRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const folderName = normalizeText(body.folderName) || name || 'skill'
  const currentFilePath = normalizeText(body.currentFilePath) || 'SKILL.md'
  const files = parseSkillFileDrafts(body.files)
  const instruction = normalizeText(body.instruction)

  if (!files) {
    return Response.json({ error: '缺少当前 skill 文件集合。' }, { status: 400 })
  }

  if (!instruction) {
    return Response.json({ error: '请先填写整目录修改指令。' }, { status: 400 })
  }

  try {
    const draftFiles = validateSkillFileDrafts(files)
    const currentFile = draftFiles.find((file) => file.path === currentFilePath)
    const filesContext = buildSkillFileDraftsContextForAi(draftFiles, currentFile?.path ?? 'SKILL.md')

    const { output } = streamText({
      ...options,
      output: Output.object({
        name: 'RewrittenSkillFilesDraft',
        description: '按用户指令改写后的完整多文件 skill 草稿',
        schema: rewrittenSkillFilesSchema,
      }),
      system: [
        '你负责按用户指令修改一个完整 skill 目录中的文本文件集合。',
        '你必须返回符合 schema 的结构化对象，不要输出解释。',
        '返回结果必须是修改后的完整文本文件草稿，而不是 diff。',
        '你可以根据指令新增文件、删除文件、合并文件、重命名文件或修改多个文件内容。',
        '最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
        'folderName 默认保持现有目录名；只有用户明确要求重命名时才修改。',
        '如果删除或合并文件，必须在返回的 files 中省略被删除或被合并掉的文件。',
        '只保留仍然正确且必要的文件；不要为了凑数量新增文件，也不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Skill name: ${name || 'unknown'}`,
        `Skill description: ${description || 'unknown'}`,
        `Current folder name: ${folderName}`,
        `Current file path: ${currentFilePath}`,
        '',
        '## User Directory-Level Instruction',
        instruction,
        '',
        '## Current Editable Skill Files',
        filesContext,
      ].join('\n'),
    })
    const result = await output
    const draft = validateFinalizedSkillDraft({
      folderName: result.folderName || folderName,
      files: result.files,
    })
    const skillContent = draft.files.find((file) => file.path === 'SKILL.md')?.content ?? ''

    return Response.json({ ...draft, content: skillContent })
  } catch (error) {
    if (error instanceof SkillsInputError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : '整目录修改失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
