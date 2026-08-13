# EazyFlow

面向项目工作的 Windows 11 桌面工具：用时间表回答“还有多少工作”，用项目页集中保存任务文件、参考文件、交付文件和其他文件。

## Beta 功能

- 小时表：每个项目独占一列，时间重叠也不会互相遮挡；双击进入项目，悬停查看详情。
- B1 月历：有交付时间的项目显示为连续色条；未定交付项目使用渐隐色条和“持续中 / 未定交付”标记。
- 项目工作区：四个固定文件分类，导入时将文件复制到 EazyFlow 数据目录。
- 文件操作：导入、双击打开、在资源管理器中显示、删除。
- GitHub Releases 自动检查与下载安装更新。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

构建 Windows 安装程序：

```bash
npm run dist:win
```

## 发布更新

更新 `package.json` 中的版本号并推送相同版本的标签，例如 `v0.1.0`。GitHub Actions 会生成 NSIS 安装程序和自动更新所需的 `latest.yml`。

```bash
git tag v0.1.0
git push origin v0.1.0
```

应用数据默认保存在 Electron 的 `userData/workspace` 目录内；Windows 通常对应 `%APPDATA%/EazyFlow/workspace`。
