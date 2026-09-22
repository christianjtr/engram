'use strict';

// ── Palette ───────────────────────────────────────────────────────────────────

const P = {
    architecture: { fill: '#3b0a6e', stroke: '#c084fc', text: '#e0d1ff' },
    decision:     { fill: '#0f2a5c', stroke: '#60a5fa', text: '#dbeafe' },
    convention:   { fill: '#1f1b4d', stroke: '#818cf8', text: '#c7d2fe' },
    pattern:      { fill: '#052f4a', stroke: '#22d3ee', text: '#cffafe' },
    discovery:    { fill: '#3a1f00', stroke: '#fbbf24', text: '#fef08c' },
    bugfix:       { fill: '#3f0f0f', stroke: '#f87171', text: '#fecaca' },
    config:       { fill: '#1f2937', stroke: '#9ca3af', text: '#e5e7eb' },
    learning:     { fill: '#14532d', stroke: '#a3e635', text: '#d9f99d' },
    other:        { fill: '#1f2937', stroke: '#64748b', text: '#cbd5e1' },
    topic:        { fill: '#1e293b', stroke: '#64748b', text: '#94a3b8', dashed: true },
    project:      { fill: '#0f172a', stroke: '#475569', text: '#e2e8f0' },
    global:       { fill: '#020617', stroke: '#334155', text: '#e0e7ff' },
};

const EDGE_COLOR = {
    BELONGS_TO:     '#2a2a2a',
    INHERITS:       '#94a3b8',
    SUPERSEDES:     '#f59e0b',
    CONFLICTS_WITH: '#ef4444',
    RELATED_TO:     '#334155',
    PRODUCED_IN:    '#1a1a1a',
};

const VERB_STYLE = {
    SUPERSEDES:     { bg: '#3a1800', color: '#f59e0b' },
    CONFLICTS_WITH: { bg: '#3a0505', color: '#ef4444' },
    RELATED_TO:     { bg: '#1a1a1a', color: '#64748b' },
    BELONGS_TO:     { bg: '#111',    color: '#334155' },
    INHERITS:       { bg: '#0d1530', color: '#60a5fa' },
    PRODUCED_IN:    { bg: '#111',    color: '#334155' },
};

function pal(n) {
    if (!n) return P.other;
    if (n.lifecycle === 'stale') return { fill: '#111', stroke: '#1e1e1e', text: '#333' };
    if (n.category === 'GLOBAL_CONTEXT') return P.global;
    if (n.category === 'PROJECT')        return P.project;
    if (n.category === 'TOPIC')          return P.topic;
    return P[n.type] || P.other;
}

// ── State ─────────────────────────────────────────────────────────────────────

let G            = null;
let IDX          = null;
let visNodes     = [];
let visEdges     = [];
let activeFilter = new Set();
let currentView  = () => {};
let activeRow    = null;

let cam       = { x: 0, y: 0, s: 1 };
let drag      = null;
let dragMoved = false;
let hNode     = null;
let hEdge     = null;
let rafId     = null;

// ── Index ─────────────────────────────────────────────────────────────────────

function buildIndex(graph) {
    const byId = new Map(graph.nodes.map(n => [n.id, n]));
    const fromE = new Map();
    const toE   = new Map();

    graph.edges.forEach(e => {
        if (!fromE.has(e.source)) fromE.set(e.source, []);
        if (!toE.has(e.target))   toE.set(e.target,   []);
        fromE.get(e.source).push(e);
        toE.get(e.target).push(e);
    });

    const projects = graph.nodes.filter(n => n.category === 'PROJECT');
    const topics   = graph.nodes.filter(n => n.category === 'TOPIC');
    const obs      = graph.nodes.filter(n => n.category === 'OBSERVATION');
    const globalN  = graph.nodes.find(n  => n.category === 'GLOBAL_CONTEXT');

    const topicProject = new Map();
    const obsTopic     = new Map();

    graph.edges.filter(e => e.relation === 'BELONGS_TO').forEach(e => {
        const t = byId.get(e.target);
        if (t?.category === 'PROJECT') topicProject.set(e.source, e.target);
        if (t?.category === 'TOPIC')   obsTopic.set(e.source, e.target);
    });

    const globalObs = obs.filter(o =>
        (fromE.get(o.id) || []).some(e =>
            e.relation === 'BELONGS_TO' && byId.get(e.target)?.category === 'GLOBAL_CONTEXT'
        )
    );

    return { byId, fromE, toE, projects, topics, obs, globalN, globalObs, topicProject, obsTopic };
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');

const NW = 172, NH = 50, NR = 7;

function dpr() { return window.devicePixelRatio || 1; }
function cw()  { return canvas.width  / dpr(); }
function ch()  { return canvas.height / dpr(); }

function resize() {
    const wrap = canvas.parentElement;
    const d = dpr();
    canvas.width  = wrap.clientWidth  * d;
    canvas.height = wrap.clientHeight * d;
    canvas.style.width  = wrap.clientWidth  + 'px';
    canvas.style.height = wrap.clientHeight + 'px';
}

function toScreen(x, y) {
    return { x: x * cam.s + cam.x, y: y * cam.s + cam.y };
}

function schedRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = null; renderFrame(); });
}

function updateZoomLabel() {
    document.getElementById('zoom-label').textContent = Math.round(cam.s * 100) + '%';
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function rrect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y,   x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function wrapText(text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
        else line = t;
    }
    if (line) lines.push(line);
    return lines.slice(0, 2);
}

function drawArrow(x1, y1, x2, y2, color, dashed, weight) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 2) return;
    const ux = dx / len, uy = dy / len;
    const ex = x2 - ux * 9, ey = y2 - uy * 9;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth   = weight || 1.5;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - ux * 9 + uy * 4, ey - uy * 9 - ux * 4);
    ctx.lineTo(ex - ux * 9 - uy * 4, ey - uy * 9 + ux * 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawEdgeLabel(midX, midY, text, hovered) {
    const fontSize = Math.max(8, Math.round(9 * cam.s));
    ctx.save();
    ctx.font = `${fontSize}px -apple-system, system-ui, sans-serif`;
    const tw = ctx.measureText(text).width;
    const ph = fontSize + 4, pw = tw + 10;
    const lx = midX - pw / 2, ly = midY - ph - 4 * cam.s;

    ctx.fillStyle = hovered ? '#1e293b' : '#0f172a';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(lx, ly, pw, ph, 3);
    } else {
        ctx.rect(lx, ly, pw, ph);
    }
    ctx.fill();

    ctx.fillStyle    = hovered ? '#f0abfc' : '#94a3b8';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, midX, ly + ph / 2);
    ctx.restore();
}

function drawNode(n, hi) {
    const { x: sx, y: sy } = toScreen(n._x, n._y);
    const sw = NW * cam.s, sh = NH * cam.s;
    const px = sx - sw / 2, py = sy - sh / 2;
    const p  = pal(n);

    ctx.save();
    if (hi) { ctx.shadowColor = p.stroke; ctx.shadowBlur = 18; }

    rrect(px, py, sw, sh, NR * cam.s);
    ctx.fillStyle = p.fill;
    ctx.fill();

    if (p.dashed) ctx.setLineDash([5 * cam.s, 4 * cam.s]);
    ctx.strokeStyle = hi ? '#fff' : p.stroke;
    ctx.lineWidth   = hi ? 2 * cam.s : 1.2 * cam.s;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Left accent strip
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, 3 * cam.s, sh);
    ctx.clip();
    rrect(px, py, 6 * cam.s, sh, NR * cam.s);
    ctx.fillStyle = p.stroke;
    ctx.fill();
    ctx.restore();

    // Label
    ctx.fillStyle    = hi ? '#fff' : p.text;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(11 * cam.s)}px -apple-system, system-ui, sans-serif`;

    const prefix = n.type && n.category === 'OBSERVATION' ? `[${n.type}] ` : '';
    const raw    = (prefix + n.label).replace(/^(PROJECT:|TOPIC:|GLOBAL)/i, '').trim();
    const lines  = wrapText(raw, sw - 22 * cam.s);
    const lh     = 14 * cam.s;
    const ty     = sy - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, sx, ty + i * lh, sw - 18 * cam.s));

    ctx.restore();
}

function renderFrame() {
    const d = dpr();
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, cw(), ch());

    visEdges.forEach(e => {
        const src = visNodes.find(n => n.id === e.source);
        const tgt = visNodes.find(n => n.id === e.target);
        if (!src || !tgt) return;
        const sp     = toScreen(src._x, src._y);
        const tp     = toScreen(tgt._x, tgt._y);
        const color  = EDGE_COLOR[e.relation] || '#222';
        const dashed = e.relation === 'RELATED_TO' || e.relation === 'CONFLICTS_WITH';
        const isHov  = e === hEdge;
        const weight = e.relation === 'INHERITS' ? 2 : 1.5;
        drawArrow(sp.x, sp.y, tp.x, tp.y, isHov ? '#ddd' : color, dashed, isHov ? 2.5 : weight);
        const midX = (sp.x + tp.x) / 2, midY = (sp.y + tp.y) / 2;
        drawEdgeLabel(midX, midY, e.relation, isHov);
    });

    visNodes.forEach(n => drawNode(n, n === hNode));

    ctx.restore();
}

// ── Layout ────────────────────────────────────────────────────────────────────

function layout(nodes) {
    const LAYERS = ['GLOBAL_CONTEXT', 'PROJECT', 'TOPIC', 'OBSERVATION', 'SESSION'];
    const byLayer = new Map();

    nodes.forEach(n => {
        const li = LAYERS.indexOf(n.category);
        const l  = li < 0 ? 3 : li;
        if (!byLayer.has(l)) byLayer.set(l, []);
        byLayer.get(l).push(n);
    });

    const keys  = [...byLayer.keys()].sort();
    const H_GAP = 230, V_GAP = 120;
    const total = keys.length;

    keys.forEach((layer, li) => {
        const row    = byLayer.get(layer);
        const totalW = (row.length - 1) * H_GAP;
        row.forEach((n, ni) => {
            n._x = -totalW / 2 + ni * H_GAP;
            n._y = (li - (total - 1) / 2) * V_GAP;
        });
    });
}

function fitView(nodes) {
    if (!nodes.length) return;
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    nodes.forEach(n => {
        mnX = Math.min(mnX, n._x); mxX = Math.max(mxX, n._x);
        mnY = Math.min(mnY, n._y); mxY = Math.max(mxY, n._y);
    });
    const W_ = mxX - mnX + NW + 80, H_ = mxY - mnY + NH + 80;
    cam.s = Math.max(0.2, Math.min(cw() / W_, ch() / H_, 1.8));
    cam.x = (cw() - (mnX + mxX) * cam.s) / 2;
    cam.y = (ch() - (mnY + mxY) * cam.s) / 2;
    updateZoomLabel();
}

function showGraph(nodes, edges) {
    visNodes = nodes;
    visEdges = edges;
    layout(nodes);
    fitView(nodes);
    document.getElementById('canvas-empty').classList.add('hidden');
    schedRender();
}

// ── Hit testing ───────────────────────────────────────────────────────────────

function nodeAt(mx, my) {
    for (const n of [...visNodes].reverse()) {
        const sp = toScreen(n._x, n._y);
        if (Math.abs(mx - sp.x) < (NW * cam.s) / 2 &&
            Math.abs(my - sp.y) < (NH * cam.s) / 2) return n;
    }
    return null;
}

function edgeAt(mx, my) {
    for (const e of visEdges) {
        const src = visNodes.find(n => n.id === e.source);
        const tgt = visNodes.find(n => n.id === e.target);
        if (!src || !tgt) continue;
        const sp = toScreen(src._x, src._y);
        const tp = toScreen(tgt._x, tgt._y);
        const ex = (sp.x + tp.x) / 2, ey = (sp.y + tp.y) / 2;
        if (Math.hypot(mx - ex, my - ey) < 18) return e;
    }
    return null;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function showTooltip(cx, cy, target) {
    const p = pal(target);
    let html = '';
    if (target.category) {
        html = `<strong style="color:${p.stroke}">${target.label}</strong>`;
        if (target.type) html += `<br><span style="color:#555;font-size:10px">${target.type} · ${target.lifecycle || 'active'}</span>`;
        if (target.content) html += `<br><br><span style="color:#666;font-size:11px">${target.content.slice(0, 100)}…</span>`;
    } else {
        const vs = VERB_STYLE[target.relation] || { color: '#555' };
        html = `<span style="color:${vs.color};font-size:10px;font-weight:700">${target.relation}</span>` +
               `<br><span style="color:#555;font-size:11px">Click to see details</span>`;
    }
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');

    const tw = 260, th = 80;
    let left = cx + 14, top = cy + 14;
    if (left + tw > window.innerWidth)  left = cx - tw - 14;
    if (top  + th > window.innerHeight) top  = cy - th - 14;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
}

function hideTooltip() {
    tooltip.classList.remove('visible');
}

// ── Canvas events ─────────────────────────────────────────────────────────────

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const f    = e.deltaY < 0 ? 1.12 : 0.9;
    const wx   = (mx - cam.x) / cam.s;
    const wy   = (my - cam.y) / cam.s;
    cam.s = Math.max(0.15, Math.min(4, cam.s * f));
    cam.x = mx - wx * cam.s;
    cam.y = my - wy * cam.s;
    updateZoomLabel();
    schedRender();
}, { passive: false });

canvas.addEventListener('mousedown', e => {
    drag = { mx: e.clientX, my: e.clientY, cx: cam.x, cy: cam.y };
    dragMoved = false;
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
});

window.addEventListener('mouseup', () => {
    drag = null;
    canvas.style.cursor = hNode || hEdge ? 'pointer' : 'default';
});

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    if (drag) {
        const dx = e.clientX - drag.mx;
        const dy = e.clientY - drag.my;
        if (!dragMoved && Math.hypot(dx, dy) > 3) dragMoved = true;
        cam.x = drag.cx + dx;
        cam.y = drag.cy + dy;
        hideTooltip();
        schedRender();
        return;
    }

    const prevN = hNode, prevE = hEdge;
    hNode = nodeAt(mx, my);
    hEdge = hNode ? null : edgeAt(mx, my);
    canvas.style.cursor = hNode || hEdge ? 'pointer' : 'default';

    if (hNode || hEdge) showTooltip(e.clientX, e.clientY, hNode || hEdge);
    else hideTooltip();

    if (hNode !== prevN || hEdge !== prevE) schedRender();
});

canvas.addEventListener('mouseleave', () => {
    hNode = null; hEdge = null; hideTooltip(); drag = null; schedRender();
});

canvas.addEventListener('click', e => {
    if (dragMoved) { dragMoved = false; return; }
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const node = nodeAt(mx, my);
    if (node) { openDrawer(node); return; }
    const edge = edgeAt(mx, my);
    if (edge) { openModal(edge); return; }
    closeDrawer();
});

window.addEventListener('resize', () => { resize(); fitView(visNodes); schedRender(); });

// ── Toolbar controls ──────────────────────────────────────────────────────────

document.getElementById('btn-fit').addEventListener('click', () => {
    fitView(visNodes); schedRender();
});

document.getElementById('btn-zoom-in').addEventListener('click', () => {
    const f = 1.2;
    cam.x = cw() / 2 - (cw() / 2 - cam.x) * f;
    cam.y = ch() / 2 - (ch() / 2 - cam.y) * f;
    cam.s = Math.min(4, cam.s * f);
    updateZoomLabel(); schedRender();
});

document.getElementById('btn-zoom-out').addEventListener('click', () => {
    const f = 0.85;
    cam.x = cw() / 2 - (cw() / 2 - cam.x) * f;
    cam.y = ch() / 2 - (ch() / 2 - cam.y) * f;
    cam.s = Math.max(0.15, cam.s * f);
    updateZoomLabel(); schedRender();
});

document.getElementById('btn-collapse').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-rail').classList.remove('hidden');
    setTimeout(() => { resize(); fitView(visNodes); schedRender(); }, 260);
});

document.getElementById('btn-expand').addEventListener('click', () => {
    document.getElementById('sidebar-rail').classList.add('hidden');
    document.getElementById('sidebar').classList.remove('collapsed');
    setTimeout(() => { resize(); fitView(visNodes); schedRender(); }, 260);
});

// ── Drawer ────────────────────────────────────────────────────────────────────

function openDrawer(node) {
    const p     = pal(node);
    const badge = document.getElementById('drawer-badge');
    badge.textContent = (node.type || node.category).toUpperCase();
    badge.style.cssText = `background:${p.fill};color:${p.text};border:1px solid ${p.stroke}`;
    document.getElementById('drawer-title').textContent = node.label;

    const rels = [
        ...(IDX.fromE.get(node.id) || []).filter(e => ['SUPERSEDES', 'CONFLICTS_WITH', 'RELATED_TO'].includes(e.relation)),
        ...(IDX.toE.get(node.id)   || []).filter(e => ['SUPERSEDES', 'CONFLICTS_WITH', 'RELATED_TO'].includes(e.relation)),
    ];

    document.getElementById('drawer-content').innerHTML = `
        <div class="d-meta-grid" style="margin-bottom:18px">
            ${node.category === 'OBSERVATION' ? `
            <div class="d-meta-card">
                <div class="d-label">Type</div>
                <div class="d-value" style="color:${p.stroke}">${node.type || '—'}</div>
            </div>` : ''}
            <div class="d-meta-card">
                <div class="d-label">Project</div>
                <div class="d-value">${node.metadata?.project || '—'}</div>
            </div>
            ${node.lifecycle ? `
            <div class="d-meta-card">
                <div class="d-label">Lifecycle</div>
                <div class="d-value" style="color:${node.lifecycle === 'active' ? '#4ade80' : '#555'}">${node.lifecycle}</div>
            </div>` : ''}
            ${node.topic_key ? `
            <div class="d-meta-card">
                <div class="d-label">Topic</div>
                <div class="d-value">${node.topic_key}</div>
            </div>` : ''}
        </div>
        ${node.content ? `
        <div class="d-section">
            <div class="d-label">Content</div>
            <div class="d-content-box">${node.content}</div>
        </div>` : ''}
        ${rels.length ? `
        <div class="d-section">
            <div class="d-label">Relations</div>
            ${rels.map(e => {
                const isOut = e.source === node.id;
                const other = IDX.byId.get(isOut ? e.target : e.source);
                const vs    = VERB_STYLE[e.relation] || { bg: '#1a1a1a', color: '#555' };
                return `<div class="d-rel-row" onclick="openModalById('${e.source}','${e.target}','${e.relation}')">
                    <span class="d-rel-verb" style="background:${vs.bg};color:${vs.color}">${e.relation}</span>
                    <span class="d-rel-target">${other?.label || '—'}</span>
                    <span class="d-rel-arrow">›</span>
                </div>`;
            }).join('')}
        </div>` : ''}
    `;

    document.getElementById('drawer').classList.remove('drawer-closed');
}

function closeDrawer() {
    document.getElementById('drawer').classList.add('drawer-closed');
}

document.getElementById('drawer-close').addEventListener('click', closeDrawer);

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(edge) {
    const src = IDX.byId.get(edge.source);
    const tgt = IDX.byId.get(edge.target);
    const vs  = VERB_STYLE[edge.relation] || { bg: '#1a1a1a', color: '#555' };
    const ps  = src ? pal(src) : P.other;
    const pt  = tgt ? pal(tgt) : P.other;

    document.getElementById('modal-title').textContent = edge.relation;
    document.getElementById('modal-body').innerHTML = `
        <div class="modal-nodes">
            <div class="modal-node" style="border-color:${ps.stroke}44">
                <div class="modal-node-name">${src?.label || edge.source}</div>
                <div class="modal-node-sub" style="color:${ps.stroke}">${src?.type || src?.category || ''}</div>
            </div>
            <span class="modal-verb" style="background:${vs.bg};color:${vs.color}">${edge.relation}</span>
            <div class="modal-node" style="border-color:${pt.stroke}44">
                <div class="modal-node-name">${tgt?.label || edge.target}</div>
                <div class="modal-node-sub" style="color:${pt.stroke}">${tgt?.type || tgt?.category || ''}</div>
            </div>
        </div>
        ${edge.reason ? `<div class="modal-detail"><div class="modal-detail-label">Reason</div><div class="modal-detail-value">${edge.reason}</div></div>` : ''}
        ${edge.metadata?.relation ? `<div class="modal-detail"><div class="modal-detail-label">Original Verb</div><div class="modal-detail-value">${edge.metadata.relation}</div></div>` : ''}
        <div class="modal-detail"><div class="modal-detail-label">Source</div><div class="modal-detail-value"><code>${edge.source}</code></div></div>
        <div class="modal-detail"><div class="modal-detail-label">Target</div><div class="modal-detail-value"><code>${edge.target}</code></div></div>
    `;
    document.getElementById('modal-overlay').classList.remove('hidden');
}

window.openModalById = function(src, tgt, rel) {
    const edge = (IDX.fromE.get(src) || []).find(e => e.target === tgt && e.relation === rel)
              || { source: src, target: tgt, relation: rel };
    openModal(edge);
};

document.getElementById('modal-close').addEventListener('click', () =>
    document.getElementById('modal-overlay').classList.add('hidden'));

document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay'))
        document.getElementById('modal-overlay').classList.add('hidden');
});

// ── Views ─────────────────────────────────────────────────────────────────────

function setBC(...parts) {
    document.getElementById('breadcrumb').innerHTML =
        ['All Memory', ...parts].map((p, i, a) =>
            `<span class="bc-item">${p}</span>${i < a.length - 1 ? '<span class="bc-sep">›</span>' : ''}`
        ).join('');
}

function filterNodes(nodes) {
    if (!activeFilter.size) return nodes;
    return nodes.filter(n => {
        if (n.category !== 'OBSERVATION') return true;
        return activeFilter.has(n.type || 'other');
    });
}

function subgraph(ids) {
    const set     = new Set(ids);
    const all     = [...set].map(id => IDX.byId.get(id)).filter(Boolean);
    const filt    = filterNodes(all);
    const filtSet = new Set(filt.map(n => n.id));
    const edges   = G.edges.filter(e => filtSet.has(e.source) && filtSet.has(e.target));
    return { nodes: filt, edges };
}

function viewGlobal() {
    setBC();
    const ids = [IDX.globalN?.id, ...IDX.globalObs.map(o => o.id), ...IDX.projects.map(p => p.id)].filter(Boolean);
    const { nodes, edges } = subgraph(ids);
    showGraph(nodes, edges);
}

function viewProject(proj) {
    setBC(proj.label);
    const topics = IDX.topics.filter(t => IDX.topicProject.get(t.id) === proj.id);
    const obs    = IDX.obs.filter(o => {
        const t = IDX.obsTopic.get(o.id);
        return t && IDX.topicProject.get(t) === proj.id;
    });
    const { nodes, edges } = subgraph([proj.id, ...topics.map(t => t.id), ...obs.map(o => o.id)]);
    showGraph(nodes, edges);
}

function viewTopic(topic, proj) {
    setBC(proj?.label || 'Project', topic.label);
    const obs = IDX.obs.filter(o => IDX.obsTopic.get(o.id) === topic.id);
    const { nodes, edges } = subgraph([topic.id, ...obs.map(o => o.id)]);
    showGraph(nodes, edges);
}

function viewObs(obs) {
    setBC(obs.label);
    const connected = new Set([obs.id]);
    const rawEdges  = [...(IDX.fromE.get(obs.id) || []), ...(IDX.toE.get(obs.id) || [])];
    rawEdges.forEach(e => { connected.add(e.source); connected.add(e.target); });
    const { nodes, edges } = subgraph([...connected]);
    showGraph(nodes, edges);
    openDrawer(obs);
}

function refreshView() { currentView(); }

// ── Filters ───────────────────────────────────────────────────────────────────

function buildFilters() {
    const types = new Set(IDX.obs.map(o => o.type || 'other').filter(Boolean));
    const bar   = document.getElementById('filter-chips');
    bar.innerHTML = '';

    types.forEach(type => {
        const p    = P[type] || P.other;
        const chip = document.createElement('span');
        chip.className = 'f-chip active';
        chip.textContent = type;
        chip.style.cssText = `background:${p.fill};color:${p.stroke};border-color:${p.stroke}44`;
        chip.addEventListener('click', () => {
            if (activeFilter.has(type)) {
                activeFilter.delete(type);
                chip.classList.remove('active');
            } else {
                activeFilter.add(type);
                chip.classList.add('active');
            }
            refreshView();
        });
        bar.appendChild(chip);
    });
}

// ── Tree ──────────────────────────────────────────────────────────────────────

function activate(row, fn) {
    if (activeRow) activeRow.classList.remove('active');
    activeRow = row;
    row.classList.add('active');
    currentView = fn;
    fn();
}

function mkRow(level, label, dotColor, badgeText, onClick, withCaret) {
    const row = document.createElement('div');
    row.className = `t-row t-l${level}`;

    const caret = document.createElement('span');
    caret.className  = 't-caret' + (withCaret ? ' open' : '');
    caret.textContent = withCaret ? '▶' : '';
    caret.style.opacity = withCaret ? '1' : '0';
    row.__caret = caret;
    row.appendChild(caret);

    if (dotColor) {
        const dot = document.createElement('span');
        dot.className = 't-dot';
        dot.style.background = dotColor;
        row.appendChild(dot);
    }

    const lbl = document.createElement('span');
    lbl.className = 't-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (badgeText) {
        const b = document.createElement('span');
        const p = P[badgeText] || P.other;
        b.className = 't-badge';
        b.textContent = badgeText;
        b.style.cssText = `background:${p.fill};color:${p.stroke}`;
        row.appendChild(b);
    }

    row.addEventListener('click', () => activate(row, onClick));
    return row;
}

function collapsible(row, kids) {
    let open = true;
    row.addEventListener('click', () => {
        open = !open;
        kids.classList.toggle('open', open);
        if (row.__caret) row.__caret.classList.toggle('open', open);
    }, { capture: true });
}

function buildTree() {
    const tree = document.getElementById('tree');
    tree.innerHTML = '';

    const glLabel = document.createElement('div');
    glLabel.className = 't-section-label';
    glLabel.textContent = 'Global';
    tree.appendChild(glLabel);

    const gRow  = mkRow(0, 'Global Context', '#555', null, () => viewGlobal(), true);
    tree.appendChild(gRow);
    const gKids = document.createElement('div');
    gKids.className = 't-kids open';

    IDX.globalObs.forEach(o => {
        const p = pal(o);
        gKids.appendChild(mkRow(1, o.label, p.stroke, o.type || 'other', () => viewObs(o), false));
    });

    tree.appendChild(gKids);
    collapsible(gRow, gKids);

    if (IDX.projects.length) {
        const plLabel = document.createElement('div');
        plLabel.className = 't-section-label';
        plLabel.style.marginTop = '6px';
        plLabel.textContent = 'Projects';
        tree.appendChild(plLabel);
    }

    IDX.projects.forEach(proj => {
        const topics   = IDX.topics.filter(t => IDX.topicProject.get(t.id) === proj.id);
        const obsCount = IDX.obs.filter(o => {
            const t = IDX.obsTopic.get(o.id);
            return t && IDX.topicProject.get(t) === proj.id;
        }).length;

        const pRow = mkRow(0, proj.label, '#475569', null, () => viewProject(proj), true);
        const ct   = document.createElement('span');
        ct.className  = 't-badge';
        ct.textContent = obsCount;
        ct.style.cssText = 'background:#1a1a1a;color:#555';
        pRow.appendChild(ct);
        tree.appendChild(pRow);

        const pKids = document.createElement('div');
        pKids.className = 't-kids open';

        topics.forEach(topic => {
            const topicObs = IDX.obs.filter(o => IDX.obsTopic.get(o.id) === topic.id);
            const tRow     = mkRow(1, topic.label, '#334155', null, () => viewTopic(topic, proj), true);
            pKids.appendChild(tRow);

            const tKids = document.createElement('div');
            tKids.className = 't-kids open';

            topicObs.forEach(o => {
                const p = pal(o);
                tKids.appendChild(mkRow(2, o.label, p.stroke, o.type || 'other', () => viewObs(o), false));
            });

            pKids.appendChild(tKids);
            collapsible(tRow, tKids);
        });

        tree.appendChild(pKids);
        collapsible(pRow, pKids);
    });
}

// ── Search ────────────────────────────────────────────────────────────────────

const searchEl = document.getElementById('search');
const clearBtn = document.getElementById('search-clear');

searchEl.addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    clearBtn.classList.toggle('hidden', !q);
    document.querySelectorAll('.t-row').forEach(row => {
        const text = row.querySelector('.t-label')?.textContent?.toLowerCase() || '';
        row.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
});

clearBtn.addEventListener('click', () => {
    searchEl.value = '';
    clearBtn.classList.add('hidden');
    document.querySelectorAll('.t-row').forEach(r => r.style.display = '');
    searchEl.focus();
});

// ── Stats ─────────────────────────────────────────────────────────────────────

function renderStats(slice) {
    document.getElementById('stats').innerHTML = `
        <span style="color:#e11d48">${slice.project}</span>
        <span style="color:#4ade80">&#9679; ${slice.activeCount} active</span>
        ${slice.staleCount ? `<span style="color:#333">&#9679; ${slice.staleCount} stale</span>` : ''}
        <span>&#9675; ${slice.globalRulesInherited} globals</span>
    `;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    resize();

    try {
        G = await fetch('/graph.json').then(r => r.json());
    } catch {
        document.getElementById('canvas-empty').querySelector('p').textContent =
            'Could not load graph.json — run engram-semantic-graph -g first.';
        return;
    }

    IDX = buildIndex(G);
    new Set(IDX.obs.map(o => o.type || 'other')).forEach(t => activeFilter.add(t));

    buildFilters();
    buildTree();
    renderStats(G.slice);
    setBC();

    currentView = viewGlobal;
    viewGlobal();
}

init();
