const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

const digits = value => String(value || "").replace(/\D/g, "");

export async function onRequestGet({ request }) {
  const cep = digits(new URL(request.url).searchParams.get("cep"));
  if (cep.length !== 8) return json({ error: "Informe um CEP valido." }, 400);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error("Consulta de CEP indisponivel.");
    const data = await response.json();
    if (data.erro) return json({ error: "CEP nao encontrado." }, 404);
    return json({
      cep: digits(data.cep || cep),
      street: String(data.logradouro || ""),
      district: String(data.bairro || ""),
      city: String(data.localidade || ""),
      state: String(data.uf || ""),
    });
  } catch {
    return json({ error: "Nao foi possivel consultar o CEP no momento." }, 502);
  }
}
