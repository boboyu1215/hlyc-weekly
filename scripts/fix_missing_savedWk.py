#!/usr/bin/env python3
"""
修复 weekly-api SQLite 中 _savedWk 缺失的快照记录
逻辑：从 document id 解析 weekKey（如 'snap_13_2026-W20' → '2026-W20'），写入 _savedWk 字段
"""
import sqlite3
import json
import sys

DB_PATH = "/var/www/weekly-api/data/weeklydata.db"
DRY_RUN = "--dry-run" in sys.argv

def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT id, data FROM documents WHERE id LIKE 'snap_%_%'")
    rows = cur.fetchall()

    fixed = 0
    for doc_id, data_str in rows:
        try:
            data = json.loads(data_str)
        except Exception:
            print(f"⚠️  JSON 解析失败: {doc_id}")
            continue

        # 从 id 解析 weekKey：snap_{projId}_{weekKey}
        parts = doc_id.split("_", 2)
        if len(parts) != 3:
            continue
        weekKey = parts[2]

        changed = False
        if "_savedWk" not in data:
            data["_savedWk"] = weekKey
            changed = True
            print(f"  ✏️  {doc_id}: _savedWk = {weekKey}")
        else:
            existing = data.get("_savedWk")
            if existing != weekKey:
                print(f"  ℹ️  {doc_id}: _savedWk={existing}（已有，跳过）")
            continue

        if changed:
            fixed += 1
            if not DRY_RUN:
                cur.execute(
                    "UPDATE documents SET data = ? WHERE id = ?",
                    (json.dumps(data, ensure_ascii=False), doc_id)
                )

    if not DRY_RUN:
        conn.commit()
    conn.close()

    print(f"\n{'[预览] ' if DRY_RUN else ''}共修复 {fixed} 条记录")
    if DRY_RUN:
        print("（加 --dry-run 参数仅预览，移除后真正执行）")

if __name__ == "__main__":
    main()
