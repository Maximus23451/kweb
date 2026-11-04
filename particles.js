(function () {
  if (document.getElementById('particle-shadows-1-main')) return;

  const SPACING = 2560;
  const COLOR = '#35b5ff';

  function particles(max) {
    const parts = ['0px 0px ' + COLOR];
    for (let i = 1; i <= max; i++) {
      parts.push(
        Math.floor(Math.random() * SPACING) +
          'px ' +
          Math.floor(Math.random() * SPACING) +
          'px ' +
          COLOR
      );
    }
    return parts.join(',');
  }

  const configs = [
    { id: 'particle-shadows-1', sel: '.particle-1', main: 1000, after: 900 },
    { id: 'particle-shadows-2', sel: '.particle-2', main: 800, after: 500 },
    { id: 'particle-shadows-3', sel: '.particle-3', main: 0, after: 1100 },
    { id: 'particle-shadows-4', sel: '.particle-4', main: 1200, after: 700 },
  ];

  configs.forEach(function (cfg) {
    if (cfg.main > 0) {
      var s = document.createElement('style');
      s.id = cfg.id + '-main';
      s.textContent =
        cfg.sel + '{box-shadow:' + particles(cfg.main) + ';border-radius:50%;}';
      document.head.appendChild(s);
    }
    if (cfg.after > 0) {
      var s2 = document.createElement('style');
      s2.id = cfg.id + '-after';
      s2.textContent =
        cfg.sel + '::after{box-shadow:' + particles(cfg.after) + ';border-radius:50%;}';
      document.head.appendChild(s2);
    }
  });
})();
