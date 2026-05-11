#!/usr/bin/env bash
# 朝夕系统介绍 PDF 生成脚本。markdown → standalone HTML → Chrome --print-to-pdf。
# 不依赖 LaTeX,中文走系统字体回退。
set -euo pipefail

DOC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MD="$DOC_DIR/朝夕系统介绍.md"
HTML="$DOC_DIR/朝夕系统介绍.html"
PDF="$DOC_DIR/朝夕系统介绍.pdf"
CSS="$DOC_DIR/print.css"

if [[ ! -f "$MD" ]]; then
  echo "ERROR: markdown source missing: $MD" >&2
  exit 1
fi

# 1. pandoc:markdown → standalone HTML,内嵌 print.css。
#    --metadata title= 关掉默认标题(我们自己用 .cover div)。
#    --section-divs 让每个章节包成 <section>,Chrome page-break 更稳。
pandoc "$MD" \
  -o "$HTML" \
  --standalone \
  --section-divs \
  --metadata title="" \
  --css "$(basename "$CSS")" \
  --resource-path "$DOC_DIR" \
  -f markdown+yaml_metadata_block+raw_html

# 2. Chrome 无头打印。--virtual-time-budget 等 mermaid / 其它 JS 加载完。
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -x "$CHROME" ]]; then
  echo "ERROR: Google Chrome not found at $CHROME" >&2
  exit 1
fi

"$CHROME" \
  --headless=new \
  --no-pdf-header-footer \
  --print-to-pdf="$PDF" \
  --virtual-time-budget=10000 \
  --no-sandbox \
  "file://$HTML" >/dev/null 2>&1

echo "OK"
echo "  HTML:  $HTML"
echo "  PDF:   $PDF"
