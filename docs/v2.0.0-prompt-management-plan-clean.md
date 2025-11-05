# v2.0.0 统一 Prompt 管理系统 - 升级计划

> **⚠️ 重要提示：本文档为 v2.0.0 版本的功能规划文档，并非变更日志。**
>
> **📋 文档状态：审计完成，待实施**
>
> **🚧 实施状态：未实施**
>
> 本文档描述的所有功能均为规划内容，实际实施前需要完成代码实现和测试验证。
>
> **相关技术文档**：[docs/prompt-management/](./prompt-management/)

---

## 📋 文档规范

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

---

## 🎯 升级目标

### 核心目标

实现跨服务统一 Prompt 管理系统，消除硬编码，提供集中化、可配置的 Prompt 管理架构。

### 设计原则

1. **单一数据源**（Single Source of Truth）
   - 所有 prompts 集中在 `resources/prompts/` 目录
   - 统一的加载和缓存机制

2. **三级优先级系统**
   - **P1（最高）**：用户自定义 system message
   - **P2（默认）**：配置默认 prompt
   - **P3（最低）**：无注入（配置禁用）

3. **架构一致性**
   - 所有服务使用相同的 prompt 管理方式
   - 统一的 API 接口（`promptLoader.getPrompt(service)`）

4. **可扩展性**
   - 支持 Web 界面在线编辑
   - 为热重载、远程源预留架构

### 实施范围

覆盖全部 3 个服务：
- Codex/OpenAI Responses（~24KB prompt）
- Claude Code（57 字符 prompt）
- Droid (Factory.ai)（65 字符 prompt）

---

## 🔍 问题分析

### 现有问题

| 问题 | 严重性 | 影响 |
|------|--------|------|
| **23KB 硬编码** | 🔴 严重 | 代码可读性差，维护困难 |
| **用户自定义被忽略** | 🔴 严重 | 违反用户期望，影响体验 |
| **架构不统一** | 🟡 中等 | 增加维护成本 |
| **无法在线编辑** | 🟡 中等 | 修改需重启服务 |

### 详细分析

参见 [现有行为分析](./prompt-management/06-behavior-analysis.md)

---

## 📦 计划新增功能

### 核心服务

1. **统一 Prompt 加载器**（`promptLoader.js`）
   - 启动时一次性加载所有 prompts
   - 提供统一的 API 接口
   - 支持健康状态检查

2. **Prompt 文件目录**（`resources/prompts/`）
   - `codex.txt` - Codex CLI prompt（~24KB）
   - `claude-code.txt` - Claude Code prompt（57 字符）
   - `droid.txt` - Droid prompt（65 字符）
   - `README.md` - 使用说明

3. **配置化管理**
   - 新增 `config.prompts` 配置块
   - 环境变量支持
   - 每个服务独立的启用/禁用开关

### Web 管理功能（v2.0.0 核心功能）

#### 完整的 Prompt 管理界面

- **手动编辑**：在线编辑所有 system prompts，实时预览和字符数统计
- **文件上传**：支持直接上传 .txt 文件（适合大型 prompt 如 Codex 24KB）
- **URL 导入**：从 HTTPS URL 导入 prompt（支持官方仓库或远程源）
- **热重载**：所有修改立即生效，无需重启服务
- **安全验证**：1MB 大小限制、Unicode 字符验证、管理员认证

#### 预期工作量：4 小时

- 后端 API（编辑/上传/导入）：2 小时
- 前端界面：1.5 小时
- 测试调试：0.5 小时

---

## 🔄 功能变更

### 三级优先级系统

统一应用于所有服务：

| 优先级 | 来源 | 触发条件 | 使用场景 |
|--------|------|----------|----------|
| **P1（最高）** | 用户自定义 | 请求包含 system message | 用户有特定需求 |
| **P2（默认）** | 配置默认 | 无用户 message + 配置启用 | 使用服务默认行为 |
| **P3（最低）** | 无注入 | 配置禁用 | 完全由模型决定 |

### Codex 服务

- **修改前**：只有 Codex CLI 标准格式才保留，其他格式强制覆盖
- **修改后**：尊重所有用户自定义 instructions

### Claude Code 服务

- **修改前**：只有 Xcode 格式才尊重，其他格式强制忽略
- **修改后**：尊重所有用户自定义 system message
- **架构简化**：移除 Xcode 特殊检测（P1 自动捕获）

### Droid 服务

- **修改前**：硬编码 SYSTEM_PROMPT 常量
- **修改后**：使用 promptLoader 统一管理
- **行为保持**：仍然前置注入（不影响兼容性）

---

## ⚠️ 破坏性变更评估

### 向后兼容性

| 方面 | 兼容性 |
|------|--------|
| API 接口 | ✅ 完全兼容 |
| 默认行为（无用户自定义时） | ✅ 完全兼容 |
| 客户端代码 | ✅ 无需修改 |
| 配置文件 | ✅ 向后兼容 |

### 行为修复（技术上是破坏性变更）

**修复 1：Codex 非标准格式用户自定义**
- **现状**：被强制覆盖
- **修复后**：被尊重
- **判断**：✅ Bug 修复，符合用户期望

**修复 2：Claude Code 非 Xcode 用户自定义**
- **现状**：被强制忽略
- **修复后**：被尊重
- **判断**：✅ Bug 修复，符合用户期望

### 完整行为对照表

参见 [行为分析文档](./prompt-management/06-behavior-analysis.md#行为对照表)

### 主版本号提升理由

- **Major Change**：架构重构（统一 Prompt 管理系统）
- **Behavior Fix**：修复 2 个重大 bug
- **Significant Impact**：影响 3 个核心服务 + Web 管理界面
- **Long-term Benefit**：为未来扩展奠定基础

虽然行为改变是修复 bug，但架构变更的重要性符合主版本号提升标准。

---

## 🧹 代码清理

- 移除 `openaiRoutes.js` 中的 23KB 硬编码
- 移除 `openaiToClaude.js` 中的 Xcode 检测逻辑
- 移除 `droidRelayService.js` 中的 SYSTEM_PROMPT 常量

---

## ✅ 验证标准

### 功能验证

- [ ] promptLoader 成功加载所有 prompts
- [ ] 三级优先级逻辑正确实现
- [ ] Web 编辑界面可用
- [ ] 配置开关生效

### 兼容性验证

- [ ] Codex 无自定义时行为不变
- [ ] Xcode 请求行为不变
- [ ] Droid 前置注入行为不变

### 性能验证

- [ ] Prompt 检索 <1ms
- [ ] 启动时间增加 <20ms
- [ ] 内存占用 <100KB

---

## 📊 预期收益

### 主要收益

1. **代码可维护性**
   - 消除 23KB 硬编码
   - 统一 prompt 管理架构
   - 降低维护成本

2. **用户体验提升**
   - 修复用户自定义被忽略的 bug
   - Web 界面在线编辑
   - 配置化灵活控制

3. **架构改进**
   - 单一数据源
   - 可扩展性预留
   - 为未来功能铺路

4. **潜在成本优化**（次要）
   - 用户可禁用不需要的 prompt
   - 自定义更短 prompt 减少 token
   - 实际节省取决于使用模式

---

## 📝 实施计划

### 预期工作量

| 阶段 | 工作量 |
|------|--------|
| 基础设施（promptLoader + 文件） | 2 小时 |
| 服务改造（3 个服务） | 3 小时 |
| Web 管理界面（编辑/上传/URL导入） | 4 小时 |
| 测试和验证 | 2 小时 |
| **总计** | **11 小时** |

### 实施步骤

1. 创建 `resources/prompts/` 目录和文件
2. 实现 `promptLoader.js` 服务
3. 添加配置块
4. 改造 3 个服务（openaiRoutes、openaiToClaude、droidRelayService）
5. 实现 Web 管理界面（手动编辑、文件上传、URL 导入）
6. 完整测试和验证

### 详细技术方案

参见 [实施指南](./prompt-management/02-implementation-guide.md)

---

## 📚 相关文档

- [架构设计](./prompt-management/01-architecture.md)
- [实施指南](./prompt-management/02-implementation-guide.md)
- [API 规范](./prompt-management/03-api-specification.md)
- [测试计划](./prompt-management/04-testing-plan.md)
- [迁移指南](./prompt-management/05-migration-guide.md)
- [现有行为分析](./prompt-management/06-behavior-analysis.md)

---

## 📅 版本信息

- **计划版本**：v2.0.0
- **文档创建**：2025-01-05
- **最后更新**：2025-01-05
- **审计状态**：✅ 已通过 Linus Torvalds 式审计
- **实施状态**：🚧 待实施
