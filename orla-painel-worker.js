const ADMIN_EMAIL = "comercial01@upvest.com.br";

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Painel ORLA</title>
  <style>
    body{margin:0;background:#f8f2ec;color:#241915;font-family:Arial,sans-serif}
    .top{position:sticky;top:0;background:#fffaf6;border-bottom:1px solid #e3d1c6;padding:18px 26px;display:flex;justify-content:space-between;align-items:center}
    .logo{font-family:Georgia,serif;font-size:30px;letter-spacing:.22em}
    .muted{color:#8b7469;font-size:13px}
    .wrap{max-width:1150px;margin:28px auto;padding:0 18px}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
    .card,.panel{background:white;border:1px solid #e3d1c6}
    .card{padding:18px}.card b{font-size:26px}
    .grid{display:grid;grid-template-columns:360px 1fr;gap:18px;margin-top:18px}
    .panel h2{font-family:Georgia,serif;font-weight:400;font-size:31px;margin:0;padding:20px;border-bottom:1px solid #e3d1c6}
    .tools{display:flex;gap:8px;padding:12px;border-bottom:1px solid #e3d1c6}
    input,select,textarea{width:100%;padding:12px;border:1px solid #e3d1c6;font:inherit}
    .order{padding:14px;border-bottom:1px solid #e3d1c6;cursor:pointer}
    .order:hover,.active{background:#fbf1ea}
    .row{display:flex;justify-content:space-between;gap:12px}
    .status{border:1px solid #e3d1c6;padding:5px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.12em}
    .detail{padding:18px}
    .items{width:100%;border-collapse:collapse;margin-top:14px}
    .items th,.items td{border-bottom:1px solid #e3d1c6;text-align:left;padding:10px;font-size:14px}
    .btn{border:1px solid #241915;background:#241915;color:white;padding:12px 16px;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;font-size:12px}
    .scan{display:grid;grid-template-columns:1fr auto;gap:10px;margin:14px 0}
    .empty{padding:34px;text-align:center;color:#8b7469}
    @media(max-width:900px){.grid,.cards{grid-template-columns:1fr}.top{align-items:flex-start;flex-direction:column}}
  </style>
</head>
<body>
  <header class="top">
    <div>
      <div class="logo">ORLA</div>
      <div class="muted">Painel administrativo</div>
    </div>
    <div id="userBox" class="muted">Acesso seguro</div>
  </header>
  <main class="wrap">
    <div class="cards">
      <div class="card"><div class="muted">Pedidos</div><b id="mOrders">0</b></div>
      <div class="card"><div class="muted">A separar</div><b id="mPicking">0</b></div>
      <div class="card"><div class="muted">Conferidos</div><b id="mReady">0</b></div>
      <div class="card"><div class="muted">Faturamento</div><b id="mTotal">R$ 0,00</b></div>
    </div>
    <section class="grid">
      <aside class="panel">
        <h2>Pedidos</h2>
        <div class="tools">
          <input id="q" placeholder="Buscar cliente, pedido, telefone">
          <select id="statusFilter">
            <option value="">Todos</option>
            <option value="pending">Pendente</option>
            <option value="paid">Pago</option>
            <option value="picking">Separação</option>
            <option value="checking">Conferência</option>
            <option value="ready">Pronto</option>
            <option value="shipped">Enviado</option>
            <option value="delivered">Entregue</option>
            <option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div id="orders"></div>
      </aside>
      <section class="panel">
        <h2>Resumo do pedido</h2>
        <div id="detail" class="detail"><div class="empty">Selecione um pedido.</div></div>
      </section>
    </section>
  </main>
  <script>
    const fmt=v=>(Number(v||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
    const sn={pending:'Pendente',paid:'Pago',picking:'Separação',checking:'Conferência',ready:'Pronto',shipped:'Enviado',delivered:'Entregue',cancelled:'Cancelado'};
    let orders=[],selected=null;
    async function api(p,o){const r=await fetch(p,{headers:{'content-type':'application/json'},...o});if(!r.ok)throw new Error(await r.text());return r.json()}
    function esc(s){return String(s||'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]))}
    async function load(){
      try{const me=await api('/api/admin/me');userBox.textContent=me.user.email||'Administrador';orders=(await api('/api/admin/orders')).orders||[];render()}
      catch(e){document.getElementById('orders').innerHTML='<div class="empty">Não foi possível abrir os pedidos.</div>';detail.innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
    }
    function visible(){let q=document.getElementById('q').value.toLowerCase(),st=statusFilter.value;return orders.filter(o=>(!st||o.status===st)&&[o.id,o.customer_name,o.customer_phone,o.customer_email].join(' ').toLowerCase().includes(q))}
    function render(){
      let v=visible();
      mOrders.textContent=orders.length;
      mPicking.textContent=orders.filter(o=>['paid','picking','checking'].includes(o.status)).length;
      mReady.textContent=orders.filter(o=>['ready','shipped'].includes(o.status)).length;
      mTotal.textContent=fmt(orders.reduce((s,o)=>s+Number(o.total_cents||0),0));
      document.getElementById('orders').innerHTML=v.length?v.map(o=>'<div class="order '+(selected&&selected.id===o.id?'active':'')+'" onclick="sel(\\''+o.id+'\\')"><div class="row"><b>'+esc(o.id)+'</b><span class="status">'+(sn[o.status]||o.status)+'</span></div><div>'+esc(o.customer_name||'Cliente sem nome')+'</div><div class="muted">'+esc(o.customer_phone||'')+' · '+fmt(o.total_cents)+'</div></div>').join(''):'<div class="empty">Nenhum pedido encontrado.</div>';
      if(selected)show(selected);
    }
    window.sel=id=>{selected=orders.find(o=>o.id===id);render()};
    async function saveStatus(){let data=await api('/api/admin/orders/'+encodeURIComponent(selected.id),{method:'PATCH',body:JSON.stringify({status:statusEdit.value,notes:notes.value})});selected=data.order;orders=orders.map(o=>o.id===selected.id?selected:o);render()}
    async function scan(){let code=barcode.value.trim();if(!code)return;let data=await api('/api/admin/orders/'+encodeURIComponent(selected.id)+'/scan',{method:'POST',body:JSON.stringify({barcode:code})});scanMsg.textContent=data.message||(data.matched?'Peça conferida.':'Não encontrado.');barcode.value='';if(data.order){selected=data.order;orders=orders.map(o=>o.id===selected.id?selected:o);render()}}
    function show(o){
      let checked=(o.items||[]).reduce((s,i)=>s+Number(i.checked_quantity||0),0),qty=(o.items||[]).reduce((s,i)=>s+Number(i.quantity||0),0);
      detail.innerHTML='<div class="row"><div><b>'+esc(o.customer_name||'Cliente')+'</b><div class="muted">'+esc(o.customer_email||'')+' '+esc(o.customer_phone||'')+'</div><div class="muted">'+esc([o.address,o.number,o.city,o.state].filter(Boolean).join(', '))+'</div></div><select id="statusEdit"><option value="pending">Pendente</option><option value="paid">Pago</option><option value="picking">Separação</option><option value="checking">Conferência</option><option value="ready">Pronto</option><option value="shipped">Enviado</option><option value="delivered">Entregue</option><option value="cancelled">Cancelado</option></select></div><div class="scan"><input id="barcode" placeholder="Bipar código de barras"><button class="btn" onclick="scan()">Bipar</button></div><div class="muted" id="scanMsg">Conferido: '+checked+' de '+qty+' peça(s)</div><table class="items"><thead><tr><th>Ref.</th><th>Cor</th><th>Tam.</th><th>Qtd.</th><th>Bipado</th><th>Valor</th></tr></thead><tbody>'+(o.items||[]).map(i=>'<tr><td>'+esc(i.ref)+'</td><td>'+esc((i.color_code||'')+' '+(i.color_name||''))+'</td><td>'+esc(i.size)+'</td><td>'+i.quantity+'</td><td>'+Number(i.checked_quantity||0)+'</td><td>'+fmt(Number(i.unit_price_cents||0)*Number(i.quantity||0))+'</td></tr>').join('')+'</tbody></table><p><b>Total: '+fmt(o.total_cents)+'</b></p><textarea id="notes" rows="4" placeholder="Observações internas">'+esc(o.notes||'')+'</textarea><p><button class="btn" onclick="saveStatus()">Salvar status</button></p>';
      statusEdit.value=o.status||'pending';
    }
    q.oninput=render;statusFilter.onchange=render;load();
  </script>
</body>
</html>`;

const STATUS = new Set(["pending","paid","picking","checking","ready","shipped","delivered","cancelled"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8","cache-control":"no-store"}
  });
}

function user(request) {
  const email = (
    request.headers.get("Cf-Access-Authenticated-User-Email") ||
    request.headers.get("cf-access-authenticated-user-email") ||
    request.headers.get("oai-authenticated-user-email") ||
    ""
  ).toLowerCase();
  const access = request.headers.get("Cf-Access-Jwt-Assertion") || request.headers.get("cf-access-jwt-assertion");
  if (!email && !access) return null;
  if (email && email !== ADMIN_EMAIL) return null;
  return {email: email || "cloudflare-access"};
}

function locked() {
  return new Response('<!doctype html><meta charset="utf-8"><body style="font-family:Arial;background:#fbf5ef;color:#271b16;display:grid;place-items:center;min-height:100vh"><main style="text-align:center;border:1px solid #e4c9b8;padding:44px;background:white"><h1>Painel protegido</h1><p>Entre com o e-mail autorizado.</p></main></body>', {
    status: 401,
    headers: {"content-type":"text/html; charset=utf-8"}
  });
}

async function ensure(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, customer_name TEXT, customer_email TEXT, customer_phone TEXT, customer_document TEXT, postal_code TEXT, address TEXT, number TEXT, complement TEXT, neighborhood TEXT, city TEXT, state TEXT, shipping_method TEXT, shipping_price_cents INTEGER DEFAULT 0, payment_method TEXT, subtotal_cents INTEGER DEFAULT 0, discount_cents INTEGER DEFAULT 0, total_cents INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL, collection TEXT, ref TEXT, name TEXT, color_code TEXT, color_name TEXT, size TEXT, quantity INTEGER DEFAULT 1, unit_price_cents INTEGER DEFAULT 0, barcode TEXT, checked_quantity INTEGER DEFAULT 0)").run();
}

async function getOrder(env, id) {
  await ensure(env);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id=?").bind(id).first();
  if (!order) return null;
  const items = await env.DB.prepare("SELECT * FROM order_items WHERE order_id=? ORDER BY id").bind(id).all();
  return {...order, items: items.results || []};
}

async function listOrders(env) {
  await ensure(env);
  const rr = await env.DB.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all();
  const rows = rr.results || [];
  if (!rows.length) return [];
  const ids = rows.map(r => r.id);
  const marks = ids.map(() => "?").join(",");
  const stmt = env.DB.prepare("SELECT * FROM order_items WHERE order_id IN (" + marks + ") ORDER BY id");
  const ir = await stmt.bind(...ids).all();
  const grouped = {};
  for (const item of (ir.results || [])) (grouped[item.order_id] ||= []).push(item);
  return rows.map(row => ({...row, items: grouped[row.id] || []}));
}

async function updateOrder(env, id, payload) {
  const order = await getOrder(env, id);
  if (!order) return null;
  await env.DB.prepare("UPDATE orders SET status=?, notes=COALESCE(?,notes), updated_at=? WHERE id=?")
    .bind(STATUS.has(payload.status) ? payload.status : order.status, payload.notes ?? null, new Date().toISOString(), id)
    .run();
  return getOrder(env, id);
}

async function scanItem(env, id, payload) {
  const code = String(payload.barcode || "").trim();
  if (!code) return {matched:false, message:"Código vazio."};
  let item = await env.DB.prepare("SELECT * FROM order_items WHERE order_id=? AND barcode=? LIMIT 1").bind(id, code).first();
  if (!item) {
    item = await env.DB.prepare('SELECT * FROM order_items WHERE order_id=? AND (ref||color_code||size=? OR ref||"-"||color_code||"-"||size=?) LIMIT 1')
      .bind(id, code, code)
      .first();
  }
  if (!item) return {matched:false, message:"Peça não encontrada neste pedido."};
  if (Number(item.checked_quantity || 0) >= Number(item.quantity || 0)) {
    return {matched:true, message:"Quantidade já conferida para esta peça."};
  }
  await env.DB.prepare("UPDATE order_items SET checked_quantity=checked_quantity+1 WHERE id=?").bind(item.id).run();
  return {matched:true, message:"Peça conferida.", order: await getOrder(env, id)};
}

async function api(request, env, path) {
  const currentUser = user(request);
  if (!currentUser) return json({error:"unauthorized"}, 401);
  if (path === "/api/admin/me") return json({user: currentUser});
  if (path === "/api/admin/orders" && request.method === "GET") return json({orders: await listOrders(env)});
  const match = path.match(/^\/api\/admin\/orders\/([^/]+)(?:\/(scan))?$/);
  if (match && request.method === "PATCH") return json({order: await updateOrder(env, decodeURIComponent(match[1]), await request.json())});
  if (match && request.method === "POST" && match[2] === "scan") return json(await scanItem(env, decodeURIComponent(match[1]), await request.json()));
  if (match && request.method === "GET") return json({order: await getOrder(env, decodeURIComponent(match[1]))});
  return json({error:"not_found"}, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.DB) return new Response("Banco D1 não conectado ao Worker.", {status: 500});
    if (url.pathname.startsWith("/api/admin/")) return api(request, env, url.pathname);
    if (url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/admin.html") {
      if (!user(request)) return locked();
      return new Response(HTML, {
        headers: {"content-type":"text/html; charset=utf-8","cache-control":"no-store"}
      });
    }
    return new Response("Não encontrado", {status: 404});
  }
};
