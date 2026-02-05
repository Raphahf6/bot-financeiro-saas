
module.exports = {
    MESSAGES: {
        WELCOME: (nome) => `Olá, ${nome}! 🤖\nSou seu assistente financeiro do Finan.AI.\n\nUse o menu abaixo para controlar seu dinheiro.`,
        ERROR_GENERIC: '⚠️ Ocorreu um erro interno. Tente novamente mais tarde.',
        ERROR_INVALID_INPUT: '❌ Formato inválido.\nUse: `/comando VALOR DESCRIÇÃO`\nEx: `/gasto 50.00 Pizza`',
        NO_DATA: '📭 Nenhum registro encontrado para este período.',
        SAVED_EXPENSE: (val, desc) => `📉 Despesa de *${val}* registrada com sucesso!\n📝 *${desc}*`,
        SAVED_INCOME: (val, desc) => `📈 Receita de *${val}* registrada com sucesso!\n📝 *${desc}*`,
        HELP: `💡 *Guia Rápido Finan.AI*\n\n` +
              `• *Lançar Gasto*: Registra uma saída.\n` +
              `• *Lançar Ganho*: Registra uma entrada.\n` +
              `• *Saldo*: Mostra o total atual.\n` +
              `• *Extrato*: Lista as últimas 5 movimentações.\n\n` +
              `Você também pode digitar comandos:\n/gasto 10 Coxinha\n/ganho 100 Freelance`
    },
     WEB_APP_URL: 'https://finan-ai-nine.vercel.app'
};