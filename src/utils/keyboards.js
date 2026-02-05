const { Markup } = require('telegraf');

const mainKeyboard = Markup.keyboard([
    ['📉 Lançar Gasto', '📈 Lançar Ganho'],
    ['💰 Saldo', '📄 Extrato'],
    ['🎯 Metas', '❓ Ajuda']
]).resize();

module.exports = { mainKeyboard };