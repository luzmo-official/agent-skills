(() => {
  const cards = [...document.querySelectorAll('.resource[data-outcome]')];
  const byId = id => document.getElementById(id);
  const search = byId('search'), dataset = byId('dataset'), language = byId('language');
  // Unchanged items stay hidden unless the reader asks for them, on screen and in print.
  const showKept = byId('show-unchanged');
  const keptShown = () => Boolean(showKept?.checked);
  const showUnchanged = byId('show-unchanged-knowledge');
  const groups = [...document.querySelectorAll('.dataset-group')];
  const viewButtons = [...document.querySelectorAll('[data-review-view]')];
  const panels = [...document.querySelectorAll('[data-review-panel]')];
  function selectView(view) {
    if (!panels.some(panel => panel.dataset.reviewPanel === view)) return;
    for (const panel of panels) panel.hidden = panel.dataset.reviewPanel !== view;
    for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.reviewView === view));
  }
  function refreshKnowledge() {
    for (const card of document.querySelectorAll('.knowledge-resource')) card.hidden = card.dataset.unchanged === 'true' && !showUnchanged?.checked;
  }
  function refresh() {
    let visible = 0;
    const query = search.value.trim().toLowerCase(), kept = keptShown();
    for (const card of cards) {
      card.hidden = !kept && card.dataset.outcome === 'keep' || dataset.value !== 'all' && card.dataset.dataset !== dataset.value || !card.textContent.toLowerCase().includes(query);
      if (!card.hidden) visible++;
      for (const translation of card.querySelectorAll('.translation')) translation.hidden = language.value !== 'all' && translation.dataset.locale !== language.value;
    }
    byId('visible-count').textContent = 'Showing ' + visible + ' of ' + cards.length + ' items';
    byId('no-results').hidden = visible > 0;
    // A filtered view is short, so open the datasets that still have items; the full list stays collapsed.
    const focused = query || dataset.value !== 'all' || !kept;
    for (const group of groups) {
      group.hidden = ![...group.querySelectorAll('.resource[data-outcome]')].some(card => !card.hidden);
      if (!group.hidden && focused) group.open = true;
    }
  }
  function openParents(target) {
    for (let parent = target.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS') parent.open = true;
  }
  function revealTarget() {
    const fragment = window.location?.hash;
    if (!fragment) return;
    let target;
    try { target = byId(decodeURIComponent(fragment.slice(1))); } catch { return; }
    if (!target) return;
    const panel = target.closest('[data-review-panel]');
    if (panel) selectView(panel.dataset.reviewPanel);
    if (target.matches('.resource[data-outcome]') && search) {
      search.value = ''; dataset.value = 'all';
      if (target.dataset.outcome === 'keep' && showKept) showKept.checked = true;
      refresh();
    }
    if (target.matches('.knowledge-resource') && showUnchanged) {
      showUnchanged.checked = true; refreshKnowledge();
    }
    openParents(target);
    target.scrollIntoView?.({ block: 'start' });
  }
  for (const control of [search, dataset, language, showKept]) control?.addEventListener('input', refresh);
  showUnchanged?.addEventListener('input', refreshKnowledge);
  for (const button of viewButtons) button.addEventListener('click', () => selectView(button.dataset.reviewView));
  for (const tile of document.querySelectorAll('[data-show]')) tile.addEventListener('click', () => {
    selectView('datasets'); search.value = ''; dataset.value = 'all';
    if (tile.dataset.show === 'keep' && showKept) showKept.checked = true;
    refresh();
    const first = cards.find(card => !card.hidden && card.dataset.outcome === tile.dataset.show);
    if (first) openParents(first);
    (tile.dataset.show === 'revise' || !first ? byId('dataset-view') : first).scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  for (const tile of document.querySelectorAll('[data-open-view]')) tile.addEventListener('click', event => {
    selectView(tile.dataset.openView);
    if (tile.tagName === 'BUTTON') { event.preventDefault(); document.querySelector('[data-review-panel="' + tile.dataset.openView + '"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
  for (const tile of document.querySelectorAll('[data-target]')) tile.addEventListener('click', () => {
    const target = byId(tile.dataset.target);
    if (!target) return;
    selectView('datasets'); openParents(target); if (target.tagName === 'DETAILS') target.open = true;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  // The reader can repoint every "Open in Luzmo" link, for example to a custom domain; the choice lasts for this tab only.
  const appAddress = byId('app-address');
  function addressOf(value) {
    const text = value.trim();
    if (!text) return '';
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text);
      // Browsers accept odd hosts such as "not%20valid"; insist on a plain host name.
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && /^[a-z0-9-]+(\.[a-z0-9-]+)*$/i.test(url.hostname) ? url.origin : null;
    } catch { return null; }
  }
  function pointLinks() {
    const base = addressOf(appAddress.value);
    appAddress.setAttribute('aria-invalid', String(base === null));
    for (const link of document.querySelectorAll('a[data-luzmo-path]')) {
      if (base) link.href = base + link.dataset.luzmoPath; else link.removeAttribute('href');
      if (link.classList.contains('open-in')) link.hidden = !base;
    }
    try { if (base !== null) sessionStorage.setItem('luzmo-review-app-address', appAddress.value.trim()); } catch {}
  }
  if (appAddress) {
    let saved = null;
    try { saved = sessionStorage.getItem('luzmo-review-app-address'); } catch {}
    if (saved !== null) appAddress.value = saved;
    appAddress.addEventListener('input', pointLinks);
    appAddress.addEventListener('change', () => { const base = addressOf(appAddress.value); if (base) appAddress.value = base; });
    pointLinks();
  }
  window.addEventListener?.('hashchange', revealTarget);
  document.addEventListener?.('click', event => {
    const link = event.target.closest?.('a[href^="#"]');
    if (link && window.location.hash === link.getAttribute('href')) revealTarget();
  });
  // Print every section and expand the details, but leave filtered-out items (such as unchanged ones) out.
  byId('print')?.addEventListener('click', () => {
    const hidden = [...document.querySelectorAll('[data-review-panel][hidden]')];
    const details = [...document.querySelectorAll('details')], opened = details.map(d => d.open);
    for (const element of hidden) element.hidden = false;
    for (const detail of details) detail.open = true;
    window.print();
    for (const element of hidden) element.hidden = true;
    details.forEach((d, i) => { d.open = opened[i]; });
  });
  if (search && dataset && language) refresh();
  refreshKnowledge();
  revealTarget();
})();
