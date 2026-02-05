const cron = require('node-cron');
const supabase = require('../config/supabase');
const { formatCurrency } = require('../utils/helpers');

// Inicia o agendador
const initScheduler = (bot) => {
    console.log('⏰ Agendador de tarefas iniciado (Cron Job).');

    // Roda todo dia às 08:00 da manhã
    // Formato Cron: Minuto Hora Dia Mês DiaSemana
    cron.schedule('0 8 * * *', async () => {
        console.log('[CRON] Verificando contas a vencer hoje...');
        await checkDailyBills(bot);
    }, {
        scheduled: true,
        timezone: "America/Sao_Paulo"
    });
};

// Lógica de verificação
const checkDailyBills = async (bot) => {
    const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // 1. Busca todas as transações do TIPO 'expense' agendadas para HOJE
    // Assumindo que você usa a coluna 'date' para a data de vencimento/pagamento
    const { data: bills, error } = await supabase
        .from('transactions')
        .select(`
            amount, description, user_id,
            user_integrations!inner(telegram_chat_id) 
        `)
        .eq('date', hoje)
        .eq('type', 'expense'); 
        // Se tiver coluna 'status' (pago/pendente), adicione .eq('status', 'pending')

    if (error || !bills) return console.error('Erro no Cron:', error);

    // 2. Envia mensagem para cada usuário
    bills.forEach(bill => {
        const chatId = bill.user_integrations?.telegram_chat_id;
        
        if (chatId) {
            bot.telegram.sendMessage(
                chatId,
                `⚠️ *Lembrete do Dia*\n\nVocê tem uma conta vencendo hoje!\n\n📝 *${bill.description}*\n💰 ${formatCurrency(Math.abs(bill.amount))}`,
                { parse_mode: 'Markdown' }
            ).catch(err => console.error(`Erro ao enviar alerta para ${chatId}`, err));
        }
    });
};

module.exports = { initScheduler };