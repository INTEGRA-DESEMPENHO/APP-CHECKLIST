/* ═══════════════════════════════════════════════════
   Vistoria Fênix v9 — Code.gs com SNAPSHOT
   PARA IMPLANTAÇÃO COMO APLICATIVO DA WEB

   IDEIA CENTRAL
   - O cruzamento BASE DE DADOS x RESPOSTAS CHECK (último status de cada item)
     é montado UMA vez e guardado num arquivo JSON no Drive (o "snapshot").
   - O app lê esse snapshot (1-2s) em vez de varrer a planilha (1,7 min) a cada carga.
   - Ao SALVAR, o snapshot é atualizado só nos itens que mudaram (rápido, sem varrer).
     => marcou Inadequado e salvou? o item já fica Inadequado para a próxima avaliação.

   INSTALAÇÃO (uma vez):
   1) Cole este código, salve.
   2) Rode a função reconstruirSnapshot() manualmente (Executar) e autorize.
      (A primeira montagem demora ~1-2 min; depois é instantâneo.)
   3) Implante: Implantar > Gerenciar implantações > Nova versão.
   4) SEMPRE que editar a aba BASE DE DADOS (checklist), rode reconstruirSnapshot()
      de novo. Salvar avaliações pelo app NÃO precisa disso (atualiza sozinho).
*/

// ─── Utilitários ─────────────────────────────────
function nrm_(s){
  return (s||'').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function canonical_(s){
  return (s||'').toString().trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function isUnidadeValida_(s){
  return canonical_(s).length>=3;
}
function uid_(u,b,pav,sub,item){
  return [nrm_(u),nrm_(b),nrm_(pav),nrm_(sub),nrm_(item)].join('||').substring(0,200);
}
function tz_(){ return Session.getScriptTimeZone(); }
function hojeStr_(){ return Utilities.formatDate(new Date(),tz_(),'dd/MM/yyyy'); }
function mesKey_(dt){ return dt.getFullYear()+'-'+(dt.getMonth()+1); }

// ─── Arquivo de snapshot no Drive ────────────────────────────────
var SNAP_NAME_ = 'vfx_snapshot_v9.json';
function _snapFile_(criar){
  var it=DriveApp.getFilesByName(SNAP_NAME_);
  if(it.hasNext()) return it.next();
  if(criar) return DriveApp.createFile(SNAP_NAME_,'{}','application/json');
  return null;
}
function lerSnapshot_(){
  var f=_snapFile_(false); if(!f) return null;
  try{ var t=f.getBlob().getDataAsString('UTF-8'); return t?JSON.parse(t):null; }
  catch(e){ Logger.log('lerSnapshot_ '+e); return null; }
}
function gravarSnapshot_(obj){
  _snapFile_(true).setContent(JSON.stringify(obj));
  marcarLimpo_(); // acabou de reconstruir: snapshot está atualizado
}

// ─── Sinalização de "snapshot desatualizado" ─────────────────────
// Quando você edita a BASE DE DADOS ou exclui linhas da RESPOSTAS CHECK,
// o gatilho onEdit marca o snapshot como "sujo". Na próxima carga do app,
// o snapshot é reconstruído automaticamente — sem você rodar nada.
function _props_(){ return PropertiesService.getScriptProperties(); }
function marcarSujo_(){ try{ _props_().setProperty('SNAP_SUJO','1'); }catch(e){} }
function marcarLimpo_(){ try{ _props_().setProperty('SNAP_SUJO','0'); }catch(e){} }
function estaSujo_(){ try{ return _props_().getProperty('SNAP_SUJO')==='1'; }catch(e){ return false; } }

// Gatilho de edição. Instale uma vez rodando instalarGatilho().
// IMPORTANTE: só marca "sujo" quando a BASE DE DADOS (o checklist) muda.
// Edições na RESPOSTAS CHECK NÃO sujam o snapshot, porque:
//  - salvar pelo app já atualiza o snapshot de forma incremental;
//  - assim, trocar de unidade lê sempre o arquivo pronto (rápido), sem reconstruir.
function aoEditar_(e){
  try{
    var nome=e&&e.range&&e.range.getSheet?e.range.getSheet().getName():'';
    if(nome==='BASE DE DADOS') marcarSujo_();
  }catch(err){ Logger.log('aoEditar_ '+err); }
}

// Rode esta função UMA vez (Executar) para instalar o gatilho automático.
function instalarGatilho(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  // remove gatilhos antigos da mesma função p/ não duplicar
  ScriptApp.getProjectTriggers().forEach(function(t){
    if(t.getHandlerFunction()==='aoEditar_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('aoEditar_').forSpreadsheet(ss).onEdit().create();
  return 'Gatilho instalado. O app reflete mudanças na BASE DE DADOS automaticamente.';
}

// Se o app ficar lento (reconstruindo toda vez), rode esta função UMA vez
// para destravar a flag e forçar uma reconstrução limpa imediata.
function destravar(){
  reconstruirSnapshot(); // monta e já marca limpo
  return 'Snapshot reconstruído e destravado. Trocar de unidade deve ficar rápido agora.';
}

// ─── DIAGNÓSTICO (uso temporário) ────────────────────────────────
// Abra: .../exec?action=diag  -> mostra cabeçalhos das abas e amostra de uids,
// para verificar se o uid da BASE casa com o uid da RESPOSTAS CHECK.
function diag(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var out={};
  var shB=ss.getSheetByName('BASE DE DADOS');
  var shR=ss.getSheetByName('RESPOSTAS CHECK');
  if(shB){
    var b=shB.getDataRange().getDisplayValues();
    out.BASE_cabecalho=b[0];
    // amostra: primeiro item válido
    for(var i=1;i<b.length;i++){
      if((b[i][1]||'').trim() && (b[i][7]||'').trim()){
        out.BASE_amostra={unidade:b[i][1],bloco:b[i][3],pav:b[i][4],
          nomeAmb:b[i][6],item:b[i][7],
          uid:uid_(b[i][1],b[i][3],b[i][4],b[i][6],b[i][7])};
        break;
      }
    }
  }
  if(shR){
    var r=shR.getDataRange().getValues();
    out.RESP_cabecalho=r[0];
    out.RESP_total_linhas=r.length-1;
    // amostra: última linha com status preenchido
    for(var j=r.length-1;j>=1;j--){
      if((r[j][9]||'').toString().trim()){
        out.RESP_amostra={data:r[j][0],unidade:r[j][2],bloco:r[j][3],
          subambiente:r[j][4],pav:r[j][6],ambienteItem:r[j][7],
          item:r[j][8],status:r[j][9]};
        break;
      }
    }
  }
  return out;
}

// ─── Roteamento ──────────────────────────────────
function doGet(e){
  e = e || {}; var p = e.parameter || {};
  var action  = (p.action  ||'').trim();
  var unidade = (p.unidade ||'').trim();
  try{
    var result;
    if     (action==='carregarTudo')                  result=carregarTudo(unidade);
    else if(action==='puxarDadosBase')                result=carregarTudo(unidade).base;
    else if(action==='obterHistorico6Meses')          result=carregarTudo(unidade).historico;
    else if(action==='obterAmbientesVerificadosHoje') result=_hojeDoSnap_(lerSnapshot_()||reconstruirSnapshot());
    else if(action==='obterRespostasDoDia')           result=obterRespostasDoDia();
    else if(action==='reconstruirSnapshot')           result=reconstruirSnapshot();
    else if(action==='destravar')                     result=destravar();
    else if(action==='diag')                          result=diag();
    else if(action==='instalarGatilho')               result=instalarGatilho();
    else result={erro:'Ação desconhecida: '+action};

    return ContentService.createTextOutput(JSON.stringify({status:'success',data:result}))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    Logger.log('doGet error: '+err.message);
    return ContentService.createTextOutput(JSON.stringify({status:'error',erro:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e){
  try{
    e = e || {};
    var body   = JSON.parse((e.postData&&e.postData.contents)||'{}');
    var action = (body.action||'').trim();
    var data   = body.data||null;
    var result;
    if     (action==='salvarRegistro')        result=salvarRegistrosEmLote([data]);
    else if(action==='salvarRegistrosEmLote') result=salvarRegistrosEmLote(data);
    else result={erro:'Ação POST desconhecida: '+action};

    return ContentService.createTextOutput(JSON.stringify({status:'success',data:result}))
      .setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    Logger.log('doPost error: '+err.message);
    return ContentService.createTextOutput(JSON.stringify({status:'error',erro:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── LEITURA RÁPIDA (a partir do snapshot) ───────────────────────
function carregarTudo(unidade){
  var snap=lerSnapshot_();
  // reconstrói se: não existe, ou a planilha foi editada (gatilho marcou "sujo")
  if(!snap||!snap.base||estaSujo_()) snap=reconstruirSnapshot();

  var alvo=canonical_(unidade||'');
  var status=snap.status||{};
  var HEADER=snap.base[0];

  var dados=[HEADER], unicas=[], uSet={}, statusSub={};
  for(var i=1;i<snap.base.length;i++){
    var l=snap.base[i].slice(); // cópia (vamos sobrescrever colunas de status)
    var uCan=l[1];              // coluna Unidade já vem canônica
    if(!uSet[uCan]){uSet[uCan]=true;unicas.push(uCan);}
    if(alvo && uCan!==alvo) continue;

    var uid=l[13], st0=status[uid];
    if(st0){
      var st=(st0.status||'').toUpperCase();
      if(st==='OK')             {l[9]='VERDADEIRO';l[10]='FALSO';l[8]='Sim';}
      else if(st==='INADEQUADO'){l[9]='FALSO';l[10]='VERDADEIRO';l[8]='Sim';}
      else if(st==='N/A')       {l[8]='N/A';l[9]='FALSO';l[10]='FALSO';}
      if(st0.obs)     l[12]=st0.obs;
      if(st0.achados) l[11]=st0.achados;
      statusSub[uid]=st0;
    }
    dados.push(l);
  }
  unicas.sort();

  return {
    base:      { dados:dados, ultimosStatus: alvo?statusSub:status, unidadesUnicas:unicas },
    historico: _historicoDoSnap_(snap, alvo),
    hoje:      _hojeDoSnap_(snap)
  };
}

function _hojeDoSnap_(snap){
  var h=snap&&snap.hoje;
  if(!h||h.data!==hojeStr_()) return 0;
  return Object.keys(h.subs||{}).length;
}

function _historicoDoSnap_(snap, uCan){
  var MESES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var hoje=new Date(), mesesRef=[];
  for(var i=5;i>=0;i--){
    var d=new Date(hoje.getFullYear(),hoje.getMonth()-i,1);
    mesesRef.push({ano:d.getFullYear(),mes:d.getMonth()+1,key:mesKey_(d),
      label:MESES[d.getMonth()]+'/'+String(d.getFullYear()).slice(2)});
  }
  var hist=(snap.histByUnit||{})[uCan]||{};
  var subsUnicos={}, totalReg=0, totalInad=0;
  var meses=mesesRef.map(function(m){
    var a=hist[m.key]||{subs:{},ok:0,inadequados:0,na:0};
    var nSub=Object.keys(a.subs||{}).length;
    Object.keys(a.subs||{}).forEach(function(k){subsUnicos[k]=1;});
    totalReg+=(a.ok||0)+(a.inadequados||0)+(a.na||0);
    totalInad+=(a.inadequados||0);
    return {mes:m.mes,ano:m.ano,label:m.label,
      subambientes:nSub,ok:a.ok||0,inadequados:a.inadequados||0,na:a.na||0};
  });
  var totalBase=Object.keys((snap.baseSubsByUnit||{})[uCan]||{}).length;
  var subsCount=Object.keys(subsUnicos).length;
  return {
    meses:meses,
    totalSubambientes:subsCount,
    totalVisitados:totalReg,
    totalInadequados:totalInad,
    percentualCobertura:totalBase>0?Math.min(100,Math.round((subsCount/totalBase)*100)):0
  };
}

// ─── RECONSTRUÇÃO COMPLETA (varre as planilhas 1 vez) ────────────
function reconstruirSnapshot(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();

  // 1) RESPOSTAS CHECK -> status (último por item) + histórico + hoje
  var shRC=ss.getSheetByName('RESPOSTAS CHECK');
  var status={}, histByUnit={}, hojeSubs={};
  var hoje=hojeStr_();
  if(shRC && shRC.getLastRow()>1){
    var rc=shRC.getDataRange().getValues();
    var hdrs=rc[0];
    function col(names){
      for(var n=0;n<names.length;n++)
        for(var c=0;c<hdrs.length;c++)
          if(nrm_(hdrs[c])===nrm_(names[n])) return c;
      return -1;
    }
    var cData=col(['data']), cUni=col(['unidade']), cBlc=col(['bloco']);
    var cPav=col(['pavimento']);
    var cSub=col(['subambiente','ambiente item','nomeamb']);
    var cItem=col(['item','verificação','verificacao']);
    var cSt=col(['status']), cObs=col(['observação','observacao','obs']);
    var cAch=col(['achados']);
    var ult={}; // uid -> {ts, ...}

    for(var i=1;i<rc.length;i++){
      var l=rc[i];
      var uni=(l[cUni]||'').toString().trim(); if(!isUnidadeValida_(uni)) continue;
      var subL =(cSub >=0?l[cSub] ||'':'').toString().trim();
      var itemL=(cItem>=0?l[cItem]||'':'').toString().trim();
      if(!subL||!itemL||subL==='(Registro de ambiente)') continue;
      var ds=l[cData]; if(!ds) continue;
      var dt=ds instanceof Date?ds:new Date(ds);
      if(isNaN(dt.getTime())) continue;

      var bloco=cBlc>=0?(l[cBlc]||'').toString().trim():'';
      var pav  =cPav>=0?(l[cPav]||'').toString().trim():'';
      var id=uid_(uni,bloco,pav,subL,itemL);
      var st=(cSt>=0?l[cSt]||'':'').toString().trim().toUpperCase();

      // último status por item
      if(!ult[id]||dt>ult[id].ts){
        ult[id]={ts:dt,status:st,
          obs:cObs>=0?(l[cObs]||'').toString().trim():'',
          achados:cAch>=0?(l[cAch]||'').toString().trim():''};
      }

      // agregado de histórico por unidade/mês
      var uCan=canonical_(uni), mk=mesKey_(dt), chave=bloco+'|'+pav+'|'+subL;
      if(!histByUnit[uCan]) histByUnit[uCan]={};
      if(!histByUnit[uCan][mk]) histByUnit[uCan][mk]={subs:{},ok:0,inadequados:0,na:0};
      var a=histByUnit[uCan][mk];
      a.subs[chave]=1;
      if(st==='OK')a.ok++; else if(st==='INADEQUADO')a.inadequados++; else if(st==='N/A')a.na++;

      // ambientes verificados hoje
      if(Utilities.formatDate(dt,tz_(),'dd/MM/yyyy')===hoje) hojeSubs[uCan+'|'+chave]=1;
    }
    Object.keys(ult).forEach(function(id){
      var v=ult[id];
      status[id]={status:v.status,obs:v.obs,achados:v.achados,
        dataUltimaAval:Utilities.formatDate(v.ts,tz_(),'dd/MM/yyyy')};
    });
  }

  // 2) BASE DE DADOS -> linhas normalizadas + subambientes por unidade
  var shB=ss.getSheetByName('BASE DE DADOS');
  if(!shB) throw new Error('Aba "BASE DE DADOS" não encontrada.');
  var HEADER=['Ordem','Unidade','UniNorm','Bloco','Pavimento','AmbTag',
              'NomeAmb','Verificação','Aval','Adeq','Inad','Pend','Obs','UID'];
  var base=[HEADER], baseSubsByUnit={};
  var raw=shB.getDataRange().getDisplayValues();
  for(var r=1;r<raw.length;r++){
    var b=raw[r];
    var uni=(b[1]||'').trim(); if(!uni||!isUnidadeValida_(uni)) continue;
    var item=(b[7]||'').trim(); if(!item) continue;
    var bloco=(b[3]||'').trim(), pav=(b[4]||'').trim(), sub=(b[6]||'').trim();
    var uCan=canonical_(uni);
    base.push([
      (b[0]||'').trim(), uCan, nrm_(uni),
      bloco, pav, (b[5]||'').trim(), sub, item,
      (b[8]||'').trim(), (b[9]||'').trim(), (b[10]||'').trim(),
      (b[11]||'').trim(), (b[12]||'').trim(),
      uid_(uni,bloco,pav,sub,item)
    ]);
    if(!baseSubsByUnit[uCan]) baseSubsByUnit[uCan]={};
    if(sub) baseSubsByUnit[uCan][bloco+'|'+pav+'|'+sub]=1;
  }

  var snap={ts:new Date().getTime(), base:base, status:status,
            histByUnit:histByUnit, baseSubsByUnit:baseSubsByUnit,
            hoje:{data:hoje, subs:hojeSubs}};
  gravarSnapshot_(snap);
  return snap;
}

// ─── SALVAR (grava na RESPOSTAS CHECK + atualiza o snapshot) ─────
function salvarRegistrosEmLote(pacotes){
  if(!Array.isArray(pacotes)||!pacotes.length)
    return {sucesso:false,msg:'Sem dados.'};

  var sheet = obterAbaRespostas_();
  var pasta = obterPastaDrive_();
  var rows  = [];
  var snap  = (estaSujo_()? null : lerSnapshot_()) || reconstruirSnapshot();
  if(!snap.histByUnit)     snap.histByUnit={};
  if(!snap.status)         snap.status={};
  var hoje  = hojeStr_();
  if(!snap.hoje || snap.hoje.data!==hoje) snap.hoje={data:hoje, subs:{}};

  pacotes.forEach(function(p){
    var ts      = new Date();
    var dataFmt = Utilities.formatDate(ts,tz_(),'dd/MM/yyyy HH:mm:ss');
    var uCan    = canonical_(p.u||'');
    var prefSub = ('SUB_'+(p.b||'')+'_'+(p.sub||'geral')).replace(/\s+/g,'_').substring(0,50);
    var urlsSub = uploadFotos_(pasta,prefSub,p.fotosSubambiente||[],ts.getTime());
    var fSub    = urlsSub.length?urlsSub.join(' | '):'';
    var mk      = mesKey_(ts);

    if((!p.itens||!p.itens.length)&&urlsSub.length){
      rows.push([dataFmt,p.r||'',uCan,p.b||'',p.sub||'',fSub,'','','(Registro de ambiente)','','','','','']);
    }

    (p.itens||[]).forEach(function(it){
      var temS=it.v&&it.v.trim()!=='';
      var temO=it.obs&&it.obs.trim()!=='';
      var temF=it.fotos&&it.fotos.length>0;
      var temA=it.achados&&it.achados.trim()!=='';
      if(!temS&&!temO&&!temF&&!temA) return;
      var pref=('ITEM_'+(p.b||'')+'_'+(it.amb||'')+'_'+(it.p||''))
               .replace(/\s+/g,'_').replace(/[^a-zA-Z0-9_]/g,'').substring(0,50);
      var urlsI=uploadFotos_(pasta,pref,it.fotos||[],ts.getTime());
      var fItem=urlsI.length?urlsI.join(' | '):'';
      var stN  =normSt_(it.v);

      rows.push([
        dataFmt, p.r||'', uCan, p.b||'',
        it.amb||'', fSub, it.pav||'', it.amb||'',
        it.p||'', stN, it.obs||'', fItem,
        it.tipo||'', it.achados||''
      ]);

      // ── atualização incremental do snapshot ──
      var uid=uid_(p.u,p.b,it.pav,it.amb,it.p);
      var stU=(stN||'').toUpperCase();
      if(stU){
        snap.status[uid]={status:stU, obs:it.obs||'',
          achados:it.achados||'', dataUltimaAval:hoje};
      }
      var chave=(p.b||'')+'|'+(it.pav||'')+'|'+(it.amb||'');
      if(!snap.histByUnit[uCan]) snap.histByUnit[uCan]={};
      if(!snap.histByUnit[uCan][mk]) snap.histByUnit[uCan][mk]={subs:{},ok:0,inadequados:0,na:0};
      var ag=snap.histByUnit[uCan][mk];
      ag.subs[chave]=1;
      if(stU==='OK')ag.ok++; else if(stU==='INADEQUADO')ag.inadequados++; else if(stU==='N/A')ag.na++;
      snap.hoje.subs[uCan+'|'+chave]=1;
    });
  });

  if(rows.length>0){
    sheet.getRange(sheet.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
    snap.ts=new Date().getTime();
    gravarSnapshot_(snap); // snapshot já reflete o que foi salvo
  }
  return {sucesso:true,registrosSalvos:rows.length};
}

function salvarRegistro(p){ return salvarRegistrosEmLote([p]); }

// ─── CSV do dia (lê a planilha; usado só no botão CSV) ───────────
function obterRespostasDoDia(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss.getSheetByName('RESPOSTAS CHECK');
  if(!sheet) return [];
  var dados=sheet.getDataRange().getDisplayValues();
  if(dados.length<2) return [];
  var hoje=hojeStr_();
  var linhas=dados.slice(1).filter(function(l){return String(l[0]).indexOf(hoje)===0;});
  return linhas.length?[dados[0]].concat(linhas):[];
}

// ─── Helpers de gravação ─────────────────────────────────────────
function normSt_(v){
  if(!v) return '';
  var s=v.trim().toUpperCase();
  if(s==='OK') return 'OK';
  if(s==='INADEQUADO') return 'INADEQUADO';
  if(s==='N/A'||s==='NA') return 'N/A';
  return v.trim();
}

function obterAbaRespostas_(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sheet=ss.getSheetByName('RESPOSTAS CHECK');
  if(!sheet) sheet=ss.insertSheet('RESPOSTAS CHECK');
  if(sheet.getLastRow()===0){
    sheet.appendRow(['Data','Inspetor','Unidade','Bloco','Subambiente',
      'Fotos Sub','Pavimento','Ambiente Item','Item',
      'Status','Observação','Fotos Item','Tipo','Achados']);
    sheet.getRange(1,1,1,14).setBackground('#1a73e8').setFontColor('#fff').setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function obterPastaDrive_(){
  var nome='Fotos_Vistoria_Fenix';
  var it=DriveApp.getFoldersByName(nome);
  if(it.hasNext()) return it.next();
  var p=DriveApp.createFolder(nome);
  p.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
  return p;
}

function uploadFotos_(pasta,prefixo,arr,ts){
  var urls=[];
  if(!arr||!arr.length) return urls;
  arr.forEach(function(b64,i){
    if(!b64||b64.indexOf('base64,')<0){urls.push('');return;}
    try{
      var blob=Utilities.newBlob(
        Utilities.base64Decode(b64.split('base64,')[1]),
        'image/jpeg',prefixo+'_'+ts+'_'+(i+1)+'.jpg');
      var arq=pasta.createFile(blob);
      arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);
      urls.push('https://drive.google.com/uc?export=view&id='+arq.getId());
    }catch(f){urls.push('');}
  });
  return urls;
}
