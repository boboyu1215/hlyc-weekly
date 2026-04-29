import sys

with open("/var/www/weekly-api/server.js", "r") as f:
    lines = f.readlines()

# 找到要替换的代码块（536-544，0-indexed: 535-543）
# 先找标记行
start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if "// 前端实时 @提及推送（前端 selectMentionUser 发来的）" in line:
        start_idx = i - 1  # 包含前面的空行
        break

if start_idx is None:
    print("ERROR: 找不到标记行")
    sys.exit(1)

# 找到这个 if 块的结束（对应的 return 后面）
brace_count = 0
found_if = False
for i in range(start_idx + 1, len(lines)):
    if "if (id && id.startsWith('mentions/'))" in lines[i]:
        found_if = True
    if found_if:
        brace_count += lines[i].count("{") - lines[i].count("}")
        if brace_count == 0 and "}" in lines[i]:
            end_idx = i + 1  # 包含这个 }
            break

if end_idx is None:
    print("ERROR: 找不到 if 块结束")
    sys.exit(1)

print(f"替换行 {start_idx+1} 到 {end_idx+1}")

new_block = """
  // 前端实时 @提及推送（前端发来的）— 去重后再推企微
  if (id && id.startsWith('mentions/')) {
    try {
      const { from, to, text, source } = doc;
      if (from && to && text) {
        // 用 to + text 前20字指纹去重：查数据库中是否已有相同 mention
        const rawText = text.replace(/^在「[^」]+?」/, '').trim();
        const fingerprint = to + '|' + rawText.slice(0, 20);
        const existing = db.prepare(
          "SELECT id, data FROM documents WHERE id LIKE ? AND data LIKE ?"
        ).all('mentions/%', '%' + to + '%');
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
    return res.json({ ok: true });
  }
"""

lines[start_idx:end_idx] = [new_block]

with open("/var/www/weekly-api/server.js", "w") as f:
    f.writelines(lines)

print("改动2完成: handleSet 中 mentions 去重逻辑已添加")
