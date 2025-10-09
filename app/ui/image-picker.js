// Lightweight reusable Image Picker + Editor
// Usage: MKImagePicker.open({ clientId, siteId, target }) -> Promise<{ file_object_id, original_name }>
(function(){
  function h(tag, attrs={}, children=[]) {
    const el = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k==='style' && typeof v==='object'){ Object.assign(el.style, v); }
      else if (k==='className'){ el.className = v; }
      else { el.setAttribute(k, v); }
    }
    for (const c of (children||[])){
      if (typeof c==='string') el.appendChild(document.createTextNode(c)); else if (c) el.appendChild(c);
    }
    return el;
  }
  function recSize(target){ if (target==='cover') return { w:566, h:537 }; if (target==='page2') return { w:540, h:340 }; return { w:260, h:150 }; }

  async function open(opts){
    const { clientId, siteId, target } = opts||{};
    try{ console.log('[MKImagePicker] open()', { clientId, siteId, target }); }catch(e){}
    if (!clientId) throw new Error('clientId required');
    const token = (window.MKHubUI && MKHubUI.getTokenOrRedirect) ? MKHubUI.getTokenOrRedirect() : localStorage.getItem('user_token');

    return new Promise(async (resolve) => {
      // Build modal
      const modal = h('div', { class:'mk-modal', style:{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 } });
      const card = h('div', { class:'card', style:{ width:'90%', maxWidth:'900px', maxHeight:'80%', overflow:'auto', background:'#fff', padding:'12px' } });
      const rowTop = h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' } }, [ h('h3', {}, ['Select Picture']), h('button', { id:'mkClose', type:'button' }, ['Close']) ]);
      const rowUp = h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px', flexWrap:'wrap' } }, [ h('input', { type:'file', id:'mkUp', accept:'image/*' }), h('button', { id:'mkUpBtn' }, ['Upload to Site']), h('span', { className:'muted' }, ['Uploads attach to this site']) ]);
      const grid = h('div', { id:'mkGrid', style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'10px' } });
      const rowBottom = h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'10px' } }, [ h('div', { id:'mkHint', className:'muted' }), h('div', { style:{ display:'flex', gap:'8px' } }, [ h('button', { id:'mkEdit', type:'button', disabled:true }, ['Edit']), h('button', { id:'mkSelect', type:'button', disabled:true }, ['Select']) ]) ]);

      // Editor
      const editor = h('div', { id:'mkEditor', style:{ display:'none', marginTop:'10px' } });
      const hint = h('div', { id:'mkEH', className:'muted' });
      const phaseBar = h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', margin:'6px 0' } }, [
        h('button', { id:'mkPhaseImg', className:'active' }, ['Edit Image']),
        h('button', { id:'mkPhaseNotes' }, ['Edit/Add Notes'])
      ]);
      const wrap = h('div', { style:{ display:'flex', gap:'10px', alignItems:'flex-start', flexWrap:'wrap' } });
      // Left toolbar (icons)
      const toolbar = h('div', { style:{ display:'flex', flexDirection:'column', gap:'6px', alignItems:'center' } }, [
        h('button', { id:'mkTBPan', title:'Pan (drag)', className:'active' }, ['🖐️']),
        h('button', { id:'mkTBRect', title:'Rectangle' }, ['▭']),
        h('button', { id:'mkTBArrow', title:'Arrow' }, ['➤']),
        h('button', { id:'mkTBText', title:'Text' }, ['T']),
        h('input', { id:'mkTBZoom', type:'range', min:'0.1', max:'3', value:'1', step:'0.01', style:'writing-mode: bt-lr; -webkitAppearance: slider-vertical; appearance: slider-vertical; height: 140px; transform: rotate(180deg);' }),
        h('button', { id:'mkTBRotL', title:'Rotate Left' }, ['⟲']),
        h('button', { id:'mkTBRotR', title:'Rotate Right' }, ['⟳']),
      ]);
      const canvWrap = h('div', { style:{ position:'relative' } });
      const cvs = h('canvas', { id:'mkC', style:{ background:'#f6f6f6', maxWidth:'100%', border:'1px solid #eee' } });
      const overlay = h('canvas', { id:'mkO', style:{ position:'absolute', left:'0', top:'0', pointerEvents:'none' } });
      canvWrap.appendChild(cvs); canvWrap.appendChild(overlay);
      const side = h('div', { style:{ display:'flex', flexDirection:'column', gap:'8px', minWidth:'240px' } });
      const modes = h('div', { style:{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' } }, [ h('button', { id:'mkPan', className:'active' }, ['Pan']), h('button', { id:'mkRect' }, ['Rect']), h('button', { id:'mkArrow' }, ['Arrow']), h('button', { id:'mkText' }, ['Text']) ]);
      const colorStroke = h('div', { style:{ display:'flex', gap:'6px', alignItems:'center' } }, [ h('label', {}, ['Color ', h('input',{ type:'color', id:'mkColor', value:'#ff0000' }) ]), h('label', {}, ['Stroke ', h('input',{ type:'number', id:'mkStroke', min:'1', max:'20', value:'3', style:'width:60px' }) ]) ]);
      const textRow = h('div', { style:{ display:'flex', gap:'6px', alignItems:'center' } }, [ h('label', {}, ['Font ', h('input',{ type:'text', id:'mkFont', value:'16px Montserrat', style:'width:140px' }) ]), h('label', { style:{ flex:'1' } }, ['Text ', h('input',{ type:'text', id:'mkTxt', placeholder:'Your text', style:'width:100%' }) ]) ]);
      const rotRow = h('div', { style:{ display:'flex', gap:'6px', alignItems:'center' } }, [ h('button', { id:'mkRotL' }, ['Rotate ⟲']), h('button', { id:'mkRotR' }, ['Rotate ⟳']) ]);
      const zoomRow = h('label', {}, ['Zoom ', h('input',{ type:'range', id:'mkZoom', min:'0.1', max:'3', value:'1', step:'0.01' }) ]);
      const tips = h('div', { className:'muted' }, ['Tips: Pan mode: drag image. Rect/Arrow/Text: click or drag on canvas. Click an annotation to select, drag to move. Del removes.']);
      const act = h('div', { style:{ display:'flex', gap:'6px', justifyContent:'flex-end', flexWrap:'wrap' } }, [ h('button', { id:'mkBack' }, ['Back']), h('button', { id:'mkReset' }, ['Reset']), h('button', { id:'mkApply' }, ['Apply']) ]);
      side.appendChild(modes); side.appendChild(colorStroke); side.appendChild(textRow); side.appendChild(rotRow); side.appendChild(tips); side.appendChild(act);
      wrap.appendChild(toolbar); wrap.appendChild(canvWrap); wrap.appendChild(side);
      editor.appendChild(hint); editor.appendChild(phaseBar); editor.appendChild(wrap);

      card.appendChild(rowTop); card.appendChild(rowUp); card.appendChild(grid); card.appendChild(rowBottom); card.appendChild(editor);
      modal.appendChild(card); document.body.appendChild(modal);
      try{ console.log('[MKImagePicker] modal mounted'); }catch(e){}

      const rec = recSize(target); const hintEl = card.querySelector('#mkHint'); if (hintEl) hintEl.textContent = `Recommended size: ${rec.w}×${rec.h}`;

      let sel = { id:'', name:'' };
      async function loadGrid(){
        grid.textContent = 'Loading…';
        try{
          const url = '/clients/'+encodeURIComponent(clientId)+'/files' + (siteId? ('?site_id='+encodeURIComponent(siteId)) : '');
          const arr = await fetch(url, { headers: token? { Authorization:'Bearer '+token } : {} }).then(x=>x.json());
          const pics = (arr||[]).filter(f=> (f.is_image===true) || String(f.content_type||'').startsWith('image/'));
          if (!pics.length){ grid.textContent = 'No pictures yet'; return; }
          grid.innerHTML='';
          for (const f of pics){
            const it = h('div', { className:'modal-item', style:{ border:'1px solid #eee', padding:'6px', textAlign:'center', background:'#fff', cursor:'pointer' } });
            const im = h('img', { alt:(f.original_name||f.key||f.file_object_id), src:`/files/${f.file_object_id}/thumbnail?w=300`, style:{ maxWidth:'100%', height:'110px', objectFit:'cover' } });
            const cap = h('div', { className:'muted', style:{ fontSize:'12px' } }, [ f.original_name||'' ]);
            it.appendChild(im); it.appendChild(cap);
      it.addEventListener('click', ()=>{ grid.querySelectorAll('.modal-item').forEach(x=>x.classList.remove('active')); it.classList.add('active'); sel.id=f.file_object_id; sel.name=(f.original_name||f.key||f.file_object_id); const selBtn=card.querySelector('#mkSelect'); const editBtn=card.querySelector('#mkEdit'); if (selBtn) selBtn.disabled=false; if (editBtn) editBtn.disabled=false; });
            grid.appendChild(it);
          }
        }catch(e){ grid.textContent='Failed to load'; }
      }
      await loadGrid();

      // Upload
      card.querySelector('#mkUpBtn').addEventListener('click', async ()=>{
        try{
          const f = card.querySelector('#mkUp').files[0]; if (!f){ alert('Choose an image'); return; }
          const upReq = { project_id: null, client_id: clientId, employee_id: null, category_id: 'site-docs', original_name: f.name, content_type: f.type || 'application/octet-stream' };
          const up = await fetch('/files/upload', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify(upReq) }).then(x=>x.json());
          const putResp = await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': upReq.content_type, 'x-ms-blob-type': 'BlockBlob' }, body: f });
          if (!putResp.ok){ alert('Upload failed'); return; }
          const conf = await fetch('/files/confirm', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ key: up.key, size_bytes: f.size, checksum_sha256: 'na', content_type: (f.type||'application/octet-stream') }) }).then(x=>x.json());
          await fetch(`/clients/${encodeURIComponent(clientId)}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-docs&original_name=${encodeURIComponent(f.name)}&site_id=${encodeURIComponent(siteId||'')}`, { method:'POST', headers:{ Authorization:'Bearer '+token } });
          await loadGrid();
        }catch(e){ try{ console.error('[MKImagePicker] upload failed', e); }catch(_e){} alert('Upload failed'); }
      });

      // Editor state
      let ES = { img:null, angle:0, scale:1, offsetX:0, offsetY:0, aspect:rec.w/rec.h, items:[], selectedIds:[], color:'#ff0000', stroke:3, font:'16px Montserrat', text:'', fileId:'', fileName:'', phase:'image', mode:'pan' };
      function setCanvasSize(){
        const maxW = 800;
        const w = Math.min(maxW, (modal.clientWidth || 900) - 120);
        const aspect = ES.aspect;
        cvs.width = w;
        cvs.height = Math.round(w / aspect);
        overlay.width = cvs.width;
        overlay.height = cvs.height;
      }
      function drawBase(){
        const ctx = cvs.getContext('2d');
        ctx.save();
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        ctx.fillStyle = '#f6f6f6';
        ctx.fillRect(0, 0, cvs.width, cvs.height);
        if (!ES.img) { ctx.restore(); return; }
        ctx.translate(cvs.width/2 + ES.offsetX, cvs.height/2 + ES.offsetY);
        ctx.rotate(ES.angle * Math.PI/180);
        const iw = ES.img.width, ih = ES.img.height, s = ES.scale;
        const dw = iw * s, dh = ih * s;
        ctx.drawImage(ES.img, -dw/2, -dh/2, dw, dh);
        ctx.restore();
      }
      function itemBounds(it){
        if (it.type === 'rect'){
          const w = Math.abs(it.w), h = Math.abs(it.h);
          const x = Math.min(it.x, it.x + it.w), y = Math.min(it.y, it.y + it.h);
          return { x, y, w, h };
        }
        if (it.type === 'arrow'){
          const x = Math.min(it.x, it.x2), y = Math.min(it.y, it.y2);
          return { x, y, w: Math.abs(it.x2 - it.x), h: Math.abs(it.y2 - it.y) };
        }
        if (it.type === 'text'){
          const ctx = overlay.getContext('2d');
          ctx.font = it.font;
          const w = ctx.measureText(it.text || '').width;
          const h = parseInt(it.font, 10) || 16;
          return { x: it.x, y: it.y - h, w, h };
        }
        return null;
      }
      function drawOverlay(){
        const ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        for (const it of ES.items){
          ctx.save();
          ctx.strokeStyle = it.color;
          ctx.fillStyle = it.color;
          ctx.lineWidth = it.stroke;
          if (it.type === 'rect'){
            ctx.strokeRect(it.x, it.y, it.w, it.h);
          } else if (it.type === 'arrow'){
            const dx = it.x2 - it.x, dy = it.y2 - it.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx/len, uy = dy/len;
            const head = 10 + it.stroke * 2;
            ctx.beginPath();
            ctx.moveTo(it.x, it.y);
            ctx.lineTo(it.x2, it.y2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(it.x2, it.y2);
            ctx.lineTo(it.x2 - ux*head - uy*head*0.5, it.y2 - uy*head + ux*head*0.5);
            ctx.lineTo(it.x2 - ux*head + uy*head*0.5, it.y2 - uy*head - ux*head*0.5);
            ctx.closePath();
            ctx.fill();
          } else if (it.type === 'text'){
            ctx.font = it.font;
            ctx.fillText(it.text || '', it.x, it.y);
          }
          if (ES.selectedIds && ES.selectedIds.includes(it.id)){
            ctx.setLineDash([4,3]);
            ctx.strokeStyle = '#3b82f6';
            const bb = itemBounds(it);
            if (bb){ ctx.strokeRect(bb.x, bb.y, bb.w, bb.h); }
          }
          ctx.restore();
        }
        if (ES._marquee){
          ctx.save();
          ctx.setLineDash([5,4]);
          ctx.strokeStyle = '#3b82f6';
          const m = ES._marquee;
          const x = Math.min(m.x, m.x2), y = Math.min(m.y, m.y2);
          const w = Math.abs(m.x2 - m.x), h = Math.abs(m.y2 - m.y);
          ctx.strokeRect(x, y, w, h);
          ctx.restore();
        }
      }
      function redraw(){ drawBase(); drawOverlay(); }

      function setMode(m){ ES.mode=m; ['#mkPan','#mkRect','#mkArrow','#mkText','#mkTBPan','#mkTBRect','#mkTBArrow','#mkTBText'].forEach(sel=>{ const b=card.querySelector(sel); if(b) b.classList.remove('active'); }); const map={pan:'#mkPan', rect:'#mkRect', arrow:'#mkArrow', text:'#mkText'}; const btn=card.querySelector(map[m]); if(btn) btn.classList.add('active'); const tmap={pan:'#mkTBPan', rect:'#mkTBRect', arrow:'#mkTBArrow', text:'#mkTBText'}; const tbtn=card.querySelector(tmap[m]); if (tbtn) tbtn.classList.add('active'); updatePhaseUI(); }

      function updatePhaseUI(){
        // Phase toggles
        const pImg = card.querySelector('#mkPhaseImg'); const pNotes = card.querySelector('#mkPhaseNotes');
        if (pImg && pNotes){ pImg.classList.remove('active'); pNotes.classList.remove('active'); if (ES.phase==='image') pImg.classList.add('active'); else pNotes.classList.add('active'); }
        // Enable/disable overlay interactions and tool buttons based on phase
        const notesEnabled = ES.phase === 'notes';
        overlay.style.pointerEvents = notesEnabled ? 'auto' : 'none';
        // Disable shape buttons in image phase
        const shapeBtns = ['#mkRect','#mkArrow','#mkText','#mkTBRect','#mkTBArrow','#mkTBText'];
        shapeBtns.forEach(sel=>{ const b=card.querySelector(sel); if (b){ b.disabled = !notesEnabled; if (!notesEnabled) b.classList.remove('active'); } });
        // Force pan mode in image phase
        if (!notesEnabled) { ES.mode = 'pan'; }
      }
      card.querySelector('#mkPhaseImg').addEventListener('click', ()=>{ ES.phase='image'; updatePhaseUI(); });
      card.querySelector('#mkPhaseNotes').addEventListener('click', ()=>{ ES.phase='notes'; updatePhaseUI(); });
      card.querySelector('#mkPan').addEventListener('click', ()=>setMode('pan'));
      card.querySelector('#mkRect').addEventListener('click', ()=>setMode('rect'));
      card.querySelector('#mkArrow').addEventListener('click', ()=>setMode('arrow'));
      card.querySelector('#mkText').addEventListener('click', ()=>setMode('text'));
      // Toolbar mirrors
      card.querySelector('#mkTBPan').addEventListener('click', ()=>setMode('pan'));
      card.querySelector('#mkTBRect').addEventListener('click', ()=>setMode('rect'));
      card.querySelector('#mkTBArrow').addEventListener('click', ()=>setMode('arrow'));
      card.querySelector('#mkTBText').addEventListener('click', ()=>setMode('text'));
      card.querySelector('#mkColor').addEventListener('input', (e)=>{ ES.color=e.target.value; });
      card.querySelector('#mkStroke').addEventListener('input', (e)=>{ ES.stroke=parseInt(e.target.value||'3',10)||3; });
      card.querySelector('#mkFont').addEventListener('input', (e)=>{ ES.font=e.target.value||'16px Montserrat'; });
      card.querySelector('#mkTxt').addEventListener('input', (e)=>{ ES.text=e.target.value||''; });
      let dragging=false, startX=0, startY=0; cvs.addEventListener('mousedown', (e)=>{ if (ES.phase!=='image' || ES.mode!=='pan') return; dragging=true; startX=e.offsetX; startY=e.offsetY; }); cvs.addEventListener('mousemove', (e)=>{ if (!dragging||ES.phase!=='image' || ES.mode!=='pan') return; ES.offsetX+=(e.offsetX-startX); ES.offsetY+=(e.offsetY-startY); startX=e.offsetX; startY=e.offsetY; redraw(); }); window.addEventListener('mouseup', ()=>{ dragging=false; });
      let drawing=null; overlay.style.pointerEvents='auto'; overlay.addEventListener('mousedown', (e)=>{ const x=e.offsetX, y=e.offsetY; if (ES.phase==='notes' && ES.mode==='rect'){ drawing={ id:'it_'+Date.now(), type:'rect', x, y, w:1, h:1, color:ES.color, stroke:ES.stroke }; ES.items.push(drawing); redraw(); } else if (ES.phase==='notes' && ES.mode==='arrow'){ drawing={ id:'it_'+Date.now(), type:'arrow', x, y, x2:x+1, y2:y+1, color:ES.color, stroke:ES.stroke }; ES.items.push(drawing); redraw(); } else if (ES.phase==='notes' && ES.mode==='text'){ const inp=document.createElement('input'); inp.type='text'; inp.placeholder='Type...'; inp.style.position='absolute'; const r=overlay.getBoundingClientRect(); inp.style.left = (x + r.left - r.left) + 'px'; inp.style.top = (y + r.top - r.top) + 'px'; inp.style.zIndex='10000'; inp.style.padding='2px 4px'; inp.style.border='1px solid #ccc'; inp.style.font = ES.font; overlay.parentElement.appendChild(inp); inp.focus(); const commit=()=>{ const txt=inp.value.trim(); inp.parentElement.removeChild(inp); if (!txt){ redraw(); return; } const it={ id:'it_'+Date.now(), type:'text', x, y, text:txt, font:ES.font, color:ES.color, stroke:ES.stroke }; ES.items.push(it); redraw(); }; inp.addEventListener('keydown', (ev)=>{ if (ev.key==='Enter'){ commit(); } else if (ev.key==='Escape'){ inp.parentElement.removeChild(inp); redraw(); } }); inp.addEventListener('blur', commit); } else if (ES.phase==='notes' && ES.mode==='pan'){ const hit=itemAt(e.offsetX,e.offsetY); if (e.shiftKey && !hit){ ES._marquee = { x:e.offsetX, y:e.offsetY, x2:e.offsetX, y2:e.offsetY }; } else if (hit){ if (!ES.selectedIds || !ES.selectedIds.includes(hit.id)){ ES.selectedIds=[hit.id]; } drawing=null; moving=true; mStart={x:e.offsetX, y:e.offsetY}; } else { ES.selectedIds=[]; } redraw(); } });
      overlay.addEventListener('mousemove', (e)=>{ if (ES._marquee){ ES._marquee.x2=e.offsetX; ES._marquee.y2=e.offsetY; redraw(); return; } if (!drawing) return; if (drawing.type==='rect'){ drawing.w=(e.offsetX-drawing.x); drawing.h=(e.offsetY-drawing.y); } if (drawing.type==='arrow'){ drawing.x2=e.offsetX; drawing.y2=e.offsetY; } redraw(); });
      window.addEventListener('mouseup', ()=>{ if (drawing){ drawing=null; redraw(); } if (ES._marquee){ const m=ES._marquee; const x=Math.min(m.x,m.x2), y=Math.min(m.y,m.y2), w=Math.abs(m.x2-m.x), h=Math.abs(m.y2-m.y); const sel=[]; for (const it of ES.items){ const b=itemBounds(it); if (!b) continue; const inside=(b.x>=x && b.y>=y && (b.x+b.w)<=x+w && (b.y+b.h)<=y+h); if (inside) sel.push(it.id); } ES.selectedIds=sel; ES._marquee=null; redraw(); } moving=false; });
      let moving=false, mStart=null; function itemAt(x,y){ for (let i=ES.items.length-1;i>=0;i--){ const it=ES.items[i]; const b=itemBounds(it); if (b && x>=b.x && y>=b.y && x<=b.x+b.w && y<=b.y+b.h) return it; } return null; }
      overlay.addEventListener('mousemove', (e)=>{ if (!moving) return; const dx=e.offsetX-mStart.x, dy=e.offsetY-mStart.y; mStart={x:e.offsetX,y:e.offsetY}; const targets=(ES.selectedIds&&ES.selectedIds.length)?ES.selectedIds:[]; for (const it of ES.items){ if (targets.includes(it.id)){ if (it.type==='rect'){ it.x+=dx; it.y+=dy; } if (it.type==='arrow'){ it.x+=dx; it.y+=dy; it.x2+=dx; it.y2+=dy; } if (it.type==='text'){ it.x+=dx; it.y+=dy; } } } redraw(); });
      window.addEventListener('keydown', (e)=>{ if (e.key==='Delete' && ES.selectedIds && ES.selectedIds.length){ ES.items=ES.items.filter(it=>!ES.selectedIds.includes(it.id)); ES.selectedIds=[]; redraw(); } });
      card.querySelector('#mkRotL').addEventListener('click', ()=>{ ES.angle=(ES.angle+270)%360; redraw(); }); card.querySelector('#mkRotR').addEventListener('click', ()=>{ ES.angle=(ES.angle+90)%360; redraw(); });
      // Toolbar rotate mirrors
      card.querySelector('#mkTBRotL').addEventListener('click', ()=>{ ES.angle=(ES.angle+270)%360; redraw(); });
      card.querySelector('#mkTBRotR').addEventListener('click', ()=>{ ES.angle=(ES.angle+90)%360; redraw(); });
      card.querySelector('#mkZoom').addEventListener('input', (e)=>{ ES.scale=parseFloat(e.target.value||'1'); redraw(); });
      card.querySelector('#mkReset').addEventListener('click', ()=>{ ES.angle=0; ES.scale=1; ES.offsetX=0; ES.offsetY=0; ES.items=[]; ES.selectedIds=[]; redraw(); });
      card.querySelector('#mkBack').addEventListener('click', ()=>{ editor.style.display='none'; grid.style.display='grid'; });

      async function openEditor(fid, fname){ try{ const j=await fetch('/files/'+encodeURIComponent(fid)+'/download').then(x=>x.json()); const url=j && j.download_url ? j.download_url : null; if (!url){ alert('Cannot download image'); return; } ES = { ...ES, img:new Image(), angle:0, scale:1, offsetX:0, offsetY:0, aspect:rec.w/rec.h, items:[], selectedIds:[], fileId: fid, fileName: fname||fid, phase:'image', mode:'pan' }; hint.textContent = `Edit ${fname||fid} — aspect ${(ES.aspect).toFixed(3)}`; await new Promise((res,rej)=>{ ES.img.crossOrigin='anonymous'; ES.img.onload=()=>res(null); ES.img.onerror=rej; ES.img.src=url; }); setCanvasSize(); redraw(); updatePhaseUI(); grid.style.display='none'; editor.style.display='block'; }catch(e){ alert('Failed to load image'); } }
      card.querySelector('#mkEdit').addEventListener('click', ()=>{ if (!sel.id) return; openEditor(sel.id, sel.name); });
      card.querySelector('#mkApply').addEventListener('click', async ()=>{
        try{
          // Flatten overlay onto base before exporting
          const ctxBase = cvs.getContext('2d');
          ctxBase.drawImage(overlay, 0, 0);
          const blob = await new Promise(res=>cvs.toBlob(res,'image/png'));
          if (!blob){ alert('Render failed'); return; }
          // Preserve original name with _edited suffix
          let base = ES.fileName || 'image.png';
          let dot = base.lastIndexOf('.');
          if (dot <= 0 || dot === base.length-1) { dot = -1; }
          const nameNoExt = dot>0 ? base.slice(0, dot) : base.replace(/\.+$/,'');
          const ext = dot>0 ? base.slice(dot) : '.png';
          const f = new File([blob], `${nameNoExt}_edited${ext}`, { type:'image/png' });
          const upReq = { project_id: null, client_id: clientId, employee_id: null, category_id: 'site-docs', original_name: f.name, content_type: f.type };
          const up = await fetch('/files/upload', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify(upReq) }).then(x=>x.json());
          const putResp = await fetch(up.upload_url, { method:'PUT', headers:{ 'Content-Type': f.type, 'x-ms-blob-type': 'BlockBlob' }, body: f }); if (!putResp.ok){ alert('Upload failed'); return; }
          const conf = await fetch('/files/confirm', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+token }, body: JSON.stringify({ key: up.key, size_bytes: blob.size, checksum_sha256: 'na', content_type: f.type }) }).then(x=>x.json());
          await fetch(`/clients/${encodeURIComponent(clientId)}/files?file_object_id=${encodeURIComponent(conf.id)}&category=site-docs&original_name=${encodeURIComponent(f.name)}&site_id=${encodeURIComponent(siteId||'')}`, { method:'POST', headers:{ Authorization:'Bearer '+token } });
          await loadGrid(); sel.id=conf.id; sel.name=f.name; editor.style.display='none'; grid.style.display='grid';
        }catch(e){ alert('Apply failed'); }
      });

      // Select / Close (with delegation fallback)
      function doSelect(){ try{ console.log('[MKImagePicker] select', sel); }catch(e){} if (!sel.id){ alert('Pick an image'); return; } cleanup(); resolve({ file_object_id: sel.id, original_name: sel.name }); }
      function doClose(){ try{ console.log('[MKImagePicker] close'); }catch(e){} cleanup(); resolve(null); }
      const btnSelect = card.querySelector('#mkSelect'); if (btnSelect){ btnSelect.addEventListener('click', (e)=>{ e.stopPropagation(); doSelect(); }); }
      const btnClose = card.querySelector('#mkClose'); if (btnClose){ btnClose.addEventListener('click', (e)=>{ e.stopPropagation(); doClose(); }); }
      // Delegation in case direct bindings fail due to late re-render
      card.addEventListener('click', (e)=>{
        const id = e.target && e.target.id;
        if (id === 'mkClose'){ doClose(); }
        if (id === 'mkEdit' && !e.target.disabled){ try{ console.log('[MKImagePicker] edit click'); }catch(e){} if (!sel.id){ alert('Pick an image'); return; } openEditor(sel.id, sel.name); }
        if (id === 'mkSelect' && !e.target.disabled){ doSelect(); }
      });
      // Robust delegation from modal root using closest() (handles text-node clicks)
      modal.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest && e.target.closest('#mkClose, #mkEdit, #mkSelect');
        if (!btn) return;
        if (btn.id === 'mkClose'){ e.stopPropagation(); doClose(); return; }
        if (btn.id === 'mkEdit' && !btn.disabled){ e.stopPropagation(); if (!sel.id){ alert('Pick an image'); return; } openEditor(sel.id, sel.name); return; }
        if (btn.id === 'mkSelect' && !btn.disabled){ e.stopPropagation(); doSelect(); return; }
      });
      function cleanup(){ try{ document.body.removeChild(modal); }catch(e){} }
    });
  }

  window.MKImagePicker = { open };
})();


