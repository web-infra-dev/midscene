import type { z } from '@midscene/core';
import { Form, Input, InputNumber, Select } from 'antd';
import type React from 'react';
import type { ZodRuntimeAccess } from '../../types';

const { TextArea } = Input;

interface FormFieldProps {
  name: string;
  label: string;
  fieldSchema: z.ZodTypeAny;
  isRequired: boolean;
  isLocateField: boolean;
  marginBottom: number;
  placeholder?: string; // Add optional placeholder prop
}

const renderLabel = (label: string, isOptional: boolean) => {
  return `${label}${isOptional ? ' (Optional)' : ''}`;
};

export const TextField: React.FC<Omit<FormFieldProps, 'isLocateField'>> = ({
  name,
  label,
  isRequired,
  marginBottom,
  placeholder: customPlaceholder,
}) => {
  const placeholder = customPlaceholder || `Enter ${name}`;
  return (
    <Form.Item
      key={name}
      name={['params', name]}
      label={renderLabel(label, !isRequired)}
      rules={
        isRequired ? [{ required: true, message: `Please input ${name}` }] : []
      }
      style={{ marginBottom }}
      colon={false}
    >
      <Input placeholder={placeholder} />
    </Form.Item>
  );
};

export const LocateField: React.FC<Omit<FormFieldProps, 'isLocateField'>> = ({
  name,
  label,
  isRequired,
  marginBottom,
  placeholder: customPlaceholder,
}) => {
  const placeholder =
    customPlaceholder || `Describe the ${name}, use natural language`;
  return (
    <Form.Item
      key={name}
      name={['params', name]}
      label={renderLabel(label, !isRequired)}
      rules={
        isRequired
          ? [
              {
                required: true,
                message: `The ${name} is required`,
              },
            ]
          : []
      }
      style={{ marginBottom }}
      colon={false}
    >
      <TextArea rows={2} placeholder={placeholder} />
    </Form.Item>
  );
};

export const EnumField: React.FC<Omit<FormFieldProps, 'isLocateField'>> = ({
  name,
  label,
  fieldSchema,
  isRequired,
  marginBottom,
  placeholder: customPlaceholder,
}) => {
  const enumValues = (fieldSchema as ZodRuntimeAccess)._def?.values || [];
  const selectOptions = enumValues.map((value: string) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));

  return (
    <Form.Item
      key={name}
      name={['params', name]}
      label={label}
      rules={
        isRequired ? [{ required: true, message: `Please select ${name}` }] : []
      }
      style={{ marginBottom }}
      colon={false}
    >
      <Select
        placeholder={customPlaceholder || `Select ${name}`}
        options={selectOptions}
      />
    </Form.Item>
  );
};

export const NumberField: React.FC<Omit<FormFieldProps, 'isLocateField'>> = ({
  name,
  label,
  isRequired,
  marginBottom,
  placeholder: customPlaceholder,
}) => {
  const defaultPlaceholder = name === 'distance' ? 500 : 0;
  const placeholderValue = customPlaceholder
    ? Number(customPlaceholder) || defaultPlaceholder
    : defaultPlaceholder;
  const min = 0;
  const max = name === 'distance' ? 10000 : undefined;

  return (
    <Form.Item
      key={name}
      name={['params', name]}
      label={`${label}${name === 'distance' ? ' (px)' : ''}`}
      rules={
        isRequired
          ? [
              { required: true, message: `Please input ${name}` },
              {
                type: 'number',
                min,
                message: `${label} must be at least ${min}`,
              },
            ]
          : [
              {
                type: 'number',
                min,
                message: `${label} must be at least ${min}`,
              },
            ]
      }
      style={{
        flex: name === 'distance' ? 1 : undefined,
        marginBottom,
      }}
      colon={false}
    >
      <InputNumber
        placeholder={placeholderValue.toString()}
        min={min}
        max={max}
        step={name === 'distance' ? 10 : 1}
        style={{ width: '100%' }}
      />
    </Form.Item>
  );
};

export const BooleanField: React.FC<Omit<FormFieldProps, 'isLocateField'>> = ({
  name,
  label,
  isRequired,
  marginBottom,
  placeholder: customPlaceholder,
}) => {
  const selectOptions = [
    { value: true, label: 'True' },
    { value: false, label: 'False' },
  ];

  return (
    <Form.Item
      key={name}
      name={['params', name]}
      label={renderLabel(label, !isRequired)}
      rules={
        isRequired ? [{ required: true, message: `Please select ${name}` }] : []
      }
      style={{ marginBottom }}
      colon={false}
    >
      <Select
        placeholder={customPlaceholder || `Select ${name}`}
        options={selectOptions}
      />
    </Form.Item>
  );
};
