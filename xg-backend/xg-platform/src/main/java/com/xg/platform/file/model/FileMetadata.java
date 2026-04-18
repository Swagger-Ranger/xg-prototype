package com.xg.platform.file.model;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

@Data
@TableName("file_metadata")
public class FileMetadata {

    @TableId(type = IdType.ASSIGN_ID)
    private Long id;

    private String tenantId;

    private String originalName;

    private String storedName;

    private String bucket;

    private String objectKey;

    private String contentType;

    private Long fileSize;

    private String md5Hash;

    private Long uploaderId;

    private String bizType;

    private Long bizId;

    private String status;

    private OffsetDateTime createdAt;

    private OffsetDateTime deletedAt;
}
