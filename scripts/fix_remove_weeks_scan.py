import sys

with open("/var/www/weekly-api/server.js", "r") as f:
    content = f.read()

# 找到精确的标记
old_weeks = """        // ── 扫描周报文档 ──
        try {
          const weekRows = db.prepare(
            \"SELECT id, data FROM documents WHERE id LIKE 'weeks/%'\"
          ).all();

          function scanSnapshot(snap, rowId) {
            if (!snap || typeof snap !== 'object') return;
            // TaskItem 数组字段
            const arrayFields = [
              ...(Array.isArray(snap.coreAction) ? snap.coreAction : []),
              ...(Array.isArray(snap.risk) ? snap.risk : []),
              ...(Array.isArray(snap.crossDept) ? snap.crossDept : []),
              ...(Array.isArray(snap.decision) ? snap.decision : []),
            ];
            // 字符串字段也包装成 { text } 格式统一扫描
            for (const str of [snap.coreOutput, snap.next, snap.incident, snap.knowledge]) {
              if (str) arrayFields.push({ text: str });
            }
            for (const item of arrayFields) {
              if (!item?.text || !pattern.test(item.text)) continue;
              const uid = `weekly_${rowId}_${Buffer.from(item.text).toString('base64').slice(0, 12)}`;
              if (results.find(r => r.id === uid)) continue;
              results.push({
                id: uid,
                noteId: rowId,
                text: item.text.slice(0, 60),
                from: snap._updatedBy || '同事',
                createdAt: snap._ts || 0,
                source: 'weekly'
              });
            }
          }

          for (const row of weekRows) {
            try {
              const d = JSON.parse(row.data);
              if (row.id === 'weeks/data') {
                // 结构可能是单层 { weekKey: snapshot } 或双层 { weekKey: { projId: snapshot } }
                for (const weekKey of Object.keys(d)) {
                  const weekVal = d[weekKey];
                  if (!weekVal || typeof weekVal !== 'object') continue;
                  const firstVal = Object.values(weekVal)[0];
                  if (firstVal && typeof firstVal === 'object' && ('status' in firstVal || 'coreAction' in firstVal)) {
                    // 双层：{ projId: snapshot }
                    for (const projId of Object.keys(weekVal)) {
                      if (projId.startsWith('_')) continue;
                      scanSnapshot(weekVal[projId], `${row.id}/${weekKey}/${projId}`);
                    }
                  } else {
                    // 单层：weekVal 本身是 snapshot
                    scanSnapshot(weekVal, `${row.id}/${weekKey}`);
                  }
                }
              } else if (!row.id.endsWith('/_v')) {
                // 单周单项目 snapshot，如 weeks/2026-W18
                scanSnapshot(d, row.id);
              }
            } catch {}
          }
        } catch(e) { console.error('[get_mentions] weekly:', e.message); }
"""

if old_weeks not in content:
    print("ERROR: 找不到 weeks 扫描代码块")
    # 输出附近内容帮助调试
    idx = content.find("扫描周报文档")
    if idx > 0:
        print("附近内容:")
        print(repr(content[idx-50:idx+100]))
    sys.exit(1)

content = content.replace(old_weeks, "")

with open("/var/www/weekly-api/server.js", "w") as f:
    f.write(content)

print("成功: get_mentions 中的 weeks/* 文档扫描已删除")
