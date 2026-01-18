export class WorkerPool {
    constructor(size = 4) {
        this.size = size;
        this.workers = [];
        this.queue = [];
        this.init();
    }

    init() {
        for (let i = 0; i < this.size; i++) {
            const worker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
            worker.onmessage = (event) => this.handleMessage(worker, event);
            this.workers.push({ worker, busy: false, currentTask: null });
        }
    }

    execute(messages, userApiKey, model, API_URL, onResponse) {
        const taskId = Date.now().toString();
        const task = { taskId, messages, userApiKey, model, API_URL, onResponse };

        const availableWorker = this.workers.find(w => !w.busy);
        if (availableWorker) {
            this.runTask(availableWorker, task);
        } else {
            this.queue.push(task);
        }
    }

    runTask(workerObj, task) {
        workerObj.busy = true;
        workerObj.currentTask = task;
        workerObj.worker.postMessage({
            taskId: task.taskId,
            messages: task.messages,
            userApiKey: task.userApiKey,
            model: task.model,
            API_URL: task.API_URL
        });
    }

    handleMessage(worker, event) {
        const { taskId, result, isComplete } = event.data;
        const workerObj = this.workers.find(w => w.worker === worker);

        if (workerObj && workerObj.currentTask && workerObj.currentTask.taskId === taskId) {
            if (workerObj.currentTask.onResponse) {
                workerObj.currentTask.onResponse(result, isComplete);
            }

            if (isComplete) {
                workerObj.busy = false;
                workerObj.currentTask = null;
                this.processQueue();
            }
        }
    }

    processQueue() {
        if (this.queue.length > 0) {
            const availableWorker = this.workers.find(w => !w.busy);
            if (availableWorker) {
                const task = this.queue.shift();
                this.runTask(availableWorker, task);
            }
        }
    }

    terminate() {
        this.workers.forEach(w => w.worker.terminate());
        this.workers = [];
        this.queue = [];
    }
}
