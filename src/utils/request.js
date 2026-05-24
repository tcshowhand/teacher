import axios from 'axios'

const service = axios.create({
    baseURL: 'https://www.ytecn.com', 
    timeout: 10000
})

service.interceptors.request.use(
    config => {
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

service.interceptors.response.use(
    response => {
        const res = response.data
        return res
    },
    error => {
        console.error('err' + error)
        return Promise.reject(error)
    }
)

export default service
