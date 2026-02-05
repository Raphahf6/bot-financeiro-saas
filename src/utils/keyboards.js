const { Markup } = require('telegraf');

const DASHBOARD_URL = 'https://finan-ai-nine.vercel.app/';

const MainMenu = Markup.keyboard([
    ['📉 Lançar Gasto', '📈 Lançar Ganho'],
    ['💰 Saldo', '📄 Extrato'],
    ['🎯 Metas', '❓ Ajuda']
]).resize();

const LinkToWeb = Markup.inlineKeyboard([
    Markup.button.url('🌐 Ver no Dashboard', DASHBOARD_URL)
]);

// Gera botões de categoria para uma transação específica
const createCategoryButtons = (transactionId, categories) => {
    // Cria array de botões (2 por linha)
    const buttons = categories.map(cat => 
        Markup.button.callback(cat.name, `set_cat:${transactionId}:${cat.id}`)
    );
    
    return Markup.inlineKeyboard(buttons, { columns: 2 });
};

module.exports = { MainMenu, LinkToWeb, createCategoryButtons };