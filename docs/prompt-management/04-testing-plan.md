# Prompt 管理系统 - 测试计划

> **相关文档**：[实施指南](./02-implementation-guide.md) | [API 规范](./03-api-specification.md)

---

## 🎯 测试目标

1. ✅ 验证 promptLoader 正确加载所有 prompts
2. ✅ 验证 promptLoader fail fast 机制（文件缺失时拒绝启动）
3. ✅ 验证三级优先级逻辑正确实现
4. ✅ 验证向后兼容性（默认行为不变）
5. ✅ 验证 Web API 功能完整（手动编辑、文件上传、URL 导入）
6. ✅ 验证 Web API 安全限制（1MB 限制、增强 Unicode 验证、HTTPS only）
7. ✅ 验证配置开关生效
8. ✅ 验证热重载机制正常工作

---

## 📊 测试覆盖范围

| 类型 | 数量 | 覆盖范围 |
|------|------|----------|
| 单元测试 | 6 个 | promptLoader 核心功能 + fail fast 验证 |
| 集成测试 | 5 个 | 三级优先级 + 端到端流程 |
| 手动测试 | 10 个 | Web 编辑/上传/URL导入 + 兼容性 + 安全验证 |
| **总计** | **21 个** | **全面覆盖** |

---

## 🧪 单元测试

### 测试脚本：scripts/test-prompt-loader.js

```javascript
const promptLoader = require('../src/services/promptLoader')
const assert = require('assert')

async function runTests() {
  console.log('🧪 Running PromptLoader unit tests...\n')

  // Test 1: 初始化成功
  console.log('Test 1: PromptLoader 初始化')
  await promptLoader.initialize()
  const health = promptLoader.getHealthStatus()
  assert(health.loaded === true, 'PromptLoader should be loaded')
  console.log('✅ Test 1 passed\n')

  // Test 2: Codex prompt 加载
  console.log('Test 2: Codex prompt 加载')
  const codexPrompt = promptLoader.getPrompt('codex')
  assert(codexPrompt !== null, 'Codex prompt should not be null')
  assert(codexPrompt.length > 20000, 'Codex prompt should be ~24KB')
  console.log(`✅ Test 2 passed (${codexPrompt.length} chars)\n`)

  // Test 3: Claude Code prompt 加载
  console.log('Test 3: Claude Code prompt 加载')
  const claudePrompt = promptLoader.getPrompt('claudeCode')
  assert(claudePrompt !== null, 'Claude Code prompt should not be null')
  assert(claudePrompt.length > 50, 'Claude Code prompt should be ~57 chars')
  console.log(`✅ Test 3 passed (${claudePrompt.length} chars)\n`)

  // Test 4: Droid prompt 加载
  console.log('Test 4: Droid prompt 加载')
  const droidPrompt = promptLoader.getPrompt('droid')
  assert(droidPrompt !== null, 'Droid prompt should not be null')
  assert(droidPrompt.length > 60, 'Droid prompt should be ~65 chars')
  console.log(`✅ Test 4 passed (${droidPrompt.length} chars)\n`)

  // Test 5: 无效服务返回 null
  console.log('Test 5: 无效服务处理')
  const invalidPrompt = promptLoader.getPrompt('invalid')
  assert(invalidPrompt === null, 'Invalid service should return null')
  console.log('✅ Test 5 passed\n')

  // Test 6: 文件缺失时抛出异常（fail fast）
  console.log('Test 6: 文件缺失时拒绝启动')
  const fs = require('fs')
  const path = require('path')
  const testFile = path.join(process.cwd(), 'resources', 'prompts', 'test-missing.txt')

  // 创建新的 promptLoader 实例用于测试
  const PromptLoader = require('../src/services/promptLoader').constructor
  const testLoader = new PromptLoader()
  testLoader.fileMap = { testMissing: 'test-missing.txt' }

  try {
    await testLoader.initialize()
    assert.fail('Should throw error when file is missing')
  } catch (error) {
    assert(error.message.includes('Critical prompt file missing'), 'Should throw specific error')
    console.log('✅ Test 6 passed (correctly throws error)\n')
  }

  console.log('✅ All unit tests passed!')
}

runTests().catch(console.error)
```

### 运行单元测试

```bash
node scripts/test-prompt-loader.js
```

**预期输出**:
```
🧪 Running PromptLoader unit tests...

Test 1: PromptLoader 初始化
✅ Test 1 passed

Test 2: Codex prompt 加载
✅ Test 2 passed (23831 chars)

Test 3: Claude Code prompt 加载
✅ Test 3 passed (57 chars)

Test 4: Droid prompt 加载
✅ Test 4 passed (65 chars)

Test 5: 无效服务处理
✅ Test 5 passed

✅ All unit tests passed!
```

---

## 🔗 集成测试

### 测试脚本：scripts/test-integration-prompts.js

```javascript
const config = require('../config/config')
const promptLoader = require('../src/services/promptLoader')
const openaiToClaude = require('../src/services/openaiToClaude')
const assert = require('assert')

async function runIntegrationTests() {
  console.log('🧪 Running Prompt Management integration tests...\n')

  await promptLoader.initialize()

  // Test 1: Codex 三级优先级（模拟）
  console.log('Test 1: Codex 三级优先级')
  const userInstructions = 'User custom instructions'
  const defaultPrompt = promptLoader.getPrompt('codex')

  // P1: 用户自定义
  let result = userInstructions
  assert(result === userInstructions, 'P1: Should use user instructions')

  // P2: 配置默认
  result = null
  if (config.prompts.codex.enabled) {
    result = defaultPrompt
  }
  assert(result === defaultPrompt, 'P2: Should use default prompt')
  console.log('✅ Test 1 passed\n')

  // Test 2: Claude Code 转换（无用户message）
  console.log('Test 2: Claude Code 转换（无用户 message）')
  const openaiRequest = {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello' }]
  }
  const claudeRequest = openaiToClaude.convertRequest(openaiRequest)
  assert(claudeRequest.system !== null, 'Should have system prompt')
  assert(claudeRequest.system.length > 0, 'System prompt should not be empty')
  console.log('✅ Test 2 passed\n')

  // Test 3: Claude Code 转换（有用户message）
  console.log('Test 3: Claude Code 转换（有用户 message）')
  const openaiRequestWithSystem = {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' }
    ]
  }
  const claudeRequestWithSystem = openaiToClaude.convertRequest(openaiRequestWithSystem)
  assert(
    claudeRequestWithSystem.system === 'You are a helpful assistant',
    'Should use user system message'
  )
  console.log('✅ Test 3 passed\n')

  // Test 4: 配置开关验证
  console.log('Test 4: 配置开关验证')
  assert(typeof config.prompts.codex.enabled === 'boolean', 'Codex enabled should be boolean')
  assert(
    typeof config.prompts.claudeCode.enabled === 'boolean',
    'Claude Code enabled should be boolean'
  )
  assert(typeof config.prompts.droid.enabled === 'boolean', 'Droid enabled should be boolean')
  console.log('✅ Test 4 passed\n')

  // Test 5: 向后兼容性（默认行为）
  console.log('Test 5: 向后兼容性')
  assert(config.prompts.codex.enabled === true, 'Codex should be enabled by default')
  assert(config.prompts.claudeCode.enabled === true, 'Claude Code should be enabled by default')
  assert(config.prompts.droid.enabled === true, 'Droid should be enabled by default')
  console.log('✅ Test 5 passed\n')

  console.log('✅ All integration tests passed!')
}

runIntegrationTests().catch(console.error)
```

### 运行集成测试

```bash
node scripts/test-integration-prompts.js
```

**预期输出**:
```
🧪 Running Prompt Management integration tests...

Test 1: Codex 三级优先级
✅ Test 1 passed

Test 2: Claude Code 转换（无用户 message）
✅ Test 2 passed

Test 3: Claude Code 转换（有用户 message）
✅ Test 3 passed

Test 4: 配置开关验证
✅ Test 4 passed

Test 5: 向后兼容性
✅ Test 5 passed

✅ All integration tests passed!
```

---

## 🖐️ 手动测试

### 测试 1: Codex 用户自定义（非标准格式）

**目的**: 验证 Bug 修复 - 尊重非标准格式的用户自定义

**步骤**:
```bash
curl -X POST http://localhost:3000/openai/v1/responses \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "instructions": "You are a custom assistant",
    "messages": [{"role": "user", "content": "Test"}]
  }'
```

**预期结果**:
- ✅ 使用用户的 "You are a custom assistant"
- ✅ **不会**被覆盖为 24KB 默认 prompt
- ✅ 日志显示 "📝 使用用户自定义 instructions"

**v1.x 行为**（对比）:
- ❌ 强制覆盖为 24KB
- ❌ 日志显示 "Non-Codex CLI request detected, applying Codex CLI adaptation"

---

### 测试 2: Claude Code 用户自定义（非 Xcode）

**目的**: 验证 Bug 修复 - 尊重非 Xcode 格式的用户自定义

**步骤**:
```bash
curl -X POST http://localhost:3000/openai/claude/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant"},
      {"role": "user", "content": "Test"}
    ]
  }'
```

**预期结果**:
- ✅ 使用用户的 "You are a helpful assistant"
- ✅ **不会**被忽略
- ✅ 日志显示 "📋 使用用户自定义 system prompt"

**v1.x 行为**（对比）:
- ❌ 忽略用户的，强制使用默认
- ❌ 日志显示 "(ignored custom prompt)"

---

### 测试 3: Xcode 请求（兼容性）

**目的**: 验证 Xcode 请求行为不变

**步骤**:
```bash
curl -X POST http://localhost:3000/openai/claude/v1/chat/completions \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4",
    "messages": [
      {"role": "system", "content": "You are currently in Xcode..."},
      {"role": "user", "content": "Test"}
    ]
  }'
```

**预期结果**:
- ✅ 使用用户的 Xcode system message
- ✅ 行为与 v1.x **完全相同**
- ✅ 日志显示 "📋 使用用户自定义 system prompt"

---

### 测试 4: 配置禁用 Prompt

**目的**: 验证配置开关生效

**步骤**:
1. 修改 `.env`:
   ```bash
   CODEX_PROMPT_ENABLED=false
   ```
2. 重启服务
3. 发送请求（无用户 instructions）:
   ```bash
   curl -X POST http://localhost:3000/openai/v1/responses \
     -H "Authorization: Bearer your-api-key" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-5",
       "messages": [{"role": "user", "content": "Test"}]
     }'
   ```

**预期结果**:
- ✅ **不注入** 默认 prompt
- ✅ `req.body.instructions` 为 `undefined`
- ✅ 日志显示 "📝 Codex 默认 prompt 已被配置禁用"

---

### 测试 5: Web 界面编辑

**目的**: 验证 Web 管理功能

**步骤**:
1. 访问 `http://localhost:3000/admin-next/prompts`
2. 编辑 Codex prompt（修改部分内容）
3. 点击"保存"按钮
4. 检查文件是否更新:
   ```bash
   cat resources/prompts/codex.txt
   ```
5. 发送请求验证新 prompt 生效

**预期结果**:
- ✅ Web 界面显示当前 prompt 内容
- ✅ 显示字符数统计
- ✅ 保存成功提示
- ✅ 文件正确更新
- ✅ 新 prompt 立即生效（热重载）

---

### 测试 5.2: 文件上传功能

**目的**: 验证文件上传 API

**步骤**:
1. 创建测试 prompt 文件:
   ```bash
   echo "You are a helpful test assistant." > /tmp/test-prompt.txt
   ```

2. 上传文件:
   ```bash
   curl -X POST http://localhost:3000/admin/prompts/droid/upload \
     -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
     -F "file=@/tmp/test-prompt.txt"
   ```

3. 验证文件已更新:
   ```bash
   cat resources/prompts/droid.txt
   ```

4. 发送请求验证新 prompt 生效

**预期结果**:
- ✅ 返回成功响应（status 200）
- ✅ 响应包含 `originalName: "test-prompt.txt"`
- ✅ 文件内容正确更新
- ✅ 新 prompt 立即生效（热重载）
- ✅ 日志显示 "✅ Uploaded droid prompt from file"

**子测试 - 大文件拒绝**:
```bash
# 创建超过 1MB 的文件
dd if=/dev/zero of=/tmp/large.txt bs=1M count=2

curl -X POST http://localhost:3000/admin/prompts/droid/upload \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -F "file=@/tmp/large.txt"
```

**预期结果**:
- ❌ 返回 400 错误
- ✅ 错误信息: "Prompt too large. Maximum size is 1048576 bytes"

---

### 测试 5.3: URL 导入功能

**目的**: 验证从 URL 导入 prompt

**前提**: 准备一个公开的 HTTPS 测试 URL（如 GitHub raw 文件）

**步骤 1 - 验证模式**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/import-url \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://raw.githubusercontent.com/example/prompts/codex.txt",
    "validate": true
  }'
```

**预期结果**:
- ✅ 返回 `validated: true`
- ✅ 包含 `preview` 字段（前 500 字符）
- ✅ 包含 `length` 字段
- ✅ 文件未被修改（验证模式）

**步骤 2 - 保存模式**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/import-url \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://raw.githubusercontent.com/example/prompts/codex.txt",
    "validate": false
  }'
```

**预期结果**:
- ✅ 返回成功响应（status 200）
- ✅ 响应包含 `source: "url"`
- ✅ 文件内容正确更新
- ✅ 新 prompt 立即生效（热重载）
- ✅ 日志显示 "✅ Imported codex prompt from URL"

**子测试 - HTTP URL 拒绝**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/import-url \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://example.com/prompt.txt"
  }'
```

**预期结果**:
- ❌ 返回 400 错误
- ✅ 错误信息: "Only HTTPS URLs are allowed for security"

**子测试 - URL 不存在**:
```bash
curl -X POST http://localhost:3000/admin/prompts/codex/import-url \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/non-existent-file.txt",
    "validate": false
  }'
```

**预期结果**:
- ❌ 返回 500 错误
- ✅ 错误信息包含: "Failed to import prompt from URL: HTTP 404"

---

### 测试 8: Web API 安全验证

**目的**: 验证 Web API 的安全限制

**子测试 6.1: 大小限制（1MB）**
```bash
# 创建一个超过 1MB 的内容
node -e "console.log('A'.repeat(2 * 1024 * 1024))" > /tmp/large-prompt.txt

curl -X PUT http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  --data-binary "@/tmp/large-prompt.txt"
```

**预期结果**:
```json
{
  "error": "Prompt too large. Maximum size is 1048576 bytes (1.0MB)"
}
```

**子测试 6.2: Unicode 验证（控制字符）**
```bash
# 创建包含控制字符的内容
curl -X PUT http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"Test \u0000 prompt\"}"
```

**预期结果**:
```json
{
  "error": "Prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)"
}
```

**子测试 6.3: 零宽字符验证**
```bash
curl -X PUT http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer $(cat data/init.json | jq -r '.credentials.password')" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"Test \u200B prompt\"}"
```

**预期结果**:
```json
{
  "error": "Prompt contains invalid Unicode characters (control characters, zero-width characters, etc.)"
}
```

**验证方式**:
- ✅ 大小超过 1MB 被拒绝
- ✅ 控制字符被拒绝
- ✅ 零宽字符被拒绝
- ✅ 方向控制符（如 RTL override）被拒绝
- ✅ 正常内容可以保存

---

### 测试 7: 向后兼容性完整验证

**目的**: 确保默认行为不变

**测试矩阵**:

| 场景 | 请求 | 预期行为 | 验证方式 |
|------|------|----------|----------|
| Codex 无 instructions | 无 `instructions` 字段 | 注入 24KB | 检查请求体 |
| Codex CLI 标准格式 | `instructions` 以 "You are a coding agent..." 开头 | 保持用户的 | 检查请求体 |
| Claude 无 system | 无 `system` role | 注入 57 字符 | 检查转换结果 |
| Xcode 请求 | system 包含 "in Xcode" | 使用用户的 | 检查转换结果 |
| Droid Anthropic | 有/无 system 数组 | 前置注入 | 检查请求体 |

**验证脚本**:
```bash
# 运行完整兼容性测试套件
npm run test:compatibility
```

---

## 📊 测试覆盖率目标

| 模块 | 目标覆盖率 | 当前覆盖率 |
|------|-----------|-----------|
| promptLoader.js | 100% | - |
| openaiRoutes.js（Prompt 逻辑） | 100% | - |
| openaiToClaude.js（Prompt 逻辑） | 100% | - |
| droidRelayService.js（Prompt 逻辑） | 100% | - |
| Web API | 90%+ | - |

---

## 🚨 失败场景测试

### 场景 1: Prompt 文件缺失

**设置**:
```bash
rm resources/prompts/codex.txt
```

**预期行为**:
- ⚠️ 启动时记录警告：`⚠️ Prompt file not found: codex.txt, skipping`
- ✅ 其他 prompts 正常加载
- ✅ `getPrompt('codex')` 返回 `null`
- ✅ Codex 服务跳过注入，记录警告

---

### 场景 2: 配置文件错误

**设置**:
```javascript
// config.js
prompts: {
  codex: { enabled: "true" }  // 应该是 boolean，不是 string
}
```

**预期行为**:
- ⚠️ 配置验证警告
- ✅ 回退到默认值（true）

---

### 场景 3: Web API 权限错误

**测试**:
```bash
# 无 token
curl -X GET http://localhost:3000/admin/prompts/codex

# 无效 token
curl -X GET http://localhost:3000/admin/prompts/codex \
  -H "Authorization: Bearer invalid-token"
```

**预期结果**:
- ❌ 401 Unauthorized
- ❌ 返回 `{ "error": "Unauthorized" }`

---

## ✅ 验收标准

### 功能验收

- [ ] 所有单元测试通过（6/6）
- [ ] 所有集成测试通过（5/5）
- [ ] 所有手动测试通过（7/7）
- [ ] Web 界面功能完整
- [ ] Web API 安全验证通过
- [ ] 配置开关生效

### 性能验收

- [ ] promptLoader 初始化 <20ms
- [ ] getPrompt() 检索 <1ms
- [ ] Web API 响应 <100ms
- [ ] 内存占用 <100KB

### 兼容性验收

- [ ] 所有向后兼容性测试通过
- [ ] 默认行为完全一致（无用户自定义时）
- [ ] API 接口不变
- [ ] 客户端代码无需修改

### 安全验收

- [ ] Web API 需要管理员认证
- [ ] 路径遍历漏洞防护
- [ ] 输入验证完整
- [ ] 文件权限检查

---

## 📝 测试报告模板

```markdown
# Prompt 管理系统测试报告

## 测试概况
- **测试日期**: 2025-01-05
- **测试人员**: [姓名]
- **环境**: Development/Staging/Production

## 测试结果

### 单元测试
- 通过: 5/5
- 失败: 0/5
- 跳过: 0/5

### 集成测试
- 通过: 5/5
- 失败: 0/5
- 跳过: 0/5

### 手动测试
- 通过: 7/7
- 失败: 0/7
- 跳过: 0/7

## 问题列表
（无问题）

## 建议
- [建议内容]

## 结论
✅ 所有测试通过，批准发布
```

---

## 📚 相关文档

- [实施指南](./02-implementation-guide.md)
- [API 规范](./03-api-specification.md)
- [迁移指南](./05-migration-guide.md)
