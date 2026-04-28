## Why

当前 skill 编辑器只能直接编辑并保存 `SKILL.md`，无法维护包含子文件夹和附属资源文件的复杂 skill，例如 `.agents/skills/metastar-health`。这会导致用户在 Web 界面中更新复杂 skill 时只能修改入口文档，无法查看、编辑或安全保存其余文件，降低 skill 管理能力的一致性。

## What Changes

- 在 skill 编辑体验中支持多文件 skill，展示 `SKILL.md` 以及子目录中的附属文件。
- 允许用户选择、查看、新增、编辑、删除并保存复杂 skill 的文本文件，同时保持现有单文件 skill 编辑流程可用。
- 展示每个文件的大小、可编辑状态和只读原因，帮助用户理解哪些文件可由编辑器安全修改。
- 保存复杂 skill 时基于完整文件草稿写回目标 skill 目录，并保留路径校验与原子替换/回滚语义。
- 将现有 AI 生成、基于聊天记录更新、选中范围 + 提示词改写能力扩展到多文件 skill，允许 AI 生成或修改复杂 skill 的多个文件。
- 对不可直接编辑或不适合编辑的文件给出清晰反馈，避免静默丢失子文件内容。

## Capabilities

### New Capabilities
- `complex-skill-editing`: 覆盖在 skill 管理界面中读取、展示、新增、删除、AI 生成/改写、编辑和保存包含子文件夹的复杂 skill。

### Modified Capabilities

## Impact

- 影响 `lib/skills.ts` 中 skill 读取、校验、保存和更新逻辑。
- 影响 `/api/skills/update`、`/api/skills/generate-update`、`/api/skills/rewrite-selection`、`/api/skills/finalize` 或新增相关 API 的请求/响应结构。
- 影响 `app/_components/skills-workspace.tsx`、`app/_components/skill-content-editor.tsx` 等编辑 UI。
- 可能需要补充多文件 skill 的单元测试或集成验证，覆盖子目录路径、新增/删除文件、AI 多文件输出、保存回滚和现有单文件兼容行为。
