<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import LessonPlanDetail from '../components/LessonPlanDetail.vue'
import AIChatAssistant from '../components/AIChatAssistant.vue'
import Toolbar from '../components/Toolbar.vue'
import SettingsModal from '../components/SettingsModal.vue'

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { saveAs } from 'file-saver'
import localforage from 'localforage'
import { useRoute } from 'vue-router'
import { sendToQwenAIDialogue } from '../api/qwenAPI'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { LESSON_PLAN_MODELS, DEFAULT_MODEL_ID } from '../config/models'

const currentDocId = ref('')
const examData = ref(null)
const isGeneratingPlan = ref(false)

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
const isExporting = ref(false)
const currentModelId = ref(localStorage.getItem('last_active_model_id') || DEFAULT_MODEL_ID)
// Remove showModelConfirmModal as we now switch workspaces seamlessly

const route = useRoute()

// Helper to create empty lesson plan structure
const createEmptyLessonPlan = (title, mainTitle = '', subTitle = '', summary = '') => {
  // If mainTitle/subTitle provided, use them. Otherwise fallback to parsing title.
  let course, chapter
  
  if (mainTitle && subTitle) {
    course = mainTitle
    chapter = subTitle
  } else {
    // Old fallback
    const parts = title.split(' - ')
    course = parts[0]
    chapter = parts[1]
  }

  return {
    "授课课题": course || '课题名称',
    "子章节": chapter || '章节名称',
    "编号": "第 1 号",
    "课时安排": "2 课时",
    "授课形式": "理论课",
    "摘要": summary || '', // New field
    "知识与技能": "",
    "过程与方法": "",
    "情感、态度、价值观": "",
    "教学重点": "",
    "教学难点": "",
    "教学方法": "",
    "媒介": "",
    "教学过程": [],
    "学习资料": "",
    "课后小结": ""
  }
}

const loadModelData = async (modelId) => {
  const model = LESSON_PLAN_MODELS.find(m => m.id === modelId)
  if (!model) return null

  try {
      const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'
      const response = await fetch(`${baseUrl}${model.jsonTemplate}`)
      if (!response.ok) throw new Error(`Failed to load template: ${model.jsonTemplate}`)
      return await response.json()
  } catch (e) {
      console.error('Failed to load model data', e)
      alert('加载模型数据失败: ' + e.message)
      return null
  }
}

const handleModelChange = async (newModelId) => {
    // 1. Save current model ID for persistence
    currentModelId.value = newModelId
    localStorage.setItem('last_active_model_id', newModelId)

    // 2. Reload data for the new model workspace
    await loadCurrentData()
}

// Re-usable function to load data based on current context
const loadCurrentData = async () => {
    // Determine Document ID
    // Note: Use the same logic as onMounted but applied to current state
    // We already have currentDocId set, so we can re-use it? 
    // Yes, switching model shouldn't change the doc ID (e.g. still "default_doc" or "courseA_ch1")
    // but the CONTENT (storage key) changes.
    
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
        // If no cache for this model, load the default template for this model
        const initialData = await loadModelData(currentModelId.value)

        if (initialData) {
            examData.value = initialData
        } else {
            // Fallback
             examData.value = createEmptyLessonPlan(currentDocId.value)
        }
    }

    // ALWAYS override metadata if we have course info (Sync from Generator)
    const { courseName, chapterId, lessonNumber } = route.query
    if (courseName && chapterId && examData.value) {
         try {
            const rawState = localStorage.getItem(GENERATOR_STORAGE_KEY)
            if (rawState) {
                const state = JSON.parse(rawState)
                if (state.courseName === courseName || state.courseName === route.query.courseName) { // Loose match in case of encoding
                    const foundChapter = state.generatedChapters.find(c => c.id === Number(chapterId))
                    if (foundChapter) {
                        examData.value['授课课题'] = foundChapter.mainTitle
                        examData.value['子章节'] = foundChapter.subTitle || ''
                        // Only sync summary/mode if they are really set, otherwise keep existing specific edits might be better?
                        // User request: "修改信息，他不会同步" -> Implies they want overwrite.
                        if (foundChapter.summary) examData.value['摘要'] = foundChapter.summary
                        if (foundChapter.teachingMode) examData.value['授课形式'] = foundChapter.teachingMode
                    }
                }
            }
        } catch(e) {
            console.error('Failed to sync from generator storage', e)
        }
    }

    // Also handle direct query overrides (for standalone links)
    let { mainTitle, subTitle, summary, teachingMode } = route.query
    if (mainTitle) examData.value['授课课题'] = mainTitle
    if (subTitle) examData.value['子章节'] = subTitle
    if (summary) examData.value['摘要'] = summary
    if (teachingMode) examData.value['授课形式'] = teachingMode
    if (lessonNumber) examData.value['编号'] = `第 ${lessonNumber} 号`
}
// Removed confirmSwitchModel and switchModel as they are replaced by simple handleModelChange

// Helper to sync to generator... (unchanged)

const getStorageKey = (docId) => {
  // New storage key format included modelId for isolation
  return `exam_data_v1_plan_${currentModelId.value}_${docId}`
}

const GENERATOR_STORAGE_KEY = 'lesson_plan_generator_state_v3'

// Function to sync changes back to Generator state
const syncToGenerator = (courseTitle, chapterTitle, subTitle, teachingMode, summary, chapterId) => {
  if (!chapterId) return // Cannot sync without ID
  try {
    const rawState = localStorage.getItem(GENERATOR_STORAGE_KEY)
    if (rawState) {
      const state = JSON.parse(rawState)
      
      // Ensure we are syncing to the correct course
      if (state.courseName === courseTitle) {
        const chapter = state.generatedChapters.find(c => c.id === Number(chapterId))
        if (chapter) {
          chapter.mainTitle = chapterTitle
          chapter.subTitle = subTitle
          chapter.teachingMode = teachingMode
          chapter.summary = summary // Sync summary
          localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(state))
        }
      }
    }
  } catch (e) {
    console.error('Sync to generator failed', e)
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
  // Use stable ID if available: courseName_chapterId
  const { courseName, chapterId, title, mainTitle, subTitle, summary, teachingMode } = route.query
  
  if (courseName && chapterId) {
    currentDocId.value = `${courseName}_ch${chapterId}`
  } else if (title) {
    // Fallback for old links or standalone usage
    currentDocId.value = title
  } else {
    currentDocId.value = localStorage.getItem(LAST_ACTIVE_KEY) || 'default_doc'
  }
  
  // Save as last active
  localStorage.setItem(LAST_ACTIVE_KEY, currentDocId.value)
  
  const storageKey = getStorageKey(currentDocId.value)

  // 3. Load Current Lesson Plan Data
  // logic refactored to loadCurrentData
  await loadCurrentData()

  // 4. Initialize if new (Handled inside loadCurrentData)

// Removed old init logic block as it is now inside loadCurrentData

})

// Auto-save to local storage (IndexedDB) AND Sync to Generator
watch(examData, async (newVal) => {
  if (newVal && currentDocId.value) {
    try {
      const storageKey = getStorageKey(currentDocId.value)
      await localforage.setItem(storageKey, JSON.parse(JSON.stringify(newVal))) 
      
      // Two-way sync: Editor -> Home
      const { courseName, chapterId } = route.query
      if (courseName && chapterId) {
        syncToGenerator(
          courseName, 
          newVal['授课课题'], 
          newVal['子章节'],
          newVal['授课形式'],
          newVal['摘要'],
          chapterId
        )
      }
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



const handleExportWord = async () => {
  if (!examData.value) return
  isExporting.value = true

  try {
    // Load the template
    // Use BASE_URL to support sub-directory deployment
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'
    
    // Find current model template
    const model = LESSON_PLAN_MODELS.find(m => m.id === currentModelId.value) || LESSON_PLAN_MODELS[0]
    const templateFile = model.docxTemplate || '10.docx'
    
    const response = await fetch(`${baseUrl}${templateFile}`);
    if (!response.ok) throw new Error(`Could not find template file ${baseUrl}${templateFile}`);
    const content = await response.arrayBuffer();

    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
            start: '[',
            end: ']'
        }
    });

    // Prepare data
    const data = JSON.parse(JSON.stringify(examData.value));
    
    // Transform "教学过程" from array of arrays to array of objects for templating
    // Input: [["Step 1", "Content 1"], ["Step 2", "Content 2"]]
    // Output: [{name: "Step 1", content: "Content 1"}, ...]
    // Template usage: [#教学过程] [环节名称] [环节内容] [/教学过程]
    if (data["教学过程"] && Array.isArray(data["教学过程"])) {
        data["教学过程"] = data["教学过程"].map(item => {
            if (Array.isArray(item) && item.length >= 2) {
                return { "环节名称": item[0], "环节内容": item[1] };
            }
            return { "环节名称": "", "环节内容": "" };
        });
    }

    doc.render(data);

    const out = doc.getZip().generate({
        type: "blob",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const now = new Date();
    const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const titleVal = data['子章节'];
    saveAs(out, `${titleVal || 'LessonPlan'}_${timeStr}.docx`);

  } catch (error) {
    console.error('Word Export Failed:', error);
    let msg = error.message;
    if (error.properties && error.properties.errors) {
        msg = error.properties.errors.map(e => e.message).join('\n');
    }
    alert('导出 Word 失败:\n' + msg);
  } finally {
    isExporting.value = false;
  }
}

const handleExportJSON = () => {
  const blob = new Blob([JSON.stringify(examData.value, null, 2)], { type: 'application/json' })
  const now = new Date()
  const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const titleVal = examData.value['子章节']
  const fileName = `${titleVal || 'LessonPlan'}_${timeStr}.json`
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
    type: 'lesson_plan'
  }
  savedTemplates.value.unshift(newTemplate)
  await saveTemplatesToStorage()
  showSaveModal.value = false
}

const handleLoadTemplate = () => {
  showLoadModal.value = true
}

const loadTemplate = (template) => {
  if (template.type !== 'lesson_plan') {
      alert('无法在教案编辑器中加载试题模板')
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
  if (!json['授课课题']) {
      alert('导入的文件似乎不是教案格式')
      return
  }
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
    
    examData.value = createEmptyLessonPlan(currentDocId.value || '示范课程 - 示范章节')
  } catch (e) {
    console.error('Failed to reset', e)
  }
  showResetConfirmModal.value = false
}

const showAIGenConfirmModal = ref(false)
const showApiKeyAlertModal = ref(false) // New Alert Modal


const generateLessonPlan = () => {
  if (isGeneratingPlan.value) return
  showAIGenConfirmModal.value = true
}

const confirmGenerateLessonPlan = async () => {
  showAIGenConfirmModal.value = false
  isGeneratingPlan.value = true
  const course = examData.value['授课课题']
  const chapter = examData.value['子章节']
  const summary = examData.value['摘要'] || ''
  const hours = examData.value['课时安排'] || '2 课时'
  const mode = examData.value['授课形式'] || '理论课'
  
  const prompt = `请为一个课程生成详细的教案 JSON 数据。
  课程名称：${course}
  章节名称：${chapter}
  课时安排：${hours}
  授课形式：${mode}
  备课摘要/设计意图：${summary}
  
  请严格按照以下 JSON 格式返回，不要包含 markdown 标记代码块：
  {
    "授课课题": "${course}",
    "子章节": "${chapter}",
    "编号": "第 1 号",
    "课时安排": "${hours}",
    "授课形式": "${mode}",
    "摘要": "${summary}", 
    "知识与技能": "...",
    "过程与方法": "...",
    "情感、态度、价值观": "...",
    "教学重点": "...",
    "教学难点": "...",
    "教学方法": "...",
    "媒介": "...",
    "教学过程": [
       // 请根据实际教学需要生成完整的步骤，通常需要 4-6 个环节。
       // 数组长度不限，请尽可能详细。
       // 注意：不要包含“课堂小结”、“布置作业”等总结性环节，这些内容请放在“课后小结”中。
       ["环节名称", "环节详细内容描述..."],
       ["环节名称", "环节详细内容描述..."],
       // ... 更多环节
    ],
    "学习资料": "无",
    "课后小结": "..."
  }`

  const messages = [{ role: 'user', content: prompt }]
  
  let fullText = ''
  await sendToQwenAIDialogue(messages, (text, isComplete) => {
    fullText = text
    if (isComplete) {
      isGeneratingPlan.value = false
      try {
        const cleanText = fullText.replace(/```json/g, '').replace(/```/g, '').trim()

        // Check for specific error message from worker/API
        if (cleanText.includes('请先配置 API Key') || cleanText.includes('API Key not configured')) {
            showApiKeyAlertModal.value = true
            return
        }

        const newData = JSON.parse(cleanText)
        // Update fields safely
        Object.keys(newData).forEach(key => {
          examData.value[key] = newData[key]
        })
      } catch (e) {
        console.error('Failed to parse AI plan', e)
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
      :is-lesson-plan="true"
      @export-word="handleExportWord" 
      @export-json="handleExportJSON"
      @save-template="handleSaveTemplate"
      @load-template="handleLoadTemplate"
      @import-json="handleImportJSON"
      @reset-data="handleReset"
      @open-settings="showSettingsModal = true"
    />
    
    <div class="content-area" v-if="examData">
      <LessonPlanDetail 
        :data="examData" 
        :is-generating="isGeneratingPlan"
        id="lesson-paper-container" 
        @generate-ai="generateLessonPlan"
      />
    </div>
    <div v-else class="loading">
      Loading Data...
    </div>

    <!-- Modals (Save, Load, Delete, Reset, Export, Settings, Chat) -->
    
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
        <h3>📂 导入模板 (仅展示教案)</h3>
        <div class="template-list" v-if="savedTemplates.filter(t => t.type === 'lesson_plan').length > 0">
          <div v-for="(template, index) in savedTemplates.filter(t => t.type === 'lesson_plan')" :key="template.id" class="template-item">
            <div class="template-info" @click="loadTemplate(template)">
              <div class="t-name">
                <span class="tag-plan">教案</span>
                {{ template.name }}
              </div>
              <div class="t-date">{{ template.date }}</div>
            </div>
            <!-- Note: Deleting templates from here deletes them globally. Might be confusing if filtered. 
                 It's better to find the real index or just allow deleting. 
                 For now, let's look up the index in the original array. -->
            <button class="delete-template-btn" @click.stop="deleteTemplate(savedTemplates.indexOf(template))" title="删除模板">×</button>
          </div>
        </div>
        <div v-else class="empty-list">
          暂无保存的教案模板
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


    
    <!-- AI Generation Confirmation Modal -->
    <div class="modal-overlay" v-if="showAIGenConfirmModal" style="z-index: 2200;">
      <div class="modal-content">
        <h3>AI 一键生成</h3>
        <p>AI 将根据当前的课题、章节和摘要自动生成完整教案。<br><b>注意：此操作可能会覆盖您已手动输入的内容。</b></p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showAIGenConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmGenerateLessonPlan">✨ 开始生成</button>
        </div>
      </div>
    </div>

    <!-- AI Chat Assistant -->
    <AIChatAssistant 
      v-model="showAIChat" 
      :currentContent="examData" 
      systemContext="您是教案编写助手。请根据用户的指令**修改**当前教案的内容（JSON对象）。请保持教案的整体结构，只修改字段的值。"
      @update-content="handleAIUpdate" 
    />

    <!-- Floating AI Chat Button -->
    <button class="ai-chat-fab" @click="showAIChat = !showAIChat" title="AI 助手">
      🤖 对话助手
    </button>


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

.model-selector {
  display: inline-flex;
  align-items: center;
  margin-left: 20px;
  background: white;
  padding: 5px 15px;
  border-radius: 20px;
  border: 2px solid #2c3e50;
  box-shadow: 2px 2px 0 #2c3e50;
}

.model-selector label {
  font-weight: bold;
  margin-right: 10px;
  color: #2c3e50;
}

.model-select {
  border: none;
  background: transparent;
  font-size: 1em;
  font-family: inherit;
  font-weight: bold;
  color: #2c3e50;
  cursor: pointer;
  outline: none;
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

.tag-plan {
  background: #e1f5fe;
  color: #039be5;
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
