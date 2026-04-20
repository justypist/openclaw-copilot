const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

function normalizeIpCandidate(value: string): string {
  const trimmed = value.trim().replace(/^for=/i, '').replace(/^"|"$/g, '')

  if (!trimmed) {
    return ''
  }

  if (trimmed.startsWith('[')) {
    const closingBracketIndex = trimmed.indexOf(']')

    return closingBracketIndex >= 0 ? trimmed.slice(0, closingBracketIndex + 1).toLowerCase() : trimmed.toLowerCase()
  }

  const lastColonIndex = trimmed.lastIndexOf(':')
  const hasSingleColon = lastColonIndex >= 0 && trimmed.indexOf(':') === lastColonIndex

  if (hasSingleColon) {
    const portCandidate = trimmed.slice(lastColonIndex + 1)

    if (/^\d+$/.test(portCandidate)) {
      return trimmed.slice(0, lastColonIndex).toLowerCase()
    }
  }

  return trimmed.toLowerCase()
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

function isLoopbackIp(value: string): boolean {
  const normalized = normalizeIpCandidate(value)

  return normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1'
}

function parseHostnameFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname
  } catch {
    return null
  }
}

function getForwardedIpCandidates(request: Request): string[] {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const forwarded = request.headers.get('forwarded')

  const candidates = [
    ...(forwardedFor ? forwardedFor.split(',') : []),
    ...(realIp ? [realIp] : []),
    ...(forwarded
      ? forwarded
          .split(',')
          .flatMap((entry) => entry.split(';'))
          .map((part) => part.trim())
          .filter((part) => /^for=/i.test(part))
      : []),
  ]

  return candidates.map(normalizeIpCandidate).filter(Boolean)
}

function getRejectedHeaderReason(request: Request): string | null {
  const requestHostname = parseHostnameFromUrl(request.url)

  if (!requestHostname || !isLoopbackHostname(requestHostname)) {
    return '当前 skills API 仅允许通过本机地址访问。请使用 localhost 或 127.0.0.1 打开应用。'
  }

  for (const headerName of ['origin', 'referer']) {
    const headerValue = request.headers.get(headerName)

    if (!headerValue) {
      continue
    }

    const headerHostname = parseHostnameFromUrl(headerValue)

    if (!headerHostname || !isLoopbackHostname(headerHostname)) {
      return '当前 skills API 仅允许来自本机页面的请求。'
    }
  }

  const forwardedIpCandidates = getForwardedIpCandidates(request)

  if (forwardedIpCandidates.some((candidate) => !isLoopbackIp(candidate))) {
    return '当前 skills API 仅允许本机客户端访问。'
  }

  return null
}

export function requireLocalSkillsApiAccess(request: Request): Response | null {
  const error = getRejectedHeaderReason(request)

  if (!error) {
    return null
  }

  return Response.json({ error }, { status: 403 })
}
