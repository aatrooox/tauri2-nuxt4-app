// Tauri SQL 数据库（精简版，仅保留 users / settings）
import Database from '@tauri-apps/plugin-sql'
import { useLog } from './useLog'

export class SQLService {
  private db: Database | null = null
  private dbPath: string
  private logger = useLog()

  constructor(dbPath = 'sqlite:app_v2.db') {
    this.dbPath = dbPath
  }

  async init(): Promise<void> {
    if (!this.db) {
      this.db = await Database.load(this.dbPath)
      // 迁移由 Rust 端插件在启动时执行，这里无需建表
    }
  }

  private ensureDB(): Database {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 init() 方法')
    }
    return this.db
  }

  // ——— Users ———
  async createUser(name: string, email: string): Promise<number> {
    const db = this.ensureDB()
    await this.logger.info('创建用户', { tag: 'SQL', context: { name, email } })
    const result = await db.execute(
      'INSERT INTO users (name, email) VALUES (?, ?)',
      [name, email],
    )
    return result.lastInsertId as number
  }

  async getUser(id: number): Promise<any> {
    const db = this.ensureDB()
    const result = await db.select('SELECT * FROM users WHERE id = ?', [id]) as any[]
    return result[0] || null
  }

  async getAllUsers(): Promise<any[]> {
    const db = this.ensureDB()
    return await db.select('SELECT * FROM users ORDER BY created_at DESC')
  }

  async updateUser(id: number, name: string, email: string): Promise<void> {
    const db = this.ensureDB()
    await db.execute('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, id])
  }

  async deleteUser(id: number): Promise<void> {
    const db = this.ensureDB()
    await this.logger.info('删除用户', { tag: 'SQL', context: { id } })
    await db.execute('DELETE FROM users WHERE id = ?', [id])
  }

  // ——— Settings ———
  async setSetting(key: string, value: string): Promise<void> {
    const db = this.ensureDB()
    await this.logger.info('设置配置', { tag: 'SQL', context: { key, value } })
    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [key, value],
    )
  }

  async getSetting(key: string): Promise<string | null> {
    const db = this.ensureDB()
    const result = await db.select('SELECT value FROM settings WHERE key = ?', [key]) as any[]
    return result[0]?.value || null
  }

  async getAllSettings(): Promise<Record<string, string>> {
    const db = this.ensureDB()
    const result = await db.select('SELECT key, value FROM settings') as any[]
    return result.reduce((acc: Record<string, string>, row: any) => {
      acc[row.key] = row.value
      return acc
    }, {})
  }

  async deleteSetting(key: string): Promise<void> {
    const db = this.ensureDB()
    await this.logger.info('删除设置', { tag: 'SQL', context: { key } })
    await db.execute('DELETE FROM settings WHERE key = ?', [key])
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
    }
  }
}

// 单例
const sqlService = new SQLService()

// Composable（精简版）
export function useTauriSQL() {
  const isInitialized = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const initDatabase = async () => {
    if (isInitialized.value)
      return
    isLoading.value = true
    error.value = null
    try {
      await sqlService.init()
      isInitialized.value = true
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '数据库初始化失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  // Users
  const createUser = async (name: string, email: string) => {
    isLoading.value = true
    error.value = null
    try {
      return await sqlService.createUser(name, email)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '创建用户失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getUser = async (id: number) => {
    isLoading.value = true
    error.value = null
    try {
      return await sqlService.getUser(id)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取用户失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getAllUsers = async () => {
    isLoading.value = true
    error.value = null
    try {
      return await sqlService.getAllUsers()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取用户列表失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const updateUser = async (id: number, name: string, email: string) => {
    isLoading.value = true
    error.value = null
    try {
      await sqlService.updateUser(id, name, email)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '更新用户失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const deleteUser = async (id: number) => {
    isLoading.value = true
    error.value = null
    try {
      await sqlService.deleteUser(id)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '删除用户失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  // Settings
  const setSetting = async (key: string, value: string) => {
    isLoading.value = true
    error.value = null
    try {
      await sqlService.setSetting(key, value)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '保存设置失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getSetting = async (key: string) => {
    isLoading.value = true
    error.value = null
    try {
      return await sqlService.getSetting(key)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取设置失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const getAllSettings = async () => {
    isLoading.value = true
    error.value = null
    try {
      return await sqlService.getAllSettings()
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '获取设置列表失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const deleteSetting = async (key: string) => {
    isLoading.value = true
    error.value = null
    try {
      await sqlService.deleteSetting(key)
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : '删除设置失败'
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  const autoInit = async () => {
    if (import.meta.client && !isInitialized.value) {
      await initDatabase()
    }
  }

  return {
    // 状态
    isInitialized: readonly(isInitialized),
    isLoading: readonly(isLoading),
    error: readonly(error),

    // Users
    createUser,
    getUser,
    getAllUsers,
    updateUser,
    deleteUser,

    // Settings
    setSetting,
    getSetting,
    getAllSettings,
    deleteSetting,

    // Init
    initDatabase,
    autoInit,
  }
}
