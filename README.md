# 豫唐教师辅助教学平台

基于 Vue 3 + Vite 开发的现代化教师辅助工具，旨在提升备课与教学效率。

[![GitHub Stars](https://img.shields.io/github/stars/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/issues)
[![GitHub Solved Issues](https://img.shields.io/github/issues-closed/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/issues?q=is%3Aissue+is%3Aclosed)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/commits/main)

## 在线体验

项目链接： [https://www.ytecn.com/teacher/](https://www.ytecn.com/teacher/)

## 🌟 核心功能

- **智能教案生成 (AI Lesson Planning)**
  - 基于 AI 快速生成结构化教案，涵盖教学目标、重难点、教学过程等完整环节。
  - 支持从幼儿园到研究生不同教育阶段的定制化生成，满足多样化教学需求。
  - 提供所见即所得的富文本编辑器，支持对生成内容的二次修改与优化。
  - **一键导出**：支持将教案一键导出为标准 Word (.docx) 格式，保留排版，方便打印与分享。

- **智能 PPT 生成/编辑器 (Smart PPT Editor)**
  - **AI 一键生成**：根据课程名称、章节和教学大纲，自动生成包含封面、大纲、内容页和演讲备注的完整 PPT 结构。
  - **PPTX 导出**：支持将制作好的课件导出为标准 PowerPoint (.pptx) 文件，直接用于课堂演示。

- **专业试卷编辑器 (Exam Editor)**
  - 提供直观的在线试卷编辑界面，支持多种题型的灵活创建与管理。
  - 实时预览试卷效果，所见即所得。
  - **PDF 导出**：支持将试卷生成并导出为高质量 PDF 文件，直接用于考试分发。

- **AI 智能助手 (AI Assistant)**
  - 内置强大的 AI 聊天功能，随时辅助解答教学过程中的疑难问题。
  - 支持对教学内容进行润色、扩充和优化，提升教学质量。
  - 根据教学上下文进行针对性互动，成为您的贴身教学顾问。

- **用户系统与服务 (User & Services)**
  - **个性化设置**：支持配置 AI 模型参数、API 密钥等，打造专属的教学辅助环境。
  - **数据持久化**：使用本地存储技术自动保存您的草稿与配置，防止数据丢失。

## 🛠 技术栈

- **前端框架**：Vue 3
- **构建工具**：Vite
- **状态管理**：Pinia
- **路由管理**：Vue Router
- **文档处理**：docx, docxtemplater, jspdf, html2canvas, pptxgenjs
- **存储与工具**：localforage, file-saver, axios

## 🚀 快速开始

### 1. 下载项目

```bash
git clone https://github.com/tcshowhand/teacher.git
cd teacher
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动开发服务器

```bash
npm run dev
```

### 4. 构建生产版本

```bash
npm run build
```

## 📂 目录结构

- `src/components`: 通用组件库
- `src/views`: 页面视图（教案生成、PPT编辑、试卷编辑等）
- `src/assets`: 静态资源
- `public`: 公共资源文件

---

© 2025-2026 豫唐
