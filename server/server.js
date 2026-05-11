// ══════════════════════════════════════════════════════════════

// weekly-api — 替代 CloudBase 云函数的轻量 Node.js API 服务

// 使用 SQLite 存储，完全兼容前端 _proxy() 调用格式

// ══════════════════════════════════════════════════════════════



const express = require('express');

const Database = require('better-sqlite3');

const cors = require('cors');
const wxwork = require('./wxwork');

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

  CREATE TABLE IF NOT EXISTS kv (

    key TEXT PRIMARY KEY,

    value TEXT

  );

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

// 轻量级版本查询接口：只返回各snap的_ts，不返回数据
app.post('/api/snap_versions', (req, res) => {
  try {
    const rows = db.prepare("SELECT id, json_extract(data, '$._ts') as ts FROM documents WHERE id GLOB 'snap_*_*'").all();
    const result = {};
    rows.forEach(r => {
      if (r.ts !== null) {
        result[r.id] = r.ts;
      } else {
        // 周副本 _ts 为 null 时，fallback 到主snap中对应周的 _ts
        const m = r.id.match(/^snap_(\d+)_(\d{4}-W\d{2})$/);
        if (m) {
          const mainRow = db.prepare("SELECT data FROM documents WHERE id = ?").get(`snap_${m[1]}`);
          const ts = mainRow ? (JSON.parse(mainRow.data)?.[m[2]]?._ts ?? null) : null;
          result[r.id] = ts;
        } else {
          result[r.id] = null;
        }
      }
    });
    res.json({ success: true, versions: result });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});


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



      case 'board_load': {

        const d = db.prepare("SELECT value FROM kv WHERE key='board_current'").get();

        const arc = db.prepare("SELECT value FROM kv WHERE key='board_archives'").get();

        const cur = d ? JSON.parse(d.value) : {};

        return res.json({ notes: cur.notes||[], meta: cur.meta||null, archives: arc ? JSON.parse(arc.value) : [] });

      }



      case 'board_save': {
        const { notes: bn, meta: bm } = (data || {});
        // ── 读取旧数据（@提及检测 + 合并都依赖） ──
        const prevRow = db.prepare("SELECT value FROM kv WHERE key='board_current'").get();
        const prevParsed = prevRow ? JSON.parse(prevRow.value) : {};
        const prevNotes = prevParsed.notes || [];
        const prevIds = new Set(prevNotes.map(n => n.id));

        // ── @提及检测（新便签 + 编辑便签 + 新评论均扫描） ──
        try {
          const usersRow = db.prepare("SELECT data FROM documents WHERE id='users'").get();
          const userNames = usersRow ? Object.keys(JSON.parse(usersRow.data).data || {}) : [];
          for (const note of (bn || [])) {
            const isNew = !prevIds.has(note.id);
            const prevNote = prevNotes.find(n => n.id === note.id);
            const prevComments = new Set((prevNote?.comments || []).map(c => c.id));
            const textsToScan = [];
            // 新便签扫描内容
            if (isNew && note.content) textsToScan.push({ text: note.content, from: note.author });
            // 编辑已有便签：内容发生变化时也要扫描
            if (!isNew && prevNote && note.content !== prevNote.content && note.content) {
              textsToScan.push({ text: note.content, from: note.author });
            }
            // 新评论扫描
            for (const c of (note.comments || [])) {
              if (!prevComments.has(c.id)) textsToScan.push({ text: c.text, from: c.author });
            }
            for (const { text, from } of textsToScan) {
              for (const userName of userNames) {
                if (new RegExp(`@${userName}(?=[\\s，。！？,!?]|$)`).test(text)) {
                  wxwork.sendMention(from, userName, text.slice(0, 50), 'board').catch(() => {});
                }
              }
            }
          }
        } catch(e) { console.error('[wxwork]', e.message); }

        // ── 保存（以前端传来为准） ──
        const mergedNotes = (bn || []).map(n => n);
        const mergedMeta = bm || prevParsed.meta || null;
        db.prepare("INSERT OR REPLACE INTO kv(key,value) VALUES('board_current',?)").run(
          JSON.stringify({ notes: mergedNotes, meta: mergedMeta })
        );
        console.log(`[board_save] merged: ${prevNotes.length} → ${mergedNotes.length} notes`);
        return res.json({ ok: true, noteCount: mergedNotes.length });

      }




      case 'board_archive': {

        const { meta: arcMeta, notes: arcNotes } = (data || {});

        const existing = db.prepare("SELECT value FROM kv WHERE key='board_archives'").get();

        const list = existing ? JSON.parse(existing.value) : [];

        list.unshift({ ...arcMeta, notes: arcNotes });

        if (list.length > 24) list.splice(24);

        db.prepare("INSERT OR REPLACE INTO kv(key,value) VALUES('board_archives',?)").run(JSON.stringify(list));

        return res.json({ ok: true });

      }

      case 'board_archive_get': {
        const id = (data && data.id);
        if (!id) {
          return res.json({ error: '缺少归档 id' });
        }
        const row = db.prepare('SELECT value FROM kv WHERE key = ?').get('board_archives');
        if (!row) {
          return res.json({ error: '无任何归档' });
        }
        let archives;
        try {
          archives = JSON.parse(row.value);
        } catch (e) {
          console.error('[board_archive_get] 归档解析失败', e);
          return res.json({ error: '归档数据损坏' });
        }
        if (!Array.isArray(archives)) {
          return res.json({ error: '归档数据格式异常' });
        }
        const found = archives.find(a => (a.meta && a.meta.id === id) || a.id === id);
        if (!found) {
          return res.json({ error: '归档不存在: ' + id });
        }
        const notes = found.notes || [];
        const meta = found.meta || {
          id: found.id,
          title: found.title,
          startWeek: found.startWeek,
          createdAt: found.createdAt,
          archivedAt: found.archivedAt
        };
        console.log(`[board_archive_get] id=${id}, notes=${notes.length}`);
        return res.json({ notes, meta });
      }




      // ── 新增：按 id 拉取归档详情（D疾修复）──
            case 'backup_status': {

        const lastSync = db.prepare("SELECT value FROM kv WHERE key='backup_last_sync'").get();

        const lastResult = db.prepare("SELECT value FROM kv WHERE key='backup_last_result'").get();

        return res.json({

          authorized: true,

          lastSync: lastSync?.value || '',

          lastResult: lastResult ? JSON.parse(lastResult.value) : null

        });

      }



      case 'backup_now': {

        const { backup: doBackup } = require('./backup-google');

        doBackup().then(result => {

          db.prepare("INSERT OR REPLACE INTO kv(key,value) VALUES('backup_last_sync',?)").run(new Date().toISOString());

          db.prepare("INSERT OR REPLACE INTO kv(key,value) VALUES('backup_last_result',?)").run(JSON.stringify(result || {}));

        }).catch(e => console.error('[backup_now]', e.message));

        return res.json({ ok: true });

      }





      case 'get_mentions': {
        const { user } = (data || {});
        if (!user) return res.json({ mentions: [] });
        const pattern = new RegExp(`@${user}(?=[\\s，。！？,!?]|$)`, 'i');
        const results = [];

        // ── 扫描黑板报 ──
        try {
          const cur = db.prepare("SELECT value FROM kv WHERE key='board_current'").get();
          if (cur) {
            const board = JSON.parse(cur.value);
            for (const note of (board.notes || [])) {
              // 文字便签：扫 content
              if (note.type === 'text' && pattern.test(note.content || '')) {
                results.push({
                  id: `note_${note.id}`,
                  noteId: note.id,
                  text: note.content.slice(0, 60),
                  from: note.author,
                  createdAt: note.createdAt,
                  source: 'board'
                });
              }
              // 图片便签：扫 caption
              if (note.type === 'image' && pattern.test(note.caption || '')) {
                results.push({
                  id: `note_cap_${note.id}`,
                  noteId: note.id,
                  text: (note.caption || '').slice(0, 60),
                  from: note.author,
                  createdAt: note.createdAt,
                  source: 'board'
                });
              }
              for (const c of (note.comments || [])) {
                if (pattern.test(c.text || '')) {
                  results.push({
                    id: `comment_${c.id}`,
                    noteId: note.id,
                    text: c.text.slice(0, 60),
                    from: c.author,
                    createdAt: c.createdAt,
                    source: 'board'
                  });
                }
              }
            }
          }
        } catch(e) { console.error('[get_mentions] board:', e.message); }


        // ── 扫描前端主动推送的 mentions/* 文档 ──
        try {
          const mentionRows = db.prepare(
            "SELECT id, data FROM documents WHERE id LIKE 'mentions/%'"
          ).all();
          for (const row of mentionRows) {
            try {
              const d = JSON.parse(row.data);
              if (d.to === user) {
                results.push({
                  id: row.id,
                  noteId: row.id,
                  text: d.text || '',
                  from: d.from || '同事',
                  createdAt: d.createdAt || 0,
                  source: d.source || 'weekly'
                });
              }
            } catch {}
          }
        } catch(e) { console.error('[get_mentions] push mentions:', e.message); }


        // 按时间倒序，最多返回 30 条
        results.sort((a, b) => b.createdAt - a.createdAt);
        return res.json({ mentions: results.slice(0, 30) });
      }
      case 'tb_list':
        return res.json(global.tbHandlers.tbList(req.body));
      case 'tb_mark_done':
        return res.json(global.tbHandlers.tbMarkDone(req.body));
      case 'tb_push':
        global.tbHandlers.tbPush(req.body).then(r => res.json(r)).catch(e => res.json({ok:false,error:e.message}));
        return;
      case 'tb_logs':
        return res.json(global.tbHandlers.tbLogs(req.body));
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

  // 调试日志
  if (id.startsWith('mentions/')) {
    console.log(`[handleSet] mentions received: id=${id}, data=`, JSON.stringify(data));
  }



  // 合并 data 和 extra 到同一个文档

  const doc = { ...(data || {}), ...(extra || {}) };

  const jsonStr = JSON.stringify(doc);

  const now = Math.floor(Date.now() / 1000);



  // ── mentions 推送：先查重再写入，避免查到自己刚插入的记录 ──
  if (id && id.startsWith('mentions/')) {
    try {
      const { from, to, text, source } = doc;
      if (from && to && text) {
        // 用 to + text 前20字指纹去重
        const rawText = text.replace(/^在「[^」]+?」/, '').trim();
        const fingerprint = to + '|' + rawText.slice(0, 20);
        const existing = db.prepare(
          "SELECT id, data FROM documents WHERE id LIKE 'mentions/%' AND id != ?"
        ).all(id);
        let isDup = false;
        for (const row of existing) {
          try {
            const d = JSON.parse(row.data || '{}');
            const rRawText = (d.text || '').replace(/^在「[^」]+?」/, '').trim();
            const fp = d.to + '|' + rRawText.slice(0, 20);
            if (fp === fingerprint) { isDup = true; break; }
          } catch {}
        }
        if (isDup) {
          console.log('[mention] 去重跳过: ' + fingerprint);
        } else {
          console.log('[mention] ' + from + ' -> ' + to + ' (' + source + '): ' + text.slice(0, 40));
          wxwork.sendMention(from, to, text, source || 'weekly').catch(() => {});
        }
      }
    } catch(e) { console.error('[mention] push error:', e.message); }
    // 写入数据库（无论是否去重都存储，用于铃铛展示 + 下次去重参考）
    db.prepare(`
      INSERT INTO documents (id, data, updated_at, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `).run(id, jsonStr, now, now);
    return res.json({ ok: true });
  }

  // UPSERT：存在则更新，不存在则插入（非 mentions 的普通文档）
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

// ─── KPI 自动顺延 cron ───
try {
  const kpiCron = require('./kpi-cron')(db, wxwork);
  app.post('/api/kpi-cron-trigger', async (req, res) => {
    const { user } = req.body || {};
    const DIRECTORS = ['张建波', '冷耀秋'];
    if (!DIRECTORS.includes(user)) {
      return res.status(403).json({ error: '仅总监可手动触发' });
    }
    try {
      await kpiCron.runNow();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  console.log('[server] kpi-cron 已加载');
} catch (e) {
  console.error('[server] 加载 kpi-cron 失败', e);
}

/**
 * ============================================================
 * 工作清单模块 — server.js 追加补丁
 * 部署：将此文件内容追加到 /var/www/weekly-api/server.js 末尾
 *       (在 app.listen 之前)
 * 依赖：npm install node-cron axios（在 /var/www/weekly-api/ 下执行）
 * ============================================================
 */

const cron = require('node-cron');
const axios = require('axios');

// ── 企微机器人 Webhook ──
const QYWX_WEBHOOK = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=58150365-9d29-4983-976c-b82da02b5d32';

// ── 建表 ──
db.exec(`
  CREATE TABLE IF NOT EXISTS task_board (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    week_key  TEXT NOT NULL,
    member    TEXT NOT NULL,
    proj_id   INTEGER,
    proj_name TEXT,
    task_text TEXT NOT NULL,
    due_date  TEXT,
    done      INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now')*1000)
  );
  CREATE TABLE IF NOT EXISTS push_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT,
    week_key   TEXT,
    push_date  TEXT,
    status     TEXT,
    message    TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')*1000)
  );
`);

// ── ISO 周工具（Node 侧，与前端 date.ts 逻辑一致）──
function isoWk(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const yr = date.getFullYear();
  const wk = 1 + Math.round(
    ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return { yr, wk };
}

function wkKey(yr, wk) {
  return `${yr}-W${String(wk).padStart(2, '0')}`;
}

/** 获取某 ISO 周的周一日期 */
function wkMonday(yr, wk) {
  const jan4 = new Date(yr, 0, 4);
  const offset = (jan4.getDay() + 6) % 7;
  const mon = new Date(yr, 0, 4 - offset);
  mon.setDate(mon.getDate() + (wk - 1) * 7);
  return mon;
}

/** 格式化日期 YYYY-MM-DD */
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/** 中文星期 */
const DAY_CN = ['周日','周一','周二','周三','周四','周五','周六'];

// ── 从 SQLite kv 表读取周报数据 ──
function getDoc(id) {
  try {
    let row = db.prepare('SELECT data FROM documents WHERE id = ?').get(id);
    if (row) return JSON.parse(row.data);
    row = db.prepare('SELECT value FROM kv WHERE key = ?').get(id);
    return row ? JSON.parse(row.value) : null;
  } catch { return null; }
}

// ── 生成本周工作清单（周一 06:00 执行）──
function generateWeekTaskBoard(targetWeekKey) {
  const now = new Date();
  // 优先使用传入的 weekKey，否则取当前周
  let key = targetWeekKey;
  let yr, wk;
  if (key) {
    const m = key.match(/^(\d{4})-W(\d{2})$/);
    yr = parseInt(m[1]); wk = parseInt(m[2]);
  } else {
    const yw = isoWk(now);
    yr = yw.yr; wk = yw.wk;
    key = wkKey(yr, wk);
  }

  // [TEST] 日期校验临时禁用，验证完毕后恢复
  const mon = wkMonday(yr, wk);
  const monStr = fmtDate(mon);
  const todayStr = fmtDate(now);
  // if (todayStr !== monStr) {
  //   console.warn(`[TaskBoard] 日期校验失败：今天 ${todayStr} 不是 ${key} 的周一 ${monStr}，跳过生成`);
  //   writePushLog('generate', key, todayStr, 'skip', `日期校验失败：${todayStr} !== ${monStr}`);
  //   return;
  // }

  // 清除本周旧清单
  db.prepare('DELETE FROM task_board WHERE week_key = ?').run(key);

  // 读取项目列表
  const projDoc = getDoc('projects');
  const projects = projDoc?.projects || [];

  // 读取本周各项目快照
  let count = 0;
  for (const proj of projects) {
    if (proj.archived) continue;
    const weekSnap = getDoc(`snap_${proj.id}_${key}`);
    const snap = weekSnap ?? (getDoc(`snap_${proj.id}`)?.[key] ?? null);
    if (!snap || !Array.isArray(snap.coreAction)) continue;

    const member = proj.designOwner || '';
    for (const item of snap.coreAction) {
      if (!item || !item.text || !item.text.trim()) continue;
      db.prepare(`
        INSERT INTO task_board (week_key, member, proj_id, proj_name, task_text, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(key, member, proj.id, proj.name, item.text.trim(), item.dueDate || '');
      count++;
    }
  }

  writePushLog('generate', key, todayStr, 'ok', `生成 ${count} 条任务`);
  console.log(`[TaskBoard] ${key} 生成完成，共 ${count} 条`);
}

// ── 推送企微（早 09:00 / 晚 17:00）──
async function pushToQywx(type) {
  const now = new Date();
  const { yr, wk } = isoWk(now);
  const key = wkKey(yr, wk);
  const todayStr = fmtDate(now);
  const dayIdx = now.getDay(); // 0=日,1=一...6=六
  const dayCn = DAY_CN[dayIdx];

  // 校验本周范围（周一~周日）
  const mon = wkMonday(yr, wk);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  if (now < mon || now > sun) {
    console.warn(`[TaskBoard] 推送日期 ${todayStr} 不在 ${key} 范围内，跳过`);
    writePushLog(type, key, todayStr, 'skip', '日期不在本周范围');
    return;
  }

  // 读取本周所有任务
  const tasks = db.prepare(
    'SELECT * FROM task_board WHERE week_key = ? ORDER BY member, proj_name'
  ).all(key);

  if (!tasks || tasks.length === 0) {
    writePushLog(type, key, todayStr, 'skip', '无任务数据');
    return;
  }

  // 按成员分组
  const grouped = {};
  for (const t of tasks) {
    if (!grouped[t.member]) grouped[t.member] = [];
    grouped[t.member].push(t);
  }

  const isMorning = type === 'morning';
  const timeTag = isMorning ? '🌅 早间提醒' : '🌆 晚间确认';
  const title = isMorning
    ? `研策部 ${dayCn} 工作任务 | ${key}`
    : `研策部 ${dayCn} 任务完成确认 | ${key}`;

  // 构建 markdown 内容
  let content = `## ${title}\n`;
  content += `> ${yr}年 第${wk}周（${fmtDate(mon).replace(/-/g,'/')} ~ ${fmtDate(sun).replace(/-/g,'/')}）\n\n`;

  for (const [member, memberTasks] of Object.entries(grouped)) {
    if (!member) continue;
    content += `**👤 ${member}**\n`;
    for (const t of memberTasks) {
      const done = t.done ? '✅' : (isMorning ? '⬜' : '❓');
      const due = t.due_date ? `（截止 ${t.due_date}）` : '';
      content += `${done} 【${t.proj_name}】${t.task_text}${due}\n`;
    }
    content += '\n';
  }

  if (!isMorning) {
    content += `\n> 请各成员确认今日工作完成情况，如有未完成请说明原因。`;
  }

  // 发送企微卡片（markdown 类型）
  const payload = {
    msgtype: 'markdown',
    markdown: { content }
  };

  try {
    const resp = await axios.post(QYWX_WEBHOOK, payload, { timeout: 8000 });
    const status = resp.data?.errcode === 0 ? 'ok' : 'fail';
    writePushLog(type, key, todayStr, status, JSON.stringify(resp.data));
    console.log(`[TaskBoard] 推送 ${type} ${status}:`, resp.data);
  } catch (e) {
    writePushLog(type, key, todayStr, 'error', e.message);
    console.error(`[TaskBoard] 推送失败:`, e.message);
  }
}

function writePushLog(type, weekKey, pushDate, status, message) {
  try {
    db.prepare(`
      INSERT INTO push_log (type, week_key, push_date, status, message)
      VALUES (?, ?, ?, ?, ?)
    `).run(type, weekKey, pushDate, status, message || '');
  } catch(e) { console.error('[TaskBoard] 写日志失败:', e.message); }
}

// ── Cron 定时任务 ──
// 每天 09:00 推送当日任务
cron.schedule('0 9 * * *', () => pushTodayTasks('morning'), { timezone: 'Asia/Shanghai' });
// 每天 17:00 晚间确认
cron.schedule('0 17 * * *', () => pushTodayTasks('evening'), { timezone: 'Asia/Shanghai' });
console.log('[TaskBoard] cron 已注册（09:00晨推 / 17:00晚推）');

// ── 建表 ──
db.exec(`
  CREATE TABLE IF NOT EXISTS task_done (
    task_key   TEXT PRIMARY KEY,
    done       INTEGER DEFAULT 1,
    updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
  );
`);

// ── ISO 周工具（服务端）──
function isoWkNum(dateStr) {
  // 返回 { yr, wk } for YYYY-MM-DD
  const d = new Date(dateStr + 'T12:00:00+08:00');
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const week1 = new Date(d.getFullYear(), 0, 4);
  const yr = d.getFullYear();
  const wk = 1 + Math.round((d.getTime() - week1.getTime()) / 604800000);
  return `${yr}-W${String(wk).padStart(2,'0')}`;
}

function getIsoWeekRange(weekKey) {
  // weekKey = 'YYYY-Www' → { monStr, sunStr }
  const m = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const yr = parseInt(m[1]), wk = parseInt(m[2]);
  const jan4 = new Date(yr, 0, 4);
  const off = (jan4.getDay() + 6) % 7;
  const mon = new Date(yr, 0, 4 - off);
  mon.setDate(mon.getDate() + (wk - 1) * 7);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return { monStr: fmt(mon), sunStr: fmt(sun) };
}

// ── 读取指定周的所有任务（按 weekKey 筛选，不按 dueDate 范围）──
function getTasksByWeek(weekKey) {
  try {
    const projDoc = getDoc('projects');
    const projects = (projDoc?.projects || []).filter(p => !p.archived);
    const tasks = [];
    const seen = new Set();

    for (const proj of projects) {
      // 优先读周副本 snap_{id}_{weekKey}，兜底读主快照 snap_{id}[weekKey]
      let snap = null;
      const weekSnap = getDoc(`snap_${proj.id}_${weekKey}`);
      if (weekSnap && (weekSnap.coreAction || weekSnap.risk || weekSnap.crossDept)) {
        snap = weekSnap;
      } else {
        const snapDoc = getDoc(`snap_${proj.id}`);
        if (snapDoc) snap = snapDoc[weekKey];
      }
      if (!snap) continue;

      const addItems = (items, type) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (!item?.text?.trim()) continue;
          if (!item.dueDate) continue;
          const due = item.dueDate.trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
          const taskKey = `${proj.id}:${type}:${due}:${Buffer.from(item.text.trim().slice(0,40)).toString('base64').slice(0,20)}`;
          if (seen.has(taskKey)) continue;
          seen.add(taskKey);
          tasks.push({
            task_key:  taskKey,
            proj_id:   proj.id,
            proj_name: proj.name,
            member:    proj.designOwner || '',
            task_text: item.text.trim(),
            due_date:  due,
            week_key:  weekKey,
            task_type: type,
          });
        }
      };

      addItems(snap.coreAction, 'core');
      addItems(snap.risk,       'risk');
      addItems(snap.crossDept,  'cross');
    }
    return tasks;
  } catch(e) {
    console.error('[TaskBoard] getTasksByWeek error:', e.message);
    return [];
  }
}

// ── 读完成状态 ──
function getDoneMap() {
  try {
    const rows = db.prepare('SELECT task_key FROM task_done WHERE done=1').all();
    const map = {};
    for (const r of rows) map[r.task_key] = true;
    return map;
  } catch { return {}; }
}

// ── 推送当日任务 ──
async function pushTodayTasks(type) {
  const now = new Date();
  // 用北京时间
  const bj = new Date(now.getTime() + 8 * 3600000);
  const todayStr = `${bj.getUTCFullYear()}-${String(bj.getUTCMonth()+1).padStart(2,'0')}-${String(bj.getUTCDate()).padStart(2,'0')}`;
  const dayNames = ['周日','周一','周二','周三','周四','周五','周六'];
  const dayCn = dayNames[bj.getUTCDay()];

  // 当日属于哪个 ISO 周
  const weekKey = isoWkNum(todayStr);
  const allTasks = getTasksByWeek(weekKey);
  const todayTasks = allTasks.filter(t => t.due_date === todayStr);

  if (!todayTasks.length) {
    writePushLog(type, weekKey, todayStr, 'skip', '今日无任务');
    console.log(`[TaskBoard] ${todayStr} 无任务，跳过`);
    return;
  }

  const doneMap = getDoneMap();
  const isMorning = type === 'morning';
  const title = isMorning
    ? `🌅 研策部今日工作提醒 ${todayStr}（${dayCn}）`
    : `🌆 研策部今日工作确认 ${todayStr}（${dayCn}）`;

  // 按成员分组
  const grouped = {};
  for (const t of todayTasks) {
    if (!grouped[t.member]) grouped[t.member] = [];
    grouped[t.member].push(t);
  }

  let mdContent = `## ${title}\n`;
  for (const [member, mTasks] of Object.entries(grouped)) {
    if (!member) continue;
    mdContent += `\n**👤 ${member}**\n`;
    for (const t of mTasks) {
      const icon = doneMap[t.task_key] ? '✅' : (isMorning ? '⬜' : '❓');
      mdContent += `${icon} 【${t.proj_name}】${t.task_text}\n`;
    }
  }
  if (!isMorning) mdContent += `\n> 请各成员确认今日完成情况，未完成请说明原因。`;

  try {
    const resp = await axios.post(QYWX_WEBHOOK,
      { msgtype: 'markdown', markdown: { content: mdContent } },
      { timeout: 8000 }
    );
    const errcode = resp.data?.errcode;
    const status = errcode === 0 ? 'ok' : 'fail';
    writePushLog(type, weekKey, todayStr, status, `errcode=${errcode} errmsg=${resp.data?.errmsg} tasks=${todayTasks.length}`);
    console.log(`[TaskBoard] 推送${type} ${status} errcode=${errcode}`);
  } catch(e) {
    writePushLog(type, weekKey, todayStr, 'error', e.message);
    console.error('[TaskBoard] 推送失败:', e.message);
  }
}

// ── API handlers ──

// tb_list: 按 weekKey 返回任务，前端传 weekKey
function tbList({ data }) {
  try {
    const { weekKey } = data || {};
    if (!weekKey) return { ok: false, error: 'missing weekKey' };
    const tasks = getTasksByWeek(weekKey);
    const doneMap = getDoneMap();
    const result = tasks.map(t => ({ ...t, done: doneMap[t.task_key] ? 1 : 0 }));
    return { ok: true, data: result, week_key: weekKey };
  } catch(e) { return { ok: false, error: e.message }; }
}

// tb_mark_done: task_key 作为 id
function tbMarkDone({ id: taskKey, data: { done } }) {
  try {
    if (done) {
      db.prepare('INSERT OR REPLACE INTO task_done (task_key, done) VALUES (?,1)').run(taskKey);
    } else {
      db.prepare('DELETE FROM task_done WHERE task_key=?').run(taskKey);
    }
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

// tb_push: 手动触发推送
async function tbPush({ data: { type } }) {
  try {
    await pushTodayTasks(type || 'morning');
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

// tb_logs
function tbLogs({ data: { limit } }) {
  try {
    const rows = db.prepare('SELECT * FROM push_log ORDER BY id DESC LIMIT ?').all(limit || 20);
    return { ok: true, data: rows };
  } catch(e) { return { ok: false, error: e.message }; }
}

global.tbHandlers = { tbList, tbMarkDone, tbPush, tbLogs };

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



// ── 每周一 02:00 自动备份到 Google Drive ──


const { backup: googleBackup } = require('./backup-google');

cron.schedule('0 2 * * 1', () => {

  googleBackup().catch(e => console.error('[周报备份] 定时任务失败:', e.message));

}, { timezone: 'Asia/Shanghai' });

console.log('[weekly-api] Google Drive 备份已启用，每周一 02:00 执行');



// ── 每周五 09:00 周报提醒推送 ──
cron.schedule('0 9 * * 5', () => {
  try {
    // 查询所有用户
    const usersRow = db.prepare("SELECT data FROM documents WHERE id='users'").get();
    if (!usersRow || !usersRow.data) {
      console.log('[周报提醒] 无用户数据');
      return;
    }
    let usersData;
    try {
      usersData = JSON.parse(usersRow.data);
    } catch (e) {
      console.error('[周报提醒] users 文档 JSON 解析失败', e);
      return;
    }
    // 兼容两种格式：对象（{"张建波": {...}}）或数组（[{name:"张建波"},...]）
    let userList;
    if (Array.isArray(usersData)) {
      userList = usersData;
    } else if (usersData && typeof usersData === 'object') {
      userList = Object.entries(usersData).map(([name, info]) => ({
        name,
        ...(info && typeof info === 'object' ? info : {})
      }));
    } else {
      console.log('[周报提醒] users 数据格式异常');
      return;
    }
    if (userList.length === 0) {
      console.log('[周报提醒] 用户列表为空');
      return;
    }

    // 查询本周已提交周报的人员
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // 本周一
    weekStart.setHours(0, 0, 0, 0);
    const weekStartTs = Math.floor(weekStart.getTime() / 1000);

    // 从 documents 表中找本周有更新的周报（weeks/ 前缀）
    const weekKey = `${now.getFullYear()}-W${String(Math.ceil((now - new Date(now.getFullYear(),0,1)) / 604800000)).padStart(2,'0')}`;
    const docs = db.prepare("SELECT data FROM documents WHERE id LIKE 'weeks/%'").all();
    const submitted = new Set();
    for (const doc of docs) {
      try {
        const d = JSON.parse(doc.data);
        // weeks/data 结构：{ weekKey: { projId: snapshot } }
        if (d[weekKey]) {
          for (const snap of Object.values(d[weekKey])) {
            if (snap && typeof snap === 'object' && snap._updatedBy) submitted.add(snap._updatedBy);
          }
        }
        // 单周单项目结构
        if (d._updatedBy && d._ts && d._ts >= weekStartTs * 1000) submitted.add(d._updatedBy);
      } catch {}
    }

    // 计算未提交名单
    const allNames = userList.map(u => u.name || u.username).filter(Boolean);
    const unsubmitted = allNames.filter(name => !submitted.has(name));

    wxwork.sendWeeklyReminder(unsubmitted).catch(e => {
      console.error('[周报提醒] 推送失败:', e.message);
    });
  } catch (e) {
    console.error('[周报提醒] 任务执行失败:', e.message);
  }
}, { timezone: 'Asia/Shanghai' });

console.log('[weekly-api] 周报提醒已启用，每周五 09:00 推送');
