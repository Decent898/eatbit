import { createApp } from 'vue'
import naive, { createDiscreteApi } from 'naive-ui'
import App from './App.vue'
import router from './router'
import './styles/global.css'

const app = createApp(App)
const discrete = createDiscreteApi(['message', 'dialog'])

window.$message = discrete.message
window.$dialog = discrete.dialog

app.use(router)
app.use(naive)
app.mount('#app')
