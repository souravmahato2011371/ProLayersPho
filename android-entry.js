import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

window.ProLayersNativeExport = {
  async saveAndShare(blob, fileName) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read exported image"));
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        if (comma < 0) reject(new Error("Could not encode exported image"));
        else resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(blob);
    });
    const saved = await Filesystem.writeFile({
      path: fileName,
      data: dataUrl,
      directory: Directory.Cache,
      recursive: true
    });
    await Share.share({
      title: "Save edited photo",
      text: "Exported from ProLayers Pho",
      files: [saved.uri],
      dialogTitle: "Save edited photo"
    });
  }
};

// Load the same editor logic after the native bridge is available.
import("./script.js");
