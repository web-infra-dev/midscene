import { BorderOutlined, SendOutlined } from '@ant-design/icons';
import './index.less';
import { DownOutlined } from '@ant-design/icons';
import type { z } from '@midscene/core';
import { Button, Dropdown, Form, Input, Radio, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { HistoryItem } from '../../store/history';
import { useHistoryStore } from '../../store/history';
import type { DeviceType, RunType } from '../../types';
import type { ServiceModeType } from '../../types';
import {
  type FormParams,
  type ZodObjectSchema,
  type ZodRuntimeAccess,
  type ZodType,
  extractDefaultValue,
  isLocateField,
  isZodObjectSchema,
  unwrapZodType,
} from '../../types';
import { apiMetadata, defaultMainButtons } from '../../utils/constants';
import {
  actionNameForType,
  isRunButtonEnabled as calculateIsRunButtonEnabled,
  getPlaceholderForType,
} from '../../utils/playground-utils';
import { ConfigSelector } from '../config-selector';
import {
  BooleanField,
  EnumField,
  LocateField,
  NumberField,
  TextField,
} from '../form-field';
import { HistorySelector } from '../history-selector';
import './index.less';
import type { DeviceAction } from '@midscene/core';

const { TextArea } = Input;

interface PromptInputProps {
  runButtonEnabled: boolean;
  form: any; // Ant Design FormInstance - keeping as any since it's external library type
  serviceMode: ServiceModeType;
  selectedType: RunType;
  dryMode: boolean;
  stoppable: boolean;
  loading: boolean;
  onRun: () => void;
  onStop: () => void;
  clearPromptAfterRun?: boolean;
  hideDomAndScreenshotOptions?: boolean; // Hide domIncluded and screenshotIncluded options
  actionSpace: DeviceAction<any>[]; // Required actionSpace for dynamic parameter detection
  deviceType?: DeviceType;
}

export const PromptInput: React.FC<PromptInputProps> = ({
  runButtonEnabled,
  form,
  serviceMode,
  selectedType,
  dryMode,
  stoppable,
  loading,
  onRun,
  onStop,
  clearPromptAfterRun = true,
  actionSpace,
  hideDomAndScreenshotOptions = false,
  deviceType,
}) => {
  const [hoveringSettings, setHoveringSettings] = useState(false);
  const [promptValue, setPromptValue] = useState('');
  const placeholder = getPlaceholderForType(selectedType);
  const textAreaRef = useRef<any>(null); // Ant Design TextArea ref with internal structure
  const modeRadioGroupRef = useRef<HTMLDivElement>(null); // Ref for the mode-radio-group container
  const params = Form.useWatch('params', form);
  const lastHistoryRef = useRef<HistoryItem | null>(null);

  // Get history from store
  const history = useHistoryStore((state) => state.history);
  const lastSelectedType = useHistoryStore((state) => state.lastSelectedType);
  const addHistory = useHistoryStore((state) => state.addHistory);
  const setLastSelectedType = useHistoryStore(
    (state) => state.setLastSelectedType,
  );
  const historyForSelectedType = useMemo(
    () => history[selectedType] || [],
    [history, selectedType],
  );

  // Check if current method needs structured parameters (dynamic based on actionSpace)
  const needsStructuredParams = useMemo(() => {
    if (actionSpace) {
      // Use actionSpace to determine if method needs structured params
      const action = actionSpace.find(
        (a) => a.interfaceAlias === selectedType || a.name === selectedType,
      );

      if (!action?.paramSchema) return false;

      // Check if paramSchema actually has fields
      if (isZodObjectSchema(action.paramSchema)) {
        const schema = action.paramSchema as ZodObjectSchema;
        const shape: Record<string, ZodType> = schema.shape || {};
        const shapeKeys = Object.keys(shape);
        return shapeKeys.length > 0; // Only need structured params if there are actual fields
      }

      // If paramSchema exists but not in expected format, assume it needs params
      return true;
    }
    return false;
  }, [selectedType, actionSpace]);

  // Check if current method needs any input (either prompt or parameters)
  const needsAnyInput = useMemo(() => {
    if (actionSpace && actionSpace.length > 0) {
      // Use actionSpace to determine if method needs any input
      const action = actionSpace.find(
        (a) => a.interfaceAlias === selectedType || a.name === selectedType,
      );

      // If action exists in actionSpace, check if it has required parameters
      if (action) {
        // Check if the paramSchema has any required fields
        if (action.paramSchema && isZodObjectSchema(action.paramSchema)) {
          const schema = action.paramSchema as ZodObjectSchema;
          const shape: Record<string, ZodType> = schema.shape || {};

          // Check if any field is required (not optional)
          const hasRequiredFields = Object.keys(shape).some((key) => {
            const field = shape[key];
            const { isOptional } = unwrapZodType(field);
            return !isOptional;
          });

          return hasRequiredFields;
        }

        // If has paramSchema but not a ZodObject, assume it needs input
        return !!action.paramSchema;
      }

      // If not found in actionSpace, assume most methods need input
      return true;
    }

    // Fallback when actionSpace is not loaded yet - assume most methods need input
    return true;
  }, [selectedType, actionSpace]);

  // Check if current method supports data extraction options
  const showDataExtractionOptions = useMemo(() => {
    const dataExtractionMethods = [
      'aiQuery',
      'aiBoolean',
      'aiNumber',
      'aiString',
      'aiAsk',
      'aiAssert',
    ];
    return dataExtractionMethods.includes(selectedType);
  }, [selectedType]);

  // Check if current method supports deep think option (dynamic based on actionSpace)
  const showDeepThinkOption = useMemo(() => {
    if (selectedType === 'aiAct') {
      return true;
    }

    if (selectedType === 'aiLocate') {
      return true;
    }

    if (actionSpace) {
      // Use actionSpace to determine if method supports deep think
      const action = actionSpace.find(
        (a) => a.interfaceAlias === selectedType || a.name === selectedType,
      );

      if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
        const schema = action.paramSchema as ZodObjectSchema;
        const shape: Record<string, ZodType> = schema.shape || {};
        // Check if any parameter is a locate field
        const hasLocateField = Object.keys(shape).some((key) => {
          const field = shape[key];
          const { actualField } = unwrapZodType(field);
          return isLocateField(actualField);
        });

        return hasLocateField;
      }
      return false;
    }
    return false;
  }, [selectedType, actionSpace]);

  // Check if ConfigSelector will actually have options to show
  const hasConfigOptions = useMemo(() => {
    const hasTracking = serviceMode === 'In-Browser-Extension';
    const hasDeepThink = showDeepThinkOption;
    const hasDataExtraction =
      showDataExtractionOptions && !hideDomAndScreenshotOptions;
    const hasDeviceOptions = deviceType === 'android' || deviceType === 'ios';
    return hasTracking || hasDeepThink || hasDataExtraction || hasDeviceOptions;
  }, [
    serviceMode,
    showDeepThinkOption,
    showDataExtractionOptions,
    hideDomAndScreenshotOptions,
    deviceType,
  ]);

  // Get available methods for dropdown (filtered by actionSpace)
  const availableDropdownMethods = useMemo(() => {
    const metadataMethods = Object.keys(apiMetadata);

    if (!actionSpace || actionSpace.length === 0) {
      // Fallback to metadata methods if actionSpace is not available
      return metadataMethods;
    }

    // Extract available methods from actionSpace
    const availableMethods = actionSpace.map(
      (action) => action.interfaceAlias || action.name,
    );

    // Combine methods from two sources:
    // 1. Methods from apiMetadata (filtered by rules)
    // 2. Methods from actionSpace (even if not in apiMetadata)
    const finalMethods = new Set<string>();

    // Add filtered apiMetadata methods
    metadataMethods.forEach((method) => {
      const methodInfo = apiMetadata[method as keyof typeof apiMetadata];

      // Always include extraction and validation methods
      if (
        methodInfo?.group === 'extraction' ||
        methodInfo?.group === 'validation'
      ) {
        finalMethods.add(method);
      } else {
        // For interaction methods, check if they're available in actionSpace
        if (availableMethods.includes(method)) {
          finalMethods.add(method);
        }
      }
    });

    // Add all methods from actionSpace (including Android-specific ones)
    availableMethods.forEach((method) => {
      finalMethods.add(method);
    });

    return Array.from(finalMethods);
  }, [actionSpace]);

  // Get default values for fields with defaults
  const getDefaultParams = useCallback((): FormParams => {
    if (!needsStructuredParams || !actionSpace) {
      return {};
    }
    const action = actionSpace.find(
      (a) => a.interfaceAlias === selectedType || a.name === selectedType,
    );

    if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
      const defaultParams: FormParams = {};
      const schema = action.paramSchema as ZodObjectSchema;
      const shape: Record<string, ZodType> = schema.shape || {};

      Object.keys(shape).forEach((key) => {
        const field = shape[key];
        const defaultValue = extractDefaultValue(field);
        if (defaultValue !== undefined) {
          defaultParams[key] = defaultValue as
            | string
            | number
            | boolean
            | null
            | undefined;
        }
      });

      return defaultParams;
    }
    return {};
  }, [selectedType, needsStructuredParams, actionSpace]);

  // Initialize form with last selected type when component mounts
  useEffect(() => {
    if (!form.getFieldValue('type') && lastSelectedType) {
      form.setFieldValue('type', lastSelectedType);
    }
  }, [form, lastSelectedType]);

  // Save selected type when it changes
  useEffect(() => {
    if (selectedType && selectedType !== lastSelectedType) {
      setLastSelectedType(selectedType);
    }
  }, [selectedType, lastSelectedType, setLastSelectedType]);

  // Scroll to selected item in mode-radio-group
  const scrollToSelectedItem = useCallback(() => {
    const container = modeRadioGroupRef.current;
    if (!container) return;

    let targetElement: HTMLElement | null = null;

    // Find the selected radio button
    const selectedRadioButton = container.querySelector(
      '.ant-radio-button-wrapper-checked',
    ) as HTMLElement;

    // Find the dropdown button if it's selected (showing a non-default item)
    const dropdownButton = container.querySelector(
      '.more-apis-button.selected-from-dropdown',
    ) as HTMLElement;

    // Determine which element to scroll to
    if (selectedRadioButton) {
      targetElement = selectedRadioButton;
    } else if (dropdownButton) {
      targetElement = dropdownButton;
    }

    if (targetElement) {
      const containerRect = container.getBoundingClientRect();
      const targetRect = targetElement.getBoundingClientRect();

      // Calculate the relative position of the target within the container
      const targetLeft =
        targetRect.left - containerRect.left + container.scrollLeft;
      const targetWidth = targetRect.width;
      const containerWidth = containerRect.width;

      // Calculate the optimal scroll position to center the target
      const optimalScrollLeft = targetLeft - (containerWidth - targetWidth) / 2;

      // Smooth scroll to the target
      container.scrollTo({
        left: Math.max(0, optimalScrollLeft),
        behavior: 'smooth',
      });
    }
  }, []);

  // When the selectedType changes, populate the form with the last item from that type's history.
  useEffect(() => {
    const lastHistory = historyForSelectedType[0];

    // Skip auto-filling if this is the same history item we just added
    if (
      lastHistory &&
      lastHistoryRef.current &&
      lastHistory.timestamp === lastHistoryRef.current.timestamp
    ) {
      return;
    }

    if (lastHistory) {
      form.setFieldsValue({
        type: lastHistory.type,
        prompt: lastHistory.prompt || '',
        params: lastHistory.params,
      });
      setPromptValue(lastHistory.prompt || '');
      lastHistoryRef.current = lastHistory;
    } else {
      // If there's no history for this type, fill with default values
      const defaultParams = getDefaultParams();
      form.setFieldsValue({
        prompt: '',
        params: defaultParams,
      });
      setPromptValue('');
      lastHistoryRef.current = null;
    }
  }, [selectedType, historyForSelectedType, form, getDefaultParams]);

  // Scroll to selected item when selectedType changes
  useEffect(() => {
    // Use a timeout to ensure the DOM has been updated with the new selection
    const timeoutId = setTimeout(() => {
      scrollToSelectedItem();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [selectedType, scrollToSelectedItem]);

  // Watch form prompt value changes
  const formPromptValue = Form.useWatch('prompt', form);

  // Sync promptValue with form field value when form changes
  useEffect(() => {
    if (formPromptValue !== promptValue) {
      setPromptValue(formPromptValue || '');
    }
  }, [formPromptValue, promptValue]);

  // Handle history selection internally
  const handleSelectHistory = useCallback(
    (historyItem: HistoryItem) => {
      form.setFieldsValue({
        prompt: historyItem.prompt,
        type: historyItem.type,
        params: historyItem.params,
      });
      setPromptValue(historyItem.prompt);
    },
    [form],
  );

  // Handle prompt input change
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPromptValue(value);
    },
    [],
  );

  const hasSingleStructuredParam = useMemo(() => {
    if (!needsStructuredParams || !actionSpace) {
      return false;
    }
    const action = actionSpace.find(
      (a) => a.interfaceAlias === selectedType || a.name === selectedType,
    );

    if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
      const schema = action.paramSchema as ZodObjectSchema;
      const shape: Record<string, ZodType> = schema.shape || {};
      return Object.keys(shape).length === 1;
    }
    return false;
  }, [selectedType, needsStructuredParams, actionSpace]);

  // Calculate if run button should be enabled
  const isRunButtonEnabled = useMemo(
    (): boolean =>
      calculateIsRunButtonEnabled(
        runButtonEnabled,
        !!needsStructuredParams,
        params,
        actionSpace,
        selectedType,
        promptValue,
      ),
    [
      runButtonEnabled,
      needsStructuredParams,
      selectedType,
      actionSpace,
      promptValue,
      params,
    ],
  );

  // Handle run with history addition
  const handleRunWithHistory = useCallback(() => {
    const values = form.getFieldsValue() as {
      type: string;
      prompt?: string;
      params?: Record<string, unknown>;
    };

    // For structured params, create a display string for history - dynamically
    let historyPrompt = '';
    if (needsStructuredParams && values.params && actionSpace) {
      const action = actionSpace.find(
        (a) => a.interfaceAlias === selectedType || a.name === selectedType,
      );

      if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
        // Separate locate field from other fields for legacy format compatibility
        let locateValue = '';
        const otherValues: string[] = [];
        const schema = action.paramSchema as ZodObjectSchema;
        const shape: Record<string, ZodType> = schema.shape || {};

        Object.keys(shape).forEach((key) => {
          const paramValue = values.params?.[key];
          if (
            paramValue !== undefined &&
            paramValue !== null &&
            paramValue !== ''
          ) {
            const field = shape[key];
            const { actualField } = unwrapZodType(field);

            if (isLocateField(actualField)) {
              locateValue = String(paramValue);
            } else {
              // Format based on field type
              if (key === 'distance') {
                otherValues.push(`${paramValue}`);
              } else {
                otherValues.push(String(paramValue));
              }
            }
          }
        });

        // Create legacy-compatible format for history
        const mainPart = otherValues.join(' ');
        historyPrompt = locateValue ? `${locateValue} - ${mainPart}` : mainPart;
      } else {
        historyPrompt = values.prompt || '';
      }
    } else {
      historyPrompt = values.prompt || '';
    }

    const newHistoryItem = {
      type: values.type,
      prompt: historyPrompt,
      params: values.params,
      timestamp: Date.now(),
    };

    addHistory(newHistoryItem);

    onRun();

    if (clearPromptAfterRun) {
      // Remember the history item we just added to avoid auto-filling with it
      lastHistoryRef.current = newHistoryItem;
      setPromptValue('');
      if (needsStructuredParams) {
        const defaultParams = getDefaultParams();
        form.setFieldValue('params', defaultParams);
      } else {
        form.setFieldValue('prompt', '');
      }
    }
  }, [
    form,
    addHistory,
    onRun,
    needsStructuredParams,
    selectedType,
    clearPromptAfterRun,
    actionSpace,
    getDefaultParams,
  ]);

  // Handle key events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey && isRunButtonEnabled) {
        handleRunWithHistory();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Enter') {
        setTimeout(() => {
          if (textAreaRef.current) {
            // Access the internal textarea element (Ant Design specific structure)
            const textarea = (textAreaRef.current as any).resizableTextArea
              ?.textArea;
            if (textarea) {
              const selectionStart = textarea.selectionStart;
              const value = textarea.value;

              // check if cursor is at the end of the text
              const lastNewlineIndex = value.lastIndexOf('\n');
              const isAtLastLine =
                lastNewlineIndex === -1 || selectionStart > lastNewlineIndex;

              // only scroll to bottom when cursor is at the end of the text
              if (isAtLastLine) {
                textarea.scrollTop = textarea.scrollHeight;
              }
            }
          }
        }, 0);
      }
    },
    [handleRunWithHistory, isRunButtonEnabled],
  );

  // Handle key events for structured params
  const handleStructuredKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.metaKey && isRunButtonEnabled) {
        handleRunWithHistory();
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [handleRunWithHistory, isRunButtonEnabled],
  );

  // Render structured parameter inputs dynamically based on paramSchema
  const renderStructuredParams = useCallback(() => {
    if (!needsStructuredParams) return null;

    // Try to get action from actionSpace first
    if (actionSpace) {
      const action = actionSpace.find(
        (a) => a.interfaceAlias === selectedType || a.name === selectedType,
      );

      if (action?.paramSchema && isZodObjectSchema(action.paramSchema)) {
        const schema = action.paramSchema as ZodObjectSchema;
        // Handle both runtime and serialized schemas
        const shape: Record<string, ZodType> = schema.shape || {};
        const schemaKeys = Object.keys(shape);

        // If only one field, use traditional single input style without labels
        if (schemaKeys.length === 1) {
          const key = schemaKeys[0];
          const field = shape[key];
          const { actualField } = unwrapZodType(field);

          // Check if it's a locate field
          const isLocateFieldFlag = isLocateField(actualField);

          // Extract placeholder from fieldSchema if available, otherwise use defaults
          const placeholderText = (() => {
            const fieldWithRuntime = actualField as ZodRuntimeAccess;

            // Try to get description from the field schema
            if (fieldWithRuntime._def?.description) {
              return fieldWithRuntime._def.description;
            }

            if (fieldWithRuntime.description) {
              return fieldWithRuntime.description;
            }

            // Try to get from action's paramSchema directly
            if (actionSpace) {
              const action = actionSpace.find(
                (a) =>
                  a.interfaceAlias === selectedType || a.name === selectedType,
              );
              if (
                action?.paramSchema &&
                typeof action.paramSchema === 'object' &&
                'shape' in action.paramSchema
              ) {
                const shape: Record<string, ZodType> =
                  (action.paramSchema as unknown as ZodObjectSchema).shape ||
                  {};
                const fieldDef = shape[key];
                if (fieldDef?._def?.description) {
                  return fieldDef._def.description;
                }
                if (fieldDef?.description) {
                  return fieldDef.description;
                }
              }
            }

            // Fallback to default placeholders
            if (isLocateFieldFlag) {
              return 'Describe the element you want to interact with';
            } else {
              if (key === 'keyName') return 'Enter key name or text to type';
              if (key === 'value') return 'Enter text to input';
              return `Enter ${key}`;
            }
          })();

          return (
            <Form.Item name={['params', key]} style={{ margin: 0 }}>
              <Input.TextArea
                className="main-side-console-input-textarea"
                rows={3}
                placeholder={placeholderText}
                autoFocus
                onKeyDown={handleStructuredKeyDown}
              />
            </Form.Item>
          );
        }

        // Multiple fields - use structured layout with labels
        const fields: React.ReactNode[] = [];

        // Sort fields: required fields first, then optional fields
        const sortedKeys = schemaKeys.sort((keyA, keyB) => {
          const fieldSchemaA = shape[keyA];
          const fieldSchemaB = shape[keyB];
          const { isOptional: isOptionalA } = unwrapZodType(fieldSchemaA);
          const { isOptional: isOptionalB } = unwrapZodType(fieldSchemaB);

          // Required fields (isOptional = false) come first
          if (!isOptionalA && isOptionalB) return -1;
          if (isOptionalA && !isOptionalB) return 1;
          return 0;
        });

        // Dynamically render form fields based on paramSchema
        sortedKeys.forEach((key, index) => {
          const fieldSchema = shape[key];
          const { actualField, isOptional } = unwrapZodType(fieldSchema);
          const isLocateFieldFlag = isLocateField(actualField);
          const label = key.charAt(0).toUpperCase() + key.slice(1);
          const isRequired = !isOptional;
          const marginBottom = index === sortedKeys.length - 1 ? 0 : 12;

          // Extract placeholder from fieldSchema if available
          const placeholder = (() => {
            // Try to get placeholder from field description or other metadata
            const fieldWithRuntime = actualField as ZodRuntimeAccess;
            if (fieldWithRuntime._def?.description) {
              return fieldWithRuntime._def.description;
            }

            // Try to get from field metadata/annotations
            if (fieldWithRuntime.description) {
              return fieldWithRuntime.description;
            }

            // Try to get from action's paramSchema directly
            if (actionSpace) {
              const action = actionSpace.find(
                (a) =>
                  a.interfaceAlias === selectedType || a.name === selectedType,
              );
              if (
                action?.paramSchema &&
                typeof action.paramSchema === 'object' &&
                'shape' in action.paramSchema
              ) {
                const shape: Record<string, ZodType> =
                  (action.paramSchema as { shape?: Record<string, ZodType> })
                    .shape || {};
                const fieldDef = shape[key];
                if (fieldDef?._def?.description) {
                  return fieldDef._def.description;
                }
                if (fieldDef?.description) {
                  return fieldDef.description;
                }
              }
            }

            // For locate fields, provide a default placeholder
            if (isLocateFieldFlag) {
              return 'Describe the element you want to interact with';
            }

            return undefined;
          })();

          const fieldProps = {
            name: key,
            label,
            fieldSchema: actualField as z.ZodTypeAny,
            isRequired,
            marginBottom,
            placeholder,
          };

          if (isLocateFieldFlag) {
            fields.push(<LocateField key={key} {...fieldProps} />);
          } else if (
            (actualField as ZodRuntimeAccess)._def?.typeName === 'ZodEnum'
          ) {
            fields.push(<EnumField key={key} {...fieldProps} />);
          } else if (
            (actualField as ZodRuntimeAccess)._def?.typeName === 'ZodNumber'
          ) {
            fields.push(<NumberField key={key} {...fieldProps} />);
          } else if (
            (actualField as ZodRuntimeAccess)._def?.typeName === 'ZodBoolean'
          ) {
            fields.push(<BooleanField key={key} {...fieldProps} />);
          } else {
            fields.push(<TextField key={key} {...fieldProps} />);
          }
        });

        // Special layout handling for scroll action with direction and distance
        if (selectedType === 'aiScroll') {
          const directionField = fields.find(
            (field) =>
              React.isValidElement(field) && field.props.name === 'direction',
          );
          const distanceField = fields.find(
            (field) =>
              React.isValidElement(field) && field.props.name === 'distance',
          );
          const otherFields = fields.filter(
            (field) =>
              React.isValidElement(field) &&
              field.props.name !== 'direction' &&
              field.props.name !== 'distance',
          );

          if (directionField && distanceField) {
            return (
              <div className="structured-params">
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  {directionField}
                  {distanceField}
                </div>
                {otherFields}
              </div>
            );
          }
        }

        return <div className="structured-params">{fields}</div>;
      }
    }

    // Fallback - should not be reached if actionSpace is properly loaded
    return null;
  }, [
    selectedType,
    needsStructuredParams,
    actionSpace,
    handleStructuredKeyDown,
  ]);

  // Handle settings hover state
  const handleMouseEnter = useCallback(() => {
    setHoveringSettings(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoveringSettings(false);
  }, []);

  // Render action button based on current state
  const renderActionButton = useCallback(() => {
    const runButton = (text: string) => (
      <Button
        type="primary"
        icon={<SendOutlined />}
        style={{ borderRadius: 20, zIndex: 999 }}
        onClick={handleRunWithHistory}
        disabled={!isRunButtonEnabled}
        loading={loading}
      >
        {text}
      </Button>
    );

    if (dryMode) {
      return selectedType === 'aiAct' ? (
        <Tooltip title="Start executing until some interaction actions need to be performed. You can see the process of planning and locating.">
          {runButton('Dry Run')}
        </Tooltip>
      ) : (
        runButton('Run')
      );
    }

    if (stoppable) {
      return (
        <Button
          icon={<BorderOutlined />}
          onClick={onStop}
          style={{ borderRadius: 20, zIndex: 999 }}
        >
          Stop
        </Button>
      );
    }

    return runButton('Run');
  }, [
    dryMode,
    loading,
    handleRunWithHistory,
    onStop,
    isRunButtonEnabled,
    selectedType,
    stoppable,
  ]);

  return (
    <div className="prompt-input-wrapper">
      {/* top operation button area */}
      <div className="mode-radio-group-wrapper">
        <div className="mode-radio-group" ref={modeRadioGroupRef}>
          <Form.Item name="type" style={{ margin: 0 }}>
            <Radio.Group buttonStyle="solid" disabled={!runButtonEnabled}>
              {defaultMainButtons.map((apiType) => (
                <Tooltip
                  key={apiType}
                  title={
                    apiMetadata[apiType as keyof typeof apiMetadata]?.title ||
                    ''
                  }
                >
                  <Radio.Button value={apiType}>
                    {actionNameForType(apiType)}
                  </Radio.Button>
                </Tooltip>
              ))}
            </Radio.Group>
          </Form.Item>
          <Dropdown
            menu={(() => {
              // Get all APIs not currently shown in main buttons, filtered by actionSpace
              const hiddenAPIs = availableDropdownMethods.filter(
                (api) => !defaultMainButtons.includes(api),
              );

              // Group hidden APIs by category
              const groupedItems: any[] = [];

              const interactionAPIs = hiddenAPIs.filter(
                (api) =>
                  apiMetadata[api as keyof typeof apiMetadata]?.group ===
                  'interaction',
              );
              if (interactionAPIs.length > 0) {
                groupedItems.push({
                  key: 'interaction-group',
                  type: 'group',
                  label: 'Interaction APIs',
                  children: interactionAPIs.map((api) => ({
                    key: api,
                    label: actionNameForType(api),
                    title:
                      apiMetadata[api as keyof typeof apiMetadata]?.title || '',
                    onClick: () => {
                      form.setFieldValue('type', api);
                    },
                  })),
                });
              }

              const extractionAPIs = hiddenAPIs.filter(
                (api) =>
                  apiMetadata[api as keyof typeof apiMetadata]?.group ===
                  'extraction',
              );
              if (extractionAPIs.length > 0) {
                groupedItems.push({
                  key: 'extraction-group',
                  type: 'group',
                  label: 'Data Extraction APIs',
                  children: extractionAPIs.map((api) => ({
                    key: api,
                    label: actionNameForType(api),
                    title:
                      apiMetadata[api as keyof typeof apiMetadata]?.title || '',
                    onClick: () => {
                      form.setFieldValue('type', api);
                    },
                  })),
                });
              }

              const validationAPIs = hiddenAPIs.filter(
                (api) =>
                  apiMetadata[api as keyof typeof apiMetadata]?.group ===
                  'validation',
              );
              if (validationAPIs.length > 0) {
                groupedItems.push({
                  key: 'validation-group',
                  type: 'group',
                  label: 'Validation APIs',
                  children: validationAPIs.map((api) => ({
                    key: api,
                    label: actionNameForType(api),
                    title:
                      apiMetadata[api as keyof typeof apiMetadata]?.title || '',
                    onClick: () => {
                      form.setFieldValue('type', api);
                    },
                  })),
                });
              }

              // Add device-specific APIs (those not in apiMetadata)
              const deviceSpecificAPIs = hiddenAPIs.filter(
                (api) => !apiMetadata[api as keyof typeof apiMetadata],
              );
              if (deviceSpecificAPIs.length > 0) {
                groupedItems.push({
                  key: 'device-specific-group',
                  type: 'group',
                  label: 'Device-Specific APIs',
                  children: deviceSpecificAPIs.map((api) => ({
                    key: api,
                    label: actionNameForType(api),
                    title: '',
                    onClick: () => {
                      form.setFieldValue('type', api);
                    },
                  })),
                });
              }

              return { items: groupedItems } as MenuProps;
            })()}
            placement="bottomLeft"
            trigger={['click']}
            disabled={!runButtonEnabled}
            overlayClassName="more-apis-dropdown"
          >
            <Button
              className={`more-apis-button ${!defaultMainButtons.includes(selectedType) ? 'selected-from-dropdown' : ''}`}
            >
              {selectedType && !defaultMainButtons.includes(selectedType)
                ? actionNameForType(selectedType)
                : 'more'}
              <DownOutlined style={{ fontSize: '10px', marginLeft: '2px' }} />
            </Button>
          </Dropdown>
        </div>

        <div className="action-icons">
          {hasConfigOptions && (
            <div
              className={
                hoveringSettings
                  ? 'settings-wrapper settings-wrapper-hover'
                  : 'settings-wrapper'
              }
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <ConfigSelector
                enableTracking={serviceMode === 'In-Browser-Extension'}
                showDeepThinkOption={showDeepThinkOption}
                showDataExtractionOptions={showDataExtractionOptions}
                hideDomAndScreenshotOptions={hideDomAndScreenshotOptions}
                deviceType={deviceType}
              />
            </div>
          )}
          <HistorySelector
            onSelect={handleSelectHistory}
            history={historyForSelectedType}
            currentType={selectedType}
          />
        </div>
      </div>

      {/* input box area */}
      <div
        className={`main-side-console-input ${!runButtonEnabled ? 'disabled' : ''} ${loading ? 'loading' : ''}`}
      >
        {needsAnyInput ? (
          needsStructuredParams ? (
            hasSingleStructuredParam ? (
              renderStructuredParams()
            ) : (
              // Render structured parameters for specific AI methods
              <div className="structured-params-container">
                {renderStructuredParams()}
              </div>
            )
          ) : (
            // Render traditional prompt input for other methods
            <Form.Item name="prompt" style={{ margin: 0 }}>
              <TextArea
                className="main-side-console-input-textarea"
                disabled={!runButtonEnabled}
                rows={3}
                placeholder={placeholder}
                autoFocus
                onKeyDown={handleKeyDown}
                onChange={handlePromptChange}
                ref={textAreaRef}
              />
            </Form.Item>
          )
        ) : (
          // Methods that don't need any input - show a message or empty state
          <div
            className="no-input-method"
            style={{
              padding: '20px',
              textAlign: 'center',
              color: '#666',
              fontSize: '14px',
            }}
          >
            Click "Run" to execute {actionNameForType(selectedType)}
          </div>
        )}

        <div className="form-controller-wrapper">{renderActionButton()}</div>
      </div>
    </div>
  );
};
