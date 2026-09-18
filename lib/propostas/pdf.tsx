import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  titulo: { fontSize: 16, fontWeight: 700 },
  linhaItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5 },
  total: { marginTop: 12, fontSize: 12, fontWeight: 700, textAlign: "right" },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 8, color: "#666" },
});

interface ItemPdf { descricao: string; quantidade: number; precoUnitarioCents: number; descontoCents: number; imagemUrl?: string | null }
export interface PropostaPdfInput {
  titulo: string; numero: number | null; ano: number | null; versao: number;
  condicoes: string | null; validUntil: string | null;
  itens: ItemPdf[]; totalCents: number; moeda: string;
  marca: { app_name: string | null; accent_hex: string | null; logo_path: string | null };
  destinatario: { nome: string; email: string | null; telefone: string | null };
}

function moeda(cents: number, iso: string): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: iso });
}

function PropostaPdfDoc({ d }: { d: PropostaPdfInput }): React.ReactElement {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.titulo}>{d.titulo}</Text>
            {d.numero && <Text>Proposta {String(d.numero).padStart(4, "0")}/{d.ano}{d.versao > 1 ? ` — v${d.versao}` : ""}</Text>}
          </View>
          {/* logo_path aqui já é uma URL resolvida (apesar do nome) — quem monta este input
              (Tarefa 14) mapeia MarcaResolvida.logoUrl para cá. */}
          {d.marca.app_name && <Text>{d.marca.app_name}</Text>}
        </View>

        <Text>Para: {d.destinatario.nome}</Text>

        <View style={{ marginTop: 16 }}>
          {d.itens.map((it, i) => (
            <View key={i} style={styles.linhaItem}>
              <Text>{it.descricao} (x{it.quantidade})</Text>
              <Text>{moeda(it.quantidade * it.precoUnitarioCents - it.descontoCents, d.moeda)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.total}>Total: {moeda(d.totalCents, d.moeda)}</Text>

        {d.validUntil && <Text style={{ marginTop: 8 }}>Válida até {d.validUntil}</Text>}
        {d.condicoes && <Text style={{ marginTop: 8 }}>{d.condicoes}</Text>}

        <View style={styles.footer} fixed>
          <Text>{d.marca.app_name ?? "Proposta comercial"}</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPropostaPdf(input: PropostaPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<PropostaPdfDoc d={input} />);
  return buf as Buffer;
}
