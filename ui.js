/* NetFlow UI layer: مظهر (ليلي/نهاري/تلقائي) + لغة (عربي/English). لا يلمس منطق Firebase. */
(function(){
const $=(s,r=document)=>r.querySelector(s);
const get=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const put=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};

const EN={
  "نوع الحساب":"Account type","المتبقي":"Remaining","ينتهي في":"Ends on","آخر دخول":"Last login","تجريبي":"Trial","مشترك":"Subscriber","اشتراك منتهي":"Subscription ended","انتهت التجربة":"Trial ended",
"لوحة الإدارة المركزية":"Central Control Panel","تسجيل دخول المشرفين والمدراء":"Admin & manager sign-in",
"الدخول المباشر بحساب Google":"Continue with Google","أو بالبريد وكلمة المرور":"or with email & password",
"البريد الإلكتروني":"Email","كلمة المرور":"Password","دخول المشرف":"Sign in",
"البريد الإلكتروني أو كلمة المرور غير صحيحة.":"Incorrect email or password.","هذا الحساب ليس له صلاحيات إدارية.":"This account has no admin permissions.",
"إدارة المنظومة":"System Management","نظرة عامة":"Overview","طلبات التفعيل":"Activation requests","الوكلاء":"Agents",
"المشرفون والصلاحيات":"Admins & permissions","الإشعارات":"Notifications","التعميمات":"Broadcasts","سجل العمليات":"Audit log",
"الإصدارات والتحديث":"Versions & updates","تسجيل الخروج":"Sign out","مدير النظام":"System admin",
"لوحة القيادة والمتابعة اللحظية":"Live dashboard & monitoring","مطابقة الحوالات والموافقة أو الرفض":"Match transfers, approve or reject",
"الحسابات المسجّلة وحالة اشتراكاتها وتجديدها":"Registered accounts, subscriptions & renewals",
"إدارة المستخدمين الإداريين ومنح الصلاحيات المستقلة الدقيقة":"Manage admin users and fine-grained permissions",
"إرسال إشعارات مباشرة إلى هواتف الوكلاء":"Send notifications straight to agents' phones",
"توثيق كامل لكافة الإجراءات والقرارات الإدارية":"Complete record of all admin actions",
"التحكم في تحديثات التطبيق وفرض التحديثات":"Control app updates and force upgrades",
"متصل":"Online","انقطع الاتصال":"Disconnected",
"طلبات بانتظار القرار":"Pending requests","إجمالي الوكلاء":"Total agents","اشتراكات فعّالة":"Active subscriptions","الإيرادات التقديرية":"Estimated revenue",
"طلبات تحتاج قراراً":"Requests needing a decision","عرض الكل":"View all","آخر العمليات الإدارية":"Latest admin actions","السجل الكامل":"Full log",
"الوكيل":"Agent","الباقة":"Plan","المبلغ":"Amount","الحوالة":"Transfer","إجراء":"Action","طريقة الدفع":"Method","رقم الحوالة":"Transfer no.",
"الوصل":"Receipt","الوقت":"Time","الحالة":"Status","الإجراءات":"Actions","حالة الحساب":"Account status","انتهاء الاشتراك":"Expires",
"تاريخ التسجيل":"Registered","المشرف":"Admin","المسمى الوظيفي":"Job title","الصلاحيات الممنوحة":"Permissions","تاريخ الإضافة":"Added",
"التفاصيل":"Details","المسؤول":"By",
"قبول":"Approve","رفض":"Reject","✅ قبول":"✅ Approve","❌ رفض":"❌ Reject","معاينة 📎":"Preview 📎","بدون":"None",
"تمديد 30 يوماً":"Extend 30 days","تجميد":"Suspend","تجميد الحساب":"Suspend","رفع التجميد":"Unsuspend","✏️ تعديل":"✏️ Edit",
"🗑️ حذف":"🗑️ Delete","تعطيل":"Disable","تفعيل":"Enable","✏️ تعديل الصلاحيات":"✏️ Edit permissions","نشط":"Active","موقوف":"Paused",
"بانتظار القرار":"Pending","مقبول":"Approved","مرفوض":"Rejected","فعّال":"Active","منتهي":"Expired","مجمّد":"Suspended",
"مدير":"Admin","وكيل":"Agent","عادي":"Normal","عاجل":"Urgent","مقبولة":"Approved","مرفوضة":"Rejected","الكل":"All",
"بحث برقم الحوالة أو البريد":"Search by transfer no. or email","بحث بالبريد الإلكتروني أو الاسم":"Search by email or name",
"بحث باسم المشرف أو بريده...":"Search admin name or email...","+ تسجيل وكيل جديد":"+ Register agent","+ إضافة مشرف إداري جديد":"+ Add admin",
"قائمة المشرفين الإداريين وصلاحياتهم":"Admins and their permissions",
"لا توجد طلبات مطابقة":"No matching requests","لا يوجد وكلاء مطابقون":"No matching agents","لا توجد سجلات مطابقة":"No matching records",
"لا توجد تعميمات سابقة":"No previous broadcasts","لا توجد عمليات مسجلة بعد":"No actions recorded yet","لا توجد طلبات معلقة حالياً 🎉":"No pending requests 🎉",
"التعميمات المرسلة":"Sent broadcasts","تعميم جديد":"New broadcast","العنوان":"Title","الأولوية":"Priority","نص التعميم":"Message",
"إرسال لكل الهواتف":"Send to all phones","عالي الأهمية / طوارئ":"High / Emergency","كل الإجراءات":"All actions",
"إعدادات الإصدار":"Release settings","الحالة الحالية":"Current status","اسم الإصدار الأحدث":"Latest version name",
"كود الإصدار الأحدث":"Latest version code","الحد الأدنى المسموح (كود)":"Minimum allowed (code)",
"رابط التحميل (APK أو المتجر)":"Download link (APK or store)","ما الجديد في هذا الإصدار":"What's new","فرض التحديث":"Force update","حفظ وتطبيق":"Save & apply",
"رفض الطلب":"Reject request","تأكيد الرفض":"Confirm rejection","إلغاء":"Cancel","إغلاق":"Close","حفظ التعديلات":"Save changes",
"تعديل بيانات الوكيل":"Edit agent","الاسم":"Name","رقم الهاتف":"Phone","حفظ المشرف":"Save admin","وصل الحوالة المرفق":"Attached receipt",
"تم حفظ التعديلات":"Changes saved","تم حذف التعميم":"Broadcast deleted","تم حذف الوكيل":"Agent deleted",
"تم رفض الطلب بنجاح":"Request rejected","تم إرسال التعميم بنجاح":"Broadcast sent","جاري التنفيذ...":"Working..."
};
const RULES=[[/^([\d,.٠-٩٬]+) د\.ع$/,"$1 IQD"],[/^(\d+) مشرف مسجل$/,"$1 admins registered"],[/^(\d+) مشرف$/,"$1 admins"]];
[/^(≈ )?(\d+) يوم$/,"$1$2 days"],
  const tr=s=>{const t=s.trim();if(EN[t])return EN[t];for(const [r,x] of RULES)if(r.test(t))return t.replace(r,x);return null;};

let theme=get("nf-theme")||"auto",lang=get("nf-lang")||"ar";
const mq=matchMedia("(prefers-color-scheme: dark)");

function fix(n){
  if(!n.nodeValue||!n.nodeValue.trim())return;
  if(n.parentNode&&/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName))return;
  if(lang==="ar"){if(n.__ar!==undefined){n.nodeValue=n.__ar;delete n.__ar;}return;}
  if(n.__ar!==undefined)return;
  const r=tr(n.nodeValue);
  if(r){const m=n.nodeValue.match(/^(\s*)[\s\S]*?(\s*)$/);n.__ar=n.nodeValue;n.nodeValue=m[1]+r+m[2];}
}
function walk(root){
  const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),list=[];let n;
  while((n=w.nextNode()))list.push(n);
  list.forEach(fix);
}
function attrs(){
  document.querySelectorAll("[placeholder]").forEach(el=>{
    if(lang==="ar"){if(el.dataset.arPh){el.placeholder=el.dataset.arPh;delete el.dataset.arPh;}}
    else if(!el.dataset.arPh&&EN[el.placeholder]){el.dataset.arPh=el.placeholder;el.placeholder=EN[el.placeholder];}
  });
}

const obs=new MutationObserver(ms=>{
  if(lang!=="en")return;
  obs.disconnect();
  try{ms.forEach(m=>{
    if(m.type==="characterData")fix(m.target);
    m.addedNodes.forEach(a=>{if(a.nodeType===3)fix(a);else if(a.nodeType===1)walk(a);});
  });attrs();}finally{obs.observe(document.body,{childList:true,subtree:true,characterData:true});}
});

function applyTheme(){
  document.documentElement.dataset.theme=theme==="auto"?(mq.matches?"dark":"light"):theme;
  document.querySelectorAll("#seg-th button").forEach(b=>b.classList.toggle("on",b.dataset.t===theme));
}
function applyLang(){
  const d=document.documentElement;
  d.lang=lang;d.dir=lang==="ar"?"rtl":"ltr";
  document.title=lang==="ar"?"NetFlow Control Hub | إدارة المنظومة":"NetFlow Control Hub | System Management";
  obs.disconnect();walk(document.body);attrs();
  obs.observe(document.body,{childList:true,subtree:true,characterData:true});
  document.querySelectorAll("#seg-lang button").forEach(b=>b.classList.toggle("on",b.dataset.l===lang));
}

/* أزرار التحكم */
const ctl=document.createElement("div");
ctl.id="ctl";ctl.className="float";
ctl.innerHTML='<div class="seg" id="seg-lang"><button data-l="ar">العربية</button><button data-l="en">EN</button></div>'+
'<div class="seg" id="seg-th"><button data-t="dark" title="Dark">🌙</button><button data-t="light" title="Light">☀️</button><button data-t="auto" title="Auto">🖥️</button></div>';
document.body.appendChild(ctl);
ctl.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.l){lang=b.dataset.l;put("nf-lang",lang);applyLang();}
  if(b.dataset.t){theme=b.dataset.t;put("nf-theme",theme);applyTheme();}
});
if(mq.addEventListener)mq.addEventListener("change",()=>{if(theme==="auto")applyTheme();});

/* بعد الدخول تنتقل الأزرار إلى رأس الصفحة */
function place(){
  const app=$("#app"),st=$("header.top .status");
  if(app&&!app.classList.contains("hidden")&&st){
    if(ctl.parentNode!==st){ctl.className="";st.prepend(ctl);}
  }else if(ctl.parentNode!==document.body){ctl.className="float";document.body.appendChild(ctl);}
}
if($("#app"))new MutationObserver(place).observe($("#app"),{attributes:true,attributeFilter:["class"]});

applyTheme();applyLang();place();
})();
