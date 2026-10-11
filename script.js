(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const previewCanvas = $("previewCanvas");
  const selectionOverlay = $("selectionOverlay");
  const imageViewport = $("imageViewport");
  const emptyState = $("emptyState");
  const canvasStage = $("canvasStage");
  const exportButton = $("exportButton");
  const sliderIds = ["exposure","brightness","contrast","highlights","shadows","ambience","saturation","vibrance","warmth","tint","hue","colorLuminance","structure","sharpen","fade","vignette"];
  const defaults = {exposure:0,brightness:100,contrast:100,highlights:0,shadows:0,ambience:0,saturation:100,vibrance:0,warmth:0,tint:0,hue:0,colorLuminance:0,structure:0,sharpen:0,fade:0,vignette:0};
  const presets = {
    original: {...defaults},
    portrait: {...defaults,exposure:4,brightness:103,contrast:96,highlights:-22,shadows:22,ambience:18,saturation:96,vibrance:12,warmth:5,tint:2,structure:5,sharpen:12,fade:5,vignette:8},
    warm: {...defaults,exposure:3,contrast:106,highlights:-15,shadows:12,ambience:8,saturation:108,vibrance:8,warmth:25,tint:3,structure:10,sharpen:12,fade:13,vignette:18},
    cool: {...defaults,exposure:3,brightness:102,contrast:103,highlights:-8,shadows:12,saturation:95,vibrance:10,warmth:-19,tint:-3,structure:8,sharpen:18,vignette:5},
    noir: {...defaults,exposure:2,contrast:125,highlights:-18,shadows:10,ambience:5,saturation:0,structure:20,sharpen:18,vignette:24},
    blackwhite: {...defaults,contrast:112,highlights:-12,shadows:12,saturation:0,structure:8,sharpen:12,vignette:12},
    dramatic: {...defaults,exposure:-5,contrast:123,highlights:-28,shadows:17,ambience:12,saturation:109,vibrance:12,warmth:-3,structure:27,sharpen:23,vignette:23}
  };
  const state = {fileName:"",sourceUrl:"",objectUrl:"",imageElement:null,rotation:0,flipped:false,cropRect:null,settings:{...defaults},layers:[],activeLayerId:null,selectionMask:null,selectionTool:"rectangle",selectionStart:null,selectionCurrent:null,selectionDrawing:false,brushSize:32,baseVisible:true,layerCounter:0};
  let canvasTool = "select";
  let canvasZoom = 1;
  let canvasPan = {x:0,y:0};
  let panGesture = null;
  let undoStack = [];
  let redoStack = [];
  let toastTimeout = 0;
  let previewFrame = 0;
  let compareMode = false;
  let gestureActive = false;
  let activePreset = "original";
  let canvasMoveGesture = null;
  let panelDragGesture = null;

  function notify(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }

  function editingSettings() {
    const layer=state.layers.find((item)=>item.id===state.activeLayerId);
    return layer && layer.settings ? layer.settings : state.settings;
  }
  function snapshot() {
    return {settings:{...state.settings},rotation:state.rotation,flipped:state.flipped,cropRect:state.cropRect?{...state.cropRect}:null,activePreset:activePreset,layers:state.layers.map((layer)=>({...layer,settings:layer.settings?{...layer.settings}:undefined,maskCanvas:cloneCanvas(layer.maskCanvas),pixelCanvas:cloneCanvas(layer.pixelCanvas)})),activeLayerId:state.activeLayerId,baseVisible:state.baseVisible,layerCounter:state.layerCounter};
  }

  function recordHistory() {
    if (!state.imageElement) return;
    undoStack.push(snapshot());
    if (undoStack.length > 60) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    $("undoButton").disabled = undoStack.length === 0;
    $("redoButton").disabled = redoStack.length === 0;
    $("resetButton").disabled = !state.imageElement;
  }
  function cloneCanvas(source) {
    if (!source) return null;
    const copy=document.createElement("canvas"); copy.width=source.width; copy.height=source.height;
    copy.getContext("2d").drawImage(source,0,0); return copy;
  }
  function normalizeLayerMask(mask,width,height) {
    const normalized=document.createElement("canvas");
    normalized.width=width;normalized.height=height;
    if(mask&&width&&height){
      const context=normalized.getContext("2d");
      context.imageSmoothingEnabled=false;
      context.drawImage(mask,0,0,width,height);
    }
    return normalized;
  }
  function updateSelectionControls() {
    $("clearSelectionButton").disabled=!state.selectionMask;
    $("addAreaLayerButton").disabled=!state.selectionMask || !state.imageElement;
    $("createPixelLayerButton").disabled=!state.selectionMask || !state.imageElement;
    $("cropSelectionButton").disabled=!state.selectionMask || state.selectionTool!=="rectangle" || !state.imageElement;
    $("selectionStatus").textContent=state.selectionMask ? "Area selected. Add an area layer, then use Edit to tune only this region." : (state.activeLayerId ? "Drag the selected area on the canvas to reposition it. Select the base photo below to draw a new area." : "Draw a shape or brush over the photo, then add an area layer.");
    document.querySelectorAll("[data-selection-tool]").forEach((button)=>{const active=button.dataset.selectionTool===state.selectionTool;button.classList.toggle("active",active);button.setAttribute("aria-pressed",String(active));});
  }
  function renderLayerList() {
    const list=$("layerList");
    if (!state.imageElement) {list.innerHTML='<div class="layer-empty">Open an image to create your first layer.</div>'; $("layerCount").textContent="0";return;}
    let markup="";
    state.layers.slice().reverse().forEach((layer)=>{
      const active=layer.id===state.activeLayerId;
      const index=state.layers.findIndex((item)=>item.id===layer.id);
      const blendModes=[["source-over","Normal"],["multiply","Multiply"],["screen","Screen"],["overlay","Overlay"],["darken","Darken"],["lighten","Lighten"],["color-dodge","Color dodge"],["color-burn","Color burn"],["hard-light","Hard light"],["soft-light","Soft light"],["difference","Difference"],["exclusion","Exclusion"]];
      const blendOptions=blendModes.map(([value,label])=>'<option value="'+value+'"'+((layer.blendMode||"source-over")===value?' selected':'')+'>'+label+'</option>').join("");
      markup+='<div class="layer-row'+(active?' is-active':'')+'" data-layer-row="'+layer.id+'"><button class="layer-drag-handle" type="button" data-layer-drag-handle="'+layer.id+'" aria-label="Drag '+escapeHtml(layer.name)+' to reorder" title="Drag to reorder">⠿</button><div class="layer-thumb layer-adjustment-thumb">◉</div><button class="layer-select-button" type="button" data-select-layer="'+layer.id+'" aria-pressed="'+active+'">'+escapeHtml(layer.name)+'<small>'+(layer.type==="pixel"?"Pixel layer · ":"Area adjustment · ")+Math.round(layer.opacity*100)+'%</small></button><button class="icon-button layer-eye'+(layer.visible?"":" is-hidden")+'" type="button" data-toggle-layer="'+layer.id+'" aria-label="Toggle '+escapeHtml(layer.name)+' visibility" title="Toggle visibility"><svg><use href="#i-eye"/></svg></button><details class="layer-options"><summary class="icon-button layer-menu" aria-label="Manage '+escapeHtml(layer.name)+'" title="Layer options">•••</summary><div class="layer-options-menu"><div class="layer-menu-title">'+escapeHtml(layer.name)+'</div><div class="layer-order-actions"><button type="button" data-layer-action="up" data-layer-id="'+layer.id+'" '+(index===state.layers.length-1?'disabled':'')+'>↑ Move up</button><button type="button" data-layer-action="down" data-layer-id="'+layer.id+'" '+(index===0?'disabled':'')+'>↓ Move down</button></div><label class="layer-blend-control" for="blend-'+layer.id+'"><span>Blend mode</span><select id="blend-'+layer.id+'" data-layer-blend="'+layer.id+'">'+blendOptions+'</select></label><label class="layer-opacity-control" for="opacity-'+layer.id+'"><span>Opacity <output data-opacity-value="'+layer.id+'">'+Math.round(layer.opacity*100)+'%</output></span><input id="opacity-'+layer.id+'" type="range" min="0" max="100" value="'+Math.round(layer.opacity*100)+'" data-layer-opacity="'+layer.id+'"></label><button type="button" data-layer-action="duplicate" data-layer-id="'+layer.id+'">Duplicate layer</button><button type="button" data-layer-action="rename" data-layer-id="'+layer.id+'">Rename layer</button><button class="layer-danger" type="button" data-layer-action="delete" data-layer-id="'+layer.id+'">Delete layer</button></div></details></div>';
    });
    const baseActive=!state.activeLayerId;
    markup+='<div class="layer-row layer-background'+(baseActive?' is-active':'')+'"><div class="layer-thumb"><img src="'+state.sourceUrl+'" alt=""></div><button class="layer-select-button" type="button" data-select-base aria-pressed="'+baseActive+'">'+escapeHtml(state.fileName)+'<small>Background photo · base</small></button><button class="icon-button layer-eye'+(state.baseVisible?"":" is-hidden")+'" type="button" data-toggle-base aria-label="Toggle photo visibility" title="Toggle photo visibility"><svg><use href="#i-eye"/></svg></button><span class="layer-lock" aria-label="Base layer stays at the bottom" title="Base photo">BASE</span></div>';
    list.innerHTML=markup; $("layerCount").textContent=String(state.layers.length+1);
  }

  function moveLayer(id,direction) {
    const from=state.layers.findIndex((layer)=>layer.id===id), to=from+direction;
    if(from<0||to<0||to>=state.layers.length)return;
    recordHistory();
    const [layer]=state.layers.splice(from,1);state.layers.splice(to,0,layer);
    state.activeLayerId=id;renderLayerList();schedulePreview();notify(direction>0?"Layer moved up":"Layer moved down");
  }
  function duplicateLayer(id) {
    const index=state.layers.findIndex((layer)=>layer.id===id);if(index<0)return;
    recordHistory();const source=state.layers[index];state.layerCounter+=1;
    const copy={...source,id:(source.type==="pixel"?"pixel-":"area-")+state.layerCounter,name:source.name+" copy",settings:source.settings?{...source.settings}:undefined,maskCanvas:cloneCanvas(source.maskCanvas),pixelCanvas:cloneCanvas(source.pixelCanvas),offsetX:source.offsetX||0,offsetY:source.offsetY||0,visible:source.visible,opacity:source.opacity};
    state.layers.splice(index+1,0,copy);state.activeLayerId=copy.id;syncControls();renderLayerList();schedulePreview();notify("Layer duplicated");
  }
  function renameLayer(id) {
    const layer=state.layers.find((item)=>item.id===id);if(!layer)return;
    const proposed=window.prompt("Rename layer",layer.name);if(proposed===null)return;
    const name=proposed.trim();if(!name){notify("Layer name cannot be empty");return;}
    recordHistory();layer.name=name;renderLayerList();notify("Layer renamed");
  }
  function deleteLayer(id) {
    const index=state.layers.findIndex((layer)=>layer.id===id);if(index<0)return;
    recordHistory();state.layers.splice(index,1);
    if(state.activeLayerId===id)state.activeLayerId=state.layers.length?state.layers[state.layers.length-1].id:null;
    syncControls();renderLayerList();schedulePreview();notify("Area layer removed");
  }

    function setActiveLayer(id) {
    state.activeLayerId=id; activePreset=""; syncControls(); renderLayerList(); schedulePreview();
    if (!$("adjustmentsPanel").hidden) $("panelTitle").textContent=id?"Tune layer":"Tune image";
    notify(id?"Area layer selected":"Photo layer selected");
  }
  function addAreaLayer() {
    if(!state.imageElement||!state.selectionMask){notify("Select an area first.");return;}
    recordHistory();state.layerCounter+=1;const id="area-"+state.layerCounter;
    state.layers.push({id,type:"adjustment",name:"Area "+state.layerCounter,settings:{...defaults},maskCanvas:cloneCanvas(state.selectionMask),offsetX:0,offsetY:0,referenceWidth:previewCanvas.width,referenceHeight:previewCanvas.height,blendMode:"source-over",visible:true,opacity:1});
    state.activeLayerId=id;clearSelection();renderLayerList();syncControls();schedulePreview();notify("Area adjustment layer added");
  }
  function createPixelLayerFromSelection() {
    if(!state.imageElement||!state.selectionMask){notify("Select an area first.");return;}
    const source=renderImage(1100,false);if(!source){notify("Could not create pixel layer.");return;}
    const masked=document.createElement("canvas");masked.width=source.width;masked.height=source.height;
    const context=masked.getContext("2d");context.drawImage(source,0,0);
    context.globalCompositeOperation="destination-in";
    context.drawImage(normalizeLayerMask(state.selectionMask,source.width,source.height),0,0);
    context.globalCompositeOperation="source-over";
    // Crop to the selected pixels so the layer can be positioned independently.
    const frame=context.getImageData(0,0,masked.width,masked.height).data;
    let left=masked.width,top=masked.height,right=-1,bottom=-1;
    for(let y=0;y<masked.height;y++){
      for(let x=0;x<masked.width;x++){
        if(frame[(y*masked.width+x)*4+3]>0){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}
      }
    }
    if(right<left||bottom<top){notify("The selected area contains no pixels.");return;}
    const pixels=document.createElement("canvas");pixels.width=right-left+1;pixels.height=bottom-top+1;
    pixels.getContext("2d").drawImage(masked,left,top,pixels.width,pixels.height,0,0,pixels.width,pixels.height);
    recordHistory();state.layerCounter+=1;const id="pixel-"+state.layerCounter;
    // Start the cropped layer in the centre of the canvas.
    const offsetX=Math.round((source.width-pixels.width)/2);
    const offsetY=Math.round((source.height-pixels.height)/2);
    state.layers.push({id,type:"pixel",name:"Pixel "+state.layerCounter,pixelCanvas:pixels,settings:{...defaults},offsetX,offsetY,referenceWidth:source.width,referenceHeight:source.height,blendMode:"source-over",visible:true,opacity:1});
    state.activeLayerId=id;clearSelection();renderLayerList();syncControls();schedulePreview();
    notify("Pixel layer created in the centre · original photo stays underneath");
  }

    function clearSelection() {
    state.selectionMask=null;state.selectionStart=null;state.selectionCurrent=null;state.selectionDrawing=false;
    const ctx=selectionOverlay.getContext("2d");ctx.clearRect(0,0,selectionOverlay.width,selectionOverlay.height);updateSelectionControls();
  }
  function drawSelectionOverlay() {
    if (!previewCanvas.width || !previewCanvas.height) return;
    if(selectionOverlay.width!==previewCanvas.width)selectionOverlay.width=previewCanvas.width;
    if(selectionOverlay.height!==previewCanvas.height)selectionOverlay.height=previewCanvas.height;
    const ctx=selectionOverlay.getContext("2d");ctx.clearRect(0,0,selectionOverlay.width,selectionOverlay.height);
    const activeLayer=state.layers.find((layer)=>layer.id===state.activeLayerId);
    const visibleMask=state.selectionMask || (activeLayer && activeLayer.visible ? (activeLayer.type==="pixel" ? activeLayer.pixelCanvas : activeLayer.maskCanvas) : null);
    if(visibleMask){ctx.save();ctx.globalAlpha=.25;ctx.imageSmoothingEnabled=false;if(activeLayer&&!state.selectionMask)ctx.drawImage(visibleMask,activeLayer.offsetX||0,activeLayer.offsetY||0);else ctx.drawImage(visibleMask,0,0,selectionOverlay.width,selectionOverlay.height);ctx.restore();}
    if(state.selectionDrawing&&state.selectionStart&&state.selectionCurrent&&state.selectionTool!=="brush"){
      const a=state.selectionStart,b=state.selectionCurrent;ctx.save();ctx.strokeStyle="#d8ef9b";ctx.lineWidth=Math.max(1,selectionOverlay.width/800*1.5);ctx.setLineDash([7,4]);
      if(state.selectionTool==="rectangle")ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);
      else{ctx.beginPath();ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.abs(b.x-a.x)/2,Math.abs(b.y-a.y)/2,0,0,Math.PI*2);ctx.stroke();}ctx.restore();
    }
  }
  function setCanvasTool(tool) {
    if (!["move","select"].includes(tool)) return;
    canvasTool=tool;
    document.querySelectorAll("[data-canvas-tool]").forEach((button)=>{
      const active=button.dataset.canvasTool===tool;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    selectionOverlay.classList.toggle("is-moving-layer",tool==="move");
    selectionOverlay.style.cursor=tool==="move"?"grab":"crosshair";
  }
  function applyCanvasView() {
    const stack=$("canvasStack");
    if(!stack)return;
    stack.style.transform="translate("+canvasPan.x+"px, "+canvasPan.y+"px) scale("+canvasZoom+")";
    $("zoomLabel").textContent=Math.round(canvasZoom*100)+"%";
    $("zoomCanvasButton").setAttribute("aria-label","Zoom canvas ("+Math.round(canvasZoom*100)+"%)");
  }
  function cycleCanvasZoom() {
    canvasZoom=canvasZoom>=2?1:canvasZoom===1?1.25:canvasZoom===1.25?1.5:2;
    if(canvasZoom===1)canvasPan={x:0,y:0};
    applyCanvasView();
    notify("Canvas zoom · "+Math.round(canvasZoom*100)+"%");
  }
  function beginPan(event) {
    event.preventDefault();
    selectionOverlay.setPointerCapture(event.pointerId);
    panGesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,originX:canvasPan.x,originY:canvasPan.y,moved:false};
    selectionOverlay.style.cursor="grabbing";
  }
  function movePan(event) {
    if(!panGesture||panGesture.pointerId!==event.pointerId)return;
    event.preventDefault();
    const dx=event.clientX-panGesture.startX,dy=event.clientY-panGesture.startY;
    if(Math.abs(dx)+Math.abs(dy)>2)panGesture.moved=true;
    canvasPan={x:panGesture.originX+dx,y:panGesture.originY+dy};
    applyCanvasView();
  }
  function finishPan(event) {
    if(!panGesture||panGesture.pointerId!==event.pointerId)return;
    panGesture=null;
    selectionOverlay.style.cursor="grab";
  }
  function selectionPoint(event) {
    const rect=selectionOverlay.getBoundingClientRect();
    return {x:Math.max(0,Math.min(previewCanvas.width,(event.clientX-rect.left)/Math.max(1,rect.width)*previewCanvas.width)),y:Math.max(0,Math.min(previewCanvas.height,(event.clientY-rect.top)/Math.max(1,rect.height)*previewCanvas.height))};
  }
  function beginCanvasGesture(event) {
    if (!state.imageElement || !previewCanvas.width) return;
    if(canvasTool==="select"){beginSelection(event);return;}
    if(canvasTool==="move"&&!state.activeLayerId){beginPan(event);return;}
    if(canvasTool==="move"&&state.activeLayerId){
    const layer = state.layers.find((item) => item.id === state.activeLayerId);
    const isPixel=layer&&layer.type==="pixel";
    if (!layer || (isPixel ? !layer.pixelCanvas : !layer.maskCanvas) || event.button === 2) return;
    event.preventDefault();
    selectionOverlay.setPointerCapture(event.pointerId);
    const rect=selectionOverlay.getBoundingClientRect();
    const original=normalizeLayerMask(isPixel?layer.pixelCanvas:layer.maskCanvas,previewCanvas.width,previewCanvas.height);
    recordHistory();
    canvasMoveGesture = {
      pointerId:event.pointerId,
      layerId:layer.id,
      isPixel,
      originX:layer.offsetX||0,
      originY:layer.offsetY||0,
      startClientX:event.clientX,
      startClientY:event.clientY,
      scaleX:previewCanvas.width/Math.max(1,rect.width),
      scaleY:previewCanvas.height/Math.max(1,rect.height),
      original,
      moved:false
    };
    selectionOverlay.classList.add("is-moving-layer");
    return;
    }
  }
  function moveCanvasGesture(event) {
    if(panGesture){movePan(event);return;}
    if (!canvasMoveGesture || canvasMoveGesture.pointerId !== event.pointerId) {
      if (!canvasMoveGesture) moveSelection(event);
      return;
    }
    event.preventDefault();
    // Use the original pointer-down point and the displayed canvas scale.
    // Do not clamp pointer coordinates to the image bounds: clamping creates
    // an invisible drag wall and causes the mask to lag behind the finger.
    const dx=Math.round((event.clientX-canvasMoveGesture.startClientX)*canvasMoveGesture.scaleX);
    const dy=Math.round((event.clientY-canvasMoveGesture.startClientY)*canvasMoveGesture.scaleY);
    if (!dx && !dy) return;
    const layer = state.layers.find((item) => item.id === canvasMoveGesture.layerId);
    if (!layer) return;
    layer.offsetX=canvasMoveGesture.originX+dx;
    layer.offsetY=canvasMoveGesture.originY+dy;
    canvasMoveGesture.moved = true;
    schedulePreview();
    drawSelectionOverlay();
  }
  function finishCanvasGesture(event) {
    if(panGesture){finishPan(event);return;}
    if (canvasMoveGesture) {
      const moved = canvasMoveGesture.moved;
      canvasMoveGesture = null;
      selectionOverlay.classList.remove("is-moving-layer");
      if (moved) { renderLayerList(); schedulePreview(); notify("Area layer repositioned"); }
      return;
    }
    finishSelection(event);
  }

  function beginSelection(event) {
    if(!state.imageElement||!previewCanvas.width)return;event.preventDefault();selectionOverlay.setPointerCapture(event.pointerId);
    const point=selectionPoint(event);state.selectionMask=document.createElement("canvas");state.selectionMask.width=previewCanvas.width;state.selectionMask.height=previewCanvas.height;
    state.selectionStart=point;state.selectionCurrent=point;state.selectionDrawing=true;
    if(state.selectionTool==="brush"){const ctx=state.selectionMask.getContext("2d");ctx.strokeStyle="#fff";ctx.fillStyle="#fff";ctx.lineWidth=state.brushSize;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.arc(point.x,point.y,state.brushSize/2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(point.x,point.y);}
    drawSelectionOverlay();updateSelectionControls();
  }
  function moveSelection(event) {
    if(!state.selectionDrawing)return;event.preventDefault();const point=selectionPoint(event);state.selectionCurrent=point;
    if(state.selectionTool==="brush"){const ctx=state.selectionMask.getContext("2d");ctx.strokeStyle="#fff";ctx.lineWidth=state.brushSize;ctx.lineCap="round";ctx.lineJoin="round";ctx.lineTo(point.x,point.y);ctx.stroke();ctx.beginPath();ctx.moveTo(point.x,point.y);}
    drawSelectionOverlay();
  }
  function finishSelection(event) {
    if(!state.selectionDrawing)return;const point=selectionPoint(event);state.selectionCurrent=point;
    if(state.selectionTool!=="brush"){const ctx=state.selectionMask.getContext("2d");ctx.fillStyle="#fff";const a=state.selectionStart,b=point;
      if(state.selectionTool==="rectangle")ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));
      else{ctx.beginPath();ctx.ellipse((a.x+b.x)/2,(a.y+b.y)/2,Math.max(1,Math.abs(b.x-a.x)/2),Math.max(1,Math.abs(b.y-a.y)/2),0,0,Math.PI*2);ctx.fill();}}
    state.selectionDrawing=false;state.selectionStart=null;state.selectionCurrent=null;drawSelectionOverlay();updateSelectionControls();notify("Area selected");
  }
  function applyAreaLayers(base) {
    const baseContext=base.getContext("2d");
    if(!state.baseVisible)baseContext.clearRect(0,0,base.width,base.height);
    const layerSource=cloneCanvas(base);
    state.layers.forEach((layer)=>{
      if(!layer.visible||layer.opacity<=0)return;
      const refWidth=Math.max(1,layer.referenceWidth||base.width);
      const refHeight=Math.max(1,layer.referenceHeight||base.height);
      const scaleX=base.width/refWidth;
      const scaleY=base.height/refHeight;
      const blendMode=layer.blendMode||"source-over";
      if(layer.type==="pixel"&&layer.pixelCanvas){
        const source=layer.pixelCanvas;
        const tuned=document.createElement("canvas");
        tuned.width=Math.max(1,Math.round(source.width*scaleX));
        tuned.height=Math.max(1,Math.round(source.height*scaleY));
        const tunedContext=tuned.getContext("2d");
        if(!tunedContext)return;
        tunedContext.imageSmoothingEnabled=true;
        tunedContext.drawImage(source,0,0,tuned.width,tuned.height);
        if(layer.settings)processCanvas(tuned,layer.settings);
        baseContext.save();
        baseContext.globalAlpha=layer.opacity;
        baseContext.globalCompositeOperation=blendMode;
        baseContext.drawImage(tuned,(layer.offsetX||0)*scaleX,(layer.offsetY||0)*scaleY);
        baseContext.restore();
        return;
      }
      if(!layer.maskCanvas||!layer.settings)return;
      const adjusted=cloneCanvas(layerSource);
      if(!processCanvas(adjusted,layer.settings))return;
      const shiftedMask=document.createElement("canvas");
      shiftedMask.width=adjusted.width;shiftedMask.height=adjusted.height;
      const maskContext=shiftedMask.getContext("2d");
      maskContext.imageSmoothingEnabled=false;
      maskContext.drawImage(layer.maskCanvas,(layer.offsetX||0)*scaleX,(layer.offsetY||0)*scaleY,layer.maskCanvas.width*scaleX,layer.maskCanvas.height*scaleY);
      const adjustedContext=adjusted.getContext("2d");
      adjustedContext.globalCompositeOperation="destination-in";
      adjustedContext.drawImage(shiftedMask,0,0);
      adjustedContext.globalCompositeOperation="source-over";
      baseContext.save();
      baseContext.globalAlpha=layer.opacity;
      baseContext.globalCompositeOperation=blendMode;
      baseContext.drawImage(adjusted,0,0);
      baseContext.restore();
    });
    return base;
  }
  function restoreSnapshot(saved) {
    state.settings = {...saved.settings};
    state.rotation = saved.rotation;
    state.flipped = saved.flipped;
    state.cropRect = saved.cropRect ? {...saved.cropRect} : null;
    state.layers = (saved.layers || []).map((layer)=>({...layer,settings:layer.settings?{...layer.settings}:undefined,maskCanvas:cloneCanvas(layer.maskCanvas),pixelCanvas:cloneCanvas(layer.pixelCanvas)}));
    state.activeLayerId = saved.activeLayerId || null;
    state.baseVisible = saved.baseVisible !== false;
    state.layerCounter = saved.layerCounter || state.layers.length;
    activePreset = saved.activePreset || "";
    syncControls();renderLayerList();schedulePreview();updateHistoryButtons();
  }

    function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restoreSnapshot(undoStack.pop());
    notify("Undo");
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restoreSnapshot(redoStack.pop());
    notify("Redo");
  }

  function beginGesture() {
    if (gestureActive) return;
    recordHistory();
    gestureActive = true;
  }

  function endGesture() { gestureActive = false; }

  function openPicker() { fileInput.click(); }

  function setImageLoaded(loaded) {
    emptyState.hidden=loaded;imageViewport.hidden=!loaded;exportButton.disabled=!loaded;
    $("rotateButton").disabled=!loaded;$("flipButton").disabled=!loaded;$("compareButton").disabled=!loaded;
    $("transformRotate").disabled=!loaded;$("transformFlip").disabled=!loaded;$("transformReset").disabled=!loaded;
    $("canvasStatus").textContent=loaded?state.fileName:"No image loaded";$("documentTitle").textContent=loaded?state.fileName:"Untitled project";
    if(!loaded){state.layers=[];state.activeLayerId=null;state.baseVisible=true;clearSelection();}
    renderLayerList();updateSelectionControls();updateHistoryButtons();
  }

  function readFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { notify("Please choose an image file."); return; }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    state.sourceUrl = state.objectUrl;
    state.fileName = file.name || "Untitled image";
    const image = new Image();
    image.onload = () => {
      state.imageElement = image;
      state.rotation = 0;
      state.flipped = false;
      state.cropRect = null;
      state.settings = {...defaults};
      state.layers=[];state.activeLayerId=null;state.baseVisible=true;state.layerCounter=0;clearSelection();
      compareMode = false;
      previewCanvas.hidden = false;
      $("compareButton").setAttribute("aria-pressed", "false");
      undoStack = [];
      redoStack = [];
      activePreset = "original";
      syncControls();
      setImageLoaded(true);
      const rotated = Math.abs(state.rotation % 180) === 90;
      $("imageDimensions").textContent = "Canvas · " + (rotated ? image.naturalHeight + " × " + image.naturalWidth : image.naturalWidth + " × " + image.naturalHeight);
      setActivePanel("adjustments");
      schedulePreview();
      notify("Photo ready to edit");
    };
    image.onerror = () => notify("This image could not be opened.");
    image.src = state.sourceUrl;
  }

  function sliderValueLabel(id,value) {
    if(["brightness","contrast","saturation"].includes(id))return value+"%";
    if(id==="hue")return (value>0?"+":"")+value+"°";
    return value>0?"+"+value:String(value);
  }

  function syncControls() {
    const currentSettings=editingSettings();
    sliderIds.forEach((id) => {
      $(id).value = currentSettings[id];
      const output = $(id + "Value");
      const value = currentSettings[id];
      output.value = sliderValueLabel(id,value);
    });
    $("exportQualityValue").value = $("exportQuality").value + "%";
    document.querySelectorAll("[data-preset]").forEach((button) => button.classList.toggle("active", button.dataset.preset === activePreset));
  }

  function clamp(value,min,max) { return Math.max(min,Math.min(max,value)); }

  function transformedSource(maxDimension) {
    const image = state.imageElement;
    if (!image) return null;
    const scale = maxDimension ? Math.min(1,maxDimension/Math.max(image.naturalWidth,image.naturalHeight)) : 1;
    const w = Math.max(1,Math.round(image.naturalWidth*scale));
    const h = Math.max(1,Math.round(image.naturalHeight*scale));
    const sideways = Math.abs(state.rotation % 180) === 90;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? h : w;
    canvas.height = sideways ? w : h;
    const context = canvas.getContext("2d",{willReadFrequently:true});
    if (!context) return null;
    context.translate(canvas.width/2,canvas.height/2);
    context.rotate(state.rotation*Math.PI/180);
    context.scale(state.flipped ? -1 : 1,1);
    context.drawImage(image,-w/2,-h/2,w,h);
    if(state.cropRect){
      const crop=state.cropRect;
      const left=clamp(Math.floor(crop.x*canvas.width),0,canvas.width-1);
      const top=clamp(Math.floor(crop.y*canvas.height),0,canvas.height-1);
      const cropWidth=clamp(Math.round(crop.width*canvas.width),1,canvas.width-left);
      const cropHeight=clamp(Math.round(crop.height*canvas.height),1,canvas.height-top);
      const cropped=document.createElement("canvas");
      cropped.width=cropWidth;cropped.height=cropHeight;
      const croppedContext=cropped.getContext("2d");
      if(!croppedContext)return null;
      croppedContext.drawImage(canvas,left,top,cropWidth,cropHeight,0,0,cropWidth,cropHeight);
      return cropped;
    }
    return canvas;
  }

  function rgbToHsl(r,g,b) {
    r=clamp(r,0,255)/255;g=clamp(g,0,255)/255;b=clamp(b,0,255)/255;
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    const lightness=(max+min)/2;
    let hue=0,saturation=0;
    if(delta!==0){
      saturation=lightness>0.5?delta/(2-max-min):delta/(max+min);
      if(max===r)hue=(g-b)/delta+(g<b?6:0);
      else if(max===g)hue=(b-r)/delta+2;
      else hue=(r-g)/delta+4;
      hue/=6;
    }
    return [hue,saturation,lightness];
  }

  function hslToRgb(h,s,l) {
    if(s===0){const value=l*255;return [value,value,value];}
    const q=l<0.5?l*(1+s):l+s-l*s;
    const p=2*l-q;
    const hueToRgb=(t)=>{
      if(t<0)t+=1;if(t>1)t-=1;
      if(t<1/6)return p+(q-p)*6*t;
      if(t<1/2)return q;
      if(t<2/3)return p+(q-p)*(2/3-t)*6;
      return p;
    };
    return [hueToRgb(h+1/3)*255,hueToRgb(h)*255,hueToRgb(h-1/3)*255];
  }

  function processCanvas(sourceCanvas, settings) {
    const context = sourceCanvas.getContext("2d",{willReadFrequently:true});
    if (!context) return null;
    let frame;
    try { frame = context.getImageData(0,0,sourceCanvas.width,sourceCanvas.height); }
    catch (error) { notify("This image is too large for the current device to process."); return null; }
    const pixels = frame.data;
    const exposure = Math.pow(2,settings.exposure/50) * settings.brightness/100;
    const c = (settings.contrast-100)*1.8;
    const contrast = (259*(c+255))/(255*(259-c));
    const saturation = settings.saturation/100;
    const vibrance = settings.vibrance/100;
    const warmth = settings.warmth*0.34;
    const tint = settings.tint*0.22;
    const fade = settings.fade/100;
    const vignette = settings.vignette/100;
    const width = frame.width, height = frame.height;
    const radius = Math.sqrt((width/2)*(width/2)+(height/2)*(height/2)) || 1;
    for (let y=0;y<height;y++) {
      for (let x=0;x<width;x++) {
        const i=(y*width+x)*4;
        let r=pixels[i]*exposure, g=pixels[i+1]*exposure, b=pixels[i+2]*exposure;
        r=contrast*(r-128)+128; g=contrast*(g-128)+128; b=contrast*(b-128)+128;
        let lum=(0.2126*r+0.7152*g+0.0722*b)/255;
        const shadow=settings.shadows/100*Math.pow(1-clamp(lum,0,1),2)*78;
        const high=settings.highlights/100*Math.pow(clamp(lum,0,1),2)*78;
        const ambience=settings.ambience/100*(0.55-clamp(lum,0,1))*54;
        r+=shadow+high+ambience; g+=shadow+high+ambience; b+=shadow+high+ambience;
        r+=warmth+tint; g-=tint*1.55; b-=warmth+tint;
        lum=(0.2126*r+0.7152*g+0.0722*b);
        const gray=lum;
        const satBoost=1+vibrance*(1-clamp((Math.max(r,g,b)-Math.min(r,g,b))/255,0,1));
        r=gray+(r-gray)*saturation*satBoost;
        g=gray+(g-gray)*saturation*satBoost;
        b=gray+(b-gray)*saturation*satBoost;
        if(settings.hue!==0||settings.colorLuminance!==0){
          let [h,sat,light]=rgbToHsl(r,g,b);
          h=((h+settings.hue/360)%1+1)%1;
          light=clamp(light+settings.colorLuminance/200,0,1);
          [r,g,b]=hslToRgb(h,sat,light);
        }
        if (fade>0) {
          const flatten=fade*0.24;
          r=r*(1-flatten)+128*flatten;
          g=g*(1-flatten)+128*flatten;
          b=b*(1-flatten)+128*flatten;
        }
        if (vignette>0) {
          const dx=(x-width/2)/(radius*.82), dy=(y-height/2)/(radius*.82);
          const edge=clamp(Math.sqrt(dx*dx+dy*dy),0,1);
          const smooth=edge*edge*(3-2*edge);
          const factor=1-vignette*smooth*.68;
          r*=factor; g*=factor; b*=factor;
        }
        pixels[i]=clamp(r,0,255); pixels[i+1]=clamp(g,0,255); pixels[i+2]=clamp(b,0,255);
      }
    }
    const detail=clamp(settings.structure/100*.55+settings.sharpen/100*.9,0,1.4);
    if (detail>0 && width>2 && height>2) {
      const source=new Uint8ClampedArray(pixels);
      for(let y=1;y<height-1;y++){
        for(let x=1;x<width-1;x++){
          const i=(y*width+x)*4;
          for(let c=0;c<3;c++){
            const nearby=(source[i-4+c]+source[i+4+c]+source[i-width*4+c]+source[i+width*4+c])/4;
            pixels[i+c]=clamp(source[i+c]+(source[i+c]-nearby)*detail,0,255);
          }
        }
      }
    }
    context.putImageData(frame,0,0);
    return sourceCanvas;
  }

  function renderImage(maxDimension, compareOriginal) {
    const base=transformedSource(maxDimension);if(!base)return null;
    const processed=processCanvas(base,compareOriginal?defaults:state.settings);
    if(!processed||compareOriginal)return processed;
    return applyAreaLayers(processed);
  }

  function schedulePreview() {
    if (!state.imageElement) return;
    if (previewFrame) cancelAnimationFrame(previewFrame);
    previewFrame=requestAnimationFrame(() => {
      previewFrame=0;
      const rendered=renderImage(1100,compareMode);
      if (!rendered) return;
      previewCanvas.width=rendered.width;
      previewCanvas.height=rendered.height;
      const target=previewCanvas.getContext("2d");
      target.clearRect(0,0,previewCanvas.width,previewCanvas.height);
      target.drawImage(rendered,0,0);
      if(selectionOverlay.width!==previewCanvas.width)selectionOverlay.width=previewCanvas.width;
      if(selectionOverlay.height!==previewCanvas.height)selectionOverlay.height=previewCanvas.height;
      drawSelectionOverlay();
      const sideways=Math.abs(state.rotation%180)===90;
      const fullWidth=sideways?state.imageElement.naturalHeight:state.imageElement.naturalWidth;
      const fullHeight=sideways?state.imageElement.naturalWidth:state.imageElement.naturalHeight;
      const crop=state.cropRect||{x:0,y:0,width:1,height:1};
      $("imageDimensions").textContent="Canvas · "+Math.max(1,Math.round(fullWidth*crop.width))+" × "+Math.max(1,Math.round(fullHeight*crop.height));
      $("renderStatus").textContent=compareMode?"Original adjustments · hold to compare":"Edits are previewed locally";
    });
  }

  function applyPreset(name) {
    if (!presets[name] || !state.imageElement) return;
    recordHistory();Object.assign(editingSettings(),presets[name]);
    activePreset=name;
    syncControls();
    schedulePreview();
    notify(name==="original"?"Original look restored":"Applied "+name.replace(/(^|-)([a-z])/g,(_,dash,letter)=>" "+letter.toUpperCase()).trim()+" look");
  }

  function resetAll() {
    if(!state.imageElement)return;recordHistory();
    const layer=state.layers.find((item)=>item.id===state.activeLayerId);
    if(layer&&layer.type!=="pixel"){layer.settings={...defaults};activePreset="original";syncControls();schedulePreview();notify("Area layer adjustments reset");return;}
    state.settings={...defaults};state.rotation=0;state.flipped=false;activePreset="original";syncControls();schedulePreview();notify("All edits reset");
  }

  function rotate() {
    if(!state.imageElement)return;recordHistory();state.rotation=(state.rotation+90)%360;clearSelection();schedulePreview();
  }

  function flip() {
    if(!state.imageElement)return;recordHistory();state.flipped=!state.flipped;clearSelection();schedulePreview();
  }

  function resetTransform() {
    if (!state.imageElement) return;
    recordHistory();
    state.rotation=0;
    state.flipped=false;
    schedulePreview();
    notify("Transform reset");
  }

  function cropLayersToSelection(bounds, frameWidth, frameHeight) {
    state.layers.forEach((layer)=>{
      const source=layer.type==="pixel"?layer.pixelCanvas:layer.maskCanvas;
      if(!source)return;
      const refWidth=Math.max(1,layer.referenceWidth||frameWidth);
      const refHeight=Math.max(1,layer.referenceHeight||frameHeight);
      const scaleX=frameWidth/refWidth;
      const scaleY=frameHeight/refHeight;
      const full=document.createElement("canvas");
      full.width=frameWidth;full.height=frameHeight;
      const fullContext=full.getContext("2d");
      fullContext.drawImage(source,(layer.offsetX||0)*scaleX,(layer.offsetY||0)*scaleY,source.width*scaleX,source.height*scaleY);
      const cropped=document.createElement("canvas");
      cropped.width=bounds.width;cropped.height=bounds.height;
      cropped.getContext("2d").drawImage(full,bounds.left,bounds.top,bounds.width,bounds.height,0,0,bounds.width,bounds.height);
      layer.referenceWidth=bounds.width;
      layer.referenceHeight=bounds.height;
      if(layer.type==="pixel"){
        const data=cropped.getContext("2d",{willReadFrequently:true}).getImageData(0,0,cropped.width,cropped.height).data;
        let left=cropped.width,top=cropped.height,right=-1,bottom=-1;
        for(let y=0;y<cropped.height;y++)for(let x=0;x<cropped.width;x++)if(data[(y*cropped.width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
        if(right>=left&&bottom>=top){
          const trimmed=document.createElement("canvas");
          trimmed.width=right-left+1;trimmed.height=bottom-top+1;
          trimmed.getContext("2d").drawImage(cropped,left,top,trimmed.width,trimmed.height,0,0,trimmed.width,trimmed.height);
          layer.pixelCanvas=trimmed;layer.offsetX=left;layer.offsetY=top;
        }else{layer.pixelCanvas=cropped;layer.offsetX=0;layer.offsetY=0;}
      }else{
        layer.maskCanvas=cropped;layer.offsetX=0;layer.offsetY=0;
      }
    });
  }

  function cropToSelection() {
    if(!state.imageElement||!state.selectionMask){notify("Draw a rectangle selection first.");return;}
    if(state.selectionTool!=="rectangle"){notify("Choose Rectangle to crop the image.");return;}
    const width=state.selectionMask.width,height=state.selectionMask.height;
    const data=state.selectionMask.getContext("2d",{willReadFrequently:true}).getImageData(0,0,width,height).data;
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(data[(y*width+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    if(right-left<2||bottom-top<2){notify("Draw a larger rectangle to crop.");return;}
    const bounds={left,top,width:right-left+1,height:bottom-top+1};
    const previous=state.cropRect||{x:0,y:0,width:1,height:1};
    recordHistory();
    cropLayersToSelection(bounds,width,height);
    state.cropRect={
      x:previous.x+(left/width)*previous.width,
      y:previous.y+(top/height)*previous.height,
      width:(bounds.width/width)*previous.width,
      height:(bounds.height/height)*previous.height
    };
    clearSelection();
    renderLayerList();syncControls();schedulePreview();
    notify("Crop applied · use Undo to restore the previous frame");
  }

  function setActivePanel(panelName) {
    const panelMap={adjustments:{title:state.activeLayerId?"Tune layer":"Tune image",id:"adjustmentsPanel"},layers:{title:"Layers",id:"layersPanel"},transform:{title:"Transform",id:"transformPanel"}};
    const selected=panelMap[panelName]||panelMap.adjustments;
    $("panelTitle").textContent=selected.title;
    Object.values(panelMap).forEach((panel)=>{ $(panel.id).hidden=panel.id!==selected.id; });
    document.querySelectorAll(".rail-tool").forEach((button)=>{
      const active=button.dataset.panel===panelName;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    if(window.matchMedia("(max-width: 760px), (orientation: portrait) and (pointer: coarse)").matches) $("propertiesPanel").classList.add("mobile-open");
  }

  function exportImage() {
    if (!state.imageElement) { notify("Open a photo before exporting."); return; }
    $("renderStatus").textContent="Preparing full-resolution export…";
    notify("Preparing full-resolution export");
    requestAnimationFrame(() => {
      const canvas=renderImage(null,false);
      if(!canvas){$("renderStatus").textContent="Export could not be prepared";return;}
      const requested=$("exportFormat").value;
      const quality=Number($("exportQuality").value)/100;
      const mime=requested;
      if(mime==="image/jpeg"){
        const context=canvas.getContext("2d");
        context.save();
        context.globalCompositeOperation="destination-over";
        context.fillStyle="#ffffff";
        context.fillRect(0,0,canvas.width,canvas.height);
        context.restore();
      }
      canvas.toBlob((blob)=>{
        if(!blob){notify("Export failed. Try a smaller photo.");$("renderStatus").textContent="Export failed";return;}
        const actualMime=blob.type||mime;
        const extension=actualMime==="image/jpeg"?"jpg":actualMime==="image/webp"?"webp":"png";
        const url=URL.createObjectURL(blob);
        const link=document.createElement("a");
        const sourceBase=state.fileName.replace(/\.[^.]+$/,"")||"prolayerspho-image";
        const requestedName=($("exportFilename").value||"").trim();
        const cleanName=(requestedName||sourceBase+"-edited")
          .replace(/\.[^.]+$/,"")
          .replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-")
          .replace(/\s+/g," ")
          .replace(/[. ]+$/,"")
          .trim()||"prolayerspho-image";
        link.href=url;
        link.download=cleanName+"."+extension;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),1500);
        $("renderStatus").textContent="Exported "+canvas.width+" × "+canvas.height;
        notify("Export ready · "+extension.toUpperCase());
      },mime,quality);
    });
  }

  // Prevent the website's long-press context menu and text-selection handles on touch devices.
  document.addEventListener("contextmenu", (event) => event.preventDefault());
  document.addEventListener("selectstart", (event) => {
    if (!event.target.closest('input, textarea, [contenteditable="true"]')) event.preventDefault();
  });
  document.addEventListener("keydown",(event)=>{
    const target=event.target;
    if(target&&target.closest&&target.closest('input,textarea,select,[contenteditable="true"]'))return;
    const modifier=event.ctrlKey||event.metaKey;
    if(!modifier)return;
    const key=event.key.toLowerCase();
    if(key==="z"){event.preventDefault();if(event.shiftKey)redo();else undo();}
    else if(key==="y"){event.preventDefault();redo();}
  });
  $("openImageButton").addEventListener("click",openPicker);
  fileInput.addEventListener("change",(event)=>{readFile(event.target.files&&event.target.files[0]);fileInput.value="";});
  sliderIds.forEach((id)=>{
    const input=$(id);
    input.addEventListener("pointerdown",beginGesture);
    input.addEventListener("keydown",(event)=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key))beginGesture();});
    input.addEventListener("pointerup",endGesture);
    input.addEventListener("pointercancel",endGesture);
    input.addEventListener("keyup",endGesture);
    input.addEventListener("blur",endGesture);
    input.addEventListener("input",()=>{
      if(!gestureActive){beginGesture();endGesture();}
      editingSettings()[id]=Number(input.value);
      const output=$(id+"Value");
      output.value=sliderValueLabel(id,Number(input.value));
      activePreset="";
      document.querySelectorAll("[data-preset]").forEach((button)=>button.classList.remove("active"));
      schedulePreview();
    });
  });
  $("exportQuality").addEventListener("input",()=>{$("exportQualityValue").value=$("exportQuality").value+"%";});
  $("resetButton").addEventListener("click",resetAll);
  $("undoButton").addEventListener("click",undo);
  $("redoButton").addEventListener("click",redo);
  exportButton.addEventListener("click",exportImage);
  $("rotateButton").addEventListener("click",rotate);
  $("transformRotate").addEventListener("click",rotate);
  $("flipButton").addEventListener("click",flip);
  $("transformFlip").addEventListener("click",flip);
  $("transformReset").addEventListener("click",resetTransform);
  document.querySelectorAll("[data-preset]").forEach((button)=>button.addEventListener("click",()=>applyPreset(button.dataset.preset)));
  document.querySelectorAll("[data-selection-tool]").forEach((button)=>button.addEventListener("click",()=>{state.selectionTool=button.dataset.selectionTool;updateSelectionControls();notify(button.textContent+" selection selected");}));
  $("brushSize").addEventListener("input",()=>{state.brushSize=Number($("brushSize").value);});
  $("clearSelectionButton").addEventListener("click",()=>{clearSelection();notify("Area selection cleared");});
  $("addAreaLayerButton").addEventListener("click",addAreaLayer);
  $("createPixelLayerButton").addEventListener("click",createPixelLayerFromSelection);
  $("cropSelectionButton").addEventListener("click",cropToSelection);
  selectionOverlay.addEventListener("pointerdown",beginCanvasGesture);selectionOverlay.addEventListener("pointermove",(event)=>{if(canvasMoveGesture||panGesture)moveCanvasGesture(event);else if(canvasTool==="select")moveSelection(event);});selectionOverlay.addEventListener("pointerup",finishCanvasGesture);selectionOverlay.addEventListener("pointercancel",finishCanvasGesture);
  document.querySelectorAll("[data-canvas-tool]").forEach((button)=>button.addEventListener("click",()=>setCanvasTool(button.dataset.canvasTool)));
  $("zoomCanvasButton").addEventListener("click",cycleCanvasZoom);
  setCanvasTool("select");
  applyCanvasView();
  let opacityGestureActive=false;
  $("layerList").addEventListener("pointerdown",(event)=>{if(event.target.matches("[data-layer-opacity]")){recordHistory();opacityGestureActive=true;}});
  $("layerList").addEventListener("pointerup",()=>{opacityGestureActive=false;});
  $("layerList").addEventListener("pointercancel",()=>{opacityGestureActive=false;});
  $("layerList").addEventListener("focusout",(event)=>{if(event.target.matches("[data-layer-opacity]"))opacityGestureActive=false;});
  $("layerList").addEventListener("change",(event)=>{
    const select=event.target.closest("[data-layer-blend]");
    if(!select)return;
    const layer=state.layers.find((item)=>item.id===select.dataset.layerBlend);
    if(!layer||layer.blendMode===select.value)return;
    recordHistory();layer.blendMode=select.value;schedulePreview();
    notify("Blend mode · "+select.options[select.selectedIndex].text);
  });
  $("layerList").addEventListener("input",(event)=>{
    const input=event.target.closest("[data-layer-opacity]");if(!input)return;
    if(!opacityGestureActive){recordHistory();opacityGestureActive=true;}
    const layer=state.layers.find((item)=>item.id===input.dataset.layerOpacity);if(!layer)return;
    layer.opacity=Number(input.value)/100;
    const output=$("layerList").querySelector('[data-opacity-value="'+layer.id+'"]');if(output)output.value=input.value+"%";
    schedulePreview();
  });
  $("layerList").addEventListener("pointerdown",(event)=>{
    const handle=event.target.closest("[data-layer-drag-handle]");
    if(!handle || event.button===2) return;
    const row=handle.closest("[data-layer-row]");
    if(!row) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    panelDragGesture={pointerId:event.pointerId,handle,row,layerId:row.dataset.layerRow,startY:event.clientY,moved:false};
    row.classList.add("is-dragging");
  });
  $("layerList").addEventListener("pointermove",(event)=>{
    if(!panelDragGesture || panelDragGesture.pointerId!==event.pointerId) return;
    const drag=panelDragGesture;
    if(Math.abs(event.clientY-drag.startY)>5) drag.moved=true;
    if(!drag.moved) return;
    event.preventDefault();
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest(".layer-row[data-layer-row]");
    if(!target || target===drag.row) return;
    const rect=target.getBoundingClientRect();
    if(event.clientY < rect.top+rect.height/2) target.parentNode.insertBefore(drag.row,target);
    else target.parentNode.insertBefore(drag.row,target.nextSibling);
  });
  function finishPanelLayerDrag(event) {
    if(!panelDragGesture || panelDragGesture.pointerId!==event.pointerId) return;
    const drag=panelDragGesture;
    panelDragGesture=null;
    drag.row.classList.remove("is-dragging");
    if(!drag.moved) return;
    const topToBottom=Array.from($("layerList").querySelectorAll(".layer-row[data-layer-row]")).map((row)=>row.dataset.layerRow);
    const bottomToTop=topToBottom.reverse();
    const oldOrder=state.layers.map((layer)=>layer.id);
    if(bottomToTop.join("|")===oldOrder.join("|")) { renderLayerList(); return; }
    recordHistory();
    const byId=new Map(state.layers.map((layer)=>[layer.id,layer]));
    state.layers=bottomToTop.map((id)=>byId.get(id)).filter(Boolean);
    state.activeLayerId=drag.layerId;
    renderLayerList();
    schedulePreview();
    notify("Layer order updated");
  }
  $("layerList").addEventListener("pointerup",finishPanelLayerDrag);
  $("layerList").addEventListener("pointercancel",finishPanelLayerDrag);
  $("layerList").addEventListener("click",(event)=>{
    const action=event.target.closest("[data-layer-action]");
    if(action){
      const id=action.dataset.layerId;
      if(action.dataset.layerAction==="up")moveLayer(id,1);
      else if(action.dataset.layerAction==="down")moveLayer(id,-1);
      else if(action.dataset.layerAction==="duplicate")duplicateLayer(id);
      else if(action.dataset.layerAction==="rename")renameLayer(id);
      else if(action.dataset.layerAction==="delete")deleteLayer(id);
      return;
    }
    const selectLayer=event.target.closest("[data-select-layer]");
    if(selectLayer){setActiveLayer(selectLayer.dataset.selectLayer);return;}
    if(event.target.closest("[data-select-base]")){setActiveLayer(null);return;}
    const toggleLayer=event.target.closest("[data-toggle-layer]");
    if(toggleLayer){const layer=state.layers.find((item)=>item.id===toggleLayer.dataset.toggleLayer);if(layer){recordHistory();layer.visible=!layer.visible;renderLayerList();schedulePreview();}return;}
    if(event.target.closest("[data-toggle-base]")){recordHistory();state.baseVisible=!state.baseVisible;renderLayerList();schedulePreview();}
  });
    document.querySelectorAll(".rail-tool").forEach((button)=>{
    button.addEventListener("click",()=>{
      const mobile=window.matchMedia("(max-width: 760px), (orientation: portrait) and (pointer: coarse)").matches;
      const panel=$("propertiesPanel");
      const wasOpen=panel.classList.contains("mobile-open")&&button.classList.contains("active");
      setActivePanel(button.dataset.panel);
      if(mobile&&wasOpen) panel.classList.remove("mobile-open");
    });
  });
  const compareButton=$("compareButton");
  const startCompare=()=>{if(!state.imageElement)return;compareMode=true;compareButton.setAttribute("aria-pressed","true");schedulePreview();};
  const endCompare=()=>{if(!compareMode)return;compareMode=false;compareButton.setAttribute("aria-pressed","false");schedulePreview();};
  compareButton.addEventListener("pointerdown",startCompare);
  compareButton.addEventListener("pointerup",endCompare);
  compareButton.addEventListener("pointercancel",endCompare);
  compareButton.addEventListener("pointerleave",endCompare);
  compareButton.addEventListener("keydown",(event)=>{if(event.key===" "||event.key==="Enter")startCompare();});
  compareButton.addEventListener("keyup",endCompare);
  canvasStage.addEventListener("dragover",(event)=>{event.preventDefault();canvasStage.classList.add("drag-over");});
  canvasStage.addEventListener("dragleave",()=>canvasStage.classList.remove("drag-over"));
  canvasStage.addEventListener("drop",(event)=>{event.preventDefault();canvasStage.classList.remove("drag-over");if(event.dataTransfer&&event.dataTransfer.files[0])readFile(event.dataTransfer.files[0]);});
  window.addEventListener("beforeunload",()=>{if(state.objectUrl)URL.revokeObjectURL(state.objectUrl);});
  syncControls();
  updateHistoryButtons();
  updateSelectionControls();
})();