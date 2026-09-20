/* One shared tap sound + haptic buzz for every button, link and form control
   on the site. Delegated on document so it also covers elements the JS
   renders later (menus, admin tables, dialogs) without wiring each one up. */
(function () {
  let ctx;
  function tone() {
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(720, t);
      osc.frequency.exponentialRampToValueAtTime(480, t + 0.07);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.15, t + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch {}
  }
  function buzz() {
    try { navigator.vibrate && navigator.vibrate(8); } catch {}
  }
  function feedback() { tone(); buzz(); }

  document.addEventListener('click', e => {
    const el = e.target.closest('button, a');
    if (el && !el.disabled) feedback();
  }, true);

  document.addEventListener('change', e => {
    if (e.target.matches('select, input[type=checkbox], input[type=radio]')) feedback();
  }, true);
})();
