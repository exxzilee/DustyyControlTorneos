// ═══ DUSTY · LIQUID GLASS FX ═══════════════════════════════════════
// Mouse-tracking glow, parallax sutil, magnetismo en CTAs, reveal por scroll.
// Todo respeta prefers-reduced-motion.

(function () {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  const TRACK_SELECTOR = '.t-card, .stat-card, .hero, .modal, .auth-box, [data-glass]';

  /* ── Mouse-tracking radial highlight ───────────────────────────── */
  function attachMouseTracking(root = document) {
    root.querySelectorAll(TRACK_SELECTOR).forEach((el) => {
      if (el.__glassBound) return;
      el.__glassBound = true;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        el.style.setProperty('--mx', x + '%');
        el.style.setProperty('--my', y + '%');
      }, { passive: true });
      el.addEventListener('mouseleave', () => {
        el.style.setProperty('--mx', '50%');
        el.style.setProperty('--my', '50%');
      });
    });
  }

  /* ── Inyectar capa de glow en .t-card si falta ─────────────────── */
  function ensureGlowLayer(root = document) {
    root.querySelectorAll('.t-card').forEach((c) => {
      if (!c.querySelector(':scope > .glass-glow')) {
        const g = document.createElement('div');
        g.className = 'glass-glow';
        c.prepend(g);
      }
    });
  }

  /* ── Magnetismo en botones primary ─────────────────────────────── */
  function attachMagnetism() {
    document.querySelectorAll('.btn-primary, .btn-white').forEach((btn) => {
      if (btn.__magBound) return;
      btn.__magBound = true;
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        btn.style.transform = `translate(${dx * 6}px, ${dy * 6 - 1}px)`;
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ── Parallax sutil de blobs en scroll ─────────────────────────── */
  let scrollY = 0, ticking = false;
  function updateParallax() {
    const b1 = document.querySelector('.lg-blob-1');
    const b2 = document.querySelector('.lg-blob-2');
    const b3 = document.querySelector('.lg-blob-3');
    if (b1) b1.style.transform = `translate3d(0, ${scrollY * 0.08}px, 0)`;
    if (b2) b2.style.transform = `translate3d(0, ${-scrollY * 0.06}px, 0)`;
    if (b3) b3.style.transform = `translate(-50%, calc(-50% + ${scrollY * 0.04}px))`;
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }, { passive: true });

  /* ── Reveal de cards por scroll (IntersectionObserver) ─────────── */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.transition = 'opacity .55s ease, transform .55s cubic-bezier(0.16,1,0.3,1)';
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  function attachReveal(root = document) {
    root.querySelectorAll('.t-card, .stat-card').forEach((el) => {
      if (el.__revealBound) return;
      el.__revealBound = true;
      el.style.opacity = '0';
      el.style.transform = 'translateY(18px)';
      io.observe(el);
    });
  }

  /* ── Re-init wrapper ───────────────────────────────────────────── */
  window.refreshGlassFx = function () {
    ensureGlowLayer();
    attachMouseTracking();
    attachMagnetism();
    attachReveal();
  };

  /* ── MutationObserver: dispara init cuando cambia el DOM ───────── */
  const mo = new MutationObserver(() => {
    requestAnimationFrame(() => window.refreshGlassFx());
  });

  function boot() {
    window.refreshGlassFx();
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
