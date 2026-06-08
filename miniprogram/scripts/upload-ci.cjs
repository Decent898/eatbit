const path = require('path')
const fs = require('fs/promises')
const ci = require('miniprogram-ci')

const appid = process.env.MP_APPID
const privateKeyPath = process.env.MP_PRIVATE_KEY_PATH
const version = process.env.MP_VERSION || '0.1.0'
const desc = process.env.MP_DESC || 'eatbit automated upload'

if (!appid) throw new Error('MP_APPID is required')
if (!privateKeyPath) throw new Error('MP_PRIVATE_KEY_PATH is required')

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function copyVantWeappDist(projectPath) {
  const source = path.join(projectPath, 'node_modules', '@vant', 'weapp', 'dist')
  const target = path.join(projectPath, 'miniprogram_npm', '@vant', 'weapp', 'dist')

  if (!(await pathExists(source))) {
    throw new Error(`Vant Weapp dist not found: ${source}`)
  }

  await fs.rm(path.join(projectPath, 'miniprogram_npm', '@vant', 'weapp'), {
    recursive: true,
    force: true
  })
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.cp(source, target, { recursive: true })
  console.log(`Copied Vant Weapp dist to ${target}`)
}

async function ensureMiniProgramNpm(project, projectPath) {
  try {
    const warnings = await ci.packNpm(project, {
      ignores: [],
      reporter: (info) => console.log(info)
    })

    if (Array.isArray(warnings) && warnings.length) {
      console.warn('packNpm warnings:', warnings)
    }
  } catch (error) {
    console.warn('packNpm failed, falling back to direct Vant Weapp packaging.')
    console.warn(error)
    await copyVantWeappDist(projectPath)
    return
  }

  const vantButton = path.join(
    projectPath,
    'miniprogram_npm',
    '@vant',
    'weapp',
    'dist',
    'button',
    'index.json'
  )

  if (!(await pathExists(vantButton))) {
    console.warn('packNpm did not generate Vant Weapp components, using fallback packaging.')
    await copyVantWeappDist(projectPath)
  }
}

async function main() {
  const projectPath = path.resolve(__dirname, '..')
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*', '.git/**/*']
  })

  await ensureMiniProgramNpm(project, projectPath)

  await ci.upload({
    project,
    version,
    desc,
    setting: {
      es6: true,
      minify: true,
      minifyJS: true,
      minifyWXML: true,
      minifyWXSS: true
    },
    onProgressUpdate: console.log
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
