# 项目审查待处理项

## 高优先级
- [x] 移除 `instrumentation.ts:1-5` 中对 `config` 的 `console.log`，避免将 `AI_API_KEY`、`OPENCLAW_ROOT` 等敏感配置写入服务端日志。

## 中优先级
- [x] 修复 `lib/skills.ts:592-605` 与 `app/api/skills/save/route.ts:18-24` 的保存逻辑：重复保存 skill 时需要清理旧目录中的遗留文件，避免磁盘内容与编辑器内容不一致。
- [x] 修复 `app/_components/sessions-workspace.tsx:169-212`、`242-249`、`338-386` 的状态失配问题：选中消息变化后应使旧的生成结果失效，避免把旧选择生成的 skill 误当成当前选择的结果继续保存。
- [x] 修复 `app/_components/skills-workspace.tsx:228-237`、`239-251`、`315-336` 的合并状态复用问题，避免在切换所选 skills 后继续复用上一轮合并草稿、定稿结果或保存结果。
- [x] 加强 `app/api/skills/generate/route.ts:45-52`、`app/api/skills/rewrite-selection/route.ts:55-65`、`app/api/skills/finalize/route.ts:68-76` 与 `lib/skills.ts:68-101` 的请求体验证，避免非法 `selectedMessages` 导致 `toISOString()` 抛错并直接返回 500。
- [x] 提升 `lib/openclaw/sessions.ts:601-623` 的容错性，为 `sessions.json` 解析失败和单个 session 文件读取失败提供降级处理，避免一个坏文件拖垮整个首页。
- [x] 调整 `lib/skills.ts:447-467` 的批量移动逻辑，避免 `Promise.all(rename(...))` 在部分失败时留下半完成状态。
- [x] 为所有 AI 路由增加输入规模限制，控制 `selectedMessages`、`fullContent`、`sourcesContext` 的长度，避免上下文超限、超时或成本失控。
- [x] 为 `/api/skills/*` 路由补充鉴权或访问限制；当前仓库未看到 `middleware.ts`，而这些接口具备读会话、写本地文件、触发 AI 调用的能力，若服务暴露到外网会有明显安全风险。

## 低优先级
- [x] 修复 `app/page.tsx:80-83` 的顶部摘要显示错误，当前展示的是选中会话标题，但时间却固定取 `sessions[0]?.updatedAt`。
- [ ] 优化 `app/_components/selection-rewrite-dialog.tsx:37-40`、`54-60`、`91-106` 的交互；改写提交中不应允许用户误以为已取消，但请求返回后仍悄悄改写正文。
