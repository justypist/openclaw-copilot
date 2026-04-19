import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildSkillSourcesContext,
  getSkillSources,
  slugifySkillName,
  validateFinalizedSkillDraft,
  type SkillLocation,
} from '@/lib/skills'

interface FinalizeMergedSkillRequestBody {
  name?: unknown
  description?: unknown
  fullContent?: unknown
  selectedSkills?: unknown
}

interface SkillReferenceInput {
  folderName?: unknown
  location?: unknown
}

const finalizedSkillSchema = z.object({
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
  let body: FinalizeMergedSkillRequestBody

  try {
    body = (await request.json()) as FinalizeMergedSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const fullContent = typeof body.fullContent === 'string' ? body.fullContent.trim() : ''
  const selectedSkills = parseSkillReferences(body.selectedSkills)

  if (!name) {
    return Response.json({ error: '缺少 skill name。' }, { status: 400 })
  }

  if (!description) {
    return Response.json({ error: '缺少 skill description。' }, { status: 400 })
  }

  if (!fullContent) {
    return Response.json({ error: '缺少完整 skill 内容。' }, { status: 400 })
  }

  if (selectedSkills.length < 2) {
    return Response.json({ error: '至少需要选择两个 skill。' }, { status: 400 })
  }

  const suggestedFolderName = slugifySkillName(name)

  try {
    const sources = await getSkillSources({ skills: selectedSkills })
    const sourcesContext = buildSkillSourcesContext(sources)

    const { output } = streamText({
      ...options,
      output: Output.object({
        name: 'FinalizedMergedSkillDraft',
        description: '最终可保存的合并 skill 文件集合',
        schema: finalizedSkillSchema,
      }),
      system: [
        '你负责把一份已经过人工调整的合并 skill 草稿整理成最终可保存的技能目录。',
        '你必须返回符合 schema 的结构化对象，不要输出解释。',
        '最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '如果内容较短且自洽，只返回一个文件：SKILL.md。',
        '如果内容较长，可以拆分出少量辅助文件，例如 docs/*.md 或 resources/*.md，但不要过度拆分。',
        '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
        'folderName 应稳定、简洁，适合作为 available-skills 下的目录名。',
        '你可以参考源 skill，但最终 SKILL.md 必须是合并后的统一版本，不能只是罗列多个 skill。',
      ].join('\n'),
      prompt: [
        `Merged skill name: ${name}`,
        `Merged skill description: ${description}`,
        `Suggested folder name: ${suggestedFolderName}`,
        '',
        '## Current Merged Skill Draft',
        fullContent,
        '',
        '## Source Skills',
        sourcesContext,
      ].join('\n'),
    })

    const draft = validateFinalizedSkillDraft(await output)

    return Response.json(draft)
  } catch (error) {
    const message = error instanceof Error ? error.message : '定稿失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
