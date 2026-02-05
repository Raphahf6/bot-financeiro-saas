require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const http = require('http'); 

// --- IMPORTS ---
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const goalController = require('./controllers/goals');
const recurringController = require('./controllers/recurring');
const scheduler = require('./services/scheduler');
const { MainMenu, GoalsMenu, RecurringMenu, DashboardMenu } = require('./utils/keyboards');

// ----------------------------------------------------------------------
// 1. SERVIDOR HTTP (FIX RENDER)
// ----------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.status(200).send('Bot Finan.AI 3.0 Live! 🚀'));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server HTTP na porta ${PORT}`));

// ----------------------------------------------------------------------
// 2. BOT TELEGRAM
// ----------------------------------------------------------------------
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("❌ Erro: TELEGRAM_BOT_TOKEN ausente.");
    process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Menu Nativo do Telegram
bot.telegram.setMyCommands([
    { command: 'menu', description: 'Painel Principal' },
    { command: 'saldo', description: 'Dashboard Financeiro' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'fixas', description: 'Contas Fixas' },
    { command: 'metas', description: 'Objetivos' }
]).catch(e => console.error('Erro menu nativo:', e));

// ----------------------------------------------------------------------
// 3. ROTAS E NAVEGAÇÃO
// ----------------------------------------------------------------------

// --- Start & Home ---
bot.start(authController.handleStart);
bot.hears(['Menu', '/menu', '🔙 Voltar ao Menu'], (ctx) => ctx.reply('Painel Principal:', MainMenu));
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply('💡 Dica: Use os botões do menu para navegar.', MainMenu));

// --- DASHBOARD (Menu Contextual: DashboardMenu) ---
bot.hears(['💰 Saldo Geral', '/saldo', '/resumo', '🔄 Atualizar Saldo'], reportController.getDashboard);
bot.hears(['📄 Ver Extrato', '/extrato'], reportController.getStatement);

// --- TRANSAÇÕES ---
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto 50 Pizza`', { parse_mode: 'Markdown' }));
bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho 2000 Salário`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);
bot.command('ganho', transactionController.addIncome);
bot.action(/set_cat:(.+)/, transactionController.handleCategoryCallback);

// --- METAS (Menu Contextual: GoalsMenu) ---
bot.hears(['🎯 Metas', '/metas'], goalController.listGoals);
bot.hears('➕ Nova Meta', (ctx) => ctx.reply('Digite: `/nova_meta Carro 50000`', { parse_mode: 'Markdown' }));
bot.command('nova_meta', goalController.createGoal);
// Ações de Investimento
bot.action(/invest:(.+)/, goalController.handleQuickInvest);
bot.action(/invest_custom:(.+)/, goalController.handleCustomInvestInfo);
bot.command('investir', goalController.depositGoalManual); // Certifique-se de exportar isso no goals.js

// --- CONTAS FIXAS (Menu Contextual: RecurringMenu) ---
bot.hears(['📅 Contas Fixas', '/fixas'], recurringController.listRecurring);
bot.hears('➕ Nova Conta Fixa', (ctx) => ctx.reply('Digite: `/fixa Dia Valor Nome`\nEx: `/fixa 10 100 Internet`', { parse_mode: 'Markdown' }));
bot.command('fixa', recurringController.addRecurring);

// --- Fallback ---
bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    ctx.reply('⚠️ Opção não reconhecida. Use os botões:', MainMenu);
});

// Tratamento de Erro
bot.catch((err, ctx) => console.error(`❌ Erro no update ${ctx.updateType}:`, err));

// ----------------------------------------------------------------------
// 4. INICIALIZAÇÃO SEGURA (RETRY 409)
// ----------------------------------------------------------------------
scheduler.initScheduler(bot);

const startBot = async () => {
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('🔄 Conectando ao Telegram...');
        await bot.launch();
        console.log('🤖 Bot Finan.AI Iniciado!');
    } catch (error) {
        if (error.response && error.response.error_code === 409) {
            console.warn('⚠️ Conflito (409). O Render está reiniciando. Tentando em 5s...');
            setTimeout(() => startBot(), 5000);
        } else {
            console.error('❌ Erro fatal:', error);
        }
    }
};

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));