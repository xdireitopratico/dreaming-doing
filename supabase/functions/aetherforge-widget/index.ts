import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const rawSlug = url.searchParams.get("slug");

  if (!rawSlug) {
    return new Response("Missing slug", { status: 400, headers: corsHeaders });
  }

  // BUG 20 FIX: Sanitize slug to prevent XSS — allow only alphanumeric + hyphens
  const slug = rawSlug.replace(/[^a-zA-Z0-9\-_]/g, "");
  if (!slug || slug !== rawSlug) {
    return new Response("Invalid slug format", { status: 400, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const gatewayUrl = `${supabaseUrl}/functions/v1/aetherforge-gateway`;

  const widgetJS = `
(function() {
  var SLUG = '${slug}';
  var GATEWAY = '${gatewayUrl}';
  var sessionId = 'widget_' + crypto.randomUUID().substring(0, 9);
  var isOpen = false;

  // Styles
  var style = document.createElement('style');
  style.textContent = \`
    #af-widget-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 99999;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border: none; cursor: pointer; box-shadow: 0 4px 20px rgba(99,102,241,0.4);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s; color: white; font-size: 24px;
    }
    #af-widget-btn:hover { transform: scale(1.1); }
    #af-widget-chat {
      position: fixed; bottom: 92px; right: 24px; z-index: 99998;
      width: 380px; max-width: calc(100vw - 48px); height: 520px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 16px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      display: none; flex-direction: column; overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #af-widget-chat.open { display: flex; }
    #af-chat-header {
      padding: 16px; background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white; font-weight: 600; font-size: 15px;
    }
    #af-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 8px;
    }
    .af-msg { padding: 10px 14px; border-radius: 12px; max-width: 85%; font-size: 14px; line-height: 1.4; }
    .af-msg.user { background: #6366f1; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .af-msg.bot { background: #f1f5f9; color: #1e293b; align-self: flex-start; border-bottom-left-radius: 4px; }
    .af-msg.typing { background: #f1f5f9; color: #94a3b8; font-style: italic; align-self: flex-start; }
    #af-chat-input-area {
      padding: 12px; border-top: 1px solid #e2e8f0; display: flex; gap: 8px;
    }
    #af-chat-input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px;
      font-size: 14px; outline: none;
    }
    #af-chat-input:focus { border-color: #6366f1; }
    #af-chat-send {
      background: #6366f1; color: white; border: none; border-radius: 8px;
      padding: 8px 16px; cursor: pointer; font-weight: 500; font-size: 14px;
    }
    #af-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
  \`;
  document.head.appendChild(style);

  // Chat container
  var chat = document.createElement('div');
  chat.id = 'af-widget-chat';
  chat.innerHTML = \`
    <div id="af-chat-header"></div>
    <div id="af-chat-messages"></div>
    <div id="af-chat-input-area">
      <input id="af-chat-input" placeholder="Digite sua mensagem..." />
      <button id="af-chat-send">Enviar</button>
    </div>
  \`;
  document.body.appendChild(chat);

  // Button
  var btn = document.createElement('button');
  btn.id = 'af-widget-btn';
  btn.innerHTML = '💬';
  btn.onclick = function() {
    isOpen = !isOpen;
    chat.classList.toggle('open', isOpen);
    btn.innerHTML = isOpen ? '✕' : '💬';
  };
  document.body.appendChild(btn);

  // BUG 68 FIX: Set header text safely via textContent instead of innerHTML
  document.getElementById('af-chat-header').textContent = SLUG.replace(/-/g, ' ').replace(/\\b\\w/g, function(l) { return l.toUpperCase(); });

  var messages = document.getElementById('af-chat-messages');
  var input = document.getElementById('af-chat-input');
  var sendBtn = document.getElementById('af-chat-send');

  function addMsg(text, role) {
    var div = document.createElement('div');
    div.className = 'af-msg ' + role;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
    return div;
  }

  async function send() {
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendBtn.disabled = true;
    addMsg(text, 'user');
    var typing = addMsg('Digitando...', 'typing');

    try {
      var resp = await fetch(GATEWAY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: SLUG, message: text, session_id: sessionId, channel: 'web' })
      });
      var data = await resp.json();
      typing.remove();
      // BUG 67 FIX: Handle object output
      var outText = typeof data.output === 'string' ? data.output : (data.output ? JSON.stringify(data.output) : (data.error || 'Sem resposta'));
      addMsg(outText, 'bot');
    } catch (e) {
      typing.remove();
      addMsg('Erro de conexão', 'bot');
    }
    sendBtn.disabled = false;
    input.focus();
  }

  sendBtn.onclick = send;
  input.onkeydown = function(e) { if (e.key === 'Enter') send(); };
})();
`;

  return new Response(widgetJS, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});
