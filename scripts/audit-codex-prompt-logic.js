#!/usr/bin/env node

/**
 * Codex Prompt 注入逻辑审计脚本
 *
 * 测试不同环境变量场景下的行为
 */

console.log('='.repeat(80))
console.log('📋 Codex Prompt 注入逻辑审计')
console.log('='.repeat(80))
console.log()

// 测试场景
const scenarios = [
  { env: undefined, name: '未设置（undefined）' },
  { env: 'true', name: 'true（字符串）' },
  { env: 'false', name: 'false（字符串）' },
  { env: 'TRUE', name: 'TRUE（大写）' },
  { env: 'FALSE', name: 'FALSE（大写）' },
  { env: '', name: '空字符串' },
  { env: '1', name: '1（数字字符串）' },
  { env: '0', name: '0（数字字符串）' },
  { env: 'yes', name: 'yes' },
  { env: 'no', name: 'no' }
]

console.log('## 1. 当前逻辑分析: `!== "false"`')
console.log()
console.log('```javascript')
console.log('useDefaultPrompt: process.env.CODEX_USE_DEFAULT_PROMPT !== "false"')
console.log('```')
console.log()

console.log('| 环境变量值 | 表达式结果 | 行为 | 说明 |')
console.log('|-----------|-----------|------|------|')

scenarios.forEach(s => {
  const result = s.env !== 'false'
  const behavior = result ? '✅ 注入 24KB prompt' : '❌ 不注入'
  const note = s.env === undefined ? '⚠️ 这是默认行为' : ''
  console.log(`| ${s.name.padEnd(20)} | ${String(result).padEnd(5)} | ${behavior.padEnd(18)} | ${note} |`)
})

console.log()
console.log('**问题**:')
console.log('- 未设置环境变量时，默认注入 24KB (约 6K tokens)')
console.log('- Codex 按消息次数计费（订阅制）或按 token 计费（API 制）')
console.log('- 默认注入会浪费消息配额和 API 成本')
console.log()

console.log('='.repeat(80))
console.log()

console.log('## 2. 方案 A 逻辑: `=== "true"`')
console.log()
console.log('```javascript')
console.log('useDefaultPrompt: process.env.CODEX_USE_DEFAULT_PROMPT === "true"')
console.log('```')
console.log()

console.log('| 环境变量值 | 表达式结果 | 行为 | 说明 |')
console.log('|-----------|-----------|------|------|')

scenarios.forEach(s => {
  const result = s.env === 'true'
  const behavior = result ? '✅ 注入 24KB prompt' : '❌ 不注入'
  const note = s.env === undefined ? '✅ 默认不注入（节省成本）' : ''
  console.log(`| ${s.name.padEnd(20)} | ${String(result).padEnd(5)} | ${behavior.padEnd(18)} | ${note} |`)
})

console.log()
console.log('**改进**:')
console.log('- 未设置环境变量时，默认不注入（节省成本）')
console.log('- 环境变量语义保持不变：true=注入，false=不注入')
console.log('- 用户需要主动设置 CODEX_USE_DEFAULT_PROMPT=true 才会注入')
console.log()

console.log('='.repeat(80))
console.log()

console.log('## 3. 运行时注入逻辑分析')
console.log()
console.log('**代码位置**: `src/routes/openaiRoutes.js` Lines 317-341')
console.log()
console.log('```javascript')
console.log('// 三级优先级')
console.log('if (systemMessage) {')
console.log('  // P1（最高优先级）: 用户自定义 system message')
console.log('  req.body.instructions = systemMessage  // 使用用户的，不注入默认')
console.log('  ')
console.log('} else if (config.prompts.codex.useDefaultPrompt) {')
console.log('  // P2（中等优先级）: 检查配置开关')
console.log('  //   - 如果 useDefaultPrompt = true → 注入默认 prompt')
console.log('  //   - 如果 useDefaultPrompt = false → 跳到 P3')
console.log('  const defaultPrompt = promptLoader.getPrompt("codex", scenario)')
console.log('  if (defaultPrompt) {')
console.log('    req.body.instructions = defaultPrompt  // 注入 24KB prompt')
console.log('  }')
console.log('  ')
console.log('} else {')
console.log('  // P3（最低优先级）: 配置禁用，完全不注入')
console.log('  // 不设置 req.body.instructions')
console.log('}')
console.log('```')
console.log()

console.log('**逻辑验证**: ✅ **正确**')
console.log('- P1 优先级最高：用户有 system message 时，完全尊重用户输入')
console.log('- P2 配置控制：检查 useDefaultPrompt 决定是否注入')
console.log('- P3 兜底：配置禁用时不注入任何内容')
console.log()

console.log('='.repeat(80))
console.log()

console.log('## 4. Codex 计费模式')
console.log()
console.log('**订阅制**:')
console.log('- ChatGPT Plus: $20/月（30-150 次消息/5小时）')
console.log('- ChatGPT Pro: $200/月（300-1,500 次消息/5小时）')
console.log('- ⚠️ 有消息次数配额限制')
console.log()
console.log('**API 制**:')
console.log('- 输入: $1.50/1M tokens')
console.log('- 输出: $6.00/1M tokens')
console.log('- 24KB prompt ≈ 6,000 tokens ≈ $0.009/次请求')
console.log()

console.log('**成本影响**（假设日均 1000 次请求）:')
console.log('- 当前默认（注入）: $3,285/年')
console.log('- 方案 A（不注入）: $0/年')
console.log('- 节省: $3,285/年（如果用户不需要默认 prompt）')
console.log()

console.log('='.repeat(80))
console.log()

console.log('## 5. 影响分析')
console.log()
console.log('### 当前行为（v2.0.0）')
console.log('- ✅ Codex CLI 官方客户端: 自带 instructions，不受影响')
console.log('- ❌ 第三方客户端（无 system message）: 自动注入 24KB → 浪费配额/成本')
console.log('- ✅ 第三方客户端（有 system message）: 使用用户自定义，不注入')
console.log()

console.log('### 方案 A 修改后')
console.log('- ✅ Codex CLI 官方客户端: 自带 instructions，不受影响')
console.log('- ✅ 第三方客户端（无 system message）: 默认不注入 → 节省配额/成本')
console.log('- ✅ 第三方客户端（有 system message）: 使用用户自定义，不注入')
console.log('- ⚠️ 需要默认 prompt 的用户: 需设置 CODEX_USE_DEFAULT_PROMPT=true')
console.log()

console.log('='.repeat(80))
console.log()

console.log('## 6. 审计结论')
console.log()
console.log('### 代码逻辑')
console.log('✅ **正确** - 三级优先级实现正确，逻辑清晰')
console.log()

console.log('### 配置默认值')
console.log('❌ **不合理** - 默认注入 24KB prompt 浪费 Codex 订阅配额和 API 成本')
console.log()

console.log('### 建议')
console.log('✅ **采用方案 A**:')
console.log('1. 修改默认值: `!== "false"` → `=== "true"`')
console.log('2. 更新 .env.example: CODEX_USE_DEFAULT_PROMPT=false（默认值）')
console.log('3. 添加注释说明 Codex 计费模式和成本影响')
console.log('4. 更新 CHANGELOG 记录此变更（在 v2.0.0 中修正）')
console.log()

console.log('### Breaking Change')
console.log('⚠️ **是** - 未设置环境变量时的默认行为会改变')
console.log('- 修改前: 默认注入 24KB prompt')
console.log('- 修改后: 默认不注入（用户需主动设置 =true 启用）')
console.log()

console.log('='.repeat(80))
console.log()
console.log('✅ 审计完成')
console.log()
