require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const http = require('http'); 

// Imports
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const goalController = require('./controllers/goals');
const recurringController = require('./controllers/recurring');
const scheduler = require('./services/scheduler');
const { MainMenu, GoalsMenu, RecurringMenu, DashboardMenu } = require('./utils/keyboards');

// 1. SERVER HTTP
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.status(200).send('Bot Finan.AI 3.3 Live! 🚀'));
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server HTTP na porta ${PORT}`));

// 2. BOT
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("❌ Token ausente.");
    process.exit(1);
}
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

bot.telegram.setMyCommands([
    { command: 'menu', description: 'Painel Principal' },
    { command: 'saldo', description: 'Dashboard Financeiro' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'fixas', description: 'Contas Mensais' }, 
    { command: 'metas', description: 'Objetivos' }
]).catch(console.error);

// 3. ROTAS

// Start & Navegação
bot.start(authController.handleStart);
bot.hears(['Menu', '/menu', '🔙 Voltar ao Menu'], (ctx) => ctx.reply('Painel Principal:', MainMenu));
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply('💡 Dica: Mantenha suas contas categorizadas para ver os gráficos.', MainMenu));

// Dashboard
bot.hears(['💰 Saldo Geral', '/saldo', '/resumo', '🔄 Atualizar Saldo'], reportController.getDashboard);
bot.hears(['📄 Ver Extrato', '/extrato'], reportController.getStatement);

// Transações
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto 50 Pizza`', { parse_mode: 'Markdown' }));
bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho 2000 Salário`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);
bot.command('ganho', transactionController.addIncome);
bot.action(/set_cat:(.+)/, transactionController.handleCategoryCallback); // Categorias de Transações

// Metas
bot.hears(['🎯 Metas', '/metas'], goalController.listGoals);
bot.hears('➕ Nova Meta', (ctx) => ctx.reply('Digite: `/nova_meta Carro 50000`', { parse_mode: 'Markdown' }));
bot.command('nova_meta', goalController.createGoal);
bot.action(/invest:(.+)/, goalController.handleQuickInvest);
bot.action(/invest_custom:(.+)/, goalController.handleCustomInvestInfo);
bot.command('investir', goalController.depositGoalManual);

// Contas Mensais
bot.hears(['📅 Contas Mensais', '/fixas'], recurringController.listRecurring);
bot.hears('➕ Nova Conta Mensal', (ctx) => ctx.reply('Digite: `/fixa Dia Valor Nome`\nEx: `/fixa 10 100 Internet`', { parse_mode: 'Markdown' }));
bot.command('fixa', recurringController.addRecurring);

// [NOVO] Ação para definir categoria de Conta Fixa
bot.action(/set_rec_cat:(.+)/, recurringController.handleRecurringCategoryCallback);

// Fallback
bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    ctx.reply('⚠️ Opção não reconhecida.', MainMenu);
});

bot.catch((err) => console.error('❌ Erro Bot:', err));

// 4. INICIALIZAÇÃO
scheduler.initScheduler(bot);

const startBot = async () => {
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('🔄 Conectando...');
        await bot.launch();
        console.log('🤖 Bot Online!');
    } catch (error) {
        if (error.response?.error_code === 409) {
            console.warn('⚠️ Conflito 409. Tentando em 5s...');
            setTimeout(() => startBot(), 5000);
        } else {
            console.error('❌ Erro fatal:', error);
        }
    }
};

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));