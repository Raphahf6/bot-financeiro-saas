const parseTransactionInput = (text) => {
    // Exemplo de input: "/gasto 50.00 Pizza de Calabresa"
    const args = text.split(' ');
    
    // Remove o comando se for o primeiro item (ex: /gasto)
    if (args[0].startsWith('/')) {
        args.shift();
    }

    // Tenta pegar o valor (primeiro argumento restante)
    let amountStr = args[0];
    if (!amountStr) return { isValid: false };

    // Trata virgula por ponto
    amountStr = amountStr.replace(',', '.');
    const amount = parseFloat(amountStr);

    // Pega o resto como descrição
    const description = args.slice(1).join(' ') || 'Sem descrição';

    if (isNaN(amount)) {
        return { isValid: false };
    }

    return {
        isValid: true,
        amount: Math.abs(amount), // Sempre retorna positivo aqui, o controller define o sinal
        description
    };
};

module.exports = { parseTransactionInput };