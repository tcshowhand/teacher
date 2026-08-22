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
import { exportExamToWord } from '../utils/exportExamWord'

import { sendToQwenAIDialogue, generateImage } from '../api/qwenAPI'

import { useSettingsStore } from '../store/settings'
import { DEFAULT_MODEL_ID } from '../config/models'

const settings = useSettingsStore()

const currentDocId = ref('')
const examData = ref(null)
const isGeneratingExam = ref(false)
const isGeneratingImages = ref(false)
const imageGenProgress = ref('')
const imageGenStats = ref({ done: 0, total: 0 })


const TEMPLATES_KEY = 'exam_paper_templates_v1'
const LAST_ACTIVE_KEY = 'last_active_doc_v1'

const savedTemplates = ref([])
const showSaveModal = ref(false)
const showLoadModal = ref(false)
const showDeleteConfirmModal = ref(false)
const showResetConfirmModal = ref(false)

const showAIGenConfirmModal = ref(false)

const pendingDeleteTemplateIndex = ref(-1)
const pendingLoadTemplate = ref(null)
const templateName = ref('')
const isExporting = ref(false)
const showApiKeyAlertModal = ref(false)


const route = useRoute()

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
    let title = route.query.title || currentDocId.value
    let subTitle = ''
    
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

  try {
    const cachedTemplates = await localforage.getItem(TEMPLATES_KEY)
    if (cachedTemplates) {
      savedTemplates.value = typeof cachedTemplates === 'string' ? JSON.parse(cachedTemplates) : cachedTemplates
    }
  } catch (e) {
    console.error('Failed to load templates', e)
  }

  const { courseName, chapterId } = route.query
  
  if (courseName && chapterId) {
    currentDocId.value = `${courseName}_ch${chapterId}`
  } else if (route.query.title) {
    currentDocId.value = route.query.title
  } else {
    currentDocId.value = localStorage.getItem(LAST_ACTIVE_KEY) || 'default_doc'
  }
  
  localStorage.setItem(LAST_ACTIVE_KEY, currentDocId.value)

  await loadCurrentData()
})

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
    const pageHeightInPx = (pdfPageHeight * pxPerMm) - (marginPx * 2)
    
    const questionElements = element.querySelectorAll('.question-item')
    
    const questions = Array.from(questionElements).map(el => {
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
      
      let sliceHeight = Math.min(pageHeightInPx, contentHeight - currentY)
      let nextCutY = currentY + sliceHeight

      const crossingQuestion = questions.find(q => q.top < nextCutY && q.bottom > nextCutY)

      if (crossingQuestion) {
        if (crossingQuestion.top > currentY) {
            nextCutY = crossingQuestion.top
            sliceHeight = nextCutY - currentY
        }
      }

      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = contentWidth
      sliceCanvas.height = sliceHeight
      
      const sCtx = sliceCanvas.getContext('2d')
      
      sCtx.drawImage(canvas, 0, currentY, contentWidth, sliceHeight, 0, 0, contentWidth, sliceHeight)
      
      const sliceData = sliceCanvas.toDataURL('image/png')

      const pdfSliceHeight = sliceHeight / pxPerMm
      
      pdf.addImage(sliceData, 'PNG', 0, marginMm, pdfPageWidth, pdfSliceHeight)
      
      currentY += sliceHeight

      if (sliceHeight <= 0) break;
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

const handleExportWord = async () => {
  if (!examData.value) return
  isExporting.value = true
  try {
    await exportExamToWord(examData.value)
  } catch (error) {
    console.error('Word Export Failed:', error)
    alert('导出 Word 失败')
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
    
    examData.value = createEmptyExamData(currentDocId.value || '示范课程 - 示范章节')
  } catch (e) {
    console.error('Failed to reset', e)
  }
  showResetConfirmModal.value = false
}

const generateExamPaper = async () => {
  if (isGeneratingExam.value) return
  if (examData.value && examData.value.problems && examData.value.problems.length > 0) {
    showAIGenConfirmModal.value = true
    return
  }
  
  await confirmGenerateExamPaper()
}

const confirmGenerateExamPaper = async () => {
  showAIGenConfirmModal.value = false
  isGeneratingExam.value = true
  let title = "计算机相关课程"
  if (route.query.title) {
      title = route.query.title
  } else if (examData.value && examData.value.title) {
      title = examData.value.title
  }

  const questionCount = settings.examQuestionCount || 5
  const prompt = `请为课程"${title}"生成一份包含 ${questionCount} 道题目的试题数据。
  
  请严格按照以下 JSON 格式返回，不要包含代码块：
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

        if (cleanText.includes('请先配置 API Key') || cleanText.includes('API Key not configured')) {
            showApiKeyAlertModal.value = true
            return
        }

        const newData = JSON.parse(cleanText)

        if (newData.problems) {
            newData.problems.forEach(p => {
                if (!p.image) p.image = ""
            })
        }

        examData.value = newData

        // 文字生成成功后，若启用图片生成开关，则为每道题生成配图
        if (settings.enableImageGen && newData.problems && newData.problems.length > 0) {
            // 必须通过 examData.value.problems 操作，才能触发响应式更新
            generateImagesForProblems()
        }
      } catch (e) {
        console.error('Failed to parse AI exam', e)
        alert('生成失败，AI 返回格式不正确。')
      }
    }
  })
}

/**
 * 为试题生成配图（顺序生成，避免并发触发风控和超额费用）
 * 通过 examData.value.problems 操作以保证响应式
 */
const generateImagesForProblems = async () => {
    const problems = examData.value.problems
    if (!problems || problems.length === 0) return

    isGeneratingImages.value = true
    imageGenStats.value = { done: 0, total: problems.length }
    imageGenProgress.value = `准备生成配图...`

    for (let i = 0; i < problems.length; i++) {
        // 通过 reactive proxy 取题，确保后续赋值触发更新
        const p = examData.value.problems[i]
        const desc = (p.title || '') + ' ' + (p.desc || '')
        const prompt = `为以下试题生成一张手账风格的题目讲解图，题目为：${desc}`.slice(0, 200)
        imageGenProgress.value = `正在生成第 ${i + 1}/${problems.length} 题配图...`
        try {
            const imageUrl = await generateImage(prompt, (msg) => {
                imageGenProgress.value = `第 ${i + 1}/${problems.length} 题：${msg}`
            })
            // 关键：通过 reactive proxy 赋值，触发视图更新
            examData.value.problems[i].image = imageUrl
            imageGenStats.value.done = i + 1
        } catch (err) {
            console.error(`第 ${i + 1} 题配图生成失败:`, err)
            imageGenProgress.value = `第 ${i + 1} 题配图失败: ${err.message}`
            // 失败不阻塞，继续下一题
            await new Promise(r => setTimeout(r, 1000))
        }
    }

    isGeneratingImages.value = false
    imageGenProgress.value = `配图生成完成 (${imageGenStats.value.done}/${problems.length})`
}

const showAIChat = ref(false)

const handleAIUpdate = (newData) => {
  if (!newData) return
  Object.keys(newData).forEach(key => {
    examData.value[key] = newData[key]
  })
}
</script>
<template>
  <div class="app-container">
    <div class="home-link">
      <router-link to="/">返回首页</router-link>
    </div>

    <Toolbar 
      :is-exam="true"
      @export-pdf="handleExportPDF" 
      @export-word="handleExportWord"
      @export-json="handleExportJSON"
      @save-template="handleSaveTemplate"
      @load-template="handleLoadTemplate"
      @import-json="handleImportJSON"
      @reset-data="handleReset"
      @open-settings="showSettingsModal = true"
    />
    
    <div class="ai-actions">
      <button class="ai-gen-btn" @click="generateExamPaper" :disabled="isGeneratingExam || isGeneratingImages">
        {{ isGeneratingExam ? 'AI 生成中...' : (isGeneratingImages ? '配图生成中...' : `AI 一键生成试题 (${settings.examQuestionCount}题)`) }}
      </button>
      <div class="image-status" v-if="isGeneratingImages || imageGenProgress">
        <span class="status-icon">🖼️</span>
        <span>{{ imageGenProgress }}</span>
        <span class="status-count" v-if="imageGenStats.total > 0">{{ imageGenStats.done }}/{{ imageGenStats.total }}</span>
      </div>
      <p class="image-flag-tip" v-if="settings.enableImageGen">
        ⚠️ 已开启图片生成，本次将为每题生成配图（费用较高）
      </p>
    </div>

    <AIChatAssistant 
      v-model="showAIChat" 
      :currentContent="examData"
      systemContext="您是试题助手。请根据用户的指令调整当前的试卷（JSON对象）。例如：'增加两道关于函数的选择题' 或 '把最后一道题的难度加大'。"
      @update-content="handleAIUpdate" 
    />

    <button class="ai-chat-fab" @click="showAIChat = !showAIChat" title="AI 助手">
      试题助手
    </button>

    <div class="content-area" v-if="examData">
      <ExamPaper :examData="examData" :class="{ 'exporting': isExporting }" />
    </div>
    <div v-else class="loading">
      Loading Data...
    </div>
    
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

    <div class="modal-overlay" v-if="showLoadConfirmModal" style="z-index: 2200;">
      <div class="modal-content">
        <h3>确认加载？</h3>
        <p v-if="pendingLoadTemplate">确定要加载模板 "<b>{{ pendingLoadTemplate.name }}</b>" 吗？<br>当前未保存的修改将会丢失。</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showLoadConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmLoadTemplate">加载</button>
        </div>
      </div>
    </div>

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

    <div class="modal-overlay" v-if="showAIGenConfirmModal" style="z-index: 2200;">
      <div class="modal-content">
        <h3>AI 一键生成</h3>
        <p>AI 将根据当前的课程信息自动生成试题。<br><b>注意：此操作可能会覆盖您已手动输入的内容。</b></p>
        <p v-if="settings.enableImageGen" class="confirm-image-tip">
          ⚠️ 已开启图片生成：试题生成完成后，将为每道题自动生成配图（费用较高，预计 {{ examData?.problems?.length || settings.examQuestionCount }} 张）。
        </p>
        <p v-else class="confirm-image-tip-muted">
          图片生成未开启（可在「设置」中开启，费用较高）。
        </p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showAIGenConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmGenerateExamPaper">✨ 开始生成</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="isExporting" style="z-index: 3000; cursor: wait;">
      <div class="modal-content" style="max-width: 300px;">
        <h3>🖨️ 正在导出...</h3>
        <p>正在努力生成高清 PDF，<br>请稍候片刻...</p>
        <div class="loading-spinner">✏️</div>
      </div>
    </div>

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




.ai-actions {
  text-align: center;
  margin-bottom: 20px;
}

.ai-gen-btn {
    background: white;
    color: #2c3e50;
    border: 3px solid #2c3e50;
    padding: 12px 30px;
    font-size: 1.2em;
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    cursor: pointer;
    box-shadow: 4px 4px 0 #2c3e50;
    font-weight: bold;
    font-family: inherit;
    transition: all 0.2s;
}

.ai-gen-btn:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 #2c3e50;
  background: #f3e5f5;
}

.ai-gen-btn:disabled {
    background: #eee;
    color: #999;
    border-color: #999;
    box-shadow: none;
    cursor: wait;
}

.image-status {
    margin-top: 12px;
    padding: 8px 14px;
    background: #fff8e1;
    border: 2px dashed #fb8c00;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.95em;
    color: #6b4500;
}

.image-status .status-icon {
    animation: writing 1s infinite alternate;
}

.image-status .status-count {
    background: #fb8c00;
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 0.85em;
}

.image-flag-tip {
    margin-top: 8px;
    color: #c0392b;
    font-weight: bold;
    font-size: 0.9em;
}

.confirm-image-tip {
    color: #c0392b;
    font-weight: bold;
    background: #fdecea;
    padding: 10px;
    border-radius: 8px;
    margin-top: 10px;
}

.confirm-image-tip-muted {
    color: #888;
    font-size: 0.9em;
    margin-top: 10px;
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
  background: #fdfbf7;
  padding: 30px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px solid #2c3e50;
  box-shadow: 10px 10px 0 rgba(0,0,0,0.2);
  width: 90%;
  max-width: 400px;
  text-align: center;
  font-family: 'Architects Daughter', cursive;
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
  color: #fff;
  border-radius: 30px;
  padding: 12px 24px;
  font-size: 1.1em;
  font-weight: 700;
  box-shadow: 0 4px 10px #0000004d;
  cursor: pointer;
  z-index: 900;
  transition: transform .2s;
  font-family: var(--handwriting-font);
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
