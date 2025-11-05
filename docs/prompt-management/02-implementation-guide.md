# Prompt 管理系统 - 实施指南

> **相关文档**：[架构设计](./01-architecture.md) | [v2.0.0 升级计划](../v2.0.0-prompt-management-plan-clean.md)

---

## 📋 实施步骤概览

```
阶段 1: 基础设施（2 小时）
├── 1.1 创建目录和文件（10 分钟）
├── 1.2 初始化 prompt 内容（20 分钟）
├── 1.3 实现 promptLoader.js（1 小时）
├── 1.4 添加配置块（10 分钟）
└── 1.5 在 app.js 初始化（5 分钟）

阶段 2: 服务改造（3 小时）
├── 2.1 修改 openaiRoutes.js（1 小时）
├── 2.2 修改 openaiToClaude.js（1 小时）
└── 2.3 修改 droidRelayService.js（1 小时）

阶段 3: Web 管理界面（3 小时）
├── 3.1 后端 API（1 小时）
└── 3.2 前端组件（2 小时）

阶段 4: 测试和验证（2 小时）
├── 4.1 单元测试（30 分钟）
├── 4.2 集成测试（1 小时）
└── 4.3 手动测试（30 分钟）
```

---

## 🚀 阶段 1: 基础设施

### 1.1 创建目录和文件

```bash
# 创建目录
mkdir -p resources/prompts

# 创建 prompt 文件
touch resources/prompts/codex.txt
touch resources/prompts/claude-code.txt
touch resources/prompts/droid.txt
touch resources/prompts/README.md
```

### 1.2 初始化 prompt 内容

#### codex.txt

从 `src/routes/openaiRoutes.js:283` 复制完整内容：

```text
You are a coding agent running in the Codex CLI, a terminal-based coding assistant. Codex CLI is an open source project led by OpenAI...
（完整 23,831 字符）
```

#### claude-code.txt

从 `src/services/openaiToClaude.js:35` 提取：

```text
You are Claude Code, Anthropic's official CLI for Claude.
```

#### droid.txt

从 `src/services/droidRelayService.js:12` 提取：

```text
You are Droid, an AI software engineering agent built by Factory.
```

#### README.md

```markdown
# System Prompts 管理

此目录存放所有服务的 system prompt 文件。

## 文件说明

- `codex.txt` - Codex CLI system prompt（~24KB）
- `claude-code.txt` - Claude Code system prompt（57 字符）
- `droid.txt` - Droid system prompt（65 字符）

## 使用方式

### 方式 1: Web 界面编辑（推荐）

访问管理界面的 "Prompts 管理" 页面，可以在线编辑所有 prompt。

### 方式 2: 直接编辑文件

1. 编辑对应的 .txt 文件
2. 重启服务生效（或等待热重载，如果启用）

## 配置

通过 `config/config.js` 的 `prompts` 配置块控制：

```javascript
prompts: {
  codex: { enabled: true },
  claudeCode: { enabled: true },
  droid: { enabled: true }
}
```

## 三级优先级

1. **P1（最高）**: 用户自定义 system message
2. **P2（默认）**: 配置默认 prompt（此目录的文件）
3. **P3（最低）**: 无注入（配置禁用时）
```

### 1.3 实现 promptLoader.js

**位置**: `src/services/promptLoader.js`

```javascript
const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

class PromptLoader {
  constructor() {
    this.promptsDir = path.join(process.cwd(), 'resources', 'prompts')
    this.prompts = {
      codex: null,
      claudeCode: null,
      droid: null
    }
    this.loaded = false
    this.fileMap = {
      codex: 'codex.txt',
      claudeCode: 'claude-code.txt',
      droid: 'droid.txt'
    }
  }

  /**
   * 初始化：一次性加载所有 prompts
   */
  async initialize() {
    try {
      // 确保目录存在
      if (!fs.existsSync(this.promptsDir)) {
        throw new Error(`Prompts directory not found: ${this.promptsDir}`)
      }

      // 加载所有 prompt 文件
      for (const [service, filename] of Object.entries(this.fileMap)) {
        const filePath = path.join(this.promptsDir, filename)

        // 关键文件缺失应拒绝启动（fail fast）
        if (!fs.existsSync(filePath)) {
          throw new Error(`Critical prompt file missing: ${filename}. Please ensure all prompt files exist in ${this.promptsDir}`)
        }

        try {
          this.prompts[service] = fs.readFileSync(filePath, 'utf8')
          logger.info(`✅ Loaded ${service} prompt (${this.prompts[service].length} chars)`)
        } catch (error) {
          logger.error(`❌ Failed to load ${service} prompt from ${filename}:`, error)
          throw error  // 读取失败也应该拒绝启动
        }
      }

      this.loaded = true
      logger.success('💬 Prompt loader initialized successfully')

      // 显示统计
      const loadedCount = Object.values(this.prompts).filter(p => p !== null).length
      logger.info(`📊 Loaded ${loadedCount}/${Object.keys(this.prompts).length} prompts`)
    } catch (error) {
      logger.error('❌ Failed to initialize prompt loader:', error)
      throw error
    }
  }

  /**
   * 获取指定服务的 prompt
   * @param {string} service - 服务名称 ('codex' | 'claudeCode' | 'droid')
   * @returns {string | null} - prompt 内容，未找到返回 null
   */
  getPrompt(service) {
    if (!this.loaded) {
      logger.warn('⚠️ Prompt loader not initialized, returning null')
      return null
    }

    if (!this.prompts.hasOwnProperty(service)) {
      logger.warn(`⚠️ Invalid service: ${service}`)
      return null
    }

    return this.prompts[service]
  }

  /**
   * 重新加载所有 prompts（用于热重载）
   */
  async reload() {
    logger.info('🔄 Reloading all prompts...')
    this.loaded = false
    await this.initialize()
  }

  /**
   * 获取健康状态
   */
  getHealthStatus() {
    const status = {
      loaded: this.loaded,
      prompts: {}
    }

    for (const [service, content] of Object.entries(this.prompts)) {
      status.prompts[service] = {
        available: content !== null,
        length: content ? content.length : 0
      }
    }

    return status
  }
}

// 导出单例
module.exports = new PromptLoader()
```

### 1.4 添加配置块

**位置**: `config/config.example.js`（在 bedrock 配置块之后）

```javascript
// ... bedrock 配置 ...

// 💬 Prompt 管理配置
prompts: {
  // Codex prompt 配置
  codex: {
    enabled: process.env.CODEX_PROMPT_ENABLED !== 'false'  // 默认启用
  },

  // Claude Code prompt 配置
  claudeCode: {
    enabled: process.env.CLAUDE_CODE_PROMPT_ENABLED !== 'false'  // 默认启用
  },

  // Droid prompt 配置
  droid: {
    enabled: process.env.DROID_PROMPT_ENABLED !== 'false'  // 默认启用
  }
}
```

**同时添加到 `.env.example`**:

```bash
# Prompt 管理配置
# CODEX_PROMPT_ENABLED=true
# CLAUDE_CODE_PROMPT_ENABLED=true
# DROID_PROMPT_ENABLED=true
```

### 1.5 在 app.js 初始化

**位置**: `src/app.js` 或主启动文件

```javascript
const promptLoader = require('./services/promptLoader')

// 在服务器启动前初始化
async function initializeServices() {
  try {
    // ... 其他初始化 ...

    // 初始化 prompt loader
    logger.info('🚀 Initializing prompt loader...')
    await promptLoader.initialize()

    // ... 其他初始化 ...
  } catch (error) {
    logger.error('❌ Service initialization failed:', error)
    process.exit(1)
  }
}

// 启动服务器
async function startServer() {
  await initializeServices()

  app.listen(config.server.port, () => {
    logger.success(`✅ Server running on port ${config.server.port}`)
  })
}

startServer()
```

---

## 🔧 阶段 2: 服务改造

### 2.1 修改 openaiRoutes.js

**文件**: `src/routes/openaiRoutes.js`

**步骤 1**: 顶部添加依赖

```javascript
const promptLoader = require('../services/promptLoader')
const config = require('../../config/config')
```

**步骤 2**: 替换第 260-289 行

**删除原逻辑**:
```javascript
// 删除第 260-289 行的所有代码
```

**新逻辑**:
```javascript
// 三级优先级：Codex Prompt 注入
const userInstructions = req.body?.instructions

// P1: 用户自定义（最高优先级）
if (userInstructions && typeof userInstructions === 'string' && userInstructions.trim()) {
  // 保持用户的 instructions
  logger.info('📝 使用用户自定义 instructions')
} else if (config.prompts.codex.enabled) {
  // P2: 配置默认
  const defaultPrompt = promptLoader.getPrompt('codex')
  if (defaultPrompt) {
    req.body.instructions = defaultPrompt
    logger.info('📝 使用 Codex 默认 prompt（来自 promptLoader）')
  } else {
    logger.warn('⚠️ Codex prompt 未找到，跳过注入')
  }
} else {
  // P3: 配置禁用
  logger.info('📝 Codex 默认 prompt 已被配置禁用')
}

// 移除不需要的字段（保持原逻辑）
const fieldsToRemove = [
  'temperature',
  'top_p',
  'max_output_tokens',
  'user',
  'text_formatting',
  'truncation',
  'text',
  'service_tier'
]
fieldsToRemove.forEach((field) => {
  delete req.body[field]
})
```

---

### 2.2 修改 openaiToClaude.js

**文件**: `src/services/openaiToClaude.js`

**步骤 1**: 顶部添加依赖

```javascript
const config = require('../../config/config')
const promptLoader = require('./promptLoader')
```

**步骤 2**: 修改 convertRequest 方法

**删除第 34-52 行的原逻辑**:
```javascript
// 删除所有 Xcode 检测和硬编码逻辑
```

**新逻辑（替换第 34-52 行）**:
```javascript
// 三级优先级：Claude Code System Prompt
const systemMessage = this._extractSystemMessage(openaiRequest.messages)

if (systemMessage && systemMessage.trim()) {
  // P1: 用户自定义（包括 Xcode 等所有格式）
  claudeRequest.system = systemMessage
  logger.debug(`📋 使用用户自定义 system prompt (${systemMessage.length} chars)`)
} else if (config.prompts.claudeCode.enabled) {
  // P2: 配置默认
  const defaultPrompt = promptLoader.getPrompt('claudeCode')
  if (defaultPrompt) {
    claudeRequest.system = defaultPrompt
    logger.debug('📋 使用 Claude Code 默认 prompt（来自 promptLoader）')
  } else {
    logger.warn('⚠️ Claude Code 默认 prompt 未找到，跳过注入')
  }
} else {
  // P3: 配置禁用
  logger.debug('📋 Claude Code 默认 prompt 已被配置禁用')
}
```

---

### 2.3 修改 droidRelayService.js

**文件**: `src/services/droidRelayService.js`

**步骤 1**: 顶部添加依赖

```javascript
const config = require('../../config/config')
const promptLoader = require('./promptLoader')
```

**步骤 2**: 删除硬编码常量

**删除第 12 行**:
```javascript
// 删除这行
const SYSTEM_PROMPT = 'You are Droid, an AI software engineering agent built by Factory.'
```

**删除第 29 行**:
```javascript
// 删除这行（在 constructor 中）
this.systemPrompt = SYSTEM_PROMPT
```

**步骤 3**: 修改 `_processRequestBody` 方法

**Anthropic 端点（第 1008-1022 行）**:

```javascript
// Anthropic 端点：注入系统提示
if (endpointType === 'anthropic') {
  if (config.prompts.droid.enabled) {
    const droidPrompt = promptLoader.getPrompt('droid')

    if (droidPrompt) {
      const promptBlock = { type: 'text', text: droidPrompt }
      if (Array.isArray(processedBody.system)) {
        // 检查是否已存在
        const hasPrompt = processedBody.system.some(
          (item) => item && item.type === 'text' && item.text === droidPrompt
        )
        if (!hasPrompt) {
          // 前置注入
          processedBody.system = [promptBlock, ...processedBody.system]
        }
      } else {
        // 覆盖（如果 system 不是数组）
        processedBody.system = [promptBlock]
      }
      logger.debug('📝 已注入 Droid prompt（来自 promptLoader）')
    } else {
      logger.warn('⚠️ Droid 默认 prompt 未找到，跳过注入')
    }
  } else {
    logger.debug('📝 Droid prompt 注入已被配置禁用')
  }
}
```

**OpenAI 端点（第 1024-1035 行）**:

```javascript
// OpenAI 端点：前置系统提示
if (endpointType === 'openai') {
  if (config.prompts.droid.enabled) {
    const droidPrompt = promptLoader.getPrompt('droid')

    if (droidPrompt) {
      if (processedBody.instructions) {
        // 避免重复注入
        if (!processedBody.instructions.startsWith(droidPrompt)) {
          processedBody.instructions = `${droidPrompt}\n\n${processedBody.instructions}`
        }
      } else {
        processedBody.instructions = droidPrompt
      }
      logger.debug('📝 已注入 Droid prompt（来自 promptLoader）')
    } else {
      logger.warn('⚠️ Droid 默认 prompt 未找到，跳过注入')
    }
  } else {
    logger.debug('📝 Droid prompt 注入已被配置禁用')
  }
}
```

---

## 🌐 阶段 3: Web 管理界面

### 3.1 后端 API

**文件**: `src/routes/admin.js`

**添加依赖**:
```javascript
const promptLoader = require('../services/promptLoader')
const fs = require('fs')
const path = require('path')
```

**GET /admin/prompts/:service**:

```javascript
/**
 * 获取 prompt 内容和元数据
 */
router.get('/prompts/:service', authenticateAdmin, async (req, res) => {
  try {
    const { service } = req.params
    const validServices = ['codex', 'claudeCode', 'droid']

    if (!validServices.includes(service)) {
      return res.status(400).json({
        error: 'Invalid service. Must be one of: codex, claudeCode, droid'
      })
    }

    const prompt = promptLoader.getPrompt(service)

    if (prompt === null) {
      return res.status(404).json({
        error: `Prompt not found for service: ${service}`
      })
    }

    // 获取文件元数据
    const fileMap = {
      codex: 'codex.txt',
      claudeCode: 'claude-code.txt',
      droid: 'droid.txt'
    }
    const filePath = path.join(process.cwd(), 'resources', 'prompts', fileMap[service])
    const stats = fs.statSync(filePath)

    res.json({
      service,
      content: prompt,
      length: prompt.length,
      lastModified: stats.mtime,
      enabled: config.prompts[service].enabled,
      filePath: fileMap[service]
    })
  } catch (error) {
    logger.error('Failed to get prompt:', error)
    res.status(500).json({ error: 'Failed to retrieve prompt' })
  }
})
```

**PUT /admin/prompts/:service**:

```javascript
/**
 * 更新 prompt 内容
 */
router.put('/prompts/:service', authenticateAdmin, async (req, res) => {
  try {
    const { service } = req.params
    const { content } = req.body
    const validServices = ['codex', 'claudeCode', 'droid']

    if (!validServices.includes(service)) {
      return res.status(400).json({ error: 'Invalid service' })
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' })
    }

    // 验证内容不为空
    if (content.trim() === '') {
      return res.status(400).json({ error: 'Prompt content cannot be empty' })
    }

    // 验证内容长度（1MB 限制）
    const MAX_PROMPT_SIZE = 1 * 1024 * 1024  // 1MB
    if (content.length > MAX_PROMPT_SIZE) {
      return res.status(400).json({
        error: `Prompt too large. Maximum size is ${MAX_PROMPT_SIZE} bytes (${(MAX_PROMPT_SIZE / 1024 / 1024).toFixed(1)}MB)`
      })
    }

    // 验证 Unicode 内容（防止控制字符和日志注入）
    // 允许：常规字符、空格、换行、制表符
    // 禁止：控制字符（除了 \n \r \t）、零宽字符、方向控制符（包括 RTL override）等
    const invalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\u2060-\u206F\u202A-\u202E]/g
    if (invalidChars.test(content)) {
      return res.status(400).json({
        error: 'Prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)'
      })
    }

    // 保存文件
    const fileMap = {
      codex: 'codex.txt',
      claudeCode: 'claude-code.txt',
      droid: 'droid.txt'
    }
    const filePath = path.join(process.cwd(), 'resources', 'prompts', fileMap[service])
    fs.writeFileSync(filePath, content, 'utf8')

    // 触发热重载
    await promptLoader.reload()

    logger.info(`✅ Updated ${service} prompt (${content.length} chars)`)

    res.json({
      success: true,
      service,
      length: content.length,
      message: `Prompt updated successfully`
    })
  } catch (error) {
    logger.error('Failed to update prompt:', error)
    res.status(500).json({ error: 'Failed to update prompt' })
  }
})
```

**POST /admin/prompts/:service/upload** - 文件上传：

```javascript
const multer = require('multer')
const upload = multer({ storage: multer.memoryStorage() })

/**
 * 上传 prompt 文件
 */
router.post('/prompts/:service/upload', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    const { service } = req.params
    const validServices = ['codex', 'claudeCode', 'droid']

    if (!validServices.includes(service)) {
      return res.status(400).json({ error: 'Invalid service' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const content = req.file.buffer.toString('utf8')

    // 复用现有的验证逻辑
    if (content.trim() === '') {
      return res.status(400).json({ error: 'Prompt content cannot be empty' })
    }

    const MAX_PROMPT_SIZE = 1 * 1024 * 1024  // 1MB
    if (content.length > MAX_PROMPT_SIZE) {
      return res.status(400).json({
        error: `Prompt too large. Maximum size is ${MAX_PROMPT_SIZE} bytes (${(MAX_PROMPT_SIZE / 1024 / 1024).toFixed(1)}MB)`
      })
    }

    const invalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\u2060-\u206F\u202A-\u202E]/g
    if (invalidChars.test(content)) {
      return res.status(400).json({
        error: 'Prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)'
      })
    }

    // 保存文件
    const fileMap = {
      codex: 'codex.txt',
      claudeCode: 'claude-code.txt',
      droid: 'droid.txt'
    }
    const filePath = path.join(process.cwd(), 'resources', 'prompts', fileMap[service])
    fs.writeFileSync(filePath, content, 'utf8')

    // 热重载
    await promptLoader.reload()

    logger.info(`✅ Uploaded ${service} prompt from file: ${req.file.originalname} (${content.length} chars)`)

    res.json({
      success: true,
      service,
      length: content.length,
      source: 'upload',
      originalName: req.file.originalname,
      message: 'Prompt uploaded successfully'
    })
  } catch (error) {
    logger.error('Failed to upload prompt:', error)
    res.status(500).json({ error: 'Failed to upload prompt' })
  }
})
```

**POST /admin/prompts/:service/import-url** - 从 URL 导入：

```javascript
const https = require('https')

/**
 * 从 URL 导入 prompt
 */
router.post('/prompts/:service/import-url', authenticateAdmin, async (req, res) => {
  try {
    const { service } = req.params
    const { url, validate = true } = req.body
    const validServices = ['codex', 'claudeCode', 'droid']

    if (!validServices.includes(service)) {
      return res.status(400).json({ error: 'Invalid service' })
    }

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' })
    }

    // URL 验证（只允许 https）
    let parsedUrl
    try {
      parsedUrl = new URL(url)
      if (parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'Only HTTPS URLs are allowed for security' })
      }
    } catch (error) {
      return res.status(400).json({ error: 'Invalid URL format' })
    }

    // 下载内容
    const content = await downloadFromUrl(url)

    // 复用现有的验证逻辑
    if (content.trim() === '') {
      return res.status(400).json({ error: 'Downloaded prompt is empty' })
    }

    const MAX_PROMPT_SIZE = 1 * 1024 * 1024  // 1MB
    if (content.length > MAX_PROMPT_SIZE) {
      return res.status(400).json({
        error: `Downloaded prompt too large. Maximum size is ${MAX_PROMPT_SIZE} bytes (${(MAX_PROMPT_SIZE / 1024 / 1024).toFixed(1)}MB)`
      })
    }

    const invalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\u200B-\u200D\u2060-\u206F\u202A-\u202E]/g
    if (invalidChars.test(content)) {
      return res.status(400).json({
        error: 'Downloaded prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)'
      })
    }

    // 如果 validate=true，先返回预览，不保存
    if (validate) {
      return res.json({
        validated: true,
        preview: content.substring(0, 500) + (content.length > 500 ? '...' : ''),
        length: content.length,
        url,
        message: 'Validation successful. Send again with validate=false to save.'
      })
    }

    // 保存文件
    const fileMap = {
      codex: 'codex.txt',
      claudeCode: 'claude-code.txt',
      droid: 'droid.txt'
    }
    const filePath = path.join(process.cwd(), 'resources', 'prompts', fileMap[service])
    fs.writeFileSync(filePath, content, 'utf8')

    // 热重载
    await promptLoader.reload()

    logger.info(`✅ Imported ${service} prompt from URL: ${url} (${content.length} chars)`)

    res.json({
      success: true,
      service,
      length: content.length,
      source: 'url',
      url,
      message: 'Prompt imported successfully'
    })
  } catch (error) {
    logger.error('Failed to import prompt from URL:', error)
    res.status(500).json({ error: 'Failed to import prompt from URL: ' + error.message })
  }
})

/**
 * 辅助函数：从 URL 下载内容
 * @param {string} url - HTTPS URL
 * @param {number} timeout - 超时时间（毫秒），默认30秒
 */
function downloadFromUrl(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Download timeout after 30 seconds'))
    }, timeout)

    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        clearTimeout(timer)
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`))
        return
      }

      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        clearTimeout(timer)
        resolve(data)
      })
    }).on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
```

---

### 3.2 前端组件

**文件**: `web/admin-spa/src/views/PromptsView.vue`

```vue
<template>
  <div class="prompts-management p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
    <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">
      System Prompts 管理
    </h1>

    <div class="space-y-6">
      <div
        v-for="service in services"
        :key="service.id"
        class="prompt-editor border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex justify-between items-center mb-3">
          <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200">
            {{ service.name }}
          </h2>
          <span
            v-if="prompts[service.id]"
            class="text-sm text-gray-500 dark:text-gray-400"
          >
            {{ prompts[service.id].length }} 字符
          </span>
        </div>

        <textarea
          v-model="prompts[service.id]"
          :rows="service.id === 'codex' ? 30 : 3"
          class="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-md
                 font-mono text-sm bg-gray-50 dark:bg-gray-900
                 text-gray-900 dark:text-gray-100
                 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          :placeholder="`输入 ${service.name} 的 system prompt...`"
        />

        <div class="flex justify-between items-center mt-3">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            <span v-if="metadata[service.id]?.lastModified">
              最后修改: {{ formatDate(metadata[service.id].lastModified) }}
            </span>
          </div>
          <button
            @click="savePrompt(service.id)"
            :disabled="saving[service.id]"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700
                   disabled:bg-gray-400 disabled:cursor-not-allowed
                   transition-colors"
          >
            {{ saving[service.id] ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, onMounted } from 'vue'
import axios from 'axios'

export default {
  name: 'PromptsView',
  setup() {
    const services = [
      { id: 'codex', name: 'Codex CLI' },
      { id: 'claudeCode', name: 'Claude Code' },
      { id: 'droid', name: 'Droid' }
    ]

    const prompts = ref({
      codex: '',
      claudeCode: '',
      droid: ''
    })

    const metadata = ref({})
    const saving = ref({})

    const loadPrompts = async () => {
      for (const service of services) {
        try {
          const response = await axios.get(`/admin/prompts/${service.id}`)
          prompts.value[service.id] = response.data.content
          metadata.value[service.id] = {
            lastModified: response.data.lastModified,
            enabled: response.data.enabled
          }
        } catch (error) {
          console.error(`Failed to load ${service.id} prompt:`, error)
        }
      }
    }

    const savePrompt = async (serviceId) => {
      saving.value[serviceId] = true
      try {
        await axios.put(`/admin/prompts/${serviceId}`, {
          content: prompts.value[serviceId]
        })
        alert(`${services.find(s => s.id === serviceId).name} prompt 保存成功！`)
        await loadPrompts() // 重新加载以更新元数据
      } catch (error) {
        console.error('Failed to save prompt:', error)
        alert('保存失败：' + (error.response?.data?.error || error.message))
      } finally {
        saving.value[serviceId] = false
      }
    }

    const formatDate = (dateString) => {
      return new Date(dateString).toLocaleString('zh-CN')
    }

    onMounted(() => {
      loadPrompts()
    })

    return {
      services,
      prompts,
      metadata,
      saving,
      savePrompt,
      formatDate
    }
  }
}
</script>
```

**添加路由**（`web/admin-spa/src/router/index.js`）:

```javascript
{
  path: '/prompts',
  name: 'Prompts',
  component: () => import('../views/PromptsView.vue'),
  meta: { requiresAuth: true }
}
```

**添加导航菜单**（`web/admin-spa/src/components/Navigation.vue`）:

```vue
<router-link
  to="/prompts"
  class="nav-link flex items-center space-x-2 px-4 py-2 rounded-md
         text-gray-700 dark:text-gray-200
         hover:bg-gray-100 dark:hover:bg-gray-700"
>
  <span>💬</span>
  <span>Prompts 管理</span>
</router-link>
```

---

## ✅ 阶段 4: 测试和验证

### 4.1 单元测试脚本

**文件**: `scripts/test-prompt-loader.js`

参见 [测试计划文档](./04-testing-plan.md#单元测试)

### 4.2 集成测试脚本

**文件**: `scripts/test-integration-prompts.js`

参见 [测试计划文档](./04-testing-plan.md#集成测试)

### 4.3 手动测试清单

参见 [测试计划文档](./04-testing-plan.md#手动测试)

---

## 📋 实施检查清单

### 阶段 1: 基础设施

- [ ] 创建 `resources/prompts/` 目录
- [ ] 创建 3 个 prompt 文件并初始化内容
- [ ] 创建 README.md
- [ ] 实现 `promptLoader.js`
- [ ] 添加 `config.prompts` 配置块
- [ ] 更新 `.env.example`
- [ ] 在 `app.js` 添加初始化代码

### 阶段 2: 服务改造

- [ ] 修改 `openaiRoutes.js`（添加依赖 + 替换逻辑）
- [ ] 修改 `openaiToClaude.js`（添加依赖 + 替换逻辑）
- [ ] 修改 `droidRelayService.js`（删除常量 + 改造逻辑）
- [ ] 验证所有服务编译通过

### 阶段 3: Web 管理界面

- [ ] 在 `admin.js` 添加 GET API
- [ ] 在 `admin.js` 添加 PUT API
- [ ] 创建 `PromptsView.vue` 组件
- [ ] 添加路由配置
- [ ] 添加导航菜单项
- [ ] 验证 Web 界面可访问

### 阶段 4: 测试

- [ ] 创建单元测试脚本
- [ ] 创建集成测试脚本
- [ ] 运行所有测试
- [ ] 手动测试 Web 编辑功能
- [ ] 验证向后兼容性

### 部署准备

- [ ] 运行 `npm run lint`
- [ ] 更新 `README.md`（提到 Prompt 管理功能）
- [ ] 提交前完整回归测试
- [ ] 准备回滚方案

---

## 🔄 代码审查要点

### 关键变更点

1. **promptLoader.js**: 新文件，核心逻辑
2. **openaiRoutes.js**: 删除 30 行硬编码，替换为 20 行三级优先级
3. **openaiToClaude.js**: 删除 19 行 Xcode 检测，替换为 13 行三级优先级
4. **droidRelayService.js**: 删除 2 行常量，修改 2 处注入逻辑

### 审查清单

- [ ] 所有硬编码已移除
- [ ] 三级优先级逻辑一致
- [ ] promptLoader 单例正确导出
- [ ] 配置块格式正确
- [ ] Web API 有认证保护
- [ ] 错误处理完整
- [ ] 日志记录清晰

---

## 🚨 常见问题

### Q1: promptLoader 初始化失败怎么办？

**原因**：文件不存在或权限问题

**解决**：
1. 检查 `resources/prompts/` 目录是否存在
2. 检查 3 个 .txt 文件是否存在
3. 检查文件权限（可读）

### Q2: 配置禁用后还在注入？

**原因**：配置未正确加载

**解决**：
1. 检查 `config.prompts.{service}.enabled` 值
2. 重启服务确保配置生效
3. 检查日志中的 P3 消息

### Q3: Web 编辑保存后不生效？

**原因**：热重载未调用

**解决**：
1. 检查 `promptLoader.reload()` 是否被调用
2. 检查文件是否正确写入
3. 重启服务强制重新加载

---

## 📚 相关资源

- [架构设计](./01-architecture.md)
- [API 规范](./03-api-specification.md)
- [测试计划](./04-testing-plan.md)
- [迁移指南](./05-migration-guide.md)
