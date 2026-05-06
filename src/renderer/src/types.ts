export type LayerType = 'image' | 'text'

export interface BaseLayer {
  id: string
  type: LayerType
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  name: string
  opacity: number
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  src: string
  originalSrc: string
  bgRemovedSrc?: string    // 背景消去後の画像（渦巻き等はこの上に重ねる）
  filterType: 'none' | 'swirl' | 'grayscale' | 'blur'
  filterStrength: number
  // 渦巻き詳細パラメータ
  swirlCenterX: number     // 0.0〜1.0 (画像内の中心位置X)
  swirlCenterY: number     // 0.0〜1.0 (画像内の中心位置Y)
  swirlRadius: number      // 0.1〜1.0 (渦の影響半径、画像の短辺に対する比率)
  swirlDirection: 1 | -1   // 1: 時計回り, -1: 反時計回り
  swirlRotations: number   // 0.5〜10.0 (渦の回転数)
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  text: string
  fontSize: number
  fontFamily: string
  fill: string
  bold: boolean
  italic: boolean
  align: 'left' | 'center' | 'right'
}

export type AnyLayer = ImageLayer | TextLayer

export interface EditorState {
  layers: AnyLayer[]
  selectedIds: string[]     // 複数選択対応
  canvasWidth: number
  canvasHeight: number
  bgColor: string
}
