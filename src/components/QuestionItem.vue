<script setup>
import { ref } from 'vue'

const props = defineProps({
  question: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['delete'])

const fileInput = ref(null)

const triggerImageUpload = () => {
  fileInput.value.click()
}
// ... rest of script

const handleImageChange = (event) => {
  const file = event.target.files[0]
  if (file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      props.question.image = e.target.result
    }
    reader.readAsDataURL(file)
  }
}
</script>

<template>
  <div class="question-item">
    <button class="delete-btn" @click="$emit('delete')" title="删除题目">×</button>
    <div class="q-header">
      <span class="q-num" contenteditable @blur="question.qNum = $event.target.innerText">{{ question.qNum }}</span>
      <h3 class="q-title" contenteditable @blur="question.title = $event.target.innerText">{{ question.title }}</h3>
    </div>
    
    <div class="q-tags" v-if="question.tags">
      <span class="tag-label">Tags:</span>
      <span class="tag-content" contenteditable @blur="question.tags = $event.target.innerText">{{ question.tags }}</span>
    </div>

    <div class="q-image-container" v-if="question.image" @click="triggerImageUpload" title="点击替换图片">
      <img :src="question.image" alt="Question Image" class="q-image" />
      <div class="image-overlay">📷 更换图片</div>
    </div>
    <div class="q-image-placeholder" v-else @click="triggerImageUpload" title="点击上传图片">
       📷 添加图片
    </div>
    <input type="file" ref="fileInput" accept="image/*" style="display: none" @change="handleImageChange">

    <div class="q-desc">
      <!-- Using v-html for initial render, processing edits might need complexity. 
           For simplicity, we assume text editing. If HTML is needed, we prefer not to break structure.
           Let's just bind text for safety or allow innerHTML edit. -->
      <div class="desc-content" contenteditable @blur="question.desc = $event.target.innerHTML" v-html="question.desc"></div>
    </div>

    <div class="q-io-section" v-if="question.input || question.output">
      <div class="io-block">
        <label>输入信息：</label>
        <pre contenteditable @blur="question.input = $event.target.innerText">{{ question.input }}</pre>
      </div>
      <div class="io-block">
        <label>输出信息：</label>
        <pre contenteditable @blur="question.output = $event.target.innerText">{{ question.output }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ... existing styles ... */
.q-image-container {
  position: relative;
  display: inline-block;
  cursor: pointer;
}

.image-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.6);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  pointer-events: none;
}

.q-image-container:hover .image-overlay {
  opacity: 1;
}

/* ... existing styles ... */
/* ... existing styles ... */
.question-item {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border: 2px solid var(--text-color);
  border-radius: 3px 8px 4px 6px / 6px 4px 9px 3px; /* Hand-drawn feel */
  background: #fffefb;
  box-shadow: 4px 4px 0 rgba(0,0,0,0.1);
  position: relative;
}

.question-item::before {
  content: '';
  position: absolute;
  top: 6px;
  left: 6px;
  right: 6px;
  bottom: 6px;
  border: 1px dashed var(--paper-line);
  border-radius: 2px 7px 3px 5px / 5px 3px 8px 2px;
  pointer-events: none;
}

.q-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
  border-bottom: 2px solid var(--text-color);
  padding-bottom: 5px;
  /* Slight rotation just for the header line visual? No, straight text implies straight line. */
  /* Maybe refine border-bottom to use a pseudo element for "hand drawn line"? Too complex for now. */
}

/* ... (q-num, q-title, q-tags) ... */
.q-num {
  font-weight: bold;
  font-size: 1.2em;
  color: var(--accent-color);
}

.q-title {
  margin: 0;
  flex: 1;
}

.q-tags {
  font-size: 0.9em;
  color: #666;
  margin-bottom: 15px;
  font-style: italic;
}

.q-image {
  max-width: 100%;
  border: 2px solid var(--text-color);
  border-radius: 2px 4px 2px 5px;
  padding: 5px;
  background: white;
  margin-bottom: 15px;
  transform: rotate(-1deg);
  box-shadow: 2px 2px 0 rgba(0,0,0,0.1);
}

/* ... (desc-content) ... */
.desc-content {
  line-height: 1.6;
  margin-bottom: 15px;
}

.q-io-section {
  display: flex;
  gap: 20px;
  background: #f0f0f080;
  padding: 15px;
  border-radius: 5px 2px 8px 3px;
  border: 1px solid rgba(0,0,0,0.05);
}

/* ... (io-block) ... */
.io-block {
  flex: 1;
}

.io-block label {
  display: block;
  font-weight: bold;
  font-size: 0.8em;
  margin-bottom: 5px;
  text-transform: uppercase;
  color: var(--accent-color);
}

pre {
  font-family: 'Courier New', monospace; /* Monospace for code */
  background: #fff;
  padding: 10px;
  border: 2px solid #ddd;
  border-radius: 4px 8px 3px 6px / 6px 3px 7px 4px;
  min-height: 40px;
  white-space: pre-wrap;
  box-shadow: inset 1px 1px 3px rgba(0,0,0,0.05);
}

.delete-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: transparent;
  border: none;
  font-size: 1.5em;
  color: #999;
  cursor: pointer;
  line-height: 1;
  padding: 0 5px;
  z-index: 10;
  font-family: Arial, sans-serif; /* Standard font for X */
}

.delete-btn:hover {
  color: #c0392b;
}

.q-image-placeholder {
  border: 2px dashed var(--text-color);
  padding: 20px;
  text-align: center;
  margin-bottom: 15px;
  cursor: pointer;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  color: #999;
  font-family: var(--handwriting-font);
  opacity: 0.6;
  transition: all 0.2s;
}

.q-image-placeholder:hover {
  opacity: 1;
  background: rgba(0,0,0,0.05);
  transform: rotate(1deg);
}
</style>
