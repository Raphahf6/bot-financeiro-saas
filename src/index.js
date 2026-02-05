require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const http = require('http');

// Módulos
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const goalController = require('./controllers/goals'); // <--- NOVO
const scheduler = require('./services/scheduler');     // <--- NOVO
const { MainMenu } = require('./utils/keyboards');

// --- 1. SERVER HTTP (RENDER) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Finan.AI Consultor 3.0 Online 🚀'));
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => console.log(`✅ Server na porta ${PORT}`));

// --- 2. BOT ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Atualiza Comandos
bot.telegram.setMyCommands([
    { command: 'menu', description: 'Painel Principal' },
    { command: 'resumo', description: 'Dashboard do Mês' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'ganho', description: 'Lançar Receita' },
    { command: 'metas', description: 'Ver Metas' },
    { command: 'extrato', description: 'Histórico' }
]);

// --- 3. ROTAS ---

// Início & Auth
bot.start(authController.handleStart);
bot.hears(['Menu', '/menu'], (ctx) => ctx.reply('Painel Consultor:', MainMenu));

// Transações
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto VALOR DESCRIÇÃO`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);
bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho VALOR DESCRIÇÃO`', { parse_mode: 'Markdown' }));
bot.command('ganho', transactionController.addIncome);
bot.action(/set_cat:(.+)/, transactionController.handleCategoryCallback);

// Dashboard & Extrato (Substitui Saldo simples pelo Dashboard)
bot.hears(['💰 Saldo', '/saldo', '/resumo'], reportController.getDashboard);
bot.hears(['📄 Extrato', '/extrato'], reportController.getStatement);

// Metas (Novo Módulo)
bot.hears(['🎯 Metas', '/metas'], goalController.listGoals);
bot.command('nova_meta', goalController.createGoal); // /nova_meta Carro 50000
bot.command('investir', goalController.depositGoal); // /investir 1 500

// Fallback
bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    ctx.reply('Opção não reconhecida. Use o menu:', MainMenu);
});

// Tratamento de Erros
bot.catch((err) => console.error('Erro no bot:', err));

// --- 4. INICIALIZAÇÃO ---

// Inicia o "Despertador" (Cron Job) passando o bot para ele poder enviar msgs
scheduler.initScheduler(bot); 

bot.launch();
console.log('🤖 Bot Finan.AI 3.0 (Consultor) Ativado!');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));