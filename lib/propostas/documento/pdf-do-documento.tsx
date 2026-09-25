// lib/propostas/documento/pdf-do-documento.tsx
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import type { SecaoRenderizada } from "./renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10 },
  titulo: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  secaoTitulo: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  secaoBody: { fontSize: 10, lineHeight: 1.4 },
});

export interface DocumentoPdfInput {
  titulo: string;
  secoes: SecaoRenderizada[];
  marca: { app_name: string | null; accent_hex: string | null; logoUrl: string | null };
}

function DocumentoPdfDoc({ d }: { d: DocumentoPdfInput }): React.ReactElement {
  const accent = d.marca.accent_hex ?? undefined;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={[styles.titulo, accent ? { color: accent } : undefined]}>{d.titulo}</Text>
        {d.secoes.map((s) => (
          <View key={s.id}>
            <Text style={styles.secaoTitulo}>{s.title}</Text>
            <Text style={styles.secaoBody}>{s.body}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderDocumentoPdf(input: DocumentoPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<DocumentoPdfDoc d={input} />);
  return buf as Buffer;
}
