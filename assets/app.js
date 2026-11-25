"use strict";
/* ---------- utilidades ---------- */
const APP_MODE = window.APP_MODE || 'public';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(+n||0);
const num = v => { const n = parseFloat(String(v).replace(',','.')); return isNaN(n) ? 0 : n; };
const qtyf = n => (Math.round(n*100)/100).toString();
const norm = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const z2 = n => String(n).padStart(2,'0');
const dayKey = (d=new Date()) => d.getFullYear()+'-'+z2(d.getMonth()+1)+'-'+z2(d.getDate());
const addDays = (key,n) => { const d = new Date(key+'T12:00:00'); d.setDate(d.getDate()+n); return dayKey(d); };
const digits = s => String(s||'').replace(/\D/g,'');
const rid = () => Math.random().toString(36).slice(2,10);
const fmtDay = k => new Date(k+'T12:00:00').toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long'});
const DOW = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const ICONS = [['herramient','🔨'],['plomer','🚰'],['electric','💡'],['pintur','🎨'],['tornill','🔩'],['construc','🧱'],['jardin','🌱'],['segur','🔒'],['cerraj','🔑']];
const icon = c => { const n = norm(c); for (const [k,v] of ICONS) if (n.includes(k)) return v; return '🛠️'; };
const DEFAULT_CATS = ['Herramientas','Plomería','Electricidad','Pintura','Tornillería','Construcción','Jardinería','Seguridad'];
const PRIV = 'private/d'; /* colecciones privadas: private/d/costs, private/d/sales, private/d/extras */

/* ---------- estado ---------- */
const S = {
  db:null, sb:null, isAdmin:false, view:APP_MODE==='admin'?'admin':'catalogo', tab:'ventas', ready:false, err:null,
  products:{}, costs:{}, packages:{}, config:{}, sales:{}, extras:{}, meta:{suppliers:[]},
  cart:{items:{}, pkgs:{}}, cartOpen:false, form:{}, saleCart:[], saleDay:dayKey(),
  period:30, orderSel:{}, adminLoaded:false, pkgDraft:null
};
let T = null;
const schedule = () => { clearTimeout(T); T = setTimeout(render, 80); };
function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>t.classList.add('hidden'),3200); }
async function safe(fn){ try{ await fn(); } catch(e){ console.error(e); toast('No se pudo guardar'+(e&&e.message?': '+e.message:'')); } }
const fv = (k,d='') => S.form[k] ?? d;

/* ---------- datos derivados ---------- */
const prods = () => Object.values(S.products);
const cost = pid => num((S.costs[pid]||{}).cost);
const minOf = pid => num((S.costs[pid]||{}).min);
const supOf = pid => (S.costs[pid]||{}).supplier || '';
const onOffer = p => num(p.offer) > 0 && num(p.offer) < num(p.price);
const unitPrice = p => onOffer(p) ? num(p.offer) : num(p.price);
const cats = () => [...new Set(prods().map(p=>p.category).filter(Boolean))].sort();
const allCats = () => [...new Set([...DEFAULT_CATS, ...cats()])].sort();
function suppliers(){
  const m = new Map(); (S.meta.suppliers||[]).forEach(s=>m.set(s.name,s));
  Object.values(S.costs).forEach(c=>{ if(c.supplier && !m.has(c.supplier)) m.set(c.supplier,{name:c.supplier,phone:''}); });
  return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function pkgInfo(k){
  const items = (k.items||[]).map(it=>({p:S.products[it.pid],qty:num(it.qty)||1})).filter(x=>x.p);
  const normal = items.reduce((s,x)=>s+unitPrice(x.p)*x.qty,0);
  const max = items.length ? Math.min(...items.map(x=>Math.floor(num(x.p.stock)/x.qty))) : 0;
  return {items, normal, save: normal-num(k.price), max};
}
function entriesIn(days){
  const min = days ? addDays(dayKey(), -(days-1)) : '';
  const out=[];
  for (const [day,doc] of Object.entries(S.sales)) if (day>=min) for (const e of (doc.entries||[])) out.push({...e,day});
  return out;
}
const totals = es => es.reduce((a,e)=>({sold:a.sold+num(e.total),cost:a.cost+num(e.cost),count:a.count+1}),{sold:0,cost:0,count:0});

/* ---------- suscripciones ---------- */
function subCol(path, target){
  return S.db.collection(path).onSnapshot(snap=>{
    const o={}; snap.docs.forEach(d=>o[d.id]={id:d.id,...d.data()});
    S[target]=o; schedule();
  }, e=>{ console.warn(path,e); });
}
function startPublic(){
  subCol('products','products');
  subCol('packages','packages');
  S.db.doc('config/store').onSnapshot(s=>{ S.config = s.exists ? s.data() : {}; schedule(); }, ()=>{});
}
function startAdmin(){
  if (S.adminLoaded) return; S.adminLoaded = true;
  subCol(PRIV+'/costs','costs');
  subCol(PRIV+'/sales','sales');
  subCol(PRIV+'/extras','extras');
  S.db.doc(PRIV+'/meta/main').onSnapshot(s=>{ S.meta = s.exists ? {suppliers:[],...s.data()} : {suppliers:[]}; schedule(); }, ()=>{});
}

/* ---------- render principal ---------- */
function render(){
  const app = $('#app');
  if (S.err){ app.innerHTML = `<div class="card empty">${esc(S.err)}</div>`; renderHdr(); return; }
  if (!S.ready){ return; }
  const ae = document.activeElement; let fid=null, ss=0, se=0;
  if (ae && app.contains(ae) && ae.id){ fid=ae.id; try{ss=ae.selectionStart;se=ae.selectionEnd;}catch(_){} }
  const sy = window.scrollY;
  renderHdr();
  app.innerHTML = S.view==='admin' ? adminHtml() : catalogHtml();
  if (S.view!=='admin') renderFab();
  else $('#fab')?.remove();
  if (fid){ const el=document.getElementById(fid); if(el){ el.focus(); try{el.setSelectionRange(ss,se);}catch(_){} } }
  window.scrollTo(0,sy);
}
function installBtn(){
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent), standalone=(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone;
  if(standalone) return '';
  if(window.__installEvt||ios) return `<button class="ghost" data-act="install">Instalar app</button>`;
  return '';
}
function renderHdr(){
  const name = S.config.name || 'Ferretería';
  if (S.view==='admin'){
    if(!S.isAdmin){ $('#hdr').innerHTML=`<h1>${esc(name)} <span class="sub">· Administración</span></h1>`; return; }
    const tabs=[['ventas','Ventas'],['inventario','Inventario'],['pedido','Pedido a proveedores'],['analisis','Análisis'],['tienda','Tienda web']];
    $('#hdr').innerHTML = `<h1>${esc(name)} <span class="sub">· Administración</span></h1>
      <nav class="nav" aria-label="Secciones">${tabs.map(([k,l])=>`<button data-act="tab" data-k="${k}" ${S.tab===k?'aria-current="true"':''}>${l}</button>`).join('')}
      <a href="../" class="ghost">Ver catálogo</a>${installBtn()}<button class="ghost" data-act="logout">Salir</button></nav>`;
  } else {
    $('#hdr').innerHTML = `<div class="grow"><h1>${esc(name)}</h1><div class="sub">${esc(S.config.tagline||'Catálogo y pedidos por WhatsApp')}</div></div>
      <nav class="nav"><button data-act="pdf">Catálogo PDF</button>${installBtn()}</nav>`;
  }
}
function route(){ S.view = APP_MODE==='admin' ? 'admin' : 'catalogo'; }
function loginHtml(){
  return `<div class="card login stack"><h2>Entrar a administración</h2>
    <label class="f">Correo<input type="text" id="lg_email" autocomplete="username" inputmode="email" value="${esc(fv('lg_email'))}" data-bind="lg_email"></label>
    <label class="f">Contraseña<input type="password" id="lg_pw" autocomplete="current-password" style="width:100%;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:9px 11px"></label>
    ${S.loginErr?`<div class="bad-t small">${esc(S.loginErr)}</div>`:''}
    <button class="btn" data-act="login">Entrar</button>
    <div class="hint">Solo el dueño de la ferretería puede entrar aquí.</div></div>`;
}
async function enterAdmin(){
  const { data, error } = await S.sb.rpc('is_admin');
  if (error || data !== true){ await S.sb.auth.signOut(); S.isAdmin=false; throw new Error('Este correo no tiene permiso de administrador.'); }
  S.isAdmin=true; startPublic(); startAdmin();
}
async function doLogin(){
  S.loginErr='';
  const email=($('#lg_email').value||'').trim(), pw=$('#lg_pw').value;
  if(!email||!pw){ S.loginErr='Escribe tu correo y contraseña.'; render(); return; }
  const { error } = await S.sb.auth.signInWithPassword({ email, password: pw });
  if (error){ S.loginErr='Correo o contraseña incorrectos.'; render(); return; }
  try{ await enterAdmin(); }catch(e){ S.loginErr=e.message; }
  render();
}

/* ================= CATÁLOGO PÚBLICO ================= */
function catalogHtml(){
  const q = norm(fv('cq')), cat = fv('ccat','Todas');
  const vis = prods().filter(p=>p.active!==false);
  const match = p => (cat==='Todas'||p.category===cat) && (!q || norm(p.name+' '+p.category+' '+(p.desc||'')).includes(q));
  const list = vis.filter(match).sort((a,b)=>a.name.localeCompare(b.name));
  const filtering = q || cat!=='Todas';
  const offers = vis.filter(onOffer).filter(match);
  const pk = Object.values(S.packages).filter(k=>k.active!==false).filter(k=>!q || norm(k.name+' '+(k.desc||'')).includes(q));
  const catList = ['Todas', ...[...new Set(vis.map(p=>p.category).filter(Boolean))].sort()];
  let h = `<div class="stack">
    <div class="row"><input type="search" id="cq" data-bind="cq" data-live="1" placeholder="Buscar producto (ej. martillo, tubo, pintura)" value="${esc(fv('cq'))}" aria-label="Buscar producto" style="max-width:520px"></div>
    <div class="chips" role="group" aria-label="Categorías">${catList.map(c=>`<button class="chip" data-act="ccat" data-k="${esc(c)}" aria-pressed="${c===cat}">${esc(c)}</button>`).join('')}</div>`;
  if (!vis.length) h += `<div class="card empty">El catálogo se está preparando. Vuelve pronto.</div>`;
  if (!filtering || cat==='Todas'){
    if (offers.length) h += `<section><h2>Ofertas</h2><div class="grid" style="margin-top:10px">${offers.map(prodCard).join('')}</div></section>`;
    if (pk.length) h += `<section><h2>Paquetes completos</h2><div class="grid" style="margin-top:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${pk.map(pkgCard).join('')}</div></section>`;
  }
  if (vis.length) h += `<section><h2>${filtering?'Resultados':'Todos los productos'}</h2>${list.length?`<div class="grid" style="margin-top:10px">${list.map(prodCard).join('')}</div>`:`<div class="card empty" style="margin-top:10px">No encontramos productos con esa búsqueda.</div>`}</section>`;
  return h + '</div>';
}
function prodCard(p){
  const stock = num(p.stock), q = S.cart.items[p.id]||0;
  const out = stock<=0;
  const stk = out ? '<span class="pill bad">Agotado</span>' : (stock<=5 ? `<span class="pill warn">Quedan ${qtyf(stock)}</span>` : '<span class="pill good">Disponible</span>');
  return `<div class="p"><div class="icow"><div class="ico" aria-hidden="true">${icon(p.category)}</div>${onOffer(p)?'<span class="tag">OFERTA</span>':''}</div>
    <div class="nm">${esc(p.name)}</div><div class="cat">${esc(p.category||'')}${p.unit?' · por '+esc(p.unit):''}</div>
    ${p.desc?`<div class="small muted">${esc(p.desc)}</div>`:''}
    <div class="pr num">${money(unitPrice(p))}${onOffer(p)?`<s>${money(p.price)}</s>`:''}</div>
    <div>${stk}</div>
    ${out?'':(q?`<div class="step"><button data-act="cdec" data-id="${esc(p.id)}" aria-label="Quitar uno">−</button><span class="num">${qtyf(q)}</span><button data-act="cinc" data-id="${esc(p.id)}" aria-label="Agregar uno">+</button></div>`
      :`<button class="btn sm" style="margin-top:auto" data-act="cinc" data-id="${esc(p.id)}">Agregar al pedido</button>`)}</div>`;
}
function pkgCard(k){
  const i = pkgInfo(k), q = S.cart.pkgs[k.id]||0, out = i.max<=0;
  return `<div class="pk"><div class="row" style="justify-content:space-between"><h3>${esc(k.name)}</h3><span class="tag" style="position:static">PAQUETE</span></div>
    ${k.desc?`<div class="small muted">${esc(k.desc)}</div>`:''}
    <ul>${i.items.map(x=>`<li>${qtyf(x.qty)} × ${esc(x.p.name)}</li>`).join('')}</ul>
    <div class="pr num" style="font-family:var(--display);font-size:28px;font-weight:700">${money(k.price)}${i.save>0?` <s class="muted" style="font-size:16px;font-weight:500">${money(i.normal)}</s>`:''}</div>
    ${i.save>0?`<div class="good-t small" style="font-weight:600">Ahorras ${money(i.save)}</div>`:''}
    ${out?'<span class="pill bad" style="align-self:flex-start">No disponible por ahora</span>':
      (q?`<div class="step"><button data-act="pdec" data-id="${esc(k.id)}" aria-label="Quitar uno">−</button><span class="num">${q}</span><button data-act="pinc" data-id="${esc(k.id)}" aria-label="Agregar uno">+</button></div>`
      :`<button class="btn sm" data-act="pinc" data-id="${esc(k.id)}">Agregar paquete</button>`)}</div>`;
}
function cartLines(){
  const L=[]; let total=0;
  for (const [id,q] of Object.entries(S.cart.items)){ const p=S.products[id]; if(!p) continue; const sub=unitPrice(p)*q; total+=sub; L.push({name:p.name+(p.unit?` (${p.unit})`:''),q,sub,id,kind:'i'}); }
  for (const [id,q] of Object.entries(S.cart.pkgs)){ const k=S.packages[id]; if(!k) continue; const sub=num(k.price)*q; total+=sub; L.push({name:'Paquete: '+k.name,q,sub,id,kind:'p'}); }
  return {L,total};
}
function renderFab(){
  const {L,total}=cartLines(); const n=L.reduce((s,x)=>s+x.q,0);
  let b=$('#fab');
  if(!n){ b?.remove(); return; }
  if(!b){ b=document.createElement('button'); b.id='fab'; b.className='btn fab'; b.dataset.act='copen'; document.body.appendChild(b); }
  b.textContent=`Ver pedido · ${qtyf(n)} artículo${n===1?'':'s'} · ${money(total)}`;
}
function waMessage(){
  const {L,total}=cartLines();
  const f=S.form; const name=(S.config.name||'la ferretería');
  let m=`Hola, quiero hacer un pedido en ${name}:\n`;
  L.forEach(x=>{ m+=`• ${qtyf(x.q)} x ${x.name} – ${money(x.sub)}\n`; });
  m+=`\nTotal aproximado: ${money(total)}\n`;
  if (f.cname) m+=`Nombre: ${f.cname}\n`;
  const dom = f.cdeliv==='domicilio';
  m+=`Entrega: ${dom?'A domicilio'+(f.caddr?' – '+f.caddr:''):'Recojo en tienda'}\n`;
  if (f.cnotes) m+=`Notas: ${f.cnotes}\n`;
  return m;
}
function waHref(){
  const n=digits(S.config.whatsapp);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(waMessage())}` : '#';
}
function renderDrawer(){
  const d=$('#drawer');
  if(!S.cartOpen){ d.classList.add('hidden'); d.innerHTML=''; return; }
  const {L,total}=cartLines();
  const dom=S.form.cdeliv==='domicilio';
  d.className='drawer';
  d.innerHTML=`<div class="panel" role="dialog" aria-label="Tu pedido">
    <div class="mh"><h2>Tu pedido</h2><button class="x" data-act="cclose" aria-label="Cerrar">✕</button></div>
    ${L.length?'':'<div class="empty">Tu pedido está vacío.</div>'}
    <div>${L.map(x=>`<div class="line"><div class="grow"><div style="font-weight:600">${esc(x.name)}</div><div class="small muted num">${money(x.sub/x.q)} c/u</div></div>
      <div class="step" style="margin:0"><button data-act="${x.kind==='i'?'cdec':'pdec'}" data-id="${esc(x.id)}" data-d="1" aria-label="Quitar uno">−</button><span class="num">${qtyf(x.q)}</span><button data-act="${x.kind==='i'?'cinc':'pinc'}" data-id="${esc(x.id)}" data-d="1" aria-label="Agregar uno">+</button></div>
      <div class="num" style="min-width:76px;text-align:right;font-weight:600">${money(x.sub)}</div></div>`).join('')}</div>
    <div class="row" style="justify-content:space-between"><b>Total aproximado</b><span class="kpi-v num" style="font-family:var(--display);font-size:28px;font-weight:700">${money(total)}</span></div>
    <div class="small muted">El precio final lo confirma la tienda por WhatsApp.</div>
    <label class="f">Tu nombre<input type="text" id="cname" data-bind="cname" value="${esc(fv('cname'))}" autocomplete="name"></label>
    <label class="f">Entrega<select id="cdeliv" data-bind="cdeliv" data-redraw="1"><option value="tienda" ${!dom?'selected':''}>Recojo en tienda</option><option value="domicilio" ${dom?'selected':''}>Entrega a domicilio</option></select></label>
    ${dom?`<label class="f">Dirección<input type="text" id="caddr" data-bind="caddr" value="${esc(fv('caddr'))}"></label>`:''}
    <label class="f">Notas (opcional)<textarea id="cnotes" data-bind="cnotes">${esc(fv('cnotes'))}</textarea></label>
    ${digits(S.config.whatsapp)?'':'<div class="banner small">La tienda aún no configura su número de WhatsApp.</div>'}
    <a id="wa-send" class="btn wa" target="_blank" rel="noopener" href="${esc(waHref())}" ${(!L.length||!digits(S.config.whatsapp))?'aria-disabled="true"':''}>Enviar pedido por WhatsApp</a>
    <button class="btn sec" data-act="cclear">Vaciar pedido</button>
  </div>`;
}
function cartChange(kind,id,delta,inDrawer){
  const bag = kind==='i'?S.cart.items:S.cart.pkgs;
  let q=(bag[id]||0)+delta;
  if (kind==='i'){ const p=S.products[id]; if(p) q=Math.min(q,Math.max(0,num(p.stock))); }
  else { const k=S.packages[id]; if(k) q=Math.min(q,Math.max(0,pkgInfo(k).max)); }
  if(q<=0) delete bag[id]; else bag[id]=q;
  if(!Object.keys(S.cart.items).length && !Object.keys(S.cart.pkgs).length && S.cartOpen) { S.cartOpen=false; }
  render(); renderDrawer();
}

/* ================= ADMIN ================= */
function adminHtml(){
  if (!S.isAdmin) return loginHtml();
  const fn = {ventas:tabVentas,inventario:tabInventario,pedido:tabPedido,analisis:tabAnalisis,tienda:tabTienda}[S.tab] || tabVentas;
  return fn();
}
const kpi = (l,v,cls='',s='') => `<div class="kpi ${cls}"><div class="l">${l}</div><div class="v num">${v}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
const marginPct = (price,c) => price>0 ? Math.round((price-c)/price*100) : 0;

/* ---------- Ventas ---------- */
function tabVentas(){
  const day=S.saleDay, entries=((S.sales[day]||{}).entries||[]).slice().sort((a,b)=>b.ts-a.ts);
  const t=totals(entries), mo=totals(entriesIn(0).filter(e=>e.day.slice(0,7)===dayKey().slice(0,7)));
  const q=norm(fv('sq'));
  const results = q ? prods().filter(p=>norm(p.name+' '+p.category).includes(q)).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8) : [];
  const cartTotal=S.saleCart.reduce((s,l)=>s+num(l.price)*num(l.qty),0);
  const cartCost=S.saleCart.reduce((s,l)=>s+num(l.cost)*num(l.qty),0);
  return `<div class="stack">
  <div class="row"><h2 class="grow">Ventas del día</h2>
    <button class="btn sec sm" data-act="dayshift" data-n="-1" aria-label="Día anterior">◀</button>
    <input type="date" id="saleDay" value="${day}" data-chg="saleday" style="width:auto" aria-label="Fecha">
    <button class="btn sec sm" data-act="dayshift" data-n="1" aria-label="Día siguiente">▶</button>
    <button class="btn sec sm" data-act="daytoday">Hoy</button></div>
  <div class="small muted" style="margin-top:-8px;text-transform:capitalize">${fmtDay(day)}</div>
  <div class="kpis">
    ${kpi('Total vendido',money(t.sold),'accent',`${t.count} venta${t.count===1?'':'s'}`)}
    ${kpi('Total invertido (costo)',money(t.cost),'',`lo que costó lo vendido`)}
    ${kpi('Ganancia',money(t.sold-t.cost),(t.sold-t.cost)>=0?'good':'warn',t.sold?`margen ${Math.round((t.sold-t.cost)/t.sold*100)}%`:'')}
    ${kpi('Este mes',money(mo.sold),'',`ganancia ${money(mo.sold-mo.cost)}`)}
  </div>
  <div class="card"><h3>Registrar venta</h3>
    <input type="search" id="sq" data-bind="sq" data-live="1" placeholder="Buscar producto vendido…" value="${esc(fv('sq'))}" aria-label="Buscar producto vendido">
    ${q?(results.length?`<div style="margin-top:8px">${results.map(p=>`<div class="line"><div class="grow"><b>${esc(p.name)}</b> <span class="muted small">${esc(p.category||'')} · stock ${qtyf(num(p.stock))}</span></div><span class="num">${money(unitPrice(p))}</span><button class="btn sm" data-act="saleadd" data-id="${esc(p.id)}">Agregar</button></div>`).join('')}</div>`:'<div class="muted small" style="margin-top:8px">Sin coincidencias. Da de alta el producto en Inventario.</div>'):''}
    ${S.saleCart.length?`<div class="tw" style="margin-top:12px"><table style="min-width:520px"><thead><tr><th>Producto</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">Subtotal</th><th></th></tr></thead><tbody>
      ${S.saleCart.map((l,i)=>`<tr><td>${esc(l.name)}${S.products[l.pid]&&num(l.qty)>num(S.products[l.pid].stock)?' <span class="pill warn">excede stock</span>':''}</td>
      <td class="r"><input type="number" step="any" min="0" id="sl_q${i}" data-sl="qty" data-i="${i}" value="${esc(l.qty)}" style="width:80px;text-align:right"></td>
      <td class="r"><input type="number" step="any" min="0" id="sl_p${i}" data-sl="price" data-i="${i}" value="${esc(l.price)}" style="width:96px;text-align:right"></td>
      <td class="r num">${money(num(l.price)*num(l.qty))}</td>
      <td class="r"><button class="btn sec sm" data-act="saledel" data-i="${i}" aria-label="Quitar">✕</button></td></tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:12px;justify-content:space-between"><div><b class="num" style="font-size:20px">Total ${money(cartTotal)}</b> <span class="muted small">· costo ${money(cartCost)} · ganancia ${money(cartTotal-cartCost)}</span></div>
      <div class="row"><button class="btn sec" data-act="salecancel">Limpiar</button><button class="btn" data-act="salesave">Registrar venta</button></div></div>`:''}
  </div>
  <div><h3 style="margin-bottom:8px">Ventas registradas</h3>
  ${entries.length?`<div class="stack" style="gap:10px">${entries.map(e=>`<div class="card" style="padding:12px 14px"><div class="row" style="justify-content:space-between"><span class="muted small">${new Date(e.ts).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</span><span><b class="num">${money(e.total)}</b> <button class="btn bad sm" data-act="entrydel" data-id="${esc(e.id)}">Eliminar</button></span></div>
      <div class="small" style="margin-top:4px">${e.items.map(it=>`${qtyf(it.qty)} × ${esc(it.name)} <span class="muted">(${money(it.price)})</span>`).join(' · ')}</div></div>`).join('')}</div>`:'<div class="card empty">Aún no hay ventas este día.</div>'}
  </div></div>`;
}
async function saveSale(){
  const lines=S.saleCart.filter(l=>num(l.qty)>0);
  if(!lines.length) return toast('Agrega al menos un producto con cantidad');
  const day=S.saleDay;
  const items=lines.map(l=>({pid:l.pid,name:l.name,qty:num(l.qty),price:num(l.price),cost:num(l.cost)}));
  const entry={id:rid(),ts:Date.now(),items,total:items.reduce((s,i)=>s+i.price*i.qty,0),cost:items.reduce((s,i)=>s+i.cost*i.qty,0)};
  await safe(async()=>{
    const entries=[...((S.sales[day]||{}).entries||[]),entry];
    await S.db.doc(PRIV+'/sales/'+day).set({day,entries});
    S.sales[day]={id:day,day,entries};
    for(const it of items){
      const p=S.products[it.pid]; if(!p) continue;
      const ns=num(p.stock)-it.qty;
      await S.db.doc('products/'+it.pid).update({stock:ns}); p.stock=ns;
    }
    S.saleCart=[]; S.form.sq=''; toast('Venta registrada y stock actualizado'); render();
  });
}
function deleteSale(id){
  const day=S.saleDay, entries=((S.sales[day]||{}).entries||[]), e=entries.find(x=>x.id===id); if(!e) return;
  ask('¿Eliminar esta venta? El stock se regresará al inventario.', ()=>safe(async()=>{
    const rest=entries.filter(x=>x.id!==id);
    if(rest.length){ await S.db.doc(PRIV+'/sales/'+day).set({day,entries:rest}); S.sales[day]={id:day,day,entries:rest}; }
    else { await S.db.doc(PRIV+'/sales/'+day).delete(); delete S.sales[day]; }
    for(const it of e.items){ const p=S.products[it.pid]; if(!p) continue; const ns=num(p.stock)+num(it.qty); await S.db.doc('products/'+it.pid).update({stock:ns}); p.stock=ns; }
    toast('Venta eliminada'); render();
  }));
}
/* confirm() está bloqueado en el marco: diálogo propio */
function ask(msg, yes){
  openModal('Confirmar', `<p>${esc(msg)}</p><div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="mclose">Cancelar</button><button class="btn bad" id="yes">Sí, continuar</button></div>`);
  $('#yes').onclick=()=>{ closeModal(); yes(); };
}

/* ---------- Inventario ---------- */
function tabInventario(){
  const q=norm(fv('iq')), cat=fv('icat','Todas');
  let list=prods().filter(p=>(cat==='Todas'||p.category===cat)&&(!q||norm(p.name+' '+p.category+' '+supOf(p.id)).includes(q))).sort((a,b)=>a.name.localeCompare(b.name));
  const all=prods();
  const invCost=all.reduce((s,p)=>s+Math.max(0,num(p.stock))*cost(p.id),0);
  const invSale=all.reduce((s,p)=>s+Math.max(0,num(p.stock))*num(p.price),0);
  const low=all.filter(p=>num(p.stock)<=minOf(p.id)).length;
  return `<div class="stack">
  <div class="row"><h2 class="grow">Inventario</h2><button class="btn" data-act="pedit" data-id="">+ Nuevo producto</button></div>
  <div class="kpis">${kpi('Productos',all.length)}${kpi('Valor del inventario (costo)',money(invCost),'accent')}${kpi('Valor a precio de venta',money(invSale),'good')}${kpi('Por surtir',low,low?'warn':'',low?'stock en el mínimo o menos':'todo en orden')}</div>
  <div class="row"><input type="search" id="iq" data-bind="iq" data-live="1" placeholder="Buscar por nombre, categoría o proveedor" value="${esc(fv('iq'))}" style="flex:1;min-width:200px" aria-label="Buscar">
    <select id="icat" data-bind="icat" data-redraw="1" style="width:auto" aria-label="Categoría"><option>Todas</option>${cats().map(c=>`<option ${c===cat?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
  ${!all.length?`<div class="card empty">Todavía no tienes productos.<br><br><button class="btn" data-act="pedit" data-id="">Agregar el primero</button> <button class="btn sec" data-act="seed">Cargar productos de ejemplo</button></div>`:
  `<div class="tw"><table><thead><tr><th>Producto</th><th>Proveedor</th><th class="r">Stock</th><th class="r">Costo</th><th class="r">Precio</th><th class="r">Margen</th><th></th></tr></thead><tbody>
  ${list.map(p=>{const c=cost(p.id),s=num(p.stock),m=minOf(p.id),lowp=s<=m;return `<tr>
    <td><b>${esc(p.name)}</b><div class="small muted">${esc(p.category||'')}${p.active===false?' · oculto en catálogo':''}${onOffer(p)?' · <span class="pill good">oferta '+money(p.offer)+'</span>':''}</div></td>
    <td>${esc(supOf(p.id))||'<span class="muted">—</span>'}</td>
    <td class="r num ${s<=0?'bad-t':''}">${qtyf(s)} ${esc(p.unit||'')}${lowp?` <span class="pill ${s<=0?'bad':'warn'}">${s<=0?'agotado':'bajo'}</span>`:''}</td>
    <td class="r num">${money(c)}</td><td class="r num">${money(p.price)}</td>
    <td class="r num ${marginPct(num(p.price),c)<15?'bad-t':''}">${marginPct(num(p.price),c)}%</td>
    <td class="r" style="white-space:nowrap"><button class="btn sec sm" data-act="entry" data-id="${esc(p.id)}">+ Entrada</button> <button class="btn sec sm" data-act="pedit" data-id="${esc(p.id)}">Editar</button></td></tr>`;}).join('')}
  </tbody></table></div>`}
  </div>`;
}
function productModal(id){
  const p=id?S.products[id]:null, c=id?(S.costs[id]||{}):{};
  const sups=suppliers();
  openModal(p?'Editar producto':'Nuevo producto', `
  <datalist id="dl_cat">${allCats().map(x=>`<option value="${esc(x)}">`).join('')}</datalist>
  <datalist id="dl_sup">${sups.map(x=>`<option value="${esc(x.name)}">`).join('')}</datalist>
  <div class="form">
    <label class="f full">Nombre<input type="text" id="f_name" value="${esc(p?.name||'')}"></label>
    <label class="f">Categoría<input type="text" id="f_cat" list="dl_cat" value="${esc(p?.category||'')}"></label>
    <label class="f">Proveedor<input type="text" id="f_sup" list="dl_sup" value="${esc(c.supplier||'')}"></label>
    <label class="f">Unidad<input type="text" id="f_unit" value="${esc(p?.unit||'pza')}" placeholder="pza, m, kg, caja"></label>
    <label class="f">Stock actual<input type="number" step="any" id="f_stock" value="${esc(p?num(p.stock):0)}"></label>
    <label class="f">Stock mínimo (avisar al llegar)<input type="number" step="any" id="f_min" value="${esc(num(c.min))}"></label>
    <label class="f">Costo de compra<input type="number" step="any" min="0" id="f_cost" value="${esc(num(c.cost))}"></label>
    <label class="f">Precio de venta<input type="number" step="any" min="0" id="f_price" value="${esc(p?num(p.price):0)}"></label>
    <label class="f">Precio de oferta (opcional)<input type="number" step="any" min="0" id="f_offer" value="${esc(p&&num(p.offer)?num(p.offer):'')}"></label>
    <label class="f full">Descripción para el catálogo (opcional)<input type="text" id="f_desc" value="${esc(p?.desc||'')}"></label>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="f_active" ${p&&p.active===false?'':'checked'} style="width:auto"> Mostrar en el catálogo web</label>
  </div>
  <div class="row" style="justify-content:space-between">${p?`<button class="btn bad" data-act="pdelete" data-id="${esc(id)}">Eliminar</button>`:'<span></span>'}<div class="row"><button class="btn sec" data-act="mclose">Cancelar</button><button class="btn" data-act="psave" data-id="${esc(id||'')}">Guardar</button></div></div>`);
}
async function saveProduct(id){
  const g=i=>$('#'+i).value.trim();
  const name=g('f_name'); if(!name) return toast('Falta el nombre del producto');
  const pid=id||S.db.collection('products').doc().id;
  const pub={name,category:g('f_cat')||'General',unit:g('f_unit')||'pza',price:num(g('f_price')),offer:num(g('f_offer')),stock:num(g('f_stock')),desc:g('f_desc'),active:$('#f_active').checked};
  const priv={cost:num(g('f_cost')),supplier:g('f_sup'),min:num(g('f_min'))};
  await safe(async()=>{
    await S.db.doc('products/'+pid).set(pub);
    await S.db.doc(PRIV+'/costs/'+pid).set(priv);
    S.products[pid]={id:pid,...pub}; S.costs[pid]={id:pid,...priv};
    closeModal(); toast('Producto guardado'); render();
  });
}
function entryModal(id){
  const p=S.products[id]; if(!p) return;
  openModal('Entrada de mercancía', `<p><b>${esc(p.name)}</b><br><span class="muted">Stock actual: ${qtyf(num(p.stock))} ${esc(p.unit||'')}</span></p>
  <div class="form"><label class="f">Cantidad que llegó<input type="number" step="any" min="0" id="e_q" value=""></label>
  <label class="f">Nuevo costo (opcional)<input type="number" step="any" min="0" id="e_c" value="" placeholder="${esc(cost(id))}"></label></div>
  <div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="mclose">Cancelar</button><button class="btn" data-act="entrysave" data-id="${esc(id)}">Sumar al stock</button></div>`);
}
async function saveEntry(id){
  const q=num($('#e_q').value); if(q<=0) return toast('Escribe la cantidad');
  const c=$('#e_c').value.trim(); const p=S.products[id];
  await safe(async()=>{
    const ns=num(p.stock)+q; await S.db.doc('products/'+id).update({stock:ns}); p.stock=ns;
    if(c!==''){ const cur=S.costs[id]||{}; const nc={...cur,cost:num(c)}; delete nc.id; await S.db.doc(PRIV+'/costs/'+id).set(nc); S.costs[id]={id,...nc}; }
    closeModal(); toast('Stock actualizado'); render();
  });
}
async function deleteProduct(id){
  ask('¿Eliminar este producto del inventario y del catálogo?', ()=>safe(async()=>{
    await S.db.doc('products/'+id).delete(); await S.db.doc(PRIV+'/costs/'+id).delete();
    delete S.products[id]; delete S.costs[id]; toast('Producto eliminado'); render();
  }));
}
const SEED=[
 ['Martillo de uña 16 oz','Herramientas','pza',95,160,12,3,'Truper'],
 ['Desarmador plano 1/4"','Herramientas','pza',28,55,20,5,'Truper'],
 ['Pinza de presión 10"','Herramientas','pza',110,189,6,2,'Truper'],
 ['Tubo PVC hidráulico 1/2" (6 m)','Plomería','pza',72,119,15,5,'Plomería del Centro'],
 ['Llave mezcladora lavabo','Plomería','pza',380,590,4,2,'Plomería del Centro'],
 ['Cinta teflón','Plomería','pza',6,15,60,15,'Plomería del Centro'],
 ['Cable calibre 12 (metro)','Electricidad','m',9,16,200,50,'Eléctrica Norte'],
 ['Foco LED 9W','Electricidad','pza',18,39,40,12,'Eléctrica Norte'],
 ['Apagador sencillo','Electricidad','pza',14,32,25,8,'Eléctrica Norte'],
 ['Pintura vinílica blanca 19 L','Pintura','pza',890,1390,5,2,'Pinturas Express'],
 ['Brocha 4"','Pintura','pza',32,69,18,6,'Pinturas Express'],
 ['Tornillo para madera 1-1/2" (caja 100)','Tornillería','caja',38,75,30,10,'Tornillos y Más'],
 ['Taquete plástico 1/4" (bolsa 50)','Tornillería','bolsa',20,45,22,8,'Tornillos y Más'],
 ['Cemento gris 50 kg','Construcción','saco',185,245,40,15,'Materiales Rivera'],
 ['Candado de acero 40 mm','Seguridad','pza',55,110,10,4,'Truper']
];
async function seed(){
  await safe(async()=>{
    for(const r of SEED){
      const id=S.db.collection('products').doc().id;
      const pub={name:r[0],category:r[1],unit:r[2],price:r[4],offer:0,stock:r[5],desc:'',active:true};
      await S.db.doc('products/'+id).set(pub); await S.db.doc(PRIV+'/costs/'+id).set({cost:r[3],min:r[6],supplier:r[7]});
      S.products[id]={id,...pub}; S.costs[id]={id,cost:r[3],min:r[6],supplier:r[7]};
    }
    toast('Productos de ejemplo cargados. Puedes editarlos o eliminarlos.'); render();
  });
}

/* ---------- Pedido a proveedores ---------- */
function avgDaily(days=30){
  const es=entriesIn(days); const m={};
  const first=Object.keys(S.sales).sort()[0]; if(!first) return m;
  const span=Math.max(1,Math.min(days,Math.round((new Date(dayKey()+'T12:00:00')-new Date(first+'T12:00:00'))/864e5)+1));
  es.forEach(e=>e.items.forEach(i=>{ m[i.pid]=(m[i.pid]||0)+num(i.qty); }));
  Object.keys(m).forEach(k=>m[k]/=span);
  return m;
}
function orderLines(){
  const avg=avgDaily(30), L=[];
  prods().forEach(p=>{
    const s=num(p.stock), m=minOf(p.id);
    if(s<=m){
      const target=Math.max(m*2, Math.ceil((avg[p.id]||0)*14), 1);
      const sug=Math.max(1,Math.ceil(target-s));
      const sel=S.orderSel[p.id]||(S.orderSel[p.id]={on:true,qty:sug});
      L.push({key:'a'+p.id,pid:p.id,name:p.name,unit:p.unit||'',supplier:supOf(p.id)||'Sin proveedor',qty:sel.qty,on:sel.on,cost:cost(p.id),auto:true,stock:s});
    }
  });
  Object.values(S.extras).forEach(x=>{
    const p=x.pid?S.products[x.pid]:null;
    L.push({key:'x'+x.id,id:x.id,pid:x.pid||'',name:x.name,unit:p?.unit||x.unit||'',supplier:x.supplier||(x.pid?supOf(x.pid):'')||'Sin proveedor',qty:num(x.qty),on:true,cost:x.pid?cost(x.pid):num(x.cost),auto:false});
  });
  return L;
}
function orderText(sup,lines){
  const d=new Date().toLocaleDateString('es-MX',{day:'numeric',month:'long',year:'numeric'});
  let t=`Pedido ${sup&&sup!=='Sin proveedor'?'para '+sup:''} – ${d}\n`;
  lines.forEach(l=>{ t+=`• ${qtyf(l.qty)} ${l.unit} ${l.name}\n`; });
  t+=`\nGracias.`; return t;
}
function tabPedido(){
  const L=orderLines(); const groups={};
  L.forEach(l=>{ (groups[l.supplier]=groups[l.supplier]||[]).push(l); });
  const names=Object.keys(groups).sort((a,b)=>a==='Sin proveedor'?1:b==='Sin proveedor'?-1:a.localeCompare(b));
  const sup=Object.fromEntries(suppliers().map(s=>[s.name,s]));
  const grand=L.filter(l=>l.on).reduce((s,l)=>s+l.qty*l.cost,0);
  return `<div class="stack">
  <div class="row"><h2 class="grow">Pedido a proveedores</h2><button class="btn sec" data-act="supmgr">Proveedores</button><button class="btn" data-act="extra">+ Agregar producto a la lista</button></div>
  <div class="small muted">Aquí aparecen los productos que llegaron a su stock mínimo (cantidad sugerida según tus ventas) y los que agregues a mano. Edita la cantidad o desmarca lo que no quieras pedir.</div>
  ${L.length?`<div class="kpis">${kpi('Artículos a pedir',L.filter(l=>l.on).length)}${kpi('Inversión estimada',money(grand),'accent','al costo registrado')}</div>`:''}
  ${!L.length?`<div class="card empty">No hay nada por pedir. Los productos aparecerán aquí cuando lleguen a su stock mínimo. También puedes agregar uno manualmente.</div>`:
  names.map(n=>{const g=groups[n],on=g.filter(l=>l.on);const phone=digits((sup[n]||{}).phone);
    const text=orderText(n,on);
    return `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:6px"><h3>${esc(n)}</h3>
      <div class="row"><button class="btn sec sm" data-act="ordcopy" data-s="${esc(n)}">Copiar pedido</button>
      ${phone?`<a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/${phone}?text=${encodeURIComponent(text)}">Enviar por WhatsApp</a>`:`<a class="btn wa sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Enviar por WhatsApp</a>`}</div></div>
      <div class="tw" style="border:0;border-radius:0"><table style="min-width:480px"><tbody>${g.map(l=>`<tr>
      <td style="width:34px">${l.auto?`<input type="checkbox" data-ord="on" data-id="${esc(l.pid)}" ${l.on?'checked':''} aria-label="Incluir ${esc(l.name)}">`:''}</td>
      <td>${esc(l.name)}<div class="small muted">${l.auto?`Stock ${qtyf(l.stock)} · bajo mínimo`:'Agregado a mano'}</div></td>
      <td class="r" style="width:150px">${l.auto?`<input type="number" step="any" min="0" id="oq_${esc(l.pid)}" data-ord="qty" data-id="${esc(l.pid)}" value="${esc(l.qty)}" style="width:80px;text-align:right">`:`<span class="num">${qtyf(l.qty)}</span>`} ${esc(l.unit)}</td>
      <td class="r num muted" style="width:100px">${money(l.qty*l.cost)}</td>
      <td class="r" style="width:50px">${l.auto?'':`<button class="btn sec sm" data-act="extradel" data-id="${esc(l.id)}" aria-label="Quitar">✕</button>`}</td></tr>`).join('')}</tbody></table></div></div>`;}).join('')}
  </div>`;
}
function extraModal(){
  openModal('Agregar a la lista de pedido', `<datalist id="dl_p">${prods().map(p=>`<option value="${esc(p.name)}">`).join('')}</datalist>
  <div class="form"><label class="f full">Producto (elige uno de tu inventario o escribe uno nuevo)<input type="text" id="x_name" list="dl_p"></label>
  <label class="f">Cantidad<input type="number" step="any" min="0" id="x_qty" value="1"></label>
  <label class="f">Proveedor<input type="text" id="x_sup" list="dl_sup2"></label>
  <datalist id="dl_sup2">${suppliers().map(s=>`<option value="${esc(s.name)}">`).join('')}</datalist></div>
  <div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="mclose">Cancelar</button><button class="btn" data-act="extrasave">Agregar</button></div>`);
}
async function saveExtra(){
  const name=$('#x_name').value.trim(); if(!name) return toast('Escribe o elige un producto');
  const qty=num($('#x_qty').value)||1, sup=$('#x_sup').value.trim();
  const p=prods().find(p=>norm(p.name)===norm(name));
  const id=rid();
  const x={name:p?p.name:name,qty,supplier:sup||(p?supOf(p.id):''),pid:p?p.id:'',unit:p?p.unit:''};
  await safe(async()=>{ await S.db.doc(PRIV+'/extras/'+id).set(x); S.extras[id]={id,...x}; closeModal(); render(); });
}
function supModal(){
  const L=suppliers();
  openModal('Proveedores', `<p class="small muted">Agrega el WhatsApp de cada proveedor (con lada, ej. 5215512345678) para mandar el pedido directo.</p>
  <div id="suplist" class="stack" style="gap:8px">${L.map(s=>`<div class="row"><input type="text" class="sn" value="${esc(s.name)}" aria-label="Nombre" style="flex:2;min-width:140px"><input type="tel" class="sp" value="${esc(s.phone||'')}" placeholder="WhatsApp" aria-label="WhatsApp" style="flex:1;min-width:120px"></div>`).join('')}</div>
  <button class="btn sec sm" data-act="supadd" style="align-self:flex-start">+ Otro proveedor</button>
  <div class="row" style="justify-content:flex-end"><button class="btn sec" data-act="mclose">Cancelar</button><button class="btn" data-act="supsave">Guardar</button></div>`);
}
async function saveSuppliers(){
  const rows=[...document.querySelectorAll('#suplist .row')].map(r=>({name:r.querySelector('.sn').value.trim(),phone:r.querySelector('.sp').value.trim()})).filter(s=>s.name);
  await safe(async()=>{ await S.db.doc(PRIV+'/meta/main').set({suppliers:rows}); S.meta={suppliers:rows}; closeModal(); toast('Proveedores guardados'); render(); });
}

/* ---------- Análisis ---------- */
function tabAnalisis(){
  const P=S.period, es=entriesIn(P), t=totals(es);
  const per={}, byCat={}, byDow=Array(7).fill(0), byDay={}, pairs={};
  es.forEach(e=>{
    byDay[e.day]=(byDay[e.day]||0)+num(e.total);
    byDow[new Date(e.day+'T12:00:00').getDay()]+=num(e.total);
    const ids=[...new Set(e.items.map(i=>i.pid))];
    e.items.forEach(i=>{
      const r=per[i.pid]||(per[i.pid]={pid:i.pid,name:i.name,units:0,rev:0,cost:0});
      r.units+=num(i.qty); r.rev+=num(i.qty)*num(i.price); r.cost+=num(i.qty)*num(i.cost); r.name=(S.products[i.pid]||{}).name||i.name;
      const c=(S.products[i.pid]||{}).category||'Otros'; byCat[c]=(byCat[c]||0)+num(i.qty)*num(i.price);
    });
    for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){ const k=[ids[a],ids[b]].sort().join('|'); pairs[k]=(pairs[k]||0)+1; }
  });
  const rows=Object.values(per);
  const topUnits=[...rows].sort((a,b)=>b.units-a.units).slice(0,8);
  const topProfit=[...rows].sort((a,b)=>(b.rev-b.cost)-(a.rev-a.cost)).slice(0,8);
  const sold=new Set(rows.map(r=>r.pid));
  const dead=prods().filter(p=>num(p.stock)>0&&!sold.has(p.id)).sort((a,b)=>num(b.stock)*cost(b.id)-num(a.stock)*cost(a.id));
  const deadCap=dead.reduce((s,p)=>s+num(p.stock)*cost(p.id),0);
  const avg=avgDaily(P||90);
  const cover=prods().filter(p=>avg[p.id]>0).map(p=>({p,days:Math.floor(Math.max(0,num(p.stock))/avg[p.id]),wk:avg[p.id]*7})).filter(x=>x.days<=10).sort((a,b)=>a.days-b.days).slice(0,8);
  const lowM=rows.map(r=>({r,p:S.products[r.pid]})).filter(x=>x.p&&marginPct(num(x.p.price),cost(x.p.id))<15).slice(0,5);
  const pairList=Object.entries(pairs).filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,n])=>{const [a,b]=k.split('|');return {a:(S.products[a]||{}).name,b:(S.products[b]||{}).name,n};}).filter(x=>x.a&&x.b);
  const bestDow=byDow.indexOf(Math.max(...byDow));
  const recs=[];
  cover.slice(0,4).forEach(x=>recs.push(`<b>${esc(x.p.name)}</b>: vendes cerca de ${qtyf(Math.round(x.wk*10)/10)} por semana y el stock alcanza para ${x.days} día${x.days===1?'':'s'}. Conviene pedirlo pronto.`));
  if(topProfit[0]) recs.push(`<b>${esc(topProfit[0].name)}</b> es tu producto que más ganancia deja (${money(topProfit[0].rev-topProfit[0].cost)}). Procura no quedarte sin él.`);
  if(dead.length) recs.push(`Tienes ${dead.length} producto${dead.length===1?'':'s'} sin ventas en este periodo, con ${money(deadCap)} de dinero parado. Considera ponerlos en oferta o dejar de resurtirlos.`);
  lowM.forEach(x=>recs.push(`<b>${esc(x.p.name)}</b> se vende con margen de solo ${marginPct(num(x.p.price),cost(x.p.id))}%. Revisa su precio o su costo.`));
  pairList.slice(0,2).forEach(x=>recs.push(`Clientes llevan juntos <b>${esc(x.a)}</b> y <b>${esc(x.b)}</b> (${x.n} veces). Buena idea para un paquete.`));
  if(Math.max(...byDow)>0) recs.push(`Tu mejor día de la semana es ${DOW[bestDow].toLowerCase()}. Asegura el surtido antes de ese día.`);
  const maxCat=Math.max(1,...Object.values(byCat)), catRows=Object.entries(byCat).sort((a,b)=>b[1]-a[1]);
  const maxDow=Math.max(1,...byDow);
  const seg=[[7,'7 días'],[30,'30 días'],[90,'90 días'],[0,'Todo']].map(([v,l])=>`<button data-act="period" data-v="${v}" aria-pressed="${P===v}">${l}</button>`).join('');
  return `<div class="stack">
  <div class="row"><h2 class="grow">Análisis de ventas</h2><div class="seg" role="group" aria-label="Periodo">${seg}</div></div>
  ${!es.length?`<div class="card empty">Todavía no hay ventas en este periodo. Registra ventas en la sección Ventas y aquí verás qué se vende más, qué no se mueve y qué conviene pedir.</div>`:`
  <div class="kpis">${kpi('Total vendido',money(t.sold),'accent',`${t.count} ventas`)}${kpi('Total invertido (costo)',money(t.cost))}${kpi('Ganancia',money(t.sold-t.cost),'good',t.sold?`margen ${Math.round((t.sold-t.cost)/t.sold*100)}%`:'')}${kpi('Ticket promedio',money(t.count?t.sold/t.count:0))}</div>
  <div class="card"><h3>Qué te conviene hacer</h3><ul class="rec">${recs.map(r=>`<li>${r}</li>`).join('')||'<li>Sigue registrando ventas para obtener recomendaciones.</li>'}</ul></div>
  <div class="card"><h3>Ventas por día</h3>${dayChart(byDay,P)}</div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    <div class="card"><h3>Más vendidos (piezas)</h3>${simpleTable(topUnits.map(r=>[esc(r.name),qtyf(r.units),money(r.rev)]),['Producto','Piezas','Vendido'])}</div>
    <div class="card"><h3>Los que más ganancia dejan</h3>${simpleTable(topProfit.map(r=>[esc(r.name),money(r.rev-r.cost),Math.round(r.rev?(r.rev-r.cost)/r.rev*100:0)+'%']),['Producto','Ganancia','Margen'])}</div>
  </div>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    <div class="card"><h3>Ventas por categoría</h3><div class="bars">${catRows.map(([c,v])=>`<div class="b"><span>${esc(c)}</span><div class="t"><i style="width:${v/maxCat*100}%"></i></div><span class="num">${money(v)}</span></div>`).join('')}</div></div>
    <div class="card"><h3>Ventas por día de la semana</h3><div class="bars">${[1,2,3,4,5,6,0].map(d=>`<div class="b"><span>${DOW[d]}</span><div class="t"><i style="width:${byDow[d]/maxDow*100}%"></i></div><span class="num">${money(byDow[d])}</span></div>`).join('')}</div></div>
  </div>
  ${cover.length?`<div class="card"><h3>Por agotarse según tu ritmo de ventas</h3>${simpleTable(cover.map(x=>[esc(x.p.name),qtyf(num(x.p.stock)),x.days+' días']),['Producto','Stock','Alcanza para'])}</div>`:''}
  ${dead.length?`<div class="card"><h3>Sin movimiento en el periodo</h3><div class="small muted" style="margin-bottom:8px">Dinero parado: <b>${money(deadCap)}</b></div>${simpleTable(dead.slice(0,10).map(p=>[esc(p.name),qtyf(num(p.stock)),money(num(p.stock)*cost(p.id))]),['Producto','Stock','Invertido'])}</div>`:''}
  ${pairList.length?`<div class="card"><h3>Se compran juntos (ideas para paquetes)</h3>${simpleTable(pairList.map(x=>[esc(x.a)+' + '+esc(x.b),x.n+' veces']),['Combinación','Frecuencia'])}</div>`:''}`}
  </div>`;
}
function simpleTable(rows,head){
  return `<div class="tw" style="border:0"><table style="min-width:0"><thead><tr>${head.map((h,i)=>`<th class="${i?'r':''}">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${i?'r num':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function dayChart(byDay,P){
  const n=Math.min(P||30,30)||30, days=[]; for(let i=n-1;i>=0;i--) days.push(addDays(dayKey(),-i));
  const vals=days.map(d=>byDay[d]||0), max=Math.max(1,...vals);
  const W=700,H=190,L=44,B=24,Tp=10, bw=(W-L)/days.length;
  const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v)));const m=v/p;return (m<=1?1:m<=2?2:m<=5?5:10)*p;};
  const top=nice(max);
  let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Ventas diarias de los últimos ${n} días">`;
  [0,.5,1].forEach(f=>{const y=Tp+(H-B-Tp)*(1-f);s+=`<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${L-6}" y="${y+4}" text-anchor="end">${money(top*f).replace(/\.00$/,'')}</text>`;});
  days.forEach((d,i)=>{const h=(H-B-Tp)*vals[i]/top,x=L+i*bw;s+=`<rect x="${x+1.5}" y="${H-B-h}" width="${Math.max(2,bw-3)}" height="${h}" rx="2" fill="var(--accent)"><title>${fmtDay(d)}: ${money(vals[i])}</title></rect>`;
    if(i%Math.ceil(days.length/7)===0) s+=`<text x="${x+bw/2}" y="${H-6}" text-anchor="middle">${d.slice(8)}/${d.slice(5,7)}</text>`;});
  return s+'</svg>';
}

/* ---------- Tienda web ---------- */
function tabTienda(){
  const c=S.config, pk=Object.values(S.packages).sort((a,b)=>a.name.localeCompare(b.name));
  const offers=prods().filter(onOffer);
  return `<div class="stack">
  <h2>Tienda web</h2>
  <div class="card"><h3>Datos de la tienda</h3>
    <div class="form"><label class="f">Nombre de la ferretería<input type="text" id="c_name" value="${esc(c.name||'')}"></label>
    <label class="f">WhatsApp para recibir pedidos<input type="tel" id="c_wa" value="${esc(c.whatsapp||'')}" placeholder="5215512345678"></label>
    <label class="f full">Frase corta (aparece bajo el nombre)<input type="text" id="c_tag" value="${esc(c.tagline||'')}" placeholder="Todo para tu obra y tu hogar"></label></div>
    <div class="small muted" style="margin:8px 0">Escribe el número con código de país y sin espacios. Para México: 52 y luego 10 dígitos. Si usas 521, WhatsApp lo acepta igual.</div>
    <button class="btn" data-act="cfgsave">Guardar datos</button></div>
  <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:8px"><h3 style="margin:0">Paquetes completos</h3><button class="btn" data-act="pkedit" data-id="">+ Nuevo paquete</button></div>
    ${pk.length?`<div class="tw" style="border:0"><table><thead><tr><th>Paquete</th><th class="r">Precio</th><th class="r">Ahorro</th><th class="r">Disponibles</th><th></th></tr></thead><tbody>${pk.map(k=>{const i=pkgInfo(k);return `<tr><td><b>${esc(k.name)}</b><div class="small muted">${i.items.map(x=>qtyf(x.qty)+'× '+esc(x.p.name)).join(', ')}${k.active===false?' · oculto':''}</div></td><td class="r num">${money(k.price)}</td><td class="r num">${money(Math.max(0,i.save))}</td><td class="r num">${i.max}</td><td class="r"><button class="btn sec sm" data-act="pkedit" data-id="${esc(k.id)}">Editar</button></td></tr>`;}).join('')}</tbody></table></div>`:'<div class="muted">Aún no tienes paquetes. Arma kits como “Kit para pintar un cuarto” o “Instalación de lavabo”.</div>'}</div>
  <div class="card"><h3>Ofertas activas</h3>${offers.length?offers.map(p=>`<div class="line"><span>${esc(p.name)}</span><span class="num"><s class="muted">${money(p.price)}</s> <b>${money(p.offer)}</b> <button class="btn sec sm" data-act="pedit" data-id="${esc(p.id)}">Editar</button></span></div>`).join(''):'<div class="muted">Para crear una oferta, edita un producto en Inventario y escribe un precio de oferta menor al normal.</div>'}</div>
  <div class="card"><h3>Compartir con clientes</h3><div class="small">Tus clientes entran a la página principal del sitio (la que no dice “admin”). Ven productos, paquetes y ofertas, y arman su pedido que se les abre listo para enviar a tu WhatsApp. Nunca ven tus costos ni tus ventas.</div>
    <div class="row" style="margin-top:12px"><a class="btn sec" href="../" target="_blank" rel="noopener">Abrir catálogo</a><button class="btn" data-act="pdf">Descargar catálogo en PDF</button><button class="btn sec" data-act="pdfshare">Compartir PDF</button></div>
    <div class="small muted" style="margin-top:8px">El PDF incluye los productos con stock, los paquetes y las ofertas de este momento, con tu número de WhatsApp.</div></div>
  </div>`;
}
async function saveConfig(){
  const cfg={name:$('#c_name').value.trim(),whatsapp:$('#c_wa').value.trim(),tagline:$('#c_tag').value.trim()};
  await safe(async()=>{ await S.db.doc('config/store').set(cfg); S.config=cfg; toast('Datos guardados'); render(); });
}
function pkgModal(id){
  const k=id?S.packages[id]:null;
  S.pkgDraft={id:id||'',name:k?.name||'',desc:k?.desc||'',price:k?num(k.price):'',active:k?k.active!==false:true,items:(k?.items||[{pid:'',qty:1}]).map(x=>({...x}))};
  openModal(k?'Editar paquete':'Nuevo paquete','<div id="pkbody"></div>');
  drawPkg();
}
function collectPkg(){
  const d=S.pkgDraft; if(!d||!$('#pk_name')) return;
  d.name=$('#pk_name').value; d.desc=$('#pk_desc').value; d.price=$('#pk_price').value; d.active=$('#pk_active').checked;
  document.querySelectorAll('#pkitems .row').forEach((r,i)=>{ d.items[i]={pid:r.querySelector('select').value,qty:r.querySelector('input').value}; });
}
function drawPkg(){
  const d=S.pkgDraft; const opts=prods().sort((a,b)=>a.name.localeCompare(b.name));
  const normal=d.items.reduce((s,x)=>{const p=S.products[x.pid];return s+(p?unitPrice(p)*(num(x.qty)||1):0);},0);
  $('#pkbody').innerHTML=`<div class="form">
    <label class="f full">Nombre del paquete<input type="text" id="pk_name" value="${esc(d.name)}" placeholder="Kit para pintar un cuarto"></label>
    <label class="f full">Descripción (opcional)<input type="text" id="pk_desc" value="${esc(d.desc)}"></label>
    <div class="full"><div class="small muted" style="margin-bottom:6px">Productos incluidos</div><div id="pkitems" class="stack" style="gap:8px">
    ${d.items.map((x,i)=>`<div class="row"><select style="flex:3;min-width:160px" aria-label="Producto"><option value="">Elige un producto…</option>${opts.map(p=>`<option value="${esc(p.id)}" ${p.id===x.pid?'selected':''}>${esc(p.name)} (${money(unitPrice(p))})</option>`).join('')}</select>
    <input type="number" step="any" min="0" value="${esc(x.qty)}" aria-label="Cantidad" style="width:80px"><button class="btn sec sm" data-act="pkrm" data-i="${i}" aria-label="Quitar">✕</button></div>`).join('')}</div>
    <button class="btn sec sm" data-act="pkadd" style="margin-top:8px">+ Agregar producto</button></div>
    <label class="f">Precio del paquete<input type="number" step="any" min="0" id="pk_price" value="${esc(d.price)}"></label>
    <div class="f">Suma de precios sueltos<div class="num" style="font-size:20px;color:var(--ink);font-weight:600;padding-top:6px">${money(normal)}</div></div>
    <label class="f full" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="pk_active" ${d.active?'checked':''} style="width:auto"> Mostrar en el catálogo web</label></div>
    <div class="row" style="justify-content:space-between;margin-top:12px">${d.id?`<button class="btn bad" data-act="pkdel">Eliminar</button>`:'<span></span>'}<div class="row"><button class="btn sec" data-act="mclose">Cancelar</button><button class="btn" data-act="pksave">Guardar</button></div></div>`;
}
async function savePkg(){
  collectPkg(); const d=S.pkgDraft;
  const items=d.items.filter(x=>x.pid&&S.products[x.pid]).map(x=>({pid:x.pid,qty:num(x.qty)||1}));
  if(!d.name.trim()) return toast('Falta el nombre del paquete');
  if(!items.length) return toast('Agrega al menos un producto');
  if(num(d.price)<=0) return toast('Escribe el precio del paquete');
  const id=d.id||rid(); const doc={name:d.name.trim(),desc:d.desc.trim(),price:num(d.price),active:d.active,items};
  await safe(async()=>{ await S.db.doc('packages/'+id).set(doc); S.packages[id]={id,...doc}; closeModal(); toast('Paquete guardado'); render(); });
}

/* ---------- modal ---------- */
function openModal(title,html){ $('#mt').textContent=title; $('#mb').innerHTML=html; $('#modal').classList.remove('hidden'); const f=$('#mb input,#mb select'); if(f&&!f.matches('[type=date]')) setTimeout(()=>f.focus(),30); }
function closeModal(){ $('#modal').classList.add('hidden'); $('#mb').innerHTML=''; S.pkgDraft=null; }
async function copyText(t){
  try{ await navigator.clipboard.writeText(t); toast('Copiado'); }
  catch(_){ openModal('Copia el pedido',`<textarea id="cp" style="min-height:200px">${esc(t)}</textarea>`); $('#cp').select(); }
}

/* ---------- eventos ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]'); if(!b) return;
  const a=b.dataset.act, id=b.dataset.id, k=b.dataset.k;
  switch(a){
    case 'tab': S.tab=k; render(); window.scrollTo(0,0); break;
    case 'login': doLogin(); break;
    case 'logout': S.sb.auth.signOut().then(()=>location.reload()); break;
    case 'pdf': safe(()=>downloadCatalogPdf(false)); break;
    case 'pdfshare': safe(()=>downloadCatalogPdf(true)); break;
    case 'install': installApp(); break;
    case 'mclose': closeModal(); break;
    /* catálogo */
    case 'ccat': S.form.ccat=k; render(); break;
    case 'cinc': cartChange('i',id,1); break;
    case 'cdec': cartChange('i',id,-1); break;
    case 'pinc': cartChange('p',id,1); break;
    case 'pdec': cartChange('p',id,-1); break;
    case 'copen': S.cartOpen=true; renderDrawer(); break;
    case 'cclose': S.cartOpen=false; renderDrawer(); break;
    case 'cclear': S.cart={items:{},pkgs:{}}; S.cartOpen=false; renderDrawer(); render(); break;
    /* ventas */
    case 'dayshift': S.saleDay=addDays(S.saleDay,+b.dataset.n); render(); break;
    case 'daytoday': S.saleDay=dayKey(); render(); break;
    case 'saleadd': { const p=S.products[id]; const ex=S.saleCart.find(l=>l.pid===id); if(ex) ex.qty=num(ex.qty)+1; else S.saleCart.push({pid:id,name:p.name,qty:1,price:unitPrice(p),cost:cost(id)}); S.form.sq=''; render(); break; }
    case 'saledel': S.saleCart.splice(+b.dataset.i,1); render(); break;
    case 'salecancel': S.saleCart=[]; render(); break;
    case 'salesave': saveSale(); break;
    case 'entrydel': deleteSale(id); break;
    /* inventario */
    case 'pedit': productModal(id); break;
    case 'psave': saveProduct(id); break;
    case 'pdelete': closeModal(); deleteProduct(id); break;
    case 'entry': entryModal(id); break;
    case 'entrysave': saveEntry(id); break;
    case 'seed': seed(); break;
    /* pedido */
    case 'extra': extraModal(); break;
    case 'extrasave': saveExtra(); break;
    case 'extradel': safe(async()=>{ await S.db.doc(PRIV+'/extras/'+id).delete(); delete S.extras[id]; render(); }); break;
    case 'supmgr': supModal(); break;
    case 'supadd': { const r=document.createElement('div'); r.className='row'; r.innerHTML='<input type="text" class="sn" placeholder="Nombre del proveedor" aria-label="Nombre" style="flex:2;min-width:140px"><input type="tel" class="sp" placeholder="WhatsApp" aria-label="WhatsApp" style="flex:1;min-width:120px">'; $('#suplist').appendChild(r); r.querySelector('input').focus(); break; }
    case 'supsave': saveSuppliers(); break;
    case 'ordcopy': { const g=orderLines().filter(l=>l.supplier===b.dataset.s&&l.on); copyText(orderText(b.dataset.s,g)); break; }
    /* análisis */
    case 'period': S.period=+b.dataset.v; render(); break;
    /* tienda */
    case 'cfgsave': saveConfig(); break;
    case 'pkedit': pkgModal(id); break;
    case 'pkadd': collectPkg(); S.pkgDraft.items.push({pid:'',qty:1}); drawPkg(); break;
    case 'pkrm': collectPkg(); S.pkgDraft.items.splice(+b.dataset.i,1); if(!S.pkgDraft.items.length) S.pkgDraft.items.push({pid:'',qty:1}); drawPkg(); break;
    case 'pksave': savePkg(); break;
    case 'pkdel': { const pid=S.pkgDraft.id; closeModal(); ask('¿Eliminar este paquete?',()=>safe(async()=>{ await S.db.doc('packages/'+pid).delete(); delete S.packages[pid]; render(); })); break; }
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.bind){ S.form[t.dataset.bind]=t.value; if(t.dataset.live) schedule(); if(S.cartOpen && ['cname','caddr','cnotes'].includes(t.dataset.bind)){ const a=$('#wa-send'); if(a) a.href=waHref(); } }
  if(t.dataset.sl){ const l=S.saleCart[+t.dataset.i]; if(l) l[t.dataset.sl]=t.value; }
  if(t.dataset.ord==='qty'){ (S.orderSel[t.dataset.id]||(S.orderSel[t.dataset.id]={on:true})).qty=num(t.value); }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.chg==='saleday'){ if(t.value){ S.saleDay=t.value; render(); } }
  if(t.dataset.sl) render();
  if(t.dataset.ord==='qty') render();
  if(t.dataset.ord==='on'){ (S.orderSel[t.dataset.id]||(S.orderSel[t.dataset.id]={qty:1})).on=t.checked; render(); }
  if(t.dataset.redraw){ S.form[t.dataset.bind]=t.value; if(t.dataset.bind==='cdeliv') renderDrawer(); else render(); }
});
document.addEventListener('keydown',e=>{ if(e.key==='Enter' && (e.target.id==='lg_pw'||e.target.id==='lg_email')) doLogin(); });
window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); window.__installEvt=e; renderHdr(); });
window.addEventListener('appinstalled',()=>{ window.__installEvt=null; renderHdr(); });
function installApp(){
  if(window.__installEvt){ window.__installEvt.prompt(); window.__installEvt=null; renderHdr(); return; }
  openModal('Instalar la app',`<p>En iPhone: abre esta página en <b>Safari</b>, toca el botón <b>Compartir</b> (cuadro con flecha) y elige <b>Agregar a inicio</b>.</p><p>En Android: abre el menú de Chrome (⋮) y elige <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.</p>`);
}
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ if(!$('#modal').classList.contains('hidden')) closeModal(); else if(S.cartOpen){ S.cartOpen=false; renderDrawer(); } } });

/* ---------- arranque ---------- */
(async function init(){
  renderHdr();
  const cfg=window.FERRETERIA_CONFIG||{};
  if(!cfg.url||/TU[-_]/.test(cfg.url)||!cfg.anonKey||/TU[-_]/.test(cfg.anonKey)){ S.err='Falta conectar la base de datos. Abre config.js y pega la URL y la anon key de tu proyecto de Supabase (ver README).'; render(); return; }
  const timer=setTimeout(()=>{ if(!S.ready){ S.err='No pudimos conectar. Revisa tu conexión e intenta de nuevo.'; render(); } },15000);
  try{
    S.sb=supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true}});
    S.db=makeDb(S.sb);
    route();
    if(APP_MODE==='admin'){
      const { data } = await S.sb.auth.getSession();
      if(data.session){ try{ await enterAdmin(); }catch(e){ S.loginErr=e.message; } }
    } else { startPublic(); }
    S.ready=true; clearTimeout(timer); render();
  }catch(e){ clearTimeout(timer); console.error(e); S.err='No pudimos cargar los datos.'; render(); }
})();
if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register(APP_MODE==='admin'?'../sw.js':'sw.js').catch(()=>{})); }
