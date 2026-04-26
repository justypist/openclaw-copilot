import { streamText } from 'ai'

import { options } from '@/lib/ai'
import {
  buildConversationContextForAi,
  buildSkillSourcesContextForAi,
  getSkillSources,
  isSessionMessageArray,
  SkillsInputError,
  type SkillLocation,
} from '@/lib/skills'

interface GenerateSkillUpdateRequestBody {
  targetSkill?: unknown
  instruction?: unknown
  sessionTitle?: unknown
  sessionKey?: unknown
  selectedMessages?: unknown
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

function parseSkillReference(value: unknown): { folderName: string; location: SkillLocation } | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const reference = value as SkillReferenceInput

  if (typeof reference.folderName !== 'string' || !isSkillLocation(reference.location)) {
    return null
  }

  return {
    folderName: reference.folderName,
    location: reference.location,
  }
}

export async function POST(request: Request) {
  let body: GenerateSkillUpdateRequestBody

  try {
    body = (await request.json()) as GenerateSkillUpdateRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  const targetSkill = parseSkillReference(body.targetSkill)
  const instruction = normalizeText(body.instruction)
  const sessionTitle = normalizeText(body.sessionTitle)
  const sessionKey = normalizeText(body.sessionKey)

  if (!targetSkill) {
    return Response.json({ error: '缺少要更新的 skill。' }, { status: 400 })
  }

  if (!instruction) {
    return Response.json({ error: '请填写如何更新这个 skill。' }, { status: 400 })
  }

  if (!Array.isArray(body.selectedMessages) || body.selectedMessages.length === 0) {
    return Response.json({ error: '缺少选中的聊天记录。' }, { status: 400 })
  }

  if (!isSessionMessageArray(body.selectedMessages)) {
    return Response.json({ error: '选中的聊天记录格式不合法。' }, { status: 400 })
  }

  try {
    const [source] = await getSkillSources({ skills: [targetSkill] })
    const sourcesContext = buildSkillSourcesContextForAi([source])
    const conversationContext = buildConversationContextForAi(body.selectedMessages)

    const { text } = streamText({
      ...options,
      system: [
        '你负责用用户选中的聊天记录更新一个已经存在的 SKILL.md。',
        '你必须返回更新后的完整 SKILL.md，不要添加解释，不要使用代码围栏包裹整个结果。',
        '文档开头必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '优先把新信息合并进现有结构，保留仍然正确的原内容，删除或修正已经被新记录证明不准确的内容。',
        '必须遵循用户的更新指令；如果指令与记录冲突，以记录中可验证的信息为准。',
        '内容必须忠实于现有 skill 和聊天记录，不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Target skill name: ${source.name}`,
        `Target skill description: ${source.description}`,
        `Target skill folder: ${source.folderName}`,
        `Target skill location: ${source.location}`,
        `Session title: ${sessionTitle || 'unknown'}`,
        `Session key: ${sessionKey || 'unknown'}`,
        '',
        '## User Update Instruction',
        instruction,
        '',
        '## Existing Skill Source',
        sourcesContext,
        '',
        '## Selected Timeline Context',
        conversationContext,
      ].join('\n'),
    })

    return Response.json({ content: await text })
  } catch (error) {
    if (error instanceof SkillsInputError) {
      return Response.json({ error: error.message }, { status: 400 })
    }

    const message = error instanceof Error ? error.message : '生成更新草稿失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
