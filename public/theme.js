(() => {
  const storageKey = 'rtxbz-theme';
  const modes = ['system', 'light', 'dark'];
  const icons = {
    system: 'M4 3h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M12 17v4 M8 21h8',
    light: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5',
    dark: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  };
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  let toggle;

  try {
    const saved = localStorage.getItem(storageKey);
    if (modes.includes(saved)) preference = saved;
  } catch {
    // Themes still work when browser storage is unavailable.
  }

  function applyTheme() {
    const theme = preference === 'system' ? (systemTheme.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#191b19' : '#f8f7f4';
    if (toggle) {
      const next = modes[(modes.indexOf(preference) + 1) % modes.length];
      toggle.querySelector('path').setAttribute('d', icons[preference]);
      const label = `Theme: ${preference}. Switch to ${next} theme.`;
      toggle.setAttribute('aria-label', label);
      toggle.title = label;
    }
  }

  // Run before the page paints so a saved dark theme does not flash light.
  applyTheme();
  systemTheme.addEventListener('change', applyTheme);
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) {
      preference = modes.includes(event.newValue) ? event.newValue : 'system';
      applyTheme();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.querySelector('#theme-toggle');
    toggle.hidden = false;
    applyTheme();
    toggle.addEventListener('click', () => {
      preference = modes[(modes.indexOf(preference) + 1) % modes.length];
      try {
        if (preference === 'system') localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, preference);
      } catch {
        // Keep the choice for this page even if it cannot be saved.
      }
      applyTheme();
    });
  });
})();
