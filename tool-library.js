(() => {
  "use strict";
  const root = document.getElementById("editToolCategories");
  const search = document.getElementById("editToolSearch");
  const panel = document.getElementById("adjustmentsPanel");
  const title = document.getElementById("panelTitle");
  if (!root || !search || !panel) return;

  const tools = {
    exposure:{title:"Tune image",controls:["exposure","brightness","contrast","highlights","shadows","ambience"]},
    structure:{title:"Details",controls:["structure","sharpen"]},
    ambience:{title:"Dehaze",controls:["ambience","contrast","saturation"]},
    contrast:{title:"Tonal contrast / Curves",controls:["contrast","highlights","shadows","brightness"]},
    warmth:{title:"White balance",controls:["warmth","tint"]},
    saturation:{title:"Colour",controls:["saturation","vibrance","hue","colorLuminance"]},
    vibrance:{title:"Colour grade",controls:["vibrance","warmth","tint","saturation"]},
    vignette:{title:"Vignette",controls:["vignette","exposure"]},
    grain:{title:"Grainy film",controls:["structure","fade","saturation"]},
    bloom:{title:"Bloom",controls:["highlights","ambience","fade"]},
    halation:{title:"Halation",controls:["warmth","highlights","vignette"]},
    glamour:{title:"Glamour glow",controls:["ambience","highlights","structure"]},
    hdr:{title:"HDR-scape",controls:["structure","contrast","shadows","highlights"]},
    vintage:{title:"Vintage",controls:["warmth","fade","vignette","saturation"]},
    blackwhite:{title:"Black and white",controls:["saturation","contrast","structure"] ,preset:"blackwhite"},
    retrolux:{title:"Retrolux",controls:["warmth","saturation","fade","vignette"] ,preset:"warm"},
    drama:{title:"Drama",controls:["contrast","highlights","shadows","structure"],preset:"dramatic"},
    noir:{title:"Noir",controls:["saturation","contrast","vignette"],preset:"noir"},
    grunge:{title:"Grunge",controls:["structure","contrast","fade","vignette"]},
    portrait:{title:"Portrait",controls:["exposure","highlights","shadows","warmth","structure"],preset:"portrait"},
    headpose:{title:"Head pose",controls:["hue","warmth"],note:"This version provides colour adjustments only; face-aware 3D head-pose correction needs a separate face-tracking engine."},
    lensblur:{title:"Lens blur",controls:["vignette","ambience","structure"],note:"Use the area-selection tools in Layers to limit edits to a selected region. True depth-aware lens blur is not available in this build."},
    motionblur:{title:"Motion blur",controls:["structure","fade"],note:"These controls provide a softer motion-style finish; directional pixel blur is not implemented yet."},
    chromatic:{title:"Chromatic aberration",controls:["hue","saturation"],note:"Colour controls are available here; per-channel lens-fringing is not implemented yet."},
    doubleexposure:{title:"Double exposure",controls:["fade","contrast","saturation"],note:"For independent image compositing, open Layers and create a pixel layer from a selected area. Importing and blending a second photo is not implemented yet."},
    healing:{title:"Healing",controls:["structure","shadows"],note:"This opens image-detail controls. Content-aware object removal is not implemented yet."},
    frames:{title:"Frames",controls:["vignette","fade"],note:"Frame controls are not available yet; these adjustments affect the photo itself."},
    text:{title:"Text",controls:["contrast","saturation"],note:"Text overlay controls are not available yet; these adjustments affect the photo itself."}
  };
  const names = {exposure:"Exposure",brightness:"Brightness",contrast:"Contrast",highlights:"Highlights",shadows:"Shadows",ambience:"Ambience",saturation:"Saturation",vibrance:"Vibrance",warmth:"Temperature",tint:"Tint",hue:"Hue",colorLuminance:"Colour luminance",structure:"Structure",sharpen:"Sharpening",fade:"Fade",vignette:"Vignette"};
  let workspace = null;
  let currentButton = null;

  function searchable() {
    const query = search.value.trim().toLocaleLowerCase();
    root.querySelectorAll(".tool-category").forEach(category => {
      let visible = 0;
      category.querySelectorAll(".edit-tool").forEach(button => {
        const match = !query || button.textContent.toLocaleLowerCase().includes(query);
        button.hidden = !match;
        if (match) visible++;
      });
      category.hidden = visible === 0;
    });
  }
  search.addEventListener("input", searchable);

  function setSlider(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), value)));
    input.dispatchEvent(new Event("input", {bubbles:true}));
  }
  function openWorkspace(button, config) {
    if (!document.getElementById("previewCanvas") || document.getElementById("previewCanvas").hidden) {
      // Keep the normal image-open flow; the workspace can still be opened after loading.
    }
    if (workspace) workspace.remove();
    root.hidden = true;
    const libraryTop = panel.querySelector(".tool-library-top");
    const searchBox = panel.querySelector(".tool-search");
    if (libraryTop) libraryTop.hidden = true;
    if (searchBox) searchBox.hidden = true;
    panel.querySelectorAll(".settings-section,.panel-note,.export-settings").forEach(el => el.hidden = true);
    workspace = document.createElement("section");
    workspace.className = "tool-workspace";
    const header = document.createElement("div");
    header.className = "tool-workspace-header";
    const back = document.createElement("button");
    back.type = "button"; back.className = "small-button"; back.textContent = "← All tools";
    back.addEventListener("click", closeWorkspace);
    const heading = document.createElement("h3"); heading.textContent = config.title;
    header.append(back, heading);
    workspace.append(header);
    if (config.preset) {
      const preset = document.querySelector('[data-preset="' + config.preset + '"]');
      if (preset) preset.click();
    }
    config.controls.forEach(id => {
      const original = document.getElementById(id);
      if (!original) return;
      const wrap = document.createElement("div"); wrap.className = "range-control tool-workspace-control";
      const labelRow = document.createElement("div"); labelRow.className = "range-label";
      const label = document.createElement("label"); label.textContent = names[id] || id; label.htmlFor = "workspace-" + id;
      const output = document.createElement("output"); output.textContent = original.value + (["brightness","contrast","saturation"].includes(id) ? "%" : "");
      const range = document.createElement("input"); range.type = "range"; range.id = "workspace-" + id;
      range.min = original.min; range.max = original.max; range.step = original.step || "1"; range.value = original.value;
      range.addEventListener("input", () => {
        setSlider(id, Number(range.value));
        output.textContent = range.value + (["brightness","contrast","saturation"].includes(id) ? "%" : "");
      });
      labelRow.append(label, output); wrap.append(labelRow, range); workspace.append(wrap);
    });
    if (config.note) {
      const note = document.createElement("p"); note.className = "panel-note"; note.textContent = config.note; workspace.append(note);
    }
    const reset = document.createElement("button"); reset.type = "button"; reset.className = "wide-action"; reset.textContent = "Reset this tool";
    reset.addEventListener("click", () => {
      config.controls.forEach(id => setSlider(id, ({brightness:100,contrast:100,saturation:100}[id] ?? 0)));
      workspace.querySelectorAll('input[type="range"]').forEach(range => {
        const id = range.id.replace("workspace-","");
        range.value = document.getElementById(id).value;
        const output = range.parentElement.querySelector("output");
        if (output) output.textContent = range.value + (["brightness","contrast","saturation"].includes(id) ? "%" : "");
      });
    });
    workspace.append(reset);
    panel.append(workspace);
    title.textContent = config.title;
    document.querySelectorAll(".edit-tool.is-current").forEach(el => el.classList.remove("is-current"));
    button.classList.add("is-current");
    currentButton = button;
  }
  function closeWorkspace() {
    if (workspace) workspace.remove();
    workspace = null;
    root.hidden = false;
    const libraryTop = panel.querySelector(".tool-library-top");
    const searchBox = panel.querySelector(".tool-search");
    if (libraryTop) libraryTop.hidden = false;
    if (searchBox) searchBox.hidden = false;
    panel.querySelectorAll(".settings-section,.panel-note,.export-settings").forEach(el => el.hidden = false);
    title.textContent = "Tune image";
    if (currentButton) currentButton.classList.remove("is-current");
    currentButton = null;
  }

  root.addEventListener("click", event => {
    const button = event.target.closest(".edit-tool");
    if (!button) return;
    const target = button.dataset.toolTarget;
    const panelName = button.dataset.openPanel;
    if (panelName) {
      closeWorkspace();
      const rail = document.querySelector('.rail-tool[data-panel="' + panelName + '"]');
      if (rail) rail.click();
      if (target === "selection") {
        const selection = document.querySelector('[data-selection-tool="brush"]');
        if (selection) selection.click();
      }
      if (target === "crop" || target === "perspective" || target === "expand") {
        const rect = document.querySelector('[data-selection-tool="rectangle"]');
        if (rect) rect.click();
      }
      return;
    }
    const config = tools[target];
    if (!config) return;
    openWorkspace(button, config);
  });
})();