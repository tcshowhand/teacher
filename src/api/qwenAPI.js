import { computed } from "vue";
import { useSettingsStore } from "../store/settings";
import { WorkerPool } from "../worker/workerPool";

const settingsStore = useSettingsStore();
const API_URL = computed(() => settingsStore.aliApiUrl);
const userApiKey = computed(() => settingsStore.aliApiKey);
const model = computed(() => settingsStore.modelName);

const workerPool = new WorkerPool(2);

export async function sendToQwenAIDialogue(messages, onResponse) {
    workerPool.execute(messages, userApiKey.value, model.value, API_URL.value, onResponse);
}

// 阿里云百炼文生图异步接口
const IMAGE_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis';
const TASK_QUERY_URL = 'https://dashscope.aliyuncs.com/api/v1/tasks/';

/**
 * 生成单张图片，返回图片 URL
 * @param {string} prompt 图片描述
 * @param {(progress: string) => void} [onProgress] 进度回调
 * @returns {Promise<string>} 图片 URL
 */
export async function generateImage(prompt, onProgress) {
    const apiKey = settingsStore.aliApiKey;
    const imageModel = settingsStore.imageModelName || 'wanx2.1-t2i-turbo';

    if (!apiKey) {
        throw new Error('请先配置 API Key');
    }

    onProgress?.('提交生成任务...');
    const submitRes = await fetch(IMAGE_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'X-DashScope-Async': 'enable'
        },
        body: JSON.stringify({
            model: imageModel,
            input: { prompt },
            parameters: {
                size: '1280*720',
                n: 1
            }
        })
    });

    if (!submitRes.ok) {
        const errText = await submitRes.text();
        throw new Error(`提交图片任务失败 (${submitRes.status}): ${errText}`);
    }

    const submitData = await submitRes.json();
    const taskId = submitData?.output?.task_id;
    if (!taskId) {
        throw new Error('未获取到图片任务 ID');
    }

    // 轮询任务状态
    const maxAttempts = 120;
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        onProgress?.(`等待生成中... (${i + 1})`);

        const queryRes = await fetch(`${TASK_QUERY_URL}${taskId}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        if (!queryRes.ok) {
            const errText = await queryRes.text();
            throw new Error(`查询任务失败 (${queryRes.status}): ${errText}`);
        }

        const queryData = await queryRes.json();
        const status = queryData?.output?.task_status;

        if (status === 'SUCCEEDED') {
            const imageUrl = queryData?.output?.results?.[0]?.url;
            if (!imageUrl) throw new Error('图片生成成功但未获取到 URL');
            // 阿里云返回的 URL 是临时的会过期，转为 base64 data URL 持久化存储
            onProgress?.('下载图片并转为本地存储...');
            const dataUrl = await urlToBase64(imageUrl);
            return dataUrl;
        }
        if (status === 'FAILED') {
            const msg = queryData?.output?.message || '未知错误';
            throw new Error(`图片生成失败: ${msg}`);
        }
        // PENDING / RUNNING 继续轮询
    }

    throw new Error('图片生成超时');
}

/**
 * 把图片 URL 转成 base64 data URL
 * 阿里云 OSS 图片响应通常带 CORS 头，可直接 fetch
 */
async function urlToBase64(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`下载图片失败 (${res.status})`);
    }
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('图片转 base64 失败'));
        reader.readAsDataURL(blob);
    });
}
