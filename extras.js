// extras.js — لوحة NetFlow: إدارة الوكلاء + المستخدمون الإداريون بصلاحيات دقيقة
import { getApp, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, getDocs, getDoc, getCountFromServer, doc, setDoc, updateDoc, deleteDoc, writeBatch, addDoc, query, where, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DB_ID = "ai-studio-netfluoadminagen-472f1dd6-1fad-4622-b483-3bdc51a7bd41", MASTER = "mantime50@gmail.com";
const app = getApp(), auth = getAuth(app), db = getFirestore(app, DB_ID);
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = (m, err = false) => { const t = $("#toast"); if (!t) return; t.textContent = m; t.className = "show" + (err ? " err" : ""); clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ""), 3200); };
const sha = async s => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase())))].map(x => x.toString(16).padStart(2, "0")).join("");
const cleanId = e => e.trim().toLowerCase().replace(/@/g, "_at_").replace(/\./g, "_dot_").replace(/\//g, "_").replace(/ /g, "");
const hex = /^[0-9a-f]{64}$/;

/* ========== الصلاحيات: مجموعات وصلاحيات فرعية ========== */
const GROUPS = [
  ["payments", "طلبات التفعيل", [["view", "مشاهدة الطلبات"], ["approve", "الموافقة على الطلبات"], ["reject", "رفض الطلبات"]]],
  ["agents", "الوكلاء", [["view", "عرض الوكلاء"], ["create", "إضافة وكيل"], ["edit", "تعديل بيانات الوكيل"], ["suspend", "تفعيل / تعطيل الحساب"], ["delete", "حذف الوكيل"]]],
  ["subs", "المشتركون", [["view", "عرض المشتركين وأعدادهم"], ["manage", "إدارة المشتركين"]]],
  ["billing", "الاشتراكات", [["create", "إنشاء وتجديد الاشتراكات"]]],
  ["reports", "التقارير", [["view", "عرض التقارير والبيانات المالية"]]],
  ["broadcast", "التعاميم", [["send", "إرسال التعاميم"]]],
  ["version", "الإصدارات", [["manage", "إدارة الإصدارات والتحديث"]]],
  ["settings", "الإعدادات", [["manage", "إدارة الإعدادات"]]]
];
const ALLK = GROUPS.flatMap(([g, , a]) => a.map(([k]) => g + "_" + k));
const any = (p, pre) => Object.keys(p).some(k => p[k] === true && pre.some(x => k.startsWith(x)));
// مفاتيح الصفحات (يعتمد عليها index.html لإخفاء/إظهار القائمة)
const coarse = p => ({ overview: Object.values(p).some(v => v === true), payments: any(p, ["payments_"]), agents: any(p, ["agents_", "subs_", "billing_"]), broadcast: any(p, ["broadcast_"]), audit: any(p, ["reports_"]), version: any(p, ["version_"]), settings: any(p, ["settings_"]) });
const matrix = (cur = {}) => GROUPS.map(([g, t, a]) => `<div style="margin-top:10px"><b>${t}</b><div class="permission-grid">${a.map(([k, l]) => `<label class="permission-item"><input type="checkbox" data-pk="${g}_${k}" ${cur[g + "_" + k] ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>`).join("");
const readM = r => { const p = {}; $$("[data-pk]", r).forEach(x => (p[x.dataset.pk] = x.checked)); return { ...p, ...coarse(p) }; };

let ME = null, P = null, U = new Map(), ADM = new Map(), unsubU = null;
const has = k => P === "ALL" || (P && P[k] === true);
const log = (action, details, target) => addDoc(collection(db, "audit_logs"), { action, details, target: target || null, by: ME.email, byUid: ME.uid, at: serverTimestamp() });
const secAuth = () => { let s; try { s = initializeApp(app.options, "sec"); } catch { s = getApp("sec"); } return getAuth(s); };

function modal(title, body, okText, onOk) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box" style="max-width:540px"><h3>${title}</h3><div>${body}</div><div class="row-actions" style="margin-top:16px"><button class="btn primary" data-ok>${okText}</button><button class="btn" data-no>إلغاء</button></div></div>`;
  document.body.append(m);
  $("[data-no]", m).onclick = () => m.remove();
  $("[data-ok]", m).onclick = async e => { e.target.disabled = true; try { await onOk(m); m.remove(); } catch (err) { console.error(err); toast(err.message || "تعذّر التنفيذ. تحقق من الصلاحيات.", true); e.target.disabled = false; } };
  return m;
}

/* ========== الدخول وتحميل صلاحيات المستخدم الحالي ========== */
onAuthStateChanged(auth, async u => {
  ME = u; P = null; if (unsubU) { unsubU(); unsubU = null; }
  if (!u) return;
  if ((u.email || "").toLowerCase() === MASTER) P = "ALL";
  else { try { const s = await getDoc(doc(db, "admin_users", u.uid)); P = s.exists() ? (s.data().permissions || {}) : {}; } catch { P = {}; } }
  boot();
});

function boot() {
  $("#admin-management-card")?.classList.add("hidden"); $("#admin-list-card")?.classList.add("hidden");
  unsubU = onSnapshot(collection(db, "users"), s => { U = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }])); resetRows(); }, () => {});
  const bar = $("[data-pane=agents] .bar");
  if (bar && has("agents_create") && !$("#x-add")) { const b = document.createElement("button"); b.id = "x-add"; b.className = "btn primary"; b.textContent = "+ إضافة وكيل"; b.onclick = addAgent; bar.append(b); }
  if (P === "ALL") adminCard();
  loadInvites(); resetRows();
}
const resetRows = () => { $$("#agent-list tbody tr").forEach(t => delete t.dataset.x); enhance(); gate(); };

/* ========== إخفاء الأزرار حسب الصلاحية ========== */
function gate() {
  const hide = (sel, k) => $$(sel).forEach(b => (b.style.display = P && !has(k) ? "none" : ""));
  hide("[data-act=approve]", "payments_approve"); hide("[data-act=reject]", "payments_reject");
  hide("[data-act=extend]", "billing_create"); hide("[data-act=suspend],[data-act=unsuspend]", "agents_suspend");
}

/* ========== جدول الوكلاء: تعديل، حذف، عدد المشتركين، المدة المتبقية ========== */
const counts = new Map();
async function countFor(uid) {
  const c = counts.get(uid); if (c && Date.now() - c.t < 60000) return c.n;
  try { const n = (await getCountFromServer(collection(db, "users", uid, "subscribers"))).data().count; counts.set(uid, { n, t: Date.now() }); return n; } catch { return null; }
}
/* حالة التجربة: نفس مصدر التطبيق (trial_registry أولاً) */
const trialCache = new Map();
async function trialEnd(email) {
  const k = email.toLowerCase(); if (trialCache.has(k)) return trialCache.get(k);
  let t = null;
  try { const s = await getDoc(doc(db, "trial_registry", await sha(k))); if (s.exists()) { const x = s.data(); t = x.trial_end_epoch_ms ?? x.trial_end_ms ?? x.trial_end_timestamp?.toMillis?.() ?? null; } } catch {}
  if (t == null) for (const x of U.values()) if ((x.email || "").toLowerCase() === k) { const v = x.trial_end_epoch_ms ?? x.trial_end_ms ?? x.trial_end_timestamp?.toMillis?.(); if (v) { t = v; break; } }
  if (t != null) trialCache.set(k, t); return t;
}
function enhance() {
  $$("#agent-list tbody tr").forEach(tr => {
    if (tr.dataset.x) return; const b = tr.querySelector("[data-act][data-id]"); if (!b) return; tr.dataset.x = "1";
    const id = b.dataset.id, d = U.get(id) || {}, email = tr.children[0].textContent.trim(), box = tr.querySelector(".row-actions");
    const add = (t, attr, cls = "") => { const x = document.createElement("button"); x.className = "btn sm " + cls; x.textContent = t; x.dataset[attr] = id; x.dataset.email = email; box.append(x); };
    if (has("agents_edit") || has("agents_suspend")) add("تعديل", "xedit");
    if (has("agents_delete")) add("حذف", "xdel", "bad");
    const ends = d.subscriptionEndsAt?.toDate?.();
    if (ends) { const n = Math.ceil((ends - Date.now()) / 864e5); tr.children[3].insertAdjacentHTML("beforeend", `<div class="muted">${n > 0 ? "باقي " + n + " يوم" : "منتهي"}</div>`); }
    const susp = d.is_suspended === true || (d.subscriptionStatus || d.status) === "SUSPENDED";
    if (!susp && !(ends && ends > Date.now())) trialEnd(email).then(t => {
      if (!t) return; const n = Math.ceil((t - Date.now()) / 864e5), dt = new Date(t).toLocaleDateString("ar-IQ", { dateStyle: "medium" });
      tr.children[1].innerHTML = n > 0 ? `<span class="tag t-ACTIVE">تجربة · باقي ${n} يوم</span>` : `<span class="tag t-EXPIRED">انتهت التجربة</span>`;
      tr.children[3].innerHTML = `<span class="muted">التجربة تنتهي ${dt}</span>`;
    });
    if (has("subs_view") && !hex.test(id)) { const c = counts.get(id); if (c) tr.children[4].textContent = c.n; countFor(id).then(n => { if (n !== null) tr.children[4].textContent = n; }); }
  });
}
["#agent-list", "#pay-list", "#ov-pending"].forEach(s => { const el = $(s); if (el) new MutationObserver(() => { enhance(); gate(); }).observe(el, { childList: true, subtree: true }); });

/* ========== إضافة وكيل ========== */
function addAgent() {
  const m = modal("إضافة وكيل جديد", `<label>اسم الوكيل</label><input id="n-name"><label>البريد الإلكتروني</label><input id="n-email" type="email"><label>الهاتف (اختياري)</label><input id="n-phone"><label>طريقة تسجيل الدخول</label><select id="n-m"><option value="password">بريد إلكتروني وكلمة مرور</option><option value="google">Google</option></select><div id="n-pw"><label>كلمة المرور (6 أحرف على الأقل)</label><input id="n-pass" type="password" autocomplete="new-password"></div><p class="muted" id="n-hint" style="margin-top:8px"></p>`, "إضافة", async m => {
    const name = $("#n-name", m).value.trim(), email = $("#n-email", m).value.trim().toLowerCase(), phone = $("#n-phone", m).value.trim(), method = $("#n-m", m).value;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("أدخل الاسم وبريداً إلكترونياً صحيحاً");
    if (method === "password") {
      const pass = $("#n-pass", m).value; if (pass.length < 6) throw new Error("كلمة المرور 6 أحرف على الأقل");
      const sa = secAuth(), c = await createUserWithEmailAndPassword(sa, email, pass); await signOut(sa);
      await setDoc(doc(db, "users", c.user.uid), { uid: c.user.uid, email, fullName: name, phone, role: "AGENT", subscriptionStatus: "EXPIRED", loginMethod: "password", createdAt: serverTimestamp(), createdBy: ME.email });
    } else {
      await setDoc(doc(db, "agent_invites", await sha(email)), { email, fullName: name, phone, loginMethod: "google", status: "PENDING", createdAt: serverTimestamp(), createdBy: ME.email });
      loadInvites();
    }
    await log("AGENT_ADDED", `إضافة وكيل ${email} (${method === "google" ? "Google" : "بريد وكلمة مرور"})`, email);
    toast(method === "google" ? "تم تسجيل الدعوة، ويُنشأ حسابه عند أول دخول بـ Google" : "تم إنشاء حساب الوكيل");
  });
  const sync = () => { const g = $("#n-m", m).value === "google"; $("#n-pw", m).style.display = g ? "none" : ""; $("#n-hint", m).textContent = g ? "الوكيل يسجل الدخول بحساب Google بنفس هذا البريد، وينشأ حسابه تلقائياً عند أول دخول." : "سلّم الوكيل البريد وكلمة المرور ليدخل بهما من التطبيق."; };
  $("#n-m", m).onchange = sync; sync();
}

async function loadInvites() {
  const pane = $("[data-pane=agents]"); if (!pane) return; let box = $("#x-inv");
  if (!box) { box = document.createElement("div"); box.id = "x-inv"; box.className = "card"; box.style.marginTop = "14px"; pane.append(box); }
  try {
    const s = await getDocs(collection(db, "agent_invites"));
    box.innerHTML = `<div class="card-h"><h3>دعوات Google بانتظار أول دخول</h3></div><div class="card-b">` + (s.empty ? `<div class="empty">لا توجد دعوات.</div>` : s.docs.map(d => { const x = d.data(); return `<div class="log"><div style="flex:1"><b>${esc(x.fullName)}</b> <span class="muted mono">${esc(x.email)}</span></div>${has("agents_create") ? `<button class="btn sm bad" data-inv="${d.id}">حذف</button>` : ""}</div>`; }).join("")) + `</div>`;
  } catch { box.remove(); }
}

/* ========== تعديل وحذف وكيل ========== */
function editAgent(id) {
  const d = U.get(id); if (!d) return toast("بيانات الوكيل غير جاهزة", true);
  const susp = d.is_suspended === true || (d.subscriptionStatus || d.status) === "SUSPENDED";
  modal("تعديل الوكيل", `<label>الاسم</label><input id="e-name" value="${esc(d.fullName || "")}"><label>الهاتف</label><input id="e-phone" value="${esc(d.phone || "")}"><label>اسم المكتب / الشركة</label><input id="e-co" value="${esc(d.companyName || "")}"><label>البريد</label><input value="${esc(d.email || "")}" disabled>${has("agents_suspend") ? `<label class="permission-item" style="margin-top:12px"><input type="checkbox" id="e-on" ${susp ? "" : "checked"}><span>الحساب مفعّل</span></label>` : ""}`, "حفظ", async m => {
    const up = { fullName: $("#e-name", m).value.trim(), phone: $("#e-phone", m).value.trim(), companyName: $("#e-co", m).value.trim() }, on = $("#e-on", m);
    if (on && !on.checked && !susp) Object.assign(up, { is_suspended: true, status: "SUSPENDED", subscriptionStatus: "SUSPENDED" });
    if (on && on.checked && susp) { const live = (d.subscriptionEndsAt?.toDate?.() || new Date(0)) > new Date(), st = live ? "ACTIVE" : "EXPIRED"; Object.assign(up, { is_suspended: false, status: st, subscriptionStatus: st, is_subscribed: live }); }
    await updateDoc(doc(db, "users", id), up); await log("AGENT_EDITED", `تعديل بيانات الوكيل ${d.email}`, d.email); toast("تم حفظ التعديلات");
  });
}
async function deleteAgent(uid, email) {
  const hash = await sha(email), refs = new Map(), add = r => refs.set(r.path, r);
  for (const n of ["subscribers", "payment_records", "activity_logs", "backups", "sectors"]) (await getDocs(collection(db, "users", uid, n))).forEach(d => add(d.ref));
  for (const q of [query(collection(db, "payment_requests"), where("agentUid", "==", uid)), query(collection(db, "payment_requests"), where("email", "==", email.toLowerCase()))]) (await getDocs(q)).forEach(d => add(d.ref));
  [doc(db, "users", uid), doc(db, "users", hash), doc(db, "app_subscriptions", uid), doc(db, "app_subscriptions", hash), doc(db, "app_subscriptions", cleanId(email)), doc(db, "trial_registry", hash)].forEach(add);
  const all = [...refs.values()]; for (let i = 0; i < all.length; i += 400) { const b = writeBatch(db); all.slice(i, i + 400).forEach(r => b.delete(r)); await b.commit(); }
  await log("AGENT_DELETED", `حذف الوكيل ${email} مع كل بياناته`, email);
}

/* ========== المستخدمون الإداريون ========== */
function adminCard() {
  const pane = $("[data-pane=settings]"); if (!pane || $("#x-adm")) return;
  const c = document.createElement("div"); c.id = "x-adm"; c.className = "card"; c.style.marginTop = "16px";
  c.innerHTML = `<div class="card-h"><h3>المستخدمون الإداريون والصلاحيات</h3><button class="btn primary sm" id="x-addadm">+ مستخدم إداري</button></div><div class="card-b wrap" id="x-admlist"></div>`;
  pane.append(c); $("#x-addadm").onclick = () => adminModal(); renderAdmins();
}
async function renderAdmins() {
  const s = await getDocs(collection(db, "admin_users")); ADM = new Map(s.docs.map(d => [d.id, d.data()]));
  $("#x-admlist").innerHTML = s.empty ? `<div class="empty">لا يوجد مستخدمون إداريون بعد.</div>` : `<table><thead><tr><th>الاسم</th><th>البريد</th><th>الحالة</th><th>الصلاحيات</th><th></th></tr></thead><tbody>` + s.docs.map(d => { const x = d.data(), n = ALLK.filter(k => x.permissions?.[k]).length; return `<tr><td>${esc(x.displayName)}</td><td class="mono">${esc(x.email)}</td><td>${x.active === false ? `<span class="tag t-SUSPENDED">موقوف</span>` : `<span class="tag t-ACTIVE">فعّال</span>`}</td><td class="muted">${n} / ${ALLK.length}</td><td><div class="row-actions"><button class="btn sm" data-aedit="${d.id}">الصلاحيات</button><button class="btn sm" data-atog="${d.id}">${x.active === false ? "تفعيل" : "إيقاف"}</button><button class="btn sm bad" data-adel="${d.id}">حذف</button></div></td></tr>`; }).join("") + "</tbody></table>";
}
function adminModal(id) {
  const x = id ? ADM.get(id) : null;
  const head = x ? `<p class="muted">${esc(x.displayName)} · ${esc(x.email)}</p>` : `<label>الاسم</label><input id="a-name"><label>البريد الإلكتروني</label><input id="a-email" type="email"><label>كلمة المرور (6 أحرف على الأقل)</label><input id="a-pass" type="password" autocomplete="new-password">`;
  const m = modal(x ? "تعديل صلاحيات المستخدم الإداري" : "مستخدم إداري جديد", head + `<div style="margin-top:12px"><button class="btn sm" id="a-all">تحديد الكل</button> <button class="btn sm" id="a-none">إلغاء الكل</button></div>` + matrix(x?.permissions), x ? "حفظ" : "إنشاء", async m => {
    const permissions = readM(m);
    if (!Object.values(permissions).some(v => v === true)) throw new Error("اختر صلاحية واحدة على الأقل");
    if (x) { await updateDoc(doc(db, "admin_users", id), { permissions }); await log("ADMIN_UPDATED", `تعديل صلاحيات ${x.email}`, x.email); }
    else {
      const name = $("#a-name", m).value.trim(), email = $("#a-email", m).value.trim().toLowerCase(), pass = $("#a-pass", m).value;
      if (!name || !email || pass.length < 6) throw new Error("أكمل الاسم والبريد وكلمة المرور (6 أحرف على الأقل)");
      const sa = secAuth(), c = await createUserWithEmailAndPassword(sa, email, pass); await signOut(sa);
      await setDoc(doc(db, "admin_users", c.user.uid), { uid: c.user.uid, email, displayName: name, active: true, role: "ADMIN", permissions, createdAt: serverTimestamp(), createdBy: ME.email });
      await log("ADMIN_CREATED", `إنشاء مستخدم إداري ${email}`, email);
    }
    toast("تم الحفظ"); renderAdmins();
  });
  $("#a-all", m).onclick = () => $$("[data-pk]", m).forEach(c => (c.checked = true));
  $("#a-none", m).onclick = () => $$("[data-pk]", m).forEach(c => (c.checked = false));
}

/* ========== الأحداث ========== */
document.addEventListener("click", async e => {
  const t = e.target.closest("[data-xedit],[data-xdel],[data-inv],[data-aedit],[data-atog],[data-adel]"); if (!t) return;
  const D = t.dataset;
  try {
    if (D.xedit) editAgent(D.xedit);
    else if (D.xdel) {
      const typed = prompt(`حذف الوكيل نهائياً مع كل بياناته وطلباته.\nللتأكيد اكتب البريد:\n${D.email}`);
      if (typed === null) return; if (typed.trim().toLowerCase() !== D.email.toLowerCase()) return toast("البريد غير مطابق، تم الإلغاء", true);
      t.disabled = true; await deleteAgent(D.xdel, D.email); toast("تم حذف الوكيل وبياناته");
    }
    else if (D.inv) { await deleteDoc(doc(db, "agent_invites", D.inv)); loadInvites(); }
    else if (D.aedit) adminModal(D.aedit);
    else if (D.atog) { const x = ADM.get(D.atog); await updateDoc(doc(db, "admin_users", D.atog), { active: x.active === false }); await log("ADMIN_UPDATED", `${x.active === false ? "تفعيل" : "إيقاف"} المستخدم الإداري ${x.email}`, x.email); renderAdmins(); }
    else if (D.adel) { const x = ADM.get(D.adel); if (!confirm(`حذف المستخدم الإداري ${x.email}؟ سيفقد الدخول للوحة فوراً.`)) return; await deleteDoc(doc(db, "admin_users", D.adel)); await log("ADMIN_DELETED", `حذف المستخدم الإداري ${x.email}`, x.email); renderAdmins(); }
  } catch (err) { console.error(err); toast("تعذّر التنفيذ. تحقق من الصلاحيات.", true); t.disabled = false; }
});
