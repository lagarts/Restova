import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const stamp = Date.now();
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const checks = [];
let orgId = null;
const userIds = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` â€” ${detail}` : ""}`);
}

function fail(message) {
  console.error(`\nABORT: ${message}`);
  process.exitCode = 1;
}

async function signIn(email, password) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return client;
}

async function cleanup() {
  if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  for (const id of userIds) {
    try {
      await admin.auth.admin.deleteUser(id);
    } catch {
      /* ignore */
    }
  }
}

async function main() {
  const ownerEmail = `e2e-owner-${stamp}@example.com`;
  const mozoEmail = `e2e-mozo-${stamp}@example.com`;
  const outsiderEmail = `e2e-outsider-${stamp}@example.com`;
  const password = "E2e-Passw0rd!123";

  const ownerCreated = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Owner E2E" },
  });
  if (ownerCreated.error) return fail(`createUser owner: ${ownerCreated.error.message}`);
  const owner = ownerCreated.data.user;

  const mozoCreated = await admin.auth.admin.createUser({
    email: mozoEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Mozo E2E" },
  });
  if (mozoCreated.error) return fail(`createUser mozo: ${mozoCreated.error.message}`);
  const mozo = mozoCreated.data.user;

  const outsiderCreated = await admin.auth.admin.createUser({
    email: outsiderEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Outsider E2E" },
  });
  if (outsiderCreated.error) return fail(`createUser outsider: ${outsiderCreated.error.message}`);
  const outsider = outsiderCreated.data.user;

  userIds.push(owner.id, mozo.id, outsider.id);

  const db = await signIn(ownerEmail, password);

  const { data: registered, error: regError } = await db.rpc("register_organization", {
    _name: "Resto E2E",
    _branch_name: "Sucursal E2E",
  });
  check("register_organization", !regError && registered, regError?.message ?? String(registered));
  if (regError || !registered) return fail("no org");
  orgId = registered;

  const { data: branches } = await admin
    .from("branches")
    .select("id, name, is_main")
    .eq("org_id", orgId);
  const branch = branches?.[0];
  check("branch creada", branch?.is_main === true, branch?.name);

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("status, trial_end")
    .eq("org_id", orgId)
    .maybeSingle();
  check(
    "trial operable",
    subscription?.status === "trial" && new Date(subscription.trial_end) > new Date(),
    `${subscription?.status}`
  );

  const { data: member, error: memberError } = await admin
    .from("org_members")
    .insert({ org_id: orgId, user_id: mozo.id, role: "mozo", branch_id: branch.id })
    .select()
    .single();
  check("alta de mozo", !memberError && member, memberError?.message);

  const { data: category, error: catError } = await admin
    .from("categories")
    .insert({ org_id: orgId, branch_id: branch.id, name: "Platos" })
    .select()
    .single();
  check("categoria", !catError && category, catError?.message);

  const { data: product, error: prodError } = await admin
    .from("products")
    .insert({
      org_id: orgId,
      branch_id: branch.id,
      category_id: category.id,
      name: "Milanesa",
      price: 8500,
    })
    .select()
    .single();
  check("producto", !prodError && product, prodError?.message);

  const { data: table, error: tableError } = await admin
    .from("dining_tables")
    .insert({ org_id: orgId, branch_id: branch.id, name: "Mesa 1", capacity: 4, pos_x: 0, pos_y: 0 })
    .select()
    .single();
  check("mesa", !tableError && table, tableError?.message);

  const { data: session, error: sessionError } = await admin
    .from("table_sessions")
    .insert({
      org_id: orgId,
      branch_id: branch.id,
      table_id: table.id,
      opened_by: owner.id,
      waiter_id: owner.id,
    })
    .select()
    .single();
  check("sesion de mesa", !sessionError && session, sessionError?.message);

  const { data: orderId, error: orderError } = await db.rpc("create_order", {
    _table_session_id: session.id,
    _items: [{ product_id: product.id, quantity: 2, notes: "sin sal", modifier_option_ids: [] }],
    _notes: "comanda e2e",
  });
  check("create_order", !orderError && orderId, orderError?.message ?? String(orderId));
  if (orderError) return;

  const { data: orderRow } = await admin
    .from("orders")
    .select("id, order_number, status, subtotal, total")
    .eq("id", orderId)
    .single();
  check("totales calculados por trigger", Number(orderRow?.total) === 17000, `total=${orderRow?.total}`);
  check("numero correlativo", orderRow?.order_number === 1, `n=${orderRow?.order_number}`);
  check("estado inicial draft", orderRow?.status === "draft", orderRow?.status);

  const { error: addError } = await db.rpc("add_order_items", {
    _order_id: orderId,
    _items: [{ product_id: product.id, quantity: 1, modifier_option_ids: [] }],
  });
  check("add_order_items", !addError, addError?.message);
  const { data: orderRow2 } = await admin
    .from("orders")
    .select("subtotal, total")
    .eq("id", orderId)
    .single();
  check("subtotal refrescado", Number(orderRow2?.total) === 25500, `total=${orderRow2?.total}`);

  const { error: sendError } = await db.rpc("send_order", { _order_id: orderId });
  check("send_order", !sendError, sendError?.message);

  const { data: items } = await admin.from("order_items").select("id, status").eq("order_id", orderId);
  const itemIds = (items ?? []).map((item) => item.id);
  check("items creados", itemIds.length === 2, `count=${itemIds.length}`);

  for (const id of itemIds) {
    for (const status of ["preparing", "ready"]) {
      const { error } = await db.rpc("advance_order_item", { _item_id: id, _status: status });
      if (error) check(`advance ${status}`, false, error.message);
    }
  }
  const { data: midOrder } = await admin
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  check("orden en preparacion/lista", ["preparing", "ready"].includes(midOrder?.status), midOrder?.status);

  for (const id of itemIds) {
    const { error } = await db.rpc("advance_order_item", { _item_id: id, _status: "served" });
    if (error) check("advance served", false, error.message);
  }
  const { data: servedOrder } = await admin
    .from("orders")
    .select("status, delivered_at")
    .eq("id", orderId)
    .single();
  check("orden entregada", servedOrder?.status === "delivered" && Boolean(servedOrder?.delivered_at), servedOrder?.status);

  const { data: registerId, error: openError } = await db.rpc("open_cash_register", {
    _branch_id: branch.id,
    _opening_amount: 50000,
    _notes: "fondo e2e",
  });
  check("open_cash_register", !openError && registerId, openError?.message ?? String(registerId));

  const { data: chargeId, error: chargeError } = await db.rpc("charge_session", {
    _session_id: session.id,
    _payments: [{ method: "cash", amount: 25500 }],
    _discount_amount: 0,
  });
  check("charge_session", !chargeError && chargeId, chargeError?.message ?? String(chargeId));

  const { data: sale } = await admin
    .from("sales")
    .select("id, receipt_number, total, status")
    .eq("id", chargeId ?? "")
    .maybeSingle();
  check("venta registrada", Number(sale?.total) === 25500, `total=${sale?.total}`);
  check("receipt correlativo", sale?.receipt_number === 1, `n=${sale?.receipt_number}`);

  const { data: closedSession } = await admin
    .from("table_sessions")
    .select("status, closed_at")
    .eq("id", session.id)
    .single();
  check("sesion cerrada", closedSession?.status === "closed" && Boolean(closedSession?.closed_at));

  const { data: paidOrders } = await admin
    .from("orders")
    .select("status, paid_at")
    .eq("table_session_id", session.id);
  check(
    "ordenes pagadas",
    (paidOrders ?? []).every((order) => order.status === "paid" && order.paid_at),
    JSON.stringify(paidOrders)
  );

  const { data: movement } = await admin
    .from("cash_movements")
    .select("type, amount, method")
    .eq("cash_register_id", registerId)
    .eq("type", "sale")
    .maybeSingle();
  check("movimiento de caja", Number(movement?.amount) === 25500 && movement?.method === "cash");

  const { error: closeError } = await db.rpc("close_cash_register", {
    _register_id: registerId,
    _declared_amount: 75500,
  });
  check("close_cash_register", !closeError, closeError?.message);
  const { data: closedRegister } = await admin
    .from("cash_registers")
    .select("status, difference")
    .eq("id", registerId)
    .single();
  check("caja cerrada sin diferencia", closedRegister?.status === "closed" && Number(closedRegister?.difference) === 0, `diff=${closedRegister?.difference}`);

  const outsiderDb = await signIn(outsiderEmail, password);
  const { data: foreign } = await outsiderDb.from("products").select("id").eq("branch_id", branch.id);
  check("RLS: outsider no ve productos", (foreign ?? []).length === 0, `rows=${(foreign ?? []).length}`);
  const { data: foreignSales } = await outsiderDb.from("sales").select("id");
  check("RLS: outsider no ve ventas", (foreignSales ?? []).length === 0, `rows=${(foreignSales ?? []).length}`);

  const mozoDb = await signIn(mozoEmail, password);
  const { error: forbiddenError } = await mozoDb.rpc("open_cash_register", {
    _branch_id: branch.id,
    _opening_amount: 1,
  });
  check("permisos: mozo no abre caja", Boolean(forbiddenError), forbiddenError?.message);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks OK`);
  if (failed.length > 0) process.exitCode = 1;
}
