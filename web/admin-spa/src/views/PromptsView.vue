<template>
  <div class="prompts-container">
    <div :class="embedded ? '' : 'card p-4 sm:p-6'">
      <!-- 页面标题（embedded 模式下隐藏） -->
      <div v-if="!embedded" class="mb-4 sm:mb-6">
        <h3 class="mb-1 text-lg font-bold text-gray-900 dark:text-gray-100 sm:mb-2 sm:text-xl">
          System Prompts 管理
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          管理各服务的默认系统提示词
        </p>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="py-12 text-center">
        <div class="loading-spinner mx-auto mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">正在加载 Prompts...</p>
      </div>

      <!-- 内容区域 -->
      <div v-else class="space-y-6">
        <!-- 服务列表 -->
        <div
          v-for="service in services"
          :key="service.id"
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6"
        >
          <!-- 服务标题 -->
          <div class="mb-4 flex items-center justify-between">
            <div class="flex items-center">
              <div
                class="mr-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white"
              >
                <i class="text-lg" :class="service.icon"></i>
              </div>
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {{ service.name }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ service.description }}
                </p>
              </div>
            </div>
            <div class="text-right">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
                <span
                  v-if="prompts[service.id]"
                  class="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                >
                  {{ prompts[service.id].length }} 字符
                </span>
              </div>
            </div>
          </div>

          <!-- 环境变量配置说明卡片 -->
          <div
            v-if="serviceConfigs[service.id]"
            class="mb-4 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20"
          >
            <div class="flex items-start">
              <i class="fas fa-info-circle mr-2 mt-0.5 text-blue-600 dark:text-blue-400"></i>
              <div class="flex-1">
                <div class="text-sm font-medium text-blue-900 dark:text-blue-200">环境变量配置</div>
                <div class="mt-1 text-xs text-blue-700 dark:text-blue-300">
                  <code class="rounded bg-blue-100 px-1.5 py-0.5 dark:bg-blue-800">
                    {{ serviceConfigs[service.id].envVar || 'N/A' }}
                  </code>
                  <span class="ml-2">{{ serviceConfigs[service.id].envDescription || '' }}</span>
                </div>
                <div class="mt-2 flex items-center text-xs">
                  <span class="font-medium text-blue-900 dark:text-blue-200">当前状态:</span>
                  <span
                    :class="[
                      'ml-2 inline-flex items-center rounded-full px-2 py-0.5 font-medium',
                      metadata[service.id]?.enabled
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                    ]"
                  >
                    <i
                      :class="[
                        'mr-1 text-xs',
                        metadata[service.id]?.enabled
                          ? 'fas fa-check-circle'
                          : 'fas fa-times-circle'
                      ]"
                    ></i>
                    {{ metadata[service.id]?.enabled ? '已启用' : '已禁用' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 编辑方式选择器 -->
          <div class="mb-4">
            <nav class="flex space-x-4">
              <button
                v-for="mode in editModes"
                :key="mode.id"
                :class="[
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  currentMode[service.id] === mode.id
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200'
                ]"
                @click="currentMode[service.id] = mode.id"
              >
                <i class="mr-2" :class="mode.icon"></i>
                {{ mode.name }}
              </button>
            </nav>
          </div>

          <!-- 手动编辑模式 -->
          <div v-show="currentMode[service.id] === 'manual'">
            <textarea
              v-model="prompts[service.id]"
              class="form-input w-full font-mono text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
              :placeholder="`输入 ${service.name} 的 system prompt...`"
              :rows="service.id === 'codex' ? 25 : 3"
            />
            <div class="mt-3 flex items-center justify-between">
              <div class="text-xs text-gray-500 dark:text-gray-400">
                <span v-if="metadata[service.id]?.lastModified">
                  <i class="fas fa-clock mr-1"></i>
                  最后修改: {{ formatDateTime(metadata[service.id].lastModified) }}
                </span>
              </div>
              <button
                class="btn btn-primary px-4 py-2"
                :class="{ 'cursor-not-allowed opacity-50': saving[service.id] }"
                :disabled="saving[service.id]"
                @click="savePrompt(service.id)"
              >
                <div v-if="saving[service.id]" class="loading-spinner mr-2"></div>
                <i v-else class="fas fa-save mr-2"></i>
                {{ saving[service.id] ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>

          <!-- 文件上传模式 -->
          <div v-show="currentMode[service.id] === 'upload'">
            <div class="rounded-lg bg-gray-50 p-6 dark:bg-gray-700">
              <div class="mb-4 text-center">
                <i class="fas fa-upload mb-2 text-4xl text-gray-400 dark:text-gray-500"></i>
                <p class="text-sm text-gray-600 dark:text-gray-400">支持 .txt 格式，最大 1MB</p>
              </div>
              <input
                :ref="`fileInput_${service.id}`"
                accept=".txt"
                class="hidden"
                type="file"
                @change="handleFileUpload(service.id, $event)"
              />
              <button
                class="btn btn-success mx-auto block px-6 py-3"
                :disabled="uploading[service.id]"
                @click="triggerFileUpload()"
              >
                <div v-if="uploading[service.id]" class="loading-spinner mr-2"></div>
                <i v-else class="fas fa-upload mr-2"></i>
                {{ uploading[service.id] ? '上传中...' : '选择文件上传' }}
              </button>
            </div>
          </div>

          <!-- URL 导入模式 -->
          <div v-show="currentMode[service.id] === 'url'">
            <div class="space-y-3">
              <div>
                <label
                  class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  :for="`url_${service.id}`"
                >
                  HTTPS URL
                </label>
                <input
                  :id="`url_${service.id}`"
                  v-model="importUrls[service.id]"
                  class="form-input w-full dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                  placeholder="https://example.com/prompt.txt"
                  type="url"
                />
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  仅支持 HTTPS 协议，最大 1MB
                </p>
              </div>
              <div class="flex items-center space-x-3">
                <button
                  class="btn btn-primary px-4 py-2"
                  :disabled="!importUrls[service.id] || importing[service.id]"
                  @click="previewFromUrl(service.id)"
                >
                  <i class="fas fa-eye mr-2"></i>
                  预览
                </button>
                <button
                  class="btn btn-success px-4 py-2"
                  :disabled="!importUrls[service.id] || importing[service.id]"
                  @click="importFromUrl(service.id)"
                >
                  <div v-if="importing[service.id]" class="loading-spinner mr-2"></div>
                  <i v-else class="fas fa-download mr-2"></i>
                  {{ importing[service.id] ? '导入中...' : '直接导入' }}
                </button>
              </div>
              <!-- 预览区域 -->
              <div
                v-if="urlPreviews[service.id]"
                class="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-700"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    预览内容
                  </span>
                  <button
                    class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    @click="urlPreviews[service.id] = null"
                  >
                    <i class="fas fa-times"></i>
                  </button>
                </div>
                <pre
                  class="max-h-64 overflow-auto rounded border border-gray-200 bg-white p-3 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  >{{ urlPreviews[service.id] }}</pre
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted } from 'vue'
import { apiClient } from '@/config/api'
import { showToast } from '@/utils/toast'

export default {
  name: 'PromptsView',
  props: {
    embedded: {
      type: Boolean,
      default: false
    }
  },
  setup() {
    // 服务定义（简化，只保留静态信息）
    const services = ref([
      {
        id: 'codex',
        name: 'Codex CLI',
        description: 'OpenAI Responses 服务的默认提示词',
        icon: 'fas fa-code'
      },
      {
        id: 'claudeCode',
        name: 'Claude Code',
        description: 'Claude Code 服务的默认提示词',
        icon: 'fas fa-robot'
      },
      {
        id: 'droid',
        name: 'Droid',
        description: 'Droid (Factory.ai) 服务的默认提示词',
        icon: 'fas fa-wrench'
      }
    ])

    // 编辑模式定义
    const editModes = [
      { id: 'manual', name: '手动编辑', icon: 'fas fa-edit' },
      { id: 'upload', name: '文件上传', icon: 'fas fa-upload' },
      { id: 'url', name: 'URL 导入', icon: 'fas fa-link' }
    ]

    // 响应式状态
    const loading = ref(false)
    const prompts = reactive({
      codex: '',
      claudeCode: '',
      droid: ''
    })
    const metadata = reactive({})
    const serviceConfigs = ref({}) // 新增：存储从API获取的配置
    const saving = reactive({})
    const uploading = reactive({})
    const importing = reactive({})
    const currentMode = reactive({
      codex: 'manual',
      claudeCode: 'manual',
      droid: 'manual'
    })
    const importUrls = reactive({
      codex: '',
      claudeCode: '',
      droid: ''
    })
    const urlPreviews = reactive({
      codex: null,
      claudeCode: null,
      droid: null
    })

    // 加载配置元数据
    const loadConfigs = async () => {
      try {
        const response = await apiClient.get('/admin/prompts/meta/config')
        if (response.success) {
          const configs = {}
          response.data.forEach((config) => {
            configs[config.id] = config
          })
          serviceConfigs.value = configs
        } else {
          showToast('加载配置元数据失败', 'error')
        }
      } catch (error) {
        console.error('Failed to load configs:', error)
        showToast('加载配置元数据失败', 'error')
      }
    }

    // 加载所有 Prompts
    const loadPrompts = async () => {
      loading.value = true
      try {
        // 先加载配置元数据
        await loadConfigs()

        for (const service of services.value) {
          const response = await apiClient.get(`/admin/prompts/${service.id}`)
          if (response.success) {
            prompts[service.id] = response.content || ''
            metadata[service.id] = {
              lastModified: response.lastModified,
              enabled: response.enabled,
              length: response.length
            }
          }
        }
      } catch (error) {
        console.error('Failed to load prompts:', error)
        showToast('加载 Prompts 失败', 'error')
      } finally {
        loading.value = false
      }
    }

    // 保存 Prompt（手动编辑）
    const savePrompt = async (serviceId) => {
      saving[serviceId] = true
      try {
        const response = await apiClient.put(`/admin/prompts/${serviceId}`, {
          content: prompts[serviceId]
        })
        if (response.success) {
          showToast('保存成功', 'success')
          // 重新加载以获取最新的 metadata
          await loadPrompts()
        } else {
          showToast(response.error || '保存失败', 'error')
        }
      } catch (error) {
        console.error(`Failed to save ${serviceId} prompt:`, error)
        showToast(error.response?.data?.error || '保存失败', 'error')
      } finally {
        saving[serviceId] = false
      }
    }

    // 触发文件上传
    const triggerFileUpload = () => {
      const input = document.querySelector(`input[type="file"][accept=".txt"]`)
      if (input) {
        // 清空之前的选择
        input.value = ''
        input.click()
      }
    }

    // 处理文件上传
    const handleFileUpload = async (serviceId, event) => {
      const file = event.target.files[0]
      if (!file) return

      // 验证文件类型
      if (!file.name.endsWith('.txt')) {
        showToast('仅支持 .txt 文件', 'error')
        return
      }

      // 验证文件大小（1MB）
      if (file.size > 1024 * 1024) {
        showToast('文件大小不能超过 1MB', 'error')
        return
      }

      uploading[serviceId] = true
      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await apiClient.post(`/admin/prompts/${serviceId}/upload`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        })

        if (response.success) {
          showToast('上传成功', 'success')
          // 重新加载
          await loadPrompts()
          // 切换到手动编辑模式查看结果
          currentMode[serviceId] = 'manual'
        } else {
          showToast(response.error || '上传失败', 'error')
        }
      } catch (error) {
        console.error(`Failed to upload ${serviceId} prompt:`, error)
        showToast(error.response?.data?.error || '上传失败', 'error')
      } finally {
        uploading[serviceId] = false
      }
    }

    // 从 URL 预览
    const previewFromUrl = async (serviceId) => {
      const url = importUrls[serviceId]
      if (!url) return

      // 验证 HTTPS
      if (!url.startsWith('https://')) {
        showToast('仅支持 HTTPS 协议', 'error')
        return
      }

      importing[serviceId] = true
      try {
        const response = await apiClient.post(`/admin/prompts/${serviceId}/import-url`, {
          url,
          validate: true // 仅预览模式
        })

        if (response.success) {
          urlPreviews[serviceId] = response.preview || response.content
          showToast('预览加载成功', 'success')
        } else {
          showToast(response.error || '预览失败', 'error')
        }
      } catch (error) {
        console.error(`Failed to preview ${serviceId} prompt:`, error)
        showToast(error.response?.data?.error || '预览失败', 'error')
      } finally {
        importing[serviceId] = false
      }
    }

    // 从 URL 导入
    const importFromUrl = async (serviceId) => {
      const url = importUrls[serviceId]
      if (!url) return

      // 验证 HTTPS
      if (!url.startsWith('https://')) {
        showToast('仅支持 HTTPS 协议', 'error')
        return
      }

      importing[serviceId] = true
      try {
        const response = await apiClient.post(`/admin/prompts/${serviceId}/import-url`, {
          url,
          validate: false // 直接导入模式
        })

        if (response.success) {
          showToast('导入成功', 'success')
          // 重新加载
          await loadPrompts()
          // 切换到手动编辑模式查看结果
          currentMode[serviceId] = 'manual'
          // 清空 URL 输入
          importUrls[serviceId] = ''
          urlPreviews[serviceId] = null
        } else {
          showToast(response.error || '导入失败', 'error')
        }
      } catch (error) {
        console.error(`Failed to import ${serviceId} prompt:`, error)
        showToast(error.response?.data?.error || '导入失败', 'error')
      } finally {
        importing[serviceId] = false
      }
    }

    // 格式化日期时间
    const formatDateTime = (dateString) => {
      if (!dateString) return ''
      return new Date(dateString).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }

    // 组件挂载时加载数据
    onMounted(() => {
      loadPrompts()
    })

    return {
      services,
      editModes,
      loading,
      prompts,
      metadata,
      serviceConfigs,
      saving,
      uploading,
      importing,
      currentMode,
      importUrls,
      urlPreviews,
      savePrompt,
      triggerFileUpload,
      handleFileUpload,
      previewFromUrl,
      importFromUrl,
      formatDateTime
    }
  }
}
</script>

<style scoped>
.prompts-container {
  max-width: 1200px;
  margin: 0 auto;
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
