// ════════════════════════════════════════════════════
// auth.js — 用户登录、权限管理
// ════════════════════════════════════════════════════

let _currentUser = localStorage.getItem('hlzc_user') || '';
let _userRegistry = {};

// 清除已删除用户缓存
localStorage.removeItem('hlzc_deleted_users');
const _deletedUsers = new Set();

function _markDeleted(name){ _deletedUsers.add(name); localStorage.setItem('hlzc_deleted_users',JSON.stringify([..._deletedUsers])); }
function _unmarkDeleted(name){ _deletedUsers.delete(name); localStorage.setItem('hlzc_deleted_users',JSON.stringify([..._deletedUsers])); }

async function _loadUserRegistry(){
  if(!_syncOk) return;
  try{
    const rec=await _dbGet('users');
    if(rec&&rec.data){
      _userRegistry={};
      for(const [name,data] of Object.entries(rec.data)){
        if(!HIDDEN_USERS.includes(name)) _userRegistry[name]=data;
      }
    }
  }catch(e){}
}

async function _saveUserRegistry(){
  if(!_syncOk) return;
  try{ await _dbSet('users',{data:_userRegistry,_updatedAt:Date.now()}); }catch(e){}
}

function getUserRole(name){
  if(DIRECTORS.includes(name)) return 'director';
  return (_userRegistry[name]&&_userRegistry[name].role)||'pending';
}
function isDirector(){ return DIRECTORS.includes(_currentUser)||getUserRole(_currentUser)==='director'; }
function isApproved(){
  if(DIRECTORS.includes(_currentUser)) return true;
  return EDITOR_ROLES.includes(getUserRole(_currentUser));
}
function canEditProject(p){
  if(isDirector()) return true;
  if(!isApproved()) return false;
  return p.designOwner===_currentUser;
}

function ensureUser(onReady){
  if(!_currentUser){ _showLoginModal(onReady); return; }
  if(DIRECTORS.includes(_currentUser)){ onReady(); return; }
  if(_syncOk){
    if(isApproved()){ onReady(); return; }
    else{ _showNotInSystemModal(); return; }
  }
  onReady();
}

// ── 登录弹窗 ──
let _loginOnReady = null;

function _showLoginModal(onReady){
  _loginOnReady=onReady;
  const m=document.getElementById('user-modal');
  m.classList.add('login-overlay');
  m.style.display='flex';
  document.getElementById('user-modal-body').innerHTML=_buildLoginForm();
  setTimeout(()=>{ const inp=document.getElementById('user-input'); if(inp) inp.focus(); },100);
}

function _showNotInSystemModal(){
  const m=document.getElementById('user-modal');
  m.classList.add('login-overlay');
  document.getElementById('user-modal-body').innerHTML=`
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:40px;margin-bottom:12px">🚫</div>
      <h3 style="margin-bottom:8px">账号未开通</h3>
      <p style="font-size:12px;color:var(--t2);line-height:1.8;margin-bottom:16px">
        「${esc(_currentUser)}」尚未被添加到系统<br>
        请联系总监开通账号：<br>
        <strong style="color:var(--gold)">张建波 / 冷耀秋</strong>
      </p>
      <button class="bs" style="width:100%;padding:8px" onclick="_currentUser='';localStorage.removeItem('hlzc_user');document.getElementById('user-modal-body').innerHTML=_buildLoginForm();setTimeout(()=>{const i=document.getElementById('user-input');if(i)i.focus();},100)">← 返回，换个名字登录</button>
    </div>`;
  m.style.display='flex';
}

// 登录确认（事件委托）
document.addEventListener('click', async function(e){
  const btn=e.target.closest('#user-confirm-btn');
  if(!btn) return;
  e.preventDefault();
  const name=(document.getElementById('user-input')||{value:''}).value.trim();
  const m=document.getElementById('user-modal');
  if(!name){ const inp=document.getElementById('user-input'); if(inp){inp.style.borderColor='var(--rt)';inp.focus();setTimeout(()=>inp.style.borderColor='',1500);} return; }
  btn.disabled=true; btn.textContent='登录中…';
  try{
    _currentUser=name; localStorage.setItem('hlzc_user',name);
    if(DIRECTORS.includes(name)){
      if(_syncOk&&_userRegistry[name]){_userRegistry[name].lastSeen=Date.now();_saveUserRegistry();}
      m.classList.remove('login-overlay');
      m.style.display='none'; updateUserBadge();
      const ready=_loginOnReady; _loginOnReady=null; if(ready) ready();
      return;
    }
    if(_syncOk){
      await _loadUserRegistry();
      if(isApproved()){
        if(_userRegistry[name]){_userRegistry[name].lastSeen=Date.now();_saveUserRegistry();}
        m.classList.remove('login-overlay');
        m.style.display='none'; updateUserBadge();
        const ready=_loginOnReady; _loginOnReady=null; if(ready) ready();
      }else{ btn.disabled=false; btn.textContent='进入系统'; _showNotInSystemModal(); }
    }else{
      m.classList.remove('login-overlay');
      m.style.display='none'; updateUserBadge();
      const ready=_loginOnReady; _loginOnReady=null; if(ready) ready();
    }
  }catch(err){ console.error('login error:',err); btn.disabled=false; btn.textContent='进入系统'; }
});

// Enter 键提交
document.addEventListener('keydown', function(e){
  if(e.key!=='Enter') return;
  const modal=document.getElementById('user-modal');
  if(!modal||modal.style.display==='none') return;
  const inp=document.getElementById('user-input');
  if(document.activeElement===inp){ const btn=document.getElementById('user-confirm-btn'); if(btn&&!btn.disabled) btn.click(); }
});

function _buildLoginForm(){
  return `<div data-mode="login" style="width:100%">
    <div style="text-align:center;margin-bottom:20px">
      <div style="font-size:36px;margin-bottom:10px">🏗</div>
      <div style="font-size:18px;font-weight:700;color:var(--gold);margin-bottom:4px">华力集团 · 研策部</div>
      <div style="font-size:13px;color:var(--t2)">项目周报管理系统</div>
    </div>
    <input id="user-input" type="text" placeholder="请输入你的真实姓名，如：张三"
      style="width:100%;padding:11px 14px;border:1.5px solid var(--gold);border-radius:var(--rr);font-size:14px;background:var(--card);color:var(--tx);font-family:var(--fn);margin-bottom:10px;outline:none">
    <button id="user-confirm-btn" class="bp" style="width:100%;padding:11px;font-size:14px">进入系统</button>
    <p style="font-size:11px;color:var(--t3);margin-top:12px;text-align:center;line-height:1.7">账号由总监统一开通<br>如需帮助请联系张建波或冷耀秋</p>
  </div>`;
}

function updateUserBadge(){
  const el=document.getElementById('user-badge'); if(!el) return;
  const role=getUserRole(_currentUser);
  el.textContent=_currentUser+' '+(ROLE_ICONS[role]||'');
  el.title=ROLE_LABELS[role]||'未知';
  const mgmtBtn=document.getElementById('users-btn');
  const mgmtTab=document.getElementById('tab-users');
  const kpiTab =document.getElementById('tab-kpi');
  if(mgmtBtn) mgmtBtn.style.display=isDirector()?'inline-block':'none';
  if(mgmtTab) mgmtTab.style.display=isDirector()?'inline-flex':'none';
  if(kpiTab)  kpiTab.style.display =isDirector()?'inline-flex':'none';
  setTimeout(()=>window.updateTabIndicator&&updateTabIndicator(),100);
}

window.setUserRole = async function(name,role){
  if(!isDirector()){alert('无权限');return;}
  _userRegistry[name]={...(_userRegistry[name]||{}),role,updatedBy:_currentUser,updatedAt:Date.now()};
  try{ await _dbSet('users',{data:_userRegistry,_updatedAt:Date.now()}); }
  catch(e){alert('修改失败，请检查网络');return;}
  const t=new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  _pushActivityLog({user:_currentUser,action:'修改角色',proj:'已将「'+name+'」设为'+ROLE_LABELS[role],time:t,ts:Date.now()});
  renderUserPanel();
};

window.deleteUser = async function(name){
  if(!isDirector()){alert('无权限');return;}
  if(DIRECTORS.includes(name)){alert('超级总监账号不可删除');return;}
  if(!confirm('确认删除用户「'+name+'」？\n\n删除后该用户需重新注册申请。')) return;
  showSyncStatus('saving');
  try{
    const rec=await _dbGet('users');
    const cloudData=(rec&&rec.data)||{};
    delete cloudData[name];
    await _dbSet('users',{data:cloudData,_updatedAt:Date.now(),_replace:true});
    _userRegistry={...cloudData};
    if(!HIDDEN_USERS.includes(name)) HIDDEN_USERS.push(name);
    showSyncStatus('saved'); setTimeout(()=>showSyncStatus('sync'),2000);
  }catch(e){ showSyncStatus('err'); alert('删除失败：'+e.message); return; }
  const t=new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  _pushActivityLog({user:_currentUser,action:'删除用户',proj:'已删除用户「'+name+'」',time:t,ts:Date.now()});
  renderUserPanel(); _checkPendingBadge();
  _showOfflineToast('用户已删除并同步到云端','online');
};

window.addMember = async function(){
  if(!isDirector()){alert('无权限');return;}
  const nameEl=document.getElementById('add-member-name');
  const roleEl=document.getElementById('add-member-role');
  const name=nameEl.value.trim(), role=roleEl.value;
  if(!name){nameEl.style.borderColor='var(--rt)';nameEl.focus();setTimeout(()=>nameEl.style.borderColor='',1500);return;}
  if(DIRECTORS.includes(name)){alert('该姓名已是系统总监');return;}
  if(_userRegistry[name]&&!confirm('「'+name+'」已存在，是否更新角色为：'+ROLE_LABELS[role]+'？')) return;
  _userRegistry[name]={role,joinedAt:_userRegistry[name]?.joinedAt||Date.now(),lastSeen:_userRegistry[name]?.lastSeen||0,addedBy:_currentUser,addedAt:Date.now()};
  _deletedUsers.delete(name);
  localStorage.setItem('hlzc_deleted_users',JSON.stringify([..._deletedUsers]));
  try{
    await _dbSet('users',{data:_userRegistry,_updatedAt:Date.now()});
    nameEl.value='';
    const t=new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    _pushActivityLog({user:_currentUser,action:'添加成员',proj:'已添加「'+name+'」为'+ROLE_LABELS[role],time:t,ts:Date.now()});
    renderUserPanel();
  }catch(e){alert('保存失败，请检查网络');}
};

function renderUserPanel(){
  const panelEl=document.getElementById('user-panel-content'); if(!panelEl) return;
  const members=Object.entries(_userRegistry).filter(([n])=>!DIRECTORS.includes(n)&&!HIDDEN_USERS.includes(n));
  let html=`
  <div style="background:var(--gl);border:0.5px solid var(--gm);border-radius:var(--rr);padding:12px 14px;margin-bottom:16px;font-size:12px;color:var(--gold)">
    <strong>📋 成员管理说明</strong>：由总监直接录入成员姓名和角色。成员使用录入的姓名登录即可进入系统。
  </div>
  <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
    <input id="add-member-name" placeholder="成员姓名" style="flex:1;min-width:120px;padding:7px 10px;border:0.5px solid var(--bdr);border-radius:var(--rr);background:var(--bg);color:var(--tx);font-family:var(--fn);font-size:13px">
    <select id="add-member-role" style="padding:7px 10px;border:0.5px solid var(--bdr);border-radius:var(--rr);background:var(--bg);color:var(--tx);font-family:var(--fn);font-size:13px">
      <option value="manager">设计经理</option>
      <option value="curator">策展经理</option>
      <option value="supervisor">主管</option>
      <option value="director">总监</option>
    </select>
    <button class="bp" style="padding:7px 16px;font-size:13px" onclick="addMember()">＋ 添加</button>
  </div>`;
  if(!members.length){
    html+=`<div class="empty" style="padding:24px">暂无录入成员，请使用上方表单添加</div>`;
  }else{
    html+=`<div style="font-size:11px;font-weight:700;color:var(--t3);margin-bottom:8px">已录入成员（${members.length}人）</div>`;
    members.forEach(([name,u])=>{
      const roleClr=u.role==='director'?'var(--gold)':u.role==='manager'?'var(--gt)':'var(--t2)';
      const isMe=name===_currentUser;
      const lastSeen=u.lastSeen?new Date(u.lastSeen).toLocaleDateString('zh-CN'):'未登录';
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:var(--card);border-radius:var(--rr);border:0.5px solid var(--bdr);margin-bottom:5px">
        <div style="flex:1"><div style="font-weight:700;font-size:13px">${esc(name)}${isMe?' <span style="font-size:10px;color:var(--t3);font-weight:400">（我）</span>':''}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px">最近登录：${lastSeen}</div></div>
        <div style="font-size:11px;color:${roleClr};font-weight:700">${ROLE_ICONS[u.role]||''} ${ROLE_LABELS[u.role]||u.role}</div>
        <select style="font-size:11px;padding:3px 6px;border-radius:4px;border:0.5px solid var(--bdr);background:var(--bg);color:var(--tx);font-family:var(--fn)" onchange="setUserRole('${esc(name)}',this.value)">
          <option value="${u.role}" selected>修改角色</option>
          <option value="manager">设计经理</option>
          <option value="curator">策展经理</option>
          <option value="supervisor">主管</option>
          <option value="director">总监</option>
        </select>
        ${!isMe?`<button onclick="deleteUser('${esc(name)}')" style="font-size:11px;padding:3px 8px;background:none;border:0.5px solid var(--rbd);color:var(--rt);border-radius:4px;cursor:pointer;font-family:var(--fn)">移除</button>`:''}
      </div>`;
    });
  }
  html+=`<div style="font-size:11px;font-weight:700;color:var(--t3);margin:16px 0 8px">👑 系统总监（固定）</div>`;
  DIRECTORS.forEach(d=>{
    const isMe=d===_currentUser;
    html+=`<div style="display:flex;align-items:center;gap:8px;padding:7px 12px;background:var(--gl);border-radius:var(--rr);border:0.5px solid var(--gm);margin-bottom:4px;opacity:.8">
      <div style="flex:1;font-weight:700;font-size:12px;color:var(--gold)">${esc(d)}${isMe?' （我）':''}</div>
      <div style="font-size:11px;color:var(--gold)">👑 总监</div>
    </div>`;
  });
  panelEl.innerHTML=html;
}

window.logoutUser = async function(){
  if(!confirm('确认退出？')) return;
  _currentUser=''; localStorage.removeItem('hlzc_user'); updateUserBadge();
  _showLoginModal(()=>{updateUserBadge();render();});
};

function _checkAndShowNotifications(){}
