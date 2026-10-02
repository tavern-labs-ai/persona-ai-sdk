const KEY = "character_memory_runtime";
const PROMPT_KEY = "persona-ai-sdk";
const defaults = {
  endpoint: "http://localhost:8787",
  apiKey: "",
  enabled: false,
  tokenBudget: 1200,
};

function context() {
  return globalThis.SillyTavern?.getContext?.();
}

function settings() {
  const ctx = context();
  ctx.extensionSettings[KEY] ??= structuredClone(defaults);
  return ctx.extensionSettings[KEY];
}

function personaId(ctx) {
  const character = ctx.characters?.[ctx.characterId ?? ctx.this_chid];
  return character?.data?.extensions?.character_memory_runtime?.personaId ?? character?.name;
}

function conversationId(ctx) {
  return ctx.chatId ?? ctx.chatMetadata?.main_chat ?? "default";
}

async function api(path, body) {
  const config = settings();
  const response = await fetch(config.endpoint.replace(/\/$/, "") + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Memory API returned ${response.status}: ${await response.text()}`);
  return response.json();
}

async function recall() {
  const ctx = context();
  const config = settings();
  if (!ctx || !config.enabled) return;
  const id = personaId(ctx);
  const latest = [...ctx.chat].reverse().find((message) => message.is_user);
  if (!id || !latest?.mes) return;
  try {
    const response = await api(`/v1/personas/${encodeURIComponent(id)}/memories/recall`, {
      query: latest.mes,
      conversationId: conversationId(ctx),
      userId: ctx.name1 ?? null,
      tokenBudget: config.tokenBudget,
    });
    ctx.setExtensionPrompt(PROMPT_KEY, response.data.context ?? "", 1, 0, false, "system");
  } catch (error) {
    console.error("[persona-ai-sdk] recall failed", error);
  }
}

async function ingest(messageIndex) {
  const ctx = context();
  if (!ctx || !settings().enabled) return;
  const id = personaId(ctx);
  const assistant = ctx.chat[Number(messageIndex)];
  const user = [...ctx.chat.slice(0, Number(messageIndex))]
    .reverse()
    .find((message) => message.is_user);
  if (!id || !assistant?.mes || !user?.mes) return;
  try {
    await api(`/v1/personas/${encodeURIComponent(id)}/memories/ingest`, {
      conversationId: conversationId(ctx),
      userId: ctx.name1 ?? null,
      messages: [
        {
          id: String(user.extra?.message_id ?? `st-user-${messageIndex}`),
          role: "user",
          content: user.mes,
          name: user.name,
        },
        {
          id: String(assistant.extra?.message_id ?? `st-assistant-${messageIndex}`),
          role: "assistant",
          content: assistant.mes,
          name: assistant.name,
          characterId: id,
        },
      ],
    });
  } catch (error) {
    console.error("[persona-ai-sdk] ingest failed", error);
  }
}

function mountSettings() {
  const container = document.createElement("div");
  container.className = "character-memory-settings inline-drawer";
  container.innerHTML = `<div class="inline-drawer-toggle inline-drawer-header"><b>Character Memory Runtime</b></div>
    <div class="inline-drawer-content">
      <label><input type="checkbox" data-field="enabled"> Enabled</label>
      <label>Service URL <input class="text_pole" data-field="endpoint" type="url"></label>
      <label>API key <input class="text_pole" data-field="apiKey" type="password" autocomplete="off"></label>
      <label>Recall token budget <input class="text_pole" data-field="tokenBudget" type="number" min="128" max="8000"></label>
      <small>The key is stored in your local SillyTavern settings. Use a tenant-scoped key.</small>
    </div>`;
  const host = document.querySelector("#extensions_settings") ?? document.body;
  host.append(container);
  for (const input of container.querySelectorAll("[data-field]")) {
    const field = input.dataset.field;
    if (input.type === "checkbox") input.checked = settings()[field];
    else input.value = settings()[field];
    input.addEventListener("change", async () => {
      settings()[field] =
        input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? Number(input.value)
            : input.value;
      await context().saveSettingsDebounced?.();
    });
  }
}

const ctx = context();
if (ctx) {
  mountSettings();
  ctx.eventSource.on(ctx.eventTypes.GENERATION_STARTED, recall);
  ctx.eventSource.on(ctx.eventTypes.MESSAGE_RECEIVED, ingest);
  ctx.eventSource.on(ctx.eventTypes.CHAT_CHANGED, () =>
    ctx.setExtensionPrompt(PROMPT_KEY, "", 1, 0),
  );
}
