function fmtMoney(n) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

const costsContainer = document.getElementById("costsContainer");
const addCostBtn = document.getElementById("addCostBtn");

let costSeq = 0;

if (addCostBtn) addCostBtn.addEventListener("click", () => {
  const count = costsContainer.querySelectorAll(".costItem").length;
  if (count >= 5) {
    alert("You can only add up to 5 additional costs.");
    return;
  }
  costSeq += 1;
  const wrapper = document.createElement("div");
  wrapper.className = "costItem";
  wrapper.dataset.costId = `cost_${costSeq}`;
  wrapper.innerHTML = `
    <label>Label:
      <input type="text" name="cost_label_${costSeq}" required>
    </label>
    <label>Value:
      <input type="number" step="0.01" name="cost_value_${costSeq}" required>
    </label>
    <div class="inline-actions">
      <button type="button" class="btn-danger" data-action="remove-cost">Remove Cost</button>
    </div>
  `;
  costsContainer.appendChild(wrapper);
  calculateTotal();
});

costsContainer.addEventListener("click", (e) => {
  const btn = e.target.closest('[data-action="remove-cost"]');
  if (!btn) return;
  const item = btn.closest(".costItem");
  if (item) item.remove();
  calculateTotal();
});

const sectionsContainer = document.getElementById("sectionsContainer");
const addSectionBtn = document.getElementById("addSectionBtn");
const qp = new URLSearchParams(location.search);
const draftId = qp.get('draft_id') || null;
const draftClientId = qp.get('client_id') || '';
const draftSiteId = qp.get('site_id') || '';

let sectionSeq = 0;
let imgSeq = 0;

if (addSectionBtn) addSectionBtn.addEventListener("click", () => {
  sectionSeq += 1;
  const wrapper = document.createElement("div");
  wrapper.className = "sectionItem";
  wrapper.dataset.sectionId = `section_${sectionSeq}`;
  wrapper.innerHTML = `
    <label>Section Title:
      <input type="text" name="section_title_${sectionSeq}" required>
    </label>
    <label>Section Type:
      <select name="section_type_${sectionSeq}" data-role="section-type">
        <option value="text">Text</option>
        <option value="images">Images</option>
      </select>
    </label>
    <div class="sectionContent" data-role="section-content"></div>
    <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
      <button type="button" class="btn-move" data-action="move-up">↑ Move Up</button>
      <button type="button" class="btn-move" data-action="move-down">↓ Move Down</button>
      <button type="button" class="btn-danger" data-action="remove-section">Remove Section</button>
    </div>
  `;
  sectionsContainer.appendChild(wrapper);
  renderSectionContent(wrapper, "text");
});

function renderSectionContent(sectionEl, type) {
  const contentDiv = sectionEl.querySelector('[data-role="section-content"]');
  contentDiv.innerHTML = "";
  const sectionId = sectionEl.dataset.sectionId.replace("section_", "");
  if (type === "text") {
    contentDiv.innerHTML = `
      <label>Section Text:
        <textarea name="section_text_${sectionId}" required></textarea>
      </label>
    `;
  } else {
    const addImgBtn = document.createElement("button");
    addImgBtn.type = "button";
    addImgBtn.textContent = "+ Add Image";
    addImgBtn.dataset.action = "add-image";
    const chooseBtn = document.createElement("button");
    chooseBtn.type = "button";
    chooseBtn.style.marginLeft = '6px';
    chooseBtn.textContent = "Choose from Site Files";
    chooseBtn.dataset.action = "choose-site-image";
    const imgsBox = document.createElement("div");
    imgsBox.dataset.role = "images-box";
    contentDiv.appendChild(addImgBtn);
    if (draftSiteId) contentDiv.appendChild(chooseBtn);
    contentDiv.appendChild(imgsBox);
  }
}

sectionsContainer.addEventListener("change", (e) => {
  const select = e.target.closest('[data-role="section-type"]');
  if (!select) return;
  const sectionEl = e.target.closest(".sectionItem");
  renderSectionContent(sectionEl, select.value);
});

sectionsContainer.addEventListener("click", (e) => {
  const section = e.target.closest(".sectionItem");
  if (!section) return;
  if (e.target.dataset.action === "remove-section") {
    section.remove();
    return;
  }
  if (e.target.dataset.action === "move-up") {
    const prev = section.previousElementSibling;
    if (prev) {
      section.parentNode.insertBefore(section, prev);
    }
    return;
  }
  if (e.target.dataset.action === "move-down") {
    const next = section.nextElementSibling;
    if (next) {
      section.parentNode.insertBefore(next, section);
    }
    return;
  }
  const addImgBtn = e.target.closest('[data-action="add-image"]');
  if (addImgBtn) {
    const section = addImgBtn.closest(".sectionItem");
    const imagesBox = section.querySelector('[data-role="images-box"]');
    imgSeq += 1;
    const imgWrap = document.createElement("div");
    imgWrap.className = "imageItem";
    imgWrap.dataset.imageId = `img_${imgSeq}`;
    const fileFieldName = `section${section.dataset.sectionId.replace("section_", "")}_image${imgSeq}`;
    const captionFieldName = `section${section.dataset.sectionId.replace("section_", "")}_caption${imgSeq}`;
    imgWrap.innerHTML = `
      <label>Upload Image:
        <input type=\"file\" name=\"${fileFieldName}\" accept=\"image/*\" required>
      </label>
      <label>Caption:
        <input type=\"text\" name=\"${captionFieldName}\" maxlength=\"90\" required>
      </label>
      <div class=\"inline-actions\">
        <button type=\"button\" class=\"btn-danger\" data-action=\"remove-image\">Remove image</button>
      </div>
    `;
    imagesBox.appendChild(imgWrap);
    return;
  }
  const chooseBtn = e.target.closest('[data-action="choose-site-image"]');
  if (chooseBtn) {
    const section = chooseBtn.closest('.sectionItem');
    chooseSiteFileAndInsert(section);
    return;
  }
  const rmImgBtn = e.target.closest('[data-action="remove-image"]');
  if (rmImgBtn) {
    const imgItem = rmImgBtn.closest(".imageItem");
    if (imgItem) imgItem.remove();
    return;
  }
});

async function chooseSiteFileAndInsert(section){
  try{
    if (!draftClientId || !draftSiteId){ alert('Open this from a site to choose site files.'); return; }
    const token = MKHubUI.getTokenOrRedirect();
    const files = await fetch(`/clients/${encodeURIComponent(draftClientId)}/files?site_id=${encodeURIComponent(draftSiteId)}`, { headers:{ Authorization:'Bearer '+token } }).then(x=>x.json());
    if (!Array.isArray(files) || !files.length){ alert('No site files'); return; }
    const names = files.map((f,i)=>`${i+1}. ${f.original_name || f.key || f.file_object_id}`).join('\n');
    const pick = prompt(`Choose file number to insert as image:\n${names}`);
    const idx = parseInt(pick||'',10)-1; if (!(idx>=0 && idx<files.length)) return;
    const chosen = files[idx];
    // Insert image item referencing file_object_id
    imgSeq += 1;
    const imagesBox = section.querySelector('[data-role="images-box"]');
    const imgWrap = document.createElement('div');
    imgWrap.className = 'imageItem';
    imgWrap.dataset.imageId = `img_${imgSeq}`;
    imgWrap.dataset.fileId = chosen.file_object_id;
    imgWrap.innerHTML = `
      <div class="muted">From site: ${chosen.original_name || chosen.key || chosen.file_object_id}</div>
      <label>Caption:
        <input type="text" maxlength="90">
      </label>
      <div class="inline-actions">
        <button type="button" class="btn-danger" data-action="remove-image">Remove image</button>
      </div>
    `;
    imagesBox.appendChild(imgWrap);
    scheduleAutosave();
  }catch(e){}
}

function calculateTotal() {
  const bidPrice = parseFloat(document.querySelector('[name="bid_price"]')?.value) || 0;
  let additionalSum = 0;
  costsContainer.querySelectorAll(".costItem").forEach((item) => {
    const valEl = item.querySelector('input[name^="cost_value_"]');
    additionalSum += parseFloat(valEl?.value) || 0;
  });
  const total = bidPrice + additionalSum;
  const el = document.getElementById("calculatedTotal");
  if (el) el.textContent = fmtMoney(total);
  return total;
}

document.addEventListener("input", (e) => {
  if (e.target.name === "bid_price" || e.target.name?.startsWith("cost_value_")) {
    calculateTotal();
  }
});

const formEl = document.getElementById("proposalForm");
const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
const msgEl = document.getElementById('msg');

if (formEl) formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  try{ MKHubUI.getTokenOrRedirect(); }catch(e){}
  const form = e.target;
  const formData = new FormData(form);

  const additionalCosts = [];
  costsContainer.querySelectorAll(".costItem").forEach((item) => {
    const lbl = item.querySelector('input[name^="cost_label_"]')?.value?.trim();
    const val = item.querySelector('input[name^="cost_value_"]')?.value;
    if (lbl && val !== "" && val !== null && val !== undefined) {
      additionalCosts.push({ label: lbl, value: parseFloat(val) });
    }
  });
  formData.set("additional_costs", JSON.stringify(additionalCosts));

  const sections = [];
  sectionsContainer.querySelectorAll(".sectionItem").forEach((sec) => {
    const sectionId = sec.dataset.sectionId.replace("section_", "");
    const title = sec.querySelector(`[name="section_title_${sectionId}"]`)?.value || "";
    const type = sec.querySelector('[data-role="section-type"]')?.value || "text";
    if (!title) return;
    if (type === "text") {
      const text = sec.querySelector(`[name="section_text_${sectionId}"]`)?.value || "";
      sections.push({ title, type: "text", text });
    } else {
      const images = [];
      sec.querySelectorAll(".imageItem").forEach((imgItem) => {
        const fileInput = imgItem.querySelector('input[type="file"]');
        const captionInput = imgItem.querySelector('input[type="text"]');
        const siteFileId = imgItem.dataset.fileId;
        if (siteFileId){
          images.push({ file_object_id: siteFileId, caption: captionInput?.value || '' });
        } else if (fileInput && fileInput.files && fileInput.files.length > 0) {
          formData.append(fileInput.name, fileInput.files[0]);
          images.push({ file_field: fileInput.name, caption: captionInput?.value || "" });
        }
      });
      sections.push({ title, type: "images", images });
    }
  });
  formData.set("sections", JSON.stringify(sections));
  formData.set("total", String(calculateTotal()));

  // Disable button and show progress
  if (submitBtn){ submitBtn.disabled = true; submitBtn.textContent = 'Generating…'; }
  if (msgEl){ msgEl.textContent = 'Generating PDF, please wait…'; }
  try {
    const resp = await fetch("/proposals/generate", { method: "POST", body: formData });
    if (!resp.ok) {
      const txt = await resp.text();
      if (msgEl){ msgEl.textContent = 'Error: ' + txt; }
      alert("Error generating proposal");
      return;
    }
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    document.getElementById("downloadLink").href = url;
    document.getElementById("downloadSection").style.display = "block";
    if (msgEl){ msgEl.textContent = 'Done. Your proposal is ready.'; }
  } catch (err) {
    console.error(err);
    if (msgEl){ msgEl.textContent = 'Request failed. Please try again.'; }
    alert("Request failed");
  } finally {
    if (submitBtn){ submitBtn.disabled = false; submitBtn.textContent = 'Generate Proposal'; }
  }
});

// ---- Draft autosave ----
function collectDraft(){
  const fd = new FormData(document.getElementById('proposalForm'));
  const out = {};
  fd.forEach((v,k)=>{ if (v instanceof File) return; out[k]=v; });
  // Attach constructed arrays
  const addCosts = [];
  costsContainer.querySelectorAll('.costItem').forEach((item)=>{
    const lbl = item.querySelector('input[name^="cost_label_"]')?.value?.trim();
    const val = item.querySelector('input[name^="cost_value_"]')?.value;
    if (lbl && val !== '' && val !== null && val !== undefined){ addCosts.push({ label: lbl, value: parseFloat(val) }); }
  });
  out.additional_costs = addCosts;
  const secs = [];
  sectionsContainer.querySelectorAll('.sectionItem').forEach((sec)=>{
    const sectionId = sec.dataset.sectionId.replace('section_','');
    const title = sec.querySelector(`[name="section_title_${sectionId}"]`)?.value || '';
    const type = sec.querySelector('[data-role="section-type"]')?.value || 'text';
    if (!title) return;
    if (type==='text'){
      secs.push({ title, type:'text', text: sec.querySelector(`[name="section_text_${sectionId}"]`)?.value || '' });
    }else{
      const images=[]; sec.querySelectorAll('.imageItem').forEach((imgItem)=>{
        const captionInput = imgItem.querySelector('input[type="text"]');
        images.push({ caption: captionInput?.value || '' });
      });
      secs.push({ title, type:'images', images });
    }
  });
  out.sections = secs;
  return out;
}
let autosaveTimer = null;
function scheduleAutosave(){ clearTimeout(autosaveTimer); autosaveTimer = setTimeout(saveDraft, 800); }
document.getElementById('proposalForm').addEventListener('input', scheduleAutosave);
sectionsContainer.addEventListener('click', (e)=>{ if (['add-image','remove-image','remove-section','move-up','move-down'].includes(e.target?.dataset?.action)) scheduleAutosave(); });
async function saveDraft(){
  try{
    const payload = { id: draftId, client_id: draftClientId || null, site_id: draftSiteId || null, title: document.querySelector('[name="cover_title"]').value || 'Untitled', data: collectDraft() };
    const r = await fetch('/proposals/drafts', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j && j.id){ history.replaceState(null, '', `${location.pathname}?draft_id=${encodeURIComponent(j.id)}${draftClientId?`&client_id=${encodeURIComponent(draftClientId)}`:''}${draftSiteId?`&site_id=${encodeURIComponent(draftSiteId)}`:''}`); }
  }catch(e){}
}
async function loadDraft(){
  if (!draftId) return;
  try{
    let j = null;
    try{
      j = await fetch('/proposals/drafts/'+encodeURIComponent(draftId)).then(x=>x.json());
    }catch(e){}
    if (!j || !j.data){
      try{ j = await fetch('/proposals/'+encodeURIComponent(draftId)).then(x=>x.json()); }catch(e){}
      if (!j || !j.data) return;
    }
    const d = j.data;
    // Fill simple fields
    const form = document.getElementById('proposalForm');
    ['cover_title','order_number','company_name','company_address','date','proposal_created_for','primary_contact_name','primary_contact_phone','primary_contact_email','type_of_project','other_notes','bid_price','terms_text'].forEach(k=>{ const el=form.querySelector(`[name="${k}"]`); if(el) el.value = d[k] || ''; });
    // Additional costs
    costsContainer.innerHTML = '';
    (d.additional_costs||[]).forEach(c=>{ addCostBtn.click(); const last = costsContainer.querySelector('.costItem:last-child'); last.querySelector('input[name^="cost_label_"]').value = c.label||''; last.querySelector('input[name^="cost_value_"]').value = c.value||''; });
    // Sections
    sectionsContainer.innerHTML = '';
    (d.sections||[]).forEach(sec=>{ addSectionBtn.click(); const last = sectionsContainer.querySelector('.sectionItem:last-child'); last.querySelector(`[name^="section_title_"]`).value = sec.title||''; last.querySelector('[data-role="section-type"]').value = sec.type||'text'; renderSectionContent(last, sec.type||'text'); if (sec.type==='text'){ last.querySelector(`[name^="section_text_"]`).value = sec.text||''; } else { (sec.images||[]).forEach(im=>{ last.querySelector('[data-action="add-image"]').click(); const imgLast = last.querySelector('.imageItem:last-child'); imgLast.querySelector('input[type="text"]').value = im.caption||''; }); } });
    calculateTotal();
  }catch(e){}
}
loadDraft();


