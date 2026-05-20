<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { sendToQwenAIDialogue } from '../api/qwenAPI'
import localforage from 'localforage'
import { saveAs } from 'file-saver'
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
const outlineContent = ref('')
const isGenerating = ref(false)
const generatedChapters = ref([])
const showSettings = ref(false)
const showServiceModal = ref(false)
const showApiKeyAlertModal = ref(false)
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
      if (parsed.outlineContent) outlineContent.value = parsed.outlineContent

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

watch([courseName, weeklySessions, sessionsPerPlan, totalWeeks, outlineContent, generatedChapters], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      courseName: courseName.value,
      weeklySessions: weeklySessions.value,
      sessionsPerPlan: sessionsPerPlan.value,
      totalWeeks: totalWeeks.value,
      outlineContent: outlineContent.value,
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

  let prompt = `请为课程《${courseName.value}》设计一个学期的教学进度大纲。
  适用学段：${settings.educationLevel} 。
  课程安排：共 ${totalWeeks.value} 周，每周 ${weeklySessions.value} 课时，共计 ${totalSessions} 课时。
  备课要求：每 ${sessionsPerPlan.value} 节课写一份教案，预计需要生成 ${estimatedPlans} 份教案。`

  if (outlineContent.value.trim()) {
    prompt += `\n\n用户提供的课程大纲参考：\n${outlineContent.value.trim()}\n\n请根据以上大纲和课程信息，严格按照周次顺序规划出一系列的教案主题。特别注意：第1个教案必须对应第1周内容，第2个教案必须对应第2周内容，以此类推。`
  } else {
    prompt += `\n请根据以上信息，规划出一系列的教案主题。`
  }

  prompt += `\n请严格以 JSON 数组格式返回，不要包含其他文字。
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

      try {
        const cleanText = fullText.replace(/```json/g, '').replace(/```/g, '').trim()

        if (cleanText.includes('请先配置 API Key') || cleanText.includes('API Key not configured')) {
          showApiKeyAlertModal.value = true
          return
        }

        const parsed = JSON.parse(cleanText)

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
  let path = '/lesson-plan'
  if (type === 'exam') path = '/exam'
  if (type === 'ppt') path = '/ppt'
  router.push({
    path: path,
    query: {
      courseName: courseName.value,
      chapterId: chapter.id,
      lessonNumber: index + 1,
      type: type
    }
  })
}

const showAIChat = ref(false)

// 删除某一章节
const deleteChapter = (index) => {
  if (generatedChapters.value.length <= 1) {
    alert('至少保留一个教案！')
    return
  }
  generatedChapters.value.splice(index, 1)
  // 重新编号
  generatedChapters.value.forEach((ch, i) => { ch.id = i + 1 })
}

// 在指定位置后插入一个新章节
const addChapterAfter = (index) => {
  const newChapter = {
    id: Date.now(),
    mainTitle: '新教案主题',
    subTitle: '副标题',
    summary: '请填写本节课的教学内容摘要。',
    teachingMode: '理论课'
  }
  generatedChapters.value.splice(index + 1, 0, newChapter)
  // 重新编号
  generatedChapters.value.forEach((ch, i) => { ch.id = i + 1 })
}

// 在末尾添加一个新章节
const addChapterAtEnd = () => {
  addChapterAfter(generatedChapters.value.length - 1)
}

const handleAIUpdate = (newChapters) => {
  let chaptersToUpdate = newChapters

  if (!Array.isArray(newChapters) && typeof newChapters === 'object') {
    const values = Object.values(newChapters)
    const foundArray = values.find(v => Array.isArray(v))
    if (foundArray) {
      chaptersToUpdate = foundArray
    }
  }

  if (Array.isArray(chaptersToUpdate)) {
    generatedChapters.value = chaptersToUpdate.map((item, index) => {
      const title = item.mainTitle || item.title || item.chapterTitle || item.name || item.caption || `第 ${index + 1} 章`
      const summary = item.summary || item.desc || item.description || item.content || ''

      return {
        id: item.id || Date.now() + Math.random(),
        mainTitle: title,
        subTitle: item.subTitle || item.section || '',
        summary: summary,
        teachingMode: item.teachingMode || '理论课'
      }
    })

  } else {
    console.warn('AI returned invalid format', newChapters)
    alert('AI 返回的数据格式不正确，未能更新列表。')
  }
}
const fileInput = ref(null)
const detailedFileInput = ref(null)

const exportToJson = () => {
  const data = {
    courseName: courseName.value,
    weeklySessions: weeklySessions.value,
    sessionsPerPlan: sessionsPerPlan.value,
    totalWeeks: totalWeeks.value,
    outlineContent: outlineContent.value,
    generatedChapters: generatedChapters.value,
    exportDate: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${courseName.value || '未命名教案'}_${new Date().toISOString().split('T')[0]}.json`
  link.click()
  URL.revokeObjectURL(url)
}

const triggerImport = () => {
  fileInput.value.click()
}

const importFromJson = (event) => {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (data.courseName) courseName.value = data.courseName
      if (data.weeklySessions !== undefined) weeklySessions.value = data.weeklySessions
      if (data.sessionsPerPlan !== undefined) sessionsPerPlan.value = data.sessionsPerPlan
      if (data.totalWeeks !== undefined) totalWeeks.value = data.totalWeeks
      if (data.outlineContent !== undefined) outlineContent.value = data.outlineContent
      if (data.generatedChapters && Array.isArray(data.generatedChapters)) {
        generatedChapters.value = data.generatedChapters
      }
      alert('教案大纲导入成功！')
    } catch (err) {
      console.error('导入失败', err)
      alert('导入失败：' + err.message)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

// ------------------ 一键全链路批量后台生成系统 ------------------
const generationStatuses = ref({})
const isBatchGenerating = ref(false)
const batchCurrentIndex = ref(0)
const batchTotalCount = ref(0)

const generateAllForChapter = async (chapter, index) => {
  if (generationStatuses.value[chapter.id]?.status === 'plan' || 
      generationStatuses.value[chapter.id]?.status === 'exam' || 
      generationStatuses.value[chapter.id]?.status === 'ppt') {
    return // 正在生成中，防重复触发
  }

  // 初始化状态
  generationStatuses.value[chapter.id] = {
    status: 'plan',
    errorMsg: '',
    progress: 10,
    planData: null,
    examData: null,
    pptData: null
  }

  const docId = `${courseName.value}_ch${chapter.id}`
  const educationLevel = settings.educationLevel || '通用'

  try {
    // ------------------ 阶段一：研制教案 ------------------
    const planPrompt = `请为一个课程生成详细的教案 JSON 数据。
    课程名称：${courseName.value}
    章节名称：${chapter.mainTitle}
    子章节：${chapter.subTitle || ''}
    课时安排：${sessionsPerPlan.value} 课时
    授课形式：${chapter.teachingMode || '理论课'}
    适用学段：${educationLevel}
    备课摘要/设计意图：${chapter.summary || ''}

    请注意：该教案需符合《教案检查》的要求，重点关注以下方面：
    1. 教学目标应明确、具体、恰当，并涵盖知识、技能、情感态度价值观三个维度。
    2. 教学内容要深入挖掘思政教育元素，与大纲要求一致，突出重点、难点，合理分解与衔接。
    3. 教学过程要突出互动与探究，体现学生主动参与与思考。 
    4. 教学设计需体现思政融入、新知识引入得当、教学进度科学、环节安排合理，体现最新教学理念。
    5. 教学方法应以学生为中心，体现互动性与探究性，采用新颖的教学手段。
    6. 编写规范需严格按照学校统一格式，书写认真细致，无错漏。
    7. 教案要有创新性，体现互动与探究，有利于培养学生实践能力和创新精神。

    请严格按照以下 JSON 格式返回，不要包含 markdown 标记代码块：
    {
      "授课课题": "${courseName.value}",
      "子章节": "${chapter.mainTitle}",
      "编号": "第 ${index + 1} 号",
      "课时安排": "${sessionsPerPlan.value} 课时",
      "授课形式": "${chapter.teachingMode || '理论课'}",
      "摘要": "${chapter.summary || ''}", 
      "知识与技能": "...",
      "过程与方法": "...",
      "情感、态度、价值观": "...",
      "教学重点": "...",
      "教学难点": "...",
      "教学方法": "...",
      "媒介": "...",
      "教学过程": [
         ["导入新课", "通过生活实例引入本章核心概念..."],
         ["讲授新知", "深入剖析本节课的关键知识点并结合板书示范..."],
         ["互动研讨", "设计小组讨论活动，引导学生探究式学习..."],
         ["实操演练", "布置堂上任务让学生动手实践，巩固所学..."]
      ],
      "学习资料": "课本与补充在线案例",
      "课后小结": "本节课教学效果良好，学生基本掌握核心目标，个别难点需在下节课进一步强化。"
    }`

    const planMessages = [{ role: 'user', content: planPrompt }]
    let planText = ''
    
    await new Promise((resolve, reject) => {
      sendToQwenAIDialogue(planMessages, (text, isComplete) => {
        planText = text
        if (isComplete) {
          try {
            const cleanText = planText.replace(/```json/g, '').replace(/```/g, '').trim()
            if (cleanText.includes('API Key not configured') || cleanText.includes('请先配置 API Key')) {
              showApiKeyAlertModal.value = true
              reject(new Error('DashScope API Key 未配置或失效'))
              return
            }
            const parsed = JSON.parse(cleanText)
            resolve(parsed)
          } catch (e) {
            reject(new Error('教案大模型返回格式有误，无法解析 JSON'))
          }
        }
      })
    }).then(async (parsedPlan) => {
      generationStatuses.value[chapter.id].planData = parsedPlan
      generationStatuses.value[chapter.id].progress = 40
      const planStorageKey = `exam_data_v1_plan_${currentModelId.value}_${docId}`
      await localforage.setItem(planStorageKey, parsedPlan)
    })

    // ------------------ 阶段二：命制配套试题 ------------------
    generationStatuses.value[chapter.id].status = 'exam'
    const planData = generationStatuses.value[chapter.id].planData
    const questionCount = settings.examQuestionCount || 5
    
    const examPrompt = `请为课程《${courseName.value}》的章节《${chapter.mainTitle} - ${chapter.subTitle || ''}》生成一份包含 ${questionCount} 道题目的配套课后测试卷数据。
    
    【教案背景上下文参考】
    - 教学重点：${planData['教学重点'] || '无'}
    - 教学难点：${planData['教学难点'] || '无'}
    - 摘要说明：${planData['摘要'] || '无'}
    
    请严格按照以下 JSON 格式返回，不要包含 markdown 标记代码块：
    {
      "title": "${courseName.value} - ${chapter.mainTitle} 课后测验",
      "info": ["姓名: _______________", "学号: _______________", "得分: ___________"],
      "footer": "~ 本章测验结束，请老师认真批阅 ~",
      "problems": [
        {
          "qNum": "Q1.",
          "title": "题目名称",
          "tags": "核心知识点",
          "desc": "详细且具有探究性的题目描述...",
          "input": "输入样例(如非编程题请直接省略此字段)",
          "output": "输出样例(如非编程题请直接省略此字段)"
        }
      ]
    }
    注意：如果属于程序设计或代码类教学，请务必提供 input 和 output 样例；若为理论课、语文、数学等常规课程，请务必在 JSON 中省略 input/output 字段。`

    const examMessages = [{ role: 'user', content: examPrompt }]
    let examText = ''

    await new Promise((resolve, reject) => {
      sendToQwenAIDialogue(examMessages, (text, isComplete) => {
        examText = text
        if (isComplete) {
          try {
            const cleanText = examText.replace(/```json/g, '').replace(/```/g, '').trim()
            if (cleanText.includes('API Key not configured') || cleanText.includes('请先配置 API Key')) {
              showApiKeyAlertModal.value = true
              reject(new Error('DashScope API Key 未配置或失效'))
              return
            }
            const parsed = JSON.parse(cleanText)
            if (parsed.problems) {
              parsed.problems.forEach(p => {
                if (!p.image) p.image = ""
              })
            }
            resolve(parsed)
          } catch (e) {
            reject(new Error('试卷大模型返回格式有误，无法解析 JSON'))
          }
        }
      })
    }).then(async (parsedExam) => {
      generationStatuses.value[chapter.id].examData = parsedExam
      generationStatuses.value[chapter.id].progress = 70
      const examStorageKey = `exam_paper_data_v1_${currentModelId.value}_${docId}`
      await localforage.setItem(examStorageKey, parsedExam)
    })

    // ------------------ 阶段三：编排 PPT 课件 ------------------
    generationStatuses.value[chapter.id].status = 'ppt'
    let lessonPlanContext = ''
    if (planData) {
      lessonPlanContext = `
      【教案上下文】
      - 教学重点：${planData['教学重点'] || '无'}
      - 教学难点：${planData['教学难点'] || '无'}
      - 教学方法：${planData['教学方法'] || '无'}
      - 课后小结：${planData['课后小结'] || '无'}
      `
      if (planData['教学过程'] && Array.isArray(planData['教学过程'])) {
        let teachingProcess = '\n- 教学过程：\n'
        planData['教学过程'].forEach((process, pIndex) => {
          if (Array.isArray(process) && process.length >= 2) {
            teachingProcess += `  ${pIndex + 1}. ${process[0]}: ${process[1]}\n`
          }
        })
        lessonPlanContext += teachingProcess
      }
    }

    const pptPrompt = `请为课程《${courseName.value}》章节《${chapter.mainTitle} - ${chapter.subTitle || ''}》设计并编排一份 PPT 大纲演示内容。
    
    【参考教案信息】
    ${lessonPlanContext}
    
    【生成要求】
    1. 需生成 7 - 9 页左右的精美幻灯片。
    2. 第一页必须是封面 (Cover)，包含主标题和副标题。
    3. 最后一页是结束页 (Cover/Title)。
    4. 中间页为具体讲授环节，布局设计需包含 title (标题)、content (要点列表数组) 以及 note (演讲备注说明)。
    5. 严格以 JSON 格式返回，不要包含 markdown 标记代码块。

    JSON 格式示例：
    {
      "title": "${courseName.value} - ${chapter.mainTitle}",
      "slides": [
        { "layout": "Title", "title": "${courseName.value} - ${chapter.mainTitle}", "subtitle": "${chapter.subTitle || ''}" },
        { "layout": "Content", "title": "本章教学目标与重点", "content": ["目标1: 掌握基本概念与运行机制", "目标2: 理解关键难点并学会分析"], "note": "本页向学生阐明学习重心，点拨核心难点。" }
      ]
    }`

    const pptMessages = [{ role: 'user', content: pptPrompt }]
    let pptText = ''

    await new Promise((resolve, reject) => {
      sendToQwenAIDialogue(pptMessages, (text, isComplete) => {
        pptText = text
        if (isComplete) {
          try {
            const cleanText = pptText.replace(/```json/g, '').replace(/```/g, '').trim()
            if (cleanText.includes('API Key not configured') || cleanText.includes('请先配置 API Key')) {
              showApiKeyAlertModal.value = true
              reject(new Error('DashScope API Key 未配置或失效'))
              return
            }
            const parsed = JSON.parse(cleanText)
            resolve(parsed)
          } catch (e) {
            reject(new Error('PPT 大模型返回格式有误，无法解析 JSON'))
          }
        }
      })
    }).then(async (parsedPpt) => {
      generationStatuses.value[chapter.id].pptData = parsedPpt
      generationStatuses.value[chapter.id].progress = 100
      generationStatuses.value[chapter.id].status = 'done'
      const pptStorageKey = `ppt_data_v1_${currentModelId.value}_${docId}`
      await localforage.setItem(pptStorageKey, parsedPpt)
    })

  } catch (error) {
    console.error('备课包生成出错:', error)
    generationStatuses.value[chapter.id].status = 'error'
    generationStatuses.value[chapter.id].errorMsg = error.message || '生成中断'
  }
}

const batchGenerateAllChapters = async () => {
  if (isBatchGenerating.value) return
  if (generatedChapters.value.length === 0) {
    alert('当前大纲没有任何章节，请先在上方录入大纲框架！')
    return
  }

  isBatchGenerating.value = true
  batchTotalCount.value = generatedChapters.value.length
  batchCurrentIndex.value = 0

  for (let i = 0; i < generatedChapters.value.length; i++) {
    const chapter = generatedChapters.value[i]
    batchCurrentIndex.value = i + 1

    // 智能平滑滚动到当前备课卡片，增强全自动沉浸式视觉交互体验
    const cardEl = document.querySelector(`.chapters-grid .chapter-card:nth-child(${i + 1})`)
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    await generateAllForChapter(chapter, i)
  }

  isBatchGenerating.value = false
  alert('🎉 恭喜！全课程全套“教案 + 试题 + PPT课件”已全部自动研制生成并存入缓存！')
}

const exportAllDetailedJson = async () => {
  const allDetails = []

  for (let i = 0; i < generatedChapters.value.length; i++) {
    const chapter = generatedChapters.value[i]
    const docId = `${courseName.value}_ch${chapter.id}`
    const storageKey = `exam_data_v1_plan_${currentModelId.value}_${docId}`

    try {
      const cached = await localforage.getItem(storageKey)
      let detail = cached
      if (!detail) {
        detail = {
          "授课课题": courseName.value || '课题名称',
          "子章节": chapter.mainTitle || chapter.title || '',
          "编号": `第 ${i + 1} 号`,
          "课时安排": `${sessionsPerPlan.value} 课时`,
          "授课形式": chapter.teachingMode || "理论课",
          "摘要": chapter.summary || '',
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
      } else if (typeof detail === 'string') {
        detail = JSON.parse(detail)
      }

      // 添加元数据以便后续导入还原
      detail.__meta = {
        chapterId: chapter.id,
        index: i
      }
      allDetails.push(detail)
    } catch (e) {
      console.error(`Failed to load chapter ${chapter.id}`, e)
    }
  }

  const exportPackage = {
    type: 'batch_detailed_lesson_plans',
    version: '1.0',
    courseName: courseName.value,
    weeklySessions: weeklySessions.value,
    sessionsPerPlan: sessionsPerPlan.value,
    totalWeeks: totalWeeks.value,
    outlineContent: outlineContent.value,
    plans: allDetails
  }

  const blob = new Blob([JSON.stringify(exportPackage, null, 2)], { type: 'application/json' })
  const fileName = `${courseName.value || '教案'}_详细教案合集_${new Date().toISOString().split('T')[0]}.json`
  saveAs(blob, fileName)
}

const triggerDetailedImport = () => {
  detailedFileInput.value.click()
}

const importAllDetailedJson = (event) => {
  const file = event.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const pkg = JSON.parse(e.target.result)
      if (pkg.type !== 'batch_detailed_lesson_plans' && !Array.isArray(pkg)) {
        alert('导入的文件格式不正确，请确保是使用“导出全量详细教案”生成的 JSON。')
        return
      }

      const plans = Array.isArray(pkg) ? pkg : pkg.plans

      if (pkg.courseName) courseName.value = pkg.courseName
      if (pkg.weeklySessions !== undefined) weeklySessions.value = pkg.weeklySessions
      if (pkg.sessionsPerPlan !== undefined) sessionsPerPlan.value = pkg.sessionsPerPlan
      if (pkg.totalWeeks !== undefined) totalWeeks.value = pkg.totalWeeks

      // 更新大纲
      generatedChapters.value = plans.map((p, i) => {
        const meta = p.__meta || {}
        return {
          id: meta.chapterId || Date.now() + i,
          mainTitle: p['授课课题'] || '无标题',
          subTitle: p['子章节'] || '',
          summary: p['摘要'] || '',
          teachingMode: p['授课形式'] || '理论课'
        }
      })

      // 异步保存详细内容到 localforage
      for (const plan of plans) {
        const meta = plan.__meta || {}
        const chapterId = meta.chapterId || generatedChapters.value[plans.indexOf(plan)].id
        const docId = `${courseName.value}_ch${chapterId}`
        const storageKey = `exam_data_v1_plan_${currentModelId.value}_${docId}`

        const cleanPlan = { ...plan }
        delete cleanPlan.__meta
        await localforage.setItem(storageKey, cleanPlan)
      }

      alert('所有详细教案已成功导入并存入本地缓存！')
    } catch (err) {
      console.error('Import failed', err)
      alert('导入失败：' + err.message)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

</script>

<template>
  <div class="generator-container">
    <div class="toolbar-top">
      <div class="user-info" v-if="userStore.isLoggedIn">
        <img :src="userStore.userInfo.Avatar" class="user-avatar" v-if="userStore.userInfo.Avatar" />
        <span class="user-hello">{{ userStore.userInfo.StaticName || userStore.userInfo.Name ||
          userStore.userInfo.username }}</span>
        <button class="settings-btn logout-btn" @click="userStore.logout()">退出</button>
      </div>
      <button v-else class="settings-btn" @click="showLoginModal = true"
        style="background: #e8f8f5; border-color: #1abc9c; color: #16a085;">🔐 登录</button>

      <button class="settings-btn" @click="showServiceModal = true"
        style="background: #fff8e1; border-color: #f1c40f; margin-right: 10px;">友情赞助</button>
      <button class="settings-btn" @click="showSettings = true">设置</button>
    </div>

    <div class="hero-section">
      <h1>豫唐智能教案在线生成平台</h1>
      <p class="subtitle">AI 驱动，一键生成教学大纲与配套试题</p>
    </div>

    <div class="input-section">
      <div class="basic-inputs">
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
      </div>

      <div class="outline-inputs">
        <div class="input-group">
          <div class="outline-container">
            <label>课程大纲（可选）</label>
            <textarea v-model="outlineContent" placeholder="可在此输入课程大纲，AI将根据大纲生成教案。例如：第一周：课程介绍；第二周：基础知识..."
              class="outline-input" />
          </div>
        </div>
        
      </div>

      <div class="generate-inputs">
        <button class="generate-btn" @click="handleGenerate" :disabled="isGenerating">
          {{ isGenerating ? '生成中...' : '开始生成' }}
        </button>
      </div>
    </div>

    <div class="results-section" v-if="generatedChapters.length > 0">
      <div class="results-header">
        <h2>生成结果</h2>
        <button class="batch-gen-btn" @click="batchGenerateAllChapters" :disabled="isBatchGenerating">
          <span v-if="isBatchGenerating">⚡ 批量备课中 (第 {{ batchCurrentIndex }}/{{ batchTotalCount }} 章)...</span>
          <span v-else>⚡ AI 一键全自动批量备课 (教案+试题+课件)</span>
        </button>
      </div>
      <div class="chapters-grid">
        <div v-for="(chapter, index) in generatedChapters" :key="chapter.id" class="chapter-card">
          <div class="chapter-badge">#{{ index + 1 }}</div>
          <!-- 卡片左上角：仅保留删除按钮，悬停显示 -->
          <div class="card-controls">
            <button class="card-ctrl-btn delete-btn" @click="deleteChapter(index)" title="删除此教案">✕</button>
          </div>
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
            
            <!-- 备课包全自动后台生成状态指示器 -->
            <div v-if="generationStatuses[chapter.id]" class="gen-status-box" :class="generationStatuses[chapter.id].status">
              <div class="gen-status-header">
                <span class="gen-status-text">
                  <span v-if="generationStatuses[chapter.id].status === 'plan'">⏳ 正在研制教案 ({{ generationStatuses[chapter.id].progress }}%)</span>
                  <span v-else-if="generationStatuses[chapter.id].status === 'exam'">⏳ 正在命制试题 ({{ generationStatuses[chapter.id].progress }}%)</span>
                  <span v-else-if="generationStatuses[chapter.id].status === 'ppt'">⏳ 正在排版课件 ({{ generationStatuses[chapter.id].progress }}%)</span>
                  <span v-else-if="generationStatuses[chapter.id].status === 'done'">✅ 备课全套制作完成</span>
                  <span v-else-if="generationStatuses[chapter.id].status === 'error'">❌ 制作失败: {{ generationStatuses[chapter.id].errorMsg }}</span>
                </span>
              </div>
              <div class="gen-progress-bar">
                <div class="gen-progress-fill" :style="{ width: generationStatuses[chapter.id].progress + '%' }"></div>
              </div>
            </div>
          </div>
          
          <div class="actions">
            <!-- 主操作：一键全套独占一行 -->
            <button class="action-btn quick-gen-btn action-btn-full"
                    @click="generateAllForChapter(chapter, index)"
                    :disabled="generationStatuses[chapter.id]?.status === 'plan' || generationStatuses[chapter.id]?.status === 'exam' || generationStatuses[chapter.id]?.status === 'ppt'"
                    title="一次性在后台生成该章节的完整配套教案、试卷和课件">
              ⚡ 一键全套备课（教案+试题+课件）
            </button>
            <!-- 次级操作：四个按钮分两列 -->
            <div class="actions-secondary">
              <button class="action-btn plan-btn" @click="goToExam(chapter, index, 'lesson_plan')">📖 教案编辑</button>
              <button class="action-btn exam-btn" @click="goToExam(chapter, index, 'exam')">📝 试题编辑</button>
              <button class="action-btn ppt-btn" @click="goToExam(chapter, index, 'ppt')">💻 PPT课件</button>
              <button class="action-btn insert-action-btn" @click="addChapterAfter(index)" title="在此教案后插入新教案">↓ 新增</button>
            </div>
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
    <AIChatAssistant v-model="showAIChat" :currentContent="generatedChapters" :systemContext="`您是课程大纲规划助手。
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
**重要：严禁增加或删除章节，只修改现有内容。**`" @update-content="handleAIUpdate" />

    <!-- Floating AI Chat Button -->
    <button class="ai-chat-fab" @click="showAIChat = !showAIChat" title="AI 助手">
      🤖 大纲助手
    </button>

    <SettingsModal v-if="showSettings" :currentModelId="currentModelId" :show-model-selector="true"
      @change-model="handleModelChange" @close="showSettings = false" />

    <ServiceModal v-if="showServiceModal" @close="showServiceModal = false" />
    <LoginModal v-if="showLoginModal" @close="showLoginModal = false" />

    <!-- Side Fixed Toolbar -->
    <div class="results-side-toolbar" v-if="generatedChapters.length > 0 && !isGenerating">
      <button class="side-action-btn outline-export" @click="exportToJson" title="仅导出教案大纲结构">
        📤 导出大纲
      </button>
      <button class="side-action-btn detail-export" @click="exportAllDetailedJson" title="导出包含所有编辑详情的全量教案">
        ✨ 导出全量详细
      </button>
      
      <div class="side-separator"></div>
      
      <button class="side-action-btn outline-import" @click="triggerImport" title="导入教案大纲结构">
        📥 导入大纲
      </button>
      <button class="side-action-btn detail-import" @click="triggerDetailedImport" title="导入包含编辑详情的全量教案合集">
        📥 导入全量详细
      </button>

      <input type="file" ref="fileInput" @change="importFromJson" accept=".json" style="display: none;" />
      <input type="file" ref="detailedFileInput" @change="importAllDetailedJson" accept=".json" style="display: none;" />
    </div>
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
  background-color: #fdfbf7;
  background-image:
    linear-gradient(#e1e8ed 1px, transparent 1px),
    linear-gradient(90deg, #e1e8ed 1px, transparent 1px);
  background-size: 20px 20px;
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
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
  text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.1);
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
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);
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
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  font-size: 1em;
  color: #2c3e50;
  font-family: inherit;
  font-weight: bold;
  transition: all 0.2s;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.1);
}

.settings-btn:hover {
  transform: scale(1.05) rotate(2deg);
  box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.15);
}

/* Input Section */
.input-section {
  background: white;
  padding: 40px;
  border-radius: 5px;
  border: 2px solid #2c3e50;
  box-shadow: 8px 8px 0 rgba(44, 62, 80, 0.2);
  display: grid;
  gap: 20px;
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
  border-left: 2px dashed rgba(0, 0, 0, 0.1);
  border-right: 2px dashed rgba(0, 0, 0, 0.1);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  z-index: 1;
}

/* 基础输入框容器 */
.basic-inputs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
@media (max-width: 768px) {
  .basic-inputs {
    grid-template-columns: repeat(1, 1fr);
  }
}

.generate-inputs {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 20px;
}

/* 大纲输入框容器 */
.outline-inputs {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 20px;
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
  padding: 5px 0;
  font-size: 1.2em;
  font-family: 'Architects Daughter', cursive;
  border: none;
  border-bottom: 3px solid #2c3e50;
  background: transparent;
  outline: none;
  transition: all 0.3s;
  width: 280px;
  color: #2c3e50;
  border-radius: 0;
}

.outline-input {
  font-size: 1.2em;
  font-family: 'Architects Daughter', cursive;
  border: none;
  border-bottom: 3px solid #2c3e50;
  background: transparent;
  outline: none;
  transition: all 0.3s;
  color: #2c3e50;
  border-radius: 0;
  resize: vertical;
  min-height: 80px;
  line-height: 1.5em;
  width: 100%;
}

.outline-input:focus {
  border-bottom-color: #3498db;
  color: #3498db;

}

.outline-input-group {
  grid-column: span 2;
  width: 100%;
}

.number-input {
  width: 100px;
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
.results-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

.results-section h2 {
  font-size: 2.2em;
  color: #2c3e50;
  margin-bottom: 0;
  position: relative;
  display: inline-block;
  animation: fadeInUp 0.8s ease-out;
  border-bottom: 3px double #2c3e50;
  padding-bottom: 5px;
}

.add-chapter-btn {
  padding: 8px 18px;
  font-size: 1em;
  font-weight: bold;
  font-family: inherit;
  background: #fff;
  color: #27ae60;
  border: 2px solid #27ae60;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  box-shadow: 3px 3px 0 rgba(39, 174, 96, 0.25);
  transition: all 0.2s;
}

.add-chapter-btn:hover {
  background: #eafaf1;
  transform: translate(-2px, -2px);
  box-shadow: 5px 5px 0 rgba(39, 174, 96, 0.3);
}

/* 卡片内部控制按钮容器 */
.card-controls {
  position: absolute;
  top: 8px;
  left: 10px;
  display: flex;
  gap: 5px;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.2s;
}

.chapter-card:hover .card-controls {
  opacity: 1;
}

.card-ctrl-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px solid;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-family: inherit;
  line-height: 1;
  background: white;
}

.delete-btn {
  color: #e74c3c;
  border-color: #e74c3c;
}

.delete-btn:hover {
  background: #e74c3c;
  color: white;
  transform: scale(1.15);
  box-shadow: 0 2px 6px rgba(231, 76, 60, 0.4);
}

.insert-action-btn {
  color: #27ae60;
  border-color: #27ae60;
}

.insert-action-btn:hover {
  background: #eafaf1;
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 rgba(39, 174, 96, 0.25);
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
  box-shadow: 5px 5px 15px rgba(0, 0, 0, 0.1);
  position: relative;
  background: #fff;
  border-top: 10px solid #a2d5f2;
  animation: fadeInUp 0.6s ease-out backwards;
}

.chapter-card:nth-child(even) {
  border-top-color: #ffccbc;
  transform: rotate(1deg);
}

.chapter-card:nth-child(odd) {
  transform: rotate(-1deg);
}

.chapter-card:hover {
  transform: rotate(0) scale(1.02);
  z-index: 10;
  box-shadow: 10px 15px 25px rgba(0, 0, 0, 0.15);
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
  box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.1);
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
  background: transparent;
  background-image: linear-gradient(#eee 1px, transparent 1px);
  background-size: 100% 1.5em;
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

.mode-select:focus,
.mode-select:hover {
  border-color: #3498db;
  border-style: solid;
  background: rgba(52, 152, 219, 0.05);
}

.editable-title:hover,
.editable-title:focus {
  border-bottom-color: #3498db;
  border-bottom-style: solid;
  background: rgba(52, 152, 219, 0.05);
  outline: none;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions-secondary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.action-btn {
  flex: 1;
  padding: 8px 6px;
  border: 2px solid #2c3e50;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.85em;
  transition: all 0.2s;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  background: white;
  box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);
  white-space: nowrap;
}

.action-btn-full {
  width: 100%;
  font-size: 0.9em;
  padding: 9px 10px;
}

.plan-btn {
  color: #0277bd;
}

.plan-btn:hover {
  background: #e1f5fe;
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
}

.exam-btn {
  color: #e65100;
}

.exam-btn:hover {
  background: #fff3e0;
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
}

/* Stagger animation for cards */
.chapter-card:nth-child(1) {
  animation-delay: 0.1s;
}

.chapter-card:nth-child(2) {
  animation-delay: 0.2s;
}

.chapter-card:nth-child(3) {
  animation-delay: 0.3s;
}

.chapter-card:nth-child(4) {
  animation-delay: 0.4s;
}

.chapter-card:nth-child(5) {
  animation-delay: 0.5s;
}

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



  .chapters-grid {
    grid-template-columns: 1fr;
  }

  .chapter-card {
    transform: none !important;
    margin-bottom: 20px;
  }
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
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
  box-shadow: 10px 10px 0 rgba(0, 0, 0, 0.2);
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
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
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

.ppt-btn {
  color: #8e44ad;
}

.ppt-btn:hover {
  background: #f3e5f5;
  transform: translateY(-2px);
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.15);
}

/* Side Toolbar Styles */
.results-side-toolbar {
  position: fixed;
  right: 20px;
  top: 150px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 1000;
  animation: fadeInRight 0.5s ease-out;
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.side-action-btn {
  background: white;
  border: 2px solid #2c3e50;
  padding: 10px 15px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  font-size: 0.95em;
  color: #2c3e50;
  font-family: inherit;
  font-weight: bold;
  transition: all 0.2s;
  box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.1);
  text-align: left;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.side-action-btn:hover {
  transform: scale(1.05) translateX(-5px);
  box-shadow: 5px 5px 0 rgba(0, 0, 0, 0.15);
}

.outline-export { color: #27ae60; border-color: #27ae60; }
.detail-export { color: #8e44ad; border-color: #8e44ad; }
.outline-import { color: #3498db; border-color: #3498db; }
.detail-import { color: #e67e22; border-color: #e67e22; }

.side-separator {
  height: 2px;
  background: #ddd;
  margin: 5px 0;
  width: 100%;
}

@media (max-width: 1100px) {
  .results-side-toolbar {
    position: static;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    margin-bottom: 20px;
    padding: 10px;
    background: white;
    border: 1px dashed #ccc;
    box-shadow: none;
  }
  .side-action-btn:hover {
    transform: translateY(-2px);
  }
}

/* 一键全套 & 全局批量备课 Neo-brutalism 漫画涂鸦风格样式 */
.batch-gen-btn {
  padding: 10px 22px;
  font-size: 0.9em;
  background: #ffeb3b;
  color: #2c3e50;
  border: 3px solid #2c3e50;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  cursor: pointer;
  font-weight: bold;
  font-family: inherit;
  transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  box-shadow: 4px 4px 0 #2c3e50;
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-gen-btn:hover:not(:disabled) {
  transform: translate(-2px, -2px) rotate(-1deg);
  box-shadow: 6px 6px 0 #2c3e50;
  background: #fff176;
}

.batch-gen-btn:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 #2c3e50;
}

.batch-gen-btn:disabled {
  background: #eee;
  color: #888;
  border-color: #aaa;
  box-shadow: none;
  cursor: wait;
}

.quick-gen-btn {
  color: #e91e63 !important;
  border-color: #e91e63 !important;
  background: #fff0f5 !important;
}

.quick-gen-btn:hover:not(:disabled) {
  background: #ffe4e1 !important;
  transform: translateY(-3px) rotate(1deg);
  box-shadow: 4px 4px 0 rgba(233, 30, 99, 0.25) !important;
}

.quick-gen-btn:disabled {
  background: #f5f5f5 !important;
  color: #aaa !important;
  border-color: #ccc !important;
  box-shadow: none !important;
  cursor: not-allowed;
}

.gen-status-box {
  margin-top: 15px;
  padding: 12px;
  border: 2px dashed #2c3e50;
  border-radius: 8px;
  background: #fafafa;
  font-size: 0.85em;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: inset 2px 2px 5px rgba(0,0,0,0.05);
}

.gen-status-box.done {
  border-color: #2ec4b6;
  background: #eefdfa;
  border-style: solid;
}

.gen-status-box.error {
  border-color: #e74c3c;
  background: #fdf2f0;
  border-style: solid;
}

.gen-status-header {
  font-weight: bold;
  color: #2c3e50;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gen-progress-bar {
  height: 12px;
  background: #e0e0e0;
  border: 2px solid #2c3e50;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
}

.gen-progress-fill {
  height: 100%;
  background: #ffeb3b;
  transition: width 0.4s ease;
  border-right: 2px solid #2c3e50;
}

.gen-status-box.done .gen-progress-fill {
  background: #2ec4b6;
}

.gen-status-box.error .gen-progress-fill {
  background: #e74c3c;
}
</style>
