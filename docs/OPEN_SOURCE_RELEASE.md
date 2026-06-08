# eatbit open-source release checklist

## GitHub repository

Recommended repository name: `eatbit`.

Before making the repository public:

- Confirm `.env`, private keys, local WeChat private config, `.wrangler`, `dist`, `node_modules`, and `miniprogram/miniprogram_npm` are not committed.
- Enable branch protection for `main`.
- Require pull requests and CI checks before merge.
- Keep production deployment secrets available only to maintainers.

## GitHub Secrets

For web deployment:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

For mini program upload:

- `MP_APPID`
- `MP_PRIVATE_KEY`

`MP_PRIVATE_KEY` is the WeChat mini program upload private key content.

## Cloudflare Pages

Project: `eat-bitdate`

Required bindings/secrets:

- D1 binding: `DB`
- Workers AI binding: `AI`
- Pages secret: `ADMIN_PASSWORD`

Recommended production branch: `main`.

Build command:

```bash
npm ci && npm run build
```

Output directory:

```text
dist
```

## WeChat mini program

The workflow `miniprogram-upload.yml` uploads a development/experience version only.

Formal review and release should remain manual in WeChat Official Platform because review results depend on service category, privacy policy, screenshots, and platform policy.

## Data

D1 data is production user data and is not included in the open-source repository.

Schema changes must be added as SQL files in `migrations/`.
