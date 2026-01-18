<script setup>
import { reactive, ref, computed } from 'vue'
import { useSettingsStore } from '../store/settings'
import { LESSON_PLAN_MODELS } from '../config/models'

const settings = useSettingsStore()
const props = defineProps({
  currentModelId: {
    type: String,
    default: ''
  },
  showModelSelector: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['close', 'change-model'])

const handleClose = () => {
  emit('close')
}

const isEditingApiKey = ref(false)

const displayApiKey = computed(() => {
  const key = settings.aliApiKey || ''
  if (isEditingApiKey.value) return key
  if (!key) return ''
  if (key.length <= 8) return key
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
})

const updateApiKey = (e) => {
  settings.aliApiKey = e.target.value
}

const openAliyunLink = () => {
  window.open('https://bailian.console.aliyun.com/?apiKey=1#/api-key', '_blank')
}
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-content settings-modal">
      <h3>⚙️ AI 设置</h3>

      <div class="form-group" v-if="showModelSelector">
        <label>选择教案模型</label>
        <select :value="currentModelId" @change="$emit('change-model', $event.target.value)" class="modal-input select-input">
            <option v-for="model in LESSON_PLAN_MODELS" :key="model.id" :value="model.id">
                {{ model.name }}
            </option>
        </select>
        <p class="tips">切换模型将自动保存并加载该模型下的数据。</p>
      </div>
      
      <div class="form-group">
        <label>学历阶段</label>
        <select v-model="settings.educationLevel" class="modal-input select-input">
            <option value="幼儿园">幼儿园</option>
            <option value="小学">小学</option>
            <option value="初中">初中</option>
            <option value="高中">高中</option>
            <option value="大专">大专</option>
            <option value="本科">本科</option>
            <option value="研究生">研究生</option>
        </select>
        <p class="tips">生成内容将适配所选学历的认知水平。</p>
      </div>


      <div class="form-group">
        <label>生成试题数量</label>
        <input type="number" v-model="settings.examQuestionCount" min="1" max="20" class="modal-input" />
        <p class="tips">AI 一次生成的题目数量 (默认 5)。</p>
      </div>


      <div class="form-group">
        <label>API Key <span class="required">*</span></label>
        <input 
            :value="displayApiKey" 
            @input="updateApiKey"
            @focus="isEditingApiKey = true" 
            @blur="isEditingApiKey = false"
            placeholder="sk-..." 
            class="modal-input" 
        />
        <p class="tips">
          请前往 <a href="#" @click.prevent="openAliyunLink">阿里云百炼</a> 获取 API Key。
        </p>
      </div>

      <div class="form-group">
        <label>模型名称</label>
        <input v-model="settings.modelName" placeholder="qwen-turbo" class="modal-input" />
        <p class="tips">默认为 <code>qwen-turbo</code>，也可填 <code>qwen-plus</code> 等。</p>
      </div>




      <div class="modal-actions">
        <button class="modal-btn confirm" @click="handleClose">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(3px);
}

.settings-modal {
  width: 90%;
  max-width: 450px;
  background: #fdfbf7;
  padding: 30px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px solid #2c3e50;
  box-shadow: 10px 10px 0 rgba(0,0,0,0.2);
  font-family: 'Architects Daughter', cursive, sans-serif;
  text-align: left;
}

h3 {
  text-align: center;
  font-size: 1.8em;
  margin-bottom: 25px;
  border-bottom: 2px dashed #ccc;
  padding-bottom: 10px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 1.1em;
}

.required {
  color: #e74c3c;
}

.modal-input {
  width: 100%;
  padding: 12px;
  box-sizing: border-box; 
  font-size: 1em;
  border: 2px solid #2c3e50;
  border-radius: 10px;
  outline: none;
  font-family: inherit;
  background: rgba(255,255,255,0.8);
}

.tips {
  font-size: 0.85em;
  color: #666;
  margin-top: 5px;
}

.tips a {
  color: #2980b9;
  text-decoration: none;
  border-bottom: 1px dashed #2980b9;
}

.modal-actions {
  text-align: center;
  margin-top: 30px;
}

.modal-btn {
  padding: 10px 30px;
  border: 2px solid #2c3e50;
  background: transparent;
  font-family: inherit;
  font-size: 1.2em;
  cursor: pointer;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  transition: transform 0.1s;
}

.modal-btn.confirm {
  background: #27ae60;
  color: white;
  border-color: #27ae60;
}

.modal-btn:hover {
  transform: scale(1.05);
}
</style>
