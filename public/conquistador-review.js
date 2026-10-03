// Conquistador review panel for the Proof editor. Plain script, no build step.
// Preview: the document in its channel frame, chosen from front matter `channel:`.
// Playbooks: the items of the document's final "Playbooks applied" section.
// Approval: a human stamp bound to the SHA-256 of the exact text. Any edit clears it.
(function () {
  'use strict';
  var match = /^\/d\/([^/?#]+)/.exec(location.pathname);
  var token = new URLSearchParams(location.search).get('token') || '';
  if (!match || !token) return;
  var slug = decodeURIComponent(match[1]);
  var api = '/documents/' + encodeURIComponent(slug) + '/conquistador';
  var CHANNELS = [['x', 'X post'], ['linkedin', 'LinkedIn post'], ['email', 'Email'], ['search', 'Search result'], ['ad', 'Ad card']];
  var NAME_KEY = 'proof-share-viewer-name';
  var state = { tab: 'preview', channel: null, override: null, server: null, markdown: '', error: '' };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // Removes Proof's <span data-proof> anchors and their closing tags; the text inside stays.
  function withoutProofSpans(markdown) {
    var out = '';
    var open = [];
    var pattern = /<span\b[^>]*>|<\/span>/g;
    var last = 0;
    var found;
    while ((found = pattern.exec(markdown))) {
      out += markdown.slice(last, found.index);
      last = pattern.lastIndex;
      if (found[0] !== '</span>') { open.push(/\bdata-proof=/.test(found[0])); if (!open[open.length - 1]) out += found[0]; }
      else if (!open.pop()) out += found[0];
    }
    return out + markdown.slice(last);
  }

  // Document parsing mirrors server/conquistador-review.ts.
  function parseFrontMatter(markdown) {
    var found = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
    if (!found) return { data: {}, body: markdown };
    var data = {};
    found[1].split(/\r?\n/).forEach(function (line) {
      var pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
      if (pair) data[pair[1].toLowerCase()] = pair[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    });
    return { data: data, body: markdown.slice(found[0].length) };
  }
  function withoutPlaybooks(body) {
    var lines = body.split(/\r?\n/);
    var fenced = false;
    var last = -1;
    lines.forEach(function (line, index) {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      else if (!fenced && /^#{1,6}\s+\S/.test(line)) last = index;
    });
    return last >= 0 && /playbook/i.test(lines[last]) ? lines.slice(0, last).join('\n') : body;
  }
  function inline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, function (_, a, b) { return '<b>' + (a || b) + '</b>'; })
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<span class="cq-link">$1</span>');
  }
  function plain(text) {
    return text.replace(/^#{1,6}\s+/gm, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, '• ')
      .replace(/\*\*|__|`/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 $2').replace(/\n{3,}/g, '\n\n').trim();
  }
  function blocksHtml(text) {
    return text.trim().split(/\n\s*\n/).map(function (block) {
      var heading = /^(#{1,6})\s+(.*)$/.exec(block.trim());
      if (heading) return '<p class="cq-h">' + inline(heading[2]) + '</p>';
      if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(block)) {
        return '<ul>' + block.split(/\n/).map(function (line) {
          return '<li>' + inline(line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')) + '</li>';
        }).join('') + '</ul>';
      }
      return '<p>' + inline(block).replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  function firstHeading(text) { var m = /^#{1,6}\s+(.+)$/m.exec(text); return m ? plain(m[1]) : ''; }
  function firstParagraph(text) {
    var blocks = text.trim().split(/\n\s*\n/).filter(function (b) { return !/^#{1,6}\s/.test(b.trim()); });
    return blocks.length ? plain(blocks[0]) : '';
  }
  function withoutFirstHeading(text) { return text.replace(/^\s*#{1,6}\s+.+\n?/, ''); }
  // X counts each link as 23 characters.
  function xLength(text) { return Array.from(text.replace(/https?:\/\/\S+/g, 'x'.repeat(23))).length; }
  function counter(length, limit) {
    return el('span', { class: 'cq-count' + (length > limit ? ' cq-over' : ''), text: length + ' / ' + limit });
  }
  function clip(text, limit) { var chars = Array.from(text); return chars.length > limit ? chars.slice(0, limit - 1).join('') + '…' : text; }

  function previewX(doc, body) {
    var posts = body.split(/\n\s*(?:---|\*\*\*)\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    var name = doc.data.author || doc.data.brand || 'Your brand';
    var handle = doc.data.handle || '@' + name.toLowerCase().replace(/[^a-z0-9_]/g, '');
    return el('div', { class: 'cq-x' }, posts.map(function (post, index) {
      var text = plain(post);
      var card = el('div', { class: 'cq-x-post' }, [
        el('div', { class: 'cq-avatar' }), el('div', { class: 'cq-x-main' }, [
          el('div', { class: 'cq-x-head' }, [el('b', { text: name }), el('span', { text: ' ' + handle + ' · now' })]),
          el('div', { class: 'cq-x-text', text: text }),
          el('div', { class: 'cq-meta' }, [posts.length > 1 ? (index + 1) + '/' + posts.length + ' ' : '', counter(xLength(text), 280)]),
        ]),
      ]);
      return card;
    }));
  }
  function previewLinkedIn(doc, body) {
    var text = plain(body);
    // Fold at 150 characters, as LinkedIn's ad spec advises for intro text:
    // https://www.linkedin.com/help/lms/answer/a426534. `conquistador check` (linkedin-hook) uses the same limit.
    var fold = 150;
    var folded = Array.from(text).length > fold;
    var shown = el('div', { class: 'cq-li-text', text: folded ? clip(text, fold) : text });
    var more = folded ? el('button', { class: 'cq-more', type: 'button', text: '…see more', onclick: function () { shown.textContent = text; more.remove(); } }) : null;
    return el('div', { class: 'cq-li' }, [
      el('div', { class: 'cq-li-head' }, [el('div', { class: 'cq-avatar' }), el('div', {}, [
        el('b', { text: doc.data.author || doc.data.brand || 'Your name' }),
        el('div', { class: 'cq-sub', text: doc.data.headline || 'Headline · 1st' }),
      ])]),
      shown, more,
      el('div', { class: 'cq-meta' }, ['Fold at ' + fold + ' characters. ', counter(Array.from(text).length, 3000)]),
    ]);
  }
  function previewEmail(doc, body) {
    var subject = doc.data.subject || doc.data.title || firstHeading(body) || '(no subject)';
    var preheader = doc.data.preheader || clip(firstParagraph(withoutFirstHeading(body)), 90);
    var message = el('div', { class: 'cq-mail-body' });
    message.innerHTML = blocksHtml(doc.data.subject ? body : withoutFirstHeading(body));
    return el('div', { class: 'cq-mail' }, [
      el('div', { class: 'cq-mail-row' }, [
        el('b', { text: doc.data.from || 'Your brand' }),
        el('div', { class: 'cq-mail-line' }, [el('b', { text: clip(subject, 60) }), el('span', { class: 'cq-sub', text: ' — ' + preheader })]),
      ]),
      el('div', { class: 'cq-meta' }, ['Subject ', counter(Array.from(subject).length, 60), ' Preheader ', counter(Array.from(preheader).length, 90)]),
      el('div', { class: 'cq-mail-open' }, [
        el('div', { class: 'cq-mail-subject', text: subject }),
        el('div', { class: 'cq-sub', text: 'From ' + (doc.data.from || 'Your brand') + ' · to me' }),
        message,
      ]),
    ]);
  }
  function previewSearch(doc, body) {
    var title = doc.data.title || firstHeading(body) || '(no title)';
    var description = doc.data.description || firstParagraph(withoutFirstHeading(body));
    var url = doc.data.url || 'https://example.com/page';
    var crumbs = url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/').join(' › ');
    return el('div', { class: 'cq-serp' }, [
      el('div', { class: 'cq-sub', text: crumbs }),
      el('div', { class: 'cq-serp-title', text: clip(title, 60) }),
      el('div', { class: 'cq-serp-desc', text: clip(description, 160) }),
      el('div', { class: 'cq-meta' }, ['Title ', counter(Array.from(title).length, 60), ' Description ', counter(Array.from(description).length, 160)]),
    ]);
  }
  function previewAd(doc, body) {
    var headline = doc.data.headline || firstHeading(body) || '(no headline)';
    var primary = doc.data.primary || firstParagraph(withoutFirstHeading(body));
    var description = doc.data.description || '';
    return el('div', { class: 'cq-ad' }, [
      el('div', { class: 'cq-li-head' }, [el('div', { class: 'cq-avatar' }), el('div', {}, [
        el('b', { text: doc.data.brand || doc.data.author || 'Your brand' }), el('div', { class: 'cq-sub', text: 'Sponsored' }),
      ])]),
      el('div', { class: 'cq-ad-primary', text: clip(primary, 125) }),
      el('div', { class: 'cq-ad-image', text: doc.data.image || 'Image 1080 × 1080' }),
      el('div', { class: 'cq-ad-foot' }, [
        el('div', {}, [el('b', { text: clip(headline, 40) }), description ? el('div', { class: 'cq-sub', text: clip(description, 30) }) : null]),
        el('span', { class: 'cq-cta', text: doc.data.cta || 'Learn more' }),
      ]),
      el('div', { class: 'cq-meta' }, ['Primary ', counter(Array.from(primary).length, 125), ' Headline ', counter(Array.from(headline).length, 40)]),
    ]);
  }
  var PREVIEWS = { x: previewX, linkedin: previewLinkedIn, email: previewEmail, search: previewSearch, ad: previewAd };

  function renderPreview() {
    var doc = parseFrontMatter(state.markdown);
    var body = withoutPlaybooks(doc.body);
    var channel = state.override || state.channel;
    var select = el('select', { class: 'cq-select', 'aria-label': 'Channel', onchange: function (e) { state.override = e.target.value || null; render(); } },
      [el('option', { value: '', text: state.channel ? 'Front matter: ' + state.channel : 'Choose a channel' })].concat(CHANNELS.map(function (c) {
        var option = el('option', { value: c[0], text: c[1] });
        if (state.override === c[0]) option.selected = true;
        return option;
      })));
    var view = channel && PREVIEWS[channel] ? PREVIEWS[channel](doc, body)
      : el('p', { class: 'cq-empty', text: 'Add channel: x, linkedin, email, search, or ad to the front matter, or choose one here.' });
    return [select, view];
  }
  function renderPlaybooks() {
    var list = state.server && state.server.playbooks;
    if (!list || !list.items.length) return [el('p', { class: 'cq-empty', text: 'No playbooks recorded. The final section, "Playbooks applied", lists them.' })];
    return [el('p', { class: 'cq-sub', text: list.heading }), el('ul', { class: 'cq-playbooks' }, list.items.map(function (item) {
      return el('li', {}, [el('b', { text: item.name }), item.note ? el('div', { class: 'cq-sub', text: item.note }) : null]);
    }))];
  }
  function renderApproval() {
    var server = state.server;
    if (!server) return [el('p', { class: 'cq-empty', text: state.error || 'Reading the document…' })];
    var approval = server.approval || { state: 'none' };
    var short = server.sha256.slice(0, 12);
    var status;
    if (approval.state === 'approved') {
      status = el('div', { class: 'cq-stamp cq-ok' }, [el('b', { text: 'Approved' }), ' by ' + approval.approver + ' at ' + new Date(approval.approvedAt).toLocaleString(), el('code', { text: 'sha256 ' + approval.sha256.slice(0, 12) })]);
    } else if (approval.state === 'cleared') {
      status = el('div', { class: 'cq-stamp cq-warn' }, [el('b', { text: 'Approval cleared' }), ' (' + approval.clearedReason + '). It covered ', el('code', { text: approval.sha256.slice(0, 12) })]);
    } else {
      status = el('div', { class: 'cq-stamp' }, [el('b', { text: 'Not approved' })]);
    }
    var name = el('input', { class: 'cq-input', type: 'text', maxlength: '80', placeholder: 'Your name', value: localStorage.getItem(NAME_KEY) || '' });
    var approve = el('button', { class: 'cq-button', type: 'button', text: 'Approve this exact text', onclick: function () { stamp('POST', name.value.trim()); } });
    var withdraw = approval.state === 'approved' ? el('button', { class: 'cq-button cq-secondary', type: 'button', text: 'Withdraw approval', onclick: function () { stamp('DELETE', ''); } }) : null;
    return [
      status,
      server.openCheckFindings ? el('p', { class: 'cq-warn-text', text: server.openCheckFindings + ' check finding(s) are open. Resolve or answer them first.' }) : null,
      el('p', { class: 'cq-sub' }, ['Current text ', el('code', { text: 'sha256 ' + short })]),
      approval.state === 'approved' ? null : name,
      approval.state === 'approved' ? null : approve,
      withdraw,
      el('p', { class: 'cq-note', text: 'Approval covers this exact text only. Any edit clears it. The agent still asks you before each send, publish, or spend.' }),
      state.error ? el('p', { class: 'cq-warn-text', text: state.error }) : null,
    ].filter(Boolean);
  }

  // Front matter stays in the Markdown. The editor shows it as one quiet line; the YAML opens on request.
  function renderFrontMatterChip() {
    var editor = document.getElementById('editor');
    if (!editor) return;
    var data = parseFrontMatter(state.markdown).data;
    var keys = Object.keys(data);
    var chip = document.getElementById('cq-front-matter');
    if (!keys.length) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = el('div', { id: 'cq-front-matter', class: 'cq-front-matter', contenteditable: 'false' }, [
        el('span', { class: 'cq-front-matter-text' }),
        el('button', { type: 'button', class: 'cq-front-matter-toggle', onclick: function () {
          var shown = document.body.classList.toggle('cq-show-front-matter');
          this.textContent = shown ? 'Hide front matter' : 'Front matter';
        } }, ['Front matter']),
      ]);
      editor.insertBefore(chip, editor.firstChild);
    }
    var label = (CHANNELS.filter(function (c) { return c[0] === state.channel; })[0] || [])[1] || data.channel;
    var parts = [label, data.title || data.subject, data.author || data.brand].filter(Boolean);
    chip.querySelector('.cq-front-matter-text').textContent = parts.length ? parts.join(' · ') : keys.length + ' front matter fields';
  }

  var panel;
  function render() {
    renderFrontMatterChip();
    if (!panel) return;
    var body = panel.querySelector('.cq-body');
    var content = state.tab === 'preview' ? renderPreview() : state.tab === 'playbooks' ? renderPlaybooks() : renderApproval();
    body.replaceChildren.apply(body, content.filter(Boolean));
    panel.querySelectorAll('.cq-tab').forEach(function (tab) { tab.setAttribute('aria-selected', String(tab.dataset.tab === state.tab)); });
    var badge = panel.querySelector('.cq-badge');
    var approved = state.server && state.server.approval && state.server.approval.state === 'approved';
    badge.textContent = approved ? 'Approved' : '';
  }

  function headers(extra) {
    var result = { authorization: 'Bearer ' + token };
    Object.keys(extra || {}).forEach(function (k) { result[k] = extra[k]; });
    return result;
  }
  function refreshServer() {
    return fetch(api + '/review', { headers: headers(), cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (json) {
      if (!json.success) throw new Error(json.error || 'Review state is unavailable.');
      state.server = json;
      state.channel = json.channel;
      state.error = '';
    }).catch(function (error) { state.error = error.message; });
  }
  function refreshMarkdown() {
    var live = window.proof && typeof window.proof.getMarkdownSnapshot === 'function' ? window.proof.getMarkdownSnapshot() : null;
    // Comment and suggestion anchors are Proof markup, not text; counters must not count them.
    if (live && typeof live.content === 'string') { state.markdown = withoutProofSpans(live.content); return Promise.resolve(); }
    return fetch('/d/' + encodeURIComponent(slug) + '?token=' + encodeURIComponent(token), { headers: { accept: 'text/markdown' }, cache: 'no-store' })
      .then(function (r) { return r.text(); }).then(function (text) { state.markdown = withoutProofSpans(text); }).catch(function () {});
  }
  function stamp(method, approver) {
    if (method === 'POST') {
      if (!approver) { state.error = 'Enter your name to approve.'; render(); return; }
      localStorage.setItem(NAME_KEY, approver);
    }
    refreshServer().then(function () {
      var sha = state.server ? state.server.sha256 : '';
      if (method === 'POST' && !window.confirm('Approve the exact text with SHA-256 ' + sha.slice(0, 12) + '? Any edit clears this approval.')) return null;
      return fetch(api + '/approval', {
        method: method,
        headers: headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(method === 'POST' ? { approver: approver, sha256: sha, by: 'human:' + approver } : {}),
      }).then(function (r) { return r.json(); }).then(function (json) {
        state.error = json.success ? '' : json.error;
        return refreshServer();
      });
    }).then(render);
  }

  function mount() {
    panel = el('aside', { class: 'cq-panel', 'aria-label': 'Conquistador review' }, [
      el('div', { class: 'cq-head' }, [
        el('b', { text: 'Review' }), el('span', { class: 'cq-badge' }),
        el('button', { class: 'cq-close', type: 'button', 'aria-label': 'Close review panel', text: '×', onclick: function () { document.body.classList.remove('cq-open'); } }),
      ]),
      el('div', { class: 'cq-tabs', role: 'tablist' }, [['preview', 'Preview'], ['playbooks', 'Playbooks applied'], ['approval', 'Approval']].map(function (t) {
        return el('button', { class: 'cq-tab', type: 'button', role: 'tab', 'data-tab': t[0], text: t[1], onclick: function () { state.tab = t[0]; render(); } });
      })),
      el('div', { class: 'cq-body' }),
    ]);
    var toggle = el('button', { class: 'cq-toggle', type: 'button', text: 'Review', onclick: function () { document.body.classList.toggle('cq-open'); } });
    document.body.appendChild(panel);
    document.body.appendChild(toggle);
    document.body.classList.add('cq-open');
    var tick = function () { Promise.all([refreshMarkdown(), refreshServer()]).then(render); };
    tick();
    setInterval(tick, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
