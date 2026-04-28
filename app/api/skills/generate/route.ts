import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildConversationContextForAi,
  isSessionMessageArray,
  SkillsInputError,
  slugifySkillName,
  validateFinalizedSkillDraft,
} from '@/lib/skills'

interface GenerateSkillRequestBody {
  name?: unknown
  description?: unknown
  sessionTitle?: unknown
  sessionKey?: unknown
  selectedMessages?: unknown
}

const generatedSkillSchema = z.object({
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

  try {
    const conversationContext = buildConversationContextForAi(body.selectedMessages)
    const suggestedFolderName = slugifySkillName(name)

    const { output } = streamText({
      ...options,
      output: Output.object({
        name: 'GeneratedSkillDraft',
        description: '基于聊天记录生成的可审查 skill 文件集合',
        schema: generatedSkillSchema,
      }),
      system: [
        '你负责把用户选中的聊天记录整理成一个可直接落地的 skill 文件集合。',
        '你必须返回符合 schema 的结构化对象，不要输出解释。',
        '最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '如果内容较短且自洽，只返回一个文件：SKILL.md。',
        '如果内容较长，可以拆分出少量辅助文件，例如 docs/*.md 或 resources/*.md，但不要过度拆分。',
        '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
        'folderName 应稳定、简洁，适合作为 workspace/skills.available 下的目录名。',
        'SKILL.md 正文应尽量清晰、可执行，优先包含：这个 skill 做什么、何时使用、操作步骤、注意事项。',
        '内容要忠实于聊天记录，不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Skill name: ${name}`,
        `Skill description: ${description}`,
        `Suggested folder name: ${suggestedFolderName}`,
        `Session title: ${sessionTitle || 'unknown'}`,
        `Session key: ${sessionKey || 'unknown'}`,
        '',
        '请基于以下时间线记录，生成完整 skill 文件集合：',
        '',
        conversationContext,
      ].join('\n'),
    })
    const draft = validateFinalizedSkillDraft(await output)
    const skillContent = draft.files.find((file) => file.path === 'SKILL.md')?.content ?? ''

    return Response.json({ ...draft, content: skillContent })
  } catch (error) {
    if (error instanceof SkillsInputError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : '生成失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
