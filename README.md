# OpenClaw Copilot

- [x] 读取 config.openclaw.root 下的聊天记录
- [x] 页面左侧按照时间倒叙列出所有会话
- [x] 可以通过鼠标选择其中一个会话，列出该会话的聊天记录
- [x] 可以选择其中某些聊天记录，或者选择全部
- [x] 选择记录后出现一个按钮 “Create Skill”
  - [x] 点击后隐藏聊天记录, 出现两个输入框，分别是 name description
  - [x] 输入后可以点击按钮 “Generate Skill Content”, 让AI生成完整的SKILL内容
  - [x] 生成后用户可以在 textarea 中对生成的内容进行编辑
  - [ ] 也可以选中一段话，弹出一个输入框，输入修改意见，让AI结合上下文以及选中的内容以及修改意见，只修改选中的部分
  - [ ] 修改满意后，点击最下方的按钮，调用AI对SKILL进行合理拆分，拆分成SKILL标准格式，如果SKILL很小也可以不拆分
  - [ ] 点击保存按钮，将最终SKILL写入 config.openclaw.root 下的 available-skills 文件夹
- [ ] 再提供一个页面用于展示 available-skills enabled-skills
  - [ ] 可以对available-skills中的skill进行勾选，勾选后转移到enabled-skills, 再次勾选可以转移回来
  - [ ] 可以选择多个 skills, 出现按钮 "Merge Skill", 点击后通过AI进行合并，同时出现上面的Skill Editor, 支持选中某一段话添加修改意见，让AI修改选中的部分，确认无误后最终保存到 available-skills

## 当前实现状态

- 已完成第 1 步、第 2 步，以及 `Create Skill` 的首轮编辑流。
- 当前首页已经是“两栏工作台”：
  - 左侧按 `updatedAt` 倒序展示全部会话。
  - 右侧展示当前选中会话的完整时间线。
- 当前 UI 已收敛为黑白直角风格，左右两栏均为固定高度内部滚动。
- 当前右侧不再只展示普通文本消息，而是尽量保留完整会话上下文，便于后续做 skill 总结。
- 当前右侧时间线已支持逐条勾选、全选、清空选择，并在有选择时显示 `Create Skill` 按钮。
- 当前点击 `Create Skill` 后会切换到 `Skill Editor`，隐藏原始时间线并保留当前选择。
- 当前 `Skill Editor` 已支持：
  - 编辑 `name`
  - 编辑 `description`
  - 点击 `Generate Skill Content`
  - 调用 AI 基于已选时间线记录生成完整 SKILL 内容
  - 在下方 textarea 中继续手动编辑生成结果
  - 点击 `Back to Timeline` 返回时间线继续调整勾选

## 已实现文件

- `lib/openclaw/sessions.ts`
  - 服务端读取 OpenClaw 会话索引和 `.jsonl` 聊天记录。
  - 当前已导出：
    - `getSessionsOverview()`
    - `getSessionMessages(sessionId)`
  - 已支持把单个会话解析成完整时间线。
- `app/page.tsx`
  - 当前为首页 Server Component。
  - 负责按请求读取会话列表、根据 `searchParams.session` 读取当前选中会话。
  - 已设置 `export const dynamic = 'force-dynamic'`，保证按请求实时读取，不使用构建时快照。
- `app/_components/sessions-workspace.tsx`
  - 当前首页的 Client Component 工作台。
  - 负责左侧点击切换会话、右侧展示完整时间线。
  - 已支持时间线记录多选 / 全选 / 清空选择。
  - 已支持 `Create Skill` 编辑态、`name/description` 输入、内容生成、textarea 编辑与返回时间线。
- `app/api/skills/generate/route.ts`
  - 新增服务端生成接口。
  - 接收 skill 基础信息与已选时间线记录。
  - 调用 AI 生成完整 SKILL 内容并返回给前端编辑区。
- `app/layout.tsx`
  - 已切换为 Geist / Geist Mono 字体。
- `app/globals.css`
  - 已补充黑白风格与滚动条样式。

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

- `messageCount` 仍然只统计可读的普通对话消息：
  - `type === "message"`
  - `role === "user" | "assistant"`
  - 且 `content[]` 里存在可提取的 `text`
- 右侧时间线当前会尽量保留所有已知类型，不再只展示普通聊天文本。
- 当前已纳入展示的记录/内容类型包括：
  - 顶层记录：
    - `session`
    - `model_change`
    - `thinking_level_change`
    - `custom`
    - `message`
  - `message.role`：
    - `user`
    - `assistant`
    - `toolResult`
  - `message.content[]`：
    - `text`
    - `thinking`
    - `toolCall`
- 对于未来未知的顶层记录类型或未知的 `content[]` 类型，当前实现会回退为原始 JSON 文本展示，避免丢失信息。
- 会话标题 `title` 当前优先取第一条有意义的用户文本，取不到则回退到 `sessionKey`。

## 当前首页展示内容

- 顶部一行摘要：
  - 应用标题
  - 会话总数
  - 当前选中会话标题
  - 最近更新时间
- 左侧会话列表：
  - 全部会话
  - 按 `updatedAt` 倒序
  - 可点击切换
  - 展示 `title / sessionKey / messageCount / channel / updatedAt`
- 右侧当前会话详情：
  - 会话标题与 `sessionKey`
  - `messageCount / timeline entries / status / model / startedAt`
  - 完整时间线：
    - user
    - assistant
    - thinking
    - tool call
    - tool result
    - session / custom / model change / thinking level 等事件

## 下一步建议

- 继续保证“选中的记录”包含完整时间线项，而不是只限普通聊天文本。
- 当前已具备完整生成与手动编辑链路；下一步优先补“选中某段内容 + 输入修改意见 + 仅重写选中部分”。
- 这样后续生成 / 修改 skill 时，AI 仍然可以同时参考：
  - 用户原始需求
  - assistant 的处理过程
  - tool call / tool result
  - 其他上下文事件
- 之后再接“最终拆分成 SKILL 标准格式”和“保存到 available-skills”。
- 数据读取仍尽量继续放在服务端；选择态与交互态放在 Client Component。

## 已验证

- `pnpm lint` 通过
- `pnpm build` 通过

## 已知事项

- 当前未发现阻塞继续开发的问题。
- README 早期提到的 `config.ts` / Edge Runtime 警告说明已过时：本轮 `pnpm build` 未出现该警告。
