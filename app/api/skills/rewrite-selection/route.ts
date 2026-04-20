import { streamText } from 'ai'

import { options } from '@/lib/ai'
import { buildConversationContext, isSessionMessageArray } from '@/lib/skills'

interface RewriteSelectionRequestBody {
  name?: unknown
  description?: unknown
  sessionTitle?: unknown
  sessionKey?: unknown
  fullContent?: unknown
  selectedText?: unknown
  instruction?: unknown
  selectedMessages?: unknown
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  let body: RewriteSelectionRequestBody

  try {
    body = (await request.json()) as RewriteSelectionRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const sessionTitle = normalizeText(body.sessionTitle)
  const sessionKey = normalizeText(body.sessionKey)
  const fullContent = typeof body.fullContent === 'string' ? body.fullContent : ''
  const selectedText = typeof body.selectedText === 'string' ? body.selectedText : ''
  const instruction = normalizeText(body.instruction)

  if (!fullContent.trim()) {
    return Response.json({ error: '缺少完整 skill 内容。' }, { status: 400 })
  }

  if (!selectedText.trim()) {
    return Response.json({ error: '缺少选中的文本片段。' }, { status: 400 })
  }

  if (!instruction) {
    return Response.json({ error: '缺少修改意见。' }, { status: 400 })
  }

  if (!Array.isArray(body.selectedMessages) || body.selectedMessages.length === 0) {
    return Response.json({ error: '缺少选中的聊天记录。' }, { status: 400 })
  }

  if (!isSessionMessageArray(body.selectedMessages)) {
    return Response.json({ error: '选中的聊天记录格式不合法。' }, { status: 400 })
  }

  if (!fullContent.includes(selectedText)) {
    return Response.json({ error: '选中片段不在当前内容中。' }, { status: 400 })
  }

  const conversationContext = buildConversationContext(body.selectedMessages)

  try {
    const { text } = streamText({
      ...options,
      system: [
        '你负责修改 SKILL.md 中的一个局部片段。',
        '你只能输出“选中片段的替换结果”，不要输出完整文档，不要解释，不要使用代码围栏。',
        '你必须结合完整文档、会话上下文和用户修改意见进行改写。',
        '除被选中的片段本身外，不要试图改动其他部分。',
        '保留原有语言风格与 Markdown 结构；如果选区中包含列表、标题或 frontmatter 片段，输出必须仍然合法。',
        '不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Skill name: ${name || 'unknown'}`,
        `Skill description: ${description || 'unknown'}`,
        `Session title: ${sessionTitle || 'unknown'}`,
        `Session key: ${sessionKey || 'unknown'}`,
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
        '## Timeline Context',
        conversationContext,
      ].join('\n'),
    })

    return Response.json({ replacement: await text })
  } catch (error) {
    const message = error instanceof Error ? error.message : '局部修改失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
