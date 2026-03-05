// ======================
// CONFIG
// ======================
const PASSWORD = "alto25garda!";
const TEAMS = [
  "Under9","Under10 (TM)","Under10 (LIM)","Under11","Under12","Under13","Under14","Under15","Under17","Juniores","PrimaSquadra"
];

const DEFAULTS = {
  "Under9":        { mode:"5v5", periods:4, min:15 },
  "Under10 (TM)":  { mode:"7v7", periods:4, min:15 },
  "Under10 (LIM)": { mode:"7v7", periods:4, min:15 },
  "Under11":       { mode:"7v7", periods:4, min:15 },
  "Under12":       { mode:"9v9", periods:3, min:20 },
  "Under13":       { mode:"11v11", periods:2, min:35 },
  "Under14":       { mode:"11v11", periods:2, min:40 },
  "Under15":       { mode:"11v11", periods:2, min:35 },
  "Under17":       { mode:"11v11", periods:2, min:45 },
  "Juniores":      { mode:"11v11", periods:2, min:45 },
  "PrimaSquadra":  { mode:"11v11", periods:2, min:45 }
};

// ======================
// DRIVE UPLOAD (Apps Script)
// ======================
const ARCHIVE_ENDPOINT ="https://script.google.com/macros/s/AKfycbzyWft3ATB5WXoewsWW51vD-TBv5pwg8fYO4dk5l3WzYCAm-heWF1d3c1XTM9DDr1iz-Q/exec";
const ARCHIVE_TOKEN = "AGUP_9fQ3!vZ7#kL2@pX8$hN6%rT1";

// ======================
// STORAGE
// ======================
const LS_KEY = "ag_referti_v16";
const LS_REMEMBER = "ag_referti_remember_pw";
const LS_SAVED_PW = "ag_referti_saved_pw";

function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return { session:null, sessionsByTeam:{} };
  try { return JSON.parse(raw); }
  catch { return { session:null, sessionsByTeam:{} }; }
}
function saveState(){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
let state = loadState();

// ======================
// DOM
// ======================
const $ = (id)=>document.getElementById(id);

function showBanner(msg){
  const b = $("banner");
  b.textContent = String(msg || "").toUpperCase();
  b.classList.remove("hidden");
  setTimeout(()=> b.classList.add("hidden"), 2200);
}


function showToast(msg){
  let t = $("toast");
  if (!t){
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = String(msg || "");
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> t.classList.remove("show"), 1500);
}

function vibrate(pattern){
  try{ if (navigator.vibrate) navigator.vibrate(pattern); }catch(_){}
}

let _audioCtx = null;
let _audioUnlocked = false;

function ensureAudioUnlocked(){
  try{
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === "suspended") _audioCtx.resume();
    if (_audioUnlocked) return;
    // tiny silent click to unlock on iOS after a user gesture
    const o = _audioCtx.createOscillator();
    const g = _audioCtx.createGain();
    g.gain.value = 0.0001;
    o.frequency.value = 440;
    o.connect(g); g.connect(_audioCtx.destination);
    o.start();
    setTimeout(()=>{ try{o.stop();}catch(_){} }, 40);
    _audioUnlocked = true;
  }catch(_){}
}

function playTone(freq, ms, vol=0.09){
  try{
    ensureAudioUnlocked();
    const o = _audioCtx.createOscillator();
    const g = _audioCtx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(_audioCtx.destination);
    o.start();
    setTimeout(()=>{ try{o.stop();}catch(_){} }, ms);
  }catch(_){}
}

// 3 suoni diversi
function soundStart(){            // partenza tempo: tono basso corto
  playTone(520, 120, 0.10);
}
function soundWarn30(){           // 30 secondi: doppio "pip"
  playTone(740, 110, 0.11);
  setTimeout(()=> playTone(740, 110, 0.11), 160);
}
function soundEnd(){              // fine tempo: triplo "pip" più alto
  playTone(980, 140, 0.12);
  setTimeout(()=> playTone(980, 140, 0.12), 180);
  setTimeout(()=> playTone(980, 140, 0.12), 360);
}


function setBodyBg(kind){
  document.body.classList.toggle("bg-login", kind === "login");
  document.body.classList.toggle("bg-royal", kind === "royal");
}

function setPage(title, viewId){
  $("pageTitle").textContent = String(title || "").toUpperCase();
  for (const vid of ["view-login","view-settings","view-live","view-close","view-export"]){
    $(vid).classList.toggle("hidden", vid !== viewId);
  }
  setBodyBg(viewId === "view-login" ? "login" : "royal");
}

// ======================
// Helpers
// ======================
function pad2(n){ return String(n).padStart(2,"0"); }
function nowMs(){ return Date.now(); }

function titleCaseWords(s){
  return (s||"").trim().toLowerCase().split(/\s+/).map(w => w ? w[0].toUpperCase()+w.slice(1) : "").join(" ");
}

function formatMMSS(totalSeconds){
  const m = Math.floor(totalSeconds/60);
  const s = totalSeconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

function matchDurationMs(match){ return match.periodMin * 60 * 1000; }

function computeElapsedSec(match){
  if (!match.running || !match.startMs) return 0;
  return Math.max(0, Math.floor((nowMs() - match.startMs) / 1000));
}
function computeRemainingSec(match){
  const totalSec = match.periodMin * 60;
  const elapsed = computeElapsedSec(match);
  return Math.max(0, totalSec - elapsed);
}
function isPeriodDone(match){
  if (!match.running || !match.startMs) return false;
  return (nowMs() - match.startMs) >= matchDurationMs(match);
}

/** minuto “umano”: 00:00..00:59 => 1' */
function currentMinute(match){
  const elapsed = computeElapsedSec(match);
  return Math.floor(elapsed / 60) + 1;
}

function fillSelect(sel, items){
  sel.innerHTML = "";
  items.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

function nextQuarterTime(){
  const ms = Date.now();
  const q = 15 * 60 * 1000;
  return new Date(Math.ceil(ms / q) * q);
}

// ======================
// Session per squadra
// ======================
function getSession(team){
  if (!team) return null;
  if (!state.sessionsByTeam[team]){
    state.sessionsByTeam[team] = { team, currentMatch:null };
  }
  return state.sessionsByTeam[team];
}
function getCurrentSession(){
  const team = state.session?.team;
  return getSession(team);
}

// ======================
// Venue segmented
// ======================
let venueValue = "Casa";
function setVenue(v){
  venueValue = v;
  $("venueCasa").classList.toggle("active", v === "Casa");
  $("venueTrasferta").classList.toggle("active", v === "Trasferta");
}

let alertsEnabledValue = true;

function setAlerts(on){
  alertsEnabledValue = !!on;
  const onBtn = $("alertsOn");
  const offBtn = $("alertsOff");
  if (onBtn) onBtn.classList.toggle("active", alertsEnabledValue);
  if (offBtn) offBtn.classList.toggle("active", !alertsEnabledValue);
}

// ======================
// Duration custom UI
// ======================
function updateCustomMinUI(){
  const v = $("setPeriodMin").value;
  const isCustom = v === "custom";
  $("customMinWrap").classList.toggle("hidden", !isCustom);
}
function getSelectedPeriodMin(){
  const v = $("setPeriodMin").value;
  if (v !== "custom") return parseInt(v, 10);
  const raw = ($("setPeriodCustom").value || "").trim();
  const num = parseInt(raw, 10);
  return Number.isFinite(num) ? num : NaN;
}

// ======================
// Score helpers
// ======================
function altoLabel(match){
  return `Alto Garda ${match.team}`;
}
function computeGoals(match){
  const gf = match.events.filter(e=>e.type==="GOL_FATTO").length;
  const gs = match.events.filter(e=>e.type==="GOL_SUBITO").length;
  return { gf, gs };
}
function computeGoalsByPeriod(match){
  const gfBy = {};
  const gsBy = {};
  for (let i=1; i<=match.periods; i++){ gfBy[i]=0; gsBy[i]=0; }
  for (const e of match.events){
    if (e.type==="GOL_FATTO") gfBy[e.period] += 1;
    if (e.type==="GOL_SUBITO") gsBy[e.period] += 1;
  }
  return { gfBy, gsBy };
}
function computePeriodPoints(gf, gs){
  if (gf > gs) return { pFor:1, pAgainst:0, label:"1-0" };
  if (gf < gs) return { pFor:0, pAgainst:1, label:"0-1" };
  return { pFor:1, pAgainst:1, label:"1-1" };
}

// Home/Away orientation (tabellone)
function computeHomeAway(match){
  const { gf, gs } = computeGoals(match);
  const alto = altoLabel(match).toUpperCase();
  const opp  = match.opponent.toUpperCase();

  if (match.venue === "Trasferta"){
    return { homeTeam: opp, awayTeam: alto, homeScore: gs, awayScore: gf };
  }
  return { homeTeam: alto, awayTeam: opp, homeScore: gf, awayScore: gs };
}

// ======================
// Modal
// ======================
let modalResolver = null;
let modalMode = "none"; // message | confirm | event
let modalCtx = {};

function openModal(){
  $("modalOverlay").classList.remove("hidden");
  $("modalOverlay").setAttribute("aria-hidden","false");
}
function closeModal(){
  $("modalOverlay").classList.add("hidden");
  $("modalOverlay").setAttribute("aria-hidden","true");
  $("modalForm").classList.add("hidden");
  $("mP1Wrap").classList.add("hidden");
  $("mP2Wrap").classList.add("hidden");
  $("mAssistWrap").classList.add("hidden");
  $("modalErr").classList.add("hidden");
  $("modalErr").textContent = "";
  $("modalMsg").textContent = "";
  modalMode = "none";
  modalCtx = {};
}

function modalSet(title, msg){
  $("modalTitle").textContent = title || "";
  $("modalMsg").textContent = msg || "";
  $("modalErr").classList.add("hidden");
  $("modalErr").textContent = "";
}
function modalError(msg){
  $("modalErr").textContent = msg || "";
  $("modalErr").classList.remove("hidden");
}

function showMessage(title, msg){
  return new Promise((resolve)=>{
    modalResolver = resolve;
    modalMode = "message";
    modalSet(title, msg);
    $("modalCancel").classList.add("hidden");
    $("modalOk").textContent = "Ok";
    openModal();
  });
}
function showConfirm(title, msg, okText="Sì", cancelText="No"){
  return new Promise((resolve)=>{
    modalResolver = resolve;
    modalMode = "confirm";
    modalSet(title, msg);
    $("modalCancel").classList.remove("hidden");
    $("modalCancel").textContent = cancelText;
    $("modalOk").textContent = okText;
    openModal();
  });
}

function showEventModal({ title, type, match, editingEvent=null }){
  return new Promise((resolve)=>{
    modalResolver = resolve;
    modalMode = "event";
    modalCtx = { type, match };

    modalSet(title, "");
    $("modalForm").classList.remove("hidden");

    $("mPeriod").value = String(editingEvent?.period ?? match.currentPeriod);
    $("mMin").value = String(editingEvent?.minute ?? (match.running ? currentMinute(match) : 1));

    $("mP1").value = editingEvent?.p1raw || "";
    $("mP2").value = editingEvent?.p2raw || "";
    $("mAssist").value = editingEvent?.assistRaw || "";

    $("mP1Wrap").classList.add("hidden");
    $("mP2Wrap").classList.add("hidden");
    $("mAssistWrap").classList.add("hidden");

    if (type === "SOSTITUZIONE"){
      $("mP1Wrap").classList.remove("hidden");
      $("mP2Wrap").classList.remove("hidden");
      $("mP1Label").textContent = "Giocatore che Esce";
      $("mP2Label").textContent = "Giocatore che Entra";
      setTimeout(()=> $("mP1").focus(), 0);
    } else if (type === "GOL_FATTO"){
      $("mP1Wrap").classList.remove("hidden");
      $("mP1Label").textContent = "Marcatore";
      $("mAssistWrap").classList.remove("hidden");
      setTimeout(()=> $("mP1").focus(), 0);
    } else if (type === "TIRO"){
      $("mP1Wrap").classList.remove("hidden");
      $("mP1Label").textContent = "Calciatore";
      setTimeout(()=> $("mP1").focus(), 0);
    } else {
      $("mP1Wrap").classList.remove("hidden");
      $("mP1Label").textContent = "Giocatore";
      setTimeout(()=> $("mP1").focus(), 0);
    }

    $("modalCancel").classList.remove("hidden");
    $("modalCancel").textContent = "Annulla";
    $("modalOk").textContent = "Conferma";

    openModal();
  });
}

function modalOk(){
  if (!modalResolver) return;
  const resolve = modalResolver;

  if (modalMode === "message"){
    modalResolver = null; closeModal(); resolve({ ok:true }); return;
  }
  if (modalMode === "confirm"){
    modalResolver = null; closeModal(); resolve({ ok:true }); return;
  }

  if (modalMode === "event"){
    const { type, match } = modalCtx;

    const period = parseInt(($("mPeriod").value || "").trim(), 10);
    const minute = parseInt(($("mMin").value || "").trim(), 10);

    const p1raw = ($("mP1").value || "").trim();
    const p2raw = ($("mP2").value || "").trim();
    const assistRaw = ($("mAssist").value || "").trim();

    if (!(period >= 1 && period <= match.periods)){ modalError("Tempo non valido"); return; }
    if (!(minute >= 1 && minute <= 999)){ modalError("Minuto non valido (parti da 1)"); return; }

    if (type === "SOSTITUZIONE"){
      if (!p1raw || !p2raw){ modalError("Inserisci esce ed entra"); return; }
    } else if (type === "GOL_FATTO" || type === "AMMONIZIONE" || type === "ESPULSIONE"){
      if (!p1raw){ modalError("Inserisci il Giocatore"); return; }
    } else if (type === "TIRO"){
      if (!p1raw){ modalError("Inserisci il Calciatore"); return; }
    }

    modalResolver = null;
    closeModal();
    resolve({ ok:true, period, minute, p1raw, p2raw, assistRaw, type });
    return;
  }
}

function modalCancel(){
  if (!modalResolver) return;
  const resolve = modalResolver;
  modalResolver = null;
  closeModal();
  resolve({ ok:false });
}

function initModal(){
  $("modalOk").addEventListener("click", modalOk);
  $("modalCancel").addEventListener("click", modalCancel);
  $("modalX").addEventListener("click", modalCancel);
  $("modalOverlay").addEventListener("click", (e)=>{
    if (e.target === $("modalOverlay")) modalCancel();
  });
}

// ======================
// Labels
// ======================
function labelType(type){
  return ({
    "GOL_FATTO":"GOL FATTO",
    "GOL_SUBITO":"GOL SUBITO",
    "TIRO":"TIRO",
    "AMMONIZIONE":"AMMONIZIONE",
    "ESPULSIONE":"ESPULSIONE",
    "SOSTITUZIONE":"SOSTITUZIONE"
  })[type] || type;
}
function labelTime(ev){
  return `${ev.period}°T ${ev.minute}'`;
}

/* ✅ Assist: solo (Nome) */
function compactMainText(ev){
  if (ev.type === "SOSTITUZIONE"){
    const esce = ev.p1 || "";
    const entra = ev.p2 || "";
    return `↓ ${esce}  |  ↑ ${entra}`.trim();
  }
  if (ev.type === "GOL_FATTO"){
    const base = ev.p1 || "";
    const a = ev.assist ? ` (${ev.assist})` : "";
    return `${base}${a}`.trim();
  }
  if (ev.type === "GOL_SUBITO") return "";
  return (ev.p1 || "").trim();
}

// ======================
// Routing
// ======================
function applyDefaultsForTeam(team){
  const def = DEFAULTS[team] || { mode:"11v11", periods:2, min:45 };
  $("setMode").value = def.mode;
  $("setPeriods").value = String(def.periods);
  $("setPeriodMin").value = String(def.min);
  $("setPeriodCustom").value = "";
  updateCustomMinUI();
}

function loadSettingsUIFromDefaults(){
  const team = state.session?.team || TEAMS[0];
  $("setTeam").value = team;
  applyDefaultsForTeam(team);

  const d = new Date();
  $("setDate").value = d.toISOString().slice(0,10);

  const nq = nextQuarterTime();
  $("setTime").value = `${pad2(nq.getHours())}:${pad2(nq.getMinutes())}`;

  $("setOpponent").value = "";
  setVenue("Casa");
  setAlerts(true);
}

function route(){
  if (!state.session){
    setPage("Login","view-login");
    return;
  }

  const sess = getCurrentSession();
  const m = sess?.currentMatch;

  if (m && m.status === "LIVE"){
    setPage("Referto Live","view-live");
    refreshLiveUI();
    startTicker();
    return;
  }
  if (m && m.status === "CLOSE"){
    setPage("Referto Chiusura","view-close");
    refreshCloseUI();
    return;
  }
  if (m && m.status === "EXPORT"){
    setPage("Referto Export","view-export");
    refreshExportUI();
    return;
  }

  setPage("Impostazioni del Match","view-settings");
  loadSettingsUIFromDefaults();
}

// ======================
// Actions
// ======================
async function onLogin(){
  const team = $("teamSelect").value;
  const pass = $("passwordInput").value || "";

  if (pass !== PASSWORD){
    await showMessage("Errore","Password errata");
    return;
  }

  const remember = !!$("rememberPw").checked;
  localStorage.setItem(LS_REMEMBER, remember ? "1" : "0");
  if (remember) localStorage.setItem(LS_SAVED_PW, pass);
  else localStorage.removeItem(LS_SAVED_PW);

  state.session = { team };
  saveState();

  setPage("Impostazioni del Match","view-settings");
  loadSettingsUIFromDefaults();
}

async function onOpenMatch(){
  const team = $("setTeam").value;
  const oppRaw = ($("setOpponent").value || "").trim();
  const date = ($("setDate").value || "").trim();
  const time = ($("setTime").value || "").trim();

  if (!oppRaw){ await showMessage("Errore","Inserisci l'avversario"); return; }
  if (!date){ await showMessage("Errore","Inserisci la data"); return; }
  if (!time){ await showMessage("Errore","Inserisci l'ora"); return; }

  const periodMin = getSelectedPeriodMin();
  if (!Number.isFinite(periodMin) || periodMin < 1){
    await showMessage("Errore","Inserisci la durata dei tempi");
    return;
  }

  state.session = { team };
  const sess = getSession(team);

  sess.currentMatch = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "LIVE",
    team,
    opponentRaw: oppRaw,
    opponent: titleCaseWords(oppRaw),
    venue: venueValue,
    date,
    time,
    mode: $("setMode").value,
    periods: parseInt($("setPeriods").value,10),
    periodMin,
    currentPeriod: 1,
    startMs: null,
    running: false,
    alertsEnabled: alertsEnabledValue,
    events: [],
    vote: null,
    notes: "",
    archive: { status:"idle", fileName:"", error:"" }
  };

  saveState();
  setPage("Referto Live","view-live");
  refreshLiveUI();
  startTicker();
}

function onPlay(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;
  if (m.running) return;
  ensureAudioUnlocked();
  if (m.alertsEnabled !== false){
    soundStart();
    vibrate([60]);
  }
  m.startMs = nowMs();
  m.running = true;
  saveState();
  refreshLiveUI();
}

function advancePeriod(m){
  m.running = false;
  m.startMs = null;
  if (m.currentPeriod < m.periods) m.currentPeriod += 1;
}

async function onResetClicked(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  const done = isPeriodDone(m);

  if (done){
    advancePeriod(m);
    saveState();
    refreshLiveUI();
    return;
  }

  if (m.running){
    const r = await showConfirm("Reset","Confermi reset? (Passa al tempo successivo)","Sì","No");
    if (!r.ok) return;
    advancePeriod(m);
    saveState();
    refreshLiveUI();
    return;
  }

  const r2 = await showConfirm("Reset","Confermi cambio tempo?","Sì","No");
  if (!r2.ok) return;
  advancePeriod(m);
  saveState();
  refreshLiveUI();
}

function autoMinute(match){
  return match.running ? currentMinute(match) : 1;
}

async function onEventClick(type){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  if (type === "GOL_SUBITO"){
    m.events.push({
      id: crypto.randomUUID(),
      period: m.currentPeriod,
      minute: autoMinute(m),
      type,
      p1raw: "", p1: "",
      p2raw: "", p2: "",
      assistRaw: "", assist: "",
      ts: new Date().toISOString()
    });
    saveState();
    refreshLiveUI();
    return;
  }

  const res = await showEventModal({ title: labelType(type), type, match: m });
  if (!res.ok) return;

  const ev = {
    id: crypto.randomUUID(),
    period: res.period,
    minute: res.minute,
    type,
    p1raw: res.p1raw,
    p1: titleCaseWords(res.p1raw),
    p2raw: res.p2raw,
    p2: titleCaseWords(res.p2raw),
    assistRaw: res.assistRaw,
    assist: titleCaseWords(res.assistRaw),
    ts: new Date().toISOString()
  };

  m.events.push(ev);
  saveState();
  refreshLiveUI();
}

async function onEditEvent(id){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;
  const ev = m.events.find(e=>e.id===id);
  if (!ev) return;

  const res = await showEventModal({
    title: "Modifica evento",
    type: ev.type,
    match: m,
    editingEvent: ev
  });
  if (!res.ok) return;

  ev.period = res.period;
  ev.minute = res.minute;
  ev.p1raw = res.p1raw; ev.p1 = titleCaseWords(res.p1raw);
  ev.p2raw = res.p2raw; ev.p2 = titleCaseWords(res.p2raw);
  ev.assistRaw = res.assistRaw; ev.assist = titleCaseWords(res.assistRaw);

  saveState();
  refreshLiveUI();
}

async function onDeleteEvent(id){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  const r = await showConfirm("Elimina","Eliminare evento?","Sì","No");
  if (!r.ok) return;

  m.events = m.events.filter(e=>e.id!==id);
  saveState();
  refreshLiveUI();
}

function onGoClose(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;
  m.status = "CLOSE";
  saveState();
  stopTicker();
  setPage("Referto Chiusura","view-close");
  refreshCloseUI();
}

async function onCloseMatch(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  const voteRaw = ($("matchVote").value || "").trim();
  if (!voteRaw){
    await showMessage("Errore","Voto obbligatorio");
    return;
  }

  m.vote = parseFloat(voteRaw);
  m.notes = ($("matchNotes").value || "").trim();

  const r = await showConfirm("Chiusura","Confermi chiusura referto?","Sì","No");
  if (!r.ok) return;

  m.status = "EXPORT";
  if (!m.archive) m.archive = { status:"idle", fileName:"", error:"" };
  if (m.archive.status !== "done") m.archive.status = "idle";
  saveState();

  setPage("Referto Export","view-export");
  refreshExportUI();

  triggerAutoUpload(false);
}

// ======================
// Live UI
// ======================
function refreshLiveUI(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  const ha = computeHomeAway(m);
  $("teamHome").textContent = ha.homeTeam;
  $("teamAway").textContent = ha.awayTeam;
  $("scoreHome").textContent = String(ha.homeScore);
  $("scoreAway").textContent = String(ha.awayScore);

  $("metaLine").textContent = `${m.date} ${m.time} • ${m.mode} • ${m.periods} tempi x ${m.periodMin}’`;

  renderPeriodButtons(m);

  const box = $("timerBox");
  const hint = $("timerHint");
  const btnReset = $("btnReset");

  if (!m.running){
    box.className = "timer idle";
    box.textContent = "00:00";
    hint.textContent = `Tempo ${m.currentPeriod}/${m.periods} • Durata ${m.periodMin} min`;
    btnReset.textContent = "⟲ RESET";
  } else {
    const done = isPeriodDone(m);
    const elapsed = computeElapsedSec(m);
    const remaining = computeRemainingSec(m);

    // ===== Avvisi (una sola volta per tempo) =====
    if (!m.alerts) m.alerts = {};
    const k30 = `p${m.currentPeriod}_30`;
    const kDone = `p${m.currentPeriod}_done`;

    if (!done && remaining <= 30 && remaining >= 0 && !m.alerts[k30]){
      vibrate([120,80,120]); // 30 secondi (iPhone potrebbe ignorare)
      soundWarn30();
      m.alerts[k30] = true;
      saveState();
    }
    if (done && !m.alerts[kDone]){
      vibrate([200,100,200,100,200]); // scaduto (iPhone potrebbe ignorare)
      soundEnd();
      m.alerts[kDone] = true;
      saveState();
    }


    if (done){
      box.className = "timer done blink";
      box.textContent = formatMMSS(m.periodMin*60);
      hint.textContent = "Tempo terminato • Premi Cambia Tempo";
      btnReset.textContent = "↪ CAMBIA TEMPO";
    } else {
      box.className = (remaining <= 30) ? "timer warning" : "timer running";
      box.textContent = formatMMSS(elapsed);
      hint.textContent = `Mancano ${formatMMSS(remaining)} alla fine del tempo`;
      btnReset.textContent = "⟲ RESET";
    }
  }


  // ===== Badges conteggio eventi =====
  const evs = (m.events || []);
  const ammCount = evs.filter(e=>e.type==="AMMONIZIONE").length;
  const espCount = evs.filter(e=>e.type==="ESPULSIONE").length;
  const subCount = evs.filter(e=>e.type==="SOSTITUZIONE").length;

  const setBadge = (id, n)=>{
    const el = $(id);
    if (!el) return;
    if (n > 0){
      el.textContent = String(n);
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  };
  setBadge("ammBadge", ammCount);
  setBadge("espBadge", espCount);
  setBadge("subBadge", subCount);

  renderEventsList(m, $("eventsList"));
}

function renderPeriodButtons(m){
  const pb = $("periodButtons");
  pb.innerHTML = "";

  const done = isPeriodDone(m);
  const runningLock = m.running && !done;

  for (let i=1; i<=m.periods; i++){
    const btn = document.createElement("button");
    btn.className = "periodBtn";
    btn.textContent = `${i}°T`;

    const isSelected = i === m.currentPeriod;
    if (isSelected && !m.running) btn.classList.add("periodBtnSelectedStopped");
    if (isSelected && m.running) btn.classList.add("periodBtnSelectedRunning");

    if (runningLock && !isSelected){
      btn.classList.add("periodBtnDisabledRunning");
      btn.disabled = true;
    }

    btn.disabled = btn.disabled || runningLock;

    btn.addEventListener("click", ()=>{
      if (btn.disabled) return;
      m.currentPeriod = i;
      saveState();
      refreshLiveUI();
    });

    pb.appendChild(btn);
  }
}

function renderEventsList(m, listEl){
  listEl.innerHTML = "";

  const events = [...m.events].sort((a,b)=>{
    if (a.period !== b.period) return a.period - b.period;
    if (a.minute !== b.minute) return a.minute - b.minute;
    return (a.ts||"").localeCompare(b.ts||"");
  }).reverse();

  for (const ev of events){
    const row = document.createElement("div");
    row.className = "eventRow";

    const left = document.createElement("div");
    left.className = "evLeft";

    const pill = document.createElement("div");
    pill.className = "evPillTime";
    pill.textContent = labelTime(ev);

    const tag = document.createElement("div");
    tag.className = "evTag";
    tag.textContent = labelType(ev.type);
    tag.dataset.type = ev.type;

    left.appendChild(pill);
    left.appendChild(tag);

    const divider = document.createElement("div");
    divider.className = "evDivider";

    const main = document.createElement("div");
    main.className = "evMain";
    main.textContent = compactMainText(ev);

    const actions = document.createElement("div");
    actions.className = "evActions";

    const edit = document.createElement("span");
    edit.className = "actionLink";
    edit.textContent = "MODIFICA";
    edit.addEventListener("click", ()=> onEditEvent(ev.id));

    const del = document.createElement("span");
    del.className = "actionLink";
    del.textContent = "ELIMINA";
    del.addEventListener("click", ()=> onDeleteEvent(ev.id));

    actions.appendChild(edit);
    actions.appendChild(del);

    row.appendChild(left);
    row.appendChild(divider);
    row.appendChild(main);
    row.appendChild(actions);

    listEl.appendChild(row);
  }
}

// ======================
// Close UI
// ======================
function refreshCloseUI(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  const ha = computeHomeAway(m);
  $("teamHomeClose").textContent = ha.homeTeam;
  $("teamAwayClose").textContent = ha.awayTeam;
  $("scoreHomeClose").textContent = String(ha.homeScore);
  $("scoreAwayClose").textContent = String(ha.awayScore);

  $("metaLineClose").textContent = `${m.date} ${m.time} • ${m.mode} • ${m.periods} tempi x ${m.periodMin}’`;

  $("matchVote").value = (m.vote ?? "");
  $("matchNotes").value = (m.notes ?? "");
}

// ======================
// Export
// ======================
function buildWhatsAppText(match){
  const { gf, gs } = computeGoals(match);
  const { gfBy, gsBy } = computeGoalsByPeriod(match);

  const alto = altoLabel(match);
  const opp = match.opponent;

  const voteLine = `Voto: ${match.vote ?? ""}`.trim();

  if (match.periods === 2){
    const scoreLine = `${alto} vs ${opp}: ${gf} - ${gs}`;
    const scorers = match.events
      .filter(e=>e.type==="GOL_FATTO" && e.p1)
      .map(e=>{
        // qui non metto assist per whatsapp (come avevi prima)
        return e.p1;
      });
    const scorersLine = scorers.length ? scorers.join(", ") : "";
    return [scoreLine, scorersLine, voteLine].filter(Boolean).join("\n");
  }

  const lines = [];
  lines.push(`${alto} vs ${opp}`);

  for (let i=1; i<=match.periods; i++){
    const scorers = match.events
      .filter(e=>e.type==="GOL_FATTO" && e.period===i && e.p1)
      .map(e=>e.p1);
    const scorersLine = scorers.length ? ` | ${scorers.join(", ")}` : "";
    lines.push(`${i}°T ${gfBy[i]} - ${gsBy[i]}${scorersLine}`);
  }

  lines.push(voteLine);
  return lines.filter(Boolean).join("\n");
}

function setDriveLine(text){
  const el = $("driveLine");
  if (el) el.textContent = text;
}

function refreshExportUI(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  $("waPreview").value = buildWhatsAppText(m);

  const a = m.archive || { status:"idle", fileName:"", error:"" };

  if (a.status === "idle") {
    setDriveLine("Caricamento su GoogleDrive – In attesa…");
    $("archiveStatus").textContent = "";
  } else if (a.status === "uploading") {
    setDriveLine("Caricamento su GoogleDrive – In corso…");
    $("archiveStatus").textContent = "";
  } else if (a.status === "done") {
    setDriveLine("Caricamento su GoogleDrive – Completato!");
    $("archiveStatus").textContent = a.fileName ? `Salvato: ${a.fileName}` : "";
  } else if (a.status === "error") {
    setDriveLine("Caricamento su GoogleDrive – Errore!");
    $("archiveStatus").textContent = a.error ? `Dettaglio: ${a.error}` : "Errore sconosciuto";
  }
}

async function onCopyWhatsApp(){
  try{
    await navigator.clipboard.writeText($("waPreview").value);
    showToast("Copiato");
  } catch {
    await showMessage("Errore","Copia non riuscita");
  }
}

/* ✅ PDF: assist solo (Nome) */
function onDownloadPDF(){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  const html = buildPrintableHTML(m);
  const w = window.open("", "_blank");
  if (!w){
    showMessage("Errore","Popup bloccato dal browser");
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=> w.print(), 350);
}

function buildPrintableHTML(m){
  const alto = altoLabel(m);
  const opp = m.opponent;
  const { gf, gs } = computeGoals(m);
  const { gfBy, gsBy } = computeGoalsByPeriod(m);

  let ptsFor = 0, ptsAgainst = 0;
  const perPeriodLines = [];
  for (let i=1; i<=m.periods; i++){
    const pts = computePeriodPoints(gfBy[i], gsBy[i]);
    ptsFor += pts.pFor;
    ptsAgainst += pts.pAgainst;
    perPeriodLines.push({ i, goals: `${gfBy[i]} - ${gsBy[i]}`, points: pts.label });
  }

  const events = [...m.events].sort((a,b)=>a.period-b.period || a.minute-b.minute);
  const rows = events.map(e=>{
    const t = `${e.period}°T`;
    const min = `${e.minute}'`;
    const type = labelType(e.type);

    let det = "";
    if (e.type === "SOSTITUZIONE") det = `↓ ${e.p1 || ""}  |  ↑ ${e.p2 || ""}`;
    else if (e.type === "GOL_FATTO"){
      det = (e.p1 || "");
      if (e.assist) det += ` (${e.assist})`;
    }
    else if (e.type === "GOL_SUBITO") det = "";
    else det = (e.p1 || "");

    const bg = pdfEventBg(e.type);
    return `<tr style="background:${bg}">
      <td>${t}</td><td>${min}</td><td><b>${type}</b></td><td>${escapeHtml(det)}</td>
    </tr>`;
  }).join("");

  const logoPath = "https://apianta91.github.io/agreferti/logo.png";

  const resultsBlock = (m.periods <= 2)
    ? `
      <div class="resRow">
        <div class="box">
          <div class="boxTitle">Risultato</div>
          <div class="bigScore">${gf} - ${gs}</div>
        </div>
      </div>
    `
    : `
      <div class="resGrid">
        <div class="box">
          <div class="boxTitle">Totale Gol</div>
          <div class="bigScore">${gf} - ${gs}</div>
        </div>
        <div class="box">
          <div class="boxTitle">Somma Tempi (1/0/1)</div>
          <div class="bigScore">${ptsFor} - ${ptsAgainst}</div>
        </div>
      </div>
      <div class="miniTable">
        <div class="miniHead">
          <div>Tempo</div><div>Gol</div><div>Esito Tempo</div>
        </div>
        ${perPeriodLines.map(x=>`
          <div class="miniRow">
            <div>${x.i}°T</div><div>${x.goals}</div><div>${x.points}</div>
          </div>
        `).join("")}
      </div>
    `;

  return `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Referto</title>
  <style>
    body{font-family:Arial;margin:22px;color:#111}
    .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    .logo{width:70px;height:70px;object-fit:contain}
    h1{margin:0;font-size:18px;letter-spacing:.02em}
    .sub{margin-top:6px;color:#444;font-size:12px}
    .line{height:1px;background:#ddd;margin:12px 0}
    .box{border:1px solid #ddd;border-radius:12px;padding:10px}
    .boxTitle{font-size:11px;color:#444;text-transform:uppercase;letter-spacing:.08em;font-weight:bold}
    .bigScore{font-size:26px;font-weight:bold;margin-top:6px}
    .resGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
    .resRow{margin-top:10px}
    .miniTable{margin-top:10px;border:1px solid #ddd;border-radius:12px;overflow:hidden}
    .miniHead{display:grid;grid-template-columns:1fr 1fr 1fr;padding:8px 10px;background:#f3f4f6;font-weight:bold;font-size:12px}
    .miniRow{display:grid;grid-template-columns:1fr 1fr 1fr;padding:8px 10px;border-top:1px solid #eee;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;font-size:12px}
    th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .foot{margin-top:12px;display:grid;grid-template-columns:1fr 2fr;gap:10px}
    .noteBox{min-height:74px;white-space:pre-wrap}
  </style></head><body>

    <div class="head">
      <div>
        <h1>${escapeHtml(alto)} vs ${escapeHtml(opp)}</h1>
        <div class="sub"><b>Data:</b> ${escapeHtml(m.date)} &nbsp; <b>Ora:</b> ${escapeHtml(m.time)}</div>
        <div class="sub"><b>Sede:</b> ${escapeHtml(m.venue)} &nbsp; <b>Modalità:</b> ${escapeHtml(m.mode)} &nbsp; <b>Tempi:</b> ${m.periods} x ${m.periodMin}’</div>
      </div>
      <img class="logo" src="${logoPath}" alt="Logo">
    </div>

    ${resultsBlock}

    <div class="line"></div>

    <h2 style="margin:0 0 8px;font-size:14px;letter-spacing:.08em;text-transform:uppercase">Eventi</h2>
    <table>
      <thead>
        <tr>
          <th style="width:70px">Tempo</th>
          <th style="width:60px">Min</th>
          <th style="width:140px">Evento</th>
          <th>Dettaglio</th>
        </tr>
      </thead>
      <tbody>${rows || ""}</tbody>
    </table>

    <div class="foot">
      <div class="box">
        <div class="boxTitle">Voto</div>
        <div class="bigScore" style="font-size:22px">${(m.vote ?? "")}</div>
      </div>
      <div class="box">
        <div class="boxTitle">Note</div>
        <div class="noteBox">${escapeHtml(m.notes || "")}</div>
      </div>
    </div>

  </body></html>`;
}

function pdfEventBg(type){
  switch(type){
    case "GOL_FATTO": return "#D1FAE5";
    case "GOL_SUBITO": return "#FFEDD5";
    case "AMMONIZIONE": return "#FEF9C3";
    case "ESPULSIONE": return "#FEE2E2";
    case "TIRO": return "#DBEAFE";
    case "SOSTITUZIONE": return "#F3F4F6";
    default: return "#FFFFFF";
  }
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// ======================
// DRIVE UPLOAD (no-cors)
// ======================
async function uploadMatchToDrive(force=false){

  const sess = getCurrentSession();
  const m = sess?.currentMatch;
  if (!m) return;

  if (!m.archive) m.archive = {status:"idle",fileName:"",error:""};

  if(!force && (m.archive.status==="done" || m.archive.status==="uploading"))
    return;

  m.archive.status="uploading";
  m.archive.error="";
  m.archive.fileName="";

  saveState();
  refreshExportUI();

  try{

    const html = buildPrintableHTML(m);

    const fileName =
      `${m.date}_${m.time.replace(":","")}_${m.team}_vs_${m.opponent}.pdf`
      .replaceAll(" ","_");

    const resp = await fetch(ARCHIVE_ENDPOINT,{
      method:"POST",
      headers:{
        "Content-Type":"text/plain;charset=UTF-8"
      },
      body:JSON.stringify({
        token:ARCHIVE_TOKEN,
        html:html,
        fileName:fileName
      })
    });

    const text = await resp.text();
    const out = JSON.parse(text);

    if(out.ok){
      m.archive.status="done";
      m.archive.fileName=fileName;
    }else{
      throw new Error(out.error);
    }

  }catch(err){
    m.archive.status="error";
    m.archive.error=String(err);
  }

  saveState();
  refreshExportUI();
}

function triggerAutoUpload(force){
  uploadMatchToDrive(!!force);
}

// ======================
// Back + Restart
// ======================
async function onRestart(){
  const r = await showConfirm("Ricomincia","Vuoi tornare al login?","Sì","No");
  if (!r.ok) return;

  const sess = getCurrentSession();
  if (sess) sess.currentMatch = null;

  saveState();
  setPage("Login","view-login");
}

function backToPreviousFrom(view){
  const sess = getCurrentSession();
  const m = sess?.currentMatch;

  if (view === "settings"){
    state.session = null;
    saveState();
    stopTicker();
    setPage("Login","view-login");
    return;
  }

  if (view === "live"){
    if (m){
      const team = state.session?.team;
      if (team && state.sessionsByTeam[team]) state.sessionsByTeam[team].currentMatch = null;
      saveState();
    }
    stopTicker();
    setPage("Impostazioni del Match","view-settings");
    loadSettingsUIFromDefaults();
    return;
  }

  if (view === "close"){
    if (m){
      m.status = "LIVE";
      saveState();
      setPage("Referto Live","view-live");
      refreshLiveUI();
      startTicker();
    }
    return;
  }

  if (view === "export"){
    if (m){
      m.status = "CLOSE";
      saveState();
      setPage("Referto Chiusura","view-close");
      refreshCloseUI();
    }
  }
}

// ======================
// Ticker
// ======================
let ticker = null;
function startTicker(){
  if (ticker) return;
  ticker = setInterval(()=>{
    const sess = getCurrentSession();
    const m = sess?.currentMatch;
    if (!m || m.status !== "LIVE") return;
    refreshLiveUI();
  }, 400);
}
function stopTicker(){
  if (ticker){ clearInterval(ticker); ticker = null; }
}

// ======================
// INIT
// ======================
function init(){
  document.addEventListener("pointerdown", ()=>ensureAudioUnlocked(), { once:true });
  fillSelect($("teamSelect"), TEAMS);
  fillSelect($("setTeam"), TEAMS);

  const remember = localStorage.getItem(LS_REMEMBER) === "1";
  $("rememberPw").checked = remember;
  if (remember){
    const saved = localStorage.getItem(LS_SAVED_PW) || "";
    if (saved) $("passwordInput").value = saved;
  }

  initModal();

  $("btnLogin").addEventListener("click", onLogin);
  $("btnOpenMatch").addEventListener("click", onOpenMatch);

  $("venueCasa").addEventListener("click", ()=> setVenue("Casa"));
  $("venueTrasferta").addEventListener("click", ()=> setVenue("Trasferta"));

  $("alertsOn").addEventListener("click", ()=> setAlerts(true));
  $("alertsOff").addEventListener("click", ()=> setAlerts(false));

  $("btnPlay").addEventListener("click", onPlay);
  $("btnReset").addEventListener("click", onResetClicked);

  $("setPeriodMin").addEventListener("change", updateCustomMinUI);

  document.querySelectorAll(".eventBtn").forEach(btn=>{
    btn.addEventListener("click", ()=> onEventClick(btn.dataset.ev));
  });

  $("btnGoClose").addEventListener("click", onGoClose);
  $("btnCloseMatch").addEventListener("click", onCloseMatch);

  $("btnCopyWhatsApp").addEventListener("click", onCopyWhatsApp);
  $("btnDownloadPDF").addEventListener("click", onDownloadPDF);

  $("btnRestart").addEventListener("click", onRestart);

  $("setTeam").addEventListener("change", ()=>{
    applyDefaultsForTeam($("setTeam").value);
  });

  $("btnBackSettings").addEventListener("click", ()=> backToPreviousFrom("settings"));
  $("btnBackLive").addEventListener("click", ()=> backToPreviousFrom("live"));
  $("btnBackClose").addEventListener("click", ()=> backToPreviousFrom("close"));
  $("btnBackExport").addEventListener("click", ()=> backToPreviousFrom("export"));

  updateCustomMinUI();
  route();
}

init();
