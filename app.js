// ==========================================================================
// app.js — Vistoria Fênix v9
// Modo GitHub Pages: sem Google Apps Script, com persistência em localStorage
// ==========================================================================

// ── Constantes de localStorage ────────────────────────────────────────────
var LS_STATUS   = 'vistoria_status_v9';
var LS_FILTROS  = 'vistoria_filtros_v9';
var LS_FILA     = 'vistoria_fila_v9';
var LS_HIST     = 'vistoria_hist_v9';

// ── Estado global ─────────────────────────────────────────────────────────
var DB      = window.BASE_DE_DADOS || [];
var ACHADOS = window.ACHADOS_CONFIG || [];
var SEL     = [];   // itens avaliados na sessão atual
var FSUB    = [];   // fotos do subambiente
var STATUS  = {};   // cache de status: {uid: {status, obs, achados, dataUltimaAval}}
var _rsCache = {};

// ── Utilitários ───────────────────────────────────────────────────────────
function nrm(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim();
}
function nrmU(s) {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch(e) { return null; } }
function lsSet(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} }
function toast(msg, dur) {
  var t = document.getElementById('toast');
  t.textContent = msg; t.style.cssText = 'display:block;position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:rgba(32,33,36,.92);color:#fff;padding:12px 20px;border-radius:40px;font-size:14px;font-weight:600;z-index:9999;max-width:90vw;text-align:center;';
  clearTimeout(t._t);
  t._t = setTimeout(function() { t.style.display = 'none'; }, dur || 2500);
}
function hoje() { return new Date().toISOString().slice(0,10); }

// ── LocalStorage helpers ──────────────────────────────────────────────────
function getFilaSave() { return lsGet(LS_FILA) || []; }
function setFilaSave(f) { lsSet(LS_FILA, f); }
function addFilaSave(p) { var f = getFilaSave(); f.push(p); setFilaSave(f); }

function updFila() {
  var f = getFilaSave();
  var el = document.getElementById('sfila');
  if (f.length > 0) {
    el.textContent = '⏳ Fila: ' + f.length;
    el.style.display = 'inline-flex';
  } else {
    el.style.display = 'none';
  }
}

// ── Persistência de STATUS (substituindo Google Apps Script) ──────────────
function carregarStatusLocal() {
  STATUS = lsGet(LS_STATUS) || {};
}

function salvarStatusLocal() {
  lsSet(LS_STATUS, STATUS);
}

function carregarHistoricoLocal() {
  return lsGet(LS_HIST) || [];
}

function salvarRegistroHistorico(pacote) {
  var hist = carregarHistoricoLocal();
  var entrada = {
    data: hoje(),
    ts: Date.now(),
    resp: pacote.r,
    u: pacote.u,
    b: pacote.b,
    sub: pacote.sub,
    itens: pacote.itens
  };
  hist.push(entrada);
  lsSet(LS_HIST, hist);
}

// ── Avaliação de status de um item ────────────────────────────────────────
function resStatus(item) {
  var uid = item[DI.UID];
  var s = SEL.find(function(x) { return x.uid === uid; });
  if (s && s.v && s.v.trim() !== '') return s.v;
  if (STATUS[uid] && STATUS[uid].status) {
    var rc = STATUS[uid].status.trim().toUpperCase();
    if (rc === 'OK') return 'Ok';
    if (rc === 'INADEQUADO') return 'Inadequado';
    if (rc === 'N/A') return 'N/A';
    if (rc !== '') return 'Ok';
  }
  var colK = nrm(item[DI.INAD]);
  if (colK === 'verdadeiro' || colK === 'true') return 'Inadequado';
  var colJ = nrm(item[DI.ADEQ]);
  if (colJ === 'verdadeiro' || colJ === 'true') return 'Ok';
  var colI = nrm(item[DI.AVAL]);
  if (colI === 'n/a' || colI === 'nao_aplicavel' || colI === 'nao aplicavel' ||
      colI === 'nao aplicavel' || colI === 'na') return 'N/A';
  return 'Nao Avaliado';
}

function precisaReaval(uid) {
  if (!STATUS[uid] || !STATUS[uid].dataUltimaAval) return false;
  var d = new Date(STATUS[uid].dataUltimaAval);
  var diff = (Date.now() - d.getTime()) / (1000*60*60*24*30);
  return diff >= 6;
}

function mesesDesde(uid) {
  if (!STATUS[uid] || !STATUS[uid].dataUltimaAval) return null;
  var d = new Date(STATUS[uid].dataUltimaAval);
  return Math.floor((Date.now() - d.getTime()) / (1000*60*60*24*30));
}

// ── Renderização de thumbnail ─────────────────────────────────────────────
function thumbH(uid, idx, b64) {
  return '<div class="thumb" id="th_' + esc(uid) + '_' + idx + '">' +
    '<img src="' + b64 + '" alt="foto">' +
    '<button class="tdel" data-uid="' + esc(uid) + '" data-idx="' + idx + '">×</button>' +
  '</div>';
}

// ── Renderização do card de item ──────────────────────────────────────────
function cardH(item, idx) {
  var uni = item[DI.UNI] || '', bl = item[DI.BLC] || '', pav = item[DI.PAV] || '';
  var amb = item[DI.SUB] || '', desc = item[DI.DESC] || '', uid = item[DI.UID];
  var st = resStatus(item);
  var sl = SEL.find(function(x) { return x.uid === uid; });
  var obsH = (STATUS[uid] && STATUS[uid].obs) ? STATUS[uid].obs : String(item[DI.OBS] || '').trim();
  var achH = (STATUS[uid] && STATUS[uid].achados) ? STATUS[uid].achados : '';
  var pendH = String(item[DI.PEND] || '').trim();
  var dtAv = (STATUS[uid] && STATUS[uid].dataUltimaAval) ? STATUS[uid].dataUltimaAval : '';
  var isOk = st === 'Ok', isIN = st === 'Inadequado', isNA = st === 'N/A';
  var hasA = pendH || obsH || achH;
  var prR = isOk && precisaReaval(uid), mp = mesesDesde(uid);
  var cls = 'ic';

  if (isNA) cls += ' ina';
  else if (isIN || hasA) cls += ' inad';
  else if (isOk && prR) cls += ' ior';

  var hHtml = '';
  if (hasA) {
    hHtml = '<div class="hbox">' +
      (pendH ? '<div>📋 <b>Pendência:</b> ' + esc(pendH) + '</div>' : '') +
      (obsH  ? '<div>💬 <b>Última Obs:</b> ' + esc(obsH)  + '</div>' : '') +
      (achH  ? '<div>🔎 <b>Achados:</b> '   + esc(achH)  + '</div>' : '') +
    '</div>';
  }

  var rvB = prR ? '<div class="breavbadge">🔄 Reavaliação vencida' + (mp !== null ? ' (' + mp + 'm atrás)' : '') + '</div>' :
    (isOk && dtAv ? '<div style="font-size:11px;color:var(--text2);margin-bottom:6px;">✅ Avaliado em ' + esc(dtAv) + '</div>' : '');
  var naB = isNA ? '<div class="bnabadge">⚫ N/A — Retornar</div>' : '';
  var fH = (sl && sl.fotos) ? sl.fotos.map(function(f, i) { return thumbH(uid, i, f.b64); }).join('') : '';
  var obsV = sl ? esc(sl.obs || '') : '';
  var achSel = (sl && sl.achados) ? sl.achados : (achH ? achH.split(', ').filter(Boolean) : []);

  var chipsH = ACHADOS.map(function(a) {
    var at = achSel.indexOf(a) >= 0 ? ' sel' : '';
    return '<span class="chip' + at + '" data-uid="' + esc(uid) + '" data-ach="' + esc(a) + '">' + esc(a) + '</span>';
  }).join('');

  var si = isOk ? '✅' : isIN ? '❌' : isNA ? '⚫' : '⬜';
  var aOk = isOk ? 'aok' : '', aNk = isIN ? 'ank' : '', aNa = isNA ? 'ana' : '';
  var tipo = isIN ? 'Inadequado' : isNA ? 'N/A' : isOk ? 'Adequado' : 'Normal';

  return '<div class="' + cls + '" data-uid="' + esc(uid) + '">' +
    '<div class="ihr"><div class="inum">' + (idx + 1) + '</div>' +
    '<div class="iinf"><div class="iloc">' + esc(pav) + ' › ' + esc(amb) + '</div>' +
    '<div class="idesc">' + esc(desc) + '</div></div>' +
    '<span class="sicon" style="font-size:18px;color:var(--text2);margin-left:8px;flex-shrink:0;">' + si + '</span></div>' +
    rvB + naB + hHtml +
    '<div class="bgrp">' +
      '<button class="bopt ' + aOk + '" data-v="Ok"         data-uid="' + esc(uid) + '" data-uni="' + esc(uni) + '" data-bl="' + esc(bl) + '" data-pav="' + esc(pav) + '" data-amb="' + esc(amb) + '" data-desc="' + esc(desc) + '" data-tipo="' + tipo + '">✅ OK</button>' +
      '<button class="bopt ' + aNk + '" data-v="Inadequado" data-uid="' + esc(uid) + '" data-uni="' + esc(uni) + '" data-bl="' + esc(bl) + '" data-pav="' + esc(pav) + '" data-amb="' + esc(amb) + '" data-desc="' + esc(desc) + '" data-tipo="' + tipo + '">❌ INADEQUADO</button>' +
      '<button class="bopt ' + aNa + '" data-v="N/A"        data-uid="' + esc(uid) + '" data-uni="' + esc(uni) + '" data-bl="' + esc(bl) + '" data-pav="' + esc(pav) + '" data-amb="' + esc(amb) + '" data-desc="' + esc(desc) + '" data-tipo="' + tipo + '">⚫ N/A</button>' +
    '</div>' +
    '<div class="achw"><span class="achl">🔍 O que foi encontrado?</span>' +
      '<div class="achg">' + chipsH + '</div></div>' +
    '<div class="obsw"><textarea data-uid="' + esc(uid) + '" placeholder="Observações adicionais..." rows="3">' + obsV + '</textarea>' +
      '<button class="bmic" data-muid="' + esc(uid) + '">🎙️</button></div>' +
    '<div class="galeria" id="g' + esc(uid) + '">' + fH + '</div>' +
    '<div class="bfoto" data-uid="' + esc(uid) + '">📸 Adicionar Foto</div>' +
  '</div>';
}

// ── Cache de itens filtrados ──────────────────────────────────────────────
var _ci = null, _cc = '';
function invCache() { _ci = null; _cc = ''; }

function getItens() {
  var uv = nrmU(document.getElementById('u').value);
  var bv = nrm(document.getElementById('b').value);
  var pv = nrm(document.getElementById('pav').value);
  var sv = nrm(document.getElementById('sub').value);
  if (!uv) return [];
  var ch = uv + '|' + bv + '|' + pv + '|' + sv;
  if (_cc === ch && _ci) return _ci;
  _cc = ch;
  _ci = DB.slice(1).filter(function(item) {
    var ui = (item[DI.UNINORM] || nrmU(item[DI.UNI]) || '').trim();
    return ui === uv &&
      (bv === '' || nrm(item[DI.BLC]) === bv) &&
      (pv === '' || nrm(item[DI.PAV]) === pv) &&
      (sv === '' || nrm(item[DI.SUB]) === sv);
  });
  return _ci;
}

// ── Cache de resumo ───────────────────────────────────────────────────────
function invRsCache() { _rsCache = {}; invCache(); }

function getResumo(u) {
  if (_rsCache[u]) return _rsCache[u];
  var rows = DB.slice(1).filter(function(item) {
    return nrmU(item[DI.UNI]) === nrmU(u);
  });
  var ok = 0, nk = 0, na = 0, pend = 0;
  var ambAval = {}, ambPend = {}, ambVisit = {}, ambInad = {}, hoje_set = {};
  rows.forEach(function(item) {
    var st = resStatus(item);
    var amb = item[DI.SUB] || '';
    if (st === 'Ok')          { ok++;  ambAval[amb] = 1; }
    else if (st === 'Inadequado') { nk++; ambAval[amb] = 1; ambInad[amb] = 1; }
    else if (st === 'N/A')    { na++; }
    else                      { pend++; ambVisit[amb] = 1; }
    if (ambAval[amb] && pend > 0) ambPend[amb] = 1;
    var uid = item[DI.UID];
    if (STATUS[uid] && STATUS[uid].dataUltimaAval === hoje()) hoje_set[amb] = 1;
  });
  var r = {
    ok: ok, nk: nk, na: na, pend: pend,
    ambAval: Object.keys(ambAval).length,
    ambPend: Object.keys(ambPend).length,
    ambVisit: Object.keys(ambVisit).length,
    ambInad: Object.keys(ambInad).length,
    hoje: Object.keys(hoje_set).length,
    total: rows.length
  };
  _rsCache[u] = r;
  return r;
}

// ── Filtros / datalists ───────────────────────────────────────────────────
function popularFiltros() {
  var ul = document.getElementById('lu'), bl = document.getElementById('lb');
  var pl = document.getElementById('lpav'), sl = document.getElementById('lsub');
  ul.innerHTML = ''; bl.innerHTML = ''; pl.innerHTML = ''; sl.innerHTML = '';
  var uSet = {}, bSet = {}, pSet = {}, sSet = {};
  DB.slice(1).forEach(function(row) {
    var u = (row[DI.UNI] || '').trim(); if (u) uSet[u] = 1;
    var b = (row[DI.BLC] || '').trim(); if (b) bSet[b] = 1;
    var p = (row[DI.PAV] || '').trim(); if (p) pSet[p] = 1;
    var s = (row[DI.SUB] || '').trim(); if (s) sSet[s] = 1;
  });
  Object.keys(uSet).sort().forEach(function(v) { ul.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(bSet).sort().forEach(function(v) { bl.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(pSet).sort().forEach(function(v) { pl.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(sSet).sort().forEach(function(v) { sl.innerHTML += '<option value="' + esc(v) + '">'; });

  var sf = lsGet(LS_FILTROS) || {};
  document.getElementById('resp').value = sf.resp || '';
  document.getElementById('u').value    = sf.u    || '';
  document.getElementById('b').value    = sf.b    || '';
  document.getElementById('pav').value  = sf.pav  || '';
  document.getElementById('sub').value  = sf.sub  || '';
  document.getElementById('fst').value  = sf.fst  || 'NAO_AVALIADOS';
  ['resp','u','b','pav','sub'].forEach(mkpre);
}

function salvarFiltros() {
  lsSet(LS_FILTROS, {
    resp: document.getElementById('resp').value,
    u:    document.getElementById('u').value,
    b:    document.getElementById('b').value,
    pav:  document.getElementById('pav').value,
    sub:  document.getElementById('sub').value,
    fst:  document.getElementById('fst').value
  });
}

function mkpre(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('ok', el.value.trim() !== '');
}

function limparSecundarios() {
  ['b','pav','sub'].forEach(function(id) {
    document.getElementById(id).value = '';
    mkpre(id);
  });
  invCache(); carregar(document.getElementById('u').value.trim());
}

// ── Dashboard ─────────────────────────────────────────────────────────────
function atualizarDash(u) {
  if (!u) {
    ['cok','cnk','caa','cap','cav','chj','cai'].forEach(function(id) {
      document.getElementById(id).textContent = '0';
    });
    document.getElementById('cam').textContent = '—';
    document.getElementById('cams').textContent = 'Selecione uma unidade';
    document.getElementById('crvc').textContent = '—';
    document.getElementById('crvs').textContent = 'Selecione uma unidade';
    document.getElementById('cnvc').textContent = '—';
    document.getElementById('cnvs').textContent = 'Selecione uma unidade';
    return;
  }
  var r = getResumo(u);
  document.getElementById('cok').textContent  = r.ok;
  document.getElementById('cnk').textContent  = r.nk;
  document.getElementById('caa').textContent  = r.ambAval;
  document.getElementById('cap').textContent  = r.ambPend;
  document.getElementById('cav').textContent  = r.ambVisit;
  document.getElementById('chj').textContent  = r.hoje;
  document.getElementById('cai').textContent  = r.ambInad;

  // Ciclo semestral
  var uc = window.UNIDADES_CONFIG && window.UNIDADES_CONFIG[u];
  if (uc) {
    var meta = Math.ceil(uc.totalSub / 6);
    document.getElementById('cam').textContent  = meta;
    document.getElementById('cams').textContent = uc.totalSub + ' subamb. em 6 meses';
  } else {
    document.getElementById('cam').textContent  = '—';
    document.getElementById('cams').textContent = 'Configure em data.js';
  }

  // Reavaliações vencidas
  var rv = DB.slice(1).filter(function(item) {
    return nrmU(item[DI.UNI]) === nrmU(u) && resStatus(item) === 'Ok' && precisaReaval(item[DI.UID]);
  }).length;
  document.getElementById('crvc').textContent = rv;
  document.getElementById('crvs').textContent = rv === 0 ? 'Nenhuma vencida' : rv + ' item(ns) para reavaliar';

  // N/A pendentes
  var nav = DB.slice(1).filter(function(item) {
    return nrmU(item[DI.UNI]) === nrmU(u) && resStatus(item) === 'N/A';
  }).length;
  document.getElementById('cnvc').textContent = nav;
  document.getElementById('cnvs').textContent = nav === 0 ? 'Nenhum pendente' : nav + ' item(ns) para revisar';
}

// ── Progresso ─────────────────────────────────────────────────────────────
function atualizarProgresso(itens) {
  var ok = 0, nk = 0, na = 0, pend = 0;
  itens.forEach(function(item) {
    var st = resStatus(item);
    if (st === 'Ok') ok++;
    else if (st === 'Inadequado') nk++;
    else if (st === 'N/A') na++;
    else pend++;
  });
  var total = itens.length;
  var aval = ok + nk + na;
  var pct = total > 0 ? Math.round(aval / total * 100) : 0;
  var cpg = document.getElementById('cpg');
  cpg.style.display = total > 0 ? 'block' : 'none';
  document.getElementById('pgt').textContent = aval + ' / ' + total;
  document.getElementById('pgf').style.width = pct + '%';
  var cor = pct === 100 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--primary)';
  document.getElementById('pgf').style.background = cor;
  document.getElementById('pgok').textContent  = '✅ ' + ok  + ' adequados';
  document.getElementById('pgnk').textContent  = '❌ ' + nk  + ' inadequados';
  document.getElementById('pgna').textContent  = '⚫ ' + na  + ' N/A';
  document.getElementById('pgpnd').textContent = '⏳ ' + pend + ' faltando';
}

// ── Histórico (localStorage) ──────────────────────────────────────────────
function renderizarHistorico(u) {
  var chist = document.getElementById('chist');
  if (!u) { chist.style.display = 'none'; return; }
  chist.style.display = 'block';
  var hist = carregarHistoricoLocal();
  var now = new Date();
  var meses = [];
  for (var i = 5; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push({ ano: d.getFullYear(), mes: d.getMonth(), lbl: d.toLocaleString('pt-BR', {month:'short', year:'2-digit'}).toUpperCase() });
  }
  var porMes = {};
  meses.forEach(function(m) { porMes[m.ano + '-' + m.mes] = { amb: {}, ok: 0, nk: 0, na: 0 }; });

  hist.filter(function(e) { return nrmU(e.u) === nrmU(u); }).forEach(function(e) {
    var d = new Date(e.data + 'T00:00:00');
    var k = d.getFullYear() + '-' + d.getMonth();
    if (!porMes[k]) return;
    (e.itens || []).forEach(function(it) {
      porMes[k].amb[it.amb] = 1;
      if (it.v === 'Ok') porMes[k].ok++;
      else if (it.v === 'Inadequado') porMes[k].nk++;
      else if (it.v === 'N/A') porMes[k].na++;
    });
  });

  var maxAmb = Math.max(1, Math.max.apply(null, meses.map(function(m) {
    return Object.keys(porMes[m.ano+'-'+m.mes].amb).length;
  })));

  var html = '<div class="hgrid">';
  meses.forEach(function(m) {
    var key = m.ano + '-' + m.mes;
    var d = porMes[key];
    var cnt = Object.keys(d.amb).length;
    var isCurr = m.ano === now.getFullYear() && m.mes === now.getMonth();
    var cls = 'mcard' + (isCurr ? ' mat' : '') + (cnt === 0 ? ' mvaz' : '');
    html += '<div class="' + cls + '">' +
      '<div class="mlbl">' + m.lbl + '</div>' +
      '<div class="mnum">' + cnt + '</div>' +
      '<div class="mnuml">ambientes</div>' +
      '<div class="mbadges">' +
        (d.ok > 0  ? '<span class="mb mbok">'   + d.ok  + ' ok</span>'   : '') +
        (d.nk > 0  ? '<span class="mb mbinad">' + d.nk  + ' inad</span>' : '') +
        (d.na > 0  ? '<span class="mb mbna">'   + d.na  + ' N/A</span>'  : '') +
      '</div>' +
    '</div>';
  });
  html += '</div>';

  // Barra de progresso por mês
  html += '<div class="hbarwrap">';
  meses.forEach(function(m) {
    var key = m.ano + '-' + m.mes;
    var cnt = Object.keys(porMes[key].amb).length;
    var pct = Math.round(cnt / maxAmb * 100);
    html += '<div class="hbarrow"><div class="hbarlbl">' + m.lbl + '</div>' +
      '<div class="hbarbg"><div class="hbarfill" style="width:' + pct + '%"></div></div>' +
      '<div class="hbarcnt">' + cnt + '</div></div>';
  });
  html += '</div>';

  document.getElementById('hcont').innerHTML = html;
}

// ── Carregar lista de itens ───────────────────────────────────────────────
function carregar(u) {
  invCache();
  atualizarDash(u);
  renderizarHistorico(u);
  var fst = document.getElementById('fst').value;
  var itens = getItens();

  var filtrados = itens.filter(function(item) {
    var st = resStatus(item);
    if (fst === 'NAO_AVALIADOS')  return st === 'Nao Avaliado';
    if (fst === 'INADEQUACOES')   return st === 'Inadequado';
    if (fst === 'NA_PENDENTES')   return st === 'N/A';
    if (fst === 'AVALIADOS_OK')   return st === 'Ok';
    return true; // TUDO
  });

  atualizarProgresso(itens);

  var lista = document.getElementById('lista');
  if (!u) { lista.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Selecione uma unidade para começar.</div>'; return; }
  if (filtrados.length === 0) {
    lista.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text2);">Nenhum item encontrado com este filtro.</div>';
    return;
  }
  lista.innerHTML = filtrados.map(cardH).join('');
}

// ── Filtros interativos ───────────────────────────────────────────────────
function filtroReaval() {
  document.getElementById('fst').value = 'AVALIADOS_OK';
  carregar(document.getElementById('u').value.trim());
}
function filtroNA() {
  document.getElementById('fst').value = 'NA_PENDENTES';
  carregar(document.getElementById('u').value.trim());
}

// ── Salvar avaliações (localStorage apenas) ───────────────────────────────
async function tentarSalvar() {
  var resp = document.getElementById('resp').value.trim();
  var u    = document.getElementById('u').value.trim();
  var b    = document.getElementById('b').value.trim();
  var sub  = document.getElementById('sub').value.trim();

  if (!resp || !u || !b) { toast('Preencha Inspetor, Unidade e Bloco.', 4000); return; }

  var its = SEL.filter(function(s) {
    return s.v || s.obs || s.fotos.length > 0 || (s.achados && s.achados.length > 0);
  });
  if (!its.length && !FSUB.length) { toast('Nenhuma avaliação para salvar.', 3000); return; }

  var pacote = {
    r: resp, u: u, b: b, sub: sub,
    fotosSubambiente: FSUB.map(function(f) { return f.b64; }),
    itens: its.map(function(s) {
      return { pav: s.pav, amb: s.amb, p: s.p, v: s.v, obs: s.obs,
               fotos: s.fotos.map(function(f) { return f.b64; }),
               tipo: s.tipo, achados: (s.achados || []).join(', ') };
    })
  };

  var btn = document.getElementById('bsave');
  btn.textContent = '💾 SALVANDO...'; btn.disabled = true;

  try {
    // Atualiza STATUS local
    its.forEach(function(s) {
      if (!STATUS[s.uid]) STATUS[s.uid] = {};
      STATUS[s.uid].status        = s.v;
      STATUS[s.uid].obs           = s.obs || '';
      STATUS[s.uid].achados       = (s.achados || []).join(', ');
      STATUS[s.uid].dataUltimaAval = hoje();
    });
    salvarStatusLocal();
    salvarRegistroHistorico(pacote);

    SEL = []; FSUB = []; invRsCache();
    carregar(document.getElementById('u').value.trim());
    toast('✅ Avaliações salvas com sucesso!');
  } catch(e) {
    toast('❌ Erro ao salvar: ' + e.message, 5000);
  } finally {
    btn.textContent = '💾 SALVAR AVALIAÇÕES'; btn.disabled = false;
  }
}

// ── Exportar CSV ──────────────────────────────────────────────────────────
function baixarRelatorio() {
  var hist = carregarHistoricoLocal();
  var hj   = hoje();
  var linhas = [['Data','Inspetor','Unidade','Bloco','Pavimento','Ambiente','Verificação','Status','Observação','Achados']];
  hist.filter(function(e) { return e.data === hj; }).forEach(function(e) {
    (e.itens || []).forEach(function(it) {
      linhas.push([e.data, e.resp, e.u, e.b, it.pav||'', it.amb||'', it.p||'', it.v||'', it.obs||'', it.achados||'']);
    });
  });
  if (linhas.length <= 1) { toast('Nenhuma avaliação registrada hoje.', 3000); return; }
  var csv = linhas.map(function(r) {
    return r.map(function(c) { return '"' + String(c).replace(/"/g,'""') + '"'; }).join(',');
  }).join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'vistoria_' + hj + '.csv';
  a.click();
}

// ── Microfone (reconhecimento de voz) ─────────────────────────────────────
var _recUID = null, _recObj = null;
function toggleMic(uid) {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Microfone não suportado neste navegador.'); return; }
  var btn = document.querySelector('.bmic[data-muid="' + uid + '"]');
  if (_recUID === uid && _recObj) {
    _recObj.stop(); _recObj = null; _recUID = null;
    if (btn) btn.classList.remove('rec');
    return;
  }
  if (_recObj) { _recObj.stop(); _recObj = null; }
  _recUID = uid;
  var rec = new SR();
  rec.lang = 'pt-BR'; rec.continuous = false; rec.interimResults = false;
  rec.onresult = function(e) {
    var txt = e.results[0][0].transcript;
    var ta = document.querySelector('textarea[data-uid="' + uid + '"]');
    if (ta) { ta.value = (ta.value ? ta.value + ' ' : '') + txt; atualizarObs(uid, ta.value); }
  };
  rec.onerror = function() { toast('Erro no microfone.'); };
  rec.onend   = function() { if (btn) btn.classList.remove('rec'); _recUID = null; _recObj = null; };
  rec.start();
  _recObj = rec;
  if (btn) btn.classList.add('rec');
}

function atualizarObs(uid, val) {
  var s = SEL.find(function(x) { return x.uid === uid; });
  if (s) s.obs = val;
}

// ── Câmera / Fotos ────────────────────────────────────────────────────────
var _fotoUID = null;
function abrirCamera(uid) {
  _fotoUID = uid;
  var inp = document.getElementById('camInput');
  inp.value = '';
  inp.onchange = function() {
    var files = Array.from(inp.files);
    files.forEach(function(file) {
      var reader = new FileReader();
      reader.onload = function(e) {
        adicionarFoto(uid, e.target.result);
      };
      reader.readAsDataURL(file);
    });
  };
  inp.click();
}

function adicionarFoto(uid, b64) {
  var s = SEL.find(function(x) { return x.uid === uid; });
  if (!s) return;
  s.fotos.push({ b64: b64 });
  var g = document.getElementById('g' + uid);
  if (g) g.innerHTML = s.fotos.map(function(f, i) { return thumbH(uid, i, f.b64); }).join('');
}

function removerFoto(uid, idx) {
  var s = SEL.find(function(x) { return x.uid === uid; });
  if (!s) return;
  s.fotos.splice(idx, 1);
  var g = document.getElementById('g' + uid);
  if (g) g.innerHTML = s.fotos.map(function(f, i) { return thumbH(uid, i, f.b64); }).join('');
}

// ── Seleção de status (OK / Inadequado / N/A) ─────────────────────────────
function selecionarStatus(btn) {
  var uid  = btn.dataset.uid;
  var v    = btn.dataset.v;
  var uni  = btn.dataset.uni  || '';
  var bl   = btn.dataset.bl   || '';
  var pav  = btn.dataset.pav  || '';
  var amb  = btn.dataset.amb  || '';
  var desc = btn.dataset.desc || '';
  var tipo = btn.dataset.tipo || '';

  var s = SEL.find(function(x) { return x.uid === uid; });
  if (!s) {
    s = { uid: uid, v: '', obs: '', fotos: [], achados: [], pav: pav, amb: amb, p: desc, tipo: tipo };
    SEL.push(s);
  }
  s.v = (s.v === v) ? '' : v; // toggle
  invRsCache();

  // Atualiza visual do card imediatamente
  var card = document.querySelector('.ic[data-uid="' + uid + '"]');
  if (card) {
    card.querySelectorAll('.bopt').forEach(function(b) {
      b.classList.remove('aok','ank','ana');
    });
    if (s.v === 'Ok')         btn.classList.add('aok');
    else if (s.v === 'Inadequado') btn.classList.add('ank');
    else if (s.v === 'N/A')   btn.classList.add('ana');

    var si = s.v === 'Ok' ? '✅' : s.v === 'Inadequado' ? '❌' : s.v === 'N/A' ? '⚫' : '⬜';
    var sicon = card.querySelector('.sicon');
    if (sicon) sicon.textContent = si;

    card.className = 'ic';
    if (s.v === 'N/A') card.classList.add('ina');
    else if (s.v === 'Inadequado') card.classList.add('inad');
  }

  atualizarDash(document.getElementById('u').value.trim());
}

// ── Chips de achados ──────────────────────────────────────────────────────
function toggleChip(uid, ach, chipEl) {
  var s = SEL.find(function(x) { return x.uid === uid; });
  if (!s) {
    s = { uid: uid, v: '', obs: '', fotos: [], achados: [] };
    SEL.push(s);
  }
  var idx = s.achados.indexOf(ach);
  if (idx >= 0) { s.achados.splice(idx, 1); chipEl.classList.remove('sel'); }
  else          { s.achados.push(ach);       chipEl.classList.add('sel'); }
}

// ── Event delegation ──────────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  var t = e.target;

  // Botões de status
  if (t.matches('.bopt[data-v]')) { selecionarStatus(t); return; }

  // Chips de achados
  if (t.matches('.chip[data-uid]')) { toggleChip(t.dataset.uid, t.dataset.ach, t); return; }

  // Microfone
  if (t.matches('.bmic[data-muid]')) { toggleMic(t.dataset.muid); return; }

  // Foto
  if (t.matches('.bfoto[data-uid]')) { abrirCamera(t.dataset.uid); return; }

  // Deletar foto
  if (t.matches('.tdel[data-uid]')) { removerFoto(t.dataset.uid, parseInt(t.dataset.idx)); return; }
});

document.addEventListener('input', function(e) {
  var t = e.target;
  if (t.tagName === 'TEXTAREA' && t.dataset.uid) {
    atualizarObs(t.dataset.uid, t.value);
  }
  if (['u','b','pav','sub','resp'].indexOf(t.id) >= 0) {
    mkpre(t.id);
    salvarFiltros();
    if (['u','b','pav','sub'].indexOf(t.id) >= 0) {
      invCache();
      carregar(document.getElementById('u').value.trim());
    }
  }
});

document.addEventListener('change', function(e) {
  if (e.target.id === 'fst') {
    salvarFiltros();
    carregar(document.getElementById('u').value.trim());
  }
});

// ── Rede ──────────────────────────────────────────────────────────────────
function atualizarRede() {
  var el  = document.getElementById('snet');
  var bcache = document.getElementById('bcache');
  if (navigator.onLine) {
    el.textContent = '🌐 ONLINE';
    el.className = 'snet online';
    if (bcache) bcache.classList.remove('vis');
  } else {
    el.textContent = '📴 OFFLINE';
    el.className = 'snet offline';
    if (bcache) bcache.classList.add('vis');
  }
}
window.addEventListener('online',  atualizarRede);
window.addEventListener('offline', atualizarRede);

// ── Inicialização ─────────────────────────────────────────────────────────
(function init() {
  carregarStatusLocal();
  popularFiltros();
  atualizarRede();
  updFila();
  var u = document.getElementById('u').value.trim();
  if (u) carregar(u);
  else   atualizarDash('');
})();
