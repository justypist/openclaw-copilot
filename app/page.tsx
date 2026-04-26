import { connection } from 'next/server'

import Link from 'next/link'

import SessionsWorkspace from '@/app/_components/sessions-workspace'
import { getSessionMessages, getSessionsOverview } from '@/lib/openclaw/sessions'
import { getSkillsLibrary } from '@/lib/skills'

interface HomePageProps {
  searchParams: Promise<{
    session?: string | string[] | undefined
  }>
}

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return '未知'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function normalizeSessionParam(session: string | string[] | undefined): string | undefined {
  if (Array.isArray(session)) {
    return session[0]
  }

  return session
}

export default async function Home({ searchParams }: HomePageProps) {
  await connection()

  const overviewPromise = getSessionsOverview()
  const skillsLibraryPromise = getSkillsLibrary()
  const resolvedSearchParams = await searchParams
  const result = await overviewPromise

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-white px-4 py-4 text-black sm:px-6">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <section className="border border-black p-5">
            <h1 className="text-base font-medium">读取失败</h1>
            <p className="mt-3 break-all text-sm">{result.error}</p>
            <p className="mt-2 break-all font-mono text-xs text-neutral-500">
              当前 OPENCLAW_ROOT：{result.root || '未设置'}
            </p>
          </section>
        </main>
      </div>
    )
  }

  const sessions = result.data.sessions
  const requestedSessionId = normalizeSessionParam(resolvedSearchParams.session)
  const selectedSessionId = sessions.some((session) => session.sessionId === requestedSessionId)
    ? requestedSessionId
    : sessions[0]?.sessionId
  const selectedSession = sessions.find((session) => session.sessionId === selectedSessionId) ?? null
  const messagesResult = selectedSessionId ? await getSessionMessages(selectedSessionId) : null
  const messages = messagesResult?.ok ? messagesResult.data.messages : []
  const messagesError = messagesResult && !messagesResult.ok ? messagesResult.error : undefined
  const skillsLibraryResult = await skillsLibraryPromise
  const availableSkills = skillsLibraryResult.ok ? skillsLibraryResult.data.availableSkills : []
  const enabledSkills = skillsLibraryResult.ok ? skillsLibraryResult.data.enabledSkills : []

  return (
    <div className="h-dvh overflow-hidden bg-white px-4 py-4 text-black sm:px-6">
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col gap-4">
        <section className="border border-black bg-white px-4 py-3 sm:px-5">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-medium tracking-[-0.02em]">OpenClaw Copilot</h1>
              <Link
                href="/skills"
                className="border border-black px-2.5 py-1 text-xs transition-colors hover:bg-neutral-100"
              >
                Skills Library
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600 sm:text-sm">
              <span>{sessions.length} sessions</span>
              <span>{selectedSession?.title ?? 'No session selected'}</span>
              <time>{formatTimestamp(selectedSession?.updatedAt)}</time>
            </div>
          </div>
        </section>

        <SessionsWorkspace
          sessions={sessions}
          selectedSession={selectedSession}
          messages={messages}
          messagesError={messagesError}
          availableSkills={availableSkills}
          enabledSkills={enabledSkills}
        />
      </main>
    </div>
  )
}
