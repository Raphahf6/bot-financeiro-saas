require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const http = require('http');

// --- IMPORTS DOS MÓDULOS ---
const authController = require('./controllers/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const goalController = require('./controllers/goals');
const recurringController = require('./controllers/recurring');
const scheduler = require('./services/scheduler');
const { MainMenu } = require('./utils/keyboards');

// ----------------------------------------------------------------------
// 1. CONFIGURAÇÃO DO SERVIDOR HTTP (CRÍTICO PARA O RENDER)
// ----------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.status(200).send('Bot Finan.AI (Consultor 3.0) está Online! 🚀');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'bot-financeiro' });
});

const server = http.createServer(app);

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

// Atualiza o Menu
bot.telegram.setMyCommands([
    { command: 'menu', description: 'Painel Principal' },
    { command: 'resumo', description: 'Dashboard do Mês (Saldo)' },
    { command: 'gasto', description: 'Lançar Despesa' },
    { command: 'ganho', description: 'Lançar Receita' },
    { command: 'fixas', description: 'Minhas Contas Fixas' },
    { command: 'metas', description: 'Meus Objetivos' },
    { command: 'extrato', description: 'Histórico Recente' }
]).then(() => console.log('✅ Menu nativo do Telegram atualizado.')).catch(e => console.error('Erro menu:', e));

// ----------------------------------------------------------------------
// 3. ROTAS E LÓGICA
// ----------------------------------------------------------------------

// Auth
bot.start(authController.handleStart);
bot.hears(['Menu', '/menu'], (ctx) => ctx.reply('Painel Consultor:', MainMenu));
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply(
    '💡 *Comandos Rápidos:*\n\n' +
    '• `/gasto 50 Pizza`\n' +
    '• `/ganho 1000 Salário`\n' +
    '• `/fixa 10 100 Internet`\n' +
    '• `/investir 200 Viagem`', 
    { parse_mode: 'Markdown', ...MainMenu }
));

// Transações
bot.hears('📉 Lançar Gasto', (ctx) => ctx.reply('Digite: `/gasto VALOR DESCRIÇÃO`', { parse_mode: 'Markdown' }));
bot.command('gasto', transactionController.addExpense);

bot.hears('📈 Lançar Ganho', (ctx) => ctx.reply('Digite: `/ganho VALOR DESCRIÇÃO`', { parse_mode: 'Markdown' }));
bot.command('ganho', transactionController.addIncome);

// Interatividade (Botões)
bot.action(/set_cat:(.+)/, transactionController.handleCategoryCallback);

// Relatórios
bot.hears(['💰 Saldo', '/saldo', '/resumo'], reportController.getDashboard);
bot.hears(['📄 Extrato', '/extrato'], reportController.getStatement);

// Metas
bot.hears(['🎯 Metas', '/metas'], goalController.listGoals);
bot.command('nova_meta', goalController.createGoal);
bot.command('investir', goalController.depositGoal);

// Contas Fixas
bot.hears(['📅 Contas Fixas', '/fixas'], recurringController.listRecurring);
bot.command('fixa', recurringController.addRecurring);

// Fallback
bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    ctx.reply('⚠️ Opção não reconhecida. Use o menu:', MainMenu);
});

// Tratamento de erros do bot
bot.catch((err, ctx) => {
    console.error(`❌ Erro no update ${ctx.updateType}:`, err);
});

// ----------------------------------------------------------------------
// 4. INICIALIZAÇÃO BLINDADA (FIX RENDER 409)
// ----------------------------------------------------------------------

scheduler.initScheduler(bot);

// Função recursiva para tentar iniciar até conseguir
const startBot = async () => {
    try {
        // Tenta limpar webhook pendente antes de iniciar polling (boa prática)
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        
        console.log('🔄 Tentando conectar ao Telegram...');
        await bot.launch();
        console.log('🤖 Bot Finan.AI iniciado com sucesso!');
    } catch (error) {
        // Se o erro for 409 (Conflito), significa que o Render ainda não matou o bot velho
        if (error.response && error.response.error_code === 409) {
            console.warn('⚠️ Conflito de instância (Erro 409). O Render ainda está fechando a versão antiga.');
            console.warn('⏳ Aguardando 5 segundos para tentar novamente...');
            
            // Espera 5 segundos e tenta de novo (recursão)
            setTimeout(() => startBot(), 5000);
        } else {
            console.error('❌ Erro fatal ao iniciar o bot:', error);
            // Não damos exit(1) aqui para o servidor HTTP continuar de pé e o Render não achar que falhou tudo
        }
    }
};

// Inicia a lógica blindada
startBot();

// Graceful Stop: Garante que o bot morra rápido quando o Render mandar o sinal
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));