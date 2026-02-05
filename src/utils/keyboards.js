const { Markup } = require('telegraf');

const MainMenu = Markup.keyboard([
  ['📉 Registrar Gasto', '📈 Registrar Ganho'],
  ['📊 Ver Saldo', '📝 Extrato'],
  ['🎯 Metas', '❓ Ajuda']
]).resize();

const InlineConfirm = (actionId) => Markup.inlineKeyboard([
  Markup.button.callback('✅ Confirmar', `confirm_${actionId}`),
  Markup.button.callback('❌ Cancelar', 'cancel')
]);

const InlineUndo = (transactionId) => Markup.inlineKeyboard([
  Markup.button.callback('↩️ Desfazer Registro', `undo_${transactionId}`)
]);

module.exports = { MainMenu, InlineConfirm, InlineUndo };