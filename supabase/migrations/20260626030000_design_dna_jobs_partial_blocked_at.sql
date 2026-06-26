-- Fix: design_dna_jobs faltava partial_at/blocked_at.
--
-- Sintoma (revelado pelo debug-log.sh — Inngest /v1/events):
--   design-dna-extract falhava com NonRetriableError
--   "Could not find the 'partial_at' column of 'design_dna_jobs' in the schema cache"
--   em markJobFinal ao marcar jobs parciais/bloqueados.
--
-- Consequência: o job ficava preso em "running" (nunca chegava a partial/completed/failed),
-- o tool extract_design_dna fazia poll pra sempre e a extração nunca completava.
--
-- Causa: a migration 20260623180000 adicionou os status 'partial'/'blocked' ao CHECK
-- mas esqueceu as colunas de timestamp que o código já escrevia
-- (design-dna-extract.ts: mark-partial escreve partial_at; mark-blocked escreve blocked_at).
--
-- Colunas escritas pelo Inngest function; não são lidas hoje (finished_at já captura o
-- timestamp via markJobFinal), mas mantemos pra alinhar schema ↔ código e não precisar
-- redeployar a function (a coluna nova faz o código JÁ DEPLOYADO funcionar na hora).
ALTER TABLE design_dna_jobs ADD COLUMN IF NOT EXISTS partial_at TIMESTAMPTZ;
ALTER TABLE design_dna_jobs ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;