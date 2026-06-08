# eatbit

吃在北理 eatbit 是一个面向北京理工大学校园饮食的开源社区项目，包含网页版和微信小程序。项目把食堂区、店面、菜品、评分评论、个人吃饭记录、随机推荐和 AI 问吃什么整合在一起，目标是让同学们共同维护一份更好用的校内吃饭地图。

## 功能

- 食堂区/宿舍楼下/商业区分层浏览
- 店面、菜品、价格、评分、评论和图片
- 店铺关门、菜品下架状态
- 搜索、排行榜、随机骰一下
- 今天吃了什么和个人统计
- 工单反馈
- 网页管理员后台
- Cloudflare Workers AI 推荐吃什么
- 微信小程序端复用同一套 Cloudflare API 和 D1 数据

## 技术栈

- Web: Vue 3, Vite, Naive UI
- Backend: Cloudflare Pages Functions
- Database: Cloudflare D1
- AI: Cloudflare Workers AI
- Mini Program: 原生微信小程序, Vant Weapp

## 本地开发

```bash
npm ci
npm run dev
```

本地预览 Cloudflare Pages Functions：

```bash
npm run pages:dev
```

小程序开发：

```bash
cd miniprogram
npm ci
```

然后用微信开发者工具打开 `miniprogram/`，并在工具里执行“构建 npm”。

## 环境变量和绑定

Cloudflare Pages 需要配置：

- `DB`: D1 数据库绑定
- `AI`: Workers AI 绑定
- `ADMIN_PASSWORD`: 管理员后台密码，作为 Pages Secret 保存

本地可参考 [.env.example](./.env.example)。

## 数据库迁移

新增表结构请放到 `migrations/`，不要直接改线上数据库。

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

## 部署

网页推荐使用 Cloudflare Pages Git Integration：PR 自动生成 Preview，合并到 `main` 后自动部署到生产站点。

仓库也提供 GitHub Actions：

- `ci.yml`: PR/主分支构建检查
- `deploy-web.yml`: 使用 Wrangler 部署 Cloudflare Pages
- `miniprogram-upload.yml`: 手动上传小程序体验版

小程序正式提审和发布建议在微信公众平台人工确认。

## 贡献

欢迎 issue 和 pull request。提交前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## License

MIT
