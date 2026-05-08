import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Skeleton,
  Switch,
  Upload,
  message,
} from 'antd';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
import { getFormSchema, type FormFieldSchema } from '@/api/workflow';
import { uploadFile, getFilePresignedUrl, type FileId, type FileMetadata } from '@/api/file';
import SignaturePad from './SignaturePad';
import CityCascaderField from './CityCascaderField';

interface Props {
  bizType?: string;
  instanceId?: string | number;
  fieldNamePrefix?: string[];
  /** When provided, skips the schema query and renders these fields directly. */
  fields?: FormFieldSchema[];
}

export default function DynamicFormFields({
  bizType,
  instanceId,
  fieldNamePrefix = [],
  fields: explicitFields,
}: Props) {
  const useQueryPath = explicitFields === undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['formSchema', bizType, instanceId ?? null],
    queryFn: () => getFormSchema(instanceId != null ? { instanceId } : { bizType: bizType! }),
    enabled: useQueryPath && (bizType != null || instanceId != null),
    staleTime: 60 * 1000,
  });

  if (useQueryPath && isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;
  const fields = (explicitFields ?? data?.fields ?? []).filter((f) => !f.deprecated);
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((field) => (
        <Form.Item
          key={field.name}
          name={[...fieldNamePrefix, field.name]}
          label={field.label ?? field.name}
          rules={buildRules(field)}
          valuePropName={field.type === 'boolean' ? 'checked' : 'value'}
          // Switch always renders an off state; pin the form value to false so
          // the field is sent on submit even when the user hasn't toggled it.
          initialValue={field.type === 'boolean' ? false : undefined}
        >
          {renderInput(field)}
        </Form.Item>
      ))}
    </>
  );
}

interface FileUploadValueProps {
  value?: FileId[];
  onChange?: (ids: FileId[]) => void;
  field: FormFieldSchema;
}

function FileUploadField({ value, onChange, field }: FileUploadValueProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const maxCount = field.fileMaxCount ?? 1;
  const accept = field.fileAccept ?? undefined;
  const isImageOnly = (accept ?? '').toLowerCase().includes('image');
  const listType: UploadProps['listType'] = isImageOnly ? 'picture-card' : 'text';

  // Sync fileList → empty only on a true outside reset (value goes from a
  // populated array back to undefined/null). Don't fire on the initial
  // undefined→[] transition — that one happens during the first emit while
  // a file is still uploading and would clobber antd's in-flight tracking,
  // making onSuccess never reach handleChange.
  useEffect(() => {
    if (value === undefined || value === null) {
      setFileList([]);
    }
  }, [value]);

  const beforeUpload: UploadProps['beforeUpload'] = (file) => {
    if (field.fileMaxSizeKb) {
      const limitBytes = field.fileMaxSizeKb * 1024;
      if (file.size > limitBytes) {
        message.error(`${file.name} 超过 ${field.fileMaxSizeKb}KB 限制`);
        return Upload.LIST_IGNORE;
      }
    }
    return true;
  };

  const handleChange: UploadProps['onChange'] = ({ fileList: next }) => {
    setFileList(next);
    // Snowflake IDs come back from backend as strings (JSON precision).
    // Accept both number and non-empty string.
    const ids = next
      .filter((f) => f.status === 'done')
      .map((f) => (f.response as FileMetadata | undefined)?.id)
      .filter((id): id is FileId => typeof id === 'number' || (typeof id === 'string' && id !== ''));
    onChange?.(ids);
  };

  const handlePreview: UploadProps['onPreview'] = async (file) => {
    const id = (file.response as FileMetadata | undefined)?.id;
    if (id == null) return;
    try {
      const url = await getFilePresignedUrl(id);
      window.open(url, '_blank');
    } catch {
      message.error('打开文件失败');
    }
  };

  const customRequest: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    try {
      const meta = await uploadFile(file as File, 'workflow_form', 0);
      onSuccess?.(meta);
    } catch (e) {
      onError?.(e as Error);
      message.error(`${(file as File).name} 上传失败`);
    }
  };

  if (isImageOnly) {
    return (
      <Upload
        listType={listType}
        accept={accept}
        maxCount={maxCount}
        fileList={fileList}
        beforeUpload={beforeUpload}
        onChange={handleChange}
        onPreview={handlePreview}
        customRequest={customRequest}
      >
        {fileList.length >= maxCount ? null : (
          <div>
            <InboxOutlined />
            <div style={{ marginTop: 6, fontSize: 12 }}>上传图片</div>
          </div>
        )}
      </Upload>
    );
  }

  return (
    <Upload
      listType={listType}
      accept={accept}
      maxCount={maxCount}
      fileList={fileList}
      beforeUpload={beforeUpload}
      onChange={handleChange}
      onPreview={handlePreview}
      customRequest={customRequest}
    >
      <Button icon={<UploadOutlined />}>选择文件</Button>
    </Upload>
  );
}

function buildRules(f: FormFieldSchema) {
  const label = f.label ?? f.name;
  const rules: Array<Record<string, unknown>> = [];
  if (f.required) {
    if (f.type === 'file') {
      rules.push({
        validator: (_: unknown, value: unknown) =>
          Array.isArray(value) && value.length > 0
            ? Promise.resolve()
            : Promise.reject(new Error(`${label} 必填`)),
      });
    } else if (f.type === 'boolean') {
      // Switch always has a value (true or false). "Required" on a Switch is
      // meaningless — the off state IS a valid answer. Skip the rule.
    } else {
      rules.push({ required: true, message: `${label} 必填` });
    }
  }
  if (f.pattern) rules.push({ pattern: new RegExp(f.pattern), message: `${label} 格式不合法` });
  if (f.type !== 'number' && (f.minLength != null || f.maxLength != null)) {
    rules.push({
      min: f.minLength ?? undefined,
      max: f.maxLength ?? undefined,
      type: 'string',
      message:
        f.minLength != null && f.maxLength != null
          ? `${label} 长度需在 ${f.minLength}-${f.maxLength} 字符之间`
          : f.minLength != null
          ? `${label} 至少 ${f.minLength} 个字符`
          : `${label} 最多 ${f.maxLength} 个字符`,
    });
  }
  if (f.type === 'number' && (f.min != null || f.max != null)) {
    rules.push({
      type: 'number',
      min: f.min ?? undefined,
      max: f.max ?? undefined,
      message:
        f.min != null && f.max != null
          ? `${label} 取值需在 ${f.min}-${f.max} 之间`
          : f.min != null
          ? `${label} 不得小于 ${f.min}`
          : `${label} 不得大于 ${f.max}`,
    });
  }
  return rules;
}

function renderInput(f: FormFieldSchema) {
  if (f.type === 'file') {
    if (f.widget === 'signature') {
      return <SignaturePad />;
    }
    return <FileUploadField field={f} />;
  }
  // String + widget=cascader → 省/市 二级联动；存的仍是叶子城市名（字符串），
  // 兼容历史自由文本 destination 数据。
  if (f.type === 'string' && f.widget === 'cascader') {
    return <CityCascaderField placeholder={f.placeholder ?? undefined} allowClear={!f.required} />;
  }
  if (f.options && f.options.length > 0) {
    if (f.widget === 'radio') {
      return (
        <Radio.Group options={f.options.map((o) => ({ label: o, value: o }))} />
      );
    }
    return (
      <Select
        placeholder={f.placeholder ?? `请选择${f.label ?? f.name}`}
        options={f.options.map((o) => ({ label: o, value: o }))}
        allowClear={!f.required}
      />
    );
  }
  switch (f.type) {
    case 'number':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={f.placeholder ?? ''}
          min={f.min ?? undefined}
          max={f.max ?? undefined}
        />
      );
    case 'boolean':
      return <Switch />;
    case 'date':
      return <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />;
    default:
      if (f.widget === 'textarea') {
        return (
          <Input.TextArea
            placeholder={f.placeholder ?? ''}
            allowClear
            rows={4}
            maxLength={f.maxLength ?? undefined}
            showCount={f.maxLength != null}
          />
        );
      }
      return (
        <Input
          placeholder={f.placeholder ?? ''}
          allowClear
          maxLength={f.maxLength ?? undefined}
          showCount={f.maxLength != null}
        />
      );
  }
}
