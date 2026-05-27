// app.js

// ... (código anterior) ...

function cardH(item,idx){
  // ATUALIZADO: Usando os nomes de coluna de DI
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

// ... (restante do código app.js) ...
