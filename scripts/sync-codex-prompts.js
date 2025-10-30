#!/usr/bin/env node

/**
 * Codex Prompts 同步脚本
 *
 * 功能：
 * - 从 OpenAI Codex GitHub 仓库下载官方 prompt 文件
 * - 自动保存到 resources/codex-prompts/ 目录
 * - 支持代理配置
 * - 提供详细的下载进度和错误处理
 *
 * 使用方法：
 *   node scripts/sync-codex-prompts.js
 *   node scripts/sync-codex-prompts.js --force  # 强制覆盖已存在的文件
 */

const https = require('https')
const fs = require('fs')
const path = require('path')
const { HttpsProxyAgent } = require('https-proxy-agent')

// 配置
const CONFIG = {
  // GitHub raw content 基础 URL
  baseUrl: 'https://raw.githubusercontent.com/openai/codex/main/codex-rs/core',

  // Prompt 文件映射（远程文件 -> 本地文件）
  prompts: [
    {
      remote: 'prompt.md',
      local: 'default.txt',
      description: '默认 Codex prompt'
    },
    {
      remote: 'gpt_5_codex_prompt.md',
      local: 'gpt-5-codex.txt',
      description: 'GPT-5-Codex 专用 prompt'
    },
    {
      remote: 'review_prompt.md',
      local: 'review.txt',
      description: '代码审查 prompt'
    }
  ],

  // 本地存储目录
  outputDir: path.join(__dirname, '../resources/codex-prompts'),

  // 代理配置（从环境变量读取）
  proxy: process.env.HTTPS_PROXY || process.env.https_proxy || null
}

// 命令行参数
const args = process.argv.slice(2)
const forceOverwrite = args.includes('--force') || args.includes('-f')

// 日志工具
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  debug: (msg) => {
    if (process.env.DEBUG) {
      console.log(`🔍 ${msg}`)
    }
  }
}

/**
 * 下载文件
 */
function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    logger.info(`Downloading: ${url}`)

    const options = {
      method: 'GET',
      timeout: 30000
    }

    // 如果配置了代理
    if (CONFIG.proxy) {
      logger.info(`Using proxy: ${CONFIG.proxy}`)
      options.agent = new HttpsProxyAgent(CONFIG.proxy)
    }

    const req = https.get(url, options, (res) => {
      // 处理重定向
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location
        logger.info(`Redirecting to: ${redirectUrl}`)
        downloadFile(redirectUrl, outputPath).then(resolve).catch(reject)
        return
      }

      // 检查状态码
      if (res.statusCode !== 200) {
        reject(
          new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Download failed'}`)
        )
        return
      }

      // 收集数据
      let data = ''
      res.setEncoding('utf8')

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          // 写入文件
          fs.writeFileSync(outputPath, data, 'utf8')
          logger.success(`Saved: ${outputPath} (${data.length} bytes)`)
          resolve({ path: outputPath, size: data.length })
        } catch (error) {
          reject(new Error(`Failed to write file: ${error.message}`))
        }
      })
    })

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`))
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

/**
 * 主函数
 */
async function main() {
  logger.info('🚀 Starting Codex prompts synchronization...')
  logger.info(`Repository: https://github.com/openai/codex`)
  logger.info(`Branch: main`)
  logger.info(`Output directory: ${CONFIG.outputDir}`)

  // 确保输出目录存在
  if (!fs.existsSync(CONFIG.outputDir)) {
    logger.info(`Creating directory: ${CONFIG.outputDir}`)
    fs.mkdirSync(CONFIG.outputDir, { recursive: true })
  }

  // 统计信息
  const stats = {
    total: CONFIG.prompts.length,
    success: 0,
    failed: 0,
    skipped: 0
  }

  // 下载所有 prompts
  for (const prompt of CONFIG.prompts) {
    const remoteUrl = `${CONFIG.baseUrl}/${prompt.remote}`
    const localPath = path.join(CONFIG.outputDir, prompt.local)

    logger.info(`\n📥 Processing: ${prompt.description}`)
    logger.info(`   Remote: ${prompt.remote}`)
    logger.info(`   Local: ${prompt.local}`)

    // 检查文件是否已存在
    if (fs.existsSync(localPath) && !forceOverwrite) {
      logger.warn(`File already exists: ${localPath}`)
      logger.warn('Use --force to overwrite existing files')
      stats.skipped++
      continue
    }

    // 下载文件
    try {
      const result = await downloadFile(remoteUrl, localPath)
      logger.success(`✓ Downloaded successfully (${result.size} bytes)`)
      stats.success++
    } catch (error) {
      logger.error(`✗ Failed to download: ${error.message}`)
      stats.failed++
    }
  }

  // 打印总结
  logger.info('\n' + '='.repeat(60))
  logger.info('📊 Synchronization Summary:')
  logger.info(`   Total: ${stats.total}`)
  logger.success(`   Success: ${stats.success}`)
  logger.error(`   Failed: ${stats.failed}`)
  logger.warn(`   Skipped: ${stats.skipped}`)

  // 创建 README（如果不存在）
  const readmePath = path.join(CONFIG.outputDir, 'README.md')
  if (!fs.existsSync(readmePath)) {
    const readmeContent = `# Codex Prompts

此目录包含从 [OpenAI Codex](https://github.com/openai/codex) 仓库同步的官方 prompt 文件。

## 文件说明

- **default.txt**: 默认 Codex prompt（通用场景）
- **gpt-5-codex.txt**: GPT-5-Codex 专用 prompt
- **review.txt**: 代码审查 prompt

## 同步方法

运行以下命令重新同步这些文件：

\`\`\`bash
node scripts/sync-codex-prompts.js
\`\`\`

强制覆盖已存在的文件：

\`\`\`bash
node scripts/sync-codex-prompts.js --force
\`\`\`

## 最后更新

- 同步时间: ${new Date().toISOString()}
- 仓库: https://github.com/openai/codex
- 分支: main
- 路径: codex-rs/core/

## 注意事项

⚠️ 这些文件会被自动覆盖，请不要手动编辑。如需自定义 prompt，请修改相关服务的配置。
`
    fs.writeFileSync(readmePath, readmeContent, 'utf8')
    logger.success(`Created README: ${readmePath}`)
  }

  // 返回退出码
  if (stats.failed > 0) {
    logger.error('\n❌ Synchronization completed with errors')
    process.exit(1)
  } else if (stats.success === 0 && stats.skipped === stats.total) {
    logger.info('\n✓ All files are up to date (use --force to re-download)')
    process.exit(0)
  } else {
    logger.success('\n✅ Synchronization completed successfully')
    process.exit(0)
  }
}

// 运行主函数
main().catch((error) => {
  logger.error(`Fatal error: ${error.message}`)
  if (process.env.DEBUG) {
    console.error(error.stack)
  }
  process.exit(1)
})
