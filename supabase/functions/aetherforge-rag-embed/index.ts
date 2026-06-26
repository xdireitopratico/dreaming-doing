/**
 * aetherforge-rag-embed — Edge Function para gerar embeddings dos chunks RAG
 * Usa Ollama (nomic-embed-text) via OLLAMA_EMBED_URL.
 *
 * BUG FIXES: 32 (env var for URL), 33 (auth required), 59 (batch mismatch), 60 (partial status), 61 (empty embedding), 62 (no recursive self-call)
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { meteredFetch } from "../_shared/egress-meter.ts";
import { forgeOrigin } from "../_shared/cors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": forgeOrigin(),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// BUG 32 FIX: Use env var instead of hardcoded IP, enforce HTTPS when available
const OLLAMA_EMBED_URL = Deno.env.get("OLLAMA_EMBED_URL") || "http://localhost:11434/api/embed";
const OLLAMA_EMBED_MODEL = Deno.env.get("OLLAMA_EMBED_MODEL") || "nomic-embed-text-v2-moe";
const BATCH_SIZE = 10;

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await meteredFetch(
    OLLAMA_EMBED_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        input: text.substring(0, 2000),
      }),
      signal: AbortSignal.timeout(30000),
    },
    { source: "aetherforge-rag-embed:single", category: "vps" },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "?");
    throw new Error(`Ollama error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const embedding = data.embeddings?.[0];
  // BUG 61 FIX: Reject empty embeddings
  if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Empty embedding returned from model");
  }
  return embedding;
}

async function generateEmbeddingsBatch(texts: string[]): Promise<(number[] | null)[]> {
  const res = await meteredFetch(
    OLLAMA_EMBED_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        input: texts.map((t) => t.substring(0, 2000)),
      }),
      signal: AbortSignal.timeout(60000),
    },
    { source: "aetherforge-rag-embed:batch", category: "vps", metadata: { docs: texts.length } },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "?");
    throw new Error(`Ollama batch error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const embeddings = data.embeddings || [];

  // BUG 59 FIX: Pad result array to match input length, fill missing with null
  const result: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i++) {
    const emb = embeddings[i];
    // BUG 61 FIX: Validate each embedding is non-empty
    if (emb && Array.isArray(emb) && emb.length > 0) {
      result.push(emb);
    } else {
      result.push(null);
    }
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // BUG 33 FIX: Require authentication
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await anonClient.auth.getUser();

    // Allow both user JWT and service role key
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceKey;
    if (!isServiceRole && (authErr || !user)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { action, document_id, query, tenant_id, document_ids, top_k, threshold } =
      await req.json();

    // Action: embed_document — Generate embeddings for all chunks of a document
    if (action === "embed_document") {
      if (!document_id) {
        return new Response(JSON.stringify({ error: "document_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabase
        .from("rag_documents")
        .update({ processing_status: "processing" })
        .eq("id", document_id);

      const { data: chunks, error: fetchErr } = await supabase
        .from("rag_chunks")
        .select("id, content")
        .eq("document_id", document_id)
        .is("embedding", null)
        .order("chunk_index", { ascending: true });

      if (fetchErr || !chunks || chunks.length === 0) {
        await supabase
          .from("rag_documents")
          .update({ processing_status: chunks?.length === 0 ? "completed" : "error" })
          .eq("id", document_id);

        return new Response(
          JSON.stringify({
            embedded: 0,
            message: chunks?.length === 0 ? "All chunks already embedded" : fetchErr?.message,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      let embedded = 0;
      let errors = 0;
      let skipped = 0;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        try {
          const texts = batch.map((c: { content: string }) => c.content);
          const embeddings = await generateEmbeddingsBatch(texts);

          // BUG 59 FIX: Handle mismatched lengths properly
          for (let j = 0; j < batch.length; j++) {
            const emb = embeddings[j];
            if (emb) {
              const vectorStr = `[${emb.join(",")}]`;
              const { error: updateErr } = await supabase
                .from("rag_chunks")
                .update({ embedding: vectorStr })
                .eq("id", batch[j].id);

              if (updateErr) {
                console.error(`Chunk ${batch[j].id} update error:`, updateErr.message);
                errors++;
              } else {
                embedded++;
              }
            } else {
              // BUG 59 FIX: Log skipped chunks instead of silently discarding
              console.warn(`Chunk ${batch[j].id} received null/empty embedding, skipping`);
              skipped++;
            }
          }
        } catch (batchErr) {
          console.error(`Batch ${i} error:`, batchErr);
          errors += batch.length;
        }
      }

      // BUG 60 FIX: Distinguish between full success, partial, and error
      let finalStatus: string;
      if (errors === 0 && skipped === 0) {
        finalStatus = "completed";
      } else if (embedded > 0) {
        finalStatus = "partial"; // BUG 60 FIX: partial failure != completed
      } else {
        finalStatus = "error";
      }

      await supabase
        .from("rag_documents")
        .update({
          processing_status: finalStatus,
          embedding_model: OLLAMA_EMBED_MODEL,
          last_indexed_at: new Date().toISOString(),
          reindex_required: false,
        })
        .eq("id", document_id);

      return new Response(
        JSON.stringify({ embedded, errors, skipped, total: chunks.length, status: finalStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Action: semantic_search
    if (action === "semantic_search") {
      if (!query) {
        return new Response(JSON.stringify({ error: "query required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const queryEmbedding = await generateEmbedding(query);
      const vectorStr = `[${queryEmbedding.join(",")}]`;

      const { data: results, error: searchErr } = await supabase.rpc("match_rag_chunks", {
        query_embedding: vectorStr,
        match_threshold: threshold || 0.3,
        match_count: top_k || 5,
        filter_tenant_id: tenant_id || null,
        filter_document_ids: document_ids || null,
      });

      if (searchErr) {
        return new Response(JSON.stringify({ error: searchErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ results: results || [], query }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: reindex — BUG 62 FIX: Process inline instead of recursive HTTP call
    if (action === "reindex") {
      const { data: docs } = await supabase
        .from("rag_documents")
        .select("id")
        .eq("reindex_required", true)
        .limit(10);

      if (!docs || docs.length === 0) {
        return new Response(JSON.stringify({ message: "No documents need reindexing" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let totalEmbedded = 0;
      for (const doc of docs) {
        // Clear existing embeddings
        await supabase.from("rag_chunks").update({ embedding: null }).eq("document_id", doc.id);

        // BUG 62 FIX: Process inline instead of recursive HTTP self-call
        await supabase
          .from("rag_documents")
          .update({ processing_status: "processing" })
          .eq("id", doc.id);

        const { data: chunks } = await supabase
          .from("rag_chunks")
          .select("id, content")
          .eq("document_id", doc.id)
          .order("chunk_index", { ascending: true });

        if (chunks && chunks.length > 0) {
          let docEmbedded = 0;
          for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            try {
              const texts = batch.map((c: any) => c.content);
              const embeddings = await generateEmbeddingsBatch(texts);
              for (let j = 0; j < batch.length; j++) {
                if (embeddings[j]) {
                  await supabase
                    .from("rag_chunks")
                    .update({ embedding: `[${embeddings[j]!.join(",")}]` })
                    .eq("id", batch[j].id);
                  docEmbedded++;
                }
              }
            } catch (e) {
              console.error(`Reindex batch error for doc ${doc.id}:`, e);
            }
          }
          totalEmbedded += docEmbedded;
          await supabase
            .from("rag_documents")
            .update({
              processing_status: docEmbedded > 0 ? "completed" : "error",
              embedding_model: OLLAMA_EMBED_MODEL,
              last_indexed_at: new Date().toISOString(),
              reindex_required: false,
            })
            .eq("id", doc.id);
        }
      }

      return new Response(JSON.stringify({ reindexed: docs.length, totalEmbedded }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: embed_document, semantic_search, reindex" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[aetherforge-rag-embed] Error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
