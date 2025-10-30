/**
 * OpenAI Routes - v1.1.199
 * Handles OpenAI API requests including gpt-5 (Codex/Responses format)
 */
const express = require('express')
const axios = require('axios')
const router = express.Router()
const logger = require('../utils/logger')
const config = require('../../config/config')
const { authenticateApiKey } = require('../middleware/auth')
const unifiedOpenAIScheduler = require('../services/unifiedOpenAIScheduler')
const openaiAccountService = require('../services/openaiAccountService')
const openaiResponsesAccountService = require('../services/openaiResponsesAccountService')
const openaiResponsesRelayService = require('../services/openaiResponsesRelayService')
const apiKeyService = require('../services/apiKeyService')
const crypto = require('crypto')
const ProxyHelper = require('../utils/proxyHelper')
const { updateRateLimitCounters } = require('../utils/rateLimitHelper')
const promptLoader = require('../services/promptLoader')

// 创建代理 Agent（使用统一的代理工具）
function createProxyAgent(proxy) {
  return ProxyHelper.createProxyAgent(proxy)
}

// 检查 API Key 是否具备 OpenAI 权限
function checkOpenAIPermissions(apiKeyData) {
  const permissions = apiKeyData?.permissions || 'all'
  return permissions === 'all' || permissions === 'openai'
}

function normalizeHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return {}
  }
  const normalized = {}
  for (const [key, value] of Object.entries(headers)) {
    if (!key) {
      continue
    }
    normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : value
  }
  return normalized
}

function toNumberSafe(value) {
  if (value === undefined || value === null || value === '') {
    return null
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function extractCodexUsageHeaders(headers) {
  const normalized = normalizeHeaders(headers)
  if (!normalized || Object.keys(normalized).length === 0) {
    return null
  }

  const snapshot = {
    primaryUsedPercent: toNumberSafe(normalized['x-codex-primary-used-percent']),
    primaryResetAfterSeconds: toNumberSafe(normalized['x-codex-primary-reset-after-seconds']),
    primaryWindowMinutes: toNumberSafe(normalized['x-codex-primary-window-minutes']),
    secondaryUsedPercent: toNumberSafe(normalized['x-codex-secondary-used-percent']),
    secondaryResetAfterSeconds: toNumberSafe(normalized['x-codex-secondary-reset-after-seconds']),
    secondaryWindowMinutes: toNumberSafe(normalized['x-codex-secondary-window-minutes']),
    primaryOverSecondaryPercent: toNumberSafe(
      normalized['x-codex-primary-over-secondary-limit-percent']
    )
  }

  const hasData = Object.values(snapshot).some((value) => value !== null)
  return hasData ? snapshot : null
}

async function applyRateLimitTracking(req, usageSummary, model, context = '') {
  if (!req.rateLimitInfo) {
    return
  }

  const label = context ? ` (${context})` : ''

  try {
    const { totalTokens, totalCost } = await updateRateLimitCounters(
      req.rateLimitInfo,
      usageSummary,
      model
    )

    if (totalTokens > 0) {
      logger.api(`📊 Updated rate limit token count${label}: +${totalTokens} tokens`)
    }
    if (typeof totalCost === 'number' && totalCost > 0) {
      logger.api(`💰 Updated rate limit cost count${label}: +$${totalCost.toFixed(6)}`)
    }
  } catch (error) {
    logger.error(`❌ Failed to update rate limit counters${label}:`, error)
  }
}

// 使用统一调度器选择 OpenAI 账户
async function getOpenAIAuthToken(apiKeyData, sessionId = null, requestedModel = null) {
  try {
    // 生成会话哈希（如果有会话ID）
    const sessionHash = sessionId
      ? crypto.createHash('sha256').update(sessionId).digest('hex')
      : null

    // 使用统一调度器选择账户
    const result = await unifiedOpenAIScheduler.selectAccountForApiKey(
      apiKeyData,
      sessionHash,
      requestedModel
    )

    if (!result || !result.accountId) {
      const error = new Error('No available OpenAI account found')
      error.statusCode = 402 // Payment Required - 资源耗尽
      throw error
    }

    // 根据账户类型获取账户详情
    let account,
      accessToken,
      proxy = null

    if (result.accountType === 'openai-responses') {
      // 处理 OpenAI-Responses 账户
      account = await openaiResponsesAccountService.getAccount(result.accountId)
      if (!account || !account.apiKey) {
        const error = new Error(`OpenAI-Responses account ${result.accountId} has no valid apiKey`)
        error.statusCode = 403 // Forbidden - 账户配置错误
        throw error
      }

      // OpenAI-Responses 账户不需要 accessToken，直接返回账户信息
      accessToken = null // OpenAI-Responses 使用账户内的 apiKey

      // 解析代理配置
      if (account.proxy) {
        try {
          proxy = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
        } catch (e) {
          logger.warn('Failed to parse proxy configuration:', e)
        }
      }

      logger.info(`Selected OpenAI-Responses account: ${account.name} (${result.accountId})`)
    } else {
      // 处理普通 OpenAI 账户
      account = await openaiAccountService.getAccount(result.accountId)
      if (!account || !account.accessToken) {
        const error = new Error(`OpenAI account ${result.accountId} has no valid accessToken`)
        error.statusCode = 403 // Forbidden - 账户配置错误
        throw error
      }

      // 检查 token 是否过期并自动刷新（双重保护）
      if (openaiAccountService.isTokenExpired(account)) {
        if (account.refreshToken) {
          logger.info(`🔄 Token expired, auto-refreshing for account ${account.name} (fallback)`)
          try {
            await openaiAccountService.refreshAccountToken(result.accountId)
            // 重新获取更新后的账户
            account = await openaiAccountService.getAccount(result.accountId)
            logger.info(`✅ Token refreshed successfully in route handler`)
          } catch (refreshError) {
            logger.error(`Failed to refresh token for ${account.name}:`, refreshError)
            const error = new Error(`Token expired and refresh failed: ${refreshError.message}`)
            error.statusCode = 403 // Forbidden - 认证失败
            throw error
          }
        } else {
          const error = new Error(
            `Token expired and no refresh token available for account ${account.name}`
          )
          error.statusCode = 403 // Forbidden - 认证失败
          throw error
        }
      }

      // 解密 accessToken（account.accessToken 是加密的）
      accessToken = openaiAccountService.decrypt(account.accessToken)
      if (!accessToken) {
        const error = new Error('Failed to decrypt OpenAI accessToken')
        error.statusCode = 403 // Forbidden - 配置/权限错误
        throw error
      }

      // 解析代理配置
      if (account.proxy) {
        try {
          proxy = typeof account.proxy === 'string' ? JSON.parse(account.proxy) : account.proxy
        } catch (e) {
          logger.warn('Failed to parse proxy configuration:', e)
        }
      }

      logger.info(`Selected OpenAI account: ${account.name} (${result.accountId})`)
    }

    return {
      accessToken,
      accountId: result.accountId,
      accountName: account.name,
      accountType: result.accountType,
      proxy,
      account
    }
  } catch (error) {
    logger.error('Failed to get OpenAI auth token:', error)
    throw error
  }
}

// 主处理函数，供两个路由共享
const handleResponses = async (req, res) => {
  let upstream = null
  let accountId = null
  let accountType = 'openai'
  let sessionHash = null
  let account = null
  let proxy = null
  let accessToken = null

  try {
    // 从中间件获取 API Key 数据
    const apiKeyData = req.apiKey || {}

    if (!checkOpenAIPermissions(apiKeyData)) {
      logger.security(
        `🚫 API Key ${apiKeyData.id || 'unknown'} 缺少 OpenAI 权限，拒绝访问 ${req.originalUrl}`
      )
      return res.status(403).json({
        error: {
          message: 'This API key does not have permission to access OpenAI',
          type: 'permission_denied',
          code: 'permission_denied'
        }
      })
    }

    // 从请求头或请求体中提取会话 ID
    const sessionId =
      req.headers['session_id'] ||
      req.headers['x-session-id'] ||
      req.body?.session_id ||
      req.body?.conversation_id ||
      null

    sessionHash = sessionId ? crypto.createHash('sha256').update(sessionId).digest('hex') : null

    // 从请求体中提取模型和流式标志
    let requestedModel = req.body?.model || null

    // 如果模型是 gpt-5 开头且后面还有内容（如 gpt-5-2025-08-07），则覆盖为 gpt-5
    if (requestedModel && requestedModel.startsWith('gpt-5-') && requestedModel !== 'gpt-5-codex') {
      logger.info(`📝 Model ${requestedModel} detected, normalizing to gpt-5 for Codex API`)
      requestedModel = 'gpt-5'
      req.body.model = 'gpt-5' // 同时更新请求体中的模型
    }

    // 检测是否需要流式到非流式的转换（针对 gpt-5/gpt-5-codex 模型）
    let needsStreamToNonStreamConversion = false
    const clientRequestedStream = req.body?.stream === true // 客户端期望的流式状态（默认非流式）

    if (
      (requestedModel === 'gpt-5' || requestedModel === 'gpt-5-codex') &&
      !clientRequestedStream
    ) {
      // Codex API 要求 stream: true，但客户端请求 stream: false
      needsStreamToNonStreamConversion = true
      req.body.stream = true // 强制后端使用流式
      logger.info(
        `🔄 Enabling stream-to-non-stream conversion for ${requestedModel} (client requested non-stream)`
      )
    }

    const isStream = req.body?.stream === true // 默认为非流式（与其他路由保持一致）

    // 判断是否为 Codex CLI 的请求
    const isCodexCLI = req.body?.instructions?.startsWith(
      'You are a coding agent running in the Codex CLI'
    )

    // 如果不是 Codex CLI 请求，则进行适配
    if (!isCodexCLI) {
      // ⚠️ 重要：先提取 system message（在转换之前）
      // 合并所有 system messages（与 openaiToClaude.js 的 _extractSystemMessage 逻辑一致）
      const systemMessages = req.body.messages?.filter((m) => m.role === 'system') || []
      const systemMessage =
        systemMessages.length > 0 ? systemMessages.map((m) => m.content).join('\n\n') : null

      // 自动转换标准 OpenAI 格式（messages）到 Codex 格式（input），并移除 system 消息
      if (req.body.messages && !req.body.input) {
        // 只转换非 system 的消息（system 已提取到 instructions）
        req.body.input = req.body.messages.filter((m) => m.role !== 'system')
        delete req.body.messages
        logger.info('📝 Converted messages → input for Codex API compatibility')
      }

      // 移除不需要的请求体字段
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

      // 设置 instructions（优先级：用户自定义 > 配置的默认值 > 不注入）
      if (systemMessage) {
        // P1: 使用用户自定义的 system message
        req.body.instructions = systemMessage
        logger.info(`📝 Using custom system message (${systemMessage.length} chars)`)
      } else if (config.prompts.codex.useDefaultPrompt) {
        // P2: 使用配置的默认 Codex prompt（从 promptLoader 加载）
        const scenario = config.prompts.codex.defaultScenario
        const defaultPrompt = promptLoader.getPrompt('codex', scenario)

        if (defaultPrompt) {
          req.body.instructions = defaultPrompt
          logger.info(
            `📝 Using Codex default prompt: ${scenario} (${defaultPrompt.length} chars, from promptLoader)`
          )
        } else {
          // 如果 promptLoader 返回 null，记录警告但不注入
          logger.warn(
            `⚠️  Codex prompt '${scenario}' not found in promptLoader, skipping injection`
          )
        }
      } else {
        // P3: 配置禁用默认 prompt，不注入任何内容
        logger.info('📝 Codex default prompt disabled by config, no injection')
      }

      logger.info('📝 Non-Codex CLI request detected, applying Codex CLI adaptation')
    } else {
      logger.info('✅ Codex CLI request detected, forwarding as-is')
    }

    // 使用调度器选择账户
    ;({ accessToken, accountId, accountType, proxy, account } = await getOpenAIAuthToken(
      apiKeyData,
      sessionId,
      requestedModel
    ))

    // 如果是 OpenAI-Responses 账户，使用专门的中继服务处理
    if (accountType === 'openai-responses') {
      logger.info(`🔀 Using OpenAI-Responses relay service for account: ${account.name}`)
      return await openaiResponsesRelayService.handleRequest(req, res, account, apiKeyData)
    }
    // 基于白名单构造上游所需的请求头，确保键为小写且值受控
    const incoming = req.headers || {}

    const allowedKeys = ['version', 'openai-beta', 'session_id']

    const headers = {}
    for (const key of allowedKeys) {
      if (incoming[key] !== undefined) {
        headers[key] = incoming[key]
      }
    }

    // 覆盖或新增必要头部
    headers['authorization'] = `Bearer ${accessToken}`
    headers['chatgpt-account-id'] = account.accountId || account.chatgptUserId || accountId
    headers['host'] = 'chatgpt.com'
    headers['accept'] = isStream ? 'text/event-stream' : 'application/json'
    headers['content-type'] = 'application/json'
    req.body['store'] = false

    // 创建代理 agent
    const proxyAgent = createProxyAgent(proxy)

    // 配置请求选项
    const axiosConfig = {
      headers,
      timeout: config.requestTimeout || 600000,
      validateStatus: () => true
    }

    // 如果有代理，添加代理配置
    if (proxyAgent) {
      axiosConfig.httpAgent = proxyAgent
      axiosConfig.httpsAgent = proxyAgent
      axiosConfig.proxy = false
      logger.info(`🌐 Using proxy for OpenAI request: ${ProxyHelper.getProxyDescription(proxy)}`)
    } else {
      logger.debug('🌐 No proxy configured for OpenAI request')
    }

    // 根据 stream 参数决定请求类型
    if (isStream) {
      // 流式请求
      upstream = await axios.post('https://chatgpt.com/backend-api/codex/responses', req.body, {
        ...axiosConfig,
        responseType: 'stream'
      })
    } else {
      // 非流式请求
      upstream = await axios.post(
        'https://chatgpt.com/backend-api/codex/responses',
        req.body,
        axiosConfig
      )
    }

    const codexUsageSnapshot = extractCodexUsageHeaders(upstream.headers)
    if (codexUsageSnapshot) {
      try {
        await openaiAccountService.updateCodexUsageSnapshot(accountId, codexUsageSnapshot)
      } catch (codexError) {
        logger.error('⚠️ 更新 Codex 使用统计失败:', codexError)
      }
    }

    // 处理 429 限流错误
    if (upstream.status === 429) {
      logger.warn(`🚫 Rate limit detected for OpenAI account ${accountId} (Codex API)`)

      // 解析响应体中的限流信息
      let resetsInSeconds = null
      let errorData = null

      try {
        // 对于429错误，无论是否是流式请求，响应都会是完整的JSON错误对象
        if (isStream && upstream.data) {
          // 流式响应需要先收集数据
          const chunks = []
          await new Promise((resolve, reject) => {
            upstream.data.on('data', (chunk) => chunks.push(chunk))
            upstream.data.on('end', resolve)
            upstream.data.on('error', reject)
            // 设置超时防止无限等待
            setTimeout(resolve, 5000)
          })

          const fullResponse = Buffer.concat(chunks).toString()
          try {
            errorData = JSON.parse(fullResponse)
          } catch (e) {
            logger.error('Failed to parse 429 error response:', e)
            logger.debug('Raw response:', fullResponse)
          }
        } else {
          // 非流式响应直接使用data
          errorData = upstream.data
        }

        // 提取重置时间
        if (errorData && errorData.error && errorData.error.resets_in_seconds) {
          resetsInSeconds = errorData.error.resets_in_seconds
          logger.info(
            `🕐 Codex rate limit will reset in ${resetsInSeconds} seconds (${Math.ceil(resetsInSeconds / 60)} minutes / ${Math.ceil(resetsInSeconds / 3600)} hours)`
          )
        } else {
          logger.warn(
            '⚠️ Could not extract resets_in_seconds from 429 response, using default 60 minutes'
          )
        }
      } catch (e) {
        logger.error('⚠️ Failed to parse rate limit error:', e)
      }

      // 标记账户为限流状态
      await unifiedOpenAIScheduler.markAccountRateLimited(
        accountId,
        'openai',
        sessionHash,
        resetsInSeconds
      )

      // 返回错误响应给客户端
      const errorResponse = errorData || {
        error: {
          type: 'usage_limit_reached',
          message: 'The usage limit has been reached',
          resets_in_seconds: resetsInSeconds
        }
      }

      if (isStream) {
        // 流式响应也需要设置正确的状态码
        res.status(429)
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.write(`data: ${JSON.stringify(errorResponse)}\n\n`)
        res.end()
      } else {
        res.status(429).json(errorResponse)
      }

      return
    } else if (upstream.status === 401 || upstream.status === 402) {
      const unauthorizedStatus = upstream.status
      const statusDescription = unauthorizedStatus === 401 ? 'Unauthorized' : 'Payment required'
      logger.warn(
        `🔐 ${statusDescription} error detected for OpenAI account ${accountId} (Codex API)`
      )

      let errorData = null

      try {
        if (isStream && upstream.data && typeof upstream.data.on === 'function') {
          const chunks = []
          await new Promise((resolve, reject) => {
            upstream.data.on('data', (chunk) => chunks.push(chunk))
            upstream.data.on('end', resolve)
            upstream.data.on('error', reject)
            setTimeout(resolve, 5000)
          })

          const fullResponse = Buffer.concat(chunks).toString()
          try {
            errorData = JSON.parse(fullResponse)
          } catch (parseError) {
            logger.error(`Failed to parse ${unauthorizedStatus} error response:`, parseError)
            logger.debug(`Raw ${unauthorizedStatus} response:`, fullResponse)
            errorData = { error: { message: fullResponse || 'Unauthorized' } }
          }
        } else {
          errorData = upstream.data
        }
      } catch (parseError) {
        logger.error(`⚠️ Failed to handle ${unauthorizedStatus} error response:`, parseError)
      }

      const statusLabel = unauthorizedStatus === 401 ? '401错误' : '402错误'
      const extraHint = unauthorizedStatus === 402 ? '，可能欠费' : ''
      let reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）`
      if (errorData) {
        const messageCandidate =
          errorData.error &&
          typeof errorData.error.message === 'string' &&
          errorData.error.message.trim()
            ? errorData.error.message.trim()
            : typeof errorData.message === 'string' && errorData.message.trim()
              ? errorData.message.trim()
              : null
        if (messageCandidate) {
          reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）：${messageCandidate}`
        }
      }

      try {
        await unifiedOpenAIScheduler.markAccountUnauthorized(
          accountId,
          'openai',
          sessionHash,
          reason
        )
      } catch (markError) {
        logger.error(
          `❌ Failed to mark OpenAI account unauthorized after ${unauthorizedStatus}:`,
          markError
        )
      }

      let errorResponse = errorData
      if (!errorResponse || typeof errorResponse !== 'object' || Buffer.isBuffer(errorResponse)) {
        const fallbackMessage =
          typeof errorData === 'string' && errorData.trim() ? errorData.trim() : 'Unauthorized'
        errorResponse = {
          error: {
            message: fallbackMessage,
            type: 'unauthorized',
            code: 'unauthorized'
          }
        }
      }

      res.status(unauthorizedStatus).json(errorResponse)
      return
    } else if (upstream.status === 200 || upstream.status === 201) {
      // 请求成功，检查并移除限流状态
      const isRateLimited = await unifiedOpenAIScheduler.isAccountRateLimited(accountId)
      if (isRateLimited) {
        logger.info(
          `✅ Removing rate limit for OpenAI account ${accountId} after successful request`
        )
        await unifiedOpenAIScheduler.removeAccountRateLimit(accountId, 'openai')
      }
    }

    res.status(upstream.status)

    if (isStream && !needsStreamToNonStreamConversion) {
      // 真实流式响应头（直接转发SSE）
      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.setHeader('X-Accel-Buffering', 'no')
    } else {
      // 非流式响应头（包括需要转换的情况）
      res.setHeader('Content-Type', 'application/json')
    }

    // 透传关键诊断头，避免传递不安全或与传输相关的头
    const passThroughHeaderKeys = ['openai-version', 'x-request-id', 'openai-processing-ms']
    for (const key of passThroughHeaderKeys) {
      const val = upstream.headers?.[key]
      if (val !== undefined) {
        res.setHeader(key, val)
      }
    }

    if (isStream && !needsStreamToNonStreamConversion) {
      // 立即刷新响应头，开始 SSE（仅在真实流式时）
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders()
      }
    }

    // 处理响应并捕获 usage 数据和真实的 model
    let buffer = ''
    let usageData = null
    let actualModel = null
    let usageReported = false
    let rateLimitDetected = false
    let rateLimitResetsInSeconds = null

    if (!isStream) {
      // 非流式响应处理
      try {
        logger.info(`📄 Processing OpenAI non-stream response for model: ${requestedModel}`)

        // 直接获取完整响应
        const responseData = upstream.data

        // 从响应中获取实际的 model 和 usage
        actualModel = responseData.model || requestedModel || 'gpt-4'
        usageData = responseData.usage

        logger.debug(`📊 Non-stream response - Model: ${actualModel}, Usage:`, usageData)

        // 记录使用统计
        if (usageData) {
          const totalInputTokens = usageData.input_tokens || usageData.prompt_tokens || 0
          const outputTokens = usageData.output_tokens || usageData.completion_tokens || 0
          const cacheReadTokens = usageData.input_tokens_details?.cached_tokens || 0
          // 计算实际输入token（总输入减去缓存部分）
          const actualInputTokens = Math.max(0, totalInputTokens - cacheReadTokens)

          await apiKeyService.recordUsage(
            apiKeyData.id,
            actualInputTokens, // 传递实际输入（不含缓存）
            outputTokens,
            0, // OpenAI没有cache_creation_tokens
            cacheReadTokens,
            actualModel,
            accountId
          )

          logger.info(
            `📊 Recorded OpenAI non-stream usage - Input: ${totalInputTokens}(actual:${actualInputTokens}+cached:${cacheReadTokens}), Output: ${outputTokens}, Total: ${usageData.total_tokens || totalInputTokens + outputTokens}, Model: ${actualModel}`
          )

          await applyRateLimitTracking(
            req,
            {
              inputTokens: actualInputTokens,
              outputTokens,
              cacheCreateTokens: 0,
              cacheReadTokens
            },
            actualModel,
            'openai-non-stream'
          )
        }

        // 返回响应
        res.json(responseData)
        return
      } catch (error) {
        logger.error('Failed to process non-stream response:', error)
        if (!res.headersSent) {
          res.status(500).json({ error: { message: 'Failed to process response' } })
        }
        return
      }
    }

    // 解析 SSE 事件以捕获 usage 数据和 model
    const parseSSEForUsage = (data) => {
      const lines = data.split('\n')

      for (const line of lines) {
        if (line.startsWith('event: response.completed')) {
          // 下一行应该是数据
          continue
        }

        if (line.startsWith('data: ')) {
          try {
            const jsonStr = line.slice(6) // 移除 'data: ' 前缀
            const eventData = JSON.parse(jsonStr)

            // 检查是否是 response.completed 事件
            if (eventData.type === 'response.completed' && eventData.response) {
              // 从响应中获取真实的 model
              if (eventData.response.model) {
                actualModel = eventData.response.model
                logger.debug(`📊 Captured actual model: ${actualModel}`)
              }

              // 获取 usage 数据
              if (eventData.response.usage) {
                usageData = eventData.response.usage
                logger.debug('📊 Captured OpenAI usage data:', usageData)
              }
            }

            // 检查是否有限流错误
            if (eventData.error && eventData.error.type === 'usage_limit_reached') {
              rateLimitDetected = true
              if (eventData.error.resets_in_seconds) {
                rateLimitResetsInSeconds = eventData.error.resets_in_seconds
                logger.warn(
                  `🚫 Rate limit detected in stream, resets in ${rateLimitResetsInSeconds} seconds`
                )
              }
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    upstream.data.on('data', (chunk) => {
      try {
        const chunkStr = chunk.toString()

        // 如果需要转换，只收集数据不转发；如果是真实流式，则立即转发
        if (!needsStreamToNonStreamConversion && !res.destroyed) {
          res.write(chunk)
        }

        // 收集数据以捕获 usage 信息（转换模式需要完整buffer）
        buffer += chunkStr

        // 仅在真实流式模式下处理事件（转换模式在end时统一处理）
        if (!needsStreamToNonStreamConversion && buffer.includes('\n\n')) {
          const events = buffer.split('\n\n')
          buffer = events.pop() || '' // 保留最后一个可能不完整的事件

          for (const event of events) {
            if (event.trim()) {
              parseSSEForUsage(event)
            }
          }
        }
      } catch (error) {
        logger.error('Error processing OpenAI stream chunk:', error)
      }
    })

    upstream.data.on('end', async () => {
      // 如果需要转换SSE到非流式JSON格式
      if (needsStreamToNonStreamConversion) {
        try {
          logger.info('🔄 Converting SSE stream to non-stream JSON response')

          // 解析完整的SSE buffer以提取内容和usage
          parseSSEForUsage(buffer)

          // 从SSE事件中提取文本内容
          let fullContent = ''
          const lines = buffer.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6)
                const eventData = JSON.parse(jsonStr)

                // 提取文本内容
                if (eventData.type === 'response.output_text.delta' && eventData.delta) {
                  // 增量文本事件 (delta 是直接字符串)
                  fullContent +=
                    typeof eventData.delta === 'string'
                      ? eventData.delta
                      : eventData.delta.text || ''
                } else if (eventData.type === 'response.completed' && eventData.response) {
                  // 完成事件 - 从 response.output[] 提取内容
                  if (eventData.response.output && Array.isArray(eventData.response.output)) {
                    // 路径1: response.output[] (Codex API 标准格式)
                    for (const outputItem of eventData.response.output) {
                      if (outputItem.type === 'message' && outputItem.message?.content) {
                        for (const contentItem of outputItem.message.content) {
                          if (contentItem.type === 'output_text' && contentItem.text) {
                            fullContent += contentItem.text
                          }
                        }
                      }
                    }
                  } else if (
                    eventData.response.choices &&
                    eventData.response.choices[0]?.message?.content
                  ) {
                    // 路径2: response.choices[0].message.content (标准OpenAI格式回退)
                    fullContent += eventData.response.choices[0].message.content
                  }
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }

          // 构建标准OpenAI非流式JSON响应
          const modelToRecord = actualModel || requestedModel || 'gpt-5'

          // 将 Codex API usage 格式转换为标准 OpenAI 格式
          let standardUsage = {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }

          if (usageData) {
            const inputTokens = usageData.input_tokens || usageData.prompt_tokens || 0
            const outputTokens = usageData.output_tokens || usageData.completion_tokens || 0
            standardUsage = {
              prompt_tokens: inputTokens,
              completion_tokens: outputTokens,
              total_tokens: usageData.total_tokens || inputTokens + outputTokens
            }
          }

          const nonStreamResponse = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: modelToRecord,
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: fullContent
                },
                finish_reason: 'stop'
              }
            ],
            usage: standardUsage
          }

          logger.info(`✅ Converted stream to non-stream response (${fullContent.length} chars)`)

          // 发送JSON响应
          if (!res.headersSent) {
            res.json(nonStreamResponse)
          }

          // 记录使用统计（与真实流式模式相同的逻辑）
          if (usageData) {
            try {
              const totalInputTokens = usageData.input_tokens || 0
              const outputTokens = usageData.output_tokens || 0
              const cacheReadTokens = usageData.input_tokens_details?.cached_tokens || 0
              const actualInputTokens = Math.max(0, totalInputTokens - cacheReadTokens)

              await apiKeyService.recordUsage(
                apiKeyData.id,
                actualInputTokens,
                outputTokens,
                0,
                cacheReadTokens,
                modelToRecord,
                accountId
              )

              logger.info(
                `📊 Recorded OpenAI usage (converted) - Input: ${totalInputTokens}(actual:${actualInputTokens}+cached:${cacheReadTokens}), Output: ${outputTokens}, Model: ${modelToRecord}`
              )

              await applyRateLimitTracking(
                req,
                {
                  inputTokens: actualInputTokens,
                  outputTokens,
                  cacheCreateTokens: 0,
                  cacheReadTokens
                },
                modelToRecord,
                'openai-stream-converted'
              )
            } catch (error) {
              logger.error('Failed to record OpenAI usage (converted):', error)
            }
          }

          return // 转换模式下直接返回，不继续执行后续代码
        } catch (error) {
          logger.error('Failed to convert SSE to non-stream:', error)
          if (!res.headersSent) {
            res.status(500).json({ error: { message: 'Failed to convert response' } })
          }
          return
        }
      }

      // 处理剩余的 buffer (真实流式模式)
      if (buffer.trim()) {
        parseSSEForUsage(buffer)
      }

      // 记录使用统计
      if (!usageReported && usageData) {
        try {
          const totalInputTokens = usageData.input_tokens || 0
          const outputTokens = usageData.output_tokens || 0
          const cacheReadTokens = usageData.input_tokens_details?.cached_tokens || 0
          // 计算实际输入token（总输入减去缓存部分）
          const actualInputTokens = Math.max(0, totalInputTokens - cacheReadTokens)

          // 使用响应中的真实 model，如果没有则使用请求中的 model，最后回退到默认值
          const modelToRecord = actualModel || requestedModel || 'gpt-4'

          await apiKeyService.recordUsage(
            apiKeyData.id,
            actualInputTokens, // 传递实际输入（不含缓存）
            outputTokens,
            0, // OpenAI没有cache_creation_tokens
            cacheReadTokens,
            modelToRecord,
            accountId
          )

          logger.info(
            `📊 Recorded OpenAI usage - Input: ${totalInputTokens}(actual:${actualInputTokens}+cached:${cacheReadTokens}), Output: ${outputTokens}, Total: ${usageData.total_tokens || totalInputTokens + outputTokens}, Model: ${modelToRecord} (actual: ${actualModel}, requested: ${requestedModel})`
          )
          usageReported = true

          await applyRateLimitTracking(
            req,
            {
              inputTokens: actualInputTokens,
              outputTokens,
              cacheCreateTokens: 0,
              cacheReadTokens
            },
            modelToRecord,
            'openai-stream'
          )
        } catch (error) {
          logger.error('Failed to record OpenAI usage:', error)
        }
      }

      // 如果在流式响应中检测到限流
      if (rateLimitDetected) {
        logger.warn(`🚫 Processing rate limit for OpenAI account ${accountId} from stream`)
        await unifiedOpenAIScheduler.markAccountRateLimited(
          accountId,
          'openai',
          sessionHash,
          rateLimitResetsInSeconds
        )
      } else if (upstream.status === 200) {
        // 流式请求成功，检查并移除限流状态
        const isRateLimited = await unifiedOpenAIScheduler.isAccountRateLimited(accountId)
        if (isRateLimited) {
          logger.info(
            `✅ Removing rate limit for OpenAI account ${accountId} after successful stream`
          )
          await unifiedOpenAIScheduler.removeAccountRateLimit(accountId, 'openai')
        }
      }

      res.end()
    })

    upstream.data.on('error', (err) => {
      logger.error('Upstream stream error:', err)
      if (!res.headersSent) {
        res.status(502).json({ error: { message: 'Upstream stream error' } })
      } else {
        res.end()
      }
    })

    // 客户端断开时清理上游流
    const cleanup = () => {
      try {
        upstream.data?.unpipe?.(res)
        upstream.data?.destroy?.()
      } catch (_) {
        //
      }
    }
    req.on('close', cleanup)
    req.on('aborted', cleanup)
  } catch (error) {
    logger.error('Proxy to ChatGPT codex/responses failed:', error)
    // 优先使用主动设置的 statusCode，然后是上游响应的状态码，最后默认 500
    const status = error.statusCode || error.response?.status || 500

    if ((status === 401 || status === 402) && accountId) {
      const statusLabel = status === 401 ? '401错误' : '402错误'
      const extraHint = status === 402 ? '，可能欠费' : ''
      let reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）`
      const errorData = error.response?.data
      if (errorData) {
        if (typeof errorData === 'string' && errorData.trim()) {
          reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）：${errorData.trim()}`
        } else if (
          errorData.error &&
          typeof errorData.error.message === 'string' &&
          errorData.error.message.trim()
        ) {
          reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）：${errorData.error.message.trim()}`
        } else if (typeof errorData.message === 'string' && errorData.message.trim()) {
          reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）：${errorData.message.trim()}`
        }
      } else if (error.message) {
        reason = `OpenAI账号认证失败（${statusLabel}${extraHint}）：${error.message}`
      }

      try {
        await unifiedOpenAIScheduler.markAccountUnauthorized(
          accountId,
          accountType || 'openai',
          sessionHash,
          reason
        )
      } catch (markError) {
        logger.error('❌ Failed to mark OpenAI account unauthorized in catch handler:', markError)
      }
    }

    let responsePayload = error.response?.data
    if (!responsePayload) {
      responsePayload = { error: { message: error.message || 'Internal server error' } }
    } else if (typeof responsePayload === 'string') {
      responsePayload = { error: { message: responsePayload } }
    } else if (typeof responsePayload === 'object' && !responsePayload.error) {
      responsePayload = {
        error: { message: responsePayload.message || error.message || 'Internal server error' }
      }
    }

    if (!res.headersSent) {
      res.status(status).json(responsePayload)
    }
  }
}

// 注册两个路由路径，都使用相同的处理函数
router.post('/responses', authenticateApiKey, handleResponses)
router.post('/v1/responses', authenticateApiKey, handleResponses)

// 使用情况统计端点
router.get('/usage', authenticateApiKey, async (req, res) => {
  try {
    const { usage } = req.apiKey

    res.json({
      object: 'usage',
      total_tokens: usage.total.tokens,
      total_requests: usage.total.requests,
      daily_tokens: usage.daily.tokens,
      daily_requests: usage.daily.requests,
      monthly_tokens: usage.monthly.tokens,
      monthly_requests: usage.monthly.requests
    })
  } catch (error) {
    logger.error('Failed to get usage stats:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve usage statistics',
        type: 'api_error'
      }
    })
  }
})

// API Key 信息端点
router.get('/key-info', authenticateApiKey, async (req, res) => {
  try {
    const keyData = req.apiKey
    res.json({
      id: keyData.id,
      name: keyData.name,
      description: keyData.description,
      permissions: keyData.permissions || 'all',
      token_limit: keyData.tokenLimit,
      tokens_used: keyData.usage.total.tokens,
      tokens_remaining:
        keyData.tokenLimit > 0
          ? Math.max(0, keyData.tokenLimit - keyData.usage.total.tokens)
          : null,
      rate_limit: {
        window: keyData.rateLimitWindow,
        requests: keyData.rateLimitRequests
      },
      usage: {
        total: keyData.usage.total,
        daily: keyData.usage.daily,
        monthly: keyData.usage.monthly
      }
    })
  } catch (error) {
    logger.error('Failed to get key info:', error)
    res.status(500).json({
      error: {
        message: 'Failed to retrieve API key information',
        type: 'api_error'
      }
    })
  }
})

module.exports = router
module.exports.handleResponses = handleResponses
