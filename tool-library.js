(() => {
  "use strict";
  const root = document.getElementById("editToolCategories");
  const search = document.getElementById("editToolSearch");
  if (!root || !search) return;
  const searchable = () => {
    const query = search.value.trim().toLocaleLowerCase();
    root.querySelectorAll(".tool-category").forEach((category) => {
      let visible = 0;
      category.querySelectorAll(".edit-tool").forEach((button) => {
        const match = !query || button.textContent.toLocaleLowerCase().includes(query);
        button.hidden = !match;
        if (match) visible++;
      });
      category.hidden = visible === 0;
    });
  };
  search.addEventListener("input", searchable);
  root.addEventListener("click", (event) => {
    const button = event.target.closest(".edit-tool");
    if (!button) return;
    const target = button.dataset.toolTarget;
    const panelName = button.dataset.openPanel;
    if (panelName) {
      const rail = document.querySelector('.rail-tool[data-panel="' + panelName + '"]');
      if (rail) rail.click();
      if (target === "selection") {
        const selection = document.querySelector('[data-selection-tool="brush"]');
        if (selection) selection.click();
      }
      if (target === "crop") {
        const rect = document.querySelector('[data-selection-tool="rectangle"]');
        if (rect) rect.click();
      }
      return;
    }
    const targetIds = {
      exposure:["exposure","brightness","contrast","highlights","shadows","ambience"],
      structure:["structure","sharpen"], ambience:["ambience"], contrast:["contrast"],
      warmth:["warmth","tint"], saturation:["saturation","vibrance","hue","colorLuminance"],
      vibrance:["vibrance","warmth","tint"], vignette:["vignette"],
      blackwhite:["saturation"], noir:["saturation","contrast"], drama:["contrast","highlights","shadows"],
      vintage:["warmth","fade","vignette"], retrolux:["warmth","saturation","fade"],
      grain:["structure"], hdr:["structure","contrast"], bloom:["highlights","ambience"]
    };
    const ids = targetIds[target];
    if (ids) {
      const first = document.getElementById(ids[0]);
      if (first) {
        first.scrollIntoView({behavior:"smooth",block:"center"});
        first.focus({preventScroll:true});
      }
      document.querySelectorAll(".edit-tool.is-current").forEach((el)=>el.classList.remove("is-current"));
      button.classList.add("is-current");
      const section = first && first.closest(".settings-section");
      if (section) {
        section.classList.add("tool-section-highlight");
        setTimeout(()=>section.classList.remove("tool-section-highlight"),1100);
      }
      if (target === "blackwhite" || target === "noir") {
        const preset = document.querySelector('[data-preset="' + (target === "noir" ? "noir" : "blackwhite") + '"]');
        if (preset) { preset.click(); return; }
      }
      if (target === "drama" || target === "vintage" || target === "retrolux") {
        const preset = document.querySelector('[data-preset="' + (target === "drama" ? "dramatic" : target === "vintage" ? "warm" : "cool") + '"]');
        if (preset) { preset.click(); return; }
      }
      return;
    }
    const labels = {
      healing:"Healing", portrait:"Portrait", headpose:"Head pose", lensblur:"Lens blur",
      motionblur:"Motion blur", chromatic:"Chromatic aberration", halation:"Halation",
      glamour:"Glamour glow", doubleexposure:"Double exposure", grunge:"Grunge",
      frames:"Frames", text:"Text", perspective:"Perspective", expand:"Expand"
    };
    const label = labels[target] || button.querySelector("span")?.textContent || "Tool";
    const message = document.getElementById("toast");
    if (message) {
      message.textContent = label + " is in the tool library; its editing engine has not been implemented yet.";
      message.classList.add("show");
      window.clearTimeout(window.__prolayersToolToast);
      window.__prolayersToolToast = window.setTimeout(()=>message.classList.remove("show"),3000);
    }
  });
})();
