import type { ModeloBase } from "./tipos";

/**
 * A base da plataforma mora AQUI, no código — nunca no banco com
 * organization_id nulo (spec-mãe §6.1). `proposal_templates` só guarda cópias
 * por organização; quem nunca personalizou usa o que está neste objeto.
 *
 * VAZIO DE PROPÓSITO: os 8 modelos-piloto de web design (institucional,
 * landing page, e-commerce, catálogo imobiliário, site profissional, sistema
 * web, automação, projeto personalizado) não estão no repositório — medido
 * em 24/09/2026, nenhum template.json encontrado além dos 3 anexos da spec
 * de 21/09 (clínica, curso, serviços gerais — CONTEÚDO DIFERENTE, não estes
 * 8). Trazê-los é decisão do dono (spec §6.4); quando chegarem, entram aqui
 * numa migration de CÓDIGO (não de banco — isto não é uma tabela).
 */
export const MODELOS_BASE: Readonly<Record<string, ModeloBase>> = Object.freeze({});
