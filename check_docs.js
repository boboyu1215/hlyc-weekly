const Database = require("better-sqlite3");
const db = new Database("./data/weeklydata.db");
const docs = db.prepare("SELECT id, substr(updated_at,1,16) as updated, length(data) as size FROM documents ORDER BY id").all();
console.log(JSON.stringify(docs, null, 2));