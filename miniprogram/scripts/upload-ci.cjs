const path = require('path')
const ci = require('miniprogram-ci')

const appid = process.env.MP_APPID
const privateKeyPath = process.env.MP_PRIVATE_KEY_PATH
const version = process.env.MP_VERSION || '0.1.0'
const desc = process.env.MP_DESC || 'eatbit automated upload'

if (!appid) throw new Error('MP_APPID is required')
if (!privateKeyPath) throw new Error('MP_PRIVATE_KEY_PATH is required')

const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath: path.resolve(__dirname, '..'),
  privateKeyPath,
  ignores: ['node_modules/**/*', '.git/**/*']
})

ci.upload({
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
