const Database = require("better-sqlite3");
const db = new Database("./data/weeklydata.db");

// 查测试项目 snap_20 和 snap_20_2026-W20
const snap20 = db.prepare("SELECT data FROM documents WHERE id=?").get("snap_20");
if (snap20) console.log("snap_20:", snap20.data);

const snap20w20 = db.prepare("SELECT data FROM documents WHERE id=?").get("snap_20_2026-W20");
if (snap20w20) console.log("snap_20_2026-W20:", snap20w20.data);

const snap20w19 = db.prepare("SELECT data FROM documents WHERE id=?").get("snap_20_2026-W19");
if (snap20w19) console.log("snap_20_2026-W19:", snap20w19.data);

// 也查 snap_3 (澳门巴黎人)
const snap3 = db.prepare("SELECT data FROM documents WHERE id=?").get("snap_3");
if (snap3) {
  const d = JSON.parse(snap3.data);
  console.log("snap_3 keys:", Object.keys(d));
  console.log("snap_3 coreAction sample:", d.coreAction ? d.coreAction.slice(0,2) : "none");
}

const snap3w20 = db.prepare("SELECT data FROM documents WHERE id=?").get("snap_3_2026-W20");
if (snap3w20) console.log("snap_3_2026-W20:", snap3w20.data);
