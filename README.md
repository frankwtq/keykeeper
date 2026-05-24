<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://placehold.co/800x200/25262b/c1c2c5?text=KeyKeeper&font=montserrat">
  <img alt="KeyKeeper" src="https://placehold.co/800x200/f8f9fa/1a1a2e?text=KeyKeeper&font=montserrat">
</picture>

<p align="center">
  <b>轻量级桌面知识采集工具</b><br>
  随手保存网址、文字、图片、表格，多级分类 + 全文搜索
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-Intel%20%7C%20Apple%20Silicon-brightgreen" alt="macOS">
  <img src="https://img.shields.io/badge/Windows-10%2B-brightgreen" alt="Windows">
  <img src="https://img.shields.io/github/license/frankwtq/keykeeper" alt="License">
  <img src="https://img.shields.io/github/v/release/frankwtq/keykeeper" alt="Release">
</p>

---

## ✨ 功能

| 功能 | 说明 |
|---|---|---|
| **📥 多类型采集** | 网址、文字、图片、表格，一键保存 |
| **📸 截图即贴** | 截图后直接粘贴到应用（Ctrl+V），自动压缩存入数据库 |
| **📂 图片文件引用** | 也可以选择文件路径引用，支持大图 |
| **🖼 图片压缩** | 粘贴大图时自动压缩至 1920px · 80% JPEG，节省空间 |
| **🗂 多级分类** | 无限层级树形分类，子分类自动继承父分类筛选 |
| **🔍 全文搜索** | SQLite FTS5，搜标题、内容、预览，搜索命中高亮 |
| **🏷 标签系统** | 自由创建/管理标签，列表筛选，快速归组 |
| **⭐ 收藏管理** | 收藏标记 + 使用次数排序 |
| **📊 表格展示** | CSV 数据自动渲染为表格，支持滚动、表头固定、全屏查看 |
| **📝 Markdown 渲染** | 文字类内容支持 Markdown 实时预览切换 |
| **↕ 自定义排序** | 使用次数/创建时间/最近更新，支持升序/降序 |
| **🔄 拖拽排序** | 列表内拖拽调整顺序，跨分类拖拽移动 |
| **✅ 多选批量** | 多选后批量删除、批量移动到分类 |
| **🔖 网址预览** | 新增网址时自动抓取页面标题和描述 |
| **⌨ 全局快捷键** | Alt+Space 快速显示/隐藏，支持自定义录制 |
| **🔄 便携备份** | 一键导出/导入（zip 包含数据库和图片） |
| **🌙 深色模式** | 跟随系统主题自动切换 |
| **🖥 系统托盘** | 关闭窗口隐藏到托盘，后台常驻 |

## 🚀 快速开始

### 下载安装

从 [Releases](https://github.com/frankwtq/keykeeper/releases) 下载最新版本：

- **macOS**: 下载 `.dmg` 或直接打开 `.app`
- **Windows**: 下载 `.exe` 安装程序

首次打开 macOS 版本，如果提示"无法验证开发者"：
> **右键 → 打开** → 点击"打开"

### 全局快捷键

默认 `Alt+Space`（Mac 为 `⌥ + Space`），在任何界面按下即可唤出/隐藏窗口。

可在应用内 **⚙ 设置** → 录制自定义快捷键。

## 🖥 截图

> *截图待补充*

## 🛠 开发

```bash
# 克隆
git clone https://github.com/frankwtq/keykeeper.git
cd keykeeper

# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 打包
npm run tauri build
```

### 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React + TypeScript + Vite |
| 后端 | Rust + Tauri v2 |
| 数据库 | SQLite + FTS5 全文搜索 |
| 打包 | macOS (.app / .dmg), Windows (.exe) |

## 📄 License

[MIT](LICENSE)

## ☕ 支持

如果你觉得这个工具有用，可以请我喝杯咖啡：

<p align="center">
  <a href="https://afdian.com/u/6cdbe3c056ba11f1b4e352540025c377">
    <img src="https://img.shields.io/badge/爱发电-赞助-blue?style=for-the-badge" alt="爱发电赞助">
  </a>
  <a href="https://github.com/sponsors/frankwtq">
    <img src="https://img.shields.io/badge/Sponsor-GitHub-brightgreen?style=for-the-badge" alt="GitHub Sponsors">
  </a>
</p>
