# Acorn 开发期解析器

- 上游：[acornjs/acorn](https://github.com/acornjs/acorn)，固定版本 **8.15.0**。
- 来源：npm 官方发行包 `https://registry.npmjs.org/acorn/-/acorn-8.15.0.tgz`。
- `acorn.js` 原样取自发行包的 `package/dist/acorn.js`，许可证见同目录 `LICENSE`。
- 发行包 SHA-512：`NZyJarBfL7nWwIq+FDL6Zp/yHEhePMNnnJ0y3qfieCrmNvYct8uvtiV41UvlSe6apAfk0fY1FbWx+NwfmpvtTg==`。
- `acorn.js` SHA-256：`fdb08546776ec6228b03e8d02b40d4ab3255bae5f401adba7ff5dad927ac5c9c`。

仅供 `tools/check-maintenance.js` 在 Node.js 中解析源码，不进入网页构建，也不增加 npm 安装步骤。检查使用 `ecmaVersion: 5`、`sourceType: 'script'`；选项说明见[上游文档](https://github.com/acornjs/acorn/blob/8.15.0/acorn/README.md)。更新时须核验官方发行包完整性、保留许可证，并重新运行维护保护测试。
