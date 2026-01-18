<script setup>
import { onMounted } from 'vue'

const initWeChatShare = () => {
    // 在开发环境跳过请求，避免 "Unexpected token <" 错误
    if (import.meta.env.DEV) {
        console.log('开发环境：跳过微信分享配置请求');
        return;
    }

    // 使用 fetch 替代 jQuery.ajax
    fetch('/wxapi.php')
        .then(async response => {
            // 检查响应类型，确保是 JSON
            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new TypeError("Received non-JSON response from wxapi.php");
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                console.error('微信配置错误:', data.error);
                return;
            }

            if (window.wx) {
                window.wx.config({
                    debug: false,
                    appId: data.appId,
                    timestamp: data.timestamp,
                    nonceStr: data.nonceStr,
                    signature: data.signature,
                    jsApiList: data.jsApiList || ['onMenuShareTimeline', 'onMenuShareAppMessage'],
                    openTagList: ['wx-open-launch-weapp'] // 添加小程序跳转标签权限
                });

                window.wx.ready(() => {
                    const shareData = {
                        title: '豫唐实验室 - AI 智能教案生成器 - 手写试题生成系统',
                        desc: '一键生成标准教案与配套试题，支持手写体排版、自动题目生成，老师的备课神器！',
                        link: window.location.href.split('#')[0],
                        imgUrl: 'https://www.songyinuo.com/teacher/share.png', // 暂时保持原图片，如有新图请更换
                    };

                    // 分享到朋友圈
                    window.wx.onMenuShareTimeline({
                        ...shareData,
                        success: () => console.log('分享到朋友圈成功')
                    });

                    // 分享给朋友
                    window.wx.onMenuShareAppMessage({
                        ...shareData,
                        success: () => console.log('分享给朋友成功')
                    });
                });
            }
        })
        .catch(error => {
            console.error('获取微信配置失败:', error);
        });
}

onMounted(() => {
    initWeChatShare()
})
</script>

<template>
  <router-view></router-view>
</template>

<style>
/* Global Styles (if any) */
</style>
