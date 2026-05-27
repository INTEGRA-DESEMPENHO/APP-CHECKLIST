// =========================================================================
// FUNÇÕES DE RENDERIZAÇÃO E FILTRO DO APP (ATUALIZADAS COM MAPEAMENTO DI)
// =========================================================================

function cardH(item, idx) {
  // ATUALIZADO: Usando os nomes de coluna de DI
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
      (obsH ? '<div>💬 <b>Última Obs:</b> ' + esc(obsH) + '</div>' : '') +
      (achH ? '<div>🔎 <b>Achados:</b> ' + esc(achH) + '</div>' : '') +
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
      '<button class="bopt ' + aOk + '" data-v="Ok" data-uid="' + esc(uid) + '" data-uni="' + esc(uni) + '" data-bl="' + esc(bl) + '" data-pav="' + esc(pav) + '" data-amb="' + esc(amb) + '" data-desc="' + esc(desc) + '" data-tipo="' + tipo + '">✅ OK</button>' +
      '<button class="bopt ' + aNk + '" data-v="Inadequado" data-uid="' + esc(uid) + '" data-uni="' + esc(uni) + '" data-bl="' + esc(bl) + '" data-pav="' + esc(pav) + '" data-amb="' + esc(amb) + '" data-desc="' + esc(desc) + '" data-tipo="' + tipo + '">❌ INADEQUADO</button>' +
      '<button class="bopt ' + aNa + '" data-v="N/A" data-uid="' + esc(uid) + '" data-uni="' + esc(uni) + '" data-bl="' + esc(bl) + '" data-pav="' + esc(pav) + '" data-amb="' + esc(amb) + '" data-desc="' + esc(desc) + '" data-tipo="' + tipo + '">⚫ N/A</button>' +
    '</div>' +
    '<div class="achw"><span class="achl">🔍 O que foi encontrado?</span>' +
      '<div class="achg">' + chipsH + '</div></div>' +
    '<div class="obsw"><textarea data-uid="' + esc(uid) + '" placeholder="Observações adicionais..." rows="3">' + obsV + '</textarea>' +
      '<button class="bmic" data-muid="' + esc(uid) + '">🎙️</button></div>' +
    '<div class="galeria" id="g' + esc(uid) + '">' + fH + '</div>' +
    '<div class="bfoto" data-uid="' + esc(uid) + '">📸 Adicionar Foto</div>' +
  '</div>';
}

// --- Itens filtrados ---
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
  
  // ATUALIZADO: Filtrando usando os nomes de coluna de DI
  _ci = DB.slice(1).filter(function(item) {
    var ui = (item[DI.UNINORM] || nrmU(item[DI.UNI]) || '').trim();
    return ui === uv &&
      (bv === '' || nrm(item[DI.BLC]) === bv) &&
      (pv === '' || nrm(item[DI.PAV]) === pv) &&
      (sv === '' || nrm(item[DI.SUB]) === sv);
  });
  return _ci;
}

// --- Filtros / datalists ---
function popularFiltros(unidadesUnicasFromSource = []) {
  var ul = document.getElementById('lu'), bl = document.getElementById('lb');
  var pl = document.getElementById('lpav'), sl = document.getElementById('lsub');
  ul.innerHTML = ''; bl.innerHTML = ''; pl.innerHTML = ''; sl.innerHTML = '';
  var uMap = {}, bSet = {}, pSet = {}, sSet = {};
  
  unidadesUnicasFromSource.sort().forEach(function(uCanon) {
    uMap[nrmU(uCanon)] = uCanon;
    ul.innerHTML += '<option value="' + esc(uCanon) + '">';
  });
  
  DB.slice(1).forEach(function(row) {
    // ATUALIZADO: Usando os nomes de coluna de DI
    var b = (row[DI.BLC] || '').trim(); if (b) bSet[b] = 1;
    var p = (row[DI.PAV] || '').trim(); if (p) pSet[p] = 1;
    var s = (row[DI.SUB] || '').trim(); if (s) sSet[s] = 1;
  });
  
  Object.keys(bSet).sort().forEach(function(v) { bl.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(pSet).sort().forEach(function(v) { pl.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(sSet).sort().forEach(function(v) { sl.innerHTML += '<option value="' + esc(v) + '">'; });
  
  var sf = lsGet(LS_FILTROS) || {};
  document.getElementById('resp').value = sf.resp || '';
  document.getElementById('u').value = sf.u || '';
  document.getElementById('b').value = sf.b || '';
  document.getElementById('pav').value = sf.pav || '';
  document.getElementById('sub').value = sf.sub || '';
  document.getElementById('fst').value = sf.fst || 'NAO_AVALIADOS';
  ['resp', 'u', 'b', 'pav', 'sub'].forEach(mkpre);
}

function _calcStatus(item) {
  var uid = item[DI.UID];
  // 1. seleção da sessão
  var s = SEL.find(function(x) { return x.uid === uid; });
  if (s && s.v && s.v.trim() !== '') return s.v;
  
  // 2. STATUS carregado do GAS
  if (STATUS[uid] && STATUS[uid].status) {
    var rc = STATUS[uid].status.trim().toUpperCase();
    if (rc === 'OK') return 'Ok';
    if (rc === 'INADEQUADO') return 'Inadequado';
    if (rc === 'N/A') return 'N/A';
    if (rc !== '') return 'Ok';
  }
  
  // 3. BASE DE DADOS (valores iniciais)
  // ATUALIZADO: Usando os nomes de coluna de DI
  var colK = nrm(item[DI.INAD]);
  if (colK === 'VERDADEIRO' || colK === 'TRUE') return 'Inadequado';
  var colJ = nrm(item[DI.ADEQ]);
  if (colJ === 'VERDADEIRO' || colJ === 'TRUE') return 'Ok';
  var colI = nrm(item[DI.AVAL]);
  if (colI === 'n/a' || colI === 'nao_aplicavel' || colI === 'nao aplicavel' ||
      colI === 'não aplicável' || colI === 'na') return 'N/A';
  
  return 'Nao Avaliado';
}

// --- Salvar avaliações (via GAS com fila offline) ---
async function tentarSalvar() {
  var resp = document.getElementById('resp').value.trim();
  var u = document.getElementById('u').value.trim();
  var b = document.getElementById('b').value.trim();
  var sub = document.getElementById('sub').value.trim();
  
  if (!resp || !u || !b) { toast('Preencha Inspetor, Unidade e Bloco.', 4000); return; }
  
  var its = SEL.filter(function(s) { 
    return s.v || s.obs || s.fotos.length > 0 || (s.achados && s.achados.length > 0); 
  });
  if (!its.length && !FSUB.length) { toast('Nenhuma avaliação para salvar.', 3000); return; }
  
  var pacote = {
    r: resp, u: u, b: b, sub: sub,
    fotosSubambiente: FSUB.map(function(f) { return f.b64; }),
    itens: its.map(function(s) {
      return {
        // ATUALIZADO: Usando os nomes de coluna de DI
        pav: s.pav,
        amb: s.amb, // Este é o NomeAmb/Subambiente do item
        p: s.p,     // Este é a Verificação/Descrição do item
        v: s.v,
        obs: s.obs,
        fotos: s.fotos.map(function(f) { return f.b64; }),
        tipo: s.tipo,
        achados: (s.achados || []).join(', ')
      };
    })
  };
  
  var btn = document.getElementById('bsave');
  btn.textContent = '💾 SALVANDO...'; btn.disabled = true;
  
  if (!navigator.onLine) {
    addFilaSave(pacote);
    toast('🔴 OFFLINE. Salvo na fila para enviar depois.');
    SEL = []; FSUB = []; invRsCache(); carregar(document.getElementById('u').value.trim());
    btn.textContent = '💾 SALVAR AVALIAÇÕES'; btn.disabled = false;
    return;
  }
  
  try {
    // Envia o pacote atual e tenta processar a fila se houver
    const fila = getFilaSave();
    if (fila.length > 0) {
      fila.push(pacote); // Adiciona o pacote atual à fila existente
      await callGas('salvarRegistrosEmLote', {}, 'POST', fila);
      setFilaSave([]); // Limpa a fila
      toast('✅ Avaliações (e fila) salvas com sucesso!');
    } else {
      await callGas('salvarRegistrosEmLote', {}, 'POST', [pacote]); // Envia apenas o pacote atual
      toast('✅ Avaliações salvas com sucesso!');
    }
    SEL = []; FSUB = []; invRsCache(); carregar(document.getElementById('u').value.trim());
  } catch (error) {
    addFilaSave(pacote); // Adiciona à fila se falhar
    toast('❌ Erro ao salvar: ' + error.message + '. Adicionado à fila offline.', 5000);
  } finally {
    btn.textContent = '💾 SALVAR AVALIAÇÕES'; btn.disabled = false;
    updFila();
  }
}
