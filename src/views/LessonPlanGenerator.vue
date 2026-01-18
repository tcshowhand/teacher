<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { sendToQwenAIDialogue } from '../api/qwenAPI'
import SettingsModal from '../components/SettingsModal.vue'
import ServiceModal from '../components/ServiceModal.vue'
import AIChatAssistant from '../components/AIChatAssistant.vue'
import { DEFAULT_MODEL_ID } from '../config/models'
import { useSettingsStore } from '../store/settings'
import { useUserStore } from '../store/user'
import LoginModal from '../components/LoginModal.vue'

const router = useRouter()
const settings = useSettingsStore()
const userStore = useUserStore()
const courseName = ref('')
const weeklySessions = ref(4)
const sessionsPerPlan = ref(2)
const totalWeeks = ref(18)
const isGenerating = ref(false)
const generatedChapters = ref([])
const showSettings = ref(false)
const showServiceModal = ref(false)
const showApiKeyAlertModal = ref(false) // New Alert Modal
const showLoginModal = ref(false)
const currentModelId = ref(localStorage.getItem('last_active_model_id') || DEFAULT_MODEL_ID)

const handleModelChange = (newModelId) => {
  currentModelId.value = newModelId
  localStorage.setItem('last_active_model_id', newModelId)
}

const STORAGE_KEY = 'lesson_plan_generator_state_v3'

onMounted(() => {
  try {
    const savedState = localStorage.getItem(STORAGE_KEY)
    if (savedState) {
      const parsed = JSON.parse(savedState)
      if (parsed.courseName) courseName.value = parsed.courseName
      if (parsed.weeklySessions) weeklySessions.value = parsed.weeklySessions
      if (parsed.sessionsPerPlan) sessionsPerPlan.value = parsed.sessionsPerPlan
      if (parsed.totalWeeks) totalWeeks.value = parsed.totalWeeks
      
      // Migration logic for old data format
      if (parsed.generatedChapters && Array.isArray(parsed.generatedChapters)) {
        generatedChapters.value = parsed.generatedChapters.map(chapter => ({
          ...chapter,
          mainTitle: chapter.mainTitle || chapter.title || '',
          subTitle: chapter.subTitle || '',
          summary: chapter.summary || chapter.desc || ''
        }))
      }
    }
  } catch (e) {
    console.error('Failed to load generator state', e)
  }
})

watch([courseName, weeklySessions, sessionsPerPlan, totalWeeks, generatedChapters], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      courseName: courseName.value,
      weeklySessions: weeklySessions.value,
      sessionsPerPlan: sessionsPerPlan.value,
      totalWeeks: totalWeeks.value,
      generatedChapters: generatedChapters.value
    }))
  } catch (e) {
    console.error('Failed to save generator state', e)
  }
}, { deep: true })

const handleGenerate = async () => {
  if (!courseName.value) {
    alert('请输入课程名称')
    return
  }

  isGenerating.value = true
  generatedChapters.value = []

  const totalSessions = weeklySessions.value * totalWeeks.value
  const estimatedPlans = Math.ceil(totalSessions / sessionsPerPlan.value)

  const prompt = `请为课程《${courseName.value}》设计一个学期的教学进度大纲。
  适用学段：${settings.educationLevel} 。
  课程安排：共 ${totalWeeks.value} 周，每周 ${weeklySessions.value} 课时，共计 ${totalSessions} 课时。
  备课要求：每 ${sessionsPerPlan.value} 节课写一份教案，预计需要生成 ${estimatedPlans} 份教案。
  请根据以上信息，规划出一系列的教案主题。
  请严格以 JSON 数组格式返回，不要包含 markdown 标记，不要包含其他文字。
  请注意：mainTitle 字段只包含教案的主题名称，不要包含"第一份教案"或"第1课"等编号文字。
  格式如下：
  [
    {
      "id": 1, 
      "mainTitle": "Python 基础语法介绍", 
      "subTitle": "环境搭建与变量", 
      "summary": "本节课主要介绍Python安装、环境变量配置及基本数据类型。"
    }
  ]`

  const messages = [
    { role: 'user', content: prompt }
  ]

  let fullText = ''
  await sendToQwenAIDialogue(messages, (text, isComplete) => {
    fullText = text
    if (isComplete) {
      isGenerating.value = false
      // Attempt to parse JSON
      try {
        const cleanText = fullText.replace(/```json/g, '').replace(/```/g, '').trim()
        
        // Check for specific error message from worker/API
        if (cleanText.includes('请先配置 API Key') || cleanText.includes('API Key not configured')) {
            showApiKeyAlertModal.value = true
            return
        }

        const parsed = JSON.parse(cleanText)
        
        // Ensure robust structure even if AI returns old keys
        generatedChapters.value = parsed.map(item => ({
          id: item.id,
          mainTitle: item.mainTitle || item.title || '无标题',
          subTitle: item.subTitle || '',
          summary: item.summary || item.desc || '',
          teachingMode: item.teachingMode || '理论课'
        }))

      } catch (e) {
        console.error('Failed to parse AI response', e)
        alert('生成失败，AI 返回格式有误或服务异常。')
      }
    }
  })
}

const goToExam = (chapter, index, type) => {
  const path = type === 'lesson_plan' ? '/lesson-plan' : '/exam'
  router.push({ 
    path: path, 
    query: { 
      // Minimal params
      courseName: courseName.value,
      chapterId: chapter.id,
      lessonNumber: index + 1,
      type: type
    } 
  })
}

const showAIChat = ref(false)

const handleAIUpdate = (newChapters) => {
  let chaptersToUpdate = newChapters

  // Robustness: If AI returned an object { chapters: [...] }, extract the array
  if (!Array.isArray(newChapters) && typeof newChapters === 'object') {
     const values = Object.values(newChapters)
     const foundArray = values.find(v => Array.isArray(v))
     if (foundArray) {
       chaptersToUpdate = foundArray
     }
  }

  if (Array.isArray(chaptersToUpdate)) {
    // Basic validation
    generatedChapters.value = chaptersToUpdate.map((item, index) => {
      // Try to find the title field
      const title = item.mainTitle || item.title || item.chapterTitle || item.name || item.caption || `第 ${index + 1} 章`
      // Try to find summary
      const summary = item.summary || item.desc || item.description || item.content || ''
      
      return {
        id: item.id || Date.now() + Math.random(),
        mainTitle: title,
        subTitle: item.subTitle || item.section || '',
        summary: summary,
        teachingMode: item.teachingMode || '理论课' 
      }
    })
    // Optional: Notify success via UI if needed, but the change should be visible
  } else {
    console.warn('AI returned invalid format', newChapters)
    alert('AI 返回的数据格式不正确，未能更新列表。')
  }
}
</script>

<template>
  <div class="generator-container">
    <div class="toolbar-top">
      <div class="user-info" v-if="userStore.isLoggedIn">
        <img :src="userStore.userInfo.Avatar" class="user-avatar" v-if="userStore.userInfo.Avatar" />
        <span class="user-hello">{{ userStore.userInfo.StaticName || userStore.userInfo.Name || userStore.userInfo.username }}</span>
        <button class="settings-btn logout-btn" @click="userStore.logout()">退出</button>
      </div>
      <button v-else class="settings-btn" @click="showLoginModal = true" style="background: #e8f8f5; border-color: #1abc9c; color: #16a085;">🔐 登录</button>
      
      <button class="settings-btn" @click="showServiceModal = true" style="background: #fff8e1; border-color: #f1c40f; color: #f39c12; margin-right: 10px;">➕ 定制模型</button>
      <button class="settings-btn" @click="showSettings = true">⚙️ 设置 </button>
    </div>

    <div class="hero-section">
      <h1>📚 智能教案生成器</h1>
      <p class="subtitle">AI 驱动，一键生成教学大纲与配套试题</p>
    </div>

    <div class="input-section">
      <div class="input-group">
        <label>课程名称</label>
        <input v-model="courseName" placeholder="例如：新媒体运营" @keyup.enter="handleGenerate" />
      </div>
      <div class="input-group">
        <label>共多少周</label>
        <input type="number" v-model="totalWeeks" min="1" max="30" class="number-input" />
      </div>
      <div class="input-group">
        <label>每周课时</label>
        <input type="number" v-model="weeklySessions" min="1" max="20" class="number-input" />
      </div>
      <div class="input-group">
        <label>几课时写一个教案</label>
        <input type="number" v-model="sessionsPerPlan" min="1" max="10" class="number-input" />
      </div>
      <button class="generate-btn" @click="handleGenerate" :disabled="isGenerating">
        {{ isGenerating ? '✨ 生成中...' : '✨ 开始生成' }}
      </button>
    </div>

    <div class="results-section" v-if="generatedChapters.length > 0">
      <h2>📖 生成结果</h2>
      <div class="chapters-grid">
        <div v-for="(chapter, index) in generatedChapters" :key="chapter.id" class="chapter-card">
          <div class="chapter-badge">#{{ index + 1 }}</div>
          <div class="chapter-info">
            <!-- Main Title -->
            <input v-model="chapter.mainTitle" class="editable-title main-title" placeholder="大标题" />
            <!-- Subtitle -->
            <input v-model="chapter.subTitle" class="editable-title sub-title" placeholder="小标题" />
            
            <!-- Teaching Mode Select -->
            <select v-model="chapter.teachingMode" class="mode-select">
              <option value="理论课">理论课</option>
              <option value="实践课">实践课</option>
              <option value="理实一体课">理实一体课</option>
            </select>

            <!-- Summary -->
            <textarea v-model="chapter.summary" class="editable-summary" placeholder="摘要内容..."></textarea>
          </div>
          <div class="actions">
            <button class="action-btn plan-btn" @click="goToExam(chapter, index, 'lesson_plan')">
              📘 编辑教案
            </button>
            <button class="action-btn exam-btn" @click="goToExam(chapter, index, 'exam')">
              📝 生成试题
            </button>
          </div>
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
          <button class="modal-btn confirm" @click="showApiKeyAlertModal = false; showSettings = true">去配置</button>
        </div>
      </div>
    </div>

    <!-- AI Chat Assistant -->
    <AIChatAssistant 
      v-model="showAIChat" 
      :currentContent="generatedChapters"
      :systemContext="`您是课程大纲规划助手。
当前课程信息：
- 课程名称：${courseName}
- 适用学段：${settings.educationLevel}
- 总周数：${totalWeeks} 周
- 每周课时：${weeklySessions} 节
- 每份教案对应：${sessionsPerPlan} 节课

当前数据是一个章节列表（JSON数组），列表顺序即为教学顺序（第1项即第1份教案）。
**请务必根据以下公式计算“第 N 周”对应的是列表中的第几项：**
1. 先计算第 N 周之前已经上了多少节课：CompletedSessions = (N - 1) * ${weeklySessions}
2. 计算之前已经讲了多少份教案：CompletedPlans = floor(CompletedSessions / ${sessionsPerPlan})
3. 第 N 周对应的教案范围是：从第 (CompletedPlans + 1) 项开始，到第 (N * ${weeklySessions} / ${sessionsPerPlan}) 项结束。

例如：如果每周 2 节课，每份教案 2 节课：
- 第 1 周：(1-1)*2=0课，0份教案。对应第 1 份教案。
- 第 2 周：(2-1)*2=2课，2/2=1份教案。对应第 2 份教案。

用户指令示例：'第18周是考试周' -> 请代入公式计算，找到对应的列表项，将其标题修改为'期末考试'，同时将副标题改为'期末考核'，摘要改为'进行本学期的期末考试及测评'。
请根据用户的指令**修改**特定章节的**标题、副标题、摘要和授课形式**。
**重要：当修改课程主题时，务必同时更新副标题和摘要，确保内容一致性，不要保留旧的内容。**
**重要：严禁增加或删除章节，只修改现有内容。**`"
      @update-content="handleAIUpdate" 
    />

    <!-- Floating AI Chat Button -->
    <button class="ai-chat-fab" @click="showAIChat = !showAIChat" title="AI 助手">
      🤖 大纲助手
    </button>

    <SettingsModal 
      v-if="showSettings" 
      :currentModelId="currentModelId"
      :show-model-selector="true"
      @change-model="handleModelChange"
      @close="showSettings = false" 
    />
    
    <ServiceModal v-if="showServiceModal" @close="showServiceModal = false" />
    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" />
  </div>

</template>

<style scoped>

.generator-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 60px 20px;
  font-family: 'Architects Daughter', cursive;
  text-align: center;
  min-height: 100vh;
  color: #2c3e50;
  /* Paper grid background */
  background-color: #fdfbf7;
  background-image: 
    linear-gradient(#e1e8ed 1px, transparent 1px),
    linear-gradient(90deg, #e1e8ed 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Animations */
@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-section {
  margin-bottom: 50px;
  animation: fadeInDown 0.8s ease-out;
}

h1 {
  font-size: 3.5em;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 10px;
  text-shadow: 2px 2px 0px rgba(0,0,0,0.1);
}

.subtitle {
  font-size: 1.3em;
  color: #5d6d7e;
  font-weight: bold;
}

/* Settings Button */
.toolbar-top {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  background: white;
  padding: 5px 15px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 2px solid #2c3e50;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.1);
  margin-right: 10px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #2c3e50;
}

.user-hello {
  font-weight: bold;
  color: #2c3e50;
}

.logout-btn {
  padding: 4px 10px !important;
  font-size: 0.9em !important;
  border: 1px dashed #e74c3c !important;
  color: #e74c3c !important;
  box-shadow: none !important;
}

.logout-btn:hover {
  background: #fadbd8 !important;
}

.settings-btn {
  background: white;
  border: 2px solid #2c3e50;
  padding: 8px 16px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px; /* Hand-drawn shape */
  cursor: pointer;
  font-size: 1em;
  color: #2c3e50;
  font-family: inherit;
  font-weight: bold;
  transition: all 0.2s;
  box-shadow: 3px 3px 0 rgba(0,0,0,0.1);
}

.settings-btn:hover {
  transform: scale(1.05) rotate(2deg);
  box-shadow: 5px 5px 0 rgba(0,0,0,0.15);
}

/* Input Section */
.input-section {
  background: white;
  padding: 40px;
  border-radius: 5px;
  /* Sketchy border */
  border: 2px solid #2c3e50;
  box-shadow: 8px 8px 0 rgba(44, 62, 80, 0.2);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: 30px;
  margin-bottom: 60px;
  flex-wrap: wrap;
  animation: fadeInUp 0.8s ease-out 0.2s backwards;
  position: relative;
}

/* Tape effect (pure css decoration) */
.input-section::before {
  content: '';
  position: absolute;
  top: -15px;
  left: 50%;
  transform: translateX(-50%) rotate(-2deg);
  width: 120px;
  height: 35px;
  background-color: rgba(255, 255, 255, 0.6);
  border-left: 2px dashed rgba(0,0,0,0.1);
  border-right: 2px dashed rgba(0,0,0,0.1);
  box-shadow: 0 2px 5px rgba(0,0,0,0.1);
  z-index: 1;
}

.input-group {
  text-align: left;
}

label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
  color: #2c3e50;
  font-size: 1.1em;
}

input {
  padding: 10px 10px;
  font-size: 1.2em;
  font-family: 'Architects Daughter', cursive;
  border: none;
  border-bottom: 3px solid #2c3e50; /* Notebook line style */
  background: transparent;
  outline: none;
  transition: all 0.3s;
  width: 280px;
  color: #2c3e50;
  border-radius: 0;
}

.hand-drawn-select {
  padding: 10px 10px;
  font-size: 1.2em;
  font-family: 'Architects Daughter', cursive;
  border: none;
  border-bottom: 3px solid #2c3e50;
  background: transparent;
  outline: none;
  width: 150px;
  color: #2c3e50;
  border-radius: 0;
  cursor: pointer;
}

.number-input {
  width: 100px;
  text-align: center;
}

input:focus {
  border-bottom-color: #3498db;
  color: #3498db;
}

/* Generate Button */
.generate-btn {
  padding: 12px 30px;
  font-size: 1.2em;
  background: #fff;
  color: #2c3e50;
  border: 3px solid #2c3e50;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: bold;
  font-family: inherit;
  box-shadow: 4px 4px 0 #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
}

.generate-btn:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 #2c3e50;
  background: #f0fff4;
}

.generate-btn:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 #2c3e50;
}

.generate-btn:disabled {
  background: #eee;
  color: #999;
  border-color: #999;
  box-shadow: none;
  cursor: wait;
}

/* Results Section */
.results-section h2 {
  font-size: 2.2em;
  color: #2c3e50;
  margin-bottom: 30px;
  position: relative;
  display: inline-block;
  animation: fadeInUp 0.8s ease-out;
  border-bottom: 3px double #2c3e50;
  padding-bottom: 5px;
}

.chapters-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 30px;
  text-align: left;
  padding-bottom: 40px;
}

.chapter-card {
  background: white;
  border-radius: 2px;
  padding: 25px;
  transition: all 0.3s;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid #ccc;
  box-shadow: 5px 5px 15px rgba(0,0,0,0.1);
  position: relative;
  /* Post-it / Index card feel */
  background: #fff;
  border-top: 10px solid #a2d5f2; /* Default tape color */
  animation: fadeInUp 0.6s ease-out backwards;
}

.chapter-card:nth-child(even) {
  border-top-color: #ffccbc; /* Alternate color */
  transform: rotate(1deg);
}

.chapter-card:nth-child(odd) {
  transform: rotate(-1deg);
}

.chapter-card:hover {
  transform: rotate(0) scale(1.02);
  z-index: 10;
  box-shadow: 10px 15px 25px rgba(0,0,0,0.15);
}

.chapter-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #ffecb3;
  color: #d84315;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px dashed #d84315;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2em;
  transform: rotate(15deg);
  box-shadow: 2px 2px 5px rgba(0,0,0,0.1);
  z-index: 2;
}

.chapter-info {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.editable-title {
  width: 100%;
  font-weight: bold;
  color: #2c3e50;
  border: none;
  background: transparent;
  padding: 5px 0;
  border-bottom: 2px dashed #ccc;
  transition: all 0.3s;
  font-family: inherit;
}

.main-title {
  font-size: 1.4em;
  color: #2c3e50;
}

.sub-title {
  font-size: 1.1em;
  color: #5d6d7e;
  border-bottom-style: dotted;
}

.editable-summary {
  width: 100%;
  border: none;
  background: transparent; /* Notebook styling */
  background-image: linear-gradient(#eee 1px, transparent 1px);
  background-size: 100% 1.5em; /* Match line height */
  line-height: 1.5em;
  font-family: inherit;
  font-size: 1em;
  color: #555;
  resize: vertical;
  min-height: 80px;
  outline: none;
  padding: 0;
}

.mode-select {
  width: 100%;
  padding: 5px;
  border: 2px dashed #ccc;
  border-radius: 4px;
  background: transparent;
  font-family: inherit;
  font-size: 1em;
  color: #2c3e50;
  outline: none;
  cursor: pointer;
  margin-top: 5px;
}

.mode-select:focus, .mode-select:hover {
  border-color: #3498db;
  border-style: solid;
  background: rgba(52, 152, 219, 0.05);
}

.editable-title:hover, .editable-title:focus {
  border-bottom-color: #3498db;
  border-bottom-style: solid;
  background: rgba(52, 152, 219, 0.05);
  outline: none;
}

.actions {
  display: flex;
  gap: 15px;
}

.action-btn {
  flex: 1;
  padding: 10px;
  border: 2px solid #2c3e50;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  font-weight: bold;
  font-size: 1em;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 5px;
  font-family: inherit;
  background: white;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.1);
}

.plan-btn {
  color: #0277bd;
}

.plan-btn:hover {
  background: #e1f5fe;
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 rgba(0,0,0,0.15);
}

.exam-btn {
  color: #e65100;
}

.exam-btn:hover {
  background: #fff3e0;
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 rgba(0,0,0,0.15);
}

/* Stagger animation for cards */
.chapter-card:nth-child(1) { animation-delay: 0.1s; }
.chapter-card:nth-child(2) { animation-delay: 0.2s; }
.chapter-card:nth-child(3) { animation-delay: 0.3s; }
.chapter-card:nth-child(4) { animation-delay: 0.4s; }
.chapter-card:nth-child(5) { animation-delay: 0.5s; }

@media (max-width: 768px) {
  .generator-container {
    padding: 40px 15px;
  }
  
  h1 {
    font-size: 2em;
    margin-top: 10px;
  }
  
  .subtitle {
    font-size: 1em;
  }

  .toolbar-top {
    position: absolute;
    top: 10px;
    right: 10px;
  }
  
  .input-section {
    padding: 25px 15px;
    flex-direction: column;
    align-items: stretch;
    gap: 20px;
  }
  
  .input-group {
    width: 100%;
  }
  
  input {
    width: 100%;
  }
  
  .number-input {
    width: 100%;
    text-align: left;
  }
  
  .chapters-grid {
    grid-template-columns: 1fr;
  }
  
  .chapter-card {
    transform: none !important; /* Disable rotation on mobile for cleaner look */
    margin-bottom: 20px;
  }
}

/* Modal Styles Global (Copied from Editors) */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
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
</style>
