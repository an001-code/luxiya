# 战场背景资源

## 最简单的替换方法

1. 准备一张横向背景图，推荐 `1920×1080` 或更高分辨率。
2. 将图片保存为本目录下的 `arena-background.jpg`。
3. 刷新浏览器。Vite 会把 `public` 目录中的文件直接映射到网站根路径，不需要修改 React 代码。

图片不存在时，界面会自动回退到 `arena-background.svg`。

## 使用 PNG 或 WebP

打开 `apps/web/src/styles.css`，修改 `:root` 中的变量：

```css
--arena-background-image: url('/assets/你的图片.webp'), url('/assets/arena-background.svg');
```

背景会以 `cover` 方式居中裁切。界面上方仍会保留暗色遮罩、透视网格和红蓝阵营光效，以保证卡牌文字可读。
