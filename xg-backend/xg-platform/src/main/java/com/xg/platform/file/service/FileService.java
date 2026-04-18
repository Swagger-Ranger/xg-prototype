package com.xg.platform.file.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.xg.common.exception.BizException;
import com.xg.common.tenant.TenantContext;
import com.xg.platform.file.config.MinioConfig;
import com.xg.platform.file.mapper.FileMetadataMapper;
import com.xg.platform.file.model.FileMetadata;
import io.minio.*;
import io.minio.http.Method;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileService {

    private final MinioClient minioClient;
    private final MinioConfig minioConfig;
    private final FileMetadataMapper fileMetadataMapper;

    private volatile boolean bucketReady = false;

    public FileMetadata upload(MultipartFile file, Long uploaderId, String bizType, Long bizId) {
        ensureBucket();

        String originalName = file.getOriginalFilename();
        String extension = "";
        if (originalName != null && originalName.contains(".")) {
            extension = originalName.substring(originalName.lastIndexOf('.'));
        }
        String storedName = UUID.randomUUID() + extension;

        String tenantId = TenantContext.getRequiredTenantId();
        String yearMonth = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        String objectKey = tenantId + "/" + bizType + "/" + yearMonth + "/" + storedName;

        byte[] bytes;
        String md5Hash;
        try {
            bytes = file.getBytes();
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(bytes);
            md5Hash = HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new BizException("FILE_READ_ERROR", "读取文件失败: " + e.getMessage());
        }

        try {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(minioConfig.getBucket())
                    .object(objectKey)
                    .stream(new ByteArrayInputStream(bytes), bytes.length, -1)
                    .contentType(file.getContentType())
                    .build());
        } catch (Exception e) {
            log.error("MinIO upload failed: {}", e.getMessage(), e);
            throw new BizException("FILE_UPLOAD_ERROR", "文件上传失败: " + e.getMessage());
        }

        FileMetadata metadata = new FileMetadata();
        metadata.setTenantId(tenantId);
        metadata.setOriginalName(originalName);
        metadata.setStoredName(storedName);
        metadata.setBucket(minioConfig.getBucket());
        metadata.setObjectKey(objectKey);
        metadata.setContentType(file.getContentType());
        metadata.setFileSize(file.getSize());
        metadata.setMd5Hash(md5Hash);
        metadata.setUploaderId(uploaderId);
        metadata.setBizType(bizType);
        metadata.setBizId(bizId);
        metadata.setStatus("active");
        metadata.setCreatedAt(OffsetDateTime.now());
        fileMetadataMapper.insert(metadata);

        return metadata;
    }

    public InputStream download(Long fileId) {
        FileMetadata metadata = requireActive(fileId);
        try {
            return minioClient.getObject(GetObjectArgs.builder()
                    .bucket(metadata.getBucket())
                    .object(metadata.getObjectKey())
                    .build());
        } catch (Exception e) {
            log.error("MinIO download failed for fileId={}: {}", fileId, e.getMessage(), e);
            throw new BizException("FILE_DOWNLOAD_ERROR", "文件下载失败: " + e.getMessage());
        }
    }

    public String getPresignedUrl(Long fileId, int expiryMinutes) {
        FileMetadata metadata = requireActive(fileId);
        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                    .bucket(metadata.getBucket())
                    .object(metadata.getObjectKey())
                    .method(Method.GET)
                    .expiry(expiryMinutes, TimeUnit.MINUTES)
                    .build());
        } catch (Exception e) {
            log.error("MinIO presign failed for fileId={}: {}", fileId, e.getMessage(), e);
            throw new BizException("FILE_PRESIGN_ERROR", "生成预签名URL失败: " + e.getMessage());
        }
    }

    public void deleteFile(Long fileId) {
        FileMetadata metadata = requireActive(fileId);
        metadata.setStatus("deleted");
        metadata.setDeletedAt(OffsetDateTime.now());
        fileMetadataMapper.updateById(metadata);

        try {
            minioClient.removeObject(RemoveObjectArgs.builder()
                    .bucket(metadata.getBucket())
                    .object(metadata.getObjectKey())
                    .build());
        } catch (Exception e) {
            log.warn("MinIO remove failed for fileId={}, object deleted from DB anyway: {}", fileId, e.getMessage());
        }
    }

    public FileMetadata getById(Long fileId) {
        return requireActive(fileId);
    }

    public List<FileMetadata> listByBiz(String bizType, Long bizId) {
        return fileMetadataMapper.selectList(new LambdaQueryWrapper<FileMetadata>()
                .eq(FileMetadata::getBizType, bizType)
                .eq(FileMetadata::getBizId, bizId)
                .eq(FileMetadata::getStatus, "active")
                .orderByDesc(FileMetadata::getCreatedAt));
    }

    private FileMetadata requireActive(Long fileId) {
        FileMetadata metadata = fileMetadataMapper.selectById(fileId);
        if (metadata == null || "deleted".equals(metadata.getStatus())) {
            throw new BizException("FILE_NOT_FOUND", "文件不存在或已删除");
        }
        return metadata;
    }

    private void ensureBucket() {
        if (bucketReady) {
            return;
        }
        synchronized (this) {
            if (bucketReady) {
                return;
            }
            try {
                boolean exists = minioClient.bucketExists(BucketExistsArgs.builder()
                        .bucket(minioConfig.getBucket())
                        .build());
                if (!exists) {
                    minioClient.makeBucket(MakeBucketArgs.builder()
                            .bucket(minioConfig.getBucket())
                            .build());
                    log.info("Created MinIO bucket: {}", minioConfig.getBucket());
                }
                bucketReady = true;
            } catch (Exception e) {
                throw new BizException("MINIO_INIT_ERROR", "MinIO 初始化失败: " + e.getMessage());
            }
        }
    }
}
