// ════════════════════════════════════════════════════
// storage.js — 本地存储读写 + 数据模型
// ════════════════════════════════════════════════════

// 活动日志 key
const _ACT_KEY = 'hlzc_activity';

// 项目列表读写
function LP(){ try{return JSON.parse(localStorage.getItem('hlzc_p')||'[]')}catch{return[]} }
function SP(ps){
  localStorage.setItem('hlzc_p', JSON.stringify(ps));
  if(_syncOk){
    showSyncStatus('saving');
    _dbSet('projects',{projects:ps,_v:Date.now()})
      .then(()=>{showSyncStatus('saved');setTimeout(()=>showSyncStatus('sync'),2000);})
      .catch(()=>showSyncStatus('err'));
  }
}

// 周报数据读写
function LW(){ try{return JSON.parse(localStorage.getItem('hlzc_w')||'{}')}catch{return{}} }
function SW(w){ localStorage.setItem('hlzc_w', JSON.stringify(w)); markPending(); }

// 某个项目的所有周快照
function LW_proj(projId){
  const all=LW(), result={};
  Object.keys(all).forEach(wk=>{ if(all[wk][projId]!==undefined) result[wk]=all[wk][projId]; });
  return result;
}

// 获取快照（带继承逻辑：找最近一周的历史数据）
function getSnap(yr,wk,pid,projects){
  const weeks=LW(), k=wkKey(yr,wk);
  if(weeks[k] && weeks[k][pid]!==undefined) return weeks[k][pid];
  const sorted=Object.keys(weeks).filter(x=>x<=k).sort();
  for(let i=sorted.length-1;i>=0;i--)
    if(weeks[sorted[i]] && weeks[sorted[i]][pid]!==undefined) return {...weeks[sorted[i]][pid]};
  const p=projects.find(x=>x.id===pid);
  return p
    ? {status:p.defStatus||'g', stage:p.defStage||0, risk:'', next:'', decision:'无', coreOutput:'', coreAction:'', incident:'', crossDept:'', knowledge:''}
    : {status:'g', stage:0, risk:'', next:'', decision:'无', coreOutput:'', coreAction:'', incident:'', crossDept:'', knowledge:''};
}

function setSnap(yr,wk,pid,snap){
  const weeks=LW(), k=wkKey(yr,wk);
  if(!weeks[k]) weeks[k]={};
  weeks[k][pid]=snap;
  SW(weeks);
}

// 会议数据
function getMeetings(yr,wk){ return (LW()[wkKey(yr,wk)]||{}).__meetings||[]; }
function setMeetings(yr,wk,meetings){
  const w=LW(), k=wkKey(yr,wk);
  if(!w[k]) w[k]={};
  w[k].__meetings=meetings;
  SW(w);
}

// 空模板
function blankProj(){
  return {name:'',area:'',startDate:'',schemeDate:'',designDate:'',siteDate:'',completionDate:'',openDate:'',prepOwner:'',designOwner:'',defStatus:'g',defStage:0};
}
function blankWkForm(pid){ return getSnap(S.yr,S.wk,pid,LP()); }

// 活动日志
function _getActivity(){ try{ return JSON.parse(localStorage.getItem(_ACT_KEY)||'[]'); }catch{ return []; } }
function _addActivityLog(entry){
  const logs = _getActivity();
  logs.unshift(entry); if(logs.length>100) logs.length=100;
  localStorage.setItem(_ACT_KEY, JSON.stringify(logs));
  renderActivityBar();
}

// ── 待提交集合（本地已保存但未提交到云端的项目ID集合）──
const _PENDING_SUBMIT_KEY = 'hlzc_pending_submit';
function getPendingSubmit(){
  try{ return new Set(JSON.parse(localStorage.getItem(_PENDING_SUBMIT_KEY)||'[]')); }catch{ return new Set(); }
}
function addPendingSubmit(projId){
  const s=getPendingSubmit(); s.add(projId);
  localStorage.setItem(_PENDING_SUBMIT_KEY, JSON.stringify([...s]));
}
function clearPendingSubmit(projId){
  const s=getPendingSubmit(); s.delete(projId);
  localStorage.setItem(_PENDING_SUBMIT_KEY, JSON.stringify([...s]));
}

// 种子数据（首次使用时生成示例）
function seed(){
  if(LP().length) return;
  const ps=[{id:1,name:'示例项目',area:'1200㎡',startDate:'',schemeDate:'',designDate:'',siteDate:'',completionDate:'',openDate:'',prepOwner:'张三',designOwner:'李四',archived:false,defStatus:'g',defStage:0}];
  SP(ps);
  const snap={1:{status:'g',stage:0,risk:'',next:'',decision:'无',coreOutput:'示例',coreAction:'',incident:'',crossDept:'',knowledge:''}};
  const weeks=LW(); weeks[wkKey(CYR,CWK)]=snap; SW(weeks);
}
