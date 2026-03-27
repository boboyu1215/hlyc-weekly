// ════════════════════════════════════════════════════
// render/users.js — 成员管理页面渲染
// ════════════════════════════════════════════════════

function renderUsersPage(){
  if(!isDirector()) return '<div class="empty">无权限查看此页面</div>';
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div>
      <div style="font-size:14px;font-weight:700">团队成员管理</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">录入成员姓名和角色，成员使用录入的姓名直接登录</div>
    </div>
    <button class="bs" style="font-size:11px;padding:5px 12px" onclick="_loadUserRegistry().then(renderUserPanel)">🔄 刷新</button>
  </div>
  <div id="user-panel-content">加载中…</div>`;
}
