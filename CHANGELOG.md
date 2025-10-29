# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.184] - 2025-10-30

### Fixed

- **[Critical] 修复 OpenAI 兼容端点忽略用户自定义 system 消息的问题**
  - **问题描述**: 通过 OpenAI 兼容端点（`/api/v1/chat/completions` 或 `/openai/claude/v1/chat/completions`）发送带有自定义 `system` 角色消息的请求时，用户的系统提示词被强制替换为 Claude Code 默认提示词 ("You are Claude Code, Anthropic's official CLI for Claude.")，导致模型无法按照用户期望的角色行为
  - **根本原因**: `openaiToClaude.js` 中的 `convertRequest()` 方法包含硬编码逻辑，只保留包含 "You are currently in Xcode" 的系统消息，其他所有自定义系统消息都被忽略并替换为默认提示词
  - **代码位置**: `src/services/openaiToClaude.js` (Line 34-52)
  - **修复内容**:
    - 移除了 Xcode 特殊判断逻辑
    - 现在直接使用用户提供的 system 消息内容
    - 如果用户未提供 system 消息，则不设置该字段（而非强制添加默认值）
  - **影响范围**:
    - ✗ `/api/v1/chat/completions` (统一路由，使用 OpenAI 格式)
    - ✗ `/openai/claude/v1/chat/completions` (OpenAI-Claude 兼容路由)
    - ✓ `/api/v1/messages` (原生 Claude 端点不受影响)
  - **修复效果**:
    - 用户自定义的系统提示词（如客服角色、专家角色等）现在可以正常生效
    - Claude 会按照用户指定的角色和行为进行响应
    - 示例场景：发送 `{role: "system", content: "你是 Shopify 商店客服"}` 现在可以正确工作
  - **向后兼容**: 基本兼容，但行为变更：
    - 之前：所有请求都带有 Claude Code 默认提示词
    - 现在：只有用户明确提供 system 消息时才使用该消息
    - 如需保持原有行为，请在请求中明确包含 Claude Code 系统提示词

### Changed

- 改进 OpenAI 到 Claude 的格式转换逻辑，尊重用户的原始输入
- 优化系统提示词处理日志，更清晰地显示实际使用的提示词来源

### Technical Details

- 修改文件: `src/services/openaiToClaude.js` (Line 34-52)
- 修复前逻辑:
  ```javascript
  if (systemMessage && systemMessage.includes('You are currently in Xcode')) {
    claudeRequest.system = systemMessage  // 只保留 Xcode 消息
  } else {
    claudeRequest.system = claudeCodeSystemMessage  // 强制替换
  }
  ```
- 修复后逻辑:
  ```javascript
  if (systemMessage) {
    claudeRequest.system = systemMessage  // 直接使用用户消息
  }
  // 未提供则不设置
  ```

---

## [1.1.183] - 2025-10-30

### Fixed

- **[Critical] 修复 modelService.js 白名单缺少 gpt-5 系列模型的问题**
  - **问题描述**: 默认支持的模型列表中缺少 `gpt-5` 和 `gpt-5-codex`，导致 `/api/v1/models` 和 `/claude/v1/models` 端点不返回这些模型，客户端无法通过模型列表发现它们
  - **根本原因**: `modelService.js` 的 `getDefaultModels()` 方法中，OpenAI 模型列表没有包含 gpt-5 系列
  - **修复内容**:
    - 在 `src/services/modelService.js` 默认配置中添加 `gpt-5`（标准模型）
    - 在 `src/services/modelService.js` 默认配置中添加 `gpt-5-codex`（Codex CLI 专用模型）
  - **影响范围**: 所有通过 `/api/v1/models` 查询模型列表的客户端
  - **修复效果**:
    - 客户端现在可以正确发现 gpt-5 和 gpt-5-codex 模型
    - UI 模型选择器会显示这些模型选项
    - 与实际支持的功能保持一致（代码已支持 gpt-5，现在白名单也包含了）
  - **向后兼容**: 是，只是添加模型到白名单，不影响现有功能

- **[Critical] 修复 Codex (OpenAI-Responses) 账户失效后持续返回403错误无法自动切换的问题**
  - **问题描述**: 当 Codex 账号 refresh token 失效后，API 返回 403 Forbidden 错误，但系统未标记账户为不可用状态，导致调度器持续选择该失效账户，造成所有请求持续返回 403，即使存在其他正常账户也无法自动切换
  - **根本原因**:
    1. `openaiResponsesRelayService.js` 只处理了 401 错误，缺少 403/422 错误的处理逻辑
    2. `unifiedOpenAIScheduler.js` 共享池过滤条件不完整，缺少 `unauthorized` 状态检查
  - **修复内容**:
    - 在 `src/services/openaiResponsesRelayService.js` 中添加 403 (Forbidden) 和 422 (Unprocessable Entity) 错误处理
    - 当检测到 403/422 错误时，自动调用 `markAccountUnauthorized()` 标记账户为不可用
    - 在 `src/services/unifiedOpenAIScheduler.js` 共享池筛选逻辑中添加 `account.status !== 'unauthorized'` 过滤条件
  - **影响范围**: Codex (OpenAI-Responses) 账户类型
  - **修复效果**:
    - 账户失效后立即被标记为 `status: 'unauthorized'` 和 `schedulable: false`
    - 后续请求自动切换到其他正常账户
    - 后台界面正确显示账户"不可调度"状态
    - 触发 Webhook 异常通知（如果启用）
  - **向后兼容**: 是，修复不影响现有功能

### Changed

- 增强错误处理能力，覆盖更多认证失败场景（401/403/422）
- 统一 OpenAI-Responses 账户错误处理逻辑，与其他账户类型保持一致

### Technical Details

- 修改文件:
  - `src/services/openaiResponsesRelayService.js` (Line 254-312, 446-500)
  - `src/services/unifiedOpenAIScheduler.js` (Line 445)
- 错误码处理:
  - 401 Unauthorized: ✅ 已有处理 → ✅ 保持
  - 403 Forbidden: ❌ 未处理 → ✅ 新增处理
  - 422 Unprocessable Entity: ❌ 未处理 → ✅ 新增处理
  - 429 Rate Limit: ✅ 已有处理 → ✅ 保持

---

## [1.1.182] - 2025-10-19

### Added

- Codex (OpenAI-Responses) 标准 OpenAI 格式支持
  - 自动转换 `messages` 字段到 Codex 原生的 `input` 字段
  - 允许使用标准 OpenAI API 格式调用 Codex 端点

### Changed

- 仓库迁移: 从原作者仓库迁移到新维护仓库
  - Docker Hub: `weishaw` → `caesarlee888777`
  - GitHub: `Wei-Shaw` → `caesar-leeX`

---

## Historical Versions

For older version history, please refer to the [GitHub Releases](https://github.com/caesar-leeX/claude-relay-service/releases) page.
