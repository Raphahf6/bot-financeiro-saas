const { Markup } = require('telegraf');

const DASHBOARD_URL = 'https://finan-ai-nine.vercel.app/';

// --- TECLADOS INFERIORES ---
const MainMenu = Markup.keyboard([
    ['📉 Lançar Gasto', '📈 Lançar Ganho'],
    ['💰 Saldo Geral', '🎯 Metas'],
    ['📅 Contas Mensais', '❓ Ajuda']
]).resize();

const GoalsMenu = Markup.keyboard([
    ['➕ Nova Meta', '🔙 Voltar ao Menu']
]).resize();

const RecurringMenu = Markup.keyboard([
    ['➕ Nova Conta Mensal', '🔙 Voltar ao Menu']
]).resize();

const DashboardMenu = Markup.keyboard([
    ['📄 Ver Extrato', '🔄 Atualizar Saldo'],
    ['🔙 Voltar ao Menu']
]).resize();

// --- BOTÕES INLINE ---

const LinkToWeb = Markup.inlineKeyboard([
    Markup.button.url('🌐 Ver no Dashboard', DASHBOARD_URL)
]);

const createGoalActions = (goalId) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('💵 +50', `invest:${goalId}:50`),
            Markup.button.callback('💵 +100', `invest:${goalId}:100`),
            Markup.button.callback('💵 +200', `invest:${goalId}:200`)
        ],
        [Markup.button.callback('✏️ Outro Valor', `invest_custom:${goalId}`)]
    ]);
};

// Botões para Transações Comuns
const createCategoryButtons = (transactionId, categories) => {
    const buttons = categories.map(cat => 
        Markup.button.callback(cat.name, `set_cat:${transactionId}:${cat.id}`)
    );
    return Markup.inlineKeyboard(buttons, { columns: 2 });
};

// [NOVO] Botões para Contas Fixas (Recurring)
const createRecurringCategoryButtons = (billId, categories) => {
    const buttons = categories.map(cat => 
        Markup.button.callback(cat.name, `set_rec_cat:${billId}:${cat.id}`)
    );
    return Markup.inlineKeyboard(buttons, { columns: 2 });
};

module.exports = { 
    MainMenu, 
    GoalsMenu, 
    RecurringMenu, 
    DashboardMenu,
    LinkToWeb, 
    createGoalActions,
    createCategoryButtons,
    createRecurringCategoryButtons // <--- Exportado novo
};