/**
 * Os 7 pacotes de nicho como DADO — a face do módulo.
 *
 * Transcrição fiel de `.agents/skills/deskcomm-cliente-novo/references/nichos.md`.
 * O gate que prova a paridade é `index.test.ts` (teste A): ele lê o `.md` do
 * disco e compara `esqueleto` com o bloco ```markdown da seção, byte a byte.
 *
 * Onde o `.md` traz só prosa (5 dos 7 nichos), `esqueleto` é `null` — NÃO se
 * redige um. Onde o `.md` não declara um campo, o valor vazio do tipo (`[]`,
 * `null`) — nunca um palpite.
 */

import type { NichoDoAssistente } from "./tipos";
import { placeholdersDoEsqueleto, preencherEsqueleto } from "./esqueleto";

export { IDS_DE_NICHO } from "./tipos";
export type {
  CampoDoNicho,
  FollowupsDoNicho,
  FunilDoNicho,
  IdDeNicho,
  NichoDoAssistente,
  OrigemDeCampoDoNicho,
  VocabularioDoNicho,
} from "./tipos";
export { placeholdersDoEsqueleto, preencherEsqueleto };

export const NICHOS_DO_ASSISTENTE: readonly NichoDoAssistente[] = [
  {
    id: "clinica",
    nome: "Clínica, consultório ou salão",
    chamadas: ["clínica", "consultório", "salão"],
    funil: {
      nome: "Agendamentos",
      etapas: [
        "Novo contato",
        "Já respondi",
        "Entendendo o caso",
        "Quer agendar",
        "Escolhendo horário",
        "Consulta marcada",
        "Não vai marcar",
      ],
    },
    vocabulario: {
      cliente: "paciente",
      negocio: "consulta",
      ganhou: "marcada",
      perdeu: "não marcou",
    },
    esqueleto: `# Quem você é
Você atende os pacientes de {clínica}, que é: {especialidades, em uma frase}. Seu nome é {nome}.
Fale com calma e acolhimento; muita gente chega com dor ou ansiedade.

# O que você faz primeiro
Entenda, uma pergunta por vez: qual é a necessidade (consulta, retorno, exame, procedimento);
se é para a própria pessoa ou para outra; se tem convênio ou é particular; urgência.

# Como você decide o próximo passo
- Quer marcar e você sabe o serviço: ofereça horários disponíveis e confirme nome completo e telefone.
- Dúvida sobre serviço, preço ou convênio: consulte os materiais; sem resposta lá, diga que a
  recepção confirma e registre a pergunta.
- Sintoma grave ou pedido de orientação médica: não oriente; diga que uma pessoa da equipe vai
  falar agora e passe o atendimento.

# Situações
- Retorno: pergunte a data da última consulta e o profissional.
- Faltou ou quer remarcar: ofereça o próximo horário; nada de cobrar tom de culpa.
- Preço: só o que está nos materiais; particular × convênio muda a resposta.

# Limites
Você não dá diagnóstico, não interpreta exame, não confirma cobertura de convênio sem material.
Chama uma pessoa quando: sintoma grave, reclamação, pedido de laudo/atestado, menor de idade sem responsável.

# Estilo
Curto, uma pergunta por vez, sem termos técnicos. Emoji: não.`,
    pacotes: ["vender"],
    followups: {
      modelos: [
        "clinica-consulta-retomada",
        "clinica-exame-marcar",
        "clinica-cirurgia-decisao",
        "clinica-falta-remarcar",
      ],
      observacoes: [
        "não monte à mão — em IA › Follow-ups clique Começar de um modelo e instale os quatro de clínica (consulta, exame, cirurgia, falta), que já trazem os prazos e os textos escritos.",
        "Quantas mensagens cada um manda e por quanto tempo acompanha está no próprio cartão da galeria — calculado do fluxo, então não envelhece.",
        "Instale só os que o cliente vai usar: clínica que não opera não precisa do de cirurgia.",
        "Depois de instalar, publique e ligue cada um no agente (campo follow-ups que arma) — sem isso o gatilho automático não dispara.",
        "Lembrete de consulta é a agenda, não follow-up.",
      ],
    },
    campos: [
      { marcador: "clínica", de: "negocio" },
      { marcador: "especialidades, em uma frase", de: "descricao" },
      { marcador: "nome", de: "nome_do_agente" },
    ],
    faq: [
      "convênios aceitos",
      "preço de consulta particular",
      "como funciona o retorno",
      "preparo para exames",
      "endereço, estacionamento, horário",
      "política de cancelamento",
      "formas de pagamento",
      "documentos necessários",
    ],
    memoria: [
      "horário de funcionamento",
      "profissionais e dias de cada um",
      "convênios",
      "não atendemos urgência — indicar pronto-atendimento X",
    ],
    promessas: ["piso de preço de consulta", "desconto máximo (se houver)"],
    teste: [
      "tem horário essa semana?",
      "aceita Unimed?",
      "quanto é a consulta?",
      "estou com dor forte agora",
      "preciso remarcar amanhã",
    ],
  },
  {
    id: "imobiliaria",
    nome: "Imobiliária ou corretor",
    chamadas: ["imobiliária", "corretor"],
    funil: {
      nome: "Interessados",
      etapas: [
        "Novo interessado",
        "Já respondi",
        "Entendendo o que procura",
        "Sei o que oferecer",
        "Visitando imóveis",
        "Fechou negócio",
        "Desistiu",
      ],
    },
    vocabulario: {
      cliente: "interessado",
      negocio: "negócio",
      ganhou: "fechou",
      perdeu: "desistiu",
    },
    esqueleto: null,
    pacotes: [],
    followups: {
      modelos: [],
      observacoes: [
        'silêncio 48 h em "Sei o que oferecer"',
        'depois da visita, 24 h: "o que achou?"',
      ],
    },
    campos: [],
    faq: [
      "taxas e comissão",
      "documentos para alugar",
      "fiador/seguro-fiança",
      "prazos",
      "regiões atendidas",
    ],
    memoria: ["regiões", "horário de visitas", "quem atende cada região"],
    promessas: [],
    teste: [
      "procuro 2 quartos até 400 mil na zona sul",
      "quero alugar",
      "tenho um imóvel para anunciar",
      "vocês financiam?",
      "posso visitar sábado?",
    ],
  },
  {
    id: "servicos",
    nome: "Serviços, agência ou obra",
    chamadas: ["serviços", "agência", "obra"],
    funil: {
      nome: "Orçamentos",
      etapas: [
        "Pedido novo",
        "Já respondi",
        "Entendendo o projeto",
        "Orçamento enviado",
        "Negociando",
        "Fechou",
        "Não fechou",
      ],
    },
    vocabulario: {
      cliente: "cliente",
      negocio: "orçamento",
      ganhou: "fechou",
      perdeu: "não fechou",
    },
    esqueleto: null,
    pacotes: [],
    followups: {
      modelos: [],
      observacoes: [
        '3 dias após "Orçamento enviado" sem resposta: "ficou alguma dúvida?"',
        "7 dias: última tentativa e registrar motivo",
      ],
    },
    campos: [],
    faq: [
      "o que está incluso",
      "prazo médio",
      "garantia",
      "pagamento",
      "área de atendimento",
    ],
    memoria: ["serviços que não fazem", "região", "prazo padrão de orçamento"],
    promessas: ["desconto máximo", "parcelas"],
    teste: [
      "quanto custa reformar um banheiro?",
      "vocês fazem em {cidade vizinha}?",
      "preciso para semana que vem",
      "mandei o orçamento e não responderam",
      "aceita cartão?",
    ],
  },
  {
    id: "infoproduto",
    nome: "Curso, mentoria ou infoproduto",
    chamadas: ["curso", "mentoria", "infoproduto"],
    funil: {
      nome: "Matrículas",
      etapas: [
        "Novo interessado",
        "Já respondi",
        "Tirando dúvidas",
        "Quer entrar",
        "Fechando condições",
        "Matriculado",
        "Desistiu",
      ],
    },
    vocabulario: {
      cliente: "aluno",
      negocio: "matrícula",
      ganhou: "matriculado",
      perdeu: "desistiu",
    },
    esqueleto: null,
    pacotes: [],
    followups: {
      modelos: [],
      observacoes: [
        'silêncio 24 h em "Quer entrar" (link + uma dúvida a mais?)',
        "3 dias",
        "fim de turma/lote como gatilho manual",
      ],
    },
    campos: [],
    faq: [
      "conteúdo e carga horária",
      "certificado",
      "acesso e prazo",
      "garantia",
      "formas de pagamento",
      "suporte",
    ],
    memoria: ["datas de turma", "bônus vigentes", "política de reembolso"],
    promessas: ["desconto máximo", "parcelas máximas"],
    teste: [
      "serve para iniciante?",
      "tem certificado?",
      "quanto custa e parcela?",
      "sou aluno e não consigo entrar",
      "tem desconto?",
    ],
  },
  {
    id: "loja",
    nome: "Loja — online ou de rua",
    chamadas: ["loja", "online", "de rua"],
    funil: {
      nome: "Vendas",
      etapas: [
        "Novo contato",
        "Já respondi",
        "Escolhendo o produto",
        "Vai levar",
        "Aguardando pagamento",
        "Pedido pago",
        "Não comprou",
      ],
    },
    vocabulario: {
      cliente: "cliente",
      negocio: "pedido",
      ganhou: "pago",
      perdeu: "não comprou",
    },
    esqueleto: null,
    pacotes: [],
    followups: {
      modelos: [],
      observacoes: [
        '"Aguardando pagamento" há 2 h: lembrete com o link',
        "24 h: última",
        '"Escolhendo o produto" em silêncio 24 h: "ficou alguma dúvida sobre o {produto}?"',
      ],
    },
    campos: [],
    faq: [
      "frete e prazo",
      "troca/devolução",
      "formas de pagamento",
      "horário e endereço da loja física",
    ],
    memoria: ["prazo de despacho", "transportadoras", "regiões sem entrega"],
    promessas: ["desconto máximo", "frete grátis a partir de X"],
    teste: [
      "tem o {produto} no tamanho M?",
      "quanto fica o frete para {cidade}?",
      "posso trocar se não servir?",
      "fiz o pedido e não chegou",
      "tem desconto no pix?",
    ],
  },
  {
    id: "advocacia",
    nome: "Escritório de advocacia",
    chamadas: ["escritório de advocacia"],
    funil: {
      nome: "Consultas",
      etapas: [
        "Novo contato",
        "Já respondi",
        "Entendendo o caso",
        "Consulta agendada",
        "Consulta realizada",
        "Contrato assinado",
        "Não avançou",
      ],
    },
    vocabulario: {
      cliente: "cliente",
      negocio: "caso",
      ganhou: "contrato assinado",
      perdeu: "não avançou",
    },
    esqueleto: `# Quem você é
Você atende quem procura {escritório}, especializado em {área(s) do direito}. Seu nome é
{nome}. Fale com clareza e sem juridiquês; quem escreve muitas vezes está preocupado ou
inseguro sobre uma situação pessoal.

# O que você faz primeiro
Antes de oferecer qualquer coisa, entenda, uma pergunta por vez:
- Qual é a situação, em poucas palavras?
- Quando aconteceu (ou quando terminou, se for vínculo empregatício)?
- Já existe processo aberto sobre isso, ou é a primeira vez que procura orientação?
- Tem documentos à mão que ajudem a entender o caso?

# Como você decide o próximo passo
- Situação identificada e dentro da área que {escritório} atende: ofereça horário de consulta
  inicial e confirme nome completo e telefone.
- Prazo apertado, situação em andamento (risco, urgência) ou pedido explícito de urgência:
  ofereça o horário mais próximo disponível E chame uma pessoa da equipe agora — isso não
  espera a data marcada.
- Fora da área de atuação do escritório: diga com educação que não atuam nisso e, se souber,
  oriente o tipo de profissional que ajudaria.

# Situações
- "Quanto eu tenho direito a receber?" / "vou ganhar a causa?": não estime valor nem chance —
  isso é análise de caso; diga que o advogado avalia na consulta.
- "Vou pensar": pergunte o que falta para decidir e ofereça registrar o horário sem compromisso.
- Pergunta sobre prazo (prescrição, recurso): não afirme prazo específico — diga que quanto
  antes melhor e ofereça o horário mais próximo.

# Limites
Você não dá parecer jurídico, não estima indenização ou valor de causa, não promete resultado
de processo. Chama uma pessoa da equipe quando: urgência de prazo, situação de risco, ou
pedido explícito de falar com um advogado.

# Estilo
Mensagens curtas, uma pergunta por vez, sem termos jurídicos sem explicação. Emoji: não.`,
    pacotes: ["vender"],
    followups: {
      modelos: [],
      observacoes: [
        'silêncio 24 h em "Entendendo o caso"',
        "no-show de consulta agendada",
      ],
    },
    campos: [
      { marcador: "escritório", de: "negocio" },
      { marcador: "área(s) do direito", de: "descricao" },
      { marcador: "nome", de: "nome_do_agente" },
    ],
    faq: [
      "áreas que atendem de fato",
      "se cobram pela consulta inicial e quanto",
      "documentos que a pessoa deve levar",
      "como funciona o processo, em linhas gerais",
      "forma de cobrança (fixo x êxito), se aplicável",
    ],
    memoria: [
      "áreas que NÃO atendem",
      "horário de atendimento",
      "sigilo profissional: nunca peça documento sensível por aqui, isso é na consulta",
    ],
    promessas: [
      "valor da consulta inicial, se houver — nunca estimativa de indenização/êxito",
    ],
    teste: [
      "fui demitido sem justa causa semana passada",
      "quanto eu tenho direito a receber?",
      "sofri um acidente e estou afastado do trabalho",
      "quero falar direto com o advogado",
      "pergunta fora da área que o escritório atende",
    ],
  },
  {
    id: "generico",
    nome: "Outro tipo de negócio (genérico)",
    chamadas: ["outro tipo de negócio (genérico)"],
    funil: {
      nome: "Clientes",
      etapas: [
        "Novo contato",
        "Já respondi",
        "Entendendo a necessidade",
        "Proposta enviada",
        "Negociando",
        "Fechou",
        "Não fechou",
      ],
    },
    vocabulario: { cliente: null, negocio: null, ganhou: null, perdeu: null },
    esqueleto: null,
    pacotes: [],
    followups: {
      modelos: [],
      observacoes: ["follow-up de silêncio 24 h/72 h"],
    },
    campos: [],
    faq: [],
    memoria: ["horário", "região", "o que não fazem"],
    promessas: [],
    teste: [],
  },
];

/** O nicho pelo slug, ou `undefined` se o id não existir. */
export function nichoPorId(id: string): NichoDoAssistente | undefined {
  return NICHOS_DO_ASSISTENTE.find((nicho) => nicho.id === id);
}
