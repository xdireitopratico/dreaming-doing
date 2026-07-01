/**
 * xyflow-react-shim
 *
 * Camada de compatibilidade para o bundle do app.
 *
 * Em alguns caminhos de build o alias do projeto cai neste módulo.
 * Reexportamos o barrel ESM oficial do pacote para manter runtime e tipos
 * alinhados com o que o app realmente usa.
 */
export * from "@xyflow/react/dist/esm/index.js";
