import { buildSkillDownloadArchive, type SkillLocation } from '@/lib/skills'

interface SkillReferenceInput {
  folderName?: unknown
  location?: unknown
}

interface DownloadSkillsRequestBody {
  skills?: unknown
}

function isSkillLocation(value: unknown): value is SkillLocation {
  return value === 'available' || value === 'enabled'
}

export async function POST(request: Request) {
  let body: DownloadSkillsRequestBody

  try {
    body = (await request.json()) as DownloadSkillsRequestBody
  } catch {
    return Response.json({ error: '请求体不是合法 JSON。' }, { status: 400 })
  }

  if (!Array.isArray(body.skills)) {
    return Response.json({ error: '缺少 skill 列表。' }, { status: 400 })
  }

  const skills = body.skills.flatMap((skill) => {
    const item = skill as SkillReferenceInput

    if (typeof item.folderName !== 'string' || !isSkillLocation(item.location)) {
      return []
    }

    return [
      {
        folderName: item.folderName,
        location: item.location,
      },
    ]
  })

  try {
    const result = await buildSkillDownloadArchive({ skills })
    const archiveBuffer = result.archive.buffer.slice(
      result.archive.byteOffset,
      result.archive.byteOffset + result.archive.byteLength,
    ) as ArrayBuffer

    return new Response(archiveBuffer, {
      status: 200,
      headers: {
        'Content-Disposition': `attachment; filename="${encodeURIComponent(result.fileName)}"`,
        'Content-Type': 'application/gzip',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '下载失败。'

    return Response.json({ error: message }, { status: 400 })
  }
}
