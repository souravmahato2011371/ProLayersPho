(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const previewCanvas = $("previewCanvas");
  const imageViewport = $("imageViewport");
  const emptyState = $("emptyState");
  const canvasStage = $("canvasStage");
  const exportButton = $("exportButton");
  const sliderIds = ["exposure","brightness","contrast","highlights","shadows","ambience","saturation","vibrance","warmth","tint","structure","sharpen","fade","vignette"];
  const defaults = {exposure:0,brightness:100,contrast:100,highlights:0,shadows:0,ambience:0,saturation:100,vibrance:0,warmth:0,tint:0,structure:0,sharpen:0,fade:0,vignette:0};
  const presets = {
    original: {...defaults},
    portrait: {...defaults,exposure:4,brightness:103,contrast:96,highlights:-22,shadows:22,ambience:18,saturation:96,vibrance:12,warmth:5,tint:2,structure:5,sharpen:12,fade:5,vignette:8},
    warm: {...defaults,exposure:3,contrast:106,highlights:-15,shadows:12,ambience:8,saturation:108,vibrance:8,warmth:25,tint:3,structure:10,sharpen:12,fade:13,vignette:18},
    cool: {...defaults,exposure:3,brightness:102,contrast:103,highlights:-8,shadows:12,saturation:95,vibrance:10,warmth:-19,tint:-3,structure:8,sharpen:18,vignette:5},
    noir: {...defaults,exposure:2,contrast:125,highlights:-18,shadows:10,ambience:5,saturation:0,structure:20,sharpen:18,vignette:24},
    dramatic: {...defaults,exposure:-5,contrast:123,highlights:-28,shadows:17,ambience:12,saturation:109,vibrance:12,warmth:-3,structure:27,sharpen:23,vignette:23}
  };
  const state = {fileName:"",sourceUrl:"",objectUrl:"",imageElement:null,rotation:0,flipped:false,settings:{...defaults}};
  let undoStack = [];
  let redoStack = [];
  let toastTimeout = 0;
  let previewFrame = 0;
  let compareMode = false;
  let gestureActive = false;
  let activePreset = "original";

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

  function snapshot() {
    return {settings:{...state.settings},rotation:state.rotation,flipped:state.flipped,activePreset:activePreset};
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

  function restoreSnapshot(saved) {
    state.settings = {...saved.settings};
    state.rotation = saved.rotation;
    state.flipped = saved.flipped;
    activePreset = saved.activePreset || "";
    syncControls();
    schedulePreview();
    updateHistoryButtons();
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
    emptyState.hidden = loaded;
    imageViewport.hidden = !loaded;
    exportButton.disabled = !loaded;
    $("rotateButton").disabled = !loaded;
    $("flipButton").disabled = !loaded;
    $("compareButton").disabled = !loaded;
    $("transformRotate").disabled = !loaded;
    $("transformFlip").disabled = !loaded;
    $("transformReset").disabled = !loaded;
    $("canvasStatus").textContent = loaded ? state.fileName : "No image loaded";
    $("documentTitle").textContent = loaded ? state.fileName : "Untitled project";
    $("layerCount").textContent = loaded ? "1" : "0";
    $("layerList").innerHTML = loaded
      ? '<div class="layer-row"><div class="layer-thumb"><img src="' + state.sourceUrl + '" alt=""></div><span class="layer-name" title="' + escapeHtml(state.fileName) + '">' + escapeHtml(state.fileName) + '</span><button class="icon-button" id="layerVisibility" type="button" aria-label="Toggle image visibility" title="Toggle visibility"><svg><use href="#i-eye"/></svg></button></div>'
      : '<div class="layer-empty">Open an image to create your first layer.</div>';
    const visibilityButton = $("layerVisibility");
    if (visibilityButton) visibilityButton.addEventListener("click", () => {
      previewCanvas.hidden = !previewCanvas.hidden;
      notify(previewCanvas.hidden ? "Preview hidden" : "Preview visible");
    });
    updateHistoryButtons();
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
      state.settings = {...defaults};
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

  function syncControls() {
    sliderIds.forEach((id) => {
      $(id).value = state.settings[id];
      const output = $(id + "Value");
      const value = state.settings[id];
      output.value = ["brightness","contrast","saturation"].includes(id) ? value + "%" : (value > 0 ? "+" + value : String(value));
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
    return canvas;
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
    const base=transformedSource(maxDimension);
    if (!base) return null;
    const settings=compareOriginal ? defaults : state.settings;
    const processed=processCanvas(base,settings);
    return processed;
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
      const sideways=Math.abs(state.rotation%180)===90;
      $("imageDimensions").textContent="Canvas · "+(sideways?state.imageElement.naturalHeight+" × "+state.imageElement.naturalWidth:state.imageElement.naturalWidth+" × "+state.imageElement.naturalHeight);
      $("renderStatus").textContent=compareMode?"Original adjustments · hold to compare":"Edits are previewed locally";
    });
  }

  function applyPreset(name) {
    if (!presets[name] || !state.imageElement) return;
    recordHistory();
    state.settings={...presets[name]};
    activePreset=name;
    syncControls();
    schedulePreview();
    notify(name==="original"?"Original look restored":"Applied "+name.replace(/(^|-)([a-z])/g,(_,dash,letter)=>" "+letter.toUpperCase()).trim()+" look");
  }

  function resetAll() {
    if (!state.imageElement) return;
    recordHistory();
    state.settings={...defaults};
    state.rotation=0;
    state.flipped=false;
    activePreset="original";
    syncControls();
    schedulePreview();
    notify("All edits reset");
  }

  function rotate() {
    if (!state.imageElement) return;
    recordHistory();
    state.rotation=(state.rotation+90)%360;
    schedulePreview();
  }

  function flip() {
    if (!state.imageElement) return;
    recordHistory();
    state.flipped=!state.flipped;
    schedulePreview();
  }

  function resetTransform() {
    if (!state.imageElement) return;
    recordHistory();
    state.rotation=0;
    state.flipped=false;
    schedulePreview();
    notify("Transform reset");
  }

  function setActivePanel(panelName) {
    const panelMap={adjustments:{title:"Tune image",id:"adjustmentsPanel"},layers:{title:"Layers",id:"layersPanel"},transform:{title:"Transform",id:"transformPanel"}};
    const selected=panelMap[panelName]||panelMap.adjustments;
    $("panelTitle").textContent=selected.title;
    Object.values(panelMap).forEach((panel)=>{ $(panel.id).hidden=panel.id!==selected.id; });
    document.querySelectorAll(".rail-tool").forEach((button)=>{
      const active=button.dataset.panel===panelName;
      button.classList.toggle("active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    if(window.matchMedia("(max-width: 650px)").matches) $("propertiesPanel").classList.add("mobile-open");
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
        const baseName=state.fileName.replace(/\.[^.]+$/,"")||"prolayerspho-image";
        link.href=url;
        link.download=baseName+"-edited."+extension;
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
      state.settings[id]=Number(input.value);
      const output=$(id+"Value");
      output.value=["brightness","contrast","saturation"].includes(id)?input.value+"%":(Number(input.value)>0?"+"+input.value:input.value);
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
  document.querySelectorAll(".rail-tool").forEach((button)=>{
    button.addEventListener("click",()=>{
      const mobile=window.matchMedia("(max-width: 650px)").matches;
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
})();