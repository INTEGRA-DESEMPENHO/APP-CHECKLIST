// app.js — Frontend para Vistoria Fênix v9 (OTIMIZADO E CORRIGIDO)
// Comunica-se com SheetDB.io para leitura da BASE DE DADOS e Google Apps Script para escrita/status.

// --- CONFIGURAÇÃO ---
// COLOQUE A URL DO SEU GOOGLE APPS SCRIPT AQUI!
// Ex: 'https://script.google.com/macros/s/AKfycb.../exec'
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbybOSka1lW5bxjBrjIIRyOXTjAjDAx0SUpOUY79u_d8NIzIBvu786K_zYYMQzgztTbw/exec'; // <-- SUBSTITUA AQUI PELA URL DO SEU APPS SCRIPT!

// COLOQUE A URL DA SUA API SHEETDB.IO AQUI!
// Ex: 'https://sheetdb.io/api/v1/p5kdwbijb335u'
const SHEETDB_API_URL = 'https://sheetdb.io/api/v1/p5kdwbijb335u'; // <-- SUBSTITUA AQUI PELA URL DA SUA API SHEETDB.IO!

// --- Chaves no localStorage ---
var LS_FILTROS   = 'vfx_filt_v9';
var LS_CACHE_DB  = 'vfx_cache_db_v9';  // Cache da BASE DE DADOS (do SheetDB)
var LS_CACHE_ST  = 'vfx_cache_st_v9';  // Cache dos STATUS (do GAS)
var LS_FILA_SAVE = 'vfx_fila_save_v9'; // Fila de pacotes para salvar (para o GAS)

// --- Constantes ---
var CICLOS = {
  'rei pele':       {i:1,f:6},
  'papa francisco': {i:2,f:7},
  'padre ticao':    {i:3,f:8},
  'padre chicao':   {i:3,f:8},
  'silvio santos':  {i:4,f:9}
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

var DI = { // Índices das colunas (ajustados para o formato SheetDB ou GAS)
  ORD:0,UNI:1,UNINORM:2,BLC:3,PAV:4,AMB_TAG:5,
  SUB:6,DESC:7,AVAL:8,ADEQ:9,INAD:10,PEND:11,OBS:12,UID:13
};

// --- Estado em memória ---
var DB = [];         // Dados da BASE DE DADOS (carregados do SheetDB ou cache)
var STATUS = {};     // Últimos status dos itens (carregados do GAS ou cache)
var SEL = [];        // Seleções da sessão atual (itens marcados para salvar)
var FSUB = [];       // Fotos do subambiente atual (em base64)
var FOTO_CTX = null; // Contexto da foto (item ou subambiente)
var _rsCache = {};   // Cache para resStatus
function invRsCache(){_rsCache={};}

// --- Utilitários ---
function nrm(s){
  return (s||'').toString().trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'');
}
function nrmU(s){return nrm(s);}
function esc(s){
  return String(s)
    .replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function toast(m,d){
  d=d||2500;
  var t=document.getElementById('toast');
  t.textContent=m; t.className='show';
  setTimeout(function(){t.className=t.className.replace('show','');},d);
}
function hojeStr(){return new Date().toLocaleDateString('pt-BR');}
function fmtDataHora(dt){
  return dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR');
}

// --- localStorage helpers ---
function lsGet(k){
  try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}
}
function lsSet(k,v){
  try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}
}

// --- Fila de salvamento offline ---
function getFilaSave(){return lsGet(LS_FILA_SAVE)||[];}
function setFilaSave(f){lsSet(LS_FILA_SAVE,f);}
function addFilaSave(pacote){
  var f=getFilaSave();
  f.push(pacote);
  setFilaSave(f);
  updFila();
}
var ENVIANDO_FILA = false;
async function processarFila(){
  if(ENVIANDO_FILA || !navigator.onLine) return;
  var fila = getFilaSave();
  if(!fila.length) return;

  ENVIANDO_FILA = true;
  toast('⏳ Enviando fila offline (' + fila.length + ')...');
  try {
    await callGas('salvarRegistrosEmLote', {}, 'POST', fila);
    setFilaSave([]); // Limpa a fila após sucesso
    toast('✅ Fila enviada com sucesso!');
    updFila();
    // Recarrega os dados para refletir as novas avaliações
    carregar(document.getElementById('u').value.trim());
  } catch (error) {
    toast('❌ Erro ao enviar fila: ' + error.message, 5000);
  } finally {
    ENVIANDO_FILA = false;
  }
}
function updFila(){
  var f=getFilaSave(),el=document.getElementById('sfila');
  if(f.length>0){el.style.display='inline-flex';el.textContent='⏳ Fila: '+f.length;}
  else el.style.display='none';
}
// Processa a fila a cada 30 segundos se online
setInterval(function(){if(navigator.onLine)processarFila();},30000);


// --- Cache de dados da base e status ---
function salvarCacheDados(dados, status, unidadesUnicas){
  lsSet(LS_CACHE_DB, dados);
  lsSet(LS_CACHE_ST, status);
  lsSet('vfx_cache_unidades_v9', unidadesUnicas); // Salva unidades únicas também
}
function carregarCacheDados(){
  var db = lsGet(LS_CACHE_DB);
  var st = lsGet(LS_CACHE_ST);
  var uu = lsGet('vfx_cache_unidades_v9');
  if(db && st && uu) return { dados: db, ultimosStatus: st, unidadesUnicas: uu };
  return null;
}


// --- Comunicação com Google Apps Script (API) ---
async function callGas(action, params = {}, method = 'GET', data = null) {
  let url = new URL(GAS_WEB_APP_URL);
  url.searchParams.append('action', action);
  for (const key in params) {
    url.searchParams.append(key, params[key]);
  }

  let options = {
    method: method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (method === 'POST' && data) {
    options.body = JSON.stringify({ action: action, data: data });
  }

  try {
    const response = await fetch(url.toString(), options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    if (result.status === "success" && result.data) { // GAS retorna {status: "success", data: ...}
      if (result.data.erro) { // Se o erro veio do Apps Script
        throw new Error(result.data.erro);
      }
      return result.data;
    } else if (result.status === "success" && !result.data) { // Sucesso sem dados (ex: salvar)
      return { sucesso: true };
    } else {
      throw new Error(result.mensagem || 'Erro desconhecido na resposta do GAS.');
    }
  } catch (error) {
    console.error('Erro na comunicação com GAS:', error);
    throw error;
  }
}

// --- Comunicação com SheetDB.io (API) ---
async function callSheetDB() {
  try {
    const response = await fetch(SHEETDB_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Transforma o JSON do SheetDB (array de objetos) para o formato de array de arrays
    // e adiciona o cabeçalho como primeira linha.
    if (!data || data.length === 0) return { dados: [], unidadesUnicas: [] };

    // Cabeçalhos esperados pelo sistema (DI)
    const expectedHeaders = [
      'Ordem','Unidade','UniNorm','Bloco','Pavimento','AmbTag',
      'NomeAmb','Verificação','Aval','Adeq','Inad','Pend','Obs','UID'
    ];
    const transformedData = [expectedHeaders]; // Primeira linha é o cabeçalho

    const unidadesUnicas = new Set();

    data.forEach(row => {
      // Ajuste para 'Nome Ambiente' e 'TAG' do SheetDB
      const unidadeOriginal = row['Unidade'] || '';
      const bloco = row['Bloco'] || '';
      const pavimento = row['Pavimento'] || '';
      const subambiente = row['Nome Ambiente'] || ''; // Coluna 'Nome Ambiente' do SheetDB
      const verificacao = row['Verificação'] || '';

      const uCanon = nrm(unidadeOriginal); // Usar nrm para canonical
      const uNorm = nrm(unidadeOriginal); // Usar nrm para UniNorm
      const uid = [uNorm, nrm(bloco), nrm(pavimento), nrm(subambiente), nrm(verificacao)].join('||').substring(0, 200);

      // Mapeamento de colunas do SheetDB para o formato interno (DI)
      const mappedRow = [];
      mappedRow[DI.ORD] = row['Ordem'];
      mappedRow[DI.UNI] = unidadeOriginal;
      mappedRow[DI.UNINORM] = uNorm; // Calculado
      mappedRow[DI.BLC] = bloco;
      mappedRow[DI.PAV] = pavimento;
      mappedRow[DI.AMB_TAG] = row['TAG']; // Coluna 'TAG' do SheetDB
      mappedRow[DI.SUB] = subambiente; // Coluna 'Nome Ambiente' do SheetDB
      mappedRow[DI.DESC] = verificacao;
      mappedRow[DI.AVAL] = row['Local avaliado?']; // Coluna 'Local avaliado?' do SheetDB
      mappedRow[DI.ADEQ] = row['Adequado']; // Coluna 'Adequado' do SheetDB
      mappedRow[DI.INAD] = row['Inadequado']; // Coluna 'Inadequado' do SheetDB
      mappedRow[DI.PEND] = row['Descrição Pendência']; // Coluna 'Descrição Pendência' do SheetDB
      mappedRow[DI.OBS] = row['Observações/Pontos de atenção']; // Coluna 'Observações/Pontos de atenção' do SheetDB
      mappedRow[DI.UID] = uid; // Calculado

      transformedData.push(mappedRow);
      unidadesUnicas.add(uCanon);
    });

    return {
      dados: transformedData,
      unidadesUnicas: Array.from(unidadesUnicas).sort()
    };

  } catch (error) {
    console.error('Erro na comunicação com SheetDB:', error);
    throw error;
  }
}

// --- Reavaliação (6 meses) ---
function precisaReaval(uid){
  var st=STATUS[uid];
  if(!st||!st.dataUltimaAval||st.status.toUpperCase()!=='OK')return false;
  var p=st.dataUltimaAval.split('/');if(p.length<3)return false;
  var dt=new Date(+p[2],+p[1]-1,+p[0]);if(isNaN(dt.getTime()))return false;
  return ((new Date()-dt)/(1000*60*60*24*30.44))>=6;
}
function mesesDesde(uid){
  var st=STATUS[uid];if(!st||!st.dataUltimaAval)return null;
  var p=st.dataUltimaAval.split('/');if(p.length<3)return null;
  var dt=new Date(+p[2],+p[1]-1,+p[0]);if(isNaN(dt.getTime()))return null;
  return Math.floor((new Date()-dt)/(1000*60*60*24*30.44));
}

// --- Ciclos de unidade ---
function cicloInfo(nome,totalSubs){
  var c=CICLOS[nrm(nome)];
  if(!c||totalSubs===0)return{
    media:totalSubs>0?(totalSubs/6).toFixed(1):'—',
    sub:totalSubs>0?totalSubs+' amb. ÷ 6 meses':'Selecione uma unidade'
  };
  var mes=new Date().getMonth()+1,dentro=mes>=c.i&&mes<=c.f;
  var ini=MN[c.i-1],fim=MN[c.f-1];
  if(dentro){var r=c.f-mes+1;return{media:(totalSubs/r).toFixed(1),sub:ini+'–'+fim+' · '+r+'m restantes'};}
  return{media:(totalSubs/6).toFixed(1),sub:ini+'–'+fim+' · fora do ciclo'};
}

// --- Resolver status de item ---
function resStatus(item){
  var uid=item[DI.UID];
  if(_rsCache[uid]!==undefined)return _rsCache[uid];
  var r=_calcStatus(item);
  _rsCache[uid]=r;
  return r;
}
function _calcStatus(item){
  var uid=item[DI.UID];

  // 1. seleção da sessão
  var s=SEL.find(function(x){return x.uid===uid;});
  if(s&&s.v&&s.v.trim()!=='')return s.v;

  // 2. STATUS carregado do GAS
  if(STATUS[uid]&&STATUS[uid].status){
    var rc=STATUS[uid].status.trim().toUpperCase();
    if(rc==='OK')         return 'Ok';
    if(rc==='INADEQUADO') return 'Inadequado';
    if(rc==='N/A')        return 'N/A';
    if(rc!=='')           return 'Ok';
  }

  // 3. BASE DE DADOS (valores iniciais)
  var colK=nrm(item[DI.INAD]);
  if(colK==='verdadeiro'||colK==='true')return'Inadequado';
  var colJ=nrm(item[DI.ADEQ]);
  if(colJ==='verdadeiro'||colJ==='true')return'Ok';
  var colI=nrm(item[DI.AVAL]);
  if(colI==='n/a'||colI==='nao_aplicavel'||colI==='nao aplicavel'||
     colI==='não aplicável'||colI==='na')return'N/A';

  return 'Nao Avaliado';
}

// --- Carregar dados (SheetDB para base, GAS para status) ---
async function carregar(u){
  if(u===undefined)u=document.getElementById('u').value.trim();
  invCache();invRsCache();

  let cachedData = carregarCacheDados();
  let bcacheEl = document.getElementById('bcache');

  if (!navigator.onLine) {
    if (cachedData) {
      DB = cachedData.dados;
      STATUS = cachedData.ultimosStatus;
      toast('📦 Offline — usando cache local.', 4000);
      bcacheEl.classList.add('vis');
      popularFiltros(cachedData.unidadesUnicas);
      renderLista();
      updContadores();
      if(u)carregarHist(u);
    } else {
      toast('🔴 Offline e sem cache. Conecte-se para carregar dados.', 5000);
      bcacheEl.classList.add('vis');
      DB = []; STATUS = {};
      popularFiltros([]);
      renderLista();
      updContadores();
    }
    return;
  } else {
    bcacheEl.classList.remove('vis');
  }

  // Se online, tenta carregar do servidor
  toast('⏳ Carregando dados do servidor...');
  try {
    const sheetdbResult = await callSheetDB(); // Puxa a base do SheetDB
    const gasStatusResult = await callGas('obterTodosUltimosStatus'); // Puxa status do GAS

    DB = sheetdbResult.dados;
    STATUS = gasStatusResult || {}; // Garante que STATUS seja um objeto

    // Salva no cache local
    salvarCacheDados(DB, STATUS, sheetdbResult.unidadesUnicas);

    toast('✅ Dados carregados do servidor!');
    popularFiltros(sheetdbResult.unidadesUnicas);
    renderLista();
    updContadores();
    if(u)carregarHist(u);
  } catch (error) {
    console.error('Erro ao carregar dados do servidor:', error);
    if (cachedData) {
      DB = cachedData.dados;
      STATUS = cachedData.ultimosStatus;
      toast('❌ Erro ao carregar do servidor. Usando cache local.', 5000);
      bcacheEl.classList.add('vis');
      popularFiltros(cachedData.unidadesUnicas);
      renderLista();
      updContadores();
      if(u)carregarHist(u);
    } else {
      toast('❌ Erro ao carregar dados: ' + error.message + '. Sem cache.', 5000);
      DB = []; STATUS = {};
      popularFiltros([]);
      renderLista();
      updContadores();
    }
  }
}

// --- Filtros / datalists ---
function popularFiltros(unidadesUnicasFromSource = []){
  var ul=document.getElementById('lu'),bl=document.getElementById('lb');
  var pl=document.getElementById('lpav'),sl=document.getElementById('lsub');
  ul.innerHTML='';bl.innerHTML='';pl.innerHTML='';sl.innerHTML='';

  var uMap={},bSet={},pSet={},sSet={};

  unidadesUnicasFromSource.sort().forEach(function(uCanon){
    uMap[nrmU(uCanon)] = uCanon;
    ul.innerHTML+='<option value="'+esc(uCanon)+'">';
  });

  DB.slice(1).forEach(function(row){
    var b=(row[DI.BLC]||'').trim();if(b)bSet[b]=1;
    var p=(row[DI.PAV]||'').trim();if(p)pSet[p]=1;
    var s=(row[DI.SUB]||'').trim();if(s)sSet[s]=1;
  });

  Object.keys(bSet).sort().forEach(function(v){bl.innerHTML+='<option value="'+esc(v)+'">';});
  Object.keys(pSet).sort().forEach(function(v){pl.innerHTML+='<option value="'+esc(v)+'">';});
  Object.keys(sSet).sort().forEach(function(v){sl.innerHTML+='<option value="'+esc(v)+'">';});

  var sf=lsGet(LS_FILTROS)||{};
  document.getElementById('resp').value=sf.resp||'';
  document.getElementById('u').value   =sf.u   ||'';
  document.getElementById('b').value   =sf.b   ||'';
  document.getElementById('pav').value =sf.pav ||'';
  document.getElementById('sub').value =sf.sub ||'';
  document.getElementById('fst').value =sf.fst ||'NAO_AVALIADOS';
  ['resp','u','b','pav','sub'].forEach(mkpre);
}
function mkpre(id){
  var el=document.getElementById(id);
  if(el)el.classList.toggle('ok',el.value.trim()!=='');
}
function savFilt(){
  var f={
    resp:document.getElementById('resp').value.trim(),
    u:document.getElementById('u').value.trim(),
    b:document.getElementById('b').value.trim(),
    pav:document.getElementById('pav').value.trim(),
    sub:document.getElementById('sub').value.trim(),
    fst:document.getElementById('fst').value
  };
  lsSet(LS_FILTROS,f);
  ['resp','u','b','pav','sub'].forEach(mkpre);
}

// --- Itens filtrados ---
var _ci=null,_cc='';
function invCache(){_ci=null;_cc='';}
function getItens(){
  var uv=nrmU(document.getElementById('u').value);
  var bv=nrm(document.getElementById('b').value);
  var pv=nrm(document.getElementById('pav').value);
  var sv=nrm(document.getElementById('sub').value);
  if(!uv)return[];
  var ch=uv+'|'+bv+'|'+pv+'|'+sv;
  if(_cc===ch&&_ci)return _ci;
  _cc=ch;
  _ci=DB.slice(1).filter(function(item){
    var ui=(item[DI.UNINORM]||nrmU(item[DI.UNI])||'').trim();
    return ui===uv &&
      (bv===''||nrm(item[DI.BLC])===bv) &&
      (pv===''||nrm(item[DI.PAV])===pv) &&
      (sv===''||nrm(item[DI.SUB])===sv);
  });
  return _ci;
}

// --- Filtros rápidos (cards superiores) ---
var _dt=null;
function updCDebounced(){clearTimeout(_dt);_dt=setTimeout(updContadores,80);}

function filtroReaval(){
  if(!document.getElementById('u').value.trim()){toast('Selecione uma unidade.',3000);return;}
  document.getElementById('fst').value='AVALIADOS_OK';
  savFilt();renderLista();updContadores();
  window.scrollTo({top:document.getElementById('lista').offsetTop-20,behavior:'smooth'});
}
function filtroNA(){
  if(!document.getElementById('u').value.trim()){toast('Selecione uma unidade.',3000);return;}
  document.getElementById('fst').value='NA_PENDENTES';
  savFilt();renderLista();updContadores();
  window.scrollTo({top:document.getElementById('lista').offsetTop-20,behavior:'smooth'});
}

// --- Marcar status de um item ---
function marcar(uid,v,uni,bl,pav,amb,desc,tipo){
  delete _rsCache[uid];
  var s=SEL.find(function(x){return x.uid===uid;});
  if(!s){
    s={uid:uid,v:'',obs:'',achados:[],p:desc,amb:amb,pav:pav,fotos:[],tipo:tipo,unidade:uni,bloco:bl};
    SEL.push(s);
  }
  s.v=v;
  var card=document.querySelector('.ic[data-uid="'+uid+'"]');
  if(card){
    card.querySelectorAll('.bopt').forEach(function(b){b.classList.remove('aok','ank','ana');});
    var ab=card.querySelector('.bopt[data-v="'+v+'"]');
    if(ab)ab.classList.add(v==='Ok'?'aok':v==='Inadequado'?'ank':'ana');
    var si=card.querySelector('.sicon');
    if(si)si.textContent=v==='Ok'?'✅':v==='Inadequado'?'❌':v==='N/A'?'⚫':'⬜';
    card.classList.remove('inad','ina','ior');
    if(v==='Inadequado')card.classList.add('inad');
    else if(v==='N/A')card.classList.add('ina');
    var sf=document.getElementById('fst').value;
    var out=(sf==='NAO_AVALIADOS'&&(v==='Ok'||v==='Inadequado'||v==='N/A'))||
            (sf==='INADEQUACOES'&&v==='Ok')||
            (sf==='NA_PENDENTES'&&v==='Ok');
    if(out){
      card.classList.add('out');
      card.addEventListener('transitionend',function(){card.remove();updCDebounced();updPBar();},{once:true});
    } else {updCDebounced();updPBar();}
  }else{
    invCache();renderLista();updCDebounced();
  }
}

// --- Helpers HTML de card/foto ---
function thumbH(uid,i,src){
  var ua=(uid===null||uid==='')?'':' data-uid="'+esc(uid)+'"';
  return '<div class="thumb"><img src="'+esc(src)+'" alt="Foto '+i+'">'+
    '<button class="tdel"'+ua+' data-idx="'+i+'" title="Remover">×</button></div>';
}
function cardSubHTML(sub){
  var h=FSUB.map(function(f,i){return thumbH('',i,f.b64);}).join('');
  return '<div class="csubfoto"><div class="slbl">📷 Fotos do Subambiente: '+esc(sub)+'</div>'+
    '<div class="galeria" id="gsub">'+h+'</div>'+
    '<div class="bfoto" data-uid="">📸 Adicionar Foto do Subambiente</div></div>';
}
function progBarHTML(todos,sub){
  var its=todos.filter(function(r){return (r[DI.SUB]||'Sem Subambiente')===sub;});
  var total=its.length;if(!total)return'';
  var ok=0,nk=0,na=0;
  its.forEach(function(it){var s=resStatus(it);if(s==='Ok')ok++;else if(s==='Inadequado')nk++;else if(s==='N/A')na++;});
  var av=ok+nk+na,pct=total>0?(av/total)*100:0;
  return '<div class="progwrap"><div class="progbg"><div class="progfill" style="width:'+pct+'%"></div></div>'+
    '<div class="proglbl">'+av+' de '+total+' avaliados ('+pct.toFixed(0)+'%) — ✅'+ok+' ok · ❌'+nk+' inad. · ⚫'+na+' N/A · ⏳'+(total-av)+' faltando</div></div>';
}

function cardH(item,idx){
  var uni=item[DI.UNI]||'',bl=item[DI.BLC]||'',pav=item[DI.PAV]||'';
  var amb=item[DI.SUB]||'',desc=item[DI.DESC]||'',uid=item[DI.UID];
  var st=resStatus(item);
  var sl=SEL.find(function(x){return x.uid===uid;});
  var obsH =(STATUS[uid]&&STATUS[uid].obs)?STATUS[uid].obs:String(item[DI.OBS]||'').trim();
  var achH =(STATUS[uid]&&STATUS[uid].achados)?STATUS[uid].achados:'';
  var pendH=String(item[DI.PEND]||'').trim();
  var dtAv =(STATUS[uid]&&STATUS[uid].dataUltimaAval)?STATUS[uid].dataUltimaAval:'';
  var isOk=st==='Ok',isIN=st==='Inadequado',isNA=st==='N/A';
  var hasA=pendH||obsH||achH;
  var prR=isOk&&precisaReaval(uid),mp=mesesDesde(uid);

  var cls='ic';
  if(isNA)cls+=' ina';
  else if(isIN||hasA)cls+=' inad';
  else if(isOk&&prR)cls+=' ior';

  var hHtml='';
  if(hasA){
    hHtml='<div class="hbox">'+
      (pendH?'<div>📋 <b>Pendência:</b> '+esc(pendH)+'</div>':'')+
      (obsH ?'<div>💬 <b>Última Obs:</b> '+esc(obsH)+'</div>':'')+
      (achH ?'<div>🔎 <b>Achados:</b> '+esc(achH)+'</div>':'')+
      '</div>';
  }

  var rvB=prR?'<div class="breavbadge">🔄 Reavaliação vencida'+(mp!==null?' ('+mp+'m atrás)':'')+'</div>':
    (isOk&&dtAv?'<div style="font-size:11px;color:var(--text2);margin-bottom:6px;">✅ Avaliado em '+esc(dtAv)+'</div>':'');
  var naB=isNA?'<div class="bnabadge">⚫ N/A — Retornar</div>':'';

  var fH=(sl&&sl.fotos)?sl.fotos.map(function(f,i){return thumbH(uid,i,f.b64);}).join(''):'';
  var obsV=sl?esc(sl.obs||''):'';
  var achSel=(sl&&sl.achados)?sl.achados:(achH?achH.split(', ').filter(Boolean):[]);
  var chipsH=ACHADOS.map(function(a){
    var at=achSel.indexOf(a)>=0?' sel':'';
    return '<span class="chip'+at+'" data-uid="'+esc(uid)+'" data-ach="'+esc(a)+'">'+esc(a)+'</span>';
  }).join('');

  var si=isOk?'✅':isIN?'❌':isNA?'⚫':'⬜';
  var aOk=isOk?'aok':'',aNk=isIN?'ank':'',aNa=isNA?'ana':'';
  var tipo=isIN?'Inadequado':isNA?'N/A':isOk?'Adequado':'Normal';

  return '<div class="'+cls+'" data-uid="'+esc(uid)+'">'+
    '<div class="ihr"><div class="inum">'+(idx+1)+'</div>'+
    '<div class="iinf"><div class="iloc">'+esc(pav)+' › '+esc(amb)+'</div>'+
    '<div class="idesc">'+esc(desc)+'</div></div>'+
    '<span class="sicon" style="font-size:18px;color:var(--text2);margin-left:8px;flex-shrink:0;">'+si+'</span></div>'+
    rvB+naB+hHtml+
    '<div class="bgrp">'+
      '<button class="bopt '+aOk+'" data-v="Ok" data-uid="'+esc(uid)+'" data-uni="'+esc(uni)+'" data-bl="'+esc(bl)+'" data-pav="'+esc(pav)+'" data-amb="'+esc(amb)+'" data-desc="'+esc(desc)+'" data-tipo="'+tipo+'">✅ OK</button>'+
      '<button class="bopt '+aNk+'" data-v="Inadequado" data-uid="'+esc(uid)+'" data-uni="'+esc(uni)+'" data-bl="'+esc(bl)+'" data-pav="'+esc(pav)+'" data-amb="'+esc(amb)+'" data-desc="'+esc(desc)+'" data-tipo="'+tipo+'">❌ INADEQUADO</button>'+
      '<button class="bopt '+aNa+'" data-v="N/A" data-uid="'+esc(uid)+'" data-uni="'+esc(uni)+'" data-bl="'+esc(bl)+'" data-pav="'+esc(pav)+'" data-amb="'+esc(amb)+'" data-desc="'+esc(desc)+'" data-tipo="'+tipo+'">⚫ N/A</button>'+
    '</div>'+
    '<div class="achw"><span class="achl">🔍 O que foi encontrado?</span>'+
      '<div class="achg">'+chipsH+'</div></div>'+
    '<div class="obsw"><textarea data-uid="'+esc(uid)+'" placeholder="Observações adicionais..." rows="3">'+obsV+'</textarea>'+
      '<button class="bmic" data-muid="'+esc(uid)+'">🎙️</button></div>'+
    '<div class="galeria" id="g'+esc(uid)+'">'+fH+'</div>'+
    '<div class="bfoto" data-uid="'+esc(uid)+'">📸 Adicionar Foto</div>'+
  '</div>';
}

// --- Render lista principal ---
function renderLista(){
  var lista=document.getElementById('lista');
  var u=document.getElementById('u').value.trim();
  var sub=document.getElementById('sub').value.trim();
  var sf=document.getElementById('fst').value;
  lista.innerHTML='';
  if(!u){lista.innerHTML='<div class="empty">Selecione uma unidade para começar.</div>';return;}

  var todos=getItens(),subMap={};
  var statusCache={};
  todos.forEach(function(it){
    var s=resStatus(it);
    statusCache[it[DI.UID]]=s;
    var ns=it[DI.SUB]||'Sem Subambiente';
    var bl=it[DI.BLC]||'',pv=it[DI.PAV]||'';
    var ck=bl+'|'+pv+'|'+ns;
    if(!subMap[ck])subMap[ck]={total:0,ok:0,nk:0,na:0,naoAv:0,itens:[],bloco:bl,pav:pv,sub:ns};
    var d=subMap[ck];d.total++;d.itens.push(it);
    if(s==='Ok')d.ok++;
    else if(s==='Inadequado'){d.nk++;}
    else if(s==='N/A'){d.na++;}
    else d.naoAv++;
  });

  var parts=[];

  if(sub){
    parts.push(cardSubHTML(sub));
    parts.push(progBarHTML(todos,sub));
    var its=todos.filter(function(it){return (it[DI.SUB]||'Sem Subambiente')===sub;});
    if(!its.length){parts.push('<div class="empty">Nenhum item para "'+esc(sub)+'".</div>');}
    else{
      var tit=sf==='AVALIADOS_OK'?'🔄 REAVALIAÇÃO — Itens OK':
              sf==='NA_PENDENTES'?'⚫ N/A — Retornar':'CHECKLIST';
      parts.push('<h2 class="stit">'+tit+': '+esc(sub)+'</h2>');
      var filt=its.filter(function(it){
        var s=statusCache[it[DI.UID]];
        if(sf==='NAO_AVALIADOS') return s==='Nao Avaliado';
        if(sf==='INADEQUACOES')  return s==='Inadequado';
        if(sf==='NA_PENDENTES')  return s==='N/A';
        if(sf==='AVALIADOS_OK')  return s==='Ok';
        return true;
      });
      if(!filt.length){
        var msg=sf==='NAO_AVALIADOS'?'✅ Todos os itens já foram avaliados neste subambiente!':
                sf==='INADEQUACOES'?'Nenhuma inadequação pendente. ✅':
                sf==='NA_PENDENTES'?'Nenhum N/A pendente. ✅':
                sf==='AVALIADOS_OK'?'Nenhum item OK encontrado.':'Nenhum item.';
        parts.push('<div class="empty">'+msg+'</div>');
      }else{
        parts.push('<div style="font-size:13px;color:var(--text2);margin-bottom:12px;padding:8px 12px;background:#e8f0fe;border-radius:12px;">'+
          '📋 <strong>'+filt.length+' item(ns)</strong> encontrado(s) para o filtro selecionado.</div>');
        filt.forEach(function(it,i){parts.push(cardH(it,i));});
      }
    }
  }else{
    var subs=Object.keys(subMap).sort(function(a,b){
      var pa=a.split('|'),pb=b.split('|');
      if(pa[0]!==pb[0])return pa[0].localeCompare(pb[0]);
      if(pa[1]!==pb[1])return pa[1].localeCompare(pb[1]);
      return pa[2].localeCompare(pb[2]);
    });

    if(sf==='NAO_AVALIADOS')     subs=subs.filter(function(k){return subMap[k].naoAv>0;});
    else if(sf==='INADEQUACOES') subs=subs.filter(function(k){return subMap[k].nk>0;});
    else if(sf==='NA_PENDENTES') subs=subs.filter(function(k){return subMap[k].na>0;});
    else if(sf==='AVALIADOS_OK') subs=subs.filter(function(k){return subMap[k].ok>0;});
    else subs=subs.filter(function(k){var d=subMap[k];return d.naoAv>0||d.nk>0||d.na>0;});

    if(!subs.length){
      var msg2=sf==='NAO_AVALIADOS'?'✅ Todos já foram avaliados!':
               sf==='INADEQUACOES'?'✅ Nenhuma inadequação pendente!':
               sf==='NA_PENDENTES'?'✅ Nenhum N/A pendente!':
               sf==='AVALIADOS_OK'?'Nenhum item OK. Avalie os itens primeiro.':'✅ Nenhuma pendência!';
      parts.push('<div class="empty">'+msg2+'</div>');
    }else{
      // Agrupamento por subambiente (cards clicáveis)
      var inadSubs = subs.filter(k => subMap[k].nk > 0);
      if ((sf === 'INADEQUACOES' || sf === 'TUDO') && inadSubs.length) {
        parts.push('<h2 class="stit" style="color:var(--danger);">❌ REAVALIAÇÕES PENDENTES</h2>');
        inadSubs.forEach(k => {
          const d = subMap[k];
          const vis = d.ok + d.nk + d.na;
          const flt = d.total - vis;
          const ex = d.itens.find(it => statusCache[it[DI.UID]] === 'Inadequado') || d.itens[0];
          const dn = (d.bloco ? d.bloco + ' - ' : '') + (d.pav ? d.pav + ' - ' : '') + d.sub;
          parts.push(
            `<div class="cig" data-uni="${esc(ex[DI.UNI])}" data-bl="${esc(d.bloco)}" data-pav="${esc(d.pav)}" data-sub="${esc(d.sub)}" data-filt="INADEQUACOES">` +
              `<div><div style="font-weight:700;font-size:16px;color:var(--danger);">${esc(dn)}</div>` +
              `<div style="font-size:13px;color:var(--text2);margin-top:4px;">` +
              `<span style="color:var(--danger);">❌ ${d.nk} inad.</span> • ` +
              `<span style="color:var(--primary);">📋 ${vis} visit.</span> • ` +
              `<span style="color:var(--warning);">⏳ ${flt} falt.</span></div></div>` +
              `<span style="font-size:20px;color:var(--danger);">›</span></div>`
          );
        });
      }

      const naPSubs = subs.filter(k => subMap[k].na > 0);
      if ((sf === 'NA_PENDENTES' || sf === 'TUDO') && naPSubs.length) {
        parts.push('<h2 class="stit" style="color:var(--na);">⚫ N/A PENDENTES — RETORNAR</h2>');
        naPSubs.forEach(k => {
          const d = subMap[k];
          const vis = d.ok + d.nk + d.na;
          const flt = d.total - vis;
          const ex = d.itens.find(it => statusCache[it[DI.UID]] === 'N/A') || d.itens[0];
          const dn = (d.bloco ? d.bloco + ' - ' : '') + (d.pav ? d.pav + ' - ' : '') + d.sub;
          parts.push(
            `<div class="cng" data-uni="${esc(ex[DI.UNI])}" data-bl="${esc(d.bloco)}" data-pav="${esc(d.pav)}" data-sub="${esc(d.sub)}" data-filt="NA_PENDENTES">` +
              `<div><div style="font-weight:700;font-size:16px;color:var(--na);">${esc(dn)}</div>` +
              `<div style="font-size:13px;color:var(--text2);margin-top:4px;">` +
              `<span style="color:var(--na);">⚫ ${d.na} N/A</span> • ` +
              `<span style="color:var(--primary);">📋 ${vis} visit.</span> • ` +
              `<span style="color:var(--warning);">⏳ ${flt} falt.</span></div></div>` +
              `<span style="font-size:20px;color:var(--na);">›</span></div>`
          );
        });
      }

      const okSubs = subs.filter(k => subMap[k].ok > 0);
      if ((sf === 'AVALIADOS_OK' || sf === 'TUDO') && okSubs.length) {
        parts.push('<h2 class="stit" style="color:var(--success);">🔄 AVALIADOS OK — REAVALIAR</h2>');
        parts.push('<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:14px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:#166534;line-height:1.6">' +
          '<b>📋 Regra:</b> Itens OK devem ser reavaliados a cada <b>6 meses</b>.</div>');
        okSubs.forEach(k => {
          const d = subMap[k];
          const ex = d.itens.find(it => statusCache[it[DI.UID]] === 'Ok') || d.itens[0];
          const dn = (d.bloco ? d.bloco + ' - ' : '') + (d.pav ? d.pav + ' - ' : '') + d.sub;
          const venc = d.itens.filter(it => statusCache[it[DI.UID]] === 'Ok' && precisaReaval(it[DI.UID])).length;
          const vB = venc > 0 ? `<span style="background:#fef3e0;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;">🔄 ${venc} venc.</span>` : '';
          parts.push(
            `<div class="cokl" data-uni="${esc(ex[DI.UNI])}" data-bl="${esc(d.bloco)}" data-pav="${esc(d.pav)}" data-sub="${esc(d.sub)}" data-filt="AVALIADOS_OK">` +
              `<div><div style="font-weight:700;font-size:16px;color:var(--success);display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${esc(dn)}${vB}</div>` +
              `<div style="font-size:13px;color:var(--text2);margin-top:4px;">` +
              `<span style="color:var(--success);">✅ ${d.ok} adeq.</span> • ` +
              `<span>📋 ${d.total} total</span></div></div>` +
              `<span style="font-size:20px;color:var(--success);">›</span></div>`
          );
        });
      }

      const naoAvSubs = subs.filter(k => subMap[k].naoAv > 0 && (sf === 'NAO_AVALIADOS' || (subMap[k].nk === 0 && subMap[k].na === 0)));
      if ((sf === 'NAO_AVALIADOS' || sf === 'TUDO') && naoAvSubs.length) {
        parts.push('<h2 class="stit" style="color:var(--warning);">⬜ SUBAMBIENTES NÃO AVALIADOS</h2>');
        parts.push('<div style="font-size:13px;color:var(--text2);margin-bottom:12px;padding:8px 12px;background:#fff3e0;border-radius:12px;">' +
          '📋 <strong>' + naoAvSubs.length + ' subambiente(s)</strong> aguardando avaliação. Clique para iniciar.</div>');
        naoAvSubs.forEach(k => {
          const d = subMap[k];
          const vis = d.ok + d.nk + d.na;
          const flt = d.total - vis;
          const ex = d.itens.find(it => statusCache[it[DI.UID]] === 'Nao Avaliado') || d.itens[0];
          const dn = (d.bloco ? d.bloco + ' - ' : '') + (d.pav ? d.pav + ' - ' : '') + d.sub;
          parts.push(
            `<div class="cnv2" data-uni="${esc(ex[DI.UNI])}" data-bl="${esc(d.bloco)}" data-pav="${esc(d.pav)}" data-sub="${esc(d.sub)}" data-filt="NAO_AVALIADOS">` +
              `<div><div style="font-weight:700;font-size:16px;color:var(--warning);">${esc(dn)}</div>` +
              `<div style="font-size:13px;color:var(--text2);margin-top:4px;">` +
              `<span style="color:var(--warning);">⬜ ${d.naoAv} não aval.</span> • ` +
              `<span style="color:var(--primary);">📋 ${vis} visit.</span> • ` +
              `<span style="color:var(--warning);">⏳ ${flt} falt.</span></div></div>` +
              `<span style="font-size:20px;color:var(--warning);">›</span></div>`
          );
        });
      }
    }
  }

  lista.innerHTML=parts.join('');
  renderGalerias();
}

// --- Limpar filtros secundários ---
function limparSecundarios(){
  document.getElementById('b').value='';
  document.getElementById('pav').value='';
  document.getElementById('sub').value='';
  savFilt();invCache();invRsCache();renderLista();updCDebounced();
}

// --- Contadores / progresso ---
async function updPG(){
  var u=document.getElementById('u').value.trim();
  var cp=document.getElementById('cpg');
  if(!u){cp.style.display='none';return;}
  cp.style.display='block';
  var todos=getItens(),total=0,av=0,ok=0,nk=0,na=0;
  todos.forEach(function(it){
    total++;
    var s=resStatus(it);
    if(s==='Ok'||s==='Inadequado'||s==='N/A'){
      av++;
      if(s==='Ok')ok++;
      else if(s==='Inadequado')nk++;
      else na++;
    }
  });
  var pct=total>0?(av/total)*100:0,flt=total-av;
  var fill=document.getElementById('pgf');
  fill.style.width=pct.toFixed(0)+'%';
  fill.style.background=pct===100?'var(--success)':pct<50?'var(--warning)':'var(--primary)';
  document.getElementById('pgt').innerText=av+' / '+total;
  document.getElementById('pgok').innerHTML='✅ '+ok+' adequados';
  document.getElementById('pgnk').innerHTML='❌ '+nk+' inadequados';
  document.getElementById('pgna').innerHTML='⚫ '+na+' N/A';
  document.getElementById('pgpnd').innerHTML='⏳ '+flt+' faltando';
}
function updPBar(){
  var sub=document.getElementById('sub').value.trim();if(!sub)return;
  var nh=progBarHTML(getItens(),sub);
  var ex=document.querySelector('.progwrap');
  if(ex){
    var t=document.createElement('div');t.innerHTML=nh;
    var nv=t.firstElementChild;if(nv)ex.replaceWith(nv);
  }
}

async function updContadores(){
  var u=document.getElementById('u').value.trim();
  if(!u){zerarC();return;}
  var itens=getItens();
  var totOk=0,totNk=0,totNa=0,ambAv=0,ambP=0,ambVis=0,ambIn=0,reaval=0,naPend=0;
  var sMap={};
  itens.forEach(function(it){
    var sub=it[DI.SUB]||'Sem Subambiente',bl=it[DI.BLC]||'',pv=it[DI.PAV]||'';
    var ck=bl+'|'+pv+'|'+sub;
    if(!sMap[ck])sMap[ck]={total:0,ok:0,nk:0,na:0,naoAv:0,temIn:false,temNa:false};
    var d=sMap[ck];d.total++;
    var s=resStatus(it);
    if(s==='Ok'){d.ok++;totOk++;if(precisaReaval(it[DI.UID]))reaval++;}
    else if(s==='Inadequado'){d.nk++;totNk++;d.temIn=true;}
    else if(s==='N/A'){d.na++;totNa++;d.temNa=true;naPend++;}
    else d.naoAv++;
  });
  Object.keys(sMap).forEach(function(k){
    var d=sMap[k],av=d.ok+d.nk+d.na;
    if(av>0)ambAv++;
    if(av>0&&av<d.total)ambP++;
    if(d.naoAv>0||d.nk>0||d.na>0)ambVis++;
    if(d.temIn)ambIn++;
  });
  var info=cicloInfo(u,Object.keys(sMap).length);
  function s(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  s('cok',totOk);s('cnk',totNk);
  s('caa',ambAv);s('cap',ambP);s('cav',ambVis);s('cai',ambIn);
  s('cam',info.media);s('cams',info.sub);
  s('crvc',reaval);s('crvs',reaval>0?(reaval+' item(s) vencido(s) — clique'):'Tudo em dia ✅');
  s('cnvc',naPend);s('cnvs',naPend>0?(naPend+' item(s) N/A — clique'):'Nenhum N/A pendente ✅');
  updPG();
}
function zerarC(){
  ['cok','cnk','caa','cap','cav','cai','crvc','cnvc'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.textContent='0';
  });
  function s(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  s('cam','—');s('cams','Selecione uma unidade');
  s('crvs','Selecione uma unidade');s('crvc','—');
  s('cnvs','Selecione uma unidade');s('cnvc','—');
  document.getElementById('pgt').innerText='0 / 0';
  var f=document.getElementById('pgf');f.style.width='0%';f.style.background='var(--primary)';
  document.getElementById('pgok').innerHTML='✅ 0 adequados';
  document.getElementById('pgnk').innerHTML='❌ 0 inadequados';
  document.getElementById('pgna').innerHTML='⚫ 0 N/A';
  document.getElementById('pgpnd').innerHTML='⏳ 0 faltando';
  document.getElementById('cpg').style.display='none';
}

// --- Fotos (base64, apenas local na sessão) ---
function handleFotos(e){
  var files=e.target.files;if(!files.length)return;
  var ps=[];
  for(var i=0;i<files.length;i++){
    (function(f){
      ps.push(new Promise(function(res){
        var r=new FileReader();
        r.onload=function(ev){res(ev.target.result);};
        r.readAsDataURL(f);
      }));
    })(files[i]);
  }
  Promise.all(ps).then(function(imgs){
    if(FOTO_CTX&&FOTO_CTX.tipo==='item'){
      var sl=SEL.find(function(x){return x.uid===FOTO_CTX.uid;});
      if(!sl){
        var orig=DB.slice(1).find(function(it){return it[DI.UID]===FOTO_CTX.uid;});
        if(!orig){toast('Erro: item não encontrado.',4000);return;}
        sl={uid:FOTO_CTX.uid,v:'',obs:'',achados:[],p:orig[DI.DESC]||'',amb:orig[DI.SUB]||'',
            pav:orig[DI.PAV]||'',fotos:[],tipo:'Normal',unidade:orig[DI.UNI]||'',bloco:orig[DI.BLC]||''};
        SEL.push(sl);
      }
      imgs.forEach(function(b64){sl.fotos.push({b64:b64});});
      renderGal(FOTO_CTX.uid,sl.fotos);
    }else{
      imgs.forEach(function(b64){FSUB.push({b64:b64});});
      renderGal('sub',FSUB);
    }
    toast('📸 Foto(s) adicionada(s)!');
  }).catch(function(){toast('Erro ao ler foto.',4000);});
}
function renderGal(uid,arr){
  var id=uid==='sub'?'gsub':'g'+uid;
  var el=document.getElementById(id);
  if(el)el.innerHTML=arr.map(function(f,i){return thumbH(uid,i,f.b64);}).join('');
}
function removerFoto(uid,idx){
  if(!uid||uid===''){FSUB.splice(idx,1);renderGal('sub',FSUB);}
  else{
    var sl=SEL.find(function(x){return x.uid===uid;});
    if(sl){sl.fotos.splice(idx,1);renderGal(uid,sl.fotos);}
  }
  toast('🗑️ Foto removida.');
}
function renderGalerias(){
  var gs=document.getElementById('gsub');if(gs)renderGal('sub',FSUB);
  SEL.forEach(function(sl){if(sl.fotos&&sl.fotos.length>0)renderGal(sl.uid,sl.fotos);});
}

// --- Salvar avaliações (via GAS com fila offline) ---
async function tentarSalvar(){
  var resp=document.getElementById('resp').value.trim();
  var u=document.getElementById('u').value.trim();
  var b=document.getElementById('b').value.trim();
  var sub=document.getElementById('sub').value.trim();
  if(!resp||!u||!b){toast('Preencha Inspetor, Unidade e Bloco.',4000);return;}
  var its=SEL.filter(function(s){return s.v||s.obs||s.fotos.length>0||(s.achados&&s.achados.length>0);});
  if(!its.length&&!FSUB.length){toast('Nenhuma avaliação para salvar.',3000);return;}

  var pacote={
    r:resp, u:u, b:b, sub:sub,
    fotosSubambiente:FSUB.map(function(f){return f.b64;}),
    itens:its.map(function(s){
      return {
        pav:s.pav,
        amb:s.amb,
        p:s.p,
        v:s.v,
        obs:s.obs,
        fotos:s.fotos.map(function(f){return f.b64;}),
        tipo:s.tipo,
        achados:(s.achados||[]).join(', ')
      };
    })
  };

  var btn=document.getElementById('bsave');
  btn.textContent='💾 SALVANDO...';btn.disabled=true;

  if(!navigator.onLine){
    addFilaSave(pacote);
    toast('🔴 OFFLINE. Salvo na fila para enviar depois.');
    SEL=[];FSUB=[];invRsCache();carregar(document.getElementById('u').value.trim());
    btn.textContent='💾 SALVAR AVALIAÇÕES';btn.disabled=false;
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

    SEL=[];FSUB=[];invRsCache();carregar(document.getElementById('u').value.trim());
  } catch (error) {
    addFilaSave(pacote); // Adiciona à fila se falhar
    toast('❌ Erro ao salvar: ' + error.message + '. Adicionado à fila offline.', 5000);
  } finally {
    btn.textContent='💾 SALVAR AVALIAÇÕES';btn.disabled=false;
    updFila();
  }
}

// --- CSV do dia (via GAS) ---
async function baixarRelatorio(){
  toast('⏳ Gerando CSV...');
  try {
    const dados = await callGas('obterRespostasDoDia');
    if(!dados||!dados.length){toast('Nenhum dado hoje.',3000);return;}
    var csv='\uFEFF'+dados.map(function(row){return row.map(function(c){
      var v=(c===null||c===undefined)?'':String(c);
      return '"'+v.replace(/"/g,'""')+'"';
    }).join(',');}).join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='relatorio_'+new Date().toLocaleDateString('pt-BR').replace(/\//g,'-')+'.csv';
    a.style.display='none';document.body.appendChild(a);a.click();
    document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('✅ CSV baixado!');
  } catch (error) {
    toast('❌ Erro ao baixar CSV: ' + error.message, 5000);
  }
}

// --- Histórico (via GAS) ---
async function obterHistorico6Meses(unidadeFiltro){
  try {
    const result = await callGas('obterHistorico6Meses', { unidade: unidadeFiltro });
    return result;
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    return {
      meses: [], totalSubambientes: 0, totalVisitados: 0, totalInadequados: 0, percentualCobertura: 0
    };
  }
}

async function carregarHist(unidade){
  var card=document.getElementById('chist'),cont=document.getElementById('hcont');
  card.style.display='block';
  cont.innerHTML='<div class="hload">⏳ Carregando histórico...</div>';
  const d = await obterHistorico6Meses(unidade);
  if(!d||!d.meses||!d.meses.length){cont.innerHTML='<div class="hload">Nenhum registro nos últimos 6 meses.</div>';return;}
  cont.innerHTML=buildHist(d,unidade);
}

function buildHist(d,unidade){
  var hoje=new Date(),uN=nrm(unidade),ciclo=CICLOS[uN];
  var regraH='';
  if(ciclo){
    var ini=ME[ciclo.i-1],fim=ME[ciclo.f-1];
    var mes=hoje.getMonth()+1,dentro=mes>=ciclo.i&&mes<=ciclo.f;
    var stC=dentro
      ?'<span style="color:var(--success);font-weight:700;">✅ Dentro do ciclo ('+MN[ciclo.i-1]+'–'+MN[c.f-1]+')</span>'
      :'<span style="color:var(--warning);font-weight:700;">⚠️ Fora do período ('+MN[c.i-1]+'–'+MN[c.f-1]+')</span>';
    regraH='<div class="crcicloh"><b>📋 Regra dos 6 meses:</b> Esta unidade deve ser avaliada entre <b>'+ini+'</b> e <b>'+fim+'</b>.<br>'+stC+'</div>';
  }else{
    regraH='<div class="crcicloh"><b>📋 Regra dos 6 meses:</b> Todos os itens devem ser reavaliados a cada <b>6 meses</b>.</div>';
  }

  var uAtual=document.getElementById('u').value.trim();
  var grid='<div class="hgrid">';
  d.meses.forEach(function(m){
    var isAt=m.mes===(hoje.getMonth()+1)&&m.ano===hoje.getFullYear();
    grid+='<div class="mcard'+(isAt?' mat':'')+(m.subambientes===0?' mvaz':'')+'">'+
      '<div class="mlbl">'+esc(m.label)+'</div>'+
      '<div class="mnum">'+m.subambientes+'</div>'+
      '<div class="mnuml">amb. visitados</div>'+
      '<div class="mbadges">'+
        '<span class="mb mbok">'+m.ok+' ok</span>'+
        '<span class="mb mbinad">'+m.inadequados+' inad.</span>'+
        '<span class="mb mbna">'+m.na+' N/A</span>'+
      '</div>'+
    '</div>';
  });
  grid+='</div>';

  var bar='<div class="hbarwrap"><div class="hbarrow">'+
    '<div class="hbarlbl">Cobertura</div>'+
    '<div class="hbarbg"><div class="hbarfill" style="width:'+(d.percentualCobertura||0)+'%"></div></div>'+
    '<div class="hbarcnt">'+(d.percentualCobertura||0).toFixed(0)+'%</div>'+
  '</div></div>';

  var resumo='<div class="hresumo">'+
    '<div class="hri"><div class="hriv">'+d.totalSubambientes+'</div><div class="hril">Amb. únicos visitados</div></div>'+
    '<div class="hri"><div class="hriv">'+d.totalVisitados+'</div><div class="hril">Total de registros</div></div>'+
    '<div class="hri"><div class="hriv">'+d.totalInadequados+'</div><div class="hril">Reg. com inadequação</div></div>'+
  '</div>';

  return regraH+grid+bar+resumo;
}

// --- Voz (SpeechRecognition do navegador) ---
var SAPI=window.SpeechRecognition||window.webkitSpeechRecognition||null;
var micUid=null,recObj=null;
function iniciarVoz(uid){
  if(!SAPI){toast('Sem suporte a voz neste navegador.',4000);return;}
  if(micUid===uid){pararVoz();return;}
  if(micUid!==null)pararVoz();
  recObj=new SAPI();recObj.lang='pt-BR';recObj.interimResults=true;recObj.continuous=false;
  var ta=document.querySelector('textarea[data-uid="'+uid+'"]');
  var btn=document.querySelector('.bmic[data-muid="'+uid+'"]');
  if(!ta||!btn)return;
  btn.classList.add('rec');micUid=uid;
  recObj.onresult=function(ev){
    for(var i=ev.resultIndex;i<ev.results.length;i++)
      if(ev.results[i].isFinal){ta.value+=ev.results[i][0].transcript+' ';onTA({target:ta});}
  };
  recObj.onend=function(){btn.classList.remove('rec');micUid=null;toast('🎙️ Finalizado.');};
  recObj.onerror=function(ev){btn.classList.remove('rec');micUid=null;toast('Erro de voz: '+ev.error,4000);};
  recObj.start();toast('🎙️ Ouvindo...');
}
function pararVoz(){
  if(recObj){recObj.stop();recObj=null;}
  var btn=document.querySelector('.bmic.rec');if(btn)btn.classList.remove('rec');
  micUid=null;
}

// --- Eventos de UI ---
function onClick(e){
  e.preventDefault(); // <--- ADICIONADO: Impede o comportamento padrão (scroll, etc.)

  var t=e.target;

  var bopt=t.closest&&t.closest('.bopt');
  if(bopt){
    marcar(bopt.dataset.uid,bopt.dataset.v,bopt.dataset.uni,bopt.dataset.bl,bopt.dataset.pav,bopt.dataset.amb,bopt.dataset.desc,bopt.dataset.tipo);
    return;
  }

  var chip=t.closest&&t.closest('.chip');
  if(chip){toggleAch(chip.dataset.uid,chip.dataset.ach);return;}

  var bmic=t.closest&&t.closest('.bmic');
  if(bmic){iniciarVoz(bmic.dataset.muid);return;}

  var cnv2=t.closest&&t.closest('.cnv2');
  if(cnv2){irParaSub(cnv2.dataset.uni,cnv2.dataset.bl,cnv2.dataset.pav,cnv2.dataset.sub,cnv2.dataset.filt||'TUDO');return;}

  var bfoto=t.closest&&t.closest('.bfoto');
  if(bfoto){
    var uid=bfoto.dataset.uid;
    FOTO_CTX=uid?{tipo:'item',uid:uid}:{tipo:'sub'};
    var ci=document.getElementById('camInput');
    ci.value='';ci.click();
    return;
  }

  var tdel=t.closest&&t.closest('.tdel');
  if(tdel){removerFoto(tdel.dataset.uid,parseInt(tdel.dataset.idx,10));return;}
}

function onTA(e){
  var ta=e.target.closest?e.target.closest('textarea[data-uid]'):null;
  if(!ta&&e.target&&e.target.dataset&&e.target.dataset.uid)ta=e.target;
  if(!ta)return;
  var uid=ta.dataset.uid;
  var sl=SEL.find(function(x){return x.uid===uid;});
  if(!sl){
    var orig=DB.slice(1).find(function(it){return it[DI.UID]===uid;});if(!orig)return;
    sl={uid:uid,v:'',obs:'',achados:[],p:orig[DI.DESC]||'',amb:orig[DI.SUB]||'',
        pav:orig[DI.PAV]||'',fotos:[],tipo:'Normal',unidade:orig[DI.UNI]||'',bloco:orig[DI.BLC]||''};
    SEL.push(sl);
  }
  sl.obs=ta.value;
}

function toggleAch(uid,ach){
  var sl=SEL.find(function(x){return x.uid===uid;});
  if(!sl){
    var orig=DB.slice(1).find(function(it){return it[DI.UID]===uid;});if(!orig)return;
    sl={uid:uid,v:'',obs:'',achados:[],p:orig[DI.DESC]||'',amb:orig[DI.SUB]||'',
        pav:orig[DI.PAV]||'',fotos:[],tipo:'Normal',unidade:orig[DI.UNI]||'',bloco:orig[DI.BLC]||''};
    SEL.push(sl);
  }
  if(!sl.achados)sl.achados=[];
  var idx=sl.achados.indexOf(ach);
  if(idx===-1)sl.achados.push(ach);else sl.achados.splice(idx,1);
  document.querySelectorAll('.chip[data-uid="'+uid+'"]').forEach(function(c){
    if(c.dataset.ach===ach)c.classList.toggle('sel',sl.achados.indexOf(ach)>=0);
  });
}

// --- Navegar para subambiente (quando clica em bloco resumo) ---
function irParaSub(uni,bl,pav,sub,st){
  document.getElementById('u').value=uni;
  document.getElementById('b').value=bl;
  document.getElementById('pav').value=pav;
  document.getElementById('sub').value=sub;
  document.getElementById('fst').value=st||'TUDO';
  ['u','b','pav','sub'].forEach(mkpre);
  savFilt();invCache();invRsCache();renderLista();updContadores();
  window.scrollTo({top:0,behavior:'smooth'});
}

// --- Ambientes verificados hoje (via GAS) ---
async function obterAmbientesVerificadosHoje(){
  try {
    const result = await callGas('obterAmbientesVerificadosHoje');
    return result;
  } catch (error) {
    console.error('Erro ao obter ambientes verificados hoje:', error);
    return 0;
  }
}
async function updHoje(){
  const n = await obterAmbientesVerificadosHoje();
  var el=document.getElementById('chj');if(el)el.textContent=n;
}

// --- Init ---
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('snet').textContent='🌐 ONLINE'; // Indica que está online com GAS
  updFila(); // Atualiza o contador da fila ao carregar
  document.addEventListener('click',onClick);
  document.addEventListener('change',function(e){
    var ta=e.target;
    if(ta.tagName==='TEXTAREA'&&ta.dataset.uid)onTA(e);
  });
  document.getElementById('camInput').addEventListener('change',handleFotos);

  ['u','b','pav','sub'].forEach(function(id){
    document.getElementById(id).addEventListener('change',function(){
      savFilt();invCache();invRsCache();
      if(id==='u')carregar();
      else{renderLista();updCDebounced();}
    });
  });
  document.getElementById('resp').addEventListener('change',savFilt);
  document.getElementById('fst').addEventListener('change',function(){
    savFilt();invRsCache();renderLista();updCDebounced();
  });

  carregar();
  updHoje();
});
