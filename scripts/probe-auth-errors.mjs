const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function probe(label, body) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  console.log(`${label.padEnd(28)} HTTP ${res.status}  code=${JSON.stringify(j.error_code ?? null)}  msg=${JSON.stringify((j.msg || j.error_description || "").slice(0, 80))}`);
}

await probe("email sin @", { email: "covacapp1", password: "x" });
await probe("email vacio", { email: "", password: "x" });
await probe("pass corta", { email: "covacapp1@gmail.com", password: "123" });
await probe("pass correcta?", { email: "covacapp1@gmail.com", password: "definitely-not-the-password" });
await probe("email desconocido", { email: "nadie-existe-xyz@example.com", password: "12345678" });
await probe("email con espacios", { email: " covacapp1@gmail.com ", password: "12345678" });
