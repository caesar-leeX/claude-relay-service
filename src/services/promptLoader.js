const fs = require('fs')
const path = require('path')
const logger = require('../utils/logger')

/**
 * Prompt Loader Service
 *
 * 负责加载和管理所有服务的系统提示词（system prompts）
 *
 * 设计理念：
 * - Single Source of Truth: 所有 prompts 集中在 resources/prompts/ 目录
 * - O(1) Access: 内存缓存实现快速检索
 * - Fail Fast: 关键文件缺失时拒绝启动
 * - Hot Reload: 支持运行时重新加载
 */
class PromptLoader {
  constructor() {
    // Prompt 文件目录
    this.promptsDir = path.join(process.cwd(), 'resources', 'prompts')

    // 服务名到文件名的映射
    this.fileMap = {
      codex: 'codex.txt',
      claudeCode: 'claude-code.txt',
      droid: 'droid.txt'
    }

    // 内存缓存
    this.prompts = {
      codex: null,
      claudeCode: null,
      droid: null
    }

    // 加载状态
    this.loaded = false
  }

  /**
   * 初始化：加载所有 prompt 文件到内存
   * @throws {Error} 文件缺失或读取失败时抛出异常（fail fast）
   */
  async initialize() {
    try {
      logger.info('💬 Initializing prompt loader...')

      // 验证目录存在
      if (!fs.existsSync(this.promptsDir)) {
        throw new Error(`Prompts directory not found: ${this.promptsDir}`)
      }

      // 加载所有 prompt 文件
      for (const [service, filename] of Object.entries(this.fileMap)) {
        const filePath = path.join(this.promptsDir, filename)

        // 关键文件缺失应拒绝启动（fail fast）
        if (!fs.existsSync(filePath)) {
          throw new Error(
            `Critical prompt file missing: ${filename}. Please ensure all prompt files exist in ${this.promptsDir}`
          )
        }

        try {
          this.prompts[service] = fs.readFileSync(filePath, 'utf8')
          logger.info(`✅ Loaded ${service} prompt (${this.prompts[service].length} chars)`)
        } catch (error) {
          logger.error(`❌ Failed to load ${service} prompt from ${filename}:`, error)
          throw error // 读取失败也应该拒绝启动
        }
      }

      this.loaded = true
      logger.success('💬 Prompt loader initialized successfully')

      // 显示统计
      const loadedCount = Object.values(this.prompts).filter((p) => p !== null).length
      const totalSize = Object.values(this.prompts).reduce(
        (sum, prompt) => sum + (prompt ? prompt.length : 0),
        0
      )
      logger.info(
        `📊 Loaded ${loadedCount}/${Object.keys(this.fileMap).length} prompts, total ${totalSize} chars`
      )
    } catch (error) {
      logger.error('❌ Failed to initialize prompt loader:', error)
      throw error // 重新抛出，确保启动失败
    }
  }

  /**
   * 获取指定服务的 prompt
   * @param {string} service - 服务名称 ('codex' | 'claudeCode' | 'droid')
   * @returns {string|null} prompt 内容，如果服务无效或未加载则返回 null
   */
  getPrompt(service) {
    // 验证服务名称（白名单）
    const validServices = this.getValidServices()
    if (!validServices.includes(service)) {
      logger.warn(`⚠️ Invalid service name for prompt: ${service}`)
      return null
    }

    // 检查是否已加载
    if (!this.loaded) {
      logger.error('❌ Prompt loader not initialized')
      return null
    }

    return this.prompts[service] || null
  }

  /**
   * 获取有效的服务名称列表
   * @returns {string[]} 服务名称数组
   */
  getValidServices() {
    return Object.keys(this.fileMap)
  }

  /**
   * 获取服务对应的文件路径
   * @param {string} service - 服务名称
   * @returns {string|null} 文件绝对路径，无效服务返回 null
   */
  getFilePath(service) {
    const validServices = this.getValidServices()
    if (!validServices.includes(service)) {
      logger.warn(`⚠️ Invalid service name for file path: ${service}`)
      return null
    }
    return path.join(this.promptsDir, this.fileMap[service])
  }

  /**
   * 获取 prompts 目录路径
   * @returns {string} 目录绝对路径
   */
  getPromptsDir() {
    return this.promptsDir
  }

  /**
   * 热重载：重新加载所有 prompts
   * 主要用于 Web API 修改后的热重载
   */
  async reload() {
    try {
      logger.info('🔄 Reloading all prompts...')
      this.loaded = false
      await this.initialize()
      logger.success('✅ Prompts reloaded successfully')
    } catch (error) {
      logger.error('❌ Failed to reload prompts:', error)
      throw error
    }
  }

  /**
   * 获取健康状态
   * @returns {Object} 健康状态信息
   */
  getHealthStatus() {
    return {
      loaded: this.loaded,
      prompts: {
        codex: {
          available: this.prompts.codex !== null,
          length: this.prompts.codex ? this.prompts.codex.length : 0
        },
        claudeCode: {
          available: this.prompts.claudeCode !== null,
          length: this.prompts.claudeCode ? this.prompts.claudeCode.length : 0
        },
        droid: {
          available: this.prompts.droid !== null,
          length: this.prompts.droid ? this.prompts.droid.length : 0
        }
      }
    }
  }
}

// 导出单例实例
const promptLoader = new PromptLoader()
module.exports = promptLoader
