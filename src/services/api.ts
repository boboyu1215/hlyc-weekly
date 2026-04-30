/**
 * API客户端 — 适配现有 weekly-api server.js 的 POST /api { action, id, data } 格式
 * 对外接口保持不变，组件层无需修改
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ── 底层代理请求（与 server.js 的 /api 路由完全兼容）──
async function proxy<T = any>(
  action: string,
  id?: string,
  data?: any,
  extra?: Record<string, any>
): Promise<ApiResponse<T>> {
  try {
    const body: Record<string, any> = { action };
    if (id !== undefined) body.id = id;
    if (data !== undefined) body.data = data;
    if (extra) Object.assign(body, extra);

    const resp = await fetch('/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const json = await resp.json();

    // server.js 错误响应格式：{ error: '...' }
    if (json && json.error) {
      return { success: false, error: json.error };
    }

    return { success: true, data: json as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '网络请求失败';
    console.error('[ApiClient]', action, id, msg);
    return { success: false, error: msg };
  }
}

export class ApiClient {
  private static instance: ApiClient;

  static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  /** 兼容性：始终返回已配置 */
  isConfigured(): boolean { return true; }
  getBaseUrl(): string { return '/api'; }
  getApiKey(): string { return ''; }
  configure(_baseUrl: string, _apiKey: string) { /* no-op */ }

  // ── 健康检查 ──
  async testConnection(): Promise<ApiResponse> {
    return proxy('ping');
  }

  // ==================== 数据读写（核心：映射到 get/set）====================

  /**
   * 通用文档读取
   */
  async getDoc<T = any>(id: string): Promise<ApiResponse<T>> {
    return proxy<T>('get', id);
  }

  /**
   * 通用文档写入（UPSERT）
   */
  async setDoc(id: string, data: any): Promise<ApiResponse> {
    return proxy('set', id, data);
  }

  /**
   * 按前缀批量查询文档（利用服务端 query action + LIKE）
   * 返回 [{ _id, ...docData }] 数组
   */
  async queryDocs<T = any>(prefix: string): Promise<ApiResponse<T[]>> {
    return proxy<T[]>('query', undefined, undefined, { query: { prefix } });
  }

  // ==================== 项目相关 ====================

  async getProjects(): Promise<ApiResponse> {
    const res = await proxy<any>('get', 'projects');
    if (!res.success) return res;
    // server.js 存储格式：{ projects: [...] }
    return { success: true, data: res.data?.projects ?? [] };
  }

  async createProject(project: any): Promise<ApiResponse> {
    // 先读，追加，再写
    const listRes = await proxy<any>('get', 'projects');
    const list: any[] = listRes.success ? (listRes.data?.projects ?? []) : [];
    list.push(project);
    return proxy('set', 'projects', { projects: list });
  }

  async updateProject(id: number, updates: any): Promise<ApiResponse> {
    const listRes = await proxy<any>('get', 'projects');
    const list: any[] = listRes.success ? (listRes.data?.projects ?? []) : [];
    const idx = list.findIndex((p: any) => p.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
    }
    return proxy('set', 'projects', { projects: list });
  }

  async deleteProject(id: number): Promise<ApiResponse> {
    const listRes = await proxy<any>('get', 'projects');
    const list: any[] = listRes.success ? (listRes.data?.projects ?? []) : [];
    const filtered = list.filter((p: any) => p.id !== id);
    return proxy('set', 'projects', { projects: filtered });
  }

  // ==================== 周报相关 ====================

  async getWeeklyData(weekKey: string): Promise<ApiResponse> {
    return proxy('get', `weeks/${weekKey}`);
  }

  /**
   * 获取某个项目的所有周快照（匹配旧系统 snap_{projId} 格式）
   */
  async getWeeklySnapshot(projectId: number): Promise<ApiResponse> {
    return proxy('get', `snap_${projectId}`);
  }

  /**
   * 保存某个项目的所有周快照（匹配旧系统 snap_{projId} 格式）
   */
  async saveProjectSnapshots(projectId: number, data: any, version?: string): Promise<ApiResponse> {
    const payload: any = { data };
    if (version) payload._v = version;
    return proxy('set', `snap_${projectId}`, payload);
  }

  async saveWeeklySnapshot(weekKey: string, projectId: number, snapshot: any): Promise<ApiResponse> {
    // 先读本周数据，再合并快照
    const weekRes = await proxy<any>('get', `weeks/${weekKey}`);
    const weekData = weekRes.success ? (weekRes.data ?? {}) : {};
    weekData[String(projectId)] = snapshot;
    return proxy('set', `weeks/${weekKey}`, weekData);
  }

  async syncWeeklyData(data: any): Promise<ApiResponse> {
    // 逐条写入每周数据
    const promises = Object.entries(data).map(([wk, wkData]) =>
      proxy('set', `weeks/${wk}`, wkData)
    );
    await Promise.all(promises);
    return { success: true };
  }

  // ==================== 用户相关 ====================

  async getUserRegistry(): Promise<ApiResponse> {
    const res = await proxy<any>('get', 'users');
    if (!res.success) return res;
    return { success: true, data: res.data ?? {} };
  }

  async updateUser(name: string, user: any): Promise<ApiResponse> {
    const regRes = await proxy<any>('get', 'users');
    const registry = regRes.success ? (regRes.data ?? {}) : {};
    registry[name] = { ...registry[name], ...user };
    return proxy('set', 'users', registry);
  }

  async updateUserRole(name: string, role: string): Promise<ApiResponse> {
    return this.updateUser(name, { role });
  }

  // ==================== 活动日志 ====================

  async getActivityLog(limit?: number): Promise<ApiResponse> {
    const res = await proxy<any>('get', 'activity');
    if (!res.success) return res;
    let logs: any[] = res.data?.logs ?? [];
    if (limit) logs = logs.slice(-limit);
    return { success: true, data: logs };
  }

  async addActivityLog(log: any): Promise<ApiResponse> {
    const res = await proxy<any>('get', 'activity');
    const logs: any[] = res.success ? (res.data?.logs ?? []) : [];
    logs.push(log);
    // 保留最近500条
    if (logs.length > 500) logs.splice(0, logs.length - 500);
    return proxy('set', 'activity', { logs });
  }

  // ==================== 全量同步 ====================

  async fullSync(localData: any): Promise<ApiResponse> {
    const promises: Promise<any>[] = [];

    if (localData.projects !== undefined) {
      promises.push(proxy('set', 'projects', { projects: localData.projects }));
    }
    if (localData.users !== undefined) {
      promises.push(proxy('set', 'users', localData.users));
    }
    if (localData.weeks !== undefined) {
      for (const [wk, wkData] of Object.entries(localData.weeks)) {
        promises.push(proxy('set', `weeks/${wk}`, wkData));
      }
    }
    if (localData.activity !== undefined) {
      promises.push(proxy('set', 'activity', { logs: localData.activity }));
    }

    await Promise.all(promises);
    return { success: true };
  }

  async incrementalSync(changes: any[]): Promise<ApiResponse> {
    for (const change of changes) {
      await proxy('set', change.id, change.data);
    }
    return { success: true };
  }

  async getServerTimestamp(): Promise<ApiResponse<number>> {
    const res = await proxy('ping');
    return { success: res.success, data: res.data?.time };
  }

  // ==================== 批量文档查询 ====================

  // 批量拉取云端所有 weeks 数据
  async queryDocsRaw(prefix: string): Promise<Record<string, any>> {
    const res = await this.post('/api', {
      action: 'query',
      query: { prefix }
    })
    // 服务端返回格式: { results: [{key, value}] }
    const results: Record<string, any> = {}
    if (res?.data?.results && Array.isArray(res.data.results)) {
      for (const item of res.data.results) {
        results[item.key] = item.value
      }
    }
    return results
  }

  // ==================== 兼容旧版 get/post/put/delete 方法 ====================

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    // /projects → get projects, /weekly/:key → get weeks/:key
    const id = endpointToId(endpoint);
    return proxy<T>('get', id);
  }

  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    const id = endpointToId(endpoint);
    return proxy<T>('set', id, data);
  }

  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    const id = endpointToId(endpoint);
    return proxy<T>('set', id, data);
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    // 删除操作暂不支持，仅记录
    console.warn('[ApiClient] delete not directly supported by server, use updateProject/deleteProject');
    return { success: false, error: 'delete not supported' };
  }
}

// 简单的 REST endpoint → document id 映射
function endpointToId(endpoint: string): string {
  // /projects → projects
  // /weekly/2026-W17 → weeks/2026-W17
  // /users → users
  // /activity → activity
  const clean = endpoint.replace(/^\//, '').replace(/\?.*$/, '');
  if (clean.startsWith('weekly/')) return 'weeks/' + clean.slice(7);
  if (clean.startsWith('projects/')) return 'projects'; // 简化
  return clean;
}

export default ApiClient.getInstance();
