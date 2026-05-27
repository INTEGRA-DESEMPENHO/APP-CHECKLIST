/* ══════════════════════════════════════════════════════════════════
   Vistoria Fênix v9 — app.js
   Versão GitHub: substitui google.script.run por chamadas fetch()
   apontando para backend/api.js (Node/Express) ou mock local.
══════════════════════════════════════════════════════════════════ */

// ─── Configuração da API ─────────────────────────────────────────
// Em produção, aponte para seu backend real.
// Para testes locais com mock, mantenha API_BASE = ''.
var API_BASE = window.VISTORIA_API_BASE || '';

// ─── Constantes ──────────────────────────────────────────────────
var CICLOS = {
  'rei pele':       { i: 1, f: 6 },
  'papa francisco': { i: 2, f: 7 },
  'padre ticao':    { i: 3, f: 8 },
  'padre chicao':   { i: 3, f: 8 },
  'silvio santos':  { i: 4, f: 9 }
};
var MN = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var ME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho',
          'Agosto','Setembro','Outubro','Novembro','Dezembro'];
var ACHADOS = [
  'Infiltração','Vazamento','Equipamento danificado','Falta de EPI',
  'Iluminação inadequada','Sinalização ausente','Resíduo irregular',
  'Área bloqueada','Estrutura comprometida','Elétrica exposta',
  'Piso danificado','Porta/janela com defeito'
];
var FILA_K     = 'vfx_fila_v9';
var FILT_K     = 'vfx_filt_v9';
var CACHE_DB_K = 'vfx_cache_db_v9';
var CACHE_ST_K = 'vfx_cache_st_v9';

// Índices do array de dados
var DI = {
  ORD: 0, UNI: 1, UNINORM: 2, BLC: 3, PAV: 4,
  AMB_TAG: 5, SUB: 6, DESC: 7, AVAL: 8,
  ADEQ: 9, INAD: 10, PEND: 11, OBS: 12, UID: 13
};

// ─── Estado global ───────────────────────────────────────────────
var DB = [], STATUS = {}, SEL = [], FSUB = [], FOTO_CTX = null, ENVIANDO = false;
var UNIDS_AVAL = null;
var _rsCache = {};
function invRsCache() { _rsCache = {}; }

// ─── Utilitários ─────────────────────────────────────────────────
function nrm(s) {
  return (s || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function nrmU(s) { return nrm(s); }

function esc(s) {
  return String(s)
    .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function toast(m, d) {
  d = d || 2500;
  var t = document.getElementById('toast');
  t.textContent = m; t.className = 'show';
  setTimeout(function () { t.className = t.className.replace('show', ''); }, d);
}

// ─── Camada de API (substitui google.script.run) ─────────────────
/**
 * Simula google.script.run.<fn>(<args>)
 * Retorna objeto com .withSuccessHandler e .withFailureHandler
 */
var api = (function () {

  /* ── Mock local (sem servidor) ─────────────────────────────── */
  var mockDB = {
    dados: [
      ['Ordem','Unidade','UniNorm','Bloco','Pavimento','AmbTag','NomeAmb','Verificação','Aval','Adeq','Inad','Pend','Obs','UID'],
      ['1','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar piso','Não','FALSO','FALSO','','','rei pele||bloco a||1º andar||recepção||verificar piso'],
      ['2','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar iluminação','Não','FALSO','FALSO','','','rei pele||bloco a||1º andar||recepção||verificar iluminação'],
      ['3','REI PELE','rei pele','Bloco A','2º Andar','AMB02','Corredor','Verificar corrimão','Não','FALSO','FALSO','','','rei pele||bloco a||2º andar||corredor||verificar corrimão'],
      ['4','PAPA FRANCISCO','papa francisco','Bloco B','Térreo','AMB03','Hall','Verificar extintores','Não','FALSO','FALSO','','','papa francisco||bloco b||térreo||hall||verificar extintores']
    ],
    ultimosStatus: {},
    unidadesUnicas: ['PAPA FRANCISCO', 'REI PELE'],
    unidadesAvaliadas: []
  };

  var mockRespostas = [];

  /* ── Helpers HTTP ───────────────────────────────────────────── */
  function apiFetch(endpoint, body) {
    return fetch(API_BASE + endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function call(fn, args) {
    var _ok = function () {}, _fail = function () {};
    var obj = {
      withSuccessHandler: function (cb) { _ok = cb; return obj; },
      withFailureHandler: function (cb) { _fail = cb; return obj; }
    };

    // Se não há backend configurado, usa mock local
    if (!API_BASE) {
      setTimeout(function () { mockCall(fn, args, _ok, _fail); }, 120);
      return obj;
    }

    apiFetch('/api/' + fn, { args: args })
      .then(function (r) { _ok(r); })
      .catch(function (e) { _fail(e); });

    return obj;
  }

  /* ── Mock handlers ──────────────────────────────────────────── */
  function mockCall(fn, args, ok, fail) {
    try {
      switch (fn) {
        case 'puxarDadosBase':
          ok(JSON.parse(JSON.stringify(mockDB)));
          break;

        case 'salvarRegistro':
          var pct = args[0];
          var agora = new Date();
          var dataFmt = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR');
          (pct.itens || []).forEach(function (item) {
            mockRespostas.push([dataFmt, pct.r, pct.u, pct.b, item.amb, '', item.pav, item.amb, item.p, item.v, item.obs, '', item.tipo, item.achados]);
          });
          ok(true);
          break;

        case 'obterRespostasDoDia':
          var hoje = new Date().toLocaleDateString('pt-BR');
          var header = ['Data','Inspetor','Unidade','Bloco','Subambiente','Fotos Sub','Pavimento','Ambiente Item','Item','Status','Observação','Fotos Item','Tipo','Achados'];
          var filtradas = mockRespostas.filter(function (l) { return String(l[0]).indexOf(hoje) === 0; });
          ok(filtradas.length ? [header].concat(filtradas) : []);
          break;

        case 'obterAmbientesVerificadosHoje':
          var hoje2 = new Date().toLocaleDateString('pt-BR');
          var s = {};
          mockRespostas.forEach(function (l) {
            if (String(l[0]).indexOf(hoje2) !== 0) return;
            var sub = (l[4] || '').trim();
            if (!sub || sub === '(Registro de ambiente)') return;
            s[(l[2] || '') + '|' + (l[3] || '') + '|' + sub] = 1;
          });
          ok(Object.keys(s).length);
          break;

        case 'obterHistorico6Meses':
          var meses = [];
          var agora2 = new Date();
          for (var i = 5; i >= 0; i--) {
            var d = new Date(agora2.getFullYear(), agora2.getMonth() - i, 1);
            meses.push({ mes: d.getMonth() + 1, ano: d.getFullYear(), label: MN[d.getMonth()] + '/' + String(d.getFullYear()).slice(2), subambientes: 0, ok: 0, inadequados: 0, na: 0, primeiroRegistro: null });
          }
          ok({ meses: meses, totalSubambientes: 0, totalVisitados: 0, totalInadequados: 0, percentualCobertura: 0 });
          break;

        default:
          fail(new Error('Função não encontrada no mock: ' + fn));
      }
    } catch (e) {
      fail(e);
    }
  }

  return { call: call };
})();

// ─── Wrappers que imitam google.script.run ────────────────────────
var googleScriptRun = {
  puxarDadosBase: function (u) {
    return api.call('puxarDadosBase', [u]);
  },
  salvarRegistro: function (pct) {
    return api.call('salvarRegistro', [pct]);
  },
  obterRespostasDoDia: function () {
    return api.call('obterRespostasDoDia', []);
  },
  obterAmbientesVerificadosHoje: function () {
    return api.call('obterAmbientesVerificadosHoje', []);
  },
  obterHistorico6Meses: function (u) {
    return api.call('obterHistorico6Meses', [u]);
  }
};

// ─── Conectividade ───────────────────────────────────────────────
function chkNet() {
  var el = document.getElementById('snet');
  var bc = document.getElementById('bcache');
  if (navigator.onLine) {
    el.className = 'snet online'; el.textContent = '📡 ONLINE';
    if (bc) bc.classList.remove('vis');
  } else {
    el.className = 'snet offline'; el.textContent = '🔴 OFFLINE';
    if (bc) bc.classList.add('vis');
  }
}
window.addEventListener('online',  function () { chkNet(); processarFila(); });
window.addEventListener('offline', chkNet);

// ─── Ciclo ───────────────────────────────────────────────────────
function cicloInfo(nome, totalSubs) {
  var c = CICLOS[nrm(nome)];
  if (!c || totalSubs === 0) return {
    media: totalSubs > 0 ? (totalSubs / 6).toFixed(1) : '—',
    sub:   totalSubs > 0 ? totalSubs + ' amb. ÷ 6 meses' : 'Selecione uma unidade'
  };
  var mes = new Date().getMonth() + 1, dentro = mes >= c.i && mes <= c.f;
  var ini = MN[c.i - 1], fim = MN[c.f - 1];
  if (dentro) { var r = c.f - mes + 1; return { media: (totalSubs / r).toFixed(1), sub: ini + '–' + fim + ' · ' + r + 'm restantes' }; }
  return { media: (totalSubs / 6).toFixed(1), sub: ini + '–' + fim + ' · fora do ciclo' };
}

// ─── Fila offline ────────────────────────────────────────────────
function getFila()    { try { return JSON.parse(localStorage.getItem(FILA_K) || '[]'); } catch (e) { return []; } }
function setFila(f)   { try { localStorage.setItem(FILA_K, JSON.stringify(f)); } catch (e) {} }
function addFila(p)   { var f = getFila(); f.push(p); setFila(f); updFila(); }
function updFila() {
  var f = getFila(), el = document.getElementById('sfila');
  if (f.length > 0) { el.style.display = 'inline-flex'; el.textContent = '⏳ Fila: ' + f.length; }
  else el.style.display = 'none';
}
function processarFila() {
  if (ENVIANDO || !navigator.onLine) return;
  var f = getFila(); if (!f.length) return;
  ENVIANDO = true;
  googleScriptRun.salvarRegistro(f[0])
    .withSuccessHandler(function () {
      var ff = getFila(); ff.shift(); setFila(ff);
      updFila(); ENVIANDO = false;
      if (ff.length > 0) processarFila(); else toast('✅ Fila enviada com sucesso!');
    })
    .withFailureHandler(function (e) { console.error(e); ENVIANDO = false; toast('❌ Erro ao enviar fila.', 5000); });
}
setInterval(function () { if (navigator.onLine) processarFila(); }, 30000);

// ─── Cache offline ───────────────────────────────────────────────
function salvarCacheDB(dados, status) {
  try { localStorage.setItem(CACHE_DB_K, JSON.stringify(dados)); localStorage.setItem(CACHE_ST_K, JSON.stringify(status)); }
  catch (e) { try { localStorage.removeItem(CACHE_DB_K); localStorage.removeItem(CACHE_ST_K); } catch (e2) {} }
}
function carregarCacheDB() {
  try {
    var d = localStorage.getItem(CACHE_DB_K);
    var s = localStorage.getItem(CACHE_ST_K);
    if (!d) return null;
    return { dados: JSON.parse(d), ultimosStatus: s ? JSON.parse(s) : {} };
  } catch (e) { return null; }
}

// ─── Regra 6 meses ───────────────────────────────────────────────
function precisaReaval(uid) {
  var st = STATUS[uid];
  if (!st || !st.dataUltimaAval || st.status.toUpperCase() !== 'OK') return false;
  var p = st.dataUltimaAval.split('/'); if (p.length < 3) return false;
  var dt = new Date(+p[2], +p[1] - 1, +p[0]); if (isNaN(dt.getTime())) return false;
  return ((new Date() - dt) / (1000 * 60 * 60 * 24 * 30.44)) >= 6;
}
function mesesDesde(uid) {
  var st = STATUS[uid]; if (!st || !st.dataUltimaAval) return null;
  var p = st.dataUltimaAval.split('/'); if (p.length < 3) return null;
  var dt = new Date(+p[2], +p[1] - 1, +p[0]); if (isNaN(dt.getTime())) return null;
  return Math.floor((new Date() - dt) / (1000 * 60 * 60 * 24 * 30.44));
}

// ─── Resolver status ─────────────────────────────────────────────
function resStatus(item) {
  var uid = item[DI.UID];
  if (_rsCache[uid] !== undefined) return _rsCache[uid];
  var result = _calcStatus(item);
  _rsCache[uid] = result;
  return result;
}
function _calcStatus(item) {
  var uid = item[DI.UID];
  var s = SEL.find(function (x) { return x.uid === uid; });
  if (s && s.v && s.v.trim() !== '') return s.v;
  if (STATUS[uid] && STATUS[uid].status) {
    var rc = STATUS[uid].status.trim().toUpperCase();
    if (rc === 'OK')         return 'Ok';
    if (rc === 'INADEQUADO') return 'Inadequado';
    if (rc === 'N/A')        return 'N/A';
    if (rc !== '')           return 'Ok';
  }
  var colK = nrm(item[DI.INAD]);
  if (colK === 'verdadeiro' || colK === 'true') return 'Inadequado';
  var colJ = nrm(item[DI.ADEQ]);
  if (colJ === 'verdadeiro' || colJ === 'true') return 'Ok';
  var colI = nrm(item[DI.AVAL]);
  if (colI === 'n/a' || colI === 'nao_aplicavel' || colI === 'nao aplicavel' ||
      colI === 'não aplicável' || colI === 'na') return 'N/A';
  return 'Nao Avaliado';
}

// ─── Carregar dados ───────────────────────────────────────────────
function carregar(u) {
  if (u === undefined) u = document.getElementById('u').value.trim();
  invCache(); invRsCache();

  if (!navigator.onLine) {
    var cached = carregarCacheDB();
    if (cached) {
      DB = cached.dados; STATUS = cached.ultimosStatus || {};
      popularFiltros(); renderLista(); updContadores();
      if (u) carregarHist(u);
      toast('📦 Offline — dados do cache local.');
    } else {
      DB = []; STATUS = {};
      popularFiltros(); renderLista(); updContadores();
      toast('🔴 Offline e sem cache. Conecte-se primeiro.', 5000);
    }
    return;
  }

  toast('⏳ Carregando dados...');
  googleScriptRun.puxarDadosBase(u)
    .withSuccessHandler(function (r) {
      if (!r || !r.dados) { toast('⚠️ Servidor retornou dados vazios.', 4000); return; }
      DB = r.dados; STATUS = r.ultimosStatus || {};
      invCache(); invRsCache();
      salvarCacheDB(r.dados, r.ultimosStatus || {});
      if (!u && r.unidadesAvaliadas && r.unidadesAvaliadas.length > 0) {
        UNIDS_AVAL = {};
        r.unidadesAvaliadas.forEach(function (uCanon) { UNIDS_AVAL[nrmU(uCanon)] = true; });
      }
      popularFiltros(); renderLista(); updContadores();
      var uu = document.getElementById('u').value.trim();
      if (uu) carregarHist(uu);
      var numItens   = r.dados.length > 1 ? (r.dados.length - 1) : 0;
      var numUnidades = r.unidadesUnicas ? r.unidadesUnicas.length : 0;
      toast('✅ ' + numItens + ' itens carregados (' + numUnidades + ' unidades)');
    })
    .withFailureHandler(function (e) {
      console.error('Erro ao carregar dados:', e);
      var cached = carregarCacheDB();
      if (cached) {
        DB = cached.dados; STATUS = cached.ultimosStatus || {};
        toast('⚠️ Erro no servidor — usando cache local.', 4000);
      } else {
        toast('❌ Erro: ' + (e.message || e), 5000);
        DB = []; STATUS = {};
      }
      invCache(); invRsCache();
      popularFiltros(); renderLista(); updContadores();
    });
}

// ─── Popular filtros ─────────────────────────────────────────────
function popularFiltros() {
  var ul = document.getElementById('lu'), bl = document.getElementById('lb');
  var pl = document.getElementById('lpav'), sl = document.getElementById('lsub');
  ul.innerHTML = ''; bl.innerHTML = ''; pl.innerHTML = ''; sl.innerHTML = '';
  var uMap = {}, bSet = {}, pSet = {}, sSet = {};
  DB.slice(1).forEach(function (row) {
    var ru = (row[DI.UNI] || '').trim();
    if (ru) { var k = nrmU(ru); if (!uMap[k] || ru > uMap[k]) uMap[k] = ru; }
    var b = (row[DI.BLC] || '').trim(); if (b) bSet[b] = 1;
    var p = (row[DI.PAV] || '').trim(); if (p) pSet[p] = 1;
    var s = (row[DI.SUB] || '').trim(); if (s) sSet[s] = 1;
  });
  Object.keys(uMap).sort().forEach(function (k) {
    if (!UNIDS_AVAL || UNIDS_AVAL[k]) ul.innerHTML += '<option value="' + esc(uMap[k]) + '">';
  });
  Object.keys(bSet).sort().forEach(function (v) { bl.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(pSet).sort().forEach(function (v) { pl.innerHTML += '<option value="' + esc(v) + '">'; });
  Object.keys(sSet).sort().forEach(function (v) { sl.innerHTML += '<option value="' + esc(v) + '">'; });
  var sf = JSON.parse(localStorage.getItem(F

