const { Markup } = require('telegraf');

const DASHBOARD_URL = 'https://finan-ai-nine.vercel.app/';

// Menu Principal (Teclado Inferior)
const MainMenu = Markup.keyboard([
    ['📉 Lançar Gasto', '📈 Lançar Ganho'],
    ['💰 Saldo', '📄 Extrato'],
    ['🎯 Metas', '❓ Ajuda']
]).resize();

// Botão Inline (Aparece nas mensagens de resposta)
const LinkToWeb = Markup.inlineKeyboard([
    Markup.button.url('🌐 Ver Detalhes no Dashboard', DASHBOARD_URL)
]);

module.exports = { MainMenu, LinkToWeb, DASHBOARD_URL };