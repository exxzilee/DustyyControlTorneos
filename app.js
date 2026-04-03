// ═══ PICADAS AR v4 — app.js ══════════════════════════════════════

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

// ═══ AUTH ════════════════════════════════════════════════════════
let _authMode='login', _isGuest=false;
function renderAuthScreen(){
  const isL=_authMode==='login';
  document.getElementById('auth-screen').innerHTML=`
    <div class="auth-box">
      <div class="logo-main">🏎 PICADAS AR</div>
      <div class="logo-sub">GESTOR DE TORNEOS — ROBLOX</div>
      <div class="modal-title">${isL?'INICIAR SESIÓN':'REGISTRARSE'}</div>
      <div class="form-row"><label>EMAIL</label><input type="email" id="auth-email" placeholder="admin@picadas.com"></div>
      <div class="form-row"><label>CONTRASEÑA</label><input type="password" id="auth-pass" placeholder="${isL?'Tu contraseña':'Mínimo 6 caracteres'}"></div>
      <div class="modal-actions" style="justify-content:center;">
        <button class="btn btn-primary" onclick="doAuth()" style="width:100%;justify-content:center;">${isL?'🔑 ENTRAR':'📝 CREAR CUENTA'}</button>
      </div>
      <div class="auth-error" id="auth-error"></div>
      <div style="margin-top:1.2rem;border-top:1px solid var(--border);padding-top:1.2rem;">
        <button class="btn btn-guest" onclick="enterGuestMode()">👁 ENTRAR COMO ESPECTADOR</button>
        <div style="text-align:center;font-family:var(--mono);font-size:.65rem;color:var(--text3);margin-top:.5rem;">Solo lectura — sin necesidad de cuenta</div>
      </div>
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
  (_authMode==='login'?auth.signInWithEmailAndPassword(email,pass):auth.createUserWithEmailAndPassword(email,pass))
    .catch(err=>{
      const m={'auth/user-not-found':'No existe esa cuenta.','auth/wrong-password':'Contraseña incorrecta.',
        'auth/invalid-credential':'Credenciales inválidas.','auth/email-already-in-use':'Email ya registrado.',
        'auth/weak-password':'Mínimo 6 caracteres.','auth/invalid-email':'Email inválido.',
        'auth/too-many-requests':'Demasiados intentos.'};
      errEl.textContent=m[err.code]||err.message;
    });
}
function logout(){
  if(_isGuest){_isGuest=false;document.body.classList.remove('guest-mode');
    document.getElementById('guest-banner').style.display='none';
    document.getElementById('app-wrapper').style.display='none';
    document.getElementById('auth-screen').style.display='';
    stopRealtimeSync();_dataLoaded=false;_cache={jugadores:[],torneos:[],llaves:[],changelog:[]};renderAuthScreen();return;}
  auth.signOut();
}
function enterGuestMode(){
  _isGuest=true;document.body.classList.add('guest-mode');
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app-wrapper').style.display='block';
  document.getElementById('user-email').textContent='ESPECTADOR';
  document.getElementById('btn-logout').textContent='INICIAR SESIÓN';
  document.getElementById('guest-banner').style.display='block';
  showLoading();startRealtimeSync();
}
function showLoading(){document.getElementById('loading-screen').style.display='';}
function hideLoading(){document.getElementById('loading-screen').style.display='none';}

auth.onAuthStateChanged(user=>{
  if(user){
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app-wrapper').style.display='block';
    document.getElementById('user-email').textContent=user.email;
    document.getElementById('btn-logout').textContent='CERRAR SESIÓN';
    document.getElementById('guest-banner').style.display='none';
    document.body.classList.remove('guest-mode');_isGuest=false;
    showLoading();startRealtimeSync();
  } else {
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
  const a=document.querySelector('section.active');if(!a)return;
  const id=a.id;
  if(id==='jugadores')renderJugadores();
  if(id==='torneos')renderTorneos();
  if(id==='llaves')renderLlaves();
  if(id==='stats')renderStats();
}

// ═══ NAV ═════════════════════════════════════════════════════════
let activeTorneoId=null, activeLlaveId=null;
function goTab(tab){
  document.querySelectorAll('section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b=>b.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  ['jugadores','torneos','llaves','stats'].forEach((t,i)=>{
    if(t===tab)document.querySelectorAll('nav button')[i].classList.add('active');
  });
  if(tab==='jugadores')renderJugadores();
  if(tab==='torneos')renderTorneos();
  if(tab==='llaves')renderLlaves();
  if(tab==='stats')renderStats();
}

// ═══ TOAST ═══════════════════════════════════════════════════════
let _tt;
function toast(msg,type='info'){
  const el=document.getElementById('toast');el.textContent=msg;el.className=`show ${type}`;
  clearTimeout(_tt);_tt=setTimeout(()=>{el.className='';},2800);
}

// ═══ MODALS ══════════════════════════════════════════════════════
function closeModal(id){document.getElementById(id).classList.remove('open');}
function openModal(id){document.getElementById(id).classList.add('open');}
document.querySelectorAll('.overlay').forEach(o=>{
  o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});
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

// ═══ PILOTOS ═════════════════════════════════════════════════════
function renderJugadores(){
  const{jugadores}=load();
  const q=(document.getElementById('searchPiloto')?.value||'').toLowerCase();
  const filtered=jugadores.filter(j=>j.username.toLowerCase().includes(q));
  const el=document.getElementById('jugadores-table');
  if(!filtered.length){
    el.innerHTML=`<div class="empty"><div class="e-icon">🏎</div><p>${jugadores.length?'Sin resultados.':'Aún no hay pilotos.'}</p>${!_isGuest?'<button class="btn btn-primary" onclick="openAddPiloto()">+ AGREGAR EL PRIMER PILOTO</button>':''}</div>`;
    return;
  }
  const state=load();
  el.innerHTML=`<table><thead><tr><th>#</th><th>USERNAME</th><th>V</th><th>D</th><th>%</th><th>MEJOR TIEMPO</th><th>EVENTOS</th>${!_isGuest?'<th>ACCIONES</th>':''}</tr></thead><tbody>${
    filtered.map((j,i)=>{
      const s=computePilotStats(j.id,state);
      const tot=s.victorias+s.derrotas;
      const pct=tot>0?(s.victorias/tot*100).toFixed(1)+'%':'—';
      const bestArr=Object.entries(s.best);
      const bestStr=bestArr.length?bestArr.map(([c,t])=>`<span class="badge badge-clase">${c}</span> <span class="tiempo-val">${t.toFixed(3)}"</span>`).join(' '):' —';
      return`<tr class="pilot-row" onclick="openPilotHistory('${j.id}')">
        <td style="color:var(--text3);font-family:var(--mono);font-size:.8rem;">${i+1}</td>
        <td><strong>${j.username}</strong></td>
        <td style="color:var(--green);font-family:var(--mono);">${s.victorias}</td>
        <td style="color:var(--red);font-family:var(--mono);">${s.derrotas}</td>
        <td style="font-family:var(--mono);">${pct}</td>
        <td>${bestStr}</td>
        <td style="font-family:var(--mono);">${s.eventos}</td>
        ${!_isGuest?`<td onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-sm" onclick="openEditPiloto('${j.id}')">EDITAR</button>
          <button class="btn btn-danger btn-sm" style="margin-left:.4rem;" onclick="confirmDelete('piloto','${j.id}','${j.username}')">✕</button>
        </td>`:''}
      </tr>`;
    }).join('')
  }</tbody></table>`;
}
function openAddPiloto(){
  document.getElementById('modal-piloto-title').textContent='NUEVO PILOTO';
  document.getElementById('p-id').value='';document.getElementById('p-username').value='';
  openModal('modal-piloto');
}
function openEditPiloto(id){
  const j=load().jugadores.find(x=>x.id===id);if(!j)return;
  document.getElementById('modal-piloto-title').textContent='EDITAR PILOTO';
  document.getElementById('p-id').value=j.id;document.getElementById('p-username').value=j.username;
  openModal('modal-piloto');
}
function savePiloto(){
  const s=load(),id=document.getElementById('p-id').value;
  const username=document.getElementById('p-username').value.trim();
  if(!username){toast('El username no puede estar vacío.','err');return;}
  if(id){
    const idx=s.jugadores.findIndex(j=>j.id===id);
    if(idx>=0)s.jugadores[idx]={...s.jugadores[idx],username};
    toast(`✓ ${username} actualizado`,'ok');
  } else {
    if(s.jugadores.find(j=>j.username.toLowerCase()===username.toLowerCase())){toast('Username ya existe.','err');return;}
    s.jugadores.push({id:uid(),username});
    toast(`✓ ${username} registrado`,'ok');
  }
  save(s);closeModal('modal-piloto');renderJugadores();
}

// ═══ PILOT HISTORY MODAL ═════════════════════════════════════════
function openPilotHistory(pid){
  const state=load();
  const j=state.jugadores.find(x=>x.id===pid);if(!j)return;
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
function confirmDelete(type,id,name){
  document.getElementById('delete-msg').textContent=
    type==='piloto'?`¿Eliminar al piloto "${name}"?`:
    type==='torneo'?`¿Eliminar el torneo "${name}"?`:
    `¿Eliminar la llave "${name}"? No se puede deshacer.`;
  document.getElementById('delete-confirm-btn').onclick=()=>{
    const s=load();
    if(type==='piloto')s.jugadores=s.jugadores.filter(j=>j.id!==id);
    if(type==='torneo')s.torneos=s.torneos.filter(t=>t.id!==id);
    if(type==='llave')s.llaves=s.llaves.filter(l=>l.id!==id);
    logChange('ELIMINACIÓN',`${type.toUpperCase()} eliminado: "${name}"`);
    save(s);closeModal('modal-delete');toast('Eliminado','ok');
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
function renderTorneos(){
  const{torneos}=load();
  const el=document.getElementById('torneos-grid');
  if(!torneos.length){
    el.innerHTML=`<div class="empty"><div class="e-icon">🏆</div><p>Aún no hay torneos.</p>${!_isGuest?'<button class="btn btn-primary" onclick="openAddTorneo()">+ CREAR PRIMER TORNEO</button>':''}</div>`;
    return;
  }
  el.innerHTML=`<div class="torneos-grid">${[...torneos].reverse().map(t=>{
    const total=t.bracket.rondas.reduce((a,r)=>a+r.filter(m=>m.estado!=='bye').length,0);
    const done=t.bracket.rondas.reduce((a,r)=>a+r.filter(m=>m.estado==='completado').length,0);
    const bc=t.estado==='finalizado'?'badge-done':t.estado==='activo'?'badge-active':'badge-pending';
    const bl=t.estado==='finalizado'?'FINALIZADO':t.estado==='activo'?'EN CURSO':'PENDIENTE';
    return`<div class="t-card" onclick="openTorneoDetail('${t.id}')">
      <div class="t-card-name">${t.nombre}</div>
      ${t.notas?`<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);margin-bottom:.5rem;">${t.notas}</div>`:''}
      <div class="t-card-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${t.jugadores.length} pilotos</span>
        <span class="meta-pill">${done}/${total} carreras</span>
        ${t.fecha?`<span class="meta-pill">${t.fecha}</span>`:''}
      </div>
      ${t.campeon?`<div style="margin-top:.8rem;font-family:var(--mono);font-size:.75rem;color:var(--accent);">🏆 ${getJugadorNombre(t.campeon)}</div>`:''}
    </div>`;
  }).join('')}</div>`;
}

function openAddTorneo(){
  const{jugadores}=load();
  if(!jugadores.length){toast('Primero registrá pilotos.','err');return;}
  document.getElementById('t-nombre').value='';
  document.getElementById('t-fecha').value=new Date().toLocaleDateString('es-AR');
  document.getElementById('t-notas').value='';
  renderChips('t');
  document.getElementById('t-inscripciones').innerHTML='';
  openModal('modal-torneo');
}

function saveTorneo(){
  const nombre=document.getElementById('t-nombre').value.trim();
  const fecha=document.getElementById('t-fecha').value.trim();
  const notas=document.getElementById('t-notas').value.trim();
  const inscripciones=getInscripcionesFromModal('t');
  if(!nombre){toast('Poné un nombre.','err');return;}
  if(inscripciones.length<2){toast('Seleccioná al menos 2 pilotos.','err');return;}
  const bracket=generarBracketSimple(inscripciones.map(i=>i.pilotoId));
  const state=load();
  state.torneos.push({
    id:uid(),nombre,fecha,notas,estado:'activo',
    jugadores:inscripciones,
    bracket:{rondas:bracket},campeon:null
  });
  logChange('TORNEO',`Torneo "${nombre}" creado con ${inscripciones.length} pilotos`);
  save(state);toast(`✓ Torneo "${nombre}" creado`,'ok');
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
      if(r===0&&match.j2===null){match.ganador=match.j1;match.estado='bye';}
      ronda.push(match);
    }
    rondas.push(ronda);
  }
  for(let r=0;r<rondas.length-1;r++){
    rondas[r].forEach((m,mi)=>{
      if(m.ganador){
        const next=rondas[r+1][Math.floor(mi/2)];
        if(mi%2===0)next.j1=m.ganador;else next.j2=m.ganador;
        if(next.j1&&!next.j2){next.ganador=next.j1;next.estado='bye';}
        if(next.j2&&!next.j1){next.ganador=next.j2;next.estado='bye';}
      }
    });
  }
  return rondas;
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
  const total=t.bracket.rondas.reduce((a,r)=>a+r.filter(m=>m.estado!=='bye').length,0);
  const done=t.bracket.rondas.reduce((a,r)=>a+r.filter(m=>m.estado==='completado').length,0);
  const bc=t.estado==='finalizado'?'badge-done':'badge-active';
  const bl=t.estado==='finalizado'?'FINALIZADO':'EN CURSO';
  let html=`<div class="t-detail-head">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
      <div><div class="t-detail-name">${t.nombre}</div>
      ${t.notas?`<div style="font-family:var(--mono);font-size:.72rem;color:var(--text3);margin-bottom:.5rem;">${t.notas}</div>`:''}
      <div class="t-detail-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${t.jugadores.length} pilotos</span>
        <span class="meta-pill">${done}/${total} carreras</span>
        ${t.fecha?`<span class="meta-pill">📅 ${t.fecha}</span>`:''}
      </div></div>
      ${!_isGuest?`<button class="btn btn-danger btn-sm" onclick="confirmDelete('torneo','${t.id}','${t.nombre}')">ELIMINAR</button>`:''}
    </div>
  </div>`;
  if(t.campeon)html+=`<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;text-align:center;">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">🏆</div>
    <div style="font-family:var(--mono);font-size:.75rem;color:var(--accent);letter-spacing:.3em;margin-bottom:.4rem;">CAMPEÓN DEL TORNEO</div>
    <div style="font-family:var(--display);font-size:2.5rem;letter-spacing:.1em;">${getJugadorNombre(t.campeon)}</div>
  </div>`;
  html+=`<div class="bracket-scroll"><div class="bracket">${renderBracketCols(t.bracket.rondas,'torneo',t.id,t)}</div></div>`;
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
      const canCorrect=m.estado==='completado'&&!_isGuest;
      const clickFn=type==='torneo'?`openResultTorneo('${parentId}',${ri},${mi})`:`openResultLlave('${parentId}','main',${ri},${mi})`;
      const correctFn=type==='torneo'?`openCorrectTorneo('${parentId}',${ri},${mi})`:`openCorrectLlave('${parentId}','main',${ri},${mi})`;
      const clickAttr=canClick?`class="b-match clickable" onclick="${clickFn}"`:'class="b-match"';
      const p1c=m.estado==='completado'||m.estado==='bye'?(m.ganador===m.j1?'winner':(m.j1?'loser':'')):'';
      const p2c=m.estado==='completado'||m.estado==='bye'?(m.ganador===m.j2?'winner':(m.j2?'loser':'')):'';
      const t1=m.tiempo1!=null?m.tiempo1.toFixed(3)+'"':'';
      const t2=m.tiempo2!=null?m.tiempo2.toFixed(3)+'"':'';
      // Show DQ info per-pilot using inscription
      const ins1=m.j1?getInscripcion(evento,m.j1):null;
      const ins2=m.j2?getInscripcion(evento,m.j2):null;
      html+=`<div class="b-match-wrap"><div ${clickAttr}>
        <div class="b-match-num">C${mi+1}${m.estado==='bye'?' · BYE':canClick?' · CLICK P/ REGISTRAR':''}</div>
        <div class="b-player ${p1c}">
          <span class="b-player-name">${m.ganador===m.j1?'🏁 ':''}${m.j1?getJugadorNombre(m.j1):'<span class="b-tbd">POR DEFINIR</span>'}</span>
          ${ins1?`<span style="font-family:var(--mono);font-size:.55rem;color:var(--text3);">${TOPES[ins1.clase]?.label||''}</span>`:''}
          ${t1?`<span class="b-player-time ${m.dq1?'dq':''}">${m.dq1?'DQ ':''} ${t1}</span>`:''}
        </div>
        ${m.j2!==null?`<div class="b-player ${p2c}">
          <span class="b-player-name">${m.ganador===m.j2?'🏁 ':''}${m.j2?getJugadorNombre(m.j2):'<span class="b-tbd">POR DEFINIR</span>'}</span>
          ${ins2?`<span style="font-family:var(--mono);font-size:.55rem;color:var(--text3);">${TOPES[ins2.clase]?.label||''}</span>`:''}
          ${t2?`<span class="b-player-time ${m.dq2?'dq':''}">${m.dq2?'DQ ':''} ${t2}</span>`:''}
        </div>`:`<div class="b-bye">BYE — avanza automáticamente</div>`}
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
  save(state);toast(`✓ Llave "${nombre}" generada`,'ok');
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
    el.innerHTML=`<div class="empty"><div class="e-icon">🔑</div><p>Aún no hay llaves.</p>${!_isGuest?'<button class="btn btn-purple" onclick="openAddLlave()">+ CREAR PRIMERA LLAVE</button>':''}</div>`;
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
      ${!_isGuest?`<button class="btn btn-danger btn-sm" onclick="confirmDelete('llave','${lv.id}','${lv.nombre}')">ELIMINAR</button>`:''}
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
        const canCorrect=m.estado==='completado'&&!_isGuest;
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
      const canCorrect=m.estado==='completado'&&!_isGuest;
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
  toast(`🏁 ${getJugadorNombre(ganador)} avanza`,'ok');
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
  toast(`🟣 ${getJugadorNombre(ganador)} avanza al bracket`,'ok');
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
  toast(`🏁 ${getJugadorNombre(ganador)} avanza`,'ok');
}

// Stats are computed on-the-fly via computePilotStats, so these
// revert/apply only handle the "best time" per-pilot tracking (not needed
// since we compute from matches). But we keep them as no-ops for safety.
function revertMatchStats(state,m,tope1,tope2){/* computed on-the-fly */}
function applyMatchStats(state,m,tope1,tope2){/* computed on-the-fly */}

// ═══ STATS ═══════════════════════════════════════════════════════
function renderStats(){
  const state=load();
  const{jugadores,torneos,llaves,changelog}=state;
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
  // Changelog
  if(changelog&&changelog.length){
    html+=`<div class="divider"></div><div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">📋 LOG DE CAMBIOS</div>
    <div class="table-wrap" style="max-height:300px;overflow-y:auto;"><table><thead><tr><th>FECHA</th><th>TIPO</th><th>DESCRIPCIÓN</th></tr></thead><tbody>
    ${changelog.slice(0,50).map(c=>
      `<tr><td style="font-family:var(--mono);font-size:.75rem;color:var(--text2);white-space:nowrap;">${c.fecha}</td>
      <td><span class="badge badge-clase">${c.tipo}</span></td>
      <td style="font-size:.85rem;">${c.desc}</td></tr>`
    ).join('')}
    </tbody></table></div>`;
  }
  el.innerHTML=html;
}
