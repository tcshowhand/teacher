<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import ExamPaper from '../components/ExamPaper.vue'
import AIChatAssistant from '../components/AIChatAssistant.vue'
import Toolbar from '../components/Toolbar.vue'
import SettingsModal from '../components/SettingsModal.vue'

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { saveAs } from 'file-saver'
import localforage from 'localforage'
import { useRoute } from 'vue-router'

import { sendToQwenAIDialogue } from '../api/qwenAPI'

import { useSettingsStore } from '../store/settings'
import { DEFAULT_MODEL_ID } from '../config/models'

const settings = useSettingsStore()

const currentDocId = ref('')
const examData = ref(null)
const isGeneratingExam = ref(false)


const TEMPLATES_KEY = 'exam_paper_templates_v1'
const LAST_ACTIVE_KEY = 'last_active_doc_v1'

const savedTemplates = ref([])
const showSaveModal = ref(false)
const showLoadModal = ref(false)
const showDeleteConfirmModal = ref(false)
const showResetConfirmModal = ref(false)
const showLoadConfirmModal = ref(false)
const showSettingsModal = ref(false)

const pendingDeleteTemplateIndex = ref(-1)
const pendingLoadTemplate = ref(null)
const templateName = ref('')
const isExporting = ref(false)
const showApiKeyAlertModal = ref(false) // New Alert Modal


const route = useRoute()

// Helper to create empty exam structure
const createEmptyExam = (title = '新试题') => ({
  title: title,
  subTitle: '考试时间：__分钟  满分：__分',
  items: []
})

const getStorageKey = (docId) => {
  return `exam_data_v1_paper_${currentModelId.value}_${docId}`
}

const currentModelId = ref(localStorage.getItem('last_active_model_id') || DEFAULT_MODEL_ID)

const handleModelChange = async (newModelId) => {
    currentModelId.value = newModelId
    localStorage.setItem('last_active_model_id', newModelId)
    await loadCurrentData()
}

const loadCurrentData = async () => {
  const storageKey = getStorageKey(currentDocId.value)
  let loaded = false
  
  try {
    const cached = await localforage.getItem(storageKey)
    if (cached) {
      examData.value = typeof cached === 'string' ? JSON.parse(cached) : cached
      loaded = true
    }
  } catch (e) {
    console.error('Failed to parse cached data', e)
  }

  if (!loaded) {
    // Default initialization logic
    let title = route.query.title || currentDocId.value
    let subTitle = ''
    
    // Attempt to sync with Generator State if applicable
    const { courseName, chapterId } = route.query
    if (courseName && chapterId) {
        const GENERATOR_STORAGE_KEY = 'lesson_plan_generator_state_v3'
        try {
            const rawState = localStorage.getItem(GENERATOR_STORAGE_KEY)
            if (rawState) {
                const state = JSON.parse(rawState)
                if (state.courseName === courseName) {
                    const foundChapter = state.generatedChapters.find(c => c.id === Number(chapterId))
                    if (foundChapter) {
                        title = `${courseName} - ${foundChapter.mainTitle}`
                        subTitle = foundChapter.subTitle ? `章节：${foundChapter.subTitle}` : ''
                    }
                }
            }
        } catch(e) { console.error(e) }
    }

    if (currentDocId.value === 'default_doc') {
         try {
            const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'
            const response = await fetch(`${baseUrl}exam_data.json`)
            examData.value = await response.json()
         } catch(e) {
            examData.value = createEmptyExam(title)
         }
    } else {
         examData.value = createEmptyExam(title)
         if (subTitle) examData.value.subTitle = subTitle
    }
  }
}

onMounted(async () => {

  // 1. Load Templates
  try {
    const cachedTemplates = await localforage.getItem(TEMPLATES_KEY)
    if (cachedTemplates) {
      savedTemplates.value = typeof cachedTemplates === 'string' ? JSON.parse(cachedTemplates) : cachedTemplates
    }
  } catch (e) {
    console.error('Failed to load templates', e)
  }

  // 2. Determine Document ID (Persistence Key)
  const { courseName, chapterId } = route.query
  
  if (courseName && chapterId) {
    currentDocId.value = `${courseName}_ch${chapterId}`
  } else if (route.query.title) {
    currentDocId.value = route.query.title
  } else {
    currentDocId.value = localStorage.getItem(LAST_ACTIVE_KEY) || 'default_doc'
  }
  
  localStorage.setItem(LAST_ACTIVE_KEY, currentDocId.value)

  // 3. Load Data
  await loadCurrentData()
})

// Auto-save to local storage (IndexedDB)
watch(examData, async (newVal) => {
  if (newVal && currentDocId.value) {
    try {
      const storageKey = getStorageKey(currentDocId.value)
      await localforage.setItem(storageKey, JSON.parse(JSON.stringify(newVal))) 
    } catch (e) {
      console.error('Auto-save failed', e)
    }
  }
}, { deep: true })

const saveTemplatesToStorage = async () => {
  try {
    await localforage.setItem(TEMPLATES_KEY, JSON.parse(JSON.stringify(savedTemplates.value)))
  } catch (e) {
    alert('保存模板失败: ' + e.message)
  }
}

const handleExportPDF = async () => {
  const element = document.getElementById('exam-paper')
  if (!element) return

  isExporting.value = true
  await nextTick()

  try {
    const scale = 2
    const canvas = await html2canvas(element, { 
      scale: scale,
      useCORS: true,
      backgroundColor: '#ffffff' 
    })
    
    const contentWidth = canvas.width
    const contentHeight = canvas.height
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfPageWidth = pdf.internal.pageSize.getWidth()
    const pdfPageHeight = pdf.internal.pageSize.getHeight()
    const pxPerMm = contentWidth / pdfPageWidth
    const marginMm = 20
    const marginPx = marginMm * pxPerMm
    const pageHeightInPx = (pdfPageHeight * pxPerMm) - (marginPx * 2) // Printable area height in px
    
    // Get all question items to check for cuts
    const questionElements = element.querySelectorAll('.question-item')
    // Calculate logical positions (unscaled) then scale them
    // Note: html2canvas scale affects the image size, but DOM offsetTop is unscaled.
    // We need to map DOM coordinates to Canvas coordinates.
    // Canvas is scaled by 'scale'. DOM offsets are 1x.
    // So we multiply DOM offsets by scale.
    
    const questions = Array.from(questionElements).map(el => {
      // Get offset relative to the exam-paper element
      // offsetTop is relative to offsetParent. 
      // We assume exam-paper is the offsetParent or we calculate cumulative offset.
      // safest is getBoundingClientRect
      const rect = el.getBoundingClientRect()
      const containerRect = element.getBoundingClientRect()
      const top = (rect.top - containerRect.top) * scale
      const height = rect.height * scale
      return { top, bottom: top + height }
    })

    let currentY = 0
    let remainingHeight = contentHeight

    while (currentY < contentHeight) {
      if (currentY > 0) pdf.addPage()
      
      // Default: Fill the page
      let sliceHeight = Math.min(pageHeightInPx, contentHeight - currentY)
      let nextCutY = currentY + sliceHeight

      // Check if we are cutting through a question
      // A question is cut if: q.top < nextCutY AND q.bottom > nextCutY
      // We look for the FIRST question that satisfies this
      const crossingQuestion = questions.find(q => q.top < nextCutY && q.bottom > nextCutY)

      if (crossingQuestion) {
        // If the question is taller than the page itself, we can't avoid cutting it.
        // We only adjust if the question starts AFTER currentY (it fits on the page partially, but we prefer to push it)
        // OR if it could fit on the NEXT page.
        // Simplified logic: If the cut is strictly inside the question, and the question top is below currentY,
        // we cut AT the question top (pushing it to next page).
        if (crossingQuestion.top > currentY) {
            // Adjust cut to be at the start of the question
            nextCutY = crossingQuestion.top
            sliceHeight = nextCutY - currentY
        }
        // If crossingQuestion.top <= currentY, it means a huge question starting before this page even began 
        // (or at the top) is continuing. We just have to cut it.
      }

      // Create a canvas for this slice
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = contentWidth
      sliceCanvas.height = sliceHeight
      
      const sCtx = sliceCanvas.getContext('2d')
      
      // Draw the slice
      // drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
      sCtx.drawImage(canvas, 0, currentY, contentWidth, sliceHeight, 0, 0, contentWidth, sliceHeight)
      
      const sliceData = sliceCanvas.toDataURL('image/png')
      // PDF height needs to be calculated based on the actual sliceHeight drawn
      const pdfSliceHeight = sliceHeight / pxPerMm
      
      pdf.addImage(sliceData, 'PNG', 0, marginMm, pdfPageWidth, pdfSliceHeight)
      
      currentY += sliceHeight
      // Add a tiny buffer to avoid potential rounding loops, though logic should be robust
      if (sliceHeight <= 0) break; // Safety break
    }
    
    const now = new Date()
    const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const fileName = `${examData.value.title || 'Exam'}_${timeStr}.pdf`
    pdf.save(fileName)
  } catch (error) {
    console.error('PDF Export Failed:', error)
    alert('导出失败，请重试')
  } finally {
    isExporting.value = false
  }
}

const handleExportJSON = () => {
  const blob = new Blob([JSON.stringify(examData.value, null, 2)], { type: 'application/json' })
  const now = new Date()
  const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const fileName = `${examData.value.title || 'Exam'}_${timeStr}.json`
  saveAs(blob, fileName)
}

const handleSaveTemplate = () => {
  if (!examData.value) return
  templateName.value = `模板 ${savedTemplates.value.length + 1}`
  showSaveModal.value = true
}

const confirmSaveTemplate = async () => {
  if (!templateName.value) {
    alert('请输入模板名称')
    return
  }
  const newTemplate = {
    id: Date.now(),
    name: templateName.value,
    data: JSON.parse(JSON.stringify(examData.value)),
    date: new Date().toLocaleString(),
    type: 'exam'
  }
  savedTemplates.value.unshift(newTemplate)
  await saveTemplatesToStorage()
  showSaveModal.value = false
}

const handleLoadTemplate = () => {
  showLoadModal.value = true
}

const loadTemplate = (template) => {
  if (template.type !== 'exam') {
      alert('无法在试题编辑器中加载教案模板')
      return
  }
  pendingLoadTemplate.value = template
  showLoadConfirmModal.value = true
}

const confirmLoadTemplate = () => {
  if (pendingLoadTemplate.value) {
    examData.value = JSON.parse(JSON.stringify(pendingLoadTemplate.value.data))
    showLoadModal.value = false
    pendingLoadTemplate.value = null
  }
  showLoadConfirmModal.value = false
}

const deleteTemplate = (index) => {
  pendingDeleteTemplateIndex.value = index
  showDeleteConfirmModal.value = true
}

const confirmDeleteTemplate = async () => {
  if (pendingDeleteTemplateIndex.value > -1) {
    savedTemplates.value.splice(pendingDeleteTemplateIndex.value, 1)
    await saveTemplatesToStorage()
    pendingDeleteTemplateIndex.value = -1
  }
  showDeleteConfirmModal.value = false
}

const cancelDeleteTemplate = () => {
  pendingDeleteTemplateIndex.value = -1
  showDeleteConfirmModal.value = false
}

const handleImportJSON = (json) => {
  examData.value = json
}

const handleReset = () => {
  showResetConfirmModal.value = true
}

const confirmReset = async () => {
  try {
    if (currentDocId.value) {
        const key = getStorageKey(currentDocId.value)
        await localforage.removeItem(key)
    }
    
    if (currentDocId.value === 'default_doc') {
        const response = await fetch('/exam_data.json')
        examData.value = await response.json()
    } else {
        examData.value = createEmptyExam(currentDocId.value)
    }
  } catch (e) {
    console.error('Failed to reset', e)
  }
  showResetConfirmModal.value = false
}


const generateExamPaper = async () => {
  if (isGeneratingExam.value) return
  if (examData.value && examData.value.problems && examData.value.problems.length > 0) {
      if (!confirm('当前已有试题，AI 生成将覆盖现有试题。确定要继续吗？')) return
  }

  isGeneratingExam.value = true
  // Extract course title
  let title = "计算机相关课程"
  if (route.query.title) {
      title = route.query.title
  } else if (examData.value && examData.value.title) {
      title = examData.value.title
  }

  const questionCount = settings.examQuestionCount || 5
  const prompt = `请为课程"${title}"生成一份包含 ${questionCount} 道题目的试题数据。
  
  请严格按照以下 JSON 格式返回，不要包含 markdown 标记代码块：
  {
    "title": "${title}",
    "info": ["姓名: _______________", "学号: _______________", "得分: ___________"],
    "footer": "~ End of Practice ~",
    "problems": [
      {
        "qNum": "Q1.",
        "title": "题目名称",
        "tags": "知识点",
        "desc": "详细的题目描述(HTML supported)...",
        "input": "输入样例(仅编程题需要, 非编程题请省略)",
        "output": "输出样例(仅编程题需要, 非编程题请省略)"
      }
      // ... 请生成一共 ${questionCount} 道题目
    ]
  }
  注意：如果是编程类课程，请提供 input/output 样例；如果是理论、文学、数学等非编程类课程，请勿在JSON中包含 input 和 output 字段。`

  const messages = [{ role: 'user', content: prompt }]
  
  let fullText = ''
  await sendToQwenAIDialogue(messages, (text, isComplete) => {
    fullText = text
    if (isComplete) {
      isGeneratingExam.value = false
      try {
        const cleanText = fullText.replace(/```json/g, '').replace(/```/g, '').trim()
        
        // Check for specific error message from worker/API
        if (cleanText.includes('请先配置 API Key') || cleanText.includes('API Key not configured')) {
            showApiKeyAlertModal.value = true
            return
        }

        const newData = JSON.parse(cleanText)
        
        // Ensure image fields exist even if empty
        if (newData.problems) {
            newData.problems.forEach(p => {
                if (!p.image) p.image = ""
            })
        }

        examData.value = newData
      } catch (e) {
        console.error('Failed to parse AI exam', e)
        alert('生成失败，AI 返回格式不正确。')
      }
    }
  })
}

const showAIChat = ref(false)

const handleAIUpdate = (newData) => {
  if (!newData) return
  // Merge or replace
  // We'll replace the fields that exist in newData
  Object.keys(newData).forEach(key => {
    examData.value[key] = newData[key]
  })
}
</script>
<template>
  <div class="app-container">
    <div class="home-link">
      <router-link to="/">🏠 返回首页</router-link>
    </div>

    <Toolbar 
      @export-pdf="handleExportPDF" 
      @export-json="handleExportJSON"
      @save-template="handleSaveTemplate"
      @load-template="handleLoadTemplate"
      @import-json="handleImportJSON"
      @reset-data="handleReset"
      @open-settings="showSettingsModal = true"
    />
    
    <div class="ai-actions">
      <button class="ai-gen-btn" @click="generateExamPaper" :disabled="isGeneratingExam">
        {{ isGeneratingExam ? '✨ AI 生成中...' : `✨ AI 一键生成试题 (${settings.examQuestionCount}题)` }}
      </button>
    </div>

    <!-- AI Chat Assistant -->
    <AIChatAssistant 
      v-model="showAIChat" 
      :currentContent="examData"
      systemContext="您是试题助手。请根据用户的指令调整当前的试卷（JSON对象）。例如：'增加两道关于函数的选择题' 或 '把最后一道题的难度加大'。"
      @update-content="handleAIUpdate" 
    />

    <!-- Floating AI Chat Button -->
    <button class="ai-chat-fab" @click="showAIChat = !showAIChat" title="AI 助手">
      🤖 试题助手
    </button>

    <div class="content-area" v-if="examData">
      <ExamPaper :examData="examData" :class="{ 'exporting': isExporting }" />
    </div>
    <div v-else class="loading">
      Loading Data...
    </div>

    <!-- Modals (Save, Load, Delete, Reset, Export, Settings, Chat) -->
    <!-- Copying existing modal structure directly -->
    
    <!-- Save Template Modal -->
    <div class="modal-overlay" v-if="showSaveModal">
      <div class="modal-content">
        <h3>💾 保存为模板</h3>
        <input v-model="templateName" placeholder="给模板起个名字..." class="modal-input" @keyup.enter="confirmSaveTemplate" />
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showSaveModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmSaveTemplate">保存</button>
        </div>
      </div>
    </div>

    <!-- Load Template Modal -->
    <div class="modal-overlay" v-if="showLoadModal">
      <div class="modal-content load-modal">
        <h3>📂 导入模板 (仅展示试题)</h3>
        <div class="template-list" v-if="savedTemplates.filter(t => t.type === 'exam').length > 0">
          <div v-for="(template, index) in savedTemplates.filter(t => t.type === 'exam')" :key="template.id" class="template-item">
            <div class="template-info" @click="loadTemplate(template)">
              <div class="t-name">
                <span class="tag-exam">试题</span>
                {{ template.name }}
              </div>
              <div class="t-date">{{ template.date }}</div>
            </div>
            <button class="delete-template-btn" @click.stop="deleteTemplate(index)" title="删除模板">×</button>
          </div>
        </div>
        <div v-else class="empty-list">
          暂无保存的模板
        </div>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showLoadModal = false">关闭</button>
        </div>
      </div>
    </div>
    <!-- Delete Template Confirmation Modal -->
    <div class="modal-overlay" v-if="showDeleteConfirmModal" style="z-index: 2100;">
      <div class="modal-content">
        <h3>🗑️ 确认删除模板？</h3>
        <p>确定要删除这个模板吗？此操作无法撤销。</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="cancelDeleteTemplate">取消</button>
          <button class="modal-btn confirm" @click="confirmDeleteTemplate">删除</button>
        </div>
      </div>
    </div>

    <!-- Reset Data Confirmation Modal -->
    <div class="modal-overlay" v-if="showResetConfirmModal" style="z-index: 2100;">
      <div class="modal-content">
        <h3>🧹 确认重置？</h3>
        <p>确定要清空所有修改吗？<br>这将恢复到默认状态。此操作无法撤销！</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showResetConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmReset">重置</button>
        </div>
      </div>
    </div>

    <!-- Load Template Confirmation Modal -->
    <div class="modal-overlay" v-if="showLoadConfirmModal" style="z-index: 2200;">
      <div class="modal-content">
        <h3>📖 确认加载？</h3>
        <p v-if="pendingLoadTemplate">确定要加载模板 "<b>{{ pendingLoadTemplate.name }}</b>" 吗？<br>当前未保存的修改将会丢失。</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showLoadConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmLoadTemplate">加载</button>
        </div>
      </div>
    </div>

    <!-- API Key Alert Modal -->
    <div class="modal-overlay" v-if="showApiKeyAlertModal" style="z-index: 2300;">
      <div class="modal-content">
        <h3>⚠️ 需要配置 API Key</h3>
        <p>AI 功能需要配置阿里云 DashScope API Key 才能使用。</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showApiKeyAlertModal = false">取消</button>
          <button class="modal-btn confirm" @click="showApiKeyAlertModal = false; showSettingsModal = true">去配置</button>
        </div>
      </div>
    </div>

    <!-- Export Loading Overlay -->
    <div class="modal-overlay" v-if="isExporting" style="z-index: 3000; cursor: wait;">
      <div class="modal-content" style="max-width: 300px;">
        <h3>🖨️ 正在导出...</h3>
        <p>正在努力生成高清 PDF，<br>请稍候片刻...</p>
        <div class="loading-spinner">✏️</div>
      </div>
    </div>



    <!-- AI Components -->
    <!-- AI Components -->
    <SettingsModal 
      v-if="showSettingsModal" 
      :currentModelId="currentModelId"
      :show-model-selector="true" 
      @change-model="handleModelChange"
      @close="showSettingsModal = false" 
    />

  </div>
</template>

<style scoped>
.app-container {
  padding: 20px;
}
.home-link {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 100;
}
.home-link a {
  text-decoration: none;
  font-weight: bold;
  color: #2c3e50;
  background: white;
  padding: 10px 15px;
  border-radius: 20px;
  border: 2px solid #2c3e50;
  box-shadow: 2px 2px 0 #2c3e50;
  transition: transform 0.1s;
}
.home-link a:hover {
  transform: scale(1.05);
}

.ai-actions {
  text-align: center;
  margin-bottom: 20px;
}

.ai-gen-btn {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 10px 25px;
  font-size: 1.1em;
  border-radius: 25px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  font-weight: bold;
}

.ai-gen-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0,0,0,0.2);
}

.ai-gen-btn:disabled {
  background: #ccc;
  cursor: wait;
}


.ai-actions {
  text-align: center;
  margin-bottom: 20px;
}

.ai-gen-btn {
  background: linear-gradient(135deg, #fb8c00 0%, #ffa726 100%);
  color: white;
  border: none;
  padding: 10px 25px;
  font-size: 1.1em;
  border-radius: 25px;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  font-weight: bold;
}

.ai-gen-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 8px rgba(0,0,0,0.2);
}

.ai-gen-btn:disabled {
  background: #ccc;
  cursor: wait;
}

.tag-plan {
  background: #e1f5fe;
  color: #039be5;
  font-size: 0.8em;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 5px;
}

.tag-exam {
  background: #fff3e0;
  color: #fb8c00;
  font-size: 0.8em;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 5px;
}

.loading {
  text-align: center;
  font-size: 1.5em;
  margin-top: 100px;
  color: #666;
}

/* Modal Styles Global */
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
  z-index: 2000;
  backdrop-filter: blur(3px);
}

.modal-content {
  background: #fdfbf7; /* paper-bg */
  padding: 30px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px solid #2c3e50; /* text-color */
  box-shadow: 10px 10px 0 rgba(0,0,0,0.2);
  width: 90%;
  max-width: 400px;
  text-align: center;
  font-family: 'Architects Daughter', cursive; /* handwriting-font */
}

.modal-content h3 {
  font-size: 1.5em;
  margin-bottom: 20px;
  border-bottom: 1px dashed #ccc;
  padding-bottom: 10px;
}

.modal-input {
  width: 80%;
  padding: 10px;
  margin-bottom: 20px;
  font-size: 1.2em;
  font-family: inherit;
  border: 2px solid #2c3e50;
  border-radius: 5px;
  outline: none;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-top: 20px;
}

.modal-btn {
  padding: 8px 20px;
  border: 2px solid #2c3e50;
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
  background: #e74c3c;
  color: white;
  border-color: #e74c3c;
}

.modal-btn.cancel {
  border-style: dashed;
}

/* Template List */
.load-modal {
  max-width: 500px;
}

.template-list {
  max-height: 300px;
  overflow-y: auto;
  text-align: left;
}

.template-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  transition: background 0.2s;
}

.template-item:hover {
  background: rgba(0,0,0,0.05);
}

.template-info {
  flex: 1;
}

.t-name {
  font-weight: bold;
  font-size: 1.1em;
}

.ai-chat-fab {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 30px;
  padding: 12px 24px;
  font-size: 1.1em;
  font-weight: bold;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  cursor: pointer;
  z-index: 900;
  transition: transform 0.2s;
  font-family: 'Architects Daughter', cursive;
  border: 2px solid white;
}

.ai-chat-fab:hover {
  transform: scale(1.05);
  background: #34495e;
}

.t-date {
  font-size: 0.8em;
  color: #888;
}

.delete-template-btn {
  background: transparent;
  border: none;
  color: #ccc;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0 10px;
}

.delete-template-btn:hover {
  color: #c0392b;
}

.empty-list {
  color: #999;
  padding: 20px;
}

.loading-spinner {
  font-size: 3em;
  animation: writing 1s infinite alternate;
  margin-top: 20px;
}

@keyframes writing {
  from { transform: translateX(-20px) rotate(-10deg); }
  to { transform: translateX(20px) rotate(10deg); }
}


</style>
