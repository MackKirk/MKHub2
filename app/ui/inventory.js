// Simple UI hooked to MKHub /inventory API with bearer auth
(function(){
  const API = {
    products: '/inventory/products',
    lowStock: '/inventory/products/low_stock',
    suppliers: '/inventory/suppliers',
    contacts: (supplierId)=>`/inventory/suppliers/${supplierId}/contacts`,
    contactsRoot: '/inventory/contacts',
    orders: '/inventory/orders',
    orderStatus: (id)=>`/inventory/orders/${id}/status`,
    orderEmailSent: (id)=>`/inventory/orders/${id}/email_sent`,
    orderSendEmail: (id)=>`/inventory/orders/${id}/send-email`,
  };

  function token(){ return MKHubUI.getTokenOrRedirect(); }
  function auth(){ return { Authorization: 'Bearer ' + token() }; }
  function toast(msg){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.style.display='block'; setTimeout(()=>t.style.display='none', 2500); }
  function safe(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); }

  let editingProductId = null;
  let editingSupplierId = null;
  let editingContactId = null;
  let productsCache = [];
  let suppliersCache = [];
  let contactsCache = {};

  // Products
  async function loadProducts(){
    const arr = await fetch(API.products, { headers: auth() }).then(safe);
    productsCache = arr.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    const tbody = document.getElementById('productTable');
    tbody.innerHTML = productsCache.map(p=>`
      <tr>
        <td>${p.id}</td>
        <td>${p.name}</td>
        <td>${p.unit}</td>
        <td>${p.stock_quantity}</td>
        <td>${p.reorder_point}</td>
        <td>
          <button data-act="edit-product" data-id="${p.id}" data-name="${p.name}" data-unit="${p.unit}" data-stock="${p.stock_quantity}" data-reorder="${p.reorder_point}">Edit</button>
          <button data-act="del-product" data-id="${p.id}">Delete</button>
        </td>
      </tr>
    `).join('');
    updateOrderItemSelects();
  }

  async function saveProduct(ev){ ev.preventDefault();
    const body = {
      name: document.getElementById('productName').value.trim(),
      unit: document.getElementById('productUnit').value.trim(),
      stock_quantity: parseInt(document.getElementById('productStock').value||'0'),
      reorder_point: parseInt(document.getElementById('productReorder').value||'0'),
    };
    if (editingProductId){
      await fetch(`${API.products}/${editingProductId}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
      editingProductId = null;
      document.getElementById('submitProductBtn').textContent = 'Add Product';
      document.getElementById('cancelEditBtn').style.display = 'none';
      toast('✅ Product updated');
    } else {
      await fetch(API.products, { method:'POST', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
      toast('✅ Product created');
    }
    ev.target.reset();
    await loadProducts();
    await loadLowStock();
  }

  function handleProductActions(ev){
    const t = ev.target;
    if (t.dataset.act === 'edit-product'){
      document.getElementById('productName').value = t.dataset.name||'';
      document.getElementById('productUnit').value = t.dataset.unit||'';
      document.getElementById('productStock').value = t.dataset.stock||'';
      document.getElementById('productReorder').value = t.dataset.reorder||'';
      editingProductId = t.dataset.id;
      document.getElementById('submitProductBtn').textContent = 'Update Product';
      document.getElementById('cancelEditBtn').style.display = 'inline-block';
    }
    if (t.dataset.act === 'del-product'){
      const id = t.dataset.id;
      if (!confirm('Delete product?')) return;
      fetch(`${API.products}/${id}`, { method:'DELETE', headers: auth() })
        .then(safe)
        .then(async ()=>{ toast('🗑️ Product deleted'); await loadProducts(); await loadLowStock(); })
        .catch(()=>toast('⚠️ Failed to delete product'));
    }
  }

  function cancelEdit(){ editingProductId = null; document.getElementById('productForm').reset(); document.getElementById('submitProductBtn').textContent='Add Product'; document.getElementById('cancelEditBtn').style.display='none'; }

  // Low stock
  async function loadLowStock(){
    const arr = await fetch(API.lowStock, { headers: auth() }).then(safe);
    const tbody = document.getElementById('lowStockTable');
    tbody.innerHTML = arr.map(p=>`<tr><td>${p.id}</td><td>${p.name}</td><td>${p.unit}</td><td>${p.stock_quantity}</td><td>${p.reorder_point}</td></tr>`).join('');
  }

  // Suppliers
  async function loadSuppliers(){
    const arr = await fetch(API.suppliers, { headers: auth() }).then(safe);
    suppliersCache = arr.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
    const tbody = document.getElementById('supplierTable');
    tbody.innerHTML = suppliersCache.map(s=>`
      <tr>
        <td>${s.id}</td><td>${s.name}</td><td>${s.email||'-'}</td>
        <td>
          <button data-act="edit-supplier" data-id="${s.id}" data-name="${s.name}" data-email="${s.email||''}">Edit</button>
          <button data-act="del-supplier" data-id="${s.id}">Delete</button>
        </td>
      </tr>`).join('');
    const datalist = document.getElementById('supplierOptions');
    if (datalist) datalist.innerHTML = suppliersCache.map(s=>`<option value="${s.id} - ${s.name}">`).join('');
    updateContactSupplierSelect();
    await loadContactsTable();
  }

  async function saveSupplier(ev){ ev.preventDefault();
    const rawEmail = document.getElementById('supplierEmail').value.trim();
    const body = { name: document.getElementById('supplierName').value.trim(), email: rawEmail || null };
    if (editingSupplierId){
      await fetch(`${API.suppliers}/${editingSupplierId}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
      editingSupplierId = null; document.getElementById('submitSupplierBtn').textContent='Add Supplier'; document.getElementById('cancelEditSupplierBtn').style.display='none'; toast('✅ Supplier updated');
    } else {
      await fetch(API.suppliers, { method:'POST', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
      toast('✅ Supplier created');
    }
    ev.target.reset();
    await loadSuppliers();
  }

  function handleSupplierActions(ev){
    const t = ev.target;
    if (t.dataset.act === 'edit-supplier'){
      document.getElementById('supplierName').value = t.dataset.name||'';
      document.getElementById('supplierEmail').value = t.dataset.email||'';
      editingSupplierId = t.dataset.id;
      document.getElementById('submitSupplierBtn').textContent='Update Supplier';
      document.getElementById('cancelEditSupplierBtn').style.display='inline-block';
    }
    if (t.dataset.act === 'del-supplier'){
      const id = t.dataset.id;
      if (!confirm('Delete supplier?')) return;
      fetch(`${API.suppliers}/${id}`, { method:'DELETE', headers: auth() })
        .then(safe).then(async ()=>{ toast('🗑️ Supplier deleted'); await loadSuppliers(); })
        .catch(()=>toast('⚠️ Failed to delete supplier'));
    }
  }

  function cancelEditSupplier(){ editingSupplierId=null; document.getElementById('supplierForm').reset(); document.getElementById('submitSupplierBtn').textContent='Add Supplier'; document.getElementById('cancelEditSupplierBtn').style.display='none'; }

  function updateContactSupplierSelect(){
    const sel = document.getElementById('contactSupplierId'); if(!sel) return;
    sel.innerHTML = suppliersCache.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }

  // Contacts
  async function loadContactsTable(){
    const tbody = document.getElementById('contactTable');
    tbody.innerHTML = '';
    for (const s of suppliersCache){
      const arr = await fetch(API.contacts(s.id), { headers: auth() }).then(safe);
      contactsCache[s.id] = (arr||[]).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
      for (const c of contactsCache[s.id]){
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${c.id}</td><td>${c.name}</td><td>${c.email||'-'}</td><td>${c.phone||'-'}</td><td>${s.name}</td>
          <td><button data-act="edit-contact" data-id="${c.id}" data-supplier="${s.id}" data-name="${c.name||''}" data-email="${c.email||''}" data-phone="${c.phone||''}">Edit</button>
          <button data-act="del-contact" data-id="${c.id}">Delete</button></td>`;
        tbody.appendChild(tr);
      }
    }
    const total = Object.values(contactsCache).reduce((n,a)=>n+(a?a.length:0),0);
    if (!total){ const tr=document.createElement('tr'); tr.innerHTML='<td colspan="6" style="text-align:center;color:#666">No contacts</td>'; tbody.appendChild(tr); }
  }

  async function saveContact(ev){ ev.preventDefault();
    const body = {
      supplier_id: document.getElementById('contactSupplierId').value,
      name: document.getElementById('contactName').value,
      email: document.getElementById('contactEmail').value || null,
      phone: document.getElementById('contactPhone').value || null,
    };
    if (editingContactId){
      await fetch(`${API.contactsRoot}/${editingContactId}`, { method:'PUT', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
      toast('✅ Contact updated'); editingContactId=null; document.querySelector('#contactForm button[type="submit"]').textContent='Add Contact'; document.getElementById('cancelEditContactBtn').style.display='none';
    } else {
      await fetch(API.contactsRoot, { method:'POST', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
      toast('✅ Contact added');
    }
    ev.target.reset();
    await loadContactsTable();
  }

  function handleContactActions(ev){
    const t = ev.target;
    if (t.dataset.act === 'edit-contact'){
      document.getElementById('contactSupplierId').value = t.dataset.supplier;
      document.getElementById('contactName').value = t.dataset.name||'';
      document.getElementById('contactEmail').value = t.dataset.email||'';
      document.getElementById('contactPhone').value = t.dataset.phone||'';
      editingContactId = t.dataset.id;
      document.querySelector('#contactForm button[type="submit"]').textContent='Update Contact';
      document.getElementById('cancelEditContactBtn').style.display='inline-block';
    }
    if (t.dataset.act === 'del-contact'){
      const id = t.dataset.id;
      if (!confirm('Delete contact?')) return;
      fetch(`${API.contactsRoot}/${id}`, { method:'DELETE', headers: auth() })
        .then(safe).then(async ()=>{ toast('🗑️ Contact deleted'); await loadContactsTable(); })
        .catch(()=>toast('⚠️ Failed to delete contact'));
    }
  }

  function cancelEditContact(){ editingContactId=null; document.getElementById('contactForm').reset(); document.querySelector('#contactForm button[type="submit"]').textContent='Add Contact'; document.getElementById('cancelEditContactBtn').style.display='none'; }

  // Orders
  function productOptionsHtml(selected){ return productsCache.map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${p.name}</option>`).join(''); }
  function updateOrderItemSelects(){ document.querySelectorAll('#orderItemsTbody select.orderProduct').forEach(sel=>{ const cur=sel.value; sel.innerHTML = productOptionsHtml(cur); sel.value = cur; }); }
  function addOrderItemRow(){ const tr=document.createElement('tr'); tr.innerHTML = `<td><select class="orderProduct">${productOptionsHtml()}</select></td><td><input type="number" class="orderQty" min="1" value="1"></td><td><button type="button" data-act="rm-item">Remove</button></td>`; document.getElementById('orderItemsTbody').appendChild(tr); }

  async function loadOrders(){
    const arr = await fetch(API.orders, { headers: auth() }).then(safe);
    const tbody = document.getElementById('orderTable');
    tbody.innerHTML = arr.map(o=>{
      const sup = suppliersCache.find(s=>String(s.id)===String(o.supplier_id));
      const items = (o.items||[]).map(i=>{ const p=productsCache.find(pp=>String(pp.id)===String(i.product_id)); return `${p?p.name:i.product_id} (x${i.quantity})`; }).join(', ');
      const actions = o.status==='pending'
        ? `<button data-act="order-status" data-id="${o.id}" data-status="delivered">Deliver</button>`+
          `<button data-act="order-status" data-id="${o.id}" data-status="canceled">Cancel</button>`+
          `<button data-act="order-email" data-id="${o.id}">${o.email_sent?'Resend Email':'Send Email'}</button>`
        : `<span class="muted">${o.status}</span>`;
      return `<tr><td>${o.order_code}</td><td>${sup?sup.name:o.supplier_id}</td><td>${o.status}</td><td>${new Date(o.order_date).toLocaleString()}</td><td>${o.delivered_date?new Date(o.delivered_date).toLocaleString():'-'}</td><td>${o.email_sent_date?new Date(o.email_sent_date).toLocaleString():'-'}</td><td>${items}</td><td>${actions}</td></tr>`;
    }).join('');
  }

  async function onOrderSupplierChange(e){
    const raw = (e.target.value||'').trim();
    const supplierId = raw.split(' - ')[0];
    if (!supplierId) return;
    const select = document.getElementById('orderSupplierContactId');
    select.innerHTML = `<option value="">Loading...</option>`;
    const arr = await fetch(API.contacts(supplierId), { headers: auth() }).then(safe);
    contactsCache[supplierId] = arr;
    select.innerHTML = arr.length ? arr.map(c=>`<option value="${c.id}">${c.name} (${c.email||'no email'})</option>`).join('') : `<option value="">-- No contacts --</option>`;
  }

  async function createOrder(ev){ ev.preventDefault();
    const raw = document.getElementById('orderSupplierId').value.trim();
    const supplierId = raw.split(' - ')[0];
    const contactId = document.getElementById('orderSupplierContactId').value || null;
    const rows = Array.from(document.querySelectorAll('#orderItemsTbody tr'));
    if (!rows.length){ alert('Add at least one item'); return; }
    const items = rows.map(r=>({ product_id: r.querySelector('select.orderProduct').value, quantity: parseInt(r.querySelector('input.orderQty').value||'0') }));
    const body = { supplier_id: supplierId, contact_id: contactId, status: 'pending', items };
    await fetch(API.orders, { method:'POST', headers:{ 'Content-Type':'application/json', ...auth() }, body: JSON.stringify(body) }).then(safe);
    toast('✅ Order created');
    document.getElementById('orderForm').reset();
    document.getElementById('orderItemsTbody').innerHTML = '';
    addOrderItemRow();
    await loadOrders();
  }

  async function handleOrdersActions(ev){
    const t = ev.target;
    if (t.dataset.act === 'rm-item'){ t.closest('tr').remove(); return; }
    if (t.dataset.act === 'order-status'){
      const id = t.dataset.id; const status = t.dataset.status;
      await fetch(`${API.orderStatus(id)}?status=${encodeURIComponent(status)}`, { method:'PUT', headers: auth() }).then(safe);
      toast('✅ Order '+status);
      await loadOrders(); await loadProducts(); await loadLowStock();
    }
    if (t.dataset.act === 'order-email'){
      openEmailModal(id=t.dataset.id);
    }
  }

  async function openEmailModal(id){
    const arr = await fetch(API.orders, { headers: auth() }).then(safe);
    const order = arr.find(o=>String(o.id)===String(id));
    if (!order) return;
    const sup = suppliersCache.find(s=>String(s.id)===String(order.supplier_id));
    const contact = order.contact_id ? Object.values(contactsCache).flat().find(c=>String(c.id)===String(order.contact_id)) : null;
    const contactName = contact ? contact.name : 'Sir/Madam';
    let body = `Subject: Purchase Order ${order.order_code}\n\n`;
    body += `Dear ${contactName} (${sup?sup.name:order.supplier_id}),\n\n`;
    body += `We would like to place the following order:\n\n`;
    for (const it of order.items||[]){ const p=productsCache.find(pp=>String(pp.id)===String(it.product_id)); body += `- ${p?p.name:it.product_id}: ${it.quantity}\n`; }
    body += `\nOrder Date: ${new Date(order.order_date).toLocaleDateString()}\n\nPlease confirm availability, lead time, and ETA.\n\nBest regards,`;
    document.getElementById('emailDraftBox').value = body;
    const modal = document.getElementById('emailModal'); modal.dataset.orderId = order.id; modal.style.display='flex';
  }
  function closeEmailModal(){ document.getElementById('emailModal').style.display='none'; }
  async function sendEmailDraft(){
    const id = document.getElementById('emailModal').dataset.orderId;
    await fetch(API.orderSendEmail(id), { method:'POST', headers: auth() }).then(safe);
    toast('📧 Email sent');
    await loadOrders();
    closeEmailModal();
  }

  // Wire up
  MKHubUI.initSidebar('inventory', false);
  document.getElementById('productForm').addEventListener('submit', saveProduct);
  document.getElementById('cancelEditBtn').addEventListener('click', cancelEdit);
  document.getElementById('supplierForm').addEventListener('submit', saveSupplier);
  document.getElementById('cancelEditSupplierBtn').addEventListener('click', cancelEditSupplier);
  document.getElementById('contactForm').addEventListener('submit', saveContact);
  document.getElementById('cancelEditContactBtn').addEventListener('click', cancelEditContact);
  document.getElementById('orderSupplierId').addEventListener('change', onOrderSupplierChange);
  document.getElementById('addItemBtn').addEventListener('click', addOrderItemRow);
  document.getElementById('productTable').addEventListener('click', handleProductActions);
  document.getElementById('supplierTable').addEventListener('click', handleSupplierActions);
  document.getElementById('contactTable').addEventListener('click', handleContactActions);
  document.getElementById('orderForm').addEventListener('submit', createOrder);
  document.getElementById('emailModalClose').addEventListener('click', closeEmailModal);
  document.getElementById('sendEmailBtn').addEventListener('click', sendEmailDraft);

  // Initial load
  (async function(){ await loadProducts(); await loadSuppliers(); await loadLowStock(); await loadOrders(); addOrderItemRow(); })();
})();


