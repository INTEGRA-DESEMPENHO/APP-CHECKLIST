/* ══════════════════════════════════════════════════════════════════
   Vistoria Fênix v9 — app.js
   100% localStorage — sem backend, sem Google Apps Script
══════════════════════════════════════════════════════════════════ */

// ─── Chaves localStorage ──────────────────────────────────────────
var LS_STATUS  = 'vfx_status_v9';    // { uid: { status, obs, achados, dataUltimaAval } }
var LS_RESPOSTAS = 'vfx_respostas_v9'; // [ [...linha...] ]
var FILT_K     = 'vfx_filt_v9';

// ─── Constantes ───────────────────────────────────────────────────
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

var DI = {
  ORD:0,UNI:1,UNINORM:2,BLC:3,PAV:4,AMB_TAG:5,
  SUB:6,DESC:7,AVAL:8,ADEQ:9,INAD:10,PEND:11,OBS:12,UID:13
};

// ─── Estado ───────────────────────────────────────────────────────
var DB = [], STATUS = {}, SEL = [], FSUB = [], FOTO_CTX = null;
var _rsCache = {};
function invRsCache() { _rsCache = {}; }

// ─── Helpers ──────────────────────────────────────────────────────
function nrm(s) {
  return (s||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function nrmU(s) { return nrm(s); }
function esc(s) {
  return String(s)
    .replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function toast(m,d) {
  d=d||2500;
  var t=document.getElementById('toast');
  t.textContent=m; t.className='show';
  setTimeout(function(){t.className=t.className.replace('show','');},d);
}
function fmtDate(dt) {
  return dt.toLocaleDateString('pt-BR')+' '+dt.toLocaleTimeString('pt-BR');
}
function hojeStr() { return new Date().toLocaleDateString('pt-BR'); }

// ─── localStorage helpers ─────────────────────────────────────────
function lsGet(k) {
  try { return JSON.parse(localStorage.getItem(k)||'null'); } catch(e) { return null; }
}
function lsSet(k,v) {
  try { localStorage.setItem(k,JSON.stringify(v)); } catch(e) {}
}

// ─── Carregar STATUS salvo ────────────────────────────────────────
function carregarStatus() {
  STATUS = lsGet(LS_STATUS) || {};
}
function salvarStatus() {
  lsSet(LS_STATUS, STATUS);
}

// ─── Carregar RESPOSTAS salvas ────────────────────────────────────
function getRespostas() {
  return lsGet(LS_RESPOSTAS) || [];
}
function addResposta(linha) {
  var r = getRespostas();
  r.push(linha);
  lsSet(LS_RESPOSTAS, r);
}

// ─── Regra 6 meses ───────────────────────────────────────────────
function precisaReaval(uid) {
  var st=STATUS[uid];
  if(!st||!st.dataUltimaAval||st.status.toUpperCase()!=='OK') return false;
  var p=st.dataUltimaAval.split('/'); if(p.length<3) return false;
  var dt=new Date(+p[2],+p[1]-1,+p[0]); if(isNaN(dt.getTime())) return false;
  return ((new Date()-dt)/(1000*60*60*24*30.44))>=6;
}
function mesesDesde(uid) {
  var st=STATUS[uid]; if(!st||!st.dataUltimaAval) return null;
  var p=st.dataUltimaAval.split('/'); if(p.length<3) return null;
  var dt=new Date(+p[2],+p[1]-1,+p[0]); if(isNaN(dt.getTime())) return null;
  return Math.floor((new Date()-dt)/(1000*60*60*24*30.44));
}

// ─── Ciclo ───────────────────────────────────────────────────────
function cicloInfo(nome, totalSubs) {
  var c=CICLOS[nrm(nome)];
  if(!c||totalSubs===0) return {
    media: totalSubs>0?(totalSubs/6).toFixed(1):'—',
    sub:   totalSubs>0?totalSubs+' amb. ÷ 6 meses':'Selecione uma unidade'
  };
  var mes=new Date().getMonth()+1, dentro=mes>=c.i&&mes<=c.f;
  var ini=MN[c.i-1], fim=MN[c.f-1];
  if(dentro){var r=c.f-mes+1;return{media:(totalSubs/r).toFixed(1),sub:ini+'–'+fim+' · '+r+'m restantes'};}
  return {media:(totalSubs/6).toFixed(1),sub:ini+'–'+fim+' · fora do ciclo'};
}

// ─── Resolver status ─────────────────────────────────────────────
function resStatus(item) {
  var uid=item[DI.UID];
  if(_rsCache[uid]!==undefined) return _rsCache[uid];
  var result=_calcStatus(item);
  _rsCache[uid]=result;
  return result;
}
function _calcStatus(item) {
  var uid=item[DI.UID];
  // 1. Seleção atual (sessão)
  var s=SEL.find(function(x){return x.uid===uid;});
  if(s&&s.v&&s.v.trim()!=='') return s.v;
  // 2. STATUS salvo no localStorage
  if(STATUS[uid]&&STATUS[uid].status){
    var rc=STATUS[uid].status.trim().toUpperCase();
    if(rc==='OK')         return 'Ok';
    if(rc==='INADEQUADO') return 'Inadequado';
    if(rc==='N/A')        return 'N/A';
    if(rc!=='')           return 'Ok';
  }
  // 3. Base de dados
  var colK=nrm(item[DI.INAD]);
  if(colK==='verdadeiro'||colK==='true') return 'Inadequado';
  var colJ=nrm(item[DI.ADEQ]);
  if(colJ==='verdadeiro'||colJ==='true') return 'Ok';
  var colI=nrm(item[DI.AVAL]);
  if(colI==='n/a'||colI==='nao_aplicavel'||colI==='nao aplicavel'||
     colI==='não aplicável'||colI==='na') return 'N/A';
  return 'Nao Avaliado';
}

// ─── Carregar dados da base ──────────────────────────────────────
function carregar(u) {
  if(u===undefined) u=document.getElementById('u').value.trim();
  invCache(); invRsCache();
  carregarStatus();

  // Usa window.BASE_DE_DADOS definido em data.js
  DB = window.BASE_DE_DADOS || [];

  popularFiltros();
  renderLista();
  updContadores();
  if(u) carregarHist(u);
  var numItens = DB.length>1 ? DB.length-1 : 0;
  toast('✅ '+numItens+' itens carregados');
}

// ─── Popular filtros ─────────────────────────────────────────────
function popularFiltros() {
  var ul=document.getElementById('lu'),bl=document.getElementById('lb');
  var pl=document.getElementById('lpav'),sl=document.getElementById('lsub');
  ul.innerHTML='';bl.innerHTML='';pl.innerHTML='';sl.innerHTML='';
  var uMap={},bSet={},pSet={},sSet={};
  DB.slice(1).forEach(function(row){
    var ru=(row[DI.UNI]||'').trim();
    if(ru){var k=nrmU(ru);if(!uMap[k]||ru>uMap[k])uMap[k]=ru;}
    var b=(row[DI.BLC]||'').trim(); if(b) bSet[b]=1;
    var p=(row[DI.PAV]||'').trim(); if(p) pSet[p]=1;
    var s=(row[DI.SUB]||'').trim(); if(s) sSet[s]=1;
  });
  Object.keys(uMap).sort().forEach(function(k){ul.innerHTML+='<option value="'+esc(uMap[k])+'">';});
  Object.keys(bSet).sort().forEach(function(v){bl.innerHTML+='<option value="'+esc(v)+'">';});
  Object.keys(pSet).sort().forEach(function(v){pl.innerHTML+='<option value="'+esc(v)+'">';});
  Object.keys(sSet).sort().forEach(function(v){sl.innerHTML+='<option value="'+esc(v)+'">';});
  var sf=lsGet(FILT_K)||{};
  document.getElementById('resp').value=sf.resp||'';
  document.getElementById('u').value=sf.u||'';
  document.getElementById('b').value=sf.b||'';
  document.getElementById('pav').value=sf.pav||'';
  document.getElementById('sub').value=sf.sub||'';
  document.getElementById('fst').value=sf.fst||'NAO_AVALIADOS';
  ['resp','u','b','pav','sub'].forEach(mkpre);
}

function mkpre(id){
  var el=document.getElementById(id);
  if(el) el.classList.toggle('ok',el.value.trim()!=='');
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
  lsSet(FILT_K,f);
  ['resp','u','b','pav','sub'].forEach(mkpre);
}

// ─── Cache de itens filtrados ─────────────────────────────────────
var _ci=null,_cc='';
function invCache(){_ci=null;_cc='';}
function getItens(){
  var uv=nrmU(document.getElementById('u').value);
  var bv=nrm(document.getElementById('b').value);
  var pv=nrm(document.getElementById('pav').value);
  var sv=nrm(document.getElementById('sub').value);
  if(!uv) return [];
  var ch=uv+'|'+bv+'|'+pv+'|'+sv;
  if(_cc===ch&&_ci) return _ci;
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

// ─── Filtros rápidos ─────────────────────────────────────────────
var _dt=null;
function updCDebounced(){clearTimeout(_dt);_dt=setTimeout(updContadores,80);}

function filtroReaval(){
  if(!document.getElementById('u').value.trim()){toast('Selecione uma unidade.',3000);return;}
  document.getElementById('fst').value='AVALIADOS_OK';
  savFilt();renderLista();updContadores();
  window.scrollTo({top:document.getElementById('lista').offsetTop-20,behavior:'smooth'});
  toast('🔄 Mostrando itens OK para reavaliação.');
}
function filtroNA(){
  if(!document.getElementById('u').value.trim()){toast('Selecione uma unidade.',3000);return;}
  document.getElementById('fst').value='NA_PENDENTES';
  savFilt();renderLista();updContadores();
  window.scrollTo({top:document.getElementById('lista').offsetTop-20,behavior:'smooth'});
  toast('⚫ Mostrando itens N/A pendentes.');
}

// ─── Marcar status ────────────────────────────────────────────────
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
    if(ab) ab.classList.add(v==='Ok'?'aok':v==='Inadequado'?'ank':'ana');
    var si=card.querySelector('.sicon');
    if(si) si.textContent=v==='Ok'?'✅':v==='Inadequado'?'❌':v==='N/A'?'⚫':'⬜';
    card.classList.remove('inad','ina','ior');
    if(v==='Inadequado') card.classList.add('inad');
    else if(v==='N/A')   card.classList.add('ina');
    var sf=document.getElementById('fst').value;
    var out=(sf==='NAO_AVALIADOS'&&(v==='Ok'||v==='Inadequado'||v==='N/A'))||
            (sf==='INADEQUACOES'&&v==='Ok')||(sf==='NA_PENDENTES'&&v==='Ok');
    if(out){
      card.classList.add('out');
      card.addEventListener('transitionend',function(){card.remove();updCDebounced();updPBar();},{once:true});
    } else {updCDebounced();updPBar();}
  } else {invCache();renderLista();updCDebounced();}
}

// ─── HTML helpers ─────────────────────────────────────────────────
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
  var total=its.length; if(!total) return '';
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
  if(isNA) cls+=' ina';
  else if(isIN||hasA) cls+=' inad';
  else if(isOk&&prR) cls+=' ior';
  var hHtml='';
  if(hasA){
    hHtml='<div class="hbox">'+
      (pendH?'<div>📋 <b>Pendência:</b> '+esc(pendH)+'</div>':'')+
      (obsH ?'<div>💬 <b>Última Obs:</b> '+esc(obsH)+'</div>':'')+
      (achH ?'<div>🔎 <b>Achados:</b> '+esc(achH)+'</div>':'')+'</div>';
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
    '<div class="bfoto" data-uid="'+esc(uid)+'">📸 Adicionar Foto</div></div>';
}

// ─── Render lista ─────────────────────────────────────────────────
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
    var d=subMap

