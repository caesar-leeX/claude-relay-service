# Codex Prompt 管理优化方案

**文档版本**: 1.0
**创建日期**: 2025-10-31
**关联问题**: CODE_AUDIT_REPORT_2025-10-31.md - 问题 1.1
**优先级**: P0 Critical
**负责模块**: `src/routes/openaiRoutes.js`

---

## 目录

- [一、问题概述](#一问题概述)
- [二、根本原因分析](#二根本原因分析)
- [三、当前问题详细说明](#三当前问题详细说明)
- [四、短期修复方案（立即执行）](#四短期修复方案立即执行)
- [五、长期优化方案（下一版本）](#五长期优化方案下一版本)
- [六、实施步骤](#六实施步骤)
- [七、测试验证](#七测试验证)
- [八、风险评估](#八风险评估)

---

## 一、问题概述

### 1.1 问题发现

在 2025-10-31 的代码审计中，发现 `src/routes/openaiRoutes.js` 存在以下严重问题：

| 问题类型 | 描述 | 严重性 | 状态 |
|---------|------|--------|------|
| 设计缺陷 | 强制注入 15,000+ 字符的默认 Codex CLI prompt | 🔴 Critical | 未修复 |
| 代码质量 | 硬编码超长字符串，无法维护 | 🔴 Critical | 未修复 |
| 功能缺失 | 缺少 `gpt-5-codex` 专用 prompt | 🔴 Critical | 未修复 |
| 功能缺失 | 不支持代码审查场景（review_prompt） | 🟠 High | 未修复 |
| 可维护性 | 无法同步 OpenAI 官方 prompt 更新 | 🟠 High | 未修复 |

### 1.2 影响范围

- **用户体验**: 用户无法自由选择是否使用 Codex CLI 行为，被强制注入
- **成本**: 每次请求额外消耗 15,000+ tokens（约 $0.02/请求，按 GPT-5 定价）
- **性能**: 超长 prompt 增加首次响应延迟
- **功能**: `gpt-5-codex` 模型无法使用专用优化 prompt

---

## 二、根本原因分析

### 2.1 历史演进

#### v1.1.182（2025-10-19）
- **新增功能**: 支持 OpenAI Responses (Codex) API 标准格式
- **问题引入**: 为所有非 Codex CLI 请求强制注入 15,000+ 字符默认 prompt
- **设计缺陷**: 完全忽略用户在 `messages` 中提供的 `system` 角色消息

```javascript
// v1.1.182 的错误逻辑
if (!isCodexCLI) {
  req.body.instructions = '<15000+ 字符硬编码 prompt>'  // ❌ 强制覆盖
}
```

#### v1.1.184（2025-10-30）
- **修复内容**: 修复 `openaiToClaude.js` 忽略用户 system message 的问题
- **正确逻辑**: 优先使用用户提供的 system message，未提供则不设置
- **遗漏**: 没有同步修复 `openaiRoutes.js` 的相同问题

```javascript
// openaiToClaude.js 的正确逻辑（v1.1.184）
if (systemMessage) {
  claudeRequest.system = systemMessage  // ✅ 使用用户的
}
// 未提供则不设置（✅ 正确）
```

#### v1.1.187（2025-10-30）
- **部分修复**: 添加了 system message 提取逻辑
- **仍存问题**: 保留了强制注入默认 prompt 的 else 分支

```javascript
// v1.1.187 的不完整修复
if (systemMessage) {
  req.body.instructions = systemMessage  // ✅ 正确
} else {
  req.body.instructions = '<15000+ 字符>'  // ❌ 仍然强制注入
}
```

### 2.2 设计缺陷分析

#### 缺陷 1: 违背用户意图

| 场景 | 用户意图 | 当前行为 | 问题 |
|------|---------|---------|------|
| 纯净 GPT-5 对话 | 不需要 Codex CLI 行为 | 强制注入 prompt | 违背意图 |
| 自定义角色 | 自己提供 system message | 必须提供才不被覆盖 | 强制要求 |
| 节省成本 | 减少 tokens 消耗 | 每次多消耗 15,000+ tokens | 成本浪费 |

#### 缺陷 2: 与其他模块不一致

`openaiToClaude.js` 在 v1.1.184 已修复为"不强制注入"，但 `openaiRoutes.js` 仍保留强制注入逻辑，导致项目内部逻辑不一致。

#### 缺陷 3: 硬编码导致的维护困难

- OpenAI 官方维护 3 个不同的 prompt 文件：
  - `prompt.md` - 通用 Codex CLI prompt
  - `gpt_5_codex_prompt.md` - GPT-5-Codex 专用 prompt
  - `review_prompt.md` - 代码审查场景 prompt
- 当前代码只硬编码了 `prompt.md`，无法支持其他场景

---

## 三、当前问题详细说明

### 3.1 代码位置

**文件**: `src/routes/openaiRoutes.js`
**行号**: Line 316-324（v1.1.187+）

```javascript
// 设置 instructions（优先使用用户的 system message，否则使用 Codex CLI 默认值）
if (systemMessage) {
  // 使用用户自定义的 system message
  req.body.instructions = systemMessage
  logger.info(`📝 Using custom system message (${systemMessage.length} chars)`)
} else {
  // ❌ 问题：强制注入 Codex CLI 默认指令（保持向后兼容）
  req.body.instructions =
    'You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI. You are expected to be precise, safe, and helpful.\n\n...[15000+ 字符]...'
}
```

### 3.2 问题细节

#### 问题 1: 强制注入违背用户意图

**触发条件**: 用户通过 `/api/v1/chat/completions` 或 `/openai/...` 端点调用 Codex/GPT-5，且未在请求体中包含 `{role: "system"}` 消息。

**期望行为**:
- 请求不包含 `instructions` 字段
- 让 OpenAI API 使用其默认行为

**实际行为**:
- 强制设置 `req.body.instructions` = 15,000+ 字符的 Codex CLI prompt
- 导致模型行为被强制更改

**影响示例**:
```bash
# 用户期望：简单的数学问题
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "1+1=?"}]
  }'

# 实际情况：模型收到 15,000+ 字符的 Codex CLI 指令
# 模型会按照编码助手的方式回答，而不是简单回答 "2"
```

#### 问题 2: 硬编码 15,000+ 字符

**代码可读性**:
- 单行字符串长度约 15,000 字符
- 编辑器打开时可能卡顿
- 代码审查时无法清晰看到 prompt 内容

**版本控制问题**:
- Git diff 无法清晰显示 prompt 变化
- 难以追踪 OpenAI 官方 prompt 的更新历史

**示例对比**:
```javascript
// 当前代码（不可读）
req.body.instructions = 'You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI...[继续15000字符]'

// 理想代码（可读）
req.body.instructions = loadPrompt('default')
```

#### 问题 3: 缺少多版本 prompt 支持

根据 OpenAI Codex GitHub 仓库 (`openai/codex`)，官方维护了 3 个 prompt 文件：

| 文件 | 用途 | 当前状态 |
|------|------|---------|
| `codex-rs/core/prompt.md` | 通用 Codex CLI prompt（默认） | ✅ 已实现（硬编码） |
| `codex-rs/core/gpt_5_codex_prompt.md` | GPT-5-Codex 专用 prompt | ❌ 缺失 |
| `codex-rs/core/review_prompt.md` | 代码审查场景 prompt | ❌ 缺失 |

**影响**:
- 使用 `gpt-5-codex` 模型时，无法使用针对性优化的 prompt
- 无法支持代码审查场景（需要不同的系统指令）

---

## 四、短期修复方案（立即执行）

### 4.1 修复目标

- ✅ 移除强制注入默认 prompt 的逻辑
- ✅ 与 `openaiToClaude.js` 保持一致的设计
- ✅ 尊重用户意图，不设置未请求的默认值

### 4.2 修复代码

**文件**: `src/routes/openaiRoutes.js`
**行号**: Line 316-324

#### 修复前（当前代码）

```javascript
// 设置 instructions（优先使用用户的 system message，否则使用 Codex CLI 默认值）
if (systemMessage) {
  // 使用用户自定义的 system message
  req.body.instructions = systemMessage
  logger.info(`📝 Using custom system message (${systemMessage.length} chars)`)
} else {
  // ❌ 问题：强制注入
  req.body.instructions = '<15000+ 字符硬编码 prompt>'
}
```

#### 修复后（建议代码）

```javascript
// 设置 instructions（仅在用户提供 system message 时设置）
if (systemMessage) {
  // 使用用户自定义的 system message
  req.body.instructions = systemMessage
  logger.info(`📝 Using custom system message (${systemMessage.length} chars)`)
}
// 不设置 else 分支，让 Codex API 使用其默认行为
// 这与 openaiToClaude.js 的逻辑保持一致（参考 v1.1.184 修复）
```

### 4.3 修复效果

| 场景 | 修复前 | 修复后 | 改进 |
|------|-------|--------|------|
| 用户提供 system message | ✅ 使用用户的 | ✅ 使用用户的 | 无变化 |
| 用户未提供 system message | ❌ 强制注入 15,000+ 字符 | ✅ 不设置（使用 API 默认） | ✅ 尊重用户意图 |
| Codex CLI 请求 | ✅ 不受影响 | ✅ 不受影响 | 无变化 |
| Token 成本 | 每次 +15,000 tokens | 0 额外 tokens | 节省 $0.02/请求 |

### 4.4 向后兼容性

**影响评估**:
- ✅ 对 Codex CLI 客户端无影响（通过 `isCodexCLI` 判断已排除）
- ⚠️ 对依赖默认 prompt 的用户有影响（见下方迁移指南）

**迁移指南**:

如果现有用户确实需要 Codex CLI 行为，可以显式在请求中添加 system message：

```javascript
// 修复前：自动注入
{
  "model": "gpt-5",
  "messages": [
    {"role": "user", "content": "fix this bug"}
  ]
}
// 自动得到 Codex CLI 行为

// 修复后：显式指定
{
  "model": "gpt-5",
  "messages": [
    {
      "role": "system",
      "content": "You are a coding agent running in the Codex CLI..."
    },
    {"role": "user", "content": "fix this bug"}
  ]
}
```

或者，提供环境变量控制（参见长期方案）。

---

## 五、长期优化方案（下一版本）

### 5.1 优化目标

- ✅ 支持多个 prompt 版本（default、gpt-5-codex、review）
- ✅ 从外部文件加载 prompt，便于维护和更新
- ✅ 根据模型和场景动态选择 prompt
- ✅ 提供环境变量控制是否启用默认 prompt
- ✅ 保持与 OpenAI 官方 prompt 文件的同步

### 5.2 架构设计

#### 目录结构

```
claude-relay-service/
├── resources/
│   └── codex-prompts/
│       ├── README.md                    # prompt 文件说明
│       ├── default.txt                  # 通用 Codex CLI prompt
│       ├── gpt-5-codex.txt             # GPT-5-Codex 专用 prompt
│       └── review.txt                   # 代码审查场景 prompt
├── src/
│   ├── utils/
│   │   └── promptLoader.js             # Prompt 加载器（新增）
│   └── routes/
│       └── openaiRoutes.js             # 修改：使用 promptLoader
└── .env.example                         # 更新：添加新环境变量
```

#### 核心模块设计

##### 1. Prompt 加载器（`src/utils/promptLoader.js`）

```javascript
const fs = require('fs')
const path = require('path')
const logger = require('./logger')

/**
 * Codex Prompt 加载器
 * 从外部文件加载 OpenAI Codex 官方 prompt
 */
class PromptLoader {
  constructor() {
    this.prompts = {}
    this.promptDir = path.join(__dirname, '../../resources/codex-prompts')
    this.loadPrompts()
  }

  /**
   * 启动时加载所有 prompt 文件到内存
   */
  loadPrompts() {
    try {
      const promptFiles = {
        default: 'default.txt',
        'gpt-5-codex': 'gpt-5-codex.txt',
        review: 'review.txt'
      }

      for (const [key, filename] of Object.entries(promptFiles)) {
        const filePath = path.join(this.promptDir, filename)
        if (fs.existsSync(filePath)) {
          this.prompts[key] = fs.readFileSync(filePath, 'utf-8')
          logger.info(`✅ Loaded Codex prompt: ${key} (${this.prompts[key].length} chars)`)
        } else {
          logger.warn(`⚠️  Codex prompt file not found: ${filename}`)
        }
      }
    } catch (error) {
      logger.error('❌ Failed to load Codex prompts:', error)
    }
  }

  /**
   * 根据模型和场景获取对应的 prompt
   * @param {string} model - 模型名称（如 'gpt-5', 'gpt-5-codex'）
   * @param {string} scenario - 场景类型（如 'default', 'review'）
   * @returns {string|null} - 返回 prompt 字符串，如果不存在则返回 null
   */
  getPrompt(model, scenario = 'default') {
    // 优先级 1: 特定场景
    if (scenario !== 'default' && this.prompts[scenario]) {
      logger.debug(`📄 Using ${scenario} prompt for model ${model}`)
      return this.prompts[scenario]
    }

    // 优先级 2: 模型专用 prompt
    if (model === 'gpt-5-codex' && this.prompts['gpt-5-codex']) {
      logger.debug(`📄 Using gpt-5-codex specific prompt`)
      return this.prompts['gpt-5-codex']
    }

    // 优先级 3: 默认 prompt
    if (this.prompts.default) {
      logger.debug(`📄 Using default Codex prompt for model ${model}`)
      return this.prompts.default
    }

    // 没有可用的 prompt
    logger.warn(`⚠️  No prompt available for model ${model}, scenario ${scenario}`)
    return null
  }

  /**
   * 重新加载所有 prompt 文件（用于热更新）
   */
  reload() {
    this.prompts = {}
    this.loadPrompts()
    logger.info('🔄 Codex prompts reloaded')
  }
}

// 单例模式
const promptLoader = new PromptLoader()

module.exports = {
  promptLoader,
  getPrompt: (model, scenario) => promptLoader.getPrompt(model, scenario)
}
```

##### 2. 环境变量配置（`.env.example`）

```bash
# ============================================
# Codex Prompt 管理配置
# ============================================

# 是否启用默认 Codex prompt 注入
# - true: 当用户未提供 system message 时，自动注入默认 prompt
# - false: 仅在用户提供 system message 时使用用户的内容（推荐）
CODEX_USE_DEFAULT_PROMPT=false

# 默认使用的 prompt 场景
# 可选值: default, review
CODEX_DEFAULT_SCENARIO=default

# Prompt 文件目录（可选，用于自定义 prompt 位置）
# 默认: resources/codex-prompts/
# CODEX_PROMPT_DIR=/custom/path/to/prompts
```

##### 3. 集成到 `openaiRoutes.js`

```javascript
const { getPrompt } = require('../utils/promptLoader')

// 在 handleResponses 函数中修改
const handleResponses = async (req, res) => {
  // ... [前面的代码保持不变]

  // 判断是否为 Codex CLI 的请求
  const isCodexCLI = req.body?.instructions?.startsWith(
    'You are a coding agent running in the Codex CLI'
  )

  // 如果不是 Codex CLI 请求，则进行适配
  if (!isCodexCLI) {
    // 提取 system message
    const systemMessages = req.body.messages?.filter((m) => m.role === 'system') || []
    const systemMessage =
      systemMessages.length > 0 ? systemMessages.map((m) => m.content).join('\n\n') : null

    // 转换 messages → input，并移除 system 消息
    if (req.body.messages && !req.body.input) {
      req.body.input = req.body.messages.filter((m) => m.role !== 'system')
      delete req.body.messages
      logger.info('📝 Converted messages → input for Codex API compatibility')
    }

    // ... [移除字段的代码保持不变]

    // ✅ 新逻辑：根据配置决定是否设置默认 prompt
    if (systemMessage) {
      // 优先级 1: 使用用户自定义的 system message
      req.body.instructions = systemMessage
      logger.info(`📝 Using custom system message (${systemMessage.length} chars)`)
    } else if (process.env.CODEX_USE_DEFAULT_PROMPT === 'true') {
      // 优先级 2: 如果配置启用，使用默认 prompt
      const scenario = process.env.CODEX_DEFAULT_SCENARIO || 'default'
      const defaultPrompt = getPrompt(requestedModel, scenario)

      if (defaultPrompt) {
        req.body.instructions = defaultPrompt
        logger.info(
          `📝 Using default ${scenario} prompt for ${requestedModel} (${defaultPrompt.length} chars)`
        )
      } else {
        logger.warn(
          `⚠️  CODEX_USE_DEFAULT_PROMPT=true but no prompt available for ${requestedModel}`
        )
      }
    }
    // 优先级 3: 不设置（让 API 使用默认行为）
    // 这是默认行为（CODEX_USE_DEFAULT_PROMPT=false 时）

    logger.info('📝 Non-Codex CLI request processed')
  } else {
    logger.info('✅ Codex CLI request detected, forwarding as-is')
  }

  // ... [后续代码保持不变]
}
```

### 5.3 Prompt 文件管理

#### README.md（`resources/codex-prompts/README.md`）

```markdown
# Codex Prompts

此目录包含 OpenAI Codex CLI 的系统提示词文件，来源于 OpenAI 官方仓库。

## 文件说明

| 文件 | 来源 | 用途 | 更新时间 |
|------|------|------|---------|
| `default.txt` | [openai/codex/codex-rs/core/prompt.md](https://github.com/openai/codex/blob/main/codex-rs/core/prompt.md) | 通用 Codex CLI prompt（默认） | 2025-10-31 |
| `gpt-5-codex.txt` | [openai/codex/codex-rs/core/gpt_5_codex_prompt.md](https://github.com/openai/codex/blob/main/codex-rs/core/gpt_5_codex_prompt.md) | GPT-5-Codex 专用 prompt | 2025-10-31 |
| `review.txt` | [openai/codex/codex-rs/core/review_prompt.md](https://github.com/openai/codex/blob/main/codex-rs/core/review_prompt.md) | 代码审查场景 prompt | 2025-10-31 |

## 更新流程

1. 定期检查 OpenAI 官方仓库更新
2. 下载最新的 prompt 文件
3. 对比差异并更新对应的 `.txt` 文件
4. 更新本 README 的"更新时间"列
5. 测试验证

## 同步命令

```bash
# 从 OpenAI 官方仓库同步最新 prompts
npm run sync:codex-prompts

# 或手动下载
curl -o resources/codex-prompts/default.txt https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/prompt.md
curl -o resources/codex-prompts/gpt-5-codex.txt https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/gpt_5_codex_prompt.md
curl -o resources/codex-prompts/review.txt https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/review_prompt.md
```

## 自定义 Prompt

如果需要自定义 prompt，可以：

1. 复制对应的文件（如 `default.txt` → `custom.txt`）
2. 修改 `src/utils/promptLoader.js` 添加新的 prompt 键
3. 通过环境变量 `CODEX_DEFAULT_SCENARIO=custom` 使用

## 许可证

这些 prompt 文件来源于 OpenAI Codex 项目，遵循其原始许可证。
```

### 5.4 同步脚本（`scripts/sync-codex-prompts.js`）

```javascript
#!/usr/bin/env node

/**
 * 同步 OpenAI Codex 官方 Prompts
 * 从 GitHub 下载最新的 prompt 文件
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const BASE_URL = 'https://raw.githubusercontent.com/openai/codex/main/codex-rs/core'
const OUTPUT_DIR = path.join(__dirname, '../resources/codex-prompts')

const PROMPT_FILES = {
  'prompt.md': 'default.txt',
  'gpt_5_codex_prompt.md': 'gpt-5-codex.txt',
  'review_prompt.md': 'review.txt'
}

async function downloadFile(sourceFile, targetFile) {
  const url = `${BASE_URL}/${sourceFile}`
  const outputPath = path.join(OUTPUT_DIR, targetFile)

  return new Promise((resolve, reject) => {
    console.log(`📥 Downloading ${sourceFile}...`)

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${url}`))
          return
        }

        const fileStream = fs.createWriteStream(outputPath)
        response.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close()
          console.log(`✅ Saved to ${targetFile}`)
          resolve()
        })
      })
      .on('error', (err) => {
        fs.unlink(outputPath, () => {}) // 删除不完整的文件
        reject(err)
      })
  })
}

async function main() {
  console.log('🔄 Syncing Codex prompts from OpenAI repository...\n')

  // 确保输出目录存在
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // 下载所有 prompt 文件
  for (const [sourceFile, targetFile] of Object.entries(PROMPT_FILES)) {
    try {
      await downloadFile(sourceFile, targetFile)
    } catch (error) {
      console.error(`❌ Failed to download ${sourceFile}:`, error.message)
    }
  }

  console.log('\n✨ Sync completed!')
}

main().catch(console.error)
```

添加到 `package.json`:

```json
{
  "scripts": {
    "sync:codex-prompts": "node scripts/sync-codex-prompts.js"
  }
}
```

---

## 六、实施步骤

### 6.1 短期修复（立即执行）

**预计耗时**: 30 分钟
**负责人**: 后端开发

1. ✅ **修改代码**（10 分钟）
   ```bash
   # 编辑文件
   code src/routes/openaiRoutes.js

   # 删除 Line 321-324 的 else 分支
   ```

2. ✅ **代码格式化**（5 分钟）
   ```bash
   npx prettier --write src/routes/openaiRoutes.js
   ```

3. ✅ **提交更改**（5 分钟）
   ```bash
   git add src/routes/openaiRoutes.js
   git commit -m "fix: remove forced Codex CLI prompt injection

- Remove else branch that forcefully injects 15,000+ char prompt
- Align with openaiToClaude.js logic (v1.1.184 fix)
- Respect user intent when no system message provided
- Let Codex API use its default behavior

Refs: CODE_AUDIT_REPORT_2025-10-31.md - Issue 1.1"
   ```

4. ✅ **测试验证**（10 分钟）
   - 测试用户提供 system message
   - 测试用户未提供 system message
   - 测试 Codex CLI 请求

### 6.2 长期优化（下一版本）

**预计耗时**: 4-6 小时
**负责人**: 后端开发 + DevOps

#### 阶段 1: 准备工作（1 小时）

1. ✅ **创建目录结构**
   ```bash
   mkdir -p resources/codex-prompts
   mkdir -p scripts
   ```

2. ✅ **下载官方 prompts**
   ```bash
   curl -o resources/codex-prompts/default.txt \
     https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/prompt.md

   curl -o resources/codex-prompts/gpt-5-codex.txt \
     https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/gpt_5_codex_prompt.md

   curl -o resources/codex-prompts/review.txt \
     https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/review_prompt.md
   ```

3. ✅ **创建 README 和同步脚本**
   - 创建 `resources/codex-prompts/README.md`
   - 创建 `scripts/sync-codex-prompts.js`

#### 阶段 2: 实现 Prompt Loader（1.5 小时）

1. ✅ **创建 promptLoader.js**
   ```bash
   code src/utils/promptLoader.js
   ```

2. ✅ **实现加载逻辑**
   - 启动时加载所有 prompt 文件
   - 实现 `getPrompt(model, scenario)` 方法
   - 实现 `reload()` 热更新方法

3. ✅ **单元测试**
   ```bash
   npm test -- src/utils/promptLoader.test.js
   ```

#### 阶段 3: 集成到 openaiRoutes（1 小时）

1. ✅ **引入 promptLoader**
   ```javascript
   const { getPrompt } = require('../utils/promptLoader')
   ```

2. ✅ **修改 instructions 设置逻辑**
   - 优先使用用户的 system message
   - 根据环境变量决定是否使用默认 prompt
   - 根据模型和场景选择对应的 prompt

3. ✅ **添加日志**
   ```javascript
   logger.info(`📝 Using ${scenario} prompt for ${model}`)
   ```

#### 阶段 4: 配置和文档（0.5 小时）

1. ✅ **更新 .env.example**
   ```bash
   echo "CODEX_USE_DEFAULT_PROMPT=false" >> .env.example
   echo "CODEX_DEFAULT_SCENARIO=default" >> .env.example
   ```

2. ✅ **更新 README.md**
   - 添加 Prompt 管理章节
   - 说明环境变量用途
   - 提供同步 prompt 的命令

3. ✅ **更新 CHANGELOG.md**
   - 记录新功能和变更

#### 阶段 5: 测试和验证（1 小时）

1. ✅ **功能测试**
   - 测试 `CODEX_USE_DEFAULT_PROMPT=false`（默认）
   - 测试 `CODEX_USE_DEFAULT_PROMPT=true`
   - 测试 `gpt-5-codex` 模型使用专用 prompt
   - 测试 `review` 场景切换

2. ✅ **性能测试**
   - 测试 prompt 加载时间
   - 测试内存占用
   - 测试并发请求

3. ✅ **回归测试**
   - 确保 Codex CLI 请求不受影响
   - 确保用户提供 system message 时正常工作

---

## 七、测试验证

### 7.1 短期修复测试

#### 测试用例 1: 用户提供 system message

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {"role": "system", "content": "You are a Python expert."},
      {"role": "user", "content": "Write hello world"}
    ]
  }'

# 期望: 使用用户的 system message
# 日志: 📝 Using custom system message (23 chars)
```

#### 测试用例 2: 用户未提供 system message

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {"role": "user", "content": "1+1=?"}
    ]
  }'

# 期望: 不设置 instructions，使用 API 默认行为
# 日志: 📝 Non-Codex CLI request processed
```

#### 测试用例 3: Codex CLI 请求

```bash
curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "instructions": "You are a coding agent running in the Codex CLI...",
    "input": [{"role": "user", "content": "fix bug"}]
  }'

# 期望: 原样转发，不修改 instructions
# 日志: ✅ Codex CLI request detected, forwarding as-is
```

### 7.2 长期优化测试

#### 测试用例 4: 默认 prompt（环境变量控制）

```bash
# 设置环境变量
export CODEX_USE_DEFAULT_PROMPT=true
export CODEX_DEFAULT_SCENARIO=default

curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {"role": "user", "content": "fix bug"}
    ]
  }'

# 期望: 使用 default.txt 的内容
# 日志: 📝 Using default default prompt for gpt-5 (15123 chars)
```

#### 测试用例 5: gpt-5-codex 专用 prompt

```bash
export CODEX_USE_DEFAULT_PROMPT=true

curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5-codex",
    "messages": [
      {"role": "user", "content": "refactor code"}
    ]
  }'

# 期望: 使用 gpt-5-codex.txt 的内容（如果存在）
# 日志: 📝 Using gpt-5-codex specific prompt
```

#### 测试用例 6: 代码审查场景

```bash
export CODEX_USE_DEFAULT_PROMPT=true
export CODEX_DEFAULT_SCENARIO=review

curl -X POST http://localhost:3000/api/v1/chat/completions \
  -H "Authorization: Bearer cr_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [
      {"role": "user", "content": "review this PR"}
    ]
  }'

# 期望: 使用 review.txt 的内容
# 日志: 📝 Using default review prompt for gpt-5 (12345 chars)
```

### 7.3 性能测试

```bash
# 测试 prompt 加载时间
npm run benchmark:prompt-loader

# 测试并发请求（1000 请求，100 并发）
ab -n 1000 -c 100 -H "Authorization: Bearer cr_xxx" \
  -p test-payload.json \
  http://localhost:3000/api/v1/chat/completions
```

---

## 八、风险评估

### 8.1 短期修复风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| 依赖默认 prompt 的用户受影响 | 低 | 中 | 提供迁移指南，通知用户显式添加 system message |
| Codex CLI 客户端受影响 | 极低 | 高 | 已通过 `isCodexCLI` 判断排除，无影响 |
| 向后兼容性问题 | 低 | 中 | 充分测试，提供回滚方案 |

### 8.2 长期优化风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| Prompt 文件缺失导致服务异常 | 低 | 中 | 实现文件存在性检查，记录警告日志 |
| OpenAI 更改 prompt 格式 | 中 | 低 | 定期同步官方仓库，测试验证 |
| 内存占用增加（多个 prompt 缓存） | 极低 | 低 | 所有 prompt 总计约 50KB，内存影响可忽略 |
| 环境变量配置错误 | 中 | 低 | 提供详细文档，默认值安全 |

### 8.3 回滚计划

如果修复后出现问题，可以快速回滚：

```bash
# 回滚短期修复
git revert <commit-hash>
git push

# 或者临时添加环境变量恢复旧行为
export CODEX_USE_DEFAULT_PROMPT=true
export CODEX_DEFAULT_SCENARIO=default
```

---

## 附录

### A. 相关文件清单

| 文件路径 | 描述 | 状态 |
|---------|------|------|
| `src/routes/openaiRoutes.js` | OpenAI 兼容路由（主要修改文件） | 修改 |
| `src/utils/promptLoader.js` | Prompt 加载器（新增） | 新增 |
| `resources/codex-prompts/default.txt` | 通用 Codex prompt | 新增 |
| `resources/codex-prompts/gpt-5-codex.txt` | GPT-5-Codex 专用 prompt | 新增 |
| `resources/codex-prompts/review.txt` | 代码审查 prompt | 新增 |
| `resources/codex-prompts/README.md` | Prompt 文件说明 | 新增 |
| `scripts/sync-codex-prompts.js` | 同步官方 prompts 脚本 | 新增 |
| `.env.example` | 环境变量示例 | 更新 |
| `README.md` | 项目文档 | 更新 |
| `CHANGELOG.md` | 变更日志 | 更新 |

### B. 参考资料

- OpenAI Codex GitHub: https://github.com/openai/codex
- Codex Prompts 目录: https://github.com/openai/codex/tree/main/codex-rs/core
- v1.1.184 修复说明: CHANGELOG.md#1.1.184
- 代码审计报告: CODE_AUDIT_REPORT_2025-10-31.md

### C. 更新历史

| 日期 | 版本 | 作者 | 变更说明 |
|------|------|------|---------|
| 2025-10-31 | 1.0 | Claude | 初始版本，基于代码审计报告 1.1 |

---

**文档状态**: ✅ 已完成
**下一步行动**: 立即执行短期修复 → 规划长期优化实施
