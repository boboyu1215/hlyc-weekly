const fs = require('fs');
let content = fs.readFileSync('/var/www/weekly-api/server.js', 'utf8');

const oldPattern = `    const member = proj.designOwner || '';
    for (const item of snap.coreAction) {
      if (!item || !item.text || !item.text.trim()) continue;
      db.prepare(\`
        INSERT INTO task_board (week_key, member, proj_id, proj_name, task_text, due_date)
        VALUES (?, ?, ?, ?, ?, ?)
      \`).run(key, member, proj.id, proj.name, item.text.trim(), item.dueDate || '');
      count++;
    }`;

const newCode = `    const member = proj.designOwner || '';
    
    // 1. 本周计划(coreAction)
    if (Array.isArray(snap.coreAction)) {
      for (const item of snap.coreAction) {
        if (!item || !item.text || !item.text.trim()) continue;
        db.prepare(\`
          INSERT INTO task_board (week_key, member, proj_id, proj_name, task_text, due_date)
          VALUES (?, ?, ?, ?, ?, ?)
        \`).run(key, member, proj.id, proj.name, item.text.trim(), item.dueDate || '');
        count++;
      }
    }
    
    // 2. 风险/卡点(risk)
    if (Array.isArray(snap.risk)) {
      for (const item of snap.risk) {
        if (!item || !item.text || !item.text.trim()) continue;
        db.prepare(\`
          INSERT INTO task_board (week_key, member, proj_id, proj_name, task_text, due_date)
          VALUES (?, ?, ?, ?, ?, ?)
        \`).run(key, member, proj.id, proj.name, '【风险】' + item.text.trim(), item.dueDate || '');
        count++;
      }
    }
    
    // 3. 跨部门支援(crossDept)
    if (Array.isArray(snap.crossDept)) {
      for (const item of snap.crossDept) {
        if (!item || !item.text || !item.text.trim()) continue;
        db.prepare(\`
          INSERT INTO task_board (week_key, member, proj_id, proj_name, task_text, due_date)
          VALUES (?, ?, ?, ?, ?, ?)
        \`).run(key, member, proj.id, proj.name, '【支援】' + item.text.trim(), item.dueDate || '');
        count++;
      }
    }`;

content = content.replace(oldPattern, newCode);
fs.writeFileSync('/var/www/weekly-api/server.js', content);
console.log('✅ 修改完成');
