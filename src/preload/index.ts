import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// カスタムAPIの定義 (Renderer側で window.api として利用)
const api = {
  /** クリップボードから画像データURL を取得 */
  readClipboardImage: (): Promise<string | null> =>
    ipcRenderer.invoke('clipboard:readImage'),

  /** キャンバス画像（DataURL）をクリップボードに書き込む */
  writeClipboardImage: (dataUrl: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('clipboard:writeImage', dataUrl),

  /** ファイルを開くダイアログを表示し、画像データURLを取得 */
  openImageFile: (): Promise<string | null> =>
    ipcRenderer.invoke('dialog:openImage'),

  /** Canvasのデータ（DataURL）をファイルとして保存 */
  saveImage: (dataUrl: string): Promise<{ success: boolean; filePath?: string }> =>
    ipcRenderer.invoke('dialog:saveImage', dataUrl),

  /** 現在のプラットフォームを返す */
  getPlatform: (): Promise<string> =>
    ipcRenderer.invoke('app:getPlatform')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
