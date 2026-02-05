require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const http = require('http'); // ADICIONADO: Módulo nativo para o server do Render
const supabase = require('./config/supabase');
const { MainMenu } = require('./utils/keyboards');
const authMiddleware = require('./middlewares/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const { initScheduler } = require('./services/scheduler');

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN não definido no .env');
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// --- SETUP ---
bot.use(session());

// ==============================================================================
// 1. SERVIDOR HTTP PARA O RENDER (KEEP-ALIVE / HEALTH CHECK)
// ==============================================================================
// O Render exige que uma porta seja aberta. Esse servidor roda em paralelo ao bot.
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Finan.AI Telegram Bot está online!');
});

server.listen(PORT, () => {
    console.log(`✅ Servidor de Health Check rodando na porta ${PORT}`);
});

// ==============================================================================
// 2. LÓGICA DO BOT (TELEGRAF)
// ==============================================================================

// --- COMANDO DE CONEXÃO (Start com Token) ---
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  const token = args[1]; // Pega o token após /start
  
  // Se tiver token, tenta vincular
  if (token) {
    const { data } = await supabase.from('user_integrations').select('*').eq('connection_token', token).maybeSingle();
    
    if (data) {
      await supabase.from('user_integrations').update({ 
        telegram_chat_id: ctx.chat.id.toString(), 
        telegram_username: ctx.from.username || 'User', 
        connection_token: null // Limpa o token por segurança
      }).eq('id', data.id);

      return ctx.reply('✅ **Finan.AI Conectado com Sucesso!**\n\nSeu assistente financeiro está pronto para usar.', MainMenu);
    }
    return ctx.reply('❌ Token inválido ou expirado. Gere um novo no site.');
  }
  
  // Se for start normal sem token
  ctx.reply('👋 Olá! Sou o bot do Finan.AI.\n\nVocê precisa conectar sua conta pelo site primeiro.', MainMenu);
});

// --- MIDDLEWARE DE SEGURANÇA (Protege tudo abaixo) ---
bot.use(authMiddleware);

// --- MENU HANDLERS (Comandos de Texto) ---
bot.hears('📉 Novo Gasto', ctx => ctx.reply('✍️ Digite o valor e o nome.\nEx: `45 pizza` ou `200 luz`', { parse_mode: 'Markdown' }));
bot.hears('📈 Nova Entrada', ctx => ctx.reply('✍️ Digite "ganhei" valor e origem.\nEx: `ganhei 500 freela`', { parse_mode: 'Markdown' }));

// Handlers de Relatório
bot.hears('💰 Ver Saldo', reportController.handleBalance); 
bot.hears('📄 Extrato', reportController.handleExtract);
bot.hears('📅 Contas Fixas', reportController.handleBills); 
bot.hears('🎯 Metas', reportController.handleGoals); 

// --- FLUXO DE TRANSAÇÃO (TEXTO LIVRE) ---
bot.on('text', transactionController.handleMessage);

// --- AÇÕES DE BOTÕES (CALLBACKS) ---
bot.action(/^undo_/, transactionController.undoTransaction);
bot.action('view_balance', reportController.handleBalance);
bot.action('view_extract', reportController.handleExtract);
// bot.action('deposit_goal...', ...); // Implementar lógica de depósito em metas futuramente

// --- SERVIÇOS AGENDADOS ---
initScheduler(bot);

// --- INICIALIZAÇÃO ---
async function startBot() {
    try {
        // 1. Limpa webhooks antigos que possam estar travando o bot
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        console.log('🧹 Webhook antigo limpo.');

        // 2. Inicia o Bot
        await bot.launch({
            dropPendingUpdates: true,
            allowedUpdates: ['message', 'callback_query'], // Otimiza a conexão
        });
        console.log('🚀 Finan.AI Bot Iniciado com Sucesso!');

    } catch (error) {
        // 3. Tratamento Específico para o Erro 409 (Conflito)
        if (error.response && error.response.error_code === 409) {
            console.warn('⚠️ Conflito de Instância (Erro 409) detectado!');
            console.warn('⏳ O Render ainda está fechando o bot antigo... Esperando 5 segundos para tentar de novo.');
            
            // Espera 5 segundos e tenta reconectar
            setTimeout(() => {
                console.log('🔄 Tentando reiniciar agora...');
                startBot(); // Tenta de novo (Recursividade)
            }, 5000);
        } else {
            console.error('❌ Erro fatal ao iniciar o bot:', error);
        }
    }
}

// Inicia a função
startBot();

// ==============================================================================
// 7. ENCERRAMENTO GRACIOSO (Graceful Shutdown)
// ==============================================================================
// Isso garante que o bot avise ao Telegram que está saindo antes de morrer

const stopBot = (signal) => {
    console.log(`🛑 Recebido sinal ${signal}. Encerrando bot...`);
    bot.stop(signal);
    server.close(() => {
        console.log('✅ Servidor HTTP fechado.');
        process.exit(0);
    });
};

process.once('SIGINT', () => stopBot('SIGINT'));
process.once('SIGTERM', () => stopBot('SIGTERM'));