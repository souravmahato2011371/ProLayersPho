(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const fileInput = $("fileInput");
  const editedImage = $("editedImage");
  const imageViewport = $("imageViewport");
  const emptyState = $("emptyState");
  const canvasStage = $("canvasStage");
  const exportButton = $("exportButton");
  const sliderIds = ["brightness", "contrast", "saturation", "warmth"];
  const defaults = { brightness: 100, contrast: 100, saturation: 100, warmth: 0 };
  const state = { fileName: "", sourceUrl: "", rotation: 0, flipped: false, objectUrl: "", imageElement: null };
  let toastTimeout;

  function notify(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[char]));
  }

  function openPicker() { fileInput.click(); }

  function setImageLoaded(loaded) {
    emptyState.hidden = loaded;
    imageViewport.hidden = !loaded;
    exportButton.disabled = !loaded;
    $("rotateButton").disabled = !loaded;
    $("flipButton").disabled = !loaded;
    $("transformRotate").disabled = !loaded;
    $("transformFlip").disabled = !loaded;
    $("canvasStatus").textContent = loaded ? state.fileName : "No image loaded";
    $("documentTitle").textContent = loaded ? state.fileName : "Untitled project";
    $("layerCount").textContent = loaded ? "1" : "0";
    $("layerList").innerHTML = loaded
      ? '<div class="layer-row"><div class="layer-thumb"><img src="' + state.sourceUrl + '" alt=""></div><span class="layer-name" title="' + escapeHtml(state.fileName) + '">' + escapeHtml(state.fileName) + '</span><button class="icon-button" id="layerVisibility" aria-label="Toggle image visibility" title="Toggle visibility"><svg><use href="#i-eye"/></svg></button></div>'
      : '<div class="layer-empty">Open an image to create your first layer.</div>';
    const visibilityButton = $("layerVisibility");
    if (visibilityButton) visibilityButton.addEventListener("click", () => {
      editedImage.style.visibility = editedImage.style.visibility === "hidden" ? "visible" : "hidden";
      notify(editedImage.style.visibility === "hidden" ? "Image layer hidden" : "Image layer visible");
    });
  }

  function readFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify("Please choose an image file.");
      return;
    }
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(file);
    state.sourceUrl = state.objectUrl;
    state.fileName = file.name || "Untitled image";
    const image = new Image();
    image.onload = () => {
      state.imageElement = image;
      state.rotation = 0;
      state.flipped = false;
      editedImage.src = state.sourceUrl;
      editedImage.style.visibility = "visible";
      $("imageDimensions").textContent = "Canvas · " + image.naturalWidth + " × " + image.naturalHeight;
      setImageLoaded(true);
      resetAdjustments(false);
      setActivePanel("adjustments");
      notify("Image opened successfully");
    };
    image.onerror = () => notify("This image could not be opened.");
    image.src = state.sourceUrl;
  }

  function updateAdjustments() {
    const brightness = Number($("brightness").value);
    const contrast = Number($("contrast").value);
    const saturation = Number($("saturation").value);
    const warmth = Number($("warmth").value);
    $("brightnessValue").value = brightness + "%";
    $("contrastValue").value = contrast + "%";
    $("saturationValue").value = saturation + "%";
    $("warmthValue").value = warmth > 0 ? "+" + warmth : String(warmth);
    editedImage.style.filter = "brightness(" + brightness + "%) contrast(" + contrast + "%) saturate(" + saturation + "%) sepia(" + Math.abs(warmth) + "%)";
    editedImage.style.transform = "rotate(" + state.rotation + "deg) scaleX(" + (state.flipped ? -1 : 1) + ")";
  }

  function resetAdjustments(showMessage = true) {
    sliderIds.forEach((id) => { $(id).value = defaults[id]; });
    state.rotation = 0;
    state.flipped = false;
    editedImage.style.visibility = "visible";
    updateAdjustments();
    if (showMessage) notify("Adjustments reset");
  }

  function setActivePanel(panelName) {
    const panelMap = {
      adjustments: { title: "Adjustments", id: "adjustmentsPanel" },
      layers: { title: "Layers", id: "layersPanel" },
      transform: { title: "Transform", id: "transformPanel" }
    };
    const selected = panelMap[panelName] || panelMap.adjustments;
    $("panelTitle").textContent = selected.title;
    Object.values(panelMap).forEach((panel) => { $(panel.id).hidden = panel.id !== selected.id; });
    document.querySelectorAll(".rail-tool").forEach((button) => {
      const active = button.dataset.panel === panelName;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (window.matchMedia("(max-width: 650px)").matches) $("propertiesPanel").classList.add("mobile-open");
  }

  function renderForExport() {
    if (!state.imageElement) return null;
    const width = state.imageElement.naturalWidth;
    const height = state.imageElement.naturalHeight;
    const sideways = Math.abs(state.rotation % 180) === 90;
    const canvas = document.createElement("canvas");
    canvas.width = sideways ? height : width;
    canvas.height = sideways ? width : height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(state.rotation * Math.PI / 180);
    context.scale(state.flipped ? -1 : 1, 1);
    const brightness = Number($("brightness").value);
    const contrast = Number($("contrast").value);
    const saturation = Number($("saturation").value);
    const warmth = Number($("warmth").value);
    context.filter = "brightness(" + brightness + "%) contrast(" + contrast + "%) saturate(" + saturation + "%) sepia(" + Math.abs(warmth) + "%)";
    context.drawImage(state.imageElement, -width / 2, -height / 2, width, height);
    context.filter = "none";
    return canvas;
  }

  function exportImage() {
    const canvas = renderForExport();
    if (!canvas) { notify("Open an image before exporting."); return; }
    canvas.toBlob((blob) => {
      if (!blob) { notify("Export failed. Try another image."); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName = state.fileName.replace(/\.[^.]+$/, "") || "prolayerspho-image";
      link.href = url;
      link.download = baseName + "-edited.png";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Export started");
    }, "image/png");
  }

  $("openImageButton").addEventListener("click", openPicker);
  fileInput.addEventListener("change", (event) => {
    readFile(event.target.files && event.target.files[0]);
    fileInput.value = "";
  });
  sliderIds.forEach((id) => $(id).addEventListener("input", updateAdjustments));
  $("resetButton").addEventListener("click", () => resetAdjustments());
  $("undoButton").addEventListener("click", () => resetAdjustments());
  exportButton.addEventListener("click", exportImage);
  const rotate = () => { state.rotation = (state.rotation + 90) % 360; updateAdjustments(); };
  const flip = () => { state.flipped = !state.flipped; updateAdjustments(); };
  $("rotateButton").addEventListener("click", rotate);
  $("transformRotate").addEventListener("click", rotate);
  $("flipButton").addEventListener("click", flip);
  $("transformFlip").addEventListener("click", flip);
  document.querySelectorAll(".rail-tool").forEach((button) => {
    button.addEventListener("click", () => {
      const mobile = window.matchMedia("(max-width: 650px)").matches;
      const panel = $("propertiesPanel");
      const wasOpen = panel.classList.contains("mobile-open") && button.classList.contains("active");
      setActivePanel(button.dataset.panel);
      if (mobile && wasOpen) panel.classList.remove("mobile-open");
    });
  });
  canvasStage.addEventListener("dragover", (event) => { event.preventDefault(); canvasStage.classList.add("drag-over"); });
  canvasStage.addEventListener("dragleave", () => canvasStage.classList.remove("drag-over"));
  canvasStage.addEventListener("drop", (event) => {
    event.preventDefault();
    canvasStage.classList.remove("drag-over");
    if (event.dataTransfer && event.dataTransfer.files[0]) readFile(event.dataTransfer.files[0]);
  });
  window.addEventListener("beforeunload", () => {
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  });
  updateAdjustments();
})();