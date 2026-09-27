import fs from "node:fs";
import path from "node:path";

const columnsPath = process.env.RESTOVA_COLUMNS_JSON;
const db = JSON.parse(fs.readFileSync(columnsPath, "utf8"));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

function balancedBlock(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  return "";
}

function topLevelKeys(block) {
  const keys = [];
  let depth = 0;
  let current = "";
  for (const ch of block) {
    if ("{([".includes(ch)) depth++;
    if ("})]".includes(ch)) depth--;
    if (ch === "," && depth === 0) {
      const m = current.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
      if (m) keys.push(m[1]);
      current = "";
    } else current += ch;
  }
  const m = current.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/);
  if (m) keys.push(m[1]);
  return keys;
}

const FILTERS = ["eq", "neq", "gt", "gte", "lt", "lte", "is", "in", "like", "ilike", "order", "filter", "contains", "match"];

const problems = [];
let checked = 0;

for (const file of walk("src")) {
  const text = fs.readFileSync(file, "utf8");
  const froms = [...text.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)].map((m) => ({ table: m[1], at: m.index }));
  const tableAt = (i) => {
    let t = null;
    for (const f of froms) if (f.at < i && i - f.at < 1200) t = f.table;
    return t;
  };
  const mark = (table, field, kind) => {
    checked++;
    if (!table) return;
    const cols = db[table];
    if (!cols) { problems.push(`${table} <tabla inexistente> (${kind}) ${file}`); return; }
    if (!cols.includes(field)) problems.push(`${table}.${field} (${kind}) -> ${file}`);
  };

  for (const m of text.matchAll(/\.(insert|update|upsert)\(\s*\{/g)) {
    const table = tableAt(m.index);
    const block = balancedBlock(text, m.index + m[0].length - 1);
    for (const key of topLevelKeys(block)) mark(table, key, m[1]);
  }

  for (const name of FILTERS) {
    const re = new RegExp(`\\.${name}\\(\\s*"([A-Za-z_][A-Za-z0-9_]*)"`, "g");
    for (const m of text.matchAll(re)) {
      const table = tableAt(m.index);
      if (!table) continue;
      const field = m[1];
      if (!db[table]) continue;
      if (!db[table].includes(field)) mark(table, field, name);
      else checked++;
    }
  }
}

console.log(`referencias de columna verificadas: ${checked}`);
if (!problems.length) console.log("OK: inserts/updates/filtros coinciden con el esquema");
else {
  console.log(`PROBLEMAS (${problems.length}):`);
  [...new Set(problems)].forEach((p) => console.log("  " + p));
}
