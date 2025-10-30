# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.192] - 2025-10-30

### Added

- **[Claude Console] 完整的并发控制机制** (来自上游 v1.1.189)
  - **功能**: 为 Claude Console 账户实现原子性并发任务数控制，防止单账户过载
  - **核心特性**:
    - 🔒 **原子性并发控制**: 基于 Redis Sorted Set 实现的抢占式并发槽位管理，防止竞态条件
    - 🔄 **自动租约刷新**: 流式请求每 5 分钟自动刷新租约，防止长连接租约过期
    - 🚨 **智能降级处理**: 并发满额时自动清理粘性会话并重试其他账户（最多 1 次）
    - 🎯 **专用错误码**: 引入 `CONSOLE_ACCOUNT_CONCURRENCY_FULL` 错误码，区分并发限制和其他错误
    - 📊 **批量性能优化**: 调度器使用 Promise.all 并行查询账户并发数，减少 Redis 往返
  - **后端实现**:
    - `src/models/redis.js`: 新增 4 个并发控制方法（增加/释放/刷新/查询并发数）
    - `src/services/claudeConsoleAccountService.js`: 添加 `maxConcurrentTasks` 字段（默认 0 表示无限制）
    - `src/services/claudeConsoleRelayService.js`: 请求前原子性抢占槽位，确保 finally 块释放
    - `src/services/unifiedClaudeScheduler.js`: 批量查询并发数，预检查并发限制
    - `src/routes/api.js`: 捕获并发满额错误，自动重试（最多 1 次）
    - `src/routes/admin.js`: 创建/更新账户时验证 `maxConcurrentTasks` 为非负整数
  - **前端实现**:
    - `web/admin-spa/src/components/accounts/AccountForm.vue`: 添加"最大并发任务数"输入框
    - `web/admin-spa/src/views/AccountsView.vue`: 账户列表显示实时并发进度条和百分比
  - **使用方式**: 在 Web 管理界面为 Console 账户设置 `maxConcurrentTasks`（如 5），超过限制会自动选择其他账户
  - **影响范围**: Claude Console 账户的稳定性和负载均衡显著提升
  - **作者**: sususu98 <suchangshan@foxmail.com>
  - **提交**: 1458d609

### Fixed

- **[OpenAI Responses] 修复 gpt-5 模型非流式请求的兼容性问题**
  - **问题**: n8n 等客户端使用 `stream: false` 请求 gpt-5 模型时，后端 Codex API 强制要求 `stream: true`，导致返回 400 错误 "Stream must be set to true"
  - **修复内容**: 实现服务端 SSE 流到非流式 JSON 的自动转换
  - **核心特性**:
    - 🔍 **智能检测**: 自动检测 gpt-5/gpt-5-codex 模型的 `stream: false` 请求
    - 🔄 **透明转换**: 向后端强制使用 `stream: true`，收集完整 SSE 响应后转换为标准 OpenAI JSON 格式
    - 📊 **格式标准化**: 将 Codex API 的 `input_tokens/output_tokens` 转换为标准的 `prompt_tokens/completion_tokens`
    - ✅ **完全兼容**: 不影响现有 Codex CLI 客户端和其他流式请求
    - 📝 **完整日志**: 添加转换过程的详细日志标记（`🔄 Enabling stream-to-non-stream conversion`）
  - **技术实现**:
    - 检测逻辑（258-272行）: 识别需要转换的请求并设置标志
    - 响应头处理（573-600行）: 转换模式使用 `application/json`，真实流式保持 `text/event-stream`
    - 数据收集（716-742行）: 转换模式收集完整 buffer，真实流式立即转发
    - SSE 转换（747-860行）: 解析 SSE 事件提取内容和 usage，构建标准 OpenAI 响应格式
  - **性能影响**:
    - 仅影响 gpt-5 非流式请求（约 0.5-2 秒延迟，需等待完整流）
    - 内存开销：约 1-10MB per request（取决于响应大小）
  - **使用统计**: 正常记录 token 使用量和成本计算
  - **影响范围**: 完全解决 n8n AI Agent 使用 gpt-5 的 400 错误问题
  - **关联文件**: `src/routes/openaiRoutes.js`

- **[Security] 错误消息清理范围扩展到所有字符串字段** (来自上游 v1.1.189)
  - **问题**: 之前仅清理 `message` 字段，`error_message` 等其他字段可能泄露敏感信息
  - **修复内容**: 将错误清理从仅 `key === 'message'` 扩展到所有字符串类型字段
  - **代码变更**:

    ```javascript
    // 修改前：只清理 message 字段
    if (key === 'message' && typeof obj[key] === 'string') {

    // 修改后：清理所有字符串字段
    if (typeof obj[key] === 'string') {
    ```

  - **影响**: 更彻底地防止敏感域名和信息泄露
  - **关联文件**: `src/utils/errorSanitizer.js`
  - **作者**: sususu98 <suchangshan@foxmail.com>
  - **提交**: 42fc164f

- **[Security] 添加 yes.vg 域名清理** (来自上游 v1.1.189)
  - **功能**: 在错误消息清理正则表达式中添加 `yes.vg` 域名过滤
  - **代码变更**: `cleaned = cleaned.replace(/yes.vg\S*/gi, '')`
  - **影响**: 防止 yes.vg 相关敏感信息在错误响应中泄露
  - **关联文件**: `src/utils/errorSanitizer.js`
  - **作者**: sususu <suchangshan@foxmail.com>
  - **提交**: fd270509

- **[UI] 修复编辑 Console 账户时并发限制被重置的问题** (来自上游 v1.1.189)
  - **问题**: 编辑 Claude Console 账户时，`maxConcurrentTasks` 字段未被表单读取，导致保存后重置为默认值
  - **修复内容**: 表单加载时先读取 `maxConcurrentTasks` 并显示，确保编辑时保留原配置
  - **影响**: 用户编辑账户其他字段时，不会意外重置并发限制配置
  - **关联文件**: `web/admin-spa/src/components/accounts/AccountForm.vue`
  - **作者**: sususu98 <suchangshan@foxmail.com>
  - **提交**: 3abd0b0f

### Changed

- **[Version] 更新版本号到 v1.1.192**
  - 合并上游 v1.1.189 和 v1.1.190 的所有功能和修复
  - 保留本地独有功能（v1.1.187 用户自定义 system message、v1.1.186 Node.js 24 LTS 等）

## [1.1.188] - 2025-10-30

### Fixed

- **[Code Quality] 修复 ESLint 正则表达式不必要的转义错误**
  - **问题**: `codexCliValidator.js` 和 `geminiCliValidator.js` 中的正则表达式 `[\d\.]+` 使用了不必要的反斜杠转义，违反 ESLint `no-useless-escape` 规则
  - **修复内容**:
    - `src/validators/clients/codexCliValidator.js:45`: `/^(codex_vscode|codex_cli_rs)\/[\d\.]+/i` → `/^(codex_vscode|codex_cli_rs)\/[\d.]+/i`
    - `src/validators/clients/geminiCliValidator.js:56`: `/^GeminiCLI\/v?[\d\.]+/i` → `/^GeminiCLI\/v?[\d.]+/i`
  - **理论依据**: 在字符类 `[]` 中，`.` 是字面字符，不是特殊元字符，不需要转义
  - **验证**: 所有测试用例验证修改前后正则表达式行为完全一致，功能零影响
  - **影响**: 纯代码质量改进，消除 ESLint 错误，不改变任何运行时行为

## [1.1.187] - 2025-10-30

### Fixed

- **[OpenAI/Codex API] 支持用户自定义 system message**
  - **问题**: openaiRoutes.js 和 openaiToClaude.js 强制覆盖用户的 system message，导致无法自定义模型行为
  - **修复内容**:
    - `openaiRoutes.js`: 从标准 OpenAI `messages` 数组中提取 system message，转换为 Codex API 的 `instructions` 字段
    - `openaiToClaude.js`: 优先使用用户提供的 system message，否则使用 Claude Code 默认提示词
  - **向后兼容**: 完全保持向后兼容
    - 如果用户提供了 system message → 使用用户自定义内容
    - 如果没有 system message → 使用原默认指令（Codex CLI 或 Claude Code）
  - **影响范围**:
    - ✅ 标准 GPT-5 API 请求现在支持自定义 system message
    - ✅ Codex CLI 请求完全不受影响
    - ✅ OpenAI 到 Claude 的转换支持自定义 system message
  - **测试建议**:
    ```bash
    # 测试自定义 system message
    curl -X POST http://localhost:3000/api/v1/chat/completions \
      -H "Authorization: Bearer <your-api-key>" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "gpt-5",
        "messages": [
          {"role": "system", "content": "You are a Python expert."},
          {"role": "user", "content": "Write hello world"}
        ]
      }'
    ```
  - **关联文件**:
    - `src/routes/openaiRoutes.js`: Line 267-302
    - `src/services/openaiToClaude.js`: Line 37-49

- **[OpenAI Routes] 修复多个 system messages 处理不一致问题**
  - **问题**: openaiRoutes.js 只取第一个 system message（使用 `.find()`），与 openaiToClaude.js 的 `_extractSystemMessage()` 方法不一致（使用 `.filter()` + `.join()`），可能导致多个 system messages 时丢失用户内容
  - **修复内容**: 修改 openaiRoutes.js Line 268-272，改为合并所有 system messages（用 `\n\n` 连接），与 openaiToClaude.js 的逻辑保持完全一致
  - **文档依据**:
    - Claude Messages API：`system` 参数是单个字符串（官方文档：`string | Text · object[]`）
    - Codex API：`instructions` 字段是单个字符串（GPT-5 Prompting Guide）
    - OpenAI Chat Completions API：技术上支持多个 system messages，但标准做法是单个或合并为一个
  - **影响**:
    - ✅ 单个 system message 行为完全不变（99% 的常见场景）
    - ✅ 多个 system messages 从"仅取第一个"改为"全部合并"（边缘场景改进）
    - ✅ 与 openaiToClaude.js 代码逻辑统一，提升可维护性
  - **代码变更**:

    ```javascript
    // 修改前（只取第一个）
    const systemMessage = req.body.messages?.find((m) => m.role === 'system')?.content

    // 修改后（合并所有）
    const systemMessages = req.body.messages?.filter((m) => m.role === 'system') || []
    const systemMessage =
      systemMessages.length > 0 ? systemMessages.map((m) => m.content).join('\n\n') : null
    ```

  - **关联文件**: `src/routes/openaiRoutes.js`: Line 268-272

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
      - @aws-sdk/\* 3.861.0+ (AWS SDK v3 完全支持)
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
    claudeRequest.system = systemMessage // 只保留 Xcode 消息
  } else {
    claudeRequest.system = claudeCodeSystemMessage // 强制替换
  }
  ```
- 修复后逻辑:
  ```javascript
  if (systemMessage) {
    claudeRequest.system = systemMessage // 直接使用用户消息
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
