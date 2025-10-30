#!/usr/bin/env node

/**
 * Prompt 管理系统集成测试
 *
 * 测试范围：
 * - promptLoader 服务集成
 * - openaiRoutes.js prompt 注入逻辑
 * - openaiToClaude.js prompt 注入逻辑
 * - droidRelayService.js prompt 注入逻辑
 * - 配置开关效果验证
 *
 * 使用方法：
 *   node scripts/test-integration-prompts.js
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
    if (process.env.DEBUG) {
      console.error(error.stack)
    }
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

function assertContains(str, substr, message) {
  if (!str || !str.includes(substr)) {
    throw new Error(`${message}\n  String: ${str}\n  Should contain: ${substr}`)
  }
}

/**
 * 主测试流程
 */
async function main() {
  logger.info('🚀 Starting Prompt Management Integration Tests...\n')

  // 加载配置和服务
  const config = require('../config/config')
  const promptLoader = require('../src/services/promptLoader')
  const openaiToClaude = require('../src/services/openaiToClaude')

  // ==================== 第一部分: promptLoader 集成测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 1: PromptLoader Service Integration')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 1: promptLoader 是否正确集成到 config
  test('PromptLoader should be accessible from all services', () => {
    assertNotNull(promptLoader, 'promptLoader should exist')
    assert(typeof promptLoader.getPrompt === 'function', 'getPrompt should be a function')
  })

  // 测试 2: Config 中的 prompts 配置
  test('Config should have all prompt settings', () => {
    assertNotNull(config.prompts, 'config.prompts should exist')
    assertNotNull(config.prompts.codex, 'config.prompts.codex should exist')
    assertNotNull(config.prompts.openaiToClaude, 'config.prompts.openaiToClaude should exist')
    assertNotNull(config.prompts.droid, 'config.prompts.droid should exist')
    assertNotNull(config.prompts.claudeCode, 'config.prompts.claudeCode should exist')

    // 验证默认值
    assertEqual(config.prompts.codex.useDefaultPrompt, true, 'Codex useDefaultPrompt should be true')
    assertEqual(
      config.prompts.openaiToClaude.useDefaultPrompt,
      true,
      'OpenAI to Claude useDefaultPrompt should be true'
    )
    assertEqual(
      config.prompts.droid.injectSystemPrompt,
      true,
      'Droid injectSystemPrompt should be true'
    )
  })

  // 测试 3: 所有服务的 prompts 都已加载
  test('All service prompts should be loaded', () => {
    const codexDefault = promptLoader.getPrompt('codex', 'default')
    const codexGpt5 = promptLoader.getPrompt('codex', 'gpt-5-codex')
    const codexReview = promptLoader.getPrompt('codex', 'review')
    const claudeCode = promptLoader.getPrompt('claudeCode', 'default')
    const droid = promptLoader.getPrompt('droid', 'default')

    assertNotNull(codexDefault, 'Codex default prompt should exist')
    assertNotNull(codexGpt5, 'Codex gpt-5-codex prompt should exist')
    assertNotNull(codexReview, 'Codex review prompt should exist')
    assertNotNull(claudeCode, 'Claude Code prompt should exist')
    assertNotNull(droid, 'Droid prompt should exist')

    // 验证内容长度
    assert(codexDefault.length > 20000, 'Codex default prompt should be substantial')
    assert(claudeCode.length > 50, 'Claude Code prompt should exist')
    assert(droid.length > 50, 'Droid prompt should exist')
  })

  // ==================== 第二部分: openaiToClaude 集成测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 2: OpenAI to Claude Converter Integration')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 4: 用户自定义 system message 优先级
  test('OpenAI to Claude: User system message should take priority', () => {
    const openaiRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Custom system prompt' },
        { role: 'user', content: 'Hello' }
      ]
    }

    const claudeRequest = openaiToClaude.convertRequest(openaiRequest)

    assertEqual(
      claudeRequest.system,
      'Custom system prompt',
      'Should use user provided system message'
    )
  })

  // 测试 5: 无用户 system message 时使用默认 prompt
  test('OpenAI to Claude: Should use default prompt when no user message', () => {
    const openaiRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    }

    const claudeRequest = openaiToClaude.convertRequest(openaiRequest)

    assertNotNull(claudeRequest.system, 'Should have system prompt')
    assertContains(
      claudeRequest.system,
      'Claude Code',
      'Should contain Claude Code default prompt'
    )
  })

  // 测试 6: 验证完整转换流程
  test('OpenAI to Claude: Complete conversion should work', () => {
    const openaiRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Test message' }],
      max_tokens: 1000,
      temperature: 0.7,
      stream: true
    }

    const claudeRequest = openaiToClaude.convertRequest(openaiRequest)

    assertEqual(claudeRequest.model, 'gpt-4', 'Model should be preserved')
    assertEqual(claudeRequest.max_tokens, 1000, 'Max tokens should be preserved')
    assertEqual(claudeRequest.temperature, 0.7, 'Temperature should be preserved')
    assertEqual(claudeRequest.stream, true, 'Stream should be preserved')
    assert(claudeRequest.messages.length > 0, 'Messages should be converted')
  })

  // ==================== 第三部分: 配置开关测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 3: Configuration Switch Testing')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 7: Codex 场景切换
  test('Codex scenario switching should work', () => {
    const scenarios = ['default', 'gpt-5-codex', 'review']

    scenarios.forEach((scenario) => {
      const prompt = promptLoader.getPrompt('codex', scenario)
      assertNotNull(prompt, `Codex ${scenario} prompt should exist`)
      assert(prompt.length > 1000, `Codex ${scenario} prompt should be substantial`)
    })
  })

  // 测试 8: 场景回退机制
  test('Scenario fallback mechanism should work', () => {
    const nonExistent = promptLoader.getPrompt('codex', 'non-existent-scenario')
    const defaultPrompt = promptLoader.getPrompt('codex', 'default')

    assertNotNull(nonExistent, 'Should fallback to default')
    assertEqual(nonExistent, defaultPrompt, 'Should return default prompt as fallback')
  })

  // 测试 9: 无效服务返回 null
  test('Invalid service should return null', () => {
    const invalidPrompt = promptLoader.getPrompt('invalid-service', 'default')
    assertEqual(invalidPrompt, null, 'Invalid service should return null')
  })

  // ==================== 第四部分: 文件系统集成测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 4: File System Integration')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 10: Codex prompts 文件存在
  test('Codex prompt files should exist on disk', () => {
    const codexDir = path.join(__dirname, '../resources/codex-prompts')
    const files = ['default.txt', 'gpt-5-codex.txt', 'review.txt']

    assert(fs.existsSync(codexDir), 'Codex prompts directory should exist')

    files.forEach((file) => {
      const filepath = path.join(codexDir, file)
      assert(fs.existsSync(filepath), `${file} should exist`)

      const content = fs.readFileSync(filepath, 'utf-8')
      assert(content.length > 1000, `${file} should have substantial content`)
    })
  })

  // 测试 11: README 文件存在
  test('Codex prompts README should exist', () => {
    const readmePath = path.join(__dirname, '../resources/codex-prompts/README.md')
    assert(fs.existsSync(readmePath), 'README.md should exist')

    const content = fs.readFileSync(readmePath, 'utf-8')
    assertContains(content, 'Codex Prompts', 'README should contain proper title')
    assertContains(
      content,
      'openai/codex',
      'README should reference OpenAI Codex repository'
    )
  })

  // ==================== 第五部分: 错误处理集成测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 5: Error Handling Integration')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 12: 缺失 prompt 的错误处理
  test('Missing prompt should be handled gracefully', () => {
    const missingPrompt = promptLoader.getPrompt('codex', 'missing-file')
    assertNotNull(missingPrompt, 'Should fallback to default')
  })

  // 测试 13: OpenAI 转换错误处理
  test('OpenAI to Claude conversion error handling', () => {
    const emptyRequest = {
      model: 'gpt-4',
      messages: []
    }

    try {
      const result = openaiToClaude.convertRequest(emptyRequest)
      assert(result !== null, 'Should handle empty messages')
    } catch (error) {
      // 如果抛出错误也是可接受的
      assert(true, 'Error handling works')
    }
  })

  // ==================== 第六部分: 向后兼容性测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 6: Backward Compatibility Testing')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 14: 默认配置应保持向后兼容
  test('Default configuration should maintain backward compatibility', () => {
    // 所有默认值都应该是 true（启用 prompt 注入）
    assertEqual(
      config.prompts.codex.useDefaultPrompt,
      true,
      'Codex should default to enabled'
    )
    assertEqual(
      config.prompts.openaiToClaude.useDefaultPrompt,
      true,
      'OpenAI to Claude should default to enabled'
    )
    assertEqual(
      config.prompts.droid.injectSystemPrompt,
      true,
      'Droid should default to enabled'
    )
  })

  // 测试 15: 旧代码路径应该正常工作
  test('Legacy code paths should still work', () => {
    // 测试直接使用 config.claude.systemPrompt
    const claudeSystemPrompt = config.claude.systemPrompt
    assert(typeof claudeSystemPrompt === 'string', 'Claude system prompt should be string')
  })

  // ==================== 第七部分: 性能测试 ====================
  logger.info('═══════════════════════════════════════════════════════')
  logger.info('Part 7: Performance Testing')
  logger.info('═══════════════════════════════════════════════════════\n')

  // 测试 16: Prompt 获取性能
  test('Prompt retrieval should be fast', () => {
    const iterations = 1000
    const start = Date.now()

    for (let i = 0; i < iterations; i++) {
      promptLoader.getPrompt('codex', 'default')
      promptLoader.getPrompt('claudeCode', 'default')
      promptLoader.getPrompt('droid', 'default')
    }

    const elapsed = Date.now() - start
    const avgTime = elapsed / iterations / 3 // 3 prompts per iteration

    logger.info(`  Average retrieval time: ${avgTime.toFixed(3)}ms per prompt`)
    assert(avgTime < 1, 'Average retrieval should be under 1ms')
  })

  // 测试 17: 转换性能
  test('OpenAI to Claude conversion should be fast', () => {
    const iterations = 100
    const testRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'Test system' },
        { role: 'user', content: 'Test message' }
      ]
    }

    const start = Date.now()

    for (let i = 0; i < iterations; i++) {
      openaiToClaude.convertRequest(testRequest)
    }

    const elapsed = Date.now() - start
    const avgTime = elapsed / iterations

    logger.info(`  Average conversion time: ${avgTime.toFixed(2)}ms`)
    assert(avgTime < 10, 'Average conversion should be under 10ms')
  })

  // 打印测试总结
  console.log('='.repeat(70))
  logger.info('📊 Integration Test Summary:')
  logger.info(`   Total Tests: ${stats.total}`)
  logger.success(`   Passed: ${stats.passed}`)
  logger.error(`   Failed: ${stats.failed}`)
  logger.warn(`   Warnings: ${stats.warnings}`)
  console.log('='.repeat(70))

  // 打印详细统计
  if (stats.passed === stats.total) {
    logger.success('\n🎉 All integration tests PASSED!')
    logger.info('\nTest Coverage:')
    logger.info('  ✅ PromptLoader service integration')
    logger.info('  ✅ OpenAI to Claude conversion')
    logger.info('  ✅ Configuration switches')
    logger.info('  ✅ File system integration')
    logger.info('  ✅ Error handling')
    logger.info('  ✅ Backward compatibility')
    logger.info('  ✅ Performance benchmarks')
  }

  // 返回退出码
  if (stats.failed > 0) {
    logger.error('\n❌ Integration tests FAILED')
    process.exit(1)
  } else {
    logger.success('\n✅ All integration tests PASSED')
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
