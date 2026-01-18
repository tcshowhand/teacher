import axios from 'axios'

const service = axios.create({
    baseURL: 'https://www.ytecn.com', // Z-Blog Site URL
    timeout: 10000
})

// Request interceptor
service.interceptors.request.use(
    config => {
        // You might add token here if your API needs it in header, 
        // but standard Z-Blog cookie auth usually handles it automatically 
        // if access-control-allow-credentials is true.
        // For API-based token auth:
        const token = localStorage.getItem('zb_token')
        if (token) {
            config.headers['Authorization'] = 'Bearer ' + token
        }
        return config
    },
    error => {
        return Promise.reject(error)
    }
)

// Response interceptor
service.interceptors.response.use(
    response => {
        const res = response.data
        // Adjust this based on actual Z-Blog API response structure
        // Standard ZBP API usually returns { code: 0, data: ..., message: ... }
        // If using a custom plugin, structure might vary.
        return res
    },
    error => {
        console.error('err' + error)
        return Promise.reject(error)
    }
)

export default service
