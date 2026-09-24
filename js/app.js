const STORAGE_KEY = "dcc_v2";

const defaultState = {
  session: null,
  reminders: [
    {id:1,title:"Blood glucose check",type:"Glucose",date:todayISO(),time:futureTime(1),done:false,lastAlerted:null},
    {id:2,title:"Medication reminder",type:"Medication",date:todayISO(),time:futureTime(3),done:false,lastAlerted:null},
    {id:3,title:"Physical activity",type:"Activity",date:todayISO(),time:futureTime(5),done:false,lastAlerted:null}
  ],
  healthEntries: [], flags: [], appointments: [],
  providerConnection: {provider:"Demo Diabetes Clinic",code:"DOC-1024",status:"Not connected",permissions:["Health records","Progress reports","Review requests"]},
  authorizationRequests: [], providerFeedback: [], patients: [], notificationLog: []
};

let state = loadState();
let selectedRole = "patient";
let selectedPatientEmail = null;
let currentMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let reminderTimer = null;
let audioContext = null;

const foodData = [
  {name:"Ugali",category:"Staple",text:"A common Kenyan staple. Use portion awareness and pair meals with vegetables and an appropriate protein source."},
  {name:"Sukuma wiki",category:"Vegetable",text:"A leafy vegetable commonly used in Kenya. It can be included as part of a balanced meal."},
  {name:"Githeri",category:"Mixed meal",text:"A traditional combination of maize and beans. Portion awareness and the overall meal composition matter."},
  {name:"Chapati",category:"Staple",text:"A popular flatbread. Consider portion size and balance the meal with vegetables and protein."},
  {name:"Beans",category:"Protein",text:"Beans can form part of a balanced meal and provide plant protein and fibre."},
  {name:"Sweet potatoes",category:"Starch",text:"A common local food that can be included in balanced meals with attention to portion size."},
  {name:"Matoke",category:"Starch",text:"Green bananas/plantain are common in many Kenyan meals. Pair with vegetables and a suitable protein source."},
  {name:"Vegetables",category:"Vegetable",text:"A variety of vegetables can help make meals more balanced and varied."},
  {name:"Fruits",category:"Fruit",text:"Fruit can be part of a balanced eating pattern. Individual needs vary, so discuss personal guidance with a professional."}
];
const learningData = [
  {title:"Understanding diabetes",text:"Learn basic concepts about diabetes, daily self-care and why consistent follow-up matters."},
  {title:"Keeping health records",text:"Regularly recorded information can help you and your healthcare provider discuss changes over time."},
  {title:"Medication safety",text:"Record prescribed medicines accurately and follow instructions from your healthcare professional. Do not change doses based on this website."},
  {title:"Clinic preparation",text:"Bring your health summary, questions, medicines information and recent records to your appointment."},
  {title:"Food and balance",text:"Use the Kenyan food guide for general education. Personal meal plans should be discussed with an appropriate professional."},
  {title:"When to seek help",text:"If you have concerning symptoms or feel significantly unwell, seek appropriate medical care rather than relying on the website."}
];

function todayISO(){const d=new Date();return isoFromDate(d)}
function isoFromDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function futureTime(minutes){const d=new Date(Date.now()+minutes*60000);return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`}
function loadState(){try{const s=JSON.parse(localStorage.getItem(STORAGE_KEY));if(!s)return structuredClone(defaultState);const merged=mergeState(s);
  // Migrate the earlier prototype state where provider access was accidentally pre-approved.
  if(merged.providerConnection?.status==="Approved" && !(merged.authorizationRequests||[]).some(r=>r.status==="Approved")){merged.providerConnection={...defaultState.providerConnection,status:"Not connected"};}
  return merged;
}catch{return structuredClone(defaultState)}}
function mergeState(s){const d=structuredClone(defaultState);return {...d,...s,providerConnection:{...d.providerConnection,...(s.providerConnection||{})},notificationLog:s.notificationLog||[],providerFeedback:s.providerFeedback||[],authorizationRequests:s.authorizationRequests||[],patients:s.patients||[]}}
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function esc(v=""){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function formatDate(date){return new Date(date+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
function showToast(message){const el=document.getElementById("toast");el.textContent=message;el.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove("show"),3000)}
function initials(name){return (name||"User").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function currentUser(){return state.session||{name:"Demo Patient",email:"patient@example.com",role:"patient"}}
function isPatient(){return currentUser().role==="patient"}
function patientName(){return currentUser().name}

// ---------- Startup ----------
document.addEventListener("DOMContentLoaded",()=>{
  bindGlobalEvents();
  requestNotificationPermission();
  startReminderEngine();
  if(state.session) enterApp();
});

function bindGlobalEvents(){
  document.querySelectorAll(".role-btn").forEach(btn=>btn.addEventListener("click",()=>{
    selectedRole=btn.dataset.role;
    document.querySelectorAll(".role-btn").forEach(b=>b.classList.toggle("active",b===btn));
    const provider=selectedRole==="doctor";
    document.getElementById("loginName").value=provider?"Demo Diabetes Clinic":"";
    document.getElementById("loginEmail").value=provider?"provider@demo.local":"";
    document.getElementById("loginName").disabled=provider;
    document.getElementById("loginEmail").disabled=provider;
    document.getElementById("loginNameLabel").textContent=provider?"Provider":"Name";
    document.getElementById("loginEmailLabel").textContent=provider?"Provider email":"Email";
    document.getElementById("providerCodeWrap").classList.toggle("hidden",!provider);
    document.getElementById("providerLoginCode").required=provider;
  }));
  document.getElementById("loginForm").addEventListener("submit",e=>{
    e.preventDefault();
    if(selectedRole==="doctor") {
      const code=document.getElementById("providerLoginCode").value.trim().toUpperCase();
      if(code!=="DOC-1024"){showToast("Invalid provider code. Use DOC-1024 for this demo.");return;}
      state.session={name:"Demo Diabetes Clinic",email:"provider@demo.local",role:"doctor",providerCode:code};
    } else {
      state.session={name:document.getElementById("loginName").value.trim(),email:document.getElementById("loginEmail").value.trim(),role:"patient"};
      syncDemoPatient();
    }
    saveState(); enterApp(); showToast("Dashboard ready");
  });
  document.getElementById("logoutBtn").addEventListener("click",()=>{state.session=null;saveState();location.reload()});
  document.getElementById("profileBtn").addEventListener("click",openProfileModal);
  document.getElementById("closeModal").addEventListener("click",closeModal);
  document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
  document.getElementById("addReminderBtn").addEventListener("click",openReminderModal);
  document.getElementById("addHealthBtn").addEventListener("click",openHealthModal);
  document.getElementById("addRecordBtn").addEventListener("click",openHealthModal);
  document.getElementById("printReportBtn").addEventListener("click",()=>window.print());
  document.getElementById("prevMonth").addEventListener("click",()=>{currentMonth.setMonth(currentMonth.getMonth()-1);renderCalendar()});
  document.getElementById("nextMonth").addEventListener("click",()=>{currentMonth.setMonth(currentMonth.getMonth()+1);renderCalendar()});
  document.getElementById("foodSearch").addEventListener("input",renderFood);
  document.getElementById("patientSearch").addEventListener("input",renderPatients);
  document.getElementById("enableNotificationsBtn")?.addEventListener("click",requestNotificationPermission);
  document.getElementById("testReminderBtn")?.addEventListener("click",testReminder);
  document.getElementById("flagForm").addEventListener("submit",e=>{e.preventDefault();createReviewFlag()});
  document.body.addEventListener("click",e=>{
    const nav=e.target.closest("[data-page]"),jump=e.target.closest("[data-page-jump]");
    if(nav)navigate(nav.dataset.page); if(jump)navigate(jump.dataset.pageJump);
    const task=e.target.closest("[data-task-id]");if(task)toggleTask(Number(task.dataset.taskId));
    const action=e.target.closest("[data-alert-action]");if(action)handleAlertAction(action.dataset.alertAction,Number(action.dataset.id));
    const patientBtn=e.target.closest("[data-view-patient]");if(patientBtn)viewPatient(patientBtn.dataset.viewPatient);
    const auth=e.target.closest("[data-auth-action]");if(auth)handleAuthorization(auth.dataset.authAction,auth.dataset.email);
    const feedback=e.target.closest("[data-feedback]");if(feedback)openFeedbackModal(feedback.dataset.feedback);
    const snooze=e.target.closest("[data-snooze-id]");if(snooze)snoozeReminder(Number(snooze.dataset.snoozeId));
  });
}

function enterApp(){
  document.getElementById("authScreen").classList.add("hidden");document.getElementById("app").classList.remove("hidden");
  document.getElementById("avatar").textContent=initials(currentUser().name);
  document.getElementById("patientNav").classList.toggle("hidden",!isPatient());document.getElementById("doctorNav").classList.toggle("hidden",isPatient());
  navigate(isPatient()?"patientDashboard":"doctorDashboard");renderAll();
}
function navigate(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active-page"));document.getElementById(page)?.classList.add("active-page");
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  const titles={patientDashboard:"Overview",calendar:"Calendar & Reminders",health:"Health Tracking",records:"My Records",report:"Progress Report",food:"Kenyan Food Guide",learn:"Learn",doctorDashboard:"Provider Overview",patients:"Patients",doctorReports:"Patient Reports"};
  document.getElementById("pageTitle").textContent=titles[page]||"Dashboard";document.getElementById("pageEyebrow").textContent=isPatient()?"Patient Portal":"Healthcare Provider Portal";
  if(page==="calendar")renderCalendar();if(page==="patients")renderPatients();if(page==="report"||page==="doctorReports")renderReports();
}
function renderAll(){
  if(!state.session)return;
  document.getElementById("avatar").textContent=initials(currentUser().name);
  document.getElementById("todayDate").textContent=new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  document.getElementById("welcomeName").textContent=`Good ${new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, ${currentUser().name.split(" ")[0]}`;
  updateNotificationStatus();renderDashboard();renderCalendar();renderHealth();renderRecords();renderReports();renderFood();renderLearn();renderDoctor();renderPatients();
}

// ---------- Reminder engine ----------
function startReminderEngine(){clearInterval(reminderTimer);checkDueReminders();reminderTimer=setInterval(checkDueReminders,15000)}
function reminderKey(r){return `${r.id}-${r.date}-${r.time}`}
function checkDueReminders(){
  if(!state.session||!isPatient())return;
  const now=new Date(),date=todayISO(),time=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  let changed=false;
  state.reminders.filter(r=>r.date===date&&!r.done&&r.time<=time).forEach(r=>{
    const key=reminderKey(r);
    if(r.lastAlerted!==key){triggerReminder(r);r.lastAlerted=key;changed=true}
  });
  if(changed){saveState();renderAll()}
}
function triggerReminder(r){
  const message=`${r.title} is due now.`;playAlarm();showToast(`Reminder: ${r.title}`);
  const log={id:Date.now(),title:r.title,type:r.type,at:new Date().toISOString()};state.notificationLog.unshift(log);state.notificationLog=state.notificationLog.slice(0,30);
  if("Notification" in window&&Notification.permission==="granted")new Notification("Diabetes Care Companion",{body:`${message} Please open your care dashboard.`});
  const box=document.getElementById("liveReminder");if(box){box.classList.remove("hidden");box.innerHTML=`<strong>Reminder due: ${esc(r.title)}</strong><span>${esc(r.type)} · ${esc(r.time)}</span><div><button class="small-btn primary" data-task-id="${r.id}">Mark complete</button><button class="small-btn" data-snooze-id="${r.id}">Snooze 10 min</button></div>`}
}
function testReminder(){triggerReminder({id:"test",title:"Test reminder",type:"Demo",time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})});showToast("Test alert triggered")}
function snoozeReminder(id){const r=state.reminders.find(x=>x.id===id);if(!r)return;const d=new Date();d.setMinutes(d.getMinutes()+10);r.date=isoFromDate(d);r.time=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;r.done=false;r.lastAlerted=null;saveState();renderAll();showToast("Reminder snoozed for 10 minutes")}
async function requestNotificationPermission(){
  if(!("Notification" in window)){updateNotificationStatus("Browser notifications unavailable");return}
  if(Notification.permission==="default")try{await Notification.requestPermission()}catch{}
  updateNotificationStatus();
}
function updateNotificationStatus(message){const el=document.getElementById("notificationStatus");if(!el)return;el.textContent=message||("Notification" in window?(Notification.permission==="granted"?"Notifications enabled":Notification.permission==="denied"?"Notifications blocked":"Notifications not enabled yet"):"Browser notifications unavailable")}
function playAlarm(){try{audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();const now=audioContext.currentTime;[0,0.18,0.36].forEach(offset=>{const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.frequency.value=880;gain.gain.setValueAtTime(.0001,now+offset);gain.gain.exponentialRampToValueAtTime(.18,now+offset+.02);gain.gain.exponentialRampToValueAtTime(.0001,now+offset+.14);osc.connect(gain);gain.connect(audioContext.destination);osc.start(now+offset);osc.stop(now+offset+.15)})}catch{}}

// ---------- Patient ----------
function getTodayReminders(){return state.reminders.filter(r=>r.date===todayISO()).sort((a,b)=>a.time.localeCompare(b.time))}
function renderDashboard(){
  const tasks=getTodayReminders();document.getElementById("todayTaskCount").textContent=tasks.length;document.getElementById("todayTaskProgress").textContent=`${tasks.filter(t=>t.done).length} completed`;
  document.getElementById("healthEntryCount").textContent=state.healthEntries.length;document.getElementById("patientFlagCount").textContent=state.flags.filter(f=>f.status==="Open"&&f.patient===patientName()).length;
  const appts=state.appointments.filter(a=>a.date>=todayISO()).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));document.getElementById("nextAppointment").textContent=appts[0]?.title||"None";document.getElementById("nextAppointmentDate").textContent=appts[0]?formatDate(appts[0].date):"Add an appointment";
  document.getElementById("todayTasks").innerHTML=tasks.length?tasks.map(t=>`<div class="task ${t.done?"done":""}" data-task-id="${t.id}"><input type="checkbox" ${t.done?"checked":""} aria-label="Complete ${esc(t.title)}"><div class="task-info"><strong>${esc(t.title)}</strong><span>${esc(t.type)} · ${esc(t.time)}</span></div>${!t.done?`<span class="task-state">Scheduled</span>`:`<span class="task-state done-state">Done</span>`}</div>`).join(""):`<div class="empty">No reminders for today. Add one from the calendar.</div>`;
  const recent=[...state.healthEntries].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5);document.getElementById("recentEntries").innerHTML=recent.length?recent.map(e=>`<div class="compact-item"><div><strong>${esc(e.kind)}</strong><span>${esc(e.note||"No note")}</span></div><span>${formatDate(e.date)}</span></div>`).join(""):`<div class="empty">No health entries yet.</div>`;
}
function toggleTask(id){const r=state.reminders.find(x=>x.id===id);if(!r)return;r.done=!r.done;if(r.done)r.lastAlerted=reminderKey(r);saveState();renderAll();showToast(r.done?"Reminder completed":"Reminder reopened")}
function createReviewFlag(){const reason=document.getElementById("flagReason").value.trim();if(!reason)return;state.flags.push({id:Date.now(),patient:patientName(),email:currentUser().email,providerCode:state.providerConnection.code||"DOC-1024",reason,createdAt:new Date().toISOString(),status:"Open"});syncDemoPatient();saveState();document.getElementById("flagReason").value="";renderAll();showToast("Provider review alert created")}

function renderCalendar(){
  const y=currentMonth.getFullYear(),m=currentMonth.getMonth();document.getElementById("calendarMonth").textContent=new Date(y,m,1).toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();let cells="";
  for(let i=0;i<42;i++){const n=i-first+1;let d,muted=false;if(n<1){d=new Date(y,m-1,prevDays+n);muted=true}else if(n>days){d=new Date(y,m+1,n-days);muted=true}else d=new Date(y,m,n);const iso=isoFromDate(d);const items=[...state.reminders.filter(r=>r.date===iso),...state.appointments.filter(a=>a.date===iso)].slice(0,2);cells+=`<div class="calendar-day ${muted?"muted":""} ${iso===todayISO()?"today":""}"><span class="day-number">${d.getDate()}</span>${items.map(x=>`<span class="calendar-dot">${esc(x.title)}</span>`).join("")}</div>`}
  document.getElementById("calendarGrid").innerHTML=cells;
  const upcoming=[...state.reminders.map(r=>({...r,kind:"Reminder"})),...state.appointments.map(a=>({...a,kind:"Appointment"}))].filter(x=>x.date>=todayISO()).sort((a,b)=>(a.date+(a.time||"" )).localeCompare(b.date+(b.time||""))).slice(0,10);
  document.getElementById("upcomingList").innerHTML=upcoming.length?upcoming.map(x=>`<div class="compact-item"><div><strong>${esc(x.title)}</strong><span>${esc(x.kind)}${x.time?" · "+esc(x.time):""}</span></div><span>${formatDate(x.date)}</span></div>`).join(""):`<div class="empty">Nothing scheduled.</div>`;
}
function renderHealth(){const entries=[...state.healthEntries].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));document.getElementById("healthHistory").innerHTML=entries.length?`<table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Value</th><th>Note</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${formatDate(e.date)}</td><td>${esc(e.kind)}</td><td>${esc(e.value||"—")}</td><td>${esc(e.note||"—")}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">No health information recorded yet.</div>`}
function renderRecords(){
  const entries=[...state.healthEntries].sort((a,b)=>b.date.localeCompare(a.date)),meds=state.reminders.filter(r=>r.type==="Medication");
  document.getElementById("glucoseRecords").innerHTML=entries.filter(e=>e.kind==="Blood glucose").slice(0,5).map(e=>`<div class="metric-item"><strong>${esc(e.value||"Recorded")}</strong><span>${formatDate(e.date)} · ${esc(e.note||"")}</span></div>`).join("")||`<div class="empty">No glucose records.</div>`;
  document.getElementById("medicationRecords").innerHTML=meds.slice(-5).map(e=>`<div class="metric-item"><strong>${esc(e.title)}</strong><span>${formatDate(e.date)} · ${e.done?"Completed":"Scheduled"}</span></div>`).join("")||`<div class="empty">No medication reminders.</div>`;
  document.getElementById("appointmentRecords").innerHTML=state.appointments.slice(-5).map(e=>`<div class="metric-item"><strong>${esc(e.title)}</strong><span>${formatDate(e.date)} · ${esc(e.provider||"Provider")}</span></div>`).join("")||`<div class="empty">No appointments.</div>`;
  document.getElementById("recordsSummary").innerHTML=`<div class="report-grid"><div class="report-stat"><span>Health entries</span><strong>${state.healthEntries.length}</strong></div><div class="report-stat"><span>Open review flags</span><strong>${state.flags.filter(f=>f.status==="Open").length}</strong></div><div class="report-stat"><span>Upcoming appointments</span><strong>${state.appointments.filter(a=>a.date>=todayISO()).length}</strong></div></div>`;
}

function renderReports(){
  const doctorView=!isPatient();
  const targetEmail=doctorView?(selectedPatientEmail||state.lastApprovedPatientEmail):currentUser().email;
  const targetPatient=doctorView?state.patients.find(p=>p.email===targetEmail):null;
  const u=doctorView?(targetPatient||{name:"Select an authorized patient",email:""}):currentUser();
  const entries=state.healthEntries;
  const openFlags=state.flags.filter(f=>f.status==="Open" && (!targetEmail || f.email===targetEmail));
  const allFlags=state.flags.filter(f=>!targetEmail || f.email===targetEmail);
  const meds=state.reminders.filter(r=>r.type==="Medication"),completed=meds.filter(r=>r.done).length;
  const feedback=state.providerFeedback.filter(x=>x.email===targetEmail);
  const html=`<div class="report-head"><div><p class="eyebrow">Diabetes Care Companion</p><h3>Patient Progress Report</h3><p class="muted">Prepared from patient-entered records.</p></div><div><strong>${esc(u.name)}</strong><br><span class="muted">${esc(u.email)}</span></div></div>
  <div class="report-section"><h4>Overview</h4><div class="report-grid"><div class="report-stat"><span>Health entries</span><strong>${entries.length}</strong></div><div class="report-stat"><span>Medication reminders completed</span><strong>${meds.length?Math.round(completed/meds.length*100):0}%</strong></div><div class="report-stat"><span>Open review requests</span><strong>${openFlags.length}</strong></div></div></div>
  <div class="report-section"><h4>Recent health records</h4>${entries.length?`<table class="data-table"><thead><tr><th>Date</th><th>Type</th><th>Value</th><th>Note</th></tr></thead><tbody>${[...entries].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(e=>`<tr><td>${formatDate(e.date)}</td><td>${esc(e.kind)}</td><td>${esc(e.value||"—")}</td><td>${esc(e.note||"—")}</td></tr>`).join("")}</tbody></table>`:`<div class="empty">No health records have been entered.</div>`}</div>
  <div class="report-section"><h4>Provider review history</h4>${allFlags.length?allFlags.slice().reverse().map(f=>`<div class="flag-row"><strong>${esc(f.status)} · Review request</strong><p>${esc(f.reason)}</p><small>${new Date(f.createdAt).toLocaleString()}</small></div>`).join(""):`<div class="empty">No review requests.</div>`}</div>
  <div class="report-section"><h4>Provider feedback</h4>${feedback.length?feedback.slice().reverse().map(f=>`<div class="report-note"><strong>${esc(f.provider)}</strong><br>${esc(f.note)}<br><small>${new Date(f.createdAt).toLocaleString()}</small></div>`).join(""):`<div class="empty">No provider feedback recorded.</div>`}</div>
  <div class="report-note"><strong>Prototype note:</strong> This report organizes patient-entered information. It does not diagnose, interpret clinical results, recommend medication changes or replace professional medical assessment.</div>`;
  if(document.getElementById("patientReport")) document.getElementById("patientReport").innerHTML=html;
  if(document.getElementById("doctorReportViewer")) document.getElementById("doctorReportViewer").innerHTML=doctorView && !targetPatient ? `<div class="empty">Select an authorized patient from the Patients page to view their report.</div>` : html;
}
function renderFood(){const q=(document.getElementById("foodSearch")?.value||"").toLowerCase();const data=foodData.filter(x=>x.name.toLowerCase().includes(q)||x.category.toLowerCase().includes(q));document.getElementById("foodGrid").innerHTML=data.map(x=>`<article class="food-card"><span class="tag">${esc(x.category)}</span><h4>${esc(x.name)}</h4><p>${esc(x.text)}</p></article>`).join("")||`<div class="empty">No matching foods.</div>`}
function renderLearn(){document.getElementById("learnGrid").innerHTML=learningData.map(x=>`<article class="learn-card"><h4>${esc(x.title)}</h4><p>${esc(x.text)}</p></article>`).join("")}

// ---------- Provider ----------
function renderDoctor(){
  // Provider only sees requests addressed to the provider's verified demo code.
  const providerCode=currentUser().providerCode||"DOC-1024";
  const flags=state.flags.filter(f=>f.status==="Open" && (!f.providerCode || f.providerCode===providerCode));
  document.getElementById("doctorPatientCount").textContent=state.patients.length;
  document.getElementById("doctorFlagCount").textContent=flags.length;
  document.getElementById("doctorReportCount").textContent=state.patients.length;
  document.getElementById("doctorAppointmentCount").textContent=state.appointments.length;

  document.getElementById("doctorAlerts").innerHTML=flags.length
    ? flags.map(f=>`<div class="alert-item"><h4>${esc(f.patient)} — review requested</h4><p>${esc(f.reason)}</p><div class="alert-actions"><button class="small-btn primary" data-alert-action="review" data-id="${f.id}">Mark reviewed</button><button class="small-btn" data-feedback="${esc(f.email||"")}">Provider feedback</button><button class="small-btn" data-alert-action="report" data-id="${f.id}">Open report</button></div></div>`).join("")
    : `<div class="empty">No open review alerts.</div>`;

  const pending=state.authorizationRequests.filter(x=>x.status==="Pending" && x.code===providerCode);
  let html="";
  if(pending.length){
    html+=`<div class="provider-subtitle">Pending access requests</div>`;
    html+=pending.map(p=>`<div class="compact-item"><div><strong>${esc(p.name)}</strong><span>${esc(p.email)}</span></div><div><button class="small-btn primary" data-auth-action="approve" data-email="${esc(p.email)}">Approve</button><button class="small-btn" data-auth-action="decline" data-email="${esc(p.email)}">Decline</button></div></div>`).join("");
  }
  if(state.patients.length){
    html+=`<div class="provider-subtitle">Connected patients</div>`;
    html+=state.patients.slice(0,6).map(p=>`<div class="compact-item"><div><strong>${esc(p.name)}</strong><span>${esc(p.email)} · ${p.entryCount||0} records</span></div><button class="text-btn" data-view-patient="${esc(p.email)}">Open</button></div>`).join("");
  }else if(!pending.length){
    html+=`<div class="empty">No connected patients yet.</div>`;
  }
  document.getElementById("doctorPatientsPreview").innerHTML=html;
}
function renderPatients(){const q=(document.getElementById("patientSearch")?.value||"").toLowerCase();const list=state.patients.filter(p=>p.name.toLowerCase().includes(q)||p.email.toLowerCase().includes(q));document.getElementById("patientTable").innerHTML=list.length?`<table class="data-table"><thead><tr><th>Patient</th><th>Email</th><th>Open alerts</th><th>Records</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.email)}</td><td>${state.flags.filter(f=>f.email===p.email&&f.status==="Open").length}</td><td>${p.entryCount||0}</td><td><button class="small-btn primary" data-view-patient="${esc(p.email)}">View report</button></td></tr>`).join("")}</tbody></table>`:`<div class="empty">No connected patients found.</div>`}
function handleAlertAction(action,id){const f=state.flags.find(x=>x.id===id);if(!f)return;if(action==="review"){f.status="Reviewed";saveState();renderAll();showToast("Review marked as reviewed")}if(action==="report"){navigate("doctorReports")}}
function viewPatient(email){
  const p=state.patients.find(x=>x.email===email && x.authorized);
  if(!p){showToast("This patient has not approved provider access yet");return;}
  selectedPatientEmail=email;
  navigate("doctorReports");
  renderReports();
  showToast(`Opened ${p.name}'s report`);
}

// ---------- Authorization ----------
function openAuthorizationModal(){
  openModal("Connect a healthcare provider",`<form id="authRequestForm" class="modal-form"><p class="form-note">This prototype simulates patient-controlled access. Enter the demo provider code to create an access request.</p><label>Provider code</label><input id="providerCode" value="DOC-1024" required><label>Provider name</label><input id="providerName" value="Demo Diabetes Clinic" required><div class="permission-list"><label><input type="checkbox" checked disabled> Health records</label><label><input type="checkbox" checked disabled> Progress reports</label><label><input type="checkbox" checked disabled> Review requests</label></div><button class="btn btn-primary" type="submit">Send authorization request</button></form>`);
  document.getElementById("authRequestForm").addEventListener("submit",e=>{e.preventDefault();const code=document.getElementById("providerCode").value.trim();if(code!=="DOC-1024"){showToast("For this demo use provider code DOC-1024");return}const existing=state.authorizationRequests.find(x=>x.email===currentUser().email&&x.code===code&&x.status==="Pending");if(existing){showToast("You already have a pending request for this provider");return;}
    state.providerConnection={provider:document.getElementById("providerName").value.trim(),code,status:"Pending",permissions:["Health records","Progress reports","Review requests"]};
    state.authorizationRequests.push({id:Date.now(),name:patientName(),email:currentUser().email,provider:document.getElementById("providerName").value.trim(),code,status:"Pending",createdAt:new Date().toISOString()});saveState();closeModal();renderAll();showToast("Authorization request sent")});
}
function handleAuthorization(action,email){
  const providerCode=currentUser().providerCode||"DOC-1024";
  const r=state.authorizationRequests.find(x=>x.email===email&&x.status==="Pending"&&x.code===providerCode);
  if(!r){showToast("No pending request found for this provider");return;}
  r.status=action==="approve"?"Approved":"Declined";
  const p=state.patients.find(x=>x.email===email);
  if(action==="approve"){
    if(p){p.authorized=true;p.providerCode=r.code;p.provider=r.provider;}
    // Keep the connection pending/approved for the patient who sent the request.
    if(state.session?.role==="doctor") state.lastApprovedPatientEmail=email;
  }
  saveState();renderAll();showToast(action==="approve"?`Access approved for ${r.name}`:"Authorization declined");
}

function openFeedbackModal(email){const p=state.patients.find(x=>x.email===email)||{name:email,email};openModal("Provider feedback",`<form id="feedbackForm" class="modal-form"><p class="form-note">Record a professional review response for the patient. This demo does not provide automated clinical advice.</p><label>Patient</label><input value="${esc(p.name)}" disabled><label>Feedback / follow-up note</label><textarea id="feedbackNote" rows="5" required placeholder="Enter the provider's review response..."></textarea><button class="btn btn-primary" type="submit">Save provider feedback</button></form>`);document.getElementById("feedbackForm").addEventListener("submit",e=>{e.preventDefault();const note=document.getElementById("feedbackNote").value.trim();state.providerFeedback.push({id:Date.now(),patient:p.name,email:p.email,provider:currentUser().name,providerCode:currentUser().providerCode||"DOC-1024",note,createdAt:new Date().toISOString()});saveState();closeModal();renderAll();showToast("Provider feedback saved")})}

// ---------- Modals ----------
function openModal(title,body){document.getElementById("modalTitle").textContent=title;document.getElementById("modalBody").innerHTML=body;document.getElementById("modal").classList.remove("hidden")}
function closeModal(){document.getElementById("modal").classList.add("hidden");document.getElementById("modalBody").innerHTML=""}
function openReminderModal(){openModal("Add working reminder",`<form id="reminderModalForm" class="modal-form"><label>Reminder title</label><input id="rTitle" required placeholder="e.g. Blood glucose check"><div class="row"><div><label>Type</label><select id="rType"><option>Glucose</option><option>Medication</option><option>Activity</option><option>Appointment</option><option>Other</option></select></div><div><label>Date</label><input id="rDate" type="date" value="${todayISO()}" required></div></div><label>Time</label><input id="rTime" type="time" value="${futureTime(2)}" required><button class="btn btn-primary" type="submit">Save working reminder</button></form>`);document.getElementById("reminderModalForm").addEventListener("submit",e=>{e.preventDefault();state.reminders.push({id:Date.now(),title:document.getElementById("rTitle").value.trim(),type:document.getElementById("rType").value,date:document.getElementById("rDate").value,time:document.getElementById("rTime").value,done:false,lastAlerted:null});saveState();closeModal();renderAll();showToast("Reminder saved — browser will alert when due")})}
function openHealthModal(){openModal("Add health entry",`<form id="healthModalForm" class="modal-form"><div class="row"><div><label>Entry type</label><select id="hKind"><option>Blood glucose</option><option>Medication</option><option>Symptom / feeling</option><option>Activity</option><option>Other</option></select></div><div><label>Date</label><input id="hDate" type="date" value="${todayISO()}" required></div></div><label>Recorded value (optional)</label><input id="hValue" placeholder="Enter what you recorded"><label>Note</label><textarea id="hNote" rows="4" placeholder="Add context in your own words"></textarea><button class="btn btn-primary" type="submit">Save health entry</button></form>`);document.getElementById("healthModalForm").addEventListener("submit",e=>{e.preventDefault();state.healthEntries.push({id:Date.now(),kind:document.getElementById("hKind").value,date:document.getElementById("hDate").value,value:document.getElementById("hValue").value.trim(),note:document.getElementById("hNote").value.trim(),createdAt:new Date().toISOString()});syncDemoPatient();saveState();closeModal();renderAll();showToast("Health entry saved")})}
function openProfileModal(){
  const u=currentUser();
  const ownRequest=isPatient()?state.authorizationRequests.find(r=>r.email===u.email&&r.code==="DOC-1024"&&["Pending","Approved","Declined"].includes(r.status)):null;
  const providerName=ownRequest?.provider||"No provider connected";
  const providerStatus=ownRequest?.status||"Not connected";
  openModal("Profile & provider access",`<div class="modal-form">
    <label>Name</label><input id="pName" value="${esc(u.name)}" ${isPatient()?"":"disabled"}>
    <label>Email</label><input id="pEmail" type="email" value="${esc(u.email)}" ${isPatient()?"":"disabled"}>
    ${isPatient()?`<div class="access-box"><strong>Provider access</strong><p>${esc(providerName)}</p><span class="status-pill">${esc(providerStatus)}</span><button id="connectProviderBtn" class="btn btn-outline" type="button">Request / manage access</button></div>`:`<div class="access-box"><strong>Demo provider account</strong><p>Provider code: <strong>DOC-1024</strong></p><p>Approve requests only after reviewing the patient's authorization request.</p></div>`}
    ${isPatient()?`<button id="saveProfileBtn" class="btn btn-primary" type="button">Save profile</button>`:""}
    <small class="form-note">Prototype only: all records are stored in this browser using localStorage. No real email, SMS or server is connected.</small>
  </div>`);
  document.getElementById("connectProviderBtn")?.addEventListener("click",openAuthorizationModal);
  document.getElementById("saveProfileBtn")?.addEventListener("click",()=>{state.session.name=document.getElementById("pName").value.trim();state.session.email=document.getElementById("pEmail").value.trim();syncDemoPatient();saveState();closeModal();enterApp();showToast("Profile updated")});
}
function syncDemoPatient(){if(!state.session||!isPatient())return;let p=state.patients.find(x=>x.email===state.session.email);const ownRequest=state.authorizationRequests.find(r=>r.email===state.session.email && r.code==="DOC-1024" && ["Pending","Approved"].includes(r.status));
  const data={name:state.session.name,email:state.session.email,entryCount:state.healthEntries.length,authorized:ownRequest?.status==="Approved",providerCode:ownRequest?.code||null,provider:ownRequest?.provider||null};if(p)Object.assign(p,data);else state.patients.push(data)}
