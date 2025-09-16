import type { AIActionDecomposition, GeneratedCode } from '@midscene/core';
import { Tabs } from 'antd';
import type React from 'react';
import { useState } from 'react';
import type { SupportedLanguage } from '../code-block';
import { CodeBlock } from '../code-block';

interface CodeDisplayProps {
  generatedCode: GeneratedCode;
  decomposition?: AIActionDecomposition;
  actionType: string;
}

// Helper function to generate decomposed YAML in flow format
function generateDecomposedYAMLFlow(steps: AIActionDecomposition['steps']): string {
  if (!steps || steps.length === 0) return '';

  const yamlLines = ['- name: step by step execution', '  flow:'];
  
  steps.forEach((step) => {
    const actionLine = `${step.action}: ${JSON.stringify(step.parameters?.prompt || '')}`;
    yamlLines.push(`    - ${actionLine}`);
  });

  return yamlLines.join('\n');
}

export const CodeDisplay: React.FC<CodeDisplayProps> = ({
  generatedCode,
  decomposition,
  actionType,
}) => {
  const [activeTab, setActiveTab] = useState<string>('js');

  const renderCodeBlock = (
    code: string,
    language: SupportedLanguage,
    label: string,
  ) => (
    <CodeBlock
      code={code}
      language={language}
      label={label}
      showCopy={true}
      showHeader={true}
      style={{ marginBottom: 16 }}
    />
  );

  // For aiAction, show both original and decomposed code
  if (actionType === 'aiAction' && decomposition) {
    const items = [
      {
        key: 'js',
        label: 'JavaScript',
        children: (
          <div>
            {renderCodeBlock(
              generatedCode.javascript,
              'javascript',
              'AI Action',
            )}
            {decomposition && (
              <div style={{ marginTop: 20 }}>
                <h4
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '14px',
                    color: '#333',
                  }}
                >
                  Step-by-step breakdown:
                </h4>
                {renderCodeBlock(
                  // Generate decomposed JS code here
                  decomposition.steps
                    .map(
                      (step, index) =>
                        `// Step ${index + 1}: ${step.description}\n` +
                        `await agent.${step.action}(${JSON.stringify(step.parameters?.prompt || '')});`,
                    )
                    .join('\n\n'),
                  'javascript',
                  'Decomposed steps',
                )}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'yaml',
        label: 'YAML',
        children: (
          <div>
            {renderCodeBlock(generatedCode.yaml, 'yaml', 'AI Action')}
            {decomposition && (
              <div style={{ marginTop: 20 }}>
                <h4
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: '14px',
                    color: '#333',
                  }}
                >
                  Step-by-step breakdown:
                </h4>
                {renderCodeBlock(
                  // Generate decomposed YAML code in flow format
                  generateDecomposedYAMLFlow(decomposition.steps),
                  'yaml',
                  'Decomposed steps',
                )}
              </div>
            )}
          </div>
        ),
      },
    ];

    return (
      <div className="code-display" style={{ marginTop: 16 }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#333' }}>
          Generated Code
        </h3>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items}
          size="small"
        />
      </div>
    );
  }

  // For other actions, show simple code blocks
  const items = [
    {
      key: 'js',
      label: 'JavaScript',
      children: renderCodeBlock(
        generatedCode.javascript,
        'javascript',
        'JavaScript Code',
      ),
    },
    {
      key: 'yaml',
      label: 'YAML',
      children: renderCodeBlock(generatedCode.yaml, 'yaml', 'YAML Code'),
    },
  ];

  return (
    <div className="code-display" style={{ marginTop: 16 }}>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: '#333' }}>
        Generated Code
      </h3>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={items}
        size="small"
      />
    </div>
  );
};
