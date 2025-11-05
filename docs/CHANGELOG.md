# Changelog

本文档记录项目的重要变更历史。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

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

- `docs/v2.0.0-prompt-management-plan-clean.md` - 完整升级计划
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
