<script setup>
import { ref, nextTick, watch } from 'vue'
import { sendToQwenAIDialogue } from '../api/qwenAPI'
import { marked } from 'marked'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  currentContent: {
    type: [Object, Array],
    required: true
  },
  systemContext: {
    type: String,
    default: '您是一个专业的教案编写助手。'
  }
})

const emit = defineEmits(['update:modelValue', 'update-content'])

const inputMessage = ref('')
const isLoading = ref(false)
const messages = ref([
  {
    role: 'assistant',
    content: '你好！我是您的智能助手。请告诉我您想如何调整当前内容？'
  }
])
const chatContainer = ref(null)

// Auto-scroll to bottom
const scrollToBottom = async () => {
  await nextTick()
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight
  }
}

watch(messages, scrollToBottom, { deep: true })
watch(() => props.modelValue, (val) => {
  if (val) scrollToBottom()
})

const close = () => {
  emit('update:modelValue', false)
}

const sendMessage = async () => {
  if (!inputMessage.value.trim() || isLoading.value) return

  const userMsg = inputMessage.value
  messages.value.push({ role: 'user', content: userMsg })
  inputMessage.value = ''
  isLoading.value = true

  // Determine expected type
  const isArray = Array.isArray(props.currentContent)
  const expectedFormat = isArray ? 'JSON 数组 ([...])' : 'JSON 对象 ({...})'

  // Construct System Prompt
  const prompt = `${props.systemContext}
当前内容的 JSON 数据如下：
${JSON.stringify(props.currentContent)}

用户的指令是：${userMsg}

请根据用户的指令修改上述内容。
如果需要修改，请按照以下格式回复：
1. 先回复一句简短的确认。
2. 然后在新的行中，使用 markdown 代码块输出完整的、合法的 JSON 数据。
**重要：请务必返回一个标准的 ${expectedFormat}，不要改变最外层的数据结构类型。**

格式示例：
好的，我已为您增加了章节。
\`\`\`json
{ "key": "value" }
\`\`\`

如果用户的指令不是修改内容，请正常回答，不要包含 JSON。
`

  // Send to AI
  const conversation = [
    { role: 'user', content: prompt }
  ]

  let fullResponse = ''
  
  // Placeholder for streaming
  const assistantMsgIndex = messages.value.push({
    role: 'assistant',
    content: '...'
  }) - 1

  await sendToQwenAIDialogue(conversation, (text, isComplete) => {
    fullResponse = text
    
    if (isComplete) {
      isLoading.value = false
      
      // 1. Try to extract JSON code block (more robust regex)
      // Matches ```json OR ``` followed by content and ```
      const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i
      const match = fullResponse.match(jsonBlockRegex)
      
      let jsonContent = null
      let displayText = fullResponse

      const parseAndSet = (jsonStr) => {
          try {
              // Simple comment stripper: remove lines starting with whitespace+//
              const cleanStr = jsonStr.replace(/^\s*\/\/.*$/gm, '')
              return JSON.parse(cleanStr)
          } catch (e) {
              console.error('JSON parse error', e)
              return null
          }
      }

      if (match) {
        // Found JSON block
        jsonContent = parseAndSet(match[1])
        if (jsonContent) {
           displayText = fullResponse.replace(match[0], '').trim()
           if (!displayText) displayText = '好的，已根据您的要求完成调整。'
        } else {
           displayText += '\n\n(❌ 自动更新失败：AI 返回的格式不正确)'
        }
      } else {
        // Fallback: Try to find standalone JSON object
        const firstBrace = fullResponse.indexOf('{')
        const lastBrace = fullResponse.lastIndexOf('}')
        if (firstBrace >= 0 && lastBrace > firstBrace) {
             const potentialJson = fullResponse.substring(firstBrace, lastBrace + 1)
             jsonContent = parseAndSet(potentialJson)
             if (jsonContent) {
                displayText = fullResponse.substring(0, firstBrace).trim()
                if (!displayText) displayText = '好的，已为您调整。'
             }
        }
      }

      // Update Chat UI
      messages.value[assistantMsgIndex].content = displayText

      // Apply Update
      if (jsonContent) {
        emit('update-content', jsonContent)
      }

    } else {
       // Streaming updates
       if (fullResponse.includes('```')) {
          const preText = fullResponse.split('```')[0].trim()
          messages.value[assistantMsgIndex].content = preText + '\n(正在生成数据...)'
       } else {
          messages.value[assistantMsgIndex].content = fullResponse
       }
    }
  })
}

// Render markdown safely
const renderMarkdown = (text) => {
  return marked.parse(text || '')
}
</script>

<template>
  <div class="chat-overlay" v-if="modelValue">
    <div class="chat-window">
      <div class="chat-header">
        <h3>🤖 教案助手</h3>
        <button class="close-btn" @click="close">×</button>
      </div>
      
      <div class="chat-messages" ref="chatContainer">
        <div 
          v-for="(msg, index) in messages" 
          :key="index" 
          class="message"
          :class="msg.role"
        >
          <div class="avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="bubble" v-html="renderMarkdown(msg.content)"></div>
        </div>
      </div>
      
      <div class="chat-input-area">
        <textarea 
          v-model="inputMessage" 
          placeholder="输入修改指令..." 
          @keydown.enter.prevent="sendMessage"
        ></textarea>
        <button @click="sendMessage" :disabled="isLoading">
          {{ isLoading ? '...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-overlay {
  position: fixed;
  bottom: 80px; /* Above the FAB */
  right: 20px;
  width: 350px;
  height: 500px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0,0,0,0.2);
  z-index: 1000;
  border: 2px solid #2c3e50;
  font-family: 'Architects Daughter', cursive, sans-serif;
  animation: slideUp 0.3s ease-out;
}

.chat-window {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}


@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.chat-header {
  padding: 10px 15px;
  background: #2c3e50;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chat-header h3 {
  margin: 0;
  font-size: 1.1em;
}

.close-btn {
  background: transparent;
  border: none;
  color: white;
  font-size: 1.5em;
  cursor: pointer;
  line-height: 1;
}

.chat-messages {
  flex: 1;
  padding: 15px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
  background: #fdfbf7;
}

.message {
  display: flex;
  gap: 10px;
  max-width: 90%;
}

.message.user {
  flex-direction: row-reverse;
  align-self: flex-end;
}

.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #ddd;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2em;
  flex-shrink: 0;
  border: 1px solid #999;
}

.message.assistant .avatar {
  background: #e1f5fe;
  border-color: #4fc3f7;
}

.message.user .avatar {
  background: #fff9c4;
  border-color: #fbc02d;
}

.bubble {
  background: white;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #ccc;
  font-size: 0.95em;
  line-height: 1.4;
  word-wrap: break-word;
  box-shadow: 2px 2px 0 rgba(0,0,0,0.05);
}

.message.user .bubble {
  background: #e8f5e9;
  border-color: #a5d6a7;
  border-top-right-radius: 2px;
}

.message.assistant .bubble {
  background: #fff;
  border-top-left-radius: 2px;
}

.chat-input-area {
  padding: 10px;
  border-top: 1px solid #eee;
  display: flex;
  gap: 10px;
  background: #fff;
}

textarea {
  flex: 1;
  resize: none;
  height: 40px;
  padding: 8px;
  border: 2px solid #ddd;
  border-radius: 8px;
  font-family: inherit;
  outline: none;
}

textarea:focus {
  border-color: #2c3e50;
}

button {
  padding: 0 15px;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: bold;
  font-family: inherit;
}

button:disabled {
  background: #ccc;
  cursor: wait;
}

/* Markdown Styles inside bubble */
.bubble :deep(p) { margin: 0 0 5px 0; }
.bubble :deep(p:last-child) { margin-bottom: 0; }
.bubble :deep(ul), .bubble :deep(ol) { margin: 5px 0; padding-left: 20px; }
</style>
