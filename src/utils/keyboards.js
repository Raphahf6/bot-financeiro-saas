const { Markup } = require('telegraf');
const { WEB_APP_URL } = require('../config/constants');

// Menu Principal (Teclado Persistente)
const MainMenu = Markup.keyboard([
  ['📉 Novo Gasto', '📈 Nova Entrada'],
  ['💰 Ver Saldo', '📄 Extrato'],
  ['🎯 Metas', '📅 Contas Fixas']
]).resize();

// Botão Link para Web
const WebButton = Markup.button.url('📊 Ver Gráficos Completos', WEB_APP_URL);

// Ações Pós-Transação
const AfterTransactionMenu = (transactionId) => Markup.inlineKeyboard([
  [Markup.button.callback('↩️ Desfazer Registro', `undo_${transactionId}`)],
  [Markup.button.callback('💰 Ver Saldo', 'view_balance'), Markup.button.callback('📄 Extrato', 'view_extract')]
]);

// Ações Pós-Relatório (Saldo)
const ReportMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🔄 Atualizar', 'view_balance')],
  [WebButton]
]);

// Ações Pós-Extrato
const ExtractMenu = Markup.inlineKeyboard([
  [Markup.button.callback('🔄 Atualizar', 'view_extract')],
  [WebButton]
]);

// Lista de Metas Interativa
const GoalsListMenu = (goals) => {
  const buttons = goals.map(g => [
    Markup.button.callback(`📥 Depositar em: ${g.name}`, `deposit_goal_${g.id}`)
  ]);
  // Adiciona botão para criar nova meta no site
  buttons.push([Markup.button.url('➕ Criar Nova Meta', `${WEB_APP_URL}/metas`)]);
  return Markup.inlineKeyboard(buttons);
};

module.exports = { 
  MainMenu, 
  AfterTransactionMenu, 
  ReportMenu, 
  ExtractMenu,
  GoalsListMenu 
};