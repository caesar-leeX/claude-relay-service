# Changelog

本文档记录项目的重要变更历史。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

---

## [2.0.9] - 2025-11-07

### Fixed

#### Claude Code Native API 认证失败修复（Critical）

- **修复 v2.0.8 引入的 Anthropic 认证失败问题**
  - 问题描述: v2.0.8 的 P1 优先级实现导致使用自定义 system message 时返回错误：`"This credential is only authorized for use with Claude Code"`
  - 根本原因: v2.0.8 忽略了 **Anthropic Claude Code OAuth 凭据的认证约束（P0 级别）**
  - 技术分析:
    - Anthropic Claude Code OAuth 凭据要求请求必须包含 Claude Code system prompt
    - v2.0.8 在用户有自定义 system 时不注入任何 prompt（P1 优先级）
    - 导致发送: `system: ["You are a helpful assistant"]` → ❌ 缺少 Claude Code prompt → 认证失败
  - 受影响版本: v2.0.8
  - 受影响场景: 所有使用自定义 system message 的请求
  - 修复位置: `src/services/claudeRelayService.js` Line 522-580
  - 修复方案: **前置注入模式** - 回滚到 v2.0.7 的正确行为 + 重新定义优先级系统
  - 新的优先级定义:
    - **P0（技术约束 - 最高）**: Claude Code OAuth 凭据要求必须包含 Claude Code prompt（Anthropic API 认证要求）
    - **P1（用户优先）**: 用户有 system → 前置注入 Claude Code prompt + 保留用户的
      - 发送: `[claudeCodePrompt, ...userSystemPrompts]`
      - 效果: ✅ 满足认证要求（P0） + ✅ 保留用户内容（P1）
    - **P2（默认）**: 用户无 system → 仅注入 Claude Code prompt
    - **P3（禁用）**: 配置禁用 → 不注入（⚠️ 可能导致认证失败）
  - 修复后行为:
    ```javascript
    // 场景 1: 用户有自定义 system
    请求: { system: "You are a helpful assistant" }
    发送: { system: [
      { type: 'text', text: 'You are Claude Code, Anthropic\'s official CLI for Claude.', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'You are a helpful assistant' }
    ]}
    结果: ✅ 认证通过

    // 场景 2: 用户无 system
    请求: { messages: [...] }
    发送: { system: [{ type: 'text', text: 'You are Claude Code...', cache_control: { type: 'ephemeral' } }] }
    结果: ✅ 认证通过
    ```
  - 关键证据:
    - commit `dabf3bf` (2025-07-22): "解决了 'This credential is only authorized for use with Claude Code' 错误" - 通过 claudeCodeHeadersService 管理 headers
    - v2.0.7 行为: 强制前置注入 `[claudeCodePrompt, userSystemPrompt]` - ✅ 认证通过
    - v2.0.8 行为: 用户有 system 时不注入 - ❌ 认证失败
  - 为什么 v2.0.8 的设计是错误的:
    - ❌ 将两个不同场景混为一谈:
      - `openaiToClaude.js` - 格式转换层，无 OAuth 认证约束
      - `claudeRelayService.js` - OAuth 凭据层，有认证约束（P0）
    - ❌ "纯粹的 P1 优先级"理论正确，但技术上不可行（违反 P0 约束）
  - 破坏性: 无（修复 v2.0.8 的 bug，回到 v2.0.7 的正确行为）
  - 兼容性: 完全兼容
  - 相关 commit: `3ef616e` (v2.0.8 - 错误), `21bc252` (v2.0.7 - 正确), `dabf3bf` (headers 管理)
  - 相关文档:
    - [06-behavior-analysis.md](./prompt-management/06-behavior-analysis.md) - 行为分析
    - [prompt-management-plan.md](./prompt-management/prompt-management-plan.md) - 计划文档

---

## [2.0.8] - 2025-11-06

### Fixed

#### Claude Code Native API P1 优先级实现不一致修复（Critical）

- **修复 claudeRelayService.js 未正确实现三级优先级系统的问题**
  - 问题原因: v2.0.0 提交（5bc4211）声称"三级优先级系统应用于所有服务"，但 claudeRelayService.js 实际上强制混合用户和默认 prompt，而非实现 P1 优先级
  - 根本原因: 代码逻辑错误，Line 549 强制执行 `[claudeCodePrompt, userSystemPrompt]` 而非 P1 优先级
  - 受影响范围: Claude Code Native API 路由（`/api/v1/messages`, `/claude/v1/messages`）
  - 影响版本: v2.0.0 至 v2.0.7
  - 计划文档: [prompt-management-plan.md](./prompt-management/prompt-management-plan.md) 明确要求所有服务统一实现 P1>P2>P3 优先级
  - 对比分析:
    - ✅ openaiToClaude.js (Line 36-55): 正确实现 P1 优先级
    - ✅ openaiRoutes.js (Line 277-292): 正确实现 P1 优先级
    - ❌ claudeRelayService.js (Line 538-549): **错误实现**（强制混合）
  - 修复位置:
    - `src/services/claudeRelayService.js` Line 522-558 - 重写三级优先级逻辑
    - 实现与 openaiToClaude.js 完全一致的 P1 优先级系统
  - 修复后行为:
    - **P1（最高）**: 用户有 system → 保持用户的，不注入任何默认 prompt
    - **P2（默认）**: 用户无 system + 配置启用 → 注入默认 prompt
    - **P3（最低）**: 配置禁用 → 不注入任何 prompt
  - 技术细节:
    - 新增 `hasUserSystem` 检查：支持字符串和数组格式
    - P1 分支：空操作，保持 `processedBody.system` 原样
    - 日志清晰化：`📋 使用用户自定义 system (P1 优先级)`
  - 破坏性: 无（修复 bug，实现计划文档承诺的行为）
  - 兼容性: 完全兼容（符合用户期望和文档声明）
  - 相关文档: [06-behavior-analysis.md](./prompt-management/06-behavior-analysis.md#Claude-Code-服务)

---

## [2.0.7] - 2025-11-06

### Fixed

#### Prompts 管理页面模板嵌套错误修复（Critical）

- **修复 Prompts 管理页面完全无法显示的问题**
  - 问题原因: prompts section 被错误地放置在"添加/编辑平台模态框"内部（SettingsView.vue Line 1222）
  - 根本原因: 模板嵌套错误，prompts div 只在 `showAddPlatformModal === true` 时渲染
  - 受影响范围: 所有环境，用户点击"系统设置 > Prompts 管理"时页面显示空白
  - 诊断过程:
    - Playwright 自动化测试确认 PromptsView 组件未挂载
    - 浏览器 DOM 检查发现只有 2 个子 div（branding, webhook），缺少 prompts div
    - 构建产物分析发现 prompts 代码在 webhook modal 代码之后
    - 源码分析确认 prompts section 在模态框内部（Line 1222），而非 v-else 内部
  - 修复位置:
    - `web/admin-spa/src/views/SettingsView.vue` Line 645 - 将 prompts section 移动到正确位置
    - 从模态框内部移动到 webhook section 之后、v-else 结束之前
    - 使其与 branding/webhook section 并列（同级）
  - 影响: Prompts 管理页面现在能正常显示和交互

### Changed

#### 代码质量改进

- **PromptsView.vue 调试代码清理**
  - 移除红色边框 `style="border: 2px solid red"`
  - 移除黄色 DEBUG banner
  - 移除 `console.log` 调试语句
  - 修复 ESLint 警告：移除未使用的 props 参数

- **构建产物优化**
  - 前端重新构建（7.43秒）
  - SettingsView bundle 大小: 66.38 kB（gzip: 16.05 kB）
  - 无编译错误和警告

---

## [2.0.6] - 2025-01-05

### Fixed

#### Prompts 管理显示问题修复

- **修复 Prompts 管理页面无法正常显示的问题**
  - 问题原因: 路由重定向到 `/settings` 但未指定 section 参数，导致默认显示品牌设置栏
  - 受影响范围: 从导航栏点击 Prompts 或访问 `/prompts` 路由时，PromptsView 组件被隐藏
  - 修复位置:
    - `router/index.js` - 重定向改为 `/settings?section=prompts`
    - `SettingsView.vue` - 添加 `useRoute` 导入和路由参数读取逻辑
  - 影响: Prompts 管理页面现在能正确显示

### Changed

#### 路由和组件改进

- **SettingsView 支持 URL 查询参数初始化**
  - 读取 `route.query.section` 参数
  - 验证参数值在允许列表中（branding, webhook, prompts）
  - 自动设置 `activeSection` 初始值
  - 模式参考: `ApiStatsView.vue` 的路由参数处理方式

- **Prompts 路由重定向优化**
  - `/prompts` → `/settings?section=prompts`
  - 确保用户访问时直接显示 Prompts 管理子栏

---

## [2.0.5] - 2025-01-05

### Fixed

#### 配置和代码质量修复

- **修复 config.example.js 配置不同步**
  - 添加缺失的 `envVar` 和 `description` 字段
  - 与 config.js 保持完全一致
  - 影响: 新部署环境配置完整，API 返回正确数据

- **修复 src/routes/admin.js 代码质量问题**
  - 移除重复的 `require('fs')` 导入（已在文件顶部导入）
  - 添加安全的配置访问 `config.prompts[service]?.enabled ?? true`
  - 统一错误响应格式，添加 `message: error.message` 字段
  - 影响: 代码更整洁，错误调试更容易

- **修复 PromptsView.vue 错误处理不完善**
  - `loadConfigs()` 函数添加用户错误提示
  - 响应失败时显示 Toast 消息
  - 网络错误时显示 Toast 消息
  - 影响: 用户体验改善，错误可感知

### Technical Debt

- **代码一致性**: 错误响应格式与项目其他端点保持一致
- **防御性编程**: 使用可选链和空值合并运算符防止意外错误
- **用户体验**: 所有 API 调用失败都有明确的用户提示

---

## [2.0.4] - 2025-01-05

### Fixed

#### Prompts 管理系统修复（Critical）

- **修复 Docker 部署环境 Prompts 显示为空的问题**
  - 问题原因: API 响应缺少 `success: true` 字段，导致前端条件判断失败
  - 受影响范围: Docker/K8s 部署环境，所有 prompts 均无法显示
  - 修复位置: `src/routes/admin.js` - `GET /admin/prompts/:service` 端点
  - 影响: 生产环境中所有 Prompts 管理功能恢复正常

- **修复环境变量配置规则不可见的问题**
  - 问题原因: 前端硬编码环境变量名称，违反 DRY 原则
  - 新增 API: `GET /admin/prompts/meta/config` - 提供配置元数据
  - 配置来源: `config/config.js` prompts 配置（Single Source of Truth）
  - 显示信息: 环境变量名称、描述、当前启用状态

### Changed

#### UI/UX 改进

- **Prompts 管理移至系统设置子栏**
  - 变更前: Prompts 作为根栏独立显示（与仪表板、API Keys 等同级）
  - 变更后: Prompts 作为"系统设置"的子栏（与品牌设置、通知设置并列）
  - 向后兼容: `/prompts` 路由自动重定向至 `/settings`
  - 影响范围:
    - `TabBar.vue` - 移除根栏 Prompts 导航项
    - `MainLayout.vue` - 移除 Prompts 路由映射
    - `SettingsView.vue` - 新增 Prompts 子栏导航和嵌入式视图
    - `router/index.js` - 添加 `/prompts` → `/settings` 重定向

- **PromptsView 组件支持嵌入式模式**
  - 新增 `embedded` prop - 控制是否显示页面标题和外层卡片
  - 配置动态加载 - 从 API 获取环境变量配置，零硬编码
  - 环境变量配置卡片 - 显示 `envVar`、`description`、当前启用状态

#### 后端改进

- **config/config.js 扩展**
  - 新增字段:
    - `prompts.*.envVar` - 环境变量名称（如 `CODEX_PROMPT_ENABLED`）
    - `prompts.*.description` - 环境变量描述（用户可见说明）
  - 单一数据源: 所有配置从 config.js 读取，前端通过 API 获取

- **API 响应格式统一**
  - `GET /admin/prompts/:service` 响应格式:
    - 新增 `success: true` - 与其他 API 端点格式一致
    - 新增 `lastModified` - 文件最后修改时间（ISO 8601 格式）
  - `GET /admin/prompts/meta/config` 新端点:
    - 返回所有服务的配置元数据（envVar, description, enabled）
    - 格式: `{success: true, data: [{id, envVar, envDescription, enabled}]}`

### Technical Debt

- **消除硬编码**: 环境变量名称从前端移除，改为从后端配置读取
- **组件复用**: PromptsView 通过 `embedded` prop 复用，避免代码重复
- **API 一致性**: 统一响应格式 `{success: true, data: xxx}`，符合项目规范

---

## [2.0.0] - 2025-01-05

### Added

#### 统一 Prompt 管理系统

##### 核心功能

- ✅ **promptLoader.js 服务**: 单一数据源（Single Source of Truth）管理所有系统提示词
  - O(1) 访问性能（内存缓存）
  - Fail-fast 机制（关键文件缺失拒绝启动）
  - 热重载支持（`reload()` 方法）
  - 健康状态检查（`getHealthStatus()`）

- ✅ **Prompt 文件外部化**: `resources/prompts/` 目录
  - `codex.txt` - Codex CLI prompt (23,793 字节)
  - `claude-code.txt` - Claude Code prompt (57 字节)
  - `droid.txt` - Droid prompt (65 字节)
  - `README.md` - 使用说明文档
- ✅ **Web 管理界面**: `PromptsView.vue`
  - 手动编辑：在线编辑，实时预览，字符数统计
  - 文件上传：支持 .txt 文件上传（最大 1MB）
  - URL 导入：从 HTTPS URL 导入 prompt
  - 热重载：所有修改立即生效，无需重启服务
  - 安全验证：大小限制、Unicode 字符验证、管理员认证
- ✅ **配置化管理**: `config.prompts` 配置块
  - 每个服务独立的启用/禁用开关
  - 环境变量支持
  - 三级优先级系统配置

##### API 扩展

- `promptLoader.getValidServices()` - 获取有效服务列表
- `promptLoader.getFilePath(service)` - 获取服务文件路径
- `promptLoader.getPromptsDir()` - 获取 prompts 目录路径

##### Web API 端点 (admin.js)

- `GET /admin/prompts/:service` - 获取指定服务的 prompt
- `PUT /admin/prompts/:service` - 手动编辑 prompt
- `POST /admin/prompts/:service/upload` - 文件上传
- `POST /admin/prompts/:service/import-url` - URL 导入

### Changed

#### 架构重构（零破坏性）

##### 三级优先级系统统一实现

- **P1（最高）**: 用户自定义 system message（所有格式）
- **P2（默认）**: 配置默认 prompt（从 promptLoader 加载）
- **P3（最低）**: 无注入（配置禁用时）

##### 服务改造

- ✅ **openaiRoutes.js**: 移除 23KB Codex CLI 硬编码，使用 `promptLoader.getPrompt('codex')`
- ✅ **openaiToClaude.js**:
  - 移除 Xcode 特殊检测逻辑
  - 统一使用三级优先级系统
  - 尊重所有用户自定义 system message
- ✅ **droidRelayService.js**: 移除 SYSTEM_PROMPT 常量，使用 `promptLoader.getPrompt('droid')`
- ✅ **claudeRelayService.js**: 移除 Claude Code 硬编码，使用 promptLoader

##### 代码质量优化

- 配置重复: 19 处 → 3 处（减少 84%）
  - validServices 数组: 5 次定义 → 0 次（全部使用 API）
  - fileMap 对象: 4 次定义 → 1 次（仅在 promptLoader.js）
  - promptsDir 路径: 4 次定义 → 1 次（仅在 promptLoader.js）
  - MAX_PROMPT_SIZE: 3 次 → 1 次（统一常量）
  - invalidChars 正则: 3 次 → 1 次（统一常量）
- 维护成本降低:
  - 新增服务: 11 处修改 → 4 处（减少 64%）
  - 文件名修改: 4 处 → 1 处（减少 75%）
  - 目录修改: 4 处 → 1 处（减少 75%）

##### 架构改进

- 单一数据源模式（Single Source of Truth）
- API 完全封装（隐藏内部实现）
- 统一常量管理（DRY 原则）
- ESLint & Prettier 代码规范

### Fixed

#### 硬编码消除（Critical）

- **openaiRoutes.js**: 消除 23,793 字节 Codex CLI prompt 硬编码
- **claudeRelayService.js**: 消除 Claude Code prompt 硬编码（审计遗漏项）
- **droidRelayService.js**: 消除 Droid SYSTEM_PROMPT 常量

#### 用户自定义行为修复

- **Codex 服务**: 修复非标准格式用户自定义被强制覆盖的问题
- **Claude Code 服务**: 修复非 Xcode 格式用户自定义被强制忽略的问题

### Technical Details

#### 性能指标

- Prompt 检索: <1ms（O(1) 内存访问）
- 启动时间增加: <20ms（一次性文件加载）
- 内存占用: ~24KB（3个 prompt 文件总大小）

#### 向后兼容性

- ✅ API 接口: 完全兼容
- ✅ 默认行为: 无用户自定义时保持不变
- ✅ 客户端代码: 无需修改
- ✅ 配置文件: 向后兼容

#### 破坏性变更评估

- 虽然标记为 BREAKING CHANGE（主版本号提升）
- 实际行为修复符合用户期望
- API 保持完全兼容
- 无需客户端代码修改

#### 文档完善

- `docs/prompt-management/prompt-management-plan.md` - 完整升级计划
- `docs/prompt-management/` - 技术文档目录（7个文档）
  - 01-architecture.md - 架构设计
  - 02-implementation-guide.md - 实施指南
  - 03-api-specification.md - API 规范
  - 04-testing-plan.md - 测试计划
  - 05-migration-guide.md - 迁移指南
  - 06-behavior-analysis.md - 行为分析
  - README.md - 文档索引

#### 提交信息

- Commit: 5bc4211
- Message: feat: v2.0.0 Prompt Management System 完整实现及架构优化
- Co-Authored-By: Claude <noreply@anthropic.com>

---

## [1.1.191] - Previous Release

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
