// ═════════════════════════════ DATA ══════════════════════════════
const TOPES = {
  C1:{label:'CLASE 1',tope:11.30}, C2:{label:'CLASE 2',tope:10.80},
  C3:{label:'CLASE 3',tope:10.30}, C4:{label:'CLASE 4',tope:9.70},
  C5:{label:'CLASE 5',tope:9.00},  C6:{label:'CLASE 6',tope:8.50},
  C7:{label:'CLASE 7',tope:8.00},  C8:{label:'CLASE 8',tope:7.60},
  C9:{label:'CLASE 9',tope:7.20},  C10:{label:'CLASE 10',tope:6.70},
  L1:{label:'LIBRE L1',tope:null}
};

// ═════════════════════════════ FIREBASE DATA LAYER ═══════════════
let _cache = { jugadores: [], torneos: [], llaves: [] };
let _dataLoaded = false;

function load() { return _cache; }

function save(state) {
  _cache = state;
  dbRef.set(state).catch(err => {
    console.error('Error guardando en Firebase:', err);
    toast('Error al guardar. Verificá tu conexión.', 'err');
  });
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// ═════════════════════════════ AUTH ══════════════════════════════
let _authMode = 'login'; // 'login' | 'register'
let _isGuest = false;

function toggleAuthMode() {
  _authMode = _authMode === 'login' ? 'register' : 'login';
  renderAuthScreen();
}

function renderAuthScreen() {
  const screen = document.getElementById('auth-screen');
  const isLogin = _authMode === 'login';
  screen.innerHTML = `
    <div class="auth-box">
      <div class="logo-main">🏎 PICADAS AR</div>
      <div class="logo-sub">GESTOR DE TORNEOS — ROBLOX</div>
      <div class="modal-title">${isLogin ? 'INICIAR SESIÓN' : 'REGISTRARSE'}</div>
      <div class="form-row">
        <label>EMAIL</label>
        <input type="email" id="auth-email" placeholder="admin@picadas.com">
      </div>
      <div class="form-row">
        <label>CONTRASEÑA</label>
        <input type="password" id="auth-pass" placeholder="${isLogin ? 'Tu contraseña' : 'Mínimo 6 caracteres'}">
      </div>
      <div class="modal-actions" style="justify-content:center;">
        <button class="btn btn-primary" onclick="doAuth()" style="width:100%;justify-content:center;">
          ${isLogin ? '🔑 ENTRAR' : '📝 CREAR CUENTA'}
        </button>
      </div>
      <div class="auth-error" id="auth-error"></div>
      <div style="margin-top:1.2rem;border-top:1px solid var(--border);padding-top:1.2rem;">
        <button class="btn btn-guest" onclick="enterGuestMode()">👁 ENTRAR COMO ESPECTADOR</button>
        <div style="text-align:center;font-family:var(--mono);font-size:.65rem;color:var(--text3);margin-top:.5rem;">Solo lectura — sin necesidad de cuenta</div>
      </div>
    </div>`;
  // Focus email field
  setTimeout(() => document.getElementById('auth-email')?.focus(), 100);
  // Enter key support
  screen.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAuth(); });
  });
}

function doAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const pass  = document.getElementById('auth-pass').value;
  const errEl = document.getElementById('auth-error');
  if (!email || !pass) { errEl.textContent = 'Completá email y contraseña.'; return; }
  errEl.textContent = '';

  const authFn = _authMode === 'login'
    ? auth.signInWithEmailAndPassword(email, pass)
    : auth.createUserWithEmailAndPassword(email, pass);

  authFn.catch(err => {
    const msgs = {
      'auth/user-not-found': 'No existe una cuenta con ese email.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/invalid-credential': 'Credenciales inválidas.',
      'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
      'auth/invalid-email': 'El email no es válido.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá un momento.'
    };
    errEl.textContent = msgs[err.code] || `Error: ${err.message}`;
  });
}

function logout() {
  if (_isGuest) {
    _isGuest = false;
    document.body.classList.remove('guest-mode');
    document.getElementById('guest-banner').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'none';
    document.getElementById('auth-screen').style.display = '';
    stopRealtimeSync();
    _dataLoaded = false;
    _cache = { jugadores: [], torneos: [], llaves: [] };
    renderAuthScreen();
    return;
  }
  auth.signOut();
}

function enterGuestMode() {
  _isGuest = true;
  document.body.classList.add('guest-mode');
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-wrapper').style.display = 'block';
  document.getElementById('user-email').textContent = 'ESPECTADOR';
  document.getElementById('btn-logout').textContent = 'INICIAR SESIÓN';
  document.getElementById('guest-banner').style.display = 'block';
  showLoading();
  startRealtimeSync();
}

function showLoading() {
  document.getElementById('loading-screen').style.display = '';
}
function hideLoading() {
  document.getElementById('loading-screen').style.display = 'none';
}

// ─── Auth state listener ─────────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) {
    // Logged in
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-wrapper').style.display = 'block';
    document.getElementById('user-email').textContent = user.email;
    document.getElementById('btn-logout').textContent = 'CERRAR SESIÓN';
    document.getElementById('guest-banner').style.display = 'none';
    document.body.classList.remove('guest-mode');
    _isGuest = false;
    showLoading();
    startRealtimeSync();
  } else {
    // Logged out — but don't interrupt guest mode
    if (_isGuest) return;
    document.getElementById('auth-screen').style.display = '';
    document.getElementById('app-wrapper').style.display = 'none';
    stopRealtimeSync();
    _dataLoaded = false;
    _cache = { jugadores: [], torneos: [], llaves: [] };
    renderAuthScreen();
  }
});

// ═════════════════════════════ REALTIME SYNC ═════════════════════
let _dbListener = null;

function startRealtimeSync() {
  _dbListener = dbRef.on('value', snap => {
    const data = snap.val();
    if (data) {
      _cache = {
        jugadores: data.jugadores || [],
        torneos: data.torneos || [],
        llaves: data.llaves || []
      };
    } else {
      // DB vacía — intentar migrar desde localStorage
      migrateFromLocalStorage();
    }
    _dataLoaded = true;
    hideLoading();
    refreshActiveTab();
  }, err => {
    console.error('Error leyendo Firebase:', err);
    hideLoading();
    toast('Error de conexión con la base de datos.', 'err');
  });
}

function stopRealtimeSync() {
  if (_dbListener) {
    dbRef.off('value', _dbListener);
    _dbListener = null;
  }
}

function refreshActiveTab() {
  const active = document.querySelector('section.active');
  if (!active) return;
  const id = active.id;
  if (id === 'jugadores') renderJugadores();
  if (id === 'torneos')   renderTorneos();
  if (id === 'llaves')    renderLlaves();
  if (id === 'stats')     renderStats();
}

// ─── Migration from localStorage ─────────────────────────────────
function migrateFromLocalStorage() {
  const KEY = 'picadasAR_v3';
  const old2 = 'picadasAR_v2';
  let raw = localStorage.getItem(KEY);
  if (!raw) raw = localStorage.getItem(old2);
  if (!raw) {
    _cache = { jugadores: [], torneos: [], llaves: [] };
    return;
  }
  try {
    const d = JSON.parse(raw);
    if (!d.llaves) d.llaves = [];
    _cache = d;
    dbRef.set(d).then(() => {
      toast('✓ Datos migrados desde localStorage a Firebase', 'ok');
    });
  } catch {
    _cache = { jugadores: [], torneos: [], llaves: [] };
  }
}

// ═════════════════════════════ NAV ═══════════════════════════════
let activeTorneoId = null;
let activeLlaveId  = null;

function goTab(tab) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
  const tabs = ['jugadores', 'torneos', 'llaves', 'stats'];
  document.querySelectorAll('nav button')[tabs.indexOf(tab)].classList.add('active');
  if (tab === 'jugadores') renderJugadores();
  if (tab === 'torneos')   renderTorneos();
  if (tab === 'llaves')    renderLlaves();
  if (tab === 'stats')     renderStats();
}

// ═════════════════════════════ TOAST ═════════════════════════════
let toastTimer;
function toast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 2800);
}

// ═════════════════════════════ MODALS ════════════════════════════
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function openModal(id)  { document.getElementById(id).classList.add('open'); }
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('open'); });
});

// ═════════════════════════════ PILOTOS ═══════════════════════════
function renderJugadores() {
  const { jugadores } = load();
  const q = (document.getElementById('searchPiloto')?.value || '').toLowerCase();
  const filtered = jugadores.filter(j =>
    j.username.toLowerCase().includes(q) || (j.vehiculo || '').toLowerCase().includes(q) || j.clase.toLowerCase().includes(q)
  );
  const el = document.getElementById('jugadores-table');
  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🏎</div><p>${jugadores.length ? 'Sin resultados.' : 'Aún no hay pilotos.'}</p>${!_isGuest ? '<button class="btn btn-primary" onclick="openAddPiloto()">+ AGREGAR EL PRIMER PILOTO</button>' : ''}</div>`;
    return;
  }
  el.innerHTML = `<table><thead><tr><th>#</th><th>USERNAME</th><th>VEHÍCULO</th><th>CLASE</th><th>MEJOR TIEMPO</th><th>V</th><th>D</th><th>TORNEOS</th>${!_isGuest ? '<th>ACCIONES</th>' : ''}</tr></thead>
  <tbody>${filtered.map((j, i) => {
    const tope = TOPES[j.clase]?.tope;
    const isFast = tope !== null && j.mejorTiempo != null && j.mejorTiempo < tope;
    return `<tr><td style="color:var(--text3);font-family:var(--mono);font-size:.8rem;">${i + 1}</td>
    <td><strong>${j.username}</strong></td><td style="color:var(--text2);">${j.vehiculo || '—'}</td>
    <td><span class="badge badge-clase">${TOPES[j.clase]?.label || j.clase}</span></td>
    <td><span class="${isFast ? 'tiempo-dq' : 'tiempo-val'}">${j.mejorTiempo != null ? j.mejorTiempo.toFixed(3) + '"' : '—'}</span></td>
    <td style="color:var(--green);font-family:var(--mono);">${j.victorias || 0}</td>
    <td style="color:var(--red);font-family:var(--mono);">${j.derrotas || 0}</td>
    <td style="font-family:var(--mono);">${j.torneos || 0}</td>
    ${!_isGuest ? `<td><button class="btn btn-ghost btn-sm" onclick="openEditPiloto('${j.id}')">EDITAR</button>
    <button class="btn btn-danger btn-sm" style="margin-left:.4rem;" onclick="confirmDelete('piloto','${j.id}','${j.username}')">✕</button></td>` : ''}</tr>`;
  }).join('')}</tbody></table>`;
}

function openAddPiloto() {
  document.getElementById('modal-piloto-title').textContent = 'NUEVO PILOTO';
  ['p-id', 'p-username', 'p-vehiculo', 'p-mejor'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-clase').value = 'C1';
  openModal('modal-piloto');
}
function openEditPiloto(id) {
  const { jugadores } = load();
  const j = jugadores.find(x => x.id === id); if (!j) return;
  document.getElementById('modal-piloto-title').textContent = 'EDITAR PILOTO';
  document.getElementById('p-id').value = j.id;
  document.getElementById('p-username').value = j.username;
  document.getElementById('p-vehiculo').value = j.vehiculo || '';
  document.getElementById('p-clase').value = j.clase;
  document.getElementById('p-mejor').value = j.mejorTiempo != null ? j.mejorTiempo : '';
  openModal('modal-piloto');
}
function savePiloto() {
  const state = load();
  const id = document.getElementById('p-id').value;
  const username = document.getElementById('p-username').value.trim();
  const vehiculo = document.getElementById('p-vehiculo').value.trim();
  const clase = document.getElementById('p-clase').value;
  const mejorRaw = document.getElementById('p-mejor').value;
  const mejorTiempo = mejorRaw !== '' ? parseFloat(mejorRaw) : null;
  if (!username) { toast('El username no puede estar vacío.', 'err'); return; }
  if (id) {
    const idx = state.jugadores.findIndex(j => j.id === id);
    if (idx >= 0) state.jugadores[idx] = { ...state.jugadores[idx], username, vehiculo, clase, mejorTiempo };
    toast(`✓ ${username} actualizado`, 'ok');
  } else {
    if (state.jugadores.find(j => j.username.toLowerCase() === username.toLowerCase())) { toast('Username ya existe.', 'err'); return; }
    state.jugadores.push({ id: uid(), username, vehiculo, clase, mejorTiempo, victorias: 0, derrotas: 0, torneos: 0 });
    toast(`✓ ${username} registrado`, 'ok');
  }
  save(state); closeModal('modal-piloto'); renderJugadores();
}

// ═════════════════════════════ HELPERS ═══════════════════════════
function getJugadorNombre(id) {
  const { jugadores } = load();
  return jugadores.find(j => j.id === id)?.username || '???';
}
function confirmDelete(type, id, name) {
  document.getElementById('delete-msg').textContent =
    type === 'piloto' ? `¿Eliminar al piloto "${name}"?` :
    type === 'torneo' ? `¿Eliminar el torneo "${name}"?` :
    `¿Eliminar la llave "${name}"? Esta acción no se puede deshacer.`;
  document.getElementById('delete-confirm-btn').onclick = () => {
    const state = load();
    if (type === 'piloto') state.jugadores = state.jugadores.filter(j => j.id !== id);
    if (type === 'torneo') state.torneos = state.torneos.filter(t => t.id !== id);
    if (type === 'llave')  state.llaves = state.llaves.filter(l => l.id !== id);
    save(state); closeModal('modal-delete');
    toast('Eliminado', 'ok');
    if (type === 'piloto') renderJugadores();
    if (type === 'torneo') renderTorneos();
    if (type === 'llave')  renderLlaves();
  };
  openModal('modal-delete');
}

// ─── Chips (shared) ──────────────────────────────────────────────
function renderChips(prefix, claseFilter) {
  const { jugadores } = load();
  const container = document.getElementById(`${prefix}-chips-container`);
  const filtered = claseFilter ? jugadores.filter(j => j.clase === claseFilter) : jugadores;
  container.innerHTML = filtered.map(j =>
    `<div class="chip" id="${prefix}-chip-${j.id}" onclick="toggleChip('${prefix}','${j.id}')">
      ${j.username}<span class="chip-class">${TOPES[j.clase]?.label.replace('CLASE ', 'C').replace('LIBRE ', 'L') || j.clase}</span>
    </div>`).join('');
  updateChipCount(prefix);
}
function filterChips(prefix) {
  const clase = document.getElementById(`${prefix}-clase`).value;
  renderChips(prefix, clase);
}
function toggleChip(prefix, id) {
  const el = document.getElementById(`${prefix}-chip-${id}`);
  el.classList.toggle('sel');
  updateChipCount(prefix);
  if (prefix === 'lv') updateLlavePreview();
}
function updateChipCount(prefix) {
  const count = document.querySelectorAll(`#${prefix}-chips-container .chip.sel`).length;
  const el = document.getElementById(`${prefix}-chips-count`);
  if (el) el.textContent = `(${count} seleccionados)`;
}
function getSelectedChips(prefix) {
  return [...document.querySelectorAll(`#${prefix}-chips-container .chip.sel`)].map(c => c.id.replace(`${prefix}-chip-`, ''));
}

// ═════════════════════════════ TORNEOS ═══════════════════════════
function renderTorneos() {
  const { torneos } = load();
  const el = document.getElementById('torneos-grid');
  if (!torneos.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🏆</div><p>Aún no hay torneos.</p>${!_isGuest ? '<button class="btn btn-primary" onclick="openAddTorneo()">+ CREAR PRIMER TORNEO</button>' : ''}</div>`;
    return;
  }
  el.innerHTML = `<div class="torneos-grid">${[...torneos].reverse().map(t => {
    const total = t.bracket.rondas.reduce((a, r) => a + r.filter(m => m.estado !== 'bye').length, 0);
    const done  = t.bracket.rondas.reduce((a, r) => a + r.filter(m => m.estado === 'completado').length, 0);
    const bc = t.estado === 'finalizado' ? 'badge-done' : t.estado === 'activo' ? 'badge-active' : 'badge-pending';
    const bl = t.estado === 'finalizado' ? 'FINALIZADO' : t.estado === 'activo' ? 'EN CURSO' : 'PENDIENTE';
    return `<div class="t-card" onclick="openTorneoDetail('${t.id}')">
      <div class="t-card-name">${t.nombre}</div>
      <div class="t-card-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${TOPES[t.clase]?.label || t.clase || 'LIBRE'}</span>
        <span class="meta-pill">${t.jugadores.length} pilotos</span>
        <span class="meta-pill">${done}/${total} carreras</span>
        ${t.fecha ? `<span class="meta-pill">${t.fecha}</span>` : ''}
      </div>
      ${t.campeon ? `<div style="margin-top:.8rem;font-family:var(--mono);font-size:.75rem;color:var(--accent);">🏆 ${getJugadorNombre(t.campeon)}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function openAddTorneo() {
  const { jugadores } = load();
  if (!jugadores.length) { toast('Primero registrá pilotos.', 'err'); return; }
  document.getElementById('t-nombre').value = '';
  document.getElementById('t-fecha').value = new Date().toLocaleDateString('es-AR');
  document.getElementById('t-clase').value = '';
  renderChips('t', '');
  openModal('modal-torneo');
}

function saveTorneo() {
  const nombre = document.getElementById('t-nombre').value.trim();
  const fecha  = document.getElementById('t-fecha').value.trim();
  const clase  = document.getElementById('t-clase').value;
  const selected = getSelectedChips('t');
  if (!nombre) { toast('Poné un nombre.', 'err'); return; }
  if (selected.length < 2) { toast('Seleccioná al menos 2 pilotos.', 'err'); return; }
  const bracket = generarBracketSimple(selected);
  const state = load();
  selected.forEach(pid => {
    const idx = state.jugadores.findIndex(j => j.id === pid);
    if (idx >= 0) state.jugadores[idx].torneos = (state.jugadores[idx].torneos || 0) + 1;
  });
  state.torneos.push({ id: uid(), nombre, fecha, clase: clase || 'LIBRE', estado: 'activo', jugadores: selected, bracket: { rondas: bracket }, campeon: null });
  save(state); toast(`✓ Torneo "${nombre}" creado`, 'ok');
  closeModal('modal-torneo'); renderTorneos();
}

function generarBracketSimple(jugadoresIds) {
  const shuffled = [...jugadoresIds].sort(() => Math.random() - .5);
  const slots = Math.pow(2, Math.ceil(Math.log2(Math.max(shuffled.length, 2))));
  while (shuffled.length < slots) shuffled.push(null);
  const numRondas = Math.log2(slots);
  const rondas = [];
  for (let r = 0; r < numRondas; r++) {
    const matchCount = slots / Math.pow(2, r + 1);
    const ronda = [];
    for (let m = 0; m < matchCount; m++) {
      const match = { id: `r${r}m${m}`, j1: r === 0 ? shuffled[m * 2] : null, j2: r === 0 ? shuffled[m * 2 + 1] : null, tiempo1: null, tiempo2: null, ganador: null, dq1: false, dq2: false, estado: 'pendiente' };
      if (r === 0 && match.j2 === null) { match.ganador = match.j1; match.estado = 'bye'; }
      ronda.push(match);
    }
    rondas.push(ronda);
  }
  for (let r = 0; r < rondas.length - 1; r++) {
    rondas[r].forEach((m, mi) => {
      if (m.ganador) {
        const next = rondas[r + 1][Math.floor(mi / 2)];
        if (mi % 2 === 0) next.j1 = m.ganador; else next.j2 = m.ganador;
        if (next.j1 && !next.j2) { next.ganador = next.j1; next.estado = 'bye'; }
        if (next.j2 && !next.j1) { next.ganador = next.j2; next.estado = 'bye'; }
      }
    });
  }
  return rondas;
}

function openTorneoDetail(id) {
  activeTorneoId = id;
  document.getElementById('torneos-list-view').style.display = 'none';
  document.getElementById('torneo-detail-view').style.display = 'block';
  renderTorneoDetail();
}
function closeTorneoDetail() {
  activeTorneoId = null;
  document.getElementById('torneos-list-view').style.display = '';
  document.getElementById('torneo-detail-view').style.display = 'none';
  renderTorneos();
}

function renderTorneoDetail() {
  if (!activeTorneoId) return;
  const { torneos } = load();
  const t = torneos.find(x => x.id === activeTorneoId);
  if (!t) { closeTorneoDetail(); return; }
  const total = t.bracket.rondas.reduce((a, r) => a + r.filter(m => m.estado !== 'bye').length, 0);
  const done  = t.bracket.rondas.reduce((a, r) => a + r.filter(m => m.estado === 'completado').length, 0);
  const bc = t.estado === 'finalizado' ? 'badge-done' : 'badge-active';
  const bl = t.estado === 'finalizado' ? 'FINALIZADO' : 'EN CURSO';
  let html = `<div class="t-detail-head">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
      <div><div class="t-detail-name">${t.nombre}</div>
      <div class="t-detail-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${TOPES[t.clase]?.label || t.clase}</span>
        <span class="meta-pill">${t.jugadores.length} pilotos</span>
        <span class="meta-pill">${done}/${total} carreras</span>
        ${t.fecha ? `<span class="meta-pill">📅 ${t.fecha}</span>` : ''}
        ${t.clase !== 'LIBRE' && TOPES[t.clase]?.tope ? `<span class="meta-pill">TOPE ≥ ${TOPES[t.clase].tope}"</span>` : ''}
      </div></div>
      ${!_isGuest ? `<button class="btn btn-danger btn-sm" onclick="confirmDelete('torneo','${t.id}','${t.nombre}')">ELIMINAR</button>` : ''}
    </div>
  </div>`;
  if (t.campeon) html += `<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;text-align:center;">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">🏆</div>
    <div style="font-family:var(--mono);font-size:.75rem;color:var(--accent);letter-spacing:.3em;margin-bottom:.4rem;">CAMPEÓN DEL TORNEO</div>
    <div style="font-family:var(--display);font-size:2.5rem;letter-spacing:.1em;">${getJugadorNombre(t.campeon)}</div>
  </div>`;
  html += `<div class="bracket-scroll"><div class="bracket">${renderBracketCols(t.bracket.rondas, 'torneo', t.id, t.clase)}</div></div>`;
  document.getElementById('torneo-detail-content').innerHTML = html;
}

// ══════════════════════════════════════════ LLAVES ════════════════

function calcLlave(n) {
  const lp2 = Math.pow(2, Math.floor(Math.log2(n)));
  const isPow2 = (n & (n - 1)) === 0;
  if (isPow2) {
    return { hasRep: false, mainSize: n, repMatches: 0, directSlots: n, repSlots: 0, rondas: Math.log2(n) };
  }
  const excess = n - lp2;
  const repPlayers = excess * 2;
  const directSlots = lp2 - excess;
  return { hasRep: true, mainSize: lp2, repMatches: excess, repPlayers, directSlots, rondas: Math.log2(lp2) };
}

function updateLlavePreview() {
  const n = parseInt(document.getElementById('lv-n').value);
  const sel = getSelectedChips('lv').length;
  const c = calcLlave(n);
  const box = document.getElementById('llave-preview-box');
  let html = `<div class="llave-preview">`;
  if (c.hasRep) {
    html += `<div class="lp-row"><span class="lp-dot purple"></span><strong style="color:var(--purple);">REPECHAJE:</strong> ${c.repMatches} carreras clasificatorias (${c.repPlayers} pilotos)</div>`;
    html += `<div class="lp-row"><span class="lp-dot yellow"></span><strong style="color:var(--accent);">BRACKET PRINCIPAL:</strong> cuadro de ${c.mainSize} (${c.rondas} rondas)</div>`;
    html += `<div class="lp-row"><span class="lp-dot" style="background:var(--text2)"></span><strong>${c.directSlots} pilotos</strong> pasan directo al bracket — <strong>${c.repMatches} ganadores</strong> del repechaje completan el cuadro</div>`;
  } else {
    html += `<div class="lp-row"><span class="lp-dot green"></span><strong style="color:var(--green);">BRACKET PURO</strong> de ${n} — sin repechaje (${c.rondas} rondas)</div>`;
  }
  const needs = n, has = sel;
  const diff = needs - has;
  html += `<div class="lp-row" style="margin-top:.4rem;"><span class="lp-dot" style="background:${diff === 0 ? 'var(--green)' : diff > 0 ? 'var(--red)' : 'var(--accent)'}"></span>`;
  if (diff === 0)      html += `<span style="color:var(--green);">✓ Exactamente ${needs} pilotos seleccionados</span>`;
  else if (diff > 0)   html += `<span style="color:var(--red);">Faltan ${diff} piloto${diff > 1 ? 's' : ''} (necesitás ${needs})</span>`;
  else                 html += `<span style="color:var(--accent);">Tenés ${-diff} piloto${-diff > 1 ? 's' : ''} de más (máximo ${needs})</span>`;
  html += `</div></div>`;
  box.innerHTML = html;
}

function openAddLlave() {
  const { jugadores } = load();
  if (!jugadores.length) { toast('Primero registrá pilotos.', 'err'); return; }
  document.getElementById('lv-nombre').value = '';
  document.getElementById('lv-fecha').value = new Date().toLocaleDateString('es-AR');
  document.getElementById('lv-clase').value = '';
  document.getElementById('lv-n').value = '16';
  renderChips('lv', '');
  updateLlavePreview();
  openModal('modal-llave');
}

function saveLlave() {
  const nombre  = document.getElementById('lv-nombre').value.trim();
  const fecha   = document.getElementById('lv-fecha').value.trim();
  const clase   = document.getElementById('lv-clase').value;
  const n       = parseInt(document.getElementById('lv-n').value);
  const selected = getSelectedChips('lv');
  if (!nombre) { toast('Poné un nombre.', 'err'); return; }
  if (selected.length !== n) { toast(`Seleccioná exactamente ${n} pilotos (tenés ${selected.length}).`, 'err'); return; }

  const c = calcLlave(n);
  const shuffled = [...selected].sort(() => Math.random() - .5);
  const state = load();

  selected.forEach(pid => {
    const idx = state.jugadores.findIndex(j => j.id === pid);
    if (idx >= 0) state.jugadores[idx].torneos = (state.jugadores[idx].torneos || 0) + 1;
  });

  let llave;
  if (!c.hasRep) {
    llave = {
      id: uid(), nombre, fecha, clase: clase || 'LIBRE', n,
      estado: 'activo', jugadores: selected,
      hasRep: false, repechajeMatches: [],
      bracketRondas: generarBracketSimple(shuffled),
      campeon: null
    };
  } else {
    const repechajeJugadores = shuffled.slice(0, c.repPlayers);
    const directJugadores    = shuffled.slice(c.repPlayers);
    const repechajeMatches = [];
    for (let i = 0; i < c.repMatches; i++) {
      repechajeMatches.push({
        id: `rep${i}`, repIdx: i,
        j1: repechajeJugadores[i * 2], j2: repechajeJugadores[i * 2 + 1],
        tiempo1: null, tiempo2: null, ganador: null, dq1: false, dq2: false, estado: 'pendiente'
      });
    }
    const mainSize = c.mainSize;
    const numRondas = c.rondas;
    const slots = [];
    let di = 0, ri = 0;
    const repInterval = Math.floor(mainSize / (c.repMatches));
    for (let i = 0; i < mainSize; i++) {
      if (ri < c.repMatches && (i + 1) % repInterval === 0 && slots.filter(s => s.type === 'rep').length < c.repMatches) {
        slots.push({ type: 'rep', repIdx: ri++ });
      } else if (di < directJugadores.length) {
        slots.push({ type: 'direct', pid: directJugadores[di++] });
      } else {
        slots.push({ type: 'rep', repIdx: ri++ });
      }
    }
    while (di < directJugadores.length) slots.push({ type: 'direct', pid: directJugadores[di++] });
    while (ri < c.repMatches) slots.push({ type: 'rep', repIdx: ri++ });

    const bracketRondas = [];
    for (let r = 0; r < numRondas; r++) {
      const matchCount = mainSize / Math.pow(2, r + 1);
      const ronda = [];
      for (let m = 0; m < matchCount; m++) {
        const match = { id: `r${r}m${m}`, j1: null, j2: null, j1RepIdx: null, j2RepIdx: null, tiempo1: null, tiempo2: null, ganador: null, dq1: false, dq2: false, estado: 'pendiente' };
        if (r === 0) {
          const s1 = slots[m * 2], s2 = slots[m * 2 + 1];
          if (s1.type === 'direct') { match.j1 = s1.pid; } else { match.j1RepIdx = s1.repIdx; }
          if (s2.type === 'direct') { match.j2 = s2.pid; } else { match.j2RepIdx = s2.repIdx; }
          if (match.j1 && match.j2) match.estado = 'pendiente';
          else match.estado = 'esperando-rep';
        }
        ronda.push(match);
      }
      bracketRondas.push(ronda);
    }
    llave = {
      id: uid(), nombre, fecha, clase: clase || 'LIBRE', n,
      estado: 'activo', jugadores: selected,
      hasRep: true, repechajeMatches, bracketRondas, campeon: null
    };
  }

  state.llaves.push(llave);
  save(state);
  toast(`✓ Llave "${nombre}" generada con ${n} pilotos` + (c.hasRep ? ` (${c.repMatches} repechajes)` : ''), 'ok');
  closeModal('modal-llave');
  renderLlaves();
}

function renderLlaves() {
  const { llaves } = load();
  const listView = document.getElementById('llaves-list-view');
  const detailView = document.getElementById('llave-detail-view');
  if (activeLlaveId) {
    listView.style.display = 'none';
    detailView.style.display = 'block';
    renderLlaveDetail();
    return;
  }
  listView.style.display = '';
  detailView.style.display = 'none';
  const el = document.getElementById('llaves-grid');
  if (!llaves.length) {
    el.innerHTML = `<div class="empty"><div class="e-icon">🔑</div><p>Aún no hay llaves creadas.</p>${!_isGuest ? '<button class="btn btn-purple" onclick="openAddLlave()">+ CREAR PRIMERA LLAVE</button>' : ''}</div>`;
    return;
  }
  el.innerHTML = `<div class="torneos-grid">${[...llaves].reverse().map(lv => {
    const bc = lv.estado === 'finalizado' ? 'badge-done' : 'badge-active';
    const bl = lv.estado === 'finalizado' ? 'FINALIZADO' : 'EN CURSO';
    const totalMain = lv.bracketRondas.reduce((a, r) => a + r.filter(m => m.estado !== 'bye' && m.estado !== 'esperando-rep').length, 0);
    const doneMain  = lv.bracketRondas.reduce((a, r) => a + r.filter(m => m.estado === 'completado').length, 0);
    const doneRep   = lv.repechajeMatches.filter(m => m.estado === 'completado').length;
    const totalRep  = lv.repechajeMatches.length;
    return `<div class="t-card" onclick="openLlaveDetail('${lv.id}')">
      <div class="t-card-name">${lv.nombre}</div>
      <div class="t-card-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${TOPES[lv.clase]?.label || lv.clase}</span>
        <span class="meta-pill">${lv.n} corredores</span>
        ${lv.hasRep ? `<span class="badge badge-rep">REP: ${doneRep}/${totalRep}</span>` : ''}
        <span class="meta-pill">BRACKET: ${doneMain}/${totalMain}</span>
        ${lv.fecha ? `<span class="meta-pill">${lv.fecha}</span>` : ''}
      </div>
      ${lv.campeon ? `<div style="margin-top:.8rem;font-family:var(--mono);font-size:.75rem;color:var(--accent);">🏆 ${getJugadorNombre(lv.campeon)}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

function openLlaveDetail(id) {
  activeLlaveId = id;
  renderLlaves();
}
function closeLlaveDetail() {
  activeLlaveId = null;
  renderLlaves();
}

function renderLlaveDetail() {
  if (!activeLlaveId) return;
  const { llaves } = load();
  const lv = llaves.find(x => x.id === activeLlaveId);
  if (!lv) { closeLlaveDetail(); return; }

  const totalRep = lv.repechajeMatches.length;
  const doneRep  = lv.repechajeMatches.filter(m => m.estado === 'completado').length;
  const totalMain = lv.bracketRondas.reduce((a, r) => a + r.filter(m => m.estado !== 'bye' && m.estado !== 'esperando-rep').length, 0);
  const doneMain  = lv.bracketRondas.reduce((a, r) => a + r.filter(m => m.estado === 'completado').length, 0);
  const bc = lv.estado === 'finalizado' ? 'badge-done' : 'badge-active';
  const bl = lv.estado === 'finalizado' ? 'FINALIZADO' : 'EN CURSO';

  let html = `<div class="t-detail-head">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1rem;">
      <div><div class="t-detail-name">${lv.nombre}</div>
      <div class="t-detail-meta">
        <span class="badge ${bc}">${bl}</span>
        <span class="meta-pill">${TOPES[lv.clase]?.label || lv.clase}</span>
        <span class="meta-pill">${lv.n} corredores</span>
        ${lv.hasRep ? `<span class="badge badge-rep">REPECHAJE ${doneRep}/${totalRep}</span>` : ''}
        <span class="meta-pill">BRACKET ${doneMain}/${totalMain}</span>
        ${lv.fecha ? `<span class="meta-pill">📅 ${lv.fecha}</span>` : ''}
        ${lv.clase !== 'LIBRE' && TOPES[lv.clase]?.tope ? `<span class="meta-pill">TOPE ≥ ${TOPES[lv.clase].tope}"</span>` : ''}
      </div></div>
      ${!_isGuest ? `<button class="btn btn-danger btn-sm" onclick="confirmDelete('llave','${lv.id}','${lv.nombre}')">ELIMINAR</button>` : ''}
    </div>
  </div>`;

  if (lv.campeon) html += `<div style="background:var(--bg2);border:1px solid var(--accent);border-radius:8px;padding:1.5rem;margin-bottom:1.5rem;text-align:center;">
    <div style="font-size:2.5rem;margin-bottom:.5rem;">🏆</div>
    <div style="font-family:var(--mono);font-size:.75rem;color:var(--accent);letter-spacing:.3em;margin-bottom:.4rem;">CAMPEÓN DE LA LLAVE</div>
    <div style="font-family:var(--display);font-size:2.5rem;letter-spacing:.1em;">${getJugadorNombre(lv.campeon)}</div>
  </div>`;

  // ─── REPECHAJE SECTION ───
  if (lv.hasRep) {
    const repDone = lv.repechajeMatches.every(m => m.estado === 'completado');
    html += `<div class="rep-section-title">🟣 REPECHAJE CLASIFICATORIO — ${doneRep}/${totalRep} carreras completadas</div>
    <div class="rep-section-body">
      <p style="font-family:var(--mono);font-size:.72rem;color:var(--text2);margin-bottom:1rem;">
        Los ganadores de cada repechaje avanzan al bracket principal. Los perdedores quedan eliminados.
      </p>
      <div class="rep-matches-grid">
        ${lv.repechajeMatches.map((m, mi) => {
          const canClick = m.estado === 'pendiente';
          const p1c = m.estado === 'completado' ? (m.ganador === m.j1 ? 'winner' : 'loser') : '';
          const p2c = m.estado === 'completado' ? (m.ganador === m.j2 ? 'winner' : 'loser') : '';
          const t1 = m.tiempo1 != null ? m.tiempo1.toFixed(3) + '"' : '';
          const t2 = m.tiempo2 != null ? m.tiempo2.toFixed(3) + '"' : '';
          const tgt = findRepTargetSlot(lv, mi);
          return `<div class="b-match rep-match${canClick ? ' clickable' : ''}" ${canClick ? `onclick="openResultLlave('${lv.id}','rep',${mi})"` : ''}>
            <div class="b-match-num rep-num">REPECHAJE #${mi + 1}${tgt ? ` → ${tgt}` : ''}${canClick ? ' · CLICK P/ REGISTRAR' : ''}</div>
            <div class="b-player ${p1c}">
              <span class="b-player-name">${m.ganador === m.j1 ? '🏁 ' : ''}${getJugadorNombre(m.j1)}</span>
              ${t1 ? `<span class="b-player-time ${m.dq1 ? 'dq' : ''}">${m.dq1 ? 'DQ ' : ''} ${t1}</span>` : ''}
            </div>
            <div class="b-player ${p2c}">
              <span class="b-player-name">${m.ganador === m.j2 ? '🏁 ' : ''}${getJugadorNombre(m.j2)}</span>
              ${t2 ? `<span class="b-player-time ${m.dq2 ? 'dq' : ''}">${m.dq2 ? 'DQ ' : ''} ${t2}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
      ${repDone ? `<p style="font-family:var(--mono);font-size:.75rem;color:var(--green);margin-top:1rem;">✓ Todos los repechajes completados — bracket principal desbloqueado</p>` : ''}
    </div>`;
    html += `<div class="rep-separator"><div class="rep-sep-line"></div><div class="rep-sep-label">↓ BRACKET PRINCIPAL</div><div class="rep-sep-line"></div></div>`;
  }

  html += `<div class="bracket-scroll"><div class="bracket">${renderBracketColsLlave(lv)}</div></div>`;
  document.getElementById('llave-detail-content').innerHTML = html;
}

function findRepTargetSlot(lv, repIdx) {
  for (let mi = 0; mi < lv.bracketRondas[0].length; mi++) {
    const m = lv.bracketRondas[0][mi];
    if (m.j1RepIdx === repIdx) return `R1-C${mi + 1} lado A`;
    if (m.j2RepIdx === repIdx) return `R1-C${mi + 1} lado B`;
  }
  return null;
}

function renderBracketColsLlave(lv) {
  const numRondas = lv.bracketRondas.length;
  let html = '';
  lv.bracketRondas.forEach((ronda, ri) => {
    const name = roundName(ri, numRondas);
    html += `<div class="b-round"><div class="b-round-title">${name}</div><div class="b-matches">`;
    ronda.forEach((m, mi) => {
      const waiting = m.estado === 'esperando-rep';
      const canClick = !waiting && m.estado === 'pendiente' && m.j1 && m.j2;
      const clickAttr = canClick ? `class="b-match clickable" onclick="openResultLlave('${lv.id}','main',${ri},${mi})"` :
                        waiting ? 'class="b-match" style="opacity:.6"' : 'class="b-match"';

      const p1name = m.j1 ? getJugadorNombre(m.j1) : null;
      const p2name = m.j2 ? getJugadorNombre(m.j2) : null;
      let p1c = '', p2c = '';
      if (m.estado === 'completado' || m.estado === 'bye') {
        p1c = m.ganador === m.j1 ? 'winner' : (m.j1 ? 'loser' : '');
        p2c = m.ganador === m.j2 ? 'winner' : (m.j2 ? 'loser' : '');
      }
      const t1 = m.tiempo1 != null ? m.tiempo1.toFixed(3) + '"' : '';
      const t2 = m.tiempo2 != null ? m.tiempo2.toFixed(3) + '"' : '';
      const rep1Label = m.j1RepIdx != null && !m.j1 ? `REP.#${m.j1RepIdx + 1}` : null;
      const rep2Label = m.j2RepIdx != null && !m.j2 ? `REP.#${m.j2RepIdx + 1}` : null;

      html += `<div class="b-match-wrap"><div ${clickAttr}>
        <div class="b-match-num">C${mi + 1}${m.estado === 'bye' ? ' · BYE' : waiting ? ' · ESPERANDO REPECHAJE' : canClick ? ' · CLICK P/ REGISTRAR' : ''}</div>
        <div class="b-player ${p1c}">
          <span class="b-player-name">${m.ganador === m.j1 ? '🏁 ' : ''}${p1name ? p1name : rep1Label ? `<span class="b-rep-pending">→ ${rep1Label}</span>` : '<span class="b-tbd">POR DEFINIR</span>'}</span>
          ${t1 ? `<span class="b-player-time ${m.dq1 ? 'dq' : ''}">${m.dq1 ? 'DQ ' : ''} ${t1}</span>` : ''}
        </div>
        ${m.j2 !== null || rep2Label ?
          `<div class="b-player ${p2c}">
            <span class="b-player-name">${m.ganador === m.j2 ? '🏁 ' : ''}${p2name ? p2name : rep2Label ? `<span class="b-rep-pending">→ ${rep2Label}</span>` : '<span class="b-tbd">POR DEFINIR</span>'}</span>
            ${t2 ? `<span class="b-player-time ${m.dq2 ? 'dq' : ''}">${m.dq2 ? 'DQ ' : ''} ${t2}</span>` : ''}
          </div>` :
          `<div class="b-bye">BYE — avanza automáticamente</div>`
        }
      </div></div>`;
    });
    html += `</div></div>`;
  });
  return html;
}

function roundName(ri, total) {
  if (ri === total - 1) return 'FINAL';
  if (ri === total - 2 && total > 2) return 'SEMIFINAL';
  if (ri === total - 3 && total > 3) return 'CUARTOS';
  return `RONDA ${ri + 1}`;
}

// ─── Result modal for Llave ───────────────────────────────────────
function openResultLlave(llaveId, type, ...args) {
  const { llaves } = load();
  const lv = llaves.find(x => x.id === llaveId);
  if (!lv) return;

  document.getElementById('r-context-type').value = 'llave-' + type;
  document.getElementById('r-parent-id').value = llaveId;
  document.getElementById('r-modal-title').textContent = type === 'rep' ? 'REGISTRAR REPECHAJE' : 'REGISTRAR RESULTADO';
  document.getElementById('r-time1').value = '';
  document.getElementById('r-time2').value = '';
  document.getElementById('r-warn1').style.display = 'none';
  document.getElementById('r-warn2').style.display = 'none';
  document.getElementById('r-preview').textContent = '';

  const tope = TOPES[lv.clase]?.tope;
  document.getElementById('r-clase-info').innerHTML =
    tope ? `🏁 ${TOPES[lv.clase].label} · TOPE ≥ <span style="color:var(--accent)">${tope}"</span> · Si tiempo &lt; ${tope}" → DQ`
        : `🏁 ${TOPES[lv.clase]?.label || lv.clase} · SIN TOPE`;

  if (type === 'rep') {
    document.getElementById('r-ronda-idx').value = args[0];
    document.getElementById('r-match-idx').value = -1;
    const m = lv.repechajeMatches[args[0]];
    document.getElementById('r-name1').textContent = getJugadorNombre(m.j1);
    document.getElementById('r-name2').textContent = getJugadorNombre(m.j2);
  } else {
    document.getElementById('r-ronda-idx').value = args[0];
    document.getElementById('r-match-idx').value = args[1];
    const m = lv.bracketRondas[args[0]][args[1]];
    document.getElementById('r-name1').textContent = getJugadorNombre(m.j1);
    document.getElementById('r-name2').textContent = getJugadorNombre(m.j2);
  }

  ['r-time1', 'r-time2'].forEach(id => {
    document.getElementById(id).oninput = () => previewResult(llaveId, 'llave');
  });

  openModal('modal-result');
}

// ─── Shared result modal for Torneo ──────────────────────────────
function openResultTorneo(torneoId, ri, mi) {
  const { torneos } = load();
  const t = torneos.find(x => x.id === torneoId);
  const m = t.bracket.rondas[ri][mi];
  const tope = TOPES[t.clase]?.tope;
  document.getElementById('r-context-type').value = 'torneo';
  document.getElementById('r-parent-id').value = torneoId;
  document.getElementById('r-ronda-idx').value = ri;
  document.getElementById('r-match-idx').value = mi;
  document.getElementById('r-modal-title').textContent = 'REGISTRAR RESULTADO';
  document.getElementById('r-name1').textContent = getJugadorNombre(m.j1);
  document.getElementById('r-name2').textContent = getJugadorNombre(m.j2);
  document.getElementById('r-time1').value = '';
  document.getElementById('r-time2').value = '';
  document.getElementById('r-warn1').style.display = 'none';
  document.getElementById('r-warn2').style.display = 'none';
  document.getElementById('r-preview').textContent = '';
  document.getElementById('r-clase-info').innerHTML =
    tope ? `🏁 ${TOPES[t.clase].label} · TOPE ≥ <span style="color:var(--accent)">${tope}"</span> · Si tiempo &lt; ${tope}" → DQ`
        : `🏁 ${TOPES[t.clase]?.label || t.clase} · SIN TOPE`;
  ['r-time1', 'r-time2'].forEach(id => {
    document.getElementById(id).oninput = () => previewResult(torneoId, 'torneo');
  });
  openModal('modal-result');
}

function previewResult(parentId, parentType) {
  let clase = 'LIBRE';
  const state = load();
  if (parentType === 'torneo') clase = (state.torneos.find(x => x.id === parentId) || {}).clase || 'LIBRE';
  else clase = (state.llaves.find(x => x.id === parentId) || {}).clase || 'LIBRE';
  const tope = TOPES[clase]?.tope;
  const t1r = document.getElementById('r-time1').value;
  const t2r = document.getElementById('r-time2').value;
  const t1 = t1r !== '' ? parseFloat(t1r) : null;
  const t2 = t2r !== '' ? parseFloat(t2r) : null;
  const w1 = document.getElementById('r-warn1');
  const w2 = document.getElementById('r-warn2');
  if (tope !== null) {
    if (t1 !== null && t1 < tope) { w1.textContent = `⚠ ${t1.toFixed(3)}" < ${tope}" → CRUZÓ EL TOPE → DQ`; w1.style.display = ''; } else w1.style.display = 'none';
    if (t2 !== null && t2 < tope) { w2.textContent = `⚠ ${t2.toFixed(3)}" < ${tope}" → CRUZÓ EL TOPE → DQ`; w2.style.display = ''; } else w2.style.display = 'none';
  }
  if (t1 === null || t2 === null) { document.getElementById('r-preview').textContent = ''; return; }
  const dq1 = tope !== null && t1 < tope, dq2 = tope !== null && t2 < tope;
  let msg = '';
  if (dq1 && dq2) { const d1 = Math.abs(t1 - tope), d2 = Math.abs(t2 - tope); const w = d1 <= d2 ? document.getElementById('r-name1').textContent : document.getElementById('r-name2').textContent; msg = `⚠ Ambos DQ → Gana quien más se acercó al tope: ${w}`; }
  else if (dq1) msg = `→ Ganador: ${document.getElementById('r-name2').textContent} (rival DQ)`;
  else if (dq2) msg = `→ Ganador: ${document.getElementById('r-name1').textContent} (rival DQ)`;
  else { const w = t1 <= t2 ? document.getElementById('r-name1').textContent : document.getElementById('r-name2').textContent; msg = `→ Ganador: ${w} (${Math.min(t1, t2).toFixed(3)}")`; }
  document.getElementById('r-preview').textContent = msg;
}

function saveResult() {
  const contextType = document.getElementById('r-context-type').value;
  const parentId    = document.getElementById('r-parent-id').value;
  const ri          = parseInt(document.getElementById('r-ronda-idx').value);
  const mi          = parseInt(document.getElementById('r-match-idx').value);
  const t1r = document.getElementById('r-time1').value;
  const t2r = document.getElementById('r-time2').value;
  if (t1r === '' || t2r === '') { toast('Ingresá ambos tiempos.', 'err'); return; }
  const t1 = parseFloat(t1r), t2 = parseFloat(t2r);
  if (isNaN(t1) || isNaN(t2) || t1 <= 0 || t2 <= 0) { toast('Tiempos inválidos.', 'err'); return; }

  if (contextType === 'torneo') saveResultTorneo(parentId, ri, mi, t1, t2);
  else if (contextType === 'llave-rep')  saveResultLlaveRep(parentId, ri, t1, t2);
  else if (contextType === 'llave-main') saveResultLlaveMain(parentId, ri, mi, t1, t2);
}

function calcWinner(j1, j2, t1, t2, tope) {
  const dq1 = tope !== null && t1 < tope;
  const dq2 = tope !== null && t2 < tope;
  let ganador;
  if (dq1 && dq2) { ganador = Math.abs(t1 - tope) <= Math.abs(t2 - tope) ? j1 : j2; }
  else if (dq1) ganador = j2;
  else if (dq2) ganador = j1;
  else          ganador = t1 <= t2 ? j1 : j2;
  return { ganador, dq1, dq2 };
}

function applyPlayerResult(state, winnerId, loserId, winnerTime, loserTime, tope) {
  const wi = state.jugadores.findIndex(j => j.id === winnerId);
  const li = state.jugadores.findIndex(j => j.id === loserId);
  if (wi >= 0) {
    state.jugadores[wi].victorias = (state.jugadores[wi].victorias || 0) + 1;
    const wt = winnerTime;
    if (TOPES[state.jugadores[wi]?.clase]?.tope == null || wt >= (tope || 0)) {
      if (state.jugadores[wi].mejorTiempo == null || wt < state.jugadores[wi].mejorTiempo) state.jugadores[wi].mejorTiempo = wt;
    }
  }
  if (li >= 0) {
    state.jugadores[li].derrotas = (state.jugadores[li].derrotas || 0) + 1;
    const lt = loserTime;
    if (state.jugadores[li].mejorTiempo == null || lt < state.jugadores[li].mejorTiempo) state.jugadores[li].mejorTiempo = lt;
  }
}

function saveResultTorneo(torneoId, ri, mi, t1, t2) {
  const state = load();
  const t = state.torneos.find(x => x.id === torneoId);
  const m = t.bracket.rondas[ri][mi];
  const tope = TOPES[t.clase]?.tope || null;
  const { ganador, dq1, dq2 } = calcWinner(m.j1, m.j2, t1, t2, tope);
  m.tiempo1 = t1; m.tiempo2 = t2; m.ganador = ganador; m.dq1 = dq1; m.dq2 = dq2; m.estado = 'completado';
  const loserId = ganador === m.j1 ? m.j2 : m.j1;
  const winnerTime = ganador === m.j1 ? t1 : t2;
  const loserTime = ganador === m.j1 ? t2 : t1;
  applyPlayerResult(state, ganador, loserId, winnerTime, loserTime, tope);
  if (ri + 1 < t.bracket.rondas.length) {
    const next = t.bracket.rondas[ri + 1][Math.floor(mi / 2)];
    if (mi % 2 === 0) next.j1 = ganador; else next.j2 = ganador;
    if (next.j1 && next.j2) next.estado = 'pendiente';
  } else {
    t.estado = 'finalizado'; t.campeon = ganador;
  }
  save(state); closeModal('modal-result'); renderTorneoDetail();
  toast(`🏁 ${getJugadorNombre(ganador)} avanza`, 'ok');
}

function saveResultLlaveRep(llaveId, repIdx, t1, t2) {
  const state = load();
  const lv = state.llaves.find(x => x.id === llaveId);
  const m = lv.repechajeMatches[repIdx];
  const tope = TOPES[lv.clase]?.tope || null;
  const { ganador, dq1, dq2 } = calcWinner(m.j1, m.j2, t1, t2, tope);
  m.tiempo1 = t1; m.tiempo2 = t2; m.ganador = ganador; m.dq1 = dq1; m.dq2 = dq2; m.estado = 'completado';
  const loserId = ganador === m.j1 ? m.j2 : m.j1;
  applyPlayerResult(state, ganador, loserId, ganador === m.j1 ? t1 : t2, ganador === m.j1 ? t2 : t1, tope);
  for (let mi2 = 0; mi2 < lv.bracketRondas[0].length; mi2++) {
    const bm = lv.bracketRondas[0][mi2];
    if (bm.j1RepIdx === repIdx) bm.j1 = ganador;
    if (bm.j2RepIdx === repIdx) bm.j2 = ganador;
    if (bm.estado === 'esperando-rep') {
      const j1ready = bm.j1 !== null || (bm.j1RepIdx !== null && lv.repechajeMatches[bm.j1RepIdx]?.estado === 'completado');
      const j2ready = bm.j2 !== null || (bm.j2RepIdx !== null && lv.repechajeMatches[bm.j2RepIdx]?.estado === 'completado');
      if (j1ready && j2ready) bm.estado = 'pendiente';
    }
  }
  save(state); closeModal('modal-result'); renderLlaveDetail();
  toast(`🟣 Repechaje: ${getJugadorNombre(ganador)} avanza al bracket`, 'ok');
}

function saveResultLlaveMain(llaveId, ri, mi, t1, t2) {
  const state = load();
  const lv = state.llaves.find(x => x.id === llaveId);
  const m = lv.bracketRondas[ri][mi];
  const tope = TOPES[lv.clase]?.tope || null;
  const { ganador, dq1, dq2 } = calcWinner(m.j1, m.j2, t1, t2, tope);
  m.tiempo1 = t1; m.tiempo2 = t2; m.ganador = ganador; m.dq1 = dq1; m.dq2 = dq2; m.estado = 'completado';
  const loserId = ganador === m.j1 ? m.j2 : m.j1;
  applyPlayerResult(state, ganador, loserId, ganador === m.j1 ? t1 : t2, ganador === m.j1 ? t2 : t1, tope);
  if (ri + 1 < lv.bracketRondas.length) {
    const next = lv.bracketRondas[ri + 1][Math.floor(mi / 2)];
    if (mi % 2 === 0) next.j1 = ganador; else next.j2 = ganador;
    if (next.j1 && next.j2) next.estado = 'pendiente';
  } else {
    lv.estado = 'finalizado'; lv.campeon = ganador;
  }
  save(state); closeModal('modal-result'); renderLlaveDetail();
  toast(`🏁 ${getJugadorNombre(ganador)} avanza`, 'ok');
}

// ─── Shared bracket renderer for Torneos ────────────────────────
function renderBracketCols(rondas, type, parentId, clase) {
  const numRondas = rondas.length;
  let html = '';
  rondas.forEach((ronda, ri) => {
    html += `<div class="b-round"><div class="b-round-title">${roundName(ri, numRondas)}</div><div class="b-matches">`;
    ronda.forEach((m, mi) => {
      const canClick = m.estado === 'pendiente' && m.j1 && m.j2;
      const clickAttr = canClick ? `class="b-match clickable" onclick="openResultTorneo('${parentId}',${ri},${mi})"` :
                                  `class="b-match"`;
      const p1c = m.estado === 'completado' || m.estado === 'bye' ? (m.ganador === m.j1 ? 'winner' : (m.j1 ? 'loser' : '')) : '';
      const p2c = m.estado === 'completado' || m.estado === 'bye' ? (m.ganador === m.j2 ? 'winner' : (m.j2 ? 'loser' : '')) : '';
      const t1 = m.tiempo1 != null ? m.tiempo1.toFixed(3) + '"' : '';
      const t2 = m.tiempo2 != null ? m.tiempo2.toFixed(3) + '"' : '';
      html += `<div class="b-match-wrap"><div ${clickAttr}>
        <div class="b-match-num">C${mi + 1}${m.estado === 'bye' ? ' · BYE' : canClick ? ' · CLICK P/ REGISTRAR' : ''}</div>
        <div class="b-player ${p1c}">
          <span class="b-player-name">${m.ganador === m.j1 ? '🏁 ' : ''}${m.j1 ? getJugadorNombre(m.j1) : '<span class="b-tbd">POR DEFINIR</span>'}</span>
          ${t1 ? `<span class="b-player-time ${m.dq1 ? 'dq' : ''}">${m.dq1 ? 'DQ ' : ''} ${t1}</span>` : ''}
        </div>
        ${m.j2 !== null ?
          `<div class="b-player ${p2c}">
            <span class="b-player-name">${m.ganador === m.j2 ? '🏁 ' : ''}${m.j2 ? getJugadorNombre(m.j2) : '<span class="b-tbd">POR DEFINIR</span>'}</span>
            ${t2 ? `<span class="b-player-time ${m.dq2 ? 'dq' : ''}">${m.dq2 ? 'DQ ' : ''} ${t2}</span>` : ''}
          </div>` :
          `<div class="b-bye">BYE — avanza automáticamente</div>`
        }
      </div></div>`;
    });
    html += `</div></div>`;
  });
  return html;
}

// ═════════════════════════════ STATS ═════════════════════════════
function renderStats() {
  const { jugadores, torneos, llaves } = load();
  const el = document.getElementById('stats-content');
  const totalCarreras = jugadores.reduce((a, j) => a + (j.victorias || 0) + (j.derrotas || 0), 0);
  let html = `<div class="stat-row">
    <div class="stat-card"><div class="stat-val">${jugadores.length}</div><div class="stat-lbl">PILOTOS</div></div>
    <div class="stat-card"><div class="stat-val">${torneos.length}</div><div class="stat-lbl">TORNEOS</div></div>
    <div class="stat-card"><div class="stat-val">${llaves.length}</div><div class="stat-lbl">LLAVES</div></div>
    <div class="stat-card"><div class="stat-val">${torneos.filter(t => t.estado === 'finalizado').length + llaves.filter(l => l.estado === 'finalizado').length}</div><div class="stat-lbl">FINALIZADOS</div></div>
    <div class="stat-card"><div class="stat-val">${totalCarreras}</div><div class="stat-lbl">CARRERAS</div></div>
  </div>`;
  const ranked = [...jugadores].sort((a, b) => {
    const va = a.victorias || 0, vb = b.victorias || 0;
    if (vb !== va) return vb - va;
    const ra = va + (a.derrotas || 0), rb = vb + (b.derrotas || 0);
    const wa = ra ? va / ra : 0, wb = rb ? vb / rb : 0;
    return wb - wa;
  });
  html += `<div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">RANKING DE PILOTOS</div>
  <div class="table-wrap"><table><thead><tr><th>#</th><th>PILOTO</th><th>CLASE</th><th>V</th><th>D</th><th>%</th><th>MEJOR TIEMPO</th><th>TORNEOS</th></tr></thead><tbody>
  ${ranked.map((j, i) => {
    const total = (j.victorias || 0) + (j.derrotas || 0);
    const pct = total > 0 ? ((j.victorias || 0) / total * 100).toFixed(1) + '%' : '—';
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
    const tope = TOPES[j.clase]?.tope;
    const isFast = tope !== null && j.mejorTiempo != null && j.mejorTiempo < tope;
    return `<tr class="rank-${i + 1}"><td class="rank-num">${medal}${i + 1}</td>
    <td><strong>${j.username}</strong></td>
    <td><span class="badge badge-clase">${TOPES[j.clase]?.label || j.clase}</span></td>
    <td style="color:var(--green);font-family:var(--mono);">${j.victorias || 0}</td>
    <td style="color:var(--red);font-family:var(--mono);">${j.derrotas || 0}</td>
    <td style="font-family:var(--mono);">${pct}</td>
    <td><span class="${isFast ? 'tiempo-dq' : 'tiempo-val'}">${j.mejorTiempo != null ? j.mejorTiempo.toFixed(3) + '"' : '—'}</span></td>
    <td style="font-family:var(--mono);">${j.torneos || 0}</td></tr>`;
  }).join('')}
  </tbody></table></div>`;
  // Records per class
  html += `<div class="divider"></div><div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">RÉCORDS POR CLASE</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;">`;
  Object.entries(TOPES).forEach(([key, info]) => {
    const inClass = jugadores.filter(j => j.clase === key && j.mejorTiempo != null);
    const valid = inClass.filter(j => info.tope === null || j.mejorTiempo >= info.tope);
    const best = valid.sort((a, b) => a.mejorTiempo - b.mejorTiempo)[0];
    html += `<div class="stat-card" style="text-align:left;">
      <div style="font-family:var(--display);font-size:1.1rem;letter-spacing:.1em;margin-bottom:.2rem;">${info.label}</div>
      ${info.tope ? `<div style="font-family:var(--mono);font-size:.65rem;color:var(--text3);margin-bottom:.5rem;">TOPE ≥ ${info.tope}"</div>` : '<div style="height:.5rem"></div>'}
      ${best ? `<div style="font-family:var(--display);font-size:1.8rem;color:var(--accent);">${best.mejorTiempo.toFixed(3)}"</div>
              <div style="font-size:.85rem;color:var(--text2);margin-top:.2rem;">${best.username}</div>` :
              `<div style="font-family:var(--mono);font-size:.7rem;color:var(--text3);">SIN DATOS</div>`}
    </div>`;
  });
  html += `</div>`;
  // Champions
  const camps = [...torneos, ...llaves].filter(x => x.campeon);
  if (camps.length) {
    html += `<div class="divider"></div><div class="s-title" style="font-size:1.4rem;margin-bottom:1rem;">HISTORIAL DE CAMPEONES</div>
    <div class="table-wrap"><table><thead><tr><th>NOMBRE</th><th>TIPO</th><th>CLASE</th><th>CAMPEÓN</th><th>FECHA</th></tr></thead><tbody>
    ${[...camps].reverse().map(x =>
      `<tr><td><strong>${x.nombre}</strong></td>
      <td><span class="badge ${x.bracketRondas ? 'badge-rep' : 'badge-done'}">${x.bracketRondas ? 'LLAVE' : 'TORNEO'}</span></td>
      <td><span class="badge badge-clase">${TOPES[x.clase]?.label || x.clase}</span></td>
      <td style="color:var(--accent);">🏆 ${getJugadorNombre(x.campeon)}</td>
      <td style="font-family:var(--mono);color:var(--text2);">${x.fecha || '—'}</td></tr>`
    ).join('')}
    </tbody></table></div>`;
  }
  el.innerHTML = html;
}

// ═════════════════════════════ INIT ══════════════════════════════
// Auth screen renders on auth state change
// Data loads when authenticated via realtime listener
