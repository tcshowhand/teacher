import { reactive, watch } from 'vue'

const STORE_KEY = 'exam_ai_settings_v1'

const defaultSettings = {
    aliApiKey: '',
    modelName: 'qwen-turbo',
    aliApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    examQuestionCount: 5,
    educationLevel: '大专'
}

const settings = reactive({ ...defaultSettings })

const stored = localStorage.getItem(STORE_KEY)
if (stored) {
    try {
        Object.assign(settings, JSON.parse(stored))
    } catch (e) {
        console.error('Failed to load settings', e)
    }
}

watch(settings, (newVal) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(newVal))
}, { deep: true })

export const useSettingsStore = () => {
    return settings
}
