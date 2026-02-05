require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');

// Imports
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const { MainMenu } = require('./utils/keyboards');

// 1. Render Keep-Alive (Server Express)
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Finan.AI Sincronizado 🚀'));
app.listen(PORT, () => console.log(`Server rodando na porta ${PORT}`));

// 2. Configuração Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Menu Nativo
bot.telegram.setMyCommands([
    { command: 'start', description: 'Conectar Conta' },
    { command: 'menu', description: 'Menu Principal' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'ganho', description: 'Lançar Receita' },
    { command: 'saldo', description: 'Ver Saldo' }
]);

// 3. Rotas

// Autenticação e Start
bot.start(authController.handleStart);

// Menu
bot.hears(['Menu', '/menu'], (ctx) => ctx.reply('Painel:', MainMenu));
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply('Use os botões abaixo ou digite /gasto VALOR NOME.', MainMenu));

// Transações (Botões e Comandos)
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto VALOR DESCRIÇÃO`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);

bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho VALOR DESCRIÇÃO`', { parse_mode: 'Markdown' }));
bot.command('ganho', transactionController.addIncome);

// Relatórios
bot.hears(['💰 Saldo', '/saldo'], reportController.getBalance);
bot.command('saldo', reportController.getBalance);

bot.hears(['📄 Extrato', '/extrato'], reportController.getStatement);
bot.command('extrato', reportController.getStatement);

bot.hears(['🎯 Metas', '/metas'], reportController.getGoals);

// Fallback
bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // Ignora comandos
    ctx.reply('Opção não reconhecida. Use o menu:', MainMenu);
});

// Start
bot.launch();
console.log('🤖 Bot Finan.AI iniciado e pronto para sincronia!');

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));