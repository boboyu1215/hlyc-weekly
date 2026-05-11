const Database = require("better-sqlite3");
const db = new Database("./data/weeklydata.db");
const weeks = db.prepare("SELECT id, substr(updated_at,1,16) as updated FROM documents WHERE id LIKE 'weeks/%' ORDER BY id").all();
console.log(JSON.stringify(weeks, null, 2));