(function () {
  'use strict';
  if (window.__claspionTriggerLoaded) return;
  window.__claspionTriggerLoaded = true;

  function inject() {
    var btn = document.createElement('button');
    btn.id = 'claspion-cockpit-trigger';
    btn.title = 'Open CLASPION Governance Cockpit';
    btn.textContent = '⌥ CLASPION';
    btn.style.cssText = [
      'position:fixed',
      'bottom:24px',
      'right:24px',
      'z-index:99999',
      'padding:9px 16px',
      'background:rgba(5,11,20,0.94)',
      'border:1px solid rgba(0,229,255,0.4)',
      'border-radius:4px',
      'color:#00e5ff',
      'font-family:"IBM Plex Mono","Courier New",monospace',
      'font-size:10px',
      'letter-spacing:2.5px',
      'font-weight:500',
      'cursor:pointer',
      'box-shadow:0 0 18px rgba(0,229,255,0.15),0 2px 8px rgba(0,0,0,0.5)',
      'transition:box-shadow 0.2s,border-color 0.2s,background 0.15s',
      'text-transform:uppercase',
      'outline:none',
      'user-select:none',
    ].join(';');

    btn.addEventListener('mouseenter', function () {
      btn.style.boxShadow = '0 0 28px rgba(0,229,255,0.4),0 2px 8px rgba(0,0,0,0.5)';
      btn.style.borderColor = 'rgba(0,229,255,0.75)';
      btn.style.background = 'rgba(5,11,20,0.98)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.boxShadow = '0 0 18px rgba(0,229,255,0.15),0 2px 8px rgba(0,0,0,0.5)';
      btn.style.borderColor = 'rgba(0,229,255,0.4)';
      btn.style.background = 'rgba(5,11,20,0.94)';
    });
    btn.addEventListener('click', function () {
      window.location.href = '/claspion-cockpit.html?from=splendor';
    });

    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
