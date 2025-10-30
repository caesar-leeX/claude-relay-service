#!/usr/bin/env node

/**
 * PromptLoader 测试脚本
 *
 * 功能：
 * - 验证 promptLoader 是否正确加载所有 prompts
 * - 测试 getPrompt 方法和场景回退机制
 * - 测试健康检查功能
 * - 验证配置开关是否生效
 *
 * 使用方法：
 *   node scripts/test-prompt-loader.js
 */

const path = require('path')
const fs = require('fs')

// 日志工具
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  test: (msg) => console.log(`🧪 ${msg}`)
}

// 测试统计
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  warnings: 0
}

/**
 * 测试用例
 */
function test(name, fn) {
  stats.total++
  logger.test(`Testing: ${name}`)
  try {
    fn()
    stats.passed++
    logger.success(`PASS: ${name}`)
  } catch (error) {
    stats.failed++
    logger.error(`FAIL: ${name}`)
    logger.error(`  Error: ${error.message}`)
  }
  console.log('')
}

/**
 * 断言函数
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\n  Expected: ${expected}\n  Actual: ${actual}`)
  }
}

function assertNotNull(value, message) {
  if (value === null || value === undefined) {
    throw new Error(message)
  }
}

function assertNull(value, message) {
  if (value !== null && value !== undefined) {
    throw new Error(message)
  }
}

/**
 * 主测试流程
 */
async function main() {
  logger.info('🚀 Starting PromptLoader tests...\n')

  // 加载 promptLoader
  const promptLoader = require('../src/services/promptLoader')
  const config = require('../config/config')

  // 测试 1: promptLoader 实例存在
  test('PromptLoader instance should exist', () => {
    assertNotNull(promptLoader, 'promptLoader should not be null')
    assert(typeof promptLoader.getPrompt === 'function', 'getPrompt should be a function')
    assert(typeof promptLoader.getHealthStatus === 'function', 'getHealthStatus should be a function')
  })

  // 测试 2: Codex prompts 加载
  test('Codex prompts should be loaded from files', () => {
    const defaultPrompt = promptLoader.getPrompt('codex', 'default')
    assertNotNull(defaultPrompt, 'Codex default prompt should exist')
    assert(defaultPrompt.length > 1000, `Codex default prompt should be substantial (got ${defaultPrompt.length} chars)`)

    const gpt5Prompt = promptLoader.getPrompt('codex', 'gpt-5-codex')
    assertNotNull(gpt5Prompt, 'Codex gpt-5-codex prompt should exist')
    assert(gpt5Prompt.length > 1000, `Codex gpt-5-codex prompt should be substantial (got ${gpt5Prompt.length} chars)`)

    const reviewPrompt = promptLoader.getPrompt('codex', 'review')
    assertNotNull(reviewPrompt, 'Codex review prompt should exist')
    assert(reviewPrompt.length > 1000, `Codex review prompt should be substantial (got ${reviewPrompt.length} chars)`)

    logger.info(`  ✓ Codex default: ${defaultPrompt.length} chars`)
    logger.info(`  ✓ Codex gpt-5-codex: ${gpt5Prompt.length} chars`)
    logger.info(`  ✓ Codex review: ${reviewPrompt.length} chars`)
  })

  // 测试 3: Claude Code prompts 加载
  test('Claude Code prompts should be loaded from inline', () => {
    const claudeCodePrompt = promptLoader.getPrompt('claudeCode', 'default')
    assertNotNull(claudeCodePrompt, 'Claude Code default prompt should exist')
    assert(claudeCodePrompt.includes('Claude Code'), 'Claude Code prompt should contain "Claude Code"')
    assert(claudeCodePrompt.includes('Anthropic'), 'Claude Code prompt should contain "Anthropic"')
    logger.info(`  ✓ Claude Code prompt: ${claudeCodePrompt.length} chars`)
  })

  // 测试 4: Droid prompts 加载
  test('Droid prompts should be loaded from inline', () => {
    const droidPrompt = promptLoader.getPrompt('droid', 'default')
    assertNotNull(droidPrompt, 'Droid default prompt should exist')
    assert(droidPrompt.includes('Droid'), 'Droid prompt should contain "Droid"')
    assert(droidPrompt.includes('Factory'), 'Droid prompt should contain "Factory"')
    logger.info(`  ✓ Droid prompt: ${droidPrompt.length} chars`)
  })

  // 测试 5: 场景回退机制
  test('Scenario fallback should work correctly', () => {
    // 请求不存在的场景，应回退到 default
    const fallbackPrompt = promptLoader.getPrompt('codex', 'non-existent-scenario')
    assertNotNull(fallbackPrompt, 'Fallback should return default prompt')

    const defaultPrompt = promptLoader.getPrompt('codex', 'default')
    assertEqual(fallbackPrompt, defaultPrompt, 'Fallback prompt should equal default prompt')
    logger.info('  ✓ Fallback to default works')
  })

  // 测试 6: 不存在的服务返回 null
  test('Non-existent service should return null', () => {
    const invalidPrompt = promptLoader.getPrompt('invalid-service', 'default')
    assertNull(invalidPrompt, 'Invalid service should return null')
    logger.info('  ✓ Invalid service returns null')
  })

  // 测试 7: 健康检查
  test('Health status should report all services', () => {
    const health = promptLoader.getHealthStatus()
    assertNotNull(health, 'Health status should not be null')

    assert(health.codex !== undefined, 'Health should include codex status')
    assert(health.claudeCode !== undefined, 'Health should include claudeCode status')
    assert(health.droid !== undefined, 'Health should include droid status')

    assert(health.codex.status === 'loaded', 'Codex should be loaded')
    assert(health.codex.scenarios === 3, 'Codex should have 3 scenarios')

    assert(health.claudeCode.status === 'loaded', 'Claude Code should be loaded')
    assert(health.claudeCode.scenarios === 1, 'Claude Code should have 1 scenario')

    assert(health.droid.status === 'loaded', 'Droid should be loaded')
    assert(health.droid.scenarios === 1, 'Droid should have 1 scenario')

    logger.info(`  ✓ Health: ${JSON.stringify(health, null, 2)}`)
  })

  // 测试 8: 配置验证
  test('Config should have prompt settings', () => {
    assertNotNull(config.prompts, 'config.prompts should exist')
    assertNotNull(config.prompts.codex, 'config.prompts.codex should exist')
    assertNotNull(config.prompts.openaiToClaude, 'config.prompts.openaiToClaude should exist')
    assertNotNull(config.prompts.droid, 'config.prompts.droid should exist')
    assertNotNull(config.prompts.claudeCode, 'config.prompts.claudeCode should exist')

    logger.info('  ✓ All config sections exist')
    logger.info(`  ✓ Codex useDefaultPrompt: ${config.prompts.codex.useDefaultPrompt}`)
    logger.info(`  ✓ Codex defaultScenario: ${config.prompts.codex.defaultScenario}`)
    logger.info(`  ✓ OpenAI to Claude useDefaultPrompt: ${config.prompts.openaiToClaude.useDefaultPrompt}`)
    logger.info(`  ✓ Droid injectSystemPrompt: ${config.prompts.droid.injectSystemPrompt}`)
    logger.info(`  ✓ Claude Code injectPrompt: ${config.prompts.claudeCode.injectPrompt}`)
  })

  // 测试 9: 文件验证
  test('Prompt files should exist on disk', () => {
    const codexDir = path.join(__dirname, '../resources/codex-prompts')
    assert(fs.existsSync(codexDir), 'Codex prompts directory should exist')

    const defaultFile = path.join(codexDir, 'default.txt')
    assert(fs.existsSync(defaultFile), 'default.txt should exist')

    const gpt5File = path.join(codexDir, 'gpt-5-codex.txt')
    assert(fs.existsSync(gpt5File), 'gpt-5-codex.txt should exist')

    const reviewFile = path.join(codexDir, 'review.txt')
    assert(fs.existsSync(reviewFile), 'review.txt should exist')

    logger.info(`  ✓ All codex prompt files exist`)
  })

  // 测试 10: Prompt 内容验证
  test('Prompt content should be valid', () => {
    const codexDefault = promptLoader.getPrompt('codex', 'default')
    assert(!codexDefault.includes('\r\n'), 'Prompt should use Unix line endings')
    assert(codexDefault.trim() === codexDefault, 'Prompt should be trimmed')

    const claudeCode = promptLoader.getPrompt('claudeCode', 'default')
    assert(claudeCode.length > 0, 'Claude Code prompt should not be empty')

    const droid = promptLoader.getPrompt('droid', 'default')
    assert(droid.length > 0, 'Droid prompt should not be empty')

    logger.info('  ✓ All prompt content is valid')
  })

  // 打印测试总结
  console.log('='.repeat(70))
  logger.info('📊 Test Summary:')
  logger.info(`   Total Tests: ${stats.total}`)
  logger.success(`   Passed: ${stats.passed}`)
  logger.error(`   Failed: ${stats.failed}`)
  logger.warn(`   Warnings: ${stats.warnings}`)
  console.log('='.repeat(70))

  // 返回退出码
  if (stats.failed > 0) {
    logger.error('\n❌ Tests FAILED')
    process.exit(1)
  } else {
    logger.success('\n✅ All tests PASSED')
    process.exit(0)
  }
}

// 运行测试
main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`)
  if (process.env.DEBUG) {
    console.error(error.stack)
  }
  process.exit(1)
})
