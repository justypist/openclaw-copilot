import { streamText } from 'ai'

import { options } from '@/lib/ai'
import { buildSkillSourcesContext, getSkillSources, type SkillLocation } from '@/lib/skills'

interface MergeSkillRequestBody {
  name?: unknown
  description?: unknown
  selectedSkills?: unknown
}

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
    const sourcesContext = buildSkillSourcesContext(sources)

    const { text } = streamText({
      ...options,
      system: [
        '你负责把多个现有 skill 合并成一个新的、可直接保存的 SKILL.md。',
        '你必须返回一个完整 Markdown，不要添加解释，不要使用代码围栏包裹整个结果。',
        '文档开头必须包含 YAML frontmatter，至少包含 name 和 description。',
        '优先消除重复说明，保留互补信息，把相近步骤整理成一份更清晰的统一文档。',
        '如果不同 skill 之间存在边界条件或前置条件差异，需要明确写出，而不是简单拼接。',
        '内容必须忠实于输入 skill，不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Merged skill name: ${name}`,
        `Merged skill description: ${description}`,
        '',
        '请基于以下 skills，生成合并后的完整 SKILL.md 内容：',
        '',
        sourcesContext,
      ].join('\n'),
    })

    return Response.json({ content: await text })
  } catch (error) {
    const message = error instanceof Error ? error.message : '合并失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
