import { app, shell, BrowserWindow, ipcMain, clipboard, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { writeFile } from 'fs/promises'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const isWin = process.platform === 'win32'
  const isMac = process.platform === 'darwin'

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // macOS: hiddenInset でトラフィックライトを内側に
    // Windows: hidden + titleBarOverlay でネイティブボタンを残しカスタム色を適用
    // Linux: default
    titleBarStyle: isMac ? 'hiddenInset' : isWin ? 'hidden' : 'default',
    ...(isWin
      ? {
          titleBarOverlay: {
            color: '#09090b',
            symbolColor: '#94a3b8',
            height: 40
          }
        }
      : {}),
    backgroundColor: '#09090b',
    ...(process.platform === 'linux' ? { icon } : {}),
    icon: process.platform !== 'darwin' ? icon : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.image-editor')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // --- IPC: クリップボードから画像を読み込む ---
  ipcMain.handle('clipboard:readImage', () => {
    const img = clipboard.readImage()
    if (img.isEmpty()) return null
    return img.toDataURL()
  })

  // --- IPC: ファイルを開くダイアログ ---
  ipcMain.handle('dialog:openImage', async () => {
    const result = await dialog.showOpenDialog({
      title: '画像を開く',
      filters: [{ name: '画像ファイル', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const img = nativeImage.createFromPath(result.filePaths[0])
    return img.toDataURL()
  })

  // --- IPC: クリップボードに画像を書き込む ---
  ipcMain.handle('clipboard:writeImage', (_, dataUrl: string) => {
    const img = nativeImage.createFromDataURL(dataUrl)
    clipboard.writeImage(img)
    return { success: true }
  })

  // --- IPC: 画像として保存 ---
  ipcMain.handle('dialog:saveImage', async (_, dataUrl: string) => {
    const result = await dialog.showSaveDialog({
      title: '画像を保存',
      defaultPath: 'image-editor-export.png',
      filters: [
        { name: 'PNG画像', extensions: ['png'] },
        { name: 'JPEG画像', extensions: ['jpg'] }
      ]
    })
    if (result.canceled || !result.filePath) return { success: false }
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    await writeFile(result.filePath, buffer)
    return { success: true, filePath: result.filePath }
  })

  // --- IPC: プラットフォーム情報を返す ---
  ipcMain.handle('app:getPlatform', () => process.platform)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
