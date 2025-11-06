# 现有行为分析

> **相关文档**：[v2.0.0 升级计划](./prompt-management-plan.md)

---

## 🔍 代码审计结果

### Codex 服务（openaiRoutes.js）

**位置**：`src/routes/openaiRoutes.js:261-289`

**现有逻辑**：
```javascript
const isCodexCLI = req.body?.instructions?.startsWith(
  'You are a coding agent running in the Codex CLI'
)

if (!isCodexCLI) {
  // 强制覆盖为 24KB 硬编码 prompt
  req.body.instructions = '23,831 字符的硬编码...'
  logger.info('📝 Non-Codex CLI request detected, applying Codex CLI adaptation')
} else {
  logger.info('✅ Codex CLI request detected, forwarding as-is')
}
```

**行为分析**：

| 场景 | 行为 | 用户控制 |
|------|------|----------|
| 无 instructions | ❌ 强制注入 24KB | 无 |
| 有 instructions（Codex CLI 格式） | ✅ 保持用户的 | 有 |
| 有 instructions（其他格式） | ❌ **强制覆盖为 24KB** | **无** |

**问题**：
- 只有标准格式才保留用户内容
- 其他格式被强制覆盖
- 违反用户期望

---

### Claude Code 服务（openaiToClaude.js）

**位置**：`src/services/openaiToClaude.js:34-52`

**现有逻辑**：
```javascript
const claudeCodeSystemMessage = "You are Claude Code, Anthropic's official CLI for Claude."

const systemMessage = this._extractSystemMessage(openaiRequest.messages)
if (systemMessage && systemMessage.includes('You are currently in Xcode')) {
  // Xcode 系统提示词
  claudeRequest.system = systemMessage
  logger.info(`🔍 Xcode request detected, using Xcode system prompt`)
} else {
  // 使用 Claude Code 默认系统提示词
  claudeRequest.system = claudeCodeSystemMessage
  logger.debug(
    `📋 Using Claude Code default system prompt${systemMessage ? ' (ignored custom prompt)' : ''}`
  )
}
```

**关键证据**：
- 第 50 行日志：**"(ignored custom prompt)"**
- 明确说明忽略了用户自定义

**行为分析**：

| 场景 | 行为 | 用户控制 | 证据 |
|------|------|----------|------|
| 无 system message | ❌ 强制注入 57 字符 | 无 | - |
| 有 system（Xcode 格式） | ✅ 使用用户的 | 有 | 第 39-45 行 |
| 有 system（非 Xcode 格式） | ❌ **忽略用户的** | **无** | **第 50 行日志** |

**问题**：
- Xcode 格式有特权
- 其他格式被强制忽略
- 代码明确记录了"ignored custom prompt"

---

### Droid 服务（droidRelayService.js）

**位置**：`src/services/droidRelayService.js:12, 29, 1008-1035`

**现有逻辑**：
```javascript
// 第 12 行
const SYSTEM_PROMPT = 'You are Droid, an AI software engineering agent built by Factory.'

// 第 29 行
this.systemPrompt = SYSTEM_PROMPT

// Anthropic 端点（第 1008-1022 行）
if (endpointType === 'anthropic') {
  if (this.systemPrompt) {
    const promptBlock = { type: 'text', text: this.systemPrompt }
    if (Array.isArray(processedBody.system)) {
      // 检查是否已存在
      const hasPrompt = processedBody.system.some(
        (item) => item && item.type === 'text' && item.text === this.systemPrompt
      )
      if (!hasPrompt) {
        // 前置注入（不是覆盖）
        processedBody.system = [promptBlock, ...processedBody.system]
      }
    } else {
      // 覆盖（如果 system 不是数组）
      processedBody.system = [promptBlock]
    }
  }
}

// OpenAI 端点（第 1024-1035 行）
if (endpointType === 'openai') {
  if (this.systemPrompt) {
    if (processedBody.instructions) {
      // 前置注入
      processedBody.instructions = `${this.systemPrompt}${processedBody.instructions}`
    } else {
      // 直接设置
      processedBody.instructions = this.systemPrompt
    }
  }
}
```

**行为分析**：

| 端点 | 场景 | 行为 | 用户控制 |
|------|------|------|----------|
| **Anthropic** | 无 system | ❌ 强制注入 65 字符 | 无 |
| **Anthropic** | 有 system（数组） | ⚠️ **前置注入** | 部分（内容保留） |
| **OpenAI** | 无 instructions | ❌ 强制注入 65 字符 | 无 |
| **OpenAI** | 有 instructions | ⚠️ **前置注入** | 部分（内容保留） |

**特点**：
- 不是覆盖，是前置注入
- 用户内容会保留
- 但会被追加在默认 prompt 之后

---

## 📊 完整行为对照表

### v1.x 实际行为 vs v2.0.0 计划行为

| 服务 | 场景 | v1.x 实际行为 | v2.0.0 计划行为 | 改变类型 |
|------|------|-------------|----------------|----------|
| **Codex** | 无 instructions | ❌ 强制注入 24KB | P2: 注入 24KB | ✅ 兼容 |
| **Codex** | 有 instructions（Codex CLI 格式） | ✅ 保持用户的 | P1: 用户优先 | ✅ 兼容 |
| **Codex** | 有 instructions（非标准格式） | ❌ **强制覆盖为 24KB** | P1: **用户优先** | ⚠️ **Bug 修复** |
| **Claude Code** | 无 system message | ❌ 强制注入 57 字符 | P2: 注入 57 字符 | ✅ 兼容 |
| **Claude Code** | 有 system（任意格式） | ⚠️ 强制前置 57 字符 | P0+P1: 前置注入 | ✅ 兼容 |
| **Droid Anthropic** | 无 system | ❌ 强制注入 65 字符 | P2: 注入 65 字符 | ✅ 兼容 |
| **Droid Anthropic** | 有 system（数组） | ⚠️ 强制前置 65 字符 | P2: 强制前置 | ✅ 兼容 |
| **Droid OpenAI** | 无 instructions | ❌ 强制注入 65 字符 | P2: 注入 65 字符 | ✅ 兼容 |
| **Droid OpenAI** | 有 instructions | ⚠️ 强制前置 65 字符 | P2: 强制前置 | ✅ 兼容 |

---

## 🐛 Bug 详细分析

### Bug 1: Codex 忽略非标准格式的用户自定义

**问题描述**：
- 用户发送非 "You are a coding agent..." 格式的 instructions
- 系统强制覆盖为 24KB 默认 prompt
- 用户的自定义被完全丢弃

**用户期望**：
- 用户提供 instructions 时应该被使用
- 系统不应该强制覆盖用户输入

**影响范围**：
- 所有发送自定义 instructions 的用户
- 除了 Codex CLI 标准格式外的所有格式

**修复方案**：
- 实现三级优先级
- P1: 任何用户 instructions 都被尊重

---

### Bug 2: Claude Code 忽略非 Xcode 的用户自定义

**问题描述**：
- 用户发送非 Xcode 格式的 system message
- 系统强制忽略，使用默认 prompt
- 日志明确记录"(ignored custom prompt)"

**用户期望**：
- 用户提供 system message 时应该被使用
- 系统不应该有格式歧视

**影响范围**：
- 所有发送自定义 system message 的用户
- 除了 Xcode 格式外的所有格式

**修复方案**：
- 移除 Xcode 特殊检测
- 实现三级优先级
- P1: 任何用户 system message 都被尊重

---

## 📈 兼容性影响评估

### 完全兼容的场景（90%+）

| 场景 | 用户占比估计 | 兼容性 |
|------|------------|--------|
| Codex 无自定义 | 95% | ✅ 完全兼容 |
| Codex CLI 标准格式 | 4% | ✅ 完全兼容 |
| Claude Code 无自定义 | 95% | ✅ 完全兼容 |
| Xcode 用户 | 3% | ✅ 完全兼容 |
| Droid 用户 | 100% | ✅ 完全兼容 |

### 行为改变的场景（<5%）

| 场景 | 用户占比估计 | 改变类型 |
|------|------------|----------|
| Codex 非标准格式 | <1% | ✅ Bug 修复 |
| Claude 非 Xcode 自定义 | <2% | ✅ Bug 修复 |

**结论**：
- 90%+ 用户完全不受影响
- <5% 用户受益于 bug 修复
- 0% 用户受到负面影响

---

## 🔬 测试场景设计

### Codex 测试场景

**场景 1：无 instructions**
```bash
# 请求
{
  "model": "gpt-5",
  "messages": [{"role": "user", "content": "Test"}]
}

# v1.x 行为：注入 24KB
# v2.0.0 行为：注入 24KB（P2）
# 兼容性：✅ 相同
```

**场景 2：Codex CLI 格式**
```bash
# 请求
{
  "model": "gpt-5",
  "instructions": "You are a coding agent running in the Codex CLI...",
  "messages": [{"role": "user", "content": "Test"}]
}

# v1.x 行为：保持用户的
# v2.0.0 行为：保持用户的（P1）
# 兼容性：✅ 相同
```

**场景 3：非标准格式**
```bash
# 请求
{
  "model": "gpt-5",
  "instructions": "You are a custom assistant",
  "messages": [{"role": "user", "content": "Test"}]
}

# v1.x 行为：强制覆盖为 24KB
# v2.0.0 行为：保持用户的（P1）
# 兼容性：⚠️ Bug 修复
```

### Claude Code 测试场景

**场景 1：无 system message**
```bash
# 请求
{
  "model": "claude-sonnet-4",
  "messages": [{"role": "user", "content": "Test"}]
}

# v1.x 行为：注入 57 字符
# v2.0.0 行为：注入 57 字符（P2）
# 兼容性：✅ 相同
```

**场景 2：Xcode 格式**
```bash
# 请求
{
  "model": "claude-sonnet-4",
  "messages": [
    {"role": "system", "content": "You are currently in Xcode..."},
    {"role": "user", "content": "Test"}
  ]
}

# v1.x 行为：使用用户的（Xcode 检测）
# v2.0.0 行为：使用用户的（P1，无需检测）
# 兼容性：✅ 相同
```

**场景 3：非 Xcode 格式**
```bash
# 请求
{
  "model": "claude-sonnet-4",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant"},
    {"role": "user", "content": "Test"}
  ]
}

# v1.x 行为：忽略用户的，强制默认
# v2.0.0 行为：使用用户的（P1）
# 兼容性：⚠️ Bug 修复
```

### Droid 测试场景

**场景 1：Anthropic 端点无 system**
```bash
# 请求
{
  "model": "claude-sonnet-4",
  "messages": [{"role": "user", "content": "Test"}]
}

# v1.x 行为：注入 65 字符
# v2.0.0 行为：注入 65 字符（P2）
# 兼容性：✅ 相同
```

**场景 2：Anthropic 端点有 system**
```bash
# 请求
{
  "model": "claude-sonnet-4",
  "system": [{"type": "text", "text": "Custom prompt"}],
  "messages": [{"role": "user", "content": "Test"}]
}

# v1.x 行为：[Droid, Custom]（前置）
# v2.0.0 行为：[Droid, Custom]（前置，P2）
# 兼容性：✅ 相同
```

---

## ✅ 验证清单

### 行为验证

- [ ] Codex 无自定义：行为不变
- [ ] Codex CLI 格式：行为不变
- [ ] Codex 非标准格式：修复为尊重用户
- [ ] Claude 无自定义：行为不变
- [ ] Xcode 格式：行为不变
- [ ] Claude 非 Xcode：修复为尊重用户
- [ ] Droid Anthropic：行为不变
- [ ] Droid OpenAI：行为不变

### 兼容性验证

- [ ] 默认场景完全兼容（90%+ 用户）
- [ ] Bug 修复正面影响（<5% 用户）
- [ ] 零负面影响
- [ ] API 接口不变
- [ ] 客户端代码无需修改

---

## 🔧 v2.0.9 修复说明

### 问题回顾

**v2.0.8 引入的 Critical Bug**：

- 在用户有自定义 system message 时返回 Anthropic 认证错误：`"This credential is only authorized for use with Claude Code"`
- 根本原因：忽略了 **P0 级别的技术约束**（Anthropic Claude Code OAuth 凭据认证要求）

### P0 约束的发现

**关键证据**：

1. **commit `dabf3bf` (2025-07-22)**: "解决了 'This credential is only authorized for use with Claude Code' 错误"
   - 通过 `claudeCodeHeadersService` 管理 Claude Code headers
   - 说明 Anthropic 对 Claude Code OAuth 凭据有特殊认证要求

2. **v2.0.7 的正确行为**：
   - 强制前置注入 `[claudeCodePrompt, userSystemPrompt]`
   - 认证通过 ✅

3. **v2.0.8 的错误行为**：
   - 用户有 system 时不注入 Claude Code prompt
   - 认证失败 ❌

### 新的优先级定义（v2.0.9）

```
P0（技术约束 - 最高优先级）：
  Claude Code OAuth 凭据要求必须包含 Claude Code system prompt
  这是 Anthropic API 的认证要求，不可绕过

P1（用户优先）：
  用户有 system → 前置注入 Claude Code prompt + 保留用户的
  发送: [claudeCodePrompt, ...userSystemPrompts]
  效果：
    ✅ 满足认证要求（P0）
    ✅ 保留用户内容（P1）
    ✅ 用户的 system 仍然影响模型行为

P2（默认）：
  用户无 system → 仅注入 Claude Code prompt

P3（禁用）：
  配置禁用 → 不注入（⚠️ 可能导致认证失败）
```

### 为什么 v2.0.8 的设计是错误的

v2.0.8 将两个不同场景混为一谈：

| 服务 | 使用的凭据 | 是否有认证约束 | P1 优先级实现 |
|------|----------|-------------|-------------|
| **openaiToClaude** | 无特定凭据（转换层） | ❌ 无约束 | 完全使用用户的 ✅ |
| **claudeRelayService** | Claude Code OAuth Token | ✅ **有认证要求（P0）** | **必须前置注入** ✅ |

**结论**：
- "纯粹的 P1 优先级"在 `openaiToClaude.js` 中是正确的（无 P0 约束）
- 但在 `claudeRelayService.js` 中是错误的（有 P0 约束）

### v2.0.9 修复内容

**修复位置**：`src/services/claudeRelayService.js` Line 522-580

**修复方案**：回滚到 v2.0.7 的前置注入逻辑 + 重新定义优先级系统

**修复后行为**：

```javascript
// 场景 1: 用户有自定义 system
请求: { system: "You are a helpful assistant", messages: [...] }
发送: {
  system: [
    { type: 'text', text: 'You are Claude Code, Anthropic\'s official CLI for Claude.', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'You are a helpful assistant' }
  ],
  messages: [...]
}
结果: ✅ 认证通过

// 场景 2: 用户无 system
请求: { messages: [...] }
发送: {
  system: [{ type: 'text', text: 'You are Claude Code...', cache_control: { type: 'ephemeral' } }],
  messages: [...]
}
结果: ✅ 认证通过
```

### 影响分析

**破坏性**：无
- 回滚到 v2.0.7 的正确行为
- 修复 v2.0.8 的 bug

**兼容性**：完全兼容
- 无 system 的请求：行为不变
- 真实 Claude Code 请求：行为不变
- 有自定义 system 的请求：从认证失败 → 认证成功（正面修复）

**受影响用户**：
- 0% 负面影响
- 100% 正面影响（修复 v2.0.8 的认证失败问题）
