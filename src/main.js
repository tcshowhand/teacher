import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'
import localforage from 'localforage'

import { createPinia } from 'pinia'

localforage.config({
    name: 'ExamPaperApp',
    storeName: 'exam_data'
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
