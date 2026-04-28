## ADDED Requirements

### Requirement: 读取完整 skill 文件集
系统 SHALL 在打开已有 skill 进行查看或编辑时提供该 skill 目录下的完整文件集，包括 `SKILL.md` 和任意子目录中的文件，并使用相对路径标识每个文件，同时展示文件大小、可编辑状态和只读原因。

#### Scenario: 打开包含子目录的 skill
- **WHEN** 用户打开一个包含 `SKILL.md` 和 `resources/example.md` 的 skill
- **THEN** 系统展示两个文件路径并允许用户查看对应内容

#### Scenario: 文件路径稳定排序
- **WHEN** 系统展示复杂 skill 的文件列表
- **THEN** 文件 SHALL 按稳定顺序展示，且 `SKILL.md` SHALL 作为默认选中文件

#### Scenario: 展示文件元数据
- **WHEN** 系统展示复杂 skill 的文件列表
- **THEN** 每个文件 SHALL 显示文件大小和可编辑状态

#### Scenario: 展示只读原因
- **WHEN** 文件因二进制内容、文件过大、不支持的编码或保护规则无法编辑
- **THEN** 系统 SHALL 显示对应的只读原因分类

### Requirement: 编辑多文件 skill 中的文本文件
系统 SHALL 允许用户在同一个 skill 编辑会话中切换文本文件并编辑当前文件内容，文件切换不得丢失其他文件尚未保存的修改。

#### Scenario: 切换文件后保留修改
- **WHEN** 用户修改 `SKILL.md` 后切换到 `resources/example.md`
- **THEN** `SKILL.md` 的草稿修改 SHALL 保留在当前编辑会话中

#### Scenario: 当前文件路径可见
- **WHEN** 用户正在编辑复杂 skill 的某个文件
- **THEN** 系统 SHALL 明确显示当前正在编辑的相对文件路径

#### Scenario: 只读文件不可编辑
- **WHEN** 用户选择一个只读文件
- **THEN** 系统 SHALL 展示内容预览或占位说明，并禁用正文编辑

### Requirement: 新增和删除复杂 skill 文件
系统 SHALL 允许用户在复杂 skill 编辑会话中新增文本文件和删除已有文件，并在保存前将这些变更保留为草稿状态。

#### Scenario: 新增子目录文件
- **WHEN** 用户新增路径为 `references/example.md` 的文本文件并填写内容
- **THEN** 系统 SHALL 将该文件加入当前 skill 草稿并允许继续编辑

#### Scenario: 删除文件前保持草稿状态
- **WHEN** 用户删除 `references/example.md`
- **THEN** 系统 SHALL 从当前草稿中标记或移除该文件，但在用户保存前不改变磁盘上的原始 skill

#### Scenario: 禁止保存无入口文件草稿
- **WHEN** 用户删除或移除 `SKILL.md` 后尝试保存
- **THEN** 系统 SHALL 拒绝保存并提示最终结果必须包含 `SKILL.md`

### Requirement: 保存完整文件草稿
系统 SHALL 在保存复杂 skill 时提交完整文件草稿并一次性写回目标 skill 目录，确保 `SKILL.md` 与子目录文件作为同一次更新生效。

#### Scenario: 保存子目录文件修改
- **WHEN** 用户修改 `resources/example.md` 并保存 skill
- **THEN** 系统 SHALL 将该文件的新内容写入原 skill 目录中的相同相对路径

#### Scenario: 保存时保留未修改文件
- **WHEN** 用户只修改复杂 skill 中的一个文件并保存
- **THEN** 系统 SHALL 保留同一 skill 草稿中的其他文件内容

#### Scenario: 保存新增和删除结果
- **WHEN** 用户在同一草稿中新增 `references/new.md` 并删除 `references/old.md` 后保存
- **THEN** 系统 SHALL 在目标 skill 目录中写入新增文件并移除被删除文件

#### Scenario: 保存失败时不留下半更新目录
- **WHEN** 保存完整文件草稿过程中发生写入失败
- **THEN** 系统 SHALL 保持原 skill 目录可用，并返回明确错误信息

### Requirement: 校验复杂 skill 文件路径和入口文件
系统 SHALL 在保存复杂 skill 前校验目录名、相对文件路径和入口文件，拒绝绝对路径、空路径、`.`、`..` 路径段，以及缺少 `SKILL.md` 的文件草稿。

#### Scenario: 拒绝路径穿越
- **WHEN** 保存请求包含 `../secret.md` 文件路径
- **THEN** 系统 SHALL 拒绝保存并返回校验错误

#### Scenario: 缺少入口文件
- **WHEN** 保存请求不包含 `SKILL.md`
- **THEN** 系统 SHALL 拒绝保存并提示最终结果必须包含 `SKILL.md`

#### Scenario: 拒绝重复文件路径
- **WHEN** 保存请求包含多个归一化后相同的文件路径
- **THEN** 系统 SHALL 拒绝保存并返回校验错误

### Requirement: 保持单文件 skill 编辑兼容
系统 SHALL 保持仅包含 `SKILL.md` 的 skill 的现有查看、编辑、重置和保存体验，不要求用户理解多文件编辑模型。

#### Scenario: 编辑单文件 skill
- **WHEN** 用户编辑只包含 `SKILL.md` 的 skill
- **THEN** 系统 SHALL 继续显示 `SKILL.md` 编辑器并支持保存修改

### Requirement: AI 生成和更新多文件 skill 草稿
系统 SHALL 支持 AI 基于聊天记录、当前 skill 文件集和用户提示词生成或更新复杂 skill，并以多文件草稿形式返回结果供用户审查。

#### Scenario: 基于聊天记录生成复杂 skill
- **WHEN** 用户选择聊天记录并请求 AI 生成复杂 skill
- **THEN** 系统 SHALL 允许 AI 返回包含 `SKILL.md` 和子目录文件的多文件草稿

#### Scenario: 基于聊天记录更新已有复杂 skill
- **WHEN** 用户选择一个已有复杂 skill、聊天记录和更新提示词
- **THEN** 系统 SHALL 将当前完整文件集提供给 AI，并返回更新后的多文件草稿预览

#### Scenario: AI 多文件结果保存前可审查
- **WHEN** AI 返回多文件生成或更新结果
- **THEN** 系统 SHALL 在写入磁盘前展示所有新增、修改和删除的文件供用户审查

### Requirement: 选区改写作用于当前文件
系统 SHALL 将选区 AI 改写应用到当前选中的文本文件，并在切换文件时清理旧文件的选区和改写预览；当用户提示明确要求跨文件调整时，系统 SHALL 返回多文件草稿预览而不是直接写盘。

#### Scenario: 改写当前子文件
- **WHEN** 用户在 `resources/example.md` 中选择文本并确认 AI 改写预览
- **THEN** 系统 SHALL 只替换 `resources/example.md` 中的对应选区

#### Scenario: 切换文件清理选区状态
- **WHEN** 用户已有选区改写预览并切换到另一个文件
- **THEN** 系统 SHALL 清理旧选区和预览，避免改写应用到错误文件

#### Scenario: 选区提示触发跨文件修改
- **WHEN** 用户选择当前文件的一段文本，并在提示词中要求同步调整相关子文件
- **THEN** 系统 SHALL 返回包含受影响文件的多文件草稿预览
