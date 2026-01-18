import { computed } from "vue";
import { useSettingsStore } from "../store/settings";
import { WorkerPool } from "../worker/workerPool";

const settingsStore = useSettingsStore();
const API_URL = computed(() => settingsStore.aliApiUrl);
const userApiKey = computed(() => settingsStore.aliApiKey);
const model = computed(() => settingsStore.modelName);

const workerPool = new WorkerPool(2); // Use 2 workers

export async function sendToQwenAIDialogue(messages, onResponse) {
    workerPool.execute(messages, userApiKey.value, model.value, API_URL.value, onResponse);
}
