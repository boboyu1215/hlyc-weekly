// ════════════════════════════════════════════════════
// sync.js — 云同步、轮询、离线队列
// 已完全脱离 CloudBase，使用自建 API + 轮询模式
// ════════════════════════════════════════════════════

let _syncOk = false;
let _pendingSync = false;
let _pollTimer = null;
let _appReady = false;
let _wasOffline = false;
const _QUEUE_KEY = 'hlzc_offline_queue';

// ── 离线队列 ──
function _queueGet(){ try{ return JSON.parse(localStorage.getItem(_QUEUE_KEY)||'[]'); }catch{ return []; } }
function _queueSave(q){ localStorage.setItem(_QUEUE_KEY, JSON.stringify(q)); }
function _queueAdd(item){
  const q = _queueGet();
  const idx = q.findIndex(x=>x.id===item.id);
  if(idx>=0) q[idx]=item; else q.push(item);
  _queueSave(q);
  _showOfflineToast('已保存到本地，网络恢复后自动同步');
}

// ── Toast 提示 ──
let _offlineToastTimer = null;
function _showOfflineToast(msg, type){
  let el = document.getElementById('_offline_toast');
  if(!el){
    el = document.createElement('div');
    el.id = '_offline_toast';
    el.style.cssText = `position:fixed;bottom:44px;left:50%;transform:translateX(-50%);
      z-index:9997;border-radius:20px;padding:8px 18px;font-size:12px;font-weight:600;
      font-family:var(--fn);box-shadow:0 4px 16px rgba(0,0,0,.2);
      transition:opacity .3s;white-space:nowrap;pointer-events:none;`;
    document.body.appendChild(el);
  }
  const isOnline = type==='online';
  el.style.background = isOnline ? '#1a6830' : '#7a5800';
  el.style.color = '#fff';
  el.textContent = (isOnline?'☁ ':'💾 ') + msg;
  el.style.opacity = '1';
  clearTimeout(_offlineToastTimer);
  _offlineToastTimer = setTimeout(()=>{ el.style.opacity='0'; }, isOnline?4000:3000);
}

// ── 同步状态显示 ──
function showSyncStatus(state){
  const M={local:['💻 本地模式','#f0ede4','#888'],sync:['☁ 已同步','#e8f5ea','#1a6830'],saving:['💾 同步中…','#e8f0fe','#1a56a8'],saved:['✓ 已同步','#e8f5ea','#1a6830'],err:['⚠ 同步失败','#fff0f0','#b00020'],pending:['📝 有未提交','#fffbe6','#7a5800']};
  const [t,bg,c]=M[state]||M.local;
  const labels=['_sync_label_weekly','_sync_label_charts','_sync_label_overview','_sync_label_meeting','_sync_label_meeting_edit','_sync_label_archive','_sync_label_history','_sync_label_input','_sync_label_wkinput'];
  labels.forEach(id=>{ const el=document.getElementById(id); if(el){el.textContent=t;el.style.background=bg;el.style.color=c;el.style.border='0.5px solid '+c+'44';} });
  const el=document.getElementById('_sb');
  if(el){el.textContent=t;el.style.background=bg;el.style.color=c;el.style.border='0.5px solid '+c+'44';}
}
function markPending(){ _pendingSync=true; showSyncStatus('pending'); }

// ── 云端代理 ──
function syncConfigured(){ return !!(PROXY_URL && !PROXY_URL.includes('<你的环境id>')); }

async function _proxy(action, id, data, extra){
  const payload = {action, ...(id?{id}:{}), ...(data?{data}:{}), ...(extra||{})};
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 10000);
  try{
    const r = await fetch(PROXY_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    clearTimeout(timer);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const result = await r.json();
    if(result && result.error) throw new Error(result.error);
    return result;
  }catch(e){ clearTimeout(timer); throw e; }
}

async function _dbGet(id){ try{ return await _proxy('get',id); }catch(e){ return null; } }
async function _dbSet(id, obj, extra){
  try{ return await _proxy('set',id,obj,extra); }
  catch(e){
    if(!navigator.onLine||e.message.includes('fetch')||e.message.includes('Failed')||e.message.includes('ERR_')){
      _queueAdd({id,obj,extra,ts:Date.now()});
      _syncOk=false; showSyncStatus('pending'); _wasOffline=true;
      throw Object.assign(new Error('OFFLINE'),{offline:true});
    }
    throw e;
  }
}
async function _dbQuery(query){ try{ return await _proxy('query',null,null,{query}); }catch(e){ return []; } }

// ── 离线队列同步 ──
async function _flushOfflineQueue(){
  const q=_queueGet(); if(!q.length) return;
  const done=[];
  for(const item of q){
    try{ await _proxy('set',item.id,item.obj,item.extra); done.push(item.id); }
    catch(e){ break; }
  }
  if(done.length){
    const remaining=q.filter(x=>!done.includes(x.id));
    _queueSave(remaining);
    if(!remaining.length) _showOfflineToast(`已同步 ${done.length} 条离线数据到云端`,'online');
  }
}

// ── 字段级合并 ──
function _mergeSnap(localSnap, remoteSnap){
  if(!remoteSnap) return {...localSnap};
  const merged={...remoteSnap};
  for(const field of SNAP_CONTENT_FIELDS){
    const lv=localSnap[field], rv=remoteSnap[field];
    const localEmpty=lv===undefined||lv===null||lv==='';
    const remoteEmpty=rv===undefined||rv===null||rv==='';
    if(localEmpty && !remoteEmpty){
      if((field==='risk'&&lv==='')||(field==='decision'&&lv==='无')){ merged[field]=lv; }
      else { merged[field]=rv; }
    }else if(!localEmpty && remoteEmpty){
      merged[field]=lv;
    }else if(!localEmpty && !remoteEmpty){
      const lts=(localSnap._fieldTs&&localSnap._fieldTs[field])||localSnap._ts||0;
      const rts=(remoteSnap._fieldTs&&remoteSnap._fieldTs[field])||remoteSnap._ts||0;
      merged[field]=lts>=rts?lv:rv;
    }else{ merged[field]=''; }
  }
  if(localSnap.status) merged.status=localSnap.status;
  if(localSnap.stage!==undefined&&localSnap.stage!==null) merged.stage=localSnap.stage;
  return merged;
}

function _stampSnap(snap, submitter, submitTime){
  const now=Date.now();
  const fieldTs=snap._fieldTs?{...snap._fieldTs}:{};
  for(const field of SNAP_CONTENT_FIELDS){
    const v=snap[field];
    const hasValue=v!==undefined&&v!==null&&v!=='';
    if(hasValue) fieldTs[field]=now;
  }
  const stamped={...snap,_ts:now,_fieldTs:fieldTs};
  // 将提交人写入快照本身，供卡片右上角显示
  if(submitter){ stamped._updatedBy=submitter; stamped._updatedAt=submitTime||''; }
  return stamped;
}

// ── 提交项目（带乐观锁） ──
async function submitProject(projId){
  if(!syncConfigured()){ alert('云端未配置'); return false; }
  const projName=(LP().find(p=>p.id===projId)||{}).name||'项目'+projId;
  const t=new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  if(!_syncOk){
    const remoteId='snap_'+projId, newV=String(Date.now());
    const localSnap=LW_proj(projId);
    const stampedSnap={};
    for(const [wk,s] of Object.entries(localSnap)) stampedSnap[wk]=_stampSnap(s,_currentUser,t);
    const payload={data:stampedSnap,_v:newV,_updatedBy:_currentUser,_updatedAt:t};
    _queueAdd({id:remoteId,obj:payload,ts:Date.now()});
    localStorage.setItem('hlzc_pv_'+projId,newV);
    _addActivityLog({user:_currentUser,action:'离线提交',proj:projName,time:t,ts:Date.now()});
    _showOfflineToast('网络不可用，已存入本地队列，恢复后自动上传');
    return 'queued';
  }
  const remoteId='snap_'+projId, newV=String(Date.now());
  showSyncStatus('saving');
  try{
    const remoteRec=await _dbGet(remoteId);
    const remoteData=(remoteRec&&remoteRec.data)?remoteRec.data:{};
    const localSnap=LW_proj(projId);
    const mergedSnap={};
    const allWks=new Set([...Object.keys(localSnap),...Object.keys(remoteData)]);
    for(const wk of allWks){
      const local=localSnap[wk]||null, remote=remoteData[wk]||null;
      if(local&&remote){ mergedSnap[wk]=_stampSnap(_mergeSnap(local,remote),_currentUser,t); }
      else if(local){ mergedSnap[wk]=_stampSnap(local,_currentUser,t); }
      else { mergedSnap[wk]=remote; }
    }
    const allWeeks=LW();
    for(const [wk,snap] of Object.entries(mergedSnap)){
      if(!allWeeks[wk]) allWeeks[wk]={};
      allWeeks[wk][projId]=snap;
    }
    localStorage.setItem('hlzc_w',JSON.stringify(allWeeks));
    await _dbSet(remoteId,{data:mergedSnap,_v:newV,_updatedBy:_currentUser,_updatedAt:t});
    localStorage.setItem('hlzc_pv_'+projId,newV);
    const entry={user:_currentUser,action:'提交',proj:projName,time:t,ts:Date.now()};
    _addActivityLog(entry); _pushActivityLog(entry);
    clearPendingSubmit(projId);
    showSyncStatus('saved'); setTimeout(()=>showSyncStatus('sync'),2000);
    return true;
  }catch(e){
    console.warn('submit error:',e.message); showSyncStatus('err');
    alert('提交失败\n\n请检查网络或稍后重试');
    return false;
  }
}

async function _pushActivityLog(entry){
  try{
    const rec=await _dbGet('activity_log');
    const logs=(rec&&rec.data)?rec.data:[];
    logs.unshift(entry); if(logs.length>100) logs.length=100;
    await _dbSet('activity_log',{data:logs,_updatedAt:Date.now()});
  }catch(e){}
}

async function pullProject(projId){
  if(!syncConfigured()||!_syncOk) return;
  try{
    const rec=await _dbGet('snap_'+projId); if(!rec||!rec.data) return;
    const remoteData=rec.data, localSnap=LW_proj(projId), all=LW();
    for(const [wk,remoteSnap] of Object.entries(remoteData)){
      if(!all[wk]) all[wk]={};
      const localWkSnap=(all[wk]&&all[wk][projId])?all[wk][projId]:null;
      all[wk][projId]=localWkSnap?_mergeSnap(localWkSnap,remoteSnap):remoteSnap;
    }
    localStorage.setItem('hlzc_w',JSON.stringify(all));
    if(rec._v) localStorage.setItem('hlzc_pv_'+projId,rec._v);
  }catch(e){}
}

async function _saveMainBin(payload){ return _dbSet('projects',payload); }

// ════════════════════════════════════════════════════
// 轮询模式（已脱离 CloudBase，不再使用 WebSocket 实时监听）
// ════════════════════════════════════════════════════

// ── 刷新提示 ──
let _hasNewData=false, _newDataCount=0;
function _showRefreshPrompt(){
  if(!_hasNewData) return;
  const globalBtn=document.getElementById('global-refresh-btn');
  if(globalBtn){ globalBtn.style.display='block'; const badge=globalBtn.querySelector('._new_data_badge'); if(badge) badge.textContent=_newDataCount||1; }
}

async function doRefresh(){
  _hasNewData=false; _newDataCount=0;
  const globalBtn=document.getElementById('global-refresh-btn');
  if(globalBtn) globalBtn.style.display='none';
  document.querySelectorAll('._refresh_btn').forEach(btn=>{btn.style.background='#e8f0fe';btn.style.borderColor='#1a56a8';btn.style.color='#1a56a8';const badge=btn.querySelector('._new_data_badge');if(badge)badge.remove();});
  try{
    const projRec=await _dbGet('projects');
    if(projRec&&projRec.projects) localStorage.setItem('hlzc_p',JSON.stringify(projRec.projects));
    const actRec=await _dbGet('activity_log');
    if(actRec&&actRec.data) localStorage.setItem(_ACT_KEY,JSON.stringify(actRec.data));
    await _loadUserRegistry();
    const projects=LP(), allWeeks={};
    for(const proj of projects){
      const snapRec=await _dbGet('snap_'+proj.id);
      if(snapRec&&snapRec.data) Object.keys(snapRec.data).forEach(wk=>{if(!allWeeks[wk])allWeeks[wk]={};allWeeks[wk][proj.id]=snapRec.data[wk];});
    }
    const wk=wkKey(S.yr,S.wk);
    const meetingRec=await _dbGet('meeting_'+S.yr+'_'+S.wk);
    if(meetingRec&&meetingRec.data){if(!allWeeks[wk])allWeeks[wk]={};allWeeks[wk].__meetings=meetingRec.data;}
    localStorage.setItem('hlzc_w',JSON.stringify(allWeeks));
    render(); renderActivityBar();
    document.querySelectorAll('._refresh_btn').forEach(btn=>{btn.style.display='none';const badge=btn.querySelector('._new_data_badge');if(badge)badge.remove();});
  }catch(e){ console.error('同步失败:',e); alert('同步失败，请检查网络后重试'); }
}

// ── 轮询 ──
function _startPollOnly(){
  if(_pollTimer) return;
  console.log('[Poll] 启动轮询（每5秒）');
  _pollTimer=setInterval(async()=>{
    try{
      const [projRec,actRec]=await Promise.all([_dbGet('projects'),_dbGet('activity_log')]);
      if(projRec&&projRec.projects){
        const localProjects=LP(), remoteIds=new Set(projRec.projects.map(p=>p.id));
        const localExisting=localProjects.filter(p=>remoteIds.has(p.id));
        if(JSON.stringify(projRec.projects)!==JSON.stringify(localExisting)){
          if(_appReady&&!_hasNewData){_hasNewData=true;_newDataCount++;_showRefreshPrompt();}
        }
      }
      if(actRec&&actRec.data){
        const newLog=JSON.stringify(actRec.data);
        if(newLog!==localStorage.getItem(_ACT_KEY)){localStorage.setItem(_ACT_KEY,newLog);renderActivityBar();}
      }
      if(_wasOffline){_wasOffline=false;_syncOk=true;await _flushOfflineQueue();_showOfflineToast('网络已恢复，离线数据已同步','online');}
      if(!_syncOk) _syncOk=true;
      showSyncStatus('sync');
    }catch(e){ if(!_syncOk)return; _syncOk=false; _wasOffline=true; showSyncStatus('pending'); }
  },5000);
}

// ── 网络监听 ──
let _networkListenersRegistered=false;
function _registerNetworkListeners(){
  if(_networkListenersRegistered) return;
  _networkListenersRegistered=true;
  window.addEventListener('online',async()=>{
    if(_wasOffline){
      _wasOffline=false; showSyncStatus('saving'); _showOfflineToast('网络已恢复，正在同步离线数据…','online');
      try{ await _proxy('ping'); _syncOk=true; await _flushOfflineQueue(); showSyncStatus('sync'); if(!_pollTimer) _startPollOnly(); }
      catch(e){ showSyncStatus('err'); }
    }
  });
  window.addEventListener('offline',()=>{_syncOk=false;_wasOffline=true;showSyncStatus('pending');_showOfflineToast('网络已断开，数据将保存在本地');});
}

// ── 主同步入口（纯轮询模式） ──
async function _startSync(){
  _registerNetworkListeners();
  console.log('[Sync] 使用轮询模式（已脱离 CloudBase）');
  _startPollOnly();
}

// ── 初始化存储 ──
function initStorage(onReady){
  console.log('[initStorage] 开始初始化存储...');
  showSyncStatus('local');
  try{ onReady(); }catch(e){ console.error('[initStorage] onReady 执行错误:',e); }
  if(!syncConfigured()){ console.log('[initStorage] 云端未配置'); return; }
  (async()=>{
    try{
      await _proxy('ping');
      const [projRec,actRec]=await Promise.all([_dbGet('projects'),_dbGet('activity_log')]);
      if(projRec&&projRec.projects) localStorage.setItem('hlzc_p',JSON.stringify(projRec.projects));
      if(actRec&&actRec.data){ localStorage.setItem(_ACT_KEY,JSON.stringify(actRec.data)); renderActivityBar(); }
      _syncOk=true;
      await _loadUserRegistry();

      // ── 从云端加载所有项目的周快照数据（新域名首次访问时本地为空）
      try{
        const localWasEmpty = !localStorage.getItem('hlzc_w') || localStorage.getItem('hlzc_w') === '{}';
        if(localWasEmpty && projRec && projRec.projects){
          const allWeeks = {};
          for(const proj of projRec.projects){
            const snapRec = await _dbGet('snap_'+proj.id);
            if(snapRec && snapRec.data){
              Object.keys(snapRec.data).forEach(wk=>{
                if(!allWeeks[wk]) allWeeks[wk]={};
                allWeeks[wk][proj.id] = snapRec.data[wk];
              });
            }
          }
          if(Object.keys(allWeeks).length > 0){
            localStorage.setItem('hlzc_w', JSON.stringify(allWeeks));
          }
        }
      }catch(e){ console.warn('[initStorage] 快照数据加载失败:', e.message); }

      // 从云端加载KPI数据到本地
      try{
        const kpiRec = await _dbGet('kpi_data');
        if(kpiRec && kpiRec.data) localStorage.setItem('hlzc_kpi', JSON.stringify(kpiRec.data));
      }catch(e){}
      showSyncStatus('sync');
      if(_appReady){
        if(projRec&&projRec.projects){
          const localWas = localStorage.getItem('hlzc_p');
          const h = JSON.stringify(projRec.projects);
          localStorage.setItem('hlzc_p', h);
          // 首次访问新域名（本地为空）或数据有变化，都重新渲染
          const needRender = !localWas || localWas === '[]' || h !== localWas;
          if(needRender && (S.tab==='weekly'||S.tab==='overview'||S.tab==='charts')) render();
        }
        if(_currentUser&&!DIRECTORS.includes(_currentUser)&&!isApproved()) _showNotInSystemModal();
      }
      _startSync();
    }catch(e){ console.warn('[initStorage] 云端同步失败:',e.message); showSyncStatus('local'); }
  })();
}

async function _checkPendingBadge(){
  if(!isDirector()||!_syncOk) return;
  try{
    const rec=await _dbGet('users');
    if(rec&&rec.data){
      for(const [n,u] of Object.entries(rec.data)){ if(!(_userRegistry[n])) _userRegistry[n]=u; }
    }
  }catch(e){}
}
