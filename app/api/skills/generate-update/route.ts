import { streamText, Output } from 'ai'
import { z } from 'zod'

import { options } from '@/lib/ai'
import {
  buildConversationContextForAi,
  buildSkillFileSetContextForAi,
  getSkillFileSet,
  isSessionMessageArray,
  SkillsInputError,
  validateFinalizedSkillDraft,
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

const updatedSkillSchema = z.object({
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
    const fileSet = await getSkillFileSet(targetSkill)
    const fileSetContext = buildSkillFileSetContextForAi(fileSet)
    const conversationContext = buildConversationContextForAi(body.selectedMessages)

    const { output } = streamText({
      ...options,
      output: Output.object({
        name: 'UpdatedSkillDraft',
        description: '基于聊天记录更新后的可审查 skill 文件集合',
        schema: updatedSkillSchema,
      }),
      system: [
        '你负责用用户选中的聊天记录更新一个已经存在的 skill 文件集合。',
        '你必须返回符合 schema 的结构化对象，不要输出解释。',
        '最终结果必须包含 SKILL.md，且其中必须保留合法 YAML frontmatter，至少包含 name 和 description。',
        '返回的是保存前供用户审查的完整文本文件草稿；保留仍然正确的现有文本文件，必要时新增或删除辅助文件。',
        '不要返回只读文件内容；如果只读文件无需变化，忽略它，系统会在保存前继续保留只读文件。',
        '所有 path 必须是相对路径，不能以 / 开头，不能包含 ..。',
        '优先把新信息合并进现有结构，保留仍然正确的原内容，删除或修正已经被新记录证明不准确的内容。',
        '必须遵循用户的更新指令；如果指令与记录冲突，以记录中可验证的信息为准。',
        '内容必须忠实于现有 skill 和聊天记录，不要编造仓库中不存在的命令、文件或工具。',
      ].join('\n'),
      prompt: [
        `Target skill name: ${fileSet.name}`,
        `Target skill description: ${fileSet.description}`,
        `Target skill folder: ${fileSet.folderName}`,
        `Target skill location: ${fileSet.location}`,
        `Session title: ${sessionTitle || 'unknown'}`,
        `Session key: ${sessionKey || 'unknown'}`,
        '',
        '## User Update Instruction',
        instruction,
        '',
        '## Current Skill File Set',
        fileSetContext,
        '',
        '## Selected Timeline Context',
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

    const message = error instanceof Error ? error.message : '生成更新草稿失败。'

    return Response.json({ error: message }, { status: 500 })
  }
}
