// メイク表（四条堀川）のデータ保存用 Google Apps Script
// Googleスプレッドシートの「拡張機能 → Apps Script」に、このファイルの中身を全部貼り付けて使う。
//
// しくみ：
//   シート「data」の1行 = 1つのデータ（key）。B列に更新時刻、C列から右にJSONを分けて入れる
//   （1つのセルには5万文字までしか入らないので、4万文字ずつに分ける）。
//   お客様の名前は入らない（部屋番号・泊数・枚数・清掃の記録だけ）。
//   合言葉がURLに出ないよう、読むのも書くのも POST（本文は text/plain の JSON）。

// 合言葉（メイク表 index.html の CLOUD_PASS と同じ。ページに書いてあるので入力は不要）
const PASS = "9";

const SHEET = "data";
const CHUNK = 40000;
const KEYS = ["make", "ext", "req"]; // make=メイク表、ext=TMSデータ・連泊清掃・リネン発注、req=スマホからパソコンへの「データ更新」の依頼

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, 1, 3).setValues([["key", "更新時刻", "データ（JSON）"]]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function findRow_(sh, key) {
  const n = sh.getLastRow();
  if (n < 2) return 0;
  const ks = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ks.length; i++) if (ks[i][0] === key) return i + 2;
  return 0;
}
function at_(sh, key) {
  const r = findRow_(sh, key);
  return r ? Number(sh.getRange(r, 2).getValue()) || 0 : 0;
}
function read_(sh, key) {
  const r = findRow_(sh, key);
  if (!r) return { at: 0, data: null };
  const w = sh.getLastColumn();
  const v = sh.getRange(r, 1, 1, w).getValues()[0];
  const json = v.slice(2).join("");
  return { at: Number(v[1]) || 0, data: json ? JSON.parse(json) : null };
}

// ブラウザでURLを開いたとき用（データは返さない）
function doGet() {
  return out_({ ok: true, app: "makehyo" });
}

// {pass, action:"head"}                 → {ok, at:{make, ext}}       更新時刻だけ
// {pass, action:"get", keys:[...]}       → {ok, res:{key:{at,data}}}
// {pass, action:"put", key, data, base}  → {ok, at}  /  {ok:false, error:"conflict", at, data}
//   base = このデータを読んだときの更新時刻。クラウドの方が新しければ書かずに返す（上書き事故を防ぐ）
function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: "json" }); }
  if (b.pass !== PASS) return out_({ ok: false, error: "pass" });
  const sh = sheet_();
  if (b.action === "head") {
    const at = {};
    for (const k of KEYS) at[k] = at_(sh, k);
    return out_({ ok: true, at });
  }
  if (b.action === "get") {
    const res = {};
    for (const k of (b.keys || KEYS)) if (KEYS.indexOf(k) >= 0) res[k] = read_(sh, k);
    return out_({ ok: true, res });
  }
  if (b.action !== "put" || KEYS.indexOf(b.key) < 0) return out_({ ok: false, error: "bad request" });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cur = read_(sh, b.key);
    if (cur.at && b.base !== cur.at) return out_({ ok: false, error: "conflict", at: cur.at, data: cur.data });
    const json = JSON.stringify(b.data);
    const parts = [];
    for (let i = 0; i < json.length; i += CHUNK) parts.push(json.slice(i, i + CHUNK));
    const at = Date.now();
    let r = findRow_(sh, b.key);
    if (!r) r = sh.getLastRow() + 1;
    const w = Math.max(sh.getLastColumn(), parts.length + 2);
    const row = [b.key, at].concat(parts);
    while (row.length < w) row.push("");
    sh.getRange(r, 1, 1, w).setValues([row]);
    return out_({ ok: true, at });
  } finally {
    lock.releaseLock();
  }
}
