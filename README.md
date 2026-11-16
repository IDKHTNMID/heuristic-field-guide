# 啟發式演算法圖鑑

一個演算法一頁的靜態網站，寫給沒學過啟發式演算法的資工系學生。每一頁只用一句生活比喻開場，接著讓它在同一套問題上一行一行跑給你看：右邊亮起來的虛擬碼，就是左邊地圖上正在發生的事。

- **網站**：https://idkhtnmid.github.io/heuristic-field-guide/
- **兩種問題**：連續地形（找最高點）和旅行推銷員問題 TSP（找最短路線）。每個演算法標示自己能跑哪幾種。
- **收錄清單**：看網站首頁，或 `js/registry.js`（首頁的卡片就是從這裡產生的）。

## 本機預覽

純 HTML／CSS／JavaScript，沒有建置步驟，也不用安裝套件。

```bash
python -m http.server 8000
```

打開 http://localhost:8000/ 。

## 檢查

需要 Node 18 以上。

```bash
node tests/run.mjs          # 全站檢查：registry、每一頁的區塊、每個演算法跑得動也會變好
node tests/presets.mjs      # 把每頁「試試看」的按鈕跑完，印出結果
node tests/stats.mjs --write # 重寫每頁 demo 下面的成績單（種子 1～100，約一分鐘）
node --test                 # 檢查腳本本身的測試
```

## 協作規則

新增或修改頁面前，先讀 [`AGENTS.md`](AGENTS.md)。它寫了資料夾結構、新增一個演算法的步驟、頁面格式、程式介面、視覺風格和寫作規則。`CLAUDE.md` 只是把它引入。網站上的[規則頁](https://idkhtnmid.github.io/heuristic-field-guide/rules.html)是它的摘要，每一塊都連回 AGENTS.md 的那一節。
