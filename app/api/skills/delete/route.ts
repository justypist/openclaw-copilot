import { deleteSkill, type SkillLocation } from '@/lib/skills'

interface DeleteSkillRequestBody {
  folderName?: unknown
  location?: unknown
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
}

export async function POST(request: Request) {
  let body: DeleteSkillRequestBody

  try {
    body = (await request.json()) as DeleteSkillRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  if (!isSkillLocation(body.location)) {
    return Response.json({ error: '缺少合法的 skill 目录。' }, { status: 400 })
  }

  try {
    const result = await deleteSkill({
      location: body.location,
      folderName: typeof body.folderName === 'string' ? body.folderName : '',
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '删除失败。'

    return Response.json({ error: message }, { status: 400 })
  }
}
