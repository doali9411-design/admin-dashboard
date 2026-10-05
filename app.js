/**
 * NetFlow Telecom Desktop Admin Dashboard
 * Powered by Firebase JS SDK v10 (Compat)
 */

// 1. Firebase Configuration
const firebaseConfig = {
  projectId: "project-f061b9fc-2e38-4f9b-86d",
  appId: "1:375448237527:web:605a801bb22deb312a0792",
  apiKey: "AIzaSyBMWq8i9SmpaKcMvMXq2gv-mTOdth6Vcxg",
  authDomain: "project-f061b9fc-2e38-4f9b-86d.firebaseapp.com",
  storageBucket: "project-f061b9fc-2e38-4f9b-86d.firebasestorage.app",
  messagingSenderId: "375448237527",
  measurementId: ""
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Admin Constant
const SUPER_ADMIN_EMAIL = "mantime50@gmail.com";

// In-Memory Realtime Data Stores
let currentAdminUser = null;
let pendingRequests = [];
let allAgents = [];
let auditLogs = [];
let systemBroadcasts = [];

// Helper: SHA-256 for Email Hash (matching Android CryptoUtils)
async function getEmailHash(email) {
  const clean = (email || '').trim().toLowerCase();
  const msgUint8 = new TextEncoder().encode(clean);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Format Timestamp Helper
function formatTimestamp(ts) {
  if (!ts) return "الآن";
  let date;
  if (ts.toDate) {
    date = ts.toDate();
  } else if (typeof ts === 'number') {
    date = new Date(ts);
  } else if (ts instanceof Date) {
    date = ts;
  } else {
    return "الآن";
  }
  return date.toLocaleString('ar-IQ', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Live Clock in Baghdad Time
setInterval(() => {
  const clockEl = document.getElementById('liveClock');
  if (clockEl) {
    clockEl.innerText = new Date().toLocaleTimeString('ar-IQ', { timeZone: 'Asia/Baghdad' });
  }
}, 1000);

// ==========================================
// AUTHENTICATION CONTROLLER
// ==========================================
auth.onAuthStateChanged((user) => {
  const loginSection = document.getElementById('loginSection');
  const dashboardSection = document.getElementById('dashboardSection');

  if (user) {
    const email = (user.email || '').trim().toLowerCase();
    if (email !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      auth.signOut();
      showLoginAlert("عذراً، هذا الحساب غير مصرح له بالدخول للوحة تحكم الإدارة.", "error");
      loginSection.classList.remove('hidden');
      dashboardSection.classList.add('hidden');
      return;
    }

    // Admin verified
    currentAdminUser = user;
    document.getElementById('sidebarAdminEmail').innerText = user.email;
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    // Start real-time listeners
    initRealtimeData();
  } else {
    currentAdminUser = null;
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
  }
});

async function handleLogin() {
  const emailInput = document.getElementById('adminEmailInput');
  const passwordInput = document.getElementById('adminPasswordInput');
  const btnText = document.getElementById('loginBtnText');
  const spinner = document.getElementById('loginSpinner');
  const loginBtn = document.getElementById('loginBtn');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showLoginAlert("يرجى ملء جميع الحقول المطلوبة.", "error");
    return;
  }

  // Pre-validate admin email
  if (email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
    showLoginAlert("عذراً، هذا الحساب غير مصرح له بالدخول للوحة تحكم الإدارة.", "error");
    return;
  }

  btnText.innerText = "جاري التحقق والمصادقة...";
  spinner.classList.remove('hidden');
  loginBtn.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    console.error("Login failed:", err);
    let msg = "فشل تسجيل الدخول. يرجى التحقق من صحة البريد وكلمة المرور.";
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      msg = "بيانات الدخول غير صحيحة، يرجى إعادة المحاولة.";
    } else if (err.code === 'auth/too-many-requests') {
      msg = "تم حظر المحاولات مؤقتاً بسبب كثرة المحاولات الخاطئة. انتظر قليلاً.";
    }
    showLoginAlert(msg, "error");
  } finally {
    btnText.innerText = "تسجيل الدخول إلى لوحة الإدارة";
    spinner.classList.add('hidden');
    loginBtn.disabled = false;
  }
}

function handleSignOut() {
  if (confirm("هل ترغب بالفعل في تسجيل الخروج من لوحة الإدارة المركزية؟")) {
    auth.signOut();
  }
}

function showLoginAlert(message, type = "error") {
  const box = document.getElementById('loginAlertBox');
  box.innerText = message;
  box.className = type === 'error'
    ? "p-4 rounded-xl text-sm border font-medium bg-rose-500/10 text-rose-400 border-rose-500/30"
    : "p-4 rounded-xl text-sm border font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  box.classList.remove('hidden');
}

// ==========================================
// NAVIGATION CONTROLLER
// ==========================================
const TAB_TITLES = {
  overview: { title: "نظرة عامة وإحصائيات المنظومة", subtitle: "مؤشرات الأداء المباشرة وسجلات التحقق" },
  pending: { title: "طلبات التحقق والتفعيل المعلقة", subtitle: "مطابقة الحوالات وتفعيل الاشتراكات فورياً" },
  agents: { title: "سجل الوكلاء والتراخيص", subtitle: "قائمة الوكلاء وتفاصيل التفعيل والاشتراكات" },
  audit: { title: "سجل الرقابة والأمان غير القابل للتعديل", subtitle: "أرشيف ثابت ومحمي لجميع الحركات والعمليات الإدارية" },
  broadcast: { title: "إرسال تعميم وإشعار جماعي", subtitle: "بث تنبيهات ملزمة تظهر في واجهات هواتف الوكلاء" },
  version: { title: "إدارة الإصدارات والتحديث الإلزامي", subtitle: "محرك التحكم السحابي بأدنى إصدار وفرض شاشة القفل على الأجهزة" },
};

function switchTab(tabId) {
  // Update nav buttons styling
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.className = "nav-btn w-full flex items-center justify-between px-4 py-3 rounded-xl transition text-slate-400 hover:text-white hover:bg-slate-800/60";
  });
  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.className = "nav-btn w-full flex items-center justify-between px-4 py-3 rounded-xl transition text-cyan-400 bg-cyan-950/60 border border-cyan-800/40";
  }

  // Update visible section
  ['overview', 'pending', 'agents', 'audit', 'broadcast', 'version'].forEach(t => {
    const sec = document.getElementById(`tab-${t}`);
    if (sec) {
      if (t === tabId) {
        sec.classList.remove('hidden');
      } else {
        sec.classList.add('hidden');
      }
    }
  });

  // Update Topbar
  if (TAB_TITLES[tabId]) {
    document.getElementById('topbarTitle').innerHTML = `<span>${TAB_TITLES[tabId].title}</span>`;
    document.getElementById('topbarSubtitle').innerText = TAB_TITLES[tabId].subtitle;
  }
}

// ==========================================
// REAL-TIME FIRESTORE DATA LISTENERS
// ==========================================
function initRealtimeData() {
  // 1. Payment Requests Listener (Pending)
  db.collection("payment_requests")
    .onSnapshot((snapshot) => {
      pendingRequests = [];
      snapshot.forEach(doc => {
        pendingRequests.push({ id: doc.id, ...doc.data() });
      });

      // Sort by creation time desc
      pendingRequests.sort((a, b) => {
        const timeA = a.created_at ? (a.created_at.toMillis ? a.created_at.toMillis() : a.created_at) : 0;
        const timeB = b.created_at ? (b.created_at.toMillis ? b.created_at.toMillis() : b.created_at) : 0;
        return timeB - timeA;
      });

      updatePendingBadge();
      renderPendingTable();
      renderOverviewPending();
      updateStats();
    }, (err) => console.error("Error listening to payment_requests:", err));

  // 2. Users / Agents Registry Listener
  db.collection("users")
    .onSnapshot((snapshot) => {
      allAgents = [];
      snapshot.forEach(doc => {
        allAgents.push({ id: doc.id, ...doc.data() });
      });
      renderAgentsTable();
      updateStats();
    }, (err) => console.error("Error listening to users:", err));

  // 3. Immutable Audit Logs Listener
  db.collection("audit_logs")
    .onSnapshot((snapshot) => {
      auditLogs = [];
      snapshot.forEach(doc => {
        auditLogs.push({ id: doc.id, ...doc.data() });
      });

      // Sort descending
      auditLogs.sort((a, b) => {
        const timeA = a.timestamp_ms || (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0);
        const timeB = b.timestamp_ms || (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0);
        return timeB - timeA;
      });

      renderAuditTable();
      renderOverviewAudit();
      updateStats();
    }, (err) => console.error("Error listening to audit_logs:", err));

  // 4. System Broadcasts Listener
  db.collection("system_broadcasts")
    .onSnapshot((snapshot) => {
      systemBroadcasts = [];
      snapshot.forEach(doc => {
        systemBroadcasts.push({ id: doc.id, ...doc.data() });
      });

      systemBroadcasts.sort((a, b) => {
        const timeA = a.created_at_ms || (a.created_at && a.created_at.toMillis ? a.created_at.toMillis() : 0);
        const timeB = b.created_at_ms || (b.created_at && b.created_at.toMillis ? b.created_at.toMillis() : 0);
        return timeB - timeA;
      });

      renderBroadcastsTable();
      updateStats();
    }, (err) => console.error("Error listening to system_broadcasts:", err));

  // 5. Version Control Listener
  db.collection("app_system").doc("version_control")
    .onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        updateVersionControlUI(data);
      }
    }, (err) => console.error("Error listening to version_control:", err));
}

function updatePendingBadge() {
  const pendingOnly = pendingRequests.filter(r => (r.status || 'PENDING').toUpperCase() === 'PENDING');
  const count = pendingOnly.length;
  const badge = document.getElementById('pendingBadgeCount');
  if (count > 0) {
    badge.innerText = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function updateStats() {
  const pendingOnly = pendingRequests.filter(r => (r.status || 'PENDING').toUpperCase() === 'PENDING');
  document.getElementById('statPendingCount').innerText = pendingOnly.length;
  document.getElementById('statAgentsCount').innerText = allAgents.length;
  document.getElementById('agentsBadgeCount').innerText = allAgents.length;
  document.getElementById('statAuditCount').innerText = auditLogs.length;
  document.getElementById('statBroadcastCount').innerText = systemBroadcasts.length;
}

// ==========================================
// PENDING REQUESTS ACTIONS & RENDERING
// ==========================================
function renderPendingTable() {
  const tbody = document.getElementById('pendingTableBody');
  const searchTerm = (document.getElementById('searchPendingInput').value || '').trim().toLowerCase();

  const filtered = pendingRequests.filter(req => {
    const isPending = (req.status || 'PENDING').toUpperCase() === 'PENDING';
    if (!isPending) return false;
    if (!searchTerm) return true;
    const email = (req.email || '').toLowerCase();
    const txId = (req.transaction_id || '').toLowerCase();
    return email.includes(searchTerm) || txId.includes(searchTerm);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-12 text-slate-400">
          <div class="text-3xl mb-2">🎉</div>
          <div>لا توجد طلبات تحقق معلقة حالياً، كل الحوالات مفعلة!</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(req => {
    const planName = getPlanArabicName(req.plan_type);
    const amount = Number(req.amount_iqd || 10000).toLocaleString('ar-IQ') + ' د.ع';
    const method = req.payment_method === 'ZAIN_CASH' ? 'زين كاش' : 'حساب QI';
    const txId = req.transaction_id || 'غير متوفر';
    const timeStr = formatTimestamp(req.created_at);
    const receiptBtn = req.receipt_url
      ? `<button onclick="viewReceipt('${encodeURIComponent(req.receipt_url)}')" class="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-semibold mt-1">
          <span>🖼️ معاينة الوصل</span>
         </button>`
      : '';
    const discountBadge = req.discount_code
      ? `<div class="mt-1"><span class="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">🏷️ كود: ${escapeHtml(req.discount_code)}</span></div>`
      : '';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-6 py-4">
          <div class="font-bold text-white text-xs">${escapeHtml(req.email || '')}</div>
          <div class="text-[10px] text-slate-500 font-mono mt-0.5">UID: ${escapeHtml(req.uid || 'N/A')}</div>
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            ${planName}
          </span>
          ${discountBadge}
        </td>
        <td class="px-6 py-4 font-bold text-emerald-400">${amount}</td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
            ${method}
          </span>
        </td>
        <td class="px-6 py-4">
          <div class="font-mono text-cyan-300 font-bold bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 inline-block">
            ${escapeHtml(txId)}
          </div>
          ${receiptBtn}
        </td>
        <td class="px-6 py-4 text-slate-400">${timeStr}</td>
        <td class="px-6 py-4 text-center">
          <div class="flex items-center justify-center gap-2">
            <button 
              onclick="approvePaymentRequest('${req.id}')"
              class="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold transition shadow-md shadow-emerald-600/30 flex items-center gap-1"
            >
              <span>✅ تفعيل فوري</span>
            </button>
            <button 
              onclick="openRejectModal('${req.id}', '${escapeHtml(req.email || '')}')"
              class="px-3 py-1.5 rounded-xl bg-rose-600/80 hover:bg-rose-600 active:scale-95 text-white font-bold transition flex items-center gap-1"
            >
              <span>❌ رفض</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderOverviewPending() {
  const container = document.getElementById('overviewPendingList');
  const pendingOnly = pendingRequests.filter(r => (r.status || 'PENDING').toUpperCase() === 'PENDING').slice(0, 3);

  if (pendingOnly.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-sm text-slate-500">لا توجد طلبات معلقة حالياً ✅</div>`;
    return;
  }

  container.innerHTML = pendingOnly.map(req => `
    <div class="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
      <div class="overflow-hidden pr-2">
        <div class="font-bold text-white text-xs truncate">${escapeHtml(req.email || '')}</div>
        <div class="text-[11px] text-amber-400 font-medium mt-0.5">${getPlanArabicName(req.plan_type)} • رقم الحوالة: ${escapeHtml(req.transaction_id || '')}</div>
      </div>
      <button 
        onclick="approvePaymentRequest('${req.id}')" 
        class="shrink-0 px-3 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition"
      >
        ✅ تفعيل
      </button>
    </div>
  `).join('');
}

// APPROVE ACTION
async function approvePaymentRequest(requestId) {
  const req = pendingRequests.find(r => r.id === requestId);
  if (!req) return;

  if (!confirm(`هل أنت متأكد من اعتماد وتفعيل اشتراك الوكيل (${req.email}) لباقة ${getPlanArabicName(req.plan_type)}؟`)) {
    return;
  }

  const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email : SUPER_ADMIN_EMAIL;
  const cleanEmail = (req.email || '').trim().toLowerCase();
  const planType = (req.plan_type || 'MONTHLY').toUpperCase();

  let durationDays = 30;
  if (planType === 'ANNUAL') durationDays = 365;
  else if (planType === 'SEMI_ANNUAL') durationDays = 180;

  const nowMs = Date.now();
  const expiryMs = nowMs + (durationDays * 24 * 3600 * 1000);
  const expiryDate = new Date(expiryMs);

  try {
    const emailHash = await getEmailHash(cleanEmail);

    // 1. Mark request as APPROVED
    await db.collection("payment_requests").document(requestId).set({
      status: "APPROVED",
      approved_at: firebase.firestore.FieldValue.serverTimestamp(),
      approved_by: adminEmail
    }, { merge: true });

    // 2. Prepare user subscription data
    const subData = {
      email: cleanEmail,
      is_subscribed: true,
      subscription_expiry_timestamp: firebase.firestore.Timestamp.fromDate(expiryDate),
      subscription_end_timestamp: firebase.firestore.Timestamp.fromDate(expiryDate),
      subscriptionExpiryAt: expiryMs,
      status: "ACTIVE",
      plan_type: planType,
      planType: planType,
      activated_at: firebase.firestore.FieldValue.serverTimestamp(),
      activated_by: adminEmail,
      duration_days: durationDays
    };

    // Update in users & app_subscriptions
    await db.collection("users").document(emailHash).set(subData, { merge: true });
    if (req.uid) {
      await db.collection("users").document(req.uid).set(subData, { merge: true });
      await db.collection("app_subscriptions").document(req.uid).set(subData, { merge: true });
    }
    await db.collection("app_subscriptions").document(emailHash).set(subData, { merge: true });

    // 3. Write Immutable Audit Log
    const logDocRef = db.collection("audit_logs").doc();
    await logDocRef.set({
      log_id: logDocRef.id,
      action_type: "SUBSCRIPTION_ACTIVATED",
      performed_by_email: adminEmail,
      target_agent_email: cleanEmail,
      target_agent_uid: req.uid || "",
      details: `اعتماد وتفعيل اشتراك باقة ${planType} لمدة ${durationDays} يوم بمبلغ ${req.amount_iqd || '10,000'} د.ع (رقم المعاملة: ${req.transaction_id || 'N/A'})`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_ms: nowMs
    });

    alert(`تم تفعيل اشتراك الوكيل (${cleanEmail}) بنجاح وتوثيق العملية في سجل الرقابة.`);
  } catch (err) {
    console.error("Failed to approve request:", err);
    alert("حدث خطأ أثناء اعتماد الطلب: " + err.message);
  }
}

// REJECT ACTION
let activeRejectRequestId = null;

function openRejectModal(requestId, agentEmail) {
  activeRejectRequestId = requestId;
  document.getElementById('rejectModalDesc').innerText = `هل أنت متأكد من رفض طلب تفعيل الوكيل: ${agentEmail}؟`;
  document.getElementById('rejectReasonInput').value = '';
  document.getElementById('rejectModal').classList.remove('hidden');
}

function closeRejectModal() {
  activeRejectRequestId = null;
  document.getElementById('rejectModal').classList.add('hidden');
}

async function confirmRejectAction() {
  if (!activeRejectRequestId) return;
  const requestId = activeRejectRequestId;
  const reason = document.getElementById('rejectReasonInput').value.trim() || 'رقم الحوالة غير مطابق أو لم يتم استلام المبلغ في المحفظة';
  const req = pendingRequests.find(r => r.id === requestId);
  const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email : SUPER_ADMIN_EMAIL;

  try {
    await db.collection("payment_requests").document(requestId).set({
      status: "REJECTED",
      reject_reason: reason,
      rejected_at: firebase.firestore.FieldValue.serverTimestamp(),
      rejected_by: adminEmail
    }, { merge: true });

    // Record in Immutable Audit Log
    const logDocRef = db.collection("audit_logs").doc();
    await logDocRef.set({
      log_id: logDocRef.id,
      action_type: "PAYMENT_REJECTED",
      performed_by_email: adminEmail,
      target_agent_email: (req ? req.email : "").trim().toLowerCase(),
      target_agent_uid: (req ? req.uid : "") || "",
      details: `رفض طلب تفعيل الاشتراك: ${reason} (رقم المعاملة: ${req ? req.transaction_id : 'N/A'})`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_ms: Date.now()
    });

    closeRejectModal();
    alert("تم رفض الطلب بنجاح وتوثيق السبب في السجل الرقابي.");
  } catch (err) {
    console.error("Failed to reject request:", err);
    alert("حدث خطأ أثناء رفض الطلب: " + err.message);
  }
}

function viewReceipt(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  document.getElementById('receiptModalImg').src = url;
  document.getElementById('receiptModal').classList.remove('hidden');
}

function closeReceiptModal() {
  document.getElementById('receiptModal').classList.add('hidden');
}

// ==========================================
// AGENTS REGISTRY RENDERING
// ==========================================
function renderAgentsTable() {
  const tbody = document.getElementById('agentsTableBody');
  const searchTerm = (document.getElementById('searchAgentsInput').value || '').trim().toLowerCase();

  const filtered = allAgents.filter(ag => {
    if (!searchTerm) return true;
    const email = (ag.email || '').toLowerCase();
    const name = (ag.fullName || ag.full_name || '').toLowerCase();
    return email.includes(searchTerm) || name.includes(searchTerm);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-12 text-slate-500">
          لا يوجد وكلاء مسجلون يطابقون البحث.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(ag => {
    const email = ag.email || 'وكيل بدون بريد';
    const isSubscribed = ag.is_subscribed === true;
    const isSuspended = ag.is_suspended === true || ag.isSuspended === true;
    
    let statusBadge = isSubscribed
      ? `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">🟢 نشط ومفعل</span>`
      : `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">🔴 غير مفعل / منتهي</span>`;
    
    if (isSuspended) {
      statusBadge = `<span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">🚫 مجمد وموقوف</span>`;
    }

    const planName = getPlanArabicName(ag.plan_type || ag.planType);
    let expiryStr = "غير محدد";
    if (ag.subscription_expiry_timestamp) {
      expiryStr = formatTimestamp(ag.subscription_expiry_timestamp);
    } else if (ag.subscriptionExpiryAt) {
      expiryStr = formatTimestamp(new Date(ag.subscriptionExpiryAt));
    }

    const subCount = ag.subscriberCount || ag.subscribers_count || 0;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-6 py-4">
          <div class="font-bold text-white text-xs">${escapeHtml(email)}</div>
          <div class="text-[10px] text-slate-400">${escapeHtml(ag.fullName || ag.companyName || 'وكيل شبكة')}</div>
        </td>
        <td class="px-6 py-4">${statusBadge}</td>
        <td class="px-6 py-4 font-semibold text-slate-300">${planName}</td>
        <td class="px-6 py-4 font-mono text-slate-400">${expiryStr}</td>
        <td class="px-6 py-4 font-bold text-cyan-400">${subCount} مشترك</td>
        <td class="px-6 py-4 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button 
              onclick="grantDirectAgentSubscription('${escapeHtml(email)}', '${ag.id}')" 
              class="px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-500/40 transition"
              title="تمديد الاشتراك بالأيام"
            >
              تمديد ⚡
            </button>
            <button 
              onclick="toggleAgentSuspension('${escapeHtml(email)}', '${ag.id}', ${isSuspended})" 
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition ${isSuspended ? 'bg-emerald-600/30 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40' : 'bg-rose-600/30 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40'}"
              title="${isSuspended ? 'إلغاء التجميد وإعادة الحساب للعمل' : 'تجميد وقفل الحساب على هاتف الوكيل فوراً'}"
            >
              ${isSuspended ? '🟢 فك التجميد' : '🚫 تجميد'}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function grantDirectAgentSubscription(email, uid) {
  const daysStr = prompt(`تمديد ترخيص الوكيل (${email})\nأدخل عدد الأيام المطلوب إضافتها (مثال: 30):`, "30");
  if (!daysStr) return;
  const days = parseInt(daysStr, 10);
  if (isNaN(days) || days <= 0) {
    alert("يرجى إدخال عدد أيام صحيح.");
    return;
  }

  const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email : SUPER_ADMIN_EMAIL;
  const nowMs = Date.now();
  const expiryMs = nowMs + (days * 24 * 3600 * 1000);
  const expiryDate = new Date(expiryMs);

  try {
    const emailHash = await getEmailHash(email);
    const subData = {
      email: email,
      is_subscribed: true,
      subscription_expiry_timestamp: firebase.firestore.Timestamp.fromDate(expiryDate),
      subscription_end_timestamp: firebase.firestore.Timestamp.fromDate(expiryDate),
      subscriptionExpiryAt: expiryMs,
      status: "ACTIVE",
      plan_type: days >= 365 ? "ANNUAL" : (days >= 180 ? "SEMI_ANNUAL" : "MONTHLY"),
      activated_at: firebase.firestore.FieldValue.serverTimestamp(),
      activated_by: adminEmail,
      duration_days: days
    };

    await db.collection("users").document(emailHash).set(subData, { merge: true });
    if (uid) {
      await db.collection("users").document(uid).set(subData, { merge: true });
      await db.collection("app_subscriptions").document(uid).set(subData, { merge: true });
    }
    await db.collection("app_subscriptions").document(emailHash).set(subData, { merge: true });

    // Record in Immutable Audit Log
    const logDocRef = db.collection("audit_logs").doc();
    await logDocRef.set({
      log_id: logDocRef.id,
      action_type: "PLAN_EXTENDED",
      performed_by_email: adminEmail,
      target_agent_email: email,
      target_agent_uid: uid || "",
      details: `تمديد اشتراك الوكيل يدوياً من لوحة الويب لمدة ${days} يوم`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_ms: nowMs
    });

    alert(`تم تمديد اشتراك الوكيل (${email}) بنجاح لمدة ${days} يوم.`);
  } catch (err) {
    console.error("Failed to grant subscription:", err);
    alert("تعذر تمديد الاشتراك: " + err.message);
  }
}

async function toggleAgentSuspension(email, uid, currentSuspendedState) {
  const newSuspendedState = !currentSuspendedState;
  const actionText = newSuspendedState ? "تجميد وقفل" : "إلغاء تجميد وتنشيط";
  let reason = "بواسطة الإدارة المركزية";
  if (newSuspendedState) {
    const inputReason = prompt(`هل تريد تأكيد ${actionText} حساب الوكيل (${email})؟\nسيتوقف التطبيق على هاتفه فوراً.\nأدخل سبب الإيقاف:`, "مراجعة الحساب / تأخير سداد");
    if (inputReason === null) return;
    if (inputReason.trim()) reason = inputReason.trim();
  } else {
    if (!confirm(`هل تريد تأكيد ${actionText} حساب الوكيل (${email}) وإعادته للعمل فوراً؟`)) return;
  }

  const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email : SUPER_ADMIN_EMAIL;
  try {
    const emailHash = await getEmailHash(email);
    const updateData = {
      is_suspended: newSuspendedState,
      suspended_reason: reason,
      status: newSuspendedState ? "SUSPENDED" : "ACTIVE",
      suspended_by: adminEmail,
      suspended_updated_at: firebase.firestore.FieldValue.serverTimestamp()
    };

    await db.collection("users").document(emailHash).set(updateData, { merge: true });
    if (uid) {
      await db.collection("users").document(uid).set(updateData, { merge: true });
      await db.collection("app_subscriptions").document(uid).set(updateData, { merge: true });
    }
    await db.collection("app_subscriptions").document(emailHash).set(updateData, { merge: true });
    await db.collection("trial_registry").document(emailHash).set({
      is_suspended: newSuspendedState,
      is_banned: newSuspendedState
    }, { merge: true });

    // Record in Immutable Audit Log
    const logDocRef = db.collection("audit_logs").doc();
    await logDocRef.set({
      log_id: logDocRef.id,
      action_type: newSuspendedState ? "AGENT_SUSPENDED" : "AGENT_UNSUSPENDED",
      performed_by_email: adminEmail,
      target_agent_email: email,
      target_agent_uid: uid || "",
      details: `${newSuspendedState ? 'تجميد حساب الوكيل' : 'فك تجميد حساب الوكيل'}: ${reason}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_ms: Date.now()
    });

    alert(`تم ${actionText} حساب الوكيل بنجاح! ستظهر النتيجة فوراً على هاتفه.`);
  } catch (err) {
    console.error("Failed to toggle agent suspension:", err);
    alert("حدث خطأ أثناء تعديل حالة الحساب: " + err.message);
  }
}

// ==========================================
// IMMUTABLE AUDIT LOG RENDERING
// ==========================================
function renderAuditTable() {
  const tbody = document.getElementById('auditTableBody');
  const actionFilter = document.getElementById('auditActionFilter').value;

  const filtered = auditLogs.filter(log => {
    if (actionFilter === 'ALL') return true;
    return (log.action_type || '').toUpperCase() === actionFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-12 text-slate-500">
          لا توجد سجلات رقابة مسجلة تطابق التصفية.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(log => {
    const actionBadge = getAuditActionBadge(log.action_type);
    const timeStr = formatTimestamp(log.timestamp || log.timestamp_ms);

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-6 py-4 font-mono text-[11px] text-slate-400">
          ${escapeHtml((log.log_id || log.id || '').substring(0, 12))}...
        </td>
        <td class="px-6 py-4">${actionBadge}</td>
        <td class="px-6 py-4 text-cyan-400 font-semibold">${escapeHtml(log.performed_by_email || 'الإدارة')}</td>
        <td class="px-6 py-4 text-slate-300 font-medium">${escapeHtml(log.target_agent_email || 'الكل')}</td>
        <td class="px-6 py-4 text-slate-300 max-w-md">${escapeHtml(log.details || '')}</td>
        <td class="px-6 py-4 text-slate-400 font-mono">${timeStr}</td>
      </tr>
    `;
  }).join('');
}

function renderOverviewAudit() {
  const container = document.getElementById('overviewAuditList');
  const recent = auditLogs.slice(0, 4);

  if (recent.length === 0) {
    container.innerHTML = `<div class="text-center py-8 text-sm text-slate-500">لا توجد عمليات مسجلة حديثاً</div>`;
    return;
  }

  container.innerHTML = recent.map(log => `
    <div class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
      <div class="overflow-hidden pr-2">
        <div class="flex items-center gap-2">
          ${getAuditActionBadge(log.action_type)}
          <span class="text-xs text-slate-300 truncate">${escapeHtml(log.target_agent_email || '')}</span>
        </div>
        <p class="text-[11px] text-slate-400 mt-1 truncate">${escapeHtml(log.details || '')}</p>
      </div>
      <span class="text-[10px] text-slate-500 font-mono shrink-0">${formatTimestamp(log.timestamp || log.timestamp_ms)}</span>
    </div>
  `).join('');
}

function getAuditActionBadge(actionType) {
  switch ((actionType || '').toUpperCase()) {
    case 'SUBSCRIPTION_ACTIVATED':
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">تفعيل اشتراك</span>`;
    case 'PLAN_EXTENDED':
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">تمديد باقة</span>`;
    case 'PAYMENT_REJECTED':
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30">رفض طلب</span>`;
    case 'AGENT_REGISTERED':
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">تسجيل وكيل</span>`;
    case 'ACCOUNT_SUSPENDED':
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">تجميد حساب</span>`;
    case 'SUBSCRIBER_UPDATED':
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">تحديث مشترك / نظام</span>`;
    default:
      return `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-400">${escapeHtml(actionType || 'عملية')}</span>`;
  }
}

// ==========================================
// SYSTEM BROADCASTS SENDER & ARCHIVE
// ==========================================
async function sendBroadcastMessage() {
  const titleInput = document.getElementById('broadcastTitleInput');
  const messageInput = document.getElementById('broadcastMessageInput');
  const priorityInput = document.getElementById('broadcastPriorityInput');
  const alertBox = document.getElementById('broadcastAlertBox');
  const sendBtn = document.getElementById('sendBroadcastBtn');

  const title = titleInput.value.trim();
  const message = messageInput.value.trim();
  const priority = priorityInput.value;

  if (!title || !message) {
    alertBox.innerText = "يرجى كتابة عنوان الإشعار ونصه بالكامل قبل البث.";
    alertBox.className = "p-3 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30";
    alertBox.classList.remove('hidden');
    return;
  }

  sendBtn.disabled = true;
  sendBtn.innerHTML = `<span>جاري بث الإشعار إلى Firebase...</span>`;

  const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email : SUPER_ADMIN_EMAIL;
  const nowMs = Date.now();

  try {
    const docRef = db.collection("system_broadcasts").doc();
    const broadcastId = docRef.id;

    await docRef.set({
      broadcast_id: broadcastId,
      title: title,
      message: message,
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      created_at_ms: nowMs,
      is_active: true,
      priority: priority,
      created_by: adminEmail
    });

    // Write Immutable Audit Log
    const logDocRef = db.collection("audit_logs").doc();
    await logDocRef.set({
      log_id: logDocRef.id,
      action_type: "SUBSCRIBER_UPDATED",
      performed_by_email: adminEmail,
      target_agent_email: "ALL_AGENTS",
      target_agent_uid: "GLOBAL_BROADCAST",
      details: `بث تعميم وإشعار جماعي (${priority}): ${title}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_ms: nowMs
    });

    alertBox.innerText = "تم بث الإشعار بنجاح! سيظهر فوراً كنافذة تنبيه منبثقة داخل هواتف جميع الوكلاء.";
    alertBox.className = "p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
    alertBox.classList.remove('hidden');

    titleInput.value = '';
    messageInput.value = '';
  } catch (err) {
    console.error("Failed to broadcast message:", err);
    alertBox.innerText = "تعذر إرسال التعميم: " + err.message;
    alertBox.className = "p-3 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30";
    alertBox.classList.remove('hidden');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<span>📢 بث الإشعار فوراً لجميع الهواتف</span>`;
  }
}

function renderBroadcastsTable() {
  const tbody = document.getElementById('broadcastsTableBody');

  if (systemBroadcasts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-8 text-slate-500">
          لم يتم إرسال أي تعميمات سابقة.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = systemBroadcasts.map(bc => {
    const isHigh = (bc.priority || '').toUpperCase() === 'HIGH';
    const priBadge = isHigh
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">طارئ / عالي</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400">عادي</span>`;

    const statusBadge = bc.is_active !== false
      ? `<span class="text-emerald-400 text-xs font-bold">نشط بالهواتف</span>`
      : `<span class="text-slate-500 text-xs font-bold">مؤرشف</span>`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="px-4 py-3 font-bold text-white">${escapeHtml(bc.title || '')}</td>
        <td class="px-4 py-3 text-slate-300 max-w-xs truncate">${escapeHtml(bc.message || '')}</td>
        <td class="px-4 py-3">${priBadge}</td>
        <td class="px-4 py-3 text-slate-400 font-mono text-[11px]">${formatTimestamp(bc.created_at || bc.created_at_ms)}</td>
        <td class="px-4 py-3">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// Helpers
function getPlanArabicName(planType) {
  switch ((planType || '').toUpperCase()) {
    case 'ANNUAL':
      return 'الاشتراك السنوي (50,000 د.ع)';
    case 'SEMI_ANNUAL':
      return 'اشتراك 6 أشهر (25,000 د.ع)';
    default:
      return 'الاشتراك الشهري (10,000 د.ع)';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// VERSION CONTROL CONTROLLER
// ==========================================
function updateVersionControlUI(data) {
  if (!data) return;
  const name = data.latest_version_name || "1.0.1";
  const code = data.latest_version_code || 2;
  const minCode = data.min_required_version_code || 2;
  const apkUrl = data.apk_download_url || "";
  const notes = data.release_notes || "";
  const isForce = data.is_force_update === true;

  const nameInput = document.getElementById('versionNameInput');
  const codeInput = document.getElementById('versionCodeInput');
  const minCodeInput = document.getElementById('minVersionCodeInput');
  const apkUrlInput = document.getElementById('apkUrlInput');
  const notesInput = document.getElementById('releaseNotesInput');
  const isForceCheckbox = document.getElementById('isForceUpdateCheckbox');

  // Fill inputs if not actively typing
  if (nameInput && document.activeElement !== nameInput) nameInput.value = name;
  if (codeInput && document.activeElement !== codeInput) codeInput.value = code;
  if (minCodeInput && document.activeElement !== minCodeInput) minCodeInput.value = minCode;
  if (apkUrlInput && document.activeElement !== apkUrlInput) apkUrlInput.value = apkUrl;
  if (notesInput && document.activeElement !== notesInput) notesInput.value = notes;
  if (isForceCheckbox && document.activeElement !== isForceCheckbox) isForceCheckbox.checked = isForce;

  // Update Preview Badges
  const prevName = document.getElementById('previewLatestVersion');
  const prevCode = document.getElementById('previewLatestCode');
  const prevMin = document.getElementById('previewMinCode');
  const prevForce = document.getElementById('previewForceStatus');
  const badgeCode = document.getElementById('versionBadgeCode');

  if (prevName) prevName.innerText = `v${name}`;
  if (prevCode) prevCode.innerText = code;
  if (prevMin) prevMin.innerText = minCode;
  if (badgeCode) badgeCode.innerText = `v${name}`;
  if (prevForce) {
    prevForce.innerText = isForce ? "نشط (إلزامي 🚨)" : "اختياري";
    prevForce.className = isForce ? "font-bold text-rose-400" : "font-bold text-emerald-400";
  }
}

async function saveVersionControlConfig() {
  const name = document.getElementById('versionNameInput').value.trim() || "1.0.1";
  const code = parseInt(document.getElementById('versionCodeInput').value, 10) || 2;
  const minCode = parseInt(document.getElementById('minVersionCodeInput').value, 10) || 2;
  const apkUrl = document.getElementById('apkUrlInput').value.trim();
  const notes = document.getElementById('releaseNotesInput').value.trim();
  const isForce = document.getElementById('isForceUpdateCheckbox').checked;
  const btn = document.getElementById('saveVersionBtn');
  const alertBox = document.getElementById('versionAlertBox');

  btn.disabled = true;
  btn.innerHTML = `<span>جاري حفظ ونشر إعدادات الإصدار...</span>`;

  const adminEmail = (currentAdminUser && currentAdminUser.email) ? currentAdminUser.email : SUPER_ADMIN_EMAIL;
  const nowMs = Date.now();

  try {
    await db.collection("app_system").doc("version_control").set({
      latest_version_code: code,
      latest_version_name: name,
      min_required_version_code: minCode,
      apk_download_url: apkUrl,
      release_notes: notes,
      is_force_update: isForce,
      updated_at: firebase.firestore.FieldValue.serverTimestamp(),
      updated_at_ms: nowMs,
      updated_by: adminEmail
    }, { merge: true });

    // Record in Immutable Audit Log
    const logDocRef = db.collection("audit_logs").doc();
    await logDocRef.set({
      log_id: logDocRef.id,
      action_type: "SUBSCRIBER_UPDATED",
      performed_by_email: adminEmail,
      target_agent_email: "ALL_USERS",
      target_agent_uid: "VERSION_CONTROL",
      details: `تحديث إصدار المنظومة إلى ${name} (كود ${code}) - إلزامي: ${isForce}`,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      timestamp_ms: nowMs
    });

    alertBox.innerText = `تم تحديث ونشر إعدادات الإصدار بنجاح! الأجهزة التي تحمل كود أقل من (${minCode}) ستدخل في شاشة القفل الإجباري فورياً.`;
    alertBox.className = "p-3 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30";
    alertBox.classList.remove('hidden');
  } catch (err) {
    console.error("Failed to update version control:", err);
    alertBox.innerText = "تعذر تحديث إعدادات الإصدار: " + err.message;
    alertBox.className = "p-3 rounded-xl text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30";
    alertBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>💾 حفظ وتطبيق إعدادات الإصدار فورياً</span>`;
  }
}

