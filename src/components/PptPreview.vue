<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const props = defineProps({
  slides: {
    type: Array,
    required: true,
    default: () => []
  },
  modelValue: {
    type: Number,
    default: 0
  },
  pptTitle: {
    type: String,
    default: '演示文稿'
  },
  pptSubtitle: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue'])

const isFullscreen = ref(false)

const prevSlide = () => {
  if (props.modelValue > 0) {
    emit('update:modelValue', props.modelValue - 1)
  }
}

const nextSlide = () => {
  if (props.modelValue < props.slides.length - 1) {
    emit('update:modelValue', props.modelValue + 1)
  }
}

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

// 键盘左右方向键监听翻页
const handleKeyDown = (e) => {
  if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
    nextSlide()
    e.preventDefault()
  } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
    prevSlide()
    e.preventDefault()
  } else if (e.key === 'Escape' && isFullscreen.value) {
    isFullscreen.value = false
    e.preventDefault()
  }
}

watch(isFullscreen, (newVal) => {
  if (newVal) {
    window.addEventListener('keydown', handleKeyDown)
  } else {
    window.removeEventListener('keydown', handleKeyDown)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div class="ppt-preview-container" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- 全屏模式下的深色遮罩头部 -->
    <div class="fullscreen-header" v-if="isFullscreen">
      <span class="fs-title">📺 幻灯片放映预览 - {{ pptTitle }}</span>
      <span class="fs-info">提示：使用键盘 ← / → 方向键或空格键翻页，Esc 退出</span>
      <button class="exit-fs-btn" @click="isFullscreen = false">退出放映 ×</button>
    </div>

    <!-- 16:9 幻灯片本体卡片 -->
    <div class="slide-aspect-card">
      <div class="slide-body" v-if="slides && slides.length > 0 && slides[modelValue]">
        <div class="slide-inner">
          <!-- 布局 1: 封面或标题页 (Cover / Title) -->
          <div 
            v-if="slides[modelValue].layout === 'Title' || slides[modelValue].layout === 'Cover' || modelValue === 0"
            class="layout-cover"
          >
            <h1 class="cover-main-title">{{ slides[modelValue].title || pptTitle }}</h1>
            <div class="cover-divider"></div>
            <p class="cover-subtitle" v-if="slides[modelValue].subtitle || pptSubtitle">
              {{ slides[modelValue].subtitle || pptSubtitle }}
            </p>
            <span class="cover-badge">PRESENTATION</span>
          </div>

          <!-- 布局 2: 经典内容页 (Content / Default) -->
          <div v-else class="layout-content">
            <h2 class="slide-title">{{ slides[modelValue].title }}</h2>
            <div class="content-body">
              <!-- 列表内容点渲染 -->
              <ul class="points-list" v-if="Array.isArray(slides[modelValue].content)">
                <li v-for="(line, idx) in slides[modelValue].content" :key="idx" class="point-item">
                  <span class="point-marker">✏️</span>
                  <span class="point-text">{{ line }}</span>
                </li>
              </ul>
              <p class="content-text-only" v-else-if="slides[modelValue].content">
                {{ slides[modelValue].content }}
              </p>
              <div class="empty-slide-content" v-else>
                (暂无内容，请在下方编辑器中填写)
              </div>
            </div>
            
            <!-- 备注提醒栏 (仅非全屏下优雅展示，全屏下作为小文字点缀) -->
            <div class="slide-bottom-bar">
              <span class="page-footer-tag">豫唐智能备课平台</span>
              <span class="slide-page-num">{{ modelValue + 1 }} / {{ slides.length }}</span>
            </div>
          </div>
        </div>
      </div>
      <div class="slide-body empty" v-else>
        <div class="empty-state">
          <p>💡 暂无幻灯片数据，请先在下方点击 “AI 一键生成 PPT” 吧！</p>
        </div>
      </div>
    </div>

    <!-- 底部控制器 (非全屏下展示) -->
    <div class="preview-controls" v-if="slides && slides.length > 0">
      <button class="ctrl-btn text-btn" @click="prevSlide" :disabled="modelValue === 0">
        上一步 (←)
      </button>
      
      <div class="indicator-group">
        <span class="indicator-text">
          第 <b>{{ modelValue + 1 }}</b> / {{ slides.length }} 页
        </span>
        <div class="indicator-dots">
          <span 
            v-for="(s, idx) in slides" 
            :key="idx" 
            class="dot"
            :class="{ active: idx === modelValue }"
            @click="emit('update:modelValue', idx)"
          ></span>
        </div>
      </div>

      <div class="action-btn-group">
        <button class="ctrl-btn text-btn" @click="nextSlide" :disabled="modelValue === slides.length - 1">
          下一步 (→)
        </button>
        <button class="ctrl-btn play-btn" @click="toggleFullscreen" title="全屏播放预览">
          📺 开始放映
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 整个容器样式 */
.ppt-preview-container {
  width: 100%;
  max-width: 900px;
  margin: 0 auto 30px auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 16:9 响应式比例卡片样式 - 标志性手绘 Neo-brutalism 风格 */
.slide-aspect-card {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #fdfbf7;
  border: 4px solid #2c3e50;
  border-radius: 4px;
  box-shadow: 8px 8px 0 #2c3e50;
  overflow: hidden;
  position: relative;
  transition: transform 0.2s, box-shadow 0.2s;
}

.slide-body {
  width: 100%;
  height: 100%;
  padding: 5%;
  box-sizing: border-box;
  background-image: 
    linear-gradient(#f4ebd040 1px, transparent 1px),
    linear-gradient(90deg, #f4ebd040 1px, transparent 1px);
  background-size: 15px 15px;
}

.slide-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.slide-body.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7f8c8d;
}

.empty-state {
  font-size: 1.2em;
  font-weight: bold;
}

/* 布局一：封面大字报效果 */
.layout-cover {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.cover-main-title {
  font-size: 3.2em;
  font-weight: 900;
  color: #2c3e50;
  margin: 0;
  text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.08);
  line-height: 1.2;
}

.cover-divider {
  width: 120px;
  height: 6px;
  background: #2c3e50;
  margin: 20px 0;
  border-radius: 3px;
}

.cover-subtitle {
  font-size: 1.5em;
  font-weight: bold;
  color: #5d6d7e;
  margin: 0;
}

.cover-badge {
  position: absolute;
  top: 0;
  left: 0;
  background: #2c3e50;
  color: #fdfbf7;
  padding: 3px 10px;
  font-size: 0.8em;
  font-weight: bold;
  transform: rotate(-3deg);
  border: 2px solid #2c3e50;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.15);
}

/* 布局二：正文页排版 */
.layout-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.slide-title {
  font-size: 2.2em;
  font-weight: 800;
  margin: 0 0 20px 0;
  color: #2c3e50;
  border-bottom: 3px solid #2c3e50;
  padding-bottom: 8px;
  text-align: left;
}

.content-body {
  flex: 1;
  text-align: left;
  overflow-y: auto;
  padding-right: 10px;
}

.points-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.point-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.point-marker {
  font-size: 1.2em;
  line-height: 1.2;
}

.point-text {
  font-size: 1.3em;
  color: #34495e;
  font-weight: bold;
  line-height: 1.4;
}

.content-text-only {
  font-size: 1.3em;
  color: #34495e;
  font-weight: bold;
  line-height: 1.6;
}

.empty-slide-content {
  color: #95a5a6;
  font-style: italic;
}

/* 底部状态条 */
.slide-bottom-bar {
  display: flex;
  justify-content: space-between;
  border-top: 2px dashed #bdc3c7;
  padding-top: 8px;
  margin-top: 10px;
  font-size: 0.9em;
  font-weight: bold;
  color: #7f8c8d;
}

/* 预览控制器控制栏 */
.preview-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  border: 3px solid #2c3e50;
  padding: 12px 20px;
  border-radius: 4px;
  box-shadow: 4px 4px 0 #2c3e50;
}

.ctrl-btn {
  background: white;
  border: 2px solid #2c3e50;
  font-family: inherit;
  font-weight: bold;
  cursor: pointer;
  box-shadow: 2px 2px 0 #2c3e50;
  transition: transform 0.1s, box-shadow 0.1s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ctrl-btn:hover:not(:disabled) {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 #2c3e50;
}

.ctrl-btn:active:not(:disabled) {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 #2c3e50;
}

.ctrl-btn:disabled {
  border-color: #bdc3c7;
  color: #bdc3c7;
  box-shadow: none;
  cursor: not-allowed;
}

.text-btn {
  padding: 6px 16px;
  font-size: 1em;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
}

.play-btn {
  background: #e8f8f5;
  color: #16a085;
  border-color: #1abc9c;
  padding: 6px 16px;
  font-size: 1em;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  box-shadow: 2px 2px 0 #1abc9c;
}
.play-btn:hover {
  background: #d1f2eb;
}

.action-btn-group {
  display: flex;
  gap: 10px;
}

/* 页数与指示点组合 */
.indicator-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.indicator-text {
  font-size: 0.95em;
  font-weight: bold;
  color: #2c3e50;
}

.indicator-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 8px;
  height: 8px;
  border: 1.5px solid #2c3e50;
  border-radius: 50%;
  background: white;
  cursor: pointer;
  transition: background 0.2s;
}

.dot.active {
  background: #2c3e50;
}

/* 全屏模式下的深度遮罩 */
.is-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  max-width: 100vw !important;
  margin: 0 !important;
  background: #1a1a1a;
  z-index: 5000;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  padding: 20px 40px 40px 40px;
}

.is-fullscreen .slide-aspect-card {
  width: auto;
  height: calc(100vh - 120px);
  aspect-ratio: 16 / 9;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
  border-color: #333;
}

.fullscreen-header {
  width: 100%;
  max-width: calc((100vh - 120px) * 1.777);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  color: #bbb;
  font-family: Arial, sans-serif;
}

.fs-title {
  font-size: 1.2em;
  font-weight: bold;
  color: #fdfbf7;
  font-family: inherit;
}

.fs-info {
  font-size: 0.9em;
  color: #888;
}

.exit-fs-btn {
  background: transparent;
  border: 2px solid #e74c3c;
  color: #e74c3c;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.2s;
}

.exit-fs-btn:hover {
  background: #e74c3c;
  color: white;
}
</style>
