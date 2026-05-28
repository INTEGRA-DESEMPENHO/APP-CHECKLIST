/* ═══════════════════════════════════════════════════════
   Vistoria Fênix v9 — app.js COMPLETO
   FRONTEND no GitHub, BACKEND no Apps Script (Code.gs)
═══════════════════════════════════════════════════════ */

// ─── CONFIGURAÇÃO — TROQUE PELA SUA URL DO GAS ───────────
var GAS_URL = 'var GAS_URL = 'https://script.google.com/macros/s/AKfycbyCfPETWCxQqKN-d5ZlbrpWVF8gj3je79LQkWDe-khTFxcbDEzjDctOr6e6nWU92c7/exec';

// ─── Chaves localStorage ─────────────────────────────────
var LS_STATUS  = 'vfx_status_v9';
var LS_FILA    = 'vfx_fila_v9';
var LS_FILTROS = 'vfx_filt_v9';
var LS_CACHE   = 'vfx_cache_v9';

// ─── Estado global ────────────────────────────────────────
var DB      = [];   // array de arrays (linha 0 = cabeçalho)
var STATUS  = {};   // { uid: { status, obs, achados, dataUltimaAval } }
var SEL     = [];   // itens avaliados na sessão
var FSUB    = [];   // fotos do subambiente
var FOTO_CTX = null;
var _rsCache = {};

// ─── Índices das colunas no DB ───────────────────────────
var DI = {
  ORD:0, UNI:1, UNINORM:2, BLC:3, PAV:4,
  AMB_TAG:5, SUB:6, DESC:7, AVAL:8,
  ADEQ:9, INAD:10, PEND:11, OBS:12, UID:13
};

// ─── Ciclos (se usar) ────────────────────────────────────
var CICLOS = {};
var MN = ['Jan','Fev','Mar','Abr','Maio','Jun','Jul','Ago','Set','Out','Nov','Dez'];
var ME = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
          'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

var ACHADOS = [
  'Infiltração','Vazamento','Equipamento danificado','Falta de EPI',
  'Iluminação inadequada','Sinalização ausente','Resíduo irregular',
  'Área bloqueada','Estrutura comprometida','Elétrica exposta',
  'Piso danificado','Porta/janela com defeito'
];

// ─── Utilitários ─────────────────────────────────────────
function nrm(s){
  return (s||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function nrmU(s){return nrm(s);}
function canonical(s){
  return (s||'').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function esc(s){
  return (s||'').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function uid_(u,b,pav,sub,item){
  return [nrm(u),nrm(b),nrm(pav),nrm(sub),nrm(item)].join('||').substring(0,200);
}
function fmtDataHora(d){
  return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear()+
    ' '+('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2)+':'+('0'+d.getSeconds()).slice(-2);
}
function hojeStr(){
  var d=new Date();
  return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear();
}

// ─── localStorage helpers ─────────────────────────────────
function lsGet(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}

// ─── Status (localStorage) ────────────────────────────────
function carregarStatus(){STATUS=lsGet(LS_STATUS)||{};}
function salvarStatus(){lsSet(LS_STATUS,STATUS);}

// ─── Fila offline ────────────────────────────────────────
function getFilaSave(){return lsGet(LS_FILA)||[];}
function setFilaSave(f){lsSet(LS_FILA,f);}
function addFilaSave(p){var f=getFilaSave();f.push(p);setFilaSave(f);}
function updFila(){
  var f=getFilaSave();
  var el=document.getElementById('sfila');
  if(el){el.style.display=f.length?'inline-flex':'none';el.textContent='⏳ Fila: '+f.length;}
}

// ─── Toast ────────────────────────────────────────────────
var _toastT=null;
function toast(msg,dur){
  var el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg;el.className='toast show';
  clearTimeout(_toastT);
  _toastT=setTimeout(function(){el.className='toast';},dur||2500);
}

// ─── Cache DB ─────────────────────────────────────────────
function salvarCacheDB(obj){lsSet(LS_CACHE,obj);}
function carregarCacheDB(){return lsGet(LS_CACHE);}

// ─── Ciclo semestral ─────────────────────────────────────
function cicloInfo(unidade,totalSubs){
  var uN=nrmU(unidade),ciclo=CICLOS[uN];
  if(!ciclo)return{media:'—',sub:'Ciclo não definido'};
  var meses=ciclo.f-ciclo.i+1;
  return{media:Math.ceil(totalSubs/meses),sub:'Ciclo: '+MN[ciclo.i-1]+' a '+MN[ciclo.f-1]};
}

// ─── Reavaliação (6 meses) ───────────────────────────────
function precisaReaval(uid){
  var st=STATUS[uid];
  if(!st||!st.dataUltimaAval||st.status.toUpperCase()!=='OK')return false;
  var p=st.dataUltimaAval.split('/');if(p.length<3)return false;
  var dt=new Date(+p[2],+p[1]-1,+p[0]);if(isNaN(dt.getTime()))return false;
  return((new Date()-dt)/(1000*60*60*24*30.44))>=6;
}
function mesesDesde(uid){
  var st=STATUS[uid];if(!st||!st.dataUltimaAval)return null;
  var p=st.dataUltimaAval.split('/');if(p.length<3)return null;
  var dt=new Date(+p[2],+p[1]-1,+p[0]);if(isNaN(dt.getTime()))return null;
  return Math.floor((new Date()-dt)/(1000*60*60*24*30.44));
}

// ─── Status do item ───────────────────────────────────────
function invRsCache(){_rsCache={};}
function resStatus(item){
  var uid=item[DI.UID];
  if(_rsCache[uid]!==undefined)return _rsCache[uid];
  var r=_calcStatus(item);_rsCache[uid]=r;return r;
}
function _calcStatus(item){
  var uid=item[DI.UID];
  var s=SEL.find(function(x){return x.uid===uid;});
  if(s&&s.v&&s.v.trim()!=='')return s.v;
  if(STATUS[uid]&&STATUS[uid].status){
    var rc=STATUS[uid].status.trim().toUpperCase();
    if(rc==='OK')return'Ok';
    if(rc==='INADEQUADO')return'Inadequado';
    if(rc==='N/A')return'N/A';
  }
  var inad=nrm(item[DI.INAD]);
  if(inad==='verdadeiro'||inad==='true')return'Inadequado';
  var adeq=nrm(item[DI.ADEQ]);
  if(adeq==='verdadeiro'||adeq==='true')return'Ok';
  var aval=nrm(item[DI.AVAL]);
  if(aval==='n/a'||aval==='na')return'N/A';
  return'Nao Avaliado';
}

// ─── Comunicação com GAS ─────────────────────────────────
function callGas(action, params, method, body){
  params = params || {}; method = method || 'GET';
  var url = GAS_URL + '?action=' + encodeURIComponent(action);
  Object.keys(params).forEach(function(k){
    url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  });
  var opts = { method: method, redirect: 'follow' };
  if(method === 'POST' && body){
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify({ action: action, data: body });
  }
  return fetch(url, opts)
    .then(function(r){ return r.text(); })
    .then(function(txt){
      var j;
      try{ j = JSON.parse(txt); } catch(e){ throw new Error('Resposta inválida do servidor.'); }
      if(j && j.status === 'error') throw new Error(j.erro || 'Erro GAS');
      return j && j.data !== undefined ? j.data : j;
    });
}

// ─── Carregar dados do GAS ───────────────────────────────
async function carregar(u){
  if(u===undefined)u=document.getElementById('u').value.trim();
  invCache();invRsCache();carregarStatus();
  var snet=document.getElementById('snet');
  var bcache=document.getElementById('bcache');

  if(!navigator.onLine){
    var cached=carregarCacheDB();
    if(cached&&cached.dados&&cached.dados.length>1){
      DB=cached.dados;STATUS=Object.assign(STATUS,cached.ultimosStatus||{});
      if(bcache)bcache.classList.add('vis');
      if(snet){snet.textContent='📦 OFFLINE';snet.className='snet offline';}
      popularFiltros(cached.unidadesUnicas||[]);
      renderLista();updContadores();
      if(u)carregarHist(u);
      toast('📦 Offline — usando cache local.');
    }else{
      if(snet){snet.textContent='🔴 OFFLINE';snet.className='snet offline';}
      toast('🔴 Sem conexão e sem cache.',5000);
    }
    return;
  }

  if(snet){snet.textContent='⏳ Carregando...';snet.className='snet online';}
  toast('⏳ Carregando planilha...');

  try{
    var r=await callGas('puxarDadosBase',{unidade:u||''});
    DB     = r.dados          ||[];
    STATUS = Object.assign(STATUS,r.ultimosStatus||{});
    var unicas = r.unidadesUnicas||[];
    salvarStatus();
    salvarCacheDB({dados:DB,ultimosStatus:r.ultimosStatus||{},unidadesUnicas:unicas});
    if(bcache)bcache.classList.remove('vis');
    popularFiltros(unicas);
    renderLista();updContadores();
    if(u)carregarHist(u);
    updHoje();
    if(snet){snet.textContent='🌐 ONLINE';snet.className='snet online';}
    toast('✅ '+(DB.length>1?DB.length-1:0)+' itens carregados!');
  }catch(e){
    console.error('Erro carregar:',e);
    var cached=carregarCacheDB();
    if(cached&&cached.dados&&cached.dados.length>1){
      DB=cached.dados;STATUS=Object.assign(STATUS,cached.ultimosStatus||{});
      if(bcache)bcache.classList.add('vis');
      if(snet){snet.textContent='📦 CACHE';snet.className='snet offline';}
      popularFiltros(cached.unidadesUnicas||[]);
      renderLista();updContadores();
      toast('⚠️ Erro — usando cache local.',4000);
    }else{
      if(snet){snet.textContent='❌ ERRO';snet.className='snet offline';}
      toast('❌ Erro: '+e.message,6000);
    }
  }
}

// ─── Filtros / datalists ─────────────────────────────────
function popularFiltros(unicas){
  var ul=document.getElementById('lu'),bl=document.getElementById('lb');
  var pl=document.getElementById('lpav'),sl=document.getElementById('lsub');
  ul.innerHTML='';bl.innerHTML='';pl.innerHTML='';sl.innerHTML='';
  (unicas||[]).forEach(function(u){ul.innerHTML+='<option value="'+esc(u)+'">';});
  var bS={},pS={},sS={};
  DB.slice(1).forEach(function(r){
    var b=(r[DI.BLC]||'').trim();if(b)bS[b]=1;
    var p=(r[DI.PAV]||'').trim();if(p)pS[p]=1;
    var s=(r[DI.SUB]||'').trim();if(s)sS[s]=1;
  });
  Object.keys(bS).sort().forEach(function(v){bl.innerHTML+='<option value="'+esc(v)+'">';});
  Object.keys(pS).sort().forEach(function(v){pl.innerHTML+='<option value="'+esc(v)+'">';});
  Object.keys(sS).sort().forEach(function(v){sl.innerHTML+='<option value="'+esc(v)+'">';});
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
  lsSet(LS_FILTROS,{
    resp:(document.getElementById('resp')||{value:''}).value.trim(),
    u   :(document.getElementById('u')   ||{value:''}).value.trim(),
    b   :(document.getElementById('b')   ||{value:''}).value.trim(),
    pav :(document.getElementById('pav') ||{value:''}).value.trim(),
    sub :(document.getElementById('sub') ||{value:''}).value.trim(),
    fst :(document.getElementById('fst') ||{value:'NAO_AVALIADOS'}).value
  });
  ['resp','u','b','pav','sub'].forEach(mkpre);
}

// ─── Itens filtrados ─────────────────────────────────────
var _ci=null,_cc='';
function invCache(){_ci=null;_cc='';}
function getItens(){
  var uv=nrmU((document.getElementById('u')||{value:''}).value);
  var bv=nrm((document.getElementById('b')||{value:''}).value);
  var pv=nrm((document.getElementById('pav')||{value:''}).value);
  var sv=nrm((document.getElementById('sub')||{value:''}).value);
  if(!uv)return[];
  var ch=uv+'|'+bv+'|'+pv+'|'+sv;
  if(_cc===ch&&_ci)return _ci;
  _cc=ch;
  _ci=DB.slice(1).filter(function(item){
    var ui=(item[DI.UNINORM]||'').trim();
    return ui===uv&&
      (bv===''||nrm(item[DI.BLC])===bv)&&
      (pv===''||nrm(item[DI.PAV])===pv)&&
      (sv===''||nrm(item[DI.SUB])===sv);
  });
  return _ci;
}

// ─── Filtros rápidos ─────────────────────────────────────
var _dt=null;
function updCDebounced(){clearTimeout(_dt);_dt=setTimeout(updContadores,80);}
function filtroReaval(){
  if(!document.getElementById('u').value.trim()){toast('Selecione uma unidade.',3000);return;}
  document.getElementById('fst').value='AVALIADOS_OK';
  savFilt();renderLista();updContadores();
}
function filtroNA(){
  if(!document.getElementById('u').value.trim()){toast('Selecione uma unidade.',3000);return;}
  document.getElementById('fst').value='NA_PENDENTES';
  savFilt();renderLista();updContadores();
}

// ─── Marcar status ───────────────────────────────────────
function marcar(uid,v,uni,bl,pav,amb,desc,tipo){
  delete _rsCache[uid];
  var s=SEL.find(function(x){return x.uid===uid;});
  if(!s){
    s={uid:uid,v:'',obs:'',achados:[],p:desc,amb:amb,pav:pav,
       fotos:[],tipo:tipo,unidade:uni,bloco:bl};
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
    else if(v==='Ok'&&precisaReaval(uid))card.classList.add('ior');

    var sf=document.getElementById('fst').value;
    var out=(sf==='NAO_AVALIADOS'&&(v==='Ok'||v==='Inadequado'||v==='N/A'))||
            (sf==='INADEQUACOES'&&v==='Ok')||
            (sf==='NA_PENDENTES'&&v==='Ok');
    if(out){
      card.classList.add('out');
      card.addEventListener('transitionend',function(){
        card.remove();updCDebounced();updPBar();
      },{once:true});
    }else{updCDebounced();updPBar();}
  }else{invCache();renderLista();updCDebounced();}
}

// ─── HTML helpers ────────────────────────────────────────
function thumbH(uid,i,src){
  var ua=uid?(' data-uid="'+esc(uid)+'"'):'';
  return '<div class="thumb"><img src="'+esc(src)+'" alt="Foto">'+
    '<button class="tdel"'+ua+' data-idx="'+i+'" title="Remover">×</button></div>';
}
function cardSubHTML(sub){
  return '<div class="csubfoto">'+
    '<div class="slbl">📷 Fotos do subambiente: '+esc(sub)+'</div>'+
    '<div class="galeria" id="gsub">'+
      FSUB.map(function(f,i){return thumbH('',i,f.b64);}).join('')+
    '</div>'+
    '<div class="bfoto" data-uid="">📸 Adicionar foto do subambiente</div>'+
  '</div>';
}
function progBarHTML(todos,sub){
  var its=todos.filter(function(r){return(r[DI.SUB]||'Sem Subambiente')===sub;});
  var total=its.length;if(!total)return'';
  var ok=0,nk=0,na=0;
  its.forEach(function(it){
    var s=resStatus(it);
    if(s==='Ok')ok++;else if(s==='Inadequado')nk++;else if(s==='N/A')na++;
  });
  var av=ok+nk+na,pct=total>0?(av/total)*100:0;
  return '<div class="progwrap">'+
    '<div class="progbg"><div class="progfill" style="width:'+pct.toFixed(0)+'%"></div></div>'+
    '<div class="proglbl">'+av+'/'+total+' avaliados ('+pct.toFixed(0)+'%) — '+
    '✅'+ok+' · ❌'+nk+' · ⚫'+na+' · ⏳'+(total-av)+'</div>'+
  '</div>';
}
function cardH(item,idx){
  var uni=item[DI.UNI]||'',bl=item[DI.BLC]||'',pav=item[DI.PAV]||'';
  var amb=item[DI.SUB]||'',desc=item[DI.DESC]||'',uid=item[DI.UID];
  var st=resStatus(item);
  var sl=SEL.find(function(x){return x.uid===uid;});
  var obs=(STATUS[uid]&&STATUS[uid].obs)||String(item[DI.OBS]||'').trim();
  var ach=(STATUS[uid]&&STATUS[uid].achados)||'';
  var pend=String(item[DI.PEND]||'').trim();
  var dtAv=(STATUS[uid]&&STATUS[uid].dataUltimaAval)||'';
  var isOk=st==='Ok',isIN=st==='Inadequado',isNA=st==='N/A';
  var prR=isOk&&precisaReaval(uid),mp=mesesDesde(uid);
  var cls='ic'+(isNA?' ina':isIN?' inad':(isOk&&prR)?' ior':'');
  var achSel=sl&&sl.achados?sl.achados:(ach?ach.split(', ').filter(Boolean):[]);
  var obsV=sl?esc(sl.obs||''):'';
  var fH=sl&&sl.fotos?sl.fotos.map(function(f,i){return thumbH(uid,i,f.b64);}).join(''):'';
  var si=isOk?'✅':isIN?'❌':isNA?'⚫':'⬜';
  var aOk=isOk?'aok':'',aNk=isIN?'ank':'',aNa=isNA?'ana':'';
  var tipo=isIN?'Inadequado':isNA?'N/A':isOk?'Adequado':'Normal';
  var hHtml='';
  if(pend||obs||ach){
    hHtml='<div class="hbox">'+
      (pend?'<div>📋 <b>Pendência:</b> '+esc(pend)+'</div>':'')+
      (obs ?'<div>💬 <b>Última obs:</b> '+esc(obs)+'</div>':'')+
      (ach ?'<div>🔎 <b>Achados:</b> '+esc(ach)+'</div>':'')+
    '</div>';
  }
  var rvB=prR?'<div class="breavbadge">🔄 Reavaliação vencida'+(mp!==null?' ('+mp+'m)':'')+'</div>':
    (isOk&&dtAv?'<div style="font-size:11px;color:var(--text2);margin-bottom:6px">✅ Avaliado em '+esc(dtAv)+'</div>':'');
  var naB=isNA?'<div class="bnabadge">⚫ N/A — Retornar</div>':'';
  var chips=ACHADOS.map(function(a){
    return '<span class="chip'+(achSel.indexOf(a)>=0?' sel':'')+
      '" data-uid="'+esc(uid)+'" data-ach="'+esc(a)+'">'+esc(a)+'</span>';
  }).join('');
  return '<div class="'+cls+'" data-uid="'+esc(uid)+'">' +
    '<div class="ihr">'+
      '<div class="inum">'+(idx+1)+'</div>'+
      '<div class="iinf">'+
        '<div class="iloc">'+esc(pav)+' › '+esc(amb)+'</div>'+
        '<div class="idesc">'+esc(desc)+'</div>'+
      '</div>'+
      '<span class="sicon">'+si+'</span>'+
    '</div>'+
    rvB+naB+hHtml+
    '<div class="bgrp">'+
      '<button class="bopt '+aOk+'" data-v="Ok" data-uid="'+esc(uid)+'"'+
        ' data-uni="'+esc(uni)+'" data-bl="'+esc(bl)+'" data-pav="'+esc(pav)+'"'+
        ' data-amb="'+esc(amb)+'" data-desc="'+esc(desc)+'" data-tipo="'+tipo+'">✅ OK</button>'+
      '<button class="bopt '+aNk+'" data-v="Inadequado" data-uid="'+esc(uid)+'"'+
        ' data-uni="'+esc(uni)+'" data-bl="'+esc(bl)+'" data-pav="'+esc(pav)+'"'+
        ' data-amb="'+esc(amb)+'" data-desc="'+esc(desc)+'" data-tipo="'+tipo+'">❌ INADEQUADO</button>'+
      '<button class="bopt '+aNa+'" data-v="N/A" data-uid="'+esc(uid)+'"'+
        ' data-uni="'+esc(uni)+'" data-bl="'+esc(bl)+'" data-pav="'+esc(pav)+'"'+
        ' data-amb="'+esc(amb)+'" data-desc="'+esc(desc)+'" data-tipo="'+tipo+'">⚫ N/A</button>'+
    '</div>'+
    '<div class="achw">'+
      '<span class="achl">🔍 O que foi encontrado?</span>'+
      '<div class="achg">'+chips+'</div>'+
    '</div>'+
    '<div class="obsw">'+
      '<textarea data-uid="'+esc(uid)+'" placeholder="Observações..." rows="3">'+obsV+'</textarea>'+
      '<button class="bmic" data-muid="'+esc(uid)+'">🎙️</button>'+
    '</div>'+
    '<div class="galeria" id="g'+esc(uid)+'">'+fH+'</div>'+
    '<div class="bfoto" data-uid="'+esc(uid)+'">📸 Adicionar foto</div>'+
  '</div>';
}

// ─── Render lista ────────────────────────────────────────
function renderLista(){
  var lista=document.getElementById('lista');
  if(!lista)return;
  var u=(document.getElementById('u')||{value:''}).value.trim();
  var sub=(document.getElementById('sub')||{value:''}).value.trim();
  var sf=(document.getElementById('fst')||{value:'NAO_AVALIADOS'}).value;
  lista.innerHTML='';
  if(!u){
    lista.innerHTML='<div class="empty">🏢 Selecione uma unidade para começar.</div>';
    return;
  }
  if(DB.length<=1){
    lista.innerHTML='<div class="empty">⏳ Carregando dados...</div>';
    return;
  }
  var todos=getItens(),subMap={},statusCache={};
  todos.forEach(function(it){
    var s=resStatus(it);statusCache[it[DI.UID]]=s;
    var ns=it[DI.SUB]||'Sem Subambiente',bl=it[DI.BLC]||'',pv=it[DI.PAV]||'';
    var ck=bl+'|'+pv+'|'+ns;
    if(!subMap[ck])subMap[ck]={total:0,ok:0,nk:0,na:0,naoAv:0,itens:[],bloco:bl,pav:pv,sub:ns};
    var d=subMap[ck];d.total++;d.itens.push(it);
    if(s==='Ok')d.ok++;else if(s==='Inadequado')d.nk++;
    else if(s==='N/A')d.na++;else d.naoAv++;
  });
  var parts=[];
  if(sub){
    parts.push(cardSubHTML(sub));
    parts.push(progBarHTML(todos,sub));
    var its=todos.filter(function(it){return(it[DI.SUB]||'Sem Subambiente')===sub;});
    var filt=its.filter(function(it){
      var s=statusCache[it[DI.UID]];
      if(sf==='NAO_AVALIADOS')return s==='Nao Avaliado';
      if(sf==='INADEQUACOES') return s==='Inadequado';
      if(sf==='NA_PENDENTES') return s==='N/A';
      if(sf==='AVALIADOS_OK') return s==='Ok';
      return true;
    });
    if(!filt.length){
      parts.push('<div class="empty">✅ Nenhum item pendente neste filtro.</div>');
    }else{
      parts.push('<div class="infobanner">📋 '+filt.length+' item(ns) encontrado(s).</div>');
      filt.forEach(function(it,i){parts.push(cardH(it,i));});
    }
  }else{
    var subs=Object.keys(subMap).sort(function(a,b){
      var pa=a.split('|'),pb=b.split('|');
      if(pa[0]!==pb[0])return pa[0].localeCompare(pb[0]);
      if(pa[1]!==pb[1])return pa[1].localeCompare(pb[1]);
      return pa[2].localeCompare(pb[2]);
    });
    var filtSubs=subs.filter(function(k){
      var d=subMap[k];
      if(sf==='NAO_AVALIADOS')return d.naoAv>0;
      if(sf==='INADEQUACOES') return d.nk>0;
      if(sf==='NA_PENDENTES') return d.na>0;
      if(sf==='AVALIADOS_OK') return d.ok>0;
      return d.naoAv>0||d.nk>0||d.na>0;
    });
    if(!filtSubs.length){
      var msgs={
        NAO_AVALIADOS:'✅ Todos os subambientes já foram avaliados!',
        INADEQUACOES:'✅ Nenhuma inadequação pendente!',
        NA_PENDENTES:'✅ Nenhum N/A pendente!',
        AVALIADOS_OK:'Nenhum item OK. Avalie os itens primeiro.',
        TUDO:'✅ Nenhuma pendência!'
      };
      parts.push('<div class="empty">'+(msgs[sf]||'Nenhum item.')+'</div>');
    }else{
      var inaS=filtSubs.filter(function(k){return subMap[k].nk>0;});
      if(inaS.length&&(sf==='INADEQUACOES'||sf==='TUDO'||sf==='NAO_AVALIADOS')){
        parts.push('<h2 class="stit" style="color:var(--danger);">❌ INADEQUAÇÕES PENDENTES</h2>');
        inaS.forEach(function(k){
          var d=subMap[k];
          var ex=d.itens.find(function(it){return statusCache[it[DI.UID]]==='Inadequado';})||d.itens[0];
          var dn=(d.bloco?d.bloco+' - ':'')+(d.pav?d.pav+' - ':'')+d.sub;
          var vis=d.ok+d.nk+d.na,flt=d.total-vis;
          parts.push(
            '<div class="cig" data-uni="'+esc(ex[DI.UNI])+'" data-bl="'+esc(d.bloco)+
            '" data-pav="'+esc(d.pav)+'" data-sub="'+esc(d.sub)+'" data-filt="INADEQUACOES">'+
              '<div><div style="font-weight:700;font-size:16px;color:var(--danger);">'+esc(dn)+'</div>'+
              '<div style="font-size:13px;color:var(--text2);margin-top:4px;">'+
                '<span style="color:var(--danger);">❌ '+d.nk+' inad.</span> • '+
                '<span style="color:var(--primary);">📋 '+vis+' visit.</span> • '+
                '<span style="color:var(--warning);">⏳ '+flt+' falt.</span>'+
              '</div></div><span style="font-size:20px;color:var(--danger);">›</span></div>'
          );
        });
      }
      var naS=filtSubs.filter(function(k){return subMap[k].na>0;});
      if(naS.length&&(sf==='NA_PENDENTES'||sf==='TUDO'||sf==='NAO_AVALIADOS')){
        parts.push('<h2 class="stit" style="color:var(--na);">⚫ N/A — RETORNAR</h2>');
        naS.forEach(function(k){
          var d=subMap[k];
          var ex=d.itens.find(function(it){return statusCache[it[DI.UID]]==='N/A';})||d.itens[0];
          var dn=(d.bloco?d.bloco+' - ':'')+(d.pav?d.pav+' - ':'')+d.sub;
          var vis=d.ok+d.nk+d.na,flt=d.total-vis;
          parts.push(
            '<div class="cng" data-uni="'+esc(ex[DI.UNI])+'" data-bl="'+esc(d.bloco)+
            '" data-pav="'+esc(d.pav)+'" data-sub="'+esc(d.sub)+'" data-filt="NA_PENDENTES">'+
              '<div><div style="font-weight:700;font-size:16px;color:var(--na);">'+esc(dn)+'</div>'+
              '<div style="font-size:13px;color:var(--text2);margin-top:4px;">'+
                '<span style="color:var(--na);">⚫ '+d.na+' N/A</span> • '+
                '<span style="color:var(--primary);">📋 '+vis+' visit.</span> • '+
                '<span style="color:var(--warning);">⏳ '+flt+' falt.</span>'+
              '</div></div><span style="font-size:20px;color:var(--na);">›</span></div>'
          );
        });
      }
      var okS=filtSubs.filter(function(k){return subMap[k].ok>0;});
      if(okS.length&&(sf==='AVALIADOS_OK'||sf==='TUDO')){
        parts.push('<h2 class="stit" style="color:var(--success);">🔄 AVALIADOS OK — REAVALIAR</h2>');
        okS.forEach(function(k){
          var d=subMap[k];
          var ex=d.itens.find(function(it){return statusCache[it[DI.UID]]==='Ok';})||d.itens[0];
          var dn=(d.bloco?d.bloco+' - ':'')+(d.pav?d.pav+' - ':'')+d.sub;
          var venc=d.itens.filter(function(it){return statusCache[it[DI.UID]]==='Ok'&&precisaReaval(it[DI.UID]);}).length;
          var vB=venc>0?'<span style="background:#fef3e0;color:#92400e;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:6px;">🔄 '+venc+' venc.</span>':'';
          parts.push(
            '<div class="cokl" data-uni="'+esc(ex[DI.UNI])+'" data-bl="'+esc(d.bloco)+
            '" data-pav="'+esc(d.pav)+'" data-sub="'+esc(d.sub)+'" data-filt="AVALIADOS_OK">'+
              '<div><div style="font-weight:700;font-size:16px;color:var(--success);display:flex;align-items:center;flex-wrap:wrap;gap:4px;">'+esc(dn)+vB+'</div>'+
              '<div style="font-size:13px;color:var(--text2);margin-top:4px;">'+
                '<span style="color:var(--success);">✅ '+d.ok+' adeq.</span> • '+
                '<span>📋 '+d.total+' total</span>'+
              '</div></div><span style="font-size:20px;color:var(--success);">›</span></div>'
          );
        });
      }
      var naS2=filtSubs.filter(function(k){return subMap[k].naoAv>0;});
      if(naS2.length&&(sf==='NAO_AVALIADOS'||sf==='TUDO')){
        parts.push('<h2 class="stit" style="color:var(--warning);">⬜ NÃO AVALIADOS</h2>');
        parts.push('<div class="infobanner">📋 '+naS2.length+' subambiente(s) com itens não avaliados.</div>');
        naS2.forEach(function(k){
          var d=subMap[k];
          var ex=d.itens.find(function(it){return statusCache[it[DI.UID]]==='Nao Avaliado';})||d.itens[0];
          var dn=(d.bloco?d.bloco+' - ':'')+(d.pav?d.pav+' - ':'')+d.sub;
          var vis=d.ok+d.nk+d.na,flt=d.total-vis;
          parts.push(
            '<div class="cnv2" data-uni="'+esc(ex[DI.UNI])+'" data-bl="'+esc(d.bloco)+
            '" data-pav="'+esc(d.pav)+'" data-sub="'+esc(d.sub)+'" data-filt="NAO_AVALIADOS">'+
              '<div><div style="font-weight:700;font-size:16px;color:var(--warning);">'+esc(dn)+'</div>'+
              '<div style="font-size:13px;color:var(--text2);margin-top:4px;">'+
                '<span style="color:var(--warning);">⬜ '+d.naoAv+' não aval.</span> • '+
                '<span style="color:var(--primary);">📋 '+vis+' visit.</span> • '+
                '<span style="color:var(--warning);">⏳ '+flt+' falt.</span>'+
              '</div></div><span style="font-size:20px;color:var(--warning);">›</span></div>'
          );
        });
      }
    }
  }
  lista.innerHTML=parts.join('');
  renderGalerias();
}

// ─── Limpar filtros secundários ───────────────────────────
function limparSecundarios(){
  document.getElementById('b').value='';
  document.getElementById('pav').value='';
  document.getElementById('sub').value='';
  savFilt();invCache();invRsCache();renderLista();updCDebounced();
}

// ─── Contadores / progresso ───────────────────────────────
function updPG(){
  var u=document.getElementById('u').value.trim();
  var cp=document.getElementById('cpg');
  if(!u){if(cp)cp.style.display='none';return;}
  if(cp)cp.style.display='block';
  var todos=getItens(),total=0,av=0,ok=0,nk=0,na=0;
  todos.forEach(function(it){
    total++;var s=resStatus(it);
    if(s==='Ok'||s==='Inadequado'||s==='N/A'){av++;if(s==='Ok')ok++;else if(s==='Inadequado')nk++;else na++;}
  });
  var pct=total>0?(av/total)*100:0,flt=total-av;
  var fill=document.getElementById('pgf');
  if(fill){fill.style.width=pct.toFixed(0)+'%';fill.style.background=pct===100?'var(--success)':pct<50?'var(--warning)':'var(--primary)';}
  var el;
  el=document.getElementById('pgt');if(el)el.innerText=av+' / '+total;
  el=document.getElementById('pgok');if(el)el.innerHTML='✅ '+ok+' adequados';
  el=document.getElementById('pgnk');if(el)el.innerHTML='❌ '+nk+' inadequados';
  el=document.getElementById('pgna');if(el)el.innerHTML='⚫ '+na+' N/A';
  el=document.getElementById('pgpnd');if(el)el.innerHTML='⏳ '+flt+' faltando';
}
function updPBar(){
  var sub=document.getElementById('sub').value.trim();if(!sub)return;
  var nh=progBarHTML(getItens(),sub);
  var ex=document.querySelector('.progwrap');
  if(ex&&nh){var t=document.createElement('div');t.innerHTML=nh;var nv=t.firstElementChild;if(nv)ex.replaceWith(nv);}
}
function updContadores(){
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
    if(av>0)ambAv++;if(av>0&&av<d.total)ambP++;
    if(d.naoAv>0||d.nk>0||d.na>0)ambVis++;if(d.temIn)ambIn++;
  });
  var info=cicloInfo(u,Object.keys(sMap).length);
  function s(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  s('cok',totOk);s('cnk',totNk);s('caa',ambAv);s('cap',ambP);s('cav',ambVis);s('cai',ambIn);
  s('cam',info.media);s('cams',info.sub);
  s('crvc',reaval);s('crvs',reaval>0?(reaval+' vencido(s) — clique'):'Tudo em dia ✅');
  s('cnvc',naPend);s('cnvs',naPend>0?(naPend+' N/A — clique'):'Nenhum N/A ✅');
  updPG();
}
function zerarC(){
  ['cok','cnk','caa','cap','cav','cai','crvc','cnvc'].forEach(function(id){var el=document.getElementById(id);if(el)el.textContent='0';});
  function s(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
  s('cam','—');s('cams','Selecione uma unidade');s('crvs','Selecione uma unidade');s('crvc','—');s('cnvs','Selecione uma unidade');s('cnvc','—');
  var f=document.getElementById('pgf');if(f){f.style.width='0%';f.style.background='var(--primary)';}
  var el;
  el=document.getElementById('pgt');if(el)el.innerText='0 / 0';
  el=document.getElementById('pgok');if(el)el.innerHTML='✅ 0 adequados';
  el=document.getElementById('pgnk');if(el)el.innerHTML='❌ 0 inadequados';
  el=document.getElementById('pgna');if(el)el.innerHTML='⚫ 0 N/A';
  el=document.getElementById('pgpnd');if(el)el.innerHTML='⏳ 0 faltando';
  var cp=document.getElementById('cpg');if(cp)cp.style.display='none';
}

// ─── Fotos ────────────────────────────────────────────────
function handleFotos(e){
  var files=e.target.files;if(!files.length)return;
  var ps=[];
  for(var i=0;i<files.length;i++){
    (function(f){ps.push(new Promise(function(res){var r=new FileReader();r.onload=function(ev){res(ev.target.result);};r.readAsDataURL(f);}));})(files[i]);
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

// ─── Salvar avaliações ───────────────────────────────────
async function tentarSalvar(){
  var resp=document.getElementById('resp').value.trim();
  var u=document.getElementById('u').value.trim();
  var b=document.getElementById('b').value.trim();
  var sub=document.getElementById('sub').value.trim();
  if(!resp||!u||!b){toast('Preencha Inspetor, Unidade e Bloco.',4000);return;}
  var its=SEL.filter(function(s){return s.v||s.obs||s.fotos.length>0||(s.achados&&s.achados.length>0);});
  if(!its.length&&!FSUB.length){toast('Nenhuma avaliação para salvar.',3000);return;}

  var pacote={
    r:resp,u:u,b:b,sub:sub,
    fotosSubambiente:FSUB.map(function(f){return f.b64;}),
    itens:its.map(function(s){return{
      pav:s.pav,amb:s.amb,p:s.p,v:s.v,obs:s.obs,
      fotos:s.fotos.map(function(f){return f.b64;}),tipo:s.tipo,
      achados:(s.achados||[]).join(', ')
    };})
  };

  var btn=document.getElementById('bsave');
  btn.textContent='💾 SALVANDO...';btn.disabled=true;

  its.forEach(function(s){
    STATUS[s.uid]={
      status:s.v.toUpperCase(),
      obs:s.obs||'',
      achados:(s.achados||[]).join(', '),
      dataUltimaAval:hojeStr()
    };
  });
  salvarStatus();

  if(!navigator.onLine){
    addFilaSave(pacote);
    toast('🔴 OFFLINE. Salvo na fila.');
    SEL=[];FSUB=[];invRsCache();renderLista();updContadores();
    btn.textContent='💾 SALVAR AVALIAÇÕES';btn.disabled=false;updFila();return;
  }

  try{
    var fila=getFilaSave();
    fila.push(pacote);
    await callGas('salvarRegistrosEmLote',{},'POST',fila);
    setFilaSave([]);
    toast('✅ Avaliações salvas com sucesso!');
    SEL=[];FSUB=[];invRsCache();renderLista();updContadores();
    updHoje();
  }catch(error){
    addFilaSave(pacote);
    toast('❌ Erro ao salvar. Adicionado à fila offline.',5000);
    console.error('Erro ao salvar:',error);
  }finally{
    btn.textContent='💾 SALVAR AVALIAÇÕES';btn.disabled=false;updFila();
  }
}

// ─── CSV ──────────────────────────────────────────────────
async function baixarRelatorio(){
  toast('⏳ Gerando CSV...');
  try{
    var dados=await callGas('obterRespostasDoDia');
    if(!dados||!dados.length){toast('Nenhum dado hoje.',3000);return;}
    var csv='\uFEFF'+dados.map(function(row){
      return row.map(function(c){var v=(c===null||c===undefined)?'':String(c);return'"'+v.replace(/"/g,'""')+'"';}).join(',');
    }).join('\r\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='relatorio_'+hojeStr().replace(/\//g,'-')+'.csv';
    a.style.display='none';document.body.appendChild(a);a.click();
    document.body.removeChild(a);URL.revokeObjectURL(url);
    toast('✅ CSV baixado!');
  }catch(e){toast('❌ Erro CSV: '+e.message,5000);}
}

// ─── Histórico ────────────────────────────────────────────
async function carregarHist(unidade){
  var card=document.getElementById('chist'),cont=document.getElementById('hcont');
  if(!card||!cont)return;
  card.style.display='block';
  cont.innerHTML='<div class="hload">⏳ Carregando histórico...</div>';
  try{
    var d=await callGas('obterHistorico6Meses',{unidade:unidade});
    if(!d||!d.meses||!d.meses.length){
      cont.innerHTML='<div class="hload">Nenhum registro nos últimos 6 meses.</div>';return;
    }
    cont.innerHTML=buildHist(d,unidade);
  }catch(e){
    cont.innerHTML='<div class="hload" style="color:var(--danger);">Erro ao carregar histórico.</div>';
  }
}
function buildHist(d,unidade){
  var hoje=new Date(),uN=nrmU(unidade),ciclo=CICLOS[uN];
  var regraH=ciclo
    ?'<div class="crcicloh"><b>📋 Ciclo:</b> '+ME[ciclo.i-1]+' a '+ME[ciclo.f-1]+'.</div>'
    :'<div class="crcicloh"><b>📋 Regra:</b> Reavaliar a cada 6 meses.</div>';
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

// ─── Ambientes verificados hoje ───────────────────────────
async function obterAmbientesVerificadosHoje(){
  try{
    var n=await callGas('obterAmbientesVerificadosHoje');
    return n||0;
  }catch(e){return 0;}
}
async function updHoje(){
  var n=await obterAmbientesVerificadosHoje();
  var el=document.getElementById('chj');if(el)el.textContent=n;
}

// ─── Voz (SpeechRecognition) ──────────────────────────────
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

// ─── Eventos ──────────────────────────────────────────────
function onClick(e){
  var t=e.target;

  var bopt=t.closest&&t.closest('.bopt');
  if(bopt){
    e.preventDefault();
    marcar(bopt.dataset.uid,bopt.dataset.v,bopt.dataset.uni,bopt.dataset.bl,
           bopt.dataset.pav,bopt.dataset.amb,bopt.dataset.desc,bopt.dataset.tipo);
    return;
  }
  var chip=t.closest&&t.closest('.chip');
  if(chip){e.preventDefault();toggleAch(chip.dataset.uid,chip.dataset.ach);return;}
  var bmic=t.closest&&t.closest('.bmic');
  if(bmic){e.preventDefault();iniciarVoz(bmic.dataset.muid);return;}
  var cnv2=t.closest&&t.closest('.cnv2');
  if(cnv2){e.preventDefault();irParaSub(cnv2.dataset.uni,cnv2.dataset.bl,cnv2.dataset.pav,cnv2.dataset.sub,cnv2.dataset.filt||'TUDO');return;}
  var cig=t.closest&&t.closest('.cig');
  if(cig){e.preventDefault();irParaSub(cig.dataset.uni,cig.dataset.bl,cig.dataset.pav,cig.dataset.sub,cig.dataset.filt||'INADEQUACOES');return;}
  var cng=t.closest&&t.closest('.cng');
  if(cng){e.preventDefault();irParaSub(cng.dataset.uni,cng.dataset.bl,cng.dataset.pav,cng.dataset.sub,cng.dataset.filt||'NA_PENDENTES');return;}
  var cokl=t.closest&&t.closest('.cokl');
  if(cokl){e.preventDefault();irParaSub(cokl.dataset.uni,cokl.dataset.bl,cokl.dataset.pav,cokl.dataset.sub,cokl.dataset.filt||'AVALIADOS_OK');return;}
  var bfoto=t.closest&&t.closest('.bfoto');
  if(bfoto){e.preventDefault();var uid=bfoto.dataset.uid;FOTO_CTX=uid?{tipo:'item',uid:uid}:{tipo:'sub'};var ci=document.getElementById('camInput');ci.value='';ci.click();return;}
  var tdel=t.closest&&t.closest('.tdel');
  if(tdel){e.preventDefault();removerFoto(tdel.dataset.uid,parseInt(tdel.dataset.idx,10));return;}
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

// ─── Init ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',function(){
  document.addEventListener('click',onClick);
  document.addEventListener('change',function(e){
    var ta=e.target;
    if(ta.tagName==='TEXTAREA'&&ta.dataset.uid)onTA(e);
  });
  var ci=document.getElementById('camInput');
  if(ci)ci.addEventListener('change',handleFotos);
  ['u','b','pav','sub'].forEach(function(id){
    var el=document.getElementById(id);
    if(!el)return;
    el.addEventListener('change',function(){
      savFilt();invCache();invRsCache();
      if(id==='u')carregar();
      else{renderLista();updCDebounced();}
    });
  });
  var resp=document.getElementById('resp');
  if(resp)resp.addEventListener('change',savFilt);
  var fst=document.getElementById('fst');
  if(fst)fst.addEventListener('change',function(){savFilt();invRsCache();renderLista();updCDebounced();});
  carregar();
});
