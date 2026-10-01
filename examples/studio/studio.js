const byId = (id) => document.getElementById(id);

async function request(path, options = {}) {
  const response = await fetch(byId("endpoint").value.replace(/\/$/, "") + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${byId("key").value}`,
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function refresh() {
  try {
    const { data } = await request("/v1/personas");
    byId("personas").replaceChildren(
      ...data.map((persona) => new Option(`${persona.name} (${persona.id})`, persona.id)),
    );
    status(`Loaded ${data.length} persona(s).`);
  } catch (error) {
    status(error.message, true);
  }
}

byId("refresh").onclick = refresh;
byId("save").onclick = async () => {
  try {
    await request("/v1/personas", {
      method: "POST",
      body: JSON.stringify(JSON.parse(byId("manifest").value)),
    });
    await refresh();
  } catch (error) {
    status(error.message, true);
  }
};
byId("remove").onclick = async () => {
  if (!byId("personas").value) return;
  try {
    await request(`/v1/personas/${encodeURIComponent(byId("personas").value)}`, {
      method: "DELETE",
    });
    await refresh();
  } catch (error) {
    status(error.message, true);
  }
};
byId("send").onclick = async () => {
  try {
    const id = encodeURIComponent(byId("personas").value);
    const { data } = await request(`/v1/personas/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({
        conversationId: byId("conversation").value,
        message: byId("message").value,
      }),
    });
    byId("output").textContent = `${data.text}\n\n${JSON.stringify(data.delivery, null, 2)}`;
  } catch (error) {
    status(error.message, true);
  }
};

function status(message, failed = false) {
  byId("status").textContent = message;
  byId("status").className = failed ? "error" : "";
}
