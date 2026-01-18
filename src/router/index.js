import { createRouter, createWebHistory } from 'vue-router'
import LessonPlanGenerator from '../views/LessonPlanGenerator.vue'
import ExamEditor from '../views/ExamEditor.vue'
import LessonPlanEditor from '../views/LessonPlanEditor.vue'

const routes = [
    {
        path: '/',
        name: 'Home',
        component: LessonPlanGenerator
    },
    {
        path: '/exam',
        name: 'ExamEditor',
        component: ExamEditor
    },
    {
        path: '/lesson-plan',
        name: 'LessonPlanEditor',
        component: LessonPlanEditor
    }
]

const router = createRouter({
    history: createWebHistory('/teacher/'),
    routes
})

export default router
