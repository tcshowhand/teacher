<script setup>
import { ref, defineProps } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    required: true
  },
  isGenerating: {
    type: Boolean,
    default: false
  }
})

// Helper to add a new row to teaching process
const addProcessRow = () => {
  if (!props.data['教学过程']) {
    props.data['教学过程'] = []
  }
  props.data['教学过程'].push(['环节名称', '环节内容描述...'])
}

const removeProcessRow = (index) => {
  props.data['教学过程'].splice(index, 1)
}
</script>

<template>
  <div class="lesson-plan-paper">
    <div class="header">
      <h1 contenteditable @blur="data['授课课题'] = $event.target.innerText">{{ data['授课课题'] || '授课课题' }}</h1>
      <h2 contenteditable @blur="data['子章节'] = $event.target.innerText">{{ data['子章节'] || '子章节标题' }}</h2>
    </div>

    <!-- Summary Area -->
    <div class="summary-area">
      <label>备课摘要/设计意图：</label>
      <div class="summary-content" contenteditable @blur="data['摘要'] = $event.target.innerText">
        {{ data['摘要'] }}
      </div>
      <button class="ai-gen-btn-inline" :class="{ 'loading': isGenerating }" @click="$emit('generate-ai')" :disabled="isGenerating">
        <span v-if="isGenerating" class="spinner">↻</span>
        {{ isGenerating ? 'AI 正在奋笔疾书生成教案中...' : '✨ AI 一键生成完整教案' }}
      </button>
    </div>

    <div class="info-grid">
      <div class="info-item">
        <label>编号：</label>
        <span contenteditable @blur="data['编号'] = $event.target.innerText">{{ data['编号'] }}</span>
      </div>
      <div class="info-item">
        <label>课时安排：</label>
        <span contenteditable @blur="data['课时安排'] = $event.target.innerText">{{ data['课时安排'] }}</span>
      </div>
      <div class="info-item">
        <label>授课形式：</label>
        <select v-model="data['授课形式']" class="detail-select">
          <option value="理论课">理论课</option>
          <option value="实践课">实践课</option>
          <option value="理实一体课">理实一体课</option>
        </select>
      </div>
    </div>

    <hr class="separator" />

    <div class="section">
      <h3>知识与技能</h3>
      <div class="editable-area" contenteditable @blur="data['知识与技能'] = $event.target.innerText">
        {{ data['知识与技能'] }}
      </div>
    </div>

    <div class="section">
      <h3>过程与方法</h3>
      <div class="editable-area" contenteditable @blur="data['过程与方法'] = $event.target.innerText">
        {{ data['过程与方法'] }}
      </div>
    </div>

    <div class="section">
      <h3>情感、态度、价值观</h3>
      <div class="editable-area" contenteditable @blur="data['情感、态度、价值观'] = $event.target.innerText">
        {{ data['情感、态度、价值观'] }}
      </div>
    </div>

    <div class="section">
      <h3>教学重点</h3>
      <div class="editable-area" contenteditable @blur="data['教学重点'] = $event.target.innerText">
        {{ data['教学重点'] }}
      </div>
    </div>

    <div class="section">
      <h3>教学难点</h3>
      <div class="editable-area" contenteditable @blur="data['教学难点'] = $event.target.innerText">
        {{ data['教学难点'] }}
      </div>
    </div>
    
    <div class="section">
      <h3>教学方法</h3>
      <div class="editable-area" contenteditable @blur="data['教学方法'] = $event.target.innerText">
        {{ data['教学方法'] }}
      </div>
    </div>

    <div class="section">
      <h3>媒介</h3>
      <div class="editable-area" contenteditable @blur="data['媒介'] = $event.target.innerText">
        {{ data['媒介'] }}
      </div>
    </div>

    <div class="section">
      <h3>教学过程</h3>
      <table class="process-table">
        <thead>
          <tr>
            <th width="20%">环节</th>
            <th width="75%">内容</th>
            <th width="5%"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in data['教学过程']" :key="index">
            <td contenteditable @blur="row[0] = $event.target.innerText">{{ row[0] }}</td>
            <td contenteditable @blur="row[1] = $event.target.innerText">{{ row[1] }}</td>
            <td class="action-cell">
              <button class="remove-btn" @click="removeProcessRow(index)">×</button>
            </td>
          </tr>
        </tbody>
      </table>
      <button class="add-btn" @click="addProcessRow">➕ 添加环节</button>
    </div>

    <div class="section">
      <h3>学习资料</h3>
      <div class="editable-area" contenteditable @blur="data['学习资料'] = $event.target.innerText">
        {{ data['学习资料'] }}
      </div>
    </div>

    <div class="section">
      <h3>课后小结</h3>
      <div class="editable-area" contenteditable @blur="data['课后小结'] = $event.target.innerText">
        {{ data['课后小结'] }}
      </div>
    </div>

  </div>
</template>

<style scoped>
.lesson-plan-paper {
  max-width: 800px;
  margin: 40px auto;
  padding: 60px;
  background: white;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  position: relative;
  /* Paper texture matching ExamPaper */
  background-image: linear-gradient(#e1ded5 1px, transparent 1px), linear-gradient(90deg, #e1ded5 1px, transparent 1px);
  background-size: 20px 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  color: #2c3e50;
}

.header {
  text-align: center;
  margin-bottom: 30px;
}

h1 {
  font-size: 2.2em;
  border-bottom: 2px solid #333;
  display: inline-block;
  margin-bottom: 10px;
}

h2 {
  font-size: 1.5em;
  font-weight: normal;
  color: #555;
  margin: 0;
}

.info-grid {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.info-item {
  margin: 5px 10px;
  font-weight: bold;
}

.info-item span {
  font-weight: normal;
  border-bottom: 1px dashed #999;
  padding: 0 5px;
}

.detail-select {
  border: none;
  border-bottom: 1px dashed #999;
  background: transparent;
  font-family: inherit;
  font-size: 1em;
  padding: 0 5px;
  outline: none;
  cursor: pointer;
  color: #2c3e50;
}

.detail-select:hover, .detail-select:focus {
  border-bottom-style: solid;
  border-bottom-color: #3498db;
  background: rgba(52, 152, 219, 0.05);
}

.separator {
  border: none;
  border-top: 2px solid #333;
  margin: 20px 0;
}

.section {
  margin-bottom: 20px;
}

h3 {
  font-size: 1.2em;
  margin-bottom: 8px;
  background: #f0f4f8;
  padding: 5px 10px;
  border-left: 4px solid #3498db;
}

.editable-area {
  min-height: 40px;
  padding: 10px;
  border: 1px dashed transparent;
  line-height: 1.6;
}

.editable-area:hover, .editable-area:focus {
  border-color: #3498db;
  background: rgba(255,255,255,0.8);
  outline: none;
}

/* Process Table */
.process-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 10px;
}

.process-table th, .process-table td {
  border: 1px solid #ccc;
  padding: 10px;
  vertical-align: top;
}

.process-table th {
  background: #f9f9f9;
}

.process-table td[contenteditable]:hover, .process-table td[contenteditable]:focus {
  background: #fff;
  outline: 2px solid #3498db;
  outline-offset: -2px;
}

.remove-btn {
  border: none;
  background: transparent;
  color: #e74c3c;
  font-size: 1.2em;
  cursor: pointer;
}

.add-btn {
  width: 100%;
  padding: 8px;
  background: #f0f4f8;
  border: 1px dashed #bdc3c7;
  color: #3498db;
  cursor: pointer;
  transition: all 0.2s;
}

.add-btn:hover {
  background: #eaf2f8;
  border-color: #3498db;
}

.summary-area {
  margin-bottom: 30px;
  background: #fff8e1;
  padding: 15px;
  border: 1px dashed #f1c40f;
  border-radius: 5px;
}

.summary-area label {
  display: block;
  font-weight: bold;
  color: #d35400;
  margin-bottom: 5px;
}

.summary-content {
  min-height: 40px;
  margin-bottom: 15px;
  color: #555;
  line-height: 1.5;
  outline: none;
}

.summary-content:focus {
  background: rgba(255,255,255,0.5);
}

.ai-gen-btn-inline {
  background: linear-gradient(135deg, #f39c12 0%, #d35400 100%);
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: bold;
  box-shadow: 0 3px 5px rgba(0,0,0,0.1);
  transition: all 0.2s;
  display: block;
  width: 100%;
}

.ai-gen-btn-inline:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 5px 8px rgba(0,0,0,0.15);
}

.ai-gen-btn-inline:disabled {
  opacity: 0.9; /* Keep it visible */
  cursor: wait;
}

.ai-gen-btn-inline.loading {
  background: linear-gradient(90deg, #f39c12, #e67e22, #d35400, #e67e22, #f39c12);
  background-size: 200% 100%;
  animation: gradientMove 2s infinite linear;
}

.spinner {
  display: inline-block;
  margin-right: 8px;
  animation: spin 1s infinite linear;
  font-weight: bold;
}

@keyframes gradientMove {
  0% { background-position: 0% 0%; }
  100% { background-position: 200% 0%; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
