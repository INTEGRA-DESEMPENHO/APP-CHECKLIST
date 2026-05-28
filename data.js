// ==========================================================================
// data.js — BASE DE DADOS LOCAL + CONFIGURAÇÃO
// Vistoria Fênix v9 — Modo GitHub Pages (sem Google Apps Script)
// ==========================================================================

// ── Mapeamento de índices das colunas (DI = Data Index) ──────────────────
// Ordem das colunas: Ordem(0) | Unidade(1) | UniNorm(2) | Bloco(3) |
//   Pavimento(4) | AmbTag(5) | NomeAmb(6) | Verificação(7) | Aval(8) |
//   Adeq(9) | Inad(10) | Pend(11) | Obs(12) | UID(13)
window.DI = {
  ORD:     0,   // Ordem
  UNI:     1,   // Unidade (nome legível, ex: "REI PELE")
  UNINORM: 2,   // UniNorm (nome normalizado, ex: "rei pele")
  BLC:     3,   // Bloco
  PAV:     4,   // Pavimento
  AMB:     5,   // AmbTag (tag interna do ambiente)
  SUB:     6,   // NomeAmb / Subambiente (nome exibido)
  DESC:    7,   // Verificação / Descrição do item
  AVAL:    8,   // Avaliado? ("Sim"/"Não"/"N/A")
  ADEQ:    9,   // Adequado? ("VERDADEIRO"/"FALSO")
  INAD:    10,  // Inadequado? ("VERDADEIRO"/"FALSO")
  PEND:    11,  // Pendência
  OBS:     12,  // Observação anterior
  UID:     13   // UID único do item
};

// ── Base de dados ─────────────────────────────────────────────────────────
// Linha 0 = cabeçalho (obrigatório — o app faz DB.slice(1) para ignorar)
// A partir da linha 1 = dados reais
// TROQUE as linhas abaixo pelos seus dados reais copiados da planilha.
// Cada array segue a mesma ordem das colunas definidas em DI acima.

window.BASE_DE_DADOS = [
  // CABEÇALHO (não remova esta linha)
  ['Ordem','Unidade','UniNorm','Bloco','Pavimento','AmbTag','NomeAmb','Verificação','Aval','Adeq','Inad','Pend','Obs','UID'],

  // ── DADOS DE EXEMPLO ── (substitua por seus dados reais)
  ['1','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar piso','Não','FALSO','FALSO','','','rei pele||bloco a||1 andar||recepcao||verificar piso'],
  ['2','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar iluminação','Não','FALSO','FALSO','','','rei pele||bloco a||1 andar||recepcao||verificar iluminacao'],
  ['3','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar extintor','Não','FALSO','FALSO','','','rei pele||bloco a||1 andar||recepcao||verificar extintor'],
  ['4','REI PELE','rei pele','Bloco A','1º Andar','AMB01','Recepção','Verificar porta de acesso','Não','FALSO','FALSO','','','rei pele||bloco a||1 andar||recepcao||verificar porta de acesso'],
  ['5','REI PELE','rei pele','Bloco A','2º Andar','AMB02','Corredor','Verificar corrimão','Não','FALSO','FALSO','','','rei pele||bloco a||2 andar||corredor||verificar corrimao'],
  ['6','REI PELE','rei pele','Bloco A','2º Andar','AMB02','Corredor','Verificar sinalização de saída','Não','FALSO','FALSO','','','rei pele||bloco a||2 andar||corredor||verificar sinalizacao de saida'],
  ['7','REI PELE','rei pele','Bloco A','2º Andar','AMB02','Corredor','Verificar iluminação de emergência','Não','FALSO','FALSO','','','rei pele||bloco a||2 andar||corredor||verificar iluminacao de emergencia'],
  ['8','REI PELE','rei pele','Bloco B','Térreo','AMB03','Hall de Entrada','Verificar limpeza do piso','Não','FALSO','FALSO','','','rei pele||bloco b||terreo||hall de entrada||verificar limpeza do piso'],
  ['9','REI PELE','rei pele','Bloco B','Térreo','AMB03','Hall de Entrada','Verificar extintores','Não','FALSO','FALSO','','','rei pele||bloco b||terreo||hall de entrada||verificar extintores'],
  ['10','PAPA FRANCISCO','papa francisco','Bloco Principal','Térreo','AMB04','Hall','Verificar extintores','Não','FALSO','FALSO','','','papa francisco||bloco principal||terreo||hall||verificar extintores'],
  ['11','PAPA FRANCISCO','papa francisco','Bloco Principal','Térreo','AMB04','Hall','Verificar limpeza','Não','FALSO','FALSO','','','papa francisco||bloco principal||terreo||hall||verificar limpeza'],
  ['12','PAPA FRANCISCO','papa francisco','Bloco Principal','1º Andar','AMB05','Enfermaria','Verificar leitos','Não','FALSO','FALSO','','','papa francisco||bloco principal||1 andar||enfermaria||verificar leitos'],
  ['13','PAPA FRANCISCO','papa francisco','Bloco Principal','1º Andar','AMB05','Enfermaria','Verificar equipamentos','Não','FALSO','FALSO','','','papa francisco||bloco principal||1 andar||enfermaria||verificar equipamentos'],
  ['14','PAPA FRANCISCO','papa francisco','Bloco Principal','1º Andar','AMB05','Enfermaria','Verificar sinalização','Não','FALSO','FALSO','','','papa francisco||bloco principal||1 andar||enfermaria||verificar sinalizacao']
];

// ── Configuração de unidades (meta do ciclo semestral) ──────────────────
// Adicione aqui o número de subambientes totais de cada unidade
// para o cálculo da meta mensal do ciclo semestral.
window.UNIDADES_CONFIG = {
  'REI PELE':       { totalSub: 40 },
  'PAPA FRANCISCO': { totalSub: 60 }
  // Adicione mais unidades conforme necessário
};

// ── Achados padrão (chips de seleção rápida) ──────────────────────────
// Edite esta lista conforme as categorias de achados do seu projeto.
window.ACHADOS_CONFIG = [
  'Sujidade',
  'Dano estrutural',
  'Equipamento defeituoso',
  'Falta de EPI',
  'Sinalização ausente',
  'Iluminação inadequada',
  'Risco de queda',
  'Vazamento',
  'Pragas / Infestação',
  'Documentação ausente'
];
