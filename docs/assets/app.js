(function () {
  'use strict';

  // ---- コピー -------------------------------------------------------------
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return; } catch (e) { /* fallback */ }
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
  }
  function flash(btn, label) {
    const orig = btn.dataset.label || btn.textContent;
    btn.dataset.label = orig;
    btn.textContent = label; btn.classList.add('done');
    setTimeout(function () { btn.textContent = orig; btn.classList.remove('done'); }, 1500);
  }
  function collect(selector) {
    return Array.from(document.querySelectorAll(selector))
      .filter(function (el) { return !el.closest('.hidden'); })
      .map(function (el) { return el.textContent; }).join('\n\n');
  }
  document.addEventListener('click', async function (e) {
    const c = e.target.closest('.copy');
    if (c) {
      const pre = c.closest('.box').querySelector('pre');
      await copyText(pre.textContent); flash(c, 'コピーしました'); return;
    }
    const all = e.target.closest('[data-copy-all]');
    if (all) { await copyText(collect(all.dataset.copyAll)); flash(all, 'コピーしました'); return; }
    const dl = e.target.closest('[data-download]');
    if (dl) {
      const blob = new Blob(['﻿' + collect(dl.dataset.download)], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = dl.dataset.filename || 'download.txt';
      document.body.appendChild(a); a.click(); a.remove();
    }
  });

  // ---- 検索・章の絞り込み（プロンプト集） ---------------------------------
  const q = document.getElementById('q');
  const chips = document.querySelector('.chips');
  let curCh = '';
  function filter() {
    const word = q ? q.value.trim().toLowerCase().normalize('NFKC') : '';
    document.querySelectorAll('[data-filter-item]').forEach(function (card) {
      let show = !curCh || card.dataset.ch === curCh;
      if (show && word) {
        if (/^\d+$/.test(word)) show = Number(card.dataset.no) === Number(word);
        else show = card.dataset.search.includes(word);
      }
      card.classList.toggle('hidden', !show);
    });
    document.querySelectorAll('[data-filter-group]').forEach(function (g) {
      g.classList.toggle('hidden', !g.querySelector('[data-filter-item]:not(.hidden)'));
    });
    const empty = document.getElementById('empty');
    if (empty) empty.classList.toggle('hidden', !!document.querySelector('[data-filter-item]:not(.hidden)'));
  }
  if (q) q.addEventListener('input', filter);
  if (chips) chips.addEventListener('click', function (e) {
    const b = e.target.closest('.chip'); if (!b) return;
    curCh = b.dataset.ch || '';
    chips.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    filter();
  });
  // 「#12」形式のリンクは、絞り込まずに No.12 の位置へ移動して目立たせる
  if (/^#\d+$/.test(location.hash)) {
    const target = document.getElementById('n' + location.hash.slice(1));
    if (target) {
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      location.replace('#' + target.id);
      window.addEventListener('load', function () { target.scrollIntoView(); });
    }
  }

  // ---- 解答・解説：講師の合図で開く -----------------------------------------
  // 解答はページ内で暗号化されている。講師が release.json に鍵を書き込むと、
  // それを取得して復号し、折りたたみを開けるようにする。
  const locks = Array.from(document.querySelectorAll('.lock[data-ct]'));
  if (!locks.length) return;

  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  async function decrypt(lock, pass) {
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(lock.dataset.salt), iterations: Number(lock.dataset.iter), hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(lock.dataset.iv) }, key, b64(lock.dataset.ct));
    return new TextDecoder().decode(plain);
  }
  function store(id, v) { try { localStorage.setItem('unlock:' + id, v); } catch (e) { /* ignore */ } }
  function load(id) { try { return localStorage.getItem('unlock:' + id); } catch (e) { return null; } }

  async function unlock(lock, pass) {
    if (lock.classList.contains('open')) return true;
    try {
      lock.querySelector('.lk-body').innerHTML = await decrypt(lock, pass);
    } catch (e) { return false; }
    lock.classList.add('open');
    lock.querySelector('.lk-state').textContent = 'クリックで開閉できます';
    lock.querySelector('summary').removeAttribute('tabindex');
    store(lock.dataset.id, pass);
    return true;
  }

  // 閉じている間は開けないようにする
  locks.forEach(function (lock) {
    lock.querySelector('summary').addEventListener('click', function (e) {
      if (!lock.classList.contains('open')) {
        e.preventDefault();
        check(true);
      }
    });
  });

  const cfg = document.querySelector('meta[name="release-source"]');
  const sources = cfg ? cfg.content.split(' ') : ['release.json'];
  let busy = false;

  async function fetchRelease() {
    for (const src of sources) {
      try {
        const url = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
        const res = await fetch(url, {
          cache: 'no-store',
          headers: src.includes('api.github.com') ? { Accept: 'application/vnd.github.raw+json' } : {}
        });
        if (res.ok) return await res.json();
      } catch (e) { /* 次の取得先へ */ }
    }
    return null;
  }

  async function check(manual) {
    if (busy) return;
    busy = true;
    locks.forEach(function (l) { if (!l.classList.contains('open') && manual) l.querySelector('.lk-state').textContent = '確認中…'; });
    const rel = await fetchRelease();
    const opened = (rel && rel.open) || {};
    for (const lock of locks) {
      const pass = opened[lock.dataset.id];
      if (pass) await unlock(lock, pass);
      if (!lock.classList.contains('open')) {
        lock.querySelector('.lk-state').textContent = manual
          ? 'まだ開いていません。講師の合図のあとで開きます'
          : '講師の合図のあとで開きます';
      }
    }
    busy = false;
  }

  // 以前開いたものは、その端末ではそのまま開いておく
  (async function init() {
    for (const lock of locks) {
      const saved = load(lock.dataset.id);
      if (saved) await unlock(lock, saved);
    }
    await check(false);
    setInterval(function () {
      if (document.visibilityState === 'visible' && locks.some(function (l) { return !l.classList.contains('open'); })) check(false);
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') check(false);
    });
  })();
})();
