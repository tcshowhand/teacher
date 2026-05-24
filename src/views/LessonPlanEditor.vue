<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import LessonPlanDetail from '../components/LessonPlanDetail.vue'
import AIChatAssistant from '../components/AIChatAssistant.vue'
import Toolbar from '../components/Toolbar.vue'
import SettingsModal from '../components/SettingsModal.vue'

import { useSettingsStore } from '../store/settings'

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

const settings = useSettingsStore()

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

const route = useRoute()

const createEmptyLessonPlan = (title, mainTitle = '', subTitle = '', summary = '') => {
  let course, chapter

  if (mainTitle && subTitle) {
    course = mainTitle
    chapter = subTitle
  } else {
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
    "摘要": summary || '',
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
    const initialData = await loadModelData(currentModelId.value)

    if (initialData) {
      examData.value = initialData
    } else {
      examData.value = createEmptyLessonPlan(currentDocId.value)
    }
  }

  const { courseName, chapterId, lessonNumber } = route.query
  if (courseName && chapterId && examData.value) {
    try {
      const rawState = localStorage.getItem(GENERATOR_STORAGE_KEY)
      if (rawState) {
        const state = JSON.parse(rawState)
        if (state.courseName === courseName || state.courseName === route.query.courseName) {
          const foundChapter = state.generatedChapters.find(c => c.id === Number(chapterId))
          if (foundChapter) {
            examData.value['授课课题'] = foundChapter.mainTitle
            examData.value['子章节'] = foundChapter.subTitle || ''
            if (foundChapter.summary) examData.value['摘要'] = foundChapter.summary
            if (foundChapter.teachingMode) examData.value['授课形式'] = foundChapter.teachingMode
          }
        }
      }
    } catch (e) {
      console.error('Failed to sync from generator storage', e)
    }
  }

  let { mainTitle, subTitle, summary, teachingMode } = route.query
  if (mainTitle) examData.value['授课课题'] = mainTitle
  if (subTitle) examData.value['子章节'] = subTitle
  if (summary) examData.value['摘要'] = summary
  if (teachingMode) examData.value['授课形式'] = teachingMode
  if (lessonNumber) examData.value['编号'] = `第 ${lessonNumber} 号`
}

const getStorageKey = (docId) => {
  return `exam_data_v1_plan_${currentModelId.value}_${docId}`
}

const GENERATOR_STORAGE_KEY = 'lesson_plan_generator_state_v3'

const syncToGenerator = (courseTitle, chapterTitle, subTitle, teachingMode, summary, chapterId) => {
  if (!chapterId) return
  try {
    const rawState = localStorage.getItem(GENERATOR_STORAGE_KEY)
    if (rawState) {
      const state = JSON.parse(rawState)

      if (state.courseName === courseTitle) {
        const chapter = state.generatedChapters.find(c => c.id === Number(chapterId))
        if (chapter) {
          chapter.mainTitle = chapterTitle
          chapter.subTitle = subTitle
          chapter.teachingMode = teachingMode
          chapter.summary = summary
          localStorage.setItem(GENERATOR_STORAGE_KEY, JSON.stringify(state))
        }
      }
    }
  } catch (e) {
    console.error('Sync to generator failed', e)
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

  const { courseName, chapterId, title, mainTitle, subTitle, summary, teachingMode } = route.query

  if (courseName && chapterId) {
    currentDocId.value = `${courseName}_ch${chapterId}`
  } else if (title) {
    currentDocId.value = title
  } else {
    currentDocId.value = localStorage.getItem(LAST_ACTIVE_KEY) || 'default_doc'
  }

  localStorage.setItem(LAST_ACTIVE_KEY, currentDocId.value)

  const storageKey = getStorageKey(currentDocId.value)

  await loadCurrentData()

})

watch(examData, async (newVal) => {
  if (newVal && currentDocId.value) {
    try {
      const storageKey = getStorageKey(currentDocId.value)
      await localforage.setItem(storageKey, JSON.parse(JSON.stringify(newVal)))

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
    const baseUrl = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/'

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

    const data = JSON.parse(JSON.stringify(examData.value));

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
const showApiKeyAlertModal = ref(false)


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
  const educationLevel = settings.educationLevel || '未指定'

  const prompt = `请为一个课程生成详细的教案 JSON 数据。
  课程名称：${course}
  章节名称：${chapter}
  课时安排：${hours}
  授课形式：${mode}
  适用学段：${educationLevel}
  备课摘要/设计意图：${summary}

  请注意：该教案需符合《教案检查》的要求，重点关注以下方面：
  1. 教学目标应明确、具体、恰当，并涵盖知识、技能、情感态度价值观三个维度。
  2. 教学内容要深入挖掘思政教育元素，与大纲要求一致，突出重点、难点，合理分解与衔接。
  3. 教学过程要突出互动与探究，体现学生主动参与与思考。 
  4. 教学设计需体现思政融入、新知识引入得当、教学进度科学、环节安排合理，体现最新教学理念。
  6. 教学方法应以学生为中心，体现互动性与探究性，采用新颖的教学手段。
  7. 编写规范需严格按照学校统一格式，书写认真细致，无错漏。
  8. 教案要有创新性，体现互动与探究，有利于培养学生实践能力和创新精神。

  
  请严格按照以下 JSON 格式返回，不要包含代码块标记：
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

        if (cleanText.includes('请先配置 API Key') || cleanText.includes('API Key not configured')) {
          showApiKeyAlertModal.value = true
          return
        }

        const newData = JSON.parse(cleanText)

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

  Object.keys(newData).forEach(key => {
    examData.value[key] = newData[key]
  })
}


const showTemplateDrawer = ref(false)

const TEMPLATE_PREVIEWS = [
  {
    id: 'anyou',
    displayName: '🏫 学期结束版',
    desc: '适合学期末汇报检查，包含完整课程总结与反思栏，格式严谨，是教研检查的首选格式。',
    colorTag: '#e74c3c',
    bgColor: '#fff5f5',
    icon: '📋',
    badge: '教研检查首选'
  },
  {
    id: 'anyou2',
    displayName: '🌱 学期开始版',
    desc: '适合学期初备课规划，突出教学目标设计，结构简洁清晰，适合日常教学自用备忘。',
    colorTag: '#27ae60',
    bgColor: '#f0fff4',
    icon: '📝',
    badge: '日常备课推荐'
  }
]

const selectWordTemplate = async (templateId) => {
  if (templateId === currentModelId.value) {
    showTemplateDrawer.value = false
    return
  }
  currentModelId.value = templateId
  localStorage.setItem('last_active_model_id', templateId)
  await loadCurrentData()
  showTemplateDrawer.value = false
}

const sections = ref([
  { id: 'header', label: '课题信息' },
  { id: 'summary', label: '备课摘要' },
  { id: 'info-grid', label: '基本信息' },
  { id: 'knowledge-skills', label: '知识与技能' },
  { id: 'process-method', label: '过程与方法' },
  { id: 'attitude-values', label: '情感态度价值观' },
  { id: 'teaching-focus', label: '教学重点' },
  { id: 'teaching-difficulty', label: '教学难点' },
  { id: 'teaching-method', label: '教学方法' },
  { id: 'media', label: '媒介' },
  { id: 'teaching-process', label: '教学过程' },
  { id: 'learning-materials', label: '学习资料' },
  { id: 'after-class-summary', label: '课后小结' }
])

const scrollToSection = (sectionId) => {
  const element = document.getElementById(sectionId)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

const activeSection = ref('header')
const updateActiveSection = () => {
  const scrollPosition = window.scrollY + 100

  for (let i = sections.value.length - 1; i >= 0; i--) {
    const section = sections.value[i]
    const element = document.getElementById(section.id)
    if (element && element.offsetTop <= scrollPosition) {
      activeSection.value = section.id
      break
    }
  }
}

onMounted(() => {
  window.addEventListener('scroll', updateActiveSection)
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateActiveSection)
})
</script>

<template>
  <div class="app-container">
    <div class="home-link">
      <router-link to="/">返回首页</router-link>
    </div>

    <button class="template-drawer-fab" @click="showTemplateDrawer = !showTemplateDrawer" title="切换 Word 导出模板">
      模板风格
    </button>

    <div class="sidebar-nav" v-if="examData">
      <div class="nav-header">教案目录</div>
      <div v-for="section in sections" :key="section.id" class="nav-item"
        :class="{ 'active': activeSection === section.id }" @click="scrollToSection(section.id)">
        {{ section.label }}
      </div>
    </div>

    <transition name="fade-overlay">
      <div v-if="showTemplateDrawer" class="drawer-overlay" @click.self="showTemplateDrawer = false"></div>
    </transition>

    <transition name="slide-drawer">
      <div v-if="showTemplateDrawer" class="template-drawer">
        <div class="drawer-header">
          <h3>选择 Word 导出模板</h3>
          <button class="drawer-close-btn" @click="showTemplateDrawer = false">✕</button>
        </div>
        <p class="drawer-subtitle">点击下方卡片即可切换当前教案的 Word 导出格式</p>
        <div class="template-cards">
          <div v-for="tpl in TEMPLATE_PREVIEWS" :key="tpl.id" class="tpl-card"
            :class="{ 'tpl-card--active': currentModelId === tpl.id }"
            :style="{ background: tpl.bgColor, borderColor: tpl.colorTag }" @click="selectWordTemplate(tpl.id)">
            <div class="tpl-badge" :style="{ background: tpl.colorTag }">{{ tpl.badge }}</div>
 
            <div class="tpl-name" :style="{ color: tpl.colorTag }">{{ tpl.displayName }}</div>
            <p class="tpl-desc">{{ tpl.desc }}</p>
            <div class="tpl-check" v-if="currentModelId === tpl.id">✅ 当前使用中</div>
          </div>
        </div>
        <div class="drawer-tip">💡 切换模板后，点击工具栏的"导出 Word"按钮即可使用新模板导出</div>
      </div>
    </transition>

    <Toolbar :is-lesson-plan="true" @export-word="handleExportWord" @export-json="handleExportJSON"
      @save-template="handleSaveTemplate" @load-template="handleLoadTemplate" @import-json="handleImportJSON"
      @reset-data="handleReset" @open-settings="showSettingsModal = true" />

    <div class="content-area" v-if="examData">
      <LessonPlanDetail :data="examData" :is-generating="isGeneratingPlan" id="lesson-paper-container"
        @generate-ai="generateLessonPlan" />
    </div>
    <div v-else class="loading">
      Loading Data...
    </div>

    <AIChatAssistant v-model="showAIChat" :current-content="examData" system-context="您是一个专业的教案编写助手。请根据用户指令修改教案内容。"
      @update-content="handleAIUpdate" />

    <button class="ai-chat-fab" @click="showAIChat = !showAIChat" title="AI 助手">
      对话助手
    </button>
    
    <div class="modal-overlay" v-if="showSaveModal" @click="showSaveModal = false">
      <div class="modal-content" @click.stop>
        <h3>保存为模板</h3>
        <p>请输入模板名称：</p>
        <input v-model="templateName" class="input" placeholder="例如：语文教案模板" @keyup.enter="confirmSaveTemplate" />
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showSaveModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmSaveTemplate">保存</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="showLoadModal" @click="showLoadModal = false">
      <div class="modal-content load-modal" @click.stop>
        <h3>导入模板 (仅展示教案)</h3>
        <div class="template-list" v-if="savedTemplates.filter(t => t.type === 'lesson_plan').length > 0">
          <div v-for="(template, index) in savedTemplates.filter(t => t.type === 'lesson_plan')" :key="template.id"
            class="template-item">
            <div class="template-info" @click="loadTemplate(template)">
              <div class="t-name">
                <span class="tag-plan">教案</span>
                {{ template.name }}
              </div>
              <div class="t-date">{{ template.date }}</div>
            </div>
            <button class="delete-template-btn" @click.stop="deleteTemplate(index)" title="删除模板">×</button>
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

    <div class="modal-overlay" v-if="showDeleteConfirmModal" style="z-index: 2100;" @click="cancelDeleteTemplate">
      <div class="modal-content" @click.stop>
        <h3>确认删除模板？</h3>
        <p>确定要删除这个模板吗？此操作无法撤销。</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="cancelDeleteTemplate">取消</button>
          <button class="modal-btn confirm" @click="confirmDeleteTemplate">删除</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="showLoadConfirmModal" style="z-index: 2100;" @click="showLoadConfirmModal = false">
      <div class="modal-content" @click.stop>
        <h3>确认加载模板？</h3>
        <p>加载模板将覆盖当前所有内容。是否继续？</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showLoadConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmLoadTemplate">加载</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="showResetConfirmModal" style="z-index: 2100;"
      @click="showResetConfirmModal = false">
      <div class="modal-content" @click.stop>
        <h3>确认重置？</h3>
        <p>重置将清空所有内容并恢复到初始状态。是否继续？</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showResetConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmReset">重置</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" v-if="showAIGenConfirmModal" style="z-index: 2200;"
      @click="showAIGenConfirmModal = false">
      <div class="modal-content">
        <h3>✨ AI 智能生成完整教案</h3>
        <p>AI 将根据当前的课题名称、章节和摘要，为您生成一份完整的教案。</p>
        <p>这可能需要几秒钟时间，请耐心等待。</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showAIGenConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmGenerateLessonPlan">✨ 开始生成</button>
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

    <SettingsModal v-if="showSettingsModal" :current-model-id="currentModelId" :show-model-selector="true"
      @close="showSettingsModal = false" @change-model="handleModelChange" />
  </div>
</template>

<style scoped>
.app-container {
  padding: 20px;
  min-height: 100vh;
}

.home-link {
  margin-bottom: 20px;
}

.home-link a {
  color: var(--text-color);
  text-decoration: none;
  font-weight: bold;
  background: #fff;
  padding: 10px 15px;
  border-radius: 20px;
  border: 2px solid #2c3e50;
  box-shadow: 2px 2px #2c3e50;
  transition: transform .1s;
}

.content-area {
  max-width: 800px;
  margin: 0 auto;
}

.loading {
  text-align: center;
  padding: 50px;
  font-size: 1.2em;
  color: var(--text-color);
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


.template-drawer-fab {
  position: fixed;
  bottom: 90px;
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

.template-drawer-fab:hover {
  transform: scale(1.05);
  background: #c0392b;
}

.drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 895;
}

.template-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  height: 100vh;
  background: white;
  padding: 20px;
  z-index: 900;
  overflow-y: auto;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #2c3e50;
}

.drawer-header h3 {
  margin: 0;
  color: #2c3e50;
}

.drawer-close-btn {
  background: transparent;
  border: none;
  font-size: 1.5em;
  cursor: pointer;
  color: #2c3e50;
}

.drawer-subtitle {
  margin-bottom: 20px;
  color: #666;
  font-size: 0.9em;
}

.template-cards {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.tpl-card {
  padding: 15px;
  border: 2px solid #ccc;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.tpl-card:hover {
  transform: translate(-3px, -3px);
  box-shadow: 7px 7px 0 rgba(0, 0, 0, 0.15);
}

.tpl-card--active {
  box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.2);
  transform: translate(-2px, -2px);
}

.tpl-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  color: white;
  font-size: 0.72em;
  font-weight: bold;
  padding: 3px 10px;
  border-radius: 20px;
  font-family: var(--handwriting-font);
}

.tpl-icon {
  font-size: 2.2em;
  margin-bottom: 8px;
}

.tpl-name {
  font-size: 1.15em;
  font-weight: bold;
  margin-bottom: 8px;
}

.tpl-desc {
  font-size: 0.88em;
  color: #555;
  line-height: 1.5;
  margin: 0 0 10px;
}

.tpl-check {
  font-size: 0.88em;
  font-weight: bold;
  color: #27ae60;
  border-top: 1px dashed #ccc;
  padding-top: 8px;
  margin-top: 4px;
}

.drawer-tip {
  font-size: 0.82em;
  color: #888;
  background: #f0f0f0;
  border: 1px dashed #ccc;
  border-radius: 8px;
  padding: 12px;
  line-height: 1.5;
}

.slide-drawer-enter-active,
.slide-drawer-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-drawer-enter-from,
.slide-drawer-leave-to {
  transform: translateX(100%);
}

.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.25s;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}

.sidebar-nav {
  position: fixed;
  top: 120px;
  left: 20px;
  right: auto;
  width: 180px;
  background: var(--paper-bg);
  border: 2px dashed var(--text-color);
  border-radius: 10px;
  padding: 15px;
  z-index: 900;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

.nav-header {
  font-weight: bold;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--text-color);
  text-align: center;
  font-size: 0.9em;
}

.nav-item {
  padding: 6px 10px;
  margin: 4px 0;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.85em;
  transition: all 0.2s;
  color: var(--text-color);
}

.nav-item:hover {
  background: rgba(230, 126, 34, 0.1);
  transform: translateX(-2px);
}

.nav-item.active {
  background: var(--accent-color);
  color: white;
  font-weight: bold;
  border-right: 3px solid white;
}

@media (max-width: 768px) {
  .sidebar-nav {
    display: none;
  }
}
</style>