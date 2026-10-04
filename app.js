/* ---------------------------------------------------------------
   kiyo 应用合集 —— 页面逻辑

   两件事:
     1. 按 apps.json 渲染分类和应用卡;
     2. 打开页面时去 GitHub 拉版本清单, 把"最新版"和下载链接刷成当前值。

   为什么要在页面上现拉清单, 而不是把版本号写死在 HTML 里:
     写死的话, 每次发新版都得回来改这个网站 —— 改一次忘一次,
     最后页面上挂着一个几个月前的版本号, 用户下到的却是新的, 看着像假的。
     现拉的代价只是多一次请求, 拿不到还能退回 fallback 里的值。
   --------------------------------------------------------------- */

const SOURCE_TIMEOUT_MS = 6000;

/**
 * 国内加速通道。
 *
 * 为什么需要它:安装包托管在 GitHub 上, 国内直连实测只有 50~150 KB/s,
 * 30MB 要下五分钟以上, 还容易断;挂上这个前缀后实测 3.5 MB/s, 9 秒下完。
 *
 * ⚠️ 它是**第三方转发**:文件会经过别人的服务器。所以页面上同时给出
 * 官方直连和 SHA-256 —— 文件本身按哈希核对过是一致的, 谁不放心可以自己验,
 * 或者点官方那条(慢, 但不过第三方)。
 * 要是哪天这个通道挂了, 换掉下面这一行就行;官方按钮不受影响。
 */
const MIRROR_PREFIX = "https://gh-proxy.com/";

/** 同一份清单问三个来源, 谁给的版本号最高用谁 —— 和手表端同一套策略。 */
function manifestUrls(repo, file) {
  return [
    // 带时间戳 = 绕开 CDN 缓存, 刚发的版本当场能看到
    `https://raw.githubusercontent.com/${repo}/main/${file}?t=${Date.now()}`,
    `https://raw.githubusercontent.com/${repo}/main/${file}`,
    `https://cdn.jsdelivr.net/gh/${repo}@main/${file}`,
  ];
}

async function fetchOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SOURCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLatest(app) {
  const { repo, manifest } = app.release;
  let best = null;
  for (const url of manifestUrls(repo, manifest)) {
    const data = await fetchOnce(url);
    if (!data || typeof data.versionCode !== "number") continue;
    if (!best || data.versionCode > best.versionCode) best = data;
  }
  return best;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderApp(app) {
  const card = el("article", "app");
  card.id = "app-" + app.id;

  const head = el("div", "app-head");
  const icon = el("img", "app-icon");
  icon.src = app.icon;
  icon.alt = app.name;
  head.appendChild(icon);

  const titleBox = el("div");
  const title = el("h3", "app-title", app.name);
  const badge = el("span", "badge", "读取版本中…");
  badge.dataset.role = "version-badge";
  title.appendChild(badge);
  titleBox.appendChild(title);
  titleBox.appendChild(el("p", "app-meta", app.platform + " · " + app.tagline));
  head.appendChild(titleBox);
  card.appendChild(head);

  card.appendChild(el("p", "app-summary", app.summary));

  const actions = el("div", "actions");

  // 国内加速下载放主按钮:访客绝大多数在国内, 官方直连那条慢得多。
  const fast = el("a", "btn", "下载 APK");
  fast.dataset.role = "download-fast";
  actions.appendChild(fast);

  const download = el("a", "btn btn-ghost", "官方直连");
  download.dataset.role = "download";
  actions.appendChild(download);

  const copy = el("button", "btn btn-ghost", "复制官方链接");
  copy.type = "button";
  copy.addEventListener("click", async () => {
    const link = download.href;
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = "已复制";
    } catch (error) {
      // 有些浏览器不给剪贴板权限(比如非 https 打开), 退回到"选中给你看"
      window.prompt("复制这个链接:", link);
      copy.textContent = "已复制";
    }
    setTimeout(() => { copy.textContent = "复制官方链接"; }, 1800);
  });
  actions.appendChild(copy);

  const version = el("span", "version checking", "正在检测最新版…");
  version.dataset.role = "version-text";
  actions.appendChild(version);
  card.appendChild(actions);

  // 校验值摆在按钮下面:走第三方加速通道时, 这是唯一能自己核对的办法。
  const sha = el("p", "sha");
  sha.dataset.role = "sha";
  card.appendChild(sha);

  card.appendChild(el("p", "hint", "下载失败就换另一个按钮试试，或者加群找我要。"));

  const notes = el("p", "notes");
  notes.dataset.role = "notes";
  notes.hidden = true;
  card.appendChild(notes);

  if (app.highlights && app.highlights.length) {
    const list = el("ul", "highlights");
    app.highlights.forEach((line) => list.appendChild(el("li", null, line)));
    card.appendChild(list);
  }

  if (app.shots && app.shots.length) {
    const shots = el("div", "shots");
    app.shots.forEach((shot) => {
      const fig = el("figure");
      const img = el("img");
      img.src = shot.src;
      img.alt = app.name + " " + shot.caption;
      img.loading = "lazy";
      fig.appendChild(img);
      fig.appendChild(el("figcaption", null, shot.caption));
      shots.appendChild(fig);
    });
    card.appendChild(shots);
  }

  if (app.notice) card.appendChild(el("p", "notice", app.notice));

  return card;
}

async function applyLatestVersion(card, app) {
  const badge = card.querySelector('[data-role="version-badge"]');
  const link = card.querySelector('[data-role="download"]');
  const fast = card.querySelector('[data-role="download-fast"]');
  const text = card.querySelector('[data-role="version-text"]');
  const notes = card.querySelector('[data-role="notes"]');
  const sha = card.querySelector('[data-role="sha"]');

  // 先按 fallback 摆好, 保证"就算一个来源都不通, 下载按钮也能用"
  const fallback = app.release.fallback;
  link.href = fallback.apkUrl;
  link.setAttribute("download", "");
  fast.href = MIRROR_PREFIX + fallback.apkUrl;
  badge.textContent = "v" + fallback.versionName;
  sha.textContent = fallback.sha256 ? "SHA-256 " + fallback.sha256 : "";

  const latest = await fetchLatest(app);
  if (!latest) {
    text.className = "version stale";
    text.textContent = "连不上 GitHub，先按 v" + fallback.versionName + " 下载";
    return;
  }

  link.href = latest.apkUrl;
  fast.href = MIRROR_PREFIX + latest.apkUrl;
  badge.textContent = "v" + latest.versionName;
  sha.textContent = latest.sha256 ? "SHA-256 " + latest.sha256 : "";
  text.className = "version fresh";
  text.textContent = "已是最新（" + new Date().toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }) + " 检测）";

  if (latest.notes) {
    notes.hidden = false;
    notes.textContent = "";
    notes.appendChild(el("span", "label", "更新内容"));
    notes.appendChild(document.createTextNode(latest.notes));
  }
}

async function main() {
  const catalog = document.getElementById("catalog");
  let data;
  try {
    const res = await fetch("apps.json", { cache: "no-store" });
    data = await res.json();
  } catch (error) {
    catalog.appendChild(el("p", "warn", "应用列表读取失败，刷新一下试试。"));
    return;
  }

  document.title = data.site.title;
  document.getElementById("site-title").textContent = data.site.title;
  // 标语留空就整行不显示 —— 空 <p> 会白白撑出一段间距
  const tagline = document.getElementById("site-tagline");
  if (data.site.tagline) {
    tagline.textContent = data.site.tagline;
  } else {
    tagline.remove();
  }
  const qq = document.getElementById("qq-link");
  qq.textContent = data.site.qq;
  qq.href = "https://qm.qq.com/q/" + data.site.qq;
  document.getElementById("qface").textContent = data.site.qface;

  const tasks = [];
  data.categories.forEach((category) => {
    const section = el("section", "category");
    section.appendChild(el("h2", null, category.name));
    category.apps.forEach((app) => {
      const card = renderApp(app);
      section.appendChild(card);
      tasks.push(applyLatestVersion(card, app));
    });
    catalog.appendChild(section);
  });

  await Promise.all(tasks);
}

main();
