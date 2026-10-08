// extras.js — إضافات لوحة NetFlow: عدد مشتركي كل وكيل + زر حذف الوكيل
// (الإعدادات والمظهر واللغة وكلمة المرور والمدراء موجودة أصلاً داخل index.html)
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, getCountFromServer, doc, writeBatch, addDoc, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DB_ID = "ai-studio-netfluoadminagen-472f1dd6-1fad-4622-b483-3bdc51a7bd41";
const app = getApp(), auth = getAuth(app), db = getFirestore(app, DB_ID);
const $ = (s, r = document) => r.querySelector(s);

function toast(m, err = false) {
  const t = $("#toast"); if (!t) return;
  t.textContent = m; t.className = "show" + (err ? " err" : "");
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 3000);
}

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
