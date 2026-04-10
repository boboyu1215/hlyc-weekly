#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════
// migrate-from-cloudbase.js
// 从 CloudBase 导出的 JSON 导入到 weekly-api 的 SQLite 数据库
// ══════════════════════════════════════════════════════════════

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const IMPORT_FILE = process.argv[2];
const DB_PATH = process.argv[3] || path.join(__dirname, 'data', 'weeklydata.db');

if (!IMPORT_FILE) {
  console.log('用法: node migrate-from-cloudbase.js <导出的JSON文件路径> [数据库路径]');
  console.log('');
  console.log('示例:');
  console.log('  node migrate-from-cloudbase.js ~/Desktop/weeklydata-export.json');
  console.log('  node migrate-from-cloudbase.js export.json /home/ubuntu/weekly-api/data/weeklydata.db');
  process.exit(1);
}

// 检查文件是否存在
if (!fs.existsSync(IMPORT_FILE)) {
  console.error(`❌ 文件不存在: ${IMPORT_FILE}`);
  process.exit(1);
}

// 读取 JSON
console.log(`📂 读取文件: ${IMPORT_FILE}`);
const raw = fs.readFileSync(IMPORT_FILE, 'utf-8');
let documents;

try {
  const parsed = JSON.parse(raw);
  
  // CloudBase 导出格式可能是：
  // 1. 直接是数组 [{_id, ...fields}]
  // 2. 是对象 {data: [...], count: N}
  // 3. 是对象包含 records 或 documents 字段
  
  if (Array.isArray(parsed)) {
    documents = parsed;
  } else if (parsed.data && Array.isArray(parsed.data)) {
    documents = parsed.data;
  } else if (parsed.records && Array.isArray(parsed.records)) {
    documents = parsed.records;
  } else if (parsed.documents && Array.isArray(parsed.documents)) {
    documents = parsed.documents;
  } else {
    // 尝试把整个对象当做一个数组遍历
    console.warn('⚠️ 未识别的 JSON 格式，尝试作为数组处理...');
    documents = Object.values(parsed).filter(v => typeof v === 'object' && v._id);
  }
} catch (e) {
  // 标准 JSON 解析失败，尝试 NDJSON（每行一个 JSON 对象）
  console.log('  标准解析失败，尝试 NDJSON 格式（每行一个对象）...');
  try {
    documents = raw.trim().split('\n')
      .map((line, i) => {
        const lineTrimmed = line.trim();
        if (!lineTrimmed) return null;
        try {
          return JSON.parse(lineTrimmed);
        } catch (err) {
          console.warn(`  ⚠️ 跳过第 ${i + 1} 行: ${err.message}`);
          return null;
        }
      })
      .filter(Boolean);
  } catch (e2) {
    console.error(`❌ NDJSON 解析也失败: ${e2.message}`);
    process.exit(1);
  }
}

if (!documents || !documents.length) {
  console.error('❌ 没有找到任何文档数据');
  process.exit(1);
}

console.log(`📊 找到 ${documents.length} 条文档`);

// 初始化数据库
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// 导入数据
const insert = db.prepare(`
  INSERT OR REPLACE INTO documents (id, data, updated_at, created_at)
  VALUES (?, ?, ?, ?)
`);

const importAll = db.transaction((docs) => {
  let count = 0;
  const now = Math.floor(Date.now() / 1000);
  
  for (const doc of docs) {
    // 获取文档 ID
    const id = doc._id || doc.id;
    if (!id) {
      console.warn(`  ⚠️ 跳过无 ID 的文档`);
      continue;
    }
    
    // 清理 _id 字段
    const cleanDoc = { ...doc };
    delete cleanDoc._id;
    
    // 序列化
    const jsonStr = JSON.stringify(cleanDoc);
    
    // 时间戳
    const createdAt = doc._createdAt || doc.created_at || now;
    const updatedAt = doc._updatedAt || doc.updated_at || now;
    
    insert.run(id, jsonStr, updatedAt, createdAt);
    count++;
  }
  
  return count;
});

try {
  const count = importAll(documents);
  console.log(`✅ 成功导入 ${count} 条文档到 ${DB_PATH}`);
  
  // 打印文档列表
  const rows = db.prepare('SELECT id FROM documents ORDER BY id').all();
  console.log(`\n📋 已导入的文档 ID 列表：`);
  rows.forEach(r => console.log(`  - ${r.id}`));
  
} catch (e) {
  console.error(`❌ 导入失败: ${e.message}`);
  process.exit(1);
} finally {
  db.close();
}
