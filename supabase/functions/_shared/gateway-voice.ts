/**
 * AetherForge Gateway — Voice Pipeline Handlers (STT/TTS/Voice)
 * Extracted from monolithic index.ts (Round 44.5 refactoring)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, executeLLMNode } from "./gateway-core.ts";

const KVM8_VOICE_IP = () => Deno.env.get("KVM8_IP") || "154.26.128.124";
const WHISPER_PORT = 8787;
const KOKORO_PORT = 8880;

/**
 * Execute STT node — transcribe audio via VPS Whisper (Faster-Whisper large-v3)
 */
export async function executeSTTNode(node: any, input: any): Promise<any> {
  const config = node.data?.config || {};
  const language = config.language || "pt";
  const audioBase64 = input.audio_base64 || input.audio;

  if (!audioBase64) {
    return { text: input.message || input.text || "", confidence: 1.0, language, engine: "passthrough" };
  }

  try {
    const ip = KVM8_VOICE_IP();
    const audioBytes = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const audioBlob = new Blob([audioBytes], { type: "audio/wav" });

    const form = new FormData();
    form.append("file", audioBlob, "audio.wav");
    form.append("model", "large-v3");
    form.append("language", language);
    form.append("response_format", "json");

    console.log(`[Gateway/STT] Transcribing ${audioBytes.length} bytes via Whisper at ${ip}:${WHISPER_PORT}`);

    const resp = await fetch(`http://${ip}:${WHISPER_PORT}/v1/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Whisper error ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    console.log(`[Gateway/STT] ✓ Transcribed: "${(result.text || "").substring(0, 80)}"`);

    return {
      text: result.text || "",
      confidence: result.segments?.[0]?.avg_logprob ? Math.exp(result.segments[0].avg_logprob) : 0.9,
      language: result.language || language,
      duration: result.duration,
      engine: "whisper_large_v3",
    };
  } catch (err) {
    console.error("[Gateway/STT] Error:", err);
    return {
      text: input.message || input.text || "",
      confidence: 0, language,
      engine: "whisper_error",
      error: (err as Error).message,
    };
  }
}

/**
 * Execute TTS node — synthesize speech via VPS Kokoro (Kokoro-82M)
 */
export async function executeTTSNode(node: any, input: any): Promise<any> {
  const config = node.data?.config || {};
  const voice = config.voice || "pf_dora";
  const speed = config.speed || 1.0;
  const text = input.response || input.text || input.message || "";

  if (!text) {
    return { audio_base64: null, text: "", voice, engine: "kokoro_no_input" };
  }

  try {
    const ip = KVM8_VOICE_IP();
    console.log(`[Gateway/TTS] Synthesizing ${text.length} chars via Kokoro at ${ip}:${KOKORO_PORT}, voice=${voice}`);

    const resp = await fetch(`http://${ip}:${KOKORO_PORT}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "kokoro", input: text, voice, speed, response_format: "mp3" }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Kokoro error ${resp.status}: ${errText}`);
    }

    const audioBuffer = await resp.arrayBuffer();
    const { encode: base64Encode } = await import("https://deno.land/std@0.168.0/encoding/base64.ts");
    const audioBase64 = base64Encode(audioBuffer);

    console.log(`[Gateway/TTS] ✓ Generated ${audioBuffer.byteLength} bytes of audio`);

    return {
      audio_base64: audioBase64,
      audio_size_bytes: audioBuffer.byteLength,
      text, voice, speed,
      engine: "kokoro_82m",
    };
  } catch (err) {
    console.error("[Gateway/TTS] Error:", err);
    return { audio_base64: null, text, voice, engine: "kokoro_error", error: (err as Error).message };
  }
}

/**
 * Full voice pipeline: audio_base64 → STT → LLM → TTS → audio_base64
 */
export async function handleVoicePipeline(body: any): Promise<Response> {
  const { slug, audio_base64, session_id, language = "pt", voice = "pf_dora", speed = 1.0 } = body;

  if (!slug) {
    return new Response(JSON.stringify({ error: "slug is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const pipelineStart = Date.now();

  try {
    // Step 1: STT
    let userMessage = body.message || "";
    let sttResult: any = null;

    if (audio_base64) {
      const sttStart = Date.now();
      sttResult = await executeSTTNode({ data: { config: { language } } }, { audio_base64 });
      userMessage = sttResult.text;
      console.log(`[Gateway/Voice] STT completed in ${Date.now() - sttStart}ms: "${userMessage.substring(0, 80)}"`);
    }

    if (!userMessage) {
      return new Response(JSON.stringify({ error: "No audio or message provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Execute agent flow (LLM)
    const llmStart = Date.now();

    const { data: deployment } = await supabase
      .from("agent_deployments")
      .select("id, flow_id, config, status")
      .eq("slug", slug)
      .eq("status", "active")
      .single();

    if (!deployment) {
      return new Response(JSON.stringify({ error: "Agent not found", slug }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: flow } = await supabase
      .from("agent_flows")
      .select("id, name, flow_definition, status")
      .eq("id", deployment.flow_id)
      .single();

    if (!flow || flow.status !== "published") {
      return new Response(JSON.stringify({ error: "Flow not found or not published" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const flowDef = flow.flow_definition as { nodes?: any[]; edges?: any[] };
    const nodes = flowDef?.nodes || [];
    const llmNode = nodes.find((n: any) => n.type === "llm");

    let llmOutput: any;
    if (llmNode) {
      llmOutput = await executeLLMNode(llmNode, { message: userMessage, channel: "voice" }, userMessage, flow.id);
    } else {
      llmOutput = { response: `Recebi: ${userMessage}`, model: "echo" };
    }

    const llmResponse = llmOutput.response || llmOutput.text || JSON.stringify(llmOutput);
    console.log(`[Gateway/Voice] LLM completed in ${Date.now() - llmStart}ms`);

    // Step 3: TTS
    const ttsStart = Date.now();
    const ttsResult = await executeTTSNode({ data: { config: { voice, speed } } }, { response: llmResponse });
    console.log(`[Gateway/Voice] TTS completed in ${Date.now() - ttsStart}ms`);

    const totalMs = Date.now() - pipelineStart;
    console.log(`[Gateway/Voice] Full pipeline completed in ${totalMs}ms`);

    // Log execution
    const newSessionId = session_id || `voice_${crypto.randomUUID()}`;
    await supabase.from("agent_executions").insert({
      flow_id: flow.id,
      deployment_id: deployment.id,
      session_id: newSessionId,
      status: "completed",
      input_message: userMessage,
      state_snapshot: {
        channel: "voice",
        stt: sttResult ? { engine: sttResult.engine, language: sttResult.language } : null,
        llm: { model: llmOutput.model, tokens: llmOutput.tokens },
        tts: { voice, engine: ttsResult.engine, audio_size: ttsResult.audio_size_bytes },
        pipeline_ms: totalMs,
      },
    } as any);

    return new Response(JSON.stringify({
      status: "completed",
      session_id: newSessionId,
      stt: sttResult ? { text: sttResult.text, confidence: sttResult.confidence, language: sttResult.language, engine: sttResult.engine } : null,
      llm: { response: llmResponse, model: llmOutput.model, provider: llmOutput.provider, tokens: llmOutput.tokens, latency_ms: llmOutput.latency_ms },
      tts: { audio_base64: ttsResult.audio_base64, voice: ttsResult.voice, engine: ttsResult.engine, audio_size_bytes: ttsResult.audio_size_bytes },
      pipeline_ms: totalMs,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[Gateway/Voice] Pipeline error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message, pipeline_ms: Date.now() - pipelineStart }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

/**
 * Direct TTS endpoint — text → Kokoro → audio
 */
export async function handleDirectTTS(body: any): Promise<Response> {
  const { text, voice = "pf_dora", speed = 1.0 } = body;
  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await executeTTSNode({ data: { config: { voice, speed } } }, { response: text });
  return new Response(JSON.stringify(result), {
    status: result.error ? 500 : 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
