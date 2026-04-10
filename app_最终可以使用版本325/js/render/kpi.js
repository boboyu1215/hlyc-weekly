// ════════════════════════════════════════════════════
// render/kpi.js — KPI 未完成事项管理
// ════════════════════════════════════════════════════

const _KPI_KEY = 'hlzc_kpi';

// ── KPI 数据读写（本地 + 云端同步）
async function _getKpiDataCloud(){
  if(_syncOk){
    try{
      const rec = await _dbGet('kpi_data');
      if(rec && rec.data) return rec.data;
    }catch(e){}
  }
  return _getKpiDataLocal();
}
function _getKpiDataLocal(){
  try{ return JSON.parse(localStorage.getItem(_KPI_KEY)||'{}'); }catch{ return {}; }
}
async function _saveKpiData(data){
  localStorage.setItem(_KPI_KEY, JSON.stringify(data));
  if(_syncOk){
    try{ await _dbSet('kpi_data', {data, _updatedAt:Date.now(), _updatedBy:_currentUser}); }
    catch(e){ console.warn('[KPI] 云端同步失败:', e.message); }
  }
}

function _kpiItemKey(projId, text){
  return String(projId) + '__' + text.trim();
}

// ── KPI 页面渲染
function renderKpiPage(){
  if(!isDirector()) return '<div class="empty">无权限查看此页面</div>';
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
    <div>
      <div style="font-size:14px;font-weight:700">📊 KPI 未完成事项跟踪</div>
      <div style="font-size:11px;color:var(--t3);margin-top:2px">汇总所有项目已过截止日的本周计划，可登记新完成时间并标记延误</div>
    </div>
    <button class="bs" style="font-size:11px;padding:5px 12px" onclick="ST('kpi')">🔄 刷新</button>
  </div>
  <div id="kpi-panel-content"><div style="text-align:center;padding:32px;color:var(--t3)">加载中…</div></div>`;
}

// 异步加载KPI内容（解决云端数据加载问题）
async function _loadKpiPanel(){
  const el = document.getElementById('kpi-panel-content');
  if(!el) return;

  const projects = LP().filter(p=>!p.archived);
  const kpiData  = await _getKpiDataCloud();
  const today    = new Date(); today.setHours(0,0,0,0);
  const allWeeks = LW();
  const wkKeys   = Object.keys(allWeeks).sort();

  // 收集所有已过截止日的条目（去重：同项目同文本只保留最新一周的）
  // 排除：已是 _fromKPI 注入的条目（避免循环）
  const overdueMap = {};
  for(const wk of wkKeys){
    const wkData = allWeeks[wk];
    for(const proj of projects){
      const snap = wkData && wkData[proj.id];
      if(!snap || !Array.isArray(snap.coreAction)) continue;
      for(const item of snap.coreAction){
        if(!item || !item.text || !item.text.trim()) continue;
        if(!item.dueDate) continue;
        if(item._fromKPI) continue; // 排除KPI注入的，避免循环
        const d = new Date(item.dueDate); d.setHours(0,0,0,0);
        if(d < today){
          const k = _kpiItemKey(proj.id, item.text);
          // 保留最新周的记录
          if(!overdueMap[k] || wk > overdueMap[k].origWk){
            overdueMap[k] = {
              projId:    proj.id,
              projName:  proj.name,
              designOwner: proj.designOwner||'—',
              text:      item.text,
              dueDate:   item.dueDate,
              origWk:    wk,
            };
          }
        }
      }
    }
  }

  const overdueList = Object.values(overdueMap);
  // 已在KPI中确认延误且done=false的也显示
  const confirmedPending = Object.entries(kpiData).filter(([,v])=>v.confirmed&&!v.done);

  let html = '';

  // ── 待处理的过期事项
  const unhandled = overdueList.filter(item => {
    const k = _kpiItemKey(item.projId, item.text);
    return !kpiData[k]; // 还没被登记过的
  });
  const handled = overdueList.filter(item => {
    const k = _kpiItemKey(item.projId, item.text);
    return kpiData[k] && !kpiData[k].done;
  });

  if(!overdueList.length && !confirmedPending.length){
    html = '<div class="empty" style="padding:32px">🎉 当前没有已过截止日的未完成事项</div>';
  } else {
    if(unhandled.length){
      html += `<div style="font-size:12px;font-weight:700;color:var(--rt);margin-bottom:8px">⚠ 待处理（${unhandled.length}项未登记）</div>`;
      // 按项目分组
      const byProj = {};
      for(const item of unhandled){
        if(!byProj[item.projId]) byProj[item.projId]={name:item.projName,owner:item.designOwner,items:[]};
        byProj[item.projId].items.push(item);
      }
      for(const [pid, group] of Object.entries(byProj)){
        html += _renderKpiGroup(pid, group, kpiData, false);
      }
    }

    if(handled.length){
      html += `<div style="font-size:12px;font-weight:700;color:var(--yt);margin:14px 0 8px">📝 已勾选待确认（${handled.length}项）</div>`;
      const byProj2 = {};
      for(const item of handled){
        if(!byProj2[item.projId]) byProj2[item.projId]={name:item.projName,owner:item.designOwner,items:[]};
        byProj2[item.projId].items.push(item);
      }
      for(const [pid, group] of Object.entries(byProj2)){
        html += _renderKpiGroup(pid, group, kpiData, true);
      }
    }
  }

  // ── 已确认延误清单
  if(confirmedPending.length){
    html += `
    <div style="margin-top:16px;background:var(--rb);border:0.5px solid var(--rbd);border-radius:var(--r);padding:12px 14px">
      <div style="font-size:12px;font-weight:700;color:var(--rt);margin-bottom:8px">📌 已确认延误，将在对应周显示（${confirmedPending.length}项）</div>
      ${confirmedPending.map(([k,v])=>`
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--rbd);font-size:11px">
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${esc(v.text||'')}</div>
            <div style="color:var(--t3);font-size:10px;margin-top:1px">
              新截止：<strong style="color:var(--rt)">${(v.newDueDate||'').replace(/-/g,'/')}</strong>
              ${v.projName?'· '+esc(v.projName):''}
            </div>
          </div>
          <button style="font-size:10px;padding:3px 10px;background:none;border:0.5px solid var(--gt);color:var(--gt);border-radius:4px;cursor:pointer;font-family:var(--fn);white-space:nowrap"
            onclick="_kpiMarkDoneAsync('${esc(k)}')">✓ 已完成</button>
          <button style="font-size:10px;padding:3px 8px;background:none;border:0.5px solid var(--bdr);color:var(--t3);border-radius:4px;cursor:pointer;font-family:var(--fn)"
            onclick="_kpiRemoveAsync('${esc(k)}')">移除</button>
        </div>`).join('')}
    </div>`;
  }

  el.innerHTML = html || '<div class="empty" style="padding:32px">🎉 暂无待处理事项</div>';
}

function _renderKpiGroup(pid, group, kpiData, showConfirmBtn){
  let html = `
  <div style="background:var(--card);border:0.5px solid var(--bdr);border-radius:var(--r);margin-bottom:8px;overflow:hidden">
    <div style="padding:8px 14px;background:var(--gl);border-bottom:0.5px solid var(--bdr);display:flex;align-items:center;gap:8px">
      <div style="font-size:12px;font-weight:700;flex:1">${esc(group.name)}</div>
      <div style="font-size:10px;color:var(--t3)">研策：${esc(group.owner)}</div>
    </div>
    <div>`;

  for(const item of group.items){
    const k   = _kpiItemKey(item.projId, item.text);
    const reg = kpiData[k];
    const newDue = reg ? reg.newDueDate : '';
    html += `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:9px 14px;border-bottom:0.5px solid var(--bdr)">
        <input type="checkbox" ${reg?'checked':''} style="width:15px;height:15px;flex-shrink:0;margin-top:1px;accent-color:var(--gold);cursor:pointer"
          onchange="_kpiToggleAsync('${esc(k)}',this.checked,'${pid}','${esc(item.text)}')">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;line-height:1.5">${esc(item.text)}</div>
          <div style="font-size:10px;color:var(--t3);margin-top:2px">
            原截止：<span style="color:var(--rt)">${item.dueDate.replace(/-/g,'/')}</span> · ${item.origWk}
          </div>
        </div>
        ${reg?`
        <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <input type="date" value="${newDue}" min="${new Date().toISOString().slice(0,10)}"
            style="font-size:11px;padding:3px 6px;border:0.5px solid var(--bdr);border-radius:4px;background:var(--bg);color:var(--tx);font-family:var(--fn);width:130px"
            onchange="_kpiSetDateAsync('${esc(k)}',this.value,'${pid}','${esc(item.text)}')">
          <button class="bp" style="font-size:10px;padding:3px 10px;white-space:nowrap"
            onclick="_kpiConfirmAsync('${esc(k)}','${pid}','${esc(item.text)}')">确认延误</button>
        </div>`:''}
      </div>`;
  }
  html += '</div></div>';
  return html;
}

// ── 异步操作函数（带云端同步）

window._kpiToggleAsync = async function(key, checked, projId, text){
  const data = _getKpiDataLocal();
  if(checked){
    if(!data[key]) data[key] = {projId:String(projId), text, newDueDate:'', confirmed:false, done:false};
  } else {
    delete data[key];
    await _applyKpiToSnaps(data);
  }
  await _saveKpiData(data);
  await _loadKpiPanel();
};

window._kpiSetDateAsync = async function(key, date, projId, text){
  const data = _getKpiDataLocal();
  if(!data[key]) data[key] = {projId:String(projId), text, newDueDate:'', confirmed:false, done:false};
  data[key].newDueDate = date;
  await _saveKpiData(data);
  // 不刷新页面，直接更新本地
};

window._kpiConfirmAsync = async function(key, projId, text){
  const data = _getKpiDataLocal();
  const entry = data[key];
  if(!entry){ _showOfflineToast('请先勾选条目'); return; }
  if(!entry.newDueDate){ _showOfflineToast('请先设定新的完成时间'); return; }
  data[key].confirmed = true;
  data[key].projId    = String(projId);
  data[key].text      = text;
  // 补充项目名（用于显示）
  const proj = LP().find(p=>String(p.id)===String(projId));
  if(proj) data[key].projName = proj.name;
  await _saveKpiData(data);
  await _applyKpiToSnaps(data);
  _showOfflineToast('已确认延误，将在对应周显示', 'online');
  await _loadKpiPanel();
};

window._kpiMarkDoneAsync = async function(key){
  const data = _getKpiDataLocal();
  if(data[key]){ data[key].done = true; data[key].confirmed = false; }
  await _saveKpiData(data);
  await _applyKpiToSnaps(data);
  await _loadKpiPanel();
};

window._kpiRemoveAsync = async function(key){
  const data = _getKpiDataLocal();
  delete data[key];
  await _saveKpiData(data);
  await _applyKpiToSnaps(data);
  await _loadKpiPanel();
};

// ── 将KPI确认的延误项注入对应项目的当前周快照
async function _applyKpiToSnaps(kpiData){
  const projects = LP();
  const weeks    = LW();
  const {yr:cy, wk:cw} = isoWk(new Date());
  const curKey   = wkKey(cy, cw);

  for(const proj of projects){
    const confirmedForProj = Object.values(kpiData).filter(
      v => String(v.projId) === String(proj.id) && v.confirmed && !v.done
    );

    if(!weeks[curKey]) weeks[curKey] = {};
    if(!weeks[curKey][proj.id]){
      // 没有当前周快照，创建继承视图
      const base = getSnap(cy, cw, proj.id, projects);
      weeks[curKey][proj.id] = {...base, _savedWk: curKey};
    }

    const snap = weeks[curKey][proj.id];
    const existingActions = Array.isArray(snap.coreAction) ? [...snap.coreAction] : [];

    // 清除旧的KPI注入条目，重新注入
    const cleaned = existingActions.filter(i => !i._fromKPI);
    for(const v of confirmedForProj){
      cleaned.push({text: v.text, dueDate: v.newDueDate, _fromKPI: true});
    }
    weeks[curKey][proj.id] = {...snap, coreAction: cleaned};
  }

  localStorage.setItem('hlzc_w', JSON.stringify(weeks));
  // 如果云端连通，同步
  if(_syncOk){
    try{
      for(const proj of projects){
        const localSnap = {};
        Object.keys(weeks).forEach(wk=>{
          if(weeks[wk][proj.id]) localSnap[wk] = weeks[wk][proj.id];
        });
        await _dbSet('snap_'+proj.id, {data:localSnap, _v:Date.now(), _updatedBy:_currentUser||'system', _updatedAt:new Date().toLocaleString('zh-CN')});
      }
    }catch(e){ console.warn('[KPI] 快照云端同步失败:', e.message); }
  }
}

// app.js 中 render() 后调用此函数初始化KPI面板
window._initKpiPageAfterRender = function(){
  if(S.tab === 'kpi'){
    setTimeout(_loadKpiPanel, 50);
  }
};
