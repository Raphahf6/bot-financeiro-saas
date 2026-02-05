require('dotenv').config();
const { Telegraf } = require('telegraf');
const express = require('express');
const supabase = require('./config/supabase');
const inputs = require('./controllers/inputs');
const reports = require('./controllers/reports');
const { MainMenu } = require('./utils/keyboards');

// --- SERVER EXPRESS (Fix Render) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot Finan.AI 2.0 Online 🚀'));
app.listen(PORT, () => console.log(`Server rodando na porta ${PORT}`));

// --- BOT SETUP ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
console.log('🤖 Bot Finan.AI Iniciado...');

// 1. Comando START (Onde a mágica da conexão acontece)
bot.start(async (ctx) => {
    const args = ctx.message.text.split(' ');
    const token = args[1]?.trim();

    // Se não tiver token, ensina como pegar
    if (!token) {
        return ctx.reply(
            `👋 *Bem-vindo ao Finan.AI!*\n\nPara conectar sua conta:\n1. Acesse o sistema web\n2. Vá em Configurações > Integrações\n3. Clique em "Conectar Telegram" e copie o código.`,
            { parse_mode: 'Markdown' }
        );
    }

    // Verifica o token no banco
    const { data: integration } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('connection_token', token)
        .single();

    if (!integration) return ctx.reply('❌ Token inválido ou expirado.');

    // Salva o ID do Telegram na tabela de integração
    await supabase
        .from('user_integrations')
        .update({
            telegram_chat_id: ctx.chat.id.toString(),
            telegram_username: ctx.from.username,
            connection_token: null // Queima o token para segurança
        })
        .eq('id', integration.id);

    ctx.reply(`✅ *Sistema Conectado!*\nAgora você pode lançar gastos e ganhos.`, { parse_mode: 'Markdown', ...MainMenu });
});

// 2. Comandos do Menu
bot.hears(['📉 Registrar Gasto', 'Gasto'], (ctx) => ctx.reply('Digite: `g 50 pizza`', { parse_mode: 'Markdown' }));
bot.hears(['📈 Registrar Ganho', 'Ganho'], (ctx) => ctx.reply('Digite: `r 1000 salario`', { parse_mode: 'Markdown' }));
bot.hears(['📊 Ver Saldo', 'Saldo'], reports.handleSaldo);
bot.hears(['📝 Extrato', 'Extrato'], reports.handleExtrato);
bot.hears(['❓ Ajuda'], (ctx) => ctx.reply('Comandos rápidos:\n`g 15 uber` (Gasto)\n`r 50 venda` (Receita)', { parse_mode: 'Markdown' }));

// 3. Processador de Mensagens (Inteligência)
bot.on('text', inputs.handleMessage);

// 4. Botão de Desfazer
bot.on('callback_query', reports.handleCallbackUndo);

bot.launch();

// Graceful Stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));