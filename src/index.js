const { Telegraf, Markup } = require('telegraf');
const express = require('express'); 
require('dotenv').config();

// Configurações Iniciais
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const app = express();

// -----------------------------------------------------------------------------
// 1. FIX RENDER (MANTÉM O BOT ONLINE)
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Financeiro (Completo) está online.');
});

app.listen(PORT, () => {
    console.log(`Servidor Web rodando na porta ${PORT} para manter o Render ativo.`);
});

// -----------------------------------------------------------------------------
// 2. LAYOUT DO MENU (TECLADO)
// -----------------------------------------------------------------------------
// Organizado em linhas lógicas: Entradas/Saídas, Consultas, Objetivos
const tecladoPrincipal = Markup.keyboard([
    ['📉 Lançar Gasto', '📈 Lançar Ganho'],
    ['💰 Saldo', '📄 Extrato'],
    ['🎯 Metas', '❓ Ajuda']
]).resize();

// -----------------------------------------------------------------------------
// 3. ATUALIZAÇÃO DOS COMANDOS (MENU AZUL)
// -----------------------------------------------------------------------------
bot.telegram.setMyCommands([
    { command: 'start', description: 'Início' },
    { command: 'menu', description: 'Abrir teclado de ações' },
    { command: 'gasto', description: 'Registrar uma saída' },
    { command: 'ganho', description: 'Registrar uma entrada' },
    { command: 'saldo', description: 'Ver saldo atual' },
    { command: 'extrato', description: 'Histórico recente' },
    { command: 'metas', description: 'Ver progresso das metas' },
    { command: 'ajuda', description: 'Instruções de uso' }
]).then(() => {
    console.log('Menu de comandos do Telegram atualizado com sucesso.');
});

// -----------------------------------------------------------------------------
// 4. LÓGICA E AÇÕES DO BOT
// -----------------------------------------------------------------------------

// --- /start e /menu ---
bot.start((ctx) => {
    const nome = ctx.from.first_name;
    ctx.reply(
        `Olá, ${nome}! 🤖\n\nSou seu assistente financeiro pessoal. Estou pronto para organizar seu dinheiro.\n\nO que deseja fazer agora?`, 
        tecladoPrincipal
    );
});

bot.command('menu', (ctx) => {
    ctx.reply('Painel Principal:', tecladoPrincipal);
});

// --- LANÇAMENTO DE GASTOS (📉) ---
bot.hears('📉 Lançar Gasto', (ctx) => {
    ctx.reply(
        '💸 *Novo Gasto*\n\nPara registrar, digite o comando seguido do valor e descrição.\nExemplo: `/gasto 50.00 Pizza`', 
        { parse_mode: 'Markdown' }
    );
});
// Comando funcional para processar o gasto
bot.command('gasto', (ctx) => {
    // Aqui viria sua lógica de regex/banco de dados
    // Ex: extrair o valor e salvar no DB
    ctx.reply('✅ Gasto registrado com sucesso!', tecladoPrincipal);
});

// --- LANÇAMENTO DE GANHOS (📈) ---
bot.hears('📈 Lançar Ganho', (ctx) => {
    ctx.reply(
        '💰 *Novo Ganho*\n\nPara registrar, digite o comando seguido do valor e origem.\nExemplo: `/ganho 1500.00 Salário`', 
        { parse_mode: 'Markdown' }
    );
});
bot.command('ganho', (ctx) => {
    // Lógica de salvar no DB
    ctx.reply('✅ Receita registrada com sucesso!', tecladoPrincipal);
});

// --- SALDO (💰) ---
bot.hears('💰 Saldo', (ctx) => {
    // Lógica: Buscar soma (Ganhos - Gastos) no DB
    const saldoExemplo = "1.250,00"; // Exemplo estático
    ctx.reply(`💵 *Seu Saldo Atual:*\n\nR$ ${saldoExemplo}`, { parse_mode: 'Markdown', ...tecladoPrincipal });
});
bot.command('saldo', (ctx) => {
    ctx.reply('💵 *Seu Saldo Atual:*\n\nR$ 1.250,00', { parse_mode: 'Markdown', ...tecladoPrincipal });
});

// --- EXTRATO (📄) ---
bot.hears('📄 Extrato', (ctx) => {
    // Lógica: Buscar últimos 10 registros no DB
    const extratoMock = 
        "📅 *Últimas Movimentações:*\n\n" +
        "🔻 R$ 50,00 - Padaria (Hoje)\n" +
        "🔻 R$ 120,00 - Internet (Ontem)\n" +
        "🟢 R$ 500,00 - Freelance (01/10)";
    
    ctx.reply(extratoMock, { parse_mode: 'Markdown', ...tecladoPrincipal });
});

// --- METAS (🎯) ---
bot.hears('🎯 Metas', (ctx) => {
    // Lógica: Buscar metas ativas e progresso
    const metasMock = 
        "🎯 *Suas Metas Financeiras:*\n\n" +
        "1️⃣ *Reserva de Emergência*\n" +
        "   [████░░░░░░] 40% (R$ 2.000 / R$ 5.000)\n\n" +
        "2️⃣ *Viagem Fim de Ano*\n" +
        "   [████████░░] 80% (R$ 800 / R$ 1.000)";

    ctx.reply(metasMock, { parse_mode: 'Markdown', ...tecladoPrincipal });
});

// --- AJUDA (❓) ---
const msgAjuda = 
    '💡 *Guia Rápido*\n\n' +
    '• *Lançar Gasto/Ganho*: Registra entradas e saídas.\n' +
    '• *Saldo*: Mostra quanto sobra.\n' +
    '• *Extrato*: Lista suas últimas compras.\n' +
    '• *Metas*: Acompanha seus objetivos.\n\n' +
    'Use o menu abaixo para navegar:';

bot.hears('❓ Ajuda', (ctx) => ctx.reply(msgAjuda, { parse_mode: 'Markdown', ...tecladoPrincipal }));
bot.command('ajuda', (ctx) => ctx.reply(msgAjuda, { parse_mode: 'Markdown', ...tecladoPrincipal }));

// -----------------------------------------------------------------------------
// 5. FALLBACK (TRATAMENTO DE MENSAGEM DESCONHECIDA)
// -----------------------------------------------------------------------------
// IMPORTANTE: Este bloco deve ficar no final.
// Se o usuário digitar algo que não é um comando ou botão conhecido:
bot.on('text', (ctx) => {
    console.log(`Texto não reconhecido recebido: ${ctx.message.text}`);
    
    // Verifica se é uma tentativa de comando mal formatado ou texto solto
    ctx.reply(
        '⚠️ *Opção não reconhecida.*\n\nPor favor, utilize os botões abaixo para gerenciar suas finanças:', 
        { parse_mode: 'Markdown', ...tecladoPrincipal }
    );
});

// -----------------------------------------------------------------------------
// 6. INICIALIZAÇÃO
// -----------------------------------------------------------------------------
bot.launch();

// Parada graciosa (evita travar o processo ao reiniciar)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));