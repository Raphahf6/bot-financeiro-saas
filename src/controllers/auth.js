const supabase = require('../config/supabase');
const { MainMenu } = require('../utils/keyboards');

const handleStart = async (ctx) => {
    const args = ctx.message.text.split(' ');
    const token = args[1]; // Ex: /start 12345

    // Se o usuário só digitou /start (sem token)
    if (!token) {
        // Tenta ver se já está conectado
        const { data } = await supabase
            .from('user_integrations')
            .select('user_id')
            .eq('telegram_chat_id', ctx.chat.id.toString())
            .single();

        if (data) {
            return ctx.reply(`👋 Bem-vindo de volta! Seu Telegram já está conectado ao Finan.AI.`, MainMenu);
        }

        return ctx.reply(
            `🔒 *Conexão Necessária*\n\nPara usar o bot, você precisa vinculá-lo à sua conta web:\n\n1. Acesse: https://finan-ai-nine.vercel.app/\n2. Vá em Configurações > Telegram\n3. Copie o código e envie aqui (ex: /start 123)`,
            { parse_mode: 'Markdown' }
        );
    }

    // Se enviou token, tenta vincular
    const { data: integration, error } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('connection_token', token)
        .single();

    if (error || !integration) {
        return ctx.reply('❌ Código inválido ou expirado. Gere um novo no site.');
    }

    // Atualiza a tabela com o ID do Telegram
    await supabase
        .from('user_integrations')
        .update({
            telegram_chat_id: ctx.chat.id.toString(),
            connection_token: null // Limpa o token para segurança
        })
        .eq('id', integration.id);

    ctx.reply(`✅ *Sucesso!* Conta vinculada.\n\nAgora seus lançamentos aqui aparecerão automaticamente no painel web.`, { parse_mode: 'Markdown', ...MainMenu });
};

module.exports = { handleStart };