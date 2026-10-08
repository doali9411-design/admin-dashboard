// extras.js — إضافات لوحة NetFlow: الإعدادات (مظهر + كلمة مرور)، حذف الوكيل، عدد مشتركي كل وكيل
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, getCountFromServer, doc, writeBatch, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DB_ID = "ai-studio-netfluoadminagen-472f1dd6-1fad-4622-b483-3bdc51a7bd41";
const app = getApp(), auth = getAuth(app), db = getFirestore(app, DB_ID);
const $ = (s, r = document) => r.querySelector(s);

function toast(m, err = false) {
  const t = $("#toast"); if (!t) return;
  t.textContent = m; t.className = "show" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 3000);
}

/* ================= المظهر ================= */
const LIGHT = { "--bg": "#f4f6fb", "--panel": "#ffffff", "--panel2": "#eef1f7", "--line": "#dde3ee", "--text": "#16202f", "--muted": "#5d6b82", "--accent": "#0d9488", "--ink": "#ffffff", "--warn": "#b45309", "--ok": "#15803d", "--bad": "#dc2626" };
function applyTheme(t) {
  const r = document.documentElement;
  Object.keys(LIGHT).forEach(k => (t === "light" ? r.style.setProperty(k, LIGHT[k]) : r.style.removeProperty(k)));
  try { localStorage.setItem("nf_theme", t); } catch {}
  $("#x-light")?.classList.toggle("primary", t === "light");
  $("#x-dark")?.classList.toggle("primary", t !== "light");
}
let savedTheme = "dark";
try { savedTheme = localStorage.getItem("nf_theme") || "dark"; } catch {}
applyTheme(savedTheme);

/* ================= صفحة الإعدادات ================= */
const nav = document.createElement("button");
nav.className = "nav"; nav.dataset.view = "settings"; nav.textContent = "الإعدادات";
$("aside .me").before(nav);

const pane = document.createElement("section");
pane.dataset.pane = "settings"; pane.className = "hidden";
pane.innerHTML = `
  <div class="grid2">
    <div class="card"><div class="card-h"><h3>المظهر</h3></div><div class="pad">
      <label>وضع العرض</label>
      <div class="row-actions"><button class="btn" id="x-light">الوضع النهاري</button><button class="btn" id="x-dark">الوضع الليلي</button></div>
    </div></div>
    <div class="card"><div class="card-h"><h3>تغيير كلمة مرور حسابك</h3></div><div class="pad">
      <label for="x-p0">كلمة المرور الحالية</label><input id="x-p0" type="password" autocomplete="current-password">
      <label for="x-p1">كلمة المرور الجديدة</label><input id="x-p1" type="password" autocomplete="new-password">
      <label for="x-p2">تأكيد كلمة المرور الجديدة</label><input id="x-p2" type="password" autocomplete="new-password">
      <button class="btn primary" id="x-pw" style="margin-top:14px">تغيير كلمة المرور</button>
    </div></div>
  </div>`;
$("main").append(pane);

nav.onclick = () => {
  document.querySelectorAll("[data-pane]").forEach(p => p.classList.toggle("hidden", p !== pane));
  document.querySelectorAll(".nav").forEach(n => n.classList.toggle("active", n === nav));
  $("#title").textContent = "الإعدادات";
  $("#subtitle").textContent = "المظهر وكلمة المرور";
};
$("#x-light").onclick = () => applyTheme("light");
$("#x-dark").onclick = () => applyTheme("dark");
applyTheme(savedTheme);

$("#x-pw").onclick = async e => {
  const u = auth.currentUser, p0 = $("#x-p0").value, p1 = $("#x-p1").value, p2 = $("#x-p2").value;
  if (!u) return;
  if (!p0 || p1.length < 6) return toast("أدخل كلمة المرور الحالية والجديدة (6 أحرف على الأقل)", true);
  if (p1 !== p2) return toast("تأكيد كلمة المرور غير مطابق", true);
  const btn = e.target; btn.disabled = true;
  try {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, p0));
    await updatePassword(u, p1);
    ["#x-p0", "#x-p1", "#x-p2"].forEach(s => ($(s).value = ""));
    toast("تم تغيير كلمة المرور");
  } catch (err) {
    toast(["auth/wrong-password", "auth/invalid-credential"].includes(err.code) ? "كلمة المرور الحالية غير صحيحة" : "تعذر تغيير كلمة المرور", true);
  }
  btn.disabled = false;
};

/* ============ عدد المشتركين + زر الحذف بجدول الوكلاء ============ */
const hex64 = /^[0-9a-f]{64}$/;
const counts = new Map();

async function countFor(uid) {
  const c = counts.get(uid);
  if (c && Date.now() - c.t < 60000) return c.n;
  try {
    const r = await getCountFromServer(collection(db, "users", uid, "subscribers"));
    const n = r.data().count;
    counts.set(uid, { n, t: Date.now() });
    return n;
  } catch { return null; }
}

function enhanceAgents() {
  document.querySelectorAll("#agent-list tbody tr").forEach(tr => {
    if (tr.dataset.x) return;
    const btn = tr.querySelector("[data-act][data-id]");
    if (!btn) return;
    tr.dataset.x = "1";
    const id = btn.dataset.id, email = tr.children[0].textContent.trim(), cell = tr.children[4];
    const del = document.createElement("button");
    del.className = "btn sm bad"; del.textContent = "حذف";
    del.dataset.xdel = id; del.dataset.email = email;
    tr.querySelector(".row-actions").append(del);
    if (!hex64.test(id)) {
      const c = counts.get(id); if (c) cell.textContent = c.n;
      countFor(id).then(n => { if (n !== null) cell.textContent = n; });
    }
  });
}
new MutationObserver(enhanceAgents).observe($("#agent-list"), { childList: true, subtree: true });

/* ================= حذف الوكيل ================= */
async function sha256(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const cleanId = e => e.trim().toLowerCase().replace(/@/g, "_at_").replace(/\./g, "_dot_").replace(/\//g, "_").replace(/ /g, "");

async function deleteAgent(uid, email) {
  const hash = await sha256(email), refs = new Map();
  const add = r => refs.set(r.path, r);
  for (const name of ["subscribers", "payment_records", "activity_logs", "backups", "sectors"]) {
    (await getDocs(collection(db, "users", uid, name))).forEach(d => add(d.ref));
  }
  for (const q of [
    query(collection(db, "payment_requests"), where("agentUid", "==", uid)),
    query(collection(db, "payment_requests"), where("email", "==", email.toLowerCase()))
  ]) (await getDocs(q)).forEach(d => add(d.ref));
  [doc(db, "users", uid), doc(db, "users", hash), doc(db, "app_subscriptions", uid), doc(db, "app_subscriptions", hash),
   doc(db, "app_subscriptions", cleanId(email)), doc(db, "trial_registry", hash)].forEach(add);

  const all = [...refs.values()];
  for (let i = 0; i < all.length; i += 400) {
    const b = writeBatch(db);
    all.slice(i, i + 400).forEach(r => b.delete(r));
    await b.commit();
  }
  await addDoc(collection(db, "audit_logs"), {
    action: "AGENT_DELETED", details: `حذف الوكيل ${email} مع كل بياناته`, target: email,
    by: auth.currentUser.email, byUid: auth.currentUser.uid, at: serverTimestamp()
  });
}

$("#agent-list").addEventListener("click", async e => {
  const b = e.target.closest("[data-xdel]"); if (!b) return;
  const uid = b.dataset.xdel, email = b.dataset.email;
  const typed = prompt(`حذف الوكيل نهائياً مع كل بياناته وطلبات الدفع.\nللتأكيد اكتب البريد:\n${email}`);
  if (typed === null) return;
  if (typed.trim().toLowerCase() !== email.toLowerCase()) return toast("البريد غير مطابق، تم الإلغاء", true);
  b.disabled = true;
  try { await deleteAgent(uid, email); toast("تم حذف الوكيل وبياناته"); }
  catch (err) { console.error(err); toast("تعذر الحذف. تحقق من الصلاحيات.", true); b.disabled = false; }
});
