import { updateSkillContent, updateSkillFiles, type SkillFileDraft, type SkillLocation } from '@/lib/skills'

interface UpdateSkillRequestBody {
  folderName?: unknown
  location?: unknown
  content?: unknown
  files?: unknown
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
}

function parseSkillFileDrafts(value: unknown): SkillFileDraft[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value.map((item) => {
    const candidate = item as Partial<Record<keyof SkillFileDraft, unknown>>

    return {
      path: typeof candidate.path === 'string' ? candidate.path : '',
      content: typeof candidate.content === 'string' ? candidate.content : '',
    }
  })
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

    const files = parseSkillFileDrafts(body.files)
    const skill = files
      ? await updateSkillFiles({
          folderName: typeof body.folderName === 'string' ? body.folderName : '',
          location: body.location,
          files,
        })
      : await updateSkillContent({
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
