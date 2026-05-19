/* =========================================================
   CIRO Dashboard — app.js
   Talks to the FastAPI backend at /api/ciro/*
   ========================================================= */

const API = '';  // same origin; if running separately set to 'http://localhost:8000'

let currentRunId = null;
let pollTimer = null;

// ── Helpers ──────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function setStatus(text, running = false) {
  $('statusText').textContent = text;
  $('statusDot').className = 'status-dot' + (running ? ' running' : '');
}

function fmt(val) {
  if (val === null || val === undefined) return '—';
  return String(val);
}

function crisisLabel(type) {
  const map = {
    urban_flooding: '🌊 Urban Flooding',
    heatwave: '🔥 Heatwave',
    accident: '🚗 Road Accident',
    road_blockage: '🚧 Road Blockage',
    infrastructure_failure: '⚡ Infrastructure Failure',
    unknown: '❓ Unknown',
  };
  return map[type] || type;
}

function actionTypeIcon(type) {
  const m = {
    traffic_reroute: '🗺️',
    emergency_dispatch: '🚑',
    alert: '📢',
    resource_allocation: '📦',
  };
  return m[type] || '⚡';
}

// ── Run pipeline ──────────────────────────────────────────
async function runPipeline() {
  const scenario = $('scenarioSelect').value;
  const customText = $('customSignal').value.trim();
  const customSignals = customText ? [customText] : [];

  $('runBtn').disabled = true;
  $('loadingBar').style.display = 'block';
  $('welcomePanel').style.display = 'none';
  $('resultsPanel').style.display = 'none';
  setStatus('Running pipeline…', true);

  try {
    const res = await fetch(`${API}/api/ciro/run/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, custom_signals: customSignals, social_count: 4 }),
    });
    const json = await res.json();

    if (json.status === 'success' && json.data) {
      renderResult(json.data);
      addRunToList(json.data);
      setStatus('Analysis complete', false);
    } else {
      setStatus('Error: ' + (json.message || 'Unknown error'), false);
    }
  } catch (err) {
    setStatus('Connection error — is the server running?', false);
    console.error(err);
  } finally {
    $('runBtn').disabled = false;
    $('loadingBar').style.display = 'none';
  }
}

// ── Render full result ────────────────────────────────────
function renderResult(data) {
  $('welcomePanel').style.display = 'none';
  $('resultsPanel').style.display = 'block';
  currentRunId = data.run_id;

  const crisis = data.detected_crisis;
  const sit = data.situation_report;
  const plan = data.action_plan;

  if (!crisis) {
    $('crisisType').textContent = 'None detected';
    $('crisisDesc').textContent = data.outcome_summary || 'No crisis found in signals.';
    return;
  }

  // ── Crisis card ──
  $('crisisType').textContent = crisisLabel(crisis.crisis_type);
  $('crisisLocation').textContent = crisis.location;
  $('crisisConfidence').textContent = crisis.confidence_label + ` (${Math.round(crisis.confidence * 100)}%)`;
  $('crisisSeverity').textContent = crisis.severity.charAt(0).toUpperCase() + crisis.severity.slice(1);
  $('crisisDesc').textContent = crisis.description;

  const badge = $('severityBadge');
  badge.textContent = crisis.severity.toUpperCase();
  badge.className = 'badge ' + crisis.severity;

  $('confBar').style.width = (crisis.confidence * 100) + '%';

  // ── Impact card ──
  if (sit) {
    $('impactSummary').textContent = sit.impact_summary;
    const ul = $('impactList');
    ul.innerHTML = '';
    (sit.impacts || []).forEach(imp => {
      const li = document.createElement('li');
      li.textContent = '⚠️ ' + imp;
      ul.appendChild(li);
    });
    $('peopleAffected').textContent = sit.people_affected_estimate || '—';
    $('timeSensitivity').textContent = (sit.time_sensitivity || '—').replace(/_/g, ' ');
    $('infraRisk').textContent = sit.infrastructure_risk || '—';
  }

  // ── Actions card ──
  if (plan) {
    $('coordNote').textContent = plan.coordination_note;
    const al = $('actionsList');
    al.innerHTML = '';
    (plan.actions || []).forEach((a, i) => {
      const div = document.createElement('div');
      div.className = 'action-item';
      div.innerHTML = `
        <div class="action-priority">${a.priority || i + 1}</div>
        <div class="action-body">
          <div class="action-title">${actionTypeIcon(a.action_type)} ${a.description}</div>
          <div class="action-meta">Assigned to: ${a.assigned_to} · ${a.target_area}</div>
        </div>
        <div class="action-impact">${a.estimated_impact}</div>`;
      al.appendChild(div);
    });
  }

  // ── Map Integration ──
  renderMap(data);

  // ── Simulation ──
  renderSimulation(data);

  // ── Outcome ──
  $('outcomeSummary').textContent = data.outcome_summary || '—';

  // ── Trace ──
  renderTrace(data.agent_traces || []);
}

function renderSimulation(data) {
  const before = data.before_snapshot || {};
  const after = data.after_snapshot || {};

  function stateHtml(snap, isBad) {
    const valClass = isBad ? 'state-val-bad' : 'state-val-good';
    const rows = [
      ['Congestion Index', snap.traffic_congestion_index != null ? snap.traffic_congestion_index.toFixed(1) + '/10' : '—'],
      ['Avg Speed', snap.avg_speed_kmh != null ? snap.avg_speed_kmh + ' km/h' : '—'],
      ['Emergency Units', snap.emergency_units_deployed ?? '0'],
      ['Alerts Sent', snap.alerts_sent != null ? Number(snap.alerts_sent).toLocaleString() : '0'],
      ['Status', snap.system_status || '—'],
    ];
    return rows.map(([k, v]) =>
      `<div class="state-row"><span>${k}</span><span class="${valClass}">${v}</span></div>`
    ).join('');
  }

  $('beforeState').innerHTML = stateHtml(before, true);
  $('afterState').innerHTML = stateHtml(after, false);

  const sr = $('simResults');
  sr.innerHTML = '';
  (data.simulation_results || []).forEach(r => {
    const div = document.createElement('div');
    div.className = 'sim-item';
    
    // Check if it has a ticket ID, meaning it's a dispatch
    if (r.ticket_id) {
      div.classList.add('ticket-card');
      const action = r.action || {};
      div.innerHTML = `
        <div class="ticket-header">
          <span class="sim-ticket">🎫 ${r.ticket_id}</span>
          <span class="ticket-status">${r.status.toUpperCase()}</span>
        </div>
        <div class="ticket-body">
          <div class="ticket-title">${action.description || 'Dispatch Action'}</div>
          <div class="ticket-meta">
            <span><strong>Assignee:</strong> ${action.assigned_to || 'Emergency Services'}</span>
            <span><strong>Target:</strong> ${action.target_area || 'Crisis Zone'}</span>
          </div>
          <div class="sim-outcome" style="margin-top:8px;">↳ ${r.outcome || '—'}</div>
        </div>`;
    } else {
      div.innerHTML = `
        <div class="sim-status"></div>
        <div class="sim-outcome">${r.outcome || '—'}</div>`;
    }
    sr.appendChild(div);
  });
}

let leafMap = null;
function renderMap(data) {
  const crisis = data.detected_crisis;
  const plan = data.action_plan;
  const mapCard = $('mapCard');
  
  if (!crisis || !window.L) {
    mapCard.style.display = 'none';
    return;
  }
  
  mapCard.style.display = 'block';
  
  // Extract coordinates (default to Karachi if missing)
  const lat = crisis.metadata?.lat || 24.8607;
  const lon = crisis.metadata?.lon || 67.0011;
  
  // Fake user location slightly offset for visualization
  const userLat = lat - 0.03;
  const userLon = lon - 0.01;

  if (!leafMap) {
    leafMap = L.map('webMap', { zoomControl: true }).setView([lat, lon], 12);
    // Vibrant map tiles (CartoDB Voyager)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO'
    }).addTo(leafMap);
  } else {
    // Clear previous layers (except base layer)
    leafMap.eachLayer((layer) => {
      if (!!layer.toGeoJSON) leafMap.removeLayer(layer);
    });
    leafMap.setView([lat, lon], 12);
  }

  // Sev colors
  const colors = { critical: '#ff3b5c', high: '#ff9800', medium: '#ffeb3b', low: '#00e5c0' };
  const sevColor = colors[crisis.severity.toLowerCase()] || '#ff3b5c';

  // Crisis Marker
  const crisisIcon = L.divIcon({
    className: 'custom-icon',
    html: \`<div style="background-color: \${sevColor}; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px \${sevColor};"></div>\`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
  L.marker([lat, lon], {icon: crisisIcon})
    .bindPopup(\`<b>\${crisis.crisis_type.replace(/_/g,' ')}</b><br/>\${crisis.location}\`)
    .addTo(leafMap);

  // User Marker
  const userIcon = L.divIcon({
    className: 'user-icon',
    html: \`<div style="background-color: #3b82f6; width: 18px; height: 18px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px #3b82f6;"></div>\`,
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
  L.marker([userLat, userLon], {icon: userIcon})
    .bindPopup("Simulated User Location")
    .addTo(leafMap);

  // Check for reroutes
  const hasReroute = plan && plan.actions && plan.actions.some(a => a.action_type === 'traffic_reroute');
  
  const directPath = [[userLat, userLon], [lat, lon]];
  L.polyline(directPath, {color: '#ff3b5c', dashArray: '5, 10', weight: 3, opacity: 0.6}).addTo(leafMap);

  if (hasReroute) {
    const midLat = (userLat + lat) / 2;
    const midLon = (userLon + lon) / 2;
    const detourPath = [
        [userLat, userLon],
        [midLat + 0.02, midLon - 0.02],
        [lat + 0.01, lon + 0.01]
    ];
    L.polyline(detourPath, {color: '#00e5c0', weight: 5, opacity: 0.9}).addTo(leafMap);
    L.polyline(detourPath, {color: '#ffffff', weight: 1, dashArray: '5, 5'}).addTo(leafMap);
  }

  // Force resize to fix grey tiles issue if the div was hidden initially
  setTimeout(() => leafMap.invalidateSize(), 300);
}

function renderTrace(traces) {
  const container = $('traceList');
  container.innerHTML = '';
  traces.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'trace-item';
    div.innerHTML = `
      <div class="trace-header" onclick="toggleTrace(this)">
        <div class="trace-step">${t.step || i + 1}</div>
        <div class="trace-agent">${t.agent_name}</div>
        <div class="trace-duration">${t.duration_ms}ms</div>
        <div class="trace-chevron">▶</div>
      </div>
      <div class="trace-body">
        <div class="trace-section">
          <div class="trace-section-label">Input</div>
          <div class="trace-section-val">${t.input_summary}</div>
        </div>
        <div class="trace-section">
          <div class="trace-section-label">Reasoning</div>
          <div class="trace-section-val">${t.reasoning || '—'}</div>
        </div>
        <div class="trace-section">
          <div class="trace-section-label">Output</div>
          <div class="trace-section-val">${t.output_summary}</div>
        </div>
        <div class="trace-section">
          <div class="trace-section-label">Tool Calls</div>
          <div class="trace-section-val">${JSON.stringify(t.tool_calls, null, 2)}</div>
        </div>
      </div>`;
    container.appendChild(div);
  });
}

function toggleTrace(header) {
  const item = header.closest('.trace-item');
  item.classList.toggle('open');
}

// ── Runs list ─────────────────────────────────────────────
function addRunToList(data) {
  const list = $('runsList');
  const empty = list.querySelector('.empty-state');
  if (empty) empty.remove();

  const crisis = data.detected_crisis;
  const div = document.createElement('div');
  div.className = 'run-item';
  div.onclick = () => renderResult(data);
  div.innerHTML = `
    <div class="run-id">${data.run_id}</div>
    <div class="run-meta">${crisis ? crisisLabel(crisis.crisis_type) : 'No crisis'} · ${new Date(data.started_at).toLocaleTimeString()}</div>`;
  list.prepend(div);
}

// ── Load existing runs on page load ──────────────────────
async function loadRuns() {
  try {
    const res = await fetch(`${API}/api/ciro/runs`);
    const json = await res.json();
    if (json.data && json.data.length > 0) {
      const list = $('runsList');
      list.innerHTML = '';
      json.data.forEach(r => {
        const div = document.createElement('div');
        div.className = 'run-item';
        div.onclick = () => loadRunDetail(r.run_id);
        div.innerHTML = `
          <div class="run-id">${r.run_id}</div>
          <div class="run-meta">${r.crisis_type ? crisisLabel(r.crisis_type) : 'No crisis'} · ${new Date(r.started_at).toLocaleTimeString()}</div>`;
        list.appendChild(div);
      });
    }
  } catch (_) { /* server not up yet */ }
}

async function loadRunDetail(runId) {
  try {
    const res = await fetch(`${API}/api/ciro/runs/${runId}`);
    const json = await res.json();
    if (json.data) renderResult(json.data);
  } catch (err) { console.error(err); }
}

// Init
loadRuns();
