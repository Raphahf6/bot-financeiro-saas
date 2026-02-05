require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');

// Imports dos seus módulos
const { MESSAGES } = require('./config/constants');
const { mainKeyboard } = require('./utils/keyboards');
const authMiddleware = require('./middlewares/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const schedulerService = require('./services/scheduler');

// --- 1. SERVER EXPRESS (CRÍTICO PARA O RENDER) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('🤖 Bot Finan.AI está ONLINE!'));
app.listen(PORT, () => console.log(`[SERVER] Rodando na porta ${PORT}`));

// --- 2. CONFIGURAÇÃO DO BOT ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Middleware
bot.use(authMiddleware);

// Menu Nativo (Botão Azul)
bot.telegram.setMyCommands([
    { command: 'start', description: 'Reiniciar' },
    { command: 'menu', description: 'Abrir ações' },
    { command: 'gasto', description: 'Lançar saída' },
    { command: 'ganho', description: 'Lançar entrada' },
    { command: 'saldo', description: 'Ver saldo' },
    { command: 'extrato', description: 'Histórico' }
]);

// --- 3. ROTAS E COMANDOS ---

// Início
bot.start((ctx) => {
    ctx.reply(MESSAGES.WELCOME(ctx.from.first_name), mainKeyboard);
});

// Menu
bot.command('menu', (ctx) => ctx.reply('Painel:', mainKeyboard));
bot.hears(['Menu', 'menu'], (ctx) => ctx.reply('Painel:', mainKeyboard));

// Ajuda
bot.hears(['❓ Ajuda', 'ajuda', '/ajuda'], (ctx) => ctx.reply(MESSAGES.HELP, { parse_mode: 'Markdown', ...mainKeyboard }));

// --- Transações ---
// Botões (Instrução)
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto VALOR DESCRIÇÃO`\nEx: `/gasto 30.00 Padaria`', { parse_mode: 'Markdown' }));
bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho VALOR DESCRIÇÃO`\nEx: `/ganho 100.00 Venda`', { parse_mode: 'Markdown' }));

// Comandos Reais (Execução)
bot.command('gasto', transactionController.addExpense);
bot.command('ganho', transactionController.addIncome);

// --- Relatórios ---
bot.hears('💰 Saldo', reportController.getBalance);
bot.command('saldo', reportController.getBalance);

bot.hears('📄 Extrato', reportController.getStatement);
bot.command('extrato', reportController.getStatement);

bot.hears('🎯 Metas', reportController.getGoals);
bot.command('metas', reportController.getGoals);

// --- Fallback (Mensagem não entendida) ---
bot.on('text', (ctx) => {
    // Ignora se for um comando que não foi pego antes (evita duplicidade com /commands)
    if (ctx.message.text.startsWith('/')) return;
    
    ctx.reply('⚠️ Opção não reconhecida.\nPor favor, utilize o menu abaixo:', mainKeyboard);
});

// --- INICIALIZAÇÃO ---
schedulerService.initScheduler();
bot.launch();

console.log('[BOT] Finan.AI iniciado com sucesso!');

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));