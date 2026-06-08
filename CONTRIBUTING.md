# Contributing to eatbit

谢谢你愿意一起修 eatbit。这个项目直接服务校内同学，改动请尽量小而清楚。

## 开发流程

1. Fork 仓库或创建功能分支。
2. 安装依赖：

```bash
npm ci
```

3. 开发网页：

```bash
npm run dev
```

4. 提交前检查：

```bash
npm run build
```

5. 发起 Pull Request。

## 小程序

```bash
cd miniprogram
npm ci
```

用微信开发者工具打开 `miniprogram/`，执行“构建 npm”后预览。

## 数据和权限

- 不要提交真实密钥、账号密码、Cloudflare token、微信上传私钥。
- D1 表结构变更必须新增 `migrations/*.sql`。
- 管理员权限由数据库 `users.role` 控制。
- 关门/下架、评论删除等涉及用户数据的逻辑，请写清楚影响范围。

## PR 建议

PR 描述请包括：

- 改了什么
- 为什么这么改
- 是否影响数据库
- 是否影响小程序
- 本地验证结果

## 自动部署

网页：合并到 `main` 后自动部署。

小程序：工作流只上传体验版/开发版，正式提审发布由维护者人工操作。
