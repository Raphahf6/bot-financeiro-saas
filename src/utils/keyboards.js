const { Markup } = require('telegraf');

const MainMenu = Markup.keyboard([
    ['📉 Registrar Gasto', '📈 Registrar Ganho'],
    ['📊 Ver Saldo', '📝 Extrato'],
    ['❓ Ajuda']
]).resize();

const InlineUndo = (transactionId) => Markup.inlineKeyboard([
    Markup.button.callback('↩️ Desfazer', `undo_${transactionId}`)
]);

module.exports = { MainMenu, InlineUndo };