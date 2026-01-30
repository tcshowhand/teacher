# 豫唐教师辅助教学平台：智能化教研效率工具

[![GitHub Stars](https://img.shields.io/github/stars/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/network/members)
[![GitHub Issues](https://img.shields.io/github/issues/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/issues)
[![GitHub Solved Issues](https://img.shields.io/github/issues-closed/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/issues?q=is%3Aissue+is%3Aclosed)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/tcshowhand/teacher)](https://github.com/tcshowhand/teacher/commits/main)

## 项目定位

豫唐教师辅助教学平台（Yutang Teacher Assistant Platform）是一款专为教育工作者打造的生产力工具。项目深度结合职业教育教学需求，通过 Vue 3 与现代 AI 技术栈，将传统繁琐的备课、出卷、课件制作流程转化为高度自动化的数字化工作流。

## 行业背景与核心价值

在数字化教学改革背景下，教师面临着教学内容更新快、教研压力大等挑战。本项目通过对智能化工作流的整合与结构化数据处理，实现了从教案构思到多格式文件（Word, PPT, PDF）输出的全链路闭环，旨在为职业教育及企业内训提供高性能的辅助方案。

## 在线体验

项目链接： [https://www.ytecn.com/teacher/](https://www.ytecn.com/teacher/)

## 核心功能与技术实现

### 1. 结构化教案生成系统 (AI Lesson Planning)

利用提示词工程（Prompt Engineering）引导 AI 生成符合教育逻辑的结构化内容：

- 深度覆盖：预设教学目标、学情分析、重难点突破及教学反思模块。
- 专业定制：内置针对教育场景优化的提示词模板，生成更加专业的教学内容。
- 文档引擎：基于 docx 与 docxtemplater 实现 Office Open XML 协议的无损导出。

### 2. 智能幻灯片生成模块 (Smart PPT Editor)

解决了从教学大纲到视觉演示的转换问题：

- 智能解析：利用大模型提取教学大纲关键信息，自动规划演示结构。
- 标准化导出：集成 pptxgenjs 库，支持生成标准 .pptx 文件，确保多端演示兼容性。

### 3. 专业测评构建引擎 (Exam Editor)

针对不同学科课程的评价需求，优化了题目管理逻辑：

- 全题型支持：涵盖选择题、判断题、代码填空及综合应用题。
- 高清排版：利用 jspdf 与 html2canvas 组合技术，支持生成高质量 PDF 试卷。

### 4. 智能化教学助手 (AI Assistant)

- 上下文感知：支持读取当前编辑的内容（如大纲或PPT），提供针对性的润色与建议。
- 灵活配置：支持用户自定义 API Key 及切换不同版本的模型（如 Qwen-Turbo/Plus）。

## 技术架构方案

| 维度     | 技术栈实现       | 说明                                          |
| :------- | :--------------- | :-------------------------------------------- |
| 核心框架 | Vue 3.x + Vite   | 确保高性能的响应式体验与极速构建              |
| 状态流转 | Pinia            | 实现教案与试卷数据在不同模块间的无缝共享      |
| 离线能力 | localforage      | 基于 IndexedDB 的本地持久化，保障教案数据安全 |
| 文档处理 | docx / pptxgenjs | 专业的 Office 文档底层协议处理方案            |

---

## 快速开始

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

## 许可证

本项目采用 MIT 许可证，欢迎教育同行进行二次开发与教学实践。

© 2025-2026 豫唐
