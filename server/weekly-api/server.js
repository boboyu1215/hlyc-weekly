// ══════════════════════════════════════════════════════════════
// weekly-api — 替代 CloudBase 云函数的轻量 Node.js API 服务
// 使用 SQLite 存储，完全兼容前端 _proxy() 调用格式
// ══════════════════════════════════════════════════════════════

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3004;

// ── 中间件 ──
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── SQLite 初始化 ──
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'weeklydata.db');
const db = new Database(DB_PATH);

// 开启 WAL 模式提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

// 创建文档存储表（模拟 CloudBase 的 weeklydata 集合）
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
`);

console.log(`[weekly-api] SQLite 数据库已初始化: ${DB_PATH}`);

// ── CORS 配置（允许所有来源，生产环境可限制）──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ══════════════════════════════════════════════════════════════
// API 路由 — 完全兼容 CloudBase weeklyProxy 云函数
// ══════════════════════════════════════════════════════════════

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: Date.now() });
});

// 主路由 — 兼容 _proxy(action, id, data, extra) 的 POST 请求
app.post('/api', (req, res) => {
  const { action, id, data, ...extra } = req.body;

  try {
    switch (action) {
      case 'ping':
        return res.json({ pong: true, time: Date.now() });

      case 'get':
        return handleGet(id, res);

      case 'set':
        return handleSet(id, data, extra, res);

      case 'query':
        return handleQuery(extra, res);

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (e) {
    console.error(`[weekly-api] Error processing ${action}:`, e.message);
    return res.status(500).json({ error: e.message });
  }
});

// 兼容旧路径（POST /weeklyProxy）
app.post('/weeklyProxy', (req, res) => {
  // 直接转发到 /api
  req.url = '/api';
  app._router.handle(req, res);
});

// ── GET：读取文档 ──
function handleGet(id, res) {
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const row = db.prepare('SELECT data FROM documents WHERE id = ?').get(id);

  if (!row) {
    // 文档不存在时返回空对象（兼容前端 _dbGet 返回 null 的逻辑）
    return res.json({});
  }

  try {
    const parsed = JSON.parse(row.data);
    return res.json(parsed);
  } catch (e) {
    console.error(`[weekly-api] Failed to parse document ${id}:`, e.message);
    return res.json({});
  }
}

// ── SET：写入/更新文档 ──
function handleSet(id, data, extra, res) {
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // 合并 data 和 extra 到同一个文档
  const doc = { ...(data || {}), ...(extra || {}) };
  const jsonStr = JSON.stringify(doc);
  const now = Math.floor(Date.now() / 1000);

  // UPSERT：存在则更新，不存在则插入
  db.prepare(`
    INSERT INTO documents (id, data, updated_at, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `).run(id, jsonStr, now, now);

  // 返回写入确认（兼容前端 _dbSet 期望的返回格式）
  return res.json({ ok: true, id, _v: String(Date.now()) });
}

// ── QUERY：查询文档（虽然前端未使用，但保留兼容）──
function handleQuery(extra, res) {
  // 简单的 id 前缀查询
  if (!extra || !extra.query) {
    return res.json([]);
  }

  const { prefix } = extra.query;
  if (!prefix) {
    return res.json([]);
  }

  const rows = db.prepare(
    'SELECT id, data FROM documents WHERE id LIKE ? ORDER BY updated_at DESC'
  ).all(prefix + '%');

  const results = rows.map(row => {
    try {
      return { _id: row.id, ...JSON.parse(row.data) };
    } catch {
      return { _id: row.id, data: row.data };
    }
  });

  return res.json(results);
}

// ── 数据导入接口（迁移用，之后可删除）──
app.post('/api/import', (req, res) => {
  const { documents } = req.body;
  if (!Array.isArray(documents)) {
    return res.status(400).json({ error: 'Expected { documents: [...] }' });
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO documents (id, data, updated_at, created_at)
    VALUES (?, ?, ?, ?)
  `);

  const importMany = db.transaction((docs) => {
    let count = 0;
    for (const doc of docs) {
      const id = doc._id || doc.id;
      if (!id) continue;
      // 移除 _id 字段，保留其他所有字段
      const cleanDoc = { ...doc };
      delete cleanDoc._id;
      const jsonStr = JSON.stringify(cleanDoc);
      const now = Math.floor(Date.now() / 1000);
      // 保留原始时间戳（如果有的话）
      const createdAt = doc._createdAt || now;
      const updatedAt = doc._updatedAt || now;
      insert.run(id, jsonStr, updatedAt, createdAt);
      count++;
    }
    return count;
  });

  try {
    const count = importMany(documents);
    res.json({ ok: true, imported: count });
  } catch (e) {
    console.error('[weekly-api] Import error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── 数据导出接口 ──
app.get('/api/export', (req, res) => {
  const rows = db.prepare('SELECT id, data, created_at, updated_at FROM documents ORDER BY id').all();
  const documents = rows.map(row => {
    try {
      return { _id: row.id, ...JSON.parse(row.data), _createdAt: row.created_at, _updatedAt: row.updated_at };
    } catch {
      return { _id: row.id, data: row.data, _createdAt: row.created_at, _updatedAt: row.updated_at };
    }
  });
  res.json({ documents, exportedAt: new Date().toISOString(), count: documents.length });
});

// ── 列出所有文档 ID ──
app.get('/api/ids', (req, res) => {
  const rows = db.prepare('SELECT id FROM documents ORDER BY id').all();
  res.json({ ids: rows.map(r => r.id), count: rows.length });
});

// ══════════════════════════════════════════════════════════════
// 启动服务
// ══════════════════════════════════════════════════════════════
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[weekly-api] 服务已启动: http://127.0.0.1:${PORT}`);
  console.log(`[weekly-api] API 端点: POST /api`);
  console.log(`[weekly-api] 健康检查: GET /api/health`);
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log('[weekly-api] 收到 SIGTERM，正在关闭...');
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[weekly-api] 收到 SIGINT，正在关闭...');
  db.close();
  process.exit(0);
});
