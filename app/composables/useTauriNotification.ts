// Tauri 通知 Composable
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

export class NotificationService {
  async checkPermission(): Promise<boolean> {
    try {
      const granted = await isPermissionGranted()
      return granted
    }
    catch (error) {
      console.error('检查通知权限失败:', error)
      return false
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      const permission = await requestPermission()
      return permission === 'granted'
    }
    catch (error) {
      console.error('请求通知权限失败:', error)
      return false
    }
  }

  async sendNotification(title: string, body: string, icon?: string) {
    try {
      // 检查权限
      let permissionGranted = await this.checkPermission()

      // 如果没有权限，请求权限
      if (!permissionGranted) {
        permissionGranted = await this.requestPermission()
      }

      // 发送通知
      if (permissionGranted) {
        await sendNotification({
          title,
          body,
          icon,
        })
        console.log('通知发送成功')
      }
      else {
        console.warn('通知权限未授予')
      }
    }
    catch (error) {
      console.error('发送通知失败:', error)
      throw error
    }
  }

  async sendSuccessNotification(message: string) {
    await this.sendNotification('操作成功', message)
  }

  async sendErrorNotification(message: string) {
    await this.sendNotification('操作失败', message)
  }

  async sendInfoNotification(title: string, message: string) {
    await this.sendNotification(title, message)
  }
}

// 创建单例实例
const notificationService = new NotificationService()

/**
 * Tauri 通知 Composable
 * 提供通知功能的响应式接口
 */
export function useTauriNotification() {
  const hasPermission = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const checkPermission = async () => {
    isLoading.value = true
    error.value = null

    try {
      const granted = await notificationService.checkPermission()
      hasPermission.value = granted
      return granted
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '检查通知权限失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const requestPermission = async () => {
    isLoading.value = true
    error.value = null

    try {
      const granted = await notificationService.requestPermission()
      hasPermission.value = granted
      return granted
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '请求通知权限失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const sendNotification = async (title: string, body: string, icon?: string) => {
    isLoading.value = true
    error.value = null

    try {
      await notificationService.sendNotification(title, body, icon)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '发送通知失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const sendSuccessNotification = async (message: string) => {
    isLoading.value = true
    error.value = null

    try {
      await notificationService.sendSuccessNotification(message)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '发送成功通知失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const sendErrorNotification = async (message: string) => {
    isLoading.value = true
    error.value = null

    try {
      await notificationService.sendErrorNotification(message)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '发送错误通知失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const sendInfoNotification = async (title: string, message: string) => {
    isLoading.value = true
    error.value = null

    try {
      await notificationService.sendInfoNotification(title, message)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '发送信息通知失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  // 初始化时检查权限
  onMounted(() => {
    checkPermission()
  })

  return {
    // 状态
    hasPermission: readonly(hasPermission),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // 方法
    checkPermission,
    requestPermission,
    sendNotification,
    sendSuccessNotification,
    sendErrorNotification,
    sendInfoNotification,
  }
}
