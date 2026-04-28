import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildSkillSourcesContextForAi,
  getSkillSources,
  slugifySkillName,
  SkillsInputError,
  validateFinalizedSkillDraft,
  type SkillLocation,
} from '@/lib/skills'

interface MergeSkillRequestBody {
  name?: unknown
  description?: unknown
  selectedSkills?: unknown
}

interface SkillReferenceInput {
  folderName?: unknown
  location?: unknown
}

const mergedSkillSchema = z.object({
  folderName: z.string().min(1),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().min(1),
      }),
    )
    .min(1),
})

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
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
  let body: MergeSkillRequestBody

  try {
    body = (await request.json()) as MergeSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const selectedSkills = parseSkillReferences(body.selectedSkills)

  if (!name) {
    return Response.json({ error: '缺少 skill name。' }, { status: 400 })
  }

  if (!description) {
    return Response.json({ error: '缺少 skill description。' }, { status: 400 })
  }

  if (selectedSkills.length < 2) {
    return Response.json({ error: '至少需要选择两个 skill。' }, { status: 400 })
  }

  try {
    const sources = await getSkillSources({ skills: selectedSkills })
    const sourcesContext = buildSkillSourcesContextForAi(sources)
    const suggestedFolderName = slugifySkillName(name)

    const { output } = streamText({
      ...options,
      output: Output.object({
        name: 'MergedSkillDraft',
        description: '基于多个现有 skill 合并出的可审查 skill 文件集合',
        schema: mergedSkillSchema,
      }),
      system: [
        '你负责把多个现有 skill 合并成一个新的、可直接保存的 skill 文件集合。',
        '你必须返回符合 schema 的结构化对象，不要输出解释。',
        '最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '如果内容较短且自洽，只返回一个文件：SKILL.md。',
        '如果内容较长，可以拆分出少量辅助文件，例如 docs/*.md 或 resources/*.md，但不要过度拆分。',
        '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
        'folderName 应稳定、简洁，适合作为 workspace/skills.available 下的目录名。',
        '优先消除重复说明，保留互补信息，把相近步骤整理成一份更清晰的统一文档。',
        '如果不同 skill 之间存在边界条件或前置条件差异，需要明确写出，而不是简单拼接。',
        '内容必须忠实于输入 skill，不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Merged skill name: ${name}`,
        `Merged skill description: ${description}`,
        `Suggested folder name: ${suggestedFolderName}`,
        '',
        '请基于以下 skills，生成合并后的完整 skill 文件集合：',
        '',
        sourcesContext,
      ].join('\n'),
    })
    const draft = validateFinalizedSkillDraft(await output)
    const skillContent = draft.files.find((file) => file.path === 'SKILL.md')?.content ?? ''

    return Response.json({ ...draft, content: skillContent })
  } catch (error) {
    if (error instanceof SkillsInputError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : '合并失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
