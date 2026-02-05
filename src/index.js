require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const http = require('http');
const supabase = require('./config/supabase');
const { MainMenu } = require('./utils/keyboards');
const authMiddleware = require('./middlewares/auth');
const transactionController = require('./controllers/transaction');
const reportController = require('./controllers/report');
const { initScheduler } = require('./services/scheduler');

// --- VALIDAÇÃO DO TOKEN ---
if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN não definido no .env');
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ==============================================================================
// 1. SERVIDOR HTTP (Health Check do Render)
// ==============================================================================
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Online');
});
server.listen(PORT, () => console.log(`✅ Servidor HTTP rodando na porta ${PORT}`));

// ==============================================================================
// 2. MIDDLEWARES DE DEBUG (IMPORTANTE: Colocar ANTES de tudo)
// ==============================================================================
bot.use(session());

// LOGGER DE MENSAGENS: Isso vai nos dizer se o Telegram está enviando algo
bot.use(async (ctx, next) => {
    console.log(`📨 [DEBUG] Nova mensagem recebida de: ${ctx.from?.first_name} (ID: ${ctx.from?.id})`);
    console.log(`   Conteúdo: ${ctx.message?.text || ctx.callbackQuery?.data || 'Arquivo/Outro'}`);
    await next(); // Passa para o próximo passo
});

// ==============================================================================
// 3. COMANDOS PÚBLICOS (Antes do Auth)
// ==============================================================================

// Comando START
bot.start(async (ctx) => {
  console.log('👉 Comando /start acionado');
  const args = ctx.message.text.split(' ');
  const token = args[1];
  
  if (token) {
    const { data } = await supabase.from('user_integrations').select('*').eq('connection_token', token).maybeSingle();
    if (data) {
      await supabase.from('user_integrations').update({ 
        telegram_chat_id: ctx.chat.id.toString(), 
        telegram_username: ctx.from.username || 'User', 
        connection_token: null
      }).eq('id', data.id);
      return ctx.reply('✅ Conectado!', MainMenu);
    }
    return ctx.reply('❌ Token inválido.');
  }
  ctx.reply('👋 Olá! Eu sou o Finan.AI. Conecte-se pelo site.', MainMenu);
});

// ==============================================================================
// 4. BLOQUEIO DE SEGURANÇA (Auth Middleware)
// ==============================================================================
// Se o usuário não estiver logado, o authMiddleware DEVE responder algo ou travar aqui.
bot.use(async (ctx, next) => {
    try {
        await authMiddleware(ctx, next);
    } catch (err) {
        console.error('❌ Erro no AuthMiddleware:', err);
        ctx.reply('⚠️ Ocorreu um erro na verificação de segurança.');
    }
});

// ==============================================================================
// 5. HANDLERS (Comandos Logados)
// ==============================================================================
bot.hears('📉 Novo Gasto', ctx => ctx.reply('✍️ Digite o valor e nome (Ex: 45 pizza)'));
bot.hears('📈 Nova Entrada', ctx => ctx.reply('✍️ Digite "ganhei" valor (Ex: ganhei 500)'));

bot.hears('💰 Ver Saldo', reportController.handleBalance); 
bot.hears('📄 Extrato', reportController.handleExtract);
bot.hears('📅 Contas Fixas', reportController.handleBills); 
bot.hears('🎯 Metas', reportController.handleGoals); 

bot.on('text', transactionController.handleMessage);

bot.action(/^undo_/, transactionController.undoTransaction);
bot.action('view_balance', reportController.handleBalance);
bot.action('view_extract', reportController.handleExtract);

initScheduler(bot);

// ==============================================================================
// 6. INICIALIZAÇÃO CORRIGIDA (Sem travar o log)
// ==============================================================================
console.log('🔄 Iniciando conexão com o Telegram...');

// Removemos await do launch para não travar o script, usamos .then()
bot.launch({
    dropPendingUpdates: false // MUDEI PARA FALSE: Para você não perder mensagens enviadas enquanto reiniciava
}).then(() => {
    console.log('🚀 BOT INICIADO COM SUCESSO! (Polling ativo)');
    console.log('👉 Vá no Telegram e mande "/start" para testar.');
}).catch((err) => {
    if (err.response && err.response.error_code === 409) {
        console.warn('⚠️ Conflito 409 detectado. O Render vai reiniciar sozinho em breve.');
    } else {
        console.error('❌ Erro fatal no launch:', err);
    }
});

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));