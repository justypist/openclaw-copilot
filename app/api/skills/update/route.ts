import { updateSkillContent, type SkillLocation } from '@/lib/skills'

interface UpdateSkillRequestBody {
  folderName?: unknown
  location?: unknown
  content?: unknown
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
}

export async function POST(request: Request) {
  let body: UpdateSkillRequestBody

  try {
    body = (await request.json()) as UpdateSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  try {
    if (!isSkillLocation(body.location)) {
      return Response.json({ error: '缺少合法的 skill 目录。' }, { status: 400 })
    }

    const skill = await updateSkillContent({
      folderName: typeof body.folderName === 'string' ? body.folderName : '',
      location: body.location,
      content: typeof body.content === 'string' ? body.content : '',
    })

    return Response.json({ skill })
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存失败。'

    return Response.json({ error: message }, { status: 400 })
  }
}
