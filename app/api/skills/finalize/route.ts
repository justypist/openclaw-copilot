import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildConversationContext,
  isSessionMessageArray,
  slugifySkillName,
  validateFinalizedSkillDraft,
} from '@/lib/skills'

interface FinalizeSkillRequestBody {
  name?: unknown
  description?: unknown
  sessionTitle?: unknown
  sessionKey?: unknown
  fullContent?: unknown
  selectedMessages?: unknown
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

export async function POST(request: Request) {
  let body: FinalizeSkillRequestBody

  try {
    body = (await request.json()) as FinalizeSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const name = normalizeText(body.name)
  const description = normalizeText(body.description)
  const sessionTitle = normalizeText(body.sessionTitle)
  const sessionKey = normalizeText(body.sessionKey)
  const fullContent = typeof body.fullContent === 'string' ? body.fullContent.trim() : ''

  if (!name) {
    return Response.json({ error: '缺少 skill name。' }, { status: 400 })
  }

  if (!description) {
    return Response.json({ error: '缺少 skill description。' }, { status: 400 })
  }

  if (!fullContent) {
    return Response.json({ error: '缺少完整 skill 内容。' }, { status: 400 })
  }

  if (!Array.isArray(body.selectedMessages) || body.selectedMessages.length === 0) {
    return Response.json({ error: '缺少选中的聊天记录。' }, { status: 400 })
  }

  if (!isSessionMessageArray(body.selectedMessages)) {
    return Response.json({ error: '选中的聊天记录格式不合法。' }, { status: 400 })
  }

  const conversationContext = buildConversationContext(body.selectedMessages)
  const suggestedFolderName = slugifySkillName(name)

  try {
    const { output } = streamText({
      ...options,
      output: Output.object({
        name: 'FinalizedSkillDraft',
        description: '最终可保存的 skill 文件集合',
        schema: finalizedSkillSchema,
      }),
      system: [
        '你负责把一份已经过人工调整的 skill 草稿整理成最终可保存的技能目录。',
        '你必须返回符合 schema 的结构化对象，不要输出解释。',
        '最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '如果内容较短且自洽，只返回一个文件：SKILL.md。',
        '如果内容较长，可以拆分出少量辅助文件，例如 docs/*.md 或 resources/*.md，但不要过度拆分。',
        '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
        'folderName 应稳定、简洁，适合作为 workspace/skills.available 下的目录名。',
        '不要编造仓库中不存在的命令、文件或工具；拆分后 SKILL.md 必须仍然能独立说明用途和使用时机。',
      ].join('\n'),
      prompt: [
        `Skill name: ${name}`,
        `Skill description: ${description}`,
        `Suggested folder name: ${suggestedFolderName}`,
        `Session title: ${sessionTitle || 'unknown'}`,
        `Session key: ${sessionKey || 'unknown'}`,
        '',
        '## Current Skill Draft',
        fullContent,
        '',
        '## Timeline Context',
        conversationContext,
      ].join('\n'),
    })

    const draft = validateFinalizedSkillDraft(await output)

    return Response.json(draft)
  } catch (error) {
    const message = error instanceof Error ? error.message : '定稿失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
