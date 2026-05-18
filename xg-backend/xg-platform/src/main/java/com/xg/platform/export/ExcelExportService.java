package com.xg.platform.export;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFCellStyle;
import org.apache.poi.xssf.usermodel.XSSFFont;
import org.apache.poi.xssf.usermodel.XSSFRow;
import org.apache.poi.xssf.usermodel.XSSFSheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 平台级 Excel 导出工具（A4）。零业务耦合：调用方传"sheet 名 + 列头 + 行数据"，吐 xlsx bytes。
 *
 * <p>支持顶部摘要文本块：AI 写的"本月在岗 X 人，较上月 +Y%"等趋势文字会被插到表头上方一行 merged cell。
 * 失败 / 摘要为空时不写该行。摘要不计入数据区。
 *
 * <p>本类 stateless / thread-safe，无 DI 副作用。
 */
@Slf4j
@Service
public class ExcelExportService {

    private static final DateTimeFormatter DATETIME_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public byte[] toXlsx(String sheetName, List<String> headers, List<List<Object>> rows) {
        return toXlsx(sheetName, null, headers, rows);
    }

    /**
     * @param sheetName 表名，null/blank 时用 "Sheet1"
     * @param summary   表头上方的摘要文本（AI 生成的趋势描述），可为 null
     * @param headers   列头
     * @param rows      数据行；每行的 size 应与 headers 匹配，少了补空，多了截断
     */
    public byte[] toXlsx(String sheetName, String summary,
                         List<String> headers, List<List<Object>> rows) {
        if (headers == null || headers.isEmpty()) {
            throw new IllegalArgumentException("headers must not be empty");
        }
        try (XSSFWorkbook wb = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            XSSFSheet sheet = wb.createSheet(sheetName == null || sheetName.isBlank() ? "Sheet1" : sheetName);
            int dataStartRow = 0;
            if (summary != null && !summary.isBlank()) {
                XSSFRow summaryRow = sheet.createRow(0);
                XSSFCellStyle s = wb.createCellStyle();
                XSSFFont f = wb.createFont();
                f.setItalic(true);
                f.setFontHeightInPoints((short) 11);
                s.setFont(f);
                s.setVerticalAlignment(VerticalAlignment.CENTER);
                s.setWrapText(true);
                summaryRow.setHeightInPoints(36);
                summaryRow.createCell(0).setCellValue(summary);
                summaryRow.getCell(0).setCellStyle(s);
                if (headers.size() > 1) {
                    sheet.addMergedRegion(new CellRangeAddress(0, 0, 0, headers.size() - 1));
                }
                dataStartRow = 1;
            }

            CellStyle headerStyle = headerStyle(wb);
            XSSFRow headerRow = sheet.createRow(dataStartRow);
            for (int i = 0; i < headers.size(); i++) {
                headerRow.createCell(i).setCellValue(headers.get(i));
                headerRow.getCell(i).setCellStyle(headerStyle);
            }

            if (rows != null) {
                for (int r = 0; r < rows.size(); r++) {
                    XSSFRow row = sheet.createRow(dataStartRow + 1 + r);
                    List<Object> data = rows.get(r);
                    int cols = Math.min(headers.size(), data == null ? 0 : data.size());
                    for (int c = 0; c < cols; c++) {
                        Object v = data.get(c);
                        writeCell(row.createCell(c), v);
                    }
                }
            }

            // 简易列宽：按 header 长度 + 缓冲。Apache POI autoSizeColumn 在云端无字体时易抛
            // FontMetrics 错误，所以手动估算更稳。
            for (int i = 0; i < headers.size(); i++) {
                int width = Math.min(40, Math.max(12, headers.get(i).length() * 3));
                sheet.setColumnWidth(i, width * 256);
            }

            wb.write(out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new RuntimeException("Excel export failed: " + e.getMessage(), e);
        }
    }

    private void writeCell(org.apache.poi.ss.usermodel.Cell cell, Object v) {
        if (v == null) {
            cell.setCellValue("");
        } else if (v instanceof Number n) {
            cell.setCellValue(n.doubleValue());
        } else if (v instanceof BigDecimal bd) {
            cell.setCellValue(bd.doubleValue());
        } else if (v instanceof Boolean b) {
            cell.setCellValue(b ? "是" : "否");
        } else if (v instanceof OffsetDateTime odt) {
            cell.setCellValue(odt.toLocalDateTime().format(DATETIME_FMT));
        } else if (v instanceof LocalDate ld) {
            cell.setCellValue(ld.toString());
        } else {
            cell.setCellValue(v.toString());
        }
    }

    private CellStyle headerStyle(XSSFWorkbook wb) {
        XSSFCellStyle s = wb.createCellStyle();
        XSSFFont f = wb.createFont();
        f.setBold(true);
        s.setFont(f);
        s.setAlignment(HorizontalAlignment.CENTER);
        s.setVerticalAlignment(VerticalAlignment.CENTER);
        s.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        s.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return s;
    }
}
