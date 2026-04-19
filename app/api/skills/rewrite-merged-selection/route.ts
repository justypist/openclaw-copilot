import { streamText } from 'ai'

import { options } from '@/lib/ai'
import { buildSkillSourcesContext, getSkillSources, type SkillLocation } from '@/lib/skills'

interface RewriteMergedSelectionRequestBody {
  name?: unknown
  description?: unknown
  fullContent?: unknown
  selectedText?: unknown
  instruction?: unknown
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
  let body: RewriteMergedSelectionRequestBody

  try {
    body = (await request.json()) as RewriteMergedSelectionRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const fullContent = typeof body.fullContent === 'string' ? body.fullContent : ''
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

  if (selectedSkills.length < 2) {
    return Response.json({ error: '至少需要选择两个 skill。' }, { status: 400 })
  }

  if (!fullContent.includes(selectedText)) {
    return Response.json({ error: '选中片段不在当前内容中。' }, { status: 400 })
  }

  try {
    const sources = await getSkillSources({ skills: selectedSkills })
    const sourcesContext = buildSkillSourcesContext(sources)

    const { text } = streamText({
      ...options,
      system: [
        '你负责修改“合并后的 skill 草稿”中的一个局部片段。',
        '你只能输出选中片段的替换结果，不要输出完整文档，不要解释，不要使用代码围栏。',
        '你必须同时参考完整草稿、源 skill 内容和用户修改意见。',
        '除被选中的片段本身外，不要试图改动其他部分。',
        '保留原有语言风格与 Markdown 结构；如果选区中包含列表、标题或 frontmatter 片段，输出必须仍然合法。',
        '不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Merged skill name: ${name || 'unknown'}`,
        `Merged skill description: ${description || 'unknown'}`,
        '',
        '## User Instruction',
        instruction,
        '',
        '## Full Skill Content',
        fullContent,
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
    const message = error instanceof Error ? error.message : '局部修改失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
