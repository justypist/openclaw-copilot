import { getSessionsOverview } from '@/lib/openclaw/sessions'

export const dynamic = 'force-dynamic'

function formatTimestamp(timestamp: number | undefined): string {
  if (!timestamp) {
    return '未知'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

export default async function Home() {
  const result = await getSessionsOverview()

  if (!result.ok) {
    return (
      <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-50">
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <section className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="text-sm text-red-200">读取聊天记录失败</p>
            <h1 className="mt-2 text-2xl font-semibold">第 1 步尚未完成</h1>
            <p className="mt-4 break-all text-sm text-zinc-200">{result.error}</p>
            <p className="mt-2 break-all text-xs text-zinc-400">
              当前 OPENCLAW_ROOT：{result.root || '未设置'}
            </p>
          </section>
        </main>
      </div>
    )
  }

  const sessions = result.data.sessions
  const visibleSessions = sessions.slice(0, 12)

  return (
    <div className="min-h-screen bg-zinc-950 px-6 py-10 text-zinc-50">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-3xl border border-emerald-500/20 bg-zinc-900 p-6 shadow-2xl shadow-emerald-950/20">
          <p className="text-sm text-emerald-300">OpenClaw Copilot</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">已成功读取聊天记录</h1>
          <p className="mt-4 break-all text-sm text-zinc-300">
            OPENCLAW_ROOT：{result.data.root}
          </p>
          <p className="mt-2 break-all text-sm text-zinc-400">
            sessions 目录：{result.data.sessionsDirectory}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">会话总数</p>
              <p className="mt-3 text-3xl font-semibold">{sessions.length}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">最近展示</p>
              <p className="mt-3 text-3xl font-semibold">{visibleSessions.length}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">最近更新时间</p>
              <p className="mt-3 text-base font-medium text-zinc-100">
                {formatTimestamp(sessions[0]?.updatedAt)}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div>
              <h2 className="text-xl font-semibold">最近会话</h2>
              <p className="mt-1 text-sm text-zinc-400">
                当前只用于确认第 1 步：已经从 `config.openclaw.root` 读取到聊天记录。
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {visibleSessions.map((session) => (
              <article
                key={session.sessionId}
                className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-medium text-zinc-100">{session.title}</h3>
                    <p className="mt-2 break-all font-mono text-xs text-zinc-500">
                      {session.sessionKey}
                    </p>
                  </div>

                  <div className="text-left text-xs text-zinc-400 sm:text-right">
                    <p>更新时间：{formatTimestamp(session.updatedAt)}</p>
                    <p className="mt-1">开始时间：{formatTimestamp(session.startedAt)}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-300">
                  <span className="rounded-full border border-zinc-700 px-3 py-1">
                    messages: {session.messageCount}
                  </span>
                  <span className="rounded-full border border-zinc-700 px-3 py-1">
                    status: {session.status ?? 'unknown'}
                  </span>
                  <span className="rounded-full border border-zinc-700 px-3 py-1">
                    model: {session.model ?? 'unknown'}
                  </span>
                  <span className="rounded-full border border-zinc-700 px-3 py-1">
                    channel: {session.channel ?? 'unknown'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
