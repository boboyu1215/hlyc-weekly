// ════════════════════════════════════════════════════
// render/archive.js — 归档项目渲染
// ════════════════════════════════════════════════════

function renderArchive(){
  const projects=LP().filter(p=>p.archived);
  if(!projects.length) return `<div style="font-size:14px;font-weight:700;margin-bottom:14px">归档项目</div><div class="empty">暂无归档项目</div>`;
  return`
  <div class="io-bar no-print">
    <span id="_sync_label_archive" class="io-btn" style="cursor:default">☁ 已同步</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:14px;font-weight:700">归档项目（${projects.length}）</div>
    <div style="font-size:11px;color:var(--t3)">归档项目可随时释放恢复</div>
  </div>
  ${projects.map(p=>{
    const snap=getSnap(S.yr,S.wk,p.id,LP());
    const segs=STAGES.map((_,i)=>`<div class="ss ${i<snap.stage?'dn':i===snap.stage?'ac':''}"></div>`).join('');
    return`<div class="arch-card">
      <div class="arch-card-top"><div class="arch-card-nm">${esc(p.name)}</div><div class="badge arch">已归档</div></div>
      <div class="arch-card-meta"><span>开业：${esc(p.openDate||'无')}</span><span>筹备：${esc(p.prepOwner||'无')}</span><span>研策：${esc(p.designOwner||'无')}</span></div>
      <div class="stages" style="margin:8px 0 4px">${segs}</div>
      <div style="font-size:10px;color:var(--t3);margin-bottom:10px">阶段：${STAGES[snap.stage]||'无'}</div>
      <div class="ca" style="padding-top:8px;border-top:0.5px solid var(--bdr)">
        ${isDirector()?`<button class="bp" style="font-size:11px;padding:5px 14px" onclick="askUnarch(${p.id})">释放回在建</button>`:''}
        ${isDirector()?`<button class="bd" onclick="askDel(${p.id})">删除</button>`:''}
      </div>
    </div>`;
  }).join('')}`;
}
