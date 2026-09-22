'use strict';

// ── Palette ───────────────────────────────────────────────────────────────────

const P = {
    architecture: { fill: '#2d0a5c', stroke: '#c084fc', text: '#e9d5ff' },
    decision:     { fill: '#0c2150', stroke: '#60a5fa', text: '#dbeafe' },
    convention:   { fill: '#1a1640', stroke: '#818cf8', text: '#e0e7ff' },
    pattern:      { fill: '#042a40', stroke: '#22d3ee', text: '#cffafe' },
    discovery:    { fill: '#2e1800', stroke: '#fbbf24', text: '#fef3c7' },
    bugfix:       { fill: '#300a0a', stroke: '#f87171', text: '#fecaca' },
    config:       { fill: '#161b25', stroke: '#94a3b8', text: '#e2e8f0' },
    learning:     { fill: '#0f2208', stroke: '#a3e635', text: '#ecfccb' },
    other:        { fill: '#161b25', stroke: '#64748b', text: '#cbd5e1' },
    topic:        { fill: '#111318', stroke: '#475569', text: '#94a3b8', dashed: true },
    project:      { fill: '#0a0d14', stroke: '#334155', text: '#e2e8f0' },
    global:       { fill: '#06080f', stroke: '#e11d48', text: '#fda4af' },
    session:      { fill: '#0f1117', stroke: '#6366f1', text: '#c7d2fe' },
};

const EDGE_COLOR = {
    BELONGS_TO:     'rgba(255,255,255,.05)',
    INHERITS:       '#e11d48',
    SUPERSEDES:     '#fb923c',
    CONFLICTS_WITH: '#f43f5e',
    RELATED_TO:     '#38bdf8',
    PRODUCED_IN:    'rgba(255,255,255,.04)',
};

const VERB_STYLE = {
    SUPERSEDES:     { bg: '#2a1100', color: '#fb923c' },
    CONFLICTS_WITH: { bg: '#2a0510', color: '#f43f5e' },
    RELATED_TO:     { bg: '#06141e', color: '#38bdf8' },
    BELONGS_TO:     { bg: '#111',    color: '#334155' },
    INHERITS:       { bg: '#1a0010', color: '#fb7185' },
    PRODUCED_IN:    { bg: '#111',    color: '#334155' },
};

function pal(n) {
    if (!n) return P.other;
    if (n.lifecycle === 'stale') return { fill: '#0d0d0f', stroke: '#252530', text: '#2e2e38' };
    if (n.category === 'GLOBAL_CONTEXT') return P.global;
    if (n.category === 'PROJECT')        return P.project;
    if (n.category === 'TOPIC')          return P.topic;
    if (n.category === 'SESSION')        return P.session;
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

// Transition state
let transitioning   = false;
let transStart      = 0;
const TRANS_DURATION = 320;
let transNodes      = [];

// Highlight state
let highlightPairIds = null;
let highlightTimer   = null;

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

const NW = 180, NH = 52, NR = 8;

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

// ── Easing ────────────────────────────────────────────────────────────────────

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function lerp(a, b, t)   { return a + (b - a) * t; }

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

// Quadratic Bézier point
function bezierPt(p0, p1, p2, t) {
    return {
        x: (1-t)*(1-t)*p0.x + 2*(1-t)*t*p1.x + t*t*p2.x,
        y: (1-t)*(1-t)*p0.y + 2*(1-t)*t*p1.y + t*t*p2.y,
    };
}

// Tangent of quadratic Bézier at t
function bezierTangent(p0, p1, p2, t) {
    return {
        x: 2*(1-t)*(p1.x-p0.x) + 2*t*(p2.x-p1.x),
        y: 2*(1-t)*(p1.y-p0.y) + 2*t*(p2.y-p1.y),
    };
}

function drawEdge(x1, y1, x2, y2, edge, hovered, dimmed) {
    const relation = edge.relation;
    const color    = EDGE_COLOR[relation] || '#222';
    const isStructural = relation === 'BELONGS_TO' || relation === 'PRODUCED_IN';
    const isSemantic   = relation === 'SUPERSEDES' || relation === 'CONFLICTS_WITH' || relation === 'RELATED_TO';

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;

    // Control point offset — perpendicular to the edge
    const curveOffset = isSemantic ? 28 * cam.s : 8 * cam.s;
    const nx = -dy / len, ny = dx / len;
    const cp = { x: (x1 + x2) / 2 + nx * curveOffset, y: (y1 + y2) / 2 + ny * curveOffset };

    const p0 = { x: x1, y: y1 };
    const p2 = { x: x2, y: y2 };

    // Arrow endpoint slightly before the target node edge
    const tEnd = 0.92;
    const endPt = bezierPt(p0, cp, p2, tEnd);
    const tang  = bezierTangent(p0, cp, p2, tEnd);
    const tangLen = Math.hypot(tang.x, tang.y);
    const ux = tang.x / tangLen, uy = tang.y / tangLen;

    ctx.save();

    const alpha = dimmed ? 0.12 : hovered ? 1 : (isSemantic ? 0.85 : 0.5);
    ctx.globalAlpha = alpha;

    const weight = hovered ? 2.8 * cam.s : isSemantic ? 1.8 * cam.s : 1.2 * cam.s;
    ctx.strokeStyle = hovered ? (isSemantic ? color : '#aaa') : color;
    ctx.lineWidth   = weight;

    if (relation === 'RELATED_TO') ctx.setLineDash([5 * cam.s, 4 * cam.s]);
    if (isStructural) ctx.setLineDash([3 * cam.s, 5 * cam.s]);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cp.x, cp.y, endPt.x, endPt.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    if (!isStructural || relation === 'INHERITS') {
        const as = hovered ? 10 : 7;
        ctx.fillStyle = hovered ? (isSemantic ? color : '#aaa') : color;
        ctx.beginPath();
        ctx.moveTo(endPt.x, endPt.y);
        ctx.lineTo(endPt.x - ux * as * cam.s + uy * 3.5 * cam.s,
                   endPt.y - uy * as * cam.s - ux * 3.5 * cam.s);
        ctx.lineTo(endPt.x - ux * as * cam.s - uy * 3.5 * cam.s,
                   endPt.y - uy * as * cam.s + ux * 3.5 * cam.s);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();

    // Edge label at midpoint of Bézier curve
    if (isSemantic || relation === 'INHERITS') {
        const midPt = bezierPt(p0, cp, p2, 0.5);
        drawEdgeLabel(midPt.x, midPt.y, relation, hovered, dimmed);
    }
}

function drawEdgeLabel(mx, my, text, hovered, dimmed) {
    if (dimmed) return;
    const fontSize = Math.max(7, Math.round(8 * cam.s));
    ctx.save();
    ctx.font = `700 ${fontSize}px 'JetBrains Mono', monospace`;
    const tw = ctx.measureText(text).width;
    const ph = fontSize + 5, pw = tw + 10;
    const lx = mx - pw / 2, ly = my - ph / 2;

    ctx.globalAlpha = hovered ? 1 : 0.8;
    const vs = VERB_STYLE[text] || { bg: '#111', color: '#555' };
    ctx.fillStyle = hovered ? vs.bg : '#0d0d0f';
    if (ctx.roundRect) {
        ctx.beginPath(); ctx.roundRect(lx, ly, pw, ph, 3); ctx.fill();
    } else {
        ctx.fillRect(lx, ly, pw, ph);
    }

    ctx.fillStyle    = hovered ? vs.color : '#3a3a4a';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, mx, my);
    ctx.restore();
}

function drawNode(n, hi) {
    const { x: sx, y: sy } = toScreen(n._x, n._y);
    const sw = NW * cam.s, sh = NH * cam.s;
    const px = sx - sw / 2, py = sy - sh / 2;
    const p  = pal(n);

    const isPairHighlighted = highlightPairIds && highlightPairIds.has(n.id);
    const isDimmed = highlightPairIds && !isPairHighlighted;

    ctx.save();

    if (isDimmed) ctx.globalAlpha = 0.2;

    if (hi || isPairHighlighted) {
        ctx.shadowColor = isPairHighlighted ? p.stroke : p.stroke;
        ctx.shadowBlur  = isPairHighlighted ? 28 : 18;
    }

    rrect(px, py, sw, sh, NR * cam.s);
    ctx.fillStyle = p.fill;
    ctx.fill();

    if (p.dashed) ctx.setLineDash([4 * cam.s, 4 * cam.s]);
    ctx.strokeStyle = (hi || isPairHighlighted) ? '#fff' : p.stroke;
    ctx.lineWidth   = (hi || isPairHighlighted) ? 1.8 * cam.s : 1.1 * cam.s;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Left accent strip
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py + NR * cam.s * 0.5, 3 * cam.s, sh - NR * cam.s);
    ctx.clip();
    ctx.fillStyle = p.stroke;
    ctx.fillRect(px, py, 4 * cam.s, sh);
    ctx.restore();

    // Label
    ctx.fillStyle    = (hi || isPairHighlighted) ? '#fff' : p.text;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const fontSize = Math.round(10.5 * cam.s);
    ctx.font = `500 ${fontSize}px 'Inter', -apple-system, sans-serif`;

    const prefix = n.type && n.category === 'OBSERVATION' ? `[${n.type}] ` : '';
    const raw    = (prefix + n.label).replace(/^(PROJECT:|TOPIC:|GLOBAL)/i, '').trim();
    const lines  = wrapText(raw, sw - 24 * cam.s);
    const lh     = 14 * cam.s;
    const ty     = sy - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, i) => ctx.fillText(l, sx, ty + i * lh, sw - 20 * cam.s));

    ctx.restore();
}

function renderFrame() {
    const d = dpr();
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.clearRect(0, 0, cw(), ch());

    // Determine if any semantic edge is hovered — dim others
    const hasSemHover = hEdge && ['SUPERSEDES', 'CONFLICTS_WITH', 'RELATED_TO'].includes(hEdge.relation);

    // Draw edges
    visEdges.forEach(e => {
        const src = visNodes.find(n => n.id === e.source);
        const tgt = visNodes.find(n => n.id === e.target);
        if (!src || !tgt) return;

        const sp     = toScreen(src._x, src._y);
        const tp     = toScreen(tgt._x, tgt._y);
        const isHov  = e === hEdge;
        const dimmed = hasSemHover && !isHov;

        drawEdge(sp.x, sp.y, tp.x, tp.y, e, isHov, dimmed);
    });

    // Draw nodes with transition interpolation
    const now = performance.now();
    let stillAnimating = false;

    if (transitioning) {
        const progress = Math.min(1, (now - transStart) / TRANS_DURATION);
        const eased    = easeOutCubic(progress);

        visNodes.forEach(n => {
            if (n._prevX !== undefined) {
                n._x = lerp(n._prevX, n._targetX, eased);
                n._y = lerp(n._prevY, n._targetY, eased);
                n._opacity = lerp(n._prevOpacity ?? 0, 1, eased);
            } else {
                n._x = n._targetX;
                n._y = n._targetY;
                n._opacity = 1;
            }
        });

        if (progress < 1) stillAnimating = true;
        else {
            transitioning = false;
            visNodes.forEach(n => {
                n._x = n._targetX;
                n._y = n._targetY;
                n._opacity = 1;
                delete n._prevX; delete n._prevY; delete n._prevOpacity;
            });
        }
    }

    visNodes.forEach(n => {
        if (n._opacity !== undefined && n._opacity < 1) {
            ctx.save(); ctx.globalAlpha = n._opacity;
            drawNode(n, n === hNode);
            ctx.restore();
        } else {
            drawNode(n, n === hNode);
        }
    });

    ctx.restore();

    if (stillAnimating) schedRender();
}

// ── Layout ────────────────────────────────────────────────────────────────────

function layout(nodes) {
    const LAYERS  = ['GLOBAL_CONTEXT', 'PROJECT', 'TOPIC', 'OBSERVATION', 'SESSION'];
    const byLayer = new Map();

    nodes.forEach(n => {
        const li = LAYERS.indexOf(n.category);
        const l  = li < 0 ? 3 : li;
        if (!byLayer.has(l)) byLayer.set(l, []);
        byLayer.get(l).push(n);
    });

    const keys  = [...byLayer.keys()].sort();
    const V_GAP = 130;
    const total = keys.length;

    keys.forEach((layer, li) => {
        const row    = byLayer.get(layer);
        const count  = row.length;

        // Adaptive horizontal gap — denser when many nodes
        const H_GAP = count <= 4 ? 220 : count <= 8 ? 190 : count <= 14 ? 165 : 145;
        const MAX_PER_ROW = 10;

        if (count <= MAX_PER_ROW) {
            const totalW = (count - 1) * H_GAP;
            row.forEach((n, ni) => {
                n._targetX = -totalW / 2 + ni * H_GAP;
                n._targetY = (li - (total - 1) / 2) * V_GAP;
            });
        } else {
            // Wrap into sub-rows
            let subRow = 0;
            row.forEach((n, ni) => {
                const col   = ni % MAX_PER_ROW;
                subRow      = Math.floor(ni / MAX_PER_ROW);
                const rowCount = Math.min(MAX_PER_ROW, count - subRow * MAX_PER_ROW);
                const totalW   = (rowCount - 1) * H_GAP;
                n._targetX = -totalW / 2 + col * H_GAP;
                n._targetY = (li - (total - 1) / 2) * V_GAP + subRow * 80;
            });
        }
    });
}

function fitView(nodes) {
    if (!nodes.length) return;
    let mnX = Infinity, mxX = -Infinity, mnY = Infinity, mxY = -Infinity;
    nodes.forEach(n => {
        const x = n._targetX ?? n._x ?? 0;
        const y = n._targetY ?? n._y ?? 0;
        mnX = Math.min(mnX, x); mxX = Math.max(mxX, x);
        mnY = Math.min(mnY, y); mxY = Math.max(mxY, y);
    });
    const W_ = mxX - mnX + NW + 100, H_ = mxY - mnY + NH + 100;
    cam.s = Math.max(0.2, Math.min(cw() / W_, ch() / H_, 1.8));
    cam.x = (cw() - (mnX + mxX) * cam.s) / 2;
    cam.y = (ch() - (mnY + mxY) * cam.s) / 2;
    updateZoomLabel();
}

function showGraph(nodes, edges) {
    const prevPositions = new Map(visNodes.map(n => [n.id, { x: n._x, y: n._y }]));

    visNodes = nodes;
    visEdges = edges;
    layout(nodes);

    // Set up transition
    const now = performance.now();
    transStart    = now;
    transitioning = true;

    nodes.forEach(n => {
        const prev = prevPositions.get(n.id);
        if (prev && prev.x !== undefined) {
            n._prevX       = prev.x;
            n._prevY       = prev.y;
            n._prevOpacity = 1;
        } else {
            // New node — fade in from target position
            n._prevX       = n._targetX;
            n._prevY       = n._targetY + 20;
            n._prevOpacity = 0;
        }
        n._x = n._prevX;
        n._y = n._prevY;
        n._opacity = n._prevOpacity;
    });

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
        // Check near midpoint of Bézier
        const mx2 = (sp.x + tp.x) / 2, my2 = (sp.y + tp.y) / 2;
        if (Math.hypot(mx - mx2, my - my2) < 20) return e;
    }
    return null;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function showTooltip(cx, cy, target) {
    const p = pal(target);
    let html = '';
    if (target.category) {
        html = `<strong style="color:${p.stroke}">${target.label}</strong>`;
        if (target.type) html += `<br><span style="color:#58586a;font-size:10px">${target.type}${target.lifecycle ? ' · ' + target.lifecycle : ''}</span>`;
        if (target.content) {
            const preview = target.content.slice(0, 110).replace(/\n/g, ' ');
            html += `<br><br><span style="color:#444;font-size:11px">${preview}${target.content.length > 110 ? '…' : ''}</span>`;
        }
    } else {
        const vs = VERB_STYLE[target.relation] || { color: '#555' };
        html = `<span style="color:${vs.color};font-size:10px;font-weight:700">${target.relation}</span>` +
               `<br><span style="color:#555;font-size:11px">Click to see details</span>`;
    }
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');

    const tw = 280, th = 90;
    let left = cx + 16, top = cy + 16;
    if (left + tw > window.innerWidth)  left = cx - tw - 16;
    if (top  + th > window.innerHeight) top  = cy - th - 16;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
}

function hideTooltip() { tooltip.classList.remove('visible'); }

// ── Canvas events ─────────────────────────────────────────────────────────────

canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;
    const f    = e.deltaY < 0 ? 1.12 : 0.9;
    const wx   = (mx - cam.x) / cam.s;
    const wy   = (my - cam.y) / cam.s;
    cam.s = Math.max(0.12, Math.min(4, cam.s * f));
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
    cam.s = Math.max(0.12, cam.s * f);
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

// ── Drawer (floating overlay) ─────────────────────────────────────────────────

function openDrawer(node) {
    const p     = pal(node);
    const badge = document.getElementById('drawer-badge');
    badge.textContent = (node.type || node.category).toUpperCase();
    badge.style.cssText = `background:${p.fill};color:${p.text};border:1px solid ${p.stroke}40`;

    document.getElementById('drawer-eyebrow').textContent =
        node.category === 'OBSERVATION' ? 'Observation' :
        node.category === 'TOPIC'       ? 'Topic' :
        node.category === 'PROJECT'     ? 'Project' :
        node.category === 'SESSION'     ? 'Session' : 'Global Context';

    document.getElementById('drawer-title').textContent = node.label.replace(/^(PROJECT:|TOPIC:)\s*/i, '');

    const rels = [
        ...(IDX.fromE.get(node.id) || []).filter(e => ['SUPERSEDES', 'CONFLICTS_WITH', 'RELATED_TO'].includes(e.relation)),
        ...(IDX.toE.get(node.id)   || []).filter(e => ['SUPERSEDES', 'CONFLICTS_WITH', 'RELATED_TO'].includes(e.relation)),
    ];

    document.getElementById('drawer-content').innerHTML = `
        <div class="d-meta-grid" style="margin-bottom:20px">
            ${node.category === 'OBSERVATION' ? `
            <div class="d-meta-card">
                <div class="d-label">Type</div>
                <div class="d-value" style="color:${p.stroke}">${node.type || '—'}</div>
            </div>` : ''}
            ${node.metadata?.project ? `
            <div class="d-meta-card">
                <div class="d-label">Project</div>
                <div class="d-value">${node.metadata.project}</div>
            </div>` : ''}
            ${node.lifecycle ? `
            <div class="d-meta-card">
                <div class="d-label">Lifecycle</div>
                <div class="d-value" style="color:${node.lifecycle === 'active' ? '#4ade80' : '#444'}">${node.lifecycle}</div>
            </div>` : ''}
            ${node.topic_key ? `
            <div class="d-meta-card">
                <div class="d-label">Topic</div>
                <div class="d-value">${node.topic_key}</div>
            </div>` : ''}
            ${node.metadata?.created_at ? `
            <div class="d-meta-card" style="grid-column:1/-1">
                <div class="d-label">Created</div>
                <div class="d-value">${new Date(node.metadata.created_at).toLocaleString()}</div>
            </div>` : ''}
        </div>
        ${node.content ? `
        <div class="d-section">
            <div class="d-label">Content</div>
            <div class="d-content-box">${node.content}</div>
        </div>` : ''}
        ${rels.length ? `
        <div class="d-section">
            <div class="d-label">Relations (${rels.length})</div>
            ${rels.map(e => {
                const isOut = e.source === node.id;
                const other = IDX.byId.get(isOut ? e.target : e.source);
                const vs    = VERB_STYLE[e.relation] || { bg: '#1a1a1a', color: '#555' };
                const label = isOut ? e.relation : `← ${e.relation}`;
                return `<div class="d-rel-row" onclick="openModalById('${e.source}','${e.target}','${e.relation}')">
                    <span class="d-rel-verb" style="background:${vs.bg};color:${vs.color}">${label}</span>
                    <span class="d-rel-target">${other?.label?.replace(/^(PROJECT:|TOPIC:)\s*/i, '') || '—'}</span>
                    <span class="d-rel-arrow">›</span>
                </div>`;
            }).join('')}
        </div>` : ''}
    `;

    document.getElementById('drawer').classList.add('open');
}

function closeDrawer() {
    document.getElementById('drawer').classList.remove('open');
}

document.getElementById('drawer-close').addEventListener('click', closeDrawer);

// Close drawer on Escape
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeDrawer();
});

// ── Pair highlight ────────────────────────────────────────────────────────────

function highlightPair(idA, idB) {
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightPairIds = new Set([idA, idB]);
    schedRender();
    highlightTimer = setTimeout(() => {
        highlightPairIds = null;
        schedRender();
    }, 2200);
}

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
            <div class="modal-node" style="border-color:${ps.stroke}55">
                <div class="modal-node-name">${src?.label?.replace(/^(PROJECT:|TOPIC:)\s*/i, '') || edge.source}</div>
                <div class="modal-node-sub" style="color:${ps.stroke}">${src?.type || src?.category || ''}</div>
            </div>
            <span class="modal-verb" style="background:${vs.bg};color:${vs.color}">${edge.relation}</span>
            <div class="modal-node" style="border-color:${pt.stroke}55">
                <div class="modal-node-name">${tgt?.label?.replace(/^(PROJECT:|TOPIC:)\s*/i, '') || edge.target}</div>
                <div class="modal-node-sub" style="color:${pt.stroke}">${tgt?.type || tgt?.category || ''}</div>
            </div>
        </div>
        ${edge.reason ? `<div class="modal-detail"><div class="modal-detail-label">Reason</div><div class="modal-detail-value">${edge.reason}</div></div>` : ''}
        ${edge.metadata?.relation ? `<div class="modal-detail"><div class="modal-detail-label">Engram Verb</div><div class="modal-detail-value">${edge.metadata.relation}</div></div>` : ''}
        <div class="modal-detail"><div class="modal-detail-label">Source ID</div><div class="modal-detail-value"><code>${edge.source}</code></div></div>
        <div class="modal-detail"><div class="modal-detail-label">Target ID</div><div class="modal-detail-value"><code>${edge.target}</code></div></div>
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
        ['Memory', ...parts].map((p, i, a) =>
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
    setBC(proj.label.replace(/^PROJECT:\s*/i, ''));
    const topics = IDX.topics.filter(t => IDX.topicProject.get(t.id) === proj.id);
    const obs    = IDX.obs.filter(o => {
        const t = IDX.obsTopic.get(o.id);
        return t && IDX.topicProject.get(t) === proj.id;
    });
    const { nodes, edges } = subgraph([proj.id, ...topics.map(t => t.id), ...obs.map(o => o.id)]);
    showGraph(nodes, edges);
}

function viewTopic(topic, proj) {
    setBC(proj?.label?.replace(/^PROJECT:\s*/i, '') || 'Project', topic.label.replace(/^TOPIC:\s*/i, ''));
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
        chip.style.cssText = `background:${p.fill};color:${p.stroke};border-color:${p.stroke}50`;
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

// ── Semantic panel ────────────────────────────────────────────────────────────

function buildSemanticPanel() {
    if (!G || !IDX) return;

    const conflicts  = G.edges.filter(e => e.relation === 'CONFLICTS_WITH');
    const supersedes = G.edges.filter(e => e.relation === 'SUPERSEDES');
    const total      = conflicts.length + supersedes.length;

    const badge = document.getElementById('semantic-badge');
    if (total > 0) {
        badge.textContent = total;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    const list = document.getElementById('semantic-list');
    list.innerHTML = '';

    if (total === 0) {
        const el = document.createElement('div');
        el.className = 'sem-empty';
        el.textContent = 'No conflicts or supersedences found.';
        list.appendChild(el);
        return;
    }

    function makeGroup(label, cls, rows) {
        if (!rows.length) return;
        const lbl = document.createElement('div');
        lbl.className = `sem-group-label ${cls}`;
        lbl.textContent = `${label} (${rows.length})`;
        list.appendChild(lbl);

        rows.forEach(e => {
            const srcNode = IDX.byId.get(e.source);
            const tgtNode = IDX.byId.get(e.target);
            const srcLabel = (srcNode?.label || e.source).replace(/^(PROJECT:|TOPIC:)\s*/i, '');
            const tgtLabel = (tgtNode?.label || e.target).replace(/^(PROJECT:|TOPIC:)\s*/i, '');

            const row = document.createElement('div');
            row.className = `sem-row ${cls}-row`;

            const verbCls = cls === 'conflict' ? 'conflict-verb' : 'supersede-verb';
            const verbTxt = cls === 'conflict' ? '⊗' : '→';

            row.innerHTML = `
                <span class="sem-row-a" title="${srcLabel}">${srcLabel}</span>
                <span class="sem-verb ${verbCls}">${verbTxt}</span>
                <span class="sem-row-b" title="${tgtLabel}">${tgtLabel}</span>
            `;

            row.addEventListener('click', () => {
                // Navigate to source node and highlight the pair
                if (srcNode) {
                    const connected = new Set([srcNode.id]);
                    const rawEdges  = [...(IDX.fromE.get(srcNode.id) || []), ...(IDX.toE.get(srcNode.id) || [])];
                    rawEdges.forEach(ev => { connected.add(ev.source); connected.add(ev.target); });
                    const { nodes, edges } = subgraph([...connected]);
                    showGraph(nodes, edges);
                    openDrawer(srcNode);
                    if (tgtNode) setTimeout(() => highlightPair(srcNode.id, tgtNode.id), 350);
                }
            });

            list.appendChild(row);
        });
    }

    makeGroup('Conflicts', 'conflict', conflicts);
    makeGroup('Supersedes', 'supersede', supersedes);
}

// Toggle semantic panel
document.getElementById('semantic-header').addEventListener('click', () => {
    document.getElementById('semantic-panel').classList.toggle('collapsed');
});

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
    caret.className   = 't-caret' + (withCaret ? ' open' : '');
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
    lbl.textContent = label.replace(/^(PROJECT:|TOPIC:)\s*/i, '');
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

    // Global section
    const glLabel = document.createElement('div');
    glLabel.className = 't-section-label';
    glLabel.textContent = 'Global';
    tree.appendChild(glLabel);

    const gRow  = mkRow(0, 'Global Context', '#e11d48', null, () => { currentView = viewGlobal; viewGlobal(); }, true);
    tree.appendChild(gRow);
    const gKids = document.createElement('div');
    gKids.className = 't-kids open';

    IDX.globalObs.forEach(o => {
        const p = pal(o);
        gKids.appendChild(mkRow(1, o.label, p.stroke, o.type || 'other', () => viewObs(o), false));
    });

    tree.appendChild(gKids);
    collapsible(gRow, gKids);

    // Projects section
    if (IDX.projects.length) {
        const plLabel = document.createElement('div');
        plLabel.className = 't-section-label';
        plLabel.style.marginTop = '8px';
        plLabel.textContent = 'Projects';
        tree.appendChild(plLabel);
    }

    IDX.projects.forEach(proj => {
        const topics   = IDX.topics.filter(t => IDX.topicProject.get(t.id) === proj.id);
        const obsCount = IDX.obs.filter(o => {
            const t = IDX.obsTopic.get(o.id);
            return t && IDX.topicProject.get(t) === proj.id;
        }).length;

        const pRow = mkRow(0, proj.label, '#334155', null, () => viewProject(proj), true);
        const ct   = document.createElement('span');
        ct.className  = 't-badge';
        ct.textContent = obsCount;
        ct.style.cssText = 'background:#161b25;color:#475569';
        pRow.appendChild(ct);
        tree.appendChild(pRow);

        const pKids = document.createElement('div');
        pKids.className = 't-kids open';

        topics.forEach(topic => {
            const topicObs = IDX.obs.filter(o => IDX.obsTopic.get(o.id) === topic.id);
            const tRow     = mkRow(1, topic.label, '#475569', null, () => viewTopic(topic, proj), true);
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
    const conflicts  = G.edges.filter(e => e.relation === 'CONFLICTS_WITH').length;
    const supersedes = G.edges.filter(e => e.relation === 'SUPERSEDES').length;
    document.getElementById('stats').innerHTML = `
        <span style="color:#fb7185;font-weight:600">${slice.project}</span>
        <span style="color:#4ade80">● ${slice.activeCount} active</span>
        ${slice.staleCount ? `<span style="color:#2e2e38">● ${slice.staleCount} stale</span>` : ''}
        <span style="color:#58586a">◌ ${slice.globalRulesInherited} globals</span>
        ${conflicts  ? `<span style="color:#f43f5e">⊗ ${conflicts} conflicts</span>` : ''}
        ${supersedes ? `<span style="color:#fb923c">→ ${supersedes} supersedes</span>` : ''}
    `;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    resize();

    try {
        G = await fetch('/graph.json').then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
    } catch (err) {
        const el = document.getElementById('canvas-empty').querySelector('p');
        el.textContent = 'Could not load graph — run engram-semantic-graph first.';
        console.error(err);
        return;
    }

    IDX = buildIndex(G);
    new Set(IDX.obs.map(o => o.type || 'other')).forEach(t => activeFilter.add(t));

    buildFilters();
    buildTree();
    buildSemanticPanel();
    renderStats(G.slice);
    setBC();

    currentView = viewGlobal;
    viewGlobal();
}

init();
