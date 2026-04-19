# OpenClaw Copilot

- [x] 读取 config.openclaw.root 下的聊天记录
- [ ] 页面左侧按照时间倒叙列出所有会话
- [ ] 可以通过鼠标选择其中一个会话，列出该会话的聊天记录
- [ ] 可以选择其中某些聊天记录，或者选择全部
- [ ] 选择记录后出现一个按钮 “Create Skill”
  - [ ] 点击后隐藏聊天记录, 出现两个输入框，分别是 name description
  - [ ] 输入后可以点击按钮 “Generate Skill Content”, 让AI生成完整的SKILL内容
  - [ ] 生成后用户可以在 textarea 中对生成的内容进行编辑
  - [ ] 也可以选中一段话，弹出一个输入框，输入修改意见，让AI结合上下文以及选中的内容以及修改意见，只修改选中的部分
  - [ ] 修改满意后，点击最下方的按钮，调用AI对SKILL进行合理拆分，拆分成SKILL标准格式，如果SKILL很小也可以不拆分
  - [ ] 点击保存按钮，将最终SKILL写入 config.openclaw.root 下的 available-skills 文件夹
- [ ] 再提供一个页面用于展示 available-skills enabled-skills
  - [ ] 可以对available-skills中的skill进行勾选，勾选后转移到enabled-skills, 再次勾选可以转移回来
  - [ ] 可以选择多个 skills, 出现按钮 "Merge Skill", 点击后通过AI进行合并，同时出现上面的Skill Editor, 支持选中某一段话添加修改意见，让AI修改选中的部分，确认无误后最终保存到 available-skills

## 当前实现状态

- 已完成第 1 步，只做了“读取 `config.openclaw.root` 下的聊天记录”以及一个最小验收页。
- 当前首页不是最终产品 UI，只是为了验证聊天记录已经成功读到。
- 下一步应继续做“左侧会话列表 + 选择会话后展示消息”，不要重做已有的数据读取层。

## 已实现文件

- `lib/openclaw/sessions.ts`
  - 服务端读取 OpenClaw 会话索引和 `.jsonl` 聊天记录。
  - 暂时导出 `getSessionsOverview()`。
- `app/page.tsx`
  - 当前为最小验收页。
  - 已设置 `export const dynamic = 'force-dynamic'`，保证按请求实时读取，不使用构建时快照。

## 数据来源

- 根目录来自 `config.ts` 中的 `config.openclaw.root`
- 当前实际读取路径：`<OPENCLAW_ROOT>/agents/main/sessions/`
- 使用的文件：
  - `sessions.json`：会话索引
  - `<sessionId>.jsonl`：单个会话聊天记录

## 重要约定

- 不要直接信任 `sessions.json` 里的 `sessionFile` 绝对路径。
- 当前实现是根据 `sessionId` 自行拼本地路径：`<sessionsDirectory>/<sessionId>.jsonl`
- 这样可以规避索引里 `/home/node/.openclaw/...` 与本机真实路径不一致的问题。

## 当前解析规则

- 只把 `type === "message"` 且 `role === "user" | "assistant"` 的记录计入可展示消息数。
- `content[]` 中只提取 `type === "text"` 的文本。
- 默认忽略这些记录类型：
  - `session`
  - `custom`
  - `model_change`
  - `thinking_level_change`
- 当前 `toolResult` 也没有进入展示统计。
- 会话标题 `title` 当前优先取第一条有意义的用户文本，取不到则回退到 `sessionKey`。

## 当前首页展示内容

- `OPENCLAW_ROOT`
- `sessions` 目录
- 会话总数
- 最近展示数量
- 最近更新时间
- 最近 12 个会话的简表：
  - `title`
  - `sessionKey`
  - `updatedAt`
  - `startedAt`
  - `messageCount`
  - `status`
  - `model`
  - `channel`

## 下一步建议

- 直接进入第 2 步：把当前首页改成两栏布局。
- 左侧：按 `updatedAt` 倒序列出全部会话。
- 右侧：点击会话后展示该会话消息。
- 建议在 `lib/openclaw/sessions.ts` 里补一个 `getSessionMessages(sessionId)`，复用已有解析逻辑。
- 第 2 步开始再引入 Client Component 处理选中态，尽量保持数据读取继续放在服务端。

## 已验证

- `pnpm lint` 通过
- `pnpm build` 通过

## 已知事项

- 构建时有一个已有警告：`config.ts` 被 `instrumentation.ts` 引用，而 `config.ts` 使用了 `process.cwd()`，因此会出现 Edge Runtime 警告。
- 这个警告不是本次第 1 步引入的问题，当前不影响构建通过。
