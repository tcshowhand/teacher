import { defineStore } from 'pinia'
import { login } from '../api/auth'

export const useUserStore = defineStore('user', {
    state: () => ({
        token: localStorage.getItem('zb_token') || '',
        userInfo: JSON.parse(localStorage.getItem('zb_user_info') || '{}'),
        isLoggedIn: !!localStorage.getItem('zb_token')
    }),

    actions: {
        async login(username, password) {
            try {
                const data = await login(username, password)
                // Adjust these field names based on actual API response
                // Assuming API returns { data: { token: '...', user: { ... } } }
                if (data && data.data && data.data.token) {
                    this.token = data.data.token
                    this.userInfo = data.data.user
                    this.isLoggedIn = true

                    localStorage.setItem('zb_token', this.token)
                    localStorage.setItem('zb_user_info', JSON.stringify(this.userInfo))
                    return true
                } else {
                    console.error('Invalid login response:', data)
                    return false
                }
            } catch (error) {
                throw error
            }
        },

        logout() {
            this.token = ''
            this.userInfo = {}
            this.isLoggedIn = false
            localStorage.removeItem('zb_token')
            localStorage.removeItem('zb_user_info')
        }
    }
})
