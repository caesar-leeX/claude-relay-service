# Changelog

本文档记录项目的重要变更历史。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### Bug Fixes

#### 修复 Codex (OpenAI-Responses) 账户 403 错误处理缺陷

**问题描述**
- 当 Codex 账户的 refresh token 失效时，API 返回 403 Forbidden 错误
- 系统未标记账户为不可用状态（unauthorized）
- 调度器持续选择该失效账户，导致所有请求持续返回 403
- 即使存在其他正常账户也无法自动切换

**根本原因**
1. `openaiResponsesRelayService.js` 只处理 401 错误，缺少 403/422 错误处理逻辑
2. `unifiedOpenAIScheduler.js` 共享池过滤条件不完整，缺少 `unauthorized` 状态检查

**修复内容**
- ✅ **src/services/openaiResponsesRelayService.js**
  - 行 199-230: 添加 403 (Forbidden) 错误处理（非流式响应）
  - 行 338-369: 添加 403 (Forbidden) 错误处理（catch 块）
  - 当检测到 403 错误时，自动调用 `markAccountUnauthorized()` 标记账户为不可用

- ✅ **src/services/unifiedOpenAIScheduler.js**
  - 行 445: 共享池筛选逻辑中添加 `account.status !== 'unauthorized'` 过滤条件
  - 与专属账户检查逻辑保持一致

**修复效果**
- 账户失效后立即被标记为 `status: 'unauthorized'` 和 `schedulable: false`
- 后续请求自动切换到其他正常账户
- 后台界面正确显示账户"不可调度"状态
- 触发 Webhook 异常通知（如果启用）

**影响范围**
- 账户类型: OpenAI-Responses (Codex)
- 向后兼容: ✅ 是，修复不影响现有功能
- 破坏性: ✅ 零破坏性，只添加新的错误处理分支

**技术细节**
- HTTP 401 Unauthorized: 缺少有效认证凭据
- HTTP 403 Forbidden: 服务器理解请求但拒绝执行（通常是凭据失效/权限不足）
- 业界标准实践：`if (status === 403 || status === 401)` 统一视为认证失败

**参考资料**
- GitHub 10+ 开源项目（MIT 许可证）采用相同模式
- 项目内其他服务的一致性对比（claudeConsoleRelayService、ccrRelayService）

**提交信息**
- Commit: fix: 修复 Codex 账户 403 错误未标记为 unauthorized 导致持续失败的问题
- Co-Authored-By: Claude <noreply@anthropic.com>

---

## 版本历史

_待补充：历史版本变更将在后续版本中记录_
