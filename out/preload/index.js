"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  /** クリップボードから画像データURL を取得 */
  readClipboardImage: () => electron.ipcRenderer.invoke("clipboard:readImage"),
  /** キャンバス画像（DataURL）をクリップボードに書き込む */
  writeClipboardImage: (dataUrl) => electron.ipcRenderer.invoke("clipboard:writeImage", dataUrl),
  /** ファイルを開くダイアログを表示し、画像データURLを取得 */
  openImageFile: () => electron.ipcRenderer.invoke("dialog:openImage"),
  /** Canvasのデータ（DataURL）をファイルとして保存 */
  saveImage: (dataUrl) => electron.ipcRenderer.invoke("dialog:saveImage", dataUrl),
  /** 現在のプラットフォームを返す */
  getPlatform: () => electron.ipcRenderer.invoke("app:getPlatform")
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
