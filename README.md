# kiyo 应用合集

一个静态站，按分类列出我写的应用，每个应用给介绍 + 安装包 + 更新说明。

## 页面上的版本号是怎么来的

**不是写死的。** 打开页面时，`app.js` 会去发布仓拉 `version.json`
（同一份清单问三个来源：raw 带时间戳、raw、jsDelivr，取版本号最高的那条），
然后：

* 把卡片上的版本徽章刷成当前最新版；
* 把「下载 APK」按钮指向清单里的地址；
* 有更新说明就显示出来。

所以**发新版之后什么都不用做**，用户打开网站看到的就是新版本。

三个来源全拿不到时，会退回 `apps.json` 里 `release.fallback` 写的那份
—— 保证下载按钮永远是可用的。

## 加一个新应用

只改 `apps.json`：在对应分类的 `apps` 数组里加一个对象。

* 不需要更新功能的，`release` 字段留成 `null` 即可；
* 有更新功能的，填 `release.repo`（GitHub 仓库，格式 `用户/仓库`）
  和 `release.manifest`（清单文件名），再给一份 `release.fallback`。

## 本地预览

```powershell
python -m http.server 8000
```

然后打开 `http://127.0.0.1:8000/`。

> 直接双击 `index.html` 不行：`fetch('apps.json')` 在 `file://` 下会被浏览器拦掉。

## 目录

```
index.html     页面骨架
style.css      样式(无外链字体/CDN —— 国内少一个外链就少一个打不开的地方)
app.js         渲染 + 自动检测更新
apps.json      应用数据，加应用只改这里
assets/        图标与截图
```
