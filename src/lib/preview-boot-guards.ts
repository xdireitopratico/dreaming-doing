/** Erros de preview-boot quando o projeto ainda não tem ficheiros. */
export function isNoFilesPreviewError(msg: string | null | undefined): boolean {
  return !!msg && /sem arquivos|ainda não gerou|no_files/i.test(msg);
}