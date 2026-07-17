# ComfyUI Manga Panel

[English](README.md) | 日本語

漫画ページ画像のコマをプレビュー上でドラッグ選択し、コマの縦横比に合った解像度で画像を生成して元ページへ戻すComfyUIカスタムノードです。処理はローカルで完結し、外部APIへの通信は行いません。

## インストール

このリポジトリを`ComfyUI/custom_nodes`へcloneし、ComfyUIを再起動します。

```powershell
cd ComfyUI\custom_nodes
git clone https://github.com/Tsubasa109/comfyui_manga_panel.git
```

`image/manga`カテゴリに次の3ノードが登録されます。

- `Manga Panel Selector`
- `Manga Panel Resolution`
- `Manga Panel Composite`

## ノード

### Manga Panel Selector

`Load Image`からページ画像を受け取り、赤い長方形でコマを選択します。

- 空いている場所をドラッグ: 新しい選択枠を作成
- 選択枠の内側をドラッグ: 枠を移動
- 四隅の白いハンドルをドラッグ: 枠をリサイズ
- `Full Image`: ページ全体を選択
- `Clear Selection`: 選択座標をクリア

標準`Load Image`へ直接接続した場合は、選択した入力画像を実行前にプレビューします。他の画像ノードへ接続した場合は、一度Queueを実行すると実行結果がプレビューに表示されます。

ページ画像、切り抜いたコマ、ページサイズのマスク、座標、寸法、縦横比を出力します。

![Manga Panel Selector](./examples/sample_images/0000.png)

### Manga Panel Resolution

選択した幅と高さから、縦横比を維持した生成解像度を計算します。

- `target_megapixels`: 目標画素数。初期値は1.0 MP
- `multiple`: 解像度を丸める単位
- `max_width` / `max_height`: 最大生成寸法
- `closest_area`: 指定画素数に最も近い寸法
- `fit_within_bounds`: 指定した上限内へ収まる寸法

`generation_width`と`generation_height`を`Empty Latent Image`などへ接続します。Queue実行後は、計算された解像度と実画素数を`768 × 1344 / 1.03 MP`の形式でノード内に表示します。

![Manga Panel Resolution](./examples/sample_images/0001.png)

### Manga Panel Composite

生成画像を選択したコマ寸法へ変換して元ページへ合成します。

- `fill`: コマ全体を埋め、はみ出した部分を中央で切り取る
- `fit`: 生成画像全体をコマ内へ収め、余った領域には元ページを残す
- `feather`: 合成境界をぼかすピクセル半径

![Manga Panel Resolution](./examples/sample_images/0002.png)

## 基本操作

1. ComfyUIを再起動するか、カスタムノードを再読み込みします。
2. `examples/manga_panel_generation.json`をComfyUIへドラッグします。
3. `Load Image`で漫画ページを選択します。(初期はサンプルとしてexamples/manga_panel_page.pngが選択されています)
4. `Manga Panel Selector`上で対象コマをドラッグします。
5. Checkpointとプロンプトを設定します。
6. Queueを実行します。
7. `Manga Panel Composite`の出力を確認または保存します。

## ライセンス
Apache License Version 2.0
