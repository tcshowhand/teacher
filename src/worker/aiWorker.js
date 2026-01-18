// Worker implementation
self.onmessage = async (event) => {
    const { taskId, messages, userApiKey, model, API_URL } = event.data;

    // Simple validation
    if (!userApiKey) {
        self.postMessage({ taskId, isComplete: true, result: '请先配置 API Key' });
        return;
    }

    const requestData = {
        model,
        messages,
        stream: true,
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
        });

        if (response.status === 401) {
            self.postMessage({ taskId, isComplete: true, result: '认证失败，请检查 API Key 是否正确' });
            return;
        } else if (!response.ok) {
            const errText = await response.text();
            self.postMessage({ taskId, isComplete: true, result: `请求失败 (${response.status}): ${errText}` });
            return;
        }
        if (!response.body) {
            self.postMessage({ taskId, isComplete: true, result: '服务器未返回流数据' });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let currentText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonLine = line.slice(6).trim();
                    if (jsonLine === '[DONE]') {
                        self.postMessage({ taskId, isComplete: true, result: currentText });
                        return;
                    }
                    try {
                        const parsedLine = JSON.parse(jsonLine);
                        const deltaContent = parsedLine?.choices?.[0]?.delta?.content;
                        if (deltaContent) {
                            currentText += deltaContent;
                            self.postMessage({ taskId, isComplete: false, result: currentText });
                        }
                    } catch (err) {
                        // Ignore parse errors for partial chunks
                    }
                }
            }
        }
    } catch (error) {
        self.postMessage({ taskId, isComplete: true, result: `请求出错: ${error.message}` });
    }
};
