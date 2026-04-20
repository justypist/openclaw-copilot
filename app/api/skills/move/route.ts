import { requireLocalSkillsApiAccess } from '@/lib/skills-api-access'
import { moveSkills, type SkillLocation } from '@/lib/skills'

interface MoveSkillsRequestBody {
  from?: unknown
  skillFolderNames?: unknown
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
}

export async function POST(request: Request) {
  const accessErrorResponse = requireLocalSkillsApiAccess(request)

  if (accessErrorResponse) {
    return accessErrorResponse
  }

  let body: MoveSkillsRequestBody

  try {
    body = (await request.json()) as MoveSkillsRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  if (!isSkillLocation(body.from)) {
    return Response.json({ error: '缺少合法的来源目录。' }, { status: 400 })
  }

  if (!Array.isArray(body.skillFolderNames)) {
    return Response.json({ error: '缺少 skill 目录名列表。' }, { status: 400 })
  }

  try {
    const result = await moveSkills({
      from: body.from,
      skillFolderNames: body.skillFolderNames.filter(
        (folderName): folderName is string => typeof folderName === 'string',
      ),
    })

    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : '转移失败。'

    return Response.json({ error: message }, { status: 400 })
  }
}
