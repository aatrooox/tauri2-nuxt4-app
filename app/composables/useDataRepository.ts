/**
 * 数据访问层 - 统一的数据仓库接口和实现
 * 支持本地优先 + 远程同步的混合架构
 */

import type Database from '@tauri-apps/plugin-sql'

// ============= 基础类型定义 =============

/**
 * 基础实体接口
 */
export interface BaseEntity {
  id: string
  created_at: string
  updated_at: string
  last_sync_at?: string
  is_deleted?: boolean
}

/**
 * 用户实体
 */
export interface User extends BaseEntity {
  name: string
  email: string
  avatar_url?: string
  preferences: Record<string, any>
}

/**
 * 待办事项实体
 */
export interface Todo extends BaseEntity {
  title: string
  description?: string
  completed: boolean
  priority: number
  due_date?: string
  user_id: string
  remote_id?: string
}

/**
 * 扩展基础实体，添加remote_id支持
 */
export interface SyncableEntity extends BaseEntity {
  remote_id?: string
}

/**
 * 远程配置
 */
export interface RemoteConfig {
  enabled: boolean
  baseUrl: string
  apiKey?: string
  syncInterval: number
  features: {
    contentSync: boolean
    dynamicFeed: boolean
    notifications: boolean
  }
}

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean
  conflicts: Conflict[]
  updated: number
  created: number
  deleted: number
  errors: string[]
}

/**
 * 冲突数据
 */
export interface Conflict {
  id: string
  table: string
  local_data: any
  remote_data: any
  conflict_type: 'update' | 'delete'
}

// ============= 数据仓库接口 =============

/**
 * 统一数据访问接口
 */
export interface DataRepository<T extends SyncableEntity> {
  // 本地操作
  getLocal: (id: string) => Promise<T | null>
  saveLocal: (data: Partial<T>) => Promise<T>
  updateLocal: (id: string, data: Partial<T>) => Promise<T>
  deleteLocal: (id: string) => Promise<void>
  listLocal: (filter?: any, limit?: number, offset?: number) => Promise<T[]>
  countLocal: (filter?: any) => Promise<number>

  // 远程操作（可选）
  getRemote?: (id: string) => Promise<T | null>
  saveRemote?: (data: T) => Promise<T>
  updateRemote?: (id: string, data: Partial<T>) => Promise<T>
  deleteRemote?: (id: string) => Promise<void>
  listRemote?: (filter?: any, limit?: number, offset?: number) => Promise<T[]>

  // 同步操作
  syncWithRemote?: () => Promise<SyncResult>
  resolveConflict?: (conflict: Conflict) => Promise<void>
}

// ============= 基础仓库实现 =============

/**
 * 基础数据仓库实现
 */
export abstract class BaseRepository<T extends SyncableEntity> implements DataRepository<T> {
  protected db: Database
  protected tableName: string
  protected remoteConfig: RemoteConfig | null = null

  constructor(db: Database, tableName: string) {
    this.db = db
    this.tableName = tableName
  }

  /**
   * 设置远程配置
   */
  setRemoteConfig(config: RemoteConfig) {
    this.remoteConfig = config
  }

  /**
   * 生成UUID
   */
  protected generateId(): string {
    return crypto.randomUUID()
  }

  /**
   * 获取当前时间戳
   */
  protected getCurrentTimestamp(): string {
    return new Date().toISOString()
  }

  // ============= 本地操作实现 =============

  async getLocal(id: string): Promise<T | null> {
    const result = await this.db.select(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = 0)`,
      [id],
    ) as any[]
    return result.length > 0 ? result[0] : null
  }

  async saveLocal(data: Partial<T>): Promise<T> {
    const id = data.id || this.generateId()
    const now = this.getCurrentTimestamp()

    const entity = {
      ...data,
      id,
      created_at: data.created_at || now,
      updated_at: now,
      is_deleted: false,
    } as T

    const columns = Object.keys(entity).join(', ')
    const placeholders = Object.keys(entity).map((_, i) => `$${i + 1}`).join(', ')
    const values = Object.values(entity)

    await this.db.execute(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders})`,
      values,
    )

    return entity
  }

  async updateLocal(id: string, data: Partial<T>): Promise<T> {
    const existing = await this.getLocal(id)
    if (!existing) {
      throw new Error(`Record with id ${id} not found`)
    }

    const updated = {
      ...existing,
      ...data,
      id, // 确保ID不被覆盖
      updated_at: this.getCurrentTimestamp(),
    } as T

    const setClause = Object.keys(data)
      .filter(key => key !== 'id')
      .map((key, i) => `${key} = $${i + 2}`)
      .join(', ')

    const values = [id, ...Object.keys(data)
      .filter(key => key !== 'id')
      .map(key => (updated as any)[key])]

    await this.db.execute(
      `UPDATE ${this.tableName} SET ${setClause}, updated_at = $${values.length + 1} WHERE id = $1`,
      [...values, this.getCurrentTimestamp()],
    )

    return updated
  }

  async deleteLocal(id: string): Promise<void> {
    await this.db.execute(
      `UPDATE ${this.tableName} SET is_deleted = 1, updated_at = $2 WHERE id = $1`,
      [id, this.getCurrentTimestamp()],
    )
  }

  async listLocal(filter?: any, limit = 50, offset = 0): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE (is_deleted IS NULL OR is_deleted = 0)`
    const params: any[] = []

    if (filter) {
      const conditions = this.buildFilterConditions(filter, params)
      if (conditions) {
        query += ` AND ${conditions}`
      }
    }

    query += ` ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    params.push(limit, offset)

    const result = await this.db.select(query, params)
    return result as T[]
  }

  async countLocal(filter?: any): Promise<number> {
    let query = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE (is_deleted IS NULL OR is_deleted = 0)`
    const params: any[] = []

    if (filter) {
      const conditions = this.buildFilterConditions(filter, params)
      if (conditions) {
        query += ` AND ${conditions}`
      }
    }

    const result = await this.db.select(query, params) as Array<{ count: number }>
    return result[0]?.count || 0
  }

  /**
   * 构建过滤条件（子类可重写）
   */
  protected buildFilterConditions(filter: any, params: any[]): string {
    const conditions: string[] = []

    Object.keys(filter).forEach((key) => {
      if (filter[key] !== undefined && filter[key] !== null) {
        params.push(filter[key])
        conditions.push(`${key} = $${params.length}`)
      }
    })

    return conditions.join(' AND ')
  }

  // ============= 远程操作（基础实现） =============

  async getRemote?(id: string): Promise<T | null> {
    if (!this.remoteConfig?.enabled)
      return null

    try {
      const response = await fetch(`${this.remoteConfig.baseUrl}/${this.tableName}/${id}`, {
        headers: this.getAuthHeaders(),
      })

      if (response.ok) {
        return await response.json()
      }
    }
    catch (error) {
      console.error('Remote get failed:', error)
    }

    return null
  }

  async saveRemote?(data: T): Promise<T> {
    if (!this.remoteConfig?.enabled)
      throw new Error('Remote service not enabled')

    const response = await fetch(`${this.remoteConfig.baseUrl}/${this.tableName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`Remote save failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async updateRemote?(id: string, data: Partial<T>): Promise<T> {
    if (!this.remoteConfig?.enabled)
      throw new Error('Remote service not enabled')

    const response = await fetch(`${this.remoteConfig.baseUrl}/${this.tableName}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`Remote update failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async deleteRemote?(id: string): Promise<void> {
    if (!this.remoteConfig?.enabled)
      throw new Error('Remote service not enabled')

    const response = await fetch(`${this.remoteConfig.baseUrl}/${this.tableName}/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Remote delete failed: ${response.statusText}`)
    }
  }

  async listRemote?(filter?: any, limit = 50, offset = 0): Promise<T[]> {
    if (!this.remoteConfig?.enabled)
      return []

    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      ...filter,
    })

    try {
      const response = await fetch(`${this.remoteConfig.baseUrl}/${this.tableName}?${params}`, {
        headers: this.getAuthHeaders(),
      })

      if (response.ok) {
        return await response.json()
      }
    }
    catch (error) {
      console.error('Remote list failed:', error)
    }

    return []
  }

  /**
   * 获取认证头
   */
  protected getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {}

    if (this.remoteConfig?.apiKey) {
      headers.Authorization = `Bearer ${this.remoteConfig.apiKey}`
    }

    return headers
  }

  // ============= 同步操作 =============

  async syncWithRemote?(): Promise<SyncResult> {
    if (!this.remoteConfig?.enabled || !this.remoteConfig.features.contentSync) {
      return {
        success: false,
        conflicts: [],
        updated: 0,
        created: 0,
        deleted: 0,
        errors: ['Remote sync not enabled'],
      }
    }

    const result: SyncResult = {
      success: true,
      conflicts: [],
      updated: 0,
      created: 0,
      deleted: 0,
      errors: [],
    }

    try {
      // 1. 获取本地未同步的数据
      const localChanges = await this.getLocalChanges()

      // 2. 推送本地更改到远程
      for (const item of localChanges) {
        try {
          if (item.remote_id) {
            await this.updateRemote?.(item.remote_id, item)
            result.updated++
          }
          else {
            const remoteItem = await this.saveRemote?.(item)
            if (remoteItem) {
              // 更新本地记录的remote_id
              await this.updateLocal(item.id, { remote_id: remoteItem.id } as unknown as Partial<T>)
              result.created++
            }
          }

          // 更新同步时间
          await this.updateLocal(item.id, { last_sync_at: this.getCurrentTimestamp() } as unknown as Partial<T>)
        }
        catch (error) {
          result.errors.push(`Failed to sync item ${item.id}: ${error}`)
          result.success = false
        }
      }

      // 3. 拉取远程更改
      const remoteChanges = await this.getRemoteChanges()

      // 4. 合并远程更改到本地
      for (const remoteItem of remoteChanges) {
        try {
          const localItem = await this.findLocalByRemoteId(remoteItem.id)

          if (localItem) {
            // 检查冲突
            if (this.hasConflict(localItem, remoteItem)) {
              result.conflicts.push({
                id: localItem.id,
                table: this.tableName,
                local_data: localItem,
                remote_data: remoteItem,
                conflict_type: 'update',
              })
            }
            else {
              await this.updateLocal(localItem.id, remoteItem)
              result.updated++
            }
          }
          else {
            // 创建新的本地记录
            const newLocal = { ...remoteItem, remote_id: remoteItem.id, id: this.generateId() }
            await this.saveLocal(newLocal)
            result.created++
          }
        }
        catch (error) {
          result.errors.push(`Failed to merge remote item ${remoteItem.id}: ${error}`)
          result.success = false
        }
      }
    }
    catch (error) {
      result.success = false
      result.errors.push(`Sync failed: ${error}`)
    }

    return result
  }

  /**
   * 获取本地未同步的更改
   */
  protected async getLocalChanges(): Promise<T[]> {
    const result = await this.db.select(
      `SELECT * FROM ${this.tableName} WHERE last_sync_at IS NULL OR updated_at > last_sync_at`,
      [],
    )
    return result as T[]
  }

  /**
   * 获取远程更改（需要子类实现具体逻辑）
   */
  protected async getRemoteChanges(): Promise<T[]> {
    // 基础实现：获取最近更新的数据
    return await this.listRemote?.() || []
  }

  /**
   * 通过remote_id查找本地记录
   */
  protected async findLocalByRemoteId(remoteId: string): Promise<T | null> {
    const result = await this.db.select(
      `SELECT * FROM ${this.tableName} WHERE remote_id = $1`,
      [remoteId],
    ) as any[]
    return result.length > 0 ? result[0] : null
  }

  /**
   * 检查是否存在冲突
   */
  protected hasConflict(local: T, remote: T): boolean {
    // 简单的冲突检测：比较更新时间
    const localTime = new Date(local.updated_at).getTime()
    const remoteTime = new Date(remote.updated_at).getTime()
    const syncTime = local.last_sync_at ? new Date(local.last_sync_at).getTime() : 0

    // 如果本地和远程都在上次同步后更新了，则存在冲突
    return localTime > syncTime && remoteTime > syncTime && localTime !== remoteTime
  }

  /**
   * 解决冲突
   */
  async resolveConflict?(conflict: Conflict): Promise<void> {
    // 默认策略：使用最新的数据
    const localTime = new Date(conflict.local_data.updated_at).getTime()
    const remoteTime = new Date(conflict.remote_data.updated_at).getTime()

    if (remoteTime > localTime) {
      // 使用远程数据
      await this.updateLocal(conflict.local_data.id, conflict.remote_data)
    }
    // 否则保持本地数据不变
  }
}

// ============= 具体仓库实现 =============

/**
 * 用户数据仓库
 */
export class UserRepository extends BaseRepository<User> {
  constructor(db: Database) {
    super(db, 'users')
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.db.select(
      `SELECT * FROM ${this.tableName} WHERE email = $1 AND (is_deleted IS NULL OR is_deleted = 0)`,
      [email],
    ) as any[]
    return result.length > 0 ? result[0] : null
  }

  /**
   * 更新用户偏好设置
   */
  async updatePreferences(userId: string, preferences: Record<string, any>): Promise<User> {
    const user = await this.getLocal(userId)
    if (!user) {
      throw new Error('User not found')
    }

    const updatedPreferences = { ...user.preferences, ...preferences }
    return await this.updateLocal(userId, { preferences: updatedPreferences })
  }
}

/**
 * 待办事项数据仓库
 */
export class TodoRepository extends BaseRepository<Todo> {
  constructor(db: Database) {
    super(db, 'todos')
  }

  /**
   * 获取用户的待办事项
   */
  async getByUserId(userId: string, completed?: boolean): Promise<Todo[]> {
    let query = `SELECT * FROM ${this.tableName} WHERE user_id = $1 AND (is_deleted IS NULL OR is_deleted = 0)`
    const params = [userId] as any[]

    if (completed !== undefined) {
      query += ` AND completed = $2`
      params.push(completed ? 1 : 0)
    }

    query += ` ORDER BY priority DESC, created_at DESC`

    const result = await this.db.select(query, params)
    return result as Todo[]
  }

  /**
   * 标记待办事项为完成
   */
  async markCompleted(id: string, completed = true): Promise<Todo> {
    return await this.updateLocal(id, { completed })
  }

  /**
   * 获取即将到期的待办事项
   */
  async getUpcoming(userId: string, days = 7): Promise<Todo[]> {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + days)

    const result = await this.db.select(
      `SELECT * FROM ${this.tableName} 
       WHERE user_id = $1 
       AND due_date IS NOT NULL 
       AND due_date <= $2 
       AND completed = 0 
       AND (is_deleted IS NULL OR is_deleted = 0)
       ORDER BY due_date ASC`,
      [userId, futureDate.toISOString()],
    )

    return result as Todo[]
  }

  /**
   * 构建待办事项特定的过滤条件
   */
  protected override buildFilterConditions(filter: any, params: any[]): string {
    const conditions: string[] = []

    if (filter.user_id) {
      params.push(filter.user_id)
      conditions.push(`user_id = $${params.length}`)
    }

    if (filter.completed !== undefined) {
      params.push(filter.completed ? 1 : 0)
      conditions.push(`completed = $${params.length}`)
    }

    if (filter.priority !== undefined) {
      params.push(filter.priority)
      conditions.push(`priority = $${params.length}`)
    }

    if (filter.search) {
      params.push(`%${filter.search}%`)
      conditions.push(`(title LIKE $${params.length} OR description LIKE $${params.length})`)
    }

    return conditions.join(' AND ')
  }
}

// ============= 数据管理器 =============

/**
 * 数据管理器 - 统一管理所有数据仓库
 */
export class DataManager {
  private db: Database | null = null
  private userRepo: UserRepository | null = null
  private todoRepo: TodoRepository | null = null
  private remoteConfig: RemoteConfig | null = null

  /**
   * 初始化数据管理器
   */
  async initialize(db: Database) {
    this.db = db
    this.userRepo = new UserRepository(db)
    this.todoRepo = new TodoRepository(db)

    // 加载远程配置
    await this.loadRemoteConfig()
  }

  /**
   * 获取用户仓库
   */
  get users(): UserRepository {
    if (!this.userRepo) {
      throw new Error('DataManager not initialized')
    }
    return this.userRepo
  }

  /**
   * 获取待办事项仓库
   */
  get todos(): TodoRepository {
    if (!this.todoRepo) {
      throw new Error('DataManager not initialized')
    }
    return this.todoRepo
  }

  /**
   * 设置远程配置
   */
  async setRemoteConfig(config: RemoteConfig) {
    this.remoteConfig = config

    // 更新所有仓库的远程配置
    this.userRepo?.setRemoteConfig(config)
    this.todoRepo?.setRemoteConfig(config)

    // 保存配置到本地
    await this.saveRemoteConfig(config)
  }

  /**
   * 获取远程配置
   */
  getRemoteConfig(): RemoteConfig | null {
    return this.remoteConfig
  }

  /**
   * 执行全量同步
   */
  async syncAll(): Promise<Record<string, SyncResult>> {
    const results: Record<string, SyncResult> = {}

    if (this.remoteConfig?.enabled && this.remoteConfig.features.contentSync) {
      // 同步用户数据
      if (this.userRepo?.syncWithRemote) {
        results.users = await this.userRepo.syncWithRemote()
      }

      // 同步待办事项
      if (this.todoRepo?.syncWithRemote) {
        results.todos = await this.todoRepo.syncWithRemote()
      }
    }

    return results
  }

  /**
   * 加载远程配置
   */
  private async loadRemoteConfig() {
    if (!this.db)
      return

    try {
      const result = await this.db.select(
        'SELECT value FROM app_config WHERE key = \'remote_config\'',
        [],
      )

      if ((result as any[]).length > 0) {
        this.remoteConfig = JSON.parse((result as any[])[0].value)

        // 更新所有仓库的远程配置
        if (this.remoteConfig) {
          this.userRepo?.setRemoteConfig(this.remoteConfig)
          this.todoRepo?.setRemoteConfig(this.remoteConfig)
        }
      }
    }
    catch (error) {
      console.error('Failed to load remote config:', error)
    }
  }

  /**
   * 保存远程配置
   */
  private async saveRemoteConfig(config: RemoteConfig) {
    if (!this.db)
      return

    try {
      await this.db.execute(
        `INSERT OR REPLACE INTO app_config (key, value, updated_at) 
         VALUES ('remote_config', $1, $2)`,
        [JSON.stringify(config), new Date().toISOString()],
      )
    }
    catch (error) {
      console.error('Failed to save remote config:', error)
    }
  }
}

// ============= Composable 导出 =============

/**
 * 数据仓库 Composable
 */
export function useDataRepository() {
  const dataManager = new DataManager()

  return {
    dataManager,

    // 便捷访问
    users: computed(() => dataManager.users),
    todos: computed(() => dataManager.todos),

    // 配置管理
    setRemoteConfig: (config: RemoteConfig) => dataManager.setRemoteConfig(config),
    getRemoteConfig: () => dataManager.getRemoteConfig(),

    // 同步操作
    syncAll: () => dataManager.syncAll(),

    // 初始化
    initialize: (db: Database) => dataManager.initialize(db),
  }
}
