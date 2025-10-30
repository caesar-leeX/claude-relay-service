/**
 * Prompt Loader Service - 统一管理所有服务的系统提示词
 *
 * 支持的服务：
 * - codex: OpenAI Codex prompts (从文件加载)
 * - claudeCode: Claude Code prompts (内联)
 * - droid: Droid prompts (内联)
 *
 * 功能：
 * - 启动时从文件系统加载外部prompts
 * - 支持多场景prompt切换（default, gpt-5-codex, review等）
 * - 提供统一的prompt获取接口
 * - 自动错误处理和降级机制
 */

const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

class PromptLoader {
  constructor() {
    // 存储所有服务的prompts
    this.prompts = {
      codex: {},
      claudeCode: {},
      droid: {}
    }

    // Codex prompts 文件路径配置
    this.codexPromptsPath = path.join(__dirname, '../../resources/codex-prompts')

    // 内联的短prompts（无需外部文件）
    this.inlinePrompts = {
      claudeCode: {
        default: "You are Claude Code, Anthropic's official CLI for Claude."
      },
      droid: {
        default: 'You are Droid, an AI software engineering agent built by Factory.'
      }
    }

    // 加载所有prompts
    this.loadAllPrompts()
  }

  /**
   * 加载所有服务的prompts
   */
  loadAllPrompts() {
    logger.info('📚 Loading prompts for all services...')

    // 加载 Codex prompts（从文件）
    this.loadCodexPrompts()

    // 加载内联prompts
    this.loadInlinePrompts()

    logger.info('✅ All prompts loaded successfully')
  }

  /**
   * 加载 Codex prompts（从外部文件）
   */
  loadCodexPrompts() {
    const codexScenarios = ['default', 'gpt-5-codex', 'review']

    codexScenarios.forEach((scenario) => {
      try {
        const filename = `${scenario}.txt`
        const filepath = path.join(this.codexPromptsPath, filename)

        if (fs.existsSync(filepath)) {
          const content = fs.readFileSync(filepath, 'utf-8')
          this.prompts.codex[scenario] = content.trim()
          logger.info(
            `✅ Loaded Codex prompt: ${scenario} (${content.length} characters, ${filepath})`
          )
        } else {
          logger.warn(`⚠️  Codex prompt file not found: ${filepath}`)
          // 不设置降级值，让 getPrompt 方法处理
        }
      } catch (error) {
        logger.error(`❌ Failed to load Codex prompt: ${scenario}`, error)
      }
    })

    // 检查是否至少加载了一个 Codex prompt
    if (Object.keys(this.prompts.codex).length === 0) {
      logger.warn('⚠️  No Codex prompts loaded. Codex functionality may be limited.')
    }
  }

  /**
   * 加载内联prompts
   */
  loadInlinePrompts() {
    // 加载 Claude Code prompts
    this.prompts.claudeCode = { ...this.inlinePrompts.claudeCode }
    logger.info(
      `✅ Loaded Claude Code prompt: default (${this.prompts.claudeCode.default.length} characters)`
    )

    // 加载 Droid prompts
    this.prompts.droid = { ...this.inlinePrompts.droid }
    logger.info(
      `✅ Loaded Droid prompt: default (${this.prompts.droid.default.length} characters)`
    )
  }

  /**
   * 获取指定服务的prompt
   *
   * @param {string} service - 服务名称 (codex, claudeCode, droid)
   * @param {string} scenario - 场景名称 (default, gpt-5-codex, review等)
   * @returns {string|null} - Prompt内容，如果不存在则返回 null
   */
  getPrompt(service, scenario = 'default') {
    if (!service) {
      logger.error('❌ getPrompt: service parameter is required')
      return null
    }

    if (!this.prompts[service]) {
      logger.error(`❌ getPrompt: unknown service: ${service}`)
      return null
    }

    // 先尝试获取指定场景的prompt
    if (this.prompts[service][scenario]) {
      logger.debug(
        `📖 Using ${service} prompt: ${scenario} (${this.prompts[service][scenario].length} chars)`
      )
      return this.prompts[service][scenario]
    }

    // 如果指定场景不存在，尝试降级到 default
    if (scenario !== 'default' && this.prompts[service].default) {
      logger.warn(
        `⚠️  ${service} prompt '${scenario}' not found, falling back to 'default'`
      )
      return this.prompts[service].default
    }

    // 如果连 default 都不存在
    logger.warn(`⚠️  No prompt found for ${service}:${scenario}`)
    return null
  }

  /**
   * 重新加载所有prompts（用于热更新）
   */
  reload() {
    logger.info('🔄 Reloading all prompts...')
    this.prompts = {
      codex: {},
      claudeCode: {},
      droid: {}
    }
    this.loadAllPrompts()
  }

  /**
   * 检查指定服务的prompt是否存在
   *
   * @param {string} service - 服务名称
   * @param {string} scenario - 场景名称
   * @returns {boolean}
   */
  hasPrompt(service, scenario = 'default') {
    return !!(
      this.prompts[service] &&
      (this.prompts[service][scenario] || this.prompts[service].default)
    )
  }

  /**
   * 获取所有已加载的prompts信息（用于调试）
   *
   * @returns {Object} - 包含所有服务和场景的prompts信息
   */
  getLoadedPrompts() {
    const info = {}

    Object.keys(this.prompts).forEach((service) => {
      info[service] = {}
      Object.keys(this.prompts[service]).forEach((scenario) => {
        info[service][scenario] = {
          length: this.prompts[service][scenario].length,
          preview: this.prompts[service][scenario].substring(0, 100) + '...'
        }
      })
    })

    return info
  }

  /**
   * 获取指定服务的所有可用场景
   *
   * @param {string} service - 服务名称
   * @returns {string[]} - 场景名称数组
   */
  getAvailableScenarios(service) {
    if (!this.prompts[service]) {
      return []
    }
    return Object.keys(this.prompts[service])
  }

  /**
   * 健康检查
   *
   * @returns {Object} - 健康状态信息
   */
  healthCheck() {
    const status = {
      healthy: true,
      services: {}
    }

    // 检查每个服务
    Object.keys(this.prompts).forEach((service) => {
      const scenarios = Object.keys(this.prompts[service])
      status.services[service] = {
        loaded: scenarios.length > 0,
        scenarios: scenarios,
        hasDefault: !!this.prompts[service].default
      }

      // 如果没有加载任何场景，标记为不健康
      if (scenarios.length === 0) {
        status.healthy = false
      }
    })

    return status
  }

  /**
   * 获取健康状态（简化版，用于监控和测试）
   *
   * @returns {Object} - 每个服务的状态
   */
  getHealthStatus() {
    const status = {}

    Object.keys(this.prompts).forEach((service) => {
      const scenarios = Object.keys(this.prompts[service])
      status[service] = {
        status: scenarios.length > 0 ? 'loaded' : 'not_loaded',
        scenarios: scenarios.length
      }
    })

    return status
  }
}

// 导出单例
module.exports = new PromptLoader()
