import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildSkillFileDraftsContextForAi,
  buildSkillSourcesContextForAi,
  getSkillSources,
  SkillsInputError,
  slugifySkillName,
  validateFinalizedSkillDraft,
  validateSkillFileDrafts,
  type SkillFileDraft,
  type SkillLocation,
  validateSkillContentForAi,
} from '@/lib/skills'

interface RewriteMergedSelectionRequestBody {
  name?: unknown
  description?: unknown
  fullContent?: unknown
  currentFilePath?: unknown
  files?: unknown
  selectedText?: unknown
  instruction?: unknown
  selectedSkills?: unknown
}

const skillFileSchema = z.object({
  path: z.string().min(1),
  content: z.string().min(1),
})

const rewriteSelectionOutputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('replacement'),
    replacement: z.string().min(1),
  }),
  z.object({
    mode: z.literal('draft'),
    folderName: z.string().min(1),
    files: z.array(skillFileSchema).min(1),
  }),
])

interface SkillReferenceInput {
  folderName?: unknown
  location?: unknown
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
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

function parseSkillReferences(value: unknown): Array<{ folderName: string; location: SkillLocation }> {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    const reference = item as SkillReferenceInput

    if (typeof reference.folderName !== 'string' || !isSkillLocation(reference.location)) {
      return []
    }

    return [{
      folderName: reference.folderName,
      location: reference.location,
    }]
  })
}

export async function POST(request: Request) {
  let body: RewriteMergedSelectionRequestBody

  try {
    body = (await request.json()) as RewriteMergedSelectionRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const fullContent = typeof body.fullContent === 'string' ? body.fullContent : ''
  const currentFilePath = normalizeText(body.currentFilePath) || 'SKILL.md'
  const files = parseSkillFileDrafts(body.files)
  const selectedText = typeof body.selectedText === 'string' ? body.selectedText : ''
  const instruction = normalizeText(body.instruction)
  const selectedSkills = parseSkillReferences(body.selectedSkills)

  if (!fullContent.trim()) {
    return Response.json({ error: '缺少完整 skill 内容。' }, { status: 400 })
  }

  if (!selectedText.trim()) {
    return Response.json({ error: '缺少选中的文本片段。' }, { status: 400 })
  }

  if (!instruction) {
    return Response.json({ error: '缺少修改意见。' }, { status: 400 })
  }

  if (selectedSkills.length === 0) {
    return Response.json({ error: '至少需要提供一个 skill。' }, { status: 400 })
  }

  if (!fullContent.includes(selectedText)) {
    return Response.json({ error: '选中片段不在当前内容中。' }, { status: 400 })
  }

  try {
    const sources = await getSkillSources({ skills: selectedSkills })
    const sourcesContext = buildSkillSourcesContextForAi(sources)

    if (files) {
      const draftFiles = validateSkillFileDrafts(files)
      const currentFile = draftFiles.find((file) => file.path === currentFilePath)

      if (!currentFile) {
        return Response.json({ error: `当前文件不存在：${currentFilePath}` }, { status: 400 })
      }

      if (!currentFile.content.includes(selectedText)) {
        return Response.json({ error: '选中片段不在当前文件中。' }, { status: 400 })
      }

      const filesContext = buildSkillFileDraftsContextForAi(draftFiles, currentFilePath)
      const suggestedFolderName = slugifySkillName(name || 'skill')

      const { output } = streamText({
        ...options,
        output: Output.object({
          name: 'MergedSelectionRewriteResult',
          description: '当前文件选区替换或完整多文件 skill 草稿',
          schema: rewriteSelectionOutputSchema,
        }),
        system: [
          '你负责根据用户意见改写当前 skill 文件中的一个选中片段。',
          '默认只返回 mode=replacement 和选中片段的替换结果。',
          '只有当用户明确要求同步修改其他文件、新增文件、删除文件或跨文件调整时，才返回 mode=draft 和完整文本文件草稿。',
          'mode=draft 的最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
          '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
          '不要解释，不要使用代码围栏包裹字段值，不要编造仓库中不存在的命令、文件或工具。',
        ].join('\n'),
        prompt: [
          `Skill name: ${name || 'unknown'}`,
          `Skill description: ${description || 'unknown'}`,
          `Suggested folder name: ${suggestedFolderName}`,
          `Current file path: ${currentFilePath}`,
          '',
          '## User Instruction',
          instruction,
          '',
          '## Current Skill Draft Files',
          filesContext,
          '',
          '## Selected Fragment To Replace In Current File',
          selectedText,
          '',
          '## Source Skills',
          sourcesContext,
        ].join('\n'),
      })
      const result = await output

      if (result.mode === 'replacement') {
        return Response.json({ replacement: result.replacement })
      }

      const draft = validateFinalizedSkillDraft({
        folderName: result.folderName,
        files: result.files,
      })
      const skillContent = draft.files.find((file) => file.path === 'SKILL.md')?.content ?? ''

      return Response.json({ ...draft, content: skillContent, mode: 'draft' })
    }

    const validatedFullContent = validateSkillContentForAi(fullContent)

    const { text } = streamText({
      ...options,
      system: [
        '你负责修改 skill 文档中的一个局部片段。',
        '你只能输出选中片段的替换结果，不要输出完整文档，不要解释，不要使用代码围栏。',
        '你必须同时参考完整草稿、源 skill 内容和用户修改意见。',
        '除被选中的片段本身外，不要试图改动其他部分。',
        '保留原有语言风格与 Markdown 结构；如果选区中包含列表、标题或 frontmatter 片段，输出必须仍然合法。',
        '不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Skill name: ${name || 'unknown'}`,
        `Skill description: ${description || 'unknown'}`,
        '',
        '## User Instruction',
        instruction,
        '',
        '## Full Skill Content',
        validatedFullContent,
        '',
        '## Selected Fragment To Replace',
        selectedText,
        '',
        '## Source Skills',
        sourcesContext,
      ].join('\n'),
    })

    return Response.json({ replacement: await text })
  } catch (error) {
    if (error instanceof SkillsInputError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : '局部修改失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
