export const LESSON_PLAN_MODELS = [
    {
        id: 'anyou',
        name: '安幼学期结束',
        jsonTemplate: 'model/ay/1.json',
        docxTemplate: 'model/ay/10.docx'
    },
    {
        id: 'anyou2',
        name: '安幼学期开始',
        jsonTemplate: 'model/ay2/1.json',
        docxTemplate: 'model/ay2/10.docx'
    }
    // 示例：如何添加第二个模型
    // 1. 将 2.json 和 20.docx 放入 public/model/your_folder/ 目录
    // 2. 取消下方注释：
    // {
    //     id: 'model2',
    //     name: '第二个模型',
    //     jsonTemplate: 'model/your_folder/2.json',
    //     docxTemplate: 'model/your_folder/20.docx'
    // }
];

export const DEFAULT_MODEL_ID = 'anyou';
