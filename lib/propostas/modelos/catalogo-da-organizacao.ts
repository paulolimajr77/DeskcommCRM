// lib/propostas/modelos/catalogo-da-organizacao.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";

export type OrigemDoModelo = "plataforma" | "personalizado" | "empresa";

export interface ModeloListado {
  slug: string;
  nome: string;
  origem: OrigemDoModelo;
  secoes: number;
  version: number;
}

interface LinhaAtiva {
  slug: string;
  nome: string | null;
  version: number;
  sections: unknown;
}

/**
 * O que esta organização pode usar como modelo — uma leitura, um dono. O
 * seletor do editor, a tela de Modelos e a recusa de `crm_draft_proposal`
 * leem daqui (antes, os três usavam só os 8 do código).
 */
export async function listarModelosDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<ModeloListado[]> {
  const { data } = await db
    .from("proposal_templates")
    .select("slug, nome, version, sections")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const linhas = (data ?? []) as LinhaAtiva[];
  const porSlug = new Map(linhas.map((l) => [l.slug, l]));
  const contar = (s: unknown) => (Array.isArray(s) ? s.length : 0);

  const daPlataforma: ModeloListado[] = Object.keys(ROTULO_DO_MODELO).map((slug) => {
    const copia = porSlug.get(slug);
    const base = MODELOS_BASE[slug]!;
    return copia
      ? { slug, nome: copia.nome?.trim() || ROTULO_DO_MODELO[slug]!, origem: "personalizado", secoes: contar(copia.sections), version: copia.version }
      : { slug, nome: ROTULO_DO_MODELO[slug]!, origem: "plataforma", secoes: base.sections.length, version: base.version };
  });

  const daEmpresa: ModeloListado[] = linhas
    .filter((l) => !Object.hasOwn(ROTULO_DO_MODELO, l.slug))
    .map((l) => ({ slug: l.slug, nome: l.nome?.trim() || l.slug, origem: "empresa" as const, secoes: contar(l.sections), version: l.version }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [...daPlataforma, ...daEmpresa];
}
