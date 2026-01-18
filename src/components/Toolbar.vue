<script setup>
import { ref } from 'vue'
import ServiceModal from './ServiceModal.vue'

const props = defineProps({
  isLessonPlan: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['export-pdf', 'export-word', 'export-json', 'import-json', 'save-template', 'load-template', 'reset-data', 'open-settings'])

const isExpanded = ref(false)
const showServiceModal = ref(false)

const handleFileImport = (event) => {
  const file = event.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result)
        emit('import-json', json)
      } catch (err) {
        alert('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }
}
</script>

<template>
  <div class="toolbar" :class="{ 'mobile-expanded': isExpanded }">
    
    <!-- Mobile Toggle Button -->
    <button class="toggle-btn" @click="isExpanded = !isExpanded">
      {{ isExpanded ? '❌' : '🛠️' }}
    </button>

    <div class="toolbar-content">
      <label class="import-btn">
        📂 导入 JSON
        <input type="file" accept=".json" @change="handleFileImport" style="display: none;" />
      </label>

      <button @click="$emit('export-json')">💾 导出 JSON</button>
      <button @click="$emit('save-template')">📑 保存模板</button>
      <button @click="$emit('load-template')">📁 我的模板</button>
      <button @click="$emit('reset-data')" style="color: #c0392b; border-color: #c0392b;">🗑️ 重置数据</button>
      
      <button v-if="isLessonPlan" @click="$emit('export-word')">📄 导出 Word</button>
      <button v-else @click="$emit('export-pdf')">📄 导出 PDF</button>

      <div class="separator"></div>

      <button @click="showServiceModal = true" style="background: #fff8e1; border-color: #f1c40f; color: #f39c12;">➕ 定制模型</button>
      <button @click="$emit('open-settings')">⚙️ 设置</button>
    </div>
    
    <ServiceModal v-if="showServiceModal" @close="showServiceModal = false" />
  </div>
</template>

<style scoped>
.toolbar {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end; /* Align to right */
}

.toolbar-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.separator {
  height: 2px;
  background: #ccc;
  margin: 5px 0;
  border-radius: 2px;
  width: 100%;
}

button, .import-btn {
  background: var(--paper-bg, #fff);
  border: 2px solid var(--text-color, #2c3e50);
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; /* Organic border */
  padding: 10px 15px;
  text-align: left;
  font-family: var(--handwriting-font, inherit);
  font-size: 1.1em;
  box-shadow: 3px 3px 0 var(--text-color, #2c3e50);
  transition: transform 0.1s;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color, #2c3e50);
  white-space: nowrap; /* Prevent wrapping */
}

button:active, .import-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 var(--text-color, #2c3e50);
}

.import-btn:hover, button:hover {
  background: #fff;
}

/* Mobile Toggle Styles */
.toggle-btn {
  display: none;
}

@media (max-width: 768px) {
  .toolbar {
    top: auto;
    bottom: 30px;
    right: 20px;
    flex-direction: column-reverse; /* Toggle button at bottom */
    gap: 15px;
  }

  .toggle-btn {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    font-size: 1.5em;
    padding: 0;
    z-index: 101;
    background: #2c3e50;
    color: white;
    border-color: #2c3e50;
    box-shadow: 2px 4px 8px rgba(0,0,0,0.3);
  }

  .toggle-btn:hover {
    background: #34495e;
    transform: scale(1.1);
  }

  .toolbar-content {
    display: none;
    background: rgba(255, 255, 255, 0.95);
    padding: 15px;
    border-radius: 15px;
    border: 2px dashed #2c3e50;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    transform-origin: bottom right;
    animation: popIn 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  .toolbar.mobile-expanded .toolbar-content {
    display: flex;
  }
}

@keyframes popIn {
  from { opacity: 0; transform: scale(0.8) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>
