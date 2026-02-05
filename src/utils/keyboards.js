const { Markup } = require('telegraf');

const DASHBOARD_URL = 'https://finan-ai-nine.vercel.app/';

// --- TECLADOS INFERIORES (Reply Keyboards) ---

// 1. Menu Principal (Home)
const MainMenu = Markup.keyboard([
    ['📉 Lançar Gasto', '📈 Lançar Ganho'],
    ['💰 Saldo Geral', '🎯 Metas'],
    ['📅 Contas Fixas', '❓ Ajuda']
]).resize();

// 2. Menu de Metas
const GoalsMenu = Markup.keyboard([
    ['➕ Nova Meta', '🔙 Voltar ao Menu']
]).resize();

// 3. Menu de Contas Fixas
const RecurringMenu = Markup.keyboard([
    ['➕ Nova Conta Fixa', '🔙 Voltar ao Menu']
]).resize();

// 4. Menu de Dashboard
const DashboardMenu = Markup.keyboard([
    ['📄 Ver Extrato', '🔄 Atualizar Saldo'],
    ['🔙 Voltar ao Menu']
]).resize();

// --- BOTÕES INTERNOS (Inline Keyboards) ---

const LinkToWeb = Markup.inlineKeyboard([
    Markup.button.url('🌐 Ver no Dashboard', DASHBOARD_URL)
]);

// Gera botões de investimento rápido para uma meta
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

// Gera botões de categoria (já existia)
const createCategoryButtons = (transactionId, categories) => {
    const buttons = categories.map(cat => 
        Markup.button.callback(cat.name, `set_cat:${transactionId}:${cat.id}`)
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
    createCategoryButtons 
};