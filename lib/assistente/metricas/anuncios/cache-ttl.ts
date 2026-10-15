/**
 * Cache em memória do processo para as leituras de anúncios.
 *
 * Por que existe: cada consulta à plataforma de anúncios gasta COTA da conta
 * do cliente (a rota de campanhas faz 2 chamadas por atualização). Uma
 * pergunta repetida pelo assistente em minutos não pode pagar cota de novo.
 *
 * ⚠️ POR INSTÂNCIA DO SERVIDOR, não compartilhado entre réplicas: em produção
 * com mais de um contêiner, cada um tem o seu. TTL curto e chave por
 * organização/conta/período limitam o estrago; falha NUNCA é guardada (quem
 * guarda é o adaptador, que só grava resposta boa).
 */
export type Relogio = () => number;

interface Entrada {
  valor: unknown;
  gravadoEmMs: number;
}

const LIMITE_DE_ENTRADAS = 200;

export let relogioDoCache: Relogio = Date.now;

/** Só para teste: troca o relógio (null volta ao relógio do sistema). */
export function sobreporRelogioDoCache(relogio: Relogio | null): void {
  relogioDoCache = relogio ?? Date.now;
}

class CacheTtl {
  private readonly entradas = new Map<string, Entrada>();

  constructor(private readonly ttlMs: number) {}

  /** O valor gravado, ou undefined se ausente/vencido. Vencido some na hora. */
  pegar(chave: string): { valor: unknown; gravadoEmMs: number } | undefined {
    const entrada = this.entradas.get(chave);
    if (!entrada) return undefined;
    if (relogioDoCache() - entrada.gravadoEmMs > this.ttlMs) {
      this.entradas.delete(chave);
      return undefined;
    }
    return entrada;
  }

  /** Grava valor de sucesso (a decisão de não gravar falha é de quem chama). */
  guardar(chave: string, valor: unknown): void {
    if (!this.entradas.has(chave) && this.entradas.size >= LIMITE_DE_ENTRADAS) {
      // FIFO: a chave mais antiga sai (a Map itera na ordem de inserção).
      const maisAntiga = this.entradas.keys().next().value;
      if (maisAntiga !== undefined) this.entradas.delete(maisAntiga);
    }
    this.entradas.set(chave, { valor, gravadoEmMs: relogioDoCache() });
  }

  limpar(): void {
    this.entradas.clear();
  }
}

/** 30 min: a lista de contas quase nunca muda. */
export const cacheDeContas = new CacheTtl(30 * 60 * 1000);
/** 5 min: os números de campanha mudam o tempo todo. */
export const cacheDeCampanhas = new CacheTtl(5 * 60 * 1000);

/** Esquece os dois caches (teste e rota de manutenção). */
export function limparCacheDeAnuncios(): void {
  cacheDeContas.limpar();
  cacheDeCampanhas.limpar();
}
