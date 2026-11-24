// TMSの予約検索ページを開き、画面に出ているRESV・C/INの一覧を読む（客の名前は読まない）
// 今日から n 日分、日付を1日ずつ変えて読む（メイク表・リネン発注・フル清掃・1か月のOUT数で使う）
const TMS = "https://v4.tms.ninehours.co.jp";
const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return ymd(d); };
const listUrl = (d) => TMS + "/rsv/sch/?date=" + d + "&type=STAY";

// tabs.update / create のあと、そのタブの読み込み完了を待つ（最大 40 秒）
function waitComplete(tabId) {
  return new Promise((ok) => {
    let done = false;
    const fin = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(f); clearTimeout(t); ok(); };
    const f = (id, info) => { if (id === tabId && info.status === "complete") fin(); };
    const t = setTimeout(fin, 40000);
    chrome.tabs.onUpdated.addListener(f);
  });
}
async function go(tabId, url) {
  const w = waitComplete(tabId);
  await chrome.tabs.update(tabId, { url });
  await w;
}

// TMSのページの中で動く関数（画面の表を読むだけ）。部屋番号・何泊目/何泊・部屋タイプだけ
// 最小化したウィンドウでは setTimeout が1秒に1回まで遅くされるので、時間で待たずに
// 「TMSの通信が終わった（jQuery の ajaxStop）」「画面が変わった（MutationObserver）」で次へ進む。setTimeout は保険だけ
async function readInPage(want) {
  const $ = window.jQuery;
  const tick = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
  const busy = () => !!($ && $.active > 0);
  const ajaxDone = (ms) => new Promise((r) => {
    if (!busy()) return r();
    let t; const f = () => { clearTimeout(t); $(document).off("ajaxStop", f); r(); };
    $(document).on("ajaxStop", f); t = setTimeout(f, ms);
  });
  const changed = (ms) => { let mo, t, f; const p = new Promise((r) => { f = r; }); const fin = () => { mo.disconnect(); clearTimeout(t); f(); };
    mo = new MutationObserver(fin); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); t = setTimeout(fin, ms); return p; };
  const wt = async () => { await tick(); await ajaxDone(20000); await tick(); };
  const clickWait = async (b) => { const ch = changed(1500); b.click(); await tick(); if (busy()) await ajaxDone(20000); else await ch; await tick(); };
  const waitEl = (sel, ms) => new Promise((r) => {
    if (document.querySelector(sel)) return r();
    let t; const mo = new MutationObserver(() => { if (document.querySelector(sel)) { mo.disconnect(); clearTimeout(t); r(); } });
    mo.observe(document.documentElement, { childList: true, subtree: true }); t = setTimeout(() => { mo.disconnect(); r(); }, ms);
  });
  const rd = () => [...document.querySelectorAll("tr.search_res_list")].map((tr) => {
    const c = [...tr.children].map((x) => x.textContent.trim());
    return {
      r: c.find((x) => /^\d{3}$/.test(x)) || "",
      n: c.find((x) => /^\d+\/\d+$/.test(x)) || "",
      t: ((c.find((x) => /\[.+?\]/.test(x)) || "").match(/\[(.+?)\]/) || [])[1] || ""
    };
  });
  if (location.pathname.indexOf("/lgn") === 0) return { ok: false, error: "login" };
  await waitEl("#status_resv", 10000);
  const b1 = document.querySelector("#status_resv"), b2 = document.querySelector("#status_cin");
  if (!b1 || !b2) return { ok: false, error: "RESV / C/IN が見つかりません（TMSの画面が変わったかもしれません）" };
  await wt();
  await clickWait(b1); const A = rd();
  await clickWait(b2); const B = rd();
  const d = ($ && $("input[name='current_date']").val()) || want || "";
  return { ok: true, d, rows: A.concat(B).filter((x) => x.n) };
}

async function readDay(tabId, d) {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func: readInPage, args: [d] });
  return r && r.result ? r.result : { ok: false, error: "読み取れませんでした" };
}

// 夜勤の日（営業日）：0時〜6時に押したときは前の日の夜勤として扱う
const BIZ_CUTOFF_H = 6;
const bizToday = () => ymd(new Date(Date.now() - BIZ_CUTOFF_H * 3600e3));
const WORKERS = 5; // 同時に読むタブの数

// 読むためのタブだけ、TMSの画像・フォント・動画を読み込まない（表を読むのに要らないので速くなる）。
// tabIds を付けたセッションルールなので、ほかのタブ・ふだん開くTMSには効かない
const BLOCK_ID = 1;
async function blockExtras(tabIds) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [BLOCK_ID],
      addRules: [{ id: BLOCK_ID, priority: 1, action: { type: "block" },
        condition: { tabIds, requestDomains: ["v4.tms.ninehours.co.jp"], resourceTypes: ["image", "font", "media"] } }]
    });
  } catch (e) {} // うまくいかなくても読み込みは続ける
}
const unblockExtras = () => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [BLOCK_ID] }).catch(() => {});

async function readOne(tabId, d) {
  let r = { ok: false };
  for (let k = 0; k < 2 && !r.ok; k++) { // 失敗したら1回だけやり直す
    try { await go(tabId, listUrl(d)); r = await readDay(tabId, d); } catch (e) { r = { ok: false, error: String(e && e.message || e) }; }
    if (r.ok && r.d && r.d !== d) r = { ok: false, error: "date" }; // 日付が変わっていない
  }
  return { d, ok: !!r.ok, rows: r.ok ? r.rows : [] };
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "READ_TMS") return;
  const from = sender.tab && sender.tab.id;
  const prog = (i, n) => { if (from != null) chrome.tabs.sendMessage(from, { type: "TMS_PROGRESS", i, n }).catch(() => {}); };
  (async () => {
    const n = Math.max(1, Math.min(62, msg.days || 1));
    // start＝最初に読む一覧の日（ページが指定。なければ今の夜勤の日）。今日より前は読まない
    const base = (typeof msg.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(msg.start) && msg.start > bizToday()) ? msg.start : bizToday();
    // 読むためのタブは「最小化したウィンドウ」に開く（画面にChromeが出てこないように）。
    // 最小化で開けなかったときは、前と同じく今のウィンドウの裏のタブで読む
    // 先に空のタブを全部作り、画像などを止めるルールを付けてから TMS を開く
    let winId = null, tab;
    try {
      const win = await chrome.windows.create({ url: "about:blank", state: "minimized", focused: false });
      winId = win.id; tab = win.tabs && win.tabs[0];
      if (!tab) tab = (await chrome.tabs.query({ windowId: winId }))[0];
    } catch (e) {
      winId = null; tab = await chrome.tabs.create({ url: "about:blank", active: false });
    }
    const tabs = [tab.id];
    const closeAll = () => {
      unblockExtras();
      if (winId != null) chrome.windows.remove(winId).catch(() => {});
      else for (const id of tabs) chrome.tabs.remove(id).catch(() => {});
    };
    try {
      for (let w = 1; w < Math.min(WORKERS, n - 1); w++) {
        const t = await chrome.tabs.create(winId != null ? { windowId: winId, url: "about:blank", active: false } : { url: "about:blank", active: false });
        tabs.push(t.id);
      }
      await blockExtras(tabs);
      await go(tab.id, listUrl(base));
      const first = await readDay(tab.id, base);
      if (!first.ok) {
        if (first.error === "login") { // ログイン画面を見せる（画像も出るように止めるのをやめる）
          await unblockExtras();
          for (const id of tabs.slice(1)) chrome.tabs.remove(id).catch(() => {});
          await chrome.tabs.reload(tab.id).catch(() => {});
          if (winId != null) await chrome.windows.update(winId, { state: "normal", focused: true });
          await chrome.tabs.update(tab.id, { active: true });
          reply({ ok: false, error: "login" }); return;
        }
        closeAll(); reply(first); return;
      }
      const d0 = base; // URLで指定した日（TMSの画面の日付とずれないように）
      const days = new Array(n);
      days[0] = { d: d0, ok: true, rows: first.rows };
      let done = 1, next = 1;
      prog(done, n);
      // 残りの日を WORKERS 個のタブで手分けして読む（タブは上で作ってある）
      await Promise.all(tabs.map(async (id) => {
        while (next < n) {
          const i = next++;
          days[i] = await readOne(id, addDays(d0, i));
          prog(++done, n);
        }
      }));
      closeAll();
      // 互換用（旧メイク表）：初日の o / s / u
      const o = [], s = [], u = [];
      for (const x of first.rows) {
        const q = x.n.split("/").map(Number);
        if (!q[0] || !q[1]) continue;
        if (x.r) (q[0] === q[1] ? o : s).push(x.r); else u.push(x.t + " " + x.n);
      }
      reply({ ok: true, data: { d: d0, o, s, u, days, v: 2 } });
    } catch (e) {
      closeAll();
      reply({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true;
});
