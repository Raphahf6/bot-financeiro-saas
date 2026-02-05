require('dotenv').config(); // Carrega variáveis de ambiente
const { Telegraf } = require('telegraf');
const express = require('express');
const http = require('http'); // Módulo nativo para melhor compatibilidade com Render

// --- IMPORTS DOS MÓDULOS (Controllers e Serviços) ---
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const goalController = require('./controllers/goals');      // Módulo de Metas
const recurringController = require('./controllers/recurring'); // Módulo de Contas Fixas
const scheduler = require('./services/scheduler');          // Agendador (Cron Job)
const { MainMenu } = require('./utils/keyboards');

// ----------------------------------------------------------------------
// 1. CONFIGURAÇÃO DO SERVIDOR HTTP (CRÍTICO PARA O RENDER)
// ----------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// Rota Raiz: O Render acessa isso a cada poucos segundos para manter "Live"
app.get('/', (req, res) => {
    res.status(200).send('Bot Finan.AI (Consultor 3.0) está Online! 🚀');
});

// Rota Health Check (Padrão de infraestrutura)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'bot-financeiro' });
});

// Criação explícita do servidor HTTP
const server = http.createServer(app);

// OUVINDO NA PORTA: O '0.0.0.0' é OBRIGATÓRIO para o Render funcionar
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor HTTP rodando na porta ${PORT}`);
});

// ----------------------------------------------------------------------
// 2. CONFIGURAÇÃO DO BOT TELEGRAM
// ----------------------------------------------------------------------
if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error("❌ Erro fatal: TELEGRAM_BOT_TOKEN não definido no .env");
    process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Atualiza o Menu Azul (Lista de Comandos Visíveis)
bot.telegram.setMyCommands([
    { command: 'menu', description: 'Painel Principal' },
    { command: 'resumo', description: 'Dashboard do Mês (Saldo)' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'ganho', description: 'Lançar Receita' },
    { command: 'fixas', description: 'Minhas Contas Fixas' },
    { command: 'metas', description: 'Meus Objetivos' },
    { command: 'extrato', description: 'Histórico Recente' }
]).then(() => console.log('✅ Menu nativo do Telegram atualizado.'));

// ----------------------------------------------------------------------
// 3. ROTAS E LÓGICA DO BOT
// ----------------------------------------------------------------------

// --- Autenticação e Navegação ---
bot.start(authController.handleStart);
bot.hears(['Menu', '/menu'], (ctx) => ctx.reply('Painel Consultor:', MainMenu));
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply(
    '💡 *Comandos Rápidos:*\n\n' +
    '• `/gasto 50 Pizza` (Lançar despesa)\n' +
    '• `/ganho 1000 Salário` (Lançar receita)\n' +
    '• `/fixa 10 100 Internet` (Conta fixa dia 10)\n' +
    '• `/investir 200 Viagem` (Guardar dinheiro na meta)', 
    { parse_mode: 'Markdown', ...MainMenu }
));

// --- Transações (Dia a Dia) ---
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto VALOR DESCRIÇÃO`\nEx: `/gasto 25.90 Uber`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);

bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho VALOR DESCRIÇÃO`\nEx: `/ganho 2500 Salário`', { parse_mode: 'Markdown' }));
bot.command('ganho', transactionController.addIncome);

// INTERATIVIDADE: Captura cliques nos botões de Categoria (Quando o bot pergunta)
bot.action(/set_cat:(.+)/, transactionController.handleCategoryCallback);

// --- Relatórios e Dashboard ---
// O comando 'saldo' agora chama o Dashboard completo (com orçamentos e fixas)
bot.hears(['💰 Saldo', '/saldo', '/resumo'], reportController.getDashboard);
bot.hears(['📄 Extrato', '/extrato'], reportController.getStatement);

// --- Módulo de Metas ---
bot.hears(['🎯 Metas', '/metas'], goalController.listGoals);
bot.command('nova_meta', goalController.createGoal); // Ex: /nova_meta Carro 50000
bot.command('investir', goalController.depositGoal); // Ex: /investir 100 Carro

// --- Módulo de Contas Recorrentes (Fixas) ---
bot.hears(['📅 Contas Fixas', '/fixas'], recurringController.listRecurring);
bot.command('fixa', recurringController.addRecurring); // Ex: /fixa 05 150 Internet

// --- Fallback (Resposta Padrão) ---
bot.on('text', (ctx) => {
    // Ignora comandos iniciados com / para evitar conflito/loops
    if (ctx.message.text.startsWith('/')) return;
    
    ctx.reply('⚠️ Opção não reconhecida.\nPor favor, utilize os botões do menu ou digite /ajuda:', MainMenu);
});

// --- Tratamento de Erros Globais ---
bot.catch((err, ctx) => {
    console.error(`❌ Erro não tratado no update ${ctx.updateType}:`, err);
    try {
        ctx.reply("⚠️ Ocorreu um erro interno. Tente novamente em instantes.");
    } catch (e) {
        // Ignora erro se o usuário bloqueou o bot
    }
});

// ----------------------------------------------------------------------
// 4. INICIALIZAÇÃO
// ----------------------------------------------------------------------

// Inicia o Agendador (Cron Job) para avisar contas a vencer às 08:00
scheduler.initScheduler(bot);

bot.launch();
console.log('🤖 Bot Finan.AI (Consultor) iniciado com sucesso!');

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));