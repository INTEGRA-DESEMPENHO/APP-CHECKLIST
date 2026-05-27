// data.js — BASE DE DADOS local
// Copie sua base real aqui em formato de array.
// Cada linha é um array de colunas, como no Google Sheets.

window.BASE_DE_DADOS = [
  ['Ordem','Unidade','UniNorm','Bloco','Pavimento','AmbTag','NomeAmb','Verificação','Aval','Adeq','Inad','Pend','Obs','UID'],

  // EXEMPLOS — TROQUE ESTAS LINHAS PELOS SEUS DADOS REAIS DA PLANILHA "BASE DE DADOS"
  // Certifique-se de que o UID seja único para cada item e siga o padrão:
  // nrm_(unidade) + '||' + nrm_(bloco) + '||' + nrm_(pav) + '||' + nrm_(sub) + '||' + nrm_(item)
  ['1','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar piso','Não','FALSO','FALSO','','','rei pele||bloco a||1º andar||recepção||verificar piso'],
  ['2','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar iluminação','Não','FALSO','FALSO','','','rei pele||bloco a||1º andar||recepção||verificar iluminação'],
  ['3','REI PELE','rei pele','Bloco A','2º Andar','AMB02','Corredor','Verificar corrimão','Não','FALSO','FALSO','','','rei pele||bloco a||2º andar||corredor||verificar corrimão'],
  ['4','PAPA FRANCISCO','papa francisco','Bloco B','Térreo','AMB03','Hall','Verificar extintores','Não','FALSO','FALSO','','','papa francisco||bloco b||térreo||hall||verificar extintores'],
  ['5','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar extintor','Não','FALSO','FALSO','','','rei pele||bloco a||1º andar||recepção||verificar extintor'],
  ['6','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar porta','Não','FALSO','FALSO','','','rei pele||bloco a||1º andar||recepção||verificar porta'],
  ['7','REI PELE','rei pele','Bloco A','2º Andar','AMB02','Corredor','Verificar sinalização','Não','FALSO','FALSO','','','rei pele||bloco a||2º andar||corredor||verificar sinalização'],
  ['8','PAPA FRANCISCO','papa francisco','Bloco B','Térreo','AMB03','Hall','Verificar limpeza','Não','FALSO','FALSO','','','papa francisco||bloco b||térreo||hall||verificar limpeza']
];
