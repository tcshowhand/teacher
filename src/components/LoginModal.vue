<script setup>
import { ref, onUnmounted } from 'vue'
import { useUserStore } from '../store/user'
import { getWechatQrcode, checkWechatLogin } from '../api/auth'

const userStore = useUserStore()
const emit = defineEmits(['close'])

const loginMode = ref('account') // 'account' or 'wechat'
const username = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMessage = ref('')
const qrcodeUrl = ref('')
const sceneId = ref('')
let pollTimer = null

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const success = await userStore.login(username.value, password.value)
    if (success) {
      emit('close')
    } else {
      errorMessage.value = '登录失败，请检查用户名或密码'
    }
  } catch (error) {
    errorMessage.value = '登录请求失败：' + (error.message || '未知错误')
  } finally {
    isLoading.value = false
  }
}

const switchMode = (mode) => {
    loginMode.value = mode
    errorMessage.value = ''
    if (mode === 'wechat') {
        loadQrcode()
    } else {
        stopPolling()
    }
}

const loadQrcode = async () => {
    stopPolling()
    errorMessage.value = ''
    qrcodeUrl.value = ''
    isLoading.value = true
    
    try {
        const res = await getWechatQrcode()
        if (res.status === 1 && res.qrcode_url) {
            qrcodeUrl.value = res.qrcode_url
            sceneId.value = res.scene_id
            startPolling()
        } else {
            errorMessage.value = res.msg || '获取二维码失败'
        }
    } catch (e) {
        errorMessage.value = '请求二维码失败'
    } finally {
        isLoading.value = false
    }
}

const startPolling = () => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
        if (!sceneId.value) return
        try {
            const res = await checkWechatLogin(sceneId.value)
            if (res.status === 1) {
                // Login Success
                if (res.data && res.data.token) {
                    userStore.token = res.data.token
                    userStore.userInfo = res.data.user
                    userStore.isLoggedIn = true
                    localStorage.setItem('zb_token', res.data.token)
                    localStorage.setItem('zb_user_info', JSON.stringify(res.data.user))
                    
                    stopPolling()
                    emit('close')
                }
            }
        } catch (e) {
            console.error(e)
        }
    }, 2000)
}

const stopPolling = () => {
    if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
    }
}

const handleClose = () => {
  stopPolling()
  emit('close')
}

onUnmounted(() => {
    stopPolling()
})
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-content login-modal">
      <h3>🔐 用户登录</h3>
      
      <div class="login-tabs">
          <div class="tab-item" :class="{ active: loginMode === 'account' }" @click="switchMode('account')">账号登录</div>
          <div class="tab-item" :class="{ active: loginMode === 'wechat' }" @click="switchMode('wechat')">微信扫码</div>
      </div>

      <div v-if="errorMessage" class="error-msg">
        {{ errorMessage }}
      </div>

      <!-- Account Login Form -->
      <div v-if="loginMode === 'account'">
          <div class="form-group">
            <label>用户名</label>
            <input 
                v-model="username" 
                class="modal-input" 
                placeholder="请输入用户名"
                @keyup.enter="handleLogin"
            />
          </div>

          <div class="form-group">
            <label>密码</label>
            <input 
                type="password"
                v-model="password" 
                class="modal-input" 
                placeholder="请输入密码"
                @keyup.enter="handleLogin"
            />
          </div>

          <div class="modal-actions">
            <button class="modal-btn cancel" @click="handleClose">取消</button>
            <button class="modal-btn confirm" @click="handleLogin" :disabled="isLoading">
              {{ isLoading ? '登录中...' : '登录' }}
            </button>
          </div>
      </div>
      
      <!-- WeChat Scan Form -->
      <div v-if="loginMode === 'wechat'" class="wechat-login-container">
          <div v-if="isLoading && !qrcodeUrl" class="loading-tips">正在获取二维码...</div>
          <img v-if="qrcodeUrl" :src="qrcodeUrl" class="qrcode-img" />
          <p class="scan-tips">请使用微信扫一扫，关注公众号登录</p>
          <p class="scan-subtips" v-if="qrcodeUrl">关注后系统将自动跳转</p>
          
          <div class="modal-actions">
            <button class="modal-btn cancel" @click="handleClose">取消</button>
          </div>
      </div>
    
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  backdrop-filter: blur(3px);
}

.login-modal {
  width: 90%;
  max-width: 400px;
  background: #fdfbf7;
  padding: 30px;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  border: 3px solid #2c3e50;
  box-shadow: 10px 10px 0 rgba(0,0,0,0.2);
  font-family: 'Architects Daughter', cursive, sans-serif;
  text-align: left;
}

h3 {
  text-align: center;
  font-size: 1.8em;
  margin-bottom: 25px;
  border-bottom: 2px dashed #ccc;
  padding-bottom: 10px;
}

.login-tabs {
    display: flex;
    margin-bottom: 20px;
    border-bottom: 2px solid #ddd;
}

.tab-item {
    flex: 1;
    text-align: center;
    padding: 10px;
    cursor: pointer;
    font-weight: bold;
    color: #999;
}

.tab-item.active {
    color: #2c3e50;
    border-bottom: 3px solid #2c3e50;
    margin-bottom: -2px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 1.1em;
  color: #2c3e50;
}

.modal-input {
  width: 100%;
  padding: 12px;
  box-sizing: border-box; 
  font-size: 1em;
  border: 2px solid #2c3e50;
  border-radius: 10px;
  outline: none;
  font-family: inherit;
  background: rgba(255,255,255,0.8);
}

.error-msg {
    color: #e74c3c;
    background: #fadbd8;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    text-align: center;
    border: 1px dashed #e74c3c;
}

.modal-actions {
  text-align: center;
  margin-top: 30px;
  display: flex;
  justify-content: center;
  gap: 20px;
}

.modal-btn {
  padding: 10px 30px;
  border: 2px solid #2c3e50;
  background: transparent;
  font-family: inherit;
  font-size: 1.2em;
  cursor: pointer;
  border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px;
  transition: transform 0.1s;
}

.modal-btn.confirm {
  background: #27ae60;
  color: white;
  border-color: #27ae60;
}

.modal-btn.cancel {
  background: #e0e0e0;
  color: #333;
  border-color: #999;
}

.modal-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.modal-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
}

.tips-footer {
    text-align: center;
    color: #999;
    font-size: 0.8em;
    margin-top: 20px;
}

.wechat-login-container {
    text-align: center;
    padding: 20px 0;
}

.qrcode-img {
    width: 200px;
    height: 200px;
    border: 1px solid #ddd;
    padding: 5px;
    background: white;
}

.scan-tips {
    font-size: 1.1em;
    font-weight: bold;
    margin-top: 10px;
}
.scan-subtips {
    font-size: 0.9em;
    color: #666;
}
</style>
