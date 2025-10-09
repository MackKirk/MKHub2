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
      const card = h('div', { class:'card', style:{ width:'96vw', maxWidth:'1100px', maxHeight:'90vh', background:'#fff', padding:'12px', display:'flex', flexDirection:'column', overflow:'hidden' } });
      const rowTop = h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px' } }, [ h('h3', {}, ['Select Picture']), h('button', { id:'mkClose', type:'button' }, ['Close']) ]);
      const rowUp = h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', marginBottom:'8px', flexWrap:'wrap' } }, [ h('input', { type:'file', id:'mkUp', accept:'image/*' }), h('button', { id:'mkUpBtn', type:'button' }, ['Upload to Site']), h('span', { className:'muted' }, ['Uploads attach to this site']) ]);
      // Content area (scrollable)
      const contentArea = h('div', { style:{ flex:'1 1 auto', overflow:'auto' } });
      // Two-column content row: grid (left) + preview (right)
      const contentRow = h('div', { style:{ display:'flex', gap:'10px', alignItems:'stretch', minHeight:'300px' } });
      const leftCol = h('div', { style:{ display:'flex', flexDirection:'column', flex:'2 1 0', minWidth:'300px', minHeight:'300px' } });
      const grid = h('div', { id:'mkGrid', style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'10px', border:'1px solid #eee', padding:'8px', borderRadius:'6px' } });
      leftCol.appendChild(grid);
      const rightCol = h('div', { style:{ display:'flex', flexDirection:'column', gap:'8px', flex:'1 1 0', minWidth:'260px' } });
      // Preview removed per request — keep column for future metadata if needed
      contentRow.appendChild(leftCol);
      contentRow.appendChild(rightCol);
      contentArea.appendChild(contentRow);
      const rowBottom = h('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'10px', position:'sticky', bottom:'0', background:'#fff', paddingTop:'8px', borderTop:'1px solid #eee' } }, [ h('div', { id:'mkHint', className:'muted' }), h('div', { style:{ display:'flex', gap:'8px' } }, [ h('button', { id:'mkSelect', type:'button', disabled:true }, ['Select']) ]) ]);

      // Editor
      const editor = h('div', { id:'mkEditor', style:{ display:'none', marginTop:'10px' } });
      const hint = h('div', { id:'mkEH', className:'muted' });
      const phaseBar = h('div', { style:{ display:'flex', gap:'8px', alignItems:'center', margin:'6px 0' } }, [
        h('button', { id:'mkPhaseImg', className:'active' }, ['Edit Image']),
        h('button', { id:'mkPhaseNotes' }, ['Edit/Add Notes'])
      ]);
      const wrap = h('div', { style:{ display:'flex', gap:'10px', alignItems:'flex-start', flexWrap:'wrap' } });
      // Left toolbar (icons)
      const toolsTop = h('div', { id:'mkToolsTop', style:{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', margin:'6px 0' } }, [
        h('button', { id:'mkTBPan', title:'Pan (drag)', className:'active' }, ['🖐️']),
        h('button', { id:'mkTBRotL', title:'Rotate Left' }, ['⟲']),
        h('button', { id:'mkTBRotR', title:'Rotate Right' }, ['⟳']),
        h('label', {}, ['Zoom ', h('input', { id:'mkTBZoom', type:'range', min:'0.1', max:'3', value:'1', step:'0.01' }) ]),
        // Notes tools
        h('button', { id:'mkTBSelect', title:'Select/Move' }, ['🖱️']),
        h('button', { id:'mkTBRect', title:'Rectangle' }, ['▭']),
        h('button', { id:'mkTBArrow', title:'Arrow' }, ['➤']),
        h('button', { id:'mkTBText', title:'Text' }, ['T']),
        h('button', { id:'mkTBCircle', title:'Circle' }, ['◯']),
        h('button', { id:'mkTBDraw', title:'Freehand draw' }, ['✏️']),
        h('label', {}, ['Color ', h('input',{ type:'color', id:'mkColor', value:'#ff0000' }) ]),
        h('label', {}, ['Stroke ', h('input',{ type:'number', id:'mkStroke', min:'1', max:'20', value:'3', style:'width:60px' }) ]),
        h('label', {}, ['Font ', h('input',{ type:'text', id:'mkFont', value:'16px Montserrat', style:'width:140px' }) ]),
      ]);
      const canvWrap = h('div', { style:{ position:'relative' } });
      const cvs = h('canvas', { id:'mkC', style:{ background:'#f6f6f6', maxWidth:'100%', border:'1px solid #eee' } });
      const overlay = h('canvas', { id:'mkO', style:{ position:'absolute', left:'0', top:'0', pointerEvents:'none' } });
      canvWrap.appendChild(cvs); canvWrap.appendChild(overlay);
      const tips = h('div', { className:'muted' }, ['Tips: Pan: arraste a imagem. Retângulo/Seta/Texto: clique ou arraste. Clique para selecionar, arraste para mover. Del remove.']);
      const act = h('div', { style:{ display:'flex', gap:'6px', justifyContent:'flex-end', flexWrap:'wrap' } }, [ h('button', { id:'mkBack', type:'button' }, ['Back']), h('button', { id:'mkReset', type:'button' }, ['Reset']), h('button', { id:'mkApply', type:'button' }, ['Apply']) ]);
      wrap.appendChild(canvWrap);
      editor.appendChild(hint); editor.appendChild(phaseBar); editor.appendChild(toolsTop); editor.appendChild(wrap); editor.appendChild(tips); editor.appendChild(act);

      card.appendChild(rowTop); card.appendChild(rowUp); card.appendChild(contentArea); card.appendChild(rowBottom); contentArea.appendChild(editor);
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
          // Helper: lightbox view for quick zoom
          function openLightbox(fid, name){
            const lb = h('div', { class:'mk-lightbox', style:{ position:'fixed', inset:'0', background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000 } });
            const img = h('img', { src:`/files/${encodeURIComponent(fid)}/thumbnail?w=1600`, alt:(name||''), style:{ maxWidth:'90vw', maxHeight:'90vh', boxShadow:'0 8px 24px rgba(0,0,0,0.5)', borderRadius:'6px' } });
            lb.appendChild(img);
            const close = ()=>{ try{ document.body.removeChild(lb); }catch(e){} window.removeEventListener('keydown', onKey); };
            lb.addEventListener('click', close);
            const onKey = (e)=>{ if (e.key==='Escape'){ e.preventDefault(); close(); } };
            window.addEventListener('keydown', onKey);
            document.body.appendChild(lb);
          }
          for (const f of pics){
            const it = h('div', { className:'modal-item', style:{ position:'relative', border:'1px solid #eee', padding:'6px', textAlign:'center', background:'#fff', cursor:'pointer' } });
            const im = h('img', { alt:(f.original_name||f.key||f.file_object_id), src:`/files/${f.file_object_id}/thumbnail?w=300`, style:{ maxWidth:'100%', height:'110px', objectFit:'cover' } });
            const cap = h('div', { className:'muted', style:{ fontSize:'12px' } }, [ f.original_name||'' ]);
            const zoomBtn = h('button', { title:'View larger', style:{ position:'absolute', right:'36px', top:'6px', background:'rgba(255,255,255,0.95)', border:'1px solid #ddd', borderRadius:'4px', padding:'2px 6px', cursor:'pointer' } }, ['🔍']);
            const editBtn = h('button', { title:'Edit', style:{ position:'absolute', right:'6px', top:'6px', background:'rgba(255,255,255,0.95)', border:'1px solid #ddd', borderRadius:'4px', padding:'2px 6px', cursor:'pointer' } }, ['✏️']);
            zoomBtn.addEventListener('click', (e)=>{ e.stopPropagation(); openLightbox(f.file_object_id, (f.original_name||f.key||f.file_object_id)); });
            editBtn.addEventListener('click', (e)=>{ e.stopPropagation(); sel.id=f.file_object_id; sel.name=(f.original_name||f.key||f.file_object_id); openEditor(sel.id, sel.name); });
            it.appendChild(im); it.appendChild(cap);
            it.appendChild(zoomBtn);
            it.appendChild(editBtn);
            it.addEventListener('click', ()=>{ grid.querySelectorAll('.modal-item').forEach(x=>x.classList.remove('active')); it.classList.add('active'); sel.id=f.file_object_id; sel.name=(f.original_name||f.key||f.file_object_id); const selBtn=card.querySelector('#mkSelect'); if (selBtn) selBtn.disabled=false; });
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
        // Render canvas at exact target pixel resolution for optimal export
        cvs.width = rec.w;
        cvs.height = rec.h;
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
        if (it.type === 'circle'){
          const r = Math.max(1, it.r||1);
          return { x: it.x - r, y: it.y - r, w: r*2, h: r*2 };
        }
        if (it.type === 'path'){
          const pts = it.points || [];
          if (!pts.length) return null;
          let minX=pts[0].x, minY=pts[0].y, maxX=pts[0].x, maxY=pts[0].y;
          for (const p of pts){ if (p.x<minX) minX=p.x; if (p.y<minY) minY=p.y; if (p.x>maxX) maxX=p.x; if (p.y>maxY) maxY=p.y; }
          return { x:minX, y:minY, w:(maxX-minX), h:(maxY-minY) };
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
          } else if (it.type === 'circle'){
            ctx.beginPath();
            ctx.arc(it.x, it.y, Math.max(1, it.r||1), 0, Math.PI*2);
            ctx.stroke();
          } else if (it.type === 'path'){
            const pts = it.points || [];
            if (pts.length>1){
              ctx.beginPath();
              ctx.moveTo(pts[0].x, pts[0].y);
              for (let i=1;i<pts.length;i++){ ctx.lineTo(pts[i].x, pts[i].y); }
              ctx.stroke();
            }
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

      function setMode(m){
        ES.mode = m;
        ['#mkTBPan','#mkTBRect','#mkTBArrow','#mkTBText'].forEach(sel=>{ const b=card.querySelector(sel); if (b) b.classList.remove('active'); });
        const tmap = { pan:'#mkTBPan', rect:'#mkTBRect', arrow:'#mkTBArrow', text:'#mkTBText', select:'#mkTBSelect', circle:'#mkTBCircle', draw:'#mkTBDraw' };
        const tbtn = card.querySelector(tmap[m]); if (tbtn) tbtn.classList.add('active');
        updatePhaseUI();
      }

      function updatePhaseUI(){
        const pImg = card.querySelector('#mkPhaseImg'); const pNotes = card.querySelector('#mkPhaseNotes');
        if (pImg && pNotes){ pImg.classList.remove('active'); pNotes.classList.remove('active'); if (ES.phase==='image') pImg.classList.add('active'); else pNotes.classList.add('active'); }
        const notesEnabled = ES.phase === 'notes';
        overlay.style.pointerEvents = notesEnabled ? 'auto' : 'none';
        // Helpers to toggle entire label groups
        const toggleLabelFor = (sel, show)=>{ const input = card.querySelector(sel); if (!input) return; const label = input.closest('label'); const node = label || input; node.style.display = show ? '' : 'none'; };
        const toggleBtn = (sel, show)=>{ const btn = card.querySelector(sel); if (btn) btn.style.display = show ? '' : 'none'; };
        const isImage = ES.phase === 'image';
        // Image phase controls
        toggleBtn('#mkTBPan', isImage);
        toggleBtn('#mkTBRotL', isImage);
        toggleBtn('#mkTBRotR', isImage);
        toggleLabelFor('#mkTBZoom', isImage);
        // Notes phase controls
        toggleBtn('#mkTBSelect', !isImage);
        toggleBtn('#mkTBRect', !isImage);
        toggleBtn('#mkTBArrow', !isImage);
        toggleBtn('#mkTBText', !isImage);
        toggleBtn('#mkTBCircle', !isImage);
        toggleBtn('#mkTBDraw', !isImage);
        toggleLabelFor('#mkColor', !isImage);
        toggleLabelFor('#mkStroke', !isImage);
        toggleLabelFor('#mkFont', !isImage);
        if (!notesEnabled){
          // Force Pan mode without recursion
          ES.mode = 'pan';
          ['#mkTBPan','#mkTBRect','#mkTBArrow','#mkTBText'].forEach(sel=>{ const b=card.querySelector(sel); if (b) b.classList.remove('active'); });
          const panBtn = card.querySelector('#mkTBPan'); if (panBtn) panBtn.classList.add('active');
        }
      }
      card.querySelector('#mkPhaseImg').addEventListener('click', ()=>{ ES.phase='image'; updatePhaseUI(); });
      card.querySelector('#mkPhaseNotes').addEventListener('click', ()=>{ ES.phase='notes'; updatePhaseUI(); });
      card.querySelector('#mkTBPan').addEventListener('click', ()=>setMode('pan'));
      card.querySelector('#mkTBSelect').addEventListener('click', ()=>setMode('select'));
      card.querySelector('#mkTBRect').addEventListener('click', ()=>setMode('rect'));
      card.querySelector('#mkTBArrow').addEventListener('click', ()=>setMode('arrow'));
      card.querySelector('#mkTBText').addEventListener('click', ()=>setMode('text'));
      card.querySelector('#mkTBCircle').addEventListener('click', ()=>setMode('circle'));
      card.querySelector('#mkTBDraw').addEventListener('click', ()=>setMode('draw'));
      card.querySelector('#mkColor').addEventListener('input', (e)=>{ ES.color=e.target.value; });
      card.querySelector('#mkStroke').addEventListener('input', (e)=>{ ES.stroke=parseInt(e.target.value||'3',10)||3; });
      card.querySelector('#mkFont').addEventListener('input', (e)=>{ ES.font=e.target.value||'16px Montserrat'; });
      let dragging=false, startX=0, startY=0; cvs.addEventListener('mousedown', (e)=>{ if (ES.phase!=='image' || ES.mode!=='pan') return; dragging=true; startX=e.offsetX; startY=e.offsetY; }); cvs.addEventListener('mousemove', (e)=>{ if (!dragging||ES.phase!=='image' || ES.mode!=='pan') return; ES.offsetX+=(e.offsetX-startX); ES.offsetY+=(e.offsetY-startY); startX=e.offsetX; startY=e.offsetY; redraw(); }); window.addEventListener('mouseup', ()=>{ dragging=false; });
      let drawing=null; overlay.style.pointerEvents='auto'; overlay.addEventListener('mousedown', (e)=>{ const x=e.offsetX, y=e.offsetY; if (ES.phase==='notes' && ES.mode==='rect'){ drawing={ id:'it_'+Date.now(), type:'rect', x, y, w:1, h:1, color:ES.color, stroke:ES.stroke }; ES.items.push(drawing); redraw(); } else if (ES.phase==='notes' && ES.mode==='arrow'){ drawing={ id:'it_'+Date.now(), type:'arrow', x, y, x2:x+1, y2:y+1, color:ES.color, stroke:ES.stroke }; ES.items.push(drawing); redraw(); } else if (ES.phase==='notes' && ES.mode==='circle'){ drawing={ id:'it_'+Date.now(), type:'circle', x, y, r:1, color:ES.color, stroke:ES.stroke }; ES.items.push(drawing); redraw(); } else if (ES.phase==='notes' && ES.mode==='draw'){ drawing={ id:'it_'+Date.now(), type:'path', points:[{x,y}], color:ES.color, stroke:ES.stroke }; ES.items.push(drawing); redraw(); } else if (ES.phase==='notes' && ES.mode==='text'){ const it={ id:'it_'+Date.now(), type:'text', x, y, text:'', font:ES.font, color:ES.color, stroke:ES.stroke, _editing:true }; ES.items.push(it); ES.selectedIds=[it.id]; redraw(); const onKey=(ev)=>{ if (!ES.selectedIds || ES.selectedIds[0]!==it.id) return; if (ev.key==='Enter'){ ev.preventDefault(); it._editing=false; ES.selectedIds=[]; window.removeEventListener('keydown', onKey); redraw(); } else if (ev.key==='Escape'){ ev.preventDefault(); ES.items=ES.items.filter(x=>x.id!==it.id); ES.selectedIds=[]; window.removeEventListener('keydown', onKey); redraw(); } else if (ev.key==='Backspace'){ ev.preventDefault(); it.text = (it.text||'').slice(0,-1); redraw(); } else if (ev.key.length===1){ it.text = (it.text||'') + ev.key; redraw(); } }; window.addEventListener('keydown', onKey); const onClickOutside=(ev)=>{ if (ev.target===overlay) return; it._editing=false; ES.selectedIds=[]; window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onClickOutside, true); redraw(); }; window.addEventListener('mousedown', onClickOutside, true); } else if (ES.phase==='notes' && (ES.mode==='pan' || ES.mode==='select')){ const hit=itemAt(e.offsetX,e.offsetY); if (e.shiftKey && !hit){ ES._marquee = { x:e.offsetX, y:e.offsetY, x2:e.offsetX, y2:e.offsetY }; } else if (hit){ if (!ES.selectedIds || !ES.selectedIds.includes(hit.id)){ ES.selectedIds=[hit.id]; } drawing=null; moving=true; mStart={x:e.offsetX, y:e.offsetY}; } else { ES.selectedIds=[]; } redraw(); } });
      overlay.addEventListener('mousemove', (e)=>{ if (ES._marquee){ ES._marquee.x2=e.offsetX; ES._marquee.y2=e.offsetY; redraw(); return; } if (!drawing) return; if (drawing.type==='rect'){ drawing.w=(e.offsetX-drawing.x); drawing.h=(e.offsetY-drawing.y); } if (drawing.type==='arrow'){ drawing.x2=e.offsetX; drawing.y2=e.offsetY; } if (drawing.type==='circle'){ const dx=e.offsetX-drawing.x, dy=e.offsetY-drawing.y; drawing.r=Math.max(1, Math.hypot(dx,dy)); } if (drawing.type==='path'){ drawing.points.push({ x:e.offsetX, y:e.offsetY }); } redraw(); });
      window.addEventListener('mouseup', ()=>{ if (drawing){ drawing=null; redraw(); } if (ES._marquee){ const m=ES._marquee; const x=Math.min(m.x,m.x2), y=Math.min(m.y,m.y2), w=Math.abs(m.x2-m.x), h=Math.abs(m.y2-m.y); const sel=[]; for (const it of ES.items){ const b=itemBounds(it); if (!b) continue; const inside=(b.x>=x && b.y>=y && (b.x+b.w)<=x+w && (b.y+b.h)<=y+h); if (inside) sel.push(it.id); } ES.selectedIds=sel; ES._marquee=null; redraw(); } moving=false; });
      let moving=false, mStart=null; function itemAt(x,y){ for (let i=ES.items.length-1;i>=0;i--){ const it=ES.items[i]; const b=itemBounds(it); if (b && x>=b.x && y>=b.y && x<=b.x+b.w && y<=b.y+b.h) return it; } return null; }
      overlay.addEventListener('mousemove', (e)=>{ if (!moving) return; const dx=e.offsetX-mStart.x, dy=e.offsetY-mStart.y; mStart={x:e.offsetX,y:e.offsetY}; const targets=(ES.selectedIds&&ES.selectedIds.length)?ES.selectedIds:[]; for (const it of ES.items){ if (targets.includes(it.id)){ if (it.type==='rect'){ it.x+=dx; it.y+=dy; } if (it.type==='arrow'){ it.x+=dx; it.y+=dy; it.x2+=dx; it.y2+=dy; } if (it.type==='text'){ it.x+=dx; it.y+=dy; } } } redraw(); });
      window.addEventListener('keydown', (e)=>{ if (e.key==='Delete' && ES.selectedIds && ES.selectedIds.length){ ES.items=ES.items.filter(it=>!ES.selectedIds.includes(it.id)); ES.selectedIds=[]; redraw(); } });
      card.querySelector('#mkTBRotL').addEventListener('click', ()=>{ ES.angle=(ES.angle+270)%360; redraw(); });
      card.querySelector('#mkTBRotR').addEventListener('click', ()=>{ ES.angle=(ES.angle+90)%360; redraw(); });
      const mkTBZoom = card.querySelector('#mkTBZoom');
      if (mkTBZoom){ mkTBZoom.addEventListener('input', (e)=>{ ES.scale=parseFloat(e.target.value||'1'); redraw(); }); }
      card.querySelector('#mkReset').addEventListener('click', ()=>{ ES.angle=0; ES.scale=1; ES.offsetX=0; ES.offsetY=0; ES.items=[]; ES.selectedIds=[]; redraw(); });
      card.querySelector('#mkBack').addEventListener('click', ()=>{ editor.style.display='none'; contentRow.style.display='flex'; });

      async function openEditor(fid, fname){
        try{
          const prevEl = document.getElementById('mkPreviewBox'); if (prevEl){ prevEl.style.pointerEvents='none'; }
          const url = '/files/'+encodeURIComponent(fid)+'/thumbnail?w=1600';
          ES = { ...ES, img:new Image(), angle:0, scale:1, offsetX:0, offsetY:0, aspect:rec.w/rec.h, items:[], selectedIds:[], fileId: fid, fileName: fname||fid, phase:'image', mode:'pan' };
          hint.textContent = `Edit ${fname||fid} — aspect ${(ES.aspect).toFixed(3)}`;
          await new Promise((res)=>{ ES.img.onload=()=>res(null); ES.img.onerror=()=>res(null); ES.img.src=url; });
          setCanvasSize(); redraw(); updatePhaseUI(); contentRow.style.display='none'; editor.style.display='block';
          if (prevEl){ prevEl.style.pointerEvents=''; }
        }catch(e){ alert('Failed to load image'); }
      }
      card.querySelector('#mkEdit').addEventListener('click', (e)=>{ e.stopPropagation(); if (!sel.id) return; openEditor(sel.id, sel.name); });
      card.querySelector('#mkApply').addEventListener('click', async ()=>{
        try{
          // Flatten overlay onto base before exporting
          const ctxBase = cvs.getContext('2d');
          ctxBase.drawImage(overlay, 0, 0);
          // Export at exact target size (canvas is already rec.w x rec.h)
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
          // Auto-complete: resolve with the new image immediately
          sel.id=conf.id; sel.name=f.name; doSelect();
        }catch(e){ alert('Apply failed'); }
      });

      // Select / Close (with delegation fallback)
      function doSelect(){ try{ console.log('[MKImagePicker] select', sel); }catch(e){} if (!sel.id){ alert('Pick an image'); return; } cleanup(); resolve({ file_object_id: sel.id, original_name: sel.name }); }
      function doClose(){ try{ console.log('[MKImagePicker] close'); }catch(e){} cleanup(); resolve(null); }
      const btnSelect = card.querySelector('#mkSelect'); if (btnSelect){ btnSelect.addEventListener('click', (e)=>{ e.stopPropagation(); doSelect(); }); }
      const btnClose = card.querySelector('#mkClose'); if (btnClose){ btnClose.addEventListener('click', (e)=>{ e.stopPropagation(); doClose(); }); }
      // (Removed inner card delegation to avoid duplicate handlers; using explicit + modal delegation)
      // Robust delegation from modal root using closest() (handles text-node clicks)
      modal.addEventListener('click', (e)=>{
        const btn = e.target && e.target.closest && e.target.closest('#mkClose, #mkEdit, #mkSelect');
        if (!btn) return;
        if (btn.id === 'mkClose'){ e.stopPropagation(); doClose(); return; }
        if (btn.id === 'mkEdit' && !btn.disabled){ e.stopPropagation(); if (!sel.id){ alert('Pick an image'); return; } openEditor(sel.id, sel.name); return; }
        if (btn.id === 'mkSelect' && !btn.disabled){ e.stopPropagation(); doSelect(); return; }
      });
      // Keyboard shortcuts when not in editor: Esc=close, Enter=select
      const onKey = (e)=>{ if (editor.style.display!=='block'){ if (e.key==='Escape'){ e.preventDefault(); doClose(); } else if (e.key==='Enter' && sel.id){ e.preventDefault(); doSelect(); } } };
      window.addEventListener('keydown', onKey);
      function cleanup(){ try{ window.removeEventListener('keydown', onKey); document.body.removeChild(modal); }catch(e){} }
    });
  }

  window.MKImagePicker = { open };
})();


