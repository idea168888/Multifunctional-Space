# **多元智能空間**
免費、無後端、無付費 API 的響應式創作網站。使用 HTML / CSS / JavaScript；電腦、平板與手機皆可操作。

## 功能
- LINE 靜態貼圖：PNG 簽章、尺寸、張數、大小、透明像素檢查，以及官方送審入口；不會自動上架或保證審核。
- 影片：規則式分鏡腳本產生與文字匯出；不包含影片生成或剪輯。
- 圖文：1080×1080 卡片即時預覽、PNG 下載。
- 研發：實驗計畫模板；創作成品：本機紀錄。
- 自訂主題、本機收藏、JSON 備份與匯入、本機 QR 碼產生。

創作助理是規則式工具，不是連線 AI 模型。所有作品保留在各自瀏覽器 localStorage，無跨裝置同步或公開作品共享。公開訪客均可使用工具，不需帳號；清除瀏覽器資料前請備份。

## 開發
```sh
cd /workspace/Multifunctional-Space
python3 -m http.server 8000 --bind 0.0.0.0
```
不需安裝依賴或建置。QR 程式為 vendored qrcode-generator 2.0.4（MIT，版權說明見 vendor/qrcode.js）。

## 免費公開部署
1. 推送到 GitHub 的 main。
2. 儲存庫 Settings → Pages → Source 選 **GitHub Actions**。
3. 執行或重新執行 Deploy free static site，完成後以工作流程顯示的網址為準。
4. 預期網址： https://idea168888.github.io/Multifunctional-Space/ 。確認已部署後，用網站「分享空間」產生 QR 碼。

GitHub Pages 免費方案一般需使用公開儲存庫。私人儲存庫的方案與限制以 GitHub 設定為準；本專案不會自動購買任何服務或更改儲存庫可見性。

## LINE 規則
工具適用一般靜態貼圖。列示常見規格：貼圖 8/16/24/32/40 張，最大 370×320、偶數像素尺寸；主圖 240×240；標籤 96×74；透明 PNG，每張 ≤1 MB，ZIP ≤60 MB。RGB、72dpi 以上、約 10px 留白、權利與內容需人工確認。實作時官方規格頁回應 403，無法確認最新修訂，送審前務必查閱：
- https://creator.line.me/zh-hant/guideline/sticker/
- https://creator.line.me/zh-hant/review_guideline/

實際送審需由使用者登入 LINE Creators Market 並提供全部素材及商品資料，審核、售價及分潤依 LINE 現行規則。
