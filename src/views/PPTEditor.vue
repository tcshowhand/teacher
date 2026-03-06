<script setup>
import { ref, onMounted, watch } from 'vue'
import PptxGenJS from 'pptxgenjs'
import Toolbar from '../components/Toolbar.vue'
import SettingsModal from '../components/SettingsModal.vue'
import AIChatAssistant from '../components/AIChatAssistant.vue'
import { useRoute } from 'vue-router'
import { sendToQwenAIDialogue } from '../api/qwenAPI'
import { useSettingsStore } from '../store/settings'
import localforage from 'localforage'
import { DEFAULT_MODEL_ID } from '../config/models'
import { saveAs } from 'file-saver'

const settings = useSettingsStore()
const route = useRoute()

const pptData = ref(null)
const isGenerating = ref(false)
const currentDocId = ref('')
const currentModelId = ref(localStorage.getItem('last_active_model_id') || DEFAULT_MODEL_ID)

const showSettingsModal = ref(false)
const showSaveModal = ref(false)
const showLoadModal = ref(false)
const showApiKeyAlertModal = ref(false)
const showAIChat = ref(false)
const showAIGenConfirmModal = ref(false)
const savedTemplates = ref([])
const templateName = ref('')
const TEMPLATES_KEY = 'ppt_templates_v1'
const lessonContext = ref('')

// Init
const createEmptyPPT = (title = '新幻灯片') => ({
  title: title,
  subtitle: '副标题',
  teachingMode: '理论课',
  summary: '',
  author: 'Teacher',
  slides: [
    { title: '第一页', content: ['点击编辑内容'], note: '演讲备注' }
  ]
})

const getStorageKey = (docId) => `ppt_data_v1_${currentModelId.value}_${docId}`

onMounted(async () => {
  // Load Templates
  try {
    const cached = await localforage.getItem(TEMPLATES_KEY)
    if (cached) savedTemplates.value = JSON.parse(JSON.stringify(cached))
  } catch (e) {
    console.error(e)
  }

  // Determine Doc ID
  const { courseName, chapterId } = route.query
  if (courseName && chapterId) {
    currentDocId.value = `${courseName}_ppt_ch${chapterId}`
  } else {
    currentDocId.value = 'default_ppt'
  }

  // Load Data
  const storageKey = getStorageKey(currentDocId.value)
  const cachedData = await localforage.getItem(storageKey)
  
  // Initialize with cache or empty
  if (cachedData) {
    pptData.value = cachedData
  } else {
    let title = route.query.title || '新幻灯片'
    pptData.value = createEmptyPPT(title)
  }

  // ALWAYS try to sync context from Generator State if available (to get latest summary/mode)
  if (courseName && chapterId) {
     const GENERATOR_KEY = 'lesson_plan_generator_state_v3'
     try {
       const raw = localStorage.getItem(GENERATOR_KEY)
       if (raw) {
         const state = JSON.parse(raw)
         // Use loose comparison for ID as route query is string
         const ch = state.generatedChapters?.find(c => c.id == chapterId)
         
         if (ch) {
           // Update metadata in pptData if fields are missing or empty (or force update?)
           // Strategy: If it's a new file (just created), overwrite.
           // If it's cached, maybe we only update context?
           // User wants "generate according to lesson plan", so having the context is key.
           
           if (ch.teachingMode) {
              pptData.value.teachingMode = ch.teachingMode
           }
           if (ch.summary) {
              pptData.value.summary = ch.summary
           }
           // Use title from generator if cache title seems default? 
           // Better to trust generator for titles if we assume sync.
           const genTitle = ch.mainTitle || ch.title
           if (genTitle) pptData.value.title = genTitle
           if (ch.subTitle) pptData.value.subtitle = ch.subTitle

           // Update lessonContext for AI
           lessonContext.value = `章节主标题：${genTitle}\n章节副标题：${ch.subTitle}\n授课形式：${ch.teachingMode || '理论课'}\n内容摘要：${ch.summary || ''}`
         }
       }
     } catch(e) { console.error('Sync failed', e) }
  }
})

// Auto-save
watch(pptData, async (newVal) => {
  if (newVal && currentDocId.value) {
    await localforage.setItem(getStorageKey(currentDocId.value), JSON.parse(JSON.stringify(newVal)))
  }
}, { deep: true })

const handleModelChange = (id) => {
  currentModelId.value = id
  localStorage.setItem('last_active_model_id', id)
}

// AI Generation
const generatePPT = async () => {
  if (isGenerating.value) return
  if (pptData.value && pptData.value.slides.length > 1) {
    // 显示自定义确认弹窗而不是原生confirm
    showAIGenConfirmModal.value = true
    return
  }
  
  // 如果没有现有内容，直接生成
  await confirmGeneratePPT()
}

// 新增确认生成函数
const confirmGeneratePPT = async () => {
  showAIGenConfirmModal.value = false
  isGenerating.value = true
  const title = pptData.value?.title || "未命名演示文稿"
  const slideCount = 8

  const { courseName, chapterId } = route.query
  const cName = courseName || '未命名课程'
  
  // Construct context from current pptData (which might be edited by user or loaded from storage)
  const currentContext = `章节主标题：${pptData.value.title}\n章节副标题：${pptData.value.subtitle || '无'}\n授课形式：${pptData.value.teachingMode || '理论课'}\n内容摘要：${pptData.value.summary || '无'}`

  // 尝试加载完整的教案数据
  let lessonPlanContext = ''
  if (courseName && chapterId) {
    try {
      const currentModelIdForStorage = localStorage.getItem('last_active_model_id') || DEFAULT_MODEL_ID
      const lessonPlanDocId = `${courseName}_ch${chapterId}`
      const lessonPlanStorageKey = `exam_data_v1_plan_${currentModelIdForStorage}_${lessonPlanDocId}`
      const lessonPlanData = await localforage.getItem(lessonPlanStorageKey)
      
      if (lessonPlanData) {
        // 构建完整的教案上下文
        lessonPlanContext = `
【完整教案信息】
- 授课课题：${lessonPlanData['授课课题'] || '无'}
- 子章节：${lessonPlanData['子章节'] || '无'}
- 备课摘要/设计意图：${lessonPlanData['摘要'] || '无'}
- 知识与技能：${lessonPlanData['知识与技能'] || '无'}
- 过程与方法：${lessonPlanData['过程与方法'] || '无'}
- 情感、态度、价值观：${lessonPlanData['情感、态度、价值观'] || '无'}
- 教学重点：${lessonPlanData['教学重点'] || '无'}
- 教学难点：${lessonPlanData['教学难点'] || '无'}
- 教学方法：${lessonPlanData['教学方法'] || '无'}
- 媒介：${lessonPlanData['媒介'] || '无'}
- 学习资料：${lessonPlanData['学习资料'] || '无'}
- 课后小结：${lessonPlanData['课后小结'] || '无'}
`
        // 如果有教学过程，也添加进去
        if (lessonPlanData['教学过程'] && Array.isArray(lessonPlanData['教学过程'])) {
          let teachingProcess = '\n- 教学过程：\n'
          lessonPlanData['教学过程'].forEach((process, index) => {
            if (Array.isArray(process) && process.length >= 2) {
              teachingProcess += `  ${index + 1}. ${process[0]}: ${process[1]}\n`
            }
          })
          lessonPlanContext += teachingProcess
        }
      }
    } catch (e) {
      console.error('Failed to load lesson plan data for PPT generation', e)
    }
  }

  let prompt = `请为课程《${cName}》的当前章节生成一份 PPT 大纲内容。
  
  【当前章节信息】
  ${currentContext}
  ${lessonPlanContext}
  
  【生成要求】
  1. 生成约 ${slideCount} 页幻灯片。
  2. 请根据上述章节信息（特别是摘要、教学重点、教学难点、教学过程等完整教案信息）来规划每一页的内容。
  3. 第一页必须是封面（Cover），包含主标题和副标题。
  4. 最后一页是结束页。
  5. 中间页包含具体教学/演讲内容，每页包含标题(title)和内容要点列表(content)，以及演讲备注(note)。
  6. 严格以 JSON 格式返回，不要使用\`\`\`

  JSON格式示例：
  {
    "title": "主标题",
    "slides": [
      { "layout": "Title", "title": "主标题", "subtitle": "副标题" },
      { "layout": "Content", "title": "第一章：...", "content": ["要点1", "要点2"], "note": "本页备注..." }
    ]
  }`

  const messages = [{ role: 'user', content: prompt }]

  await sendToQwenAIDialogue(messages, (text, isComplete) => {
    if (isComplete) {
      isGenerating.value = false
      try {
        const clean = text.replace(/```json/g, '').replace(/```/g, '').trim()
        if (clean.includes('API Key not configured')) {
            showApiKeyAlertModal.value = true
            return
        }
        const parsed = JSON.parse(clean)
        pptData.value = parsed
      } catch (e) {
        console.error('Failed to parse AI PPT response', e)
        alert('生成失败，请重试。')
      }
    }
  })
}

// Export PPT
const handleExportPPT = () => {
  try {
    const pres = new PptxGenJS()
    
    // Set Metadata
    pres.title = pptData.value.title
    pres.author = pptData.value.author || 'Teacher'

    // Add Slides
    pptData.value.slides.forEach(slide => {
      const s = pres.addSlide()
      
      // Background / Theme (Simple)
      s.background = { color: 'F1F1F1' }

      if (slide.layout === 'Title' || slide.layout === 'Cover') {
        s.addText(slide.title || pptData.value.title, { 
          x: '10%', y: '40%', w: '80%', h: 1.5, 
          fontSize: 32, bold: true, align: 'center', color: '363636' 
        })
        s.addText(slide.subtitle || pptData.value.subtitle || '', { 
          x: '10%', y: '55%', w: '80%', h: 1, 
          fontSize: 18, align: 'center', color: '666666' 
        })
      } else {
        // Content Slide
        s.addText(slide.title, { 
          x: 0.5, y: 0.5, w: '90%', h: 1, 
          fontSize: 24, bold: true, color: '363636',
          border: { pt: 0, pb: '1pt', color: 'A0A0A0' }
        })
        
        if (Array.isArray(slide.content)) {
          slide.content.forEach((line, idx) => {
             s.addText(line, { 
               x: 1, y: 1.8 + (idx * 0.6), w: '80%', h: 0.5, 
               fontSize: 16, bullet: true, color: '555555' 
             })
          })
        }
      }

      // Notes
      if (slide.note) s.addNotes(slide.note)
    })

    const fileName = `${pptData.value.title}_${new Date().toISOString().slice(0,10)}.pptx`
    pres.writeFile({ fileName: fileName })
  } catch (e) {
    console.error(e)
    alert('导出 PPT 失败: ' + e.message)
  }
}

const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(pptData.value, null, 2)], { type: 'application/json' })
    saveAs(blob, `${pptData.value.title}.json`)
}

const handleImportJSON = (json) => {
    pptData.value = json
}

const handleSaveTemplate = () => {
    templateName.value = "PPT模板 " + (new Date().toLocaleDateString())
    showSaveModal.value = true
}

const confirmSaveTemplate = async () => {
    savedTemplates.value.unshift({
        id: Date.now(),
        name: templateName.value,
        data: JSON.parse(JSON.stringify(pptData.value)),
        type: 'ppt',
        date: new Date().toLocaleString()
    })
    await localforage.setItem(TEMPLATES_KEY, JSON.parse(JSON.stringify(savedTemplates.value)))
    showSaveModal.value = false
}

const updateAI = (newData) => {
    if (newData) pptData.value = { ...pptData.value, ...newData }
}

const addSlide = () => {
    pptData.value.slides.push({
        title: '新页面',
        content: ['输入内容...'],
        note: ''
    })
}

const removeSlide = (index) => {
    pptData.value.slides.splice(index, 1)
}
</script>

<template>
  <div class="app-container">
    <div class="home-link">
      <router-link to="/">🏠 返回首页</router-link>
    </div>

    <Toolbar 
      :isPPT="true"
      @export-ppt="handleExportPPT"
      @export-json="handleExportJSON"
      @import-json="handleImportJSON"
      @save-template="handleSaveTemplate"
      @open-settings="showSettingsModal = true"
    />

    <div class="ai-actions">
        <button class="ai-gen-btn" @click="generatePPT" :disabled="isGenerating">
            {{ isGenerating ? 'PPT 生成中...' : 'AI 一键生成 PPT' }}
        </button>
    </div>

    <div class="content-area" v-if="pptData">
        <div class="slide-editor" v-for="(slide, index) in pptData.slides" :key="index">
            <div class="slide-header">
                <span class="slide-num">#{{ index + 1 }}</span>
                <button class="del-btn" @click="removeSlide(index)">×</button>
            </div>
            <div class="slide-content">
                <input v-model="slide.title" class="slide-title-input" placeholder="页面标题" />
                <textarea 
                    v-if="Array.isArray(slide.content)"
                    :value="slide.content.join('\n')"
                    @input="e => slide.content = e.target.value.split('\n')"
                    class="slide-body-input"
                    placeholder="内容要点 (每行一点)"
                ></textarea>
                <div v-else>
                    <!-- Cover Slide Case -->
                     <input v-model="slide.subtitle" class="slide-subtitle-input" placeholder="副标题" />
                </div>
                <textarea v-model="slide.note" class="slide-note-input" placeholder="演讲备注..."></textarea>
            </div>
        </div>
        
        <button class="add-slide-btn" @click="addSlide">＋ 添加页面</button>
    </div>
    
    <div v-else class="loading">Loading...</div>

    <!-- AI Generation Confirmation Modal -->
    <div class="modal-overlay" v-if="showAIGenConfirmModal" style="z-index: 2200;">
      <div class="modal-content">
        <h3>✨ AI 一键生成</h3>
        <p>AI 将根据当前的章节信息和完整教案自动生成PPT。<br><b>注意：此操作可能会覆盖您已手动输入的内容。</b></p>
        <div class="modal-actions">
          <button class="modal-btn cancel" @click="showAIGenConfirmModal = false">取消</button>
          <button class="modal-btn confirm" @click="confirmGeneratePPT">✨ 开始生成</button>
        </div>
      </div>
    </div>

    <!-- AI Chat -->
    <AIChatAssistant 
      v-model="showAIChat" 
      :currentContent="pptData"
      systemContext="您是PPT助手。请协助修改PPT内容JSON。"
      @update-content="updateAI" 
    />
    <button class="ai-chat-fab" @click="showAIChat = !showAIChat">🤖 PPT助手</button>

    <!-- Settings Modal -->
    <SettingsModal 
       v-if="showSettingsModal" 
       :currentModelId="currentModelId"
       :show-model-selector="true"
       @change-model="handleModelChange"
       @close="showSettingsModal = false" 
    />

    <!-- Save Modal -->
    <div class="modal-overlay" v-if="showSaveModal">
        <div class="modal-content">
            <h3>💾 保存PPT模板</h3>
            <input v-model="templateName" class="modal-input" />
            <div class="modal-actions">
                <button class="modal-btn cancel" @click="showSaveModal = false">取消</button>
                <button class="modal-btn confirm" @click="confirmSaveTemplate">保存</button>
            </div>
        </div>
    </div>
    
    <!-- API Key Alert -->
    <div class="modal-overlay" v-if="showApiKeyAlertModal">
        <div class="modal-content">
            <h3>⚠️ 请配置 API Key</h3>
            <div class="modal-actions">
                <button class="modal-btn confirm" @click="showApiKeyAlertModal = false; showSettingsModal = true">去配置</button>
            </div>
        </div>
    </div>
    
    <!-- AI Generate Confirm Modal -->
    <div class="modal-overlay" v-if="showAIGenConfirmModal">
        <div class="modal-content">
            <h3>⚠️ 确认生成PPT</h3>
            <p style="color: #666; margin: 15px 0;">当前已有内容，AI 生成将覆盖现有内容。继续吗？</p>
            <div class="modal-actions">
                <button class="modal-btn cancel" @click="showAIGenConfirmModal = false">取消</button>
                <button class="modal-btn confirm" @click="confirmGeneratePPT">继续生成</button>
            </div>
        </div>
    </div>

  </div>
</template>

<style scoped>
/* Global Consistency Styles */
.app-container {
    padding: 20px 20px 100px 20px;
    background-color: #fdfbf7;
    background-image: 
        linear-gradient(#e1e8ed 1px, transparent 1px),
        linear-gradient(90deg, #e1e8ed 1px, transparent 1px);
    background-size: 20px 20px;
    min-height: 100vh;
    font-family: 'Architects Daughter', cursive;
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
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 2px solid #2c3e50;
  box-shadow: 2px 2px 0 #2c3e50;
  transition: transform 0.1s;
}
.home-link a:hover {
  transform: scale(1.05) rotate(-2deg);
}

.ai-actions {
    text-align: center;
    margin-bottom: 30px;
    margin-top: 50px; /* Reduced to accommodate top bar */
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
  background: #f3e5f5; /* Light purple tint for PPT context */
}

.ai-gen-btn:disabled {
    background: #eee;
    color: #999;
    border-color: #999;
    box-shadow: none;
    cursor: wait;
}

.content-area {
    max-width: 1000px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 30px;
    padding-bottom: 80px;
}

.slide-editor {
    background: white;
    border: 2px solid #2c3e50;
    border-radius: 2px;
    padding: 25px;
    box-shadow: 8px 8px 0 rgba(44, 62, 80, 0.1);
    position: relative;
    transition: all 0.2s;
}
.slide-editor:hover {
    transform: rotate(0.5deg);
    box-shadow: 10px 10px 0 rgba(44, 62, 80, 0.15);
}

.slide-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 15px;
    background: #f8f9fa;
    border-bottom: 2px dashed #eee;
    padding-bottom: 10px;
}
.slide-num {
    background: #2c3e50;
    color: white;
    padding: 2px 10px;
    border-radius: 15px;
    font-size: 0.9em;
    font-weight: bold;
}
.del-btn {
    background: none;
    border: 2px solid #e74c3c;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    display: flex; align-items: center; justify-content: center;
    color: #e74c3c;
    font-size: 1.2em;
    cursor: pointer;
    line-height: 1;
}
.del-btn:hover { background: #e74c3c; color: white; }

.slide-title-input {
    width: 100%;
    font-size: 1.5em;
    font-weight: bold;
    border: none;
    border-bottom: 3px solid #2c3e50;
    padding: 5px;
    margin-bottom: 15px;
    outline: none;
    background: transparent;
    font-family: inherit;
    color: #2c3e50;
}
.slide-title-input:focus { border-bottom-color: #3498db; }

.slide-subtitle-input {
    width: 100%;
    font-size: 1.3em;
    border: none;
    border-bottom: 2px dashed #ccc;
    padding: 5px;
    color: #666;
    background: transparent;
    font-family: inherit;
}

.slide-body-input {
    width: 100%;
    min-height: 120px;
    border: none;
    background: transparent;
    background-image: linear-gradient(#eee 1px, transparent 1px);
    background-size: 100% 1.8em;
    line-height: 1.8em;
    padding: 10px 0;
    font-size: 1.1em;
    resize: vertical;
    outline: none;
    font-family: inherit;
    color: #2c3e50;
}

.slide-note-input {
    width: 100%;
    margin-top: 15px;
    height: 80px;
    font-size: 0.9em;
    color: #888;
    border: 2px dotted #ccc;
    background: #fafafa;
    padding: 10px;
    resize: vertical;
    border-radius: 5px;
    font-family: inherit;
}

.add-slide-btn {
    padding: 20px;
    background: transparent;
    border: 3px dashed #bbb;
    color: #999;
    font-size: 1.3em;
    cursor: pointer;
    border-radius: 10px;
    font-family: inherit;
    font-weight: bold;
    transition: all 0.2s;
}
.add-slide-btn:hover {
    border-color: #2c3e50;
    color: #2c3e50;
    background: rgba(255,255,255,0.5);
}

.loading { text-align: center; margin-top: 50px; font-size: 1.5em; color: #999; }

/* Modal Styles Reuse Global */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(2px);
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
}
.modal-input {
    width: 100%; padding: 10px; margin: 15px 0;
    border: none; border-bottom: 2px solid #2c3e50;
    background: transparent; font-size: 1.1em;
    outline: none; font-family: inherit;
}
.modal-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
.modal-btn { 
    padding: 8px 25px; border: 2px solid #2c3e50; 
    border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
    cursor: pointer; font-family: inherit; font-weight: bold; background: white; 
}
.modal-btn:hover { transform: scale(1.05); }
.modal-btn.confirm { background: #2c3e50; color: white; }
.modal-btn.cancel { border-style: dashed; }

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
  font-family: inherit;
  border: 2px solid white;
}
.ai-chat-fab:hover {
  transform: scale(1.05);
  background: #34495e;
}
</style>