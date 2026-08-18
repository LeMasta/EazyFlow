# EazyFlow

面向项目工作的 Windows 11 桌面工具：用时间表回答“还有多少工作”，用项目页集中保存任务文件、参考文件、交付文件和其他文件。

## Beta 功能

- 小时表：横轴为工作时间、纵轴为项目；未定结束和逾期项目随当前时间推进，支持缩放时间轴。
- 工作日历：支持双休、单休、大小周、自定义工作周，以及中国法定节假日、调休和额外休息日。
- B1 月历：有交付时间的项目显示为连续色条；未定交付项目使用渐隐色条和“持续中 / 未定交付”标记。
- 项目工作区：每个项目使用项目名建立独立目录，并自动建立“任务文件、参考文件、交付文件、其他”四个子目录。
- 文件操作：可选择或拖放文件及整个文件夹；悬停显示打开、定位和删除操作，删除内容进入 Windows 回收站。
- 存储设置：可在设置页调整项目文件存储位置，现有项目会随之安全迁移。
- 项目状态随开始时间自动变化；计划交付与实际结束分开记录，可回改结束时间并比较提前或逾期。
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

项目文件默认保存在 Electron 的 `userData/workspace/projects` 目录内，可在应用设置页更改；项目元数据仍保存在 `userData/workspace`，Windows 通常对应 `%APPDATA%/EazyFlow/workspace`。
