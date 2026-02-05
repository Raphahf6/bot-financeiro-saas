const supabase = require('../config/supabase');

// Mapeamento extensivo de termos brasileiros
const KEYWORD_MAP = {
    // TRANSPORTE
    'uber': 'Transporte', '99': 'Transporte', 'indrive': 'Transporte', 'taxi': 'Transporte',
    'gasolina': 'Transporte', 'etanol': 'Transporte', 'diesel': 'Transporte', 'posto': 'Transporte',
    'abastecer': 'Transporte', 'ipva': 'Transporte', 'licenciamento': 'Transporte', 'pedagio': 'Transporte',
    'sem parar': 'Transporte', 'veloe': 'Transporte', 'onibus': 'Transporte', 'busao': 'Transporte',
    'metro': 'Transporte', 'trem': 'Transporte', 'passagem': 'Transporte', 'bilhete': 'Transporte',
    'estacionamento': 'Transporte', 'zona azul': 'Transporte', 'oficina': 'Transporte', 'mecanico': 'Transporte',
    'pneu': 'Transporte', 'troca de oleo': 'Transporte', 'lavar carro': 'Transporte',

    // ALIMENTAÇÃO
    'mercado': 'Alimentação', 'supermercado': 'Alimentação', 'assai': 'Alimentação', 'carrefour': 'Alimentação',
    'atacadao': 'Alimentação', 'pao de acucar': 'Alimentação', 'dia': 'Alimentação', 'extra': 'Alimentação',
    'padaria': 'Alimentação', 'pao': 'Alimentação', 'leite': 'Alimentação', 'café': 'Alimentação',
    'açougue': 'Alimentação', 'carne': 'Alimentação', 'sacolao': 'Alimentação', 'feira': 'Alimentação',
    'ifood': 'Alimentação', 'rappi': 'Alimentação', 'ze delivery': 'Alimentação', 'delivery': 'Alimentação',
    'restaurante': 'Alimentação', 'almoço': 'Alimentação', 'jantar': 'Alimentação', 'prato': 'Alimentação',
    'mcdonalds': 'Alimentação', 'bk': 'Alimentação', 'burger king': 'Alimentação', 'pizza': 'Alimentação',
    'hamburguer': 'Alimentação', 'lanche': 'Alimentação', 'pastel': 'Alimentação', 'coxinha': 'Alimentação',
    'sorvete': 'Alimentação', 'acai': 'Alimentação', 'chocolate': 'Alimentação', 'bomboniere': 'Alimentação',
    'agua': 'Alimentação', 'cerveja': 'Alimentação', 'breja': 'Alimentação', 'vinho': 'Alimentação', 'churrasco': 'Alimentação',

    // MORADIA
    'aluguel': 'Moradia', 'condominio': 'Moradia', 'luz': 'Moradia', 'energia': 'Moradia', 'enel': 'Moradia',
    'agua': 'Moradia', 'sabesp': 'Moradia', 'gas': 'Moradia', 'botijao': 'Moradia', 'internet': 'Moradia',
    'claro': 'Moradia', 'vivo': 'Moradia', 'tim': 'Moradia', 'oi': 'Moradia', 'net': 'Moradia',
    'iptu': 'Moradia', 'faxina': 'Moradia', 'diarista': 'Moradia', 'obra': 'Moradia', 'reforma': 'Moradia',
    'material de construcao': 'Moradia', 'leroy': 'Moradia', 'telhanorte': 'Moradia',

    // SAÚDE
    'farmacia': 'Saúde', 'drogasil': 'Saúde', 'drogaria': 'Saúde', 'remedio': 'Saúde', 'medicamento': 'Saúde',
    'medico': 'Saúde', 'consulta': 'Saúde', 'exame': 'Saúde', 'dentista': 'Saúde', 'psicologo': 'Saúde',
    'terapia': 'Saúde', 'convenio': 'Saúde', 'plano de saude': 'Saúde', 'hospital': 'Saúde',
    'academia': 'Saúde', 'smartfit': 'Saúde', 'bluefit': 'Saúde', 'suplemento': 'Saúde', 'whey': 'Saúde', 'creatina': 'Saúde',

    // LAZER
    'cinema': 'Lazer', 'ingresso': 'Lazer', 'show': 'Lazer', 'teatro': 'Lazer',
    'netflix': 'Lazer', 'spotify': 'Lazer', 'amazon prime': 'Lazer', 'disney': 'Lazer', 'hbo': 'Lazer', 'globoplay': 'Lazer',
    'jogo': 'Lazer', 'game': 'Lazer', 'steam': 'Lazer', 'playstation': 'Lazer', 'xbox': 'Lazer',
    'bar': 'Lazer', 'balada': 'Lazer', 'festa': 'Lazer', 'role': 'Lazer',
    'viagem': 'Lazer', 'passagem aerea': 'Lazer', 'hotel': 'Lazer', 'airbnb': 'Lazer', 'booking': 'Lazer',

    // COMPRAS / PESSOAL
    'shopping': 'Compras', 'roupa': 'Compras', 'camisa': 'Compras', 'calça': 'Compras', 'tenis': 'Compras', 'sapato': 'Compras',
    'shein': 'Compras', 'shopee': 'Compras', 'mercadolivre': 'Compras', 'amazon': 'Compras', 'magalu': 'Compras',
    'presente': 'Compras', 'perfume': 'Compras', 'boticario': 'Compras', 'cosmetico': 'Compras',
    'cabelo': 'Cuidados Pessoais', 'cabeleireiro': 'Cuidados Pessoais', 'barbeiro': 'Cuidados Pessoais',
    'manicure': 'Cuidados Pessoais', 'unha': 'Cuidados Pessoais', 'depilacao': 'Cuidados Pessoais',

    // EDUCAÇÃO
    'curso': 'Educação', 'faculdade': 'Educação', 'escola': 'Educação', 'mensalidade': 'Educação',
    'livro': 'Educação', 'papelaria': 'Educação', 'xerox': 'Educação', 'ebac': 'Educação', 'udemy': 'Educação', 'alura': 'Educação',

    // FINANCEIRO
    'cartao': 'Pagamentos', 'fatura': 'Pagamentos', 'emprestimo': 'Pagamentos', 'taxa': 'Pagamentos',
    'banco': 'Pagamentos', 'tarifa': 'Pagamentos', 'seguro': 'Pagamentos',
    'salario': 'Salário', 'pagamento': 'Salário', 'adiantamento': 'Salário', '13': 'Salário', 'ferias': 'Salário',
    'pix': 'Transferência', 'transferencia': 'Transferência', 'freela': 'Renda Extra', 'venda': 'Renda Extra'
};

// Categorias padrão para mostrar nos botões caso não identifique
const DEFAULT_CATEGORIES = [
    'Alimentação', 'Transporte', 'Moradia', 
    'Saúde', 'Lazer', 'Compras', 'Educação'
];

async function getCategoryByDescription(description, userId) {
    if (!description) return null;
    
    const descLower = description.toLowerCase();
    let targetCategoryName = null;

    // 1. Busca Inteligente no Dicionário
    for (const [keyword, categoryName] of Object.entries(KEYWORD_MAP)) {
        if (descLower.includes(keyword)) {
            targetCategoryName = categoryName;
            break;
        }
    }

    // Se achou um nome, busca o ID no banco
    if (targetCategoryName) {
        const { data } = await supabase
            .from('categories')
            .select('id')
            .or(`user_id.eq.${userId},user_id.is.null`)
            .ilike('name', targetCategoryName)
            .limit(1)
            .single();
        
        if (data) return data.id;
    }

    return null; // Retorna null se não achar, para o Bot perguntar
}

// Busca IDs das categorias padrão para gerar os botões
async function getCategoryOptions(userId) {
    const { data } = await supabase
        .from('categories')
        .select('id, name')
        .or(`user_id.eq.${userId},user_id.is.null`)
        .in('name', DEFAULT_CATEGORIES); // Filtra só as principais para não poluir
    return data || [];
}

module.exports = { getCategoryByDescription, getCategoryOptions };