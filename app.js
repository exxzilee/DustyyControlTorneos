// ═══ PICADAS AR v4 — app.js ══════════════════════════════════════

// ═══ ESTADO GLOBAL ═══════════════════════════════════════════════
let _authMode = 'login'; // 'login' | 'register'
let _isGuest  = false;
let _isAdmin  = false;   // true si el UID del usuario está en /admins
let _userRole = null;   // 'superadmin' | 'admin' | 'mod' | null

// ═══ SOUNDS ════════════════════════════════════════════════════════
const sndClick = new Audio('audio/click.mp3'); sndClick.volume = 0.2;
const sndOpen = new Audio('audio/open.mp3'); sndOpen.volume = 0.2;
const sndSucc = new Audio('audio/success.mp3'); sndSucc.volume = 0.2;

function playClick() { try{ sndClick.currentTime=0; sndClick.play().catch(()=>{}); }catch(e){} }
function playOpen()  { try{ sndOpen.currentTime=0; sndOpen.play().catch(()=>{}); }catch(e){} }
function playChime() { try{ sndSucc.currentTime=0; sndSucc.play().catch(()=>{}); }catch(e){} }

// ═══ CONSTANTS ═══════════════════════════════════════════════════
const TOPES = {
  C1:{label:'CLASE 1',tope:11.30}, C2:{label:'CLASE 2',tope:10.80},
  C3:{label:'CLASE 3',tope:10.30}, C4:{label:'CLASE 4',tope:9.70},
  C5:{label:'CLASE 5',tope:9.00},  C6:{label:'CLASE 6',tope:8.50},
  C7:{label:'CLASE 7',tope:8.00},  C8:{label:'CLASE 8',tope:7.60},
  C9:{label:'CLASE 9',tope:7.20},  C10:{label:'CLASE 10',tope:6.70},
  L1:{label:'LIBRE L1',tope:null}
};
const CLASE_OPTS = Object.entries(TOPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');

// ═══ FIREBASE DATA LAYER ══════════════════════════════════════════
let _cache = {jugadores:[],torneos:[],llaves:[],changelog:[]};
let _dataLoaded = false;
function load(){return _cache;}
function save(state){
  _cache=state;
  if(!_isAdmin) return;
  dbRef.set(state).catch(err=>{console.error(err);toast('Error al guardar.','err');});
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}

// ═══ CHANGELOG ═══════════════════════════════════════════════════
function logChange(tipo,desc){
  const s=load();
  if(!s.changelog)s.changelog=[];
  s.changelog.unshift({id:uid(),fecha:new Date().toLocaleString('es-AR'),tipo,desc});
  if(s.changelog.length>100)s.changelog=s.changelog.slice(0,100);
  save(s);
}

// ═══ VIP ADMIN ═════════════════════════════════════════════════════
window.grantVip = function(pid, ev) {
  if (ev) ev.stopPropagation();
  const state = load();
  const idx = state.jugadores.findIndex(x=>x.id===pid);
  if(idx < 0) return;
  const isV = !!state.jugadores[idx].isVIP;
  if(confirm(isV ? "¿Quitar VIP a este piloto?" : "¿Otorgar Membresía VIP a este piloto?")) {
    state.jugadores[idx].isVIP = !isV;
    playChime();
    save(state);
    renderJugadores();
    logChange('VIP', `Privilegios ${!isV?'otorgados a':'removidos de'} ${state.jugadores[idx].username}`);
    toast(`VIP ${!isV?'Otorgado':'Removido'}`, 'ok');
  }
};

// ═══ GRANT ADMIN ══════════════════════════════════════════════════
window.confirmGrantAdmin = function() {
  const uid = document.getElementById('ga-uid').value.trim();
  if (!uid) {
    toast('El UID no puede estar vacío.', 'err');
    return;
  }
  if (uid.length < 20) {
    toast('El UID parece inválido (muy corto).', 'err');
    return;
  }
  if (confirm(`¿Otorgar privilegios de ADMIN al usuario ${uid}?`)) {
    saveGrantAdmin(uid);
  }
};

async function saveGrantAdmin(uid) {
  try {
    await db.ref('admins/' + uid).set(true);
    playChime();
    toast('✓ Admin otorgado correctamente', 'ok');
    document.getElementById('ga-uid').value = '';
    logChange('ADMIN', `Privilegios de admin otorgados al UID ${uid}`);
    loadAdminsList();
  } catch (err) {
    console.error('Error al otorgar admin:', err);
    toast('Error al otorgar admin. Verificá tu conexión.', 'err');
  }
}

async function loadAdminsList() {
  const container = document.getElementById('ga-admin-list');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--text3);font-size:.82rem;padding:.4rem 0;">Cargando...</div>';
  try {
    const snap = await db.ref('admins').once('value');
    const admins = snap.val() || {};
    const uids = Object.keys(admins).filter(k => admins[k] === true);
    if (!uids.length) {
      container.innerHTML = '<div style="color:var(--text3);font-size:.82rem;padding:.4rem 0;">No hay admins registrados.</div>';
      return;
    }
    const currentUid = auth.currentUser?.uid;
    container.innerHTML = uids.map(u => {
      const isSelf = u === currentUid;
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.55rem 0;border-bottom:1px solid rgba(255,255,255,.05);">
        <span style="font-family:var(--mono);font-size:.75rem;color:${isSelf?'var(--accent)':'var(--text2)'};word-break:break-all;">${u}${isSelf?' <span style="color:var(--text3);font-size:.65rem;">(vos)</span>':''}</span>
        ${isSelf
          ? '<span style="font-size:.7rem;color:var(--text3);flex-shrink:0;">Tu cuenta</span>'
          : `<button class="btn btn-danger btn-sm" style="flex-shrink:0;font-size:.7rem;" onclick="revokeAdmin('${u}')">REVOCAR</button>`}
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = '<div style="color:var(--red);font-size:.82rem;padding:.4rem 0;">Error al cargar lista.</div>';
  }
}

window.revokeAdmin = async function(uid) {
  if (!confirm(`¿Revocar privilegios de admin al UID\n${uid}?`)) return;
  try {
    await db.ref('admins/' + uid).remove();
    toast('Admin revocado', 'ok');
    logChange('ADMIN', `Privilegios de admin revocados al UID ${uid}`);
    loadAdminsList();
  } catch(e) {
    console.error(e);
    toast('Error al revocar admin.', 'err');
  }
};

function openAdminPanel() {
  openModal('modal-grant-admin');
  loadAdminsList();
}

// ═══ INIT ════════════════════════════════════════════════════════
document.getElementById('searchPiloto').value='';
// Poblar select de clases en modal de inscripción
const irClase=document.getElementById('ir-clase');
if(irClase)irClase.innerHTML=CLASE_OPTS;
function renderAuthScreen(){
  const isL=_authMode==='login';
  document.getElementById('auth-screen').innerHTML=`
    <div class="auth-banner" aria-hidden="true"></div>
    <div class="auth-box">
      <div class="auth-logo">
        <img src="logotipos/LogoWhite512.png" alt="Dusty" style="filter:invert(1) drop-shadow(0 4px 22px rgba(255,87,34,0.55));">
        <div class="logo-main"><span style="background:linear-gradient(135deg,#FF5722,#FF8A4C);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">DUSTY</span> · PICADAS AR</div>
        <div class="logo-sub">COMUNIDAD · PISTA · RANKING</div>
      </div>
      <div class="modal-title">${isL?'Iniciar sesión':'Crear cuenta'}</div>
      <div class="form-row"><label>Email</label><input type="email" id="auth-email" placeholder="admin@picadas.com"></div>
      <div class="form-row"><label>Contraseña</label><input type="password" id="auth-pass" placeholder="${isL?'Tu contraseña':'Mínimo 6 caracteres'}"></div>
      <div class="modal-actions" style="justify-content:center;flex-direction:column;gap:.7rem;">
        <button class="btn btn-primary" onclick="doAuth()" style="width:100%;justify-content:center;">${isL?'Entrar':'Crear cuenta'}</button>
        <div style="display:flex;align-items:center;gap:.8rem;width:100%;">
          <div style="flex:1;height:1px;background:var(--glass-border);"></div>
          <span style="font-size:.75rem;color:var(--text2);">o</span>
          <div style="flex:1;height:1px;background:var(--glass-border);"></div>
        </div>
        <button class="btn btn-ghost" onclick="doGoogleAuth()" style="width:100%;justify-content:center;gap:.6rem;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continuar con Google
        </button>
      </div>
      <div class="auth-error" id="auth-error"></div>


    </div>`;
  setTimeout(()=>document.getElementById('auth-email')?.focus(),100);
  document.getElementById('auth-screen').querySelectorAll('input').forEach(i=>{
    i.addEventListener('keydown',e=>{if(e.key==='Enter')doAuth();});
  });
}

function doAuth(){
  const email=document.getElementById('auth-email').value.trim();
  const pass=document.getElementById('auth-pass').value;
  const errEl=document.getElementById('auth-error');
  if(!email||!pass){errEl.textContent='Completá email y contraseña.';return;}
  errEl.textContent='';
  auth.signInWithEmailAndPassword(email,pass)
    .catch(err=>{
      const m={'auth/user-not-found':'No existe esa cuenta.','auth/wrong-password':'Contraseña incorrecta.',
        'auth/invalid-credential':'Credenciales inválidas.','auth/email-already-in-use':'Email ya registrado.',
        'auth/weak-password':'Mínimo 6 caracteres.','auth/invalid-email':'Email inválido.',
        'auth/too-many-requests':'Demasiados intentos.'};
      errEl.textContent=m[err.code]||err.message;
    });
}

function doGoogleAuth(){
  auth.signInWithPopup(googleProvider).catch(err=>{
    const errEl=document.getElementById('auth-error');
    if(errEl)errEl.textContent=err.message;
  });
}

async function checkAdminRole(user){
  if(!user){_isAdmin=false;_userRole=null;return false;}
  // Migración única: si el usuario inició sesión con email/password y aún no
  // está en admins/, se registra automáticamente. Esto garantiza que el admin
  // original (que no tenía UID en la DB) quede registrado al primer login.
  // Una vez completada la migración, este bloque puede eliminarse junto con
  // la cláusula sign_in_provider==='password' de las Firebase Rules.
  const provider=user.providerData[0]?.providerId;
  if(provider==='password'){
    try{
      const existsSnap=await db.ref('admins/'+user.uid).once('value');
      if(existsSnap.val()!==true){
        await db.ref('admins/'+user.uid).set(true);
        console.info('[admin] UID registrado en /admins (migración inicial)');
      }
    }catch(e){console.warn('[admin] No se pudo auto-registrar UID:',e);}
  }
  // Fuente de verdad: siempre verificar contra la DB
  try{
    const snap=await db.ref('admins/'+user.uid).once('value');
    _isAdmin=snap.val()===true;
  }catch(e){_isAdmin=false;}
  // Cargar rol jerárquico (requiere nodo roles/ en Firebase Rules)
  _userRole=null;
  if(_isAdmin){
    try{
      const roleSnap=await db.ref('roles/'+user.uid).once('value');
      _userRole=roleSnap.val()||'admin';
    }catch(e){_userRole='admin';}
  }
  return _isAdmin;
}

function logout(){
  _isAdmin=false;
  if(_isGuest){
    _isGuest=false;
    document.body.classList.remove('guest-mode');
    document.getElementById('guest-banner').style.display='none';
    document.getElementById('app-wrapper').style.display='none';
    document.getElementById('auth-screen').style.display='';
    stopRealtimeSync();_dataLoaded=false;_cache={jugadores:[],torneos:[],llaves:[],changelog:[]};renderAuthScreen();return;
  }
  auth.signOut();
}

// ─── Actualiza el bloque de usuario (avatar + rol) ──────────────
function updateUserBlock(label, role) {
  // role: 'admin' | 'spectator' | 'guest'
  const emailEl  = document.getElementById('user-email');
  const avatarEl = document.getElementById('user-avatar');
  const roleEl   = document.getElementById('user-role');
  const roleTxt  = document.getElementById('user-role-text');
  const adminBtn = document.getElementById('btn-admin-settings');
  if (emailEl)  emailEl.textContent = label || '—';
  if (avatarEl) {
    const initial = (label && label.length) ? label.charAt(0).toUpperCase() : 'D';
    avatarEl.textContent = initial;
  }
  if (roleEl) {
    roleEl.classList.remove('admin','spectator');
    if (role === 'admin')     { roleEl.classList.add('admin'); }
    else                       { roleEl.classList.add('spectator'); }
  }
  if (roleTxt) {
    const roleLabels = {superadmin:'SUPER ADMIN',admin:'ADMINISTRADOR',mod:'MODERADOR'};
    roleTxt.textContent = role === 'admin'
      ? (roleLabels[_userRole] || 'ADMINISTRADOR')
      : (role === 'guest' ? 'ESPECTADOR' : 'CONECTADO');
  }
  if (adminBtn) {
    adminBtn.style.display = role === 'admin' ? '' : 'none';
  }
}

// ─── Refresh de stats del hero (sin afectar nada existente) ─────
function refreshHeroStats() {
  const s = load();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const pilotos = (s.jugadores || []).length;
  const vips    = (s.jugadores || []).filter(p => p.isVIP).length;
  const torneos = (s.torneos   || []).filter(t => t.estado !== 'finalizado').length;
  let eventos = 0;
  (s.torneos || []).forEach(t => {
    (t.rondas || []).forEach(r => (r || []).forEach(m => { if (m && m.estado === 'completado') eventos++; }));
  });
  set('hs-pilotos', pilotos);
  set('hs-torneos', torneos);
  set('hs-vips', vips);
  set('hs-eventos', eventos);
}

function enterGuestMode(){
  _isGuest=true;_isAdmin=false;
  document.body.classList.add('guest-mode');
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-wrapper').style.display='block';
  updateUserBlock('Espectador', 'guest');
  document.getElementById('btn-logout').textContent='Iniciar sesión';
  document.getElementById('guest-banner').style.display='block';
  showLoading();startRealtimeSync();
}
function showLoading(){document.getElementById('loading-screen').style.display='';}
function hideLoading(){document.getElementById('loading-screen').style.display='none';}

auth.onAuthStateChanged(async user=>{
  if(user){
    await checkAdminRole(user);
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app-wrapper').style.display='block';
    updateUserBlock(user.displayName||user.email, _isAdmin ? 'admin' : 'spectator');
    document.getElementById('btn-logout').textContent='Cerrar sesión';
    document.getElementById('guest-banner').style.display='none';
    document.body.classList.remove('guest-mode');_isGuest=false;
    if(!_isAdmin) document.body.classList.add('guest-mode');
    showLoading();startRealtimeSync();
  } else {
    _isAdmin=false;
    if(_isGuest)return;
    document.getElementById('auth-screen').style.display='';
    document.getElementById('app-wrapper').style.display='none';
    stopRealtimeSync();_dataLoaded=false;
    _cache={jugadores:[],torneos:[],llaves:[],changelog:[]};renderAuthScreen();
  }
});

// ═══ REALTIME SYNC ═══════════════════════════════════════════════
let _dbListener=null;
function startRealtimeSync(){
  _dbListener=dbRef.on('value',snap=>{
    const d=snap.val();
    _cache=d?{jugadores:d.jugadores||[],torneos:d.torneos||[],llaves:d.llaves||[],changelog:d.changelog||[]}
              :{jugadores:[],torneos:[],llaves:[],changelog:[]};
    _dataLoaded=true;hideLoading();refreshActiveTab();
  },err=>{console.error(err);hideLoading();toast('Error de conexión.','err');});
}
function stopRealtimeSync(){if(_dbListener){dbRef.off('value',_dbListener);_dbListener=null;}}
function refreshActiveTab(){
  refreshHeroStats();
  const a=document.querySelector('section.active');if(!a)return;
  const id=a.id;
  if(id==='jugadores')renderJugadores();
  if(id==='torneos')renderTorneos();
  if(id==='llaves')renderLlaves();
  if(id==='stats')renderStats();
  if(id==='analiticas')renderAnaliticas();
}

// ═══ NAV ═════════════════════════════════════════════════════════
let activeTorneoId=null, activeLlaveId=null;
function goTab(tab){
  playClick();
  const prev=document.querySelector('section.active');
  const next=document.getElementById(tab);
  
  if (tab === 'premium') {
    if (!_isAdmin && _isGuest) {
      document.getElementById('premium-locked').style.display = 'block';
      document.getElementById('premium-unlocked').style.display = 'none';
    } else {
      document.getElementById('premium-locked').style.display = 'none';
      document.getElementById('premium-unlocked').style.display = 'block';
      const adminActions = document.getElementById('premium-admin-actions');
      if (adminActions) adminActions.style.display = _isAdmin ? '' : 'none';
      if(typeof renderPremiumTorneos === 'function') renderPremiumTorneos();
    }
  }
  
  if(prev===next)return;
  const tl=gsap.timeline();
  if(prev){tl.to(prev,{opacity:0,y:-10,duration:.18,ease:'power2.in',onComplete:()=>{prev.classList.remove('active');}});}
  tl.set(next,{opacity:0,y:16}).call(()=>next.classList.add('active'))
    .to(next,{opacity:1,y:0,duration:.28,ease:'power2.out'});
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  const navBtn=document.getElementById('nav-'+tab);
  if(navBtn)navBtn.classList.add('active');
  if(tab==='jugadores')renderJugadores();
  if(tab==='torneos')renderTorneos();
  if(tab==='llaves')renderLlaves();
  if(tab==='stats')renderStats();
  if(tab==='analiticas')renderAnaliticas();
}

// ═══ TOAST ═══════════════════════════════════════════════════════
let _tt;
function toast(msg,type='info'){
  const el=document.getElementById('toast');el.textContent=msg;el.className=`show ${type}`;
  clearTimeout(_tt);_tt=setTimeout(()=>{el.className='';},2800);
}

// ═══ MODALS ══════════════════════════════════════════════════════
function closeModal(id){
  const ov=document.getElementById(id);
  const m=ov?.querySelector('.modal');
  if(m){gsap.to(m,{opacity:0,scale:.96,duration:.18,ease:'power2.in',onComplete:()=>ov.classList.remove('open')});}
  else ov?.classList.remove('open');
}
function openModal(id) {
  if (id === 'modal-premium') {
    const formPanel    = document.getElementById('vip-form-panel');
    const loadingPanel = document.getElementById('vip-loading-panel');
    const errorEl      = document.getElementById('vip-form-error');
    const input        = document.getElementById('vip-username-input');
    if (formPanel)    formPanel.style.display    = '';
    if (loadingPanel) loadingPanel.style.display = 'none';
    if (errorEl)      errorEl.style.display      = 'none';
    if (input)        input.value                = '';
  }
  playOpen();
  const ov=document.getElementById(id);
  ov.classList.add('open');
  const m=ov.querySelector('.modal');
  if(m){gsap.fromTo(m,{opacity:0,scale:.95},{opacity:1,scale:1,duration:.28,ease:'power3.out'});}
}
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)closeModal(o.id);});
});

// ═══ INSCRIPTION HELPERS ═════════════════════════════════════════
function getInscripcion(evento,pilotoId){
  const found=(evento.jugadores||[]).find(j=>
    (typeof j==='object'&&j.pilotoId)?j.pilotoId===pilotoId:j===pilotoId);
  if(!found)return null;
  if(typeof found==='object'&&found.pilotoId)return found;
  return{pilotoId,vehiculo:null,clase:'L1'};
}
function getTopeForPiloto(evento,pilotoId){
  const ins=getInscripcion(evento,pilotoId);
  return TOPES[ins?.clase||'L1']?.tope??null;
}

// ═══ COMPUTED PILOT STATS ════════════════════════════════════════
function computePilotStats(pid,state){
  let v=0,d=0;const ids=new Set(),best={};
  function proc(m,clase){
    if(m.estado!=='completado')return;
    const p1=m.j1===pid,p2=m.j2===pid;if(!p1&&!p2)return;
    const tope=TOPES[clase]?.tope??null;
    if(m.ganador===pid)v++;else d++;
    const t=p1?m.tiempo1:m.tiempo2;
    if(t!=null&&(tope==null||t>=tope)){if(!best[clase]||t<best[clase])best[clase]=t;}
  }
  state.torneos.forEach(t=>{const ins=getInscripcion(t,pid);if(!ins)return;ids.add(t.id);const c=ins.clase||'L1';(t.bracket?.rondas||[]).forEach(r=>r.forEach(m=>proc(m,c)));});
  state.llaves.forEach(lv=>{const ins=getInscripcion(lv,pid);if(!ins)return;ids.add(lv.id);const c=ins.clase||'L1';(lv.repechajeMatches||[]).forEach(m=>proc(m,c));(lv.bracketRondas||[]).forEach(r=>r.forEach(m=>proc(m,c)));});
  return{victorias:v,derrotas:d,eventos:ids.size,best};
}


// ═══ SHARE STATS ══════════════════════════════════════════════════
let _shareStatsPid = null;
function shareStats() {
  // Requires html2canvas loaded via CDN
  const card = document.getElementById('share-card');
  if (!card || !_shareStatsPid) { toast('No hay datos para compartir.', 'err'); return; }
  const state = load();
  const j = state.jugadores.find(x => x.id === _shareStatsPid);
  const s = computePilotStats(_shareStatsPid, state);
  const tot = s.victorias + s.derrotas;
  const pct = tot > 0 ? (s.victorias / tot * 100).toFixed(1) + '%' : '—';
  // Populate card
  document.getElementById('sc-name').textContent = j?.username || '???';
  document.getElementById('sc-vip').style.display = j?.isVIP ? 'inline-flex' : 'none';
  document.getElementById('sc-victorias').textContent = s.victorias;
  document.getElementById('sc-derrotas').textContent = s.derrotas;
  document.getElementById('sc-pct').textContent = pct;
  document.getElementById('sc-eventos').textContent = s.eventos;
  const bestArr = Object.entries(s.best);
  document.getElementById('sc-best').textContent = bestArr.length ? bestArr.map(([c, t]) => `${TOPES[c]?.label||c}: ${t.toFixed(3)}"`).join('  ·  ') : 'Sin tiempos';
  // Show card off-screen, take snapshot
  card.style.display = 'flex';
  if (typeof html2canvas !== 'undefined') {
    html2canvas(card, { scale: 2, backgroundColor: null, useCORS: true }).then(canvas => {
      card.style.display = 'none';
      const link = document.createElement('a');
      link.download = `PicadasAR_${j?.username || 'stats'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      playChime(); toast('✓ Imagen guardada', 'ok');
    }).catch(() => { card.style.display = 'none'; toast('Error al generar imagen.', 'err'); });
  } else {
    card.style.display = 'none';
    toast('html2canvas no cargó. Verificá tu conexión.', 'err');
  }
}

// ═══ PILOTOS ═════════════════════════════════════════════════════
function renderJugadores(){
  const state=load();
  const{jugadores}=state;
  const q=(document.getElementById('searchPiloto')?.value||'').toLowerCase();
  const filtered=jugadores.filter(j=>j.username.toLowerCase().includes(q));
  const el=document.getElementById('jugadores-table');
  if(!filtered.length){
    el.innerHTML=`<div class="empty"><div class="e-icon">🏎</div><p>${jugadores.length?'Sin resultados.':'Aún no hay pilotos.'}</p>${_isAdmin?'<button class="btn btn-primary" onclick="openAddPiloto()">+ AGREGAR EL PRIMER PILOTO</button>':''}</div>`;
    return;
  }
  el.innerHTML=`<table><thead><tr><th>#</th><th>USERNAME</th><th>V</th><th>D</th><th>%</th><th>MEJOR TIEMPO</th><th>EVENTOS</th>${_isAdmin?'<th>ACCIONES</th>':''}</tr></thead><tbody>${
    filtered.map((j,i)=>{
      const s=computePilotStats(j.id,state);
      const tot=s.victorias+s.derrotas;
      const pct=tot>0?(s.victorias/tot*100).toFixed(1)+'%':'—';
      const bestArr=Object.entries(s.best);
      const bestStr=bestArr.length?bestArr.map(([c,t])=>`<span class="badge badge-clase">${c}</span> <span class="tiempo-val">${t.toFixed(3)}"</span>`).join(' '):' —';
      return`<tr class="pilot-row" onclick="openPilotHistory('${j.id}')">
        <td style="color:var(--text3);font-family:var(--mono);font-size:.8rem;">${i+1}</td>
        <td><strong>${j.username}</strong>${j.isVIP?'<span class="badge-vip">VIP</span>':''}
      <button class="admin-only" style="margin-left:1rem;background:transparent;border:1px solid rgba(245,197,24,.3);color:var(--accent);font-size:.65rem;padding:.1rem .4rem;border-radius:4px;cursor:pointer;" onclick="grantVip('${j.id}', event)">★ DAR VIP</button></td>
        <td style="color:var(--green);font-family:var(--mono);">${s.victorias}</td>
        <td style="color:var(--red);font-family:var(--mono);">${s.derrotas}</td>
        <td style="font-family:var(--mono);">${pct}</td>
        <td>${bestStr}</td>
        <td style="font-family:var(--mono);">${s.eventos}</td>
        ${_isAdmin?`<td onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="openEditPiloto('${j.id}')">EDITAR</button>
          <button class="btn btn-danger btn-sm" style="margin-left:.4rem;" onclick="confirmDelete('piloto','${j.id}','${j.username.replace(/'/g,"\\'")}')">✕</button>
        </td>`:''}
      </tr>`;
    }).join('')
  }</tbody></table>`;
}
function openAddPiloto() { playOpen();
  document.getElementById('modal-piloto-title').textContent='NUEVO PILOTO';
  document.getElementById('p-id').value='';document.getElementById('p-username').value='';document.getElementById('p-vip').checked=false;
  openModal('modal-piloto');
}
function openEditPiloto(id){
  const j=load().jugadores.find(x=>x.id===id);if(!j)return;
  document.getElementById('modal-piloto-title').textContent='EDITAR PILOTO';
  document.getElementById('p-id').value=j.id;document.getElementById('p-username').value=j.username;document.getElementById('p-vip').checked=!!j.isVIP;
  openModal('modal-piloto');
}
function savePiloto(){
  const s=load(),id=document.getElementById('p-id').value;
  const username=document.getElementById('p-username').value.trim();
  const isVIP=document.getElementById('p-vip').checked;
  if(!username){toast('El username no puede estar vacío.','err');return;}
  if(id){
    const idx=s.jugadores.findIndex(j=>j.id===id);
    if(idx>=0)s.jugadores[idx]={...s.jugadores[idx],username,isVIP};
    playChime(); toast(`✓ ${username} actualizado`, 'ok');
  } else {
    if(s.jugadores.find(j=>j.username.toLowerCase()===username.toLowerCase())){toast('Username ya existe.','err');return;}
    s.jugadores.push({id:uid(),username,isVIP});
    playChime(); toast(`✓ ${username} registrado`, 'ok');
  }
  save(s);closeModal('modal-piloto');renderJugadores();
}

// ═══ PILOT HISTORY MODAL ═════════════════════════════════════════
function openPilotHistory(pid){
  const state=load();
  const j=state.jugadores.find(x=>x.id===pid);if(!j)return;
  _shareStatsPid=pid;
  const s=computePilotStats(pid,state);
  const tot=s.victorias+s.derrotas;
  const pct=tot>0?(s.victorias/tot*100).toFixed(1)+'%':'—';
  const events=[];
  state.torneos.forEach(t=>{
    const ins=getInscripcion(t,pid);if(!ins)return;
    let w=0,l=0;
    (t.bracket?.rondas||[]).forEach(r=>r.forEach(m=>{if(m.estado!=='completado'||(m.j1!==pid&&m.j2!==pid))return;m.ganador===pid?w++:l++;}));
    events.push({tipo:'TORNEO',nombre:t.nombre,fecha:t.fecha,clase:ins.clase,vehiculo:ins.vehiculo,w,l,estado:t.estado,campeon:t.campeon===pid});
  });
  state.llaves.forEach(lv=>{
    const ins=getInscripcion(lv,pid);if(!ins)return;
    let w=0,l=0;
    (lv.repechajeMatches||[]).forEach(m=>{if(m.estado!=='completado'||(m.j1!==pid&&m.j2!==pid))return;m.ganador===pid?w++:l++;});
    (lv.bracketRondas||[]).forEach(r=>r.forEach(m=>{if(m.estado!=='completado'||(m.j1!==pid&&m.j2!==pid))return;m.ganador===pid?w++:l++;}));
    events.push({tipo:'LLAVE',nombre:lv.nombre,fecha:lv.fecha,clase:ins.clase,vehiculo:ins.vehiculo,w,l,estado:lv.estado,campeon:lv.campeon===pid});
  });
  const bestTimes=Object.entries(s.best).map(([c,t])=>`<div class="tope-pill">${TOPES[c]?.label||c} → <span>${t.toFixed(3)}"</span></div>`).join('')||'<span style="color:var(--text3);font-family:var(--mono);font-size:.75rem;">Sin tiempos registrados</span>';
  const eRows=events.length?`<table><thead><tr><th>TIPO</th><th>NOMBRE</th><th>CLASE</th><th>VEHÍCULO</th><th>V</th><th>D</th><th>FECHA</th><th></th></tr></thead><tbody>${
    events.map(e=>`<tr>
      <td><span class="badge ${e.tipo==='TORNEO'?'badge-done':'badge-rep'}">${e.tipo}</span></td>
      <td><strong>${e.nombre}</strong></td>
      <td><span class="badge badge-clase">${TOPES[e.clase]?.label||e.clase||'—'}</span></td>
      <td style="color:var(--text2);">${e.vehiculo||'—'}</td>
      <td style="color:var(--green);font-family:var(--mono);">${e.w}</td>
      <td style="color:var(--red);font-family:var(--mono);">${e.l}</td>
      <td style="font-family:var(--mono);color:var(--text2);">${e.fecha||'—'}</td>
      <td>${e.campeon?'🏆':''}</td>
    </tr>`).join('')
  }</tbody></table>`:'<div class="helper" style="padding:1rem 0;">Aún no participó en ningún evento.</div>';
  document.getElementById('historia-content').innerHTML=`
    <div class="modal-title" style="font-size:2rem;">${j.username}</div>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem;">
      <div class="stat-card" style="flex:1;min-width:90px;"><div class="stat-val">${s.victorias}</div><div class="stat-lbl">VICTORIAS</div></div>
      <div class="stat-card" style="flex:1;min-width:90px;"><div class="stat-val">${s.derrotas}</div><div class="stat-lbl">DERROTAS</div></div>
      <div class="stat-card" style="flex:1;min-width:90px;"><div class="stat-val">${pct}</div><div class="stat-lbl">WIN %</div></div>
      <div class="stat-card" style="flex:1;min-width:90px;"><div class="stat-val">${s.eventos}</div><div class="stat-lbl">EVENTOS</div></div>
    </div>
    <div style="margin-bottom:1.2rem;">
      <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:.5rem;">MEJORES TIEMPOS POR CLASE</div>
      <div class="topes-ref">${bestTimes}</div>
    </div>
    <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:.8rem;">HISTORIAL DE EVENTOS</div>
    <div class="table-wrap">${eRows}</div>`;
  openModal('modal-piloto-historia');
}

// ═══ HELPERS ═════════════════════════════════════════════════════
function getJugadorNombre(id){return load().jugadores.find(j=>j.id===id)?.username||'???';}
function getJugadorLabel(id){const j=load().jugadores.find(x=>x.id===id);if(!j)return'???';return j.username+(j.isVIP?' <span class="badge-vip-sm">VIP</span>':'');}
function confirmDelete(type,id,name){
  document.getElementById('delete-msg').textContent=
    type==='piloto'?`¿Eliminar al piloto "${name}"?`:
    type==='torneo'?`¿Eliminar el torneo "${name}"?`:
    `¿Eliminar la llave "${name}"? No se puede deshacer.`;
  document.getElementById('delete-confirm-btn').onclick=()=>{
    const s=load();
    if(type==='piloto'){
      // Advertir si tiene matches pendientes en algún bracket activo
      const activeBrackets=[
        ...s.torneos.filter(t=>t.estado!=='finalizado'&&t.bracket?.rondas?.some(r=>r.some(m=>m.estado==='pendiente'&&(m.j1===id||m.j2===id)))),
        ...s.llaves.filter(lv=>lv.estado!=='finalizado'&&[...(lv.bracketRondas||[]).flat(),...(lv.repechajeMatches||[])].some(m=>m.estado==='pendiente'&&(m.j1===id||m.j2===id)))
      ];
      if(activeBrackets.length&&!confirm(`⚠ Este piloto tiene carreras pendientes en: ${activeBrackets.map(x=>x.nombre).join(', ')}.\n\nSi lo eliminás, esos matches quedarán sin piloto. ¿Continuar igual?`))return;
      s.jugadores=s.jugadores.filter(j=>j.id!==id);
    }
    if(type==='torneo')s.torneos=s.torneos.filter(t=>t.id!==id);
    if(type==='llave')s.llaves=s.llaves.filter(l=>l.id!==id);
    logChange('ELIMINACIÓN',`${type.toUpperCase()} eliminado: "${name}"`);
    save(s);closeModal('modal-delete');playChime(); toast('Eliminado', 'ok');
    if(type==='piloto')renderJugadores();
    if(type==='torneo')renderTorneos();
    if(type==='llave')renderLlaves();
  };
  openModal('modal-delete');
}

// ═══ CHIPS ═══════════════════════════════════════════════════════
function renderChips(prefix){
  const{jugadores}=load();
  const c=document.getElementById(`${prefix}-chips-container`);
  c.innerHTML=jugadores.map(j=>`<div class="chip" id="${prefix}-chip-${j.id}" onclick="toggleChip('${prefix}','${j.id}')">${j.username}</div>`).join('');
  updateChipCount(prefix);
}
function toggleChip(prefix,id){
  document.getElementById(`${prefix}-chip-${id}`).classList.toggle('sel');
  updateChipCount(prefix);
  if(prefix==='lv')updateLlavePreview();
  updateInscripcionTable(prefix);
}
function updateChipCount(prefix){
  const cnt=document.querySelectorAll(`#${prefix}-chips-container .chip.sel`).length;
  const el=document.getElementById(`${prefix}-chips-count`);
  if(el)el.textContent=`(${cnt} seleccionados)`;
}
function getSelectedChips(prefix){
  return[...document.querySelectorAll(`#${prefix}-chips-container .chip.sel`)].map(c=>c.id.replace(`${prefix}-chip-`,''));
}

// ═══ INSCRIPTION TABLE ═══════════════════════════════════════════
function updateInscripcionTable(prefix){
  const ids=getSelectedChips(prefix);
  const{jugadores}=load();
  const c=document.getElementById(`${prefix}-inscripciones`);if(!c)return;
  if(!ids.length){c.innerHTML='<div class="helper" style="padding:.6rem 0;">↑ Seleccioná pilotos para configurar su inscripción.</div>';return;}
  c.innerHTML=`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:.6rem;margin-top:.8rem;">INSCRIPCIONES</div>${
    ids.map(pid=>{
      const j=jugadores.find(x=>x.id===pid);
      return`<div class="inscripcion-row">
        <div class="inscripcion-name">${j?.username||pid}</div>
        <input type="text" id="${prefix}-veh-${pid}" placeholder="Vehículo…">
        <select id="${prefix}-clase-${pid}">${CLASE_OPTS}</select>
      </div>`;
    }).join('')}`;
}
function getInscripcionesFromModal(prefix){
  return getSelectedChips(prefix).map(pid=>({
    pilotoId:pid,
    vehiculo:(document.getElementById(`${prefix}-veh-${pid}`)?.value||'').trim(),
    clase:document.getElementById(`${prefix}-clase-${pid}`)?.value||'L1'
  }));
}

// ═══ TORNEOS ═════════════════════════════════════════════════════

function renderPremiumTorneos() {
  const grid = document.getElementById('premium-grid');
  if(!grid) return;
  const list = load().torneos.filter(t => t.isPremium).reverse();
  if(!list.length) { grid.innerHTML = '<div class="empty">No hay torneos High Stakes activos.</div>'; return; }
  
  grid.innerHTML = list.map(t => {
    const act = t.estado === 'activo';
    return `<div class="t-card t-card-premium" onclick="openTorneoDetail('${t.id}')" style="border-color:var(--accent);">
      <div class="premium-tag">💰 HIGH STAKES / PRIZE POOL</div>
      <div class="t-card-meta">
        <span class="status-dot ${act?'s-act':'s-fin'}"></span> ${act?'EN CURSO':'FINALIZADO'} · ${t.fecha}
      </div>
      <div class="t-card-title" style="color:var(--accent)">${t.nombre}</div>
      <div class="helper" style="margin-top:.5rem;">${t.notas||'...'}</div>
    </div>`;
  }).join('');
  
  if (typeof gsap !== 'undefined') {
    gsap.fromTo('#premium-grid .t-card', {opacity:0, y:15}, {opacity:1, y:0, duration:0.3, stagger:0.05, ease:"power2.out"});
  }
}

function renderTorneos(){
  const{torneos}=load();
  const el=document.getElementById('torneos-grid');
  if(!torneos.length){
    el.innerHTML=`<div class="empty"><div class="e-icon">🏆</div><p>Aún no hay torneos.</p>${_isAdmin?'<button class="btn btn-primary" onclick="openAddTorneo()">+ CREAR PRIMER TORNEO</button>':''}</div>`;
    return;
  }
  el.innerHTML=`<div class="torneos-grid">${[...torneos].reverse().map(t=>{
    const total=t.bracket?.rondas?.reduce((a,r)=>a+r.filter(m=>m.estado!=='bye').length,0)??0;
    const done=t.bracket?.rondas?.reduce((a,r)=>a+r.filter(m=>m.estado==='completado').length,0)??0;
    const bc=t.estado==='finalizado'?'badge-done':t.estado==='activo'?'badge-active':'badge-pending';
    const bl=t.estado==='finalizado'?'FINALIZADO':t.estado==='activo'?'EN CURSO':'PENDIENTE';
    // Estado de inscripción para el usuario actual
    let inscBtn='';
    if(!_isAdmin&&!_isGuest&&t.estado==='activo'){
      const fechaLimite=t.fechaLimiteInscripcion?new Date(t.fechaLimiteInscripcion):null;
      const inscCerrada=fechaLimite&&new Date()>fechaLimite;
      const myInsc=_myInsc[t.id];
      if(inscCerrada){
        inscBtn=`<div style="margin-top:.8rem;padding:.5rem .8rem;border-radius:8px;background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.3);font-family:var(--mono);font-size:.72rem;color:var(--red);text-align:center;">⏰ Inscripciones cerradas</div>`;
      } else if(myInsc?.estado==='aprobado'){
        inscBtn=`<div style="margin-top:.8rem;padding:.5rem .8rem;border-radius:8px;background:rgba(48,209,88,.1);border:1px solid rgba(48,209,88,.3);font-family:var(--mono);font-size:.72rem;color:var(--green);text-align:center;">✓ Inscripto</div>`;
      } else if(myInsc?.estado==='pendiente'){
        inscBtn=`<div style="margin-top:.8rem;padding:.5rem .8rem;border-radius:8px;background:rgba(245,197,24,.08);border:1px solid rgba(245,197,24,.25);font-family:var(--mono);font-size:.72rem;color:var(--accent);text-align:center;">⏳ Solicitud pendiente de aprobación</div>`;
      } else {
        // 'rechazado' o sin inscripción → puede solicitar
        const rechazado=myInsc?.estado==='rechazado';
        inscBtn=`${rechazado?`<div style="margin-top:.5rem;font-family:var(--mono);font-size:.68rem;color:var(--red);text-align:center;">Tu solicitud fue rechazada. Podés volver a intentarlo.</div>`:''}
        <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:.5rem;justify-content:center;" onclick="event.stopPropagation();openInscriptionRequest('${t.id}')">Solicitar inscripción</button>`;
      }
    }
    return`<div class="t-card${t.isPremium?' t-card-premium':''}">
      <div onclick="openTorneoDetail('${t.id}')" style="cursor:pointer;">
      <div class="t-card-name">${t.nombre}</div>
      ${t.notas?`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);margin-bottom:.5rem;">${t.notas}</div>`:''}
      ${t.isPremium?'<div class="premium-tag">💰 PREMIUM — PRIZE POOL</div>':''}
      <div class="t-card-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${(t.jugadores||[]).length} inscriptos</span>
        ${t.bracket?`<span class="meta-pill">${done}/${total} carreras</span>`:'<span class="meta-pill" style="color:var(--accent);">Sin bracket</span>'}
        ${t.claseTorneo?`<span class="meta-pill">${TOPES[t.claseTorneo]?.label||t.claseTorneo}</span>`:''}
        ${t.fecha?`<span class="meta-pill">${t.fecha}</span>`:''}
      </div>
      ${t.campeon?`<div style="margin-top:.8rem;font-size:.82rem;color:var(--gold);">🏆 ${getJugadorNombre(t.campeon)}</div>`:''}
      </div>
      ${inscBtn}
    </div>`;
  }).join('')}</div>`;
}

function openAddTorneo() {
  playOpen();
  // Poblar select de clase del torneo
  const tClase=document.getElementById('t-clase');
  if(tClase&&tClase.options.length<=1){
    tClase.innerHTML=`<option value="">Abierto (todas las clases)</option>`+CLASE_OPTS;
  }
  document.getElementById('t-nombre').value='';
  document.getElementById('t-fecha').value=new Date().toLocaleDateString('es-AR');
  document.getElementById('t-notas').value='';
  document.getElementById('t-clase').value='';
  // Fecha límite default: mañana a las 23:59
  const manana=new Date();manana.setDate(manana.getDate()+1);manana.setHours(23,59,0,0);
  document.getElementById('t-limite').value=manana.toISOString().slice(0,16);
  openModal('modal-torneo');
}

function saveTorneo(){
  const nombre=document.getElementById('t-nombre').value.trim();
  const fecha=document.getElementById('t-fecha').value.trim();
  const notas=document.getElementById('t-notas').value.trim();
  const isPremium=document.getElementById('t-premium')?.checked||false;
  const claseTorneo=document.getElementById('t-clase')?.value||'';
  const limiteVal=document.getElementById('t-limite')?.value||'';
  if(!nombre){toast('Poné un nombre.','err');return;}
  if(nombre.length>100){toast('El nombre es demasiado largo (máx. 100 caracteres).','err');return;}
  const state=load();
  state.torneos.push({
    id:uid(),nombre,fecha,notas,isPremium,claseTorneo,
    fechaLimiteInscripcion:limiteVal||null,
    estado:'activo',
    jugadores:[],
    bracket:null,campeon:null
  });
  logChange('TORNEO',`Torneo "${nombre}" creado — inscripciones abiertas`);
  save(state);playChime(); toast(`✓ Torneo "${nombre}" creado. Inscripciones abiertas.`, 'ok');
  closeModal('modal-torneo');renderTorneos();
}

function generarBracketSimple(ids){
  const shuffled=[...ids].sort(()=>Math.random()-.5);
  const slots=Math.pow(2,Math.ceil(Math.log2(Math.max(shuffled.length,2))));
  while(shuffled.length<slots)shuffled.push(null);
  const numR=Math.log2(slots);const rondas=[];
  for(let r=0;r<numR;r++){
    const mc=slots/Math.pow(2,r+1);const ronda=[];
    for(let m=0;m<mc;m++){
      const match={id:`r${r}m${m}`,j1:r===0?shuffled[m*2]:null,j2:r===0?shuffled[m*2+1]:null,
        tiempo1:null,tiempo2:null,ganador:null,dq1:false,dq2:false,estado:'pendiente'};
      // Handle BYE slots (null players) — including double-null
      if(r===0){
        if(!match.j1&&!match.j2)match.estado='bye'; // double BYE, ganador stays null
        else if(match.j1&&!match.j2){match.ganador=match.j1;match.estado='bye';}
        else if(match.j2&&!match.j1){match.ganador=match.j2;match.estado='bye';}
      }
      ronda.push(match);
    }
    rondas.push(ronda);
  }
  // Propagate BYE results using resolved flags to avoid confusing 'null from BYE' with 'null from pending'
  for(let r=0;r<rondas.length-1;r++){
    rondas[r].forEach((m,mi)=>{
      if(m.estado!=='bye'&&!m.ganador)return; // skip unresolved pending matches
      const next=rondas[r+1][Math.floor(mi/2)];
      if(mi%2===0){next.j1=m.ganador;next._j1r=true;}
      else{next.j2=m.ganador;next._j2r=true;}
      if(next._j1r&&next._j2r){ // both sides resolved — determine BYE
        if(!next.j1&&!next.j2)next.estado='bye';
        else if(next.j1&&!next.j2){next.ganador=next.j1;next.estado='bye';}
        else if(next.j2&&!next.j1){next.ganador=next.j2;next.estado='bye';}
      }
    });
  }
  rondas.forEach(r=>r.forEach(m=>{delete m._j1r;delete m._j2r;}));
  return rondas;
}

// Advance a player that has no opponent (manual BYE fix for existing brackets)
function advanceBye(type,parentId,ri,mi){
  const state=load();
  let evento,rondas,isLlave=false;
  if(type==='torneo'){evento=state.torneos.find(x=>x.id===parentId);rondas=evento.bracket.rondas;}
  else{evento=state.llaves.find(x=>x.id===parentId);rondas=evento.bracketRondas;isLlave=true;}
  const m=rondas[ri][mi];
  const realPlayer=m.j1||m.j2;
  if(!realPlayer){toast('No hay jugador para avanzar.','err');return;}
  m.ganador=realPlayer;m.estado='bye';m.tiempo1=null;m.tiempo2=null;
  // Propagate to next round
  if(ri+1<rondas.length){
    const next=rondas[ri+1][Math.floor(mi/2)];
    if(mi%2===0)next.j1=realPlayer;else next.j2=realPlayer;
    if(next.j1&&next.j2)next.estado='pendiente';
    else if(next.j1&&!next.j2){}  // wait for other side
    else if(next.j2&&!next.j1){} // wait for other side
  } else {
    if(isLlave)evento.campeon=realPlayer;
    else{evento.estado='finalizado';evento.campeon=realPlayer;}
  }
  logChange('BYE',`${getJugadorNombre(realPlayer)} avanzó automáticamente (sin rival)`);
  save(state);
  if(isLlave)renderLlaveDetail();else renderTorneoDetail();
  playChime(); toast(`🏁 ${getJugadorNombre(realPlayer)} avanza (sin rival)`, 'ok');
}

function openTorneoDetail(id){
  activeTorneoId=id;
  document.getElementById('torneos-list-view').style.display='none';
  document.getElementById('torneo-detail-view').style.display='block';
  renderTorneoDetail();
}
function closeTorneoDetail(){
  activeTorneoId=null;
  document.getElementById('torneos-list-view').style.display='';
  document.getElementById('torneo-detail-view').style.display='none';
  renderTorneos();
}

function renderTorneoDetail(){
  if(!activeTorneoId)return;
  const{torneos}=load();
  const t=torneos.find(x=>x.id===activeTorneoId);
  if(!t){closeTorneoDetail();return;}
  const total=t.bracket?.rondas?.reduce((a,r)=>a+r.filter(m=>m.estado!=='bye').length,0)??0;
  const done=t.bracket?.rondas?.reduce((a,r)=>a+r.filter(m=>m.estado==='completado').length,0)??0;
  const bc=t.estado==='finalizado'?'badge-done':'badge-active';
  const bl=t.estado==='finalizado'?'FINALIZADO':'EN CURSO';
  // Estado de inscripciones
  const fechaLimite=t.fechaLimiteInscripcion?new Date(t.fechaLimiteInscripcion):null;
  const inscCerrada=fechaLimite&&new Date()>fechaLimite;
  const jugadores=t.jugadores||[];
  let html=`<div class="t-detail-head">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
      <div><div class="t-detail-name">${t.nombre}</div>
      ${t.notas?`<div style="font-family:var(--mono);font-size:.72rem;color:var(--text3);margin-bottom:.5rem;">${t.notas}</div>`:''}
      <div class="t-detail-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${jugadores.length} inscriptos</span>
        ${t.bracket?`<span class="meta-pill">${done}/${total} carreras</span>`:'<span class="meta-pill" style="color:var(--accent);">Sin bracket</span>'}
        ${t.claseTorneo?`<span class="meta-pill">${TOPES[t.claseTorneo]?.label||t.claseTorneo}</span>`:''}
        ${t.fecha?`<span class="meta-pill">📅 ${t.fecha}</span>`:''}
        ${fechaLimite?`<span class="meta-pill" style="${inscCerrada?'color:var(--red);':'color:var(--green);'}">${inscCerrada?'⏰ Inscripción cerrada':'⏱ Cierra: '+fechaLimite.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</span>`:''}
      </div></div>
      <div style="display:flex;gap:.5rem;">
        ${_isAdmin?`<button class="btn btn-ghost btn-sm" onclick="openEditTorneo('${t.id}')">✏ Editar</button>`:''}
        ${_isAdmin?`<button class="btn btn-danger btn-sm" onclick="confirmDelete('torneo','${t.id}','${t.nombre}')">Eliminar</button>`:''}
      </div>
    </div>
  </div>`;
  // Inscripciones pendientes (solo admin)
  if(_isAdmin){
    const pending=_pendingInsc[t.id];
    if(pending&&pending.length){
      html+=`<div style="background:rgba(56,189,248,.06);border:1px solid rgba(56,189,248,.2);border-radius:var(--radius);padding:1.2rem 1.4rem;margin-bottom:1.5rem;">
        <div style="font-weight:700;font-size:.85rem;color:var(--blue);margin-bottom:.8rem;">Solicitudes pendientes (${pending.length})</div>
        ${pending.map(r=>`<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.05);">
          <div>
            <span style="font-weight:600;">${r.username}</span>
            <span class="meta-pill" style="margin-left:.4rem;">${r.vehiculo||'—'}</span>
            <span class="meta-pill">${TOPES[r.clase]?.label||r.clase}</span>
            <span style="font-size:.72rem;color:var(--text2);margin-left:.4rem;">${r.email}</span>
          </div>
          <div style="display:flex;gap:.4rem;">
            <button class="btn btn-primary btn-sm" onclick="approveInscription('${t.id}','${r.id}')">Aprobar</button>
            <button class="btn btn-danger btn-sm" onclick="rejectInscription('${t.id}','${r.id}')">Rechazar</button>
          </div>
        </div>`).join('')}
      </div>`;
    }
  }
  // Lista de inscriptos aprobados
  if(jugadores.length){
    html+=`<div style="background:var(--bg2);border:1px solid var(--glass-border);border-radius:var(--radius);padding:1.2rem 1.4rem;margin-bottom:1.5rem;">
      <div style="font-weight:700;font-size:.85rem;color:var(--text2);margin-bottom:.8rem;">Pilotos inscriptos (${jugadores.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:.5rem;">
        ${jugadores.map(j=>{
          const pid=typeof j==='object'?j.pilotoId:j;
          const ins=typeof j==='object'?j:null;
          return`<div style="display:flex;align-items:center;gap:.3rem;">
            <div class="meta-pill">${getJugadorNombre(pid)}${ins?.clase?` · <span style="color:var(--accent)">${TOPES[ins.clase]?.label||ins.clase}</span>`:''}${ins?.vehiculo?` <span style="color:var(--text3);font-size:.65rem;">${ins.vehiculo}</span>`:''}</div>
            ${_isAdmin?`<button class="btn btn-ghost btn-sm" style="padding:.15rem .5rem;font-size:.65rem;" onclick="openEditInscripcion('${t.id}','${pid}')">✏</button>`:''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  // Botón generar bracket (admin, sin bracket, con pilotos)
  if(_isAdmin&&!t.bracket&&jugadores.length>=2){
    html+=`<div style="margin-bottom:1.5rem;display:flex;justify-content:center;">
      <button class="btn btn-primary" onclick="generarBracketTorneo('${t.id}')">
        🏁 GENERAR BRACKET CON ${jugadores.length} PILOTOS
      </button>
    </div>`;
  } else if(_isAdmin&&!t.bracket&&jugadores.length<2){
    html+=`<div style="text-align:center;padding:2rem;font-family:var(--mono);font-size:.8rem;color:var(--text3);">
      Esperando inscripciones para generar el bracket (mínimo 2 pilotos)
    </div>`;
  }
  if(t.campeon)html+=`<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;text-align:center;">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">🏆</div>
    <div style="font-family:var(--mono);font-size:.75rem;color:var(--accent);letter-spacing:.3em;margin-bottom:.4rem;">CAMPEÓN DEL TORNEO</div>
    <div style="font-family:var(--display);font-size:2.5rem;letter-spacing:.1em;">${getJugadorNombre(t.campeon)}</div>
  </div>`;
  if(t.bracket){
    html+=`<div class="bracket-scroll"><div class="bracket">${renderBracketCols(t.bracket.rondas,'torneo',t.id,t)}</div></div>`;
  }
  document.getElementById('torneo-detail-content').innerHTML=html;
}

function roundName(ri,total){
  if(ri===total-1)return'FINAL';
  if(ri===total-2&&total>2)return'SEMIFINAL';
  if(ri===total-3&&total>3)return'CUARTOS';
  return`RONDA ${ri+1}`;
}

function renderBracketCols(rondas,type,parentId,evento){
  const numR=rondas.length;let html='';
  rondas.forEach((ronda,ri)=>{
    html+=`<div class="b-round"><div class="b-round-title">${roundName(ri,numR)}</div><div class="b-matches">`;
    ronda.forEach((m,mi)=>{
      const canClick=m.estado==='pendiente'&&m.j1&&m.j2;
      const canCorrect=m.estado==='completado'&&_isAdmin;
      // Detect "stuck" match: one real player, no opponent, not yet marked as BYE
      const isStuck=m.estado==='pendiente'&&((m.j1&&!m.j2)||(m.j2&&!m.j1));
      const advanceFn=type==='torneo'?`advanceBye('torneo','${parentId}',${ri},${mi})`:`advanceBye('llave','${parentId}',${ri},${mi})`;
      const clickFn=type==='torneo'?`openResultTorneo('${parentId}',${ri},${mi})`:`openResultLlave('${parentId}','main',${ri},${mi})`;
      const correctFn=type==='torneo'?`openCorrectTorneo('${parentId}',${ri},${mi})`:`openCorrectLlave('${parentId}','main',${ri},${mi})`;
      const clickAttr=canClick?`class="b-match clickable" onclick="${clickFn}"`:'class="b-match"';
      const p1c=m.estado==='completado'||m.estado==='bye'?(m.ganador===m.j1?'winner':(m.j1?'loser':'')):'';
      const p2c=m.estado==='completado'||m.estado==='bye'?(m.ganador===m.j2?'winner':(m.j2?'loser':'')):'';
      const t1=m.tiempo1!=null?m.tiempo1.toFixed(3)+'"':'';
      const t2=m.tiempo2!=null?m.tiempo2.toFixed(3)+'"':'';
      const ins1=m.j1?getInscripcion(evento,m.j1):null;
      const ins2=m.j2?getInscripcion(evento,m.j2):null;
      html+=`<div class="b-match-wrap"><div ${clickAttr}>
        <div class="b-match-num">C${mi+1}${m.estado==='bye'?' · BYE':isStuck?' · SIN RIVAL':canClick?' · CLICK P/ REGISTRAR':''}</div>
        <div class="b-player ${p1c}">
          <span class="b-player-name">${m.ganador===m.j1?'🏁 ':''}${m.j1?getJugadorLabel(m.j1):'<span class="b-tbd">POR DEFINIR</span>'}</span>
          ${ins1?`<span style="font-family:var(--mono);font-size:.55rem;color:var(--text3);">${TOPES[ins1.clase]?.label||''}</span>`:''}
          ${t1?`<span class="b-player-time ${m.dq1?'dq':''}">${m.dq1?'DQ ':''} ${t1}</span>`:''}
        </div>
        ${m.j2!==null?`<div class="b-player ${p2c}">
          <span class="b-player-name">${m.ganador===m.j2?'🏁 ':''}${m.j2?getJugadorLabel(m.j2):'<span class="b-tbd">POR DEFINIR</span>'}</span>
          ${ins2?`<span style="font-family:var(--mono);font-size:.55rem;color:var(--text3);">${TOPES[ins2.clase]?.label||''}</span>`:''}
          ${t2?`<span class="b-player-time ${m.dq2?'dq':''}">${m.dq2?'DQ ':''} ${t2}</span>`:''}
        </div>`:`<div class="b-bye">BYE — avanza automáticamente</div>`}
        ${isStuck&&_isAdmin?`<div class="b-correct-bar b-advance-bar" onclick="event.stopPropagation();${advanceFn}">⚡ BYE — AVANZAR AL SIGUIENTE ROUND</div>`:''}
        ${canCorrect?`<div class="b-correct-bar admin-only" onclick="event.stopPropagation();${correctFn}">✏ CORREGIR</div>`:''}
      </div></div>`;
    });
    html+=`</div></div>`;
  });
  return html;
}

// ═══ LLAVES ══════════════════════════════════════════════════════
function calcLlave(n){
  const lp2=Math.pow(2,Math.floor(Math.log2(n)));
  const isPow2=(n&(n-1))===0;
  if(isPow2)return{hasRep:false,mainSize:n,repMatches:0,directSlots:n,repSlots:0,rondas:Math.log2(n)};
  const excess=n-lp2;
  return{hasRep:true,mainSize:lp2,repMatches:excess,repPlayers:excess*2,directSlots:lp2-excess,rondas:Math.log2(lp2)};
}

function updateLlavePreview(){
  const n=parseInt(document.getElementById('lv-n').value);
  const sel=getSelectedChips('lv').length;
  const c=calcLlave(n);
  const box=document.getElementById('llave-preview-box');
  let html=`<div class="llave-preview">`;
  if(c.hasRep){
    html+=`<div class="lp-row"><span class="lp-dot purple"></span><strong style="color:var(--purple);">REPECHAJE:</strong> ${c.repMatches} carreras (${c.repPlayers} pilotos)</div>`;
    html+=`<div class="lp-row"><span class="lp-dot yellow"></span><strong style="color:var(--accent);">BRACKET:</strong> cuadro de ${c.mainSize} (${c.rondas} rondas)</div>`;
    html+=`<div class="lp-row"><span class="lp-dot" style="background:var(--text2)"></span>${c.directSlots} pasan directo — ${c.repMatches} ganadores del rep completan</div>`;
  } else {
    html+=`<div class="lp-row"><span class="lp-dot green"></span><strong style="color:var(--green);">BRACKET PURO</strong> de ${n} — sin repechaje (${c.rondas} rondas)</div>`;
  }
  const diff=n-sel;
  html+=`<div class="lp-row" style="margin-top:.4rem;"><span class="lp-dot" style="background:${diff===0?'var(--green)':diff>0?'var(--red)':'var(--accent)'}"></span>`;
  if(diff===0)html+=`<span style="color:var(--green);">✓ ${n} pilotos seleccionados</span>`;
  else if(diff>0)html+=`<span style="color:var(--red);">Faltan ${diff} (necesitás ${n})</span>`;
  else html+=`<span style="color:var(--accent);">${-diff} de más (máximo ${n})</span>`;
  html+=`</div></div>`;
  box.innerHTML=html;
}

function openAddLlave(){
  const{jugadores}=load();
  if(!jugadores.length){toast('Primero registrá pilotos.','err');return;}
  document.getElementById('lv-nombre').value='';
  document.getElementById('lv-fecha').value=new Date().toLocaleDateString('es-AR');
  document.getElementById('lv-notas').value='';
  document.getElementById('lv-n').value='16';
  renderChips('lv');
  document.getElementById('lv-inscripciones').innerHTML='';
  updateLlavePreview();
  openModal('modal-llave');
}

function saveLlave(){
  const nombre=document.getElementById('lv-nombre').value.trim();
  const fecha=document.getElementById('lv-fecha').value.trim();
  const notas=document.getElementById('lv-notas').value.trim();
  const n=parseInt(document.getElementById('lv-n').value);
  const inscripciones=getInscripcionesFromModal('lv');
  if(!nombre){toast('Poné un nombre.','err');return;}
  if(inscripciones.length!==n){toast(`Seleccioná exactamente ${n} pilotos (tenés ${inscripciones.length}).`,'err');return;}
  const c=calcLlave(n);
  const pids=inscripciones.map(i=>i.pilotoId);
  const shuffled=[...pids].sort(()=>Math.random()-.5);
  const state=load();
  let llave;
  if(!c.hasRep){
    llave={id:uid(),nombre,fecha,notas,n,estado:'activo',jugadores:inscripciones,hasRep:false,repechajeMatches:[],bracketRondas:generarBracketSimple(shuffled),campeon:null};
  } else {
    const repJ=shuffled.slice(0,c.repPlayers);
    const dirJ=shuffled.slice(c.repPlayers);
    const repM=[];
    for(let i=0;i<c.repMatches;i++){
      repM.push({id:`rep${i}`,repIdx:i,j1:repJ[i*2],j2:repJ[i*2+1],tiempo1:null,tiempo2:null,ganador:null,dq1:false,dq2:false,estado:'pendiente'});
    }
    const ms=c.mainSize;const nr=c.rondas;const slots=[];
    let di=0,ri2=0;
    const repInt=Math.floor(ms/c.repMatches);
    for(let i=0;i<ms;i++){
      if(ri2<c.repMatches&&(i+1)%repInt===0&&slots.filter(s=>s.type==='rep').length<c.repMatches)slots.push({type:'rep',repIdx:ri2++});
      else if(di<dirJ.length)slots.push({type:'direct',pid:dirJ[di++]});
      else slots.push({type:'rep',repIdx:ri2++});
    }
    while(di<dirJ.length)slots.push({type:'direct',pid:dirJ[di++]});
    while(ri2<c.repMatches)slots.push({type:'rep',repIdx:ri2++});
    const bracketRondas=[];
    for(let r=0;r<nr;r++){
      const mc2=ms/Math.pow(2,r+1);const ronda=[];
      for(let m=0;m<mc2;m++){
        const match={id:`r${r}m${m}`,j1:null,j2:null,j1RepIdx:null,j2RepIdx:null,tiempo1:null,tiempo2:null,ganador:null,dq1:false,dq2:false,estado:'pendiente'};
        if(r===0){
          const s1=slots[m*2],s2=slots[m*2+1];
          if(s1.type==='direct')match.j1=s1.pid;else match.j1RepIdx=s1.repIdx;
          if(s2.type==='direct')match.j2=s2.pid;else match.j2RepIdx=s2.repIdx;
          match.estado=(match.j1&&match.j2)?'pendiente':'esperando-rep';
        }
        ronda.push(match);
      }
      bracketRondas.push(ronda);
    }
    llave={id:uid(),nombre,fecha,notas,n,estado:'activo',jugadores:inscripciones,hasRep:true,repechajeMatches:repM,bracketRondas,campeon:null};
  }
  state.llaves.push(llave);
  logChange('LLAVE',`Llave "${nombre}" creada con ${n} pilotos`+(c.hasRep?` (${c.repMatches} rep)`:'')); 
  save(state);playChime(); toast(`✓ Llave "${nombre}" generada`, 'ok');
  closeModal('modal-llave');renderLlaves();
}

function renderLlaves(){
  const{llaves}=load();
  const listV=document.getElementById('llaves-list-view');
  const detV=document.getElementById('llave-detail-view');
  if(activeLlaveId){listV.style.display='none';detV.style.display='block';renderLlaveDetail();return;}
  listV.style.display='';detV.style.display='none';
  const el=document.getElementById('llaves-grid');
  if(!llaves.length){
    el.innerHTML=`<div class="empty"><div class="e-icon">🔑</div><p>Aún no hay llaves.</p>${_isAdmin?'<button class="btn btn-purple" onclick="openAddLlave()">+ CREAR PRIMERA LLAVE</button>':''}</div>`;
    return;
  }
  el.innerHTML=`<div class="torneos-grid">${[...llaves].reverse().map(lv=>{
    const bc=lv.estado==='finalizado'?'badge-done':'badge-active';
    const bl=lv.estado==='finalizado'?'FINALIZADO':'EN CURSO';
    const dR=lv.repechajeMatches.filter(m=>m.estado==='completado').length;
    const tR=lv.repechajeMatches.length;
    return`<div class="t-card" onclick="openLlaveDetail('${lv.id}')">
      <div class="t-card-name">${lv.nombre}</div>
      ${lv.notas?`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);margin-bottom:.5rem;">${lv.notas}</div>`:''}
      <div class="t-card-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${lv.n} corredores</span>
        ${lv.hasRep?`<span class="badge badge-rep">REP: ${dR}/${tR}</span>`:''}
        ${lv.fecha?`<span class="meta-pill">${lv.fecha}</span>`:''}
      </div>
      ${lv.campeon?`<div style="margin-top:.8rem;font-family:var(--mono);font-size:.75rem;color:var(--accent);">🏆 ${getJugadorNombre(lv.campeon)}</div>`:''}
    </div>`;
  }).join('')}</div>`;
}

function openLlaveDetail(id){activeLlaveId=id;renderLlaves();}
function closeLlaveDetail(){activeLlaveId=null;renderLlaves();}

function renderLlaveDetail(){
  if(!activeLlaveId)return;
  const{llaves}=load();
  const lv=llaves.find(x=>x.id===activeLlaveId);
  if(!lv){closeLlaveDetail();return;}
  const dR=lv.repechajeMatches.filter(m=>m.estado==='completado').length;
  const tR=lv.repechajeMatches.length;
  const bc=lv.estado==='finalizado'?'badge-done':'badge-active';
  const bl=lv.estado==='finalizado'?'FINALIZADO':'EN CURSO';
  let html=`<div class="t-detail-head">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
      <div><div class="t-detail-name">${lv.nombre}</div>
      ${lv.notas?`<div style="font-family:var(--mono);font-size:.72rem;color:var(--text3);margin-bottom:.5rem;">${lv.notas}</div>`:''}
      <div class="t-detail-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${lv.n} corredores</span>
        ${lv.hasRep?`<span class="badge badge-rep">REP ${dR}/${tR}</span>`:''}
      </div></div>
      ${_isAdmin?`<button class="btn btn-danger btn-sm" onclick="confirmDelete('llave','${lv.id}','${lv.nombre}')">ELIMINAR</button>`:''}
    </div>
  </div>`;
  if(lv.campeon)html+=`<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;text-align:center;">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">🏆</div>
    <div style="font-family:var(--mono);font-size:.75rem;color:var(--accent);letter-spacing:.3em;margin-bottom:.4rem;">CAMPEÓN DE LA LLAVE</div>
    <div style="font-family:var(--display);font-size:2.5rem;letter-spacing:.1em;">${getJugadorNombre(lv.campeon)}</div>
  </div>`;
  if(lv.hasRep){
    const repDone=lv.repechajeMatches.every(m=>m.estado==='completado');
    html+=`<div class="rep-section-title">🟣 REPECHAJE — ${dR}/${tR} completadas</div>
    <div class="rep-section-body"><div class="rep-matches-grid">${
      lv.repechajeMatches.map((m,mi)=>{
        const canClick=m.estado==='pendiente';
        const canCorrect=m.estado==='completado'&&_isAdmin;
        const p1c=m.estado==='completado'?(m.ganador===m.j1?'winner':'loser'):'';
        const p2c=m.estado==='completado'?(m.ganador===m.j2?'winner':'loser'):'';
        const t1=m.tiempo1!=null?m.tiempo1.toFixed(3)+'"':'';
        const t2=m.tiempo2!=null?m.tiempo2.toFixed(3)+'"':'';
        return`<div class="b-match rep-match${canClick?' clickable':''}" ${canClick?`onclick="openResultLlave('${lv.id}','rep',${mi})"`:''}> 
          <div class="b-match-num rep-num">REP #${mi+1}${canClick?' · CLICK P/ REGISTRAR':''}</div>
          <div class="b-player ${p1c}"><span class="b-player-name">${m.ganador===m.j1?'🏁 ':''}${getJugadorNombre(m.j1)}</span>${t1?`<span class="b-player-time ${m.dq1?'dq':''}">${t1}</span>`:''}</div>
          <div class="b-player ${p2c}"><span class="b-player-name">${m.ganador===m.j2?'🏁 ':''}${getJugadorNombre(m.j2)}</span>${t2?`<span class="b-player-time ${m.dq2?'dq':''}">${t2}</span>`:''}</div>
          ${canCorrect?`<div class="b-correct-bar admin-only" onclick="event.stopPropagation();openCorrectLlave('${lv.id}','rep',${mi})">✏ CORREGIR</div>`:''}
        </div>`;
      }).join('')
    }</div>
    ${repDone?`<p style="font-family:var(--mono);font-size:.75rem;color:var(--green);margin-top:1rem;">✓ Repechajes completados — bracket desbloqueado</p>`:''}</div>`;
    html+=`<div class="rep-separator"><div class="rep-sep-line"></div><div class="rep-sep-label">↓ BRACKET PRINCIPAL</div><div class="rep-sep-line"></div></div>`;
  }
  html+=`<div class="bracket-scroll"><div class="bracket">${renderBracketColsLlave(lv)}</div></div>`;
  document.getElementById('llave-detail-content').innerHTML=html;
}

function renderBracketColsLlave(lv){
  const numR=lv.bracketRondas.length;let html='';
  lv.bracketRondas.forEach((ronda,ri)=>{
    html+=`<div class="b-round"><div class="b-round-title">${roundName(ri,numR)}</div><div class="b-matches">`;
    ronda.forEach((m,mi)=>{
      const waiting=m.estado==='esperando-rep';
      const canClick=!waiting&&m.estado==='pendiente'&&m.j1&&m.j2;
      const canCorrect=m.estado==='completado'&&_isAdmin;
      const p1name=m.j1?getJugadorNombre(m.j1):null;
      const p2name=m.j2?getJugadorNombre(m.j2):null;
      let p1c='',p2c='';
      if(m.estado==='completado'||m.estado==='bye'){p1c=m.ganador===m.j1?'winner':(m.j1?'loser':'');p2c=m.ganador===m.j2?'winner':(m.j2?'loser':'');}
      const t1=m.tiempo1!=null?m.tiempo1.toFixed(3)+'"':'';
      const t2=m.tiempo2!=null?m.tiempo2.toFixed(3)+'"':'';
      const rep1=m.j1RepIdx!=null&&!m.j1?`REP.#${m.j1RepIdx+1}`:null;
      const rep2=m.j2RepIdx!=null&&!m.j2?`REP.#${m.j2RepIdx+1}`:null;
      const clickAttr=canClick?`class="b-match clickable" onclick="openResultLlave('${lv.id}','main',${ri},${mi})"`:waiting?'class="b-match" style="opacity:.6"':'class="b-match"';
      html+=`<div class="b-match-wrap"><div ${clickAttr}>
        <div class="b-match-num">C${mi+1}${m.estado==='bye'?' · BYE':waiting?' · ESPERANDO REP':canClick?' · CLICK P/ REGISTRAR':''}</div>
        <div class="b-player ${p1c}"><span class="b-player-name">${m.ganador===m.j1?'🏁 ':''}${p1name||(`<span class="b-${rep1?'rep-pending':'tbd'}">${rep1?'→ '+rep1:'POR DEFINIR'}</span>`)}</span>${t1?`<span class="b-player-time ${m.dq1?'dq':''}">${t1}</span>`:''}</div>
        ${m.j2!==null||rep2?`<div class="b-player ${p2c}"><span class="b-player-name">${m.ganador===m.j2?'🏁 ':''}${p2name||(`<span class="b-${rep2?'rep-pending':'tbd'}">${rep2?'→ '+rep2:'POR DEFINIR'}</span>`)}</span>${t2?`<span class="b-player-time ${m.dq2?'dq':''}">${t2}</span>`:''}</div>`:`<div class="b-bye">BYE</div>`}
        ${canCorrect?`<div class="b-correct-bar admin-only" onclick="event.stopPropagation();openCorrectLlave('${lv.id}','main',${ri},${mi})">✏ CORREGIR</div>`:''}
      </div></div>`;
    });
    html+=`</div></div>`;
  });
  return html;
}

// ═══ RESULT MODALS ═══════════════════════════════════════════════
function openResultTorneo(tid,ri,mi){
  const t=load().torneos.find(x=>x.id===tid);if(!t)return;
  const m=t.bracket.rondas[ri][mi];
  setupResultModal('torneo',tid,ri,mi,m.j1,m.j2,t,false);
}
function openResultLlave(lid,type,...args){
  const lv=load().llaves.find(x=>x.id===lid);if(!lv)return;
  const ctype='llave-'+type;
  if(type==='rep'){
    const m=lv.repechajeMatches[args[0]];
    setupResultModal(ctype,lid,args[0],-1,m.j1,m.j2,lv,false);
  } else {
    const m=lv.bracketRondas[args[0]][args[1]];
    setupResultModal(ctype,lid,args[0],args[1],m.j1,m.j2,lv,false);
  }
}
function openCorrectTorneo(tid,ri,mi){
  const t=load().torneos.find(x=>x.id===tid);if(!t)return;
  const m=t.bracket.rondas[ri][mi];
  setupResultModal('torneo',tid,ri,mi,m.j1,m.j2,t,true,m.tiempo1,m.tiempo2);
}
function openCorrectLlave(lid,type,...args){
  const lv=load().llaves.find(x=>x.id===lid);if(!lv)return;
  const ctype='llave-'+type;
  if(type==='rep'){
    const m=lv.repechajeMatches[args[0]];
    setupResultModal(ctype,lid,args[0],-1,m.j1,m.j2,lv,true,m.tiempo1,m.tiempo2);
  } else {
    const m=lv.bracketRondas[args[0]][args[1]];
    setupResultModal(ctype,lid,args[0],args[1],m.j1,m.j2,lv,true,m.tiempo1,m.tiempo2);
  }
}
function setupResultModal(ctype,pid,ri,mi,j1,j2,evento,isCorrection,oldT1,oldT2){
  document.getElementById('r-context-type').value=ctype;
  document.getElementById('r-parent-id').value=pid;
  document.getElementById('r-ronda-idx').value=ri;
  document.getElementById('r-match-idx').value=mi;
  document.getElementById('r-correccion-mode').value=isCorrection?'1':'0';
  document.getElementById('r-modal-title').textContent=isCorrection?'CORREGIR RESULTADO':'REGISTRAR RESULTADO';
  document.getElementById('r-correccion-badge').style.display=isCorrection?'':'none';
  document.getElementById('r-name1').textContent=getJugadorNombre(j1);
  document.getElementById('r-name2').textContent=getJugadorNombre(j2);
  const ins1=getInscripcion(evento,j1);
  const ins2=getInscripcion(evento,j2);
  document.getElementById('r-clase1').textContent=ins1?`${TOPES[ins1.clase]?.label||ins1.clase} · ${ins1.vehiculo||'Sin vehículo'}`:'';
  document.getElementById('r-clase2').textContent=ins2?`${TOPES[ins2.clase]?.label||ins2.clase} · ${ins2.vehiculo||'Sin vehículo'}`:'';
  document.getElementById('r-clase-info').innerHTML='';
  document.getElementById('r-time1').value=isCorrection&&oldT1!=null?oldT1:'';
  document.getElementById('r-time2').value=isCorrection&&oldT2!=null?oldT2:'';
  document.getElementById('r-warn1').style.display='none';
  document.getElementById('r-warn2').style.display='none';
  document.getElementById('r-preview').textContent='';
  document.getElementById('r-confirm-box').style.display='none';
  document.getElementById('r-actions-box').style.display='';
  ['r-time1','r-time2'].forEach(id=>{document.getElementById(id).oninput=()=>previewResult(pid,ctype);});
  if(isCorrection)previewResult(pid,ctype);
  openModal('modal-result');
}

function previewResult(parentId,ctype){
  const state=load();
  let evento;
  if(ctype==='torneo')evento=state.torneos.find(x=>x.id===parentId);
  else evento=state.llaves.find(x=>x.id===parentId);
  const ri=parseInt(document.getElementById('r-ronda-idx').value);
  const mi=parseInt(document.getElementById('r-match-idx').value);
  let m;
  if(ctype==='torneo')m=evento.bracket.rondas[ri][mi];
  else if(ctype==='llave-rep')m=evento.repechajeMatches[ri];
  else m=evento.bracketRondas[ri][mi];
  const ins1=getInscripcion(evento,m.j1);
  const ins2=getInscripcion(evento,m.j2);
  const tope1=TOPES[ins1?.clase||'L1']?.tope??null;
  const tope2=TOPES[ins2?.clase||'L1']?.tope??null;
  const t1r=document.getElementById('r-time1').value;
  const t2r=document.getElementById('r-time2').value;
  const t1=t1r!==''?parseFloat(t1r):null;
  const t2=t2r!==''?parseFloat(t2r):null;
  const w1=document.getElementById('r-warn1'),w2=document.getElementById('r-warn2');
  if(tope1!=null&&t1!=null&&t1<tope1){w1.textContent=`⚠ ${t1.toFixed(3)}" < ${tope1}" → DQ`;w1.style.display='';}else w1.style.display='none';
  if(tope2!=null&&t2!=null&&t2<tope2){w2.textContent=`⚠ ${t2.toFixed(3)}" < ${tope2}" → DQ`;w2.style.display='';}else w2.style.display='none';
  if(t1==null||t2==null){document.getElementById('r-preview').textContent='';return;}
  const dq1=tope1!=null&&t1<tope1,dq2=tope2!=null&&t2<tope2;
  const n1=document.getElementById('r-name1').textContent,n2=document.getElementById('r-name2').textContent;
  let msg='';
  if(dq1&&dq2)msg=`⚠ Ambos DQ — Gana quien más se acercó al tope`;
  else if(dq1)msg=`→ Ganador: ${n2} (rival DQ)`;
  else if(dq2)msg=`→ Ganador: ${n1} (rival DQ)`;
  else msg=`→ Ganador: ${t1<=t2?n1:n2} (${Math.min(t1,t2).toFixed(3)}")`;
  document.getElementById('r-preview').textContent=msg;
}

function requestConfirm(){
  const t1r=document.getElementById('r-time1').value;
  const t2r=document.getElementById('r-time2').value;
  if(t1r===''||t2r===''){toast('Ingresá ambos tiempos.','err');return;}
  const t1=parseFloat(t1r),t2=parseFloat(t2r);
  if(isNaN(t1)||isNaN(t2)||t1<=0||t2<=0){toast('Tiempos inválidos.','err');return;}
  const n1=document.getElementById('r-name1').textContent;
  const n2=document.getElementById('r-name2').textContent;
  const prev=document.getElementById('r-preview').textContent;
  document.getElementById('r-confirm-summary').innerHTML=`<strong>${n1}</strong>: ${t1.toFixed(3)}" &nbsp;|&nbsp; <strong>${n2}</strong>: ${t2.toFixed(3)}"<br>${prev}`;
  document.getElementById('r-confirm-box').style.display='';
  document.getElementById('r-actions-box').style.display='none';
}
function cancelConfirm(){
  document.getElementById('r-confirm-box').style.display='none';
  document.getElementById('r-actions-box').style.display='';
}

function calcWinner(j1,j2,t1,t2,tope1,tope2){
  const dq1=tope1!=null&&t1<tope1;
  const dq2=tope2!=null&&t2<tope2;
  let ganador;
  if(dq1&&dq2){
    const d1=tope1!=null?Math.abs(t1-tope1):Infinity;
    const d2=tope2!=null?Math.abs(t2-tope2):Infinity;
    ganador=d1<=d2?j1:j2;
  } else if(dq1)ganador=j2;
  else if(dq2)ganador=j1;
  else ganador=t1<=t2?j1:j2;
  return{ganador,dq1,dq2};
}

function saveResult(){
  const ctype=document.getElementById('r-context-type').value;
  const pid=document.getElementById('r-parent-id').value;
  const ri=parseInt(document.getElementById('r-ronda-idx').value);
  const mi=parseInt(document.getElementById('r-match-idx').value);
  const t1=parseFloat(document.getElementById('r-time1').value);
  const t2=parseFloat(document.getElementById('r-time2').value);
  const isCorr=document.getElementById('r-correccion-mode').value==='1';
  if(ctype==='torneo')saveResultTorneo(pid,ri,mi,t1,t2,isCorr);
  else if(ctype==='llave-rep')saveResultLlaveRep(pid,ri,t1,t2,isCorr);
  else if(ctype==='llave-main')saveResultLlaveMain(pid,ri,mi,t1,t2,isCorr);
}

function getTopes(evento,j1,j2){
  const ins1=getInscripcion(evento,j1);
  const ins2=getInscripcion(evento,j2);
  return{tope1:TOPES[ins1?.clase||'L1']?.tope??null,tope2:TOPES[ins2?.clase||'L1']?.tope??null};
}

function saveResultTorneo(tid,ri,mi,t1,t2,isCorr){
  const state=load();
  const t=state.torneos.find(x=>x.id===tid);
  const m=t.bracket.rondas[ri][mi];
  const{tope1,tope2}=getTopes(t,m.j1,m.j2);
  if(isCorr)revertMatchStats(state,m,tope1,tope2);
  const{ganador,dq1,dq2}=calcWinner(m.j1,m.j2,t1,t2,tope1,tope2);
  m.tiempo1=t1;m.tiempo2=t2;m.ganador=ganador;m.dq1=dq1;m.dq2=dq2;m.estado='completado';
  applyMatchStats(state,m,tope1,tope2);
  if(ri+1<t.bracket.rondas.length){
    const next=t.bracket.rondas[ri+1][Math.floor(mi/2)];
    if(mi%2===0)next.j1=ganador;else next.j2=ganador;
    if(next.j1&&next.j2)next.estado='pendiente';
  } else {t.estado='finalizado';t.campeon=ganador;}
  if(isCorr)logChange('CORRECCIÓN',`Torneo "${t.nombre}" R${ri+1} C${mi+1} corregido`);
  save(state);closeModal('modal-result');renderTorneoDetail();
  playChime(); toast(`🏁 ${getJugadorNombre(ganador)} avanza`, 'ok');
}

function saveResultLlaveRep(lid,repIdx,t1,t2,isCorr){
  const state=load();
  const lv=state.llaves.find(x=>x.id===lid);
  const m=lv.repechajeMatches[repIdx];
  const{tope1,tope2}=getTopes(lv,m.j1,m.j2);
  if(isCorr)revertMatchStats(state,m,tope1,tope2);
  const{ganador,dq1,dq2}=calcWinner(m.j1,m.j2,t1,t2,tope1,tope2);
  m.tiempo1=t1;m.tiempo2=t2;m.ganador=ganador;m.dq1=dq1;m.dq2=dq2;m.estado='completado';
  applyMatchStats(state,m,tope1,tope2);
  // Propagate rep winner into bracket
  for(let mi2=0;mi2<lv.bracketRondas[0].length;mi2++){
    const bm=lv.bracketRondas[0][mi2];
    if(bm.j1RepIdx===repIdx)bm.j1=ganador;
    if(bm.j2RepIdx===repIdx)bm.j2=ganador;
    if(bm.estado==='esperando-rep'&&bm.j1&&bm.j2)bm.estado='pendiente';
  }
  if(isCorr)logChange('CORRECCIÓN',`Llave "${lv.nombre}" Rep#${repIdx+1} corregido`);
  save(state);closeModal('modal-result');renderLlaveDetail();
  playChime(); toast(`🟣 ${getJugadorNombre(ganador)} avanza al bracket`, 'ok');
}

function saveResultLlaveMain(lid,ri,mi,t1,t2,isCorr){
  const state=load();
  const lv=state.llaves.find(x=>x.id===lid);
  const m=lv.bracketRondas[ri][mi];
  const{tope1,tope2}=getTopes(lv,m.j1,m.j2);
  if(isCorr)revertMatchStats(state,m,tope1,tope2);
  const{ganador,dq1,dq2}=calcWinner(m.j1,m.j2,t1,t2,tope1,tope2);
  m.tiempo1=t1;m.tiempo2=t2;m.ganador=ganador;m.dq1=dq1;m.dq2=dq2;m.estado='completado';
  applyMatchStats(state,m,tope1,tope2);
  if(ri+1<lv.bracketRondas.length){
    const next=lv.bracketRondas[ri+1][Math.floor(mi/2)];
    if(mi%2===0)next.j1=ganador;else next.j2=ganador;
    if(next.j1&&next.j2)next.estado='pendiente';
  } else {lv.estado='finalizado';lv.campeon=ganador;}
  if(isCorr)logChange('CORRECCIÓN',`Llave "${lv.nombre}" R${ri+1} C${mi+1} corregido`);
  save(state);closeModal('modal-result');renderLlaveDetail();
  playChime(); toast(`🏁 ${getJugadorNombre(ganador)} avanza`, 'ok');
}

// Stats are computed on-the-fly via computePilotStats, so these
// revert/apply only handle the "best time" per-pilot tracking (not needed
// since we compute from matches). But we keep them as no-ops for safety.
function revertMatchStats(state,m,tope1,tope2){/* computed on-the-fly */}
function applyMatchStats(state,m,tope1,tope2){/* computed on-the-fly */}

// ═══ VIP SUBSCRIPTION FLOW ═══════════════════════════════════════
// Llama a la Cloud Function 'createSubscription', obtiene el link de
// Mercado Pago y redirige al usuario para completar el pago.
async function startVIPSubscription() {
  const input    = document.getElementById('vip-username-input');
  const errorEl  = document.getElementById('vip-form-error');
  const formPanel    = document.getElementById('vip-form-panel');
  const loadingPanel = document.getElementById('vip-loading-panel');

  const username = input?.value?.trim();
  errorEl.style.display = 'none';

  if (!username || username.length < 2) {
    errorEl.textContent   = 'Ingresá tu username de Picadas AR.';
    errorEl.style.display = '';
    return;
  }

  // Mostrar spinner y bloquear botón
  formPanel.style.display    = 'none';
  loadingPanel.style.display = '';

  try {
    const createSubscription = functions.httpsCallable('createSubscription');
    const result = await createSubscription({ username });

    const { init_point } = result.data;
    if (!init_point) throw new Error('No se recibió link de pago.');

    // Abrir MP en nueva pestaña
    window.open(init_point, '_blank', 'noopener,noreferrer');

    // Restaurar modal con mensaje de espera
    loadingPanel.innerHTML = `
      <div style="text-align:center;padding:.5rem 0;">
        <div style="font-size:1.5rem;margin-bottom:.5rem;">✅</div>
        <div style="font-family:var(--mono);font-size:.75rem;color:var(--green);letter-spacing:.05em;margin-bottom:.3rem;">LINK ABIERTO EN NUEVA PESTAÑA</div>
        <div style="font-family:var(--mono);font-size:.68rem;color:var(--text2);">Una vez que completes el pago, tu VIP se activará automáticamente en minutos.</div>
      </div>`;
  } catch (err) {
    // Restaurar formulario y mostrar error
    formPanel.style.display    = '';
    loadingPanel.style.display = 'none';
    const msg = err?.message?.includes('not-found')
      ? `Piloto no encontrado. Verificá que el username esté registrado exactamente como aparece en la tabla de Pilotos.`
      : err?.message?.includes('already-exists')
      ? 'Este piloto ya tiene membresía VIP activa.'
      : `Error: ${err.message || 'Intentalo de nuevo.'}`;
    errorEl.textContent   = msg;
    errorEl.style.display = '';
  }
}


// ═══ ANALÍTICAS TAB ══════════════════════════════════════════════
let _charts={};
function destroyCharts(){
  Object.values(_charts).forEach(c=>{try{c.destroy();}catch(e){}});
  _charts={};
}

const CHART_COLORS=['#FF5722','#0A84FF','#32D74B','#FFD60A','#BF5AF2','#FF453A','#FF9F0A','#30D158','#64D2FF','#5E5CE6','#8E8EA0'];
function chartDefaults(){
  if(typeof Chart==='undefined')return;
  Chart.defaults.color='#8E8EA0';
  Chart.defaults.borderColor='rgba(255,255,255,0.06)';
  Chart.defaults.font={family:"'Share Tech Mono',monospace",size:10};
}
const TICK_STYLE={color:'#8E8EA0',font:{family:"'Share Tech Mono',monospace",size:10}};
const TICK_LIGHT={color:'#F2F2F7',font:{family:"'Share Tech Mono',monospace",size:10}};
const GRID={color:'rgba(255,255,255,0.05)'};

function renderAnaliticas(){
  const el=document.getElementById('analiticas-content');
  if(!el)return;
  if(!_isAdmin){el.innerHTML='<div class="helper" style="padding:2rem;color:var(--text3);">Acceso restringido a administradores.</div>';return;}
  const state=load();
  destroyCharts();
  chartDefaults();
  const{jugadores,torneos,changelog}=state;
  const{cls,pilotCls,byes}=computeAnalytics(state);
  const pilots=jugadores.map(j=>({...j,...computePilotStats(j.id,state)})).filter(p=>p.victorias+p.derrotas>0);
  const clasesConData=Object.entries(cls).filter(([,v])=>v.m>0);
  const clasesConTiempos=clasesConData.filter(([,v])=>v.times.length>0);

  const totalCarreras=Object.values(cls).reduce((a,c)=>a+c.m,0);
  const totalDQ=Object.values(cls).reduce((a,c)=>a+c.dq,0);
  const avgPilotos=torneos.length?(torneos.reduce((a,t)=>a+(t.jugadores||[]).length,0)/torneos.length).toFixed(1):'—';
  const pilotsWithGames=pilots.length;

  let html=`
  <div class="stat-row" style="margin-bottom:1.5rem;">
    <div class="stat-card"><div class="stat-val">${totalCarreras}</div><div class="stat-lbl">CARRERAS TOTALES</div></div>
    <div class="stat-card" style="background:rgba(255,69,58,.06);border-color:rgba(255,69,58,.2);"><div class="stat-val" style="color:var(--red);">${totalDQ}</div><div class="stat-lbl">DQ TOTALES</div></div>
    <div class="stat-card" style="background:rgba(10,132,255,.06);border-color:rgba(10,132,255,.2);"><div class="stat-val" style="color:var(--blue);">${avgPilotos}</div><div class="stat-lbl">PILOTOS / TORNEO</div></div>
    <div class="stat-card" style="background:rgba(48,209,88,.06);border-color:rgba(48,209,88,.2);"><div class="stat-val" style="color:var(--green);">${pilotsWithGames}</div><div class="stat-lbl">PILOTOS ACTIVOS</div></div>
  </div>
  <div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
    <div data-glass style="padding:1.4rem;border-radius:var(--radius);">
      <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:1rem;">VICTORIAS Y DERROTAS POR PILOTO</div>
      <canvas id="chart-vd"></canvas>
    </div>
    <div data-glass style="padding:1.4rem;border-radius:var(--radius);">
      <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:1rem;">CARRERAS POR CLASE</div>
      <canvas id="chart-clase-dist"></canvas>
    </div>
  </div>
  <div class="grid-2" style="gap:1.5rem;margin-bottom:1.5rem;">
    <div data-glass style="padding:1.4rem;border-radius:var(--radius);">
      <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:1rem;">TASA DE DQ POR CLASE</div>
      <canvas id="chart-dq"></canvas>
    </div>
    <div data-glass style="padding:1.4rem;border-radius:var(--radius);">
      <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:1rem;">WIN RATE POR PILOTO</div>
      <canvas id="chart-winrate"></canvas>
    </div>
  </div>`;

  if(clasesConTiempos.length){
    html+=`<div data-glass style="padding:1.4rem;border-radius:var(--radius);margin-bottom:1.5rem;">
      <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:1rem;">TIEMPO PROMEDIO VS TOPE POR CLASE</div>
      <canvas id="chart-tiempos"></canvas>
    </div>`;
  }

  // Tabla win rate por clase
  const pilotsWithClsData=jugadores.filter(j=>Object.keys(pilotCls[j.id]||{}).length>0);
  if(pilotsWithClsData.length){
    const clasesUsadas=[...new Set(pilotsWithClsData.flatMap(j=>Object.keys(pilotCls[j.id]||{})))];
    html+=`<div class="divider"></div>
    <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:.8rem;">WIN RATE DETALLADO POR CLASE</div>
    <div class="table-wrap"><table>
      <thead><tr><th>PILOTO</th>${clasesUsadas.map(c=>`<th style="text-align:center;">${c}</th>`).join('')}</tr></thead>
      <tbody>${pilotsWithClsData.map(j=>{
        const cs=pilotCls[j.id]||{};
        const cells=clasesUsadas.map(clase=>{
          if(!cs[clase])return`<td style="color:var(--text3);text-align:center;">—</td>`;
          const tot=cs[clase].v+cs[clase].d;
          const pct=tot?cs[clase].v/tot*100:0;
          const color=pct>=60?'var(--green)':pct>=40?'var(--accent)':'var(--red)';
          const bg=pct>=60?'rgba(48,209,88,.1)':pct>=40?'rgba(255,214,10,.06)':'rgba(255,69,58,.08)';
          return`<td style="font-family:var(--mono);background:${bg};text-align:center;padding:.4rem .6rem;">
            <div style="color:${color};font-weight:700;">${pct.toFixed(0)}%</div>
            <div style="font-size:.62rem;color:var(--text3);">${cs[clase].v}V ${cs[clase].d}D</div>
          </td>`;
        });
        return`<tr><td><strong>${j.username}</strong>${j.isVIP?'<span class="badge-vip" style="margin-left:.3rem;">VIP</span>':''}</td>${cells.join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  // Byes
  if(byes.length){
    html+=`<div class="divider"></div>
    <div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:.8rem;">AVANCES POR BYE</div>
    <div class="table-wrap"><table>
      <thead><tr><th>EVENTO</th><th>BYES</th><th>TOTAL MATCHES</th><th>% BYE</th></tr></thead>
      <tbody>${byes.map(b=>`<tr>
        <td>${b.nombre}</td>
        <td style="font-family:var(--mono);color:var(--accent);">${b.byes}</td>
        <td style="font-family:var(--mono);">${b.total}</td>
        <td style="font-family:var(--mono);color:var(--text2);">${(b.byes/b.total*100).toFixed(0)}%</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // Changelog
  if(changelog&&changelog.length){
    html+=`<div class="divider"></div>
    <div class="s-title" style="font-size:1.1rem;margin-bottom:1rem;">📋 LOG DE CAMBIOS</div>
    <div class="table-wrap" style="max-height:350px;overflow-y:auto;"><table>
      <thead><tr><th>FECHA</th><th>TIPO</th><th>DESCRIPCIÓN</th></tr></thead>
      <tbody>${changelog.slice(0,100).map(c=>`<tr>
        <td style="font-family:var(--mono);font-size:.75rem;color:var(--text2);white-space:nowrap;">${c.fecha}</td>
        <td><span class="badge badge-clase">${c.tipo}</span></td>
        <td style="font-size:.85rem;">${c.desc}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  el.innerHTML=html;

  // ── Gráfico 1: Victorias y Derrotas por piloto (horizontal bar) ─
  if(pilots.length&&document.getElementById('chart-vd')){
    _charts.vd=new Chart(document.getElementById('chart-vd'),{
      type:'bar',
      data:{
        labels:pilots.map(p=>p.username),
        datasets:[
          {label:'Victorias',data:pilots.map(p=>p.victorias),backgroundColor:'rgba(48,209,88,0.75)',borderColor:'rgba(48,209,88,1)',borderWidth:1,borderRadius:4},
          {label:'Derrotas',data:pilots.map(p=>p.derrotas),backgroundColor:'rgba(255,69,58,0.75)',borderColor:'rgba(255,69,58,1)',borderWidth:1,borderRadius:4}
        ]
      },
      options:{
        indexAxis:'y',responsive:true,
        plugins:{legend:{position:'bottom',labels:{color:'#8E8EA0',font:{family:"'Share Tech Mono',monospace",size:10}}}},
        scales:{
          x:{grid:GRID,ticks:TICK_STYLE},
          y:{grid:GRID,ticks:TICK_LIGHT}
        }
      }
    });
  }

  // ── Gráfico 2: Carreras por clase (doughnut) ─────────────────
  if(clasesConData.length&&document.getElementById('chart-clase-dist')){
    _charts.claseDist=new Chart(document.getElementById('chart-clase-dist'),{
      type:'doughnut',
      data:{
        labels:clasesConData.map(([k])=>TOPES[k]?.label||k),
        datasets:[{
          data:clasesConData.map(([,v])=>v.m),
          backgroundColor:clasesConData.map((_,i)=>CHART_COLORS[i%CHART_COLORS.length]+'CC'),
          borderColor:clasesConData.map((_,i)=>CHART_COLORS[i%CHART_COLORS.length]),
          borderWidth:1
        }]
      },
      options:{
        responsive:true,
        plugins:{
          legend:{position:'bottom',labels:{color:'#8E8EA0',font:{family:"'Share Tech Mono',monospace",size:10}}},
          tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${ctx.raw} carreras`}}
        }
      }
    });
  }

  // ── Gráfico 3: Tasa de DQ por clase (bar) ────────────────────
  if(clasesConData.length&&document.getElementById('chart-dq')){
    const dqPcts=clasesConData.map(([,v])=>v.slots>0?+(v.dq/v.slots*100).toFixed(1):0);
    _charts.dq=new Chart(document.getElementById('chart-dq'),{
      type:'bar',
      data:{
        labels:clasesConData.map(([k])=>k),
        datasets:[{
          label:'Tasa DQ %',
          data:dqPcts,
          backgroundColor:dqPcts.map(p=>p>20?'rgba(255,69,58,0.8)':p>10?'rgba(255,214,10,0.8)':'rgba(48,209,88,0.8)'),
          borderRadius:4
        }]
      },
      options:{
        responsive:true,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`DQ: ${ctx.raw}%`}}},
        scales:{
          x:{grid:GRID,ticks:TICK_STYLE},
          y:{grid:GRID,ticks:{...TICK_STYLE,callback:v=>v+'%'},min:0,max:100}
        }
      }
    });
  }

  // ── Gráfico 4: Win rate por piloto (horizontal bar) ──────────
  if(pilots.length&&document.getElementById('chart-winrate')){
    const sorted=[...pilots].sort((a,b)=>{
      const ra=a.victorias+a.derrotas,rb=b.victorias+b.derrotas;
      return rb?(b.victorias/rb)-(ra?a.victorias/ra:0):0;
    });
    const rates=sorted.map(p=>{const t=p.victorias+p.derrotas;return t?+(p.victorias/t*100).toFixed(1):0;});
    _charts.winrate=new Chart(document.getElementById('chart-winrate'),{
      type:'bar',
      data:{
        labels:sorted.map(p=>p.username),
        datasets:[{
          label:'Win Rate %',
          data:rates,
          backgroundColor:rates.map(r=>r>=60?'rgba(48,209,88,0.8)':r>=40?'rgba(255,214,10,0.8)':'rgba(255,69,58,0.8)'),
          borderRadius:4
        }]
      },
      options:{
        indexAxis:'y',responsive:true,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.raw}%`}}},
        scales:{
          x:{grid:GRID,ticks:{...TICK_STYLE,callback:v=>v+'%'},min:0,max:100},
          y:{grid:GRID,ticks:TICK_LIGHT}
        }
      }
    });
  }

  // ── Gráfico 5: Tiempo promedio vs tope (bar + line mixto) ────
  if(clasesConTiempos.length&&document.getElementById('chart-tiempos')){
    const labels=clasesConTiempos.map(([k])=>TOPES[k]?.label||k);
    const avgs=clasesConTiempos.map(([,v])=>+(v.times.reduce((a,b)=>a+b,0)/v.times.length).toFixed(3));
    const topes=clasesConTiempos.map(([k])=>TOPES[k]?.tope??null);
    _charts.tiempos=new Chart(document.getElementById('chart-tiempos'),{
      type:'bar',
      data:{
        labels,
        datasets:[
          {type:'bar',label:'Promedio',data:avgs,backgroundColor:'rgba(10,132,255,0.65)',borderColor:'rgba(10,132,255,1)',borderWidth:1,borderRadius:4},
          {type:'line',label:'Tope clase',data:topes,borderColor:'rgba(255,69,58,0.9)',backgroundColor:'transparent',pointBackgroundColor:'rgba(255,69,58,1)',pointRadius:5,borderWidth:2,borderDash:[5,4],tension:0}
        ]
      },
      options:{
        responsive:true,
        plugins:{
          legend:{position:'bottom',labels:{color:'#8E8EA0',font:{family:"'Share Tech Mono',monospace",size:10}}},
          tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${ctx.raw}"`}}
        },
        scales:{
          x:{grid:GRID,ticks:TICK_STYLE},
          y:{grid:GRID,ticks:{...TICK_STYLE,callback:v=>v+'"'}}
        }
      }
    });
  }
}

// ═══ ANALYTICS ═══════════════════════════════════════════════════
function computeAnalytics(state){
  const{jugadores,torneos,llaves}=state;
  const cls={};
  Object.keys(TOPES).forEach(k=>{cls[k]={m:0,slots:0,dq:0,times:[]};});
  const pilotCls={};
  jugadores.forEach(j=>{pilotCls[j.id]={};});

  function procMatch(m,c1,c2,pid1,pid2){
    if(m.estado!=='completado')return;
    if(cls[c1]){
      cls[c1].m++;cls[c1].slots++;
      if(m.dq1)cls[c1].dq++;
      if(m.tiempo1!=null)cls[c1].times.push(m.tiempo1);
    }
    if(c2===c1){
      if(cls[c1]){cls[c1].slots++;if(m.dq2)cls[c1].dq++;if(m.tiempo2!=null)cls[c1].times.push(m.tiempo2);}
    } else if(cls[c2]){
      cls[c2].m++;cls[c2].slots++;
      if(m.dq2)cls[c2].dq++;
      if(m.tiempo2!=null)cls[c2].times.push(m.tiempo2);
    }
    if(pid1&&pilotCls[pid1]){
      if(!pilotCls[pid1][c1])pilotCls[pid1][c1]={v:0,d:0};
      if(m.ganador===pid1)pilotCls[pid1][c1].v++;else pilotCls[pid1][c1].d++;
    }
    if(pid2&&pilotCls[pid2]){
      if(!pilotCls[pid2][c2])pilotCls[pid2][c2]={v:0,d:0};
      if(m.ganador===pid2)pilotCls[pid2][c2].v++;else pilotCls[pid2][c2].d++;
    }
  }

  torneos.forEach(t=>{
    (t.bracket?.rondas||[]).forEach(r=>r.forEach(m=>{
      const i1=getInscripcion(t,m.j1),i2=getInscripcion(t,m.j2);
      procMatch(m,i1?.clase||'L1',i2?.clase||'L1',m.j1,m.j2);
    }));
  });
  llaves.forEach(lv=>{
    [...(lv.repechajeMatches||[]),...(lv.bracketRondas||[]).flat()].forEach(m=>{
      const i1=getInscripcion(lv,m.j1),i2=getInscripcion(lv,m.j2);
      procMatch(m,i1?.clase||'L1',i2?.clase||'L1',m.j1,m.j2);
    });
  });

  const byes=[...torneos,...llaves].map(ev=>{
    const all=[...(ev.bracket?.rondas||[]).flat(),...(ev.bracketRondas||[]).flat(),...(ev.repechajeMatches||[])];
    const b=all.filter(m=>m.estado==='bye').length;
    return all.length?{nombre:ev.nombre,byes:b,total:all.length}:null;
  }).filter(Boolean).filter(b=>b.byes>0);

  return{cls,pilotCls,byes};
}

function renderAdminAnalytics(state){
  const{jugadores}=state;
  const{cls,pilotCls,byes}=computeAnalytics(state);
  let html=`<div class="divider"></div>
  <div style="display:flex;align-items:baseline;gap:.8rem;margin-bottom:.4rem;">
    <div class="s-title" style="font-size:1.4rem;">📊 ANALYTICS</div>
    <span style="font-family:var(--mono);font-size:.65rem;color:var(--blue);letter-spacing:.12em;background:rgba(10,132,255,.1);border:1px solid rgba(10,132,255,.2);border-radius:4px;padding:.15rem .6rem;">SOLO ADMIN</span>
  </div>
  <div style="font-family:var(--mono);font-size:.72rem;color:var(--text3);margin-bottom:1.5rem;letter-spacing:.04em;">Métricas operativas calculadas sobre todos los brackets.</div>`;

  const activeClases=Object.entries(cls).filter(([,v])=>v.m>0);
  if(activeClases.length){
    html+=`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-bottom:.6rem;">RENDIMIENTO POR CLASE</div>
    <div class="table-wrap"><table>
      <thead><tr><th>CLASE</th><th>CARRERAS</th><th>DQ</th><th>TASA DQ</th><th>PROMEDIO</th><th>MÍNIMO</th><th>MÁXIMO</th></tr></thead>
      <tbody>${activeClases.map(([k,cs])=>{
        const dqPct=cs.slots>0?(cs.dq/cs.slots*100).toFixed(1):'—';
        const avg=cs.times.length?(cs.times.reduce((a,b)=>a+b,0)/cs.times.length).toFixed(3):'—';
        const minT=cs.times.length?Math.min(...cs.times).toFixed(3):'—';
        const maxT=cs.times.length?Math.max(...cs.times).toFixed(3):'—';
        const dn=parseFloat(dqPct);
        const dc=isNaN(dn)?'var(--text2)':dn>20?'var(--red)':dn>10?'var(--accent)':'var(--green)';
        return`<tr>
          <td><span class="badge badge-clase">${TOPES[k]?.label||k}</span>${TOPES[k]?.tope?`<span style="font-family:var(--mono);font-size:.62rem;color:var(--text3);margin-left:.4rem;">≥${TOPES[k].tope}"</span>`:''}</td>
          <td style="font-family:var(--mono);">${cs.m}</td>
          <td style="font-family:var(--mono);color:var(--red);">${cs.dq}</td>
          <td style="font-family:var(--mono);color:${dc};">${dqPct}%</td>
          <td style="font-family:var(--mono);color:var(--accent);">${avg!=='—'?avg+'"':'—'}</td>
          <td style="font-family:var(--mono);color:var(--green);">${minT!=='—'?minT+'"':'—'}</td>
          <td style="font-family:var(--mono);color:var(--text2);">${maxT!=='—'?maxT+'"':'—'}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;
  } else {
    html+=`<div class="helper" style="padding:.5rem 0;color:var(--text3);">Sin carreras completadas aún.</div>`;
  }

  const pilotsWithData=jugadores.filter(j=>Object.keys(pilotCls[j.id]||{}).length>0);
  if(pilotsWithData.length){
    const clasesUsadas=[...new Set(pilotsWithData.flatMap(j=>Object.keys(pilotCls[j.id]||{})))];
    html+=`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-top:1.5rem;margin-bottom:.6rem;">WIN RATE POR CLASE — PILOTOS</div>
    <div class="table-wrap"><table>
      <thead><tr><th>PILOTO</th>${clasesUsadas.map(c=>`<th style="text-align:center;">${c}</th>`).join('')}</tr></thead>
      <tbody>${pilotsWithData.map(j=>{
        const cs=pilotCls[j.id]||{};
        const cells=clasesUsadas.map(clase=>{
          if(!cs[clase])return`<td style="color:var(--text3);text-align:center;">—</td>`;
          const tot=cs[clase].v+cs[clase].d;
          const pct=tot?cs[clase].v/tot*100:0;
          const color=pct>=60?'var(--green)':pct>=40?'var(--accent)':'var(--red)';
          const bg=pct>=60?'rgba(48,209,88,.1)':pct>=40?'rgba(255,214,10,.06)':'rgba(255,69,58,.08)';
          return`<td style="font-family:var(--mono);background:${bg};text-align:center;padding:.4rem .6rem;">
            <div style="color:${color};font-weight:700;">${pct.toFixed(0)}%</div>
            <div style="font-size:.62rem;color:var(--text3);">${cs[clase].v}V ${cs[clase].d}D</div>
          </td>`;
        });
        return`<tr><td><strong>${j.username}</strong>${j.isVIP?'<span class="badge-vip" style="margin-left:.3rem;">VIP</span>':''}</td>${cells.join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  if(byes.length){
    html+=`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);letter-spacing:.1em;margin-top:1.5rem;margin-bottom:.6rem;">AVANCES POR BYE</div>
    <div class="table-wrap"><table>
      <thead><tr><th>EVENTO</th><th>BYES</th><th>TOTAL MATCHES</th><th>% BYE</th></tr></thead>
      <tbody>${byes.map(b=>`<tr>
        <td>${b.nombre}</td>
        <td style="font-family:var(--mono);color:var(--accent);">${b.byes}</td>
        <td style="font-family:var(--mono);">${b.total}</td>
        <td style="font-family:var(--mono);color:var(--text2);">${(b.byes/b.total*100).toFixed(0)}%</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  return html;
}

// ═══ STATS ═══════════════════════════════════════════════════════
function renderStats(){
  const state=load();
  const{jugadores,torneos,llaves}=state;
  const el=document.getElementById('stats-content');
  // Compute stats for all pilots
  const pilots=jugadores.map(j=>{
    const s=computePilotStats(j.id,state);
    return{...j,...s};
  });
  const totalCarreras=pilots.reduce((a,p)=>a+p.victorias+p.derrotas,0);
  let html=`<div class="stat-row">
    <div class="stat-card"><div class="stat-val">${jugadores.length}</div><div class="stat-lbl">PILOTOS</div></div>
    <div class="stat-card"><div class="stat-val">${torneos.length}</div><div class="stat-lbl">TORNEOS</div></div>
    <div class="stat-card"><div class="stat-val">${llaves.length}</div><div class="stat-lbl">LLAVES</div></div>
    <div class="stat-card"><div class="stat-val">${torneos.filter(t=>t.estado==='finalizado').length+llaves.filter(l=>l.estado==='finalizado').length}</div><div class="stat-lbl">FINALIZADOS</div></div>
    <div class="stat-card"><div class="stat-val">${totalCarreras}</div><div class="stat-lbl">CARRERAS</div></div>
  </div>`;
  // Ranking
  const ranked=[...pilots].sort((a,b)=>{
    if(b.victorias!==a.victorias)return b.victorias-a.victorias;
    const ra=a.victorias+a.derrotas,rb=b.victorias+b.derrotas;
    const wa=ra?a.victorias/ra:0,wb=rb?b.victorias/rb:0;
    return wb-wa;
  });
  html+=`<div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">RANKING DE PILOTOS</div>
  <div class="table-wrap"><table><thead><tr><th>#</th><th>PILOTO</th><th>V</th><th>D</th><th>%</th><th>MEJOR TIEMPO</th><th>EVENTOS</th></tr></thead><tbody>
  ${ranked.map((p,i)=>{
    const tot=p.victorias+p.derrotas;
    const pct=tot>0?(p.victorias/tot*100).toFixed(1)+'%':'—';
    const medal=i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':'';
    const bestArr=Object.entries(p.best);
    const bestStr=bestArr.length?bestArr.map(([c,t])=>`<span class="badge badge-clase">${c}</span> ${t.toFixed(3)}"`).join(' '):'—';
    return`<tr class="rank-${i+1}" style="cursor:pointer;" onclick="openPilotHistory('${p.id}')"><td class="rank-num">${medal}${i+1}</td>
    <td><strong>${p.username}</strong></td>
    <td style="color:var(--green);font-family:var(--mono);">${p.victorias}</td>
    <td style="color:var(--red);font-family:var(--mono);">${p.derrotas}</td>
    <td style="font-family:var(--mono);">${pct}</td>
    <td>${bestStr}</td>
    <td style="font-family:var(--mono);">${p.eventos}</td></tr>`;
  }).join('')}
  </tbody></table></div>`;
  // Records per class
  html+=`<div class="divider"></div><div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">RÉCORDS POR CLASE</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;">`;
  Object.entries(TOPES).forEach(([key,info])=>{
    let bestT=null,bestN=null;
    pilots.forEach(p=>{if(p.best[key]!=null&&(bestT==null||p.best[key]<bestT)){bestT=p.best[key];bestN=p.username;}});
    html+=`<div class="stat-card" style="text-align:left;">
      <div style="font-family:var(--display);font-size:1.1rem;letter-spacing:.1em;margin-bottom:.2rem;">${info.label}</div>
      ${info.tope?`<div style="font-family:var(--mono);font-size:.65rem;color:var(--text3);margin-bottom:.5rem;">TOPE ≥ ${info.tope}"</div>`:'<div style="height:.5rem"></div>'}
      ${bestT!=null?`<div style="font-family:var(--display);font-size:1.8rem;color:var(--accent);">${bestT.toFixed(3)}"</div>
              <div style="font-size:.85rem;color:var(--text2);margin-top:.2rem;">${bestN}</div>`:
              `<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);">SIN DATOS</div>`}
    </div>`;
  });
  html+=`</div>`;
  // Champions
  const camps=[...torneos,...llaves].filter(x=>x.campeon);
  if(camps.length){
    html+=`<div class="divider"></div><div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">HISTORIAL DE CAMPEONES</div>
    <div class="table-wrap"><table><thead><tr><th>NOMBRE</th><th>TIPO</th><th>CAMPEÓN</th><th>FECHA</th></tr></thead><tbody>
    ${[...camps].reverse().map(x=>
      `<tr><td><strong>${x.nombre}</strong></td>
      <td><span class="badge ${x.bracketRondas?'badge-rep':'badge-done'}">${x.bracketRondas?'LLAVE':'TORNEO'}</span></td>
      <td style="color:var(--accent);">🏆 ${getJugadorNombre(x.campeon)}</td>
      <td style="font-family:var(--mono);color:var(--text2);">${x.fecha||'—'}</td></tr>`
    ).join('')}
    </tbody></table></div>`;
  }
  el.innerHTML=html;
}

// ═══ GENERAR BRACKET DESDE INSCRIPTOS ════════════════════════════
function generarBracketTorneo(tid){
  if(!confirm('¿Generar el bracket con los pilotos inscriptos actuales? Esta acción cierra las inscripciones.'))return;
  const state=load();
  const idx=state.torneos.findIndex(t=>t.id===tid);
  if(idx<0)return;
  const t=state.torneos[idx];
  if(!t.jugadores||t.jugadores.length<2){toast('Se necesitan al menos 2 pilotos inscriptos.','err');return;}
  const ids=t.jugadores.map(j=>typeof j==='object'?j.pilotoId:j);
  state.torneos[idx].bracket={rondas:generarBracketSimple(ids)};
  // Cerrar inscripciones poniendo fecha límite en el pasado
  state.torneos[idx].fechaLimiteInscripcion=new Date(Date.now()-1000).toISOString().slice(0,16);
  logChange('BRACKET',`Bracket generado para "${t.nombre}" con ${t.jugadores.length} pilotos`);
  save(state);playChime();
  renderTorneoDetail();
  toast(`✓ Bracket generado con ${t.jugadores.length} pilotos`, 'ok');
}

// ═══ EDITAR TORNEO ════════════════════════════════════════════════
function openEditTorneo(id){
  const t=load().torneos.find(x=>x.id===id);if(!t)return;
  document.getElementById('et-id').value=id;
  document.getElementById('et-nombre').value=t.nombre;
  document.getElementById('et-fecha').value=t.fecha||'';
  document.getElementById('et-notas').value=t.notas||'';
  document.getElementById('et-limite').value=t.fechaLimiteInscripcion||'';
  openModal('modal-edit-torneo');
}
function saveEditTorneo(){
  const id=document.getElementById('et-id').value;
  const nombre=document.getElementById('et-nombre').value.trim();
  const fecha=document.getElementById('et-fecha').value.trim();
  const notas=document.getElementById('et-notas').value.trim();
  const limite=document.getElementById('et-limite').value||null;
  if(!nombre){toast('El nombre no puede estar vacío.','err');return;}
  const state=load();
  const idx=state.torneos.findIndex(x=>x.id===id);
  if(idx<0)return;
  state.torneos[idx].nombre=nombre;
  state.torneos[idx].fecha=fecha;
  state.torneos[idx].notas=notas;
  state.torneos[idx].fechaLimiteInscripcion=limite;
  logChange('EDITAR',`Torneo "${nombre}" editado`);
  save(state);
  closeModal('modal-edit-torneo');
  renderTorneoDetail();
  toast('Torneo actualizado','ok');
}

// ═══ EDITAR INSCRIPCIÓN POST-BRACKET ════════════════════════════
function openEditInscripcion(tid,pilotoId){
  const state=load();
  const t=state.torneos.find(x=>x.id===tid);if(!t)return;
  const ins=getInscripcion(t,pilotoId);if(!ins)return;
  const j=state.jugadores.find(x=>x.id===pilotoId);

  document.getElementById('ei-tid').value=tid;
  document.getElementById('ei-old-pid').value=pilotoId;
  document.getElementById('ei-piloto-nombre').textContent=j?.username||pilotoId;
  document.getElementById('ei-vehiculo').value=ins.vehiculo||'';

  const claseEl=document.getElementById('ei-clase');
  claseEl.innerHTML=CLASE_OPTS;
  claseEl.value=ins.clase||'L1';

  // Sección reemplazo: mostrar solo si hay bracket con matches pendientes
  const hasPendingMatches=t.bracket?.rondas?.some(r=>r.some(m=>m.estado==='pendiente'&&(m.j1===pilotoId||m.j2===pilotoId)));
  const replaceSection=document.getElementById('ei-replace-section');
  replaceSection.style.display=hasPendingMatches?'':'none';

  if(hasPendingMatches){
    const alreadyIn=new Set((t.jugadores||[]).map(j=>typeof j==='object'?j.pilotoId:j));
    const available=state.jugadores.filter(j=>!alreadyIn.has(j.id));
    const newPidEl=document.getElementById('ei-new-pid');
    newPidEl.innerHTML=`<option value="">— No reemplazar —</option>`+available.map(j=>`<option value="${j.id}">${j.username}${j.isVIP?' ⭐':''}</option>`).join('');
  }

  openModal('modal-edit-inscripcion');
}

function saveEditInscripcion(){
  const tid=document.getElementById('ei-tid').value;
  const oldPid=document.getElementById('ei-old-pid').value;
  const vehiculo=document.getElementById('ei-vehiculo').value.trim();
  const clase=document.getElementById('ei-clase').value;
  const newPid=document.getElementById('ei-new-pid').value||'';
  const state=load();
  const tIdx=state.torneos.findIndex(x=>x.id===tid);if(tIdx<0)return;
  const t=state.torneos[tIdx];
  const jIdx=(t.jugadores||[]).findIndex(j=>(typeof j==='object'?j.pilotoId:j)===oldPid);
  if(jIdx<0)return;

  const targetPid=newPid||oldPid;
  state.torneos[tIdx].jugadores[jIdx]=typeof t.jugadores[jIdx]==='object'
    ?{...t.jugadores[jIdx],pilotoId:targetPid,vehiculo,clase}
    :{pilotoId:targetPid,vehiculo,clase};

  // Si hay reemplazo, actualizar matches pendientes del bracket
  if(newPid&&t.bracket){
    state.torneos[tIdx].bracket.rondas.forEach(r=>r.forEach(m=>{
      if(m.estado==='completado'||m.estado==='bye')return;
      if(m.j1===oldPid)m.j1=newPid;
      if(m.j2===oldPid)m.j2=newPid;
    }));
  }

  const oldNombre=load().jugadores.find(x=>x.id===oldPid)?.username||oldPid;
  const newNombre=newPid?load().jugadores.find(x=>x.id===newPid)?.username||newPid:'';
  const desc=newPid?`${oldNombre} reemplazado por ${newNombre} en "${t.nombre}"`:`Inscripción de ${oldNombre} editada en "${t.nombre}"`;
  logChange('EDITAR',desc);
  save(state);
  closeModal('modal-edit-inscripcion');
  renderTorneoDetail();
  playChime();
  toast(newPid?`✓ ${newNombre} reemplaza en el bracket`:'✓ Inscripción actualizada','ok');
}

// ═══ INSCRIPCIONES DE USUARIOS (Google) ═══════════════════════════
let _pendingInsc={};
let _myInsc={};  // tid -> {estado, id} para el usuario actual
let _inscListener=null;

function startInscSync(){
  if(_inscListener)return;
  _inscListener=inscRef.on('value',snap=>{
    _pendingInsc={};
    _myInsc={};
    const data=snap.val()||{};
    const currentUser=auth.currentUser;
    Object.entries(data).forEach(([tid,reqs])=>{
      const list=Object.entries(reqs||{})
        .filter(([,r])=>r.estado==='pendiente')
        .map(([rid,r])=>({...r,id:rid}));
      if(list.length)_pendingInsc[tid]=list;
      // Rastrear inscripción propia
      if(currentUser){
        Object.entries(reqs||{}).forEach(([rid,r])=>{
          if(r.uid===currentUser.uid){
            // Guardar el más reciente (puede haber uno rechazado y uno nuevo)
            if(!_myInsc[tid]||r.estado!=='rechazado')
              _myInsc[tid]={estado:r.estado,id:rid};
          }
        });
      }
    });
    // Refrescar vistas
    if(activeTorneoId)renderTorneoDetail();
    else renderTorneos();
  });
}

function openInscriptionRequest(tid){
  const t=load().torneos.find(x=>x.id===tid);if(!t)return;
  // Verificar si el plazo cerró
  if(t.fechaLimiteInscripcion&&new Date()>new Date(t.fechaLimiteInscripcion)){
    toast('El plazo de inscripción ya cerró.','err');return;
  }
  // Verificar si ya tiene solicitud activa
  const myInsc=_myInsc[tid];
  if(myInsc&&myInsc.estado==='pendiente'){toast('Ya tenés una solicitud pendiente para este torneo.','err');return;}
  if(myInsc&&myInsc.estado==='aprobado'){toast('Ya estás inscripto en este torneo.','err');return;}
  // Precargar clase del torneo si está definida
  const irClase=document.getElementById('ir-clase');
  if(t.claseTorneo&&irClase){irClase.value=t.claseTorneo;}
  document.getElementById('ir-tid').value=tid;
  document.getElementById('ir-torneo-nombre').textContent=t.nombre;
  document.getElementById('ir-username').value='';
  document.getElementById('ir-vehiculo').value='';
  // Poblar datalist con pilotos registrados
  const dl=document.getElementById('pilotos-datalist');
  if(dl){dl.innerHTML=load().jugadores.map(j=>`<option value="${j.username}">`).join('');}
  openModal('modal-inscripcion-req');
}

function saveInscriptionRequest(){
  const tid=document.getElementById('ir-tid').value;
  const username=document.getElementById('ir-username').value.trim();
  const vehiculo=document.getElementById('ir-vehiculo').value.trim();
  const clase=document.getElementById('ir-clase').value;
  if(!username){toast('Ingresá tu username de Roblox.','err');return;}
  if(!vehiculo){toast('Ingresá el vehículo con el que correrás.','err');return;}
  const user=auth.currentUser;
  if(!user){toast('Debés estar logueado.','err');return;}
  // Doble verificación: duplicados y plazo
  const t=load().torneos.find(x=>x.id===tid);
  if(t?.fechaLimiteInscripcion&&new Date()>new Date(t.fechaLimiteInscripcion)){
    toast('El plazo de inscripción ya cerró.','err');return;
  }
  const myInsc=_myInsc[tid];
  if(myInsc&&(myInsc.estado==='pendiente'||myInsc.estado==='aprobado')){
    toast('Ya tenés una solicitud para este torneo.','err');return;
  }
  const req={
    uid:user.uid, email:user.email||user.displayName||'',
    username, vehiculo, clase,
    fecha:new Date().toLocaleString('es-AR'),
    estado:'pendiente'
  };
  inscRef.child(tid).push(req)
    .then(()=>{closeModal('modal-inscripcion-req');toast('Solicitud enviada. El admin la revisará.','ok');})
    .catch(err=>{toast('Error al enviar solicitud.','err');console.error(err);});
}

function approveInscription(tid,reqId){
  const req=(_pendingInsc[tid]||[]).find(r=>r.id===reqId);
  if(!req){toast('No se encontró la solicitud.','err');return;}
  inscRef.child(tid+'/'+reqId+'/estado').set('aprobado');
  const state=load();
  // Agregar a jugadores generales si no existe
  let piloto=state.jugadores.find(j=>j.username.toLowerCase()===req.username.toLowerCase());
  if(!piloto){
    piloto={id:uid(),username:req.username,isVIP:false};
    state.jugadores.push(piloto);
  }
  // Agregar al torneo si no está ya
  const tidx=state.torneos.findIndex(t=>t.id===tid);
  if(tidx>=0){
    if(!state.torneos[tidx].jugadores)state.torneos[tidx].jugadores=[];
    const yaEnTorneo=state.torneos[tidx].jugadores.some(j=>{
      const jid=typeof j==='object'?j.pilotoId:j;
      return jid===piloto.id;
    });
    if(!yaEnTorneo){
      state.torneos[tidx].jugadores.push({pilotoId:piloto.id,vehiculo:req.vehiculo||'',clase:req.clase||'L1'});
    }
  }
  logChange('INSCRIPCIÓN',`${req.username} aprobado en torneo`);
  save(state);
  toast(`${req.username} aprobado e inscripto en el torneo.`,'ok');
}

function rejectInscription(tid,reqId){
  inscRef.child(tid+'/'+reqId+'/estado').set('rechazado');
  toast('Solicitud rechazada.','info');
}

// Iniciar sync de inscripciones cuando hay usuario autenticado
auth.onAuthStateChanged(u=>{if(u)startInscSync();else{if(_inscListener){inscRef.off('value',_inscListener);_inscListener=null;}_pendingInsc={};};});
