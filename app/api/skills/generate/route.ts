import { streamText } from 'ai'

import { options } from '@/lib/ai'
import { buildConversationContext, isSessionMessageArray } from '@/lib/skills'

interface GenerateSkillRequestBody {
  name?: unknown
  description?: unknown
  sessionTitle?: unknown
  sessionKey?: unknown
  selectedMessages?: unknown
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: Request) {
  let body: GenerateSkillRequestBody

  try {
    body = (await request.json()) as GenerateSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const sessionTitle = normalizeText(body.sessionTitle)
  const sessionKey = normalizeText(body.sessionKey)

  if (!name) {
    return Response.json({ error: '缺少 skill name。' }, { status: 400 })
  }

  if (!description) {
    return Response.json({ error: '缺少 skill description。' }, { status: 400 })
  }

  if (!Array.isArray(body.selectedMessages) || body.selectedMessages.length === 0) {
    return Response.json({ error: '缺少选中的聊天记录。' }, { status: 400 })
  }

  if (!isSessionMessageArray(body.selectedMessages)) {
    return Response.json({ error: '选中的聊天记录格式不合法。' }, { status: 400 })
  }

  const selectedMessages = body.selectedMessages
  const conversationContext = buildConversationContext(selectedMessages)

  try {
    const { text } = streamText({
      ...options,
      system: [
        '你负责把用户选中的聊天记录整理成一个可直接落地的 SKILL.md。',
        '你必须返回一个完整 Markdown，不要添加解释，不要使用代码围栏包裹整个结果。',
        '文档开头必须包含 YAML frontmatter，至少包含 name 和 description。',
        '正文应尽量清晰、可执行，优先包含：这个 skill 做什么、何时使用、操作步骤、注意事项。',
        '内容要忠实于聊天记录，不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Skill name: ${name}`,
        `Skill description: ${description}`,
        `Session title: ${sessionTitle || 'unknown'}`,
        `Session key: ${sessionKey || 'unknown'}`,
        '',
        '请基于以下时间线记录，生成完整 SKILL.md 内容：',
        '',
        conversationContext,
      ].join('\n'),
    })

    return Response.json({ content: await text })
  } catch (error) {
    const message = error instanceof Error ? error.message : '生成失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
