// Propósito AML v2.7 — app.js (external, CSP-safe, anonymous device ID)
var lastResult = null;
var selectedPackage = 'starter';
var currentPayment = null;
var paymentCheckInterval = null;

// Device ID (anonymous, stored in localStorage)
var deviceId = '';
try {
  deviceId = localStorage.getItem('aml_device_id') || '';
  if (!deviceId) { deviceId = 'dev-' + Date.now() + '-' + Math.random().toString(36).substr(2,9); localStorage.setItem('aml_device_id', deviceId); }
} catch(e) { deviceId = 'anon-' + Date.now(); }

function apiHeaders() { return { 'Content-Type': 'application/json', 'X-Device-ID': deviceId }; }

// Credits (localStorage + server sync)
function getCredits() { try { var c = parseInt(localStorage.getItem('aml_credits') || '1'); return isNaN(c) ? 1 : c; } catch(e) { return 1; } }
function setCredits(n) { try { localStorage.setItem('aml_credits', String(n)); } catch(e) {} updateCreditDisplay(); }
function useCredit() { var c = getCredits(); if (c <= 0) return false; setCredits(c - 1); fetch('/api/credits', { method: 'POST', headers: apiHeaders(), body: JSON.stringify({ action: 'use' }) }).catch(function(){}); return true; }
function updateCreditDisplay() { var c = getCredits(), el = document.getElementById('creditCount'); if (el) { el.textContent = c; el.style.color = c > 0 ? 'var(--accent)' : 'var(--red)'; el.style.background = c > 0 ? 'var(--accent-dim)' : 'rgba(248,113,113,.12)'; } }
updateCreditDisplay();

// Sync credits from server on load
setTimeout(function() {
  fetch('/api/credits', { headers: apiHeaders() }).then(function(r) { return r.json(); }).then(function(d) {
    if (d.credits !== undefined && d.credits >= 0) setCredits(d.credits);
  }).catch(function(){});
  loadHistory();
}, 200);

async function runScreening() {
  if (getCredits() <= 0) { openPaymentModal(); return; }
  var chain = document.getElementById('chain').value;
  var address = document.getElementById('address').value.trim();
  var btn = document.getElementById('btnScreen');
  var status = document.getElementById('statusBar');
  var statusText = document.getElementById('statusText');
  var report = document.getElementById('reportSection');
  if (!address) { alert('Informe o endereço da carteira.'); return; }

  useCredit();
  btn.disabled = true;
  report.classList.remove('show');
  document.getElementById('blockchainInfo').style.display = 'none';
  status.classList.add('show');
  statusText.textContent = 'Consultando OFAC, Explorer, Heurísticas, DeFi Analysis...';

  try {
    var res = await fetch('/api/screen?chain=' + encodeURIComponent(chain) + '&address=' + encodeURIComponent(address));
    var text = await res.text();
    var data;
    try { data = JSON.parse(text); } catch(e) { statusText.textContent = 'Erro: resposta invalida (HTTP ' + res.status + ')'; btn.disabled = false; setCredits(getCredits()+1); return; }
    if (data.error) { statusText.textContent = 'Erro: ' + data.error + (data.detail ? ' — '+data.detail : ''); btn.disabled = false; setCredits(getCredits()+1); return; }
    lastResult = data;
    renderReport(data);
    status.classList.remove('show');
    report.classList.add('show');
    saveReportToServer(data).then(function() { loadHistory(); });
  } catch (err) {
    statusText.textContent = 'Erro: ' + err.message;
    setCredits(getCredits()+1);
  }
  btn.disabled = false;
}

function renderReport(data) {
  const r = data.report;
  const c = data.compliance || {};
  const d = r.decision;
  const icons = { LOW:'✅', MEDIUM:'⚠️', HIGH:'🔴', CRITICAL:'🚫' };
  const recLabels = { APPROVE:'Aprovar', REVIEW:'Revisão Manual (EDD)', BLOCK:'Bloquear Operação' };

  // Header
  document.getElementById('reportHeader').innerHTML = `
    <div>
      <div class="risk-badge risk-${d.level}">${icons[d.level]||'❓'} RISCO ${d.level}</div>
      <p style="margin-top:10px;font-size:13px;color:var(--text-muted)">${d.summary}</p>
    </div>
    <div style="text-align:right">
      <span class="rec rec-${d.recommendation}">${recLabels[d.recommendation]||d.recommendation}</span>
      <div style="margin-top:6px;font-size:12px;color:var(--text-muted)">Score: ${d.score}/100</div>
    </div>`;

  const sa = r.input.address;
  const shortAddr = sa.length>20 ? sa.substring(0,10)+'...'+sa.substring(sa.length-8) : sa;
  document.getElementById('metaRow').innerHTML = `
    <span>ID: <span class="mono">${r.id}</span></span>
    <span>Rede: <span class="mono">${r.input.chain.toUpperCase()}</span></span>
    <span>Endereço: <span class="mono" title="${sa}">${shortAddr}</span></span>
    <span>Data: ${new Date(r.timestamp).toLocaleString('pt-BR')}</span>`;

  // Findings
  const fl = document.getElementById('findingsList');
  fl.innerHTML = r.findings.length === 0
    ? '<div class="no-findings">✅ Nenhum indicador de risco detectado.</div>'
    : r.findings.map(f=>`<div class="finding sev-${f.severity}"><span class="sev-tag t-${f.severity}">${f.severity}</span><div><strong>${f.source}</strong><br/><span style="color:var(--text-muted)">${f.detail}</span></div></div>`).join('');

  // DeFi
  const defi = r.defiAnalysis;
  if (defi) {
    const mx = defi.mixerInteractions?.length||0, bx = defi.bridgeInteractions?.length||0, dx = defi.dexInteractions?.length||0, hp = defi.opaqueHops||0;
    let html = `<div class="defi-grid">
      <div class="defi-card"><div class="num" style="color:${mx>0?'var(--critical)':'var(--green)'}">${mx}</div><div class="lbl">Mixers</div></div>
      <div class="defi-card"><div class="num" style="color:${bx>0?'var(--yellow)':'var(--green)'}">${bx}</div><div class="lbl">Bridges</div></div>
      <div class="defi-card"><div class="num">${dx}</div><div class="lbl">DEX Swaps</div></div>
      <div class="defi-card"><div class="num" style="color:${hp>=3?'var(--red)':'var(--text)'}">${hp}</div><div class="lbl">Saltos Opacos</div></div>
    </div>`;
    if (defi.summary?.patternDescription) html += `<div class="pattern-alert">⚠️ ${defi.summary.patternDescription}</div>`;
    if (mx>0) { html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px"><strong>Mixers detectados:</strong></div>';
      defi.mixerInteractions.forEach(m=>{ html += `<div class="kyc-action" style="border-left-color:var(--critical)"><strong>${m.name}</strong> — ${m.direction} — <span class="mono">${(m.hash||'').substring(0,16)}...</span></div>`; }); }
    if (bx>0) { html += '<div style="font-size:12px;color:var(--text-muted);margin:8px 0"><strong>Bridges detectadas:</strong></div>';
      defi.bridgeInteractions.forEach(b=>{ html += `<div class="kyc-action" style="border-left-color:var(--yellow)"><strong>${b.name}</strong> — ${b.direction}</div>`; }); }
    document.getElementById('defiContent').innerHTML = html;
    document.getElementById('defiSection').style.display = '';
  }

  // Flash Token Detection
  const flash = r.flashAnalysis;
  if (flash?.checked) {
    let fhtml = '';
    if (flash.flashTokensDetected) {
      fhtml += '<div class="flash-alert flash-danger">⚠️ <strong>FLASH TOKEN DETECTADO!</strong> Esta carteira contém token(s) que NÃO são do contrato oficial. Estes tokens são falsos — não têm valor e não podem ser transferidos ou vendidos. <strong>NÃO aceitar como pagamento.</strong></div>';
    } else if (flash.officialTokensFound?.length > 0 && flash.suspiciousTokens?.length === 0) {
      fhtml += '<div class="flash-alert flash-safe">✅ Todos os tokens verificados são de contratos oficiais. Nenhum flash token detectado.</div>';
    } else if (flash.suspiciousTokens?.length > 0) {
      fhtml += '<div class="flash-alert flash-warn">⚠️ ' + flash.summary + '</div>';
    } else {
      fhtml += '<div class="flash-alert flash-safe">✅ ' + (flash.summary || 'Verificação concluída.') + '</div>';
    }

    // Checks detalhados
    if (flash.checks?.length) {
      fhtml += '<div style="margin:12px 0 8px"><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:8px">Verificações Realizadas</div>';
      flash.checks.forEach(c => {
        const icon = c.status==='pass' ? '✅' : c.status==='fail' ? '❌' : '⚠️';
        const color = c.status==='pass' ? 'var(--green)' : c.status==='fail' ? 'var(--red)' : 'var(--yellow)';
        fhtml += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px"><span>' + icon + '</span><span style="flex:1">' + c.name + '</span><span style="color:' + color + ';font-size:11px;font-weight:600">' + c.detail + '</span></div>';
      });
      fhtml += '</div>';
    }

    // Verificação do contrato (holders, VIP)
    if (flash.contractVerification) {
      const cv = flash.contractVerification;
      fhtml += '<div style="margin:8px 0;padding:10px 14px;background:var(--surface-2);border-radius:8px;font-size:11px"><span style="color:var(--text-muted)">Contrato USDT oficial: </span>';
      fhtml += '<span style="color:var(--green);font-weight:700">' + (cv.isVip ? '✓ Verificado' : 'Não verificado') + '</span>';
      if (cv.holders) fhtml += ' <span style="color:var(--text-muted)">| ' + cv.holders.toLocaleString() + ' holders globais</span>';
      fhtml += '</div>';
    }

    // Official tokens
    if (flash.officialTokensFound?.length) {
      fhtml += '<div style="font-size:11px;color:var(--text-muted);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Tokens Oficiais Verificados</div>';
      flash.officialTokensFound.forEach(t => {
        fhtml += '<div class="flash-token-item"><span class="flash-status status-ok">✓ OFICIAL</span><span style="font-weight:700;color:var(--green)">' + t.symbol + '</span><span style="font-family:monospace;font-size:11px;color:var(--text-muted)">' + (t.balance||'') + '</span><span style="font-size:10px;color:var(--text-muted)">' + t.issuer + '</span></div>';
      });
    }

    // Suspicious tokens
    if (flash.suspiciousTokens?.length) {
      fhtml += '<div style="font-size:11px;color:var(--red);margin:12px 0 6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Tokens Suspeitos / Flash</div>';
      flash.suspiciousTokens.forEach(t => {
        const statusClass = t.status.includes('FLASH') ? 'status-fake' : 'status-warn';
        const statusIcon = t.status.includes('FLASH') ? '✗ FALSO' : '? VERIFICAR';
        let extra = t.reason||t.status;
        if (t.holders !== null && t.holders !== undefined) extra += ' | ' + t.holders + ' holders';
        fhtml += '<div class="flash-token-item"><span class="flash-status ' + statusClass + '">' + statusIcon + '</span><span style="font-weight:700;color:var(--red)">' + t.symbol + '</span><span style="font-size:11px;color:var(--text-muted)">' + extra + '</span></div>';
      });
    }

    document.getElementById('flashContent').innerHTML = fhtml;
    document.getElementById('flashSection').style.display = '';
  } else {
    document.getElementById('flashSection').style.display = 'none';
  }

  // KYC
  if (c.kyc) {
    let html = `<div style="margin-bottom:12px;font-size:13px"><strong>Status:</strong> <span style="color:var(--red)">${c.kyc.status}</span><br/><strong>Nível:</strong> ${c.kyc.requirement}</div>`;
    if (c.kyc.actions?.length) { html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px"><strong>Ações obrigatórias:</strong></div>';
      c.kyc.actions.forEach((a,i)=>{ html += `<div class="kyc-action"><strong>${i+1}.</strong> ${a}</div>`; }); }
    if (c.kyc.documentsRequired?.length) { html += '<div style="font-size:12px;color:var(--text-muted);margin:12px 0 8px"><strong>Documentos exigidos:</strong></div><div class="doc-list" style="background:var(--surface-2);border-radius:8px;overflow:hidden">';
      c.kyc.documentsRequired.forEach(d=>{ html += `<div class="doc-item"><span>${d.name}</span><span class="${d.required?'required-tag':'optional-tag'}">${d.required?'OBRIGATÓRIO':'Recomendado'}</span></div>`; });
      html += '</div>'; }
    document.getElementById('kycContent').innerHTML = html;
    document.getElementById('kycSection').style.display = '';
  }

  // AML/KYT
  if (c.amlKyt) {
    const a = c.amlKyt;
    const sColors = { ACTIVE:'var(--green)', PARTIAL:'var(--yellow)', INSUFFICIENT:'var(--red)' };
    let html = `<div style="font-size:13px;margin-bottom:12px"><strong>Status:</strong> <span style="color:${sColors[a.status]||'var(--text)'}">${a.status}</span> — Cobertura: <strong>${a.coveragePercent}%</strong><br/>${a.recommendation}</div>`;
    if (a.activeProviders?.length) { html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px"><strong>Fontes ativas:</strong></div>';
      a.activeProviders.forEach(p=>{ html += `<div style="font-size:12px;padding:4px 0"><span style="color:var(--green)">●</span> ${p}</div>`; }); }
    if (a.inactiveProviders?.length) { html += '<div style="font-size:12px;color:var(--text-muted);margin:8px 0 6px"><strong>Não configuradas:</strong></div>';
      a.inactiveProviders.forEach(p=>{ html += `<div style="font-size:12px;padding:4px 0;color:var(--text-muted)">○ ${p}</div>`; }); }
    document.getElementById('amlContent').innerHTML = html;
    document.getElementById('amlSection').style.display = '';
  }

  // Regulatory
  if (c.regulatoryCooperation) {
    const reg = c.regulatoryCooperation;
    const sMap = { SAR_REQUIRED:['COMUNICAÇÃO AO COAF OBRIGATÓRIA','var(--critical)'], ENHANCED_MONITORING:['Monitoramento Reforçado','var(--yellow)'], STANDARD:['Procedimento Padrão','var(--green)'] };
    const [sLabel,sColor] = sMap[reg.status]||[reg.status,'var(--text)'];
    let html = `<div style="font-size:14px;font-weight:700;color:${sColor};margin-bottom:12px">${sLabel}</div>`;
    if (reg.obligations?.length) {
      html += '<table class="reg-table"><thead><tr><th>Regulação</th><th>Ação</th><th>Prazo</th><th>Prioridade</th></tr></thead><tbody>';
      reg.obligations.forEach(o=>{ html += `<tr><td>${o.regulation}</td><td>${o.action}</td><td>${o.deadline}</td><td><span class="priority-tag pri-${o.priority}">${o.priority}</span></td></tr>`; });
      html += '</tbody></table>'; }
    if (reg.jurisdictions?.length) html += `<div style="font-size:11px;color:var(--text-muted);margin-top:8px"><strong>Jurisdições:</strong> ${reg.jurisdictions.join(', ')}</div>`;
    document.getElementById('regContent').innerHTML = html;
    document.getElementById('regSection').style.display = '';
  }

  // On-chain
  const exp = r.sources.explorer;
  const grid = document.getElementById('onchainGrid');
  if (exp?.enabled && exp?.data) {
    const d = exp.data;
    grid.innerHTML = [
      cell('Saldo',d.balance||'N/A'), cell('Transações',d.txCount??'N/A'),
      cell('Token Txs',d.tokenTxCount??'N/A'), cell('Stablecoin Txs',d.stablecoinTxCount??'N/A'),
      cell('Primeira Tx',d.firstTransaction?new Date(d.firstTransaction).toLocaleDateString('pt-BR'):'N/A'),
      cell('Última Tx',d.lastTransaction?new Date(d.lastTransaction).toLocaleDateString('pt-BR'):'N/A'),
      cell('Counterparties',d.uniqueCounterparties??'N/A'), cell('Contrato Int.',d.contractInteractions??'N/A')
    ].join('');
    document.getElementById('onchainSection').style.display = '';

    // Token balances
    const tb = document.getElementById('tokenBalances');
    if (d.tokenBalances?.length) {
      tb.innerHTML = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600">Saldo de Tokens</div>' +
        d.tokenBalances.map(t=>`<span class="token-badge"><span class="sym">${t.symbol}</span><span class="bal">${t.balance||''}</span></span>`).join('');
    } else { tb.innerHTML = ''; }

    // Recent transactions
    if (d.recentTransactions?.length) {
      let txHtml = '';
      d.recentTransactions.slice(0,15).forEach(tx=>{
        const addr = tx.direction==='OUT' ? tx.to : tx.from;
        const shortAddr = addr ? (addr.length>20 ? addr.substring(0,8)+'...'+addr.substring(addr.length-6) : addr) : 'N/A';
        const dateStr = tx.date ? new Date(tx.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        txHtml += `<div class="tx-row"><span class="tx-dir dir-${tx.direction}">${tx.direction}</span><span class="tx-addr" title="${addr||''}">${shortAddr}</span><span class="tx-val">${tx.value||''}</span><span class="tx-date">${dateStr}</span></div>`;
      });
      document.getElementById('txList').innerHTML = txHtml;
      document.getElementById('txSection').style.display = '';
    } else { document.getElementById('txSection').style.display = 'none'; }

    // Top counterparties
    if (d.topCounterparties?.length) {
      let cpHtml = '';
      d.topCounterparties.slice(0,10).forEach(cp=>{
        const shortAddr = cp.address.length>20 ? cp.address.substring(0,8)+'...'+cp.address.substring(cp.address.length-6) : cp.address;
        const lastDate = cp.lastSeen ? new Date(cp.lastSeen).toLocaleDateString('pt-BR') : '';
        cpHtml += `<div class="cp-row"><span class="cp-count">${cp.txCount}x</span><span class="tx-addr" title="${cp.address}">${shortAddr}</span><span class="tx-date">${lastDate}</span></div>`;
      });
      document.getElementById('cpList').innerHTML = cpHtml;
      document.getElementById('cpSection').style.display = '';
    } else { document.getElementById('cpSection').style.display = 'none'; }

  } else {
    document.getElementById('onchainSection').style.display = 'none';
    document.getElementById('txSection').style.display = 'none';
    document.getElementById('cpSection').style.display = 'none';
  }

  // Transparency
  if (c.proofOfReserves) {
    const p = c.proofOfReserves;
    const tColors = { TRANSPARENT:'var(--green)', PARTIALLY_OPAQUE:'var(--yellow)', OPAQUE:'var(--red)', UNTRACEABLE:'var(--critical)' };
    const tLabels = { TRANSPARENT:'Transparente', PARTIALLY_OPAQUE:'Parcialmente Opaco', OPAQUE:'Opaco', UNTRACEABLE:'Irrastreável' };
    let html = `<div style="font-size:13px;margin-bottom:8px"><strong>Score:</strong> <span style="color:${tColors[p.status]};font-size:18px;font-weight:700">${p.score}/100</span> — <span style="color:${tColors[p.status]}">${tLabels[p.status]||p.status}</span></div>`;
    html += `<div class="transparency-bar"><div class="transparency-fill" style="width:${p.score}%;background:${tColors[p.status]}"></div></div>`;
    html += `<div style="font-size:12px;margin:8px 0"><strong>Rastreabilidade:</strong> ${p.fundTraceability}</div>`;
    if (p.factors?.length) { html += '<div style="font-size:12px;color:var(--text-muted);margin:8px 0"><strong>Fatores:</strong></div>';
      p.factors.forEach(f=>{ const c2 = f.impact<-20?'var(--red)':f.impact<0?'var(--yellow)':'var(--green)';
        html += `<div style="font-size:12px;padding:4px 0">● <strong>${f.factor}</strong> (<span style="color:${c2}">${f.impact>0?'+':''}${f.impact}</span>): ${f.detail}</div>`; }); }
    if (p.recommendation) html += `<div style="font-size:12px;margin-top:8px;padding:10px;background:var(--surface-2);border-radius:8px"><strong>Recomendação:</strong> ${p.recommendation}</div>`;
    document.getElementById('transContent').innerHTML = html;
    document.getElementById('transSection').style.display = '';
  }

  // Audit Trail
  if (c.auditTrail) {
    const at = c.auditTrail;
    let html = '';
    if (at.entries?.length) { at.entries.forEach(e=>{ html += `<div class="audit-entry"><span class="audit-action">${e.action}</span><span style="flex:1;color:var(--text-muted)">${e.detail}</span><span style="color:var(--text-muted);font-size:10px">${e.actor}</span></div>`; }); }
    if (at.reportHash) html += `<div style="font-size:11px;color:var(--text-muted);margin-top:8px"><strong>Hash:</strong> <span class="mono">${at.reportHash}</span> | <strong>Retenção:</strong> ${at.retentionPolicy||'5 anos'}</div>`;
    document.getElementById('auditContent').innerHTML = html;
    document.getElementById('auditSection').style.display = '';
  }

  // Sources
  const sg = document.getElementById('sourcesGrid');
  const src = r.sources;
  sg.innerHTML = [
    sourcePill('OFAC/SDN',src.ofac), sourcePill('Explorer',src.explorer),
    sourcePill('Heurísticas',src.heuristics), sourcePill('DeFi Analysis',src.defiAnalysis),
    sourcePill('Flash USDT',src.flashDetection),
    sourcePill('Chainabuse',src.chainabuse), sourcePill('Blocksec',src.blocksec)
  ].join('');

  document.getElementById('disclaimer').textContent = r.disclaimer;
  document.getElementById('jsonViewer').textContent = JSON.stringify(data, null, 2);
  document.getElementById('jsonViewer').classList.remove('show');
}

function cell(label,value) { return `<div class="data-cell"><div class="lbl">${label}</div><div class="val">${value}</div></div>`; }
function sourcePill(name,src) {
  if (!src) return `<div class="source-pill"><span class="indicator inactive"></span>${name} — N/A</div>`;
  const s = src.error?'error':src.enabled!==false?'active':'inactive';
  const l = src.error?'Erro':src.enabled!==false?'Ativo':'Não config.';
  return `<div class="source-pill"><span class="indicator ${s}"></span>${name} — ${l}</div>`;
}

async function downloadPDF() {
  if (!lastResult) return;
  var btn = document.getElementById('btnPDF'); btn.disabled = true; btn.textContent = 'Gerando PDF...';
  try {
    const res = await fetch('/api/report/pdf', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(lastResult) });
    if (!res.ok) { const t = await res.text(); throw new Error(`HTTP ${res.status}: ${t.substring(0,100)}`); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `relatorio-aml-${lastResult.report.id}.pdf`;
    a.click(); URL.revokeObjectURL(url);
  } catch (err) { alert('Erro ao gerar PDF: '+err.message); }
  btn.disabled = false; btn.textContent = 'Baixar Relatório PDF';
}

function toggleJSON() { document.getElementById('jsonViewer').classList.toggle('show'); }
function exportJSON() {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `aml-report-${lastResult.report.id}.json`; a.click();
}


// --- HISTORY (anonymous via device ID) ---
async function loadHistory() {
  try {
    var res = await fetch('/api/reports', { headers: apiHeaders() });
    var data = await res.json();
    var panel = document.getElementById('historyPanel');
    var list = document.getElementById('historyList');
    if (!panel || !list) return;
    if (!data.reports || !data.reports.length) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    document.getElementById('histCount').textContent = '(' + data.reports.length + ')';
    list.innerHTML = data.reports.map(function(r) {
      var addr = r.address || '';
      var short = addr.length > 20 ? addr.substring(0,8) + '...' + addr.substring(addr.length-6) : addr;
      var dt = r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '';
      return '<div class="hist-item" data-action="loadReport" data-rid="' + (r.report_id||'') + '">' +
        '<span class="hist-risk ' + (r.risk_level||'') + '">' + (r.risk_level||'?') + '</span>' +
        '<span class="hist-addr">' + short + '</span>' +
        '<span class="hist-chain">' + (r.chain||'') + '</span>' +
        (r.blockchain_cert ? '<span class="hist-bc">&#9939;</span>' : '') +
        '<span class="hist-date">' + dt + '</span></div>';
    }).join('');
  } catch(e) {}
}

async function loadReport(reportId) {
  try {
    var res = await fetch('/api/reports?id=' + encodeURIComponent(reportId), { headers: apiHeaders() });
    var data = await res.json();
    if (data.report && data.report.data_json) {
      lastResult = typeof data.report.data_json === 'string' ? JSON.parse(data.report.data_json) : data.report.data_json;
      renderReport(lastResult);
      document.getElementById('reportSection').classList.add('show');
      document.getElementById('reportSection').scrollIntoView({ behavior: 'smooth' });
    }
  } catch(e) {}
}

async function saveReportToServer(resultData) {
  try {
    await fetch('/api/reports', { method: 'POST', headers: apiHeaders(), body: JSON.stringify(resultData) });
  } catch(e) {}
}

// --- PAYMENT ---
function selectPackage(pkgId, el) {
  selectedPackage = pkgId;
  document.querySelectorAll('.pkg-card').forEach(function(c) { c.classList.remove('selected'); });
  if (el) el.classList.add('selected');
}
function openPaymentModal() {
  document.getElementById('paymentModal').classList.add('show');
  var content = document.getElementById('paymentContent');
  content.innerHTML =
    '<div class="pkg-grid">' +
    '<div class="pkg-card' + (selectedPackage==='starter' ? ' selected' : '') + '" data-pkg="starter"><div class="pkg-price">1 USDT</div><div class="pkg-credits">15 consultas</div><div class="pkg-label">~R$ 0,40/relatório</div></div>' +
    '<div class="pkg-card' + (selectedPackage==='pro' ? ' selected' : '') + '" data-pkg="pro"><div class="pkg-price">10 USDT</div><div class="pkg-credits">200 consultas</div><div class="pkg-label">~R$ 0,30/relatório</div></div></div>' +
    '<div style="text-align:center"><button class="btn btn-primary" data-action="generatePayment" style="padding:12px 28px;font-size:14px">Gerar Código de Pagamento</button></div>';
}
function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('show');
  if (paymentCheckInterval) { clearInterval(paymentCheckInterval); paymentCheckInterval = null; }
}
async function generatePayment() {
  var content = document.getElementById('paymentContent');
  content.innerHTML = '<div style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto"></div><p style="margin-top:12px;font-size:12px;color:var(--text-muted)">Gerando código...</p></div>';
  try {
    var session = localStorage.getItem('aml_session') || Date.now().toString();
    localStorage.setItem('aml_session', session);
    var res = await fetch('/api/payment/verify?session=' + encodeURIComponent(session) + '&package=' + selectedPackage);
    var data = await res.json();
    if (!data.success) throw new Error(data.error || 'Erro');
    currentPayment = data.payment;
    content.innerHTML =
      '<div class="pay-amount">' + currentPayment.amount + ' USDT</div>' +
      '<p style="text-align:center;font-size:12px;color:var(--text-muted);margin-bottom:16px">Envie <strong>exatamente</strong> este valor · <strong>' + currentPayment.package.credits + ' consultas</strong></p>' +
      '<div class="wallet-box" data-action="copyWallet" data-wallet="' + currentPayment.wallet + '">' + currentPayment.wallet + '<br><span style="font-size:10px;color:var(--text-muted)">Clique para copiar</span></div>' +
      '<div class="pay-step"><div class="pay-step-num">1</div><div class="pay-step-text"><strong>Copie o endereço</strong> e valor</div></div>' +
      '<div class="pay-step"><div class="pay-step-num">2</div><div class="pay-step-text"><strong>Envie USDT TRC-20</strong></div></div>' +
      '<div class="pay-step"><div class="pay-step-num">3</div><div class="pay-step-text"><strong>Aguarde ~30s</strong> — verificação automática</div></div>' +
      '<div id="payStatus" class="pay-status checking">Aguardando pagamento... Verificando a cada 30s</div>' +
      '<button class="btn btn-primary" data-action="checkPayment" style="width:100%;margin-top:8px">Verificar Agora</button>';
    paymentCheckInterval = setInterval(checkPaymentNow, 30000);
  } catch(err) { content.innerHTML = '<div class="pay-status error">Erro: ' + err.message + '</div>'; }
}
async function checkPaymentNow() {
  if (!currentPayment) return;
  var statusEl = document.getElementById('payStatus');
  if (statusEl) { statusEl.className = 'pay-status checking'; statusEl.textContent = 'Verificando no TronScan...'; }
  try {
    var h = apiHeaders();
    var res = await fetch('/api/payment/verify', { method: 'POST', headers: h, body: JSON.stringify({ amount: currentPayment.amount }) });
    var data = await res.json();
    if (data.verified) {
      if (paymentCheckInterval) { clearInterval(paymentCheckInterval); paymentCheckInterval = null; }
      var granted = data.creditsGranted || currentPayment.package.credits || 15;
      setCredits(getCredits() + granted);
      if (statusEl) { statusEl.className = 'pay-status success'; statusEl.innerHTML = 'Pagamento confirmado! +' + granted + ' consultas adicionadas.'; }
      setTimeout(closePaymentModal, 3000);
    } else {
      if (statusEl) { statusEl.className = 'pay-status checking'; statusEl.textContent = 'Pagamento não encontrado. Verificando em 30s...'; }
    }
  } catch(err) { if (statusEl) { statusEl.className = 'pay-status error'; statusEl.textContent = 'Erro: ' + err.message; } }
}

// --- BLOCKCHAIN (IBEDIS Token) ---
async function registerBlockchain() {
  if (!lastResult) return;
  var btn = document.getElementById('btnBlockchain'); btn.disabled = true; btn.textContent = 'Registrando...';
  var infoEl = document.getElementById('blockchainInfo');
  infoEl.style.display = 'block';
  infoEl.innerHTML = '<div style="text-align:center;padding:12px"><div class="spinner" style="display:inline-block"></div> Registrando na blockchain via IBEDIS Token...</div>';
  try {
    var res = await fetch('/api/blockchain/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lastResult) });
    var data = await res.json();
    if (data.success && data.blockchain) {
      var bc = data.blockchain;
      var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="color:var(--green);font-weight:700;font-size:13px">✅ Registrado na Blockchain</span>' +
        (bc.certificado ? '<span style="background:rgba(52,211,153,.1);color:var(--green);padding:3px 10px;border-radius:6px;font-family:monospace;font-size:10px;font-weight:600">' + bc.certificado + '</span>' : '') + '</div>' +
        '<div style="color:var(--text-muted);font-size:11px;line-height:2"><strong>Hash SHA-256:</strong> <span style="font-family:monospace;font-size:10px">' + (bc.hash || '') + '</span><br>';
      if (bc.verificacao_url) html += '<strong>Certificado:</strong> <a href="' + bc.verificacao_url + '" target="_blank" style="color:var(--accent)">' + bc.verificacao_url + '</a><br>';
      if (bc.ipfs && bc.ipfs.document_url) html += '<strong>IPFS:</strong> <a href="' + bc.ipfs.document_url + '" target="_blank" style="color:var(--accent)">Ver no IPFS</a><br>';
      if (bc.files && bc.files.stamped_url) html += '<strong>PDF Carimbado:</strong> <a href="' + bc.files.stamped_url + '" target="_blank" style="color:var(--accent)">Baixar</a><br>';
      if (bc.files && bc.files.certificate_url) html += '<strong>Certificado:</strong> <a href="' + bc.files.certificate_url + '" target="_blank" style="color:var(--accent)">Baixar</a><br>';
      html += '<strong>Plataforma:</strong> <a href="https://token.ibedis.com.br" target="_blank" style="color:var(--accent)">IBEDIS Token — Polygon</a></div>';
      infoEl.innerHTML = html;
    } else { infoEl.innerHTML = '<span style="color:var(--yellow)">⚠️ ' + (data.error || 'Registro pendente') + '</span>'; }
  } catch(err) { infoEl.innerHTML = '<span style="color:var(--red)">Erro: ' + err.message + '</span>'; }
  btn.disabled = false; btn.textContent = 'Registrar na Blockchain';
}

// --- EVENT BINDINGS (CSP-safe — zero inline handlers) ---
document.getElementById('btnScreen').addEventListener('click', runScreening);
document.getElementById('btnBuyCredits').addEventListener('click', openPaymentModal);
document.getElementById('btnPDF').addEventListener('click', downloadPDF);
document.getElementById('btnBlockchain').addEventListener('click', registerBlockchain);
document.getElementById('btnToggleJSON').addEventListener('click', toggleJSON);
document.getElementById('btnExportJSON').addEventListener('click', exportJSON);
document.getElementById('btnClosePayment').addEventListener('click', closePaymentModal);
document.getElementById('btnGenPay').addEventListener('click', generatePayment);
document.getElementById('address').addEventListener('keydown', function(e) { if (e.key === 'Enter') runScreening(); });

// Event delegation for dynamic content (payment modal, history items)
document.addEventListener('click', function(e) {
  var el = e.target.closest('[data-action]');
  if (el) {
    var a = el.dataset.action;
    if (a === 'generatePayment') generatePayment();
    else if (a === 'checkPayment') checkPaymentNow();
    else if (a === 'loadReport') loadReport(el.dataset.rid);
    else if (a === 'copyWallet') {
      var w = el.dataset.wallet;
      if (w && navigator.clipboard) navigator.clipboard.writeText(w).then(function() { el.style.borderColor = 'var(--green)'; });
    }
    return;
  }
  var pk = e.target.closest('[data-pkg]');
  if (pk) { selectPackage(pk.dataset.pkg, pk); return; }
  if (e.target.id === 'paymentModal') closePaymentModal();
});
