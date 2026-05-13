package com.xg.business.dataimport.parse;

import com.xg.common.exception.BizException;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 把上传的 .xlsx / .xls / .csv 解析成一个二维字符串 grid。所有 cell 一律按文本输出
 * （日期/数字一并 formatter 化），导入逻辑后面再按目标字段类型解析 —— P0 不在解析层做类型推断。
 */
@Slf4j
@Component
public class ExcelGridParser {

    /** 一次最多接 5000 行，避免 JSONB 膨胀和内存峰值。 */
    public static final int MAX_ROWS = 5000;

    /** 解析结果：headers + 全部 rows。 */
    @Getter
    public static class Grid {
        private final List<String> headers;
        private final List<List<String>> rows;

        public Grid(List<String> headers, List<List<String>> rows) {
            this.headers = headers;
            this.rows = rows;
        }
    }

    public Grid parse(MultipartFile file) {
        String name = file.getOriginalFilename();
        if (name == null) {
            throw new BizException("IMPORT_FILE_INVALID", "文件名缺失");
        }
        String lower = name.toLowerCase();
        try (InputStream in = file.getInputStream()) {
            if (lower.endsWith(".csv")) {
                return parseCsv(in);
            }
            if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
                return parseExcel(in);
            }
            throw new BizException("IMPORT_FILE_INVALID", "只支持 .xlsx / .xls / .csv");
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Excel parse failed file={}", name, e);
            throw new BizException("IMPORT_FILE_PARSE_ERROR", "文件解析失败：" + e.getMessage());
        }
    }

    private Grid parseExcel(InputStream in) throws Exception {
        try (Workbook wb = WorkbookFactory.create(in)) {
            Sheet sheet = wb.getSheetAt(0);
            DataFormatter fmt = new DataFormatter();

            int firstRow = sheet.getFirstRowNum();
            int lastRow = sheet.getLastRowNum();
            if (firstRow > lastRow) {
                throw new BizException("IMPORT_FILE_EMPTY", "Excel 内容为空");
            }

            Row header = sheet.getRow(firstRow);
            if (header == null) {
                throw new BizException("IMPORT_FILE_EMPTY", "表头行为空");
            }
            int colCount = header.getLastCellNum();
            List<String> headers = new ArrayList<>(colCount);
            for (int c = 0; c < colCount; c++) {
                Cell cell = header.getCell(c);
                headers.add(cell == null ? "" : fmt.formatCellValue(cell).trim());
            }

            List<List<String>> rows = new ArrayList<>();
            for (int r = firstRow + 1; r <= lastRow && rows.size() < MAX_ROWS; r++) {
                Row row = sheet.getRow(r);
                if (row == null) continue;
                List<String> line = new ArrayList<>(colCount);
                boolean allBlank = true;
                for (int c = 0; c < colCount; c++) {
                    Cell cell = row.getCell(c);
                    String v = cell == null ? "" : fmt.formatCellValue(cell).trim();
                    if (!v.isEmpty()) allBlank = false;
                    line.add(v);
                }
                if (!allBlank) rows.add(line);
            }
            return new Grid(headers, rows);
        }
    }

    private Grid parseCsv(InputStream in) throws Exception {
        try (BufferedReader br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String headerLine = br.readLine();
            if (headerLine == null) {
                throw new BizException("IMPORT_FILE_EMPTY", "CSV 内容为空");
            }
            // 简化版 CSV：不处理"包裹的逗号"。教务表绝大多数都是 Excel；CSV 当兜底，必要时再升级。
            List<String> headers = splitCsv(stripBom(headerLine));
            List<List<String>> rows = new ArrayList<>();
            String line;
            while ((line = br.readLine()) != null && rows.size() < MAX_ROWS) {
                if (line.isBlank()) continue;
                rows.add(splitCsv(line));
            }
            return new Grid(headers, rows);
        }
    }

    private static String stripBom(String s) {
        return s.isEmpty() || s.charAt(0) != '﻿' ? s : s.substring(1);
    }

    private static List<String> splitCsv(String line) {
        String[] parts = line.split(",", -1);
        List<String> out = new ArrayList<>(parts.length);
        for (String p : parts) out.add(p.trim());
        return out;
    }
}
