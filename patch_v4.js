const fs = require('fs');
const path = require('path');

const appFile = path.join(__dirname, 'app.js');
let app = fs.readFileSync(appFile, 'utf8').replace(/\r\n/g, '\n');

// ── 1. Fix the Dar VIP button to correctly point to the grantVip string ──────────
const oldRender = '<td><strong>${j.username}</strong>${j.isVIP?\'<span class="badge-vip">VIP</span>\':\'\'}';
const newRender = '<td><strong>${j.username}</strong>${j.isVIP?\'<span class="badge-vip">VIP</span>\':\'\'}\\n      <button class="admin-only" style="margin-left:1rem;background:transparent;border:1px solid rgba(245,197,24,.3);color:var(--accent);font-size:.65rem;padding:.1rem .4rem;border-radius:4px;cursor:pointer;" onclick="grantVip(\\'${j.id}\\', event)">★ DAR VIP</button>';

// Only replace if it wasn't replaced already
if (!app.includes('★ DAR VIP')) {
  app = app.replace(oldRender, newRender);
}

// ── 2. Add grantVip function properly to global scope if missing ──────────────────
if (!app.includes('function grantVip')) {
  const grantVipCode = `
// ═══ VIP ADMINISTRATION ══════════════════════════════════════════
window.grantVip = function(pid, ev) {
  if(ev) ev.stopPropagation();
  const state = load();
  const idx = state.jugadores.findIndex(x=>x.id===pid);
  if(idx < 0) return;
  const isV = !!state.jugadores[idx].isVIP;
  if(confirm(isV ? "¿Quitar VIP a este piloto?" : "¿Otorgar Membresía VIP a este piloto?")) {
    state.jugadores[idx].isVIP = !isV;
    playChime();
    save(state);
    renderJugadores();
    logChange('VIP', \`Privilegios \${!isV?'otorgados a':'removidos de'} \${state.jugadores[idx].username}\`);
    toast(\`VIP \${!isV?'Otorgado':'Removido'}\`, 'ok');
  }
};
`;
  app = app.replace('// ═══ RECORD CORRECTION', grantVipCode + '\\n// ═══ RECORD CORRECTION');
}

// ── 3. Add Premium Torneos render logic if missing ────────────────────────────────
if (!app.includes('function renderPremiumTorneos')) {
  const renderPrem = `
function renderPremiumTorneos() {
  const grid = document.getElementById('premium-grid');
  if(!grid) return;
  const state = load();
  const list = (state.torneos || []).filter(t => t.isPremium).reverse();
  if(!list.length) { grid.innerHTML = '<div class="empty">No hay torneos High Stakes activos.</div>'; return; }
  
  grid.innerHTML = list.map(t => {
    const act = t.estado === 'activo';
    return \`<div class="t-card t-card-premium" onclick="openTorneoDetail('\${t.id}')" style="border-color:var(--accent);">
      <div class="premium-tag">💰 HIGH STAKES / PRIZE POOL</div>
      <div class="t-card-meta">
        <span class="status-dot \${act?'s-act':'s-fin'}"></span> \${act?'EN CURSO':'FINALIZADO'} · \${t.fecha}
      </div>
      <div class="t-card-title" style="color:var(--accent)">\${t.nombre}</div>
      <div class="helper" style="margin-top:.5rem;">\${t.notas||'...'}</div>
    </div>\`;
  }).join('');
  
  if (typeof gsap !== 'undefined') {
    gsap.fromTo('#premium-grid .t-card', {opacity:0, y:15}, {opacity:1, y:0, duration:0.3, stagger:0.05, ease:"power2.out"});
  }
}
`;
  app = app.replace('// ═══ LLAVES', renderPrem + '\\n// ═══ LLAVES');
}

fs.writeFileSync(appFile, app, 'utf8');
console.log('Patch V4 Done.');
