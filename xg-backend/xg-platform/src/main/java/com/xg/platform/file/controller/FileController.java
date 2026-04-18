package com.xg.platform.file.controller;

import com.xg.common.base.R;
import com.xg.platform.file.model.FileMetadata;
import com.xg.platform.file.service.FileService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.InputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final FileService fileService;

    @PostMapping("/upload")
    public R<FileMetadata> upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("bizType") String bizType,
            @RequestParam("bizId") Long bizId,
            @RequestHeader("X-User-Id") Long uploaderId) {
        FileMetadata metadata = fileService.upload(file, uploaderId, bizType, bizId);
        return R.ok(metadata);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<InputStreamResource> download(@PathVariable Long id) {
        FileMetadata metadata = fileService.getById(id);
        InputStream stream = fileService.download(id);

        String encodedName = URLEncoder.encode(metadata.getOriginalName(), StandardCharsets.UTF_8)
                .replace("+", "%20");
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(
                        metadata.getContentType() != null ? metadata.getContentType() : MediaType.APPLICATION_OCTET_STREAM_VALUE))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedName)
                .header(HttpHeaders.CONTENT_LENGTH, String.valueOf(metadata.getFileSize()))
                .body(new InputStreamResource(stream));
    }

    @GetMapping("/{id}/url")
    public R<Map<String, String>> getPresignedUrl(
            @PathVariable Long id,
            @RequestParam(defaultValue = "30") int expiry) {
        String url = fileService.getPresignedUrl(id, expiry);
        return R.ok(Map.of("url", url));
    }

    @GetMapping
    public R<List<FileMetadata>> listByBiz(
            @RequestParam String bizType,
            @RequestParam Long bizId) {
        List<FileMetadata> files = fileService.listByBiz(bizType, bizId);
        return R.ok(files);
    }

    @DeleteMapping("/{id}")
    public R<Void> deleteFile(
            @PathVariable Long id,
            @RequestHeader("X-User-Id") Long operatorId) {
        fileService.deleteFile(id);
        return R.ok();
    }
}
