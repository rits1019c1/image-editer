"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const promises = require("fs/promises");
const icon = path.join(__dirname, "../../resources/icon.png");
function createWindow() {
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const mainWindow = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // macOS: hiddenInset でトラフィックライトを内側に
    // Windows: hidden + titleBarOverlay でネイティブボタンを残しカスタム色を適用
    // Linux: default
    titleBarStyle: isMac ? "hiddenInset" : isWin ? "hidden" : "default",
    ...isWin ? {
      titleBarOverlay: {
        color: "#09090b",
        symbolColor: "#94a3b8",
        height: 40
      }
    } : {},
    backgroundColor: "#09090b",
    ...process.platform === "linux" ? { icon } : {},
    icon: process.platform !== "darwin" ? icon : void 0,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.image-editor");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  electron.ipcMain.handle("clipboard:readImage", () => {
    const img = electron.clipboard.readImage();
    if (img.isEmpty()) return null;
    return img.toDataURL();
  });
  electron.ipcMain.handle("dialog:openImage", async () => {
    const result = await electron.dialog.showOpenDialog({
      title: "画像を開く",
      filters: [{ name: "画像ファイル", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
      properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const img = electron.nativeImage.createFromPath(result.filePaths[0]);
    return img.toDataURL();
  });
  electron.ipcMain.handle("clipboard:writeImage", (_, dataUrl) => {
    const img = electron.nativeImage.createFromDataURL(dataUrl);
    electron.clipboard.writeImage(img);
    return { success: true };
  });
  electron.ipcMain.handle("dialog:saveImage", async (_, dataUrl) => {
    const result = await electron.dialog.showSaveDialog({
      title: "画像を保存",
      defaultPath: "image-editor-export.png",
      filters: [
        { name: "PNG画像", extensions: ["png"] },
        { name: "JPEG画像", extensions: ["jpg"] }
      ]
    });
    if (result.canceled || !result.filePath) return { success: false };
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    await promises.writeFile(result.filePath, buffer);
    return { success: true, filePath: result.filePath };
  });
  electron.ipcMain.handle("app:getPlatform", () => process.platform);
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
