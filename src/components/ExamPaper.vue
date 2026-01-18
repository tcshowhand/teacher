<script setup>
import { ref } from 'vue'
import QuestionItem from './QuestionItem.vue'

const props = defineProps({
  examData: {
    type: Object,
    required: true
  }
})

const deleteModalVisible = ref(false)
const pendingDeleteIndex = ref(-1)

const addQuestion = () => {
  props.examData.problems.push({
    qNum: `Q${props.examData.problems.length + 1}.`,
    title: '新题目',
    tags: '算法 / 数据结构',
    image: '', // No image by default
    desc: '点击编辑描述...',
    input: '1 2 3',
    output: '6'
  })
}

const removeQuestion = (index) => {
  pendingDeleteIndex.value = index
  deleteModalVisible.value = true
}

const confirmDelete = () => {
  if (pendingDeleteIndex.value > -1) {
    props.examData.problems.splice(pendingDeleteIndex.value, 1)
    pendingDeleteIndex.value = -1
  }
  deleteModalVisible.value = false
}

const cancelDelete = () => {
  pendingDeleteIndex.value = -1
  deleteModalVisible.value = false
}
</script>

<template>
  <div class="exam-paper" id="exam-paper">
    <div class="paper-header">
      <h1 class="main-title" contenteditable @blur="examData.title = $event.target.innerText">{{ examData.title }}</h1>
      <div class="info-section" v-if="examData.info">
        <div v-for="(line, idx) in examData.info" :key="idx" class="info-line">
          <span contenteditable @blur="examData.info[idx] = $event.target.innerText">{{ line }}</span>
        </div>
      </div>
    </div>

    <div class="problems-section">
      <QuestionItem 
        v-for="(problem, index) in examData.problems" 
        :key="index" 
        :question="problem" 
        @delete="removeQuestion(index)"
      />
    </div>

    <div class="add-section">
      <button class="add-btn" @click="addQuestion">➕ 添加新题目</button>
    </div>

    <div class="paper-footer">
      <p contenteditable @blur="examData.footer = $event.target.innerText">{{ examData.footer }}</p>
    </div>

    <!-- Custom Delete Confirmation Modal -->
    <div class="modal-overlay" v-if="deleteModalVisible">
      <div class="modal-content">
        <h3>🗑️ 确认删除？</h3>
        <p>这道题目将被永久移除，就像被橡皮擦擦掉一样！</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="cancelDelete">取消</button>
          <button class="modal-btn confirm" @click="confirmDelete">删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.exam-paper {
  max-width: 800px;
  margin: 40px auto;
  padding: 60px;
  background: white;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  position: relative;
  /* Paper texture */
  background-image: linear-gradient(var(--paper-line) 1px, transparent 1px), linear-gradient(90deg, var(--paper-line) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Holes for binding */
.exam-paper::after {
  content: '';
  position: absolute;
  left: 40px;
  top: 0;
  bottom: 0;
  width: 40px;
  border-left: 2px dashed var(--paper-line);
}

.paper-header {
  text-align: center;
  margin-bottom: 40px;
  position: relative;
  z-index: 1;
}

.main-title {
  font-size: 2em;
  margin-bottom: 20px;
  border-bottom: 3px double var(--text-color);
  display: inline-block;
  padding-bottom: 10px;
}

.info-section {
  display: flex;
  justify-content: center;
  gap: 20px;
  font-size: 1.1em;
  line-height: 2;
}

.info-line span {
  padding: 0 10px;
}

.paper-footer {
  text-align: center;
  margin-top: 50px;
  font-size: 0.9em;
  color: #888;
  border-top: 1px solid #eee;
  padding-top: 20px;
}

.add-section {
  text-align: center;
  margin: 30px 0;
  opacity: 0; /* Hidden by default for printing? No, we probably want it visible then auto-hide during PDF export? */
  /* Actually PDF export clone logic copies styles. If we want to hide it in PDF, we can use a class or handle it in export logic. */
  /* For now let's just make it visible. */
  opacity: 1; 
  transition: opacity 0.3s;
}

.exam-paper:hover .add-section {
  opacity: 1;
}

.add-btn {
  background: transparent;
  border: 2px dashed var(--paper-line);
  color: var(--text-color);
  padding: 10px 30px;
  font-size: 1.1em;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  opacity: 0.6;
  transition: all 0.2s;
}

.add-btn:hover {
  opacity: 1;
  background: rgba(255,255,255,0.5);
  transform: scale(1.02);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(3px);
}

.modal-content {
  background: var(--paper-bg);
  padding: 30px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px solid var(--text-color);
  box-shadow: 10px 10px 0 rgba(0,0,0,0.2);
  max-width: 400px;
  text-align: center;
  font-family: var(--handwriting-font);
  transform: rotate(-1deg);
}

.modal-content h3 {
  font-size: 1.5em;
  margin-bottom: 15px;
}

.modal-content p {
  margin-bottom: 25px;
  font-size: 1.1em;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
}

.modal-btn {
  padding: 8px 20px;
  border: 2px solid var(--text-color);
  background: transparent;
  font-family: inherit;
  font-size: 1.1em;
  cursor: pointer;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  transition: transform 0.1s;
}

.modal-btn:hover {
  transform: scale(1.05);
}

.modal-btn.confirm {
  background: var(--highlight-color);
  color: white;
  border-color: var(--highlight-color);
}


.modal-btn.cancel {
  border-style: dashed;
}

/* Hide image placeholder when exporting to PDF */
.exam-paper.exporting :deep(.q-image-placeholder) {
  display: none !important;
}

/* Also hide the add button when exporting just in case */
.exam-paper.exporting .add-section {
  display: none !important;
}
</style>
