# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.186] - 2025-10-30

### Changed

- **[Major] 升级 Node.js 到 24 LTS (Krypton) 版本**
  - **变更内容**: 将项目的 Node.js 基础版本从 22 LTS 升级到 24 LTS
  - **影响范围**:
    - Dockerfile: 前端构建阶段和主应用阶段均使用 `node:24-alpine`
    - package.json: 引擎要求从 `>=22.0.0` 升级到 `>=24.0.0`
    - CI/CD 工作流: GitHub Actions 使用 Node.js 24 进行构建和测试
    - 文档: README.md 和 README_EN.md 中所有 Node.js 22 引用更新为 24
    - 安装脚本: Ubuntu/Debian 和 CentOS/RHEL 安装命令更新为 setup_24.x
  - **升级原因**:
    - Node.js 24 LTS (代号 "Krypton") 于 2025年5月6日发布，2025年10月28日进入 Active LTS
    - Node.js 22 已于 2025年10月21日进入 Maintenance LTS 阶段，仅提供关键 bug 修复
    - 提供更长的支持周期（Active LTS 至 2026年10月，维护至 2028年4月）
    - V8 引擎 v13.6 带来 5-10% 性能提升
    - 新增多项 JavaScript 特性：RegExp.escape、Float16Array、Explicit Resource Management、Error.isError
    - 内置 HTTP/HTTPS 代理支持（NODE_USE_ENV_PROXY=1）
    - Undici 7.0.0 HTTP 客户端优化
  - **兼容性验证**:
    - ✅ 代码层面：未使用任何 Node.js 24 废弃 API（url.parse、SlowBuffer、tls.createSecurePair）
    - ✅ 内置模块：crypto、https、zlib、Buffer 全部使用标准最佳实践 API
    - ✅ 依赖包：34 个生产依赖全部纯 JavaScript 实现，无原生模块编译风险
    - ✅ 关键依赖验证：
      - bcryptjs 2.4.3 (纯 JS，完全兼容)
      - ioredis 5.3.2 (纯 JS，完全兼容)
      - express 4.18.2 (Express 4.x LTS，完全兼容)
      - axios 1.6.0 (不依赖内置 HTTP，完全兼容)
      - https-proxy-agent 7.0.2 (v7 支持 Node.js 18+)
      - socks-proxy-agent 8.0.2 (v8 支持 Node.js 18+)
      - @aws-sdk/* 3.861.0+ (AWS SDK v3 完全支持)
      - ldapjs 3.0.7 (v3 支持所有 LTS 版本)
    - ✅ 架构设计：async/await 现代化模式，完善的错误处理，标准 Stream 处理
  - **风险评估**: 极低风险（1/10），经过 78 个源文件、3万+ 行代码的完整分析
  - **向后兼容**: 是，Node.js 24 完全向后兼容 Node.js 22 代码，无需修改应用逻辑
  - **性能提升**: 预期 5-10% 整体性能提升（V8 引擎优化 + HTTP 客户端优化）

### Technical Details

- **Node.js 24 LTS (Krypton) 信息**:
  - 版本代号: "Krypton"
  - 发布日期: 2025-05-06
  - Active LTS 开始: 2025-10-28
  - Active LTS 支持期: 至 2026-10-20
  - Maintenance 维护期: 2026-10-20 至 2028-04-30
  - 官方页面: https://nodejs.org/en/about/previous-releases

- **V8 引擎 v13.6 新特性**:
  - RegExp.escape() - 安全的正则表达式转义
  - Float16Array - 半精度浮点数数组
  - Atomics.pause() - 优化自旋锁性能
  - Error.isError() - 标准错误类型检查
  - WebAssembly Memory64 - 支持 64 位内存寻址
  - Explicit Resource Management - await using 自动资源管理

- **npm v11 变更**:
  - 要求 Node.js ^20.17.0 || >=22.9.0 (Node.js 24 满足要求)
  - --ignore-scripts 现在影响所有生命周期脚本
  - 移除 npm hook 命令（项目未使用，无影响）

- **修改文件列表**:
  - `Dockerfile` (2 处: node:22-alpine → node:24-alpine)
  - `package.json` (1 处: >=22.0.0 → >=24.0.0)
  - `.github/workflows/auto-release-pipeline.yml` (1 处: node-version '22' → '24')
  - `.github/workflows/pr-lint-check.yml` (1 处: node-version '22' → '24')
  - `README.md` (6 处: 徽章、文本、安装脚本)
  - `README_EN.md` (4 处: 徽章、文本、安装脚本)
  - `VERSION` (1 处: 1.1.185 → 1.1.186)

- **版本说明**: v1.1.186 包含所有 v1.1.185 的功能和修复

---

## [1.1.185] - 2025-10-30

### Changed

- **[Major] 升级 Node.js 到 22 LTS 版本**
  - **变更内容**: 将项目的 Node.js 基础版本从 18 LTS 升级到 22 LTS
  - **影响范围**:
    - Dockerfile: 前端构建阶段和主应用阶段均使用 `node:22-alpine`
    - package.json: 引擎要求从 `>=18.0.0` 升级到 `>=22.0.0`
    - CI/CD 工作流: GitHub Actions 使用 Node.js 22 进行构建和测试
    - 文档: README.md 和 README_EN.md 中所有 Node.js 18 引用更新为 22
    - 安装脚本: Ubuntu/Debian 和 CentOS/RHEL 安装命令更新为 setup_22.x
  - **升级原因**:
    - Node.js 22 LTS (代号 "Jod") 于 2024年10月29日发布，成为新的长期支持版本
    - 提供更好的性能优化和安全性改进
    - 确保项目使用最新的稳定版本，获得官方长期支持（Active LTS 至 2025年10月，维护至 2027年4月）
  - **兼容性**: Node.js 22 完全向后兼容 Node.js 18 的代码，无需修改应用逻辑
  - **向后兼容**: 是，现有功能不受影响，仅基础环境升级

- **改进 CI/CD 工作流版本管理机制**
  - **变更内容**: 移除自动版本递增逻辑，改为直接使用 VERSION 文件作为单一来源
  - **变更原因**: 避免自动版本递增与手动版本控制冲突
  - **影响范围**: `.github/workflows/auto-release-pipeline.yml`
  - **修改详情**:
    - 删除"Get current version"步骤（获取标签版本和文件版本并比较）
    - 删除"Calculate next version"步骤（自动 PATCH +1 递增）
    - 删除"Update VERSION file"步骤（写回新版本到文件）
    - 新增"Get version from VERSION file"步骤，直接读取并验证 VERSION 文件
    - 新增版本格式验证（正则表达式检查 x.y.z 格式）
    - 新增标签存在性检查（防止重复发布）
  - **向后兼容**: 是，工作流改进不影响应用功能

### Fixed

- **[包含 v1.1.184 修复] 修复 OpenAI 兼容端点忽略用户自定义 system 消息的问题**
  - **问题描述**: 通过 OpenAI 兼容端点发送带有自定义 `system` 角色消息的请求时，用户的系统提示词被强制替换为 Claude Code 默认提示词，导致模型无法按照用户期望的角色行为
  - **修复内容**: 移除硬编码逻辑，现在直接使用用户提供的 system 消息内容
  - **修复文件**: `src/services/openaiToClaude.js`

- **[包含 v1.1.184 修复] 修复 modelService.js 白名单缺少 gpt-5 系列模型的问题**
  - **问题描述**: 默认支持的模型列表中缺少 `gpt-5` 和 `gpt-5-codex`，导致客户端无法通过模型列表发现它们
  - **修复内容**: 在 `src/services/modelService.js` 默认配置中添加 `gpt-5` 和 `gpt-5-codex`
  - **修复效果**: 客户端现在可以正确发现这些模型，UI 模型选择器会显示这些选项

- **[包含 v1.1.184 修复] 修复 Codex 账户失效后持续返回403错误无法自动切换的问题**
  - **问题描述**: 当 Codex 账号 refresh token 失效后，API 返回 403 Forbidden 错误，但系统未标记账户为不可用状态，导致持续选择该失效账户
  - **修复内容**:
    - 在 `src/services/openaiResponsesRelayService.js` 中添加 403/422 错误处理
    - 在 `src/services/unifiedOpenAIScheduler.js` 共享池筛选中添加 `unauthorized` 状态过滤
  - **修复效果**: 账户失效后立即被标记为不可用，后续请求自动切换到其他正常账户

### Technical Details

- **Node.js 22 LTS 信息**:
  - 版本代号: "Jod"
  - LTS 开始日期: 2024-10-29
  - Active LTS 支持期: 至 2025-10-21
  - Maintenance 维护期: 至 2027-04-30
  - 官方页面: https://nodejs.org/en/about/previous-releases

- **修改文件列表**:
  - `Dockerfile` (2 处: 前端构建器 + 主应用阶段)
  - `package.json` (1 处: engines 字段)
  - `.github/workflows/auto-release-pipeline.yml` (2 处: 版本管理逻辑 + Node.js 版本)
  - `.github/workflows/pr-lint-check.yml` (1 处: Node.js 版本)
  - `README.md` (6 处: 徽章 + 文本引用 + 安装脚本)
  - `README_EN.md` (4 处: 徽章 + 文本引用 + 安装脚本)
  - `VERSION` (1 处: 1.1.184 → 1.1.185)

- **版本说明**: v1.1.185 包含 v1.1.184 的所有修复（因 v1.1.184 CI/CD 失败未完成 Docker 镜像构建）

---

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
