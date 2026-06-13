
CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  query_embedding extensions.vector(768),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5,
  filter_tenant_id uuid DEFAULT NULL,
  filter_document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  heading text,
  page_number int,
  similarity float
)
LANGUAGE sql STABLE
SET search_path = public, extensions
AS $$
  SELECT
    rc.id,
    rc.document_id,
    rc.chunk_index,
    rc.content,
    rc.heading,
    rc.page_number,
    1 - (rc.embedding <=> query_embedding) AS similarity
  FROM rag_chunks rc
  WHERE
    (filter_tenant_id IS NULL OR rc.tenant_id = filter_tenant_id)
    AND (filter_document_ids IS NULL OR rc.document_id = ANY(filter_document_ids))
    AND rc.embedding IS NOT NULL
    AND 1 - (rc.embedding <=> query_embedding) > match_threshold
  ORDER BY rc.embedding <=> query_embedding
  LIMIT match_count;
$$;
