require('dotenv').config(); // Tenta carregar .env da raiz
const { Telegraf } = require('telegraf');
const express = require('express');

// Imports dos seus Módulos (Controllers e Utils)
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const { MainMenu } = require('./utils/keyboards');

// ----------------------------------------------------------------------
// 1. CONFIGURAÇÃO EXPRESS (CRÍTICO PARA O RENDER FICAR 'LIVE')
// ----------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Rota Raiz: O Render acessa isso a cada poucos segundos para verificar saúde
app.get('/', (req, res) => {
    res.status(200).send('Bot Finan.AI está Online e Saudável! 🚀');
});

// Rota de Health Check secundária (padrão em alguns serviços)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// OUVINDO NA PORTA: O '0.0.0.0' é obrigatório para containers (Render/Docker)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor Web rodando na porta ${PORT}`);
});

// ----------------------------------------------------------------------
// 2. CONFIGURAÇÃO DO BOT TELEGRAM
// ----------------------------------------------------------------------
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("❌ Erro fatal: TELEGRAM_BOT_TOKEN não definido no .env");
    process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Atualiza o Menu Azul (Lista de Comandos ao digitar /)
bot.telegram.setMyCommands([
    { command: 'start', description: 'Conectar Conta' },
    { command: 'menu', description: 'Abrir Menu Principal' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'ganho', description: 'Lançar Receita' },
    { command: 'saldo', description: 'Ver Saldo Atual' },
    { command: 'extrato', description: 'Ver Histórico' }
]).then(() => console.log('✅ Menu nativo do Telegram atualizado.'));

// ----------------------------------------------------------------------
// 3. ROTAS E AÇÕES (Lógica do Bot)
// ----------------------------------------------------------------------

// --- Autenticação e Início ---
bot.start(authController.handleStart);

// --- Navegação Básica ---
bot.hears(['Menu', '/menu'], (ctx) => ctx.reply('Painel Principal:', MainMenu));
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply('Use os botões abaixo ou digite o comando:\n/gasto VALOR DESCRIÇÃO', MainMenu));

// --- Transações (Gasto) ---
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto VALOR DESCRIÇÃO`\nEx: `/gasto 25.00 Uber`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);

// --- Transações (Ganho) ---
bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho VALOR DESCRIÇÃO`\nEx: `/ganho 1000 Salário`', { parse_mode: 'Markdown' }));
bot.command('ganho', transactionController.addIncome);

// --- INTERATIVIDADE (NOVO): Captura cliques nos botões de Categoria ---
// Essa linha faz funcionar os botões que aparecem quando o bot não entende a categoria
bot.action(/set_cat:(.+)/, transactionController.handleCategoryCallback);

// --- Relatórios Financeiros ---
bot.hears(['💰 Saldo', '/saldo'], reportController.getBalance);
bot.command('saldo', reportController.getBalance);

bot.hears(['📄 Extrato', '/extrato'], reportController.getStatement);
bot.command('extrato', reportController.getStatement);

bot.hears(['🎯 Metas', '/metas'], reportController.getGoals);

// --- Fallback (Resposta Padrão para mensagens desconhecidas) ---
bot.on('text', (ctx) => {
    // Ignora comandos iniciados com / para evitar conflito ou loops
    if (ctx.message.text.startsWith('/')) return;
    
    ctx.reply('⚠️ Opção não reconhecida.\nPor favor, utilize os botões do menu:', MainMenu);
});

// --- Tratamento de Erros Globais ---
bot.catch((err, ctx) => {
    console.error(`❌ Erro não tratado no update ${ctx.updateType}:`, err);
    // Tenta avisar o usuário se possível
    try {
        ctx.reply("⚠️ Ocorreu um erro interno. Tente novamente em instantes.");
    } catch (e) {
        // Ignora erro de envio caso o usuário tenha bloqueado o bot
    }
});

// ----------------------------------------------------------------------
// 4. INICIALIZAÇÃO
// ----------------------------------------------------------------------
bot.launch();
console.log('🤖 Bot Finan.AI iniciado com sucesso!');

// Graceful Stop (Evita travar a porta ao reiniciar)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));