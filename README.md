# 怪獸襲來 Kaiju Strike (Three.js ARPG)

## 本機執行
npm install
npm run dev

## 部署到 Vercel
1. 推到 GitHub repo
2. Vercel → Add New Project → 匯入 repo（自動偵測 Vite：Build `npm run build`、Output `dist`）
或用 CLI：`npx vercel --prod`

## 操作
桌機：WASD 移動 · Shift 奔跑 · 空白 跳躍 · Ctrl 翻滾(無敵) · 左鍵攻擊(按住連段) · Tab 切換角色 · 1–9 動作 · 0 動作換頁 · 滑鼠轉視角 · 滾輪縮放
手機：左半邊拖曳＝搖桿 · 右半邊拖曳＝視角 · 右下按鈕 攻擊/跳/滾/跑/⇄/★動作

模型在 public/models（已將貼圖壓成 1024 WebP，35MB → 12.8MB）。
