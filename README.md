# Mini Tools

Chrome MV3 扩展：选中网页文本后，通过右键菜单快速查询地区代码或汇率。

## 功能

- `查地区`：读取 `data/country_codes.csv`，支持用国际代码、中文地区名、英文名称、电话区号匹配，并展示其他字段。
- `查汇率`：调用 [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api)，优先展示美元和人民币双向汇率，并支持其他币种列表筛选。
- API fallback：优先使用 jsDelivr，失败后使用 Cloudflare Pages，再失败后读取 `data/exchange-api` 本地缓存。

## 安装调试

1. 打开 Chrome：`chrome://extensions/`
2. 开启右上角 `Developer mode`
3. 点击 `Load unpacked`
4. 选择本仓库目录：`C:\Users\m2637\OneDrive\文档\ilands_tools`
5. 在任意网页选中文本，右键选择 `Mini Tools -> 查地区` 或 `Mini Tools -> 查汇率`

## 打包

生成标准 Chrome 扩展 ZIP：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package_chrome_extension.ps1
```

输出文件位于 `dist/mini-tools-chrome-extension-v版本.zip`。

## UI 原型

见 [docs/ui-prototype.md](docs/ui-prototype.md)。

## 数据

- 地区数据：`data/country_codes.csv`
- 汇率缓存：`data/exchange-api`
- 更新汇率缓存：`node scripts/fetch_exchange_api.mjs`
- 指定币种缓存：`node scripts/fetch_exchange_api.mjs usd,cny,eur,jpy`
