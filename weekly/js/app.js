// ════════════════════════════════════════════════════
// app.js — 主控制器
// 职责：全局状态、render 分发、拖拽排序、
//       导入导出、主题切换、tabs 指示器、初始化
// ════════════════════════════════════════════════════

// ════ 注：所有常量已在 config.js 中定义，utils.js 中已有工具函数 ════
// SL, FIELD_LABELS, STATUS_LABEL → config.js
// sc, esc, fieldVal, autoH, todayStr, _relativeTime → utils.js
// isoWk, wkKey, parseWkKey, wkLabel, wkRange → utils.js

// ════ 全局状态 ════
const NOW=new Date(); const {yr:CYR,wk:CWK}=isoWk(NOW);
// 周五自动跳转到下周：当前是周五（getDay()===5）时，默认显示下一周
const _isFriday = NOW.getDay() === 5;
const _defaultYr = _isFriday ? (CWK >= 52 ? CYR + 1 : CYR) : CYR;
const _defaultWk = _isFriday ? (CWK >= 52 ? 1 : CWK + 1) : CWK;
let S={tab:'weekly',yr:_defaultYr,wk:_defaultWk,editId:null,wkEditId:null,
  pendingDelId:null,pendingArchId:null,pendingUnarchId:null,
  showArch:false,form:{},wform:{},meetingEditId:null,meetingForm:null};
function isNow(){return S.yr===CYR&&S.wk===CWK}
function canEdit(){return true}
function todayStr(){return new Date().toLocaleDateString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit'})}
function sc(s){return s==='r'?'r':s==='y'?'y':'g'}
function blankProj(){return{name:'',area:'',startDate:'',schemeDate:'',designDate:'',siteDate:'',completionDate:'',openDate:'',prepOwner:'',designOwner:'',defStatus:'g',defStage:0}}
function blankWkForm(pid){return getSnap(S.yr,S.wk,pid,LP())}

// ════ 种子数据 ════
function seed(){
  if(LP().length)return;
  const ps=[ {id:1,name:'示例项目',area:'1200㎡',startDate:'',schemeDate:'',designDate:'',siteDate:'',completionDate:'',openDate:'',prepOwner:'张三',designOwner:'李四',archived:false,defStatus:'g',defStage:0} ];
  SP(ps);
  const snap={ 1:{status:'g',stage:0,risk:'',next:'',decision:'无',coreOutput:'示例',coreAction:'',incident:'',crossDept:'',knowledge:''} };
  const weeks=LW();weeks[wkKey(CYR,CWK)]=snap;SW(weeks);
}

// ════ 主渲染分发器 ════
function render(){
  let html='';
  if(S.tab==='weekly')html=renderWeekly();
  else if(S.tab==='charts')html=renderCharts();
  else if(S.tab==='input')html=renderProjForm();
  else if(S.tab==='overview')html=renderOverview();
  else if(S.tab==='meeting')html=renderMeeting();
  else if(S.tab==='archive')html=renderArchive();
  else if(S.tab==='history')html=renderHistory();
  else if(S.tab==='wkinput')html=renderWkForm();
  else if(S.tab==='kpi')html=renderKpiPage();
  else if(S.tab==='users')html=renderUsersPage();
  document.getElementById('content').innerHTML=html;
  const TABS=['weekly','charts','input','overview','meeting','archive','history'];
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('on',TABS[i]===S.tab||(S.tab==='wkinput'&&TABS[i]==='weekly')));
  if(S.tab==='weekly')initDrag();
  if(S.tab==='users')renderUserPanel();
  if(S.tab==='kpi') setTimeout(_loadKpiPanel, 50);
  document.querySelectorAll('textarea.auto-h').forEach(t=>{autoH(t);});
  setTimeout(()=>{ window._initTabsDrag&&_initTabsDrag(); window.updateTabIndicator&&updateTabIndicator(); }, 50);
  if(_syncOk) showSyncStatus('sync');
  else if(_pendingSync) showSyncStatus('pending');
  else showSyncStatus('local');
}

// 切换标签页
window.ST=function(t){ S.tab=t; if(t==='input'){S.editId=null;S.form=blankProj();} render(); updateTabIndicator(); };

// ════ 周导航 ════
window.prevWk=function(){S.wk--;if(S.wk<1){S.yr--;S.wk=52}updL();render();};
window.nextWk=function(){S.wk++;if(S.wk>52){S.yr++;S.wk=1}updL();render();};
function updL(){
  const el = document.getElementById('wl');
  if(!el) return;
  const isCurrent = (S.yr === CYR && S.wk === CWK);
  el.textContent = `${S.yr} W${S.wk}`;
  // 当前周：红色粗体 + 稍大字号，醒目提示
  el.style.color      = isCurrent ? '#c0392b' : '';
  el.style.fontWeight = isCurrent ? '900'     : '400';
  el.style.fontSize   = isCurrent ? '13px'    : '';
  el.style.background = isCurrent ? 'rgba(176,0,32,0.08)' : '';
  el.style.borderRadius = isCurrent ? '6px'  : '';
  el.style.padding    = isCurrent ? '2px 8px' : '';
  el.title = isCurrent ? '本周' : '';
}
// 注：autoH 已在 utils.js 中定义

// ════ 拖拽排序 ════
let _dragId=null,_lpTimer=null;
window.startLongPress=function(e,id){ _lpTimer=setTimeout(()=>{const el=document.getElementById('pc-'+id);if(el){el.setAttribute('draggable','true');el.classList.add('dragging');}},400); };
window.cancelLongPress=function(){clearTimeout(_lpTimer);};
window.onDragStart=function(e){ _dragId=+e.currentTarget.dataset.id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; };
window.onDragOver=function(e){ e.preventDefault();e.dataTransfer.dropEffect='move'; document.querySelectorAll('.pc.drag-over').forEach(el=>el.classList.remove('drag-over')); e.currentTarget.classList.add('drag-over'); };
window.onDrop=function(e){
  e.preventDefault(); const targetId=+e.currentTarget.dataset.id; if(!_dragId||_dragId===targetId)return;
  const ps=LP(); const active=ps.filter(p=>!p.archived).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0));
  const fromIdx=active.findIndex(p=>p.id===_dragId); const toIdx=active.findIndex(p=>p.id===targetId);
  if(fromIdx<0||toIdx<0)return;
  const reordered=[...active]; const [moved]=reordered.splice(fromIdx,1); reordered.splice(toIdx,0,moved);
  reordered.forEach((p,i)=>{p.sortOrder=i;});
  const updated=ps.map(p=>{const r=reordered.find(x=>x.id===p.id);return r?{...p,sortOrder:r.sortOrder}:p;});
  SP(updated);render();
};
window.onDragEnd=function(e){ e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.pc.drag-over').forEach(el=>el.classList.remove('drag-over')); _dragId=null; };
function initDrag(){ document.querySelectorAll('#sortable-grid .pc[data-id]').forEach(el=>el.setAttribute('draggable','true')); }

// ════ Tabs 拖动滚动 + 指示器 ════
(function(){
  let isDown=false, startX=0, scrollLeft=0;
  function initTabsDrag(){
    const el = document.getElementById('tabs');
    if(!el || el._dragInit) return;
    el._dragInit = true;
    el.addEventListener('mousedown', e=>{
      if(e.target.tagName==='BUTTON') return;
      isDown=true; el.classList.add('is-dragging');
      startX=e.pageX-el.offsetLeft; scrollLeft=el.scrollLeft;
    });
    el.addEventListener('mouseleave', ()=>{ isDown=false; el.classList.remove('is-dragging'); });
    el.addEventListener('mouseup', ()=>{ isDown=false; el.classList.remove('is-dragging'); });
    el.addEventListener('mousemove', e=>{
      if(!isDown) return;
      e.preventDefault();
      const x=e.pageX-el.offsetLeft;
      el.scrollLeft = scrollLeft-(x-startX)*1.5;
      updateTabIndicator();
    });
    el.addEventListener('scroll', updateTabIndicator);
  }
  window.updateTabIndicator = function(){
    const el = document.getElementById('tabs');
    const bar = document.getElementById('tab-indicator-bar');
    const wrap = document.getElementById('tab-indicator');
    if(!el||!bar||!wrap) return;
    const scrollW = el.scrollWidth - el.clientWidth;
    if(scrollW<=0){ wrap.style.opacity='0'; return; }
    wrap.style.opacity='1';
    const pct = el.scrollLeft / scrollW;
    const barW = Math.max(20, el.clientWidth/el.scrollWidth*100);
    const barL = pct * (100-barW);
    bar.style.width = barW+'%';
    bar.style.left = barL+'%';
  };
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(initTabsDrag,300));
  window._initTabsDrag = initTabsDrag;
})();

// ════ 主题切换 ════
(function(){
  const saved = localStorage.getItem('hlzc_theme');
  if(saved) document.documentElement.className = saved;
  function updateThemeBtn(){
    const btn = document.getElementById('theme-btn');
    if(!btn) return;
    const isDark = document.documentElement.classList.contains('dark') ||
      (!document.documentElement.classList.contains('light') &&
       window.matchMedia('(prefers-color-scheme:dark)').matches);
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? '切换到白天模式' : '切换到夜间模式';
  }
  window.toggleTheme = function(){
    const root = document.documentElement;
    const isDark = root.classList.contains('dark') ||
      (!root.classList.contains('light') && window.matchMedia('(prefers-color-scheme:dark)').matches);
    if(isDark){ root.classList.remove('dark'); root.classList.add('light'); localStorage.setItem('hlzc_theme','light'); }
    else { root.classList.remove('light'); root.classList.add('dark'); localStorage.setItem('hlzc_theme','dark'); }
    updateThemeBtn();
  };
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(updateThemeBtn,100));
  window._updateThemeBtn = updateThemeBtn;
})();

// ════ 活动流渲染 ════
// 注：_ACT_KEY、_getActivity、_addActivityLog、_relativeTime 已在 storage.js/utils.js 中定义
function renderActivityBar(){
  const logs = _getActivity(); const el = document.getElementById('act-scroll'); if(!el) return;
  if(!logs.length){ el.innerHTML = '<span class="act-item" style="color:var(--t3)">暂无记录</span>'; return; }
  const items = logs.map(l=>`<span class="act-item"><span class="act-user">${esc(l.user)}</span><span style="color:var(--t3);margin:0 3px">提交了</span><span class="act-proj">「${esc(l.proj)}」</span><span class="act-time" style="margin-left:4px">${_relativeTime(l.ts)}</span></span>`).join('');
  el.innerHTML = items + items;
}

// ════ 导出备份 / 导入数据 ════
window.openExport = function(){
  const data = {
    projects: LP(),
    weeks: LW(),
    users: JSON.parse(localStorage.getItem('hlzc_users')||'{}'),
    activity: JSON.parse(localStorage.getItem(_ACT_KEY)||'[]'),
    exportedAt: new Date().toISOString(),
    exportedBy: _currentUser,
    version: 2
  };
  const json = JSON.stringify(data, null, 2);
  const m = document.getElementById('io-modal');
  document.getElementById('io-title').textContent = '📤 导出备份数据';
  document.getElementById('io-desc').textContent = '复制下方全部内容保存，或点击按钮直接下载文件。此备份包含所有项目、历史周报及会议数据。';
  document.getElementById('io-text').value = json;
  document.getElementById('io-text').readOnly = true;
  document.getElementById('io-err').style.display = 'none';
  const btn = document.getElementById('io-action-btn');
  btn.textContent = '⬇ 下载备份文件';
  btn.onclick = ()=>{
    const blob = new Blob([json], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '华力研策周报备份_' + new Date().toLocaleDateString('zh-CN').replace(/\//g,'-') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    btn.textContent = '✅ 已下载';
    setTimeout(()=>btn.textContent='⬇ 下载备份文件', 2000);
  };
  const copyBtn = document.getElementById('io-copy-btn');
  if(copyBtn){
    copyBtn.style.display='inline-block';
    copyBtn.onclick=()=>{ navigator.clipboard.writeText(json).then(()=>{copyBtn.textContent='✅ 已复制';setTimeout(()=>copyBtn.textContent='复制JSON',1500);}); };
  }
  m.style.display = 'flex';
};

window.openImport = function(){
  const m = document.getElementById('io-modal');
  document.getElementById('io-title').textContent = '📥 导入备份数据';
  document.getElementById('io-desc').textContent = '粘贴备份的JSON内容，或选择备份文件导入。⚠ 导入将合并数据（不会删除现有项目，只会添加/更新）。';
  document.getElementById('io-text').value = '';
  document.getElementById('io-text').readOnly = false;
  document.getElementById('io-err').style.display = 'none';
  const btn = document.getElementById('io-action-btn');
  btn.textContent = '确认导入';
  btn.onclick = ()=>{
    try{
      const raw = document.getElementById('io-text').value.trim();
      if(!raw) throw new Error('请粘贴备份数据');
      const d = JSON.parse(raw);
      if(!d.projects || !d.weeks) throw new Error('数据格式不正确，缺少 projects 或 weeks 字段');
      if(!confirm('确认导入？将与现有数据合并（不删除现有项目）。')) return;
      const existPs = LP();
      const newPs = d.projects || [];
      const merged = [...existPs];
      newPs.forEach(np=>{
        const idx = merged.findIndex(p=>p.id===np.id);
        if(idx>=0) merged[idx]={...merged[idx],...np}; else merged.push(np);
      });
      localStorage.setItem('hlzc_p', JSON.stringify(merged));
      const existW = LW();
      const newW = d.weeks || {};
      Object.keys(newW).forEach(wk=>{
        if(!existW[wk]) existW[wk]=newW[wk];
        else Object.assign(existW[wk], newW[wk]);
      });
      localStorage.setItem('hlzc_w', JSON.stringify(existW));
      m.style.display='none';
      alert('✅ 导入成功！共导入 '+ newPs.length +' 个项目，'+ Object.keys(newW).length +' 周数据。');
      render();
    }catch(e){
      const err = document.getElementById('io-err');
      err.textContent = '❌ 解析失败：' + e.message;
      err.style.display = 'block';
    }
  };
  const fileBtn = document.getElementById('io-file-btn');
  if(fileBtn){
    fileBtn.style.display = 'inline-block';
    fileBtn.onclick = ()=>{
      const input = document.createElement('input');
      input.type='file'; input.accept='.json,application/json';
      input.onchange = e=>{
        const file = e.target.files[0]; if(!file) return;
        const reader = new FileReader();
        reader.onload = ev=>{ document.getElementById('io-text').value = ev.target.result; };
        reader.readAsText(file);
      };
      input.click();
    };
  }
  m.style.display = 'flex';
};

// ════ 离开页面提示 ════
window.addEventListener('beforeunload', function(e){ if(_pendingSync){ e.preventDefault(); e.returnValue = '有未提交的项目数据。'; } });

// ════ 应用初始化入口 ════
initStorage(async ()=>{
  try {
    console.log('[Init] 开始初始化...');
    seed(); updL(); _appReady=true;
    console.log('[Init] seed 和 updL 完成');
    const ov=document.getElementById('loading-overlay');
    if(ov){
      ov.style.opacity='0'; ov.style.transition='opacity .25s';
      console.log('[Init] loading-overlay 淡出中...');
      setTimeout(()=>{
        ov.remove();
        console.log('[Init] loading-overlay 已移除, 调用 ensureUser...');
        ensureUser(()=>{ updateUserBadge(); renderActivityBar(); render(); });
      },280);
    } else {
      console.log('[Init] loading-overlay 不存在, 直接调用 ensureUser...');
      ensureUser(()=>{ updateUserBadge(); renderActivityBar(); render(); });
    }
  } catch(e) {
    console.error('[Init] 初始化失败:', e);
    const ov = document.getElementById('loading-overlay');
    if(ov) {
      ov.innerHTML = '<div style="color:#b00020">初始化失败，请刷新页面</div>';
    }
  }
});
