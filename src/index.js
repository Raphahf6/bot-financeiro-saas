require('dotenv').config();
const { Telegraf } = require('telegraf');
const http = require('http');
const cron = require('node-cron');
const supabase = require('./config/supabase');

// Importação dos Controladores
const reports = require('./controllers/reports');
const inputs = require('./controllers/inputs');

// Inicialização
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
console.log('🛡️ Bot Financeiro Modular Iniciado...');

// --- COMANDOS DO SISTEMA ---
bot.start(async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) return ctx.reply(`🔒 **Login:** Envie /start SEU-TOKEN`);
  const token = args[1].trim();
  const { data: integration } = await supabase.from('user_integrations').select('*').eq('connection_token', token).single();
  if (!integration) return ctx.reply('❌ Token inválido.');
  
  await supabase.from('user_integrations').update({ 
    telegram_chat_id: ctx.chat.id.toString(), 
    telegram_username: ctx.from.username, 
    connection_token: null 
  }).eq('id', integration.id);
  
  ctx.reply(`✅ **Sistema Conectado!**\nUse /ajuda para ver os comandos.`);
});

bot.command('ajuda', (ctx) => {
  ctx.reply(
    `📚 **Comandos Rápidos**\n\n` +
    `g [valor] [item] -> Gasto\n` +
    `r [valor] [item] -> Receita\n` +
    `nm [valor] [nome] -> Nova Meta\n` +
    `m [valor] [nome] -> Depositar na Meta\n\n` +
    `/saldo, /extrato, /contas, /desfazer`
  );
});

// --- REGISTRO DE HANDLERS ---
bot.command('saldo', reports.handleSaldo);
bot.command('contas', reports.handleContas);
bot.command('extrato', reports.handleExtrato);
bot.command(['desfazer', 'undo'], reports.handleDesfazer);

// --- PROCESSAMENTO DE TEXTO (REGEX) ---
bot.on('text', inputs.handleMessage);

// --- CRON JOBS (Notificação Matinal) ---
cron.schedule('0 8 * * *', async () => {
  const { data: ints } = await supabase.from('user_integrations').select('*').not('telegram_chat_id', 'is', null);
  if (!ints) return;
  const dia = new Date().getDate();
  for (const user of ints) {
    const { data: bills } = await supabase.from('recurring_bills').select('*').eq('user_id', user.user_id).eq('due_day', dia);
    if (bills?.length) bot.telegram.sendMessage(user.telegram_chat_id, `🔔 **Bom dia!**\nVocê tem ${bills.length} contas vencendo hoje.`);
  }
}, { timezone: "America/Sao_Paulo" });

// --- SERVIDOR HTTP (Para o Render não reclamar) ---
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200); res.end('OK'); }).listen(PORT, () => console.log('✅ Health Check OK'));

// --- START ---
bot.launch({ dropPendingUpdates: true, polling: { retryAfter: 2000, timeout: 30 } })
  .then(async () => {
    try {
      await bot.telegram.setMyCommands([
        { command: 'ajuda', description: 'Ver comandos' },
        { command: 'saldo', description: 'Ver resumo' },
        { command: 'extrato', description: 'Últimos gastos' }
      ]);
    } catch(e) {}
    console.log('✅ Bot Online!');
  })
  .catch((err) => { if(err.description?.includes('Conflict')) process.exit(1); console.error(err); });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));