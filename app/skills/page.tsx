import { connection } from 'next/server'

import SkillsWorkspace from '@/app/_components/skills-workspace'
import { getSkillsLibrary } from '@/lib/skills'

export default async function SkillsPage() {
  await connection()

  const result = await getSkillsLibrary()

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

  return (
    <div className="h-dvh overflow-hidden bg-white px-4 py-4 text-black sm:px-6">
      <main className="mx-auto flex h-full min-h-0 w-full max-w-[1680px] flex-col gap-4">
        <SkillsWorkspace
          availableSkills={result.data.availableSkills}
          enabledSkills={result.data.enabledSkills}
        />
      </main>
    </div>
  )
}
