import request from '../utils/request'
import md5 from 'js-md5'

export function login(username, password) {
    const params = new URLSearchParams()
    params.append('username', username)
    params.append('password', md5(password))
    params.append('savedate', '30')

    return request({
        url: '/zb_system/api.php?mod=member&act=login',
        method: 'post',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: params
    })
}

// Get WeChat Scan QRCode
export function getWechatQrcode() {
    return request({
        url: '/zb_users/plugin/YtUser/login_official_api.php?act=get_qrcode',
        method: 'get'
    })
}

// Check WeChat Login Status
export function checkWechatLogin(sceneId) {
    return request({
        url: '/zb_users/plugin/YtUser/login_official_api.php?act=check_login',
        method: 'get',
        params: {
            scene_id: sceneId
        }
    })
}
