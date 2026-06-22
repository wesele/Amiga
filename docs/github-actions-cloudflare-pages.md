# GitHub Actions: 构建发布 + 同步 Cloudflare Pages 教程

本文档以 Amiga 项目为实例，完整说明如何用一条 GitHub Actions workflow 实现：**打 tag → 构建 Android APK + Windows 安装包 → 发布 GitHub Release → 同步部署到 Cloudflare Pages**。

---

## 整体流水线

```
git tag v0.4.0 && git push --tags
        │
        ▼
┌─────────────────────────────────────────────┐
│             Release workflow 触发             │
├─────────────┬───────────────┬───────────────┤
│   android   │    windows    │   (并行)      │
│  Build APK  │  Build MSI/  │               │
│  Sign APK   │  NSIS/EXE    │               │
│  Upload art │  Upload art  │               │
├─────────────┴───────────────┤               │
│         release             │  (等待构建完成) │
│   Download artifacts        │               │
│   Rename APK                │               │
│   Create GitHub Release     │               │
├─────────────────────────────┤               │
│       deploy-pages          │  (等待发布完成) │
│   Download APK from Release │               │
│   Stage HTML + icon         │               │
│   Inject version            │               │
│   Deploy to CF Pages        │               │
└─────────────────────────────┘
```

四个 job 依次依赖：`android` / `windows`（并行）→ `release` → `deploy-pages`。

---

## 第一步：Workflows 基本结构

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

关键设计：

| 项目 | 说明 |
|------|------|
| `on: push: tags: v*` | 只有打 `v` 前缀的 tag 才触发，普通 commit 不跑 |
| `workflow_dispatch` | 保留手动触发入口（但 deploy-pages 用 `if` 过滤，手动跑不会部署 Pages） |
| `concurrency` | 同一 tag 只允许一个运行，不互相取消（`cancel-in-progress: false`） |
| `permissions: contents: write` | 顶层给 Release 创建 + asset 上传权限 |

---

## 第二步：构建 Android APK

### 环境准备

```yaml
jobs:
  android:
    name: Android (APK)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android,armv7-linux-androideabi,x86_64-linux-android,i686-linux-android
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
```

Tauri Android 构建需要 Node、Rust（含 Android target）、JDK 17 三条工具链。

### Linux 系统依赖

```yaml
      - name: Install Linux system deps (Tauri runtime)
        run: |
          sudo apt-get update
          sudo apt-get install -y --no-install-recommends \
            libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
            libayatana-appindicator3-dev librsvg2-dev
```

这是 Tauri Linux 交叉编译的硬依赖，缺任何一个都会编译失败。

### 签名密钥

APK 上架必须签名。密钥文件通过 GitHub Secrets 以 base64 传入：

```yaml
      - name: Decode release keystore
        env:
          AMIGA_KEYSTORE_BASE64: ${{ secrets.AMIGA_KEYSTORE_BASE64 }}
        run: |
          if [ -z "$AMIGA_KEYSTORE_BASE64" ]; then
            echo "::error::Secret AMIGA_KEYSTORE_BASE64 is not set."
            exit 1
          fi
          mkdir -p src-tauri
          echo "$AMIGA_KEYSTORE_BASE64" | base64 -d > src-tauri/amiga-release.keystore
```

> **如何生成 keystore 并存入 Secrets**：
> ```bash
> keytool -genkey -v -keystore amiga-release.keystore \
>   -alias amiga -keyalg RSA -keysize 2048 -validity 10000
> base64 -w0 amiga-release.keystore > keystore.b64
> ```
> 然后把 `keystore.b64` 的内容粘贴到 GitHub repo → Settings → Secrets → `AMIGA_KEYSTORE_BASE64`。同时保存 `AMIGA_KEYSTORE_PASSWORD`、`AMIGA_KEY_ALIAS`、`AMIGA_KEY_PASSWORD`。

### 手动签名 APK

Tauri 的 Gradle `signingConfig` 在 CI 中未能正确读取 `keystore.properties`（产物仍是 `*-unsigned.apk`），所以我们在构建后用 `apksigner` 手动签名：

```yaml
      - name: Build APK (aarch64)
        run: npx tauri android build --target aarch64 --apk
      - name: Sign APK (post-step, apksigner)
        env:
          AMIGA_KEYSTORE_PASSWORD: ${{ secrets.AMIGA_KEYSTORE_PASSWORD }}
          AMIGA_KEY_ALIAS: ${{ secrets.AMIGA_KEY_ALIAS }}
          AMIGA_KEY_PASSWORD: ${{ secrets.AMIGA_KEY_PASSWORD }}
        run: |
          UNSIGNED=$(find src-tauri/gen/android/app/build/outputs/apk -name '*-unsigned.apk' | head -1)
          test -n "$UNSIGNED" || { echo "::error::No unsigned APK"; exit 1; }
          SIGNED="${UNSIGNED/-unsigned.apk/.apk}"
          ZIPALIGN=$(ls -d /usr/local/lib/android/sdk/build-tools/*/zipalign | head -1)
          APKSIGNER=$(ls -d /usr/local/lib/android/sdk/build-tools/*/apksigner | head -1)
          "$ZIPALIGN" -f -p 4 "$UNSIGNED" "$SIGNED"
          "$APKSIGNER" sign \
            --ks src-tauri/amiga-release.keystore \
            --ks-key-alias "$AMIGA_KEY_ALIAS" \
            --ks-pass "pass:$AMIGA_KEYSTORE_PASSWORD" \
            --key-pass "pass:$AMIGA_KEY_PASSWORD" \
            --out "$SIGNED" \
            "$SIGNED"
          "$APKSIGNER" verify --verbose "$SIGNED"
```

> GitHub runner 预装了 Android SDK `/usr/local/lib/android/sdk/`，其中包含 `zipalign` 和 `apksigner`，无需额外安装。

---

## 第三步：构建 Windows 安装包

```yaml
  windows:
    name: Windows (MSI/NSIS/EXE)
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - uses: dtolnay/rust-toolchain@stable
      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri -> target
      - name: npm ci
        run: npm ci
      - name: Build Tauri bundle
        run: npx tauri build
      - name: Collect Windows installers
        shell: pwsh
        run: |
          New-Item -ItemType Directory -Force -Path dist-artifacts | Out-Null
          Get-ChildItem -Path src-tauri/target/release/bundle/msi,src-tauri/target/release/bundle/nsis `
            -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.Extension -in '.msi','.exe' } |
            Copy-Item -Destination dist-artifacts/
```

Windows 构建比 Android 简单——无需签名、无需 Android SDK，`npx tauri build` 一条命令产出 MSI + NSIS + EXE。

---

## 第四步：发布 GitHub Release

```yaml
  release:
    name: Publish GitHub Release
    needs: [android, windows]
    runs-on: ubuntu-latest
    steps:
      - name: Download all build artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts
      - name: Rename APK to versioned filename
        run: |
          version="${GITHUB_REF_NAME#v}"
          find artifacts/amiga-android-apk -maxdepth 1 -type f -name '*.apk' \
            -execdir mv {} "amiga-v${version}.apk" \;
      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          name: ${{ github.ref_name }}
          generate_release_notes: true
          files: |
            artifacts/amiga-android-apk/*
            artifacts/amiga-windows-installer/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

要点：

- `needs: [android, windows]` 确保两个构建都成功后才发布
- APK 重命名为 `amiga-v0.4.0.apk` 这样的版本化文件名，方便用户识别
- `generate_release_notes: true` 自动从 commit log 生成更新说明

---

## 第五步：同步部署 Cloudflare Pages

这是最容易踩坑的环节。下面逐项说明。

### 5.1 Cloudflare Pages 项目名的坑

**问题**：Cloudflare Pages 项目名不一定是你在 Dashboard 里看到的那个。如果 `amiga` 这个名字在 `pages.dev` 已被占用，Cloudflare 会自动加随机后缀，真实项目名变成类似 `amiga-7xz`。

**踩坑记录**：

| 尝试 | `--project-name` | 结果 |
|------|-------------------|------|
| v0.3.12 | `amiga-7xz` | Project not found (code: 8000007) |
| v0.3.13 | `amiga-7xz` | 同上 |
| v0.3.14 | `amiga` | 成功（但靠的是 wrangler 模糊匹配） |
| v0.3.15 | `amiga` + `--branch=master` | 稳定成功 |

**正确做法**：从 Cloudflare API 或 Dashboard 确认真实项目名，然后硬编码到 workflow 环境变量中：

```yaml
  deploy-pages:
    env:
      CF_PROJECT_NAME: amiga-7xz    # 真实项目名，不是你想要的那个
```

> **如何确认真实项目名**：
> ```bash
> curl -H "Authorization: Bearer $CF_API_TOKEN" \
>   "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects" \
>   | python -c "import json,sys; [print(p['name']) for p in json.load(sys.stdin)['result']]"
> ```
> 或者在 Cloudflare Dashboard → Workers & Pages → 你的项目 → Settings 里看。

### 5.2 `--branch` 的坑

**问题**：打 tag 触发 workflow 时，`github.ref` 是 `refs/tags/v0.4.0`，此时 HEAD 处于 detached 状态，当前分支不是 `master`。如果不指定 `--branch`，wrangler 会使用一个不存在的分支名，导致部署变成 **preview** 而非 **production**。

**正确做法**：显式指定 `--branch=master`（即你在 Cloudflare Pages 项目设置中配置的 production branch）：

```yaml
        run: |
          npx wrangler@latest pages deploy pages-dist \
            --project-name="$CF_PROJECT_NAME" \
            --commit-dirty=true \
            --branch=master
```

### 5.3 wrangler-action vs 原生 npx wrangler

**问题**：`cloudflare/wrangler-action@v3` 内部硬装 `wrangler@3.90.0`，而 GitHub runner 预装的是 wrangler 4.x。每次运行都会：
1. 尝试 `npx --no-install wrangler` → 失败（版本不兼容）
2. 降级安装 `wrangler@3.90.0`（10 秒+）
3. 用旧版部署

这既浪费时间，又引入版本风险。

**正确做法**：去掉 `wrangler-action`，直接跑 `npx wrangler@latest`，用环境变量传递凭据：

```yaml
      - name: Deploy to Cloudflare Pages (production)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        run: |
          npx wrangler@latest pages deploy pages-dist \
            --project-name="$CF_PROJECT_NAME" \
            --commit-dirty=true \
            --branch=master
```

> wrangler CLI 读取 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID` 环境变量，无需在命令行里传 `--token` 或 `--account-id`。

### 5.4 GitHub Deployments 权限

**问题**：workflow 的 `permissions` 只有 `contents: read`，wrangler 尝试创建 GitHub Deployment 时失败，产生 warning：

```
Creating Github Deployment failed
```

不影响 Cloudflare 部署成功，但日志里有 warning 不干净。

**正确做法**：在 job 级别加 `deployments: write`：

```yaml
    permissions:
      contents: read
      deployments: write
```

### 5.5 完整的 deploy-pages job

```yaml
  deploy-pages:
    name: Deploy APK to Cloudflare Pages
    if: startsWith(github.ref, 'refs/tags/v')
    needs: release
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    env:
      CF_PROJECT_NAME: amiga-7xz
    steps:
      - uses: actions/checkout@v4
      - name: Download APK from GitHub Release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p pages-dist
          gh release download "$GITHUB_REF_NAME" \
            --pattern "amiga-v*.apk" \
            --dir pages-dist
          APK=$(ls pages-dist/amiga-v*.apk | head-1)
          if [ -z "$APK" ]; then
            echo "::error::No APK asset found in release $GITHUB_REF_NAME"
            exit 1
          fi
          mv "$APK" pages-dist/Amiga.apk
      - name: Stage static assets
        run: |
          cp pages/amiga-icon.png pages-dist/amiga-icon.png
          cp pages/index.html pages-dist/index.html
      - name: Inject version into HTML
        env:
          VERSION: ${{ github.ref_name }}
        run: |
          sed -i "s|__AMIGA_VERSION__|${VERSION}|g" pages-dist/index.html
      - name: Deploy to Cloudflare Pages (production)
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        run: |
          npx wrangler@latest pages deploy pages-dist \
            --project-name="$CF_PROJECT_NAME" \
            --commit-dirty=true \
            --branch=master
```

设计要点：

1. **`if: startsWith(github.ref, 'refs/tags/v')`** — `workflow_dispatch` 手动触发时没有 tag，不跑部署，避免下载不到 APK 出错
2. **从 Release 下载而非用构建产物** — `needs: release` 确保 GitHub Release 已创建；用 `gh release download` 获取已发布的 APK，不依赖 build job 的 artifact 路径
3. **版本注入** — `pages/index.html` 里的 `__AMIGA_VERSION__` 占位符在部署时被 `sed` 替换为真实 tag 名（如 `v0.4.0`），每个版本都会更新

---

## 第六步：Cloudflare Dashboard 前置配置

在 workflow 能跑通之前，需要先在 Cloudflare 完成：

### 6.1 创建 Pages 项目

Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git（或直接用 Direct Upload）。

> 如果选 Direct Upload，项目会自动创建，名字可能带随机后缀（见 5.1）。

### 6.2 生成 API Token

Cloudflare Dashboard → My Profile → API Tokens → Create Token，模板选 **Edit Cloudflare Workers**，或者自定义权限：
- Account → Cloudflare Pages → Edit
- Zone → Zone → Read（可选）

记录生成的 token，后续无法再查看。

### 6.3 获取 Account ID

Cloudflare Dashboard → 任意域名 Overview 页面右下角，或 URL 中 `https://dash.cloudflare.com/<account-id>/...` 里的那段。

### 6.4 配置 GitHub Secrets

在 repo → Settings → Secrets and variables → Actions 中添加：

| Secret 名 | 值 |
|-----------|------|
| `CF_API_TOKEN` | 6.2 中生成的 API Token |
| `CF_ACCOUNT_ID` | 6.3 中获取的 Account ID |
| `AMIGA_KEYSTORE_BASE64` | keystore 文件的 base64 编码 |
| `AMIGA_KEYSTORE_PASSWORD` | keystore 密码 |
| `AMIGA_KEY_ALIAS` | 签名密钥别名 |
| `AMIGA_KEY_PASSWORD` | 签名密钥密码 |

> `GITHUB_TOKEN` 是 GitHub Actions 自动提供的，无需手动添加。

### 6.5 确认 Production Branch

Cloudflare Dashboard → Workers & Pages → 你的项目 → Settings → Builds & deployments → Production branch。

这个值必须和 workflow 里 `--branch=` 参数一致。默认通常是 `main` 或 `master`，如果和 workflow 不一致，pages 部署会走 preview 而非 production。

---

## 踩坑总结

| 问题 | 症状 | 原因 | 解法 |
|------|------|------|------|
| 项目名不存在 | `Project not found [code: 8000007]` | CF Pages 真实名有随机后缀 | 从 API 获取真实名，硬编码到 `env.CF_PROJECT_NAME` |
| 部署走 preview 而非 production | 页面更新了但不是 production | tag push 时 HEAD detached，wrangler 用了错误的 branch | 加 `--branch=master` |
| wrangler-action 降级安装旧版 | 每次安装 wrangler 3.x（10s+） | action v3 内部写死了 `wrangler@3.90.0` | 去掉 action，直接 `npx wrangler@latest` |
| GitHub Deployment warning | `Creating Github Deployment failed` | job 只有 `contents: read`，缺少 `deployments: write` | 加 `deployments: write` 到 permissions |
| workflow_dispatch 触发也部署 | `gh release download` 找不到 APK | 手动触发没有 tag 对应的 Release | 用 `if: startsWith(github.ref, 'refs/tags/v')` 过滤 |

---

## 发布流程

全部配置完成后，日常发布只需要：

```bash
# 1. 确保代码已推送到 master
git push origin master

# 2. 打 tag 并推送
git tag v0.4.0
git push origin v0.4.0

# 3. 等待 GitHub Actions 完成
#    约 10-15 分钟后：
#    - GitHub Release 出现新版本及所有安装包
#    - Cloudflare Pages 更新下载页面
```

访问 `https://<project-name>.pages.dev` 即可看到最新的下载页面。

---

## 本地项目中的相关文件

| 文件 | 作用 |
|------|------|
| `.github/workflows/release.yml` | 完整 workflow 定义 |
| `pages/index.html` | 下载页 HTML（含 `__AMIGA_VERSION__` 占位符） |
| `pages/amiga-icon.png` | 下载页展示的应用图标 |
