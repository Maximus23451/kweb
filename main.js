/* ================================================================
   MAIN.JS — Jupiter (neptun2 replacement) · v2
   - Bug report form (CSRF-protected, api.php)
   - Server config overrides (Admin panel → DB)
   - Direct GitHub fallback: latest release + dev profile
   - Strictly no inline handlers (CSP: script-src 'self')
   ================================================================ */
'use strict';

const REPO      = 'zoligamer/Jupiter';
const DEV_LOGIN = 'zoligamer';
const REPO_URL  = 'https://github.com/' + REPO;

/* Inline SVG icons (stroke style matches the CSS .ic rules) */
const ICON_DL =
  '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>';
const ICON_EXT =
  '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';
const ICON_LOCK =
  '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const ICON_STAR =
  '<svg viewBox="0 0 24 24" class="ic ic-fill" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

const PLACEHOLDERS = ['your name here', 'your username', 'developer & designer'];

let _csrfToken = null;
let _releaseFromServer = false;
let _serverOverrodeName = false;

/* ---------- tiny helpers ---------- */
const $ = (id) => document.getElementById(id);

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isPlaceholder(v) {
  const t = String(v || '').trim().toLowerCase();
  return t === '' || PLACEHOLDERS.some((p) => t.includes(p));
}

async function apiPost(action, fields = {}) {
  const fd = new FormData();
  fd.append('action', action);
  if (_csrfToken) fd.append('csrf_token', _csrfToken);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch('api.php', { method: 'POST', body: fd });
  return res.json();
}

async function getCsrfToken() {
  if (_csrfToken) return _csrfToken;
  try {
    const data = await apiPost('get_csrf');
    _csrfToken = data.token || '';
  } catch { _csrfToken = ''; }
  return _csrfToken;
}

async function githubJson(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch('https://api.github.com' + path, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Jupiter-Site' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtBytes(n) {
  if (!n) return '';
  const mb = n / 1048576;
  return (mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb.toFixed(1) + ' MB');
}

function tagLabel(tag) {
  const t = String(tag || '').trim();
  return t.startsWith('v') ? t : (t ? 'v' + t : '');
}

/* ---------- boot ---------- */
function boot() {
  setupCharCounters();
  setupBugForm();
  // Server config first (admin panel → DB). If it provides no tracked
  // release, fall back to querying GitHub directly.
  loadServerConfig().then(() => {
    if (!_releaseFromServer) loadGithubRelease();
  });
  loadDevProfile();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

/* ---------- char counters (bug page) ---------- */
function setupCharCounters() {
  [['bugTitle', 'titleCount', 100], ['bugDesc', 'descCount', 2000]].forEach(([inputId, countId, max]) => {
    const input = $(inputId);
    const count = $(countId);
    if (!input || !count) return;
    input.addEventListener('input', () => { count.textContent = input.value.length + ' / ' + max; });
  });
}

/* ---------- bug report form ---------- */
function setupBugForm() {
  const form = $('bugForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitBugReport();
  });
}

function detectBrowserLabel() {
  const ua = navigator.userAgent || '';
  const uaData = navigator.userAgentData;
  if (uaData && uaData.brands && uaData.brands.length) {
    const brands = uaData.brands.filter((b) => !/not.?a.?brand/i.test(b.brand))
      .map((b) => b.brand + ' ' + b.version).join(', ');
    const platform = uaData.platform || '';
    const mobile = uaData.mobile ? 'mobile' : 'desktop';
    return [brands, platform, mobile].filter(Boolean).join(' · ');
  }
  const m = (re) => { const x = ua.match(re); return x ? x[1].split('.')[0] : ''; };
  if (/Edg\//i.test(ua)) return 'Edge ' + m(/Edg\/([\d.]+)/);
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera ' + m(/(?:OPR|Opera)\/([\d.]+)/);
  if (/Chrome\//i.test(ua) && !/Edg|OPR/i.test(ua)) return 'Chrome ' + m(/Chrome\/([\d.]+)/);
  if (/Firefox\//i.test(ua)) return 'Firefox ' + m(/Firefox\/([\d.]+)/);
  if (/Safari\//i.test(ua) && !/Chrome|Chromium/i.test(ua)) return 'Safari ' + m(/Version\/([\d.]+)/);
  return ua.slice(0, 80) || 'Unknown';
}

function detectScreenLabel() {
  const vpW = Math.round(window.innerWidth);
  const vpH = Math.round(window.innerHeight);
  const dpr = window.devicePixelRatio || 1;
  return vpW + 'x' + vpH + ' vp, ' + screen.width + 'x' + screen.height + ' @' + dpr + 'x';
}

function collectClientContext() {
  return {
    lang: navigator.language || '',
    timezone: (Intl && Intl.DateTimeFormat && Intl.DateTimeFormat().resolvedOptions().timeZone) || '',
    screen: detectScreenLabel(),
    browser: detectBrowserLabel(),
    referrer: document.referrer || '',
  };
}

function showBanner(el, msgEl, msg) {
  if (msgEl && msg) msgEl.textContent = msg;
  if (el) {
    el.style.display = 'flex';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

async function submitBugReport() {
  const btn = $('submitBtn');
  const successEl = $('form-success');
  const errorEl = $('form-error');
  const errMsg = $('error-msg');

  const title = ($('bugTitle') ? $('bugTitle').value : '').trim();
  const category = $('bugCategory') ? $('bugCategory').value : '';
  const severity = $('bugSeverity') ? $('bugSeverity').value : '';
  const desc = ($('bugDesc') ? $('bugDesc').value : '').trim();

  if (!title || !category || !severity || !desc) {
    showBanner(errorEl, errMsg, 'Please fill in all required fields.');
    return;
  }

  if (btn) btn.disabled = true;
  const submitTxt = $('submitText');
  const loading = $('submitLoading');
  if (submitTxt) submitTxt.style.display = 'none';
  if (loading) loading.style.display = 'inline';
  if (successEl) successEl.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';

  const ctx = collectClientContext();
  await getCsrfToken();

  try {
    const result = await apiPost('submit_bug', {
      title,
      category,
      severity,
      desc,
      steps: ($('bugSteps') ? $('bugSteps').value : '').trim(),
      device: ($('bugDevice') ? $('bugDevice').value : '').trim(),
      app_version: ($('bugAppVersion') ? $('bugAppVersion').value : '').trim(),
      email: ($('bugEmail') ? $('bugEmail').value : '').trim(),
      lang: ctx.lang,
      timezone: ctx.timezone,
      screen: ctx.screen,
      browser: ctx.browser,
      referrer: ctx.referrer,
    });

    if (result.success) {
      const form = $('bugForm');
      if (form) form.reset();
      if ($('titleCount')) $('titleCount').textContent = '0 / 100';
      if ($('descCount')) $('descCount').textContent = '0 / 2000';
      showBanner(successEl, null, null);
      _csrfToken = null;            // rotate token for next submission
      getCsrfToken();
    } else {
      showBanner(errorEl, errMsg, result.message || 'Server error. Please try again.');
    }
  } catch {
    showBanner(errorEl, errMsg, 'Could not connect to the server. Please check your internet connection.');
  }

  if (btn) btn.disabled = false;
  if (submitTxt) submitTxt.style.display = 'inline';
  if (loading) loading.style.display = 'none';
}

/* ================================================================
   SERVER CONFIG (Admin → DB). Optional layer; static defaults live
   in the HTML so the page works even with the API offline.
   ================================================================ */
async function loadServerConfig() {
  let data;
  try {
    const res = await apiPost('get_settings');
    if (!res.success || !res.data) return;
    data = res.data;
  } catch { return; }

  // Dev identity
  const nameEl = $('dev-name');
  if (nameEl && data.dev_name && !isPlaceholder(data.dev_name)) {
    nameEl.textContent = data.dev_name;
    _serverOverrodeName = true;
    const initEl = $('dev-initials');
    if (initEl) {
      initEl.textContent = String(data.dev_name).split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
    }
  }
  const titleEl = $('dev-title');
  if (titleEl && data.dev_title && !isPlaceholder(data.dev_title)) {
    titleEl.textContent = data.dev_title;
  }

  // Social cards (empty = hidden)
  const cards = { github: data.github_url, discord: data.discord_url, kofi: data.kofi_url, paypal: data.paypal_url };
  for (const [cls, url] of Object.entries(cards)) {
    const el = document.querySelector('.link-card.' + cls);
    if (!el) continue;
    // api.php only saves https:// links; re-check so an older DB value can't become a javascript: href.
    const safe = /^https:\/\//i.test(String(url || ''));
    el.style.display = safe ? 'flex' : 'none';
    if (safe) el.href = url;
  }

  // Release info from server-side GitHub tracking
  if (data.latest_version) {
    _releaseFromServer = true;
    renderReleaseFromServer(data);
  }
}

function renderReleaseFromServer(s) {
  const label = tagLabel(s.latest_version);
  const url = s.latest_version_url || REPO_URL + '/releases/latest';

  const tagEl = $('relTag');
  if (tagEl) tagEl.textContent = label || '—';
  const nameEl = $('relName');
  if (nameEl) nameEl.textContent = 'Jupiter ' + (label || '') + ' Release';
  const gl = $('relGithubLink');
  if (gl) gl.href = url;
  const all = $('relAll');
  if (all) all.href = REPO_URL + '/releases';
  const metaDate = $('relDate');
  if (metaDate) metaDate.textContent = s.latest_version_at ? fmtDate(s.latest_version_at) : 'Latest stable build';

  const notes = $('relNotes');
  if (notes) {
    notes.innerHTML = '<p class="empty-notes">Release notes are published on GitHub for this build.</p>';
  }

  const hero = $('heroDownloadBtn');
  if (hero) { hero.href = url; const lbl = $('heroDownloadLabel'); if (lbl) lbl.textContent = 'Download ' + label; }

  const assets = $('relAssets');
  if (assets) {
    assets.classList.add('single');
    assets.innerHTML =
      '<a class="dl-btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">' +
        '<span class="dl-top">' + ICON_EXT + 'View release on GitHub</span>' +
        '<span class="dl-sub">' + esc(label) + ' · changelog &amp; APK downloads</span>' +
      '</a>';
  }
  if (document.title) document.title = 'Jupiter — ' + (label || 'releases');
}

/* ================================================================
   GITHUB DIRECT (fallback + enrichment)
   ================================================================ */
async function loadGithubRelease() {
  if (_releaseFromServer) return;
  const rel = await githubJson('/repos/' + REPO + '/releases/latest');
  if (rel && rel.tag_name) { renderRelease(rel); return; }
  const tags = await githubJson('/repos/' + REPO + '/tags?per_page=1');
  if (tags && tags[0] && tags[0].name) {
    renderRelease({
      tag_name: tags[0].name,
      name: 'Jupiter ' + tags[0].name,
      published_at: '',
      html_url: REPO_URL + '/releases/tag/' + encodeURIComponent(tags[0].name),
      body: '',
      assets: [],
    });
  }
}

function renderRelease(rel) {
  const label = tagLabel(rel.tag_name);
  const url = rel.html_url || REPO_URL + '/releases/latest';

  if ($('relTag')) $('relTag').textContent = label;
  if ($('relName')) $('relName').textContent = rel.name || 'Jupiter ' + label;
  const gl = $('relGithubLink');
  if (gl) gl.href = url;
  const all = $('relAll');
  if (all) all.href = REPO_URL + '/releases';
  if ($('relDate')) $('relDate').textContent = fmtDate(rel.published_at) || 'Latest stable build';

  const notes = $('relNotes');
  if (notes) notes.innerHTML = rel.body ? renderNotesLite(rel.body) : '<p class="empty-notes">No release notes for this build.</p>';

  // APK assets (skip checksum sidecars)
  const apks = (rel.assets || []).filter((a) => /\.apk$/i.test(a.name));

  const assets = $('relAssets');
  if (assets) {
    if (apks.length === 0) {
      assets.classList.add('single');
      assets.innerHTML =
        '<a class="dl-btn primary" href="' + esc(url) + '" target="_blank" rel="noopener">' +
          '<span class="dl-top">View release on GitHub</span>' +
          '<span class="dl-sub">APK downloads are published there</span>' +
        '</a>';
    } else {
      assets.classList.remove('single');
      const arch = (a) => {
        const n = a.name;
        if (/arm8|arm64|aarch64/i.test(n)) return { short: 'ARM8', desc: 'Modern 64-bit devices' };
        if (/arm7|armeabi/i.test(n)) return { short: 'ARM7', desc: 'Older 32-bit devices' };
        return { short: 'APK', desc: n.replace(/\.apk$/i, '') };
      };
      // ARM8 first (typical modern phone), then ARM7
      const sorted = apks.slice().sort((a, b) => (arch(b).short === 'ARM8' ? 1 : 0) - (arch(a).short === 'ARM8' ? 1 : 0));
      assets.innerHTML = sorted.map((a, i) => {
        const info = arch(a);
        return '<a class="dl-btn' + (i === 0 ? ' primary' : '') + '" href="' + esc(a.browser_download_url || url) + '" target="_blank" rel="noopener">' +
          '<span class="dl-top">' + ICON_DL + 'Download · ' + esc(info.short) + '</span>' +
          '<span class="dl-sub">' + esc(info.desc) + (a.size ? ' · ' + fmtBytes(a.size) : '') + '</span>' +
        '</a>';
      }).join('');
    }
  }

  // Hero CTA points straight at the primary APK when one exists
  const primaryApk = apks.find((a) => /arm8|arm64|aarch64/i.test(a.name)) || apks[0];
  const hero = $('heroDownloadBtn');
  if (hero) {
    hero.href = (primaryApk && primaryApk.browser_download_url) || url;
    const lbl = $('heroDownloadLabel');
    if (lbl) lbl.textContent = 'Download ' + label + ' APK';
  }

  const verify = document.querySelector('.release-verify');
  if (verify) {
    const sha1s = (rel.assets || []).filter((a) => /\.sha1$/i.test(a.name));
    const sha = sha1s.find((a) => /arm8|arm64/i.test(a.name)) || sha1s[0];
    if (sha) {
      verify.innerHTML =
        '<span>' + ICON_LOCK + 'SHA-1: <a href="' + esc(sha.browser_download_url || '#') + '" target="_blank" rel="noopener">' + esc(sha.name) + '</a></span>' +
        '<span>·</span><a href="' + esc(REPO_URL + '/releases') + '" target="_blank" rel="noopener">All releases</a>';
    }
  }

  const live = $('heroLiveMeta');
  if (live) live.innerHTML = ICON_STAR + ' New release ' + esc(label);
  if (document.title) document.title = 'Jupiter — ' + label;
}

/* Lightweight release-note formatter: headings, bullets, paragraphs. */
function renderNotesLite(body) {
  const lines = String(body).split(/\r?\n/).slice(0, 30);
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); continue; }
    let text = line.replace(/\*\*/g, '');
    if (/^#{1,3}\s+/.test(text)) {
      closeList();
      html += '<span class="notes-h">' + esc(text.replace(/^#{1,3}\s+/, '')) + '</span>';
    } else if (/^[-*•]\s+/.test(text)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + esc(text.replace(/^[-*•]\s+/, '')) + '</li>';
    } else {
      closeList();
      html += '<p>' + esc(text) + '</p>';
    }
  }
  closeList();
  return html;
}

/* ---------- dev profile ---------- */
async function loadDevProfile() {
  const u = await githubJson('/users/' + DEV_LOGIN);
  if (!u) return;

  const img = $('devAvatarImg');
  const init = $('devInitials');
  if (img && u.avatar_url) {
    img.src = u.avatar_url;
    img.addEventListener('load', () => {
      img.style.display = 'block';
      if (init) init.style.display = 'none';
    });
    img.addEventListener('error', () => { if (init) init.style.display = ''; });
  }

  if (!_serverOverrodeName && u.name && $('dev-name')) {
    $('dev-name').textContent = u.name;
    if (init) init.textContent = String(u.name).split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();
  }
  if ($('devFollowers') && typeof u.followers === 'number') $('devFollowers').textContent = u.followers;
  if ($('devRepos') && typeof u.public_repos === 'number') $('devRepos').textContent = u.public_repos;
  if ($('devSince') && u.created_at) $('devSince').textContent = new Date(u.created_at).getUTCFullYear();

  const yearEl = $('footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getUTCFullYear());
}
