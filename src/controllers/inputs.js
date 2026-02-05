const supabase = require('../config/supabase');
const { getUserAuth, parseValue } = require('../utils/helpers');
const { guessCategory, getCategoryId } = require('../utils/categories'); // Se não tiver, remova ou simplifique
const { InlineUndo } = require('../utils/keyboards');

async function handleMessage(ctx) {
    const text = ctx.message.text.trim();

    // Ignora comandos de barra, exceto se for texto livre
    if (text.startsWith('/') && !['/start', '/ajuda'].includes(text)) return;

    // --- AUTENTICAÇÃO ---
    // Aqui ele pega o UUID real do usuário através da tabela de integração
    const userId = await getUserAuth(ctx); 
    if (!userId) return ctx.reply('🔒 Olá! Para começar, vá no sistema web > Configurações > Telegram e pegue seu token.');

    // --- 1. DETECTAR GASTO (g 50 pizza) ---
    // Aceita: "g 50", "gastei 50", "50 padaria"
    const matchGasto = text.match(/^(?:g|gastei|comprei|paguei)?\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)\s+(?:em|no|na)?\s*(.*)/i);
    
    // --- 2. DETECTAR GANHO (r 1000 salario) ---
    // Aceita: "r 1000", "recebi 1000", "ganhei 1000"
    const matchReceita = text.match(/^(?:r|receita|ganhei|recebi)\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)\s+(?:de)?\s*(.*)/i);

    // LÓGICA DE GASTO
    if (matchGasto && !text.match(/^(?:r|receita|ganhei|recebi)/i)) {
        const amount = parseValue(matchGasto[1]);
        const description = matchGasto[2] || 'Geral';
        
        // Se tiver categorias, usa. Se não, passa null.
        // const catName = await guessCategory(description); 
        // const catId = await getCategoryId(catName);
        const catId = null; 

        const { data, error } = await supabase.from('transactions').insert({
            user_id: userId, // UUID correto!
            description,
            amount: amount, // O back-end/front trata se é negativo ou positivo pelo 'type'
            type: 'expense',
            category_id: catId,
            date: new Date().toISOString() // ou created_at
        }).select().single();

        if (error) {
            console.log(error);
            return ctx.reply("❌ Ops, erro ao salvar.");
        }

        return ctx.reply(
            `💸 **Gasto de R$ ${amount.toFixed(2)}**\n🏷️ *${description}*`,
            { parse_mode: 'Markdown', ...InlineUndo(data.id) }
        );
    }

    // LÓGICA DE RECEITA
    if (matchReceita) {
        const amount = parseValue(matchReceita[1]);
        const description = matchReceita[2] || 'Entrada';

        const { data, error } = await supabase.from('transactions').insert({
            user_id: userId, // UUID correto!
            description,
            amount: amount,
            type: 'income',
            category_id: null,
            date: new Date().toISOString()
        }).select().single();

        if (error) return ctx.reply("❌ Erro ao salvar.");

        return ctx.reply(
            `💰 **Receita de R$ ${amount.toFixed(2)}**\n🏷️ *${description}*`,
            { parse_mode: 'Markdown', ...InlineUndo(data.id) }
        );
    }

    // Se não entendeu nada
    if (!['📉 Registrar Gasto', '📈 Registrar Ganho', '📊 Ver Saldo', '📝 Extrato', '❓ Ajuda'].includes(text)) {
        ctx.reply("🤔 Não entendi. Tente `g 50 pizza` ou `r 100 freela`.");
    }
}

module.exports = { handleMessage };