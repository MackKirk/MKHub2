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
    const imgsBox = document.createElement("div");
    imgsBox.dataset.role = "images-box";
    contentDiv.appendChild(addImgBtn);
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
  const rmImgBtn = e.target.closest('[data-action="remove-image"]');
  if (rmImgBtn) {
    const imgItem = rmImgBtn.closest(".imageItem");
    if (imgItem) imgItem.remove();
    return;
  }
});

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

document.getElementById("proposalForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  MKHubUI.getTokenOrRedirect();
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
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
          formData.append(fileInput.name, fileInput.files[0]);
          images.push({ file_field: fileInput.name, caption: captionInput?.value || "" });
        }
      });
      sections.push({ title, type: "images", images });
    }
  });
  formData.set("sections", JSON.stringify(sections));
  formData.set("total", String(calculateTotal()));

  try {
    const resp = await fetch("/proposals/generate", { method: "POST", body: formData });
    if (!resp.ok) { alert("Error generating proposal"); return; }
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    document.getElementById("downloadLink").href = url;
    document.getElementById("downloadSection").style.display = "block";
  } catch (err) {
    console.error(err);
    alert("Request failed");
  }
});


