// メイク表のページ ⇄ 拡張機能 の中継
document.documentElement.dataset.tmsExt = "2";
document.documentElement.dataset.tmsExtVer = chrome.runtime.getManifest().version; // メイク表の右下に出す
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.type !== "MAKEHYO_TMS_REQ") return;
  chrome.runtime.sendMessage({ type: "READ_TMS", days: e.data.days || 1, start: e.data.start }, (res) => {
    if (chrome.runtime.lastError) res = { ok: false, error: chrome.runtime.lastError.message };
    window.postMessage({ type: "MAKEHYO_TMS_RES", res }, "*");
  });
});
// 読み込みの進み具合（n日中 i日目）
chrome.runtime.onMessage.addListener((m) => {
  if (m && m.type === "TMS_PROGRESS") window.postMessage({ type: "MAKEHYO_TMS_PROG", i: m.i, n: m.n }, "*");
});
// スマホからの依頼で開いたページが読み終わった → 拡張機能がこのウィンドウを閉じる
window.addEventListener("message", (e) => {
  if (e.source === window && e.data && e.data.type === "MAKEHYO_REMOTE_DONE") chrome.runtime.sendMessage({ type: "REMOTE_DONE" });
});
