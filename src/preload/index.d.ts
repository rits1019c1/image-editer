import { ElectronAPI } from '@electron-toolkit/preload'

export interface ImageEditorAPI {
  readClipboardImage: () => Promise<string | null>
  writeClipboardImage: (dataUrl: string) => Promise<{ success: boolean }>
  openImageFile: () => Promise<string | null>
  saveImage: (dataUrl: string) => Promise<{ success: boolean; filePath?: string }>
  getPlatform: () => Promise<string>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ImageEditorAPI
  }
}
