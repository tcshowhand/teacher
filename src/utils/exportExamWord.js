import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  BorderStyle,
  ImageRun
} from "docx";
import { saveAs } from 'file-saver';

function cleanHtml(html) {
  if (!html) return "";
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/<\/?[^>]+(>|$)/g, "");
  return text.trim();
}

function base64ToUint8Array(base64String) {
  const parts = base64String.split(",");
  const base64 = parts.length > 1 ? parts[1] : parts[0];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function exportExamToWord(examData) {
  if (!examData) return;

  const children = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 200 },
      children: [
        new TextRun({
          text: examData.title || "新测试卷",
          bold: true,
          size: 36, 
          font: "Microsoft YaHei"
        })
      ]
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "姓名：__________________   学号：__________________   班级：__________________   得分：__________",
          size: 21, 
          font: "Microsoft YaHei"
        })
      ]
    })
  );

  if (examData.problems && examData.problems.length > 0) {
    const problemsCount = examData.problems.length;
    
    const scoreHeaderCells = [
      new TableCell({
        children: [new Paragraph({ text: "题号", alignment: AlignmentType.CENTER })],
        width: { size: 15, type: WidthType.PERCENTAGE }
      })
    ];

    const scoreDataCells = [
      new TableCell({
        children: [new Paragraph({ text: "得分", alignment: AlignmentType.CENTER })],
        width: { size: 15, type: WidthType.PERCENTAGE }
      })
    ];

    examData.problems.forEach((_, idx) => {
      scoreHeaderCells.push(
        new TableCell({
          children: [new Paragraph({ text: String(idx + 1), alignment: AlignmentType.CENTER })],
          width: { size: 60 / problemsCount, type: WidthType.PERCENTAGE }
        })
      );
      scoreDataCells.push(
        new TableCell({
          children: [new Paragraph({ text: " ", alignment: AlignmentType.CENTER })],
          width: { size: 60 / problemsCount, type: WidthType.PERCENTAGE }
        })
      );
    });

    scoreHeaderCells.push(
      new TableCell({
        children: [new Paragraph({ text: "总分", alignment: AlignmentType.CENTER })],
        width: { size: 12, type: WidthType.PERCENTAGE }
      }),
      new TableCell({
        children: [new Paragraph({ text: "阅卷人", alignment: AlignmentType.CENTER })],
        width: { size: 13, type: WidthType.PERCENTAGE }
      })
    );
    scoreDataCells.push(
      new TableCell({
        children: [new Paragraph({ text: " ", alignment: AlignmentType.CENTER })],
        width: { size: 12, type: WidthType.PERCENTAGE }
      }),
      new TableCell({
        children: [new Paragraph({ text: " ", alignment: AlignmentType.CENTER })],
        width: { size: 13, type: WidthType.PERCENTAGE }
      })
    );

    const scoreTable = new Table({
      rows: [
        new TableRow({ children: scoreHeaderCells }),
        new TableRow({ children: scoreDataCells })
      ],
      width: { size: 100, type: WidthType.PERCENTAGE }
    });

    children.push(scoreTable);
    
    children.push(new Paragraph({ spacing: { after: 300 } }));
  }

  if (examData.subTitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: `考试说明：${examData.subTitle}`,
            italic: true,
            size: 21,
            color: "666666",
            font: "Microsoft YaHei"
          })
        ]
      })
    );
  }

  if (examData.problems && examData.problems.length > 0) {
    for (let i = 0; i < examData.problems.length; i++) {
      const problem = examData.problems[i];


      children.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: `${problem.qNum || `Q${i + 1}.`} `,
              bold: true,
              size: 24,
              color: "2C3E50",
              font: "Microsoft YaHei"
            }),
            new TextRun({
              text: problem.title || "未命名题目",
              bold: true,
              size: 24,
              font: "Microsoft YaHei"
            })
          ]
        })
      );

      if (problem.tags) {
        children.push(
          new Paragraph({
            spacing: { after: 150 },
            children: [
              new TextRun({
                text: `🏷️ 考察知识点：[ ${problem.tags} ]`,
                italic: true,
                size: 18, 
                color: "7F8C8D",
                font: "Microsoft YaHei"
              })
            ]
          })
        );
      }

      if (problem.image && problem.image.startsWith("data:image")) {
        try {
          const imageBuffer = base64ToUint8Array(problem.image);
          children.push(
            new Paragraph({
              alignment: AlignmentType.LEFT,
              spacing: { after: 200 },
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 320,
                    height: 200
                  }
                })
              ]
            })
          );
        } catch (imgError) {
          console.error("Failed to render question image in Word export:", imgError);
        }
      }

      const cleanedDesc = cleanHtml(problem.desc);
      if (cleanedDesc) {
        const descLines = cleanedDesc.split("\n");
        descLines.forEach((line) => {
          children.push(
            new Paragraph({
              spacing: { after: 100 },
              indent: { left: 360 }, 
              children: [
                new TextRun({
                  text: line,
                  size: 22, 
                  font: "Microsoft YaHei"
                })
              ]
            })
          );
        });
      }

      if (problem.input || problem.output) {
        const ioChildren = [];
        
        if (problem.input) {
          ioChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: "【输入样例】", bold: true, size: 18, color: "16A085", font: "Microsoft YaHei" })
              ]
            }),
            new Paragraph({
              spacing: { after: 150 },
              children: [
                new TextRun({ text: problem.input, font: "Consolas", size: 18 })
              ]
            })
          );
        }

        if (problem.output) {
          ioChildren.push(
            new Paragraph({
              children: [
                new TextRun({ text: "【输出样例】", bold: true, size: 18, color: "D35400", font: "Microsoft YaHei" })
              ]
            }),
            new Paragraph({
              children: [
                new TextRun({ text: problem.output, font: "Consolas", size: 18 })
              ]
            })
          );
        }

        const ioTable = new Table({
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: "F9F9F9" },
                  margins: { top: 120, bottom: 120, left: 200, right: 200 },
                  borders: {
                    top: { style: BorderStyle.DASHED, size: 4, color: "BDC3C7" },
                    bottom: { style: BorderStyle.DASHED, size: 4, color: "BDC3C7" },
                    left: { style: BorderStyle.DASHED, size: 4, color: "BDC3C7" },
                    right: { style: BorderStyle.DASHED, size: 4, color: "BDC3C7" }
                  },
                  children: ioChildren
                })
              ]
            })
          ],
          width: { size: 85, type: WidthType.PERCENTAGE }
        });

        children.push(
          new Paragraph({
            spacing: { before: 100, after: 100 },
            indent: { left: 360 }
          })
        );
        children.push(ioTable);
      }

      children.push(new Paragraph({ spacing: { after: 300 } }));
    }
  }

  if (examData.footer) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 },
        children: [
          new TextRun({
            text: examData.footer,
            italic: true,
            size: 20,
            color: "7F8C8D",
            font: "Microsoft YaHei"
          })
        ]
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children
      }
    ]
  });

  Packer.toBlob(doc).then((blob) => {
    const now = new Date();
    const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const fileName = `${examData.title || "Exam"}_${timeStr}.docx`;
    saveAs(blob, fileName);
  }).catch((err) => {
    console.error("生成 Word 失败:", err);
    alert("导出 Word 失败，请检查数据格式！");
  });
}
