// Tauri Store 键值存储 Composable
import { Store } from '@tauri-apps/plugin-store'

export class StoreService {
  private store: Store | null = null

  constructor(private fileName = 'app_settings.bin') {
    // Store 需要异步初始化
  }

  async init(): Promise<void> {
    if (!this.store) {
      this.store = await Store.load(this.fileName)
    }
  }

  private ensureStore(): Store {
    if (!this.store) {
      throw new Error('Store 未初始化，请先调用 init() 方法')
    }
    return this.store
  }

  async set(key: string, value: any) {
    try {
      const store = this.ensureStore()
      await store.set(key, value)
      console.log(`设置 ${key} 成功`)
    }
    catch (error) {
      console.error(`设置 ${key} 失败:`, error)
      throw error
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const store = this.ensureStore()
      const value = await store.get<T>(key)
      return value ?? null
    }
    catch (error) {
      console.error(`获取 ${key} 失败:`, error)
      throw error
    }
  }

  async delete(key: string) {
    try {
      const store = this.ensureStore()
      await store.delete(key)
      console.log(`删除 ${key} 成功`)
    }
    catch (error) {
      console.error(`删除 ${key} 失败:`, error)
      throw error
    }
  }

  async clear() {
    try {
      const store = this.ensureStore()
      await store.clear()
      console.log('清空存储成功')
    }
    catch (error) {
      console.error('清空存储失败:', error)
      throw error
    }
  }

  async save() {
    try {
      const store = this.ensureStore()
      await store.save()
      console.log('保存存储成功')
    }
    catch (error) {
      console.error('保存存储失败:', error)
      throw error
    }
  }

  async keys() {
    try {
      const store = this.ensureStore()
      const keys = await store.keys()
      return keys
    }
    catch (error) {
      console.error('获取键列表失败:', error)
      throw error
    }
  }

  async values() {
    try {
      const store = this.ensureStore()
      const values = await store.values()
      return values
    }
    catch (error) {
      console.error('获取值列表失败:', error)
      throw error
    }
  }

  async entries() {
    try {
      const store = this.ensureStore()
      const entries = await store.entries()
      return entries
    }
    catch (error) {
      console.error('获取条目列表失败:', error)
      throw error
    }
  }

  async length() {
    try {
      const store = this.ensureStore()
      const length = await store.length()
      return length
    }
    catch (error) {
      console.error('获取存储长度失败:', error)
      throw error
    }
  }

  async has(key: string) {
    try {
      const store = this.ensureStore()
      const exists = await store.has(key)
      return exists
    }
    catch (error) {
      console.error(`检查 ${key} 是否存在失败:`, error)
      throw error
    }
  }
}

// 创建单例实例
const storeService = new StoreService()

/**
 * Tauri Store Composable
 * 提供键值存储的响应式接口
 */
export function useTauriStore(fileName?: string) {
  const service = fileName ? new StoreService(fileName) : storeService
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const initStore = async () => {
    if (isInitialized.value)
      return

    isLoading.value = true
    error.value = null

    try {
      await service.init()
      isInitialized.value = true
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Store 初始化失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const setItem = async (key: string, value: any) => {
    isLoading.value = true
    error.value = null

    try {
      await service.set(key, value)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '设置值失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getItem = async <T>(key: string): Promise<T | null> => {
    isLoading.value = true
    error.value = null

    try {
      const result = await service.get<T>(key)
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取值失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const deleteItem = async (key: string) => {
    isLoading.value = true
    error.value = null

    try {
      await service.delete(key)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '删除值失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const clearStore = async () => {
    isLoading.value = true
    error.value = null

    try {
      await service.clear()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '清空存储失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const saveStore = async () => {
    isLoading.value = true
    error.value = null

    try {
      await service.save()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '保存存储失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getKeys = async () => {
    isLoading.value = true
    error.value = null

    try {
      const result = await service.keys()
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取键列表失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getValues = async () => {
    isLoading.value = true
    error.value = null

    try {
      const result = await service.values()
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取值列表失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getEntries = async () => {
    isLoading.value = true
    error.value = null

    try {
      const result = await service.entries()
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取条目列表失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getLength = async () => {
    isLoading.value = true
    error.value = null

    try {
      const result = await service.length()
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取存储长度失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const hasKey = async (key: string) => {
    isLoading.value = true
    error.value = null

    try {
      const result = await service.has(key)
      return result
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '检查键是否存在失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    // 状态
    isInitialized: readonly(isInitialized),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // 方法
    initStore,
    setItem,
    getItem,
    deleteItem,
    clearStore,
    saveStore,
    getKeys,
    getValues,
    getEntries,
    getLength,
    hasKey,
  }
}
