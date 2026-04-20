import type { SkillFileDraft } from '@/lib/skills'
import { writeFinalizedSkillDraft } from '@/lib/skills'

interface SaveSkillRequestBody {
  folderName?: unknown
  files?: unknown
}

export async function POST(request: Request) {
  let body: SaveSkillRequestBody

  try {
    body = (await request.json()) as SaveSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  try {
    const result = await writeFinalizedSkillDraft({
      folderName: typeof body.folderName === 'string' ? body.folderName : '',
      files: Array.isArray(body.files) ? (body.files as SkillFileDraft[]) : [],
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败。'

    return Response.json({ error: message }, { status: 400 })
  }
}
