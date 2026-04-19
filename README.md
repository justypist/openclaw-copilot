# OpenClaw Copilot

- [ ] 读取 config.openclaw.root 下的聊天记录
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