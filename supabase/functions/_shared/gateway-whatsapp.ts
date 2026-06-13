/**
 * AetherForge Gateway — WhatsApp Channel Handlers (Evolution API V1)
 * Extracted from monolithic index.ts (Round 44.5 refactoring)
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, HITLPauseSignal, executeLLMNode, executeNodeInline, executeToolNode } from "./gateway-core.ts";

/**
 * Send a WhatsApp message via Evolution API V1
 */
export async function sendWhatsAppViaEvolutionV1(
  supabase: any, phone: string, message: string, instanceName?: string
): Promise<boolean> {
  try {
    const targetInstance = instanceName || "direito-pratico";
    const { data: config } = await supabase
      .from("evolution_instances")
      .select("api_url, api_key, instance_name, status")
      .eq("instance_name", targetInstance)
      .eq("is_active", true)
      .single();

    if (!config?.api_url || !config?.api_key) {
      console.error(`[Gateway/WhatsApp] No Evolution V1 config for: ${targetInstance}`);
      return false;
    }

    if (config.status !== "open" && config.status !== "connected") {
      console.error(`[Gateway/WhatsApp] Instance ${targetInstance} not connected (${config.status})`);
      return false;
    }

    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("55")) formattedPhone = "55" + formattedPhone;

    const sendUrl = `${config.api_url}/message/sendText/${config.instance_name}`;
    console.log(`[Gateway/WhatsApp] Sending to ${formattedPhone} via ${sendUrl}`);

    const response = await fetch(sendUrl, {
      method: "POST",
      headers: { "apikey": config.api_key, "Content-Type": "application/json" },
      body: JSON.stringify({ number: formattedPhone, text: message }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Gateway/WhatsApp] Send failed: ${response.status} - ${errText}`);
      return false;
    }

    console.log(`[Gateway/WhatsApp] ✓ Sent to ${formattedPhone}`);
    await supabase.from("whatsapp_message_logs").insert({
      phone_number: formattedPhone, message_content: message.substring(0, 500),
      direction: "outgoing", status: "sent", provider: "evolution_v1",
      instance_name: config.instance_name, metadata: { source: "aetherforge_agent" },
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error("[Gateway/WhatsApp] Send error:", err);
    return false;
  }
}

/**
 * Handle incoming WhatsApp message from Evolution API V1 webhook
 */
export async function handleWhatsAppIncoming(body: any): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { phone, message, instance_name, message_id, sender_name, media } = body;

  if (!phone || !message) {
    return new Response(JSON.stringify({ error: "phone and message are required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[Gateway/WhatsApp] Incoming from ${phone} via ${instance_name}: ${message.substring(0, 100)}`);

  try {
    // 1. Find active WhatsApp deployment
    const { data: deploymentsList } = await supabase
      .from("agent_deployments")
      .select("id, flow_id, endpoint_slug, channel_config, is_active")
      .eq("channel", "whatsapp")
      .eq("is_active", true);

    const deployment = deploymentsList?.find((d: any) => {
      const config = d.channel_config as Record<string, any> | null;
      return config?.instance_name === instance_name || config?.instance_name === "direito-pratico";
    });

    if (!deployment) {
      console.log(`[Gateway/WhatsApp] No active WhatsApp deployment for instance: ${instance_name}`);
      return new Response(JSON.stringify({ status: "no_deployment", instance_name }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load flow
    const { data: flow } = await supabase
      .from("agent_flows")
      .select("id, name, flow_definition, status")
      .eq("id", deployment.flow_id)
      .eq("status", "published")
      .single();

    if (!flow) {
      console.log(`[Gateway/WhatsApp] Flow not found or not published for deployment ${deployment.id}`);
      return new Response(JSON.stringify({ status: "flow_not_found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Session = phone number (persistent)
    const sessionId = `whatsapp_${phone}`;

    // 4. Create or resume execution
    let executionId: string;
    const { data: existing } = await supabase
      .from("agent_executions")
      .select("id")
      .eq("session_id", sessionId)
      .eq("flow_id", flow.id)
      .in("status", ["running", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) {
      executionId = existing.id;
    } else {
      const { data: newExec, error: execErr } = await supabase
        .from("agent_executions")
        .insert({
          flow_id: flow.id,
          deployment_id: deployment.id,
          session_id: sessionId,
          status: "running",
          input_message: message,
          state_snapshot: {
            channel: "whatsapp", phone,
            sender_name: sender_name || phone,
            instance_name,
            metadata: { message_id, media },
          },
        })
        .select("id")
        .single();

      if (execErr || !newExec) {
        throw new Error(`Failed to create execution: ${execErr?.message}`);
      }
      executionId = newExec.id;
    }

    // 5. Execute flow (inline BFS)
    const flowDef = flow.flow_definition as { nodes?: any[]; edges?: any[] };
    const nodes = flowDef?.nodes || [];
    const edges = flowDef?.edges || [];
    const triggerNode = nodes.find((n: any) => n.type === "trigger");

    if (!triggerNode) {
      return new Response(JSON.stringify({ error: "No trigger node" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const visited = new Set<string>();
    const queue: { nodeId: string; input: any }[] = [
      { nodeId: triggerNode.id, input: { message, channel: "whatsapp", metadata: { phone, sender_name, instance_name } } },
    ];
    let finalOutput: any = null;
    let stepOrder = 0;

    while (queue.length > 0) {
      const { nodeId, input } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node) continue;
      stepOrder++;

      const stepStart = Date.now();
      let output: any;
      let stepStatus = "completed";
      let stepCostCents = 0;

      try {
        if (node.type === "llm") {
          output = await executeLLMNode(node, input, message, flow.id);
          stepCostCents = output.cost_cents || 0;
        } else if (node.type === "tool" && node.data?.config?.tool_name) {
          output = await executeToolNode(supabase, node, input, flow.id, executionId);
        } else {
          output = executeNodeInline(node, input, message);
        }
      } catch (err) {
        if (err instanceof HITLPauseSignal) {
          await supabase.from("agent_executions").update({
            status: "paused", is_paused: true,
            paused_at: new Date().toISOString(),
            pause_reason: err.pauseMessage,
            pause_timeout_at: new Date(Date.now() + err.timeoutMinutes * 60000).toISOString(),
            pause_fallback_action: err.fallbackAction,
            fsm_snapshot: { channel: "whatsapp", phone, message, last_output: finalOutput },
          }).eq("id", executionId);

          return new Response(JSON.stringify({ status: "paused", execution_id: executionId }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        output = { error: (err as Error).message };
        stepStatus = "error";
      }

      await supabase.from("agent_execution_steps").insert({
        execution_id: executionId, node_id: nodeId, node_type: node.type,
        step_order: stepOrder, input_data: input, output_data: output,
        status: stepStatus, started_at: new Date(stepStart).toISOString(),
        completed_at: new Date().toISOString(), duration_ms: Date.now() - stepStart,
        cost_cents: stepCostCents,
      });

      finalOutput = output;

      if (stepStatus !== "error") {
        const outEdges = edges.filter((e: any) => e.source === nodeId);
        for (const edge of outEdges) {
          if (!visited.has(edge.target)) queue.push({ nodeId: edge.target, input: output });
        }
      }
    }

    // 6. Mark completed
    await supabase.from("agent_executions").update({
      status: "completed", current_node_id: null,
      state_snapshot: { channel: "whatsapp", phone, final_output: finalOutput, steps_count: stepOrder },
    }).eq("id", executionId);

    // 7. Send response via Evolution API V1
    const responseText = finalOutput?.response || finalOutput?.text || JSON.stringify(finalOutput);
    if (responseText) {
      await sendWhatsAppViaEvolutionV1(supabase, phone, responseText, instance_name);
    }

    return new Response(JSON.stringify({
      execution_id: executionId, status: "completed",
      output: finalOutput, response_sent: !!responseText,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[Gateway/WhatsApp] Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

/**
 * Handle manual WhatsApp send action
 */
export async function handleWhatsAppSend(body: any): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { phone, message, instance_name } = body;
  if (!phone || !message) {
    return new Response(JSON.stringify({ error: "phone and message required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sent = await sendWhatsAppViaEvolutionV1(supabase, phone, message, instance_name || "direito-pratico");
  return new Response(JSON.stringify({ sent, phone }), {
    status: sent ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
