const canvas = document.getElementById('spriteCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

let imgW = 16, imgH = 16;
let zoom = 20;
let gridOn = true;
let penBlack = true;
let strokeActivePrimary = false;
let strokeActiveSecondary = false;

// 1-bit image buffer: 0 (black) or 255 (white) per pixel
let data = new Uint8ClampedArray(imgW * imgH).fill(255);

// Undo/redo
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 100;

function pushHistory(snapshot=null) {
  const snap = snapshot ? snapshot.slice() : data.slice();
  undoStack.push(snap);
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

function render() {
  canvas.width = imgW * zoom;
  canvas.height = imgH * zoom;
  const imgData = ctx.createImageData(canvas.width, canvas.height);
  for (let y=0; y<imgH; y++){
    for (let x=0; x<imgW; x++){
      const val = data[y*imgW + x];
      for (let yy=0; yy<zoom; yy++){
        for (let xx=0; xx<zoom; xx++){
          const cx = x*zoom + xx, cy = y*zoom + yy;
          const i = (cy*canvas.width + cx) * 4;
          imgData.data[i] = imgData.data[i+1] = imgData.data[i+2] = val;
          imgData.data[i+3] = 255;
        }
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
  if (gridOn && zoom >= 4) {
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
    for (let x=0; x<=imgW; x++){
      ctx.beginPath(); ctx.moveTo(x*zoom + 0.5, 0); ctx.lineTo(x*zoom + 0.5, imgH*zoom); ctx.stroke();
    }
    for (let y=0; y<=imgH; y++){
      ctx.beginPath(); ctx.moveTo(0, y*zoom + 0.5); ctx.lineTo(imgW*zoom, y*zoom + 0.5); ctx.stroke();
    }
  }
}

function setPixel(px, py, black) {
  if (px<0 || py<0 || px>=imgW || py>=imgH) return;
  data[py*imgW + px] = black ? 0 : 255;
  render();
}

function canvasToPNGBlob() {
  // Convert current 1-bit buffer to 1× PNG
  const c = document.createElement('canvas');
  c.width = imgW; c.height = imgH;
  const cctx = c.getContext('2d');
  const id = cctx.createImageData(imgW, imgH);
  for (let i=0; i<data.length; i++){
    const v = data[i];
    id.data[i*4+0]=id.data[i*4+1]=id.data[i*4+2]=v; id.data[i*4+3]=255;
  }
  cctx.putImageData(id, 0, 0);
  return new Promise(res => c.toBlob(res, 'image/png'));
}

// Mouse events
canvas.addEventListener('mousedown', (e)=>{
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left)/zoom);
  const y = Math.floor((e.clientY - rect.top)/zoom);
  if (e.button === 0) { pushHistory(); strokeActivePrimary = true; setPixel(x, y, penBlack); }
  else if (e.button === 2) { pushHistory(); strokeActiveSecondary = true; setPixel(x, y, !penBlack); }
});
canvas.addEventListener('mousemove', (e)=>{
  if (!strokeActivePrimary && !strokeActiveSecondary) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left)/zoom);
  const y = Math.floor((e.clientY - rect.top)/zoom);
  if (strokeActivePrimary) setPixel(x, y, penBlack);
  if (strokeActiveSecondary) setPixel(x, y, !penBlack);
});
canvas.addEventListener('mouseup', ()=>{ strokeActivePrimary=false; strokeActiveSecondary=false; });
canvas.addEventListener('mouseleave', ()=>{ strokeActivePrimary=false; strokeActiveSecondary=false; });
canvas.addEventListener('contextmenu', (e)=> e.preventDefault());

// Controls
const gridBtn = document.getElementById('gridBtn');
gridBtn.onclick = ()=>{ gridOn=!gridOn; render(); };

document.getElementById('zoomInBtn').onclick = ()=>{ zoom = Math.min(64, Math.max(1, zoom+1)); render(); };
document.getElementById('zoomOutBtn').onclick = ()=>{ zoom = Math.min(64, Math.max(1, zoom-1)); render(); };

document.getElementById('penBtn').onclick = function(){ penBlack=!penBlack; this.textContent = penBlack? "Pen: Black":"Pen: White"; };

// New sprite
const newDlg = document.getElementById('newDlg');
document.getElementById('newBtn').onclick = ()=> newDlg.showModal();
document.getElementById('createNew').onclick = ()=>{
  const w = parseInt(document.getElementById('newW').value,10);
  const h = parseInt(document.getElementById('newH').value,10);
  if (Number.isFinite(w) && Number.isFinite(h) && w>0 && h>0){
    pushHistory();
    imgW = w; imgH = h; data = new Uint8ClampedArray(w*h).fill(255);
    render();
  }
};

// Open file (client-only preview; PNG with threshold dialog; basic P1 parsing)
const openFile = document.getElementById('openFile');
openFile.onchange = async (e)=>{
  const file = e.target.files[0];
  if (!file) return;

  // For PNG: keep the client-side threshold preview dialog (as-is), but
  // still support a "server open" path for PBM (P1/P4) and fallback.
  if (/\.png$/i.test(file.name)) {
    // --- PNG: same threshold dialog as before ---
    const dlg = document.getElementById('thresholdDlg');
    const range = document.getElementById('thresholdRange');
    const prev = document.getElementById('thresholdPreview');
    const pctx = prev.getContext('2d', { willReadFrequently: true });
    const base = await createImageBitmap(file);
    prev.width = base.width; prev.height = base.height;

    function renderPreview(th){
      pctx.drawImage(base, 0, 0);
      const id = pctx.getImageData(0,0,prev.width,prev.height);
      for (let i=0; i<id.data.length; i+=4){
        const luma = 0.2126*id.data[i] + 0.7152*id.data[i+1] + 0.0722*id.data[i+2];
        const v = (luma >= th) ? 255 : 0;
        id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255;
      }
      pctx.putImageData(id, 0, 0);
    }
    renderPreview(parseInt(range.value,10));
    range.oninput = ()=> renderPreview(parseInt(range.value,10));
    dlg.showModal();

    document.getElementById('applyThreshold').onclick = ()=>{
      const id = pctx.getImageData(0,0,prev.width,prev.height);
      imgW = prev.width; imgH = prev.height;
      data = new Uint8ClampedArray(imgW*imgH);
      for (let y=0;y<imgH;y++){
        for (let x=0;x<imgW;x++){
          const i = (y*imgW + x)*4;
          data[y*imgW+x] = id.data[i]; // already 0/255
        }
      }
      render();
    };
    document.getElementById('cancelThreshold').onclick = ()=> {};
    return;
  }

  // --- PBM or anything else: send to backend /api/open (handles P1 & P4) ---
  const fd = new FormData();
  fd.append('file', file, file.name);
  const r = await fetch('/api/open', { method: 'POST', body: fd });
  if (!r.ok) {
    const err = await r.json().catch(()=>({error: r.statusText}));
    alert('Open failed: ' + (err.error || 'unknown error'));
    return;
  }
  const res = await r.json();
  // res: { width, height, png: "data:image/png;base64,..." }
  const img = new Image();
  img.onload = ()=>{
    // Draw the server-returned 1-bit PNG into our internal buffer
    imgW = res.width; imgH = res.height;
    const c = document.createElement('canvas');
    c.width = imgW; c.height = imgH;
    const cctx = c.getContext('2d');
    cctx.drawImage(img, 0, 0);
    const id = cctx.getImageData(0,0,imgW,imgH);
    data = new Uint8ClampedArray(imgW*imgH);
    for (let i=0; i<imgW*imgH; i++){
      data[i] = id.data[i*4]; // grayscale 0/255
    }
    render();
  };
  img.src = res.png;
};


// Save/export via backend
async function postBlob(url, blob, extraForm={}) {
  const fd = new FormData();
  fd.append('img', blob, 'sprite.png');
  Object.entries(extraForm).forEach(([k,v]) => fd.append(k, v));
  const r = await fetch(url, { method: 'POST', body: fd });
  return r;
}

document.getElementById('saveP4Btn').onclick = async ()=>{
  const blob = await canvasToPNGBlob();
  const r = await postBlob('/api/save_p4', blob);
  const file = await r.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'sprite.pbm'; a.click();
};

document.getElementById('exportP1Btn').onclick = async ()=>{
  const blob = await canvasToPNGBlob();
  const r = await postBlob('/api/export_p1', blob);
  const file = await r.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'sprite_p1.pbm'; a.click();
};

document.getElementById('exportPNGBtn').onclick = async ()=>{
  const blob = await canvasToPNGBlob();
  const r = await postBlob('/api/export_png', blob, { zoom: String(zoom) });
  const file = await r.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = 'sprite_preview.png'; a.click();
};

// Keyboard shortcuts
document.addEventListener('keydown', (e)=>{
  if (e.ctrlKey && e.key.toLowerCase()==='z'){
    if (!undoStack.length) return;
    const redoSnap = data.slice();
    const snap = undoStack.pop();
    data = snap; redoStack.push(redoSnap);
    render();
  } else if ((e.ctrlKey && e.key.toLowerCase()==='y') || (e.ctrlKey && e.shiftKey && e.key.toLowerCase()==='z')) {
    if (!redoStack.length) return;
    const undoSnap = data.slice();
    const snap = redoStack.pop();
    data = snap; undoStack.push(undoSnap);
    render();
  } else if (e.key === 'g') { gridOn = !gridOn; render();
  } else if (e.key === '+' || e.key === '=') { zoom = Math.min(64, Math.max(1, zoom+1)); render();
  } else if (e.key === '-') { zoom = Math.min(64, Math.max(1, zoom-1)); render(); }
});

// Init
render();
