import sqlite3, json

db = sqlite3.connect('/var/www/weekly-api/data/weeklydata.db')
cur = db.cursor()

# 获取合法项目ID列表
cur.execute("SELECT data FROM documents WHERE id='projects'")
row = cur.fetchone()
if row:
    data = json.loads(row[0])
    projects = data.get('projects', [])
    valid_ids = {p['id'] for p in projects}
else:
    valid_ids = set()

print(f'合法项目ID: {sorted(valid_ids)}')

# 查找所有快照
cur.execute("SELECT id FROM documents WHERE id LIKE 'snap_%'")
snap_ids = [r[0] for r in cur.fetchall()]
print(f'总快照数: {len(snap_ids)}')

# 提取快照中的项目ID并验证
to_delete = []
for sid in snap_ids:
    parts = sid.split('_')
    try:
        pid = int(parts[1])
        if pid not in valid_ids:
            to_delete.append(sid)
    except:
        pass

print(f'待删除的脏快照数: {len(to_delete)}')
for sid in to_delete:
    print(f'  删除: {sid}')
    cur.execute("DELETE FROM documents WHERE id=?", (sid,))

db.commit()
print(f'已删除 {len(to_delete)} 条脏快照')
db.close()
