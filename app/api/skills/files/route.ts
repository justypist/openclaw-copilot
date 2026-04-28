import { getSkillFileSet, type SkillLocation } from '@/lib/skills'

interface SkillFilesRequestBody {
  folderName?: unknown
  location?: unknown
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
}

export async function POST(request: Request) {
  let body: SkillFilesRequestBody

  try {
    body = (await request.json()) as SkillFilesRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  if (!isSkillLocation(body.location) || typeof body.folderName !== 'string') {
    return Response.json({ error: '缺少合法的 skill。' }, { status: 400 })
  }

  try {
    const skill = await getSkillFileSet({
      location: body.location,
      folderName: body.folderName,
    })

    return Response.json({ skill })
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取 skill 文件失败。'

    return Response.json({ error: message }, { status: 400 })
  }
}
