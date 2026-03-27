// ════════════════════════════════════════════════════
// render/weekly.js — 项目周报 & 周报卡片渲染
// ════════════════════════════════════════════════════

// 将列表字段渲染为可读 HTML（支持数组和旧字符串格式）
function _renderItemListDisplay(v, emptyText){
  if(!v||(typeof v==='string'&&!v.trim())||(Array.isArray(v)&&!v.length)){
    return `<span style="color:var(--t3)">${emptyText||'—'}</span>`;
  }
  if(typeof v==='string'){
    // 旧格式：按换行分割，去除开头的序号后渲染为列表
    const lines = v.split(/\n/).map(l=>l.replace(/^[\d１２３４５６７８９０]+[、.．。]\s*/,'').trim()).filter(Boolean);
    if(lines.length<=1) return `<span style="white-space:pre-wrap">${esc(v)}</span>`;
    return `<ol class="dim-item-list">${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ol>`;
  }
  if(Array.isArray(v)){
    const items = v.filter(item=>item.text&&item.text.trim());
    if(!items.length) return `<span style="color:var(--t3)">${emptyText||'—'}</span>`;
    return `<ol class="dim-item-list">${items.map(item=>{
      const dateStr = item.dueDate
        ? `<span class="dim-item-date">${item.dueDate.replace(/-/g,'/')}</span>`
        : '';
      return `<li>${esc(item.text)}${dateStr}</li>`;
    }).join('')}</ol>`;
  }
  return `<span style="color:var(--t3)">—</span>`;
}

// 判断列表字段是否有内容（用于风险/决策汇总判断）
function _itemListText(v){
  if(!v) return '';
  if(typeof v==='string') return v;
  if(Array.isArray(v)) return v.filter(i=>i.text&&i.text.trim()&&i.text.trim()!=='无').map(i=>i.text).join('；');
  return '';
}

function renderWeekly(){
  const projects=LP();
  // 当前登录用户负责的项目（designOwner匹配）置顶，其余按原有sortOrder排序
  const active=projects.filter(p=>!p.archived).sort((a,b)=>{
    const aIsMe = a.designOwner===_currentUser ? 0 : 1;
    const bIsMe = b.designOwner===_currentUser ? 0 : 1;
    if(aIsMe!==bIsMe) return aIsMe-bIsMe;
    return (a.sortOrder||0)-(b.sortOrder||0);
  });
  const snaps=active.map(p=>({...p,...getSnap(S.yr,S.wk,p.id,projects)}));
  const r=snaps.filter(p=>p.status==='r').length, y=snaps.filter(p=>p.status==='y').length, g=snaps.filter(p=>p.status==='g').length;
  const blk=snaps.filter(p=>{
    const dec = _itemListText(p.decision);
    return dec && dec!=='无' && p.status==='r';
  });
  // 风险卡点：只有 status='r' 且 risk 字段有实际内容（非空且不是"无"）才计入
  const redProjects=snaps.filter(p=>{
    if(p.status!=='r') return false;
    const riskText = _itemListText(p.risk);
    return riskText && riskText.trim() && riskText.trim()!=='无';
  });
  const now=isNow();

  return`
  <div class="print-hd"><h1>华力集团｜研策部周报</h1><p>${wkLabel(S.yr,S.wk)}（${wkRange(S.yr,S.wk)}）</p></div>
  <div class="io-bar no-print">
    <button class="io-btn" onclick="window.print()">📄 导出 PDF</button>
    <button class="io-btn" onclick="openExport()">📤 导出备份</button>
    <button class="io-btn imp" onclick="openImport()">📥 导入数据</button>
  </div>
  ${!syncConfigured()?`
  <div style="background:#fffbe6;border:1.5px solid #e8c840;border-radius:var(--r);padding:14px 18px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:700;color:#7a5800;margin-bottom:8px">💡 当前未配置云端同步，数据仅保存在本地</div>
    <div style="font-size:12px;color:#7a5800;line-height:1.9">
      请参考代码要求替换 <code style="background:#f0d878;padding:2px 6px;border-radius:3px">PROXY_URL</code> 以开启多人协作。
    </div>
  </div>`:''}
  <div class="wkbar">
    <div><div class="wkbar-l">${wkLabel(S.yr,S.wk)}</div>
    <div class="wkbar-sub">${wkRange(S.yr,S.wk)}${now?' · <span style="color:var(--gt);font-weight:700">本周</span>':' · <span style="color:var(--t3)">历史查阅</span>'}</div></div>
    ${now?`<button class="add-btn" onclick="ST('input')">＋ 新增项目</button>`:''}
  </div>
  <div class="metrics" style="grid-template-columns:repeat(5,1fr)">
    <div class="mc"><div class="lb">重点事项</div><div class="vl">${active.length}</div></div>
    <div class="mc"><div class="lb">需决策/卡住</div><div class="vl r">${r}</div></div>
    <div class="mc"><div class="lb">需关注</div><div class="vl y">${y}</div></div>
    <div class="mc"><div class="lb">正常推进</div><div class="vl g">${g}</div></div>
    <div class="mc" style="cursor:pointer" onclick="ST('meeting')"><div class="lb">本周会议</div><div class="vl" style="color:var(--gold)">${(()=>{const wk=LW()[wkKey(S.yr,S.wk)];return wk&&wk.__meetings?wk.__meetings.length:0})()}</div></div>
  </div>
  ${blk.length?`<div class="notice"><strong>本周有 ${blk.length} 个项目需要管理层决策</strong>
    <div class="blk-list">${blk.map(p=>`<div class="blk-item"><div class="blk-nm" style="flex:0 0 120px">${esc(p.name)}</div><div class="blk-dc">${esc(_itemListText(p.decision))}</div></div>`).join('')}</div>
  </div>`:''}
  ${redProjects.length?`<div class="notice" style="background:var(--rb);border-color:var(--rbd)"><strong style="color:var(--rt)">本周有 ${redProjects.length} 个项目存在风险卡点</strong>
    <div class="blk-list">${redProjects.map(p=>`<div class="blk-item" style="background:rgba(176,0,32,.12)"><div class="blk-nm" style="flex:0 0 120px">${esc(p.name)}</div><div class="blk-dc">${esc(_itemListText(p.risk)||'未填写具体风险')}</div></div>`).join('')}</div>
  </div>`:''}
  <div class="sh"><div class="sh-t">重点事项（${active.length}）${now?'<span style="font-size:10px;color:var(--t3);font-weight:400;margin-left:8px">长按卡片可拖动排序</span>':''}</div>
    <div class="leg">
      <div class="li"><div class="ls" style="background:var(--rt)"></div>需决策</div>
      <div class="li"><div class="ls" style="background:var(--yt)"></div>需关注</div>
      <div class="li"><div class="ls" style="background:#1a6830"></div>正常</div>
    </div>
  </div>
  <div class="pgrid" id="sortable-grid">
    ${snaps.map(p=>renderWeekCard(p,now,false)).join('')}
    ${!snaps.length?`<div class="empty">本周暂无重点事项</div>`:''}
  </div>`;
}

function renderWeekCard(p,now,isArch){
  const segs=STAGES.map((_,i)=>`<div class="ss ${i<p.stage?'dn':i===p.stage?'ac':''}"></div>`).join('');
  const canEdit = canEditProject(p);
  const drag=now&&!isArch&&canEdit?'draggable="true" data-id="'+p.id+'" onmousedown="startLongPress(event,'+p.id+')" onmouseup="cancelLongPress()" ontouchstart="startLongPress(event,'+p.id+')" ontouchend="cancelLongPress()" ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragend="onDragEnd(event)"':'';
  const lastEditor = p._updatedBy ? `${esc(p._updatedBy)} · ${esc(p._updatedAt||'')}` : '';
  // 检查是否有本地已改未提交的数据
  const hasPending = now && getPendingSubmit().has(p.id);
  const isMyProj = _currentUser && p.designOwner === _currentUser;
  return`<div class="pc ${sc(p.status)}${isMyProj?' my-proj':''}" ${drag} id="pc-${p.id}">
    <div class="pc-top">
      <div class="pc-nm">${now&&!isArch&&canEdit?'<span style="color:var(--t3);font-size:12px;margin-right:4px;cursor:grab">⠿</span>':''} ${esc(p.name)}
        ${isMyProj?`<span style="font-size:10px;background:var(--gold);color:#fff;padding:1px 6px;border-radius:6px;font-weight:600;margin-left:6px;vertical-align:middle">我的</span>`:''}
        ${!canEdit&&now?`<span style="font-size:10px;color:var(--t3);margin-left:6px;font-weight:400">🔒 只读</span>`:''}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${lastEditor?`<span style="font-size:10px;color:var(--t3)">✏ ${lastEditor}</span>`:''}
        <div class="badge ${sc(p.status)}"><div class="dot ${sc(p.status)}"></div>${SL[p.status]||''}</div>
      </div>
    </div>
    <div class="pc-keys">
      <div class="pk"><div class="pk-lb">开业时间</div><div class="pk-vl">${esc(p.openDate||'待定')}</div></div>
      <div class="pk"><div class="pk-lb">筹备负责人</div><div class="pk-vl">${esc(p.prepOwner||'—')}</div></div>
      <div class="pk"><div class="pk-lb">研策负责人</div><div class="pk-vl">${esc(p.designOwner||'—')}</div></div>
    </div>
    <div class="stages" style="margin-bottom:9px">${segs}</div>
    <div class="dims">
      <div class="dim d1"><div class="dim-hd" style="color:#2563a8">上周工作完成情况</div><div class="dim-body" style="color:var(--t2);white-space:pre-wrap">${esc(p.coreOutput)||'—'}</div></div>
      <div class="dim d2"><div class="dim-hd">本周计划</div><div class="dim-body">${_renderItemListDisplay(p.coreAction,'—')}</div></div>
      <div class="dim d3"><div class="dim-hd" style="color:#b00020">风险 / 卡点</div><div class="dim-body" style="color:#b00020">${_renderItemListDisplay(p.risk,'无')}</div></div>
      <div class="dim d4"><div class="dim-hd" style="color:#2563a8">跨部门支援</div><div class="dim-body">${_renderItemListDisplay(p.crossDept,'本周无需跨部门支援')}</div></div>
    </div>
    ${canEdit?`<div class="ca">
      ${hasPending?`<div class="pending-badge"><span class="pending-icon">●</span>数据未提交</div>`:'<div></div>'}
      <div style="display:flex;gap:5px;align-items:center">
        <button class="bs" style="font-size:11px;padding:4px 9px" onclick="openWkEdit(${p.id})">✏ ${S.yr>CYR||(S.yr===CYR&&S.wk>=CWK)?'更新本周状态':'补录历史数据'}</button>
        ${isDirector()?`<button class="bs" style="font-size:11px;padding:4px 9px" onclick="editProj(${p.id})">编辑项目</button>`:''}
        <button class="bp" style="font-size:11px;padding:4px 12px;background:var(--gold)" onclick="askSubmitProject(${p.id})">📤 提交</button>
        ${isDirector()&&isNow()?`<button class="ba" onclick="askArch(${p.id})">归档</button>`:''}
        ${isDirector()&&isNow()?`<button class="bd" onclick="askDel(${p.id})">删除</button>`:''}
      </div>
    </div>`:!canEdit?`<div class="ca" style="justify-content:flex-end">
      <span style="font-size:11px;color:var(--t3)">此项目由 ${esc(p.prepOwner||p.designOwner||'其他人')} 负责</span>
    </div>`:''}
  </div>`;
}

function renderOverview(){
  const projects=LP(); const active=projects.filter(p=>!p.archived); const arch=projects.filter(p=>p.archived);
  const renderOvCard=(p)=>{
    const snap=getSnap(S.yr,S.wk,p.id,projects);
    const segs=STAGES.map((_,i)=>`<div class="ss ${i<snap.stage?'dn':i===snap.stage?'ac':''}"></div>`).join('');
    const fields=[
      ['面积',p.area],['筹备负责人',p.prepOwner],['研策负责人',p.designOwner],
      ['设计启动',p.startDate],['方案完成',p.schemeDate],['设计完成',p.designDate],
      ['进场时间',p.siteDate],['竣工时间',p.completionDate],['开业时间',p.openDate],
    ];
    return`<div class="ov-card">
      <div class="ov-top"><div class="ov-nm">${esc(p.name)}</div>${p.archived?`<div class="badge arch">已归档</div>`:`<div class="badge ${sc(snap.status)}"><div class="dot ${sc(snap.status)}"></div>${SL[snap.status]||''}</div>`}</div>
      <div class="ov-grid">${fields.map(([lb,vl])=>`<div class="og"><div class="og-lb">${lb}</div><div class="og-vl">${esc(vl||'—')}</div></div>`).join('')}</div>
      <div class="ov-stages">${segs}</div>
      <div class="ov-stage-lbl">当前阶段：<span>${STAGES[snap.stage]||'—'}</span></div>
      ${isNow()?`<div class="io-bar no-print" style="justify-content:flex-end;margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr)">
        <button class="io-btn" onclick="submitProjectInfo(${p.id})">☁ 项目提交</button>
        <button class="bs" style="font-size:11px;padding:4px 9px" onclick="editProj(${p.id})">编辑项目信息</button>
        ${isDirector()?`<button class="bd" style="font-size:11px;padding:4px 9px" onclick="askDel(${p.id})">删除</button>`:''}
      </div>`:''}
    </div>`;
  };
  return`
  <div class="print-hd"><h1>华力集团 · 研策部项目总览</h1><p>${wkLabel(S.yr,S.wk)}（${wkRange(S.yr,S.wk)}）</p></div>
  <div class="io-bar no-print">
    ${isNow()?`<button class="io-btn" onclick="ST('input')">＋ 新增项目</button>`:''}
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">项目总览</div>
  </div>
  <div class="sh"><div class="sh-t">在建项目（${active.length}）</div></div>
  ${active.map(renderOvCard).join('')}
  ${!active.length?`<div class="empty">暂无在建项目</div>`:''}
  ${arch.length?`<div class="arch-toggle" onclick="toggleArch()"><span>${S.showArch?'▾':'▸'}</span>已归档项目（${arch.length}）</div>
  ${S.showArch?arch.map(renderOvCard).join(''):''}`:''}`; 
}

function renderHistory(){
  const weeks=LW();
  const keys=Object.keys(weeks).sort().reverse();
  if(!keys.length) return`<div style="font-size:14px;font-weight:700;margin-bottom:14px">历史记录</div><div class="empty">暂无历史数据<br><span style="font-size:11px">提交项目后将在此显示历史记录</span></div>`;
  return`
  <div class="io-bar no-print">
    <span id="_sync_label_history" class="io-btn" style="cursor:default">☁ 已同步</span>
    <button class="io-btn" onclick="openExport()">📤 导出备份</button>
    <button class="io-btn imp" onclick="openImport()">📥 导入</button>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="font-size:14px;font-weight:700">历史周报记录</div>
  </div>
  <div class="hw"><div class="hw-hd">所有周次（点击跳转查阅）</div>
    ${keys.map(k=>{
      const info=parseWkKey(k); if(!info)return'';
      const snaps=Object.values(weeks[k]||{}).filter(s=>s&&typeof s==='object'&&s.status);
      const r=snaps.filter(s=>s.status==='r').length;
      const y=snaps.filter(s=>s.status==='y').length;
      const g=snaps.filter(s=>s.status==='g').length;
      const isCur=info.yr===CYR&&info.wk===CWK;
      return`<div class="wki" onclick="jumpWk(${info.yr},${info.wk})">
        <div style="flex:1">
          <div class="wki-l">${wkLabel(info.yr,info.wk)}${isCur?' <span style="font-size:10px;background:var(--gb);color:var(--gt);padding:1px 5px;border-radius:6px;font-weight:400">当前</span>':''}</div>
          <div class="wki-s">${wkRange(info.yr,info.wk)}</div>
        </div>
        <div class="wk-cnt">
          ${r?`<div class="wk-dot r">🔴 ${r}</div>`:''}
          ${y?`<div class="wk-dot y">🟡 ${y}</div>`:''}
          ${g?`<div class="wk-dot g">🟢 ${g}</div>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

window.jumpWk=function(yr,wk){ S.yr=yr; S.wk=wk; S.tab='weekly'; updL(); render(); };
window.toggleArch=function(){ S.showArch=!S.showArch; render(); };
window.askUnarch=function(id){
  if(!confirm('将该项目从归档中释放，恢复到在建项目？'))return;
  SP(LP().map(p=>p.id===id?{...p,archived:false}:p)); render();
};
