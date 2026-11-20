const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let products=[], cart=JSON.parse(sessionStorage.getItem("anyshop-cart")||"[]"), activeFilter="All", currency="BDT";
const money = n => new Intl.NumberFormat("en-BD",{style:"currency",currency,maximumFractionDigits:2}).format(n);
async function api(url, options={}) {
  const res=await fetch(url,{headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||"Something went wrong.");
  return data;
}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function show(id){$("#"+id).classList.add("show")} function hide(id){$("#"+id).classList.remove("show")}
$$("[data-close]").forEach(b=>b.onclick=()=>hide(b.dataset.close));
$$(".overlay").forEach(o=>o.addEventListener("click",e=>{if(e.target===o)hide(o.id)}));
function saveCart(){sessionStorage.setItem("anyshop-cart",JSON.stringify(cart));renderCart()}
function renderProducts(){
 const categories=["All",...new Set(products.map(p=>p.category||"General"))];
 $("#categoryFilters").innerHTML=categories.slice(1).map(c=>`<button class="filter ${activeFilter===c?"active":""}" data-filter="${esc(c)}">${esc(c)}</button>`).join("");
 $$(".filter").forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;$$(".filter").forEach(x=>x.classList.toggle("active",x.dataset.filter===activeFilter));renderProducts()});
 const list=products.filter(p=>activeFilter==="All"||p.category===activeFilter);
 $("#productCount").textContent=`${list.length} lovely ${list.length===1?"find":"finds"} to explore.`;
 $("#products").innerHTML=list.length?list.map(p=>`<article class="product-card"><div class="product-image">${p.image?`<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()">`:`<span class="image-placeholder">${esc((p.name||"A").slice(0,1).toUpperCase())}</span>`}</div><div class="product-info"><div><h3>${esc(p.name)}</h3><p>${esc(p.category||"General")}</p></div><span class="product-price">${money(p.price)}</span></div><button class="add-btn" data-add="${p.id}">ADD TO BAG +</button></article>`).join(""):`<div class="empty-state">No products here just yet. Check back soon.</div>`;
 $$("[data-add]").forEach(b=>b.onclick=()=>add(Number(b.dataset.add)));
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function add(id){const p=products.find(x=>x.id===id);if(!p)return;let line=cart.find(x=>x.id===id);if(line)line.quantity=Math.min(p.stock,line.quantity+1);else cart.push({id,quantity:1});saveCart();toast("Added to your bag ✳")}
function renderCart(){
 const count=cart.reduce((n,x)=>n+x.quantity,0),total=cart.reduce((n,x)=>{const p=products.find(p=>p.id===x.id);return n+(p?p.price*x.quantity:0)},0);
 $("#cartCount").textContent=count;$("#drawerCount").textContent=`(${count})`;$("#cartTotal").textContent=money(total);$("#checkoutTotal").textContent=money(total);
 $("#cartItems").innerHTML=cart.length?cart.map(x=>{const p=products.find(p=>p.id===x.id);return p?`<div class="cart-line"><div><strong>${esc(p.name)}</strong><small>${money(p.price)} each</small><div class="qty-controls"><button data-dec="${p.id}">−</button><span>${x.quantity}</span><button data-inc="${p.id}">+</button><button class="remove" data-rem="${p.id}">Remove</button></div></div><b>${money(p.price*x.quantity)}</b></div>`:""}).join(""):`<div class="empty-state">Your bag is waiting for something lovely.</div>`;
 $$("[data-inc]").forEach(b=>b.onclick=()=>{let x=cart.find(x=>x.id===+b.dataset.inc),p=products.find(p=>p.id===x.id);if(x.quantity<p.stock)x.quantity++;saveCart()});
 $$("[data-dec]").forEach(b=>b.onclick=()=>{let x=cart.find(x=>x.id===+b.dataset.dec);x.quantity--;if(x.quantity<=0)cart=cart.filter(y=>y.id!==x.id);saveCart()});
 $$("[data-rem]").forEach(b=>b.onclick=()=>{cart=cart.filter(x=>x.id!==+b.dataset.rem);saveCart()});
}
async function loadStore(){try{const d=await api("/api/store");products=d.products;currency=d.currency||"BDT";$("#brandName").textContent=d.storeName;$("#footerName").textContent=d.storeName;document.title=d.storeName+" — Discover your next favourite";renderProducts();renderCart()}catch(e){$("#products").innerHTML=`<div class="empty-state">${esc(e.message)}</div>`}}
$("#cartOpen").onclick=()=>show("cartOverlay");
$("#checkoutOpen").onclick=()=>{if(!cart.length)return toast("Your bag is empty.");hide("cartOverlay");show("checkoutOverlay")};
$("#checkoutForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),payload=Object.fromEntries(f);payload.items=cart.map(x=>({id:x.id,quantity:x.quantity}));const btn=e.target.querySelector("button[type=submit]");btn.disabled=true;btn.textContent="Placing order…";try{const d=await api("/api/orders",{method:"POST",body:JSON.stringify(payload)});cart=[];saveCart();e.target.reset();$("#checkoutMessage").innerHTML=`<p class="muted">Thank you! Your order <strong>#${d.orderId}</strong> has been received. ${d.emailConfigured?"The store has been notified by email.":"The order is saved; store email notifications still need SMTP setup."}</p>`;e.target.hidden=true}catch(err){toast(err.message)}finally{btn.disabled=false;btn.textContent="Place my order ↗"}};
$("#adminOpen").onclick=async()=>{show("adminOverlay");try{await api("/api/admin/me");openDashboard()}catch{$("#adminLogin").hidden=false;$("#adminPanel").hidden=true}};
$("#loginForm").onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{await api("/api/admin/login",{method:"POST",body:JSON.stringify(f)});openDashboard()}catch(err){toast(err.message)}};
async function openDashboard(){$("#adminLogin").hidden=true;$("#adminPanel").hidden=false;await loadAdminProducts();loadAdminOrders()}
$("#logout").onclick=async()=>{await api("/api/admin/logout",{method:"POST"});$("#adminPanel").hidden=true;$("#adminLogin").hidden=false;toast("Signed out")};
$$(".admin-tab").forEach(b=>b.onclick=()=>{$$(".admin-tab").forEach(x=>x.classList.toggle("active",x===b));$("#manageProducts").hidden=b.dataset.tab!=="manageProducts";$("#manageOrders").hidden=b.dataset.tab!=="manageOrders"});
function resetProductForm(){$("#productForm").reset();$("#productForm").elements.id.value="";$("#productForm").elements.stock.value=10;$("#productFormTitle").textContent="Add a product"}
$("#cancelEdit").onclick=resetProductForm;
$("#productForm").onsubmit=async e=>{e.preventDefault();const f=e.target,fd=new FormData(f),p=Object.fromEntries(fd);p.price=Number(p.price);p.stock=Number(p.stock);p.active=fd.has("active");const id=p.id;delete p.id;try{await api(id?`/api/admin/products/${id}`:"/api/admin/products",{method:id?"PUT":"POST",body:JSON.stringify(p)});toast("Product saved");resetProductForm();await loadAdminProducts();await loadStore()}catch(err){toast(err.message)}};
async function loadAdminProducts(){const list=await api("/api/admin/products");$("#adminProducts").innerHTML=list.length?list.map(p=>`<div class="admin-row"><div><strong>${esc(p.name)}</strong><small>${money(p.price)} · Stock ${p.stock} · ${p.active?"Visible":"Hidden"}</small></div><div><button data-edit="${p.id}">Edit</button><button data-delete="${p.id}">Delete</button></div></div>`).join(""):`<p class="muted">No products yet. Add your first product above.</p>`;
 $$("[data-edit]").forEach(b=>b.onclick=()=>{const p=list.find(x=>x.id===+b.dataset.edit),f=$("#productForm");for(const k of ["id","name","category","price","description","image","stock"])f.elements[k].value=p[k]??"";f.elements.active.checked=!!p.active;$("#productFormTitle").textContent="Edit product";$("#manageProducts").scrollIntoView({behavior:"smooth"})});
 $$("[data-delete]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this product?")){await api(`/api/admin/products/${b.dataset.delete}`,{method:"DELETE"});await loadAdminProducts();await loadStore();toast("Product deleted")}})}
async function loadAdminOrders(){try{const orders=await api("/api/admin/orders");$("#adminOrders").innerHTML=orders.length?orders.map(o=>`<div class="order-card"><div class="order-top"><strong>Order #${o.id} · ${money(o.total)}</strong><span class="status">${esc(o.status)}</span></div><p>${esc(o.customer_name)} · ${esc(o.email)} · ${esc(o.phone)}<br>${esc(o.address)}<br>${o.items.map(i=>`${esc(i.name)} × ${i.quantity}`).join("<br>")}${o.notes?`<br>Note: ${esc(o.notes)}`:""}</p><label>Update status <select data-status="${o.id}">${["New","Processing","Shipped","Completed","Cancelled"].map(s=>`<option ${s===o.status?"selected":""}>${s}</option>`).join("")}</select></label></div>`).join(""):`<p class="muted">No orders have arrived yet.</p>`;
 $$("[data-status]").forEach(s=>s.onchange=async()=>{await api(`/api/admin/orders/${s.dataset.status}`,{method:"PATCH",body:JSON.stringify({status:s.value})});toast("Order status updated")})}catch(e){$("#adminOrders").textContent=e.message}}
$("#year").textContent=new Date().getFullYear();loadStore();
